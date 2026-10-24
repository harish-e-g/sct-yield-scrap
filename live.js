/* Live shift view | simulated real-time GO / NG feed (about 1,00,000 parts per shift) */
(function(){
"use strict";

/* ---------- Configuration ---------- */
const SHIFT_SEC = 8*3600;
const USL = 3.5;                      // NG % upper limit
const LINES = [
  {id:"Line 1", variant:AVS.SPECS["5220"].name,  target:45000, baseNg:0.017, std:AVS.buildStd(AVS.SPECS["5220"])},
  {id:"Line 2", variant:AVS.SPECS["BS140"].name, target:55000, baseNg:0.021, std:AVS.buildStd(AVS.SPECS["BS140"])}
];
const TARGET = LINES.reduce((s,l)=>s+l.target,0);
const RMS = AVS.RMS.map(m=>({id:m.id, name:m.name, rate:m.rate, group:m.group, loss:(m.loss[0]+m.loss[1])/2,
  color:(AVS.GROUPS.find(g=>g.id===m.group)||{color:"#8C97AB"}).color}));
const REASONS = [
  ["Flash / excess rubber", 30, "check mould parting line, vents and clamp pressure"],
  ["Rubber-to-metal bond failure", 20, "check sleeve shot blasting, phosphating and bonding agent film thickness"],
  ["Non-fill / short fill", 16, "check compound shot weight, preform size and injection pressure"],
  ["Porosity / blister", 12, "check cure time, mould temperature and compound moisture"],
  ["Sleeve damage / misplacement", 12, "check sleeve loading fixture and press-in force"],
  ["Dimensional (OD / ID / height)", 10, "check post-cure shrinkage and sizing operation"]
];
const STOPS = ["mould cleaning","compound batch change","insert feeder jam","die change"];
const C = {go:"#2F5BA8", ng:"#C93A3A", good:"#1E8E5A", warn:"#B7791F", neutral:"#8C97AB"};

/* ---------- Helpers ---------- */
const $ = id=>document.getElementById(id);
const nf = new Intl.NumberFormat("en-IN",{maximumFractionDigits:0});
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
let rand = Math.random;   // re-seeded per shift so every viewer and every refresh sees the same numbers
function poisson(l){ if(l<=0) return 0; const L=Math.exp(-l); let k=0,p=1; do{k++;p*=rand();}while(p>L); return k-1; }
function pickReason(){ const tot=REASONS.reduce((s,r)=>s+r[1],0); let x=rand()*tot; for(let i=0;i<REASONS.length;i++){x-=REASONS[i][1]; if(x<=0) return i;} return 0; }
const IST = 5.5*3600*1000;
const hhmm = ms=>{const d=new Date(ms);return String(d.getUTCHours()).padStart(2,"0")+":"+String(d.getUTCMinutes()).padStart(2,"0");};
const hhmmss = ms=>hhmm(ms)+":"+String(new Date(ms).getUTCSeconds()).padStart(2,"0");
function inr(x){const a=Math.abs(x); if(a>=1e7) return "₹"+(x/1e7).toFixed(2)+" Cr"; if(a>=1e5) return "₹"+(x/1e5).toFixed(2)+" L"; return "₹"+nf.format(Math.round(x));}
const esc = s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function shiftOf(ms){
  const d=new Date(ms), h=d.getUTCHours();
  const day=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
  if(h>=6&&h<14) return {name:"Shift A", start:day+6*3600e3};
  if(h>=14&&h<22) return {name:"Shift B", start:day+14*3600e3};
  return {name:"Shift C", start: h>=22? day+22*3600e3 : day-2*3600e3};
}

/* ---------- Simulation state ---------- */
let simMs = Date.now()+IST;             // simulated clock, IST
let speed = 1, paused = false, lastReal = performance.now();
let S, prevShift = null;
const events = [];

function newShift(){
  const sh = shiftOf(simMs);
  rand = mulberry32(Math.floor(sh.start/1000) ^ 0x5C7);
  S = {name:sh.name, start:sh.start, end:sh.start+SHIFT_SEC*1000, sec:0,
    lines: LINES.map(()=>({go:0, ng:0, minGo:new Array(480).fill(0), minNg:new Array(480).fill(0), reasons:new Array(REASONS.length).fill(0),
      exc:null, stop:null, alerted:false, sGo:new Uint32Array(5760), sNg:new Uint32Array(5760), minCost:new Float64Array(480),
      rm:Object.fromEntries(RMS.map(r=>[r.id,{set:0, actual:0}]))})),
    rm: Object.fromEntries(RMS.map(r=>[r.id,{set:0, actual:0}]))};
}
function log(level, text, ms){ events.unshift({t:ms??simMs, level, text, fresh:true}); if(events.length>300) events.pop(); }

function stepSecond(){
  const idx = Math.min(479, Math.floor((simMs - S.start)/60000));
  LINES.forEach((L,i)=>{
    const st = S.lines[i];
    // stoppages
    if(st.stop && simMs>=st.stop.until){ log("info", `${L.id} running again after ${st.stop.why}.`); st.stop=null; }
    if(!st.stop && rand()<1/5400){ const why=STOPS[Math.floor(rand()*STOPS.length)]; st.stop={until:simMs+(3+rand()*5)*60000, why}; st.stops=(st.stops||0)+1; log("warn", `${L.id} stopped: ${why}.`); }
    // NG excursions
    if(st.exc && simMs>=st.exc.until){ log("good", `${L.id} NG back to normal after ${REASONS[st.exc.reason][0].toLowerCase()} issue was corrected.`); st.exc=null; st.alerted=false; }
    if(!st.exc && rand()<1/2700){ st.exc={until:simMs+(6+rand()*9)*60000, mult:2.4+rand()*1.6, reason:pickReason()}; log("warn", `${L.id} NG rising, mostly ${REASONS[st.exc.reason][0].toLowerCase()}.`); }
    if(st.stop){ st.down=(st.down||0)+1; return; }
    const lambda = L.target/SHIFT_SEC*(0.93+rand()*0.14);
    const n = poisson(lambda);
    const p = Math.min(0.25, L.baseNg*(st.exc?st.exc.mult:1));
    let ng=0; for(let k=0;k<n;k++) if(rand()<p) ng++;
    const go = n-ng;
    st.go+=go; st.ng+=ng; st.minGo[idx]+=go; st.minNg[idx]+=ng;
    const b5 = Math.min(5759, Math.floor((simMs - S.start)/5000)); st.sGo[b5]+=go; st.sNg[b5]+=ng;
    for(let k=0;k<ng;k++){ const r = st.exc&&rand()<0.65? st.exc.reason : pickReason(); st.reasons[r]++; }
    RMS.forEach(r=>{ const sd=L.std[r.id]||0; if(!sd) return; const a=n*sd*(1+r.loss*(0.8+rand()*0.4)); st.minCost[idx] += (a-go*sd)*r.rate; S.rm[r.id].set += go*sd; S.rm[r.id].actual += a; st.rm[r.id].set += go*sd; st.rm[r.id].actual += a; });
    // USL breach alert on rolling 5 minutes
    if(st.exc && !st.alerted && idx>=1){
      const r5 = rollNg(i,5);
      if(r5.n>200 && r5.pct>USL){ st.alerted=true; log("crit", `${L.id} NG ${r5.pct.toFixed(1)}% in last 5 min, above USL ${USL}%. Main reason: ${REASONS[st.exc.reason][0]}. Action: ${REASONS[st.exc.reason][2]}.`); }
    }
  });
  simMs += 1000; S.sec++;
  if(simMs>=S.end){
    const t=tot(true);
    prevShift={name:S.name, total:t.go+t.ng, ng:t.ng};
    log("info", `${S.name} closed: ${nf.format(t.go+t.ng)} parts, NG ${(t.ng/(t.go+t.ng)*100).toFixed(2)}%.`, S.end);
    newShift(); log("info", `${S.name} started.`);
  }
}
function curIdx(){ return Math.min(479, Math.floor((simMs - S.start)/60000)); }
function rollNg(i, mins){
  const e=curIdx(), s=Math.max(0,e-mins+1); let go=0,ng=0;
  for(let m=s;m<=e;m++){ go+=S.lines[i].minGo[m]; ng+=S.lines[i].minNg[m]; }
  const frac = Math.max(1/60, (e-s) + ((simMs - S.start)/60000 - e));   // minutes covered
  return {go,ng,n:go+ng,pct:(go+ng)?ng/(go+ng)*100:0, perMin:(go+ng)/frac};
}
let sel = "all";
const IDX = ()=> sel==="all" ? LINES.map((_,i)=>i) : [+sel];
const tgt = ()=> IDX().reduce((s,i)=>s+LINES[i].target,0);
function tot(all){ return (all?LINES.map((_,i)=>i):IDX()).reduce((a,i)=>({go:a.go+S.lines[i].go, ng:a.ng+S.lines[i].ng}),{go:0,ng:0}); }
function rmOf(id){ return IDX().reduce((a,i)=>({set:a.set+S.lines[i].rm[id].set, actual:a.actual+S.lines[i].rm[id].actual}),{set:0,actual:0}); }

/* ---------- Backfill from shift start to now ---------- */
function backfill(){
  const now = simMs; newShift(); simMs = S.start;
  log("info", `${S.name} started.`);
  while(simMs < now) stepSecond();
  events.forEach(e=>e.fresh=false);
}

/* ---------- Rendering ---------- */
const charts = {};
const ANIM = {duration:550, easing:"easeOutCubic"};
function upsert(id,cfg){
  cfg.options.animation = ANIM;
  const ch=charts[id];
  if(ch){ // update in place so bars and lines glide to new values
    ch.data.labels = cfg.data.labels;
    cfg.data.datasets.forEach((d,k)=>{ if(ch.data.datasets[k]) Object.assign(ch.data.datasets[k], d); else ch.data.datasets.push(d); });
    ch.data.datasets.length = cfg.data.datasets.length;
    ch.options = cfg.options; ch.update(); return; }
  charts[id]=new Chart($(id),cfg);
}
const GRID={color:"#EEF1F6"}, NOGRID={display:false};

function renderHeader(){
  $("lvShift").textContent = S.name;
  $("lvShiftWin").textContent = `${hhmm(S.start)} to ${hhmm(S.end)} IST`;
  $("lvClock").textContent = hhmmss(simMs);
  const el = (simMs-S.start)/1000; const h=Math.floor(el/3600), m=Math.floor(el%3600/60);
  $("lvElapsed").textContent = `${h}h ${String(m).padStart(2,"0")}m into shift`;
  document.body.classList.toggle("paused", paused);
}

function renderKpis(){
  const TG=tgt(), t=tot(), n=t.go+t.ng, frac=(simMs-S.start)/(SHIFT_SEC*1000);
  const expected = TG*frac;
  const r30 = IDX().map(i=>rollNg(i,30)).reduce((s,r)=>s+r.perMin,0);
  const minsLeft = (S.end-simMs)/60000;
  const projected = n + r30*minsLeft;
  const ngPct = n? t.ng/n*100 : 0;
  const r5 = IDX().map(i=>rollNg(i,5)); const rate5 = r5.reduce((s,r)=>s+r.perMin,0);
  const need = minsLeft>0? Math.max(0,TG-n)/minsLeft : 0;
  let waste=0,cost=0; RMS.forEach(r=>{const m=rmOf(r.id), w=m.actual-m.set; waste+=w; cost+=w*r.rate;});
  const ahead = n-expected;
  const tiles = [
    ["Shift output", nf.format(n), `<div class="prog" title="Progress vs target"><i style="width:${Math.min(100,n/TG*100).toFixed(1)}%"></i><b style="left:${Math.min(100,frac*100).toFixed(1)}%"></b></div>
      <span>${(n/TG*100).toFixed(1)}% of ${nf.format(TG)} · <span class="delta ${ahead>=0?"good":"bad"}">${ahead>=0?"▲":"▼"} ${nf.format(Math.abs(ahead))}</span> vs plan</span>`, false, ""],
    ["GO parts", nf.format(t.go), `<span>Good parts this shift</span>`, false, ""],
    ["NG parts", nf.format(t.ng), `<span>Rejected this shift</span>`, true, "ng"],
    ["NG %", ngPct.toFixed(2)+"%", `<span class="delta ${ngPct>USL?"bad":"good"}">${ngPct>USL?"⚠ above":"✓ within"} USL ${USL}%</span>`, true, ngPct>USL?"ng":""],
    ["Run rate", nf.format(rate5)+" /min", `<span>Need ${nf.format(need)} /min to hit target · projected ${nf.format(projected)}</span>`, false, ""],
    ["Scrap this shift", inr(cost), `<span>${nf.format(waste)} kg RM wasted</span>`, true, ""]
  ];
  // last 30 minutes per tile
  const e2=curIdx(), s2=Math.max(0,e2-29), ix=IDX(), M=[];
  for(let m=s2;m<=e2;m++){ M.push({go:ix.reduce((a,i)=>a+S.lines[i].minGo[m],0), ng:ix.reduce((a,i)=>a+S.lines[i].minNg[m],0), c:ix.reduce((a,i)=>a+S.lines[i].minCost[m],0)}); }
  let cum=0; const cumOut=[]; for(let m=0;m<=e2;m++){ cum+=ix.reduce((a,i)=>a+S.lines[i].minGo[m]+S.lines[i].minNg[m],0); if(m>=s2) cumOut.push(cum); }
  let cc=0; const cumCost=[]; for(let m=0;m<=e2;m++){ cc+=ix.reduce((a,i)=>a+S.lines[i].minCost[m],0); if(m>=s2) cumCost.push(cc); }
  const tl=[]; for(let m=s2;m<=e2;m++) tl.push(hhmm(S.start+m*60000));
  const x0=tl[0], x1="Now", n0=v=>nf.format(Math.round(v)), p2=v=>v.toFixed(2)+"%";
  const planMin=TG/480;
  const sp=[ VIZ.spark(cumOut,"#2F5BA8",{caption:"Cumulative output, last 30 min",x0,x1,fmt:n0,tips:tl}),
    VIZ.spark(M.map(x=>x.go),"#2F5BA8",{caption:"GO parts per minute",x0,x1,fmt:n0,tips:tl,ref:planMin*(1-USL/100),refLabel:"Plan"}),
    VIZ.spark(M.map(x=>x.ng),C.ng,{caption:"NG parts per minute",x0,x1,fmt:n0,tips:tl,ref:planMin*USL/100,refLabel:"Limit"}),
    VIZ.spark(M.map(x=>x.go+x.ng? x.ng/(x.go+x.ng)*100:null), ngPct>USL?C.ng:"#1F9AA6",{caption:"NG % per minute",x0,x1,fmt:p2,tips:tl,ref:USL,refLabel:"USL"}),
    VIZ.spark(M.map(x=>x.go+x.ng),"#1F9AA6",{caption:"Parts per minute",x0,x1,fmt:n0,tips:tl,ref:planMin,refLabel:"Plan"}),
    VIZ.spark(cumCost,"#C98A16",{caption:"Cumulative scrap cost",x0,x1,fmt:inr,tips:tl}) ];
  $("lvKpis").innerHTML = tiles.map(([l,v,s,hl,cls],k)=>`<div class="kpi${hl?" hl":""}"><div class="lbl">${l}</div><div class="val ${cls}">${v}</div><div class="sub">${s}</div>${sp[k]}</div>`).join("");
  // gauges
  const att = expected? n/expected*100 : 100, fpy = n? t.go/n*100 : 100;
  let ts=0,ta=0; RMS.forEach(r=>{const m=rmOf(r.id); ts+=m.set; ta+=m.actual;}); const my = ta? ts/ta*100 : 100;
  const pc=x=>Math.round(x)+"%", p1=x=>x.toFixed(1)+"%";
  const spd=rate5/(TG/480)*100;
  $("lvGauges").innerHTML =
    VIZ.gauge({min:50,max:120,value:att,target:100,zones:[[50,92,"bad"],[92,98,"warn"],[98,120,"good"]],label:"Plan attainment",valueText:pc(att),fmt:pc,dfmt:d=>Math.round(d)+" pts",sub:`${nf.format(n)} of ${nf.format(Math.round(expected))} parts due by now`}) +
    VIZ.gauge({min:90,max:100,value:fpy,target:100-USL,zones:[[90,100-USL*1.5,"bad"],[100-USL*1.5,100-USL,"warn"],[100-USL,100,"good"]],label:"First-pass yield (GO %)",valueText:p1(fpy),fmt:x=>x+"%",dfmt:d=>d.toFixed(1)+" pts",sub:`${nf.format(t.go)} GO of ${nf.format(n)} parts`}) +
    VIZ.gauge({min:85,max:100,value:my,target:93,zones:[[85,90,"bad"],[90,93,"warn"],[93,100,"good"]],label:"Material yield",valueText:p1(my),fmt:x=>x+"%",dfmt:d=>d.toFixed(1)+" pts",sub:"RM in good parts ÷ RM issued"}) +
    VIZ.gauge({min:50,max:120,value:spd,target:100,zones:[[50,90,"bad"],[90,98,"warn"],[98,120,"good"]],label:"Speed vs plan (5 min)",valueText:pc(spd),fmt:pc,dfmt:d=>Math.round(d)+" pts",sub:`${nf.format(rate5)} vs ${nf.format(TG/480)} parts/min`});
}

function spark(i){
  const e=curIdx(), s=Math.max(0,e-29), pts=[];
  for(let m=s;m<=e;m++){const g=S.lines[i].minGo[m], n=S.lines[i].minNg[m]; pts.push(g+n? n/(g+n)*100 : 0);}
  const max=Math.max(USL*2, ...pts), W=300, H=34, step=W/Math.max(1,pts.length-1);
  const y=v=>H-2-(v/max)*(H-4);
  const poly=pts.map((v,k)=>`${(k*step).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="NG percent per minute, last 30 minutes">
    <line x1="0" x2="${W}" y1="${y(USL)}" y2="${y(USL)}" stroke="${C.ng}" stroke-dasharray="4 3" stroke-width="1"/>
    <polyline points="${poly}" fill="none" stroke="${C.go}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>
    <div class="muted" style="display:flex;justify-content:space-between"><span>NG % per minute, last 30 min</span><span style="color:${C.ng}">- - USL ${USL}%</span></div>`;
}
function renderLines(){
  $("lvLines").innerHTML = LINES.map((L,i)=>{
    const st=S.lines[i], r=rollNg(i,5);
    const status = st.stop? ["warn","■ Stopped: "+st.stop.why] : r.pct>USL? ["crit","⚠ NG alert"] : ["good","● Running"];
    return `<div class="lv-line ${status[0]==="crit"?"alert":""} ${sel===String(i)?"sel":""}" data-line="${i}" role="button" tabindex="0" title="Show only ${L.id}">
      <div class="lv-top"><div><span class="ln">${L.id}</span> &nbsp;<span class="pn">${L.variant}</span></div><span class="pill ${status[0]}">${esc(status[1])}</span></div>
      <div class="lv-stats">
        <div><div class="k">Rate</div><div class="v">${nf.format(r.perMin)}<span class="muted"> /min</span></div></div>
        <div><div class="k">GO (shift)</div><div class="v">${nf.format(st.go)}</div></div>
        <div><div class="k">NG (shift)</div><div class="v ng">${nf.format(st.ng)}</div></div>
        <div><div class="k">NG % 5 min</div><div class="v ${r.pct>USL?"ng":""}">${r.pct.toFixed(1)}%</div></div>
      </div>${spark(i)}</div>`;}).join("");
}

function renderRateChart(){
  const e=curIdx(), s=Math.max(0,e-59), labels=[], go=[], ng=[];
  const ix=IDX(); for(let m=s;m<=e;m++){ labels.push(hhmm(S.start+m*60000)); go.push(ix.reduce((a,i)=>a+S.lines[i].minGo[m],0)); ng.push(ix.reduce((a,i)=>a+S.lines[i].minNg[m],0)); }
  upsert("lvChRate",{type:"bar",data:{labels,datasets:[
    {label:"GO",data:go,backgroundColor:C.go,borderRadius:2,borderSkipped:false,borderColor:"#fff",borderWidth:{top:1},categoryPercentage:.9,barPercentage:.95},
    {label:"NG",data:ng,backgroundColor:C.ng,borderRadius:2,borderSkipped:false,categoryPercentage:.9,barPercentage:.95}]},
    options:{animation:false,maintainAspectRatio:false,plugins:{legend:{position:"bottom"},tooltip:{mode:"index",intersect:false,callbacks:{label:c=>`${c.dataset.label}: ${nf.format(c.parsed.y)} parts`,footer:it=>{const g=it[0]?.parsed.y||0,n=it[1]?.parsed.y||0;return g+n?`NG ${(n/(g+n)*100).toFixed(1)}%`:"";}}}},
      scales:{x:{stacked:true,grid:NOGRID,ticks:{maxTicksLimit:8,maxRotation:0}},y:{stacked:true,grid:GRID}}}});
}

function renderStream(){
  const b=Math.min(5759, Math.floor((simMs - S.start)/5000)), s=Math.max(0,b-35), labels=[], go=[], ng=[], ix=IDX();
  for(let k=s;k<=b;k++){ const t=S.start+k*5000; labels.push(hhmmss(t)); go.push(ix.reduce((a,i)=>a+S.lines[i].sGo[k],0)); ng.push(ix.reduce((a,i)=>a+S.lines[i].sNg[k],0)); }
  upsert("lvChStream",{type:"bar",data:{labels,datasets:[
    {label:"GO",data:go,backgroundColor:C.go,borderRadius:2,borderSkipped:false,borderColor:"#fff",borderWidth:{top:1},categoryPercentage:.85,barPercentage:.95},
    {label:"NG",data:ng,backgroundColor:C.ng,borderRadius:2,borderSkipped:false,categoryPercentage:.85,barPercentage:.95}]},
    options:{maintainAspectRatio:false,plugins:{legend:{position:"bottom"},tooltip:{mode:"index",intersect:false,callbacks:{label:c=>`${c.dataset.label}: ${nf.format(c.parsed.y)} parts`}}},
      scales:{x:{stacked:true,grid:NOGRID,ticks:{maxTicksLimit:6,maxRotation:0}},y:{stacked:true,grid:GRID,suggestedMax:ix.reduce((a,i)=>a+LINES[i].target,0)/SHIFT_SEC*5*1.4}}}});
  const last = go.length>1? go[go.length-2]+ng[ng.length-2] : 0;
  $("lvStreamNow").textContent = `${nf.format(last*12)} parts/min pace in the last 5 s`;
}
function renderNgChart(){
  const e=curIdx(), nb=Math.floor(e/5)+1, labels=[], vals=[];
  for(let b=0;b<nb;b++){ let g=0,n=0; for(let m=b*5;m<Math.min(b*5+5,e+1);m++){ IDX().forEach(i=>{g+=S.lines[i].minGo[m];n+=S.lines[i].minNg[m];}); } labels.push(hhmm(S.start+b*300000)); vals.push(g+n? n/(g+n)*100 : null); }
  const out=vals.map(v=>v!==null&&v>USL);
  upsert("lvChNg",{type:"line",data:{labels,datasets:[
    {label:"NG %",data:vals,borderColor:C.go,borderWidth:2,fill:"origin",backgroundColor:VIZ.fill(C.go),pointRadius:vals.map((v,i)=>out[i]?4:0),pointBackgroundColor:C.ng,pointBorderColor:"#fff",pointBorderWidth:1.5,pointHoverRadius:5,tension:0,pointStyle:"circle"},
    {label:"USL",data:labels.map(()=>USL),borderColor:C.ng,borderWidth:1.5,borderDash:[6,4],pointRadius:0,pointHoverRadius:0,pointStyle:"line"}]},
    options:{animation:false,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{position:"bottom",labels:{usePointStyle:true}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.parsed.y==null?"-":c.parsed.y.toFixed(2)+"%"}`}}},
      scales:{x:{grid:NOGRID,ticks:{maxTicksLimit:8,maxRotation:0}},y:{grid:GRID,suggestedMin:0,suggestedMax:USL*1.6,ticks:{callback:v=>v+"%"}}}}});
  const nOut=out.filter(Boolean).length;
  $("lvNgFoot").innerHTML = nOut? `<span style="color:${C.ng};font-weight:600">⚠ ${nOut} five-minute window${nOut>1?"s":""} above USL this shift</span>` : `<span style="color:${C.good};font-weight:600">✓ No window above USL this shift</span>`;
}

function renderReasons(){
  const counts = REASONS.map((r,k)=>[r[0], IDX().reduce((a,i)=>a+S.lines[i].reasons[k],0)]).sort((a,b)=>b[1]-a[1]);
  const total = counts.reduce((s,c)=>s+c[1],0)||1;
  upsert("lvChReason",{type:"bar",data:{labels:counts.map(c=>c[0]),datasets:[{label:"NG parts",data:counts.map(c=>c[1]),backgroundColor:C.go,borderRadius:4,borderSkipped:"start",maxBarThickness:16}]},
    options:{indexAxis:"y",animation:false,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${nf.format(c.parsed.x)} parts (${(c.parsed.x/total*100).toFixed(1)}%)`}}},
      scales:{x:{grid:GRID},y:{grid:NOGRID}}}});
}

