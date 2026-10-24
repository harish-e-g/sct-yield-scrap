/* Download module: PDF report, Excel report, dashboard image and offline interactive dashboard */
(function(){
"use strict";
const $ = id=>document.getElementById(id);
const btn=$("btnDl"), menu=$("dlMenu"), toast=$("toast");

function say(msg, ms){ toast.textContent=msg; toast.hidden=false; clearTimeout(say.t); if(ms) say.t=setTimeout(()=>toast.hidden=true, ms); }
function view(){ return $("viewLive").hidden ? "monthly" : "live"; }
function viewEl(){ return view()==="live" ? $("viewLive") : $("viewMonthly"); }
function data(){ return view()==="live" ? window.__live.exportData() : window.__monthly.exportData(); }
const NAME = ()=> view()==="live" ? "Live" : "Monthly";
function fname(ext){ return `YieldScrap_${NAME()}_SCT_PWT.${ext}`; }
function save(blob, name){ const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();}, 1500); }

/* ---------- Menu ---------- */
function open(o){ menu.hidden=!o; btn.setAttribute("aria-expanded", String(o)); }
btn.addEventListener("click", e=>{ e.stopPropagation(); open(menu.hidden); });
document.addEventListener("click", e=>{ if(!menu.hidden && !menu.contains(e.target)) open(false); });
document.addEventListener("keydown", e=>{ if(e.key==="Escape") open(false); });
menu.addEventListener("click", async e=>{
  const b=e.target.closest("[data-fmt]"); if(!b) return; open(false);
  const f=b.dataset.fmt;
  try{
    if(f==="xlsx") excel();
    else if(f==="pdf") await pdf();
    else if(f==="png") await png();
    else if(f==="html") await offline();
  }catch(err){ console.error(err); say("Download failed: "+err.message, 5000); }
});

/* ---------- Excel ---------- */
function insightsRows(){
  const id = view()==="live" ? "lvInsights" : "insights";
  const rows=[["Insight","Detail"]];
  document.querySelectorAll("#"+id+" li").forEach(li=>{ rows.push([li.querySelector("b")?.textContent||"", li.querySelector("span")?.textContent||""]); });
  return rows;
}
function excel(){
  const d=data(), wb=XLSX.utils.book_new();
  d.sheets.concat([["AI Insights", insightsRows()]]).forEach(([name, rows])=>{
    const ws=XLSX.utils.aoa_to_sheet(rows);
    const w=[]; rows.forEach(r=>r.forEach((c,i)=>{ const L=String(c??"").length; w[i]=Math.min(70,Math.max(w[i]||8, L+2)); }));
    ws["!cols"]=w.map(x=>({wch:x}));
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0,31));
  });
  XLSX.writeFile(wb, fname("xlsx"));
  say("Excel report downloaded.", 3000);
}

/* ---------- Capture helpers ---------- */
async function shot(el, scale){
  return html2canvas(el, {scale:scale||2, backgroundColor:"#F3F5F9", useCORS:true, logging:false, windowWidth:1440,
    ignoreElements: n=> n.id==="toast" || n.id==="dlMenu" || n.classList?.contains("drawer") || n.id==="scrim"});
}
function imgData(src){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>{const c=document.createElement("canvas"); c.width=i.naturalWidth; c.height=i.naturalHeight; c.getContext("2d").drawImage(i,0,0); res({url:c.toDataURL("image/png"), w:i.naturalWidth, h:i.naturalHeight});}; i.onerror=rej; i.src=src; }); }

