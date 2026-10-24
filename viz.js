/* Small shared visual helpers: sparklines, half gauges, gradients */
(function(){
"use strict";
let uid=0;
// Area sparkline. vals: numbers (null allowed); hi: Set of indexes to emphasise
function spark(vals, color, hi, opts){
  opts=opts||{};
  const W=120, H=34, v=vals.map(x=>x==null||!isFinite(x)?null:x), nums=v.filter(x=>x!=null);
  if(nums.length<2) return "";
  let mn=Math.min(...nums), mx=Math.max(...nums); if(opts.zero) mn=Math.min(0,mn); if(mx===mn){mx+=1;mn-=1;}
  const step=W/(v.length-1), y=x=>H-3-(x-mn)/(mx-mn)*(H-8);
  const pts=v.map((x,i)=>x==null?null:[i*step,y(x)]).filter(Boolean);
  const line=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+","+p[1].toFixed(1)).join("");
  const area=line+`L${pts[pts.length-1][0].toFixed(1)},${H}L${pts[0][0].toFixed(1)},${H}Z`;
  const id="sg"+(++uid);
  const dots = hi? v.map((x,i)=>x!=null&&hi.has(i)?`<circle cx="${(i*step).toFixed(1)}" cy="${y(x).toFixed(1)}" r="2.2" fill="${color}"/>`:"").join("") : "";
  const last=pts[pts.length-1];
  return `<svg class="kspark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".28"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    ${dots}<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.8" fill="#fff" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}
// Half-circle gauge, value 0..100 (pct), with optional target tick
function gauge(pct, color, label, valueText, sub, target){
  const p=Math.max(0,Math.min(100,pct));
  const R=80, cx=100, cy=96, arc=`M${cx-R},${cy} A${R},${R} 0 0 1 ${cx+R},${cy}`;
  let tick="";
  if(target!=null){ const a=Math.PI*(1-Math.max(0,Math.min(100,target))/100), x1=cx+(R-14)*Math.cos(a), y1=cy-(R-14)*Math.sin(a), x2=cx+(R+12)*Math.cos(a), y2=cy-(R+12)*Math.sin(a);
    tick=`<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#0A1F44" stroke-width="2.5" stroke-linecap="round"/>`; }
  return `<div class="gauge"><svg viewBox="0 0 200 112" role="img" aria-label="${label}: ${valueText}">
    <path d="${arc}" fill="none" stroke="#EDF0F5" stroke-width="16" stroke-linecap="round"/>
    <path d="${arc}" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round" pathLength="100" stroke-dasharray="${p.toFixed(2)} 100" class="g-val"/>
    ${tick}<text x="${cx}" y="${cy-14}" text-anchor="middle" class="g-num">${valueText}</text></svg>
    <div class="g-lbl">${label}</div><div class="g-sub">${sub||""}</div></div>`;
}
// Vertical gradient fill for Chart.js area charts
function fill(color){
  return ctx=>{ const ch=ctx.chart, a=ch.chartArea; if(!a) return color+"22";
    const g=ch.ctx.createLinearGradient(0,a.top,0,a.bottom); g.addColorStop(0,color+"55"); g.addColorStop(1,color+"03"); return g; };
}
window.VIZ={spark,gauge,fill};
})();