function renderRm(){
  const open = new Set([...document.querySelectorAll("#lvRm .lv-grp.open")].map(e=>e.dataset.g));
  const f1=x=>x>=100? nf.format(x) : x.toFixed(1);
  let tw=0,tc=0,ta=0,ts=0;
  const body = AVS.GROUPS.map(g=>{
    const ms = RMS.filter(r=>r.group===g.id).map(r=>{const m=rmOf(r.id); return {r, set:m.set, act:m.actual, w:m.actual-m.set, c:(m.actual-m.set)*r.rate};}).filter(x=>x.act>0);
    if(!ms.length) return "";
    const G = ms.reduce((o,x)=>({set:o.set+x.set,act:o.act+x.act,w:o.w+x.w,c:o.c+x.c}),{set:0,act:0,w:0,c:0});
    tw+=G.w; tc+=G.c; ta+=G.act; ts+=G.set;
    return `<tr class="grp-row lv-grp" data-g="${g.id}"><td><span class="rm-name"><span class="caret" aria-hidden="true">▸</span><span class="sw" style="background:${g.color}"></span>${g.name}</span></td><td>${f1(G.set)}</td><td>${f1(G.act)}</td><td><b>${f1(G.w)}</b></td><td>${inr(G.c)}</td></tr>`+
      ms.map(x=>`<tr class="mat-row" data-g="${g.id}" hidden><td><span class="rm-name sub">${x.r.name}</span></td><td>${f1(x.set)}</td><td>${f1(x.act)}</td><td>${f1(x.w)}</td><td>${inr(x.c)}</td></tr>`).join("");
  }).join("");
  $("lvRm").innerHTML = `<div class="table-wrap"><table class="stock-table"><thead><tr><th>Material group</th><th>Set kg</th><th>Actual kg</th><th>Wastage kg</th><th>Cost</th></tr></thead><tbody>${body}
    <tr><td><b>Total</b></td><td><b>${nf.format(ts)}</b></td><td><b>${nf.format(ta)}</b></td><td><b>${nf.format(tw)}</b></td><td><b>${inr(tc)}</b></td></tr></tbody></table></div>
    <p class="chart-foot">Click a group to see its materials. Material yield this shift <b>${ta?(ts/ta*100).toFixed(1):"0.0"}%</b>. Set = GO parts × standard kg per part; wastage = actual − set.</p>`;
  open.forEach(g=>toggleGrp(g,true));
}
function toggleGrp(g, on){
  const row=document.querySelector(`#lvRm .lv-grp[data-g="${g}"]`); if(!row) return;
  const o = on ?? !row.classList.contains("open"); row.classList.toggle("open",o);
  document.querySelectorAll(`#lvRm .mat-row[data-g="${g}"]`).forEach(r=>r.hidden=!o);
}
$("lvRm").addEventListener("click",e=>{const r=e.target.closest(".lv-grp"); if(r) toggleGrp(r.dataset.g);});