/* ---------- PDF ---------- */
async function pdf(){
  say("Building PDF report...");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({orientation:"landscape", unit:"mm", format:"a4", compress:true});
  const W=297, H=210, M=10, CW=W-2*M, d=data();
  const [pw, sc] = await Promise.all([imgData("assets/prowesstics-logo.png"), imgData("assets/sujan-continental-logo.png")]);
  const navy=[10,31,68], gold=[232,180,82];
  await document.fonts.ready;
  const FONT=getComputedStyle(document.body).fontFamily;
  // text rendered in the dashboard font (Avenir / Nunito Sans) so the PDF matches the page
  function T(str, mmH, color, weight){
    const px=64, c=document.createElement("canvas"), g=c.getContext("2d");
    g.font=`${weight||400} ${px}px ${FONT}`; const w=Math.ceil(g.measureText(str).width)+8;
    c.width=w; c.height=Math.ceil(px*1.35); g.font=`${weight||400} ${px}px ${FONT}`; g.fillStyle=color; g.textBaseline="middle"; g.fillText(str,4,c.height/2);
    return {url:c.toDataURL("image/png"), w:mmH*c.width/c.height, h:mmH};
  }
  function put(img, x, y, align){ doc.addImage(img.url,"PNG", align==="right"? x-img.w : align==="center"? x-img.w/2 : x, y, img.w, img.h); }
  const ribbon=T("DEMO DASHBOARD  |  CAUTION: all figures are simulated for illustration only and do not represent actual Sujan Continental plant data.",4.6,"#0A1F44",600);
  const title=T(`Yield & Scrap Management: ${d.title}`,8,"#FFFFFF",600);
  const sub=T(`${d.period}   |   Generated ${new Date().toLocaleString("en-IN")}`,4.6,"#B9C4D8",400);
  const foot=T("Prepared by Prowesstics IT Services Pvt. Ltd. for Sujan Continental, Pune. Demo dashboard for discussion; simulated data.",3.6,"#6B7890",400);
  function header(first){
    doc.setFillColor(...gold); doc.rect(0,0,W,7,"F"); put(ribbon, W/2, 1.2, "center");
    doc.setFillColor(...navy); doc.rect(0,7,W,first?24:14,"F");
    const lh = first?7:5;
    doc.addImage(pw.url,"PNG",M,first?12:10, lh*pw.w/pw.h, lh);
    doc.addImage(sc.url,"PNG",W-M-lh*sc.w/sc.h,first?12:10, lh*sc.w/sc.h, lh);
    if(first){ put(title, M, 21.2); put(sub, W-M, 23); return 35; }
    return 25;
  }
  function footer(p, n){ put(foot, M, H-7.2); put(T(`Page ${p} of ${n}`,3.6,"#6B7890",400), W-M, H-7.2, "right"); }
  const v=viewEl();
  const blocks=[...v.querySelectorAll("main > section")].filter(s=>!s.querySelector("#dataTable") || !$("dataTable").hidden);
  let y=header(true), page=1;
  for(const b of blocks){
    const c=await shot(b, 2);
    let h=CW*c.height/c.width, w=CW;
    const room = H-12-y;
    if(h>room){
      if(y>40){ doc.addPage(); page++; y=header(false); }
      const max=H-12-y; if(h>max){ w=w*max/h; h=max; }   // never split a panel across pages
    }
    doc.addImage(c.toDataURL("image/jpeg",0.9),"JPEG",M+(CW-w)/2,y,w,h);
    y+=h+4;
  }
  const n=doc.getNumberOfPages(); for(let p=1;p<=n;p++){ doc.setPage(p); footer(p,n); }
  doc.save(fname("pdf"));
  say("PDF report downloaded.", 3000);
}

/* ---------- PNG ---------- */
async function png(){
  say("Capturing dashboard image...");
  const wrap=document.createElement("div");
  const v=viewEl();
  const parts=[document.querySelector(".demo-ribbon"), document.querySelector(".topbar"), ...(view()==="live"?[document.querySelector(".shiftbar"), $("lvFeedNote")]:[document.querySelector(".filters")]), v.querySelector("main")];
  const canvases=[]; for(const p of parts) if(p) canvases.push(await shot(p, 1.5));
  const width=Math.max(...canvases.map(c=>c.width)), height=canvases.reduce((s,c)=>s+c.height,0);
  const out=document.createElement("canvas"); out.width=width; out.height=height;
  const g=out.getContext("2d"); g.fillStyle="#F3F5F9"; g.fillRect(0,0,width,height);
  let y=0; canvases.forEach(c=>{ g.drawImage(c,0,y); y+=c.height; });
  out.toBlob(b=>{ save(b, fname("png")); say("Dashboard image downloaded.", 3000); }, "image/png");
}

/* ---------- Offline interactive HTML ---------- */
async function offline(){
  say("Packaging interactive dashboard...");
  const get = p=>fetch(p,{cache:"no-store"}).then(r=>{ if(!r.ok) throw new Error(p+" "+r.status); return r.text(); });
  let html = await get("index.html");
  const css = await get("styles.css");
  html = html.replace(/<link rel="stylesheet" href="styles\.css[^"]*">/, ()=>"<style>\n"+css+"\n</style>");
  for(const s of ["lib/chart.umd.min.js","lib/xlsx.full.min.js","lib/jspdf.umd.min.js","lib/html2canvas.min.js","viz.js","materials.js","app.js","live.js","export.js"]){
    const js=(await get(s)).replace(/<\/script>/g,"<\\/script>");
    const re=new RegExp('<script src="'+s.replace(/[.\/]/g,"\\$&")+'[^"]*"( defer)?></script>');
    let rep="<script>\n"+js+"\n</script>";
    if(s==="app.js"){ const st=JSON.stringify(window.__monthly.getState()).replace(/</g,"\\u003c"); rep="<script>window.__SEED_STATE="+st+";</script>\n"+rep; }
    html=html.replace(re, ()=>rep);
  }
  html=html.replace(/<script src="refresh\.js[^"]*"><\/script>/,"");
  const [pw, sc]=await Promise.all([imgData("assets/prowesstics-logo.png"), imgData("assets/sujan-continental-logo.png")]);
  html=html.replace(/assets\/prowesstics-logo\.png[^"]*/g, pw.url).replace(/assets\/sujan-continental-logo\.png[^"]*/g, sc.url);
  save(new Blob([html],{type:"text/html"}), `YieldScrap_Dashboard_SCT_PWT.html`);
  say("Interactive dashboard downloaded. Open it in any browser, no internet needed.", 4500);
}
})();
