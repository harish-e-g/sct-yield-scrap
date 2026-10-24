/* Shared visual helpers: functional sparklines, zoned gauges, gradients */
(function(){
"use strict";
let uid=0;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

/* Sparkline with context.
   opts: caption, x0, x1 (axis end labels), ref (number), refLabel, fmt (value formatter), tips (label per point), hi (Set of emphasised indexes), zero */
function spark(vals, color, opts){
  opts=opts||{};
  const W=240, H=44, fmt=opts.fmt||(v=>String(Math.round(v)));
  const v=vals.map(x=>x==null||!isFinite(x)?null:x), nums=v.filter(x=>x!=null);
  if(nums.length<2) return "";
  let mn=Math.min(...nums), mx=Math.max(...nums);
  if(opts.ref!=null){ mn=Math.min(mn,opts.ref); mx=Math.max(mx,opts.ref); }
  if(opts.zero) mn=Math.min(0,mn);
  if(mx===mn){ mx+=1; mn-=1; }
  const pad=(mx-mn)*0.12; mn-=pad; mx+=pad;
  const step=W/(v.length-1), y=x=>H-(x-mn)/(mx-mn)*H;
  const pts=v.map((x,i)=>x==null?null:[i*step,y(x),i,x]).filter(Boolean);
  const line=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+","+p[1].toFixed(1)).join("");
  const area=line+`L${pts[pts.length-1][0].toFixed(1)},${H}L${pts[0][0].toFixed(1)},${H}Z`;
  const id="sg"+(++uid);
  const ref = opts.ref!=null? `<line x1="0" x2="${W}" y1="${y(opts.ref).toFixed(1)}" y2="${y(opts.ref).toFixed(1)}" stroke="#7B8494" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>` : "";
  const hi = opts.hi? pts.filter(p=>opts.hi.has(p[2])).map(p=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.4" fill="${color}"/>`).join("") : "";
  const tips = pts.map(p=>`<rect x="${(p[0]-step/2).toFixed(1)}" y="0" width="${step.toFixed(1)}" height="${H}" fill="transparent"><title>${esc((opts.tips&&opts.tips[p[2]])||"")}${opts.tips?": ":""}${esc(fmt(p[3]))}</title></rect>`).join("");
  const last=pts[pts.length-1], hiV=Math.max(...nums), loV=Math.min(...nums);
  const pkP=pts.reduce((a,p)=>p[3]>a[3]?p:a,pts[0]), pkX=pkP[0]/W*100, pkY=pkP[1]/H*100;
  const pkWhen=(opts.tips&&opts.tips[pkP[2]])?` · ${esc(opts.tips[pkP[2]])}`:"";
  const pkAlign = pkX>72? "right" : pkX<28? "left" : "mid";
  const peak=`<span class="ks-pk-dot" style="left:${pkX.toFixed(2)}%;top:${pkY.toFixed(2)}%;border-color:${color}"></span><span class="ks-pk ${pkAlign}" style="left:${pkX.toFixed(2)}%;top:${pkY.toFixed(2)}%;color:${color}">Peak ${esc(fmt(pkP[3]))}${pkWhen}</span>`;
  return `<div class="ks">
    <div class="ks-cap" title="Low ${esc(fmt(loV))} · High ${esc(fmt(hiV))}"><span>${esc(opts.caption||"")}</span></div>
    <div class="ks-plot">    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${esc(opts.caption||"trend")}">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".22"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
      ${ref}<path d="${area}" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      ${hi}<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3" fill="${color}"/>${tips}</svg>${peak}</div>
    <div class="ks-x"><span>${esc(opts.x0||"")}</span>${opts.ref!=null?`<span class="ks-ref">- - ${esc(opts.refLabel||"Ref")} ${esc(fmt(opts.ref))}</span>`:""}<span>${esc(opts.x1||"")}</span></div></div>`;
}

/* Zoned half gauge.
   o: min, max, value, target, zones [[from,to,"bad"|"warn"|"good"]...], label, valueText, sub, fmt */
const ZONE={bad:"#F6D3D1",warn:"#F7E6C2",good:"#D3EEDF"}, SOLID={bad:"#C93A3A",warn:"#B7791F",good:"#1E8E5A"};
function gauge(o){
  const R=78, cx=100, cy=92, SW=14;
  const clamp=x=>Math.max(o.min,Math.min(o.max,x));
  const ang=x=>Math.PI*(1-(clamp(x)-o.min)/(o.max-o.min));
  const pt=(a,r)=>[cx+r*Math.cos(a), cy-r*Math.sin(a)];
  const arc=(f,t)=>{const a1=ang(f), a2=ang(t), p1=pt(a1,R), p2=pt(a2,R); return `M${p1[0].toFixed(2)},${p1[1].toFixed(2)} A${R},${R} 0 0 1 ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;};
  const zoneOf=val=>{ const z=(o.zones||[]).find(z=>val>=z[0]&&val<=z[1]); return z?z[2]:"good"; };
  const status=zoneOf(clamp(o.value));
  const bands=(o.zones||[]).map(z=>`<path d="${arc(z[0],z[1])}" fill="none" stroke="${ZONE[z[2]]}" stroke-width="${SW}"/>`).join("");
  const val=`<path d="${arc(o.min,o.value)}" fill="none" stroke="${SOLID[status]}" stroke-width="${SW-6}" stroke-linecap="round"/>`;
  let tgt="";
  if(o.target!=null){ const a=ang(o.target), p1=pt(a,R-SW/2-1), p2=pt(a,R+SW/2+1);
    tgt=`<line x1="${p1[0].toFixed(2)}" y1="${p1[1].toFixed(2)}" x2="${p2[0].toFixed(2)}" y2="${p2[1].toFixed(2)}" stroke="#FFFFFF" stroke-width="3"/>`; }
  const f=o.fmt||(x=>x);
  const pL=pt(Math.PI,R), pR=pt(0,R);
  const delta = o.target!=null? o.value-o.target : null;
  const word = status==="good"?"On target":status==="warn"?"Watch":"Action needed";
  return `<div class="gauge"><svg viewBox="0 0 200 112" role="img" aria-label="${esc(o.label)}: ${esc(o.valueText)}">
    ${bands}${val}${tgt}
    <text x="${cx}" y="${cy-12}" text-anchor="middle" class="g-num">${esc(o.valueText)}</text>
    <text x="${pL[0]}" y="${cy+16}" text-anchor="middle" class="g-axis">${esc(f(o.min))}</text>
    <text x="${pR[0]}" y="${cy+16}" text-anchor="middle" class="g-axis">${esc(f(o.max))}</text></svg>
    <div class="g-lbl">${esc(o.label)}</div>
    <div class="g-status ${status}">${word}${o.target!=null?` · target ${esc(f(o.target))} (${delta>=0?"+":""}${esc((o.dfmt||(d=>d.toFixed(1)))(delta))})`:""}</div>
    <div class="g-sub">${esc(o.sub||"")}</div></div>`;
}

function fill(color){
  return ctx=>{ const ch=ctx.chart, a=ch.chartArea; if(!a) return color+"22";
    const g=ch.ctx.createLinearGradient(0,a.top,0,a.bottom); g.addColorStop(0,color+"44"); g.addColorStop(1,color+"03"); return g; };
}
window.VIZ={spark,gauge,fill};
})();