function renderInsights(){
  const t=tot(), n=t.go+t.ng, items=[];
  const minsLeft=(S.end-simMs)/60000;
  const r30=LINES.map((_,i)=>rollNg(i,30)).reduce((s,r)=>s+r.perMin,0);
  const proj=n+r30*minsLeft;
  if(proj<TARGET*0.98){
    const slow = LINES.map((L,i)=>({L,ratio:rollNg(i,30).perMin/(L.target/480)})).sort((a,b)=>a.ratio-b.ratio)[0];
    items.push(["warn","↘",`Projected ${nf.format(proj)} parts, ${nf.format(TARGET-proj)} short of target`, slow.ratio<0.97
      ? `${slow.L.id} is running at ${(slow.ratio*100).toFixed(0)}% of its planned rate over the last 30 minutes.`
      : `Both lines are near planned rate now; the gap comes from stoppages earlier in the shift. Holding ${nf.format(Math.ceil((TARGET-n)/Math.max(1,minsLeft)))} parts/min closes it.`]);
  } else items.push(["good","✓",`On track: projected ${nf.format(Math.min(proj,TARGET*1.08))} parts by ${hhmm(S.end)}`,`Current run rate covers the 1,00,000 target with ${nf.format(Math.max(0,proj-TARGET))} parts to spare.`]);
  LINES.forEach((L,i)=>{const r=rollNg(i,15); if(r.pct>USL){ const st=S.lines[i]; const rk = st.exc? st.exc.reason : st.reasons.indexOf(Math.max(...st.reasons));
    items.push(["crit","⚠",`${L.id} NG ${r.pct.toFixed(1)}% over 15 min, above USL`,`Main reason: ${REASONS[rk][0]}. Suggested action: ${REASONS[rk][2]}. Every NG part here scraps about ${(Object.values(L.std).reduce((s,x)=>s+x,0)*1000).toFixed(0)} g of material.`]);}});
  const reasons = REASONS.map((r,k)=>[r[0],S.lines.reduce((a,l)=>a+l.reasons[k],0)]).sort((a,b)=>b[1]-a[1]);
  if(t.ng>0) items.push(["info","i",`${reasons[0][0]} is the top NG reason this shift`,`${nf.format(reasons[0][1])} parts, ${(reasons[0][1]/t.ng*100).toFixed(0)}% of all NG. Top two reasons together: ${((reasons[0][1]+reasons[1][1])/t.ng*100).toFixed(0)}%.`]);
  let cost=0; RMS.forEach(r=>cost+=(S.rm[r.id].actual-S.rm[r.id].set)*r.rate);
  const hrs=Math.max(0.05,(simMs-S.start)/3600e3);
  items.push(["info","₹",`Scrap running at ${inr(cost/hrs)} per hour`,`Projected ${inr(cost/hrs*8)} for this shift, about ${inr(cost/hrs*24*26)} a month at this rate.`]);
  if(prevShift) items.push(["info","↺",`Previous shift: ${prevShift.name}`,`${nf.format(prevShift.total)} parts, NG ${(prevShift.ng/prevShift.total*100).toFixed(2)}%.`]);
  $("lvInsights").innerHTML = items.slice(0,5).map(([lvl,ic,ti,d])=>`<li><div class="ic ${lvl}" aria-hidden="true">${ic}</div><div><b>${esc(ti)}</b><span>${esc(d)}</span></div></li>`).join("");
}

function renderEvents(){
  const icon={crit:"⚠",warn:"!",good:"✓",info:"i"};
  $("lvEvCount").textContent = `${events.length} events this session`;
  $("lvEvents").innerHTML = events.slice(0,50).map(e=>`<li class="${e.fresh?"new":""}"><time>${hhmmss(e.t)}</time><span class="e-${e.level}" aria-hidden="true">${icon[e.level]}</span><span>${esc(e.text)}</span></li>`).join("");
  events.forEach(e=>e.fresh=false);
}

/* ---------- Line vs line comparison ---------- */
const LC = ["#2F5BA8","#1F9AA6"];
function lineStats(i){
  const L=LINES[i], st=S.lines[i], n=st.go+st.ng, el=(simMs-S.start)/1000, frac=el/SHIFT_SEC;
  const exp=L.target*frac, r5=rollNg(i,5), r30=rollNg(i,30), minsLeft=(S.end-simMs)/60000;
  let set=0,act=0,cost=0; RMS.forEach(r=>{const m=st.rm[r.id]; set+=m.set; act+=m.actual; cost+=(m.actual-m.set)*r.rate;});
  const topK=st.reasons.indexOf(Math.max(...st.reasons));
  const plan=L.target/480, runMin=Math.max(1,(el-(st.down||0))/60);
  return {L, n, go:st.go, ng:st.ng, target:L.target, exp, att:exp?n/exp*100:0, ngPct:n?st.ng/n*100:0, ng5:r5.pct, rate5:r5.perMin, plan,
    speed:r5.perMin/plan*100, fpy:n?st.go/n*100:0, my:act?set/act*100:0, waste:act-set, cost, cpk:n?cost/n*1000:0,
    proj:n+r30.perMin*minsLeft, stops:st.stops||0, down:(st.down||0)/60, avail:el? (1-(st.down||0)/el)*100:100,
    top:st.ng?REASONS[topK][0]:"-", topShare:st.ng?st.reasons[topK]/st.ng*100:0,
    status: st.stop? "Stopped" : r5.pct>USL? "NG alert" : "Running"};
}
function renderCompare(){
  const a=lineStats(0), b=lineStats(1);
  const n0=v=>nf.format(Math.round(v)), p1=v=>v.toFixed(1)+"%", p2=v=>v.toFixed(2)+"%";
  // [label, key, fmt, higherIsBetter (true/false/null = neutral), unitDiff]
  const rows=[
    ["Status","status",x=>x,null],
    ["Shift target","target",n0,null],
    ["Parts produced","n",n0,null],
    ["Due by now","exp",n0,null],
    ["Plan attainment","att",p1,true,"pts"],
    ["Projected end of shift","proj",n0,null],
    ["GO parts","go",n0,null],
    ["NG parts","ng",n0,null],
    ["NG % (shift)","ngPct",p2,false,"pts"],
    ["NG % (last 5 min)","ng5",p2,false,"pts"],
    ["First-pass yield","fpy",p1,true,"pts"],
    ["Run rate (5 min), parts/min","rate5",n0,null],
    ["Speed vs plan","speed",p1,true,"pts"],
    ["Availability (uptime)","avail",p1,true,"pts"],
    ["Stoppages","stops",n0,false,""],
    ["Downtime, minutes","down",v=>v.toFixed(1),false,"min"],
    ["Material yield","my",p1,true,"pts"],
    ["RM wasted, kg","waste",n0,null],
    ["Scrap cost","cost",inr,null],
    ["Scrap cost per 1,000 parts","cpk",inr,false,""],
    ["Top NG reason","top",x=>x,null]
  ];
  const body=rows.map(([lbl,k,f,hib,u])=>{
    const va=a[k], vb=b[k];
    let ca="",cb="",verdict="";
    if(hib!==null && hib!==undefined && isFinite(va) && isFinite(vb) && Math.abs(va-vb)>1e-9){
      const aBetter = hib? va>vb : va<vb;
      ca=aBetter?"win":"lose"; cb=aBetter?"lose":"win";
      const d=Math.abs(va-vb), ds = u==="pts"? d.toFixed(u==="pts"&&k.startsWith("ng")?2:1)+" pts" : u==="min"? d.toFixed(1)+" min" : (k==="cpk"? inr(d) : n0(d));
      verdict=`<span class="lc-pill" style="--c:${LC[aBetter?0:1]}">${aBetter?LINES[0].id:LINES[1].id} better by ${ds}</span>`;
    } else if(k==="status"){ ca=a.status==="Running"?"win":"lose"; cb=b.status==="Running"?"win":"lose"; }
    let bar="";
    if(typeof va==="number" && typeof vb==="number" && (va+vb)>0){ const m=Math.max(Math.abs(va),Math.abs(vb))||1;
      bar=`<div class="lc-bars"><i style="width:${(Math.abs(va)/m*100).toFixed(1)}%;background:${LC[0]}"></i><i style="width:${(Math.abs(vb)/m*100).toFixed(1)}%;background:${LC[1]}"></i></div>`; }
    const extra = k==="top"? [` <span class="muted">(${a.topShare.toFixed(0)}%)</span>`,` <span class="muted">(${b.topShare.toFixed(0)}%)</span>`] : ["",""];
    return `<tr><th>${lbl}</th><td class="${ca}">${f(va)}${extra[0]}</td><td class="${cb}">${f(vb)}${extra[1]}</td><td class="lc-bar-cell">${bar}</td><td>${verdict}</td></tr>`;
  }).join("");
  const wins=rows.reduce((o,[,k,,hib])=>{ if(hib===null||hib===undefined) return o; const va=a[k],vb=b[k]; if(Math.abs(va-vb)<1e-9) return o; ((hib?va>vb:va<vb)?o[0]++:o[1]++); return o; },[0,0]);
  $("lvScore").innerHTML = `<div class="lc-score">
      <div style="--c:${LC[0]}"><b>${LINES[0].id}</b><span>${LINES[0].variant}</span><em>${wins[0]} of ${wins[0]+wins[1]} KPIs ahead</em></div>
      <div class="vs">vs</div>
      <div style="--c:${LC[1]}"><b>${LINES[1].id}</b><span>${LINES[1].variant}</span><em>${wins[1]} of ${wins[0]+wins[1]} KPIs ahead</em></div></div>`;
  $("lvCompare").innerHTML = `<div class="table-wrap"><table class="lc-table"><thead><tr><th>KPI</th><th style="color:${LC[0]}">${LINES[0].id}</th><th style="color:${LC[1]}">${LINES[1].id}</th><th class="lc-bar-cell">Side by side</th><th>Who is ahead</th></tr></thead><tbody>${body}</tbody></table></div>`;
  // charts: NG % per 5 min and output per minute, both lines
  const e=curIdx(), nb=Math.floor(e/5)+1, l5=[], ngs=[[],[]];
  for(let k=0;k<nb;k++){ l5.push(hhmm(S.start+k*300000)); [0,1].forEach(i=>{ let g=0,n=0; for(let m=k*5;m<Math.min(k*5+5,e+1);m++){ g+=S.lines[i].minGo[m]; n+=S.lines[i].minNg[m]; } ngs[i].push(g+n? n/(g+n)*100 : null); }); }
  upsert("lvChCmpNg",{type:"line",data:{labels:l5,datasets:[
    ...[0,1].map(i=>({label:LINES[i].id,data:ngs[i],borderColor:LC[i],backgroundColor:LC[i],borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:0.25,pointStyle:"circle"})),
    {label:"USL",data:l5.map(()=>USL),borderColor:C.ng,borderWidth:1.5,borderDash:[6,4],pointRadius:0,pointHoverRadius:0,pointStyle:"line"}]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{position:"bottom",labels:{usePointStyle:true}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.parsed.y==null?"-":c.parsed.y.toFixed(2)+"%"}`}}},
      scales:{x:{grid:NOGRID,ticks:{maxTicksLimit:8,maxRotation:0}},y:{grid:GRID,suggestedMin:0,ticks:{callback:v=>v+"%"}}}}});
  const s=Math.max(0,e-59), lm=[], outs=[[],[]];
  for(let m=s;m<=e;m++){ lm.push(hhmm(S.start+m*60000)); [0,1].forEach(i=>outs[i].push(S.lines[i].minGo[m]+S.lines[i].minNg[m])); }
  upsert("lvChCmpOut",{type:"line",data:{labels:lm,datasets:[
    ...[0,1].map(i=>({label:LINES[i].id,data:outs[i],borderColor:LC[i],backgroundColor:LC[i],borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:0.25,pointStyle:"circle"})),
    ...[0,1].map(i=>({label:LINES[i].id+" plan",data:lm.map(()=>LINES[i].target/480),borderColor:LC[i],borderWidth:1,borderDash:[5,4],pointRadius:0,pointHoverRadius:0,pointStyle:"line"}))]},
    options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{position:"bottom",labels:{usePointStyle:true}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${nf.format(c.parsed.y)} parts/min`}}},
      scales:{x:{grid:NOGRID,ticks:{maxTicksLimit:8,maxRotation:0}},y:{grid:GRID,beginAtZero:true}}}});
}

/* ---------- Loop ---------- */
let lastInsight = 0, lastEventsLen = -1;
function frame(full){
  renderHeader(); renderKpis(); renderCompare(); renderLines(); renderStream(); renderRateChart(); renderNgChart(); renderReasons(); renderRm();
  document.querySelectorAll("#lvSel button").forEach(x=>x.classList.toggle("on",x.dataset.sel===sel));
  const now=performance.now();
  if(full || now-lastInsight>10000){ renderInsights(); lastInsight=now; }
  if(full || events.length!==lastEventsLen || events.some(e=>e.fresh)){ renderEvents(); lastEventsLen=events.length; }
}
function tick(){
  const now=performance.now(), dt=(now-lastReal)/1000; lastReal=now;
  if(!paused){ let secs=Math.min(30000, Math.round(dt*speed)); while(secs-->0) stepSecond(); }
  if(!$("viewLive").hidden) frame(false);
}

$("lvSpeed").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; speed=+b.dataset.sp;
  document.querySelectorAll("#lvSpeed button").forEach(x=>x.classList.toggle("on",x===b)); log("info",`Simulation speed set to ${speed}x.`); frame(true);});
$("lvPause").onclick=e=>{paused=!paused; e.target.textContent=paused?"Resume":"Pause"; lastReal=performance.now(); frame(true);};

function setSel(v){ sel = (sel===v && v!=="all")? "all" : v; frame(true); }
$("lvSel").addEventListener("click",e=>{const b=e.target.closest("button"); if(b) setSel(b.dataset.sel);});
$("lvLines").addEventListener("click",e=>{const c=e.target.closest("[data-line]"); if(c) setSel(c.dataset.line);});
$("lvLines").addEventListener("keydown",e=>{const c=e.target.closest("[data-line]"); if(c&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setSel(c.dataset.line);}});

/* ---------- View tabs ---------- */
document.querySelectorAll(".viewtabs button").forEach(b=>b.onclick=()=>{
  const v=b.dataset.view;
  document.querySelectorAll(".viewtabs button").forEach(x=>{x.classList.toggle("on",x===b);x.setAttribute("aria-selected",String(x===b));});
  $("viewLive").hidden = v!=="live"; $("viewMonthly").hidden = v!=="monthly";
  document.querySelector(".top-actions").style.display = v==="monthly"?"":"none";
  if(v==="monthly" && window.__monthly){ window.__monthly.render(); Object.values(window.__monthly.charts).forEach(c=>c.resize()); }
  else frame(true);
});
document.querySelector(".top-actions").style.display="none";

function exportData(){
  const t=tot(), n=t.go+t.ng, ix=IDX(), e=curIdx();
  let waste=0,cost=0; RMS.forEach(r=>{const m=rmOf(r.id); waste+=m.actual-m.set; cost+=(m.actual-m.set)*r.rate;});
  const summary=[["Report","Yield & Scrap Management, Live shift"],["Prepared for","Sujan Continental, Pune"],["Prepared by","Prowesstics IT Services Pvt. Ltd."],
    ["Shift",`${S.name} (${hhmm(S.start)} to ${hhmm(S.end)} IST)`],["Snapshot time",hhmmss(simMs)+" IST"],["Lines",sel==="all"?"All lines":LINES[+sel].id],
    ["CAUTION","DEMO DASHBOARD. Simulated live feed for illustration only. Not actual plant data."],[],
    ["Metric","Value"],["Shift target parts",tgt()],["Parts produced",n],["GO parts",t.go],["NG parts",t.ng],["NG %",n?Math.round(t.ng/n*10000)/100:0],
    ["Run rate parts/min (5 min)",Math.round(ix.map(i=>rollNg(i,5)).reduce((s,r)=>s+r.perMin,0))],["RM wasted kg",Math.round(waste)],["Scrap cost INR",Math.round(cost)],["USL NG %",USL]];
  const head=["Time"]; ix.forEach(i=>head.push(LINES[i].id+" GO",LINES[i].id+" NG")); const perMin=[head];
  for(let m=0;m<=e;m++){ const row=[hhmm(S.start+m*60000)]; ix.forEach(i=>row.push(S.lines[i].minGo[m],S.lines[i].minNg[m])); perMin.push(row); }
  const totNg=t.ng||1, reasons=[["NG reason","Parts","Share %"]];
  REASONS.map((r,k)=>[r[0],ix.reduce((a,i)=>a+S.lines[i].reasons[k],0)]).sort((a,b)=>b[1]-a[1]).forEach(([nm,c])=>reasons.push([nm,c,Math.round(c/totNg*1000)/10]));
  const rm=[["Group","Raw material","Set kg","Actual kg","Wastage kg","Rate INR/kg","Scrap cost INR"]];
  RMS.forEach(r=>{const m=rmOf(r.id); if(!m.actual) return; rm.push([(AVS.GROUPS.find(g=>g.id===r.group)||{}).name,r.name,Math.round(m.set*10)/10,Math.round(m.actual*10)/10,Math.round((m.actual-m.set)*10)/10,r.rate,Math.round((m.actual-m.set)*r.rate)]);});
  const ev=[["Time","Level","Event"]]; events.forEach(x=>ev.push([hhmmss(x.t),x.level,x.text]));
  const a=lineStats(0), b=lineStats(1);
  const cmp=[["KPI",LINES[0].id,LINES[1].id],["Variant",LINES[0].variant,LINES[1].variant],["Status",a.status,b.status],["Shift target",a.target,b.target],["Parts produced",a.n,b.n],["Due by now",Math.round(a.exp),Math.round(b.exp)],
    ["Plan attainment %",+a.att.toFixed(1),+b.att.toFixed(1)],["Projected end of shift",Math.round(a.proj),Math.round(b.proj)],["GO parts",a.go,b.go],["NG parts",a.ng,b.ng],["NG % (shift)",+a.ngPct.toFixed(2),+b.ngPct.toFixed(2)],
    ["NG % (last 5 min)",+a.ng5.toFixed(2),+b.ng5.toFixed(2)],["First-pass yield %",+a.fpy.toFixed(2),+b.fpy.toFixed(2)],["Run rate parts/min (5 min)",Math.round(a.rate5),Math.round(b.rate5)],["Speed vs plan %",+a.speed.toFixed(1),+b.speed.toFixed(1)],
    ["Availability %",+a.avail.toFixed(1),+b.avail.toFixed(1)],["Stoppages",a.stops,b.stops],["Downtime minutes",+a.down.toFixed(1),+b.down.toFixed(1)],["Material yield %",+a.my.toFixed(2),+b.my.toFixed(2)],
    ["RM wasted kg",Math.round(a.waste),Math.round(b.waste)],["Scrap cost INR",Math.round(a.cost),Math.round(b.cost)],["Scrap cost per 1,000 parts INR",Math.round(a.cpk),Math.round(b.cpk)],["Top NG reason",a.top,b.top]];
  return {title:"Live shift", period:`${S.name}, ${hhmmss(simMs)} IST`, sheets:[["Summary",summary],["Line Comparison",cmp],["Per Minute",perMin],["NG Reasons",reasons],["RM Consumption",rm],["Event Log",ev]]};
}
window.__live={exportData};

backfill();
frame(true);
setInterval(tick, 1000);
})();
