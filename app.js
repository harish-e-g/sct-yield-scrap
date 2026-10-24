/* Yield & Scrap Management dashboard | Prowesstics for Sujan ContiTech, Pune */
(function(){
"use strict";

const STORE_KEY = "sct-yield-scrap-v3";
const SERIES = ["#2F5BA8","#1F9AA6","#C98A16","#8E5BB5","#5E8C31"]; // validated (first 3), light surface
const LINE_COLORS = {"Line 1":"#2F5BA8","Line 2":"#1F9AA6"};
const STATUS = {good:"#1E8E5A", warn:"#B7791F", crit:"#C93A3A"};
const NEUTRAL = "#8C97AB";

/* ---------- Demo data ---------- */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

function buildDemo(){
  const rnd = mulberry32(2026);
  const r = (a,b)=>a+(b-a)*rnd();
  const months = [];
  for(let i=0;i<12;i++){const d=new Date(2025,9+i,1);months.push(d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0"));}
  const rms = [
    {id:"RC", name:"Rubber Compound (NR)", rate:245},
    {id:"IS", name:"Inner Metal Sleeve", rate:95},
    {id:"OS", name:"Outer Sleeve / Bracket", rate:160},
    {id:"BA", name:"Bonding Agent", rate:2900}
  ];
  const variants = [
    {id:"5220", name:"5220 Mass Damper", std:{RC:0.420, IS:0.180, OS:0.950, BA:0.0025}},
    {id:"EM310", name:"Engine Mount EM-310", std:{RC:0.580, IS:0.300, OS:1.100, BA:0.0030}},
    {id:"BS140", name:"Suspension Bush SB-140", std:{RC:0.160, IS:0.120, OS:0.200, BA:0.0012}}
  ];
  const vById = Object.fromEntries(variants.map(v=>[v.id,v]));
  const prod = [];
  months.forEach((m,i)=>{
    [["Line 1","5220",3510000],["Line 2", (i%3===2)?"BS140":"EM310", (i%3===2)?4290000:3000000]].forEach(([line,vid,base])=>{
      const planned = Math.round(base*r(0.95,1.06)/100)*100;
      const produced = Math.round(planned*r(0.93,0.99));
      const rejRate = r(0.012,0.028) + (i===8&&line==="Line 1"?0.03:0);
      const rejected = Math.round(produced*rejRate);
      const good = produced - rejected;
      // loss over standard: rubber = flash + runner + scorched compound; metal = rejects + pre-treatment scrap; bonding agent = spray overspray + pot life
      const extra = {RC:r(0.10,0.14), IS:r(0.006,0.012), OS:r(0.006,0.012), BA:r(0.16,0.24)};
      if(i===8 && line==="Line 1"){extra.RC+=0.08; extra.BA+=0.10;}       // Jun-26 spike
      if(i>=10){extra.RC-=0.02; extra.BA-=0.03;}                          // recent improvement
      const actual = {};
      rms.forEach(rm=>{actual[rm.id] = round1(produced*vById[vid].std[rm.id]*(1+extra[rm.id]));});
      prod.push({month:m,line,variant:vid,planned,good,rejected,actual});
    });
  });
  // stock: first-month opening + monthly inward
  const stock = {opening:{}, inward:{}};
  rms.forEach(rm=>{ stock.opening[rm.id] = Math.round(prod.filter(p=>p.month===months[0]).reduce((s,p)=>s+p.actual[rm.id],0)*0.55/100)*100; });
  months.forEach(m=>{
    stock.inward[m] = {};
    rms.forEach(rm=>{
      const need = prod.filter(p=>p.month===m).reduce((s,p)=>s+p.actual[rm.id],0);
      stock.inward[m][rm.id] = Math.round(need*r(0.92,1.1)/10)*10;
    });
  });
  return {months, rms, variants, prod, stock, limits:{mode:"auto", usl:null, lsl:null}};
}

/* ---------- State ---------- */
let S = load() || buildDemo();
const ui = {month:S.months[S.months.length-1], line:"all", variant:"all", rm:"all", wiWaste:20, wiPrice:0, tab:"prod"};

function load(){try{const t=localStorage.getItem(STORE_KEY);return t?JSON.parse(t):null;}catch(e){return null;}}
function save(){try{localStorage.setItem(STORE_KEY, JSON.stringify(S));}catch(e){}}

/* ---------- Helpers ---------- */
function round1(x){return Math.round(x*10)/10;}
const nf0 = new Intl.NumberFormat("en-IN",{maximumFractionDigits:0});
const nf1 = new Intl.NumberFormat("en-IN",{maximumFractionDigits:1,minimumFractionDigits:1});
const kg = x=>nf0.format(Math.round(x))+" kg";
const pct = (x,d=1)=>isFinite(x)?(x*100).toFixed(d)+"%":"-";
function inr(x){
  const a=Math.abs(x);
  if(a>=1e7) return "₹"+(x/1e7).toFixed(2)+" Cr";
  if(a>=1e5) return "₹"+(x/1e5).toFixed(2)+" L";
  return "₹"+nf0.format(Math.round(x));
}
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function monthLabel(m){const [y,mo]=m.split("-");return MON[+mo-1]+"-"+y.slice(2);}
const rmById = id=>S.rms.find(r=>r.id===id);
const vById = id=>S.variants.find(v=>v.id===id);
const rmColor = id=>SERIES[Math.max(0,S.rms.findIndex(r=>r.id===id))%SERIES.length];
const esc = s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const lines = ()=>[...new Set(S.prod.map(p=>p.line))].sort();
const rate = id=>(rmById(id)?.rate||0)*(1+ui.wiPrice/100);

/* ---------- Core calculations ---------- */
function rowsFor(month){
  return S.prod.filter(p=>(!month||p.month===month)&&(ui.line==="all"||p.line===ui.line)&&(ui.variant==="all"||p.variant===ui.variant));
}
function rmList(){return ui.rm==="all"?S.rms.map(r=>r.id):[ui.rm];}

function agg(rows){
  const out = {planned:0,good:0,rejected:0,set:0,actual:0,waste:0,cost:0,byRm:{}};
  S.rms.forEach(r=>out.byRm[r.id]={set:0,actual:0,waste:0,cost:0});
  rows.forEach(p=>{
    out.planned+=p.planned; out.good+=p.good; out.rejected+=p.rejected;
    const v = vById(p.variant);
    S.rms.forEach(rm=>{
      const set = p.good*((v&&v.std[rm.id])||0);
      const act = p.actual[rm.id]||0;
      const w = act-set;
      const b=out.byRm[rm.id]; b.set+=set; b.actual+=act; b.waste+=w; b.cost+=w*rate(rm.id);
    });
  });
  rmList().forEach(id=>{const b=out.byRm[id]; if(!b)return; out.set+=b.set; out.actual+=b.actual; out.waste+=b.waste; out.cost+=b.cost;});
  out.yield = out.actual? out.set/out.actual : NaN;
  out.scrap = out.actual? out.waste/out.actual : NaN;
  out.rejRate = (out.good+out.rejected)? out.rejected/(out.good+out.rejected) : NaN;
  out.attain = out.planned? out.good/out.planned : NaN;
  return out;
}

function stockChain(){
  const res = {}; let open = {...S.stock.opening};
  S.months.forEach(m=>{
    res[m]={};
    S.rms.forEach(rm=>{
      const inward = (S.stock.inward[m]&&S.stock.inward[m][rm.id])||0;
      const consumed = S.prod.filter(p=>p.month===m).reduce((s,p)=>s+(p.actual[rm.id]||0),0);
      const o = open[rm.id]||0;
      const closing = o+inward-consumed;
      res[m][rm.id]={opening:o,inward,consumed,closing,cover: consumed? closing/(consumed/30):NaN};
      open[rm.id]=closing;
    });
  });
  return res;
}

function spcSeries(){
  const vals = S.months.map(m=>{const a=agg(rowsFor(m)); return isFinite(a.scrap)?a.scrap*100:null;});
  const v = vals.filter(x=>x!==null);
  const mean = v.reduce((s,x)=>s+x,0)/(v.length||1);
  let mr=0; for(let i=1;i<v.length;i++) mr+=Math.abs(v[i]-v[i-1]);
  const sigma = v.length>1 ? (mr/(v.length-1))/1.128 : 0;
  let usl = mean+3*sigma, lsl = Math.max(0,mean-3*sigma);
  if(S.limits.mode==="manual"){
    if(S.limits.usl!=null&&S.limits.usl!=="") usl=+S.limits.usl;
    if(S.limits.lsl!=null&&S.limits.lsl!=="") lsl=+S.limits.lsl;
  }
  return {vals, mean, sigma, usl, lsl};
}

/* ---------- Filters ---------- */
function opt(sel, items, val){sel.innerHTML = items.map(([v,t])=>`<option value="${esc(v)}"${v===val?" selected":""}>${esc(t)}</option>`).join("");}
function renderFilters(){
  if(!S.months.includes(ui.month)) ui.month = S.months[S.months.length-1];
  opt(fMonth, S.months.slice().reverse().map(m=>[m,monthLabel(m)]), ui.month);
  opt(fLine, [["all","All lines"],...lines().map(l=>[l,l])], ui.line);
  opt(fVariant, [["all","All variants"],...S.variants.map(v=>[v.id,v.name])], ui.variant);
  opt(fRm, [["all","All raw materials"],...S.rms.map(r=>[r.id,r.name])], ui.rm);
  const parts=[]; if(ui.line!=="all")parts.push(ui.line); if(ui.variant!=="all")parts.push(vById(ui.variant)?.name); if(ui.rm!=="all")parts.push(rmById(ui.rm)?.name);
  filterNote.textContent = parts.length? "Showing: "+parts.join(" · ") : "Showing the whole plant, all raw materials";
}
const $ = id=>document.getElementById(id);
const fMonth=$("fMonth"), fLine=$("fLine"), fVariant=$("fVariant"), fRm=$("fRm"), filterNote=$("filterNote");
fMonth.onchange=e=>{ui.month=e.target.value;render();};
fLine.onchange=e=>{ui.line=e.target.value;render();};
fVariant.onchange=e=>{ui.variant=e.target.value;render();};
fRm.onchange=e=>{ui.rm=e.target.value;render();};

/* ---------- KPIs ---------- */
function deltaHtml(cur, prev, lowerIsBetter, fmt){
  if(!isFinite(cur)||!isFinite(prev)) return `<span class="delta flat">no prior month</span>`;
  const d = cur-prev; if(Math.abs(d)<1e-9) return `<span class="delta flat">● flat vs last month</span>`;
  const good = lowerIsBetter? d<0 : d>0;
  return `<span class="delta ${good?"good":"bad"}">${d>0?"▲":"▼"} ${fmt(Math.abs(d))}</span> <span>vs last month</span>`;
}
function renderKpis(){
  const i = S.months.indexOf(ui.month), prevM = S.months[i-1];
  const a = agg(rowsFor(ui.month)), p = prevM? agg(rowsFor(prevM)) : null;
  const P = k=>p?p[k]:NaN;
  const pp = x=>(x*100).toFixed(2)+" pts";
  const tiles = [
    ["Material yield", pct(a.yield), deltaHtml(a.yield,P("yield"),false,pp), false],
    ["Scrap %", pct(a.scrap), deltaHtml(a.scrap,P("scrap"),true,pp), true],
    ["Wastage", kg(a.waste), deltaHtml(a.waste,P("waste"),true,x=>nf0.format(x)+" kg"), false],
    ["Scrap cost", inr(a.cost), deltaHtml(a.cost,P("cost"),true,inr), true],
    ["Good parts", nf0.format(a.good), `<span>${pct(a.attain)} of plan (${nf0.format(a.planned)})</span>`, false],
    ["Rejection rate", pct(a.rejRate,2), deltaHtml(a.rejRate,P("rejRate"),true,x=>(x*100).toFixed(2)+" pts"), false]
  ];
  $("kpis").innerHTML = tiles.map(([l,v,s,hl])=>`<div class="kpi${hl?" hl":""}"><div class="lbl">${l}</div><div class="val">${v}</div><div class="sub">${s}</div></div>`).join("");
}

/* ---------- Production details (line cards) ---------- */
function renderLines(){
  $("prodMonthLbl").textContent = monthLabel(ui.month);
  const rows = rowsFor(ui.month);
  if(!rows.length){$("lineCards").innerHTML=`<div class="empty">No production for this filter in ${monthLabel(ui.month)}.</div>`;return;}
  const html = rows.map(p=>{
    const a = agg([p]); const v = vById(p.variant);
    const scrapPill = a.scrap>0.08?"crit":a.scrap>0.05?"warn":"good";
    const maxAct = Math.max(...rmList().map(id=>a.byRm[id].actual),1);
    const tr = rmList().map(id=>{
      const b=a.byRm[id], rm=rmById(id), wpp = p.good? b.waste/p.good : 0;
      const sp = b.actual? b.waste/b.actual:0;
      return `<tr>
        <td><span class="rm-name"><span class="sw" style="background:${rmColor(id)}"></span>${esc(rm.name)}</span></td>
        <td>${nf0.format(b.set)}</td>
        <td>${nf0.format(b.actual)}</td>
        <td class="hide-sm"><div class="bar" title="Actual vs set"><i style="width:${(b.actual/maxAct*100).toFixed(0)}%;background:${rmColor(id)}"></i></div></td>
        <td><b>${nf0.format(b.waste)}</b> <span class="muted">(${(sp*100).toFixed(1)}%)</span></td>
        <td class="hide-sm">${(wpp*1000).toFixed(1)} g</td>
      </tr>`;}).join("");
    return `<div class="line-card">
      <div class="lc-head"><div><span class="ln">${esc(p.line)}</span> &nbsp;<span class="pn">${esc(v?v.name:p.variant)}</span></div>
        <span class="pill ${scrapPill}">${scrapPill==="good"?"✓":"!"} Scrap ${pct(a.scrap)}</span></div>
      <div class="lc-stats">
        <div><div class="k">Planned</div><div class="v">${nf0.format(p.planned)}</div></div>
        <div><div class="k">Good parts</div><div class="v">${nf0.format(p.good)}</div></div>
        <div><div class="k">Rejected</div><div class="v">${nf0.format(p.rejected)}</div></div>
        <div><div class="k">Yield</div><div class="v">${pct(a.yield)}</div></div>
      </div>
      <div class="table-wrap"><table class="rm-table">
        <thead><tr><th>Raw material</th><th>Set kg</th><th>Actual kg</th><th class="hide-sm"></th><th>Wastage kg</th><th class="hide-sm">Waste / part</th></tr></thead>
        <tbody>${tr}</tbody>
      </table></div>
    </div>`;}).join("");
  $("lineCards").innerHTML = html;
}

/* ---------- Stock ---------- */
function renderStock(){
  $("stockMonthLbl").textContent = "Closing, "+monthLabel(ui.month);
  const st = stockChain()[ui.month];
  const rowsHtml = S.rms.map(rm=>{
    const s = st[rm.id]; const dim = ui.rm!=="all"&&ui.rm!==rm.id;
    const cv = s.cover; const lvl = !isFinite(cv)?"warn":cv<7?"crit":cv<15?"warn":"good";
    const txt = !isFinite(cv)?"-":cv<0?"Shortage":Math.round(cv)+" days";
    return `<tr class="${dim?"dim":""}">
      <td><span class="rm-name"><span class="sw" style="background:${rmColor(rm.id)}"></span>${esc(rm.name)}</span></td>
      <td class="hide-sm">${nf0.format(s.opening)}</td><td class="hide-sm">${nf0.format(s.inward)}</td><td>${nf0.format(s.consumed)}</td>
      <td class="big">${kg(s.closing)}</td>
      <td><span class="pill ${lvl}">${lvl==="good"?"✓":"!"} ${txt}</span></td></tr>`;
  }).join("");
  $("stockTable").innerHTML = `<div class="table-wrap"><table class="stock-table"><thead><tr><th>Raw material</th><th class="hide-sm">Opening</th><th class="hide-sm">Inward</th><th>Consumed</th><th>Available</th><th>Cover</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
}

/* ---------- Charts ---------- */
Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
Chart.defaults.font.size = 12;
Chart.defaults.color = "#44526B";
Chart.defaults.plugins.tooltip.backgroundColor = "#0A1F44";
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 8;
Chart.defaults.plugins.legend.labels.boxWidth = 10;
Chart.defaults.plugins.legend.labels.boxHeight = 10;
Chart.defaults.plugins.legend.labels.useBorderRadius = true;
Chart.defaults.plugins.legend.labels.borderRadius = 3;
const GRID = {color:"#EEF1F6"}; const NOGRID={display:false};
const charts = {};
function upsert(id, cfg){
  if(charts[id]){charts[id].data=cfg.data; charts[id].options=cfg.options; charts[id].update("none"); return;}
  charts[id]=new Chart($(id), cfg);
}

function renderSpc(){
  const s = spcSeries(); const labels = S.months.map(monthLabel);
  const sel = S.months.indexOf(ui.month);
  const out = s.vals.map(v=>v!==null&&(v>s.usl||v<s.lsl));
  $("inUsl").value = s.usl.toFixed(1); $("inLsl").value = s.lsl.toFixed(1);
  upsert("chSpc",{type:"line",data:{labels,datasets:[
    {label:"Scrap %",data:s.vals,borderColor:"#2F5BA8",borderWidth:2,tension:0,
      pointRadius:s.vals.map((v,i)=>out[i]?6:i===sel?5:3.5),
      pointBackgroundColor:s.vals.map((v,i)=>out[i]?STATUS.crit:"#2F5BA8"),
      pointBorderColor:"#fff",pointBorderWidth:2,pointHoverRadius:7,pointStyle:"circle"},
    {label:"USL",data:labels.map(()=>s.usl),borderColor:STATUS.crit,borderWidth:1.5,borderDash:[6,4],pointRadius:0,pointHoverRadius:0,pointStyle:"line"},
    {label:"Average",data:labels.map(()=>s.mean),borderColor:NEUTRAL,borderWidth:1.5,pointRadius:0,pointHoverRadius:0,pointStyle:"line"},
    {label:"LSL",data:labels.map(()=>s.lsl),borderColor:STATUS.good,borderWidth:1.5,borderDash:[6,4],pointRadius:0,pointHoverRadius:0,pointStyle:"line"}
  ]},options:{maintainAspectRatio:false,interaction:{mode:"index",intersect:false},
    plugins:{legend:{position:"bottom",labels:{usePointStyle:true}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.parsed.y==null?"-":c.parsed.y.toFixed(2)+"%"}`}}},
    scales:{y:{grid:GRID,ticks:{callback:v=>v+"%"},suggestedMin:0},x:{grid:NOGRID}}}});
  const breaches = s.vals.map((v,i)=>out[i]?monthLabel(S.months[i]):null).filter(Boolean);
  $("spcFoot").innerHTML = `Average <b>${s.mean.toFixed(2)}%</b> · USL <b>${s.usl.toFixed(2)}%</b> · LSL <b>${s.lsl.toFixed(2)}%</b>` +
    (breaches.length? ` · <span style="color:${STATUS.crit};font-weight:700">⚠ Out of limits: ${breaches.join(", ")}</span>` : ` · <span style="color:${STATUS.good};font-weight:700">✓ All months within limits</span>`);
}

function renderParts(){
  const labels = S.months.map(monthLabel);
  const ls = ui.line==="all"? lines() : [ui.line];
  upsert("chParts",{type:"bar",data:{labels,datasets:ls.map(l=>({
    label:l,data:S.months.map(m=>S.prod.filter(p=>p.month===m&&p.line===l&&(ui.variant==="all"||p.variant===ui.variant)).reduce((s,p)=>s+p.good,0)),
    backgroundColor:LINE_COLORS[l]||SERIES[3],borderRadius:4,borderSkipped:"start",borderColor:"#fff",borderWidth:{left:1,right:1},maxBarThickness:18}))},
    options:{maintainAspectRatio:false,plugins:{legend:{position:"bottom"},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${nf0.format(c.parsed.y)} parts`}}},
      scales:{y:{grid:GRID,ticks:{callback:v=>v>=1e5?(v/1e5)+" L":nf0.format(v)}},x:{grid:NOGRID}}}});
}

function renderWaste(){
  const labels = S.months.map(monthLabel);
  upsert("chWaste",{type:"bar",data:{labels,datasets:rmList().map(id=>({
    label:rmById(id).name,data:S.months.map(m=>agg(rowsFor(m)).byRm[id].waste),
    backgroundColor:rmColor(id),borderColor:"#fff",borderWidth:{top:2},borderRadius:3,borderSkipped:false,maxBarThickness:22}))},
    options:{maintainAspectRatio:false,plugins:{legend:{position:"bottom"},tooltip:{mode:"index",intersect:false,callbacks:{label:c=>`${c.dataset.label}: ${nf0.format(c.parsed.y)} kg`}}},
      scales:{x:{stacked:true,grid:NOGRID},y:{stacked:true,grid:GRID,ticks:{callback:v=>nf0.format(v)}}}}});
}

function renderSva(){
  $("svaLbl").textContent = monthLabel(ui.month);
  const a = agg(rowsFor(ui.month)); const ids = rmList();
  upsert("chSva",{type:"bar",data:{labels:ids.map(id=>rmById(id).name),datasets:[
    {label:"Set (standard)",data:ids.map(id=>a.byRm[id].set),backgroundColor:"#B8C2D3",borderRadius:4,borderSkipped:"start",maxBarThickness:16},
    {label:"Actual",data:ids.map(id=>a.byRm[id].actual),backgroundColor:ids.map(rmColor),borderRadius:4,borderSkipped:"start",maxBarThickness:16}
  ]},options:{indexAxis:"y",maintainAspectRatio:false,
    plugins:{legend:{position:"bottom",labels:{generateLabels:ch=>[{text:"Set (standard)",fillStyle:"#B8C2D3",strokeStyle:"#B8C2D3",borderRadius:3},{text:"Actual (RM colour)",fillStyle:"#2F5BA8",strokeStyle:"#2F5BA8",borderRadius:3}]}},
      tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${nf0.format(c.parsed.x)} kg`,afterBody:it=>{const id=ids[it[0].dataIndex];const b=a.byRm[id];return `Wastage: ${nf0.format(b.waste)} kg (${pct(b.waste/b.actual)})`;}}}},
    scales:{x:{grid:GRID,ticks:{callback:v=>nf0.format(v)}},y:{grid:NOGRID}}}});
}

/* ---------- AI insights ---------- */
function linreg(ys){const n=ys.length;const xs=ys.map((_,i)=>i);const mx=(n-1)/2;const my=ys.reduce((s,y)=>s+y,0)/n;
  let num=0,den=0;xs.forEach((x,i)=>{num+=(x-mx)*(ys[i]-my);den+=(x-mx)**2;});const b=den?num/den:0;return {b,a:my-b*mx,n};}
function renderInsights(){
  const items=[]; const rows=rowsFor(ui.month); const s=spcSeries();
  // 1 top driver
  let top=null;
  rows.forEach(p=>{const a=agg([p]);rmList().forEach(id=>{const b=a.byRm[id];if(!top||b.cost>top.cost)top={line:p.line,variant:p.variant,id,cost:b.cost,waste:b.waste,share:b.waste/b.actual};});});
  const tot = agg(rows).cost;
  if(top&&tot>0) items.push(["warn","!",`Top scrap driver: ${top.line}, ${rmById(top.id).name}`,`${kg(top.waste)} wasted (${pct(top.share)} of issue) on ${vById(top.variant)?.name||top.variant}, costing ${inr(top.cost)}. That is ${pct(top.cost/tot,0)} of this month's scrap cost.`]);
  // 2 out of limits
  const br = s.vals.map((v,i)=>v!==null&&v>s.usl?i:-1).filter(i=>i>=0);
  if(br.length) items.push(["crit","⚠",`Out-of-control month${br.length>1?"s":""}: ${br.map(i=>monthLabel(S.months[i])).join(", ")}`,`Scrap went above the USL of ${s.usl.toFixed(2)}%. Peak ${Math.max(...br.map(i=>s.vals[i])).toFixed(2)}%. Check compound batch, mould flash and press settings for that period.`]);
  else items.push(["good","✓","Process in control","Every month's scrap % is between the LSL and the USL for the current filter."]);
  // 3 trend + forecast
  const recent = s.vals.filter(v=>v!==null).slice(-6);
  if(recent.length>=3){const L=linreg(recent);const f=Math.max(0,L.a+L.b*L.n);
    const dir = L.b<-0.05?"improving":L.b>0.05?"worsening":"stable";
    items.push([dir==="worsening"?"warn":dir==="improving"?"good":"info",dir==="worsening"?"↗":dir==="improving"?"↘":"→",`Scrap trend is ${dir}; next month forecast ${f.toFixed(2)}%`,`Trend fitted on the last ${recent.length} months: ${L.b>=0?"+":""}${L.b.toFixed(2)} pts per month.`]);}
  // 4 stock
  const st=stockChain()[ui.month];
  S.rms.forEach(rm=>{const c=st[rm.id].cover; if(isFinite(c)&&c<10) items.push([c<5?"crit":"warn","!",`Low stock: ${rm.name}`,`${kg(st[rm.id].closing)} left, about ${Math.max(0,Math.round(c))} days of cover at the current run rate. Plan inward now.`]);
    else if(isFinite(c)&&c>45) items.push(["info","i",`Excess stock: ${rm.name}`,`${Math.round(c)} days of cover is tying up about ${inr(st[rm.id].closing*rate(rm.id))} in working capital.`]);});
  // 5 rejection
  rows.forEach(p=>{const rr=p.rejected/(p.good+p.rejected); if(rr>0.03) items.push(["warn","!",`High rejection on ${p.line}`,`${pct(rr,2)} of ${vById(p.variant)?.name||p.variant} parts rejected (${nf0.format(p.rejected)} pcs). Every rejected part carries its full RM weight as scrap.`]);});
  // 5b metal recovery from NG parts
  const nRej = rows.reduce((s,p)=>s+p.rejected,0);
  const metalIds = S.rms.filter(r=>/sleeve|bracket|insert|metal/i.test(r.name)).map(r=>r.id);
  if(nRej>0 && metalIds.length){ let mkg=0,minr=0; rows.forEach(p=>{const v=vById(p.variant); metalIds.forEach(id=>{const k=p.rejected*((v&&v.std[id])||0); mkg+=k; minr+=k*rate(id);});});
    items.push(["info","↺","Metal recoverable from NG parts",`${kg(mkg)} of sleeves and brackets sit inside ${nf0.format(nRej)} rejected parts. De-bonding and reusing them, instead of selling as scrap, is worth up to ${inr(minr)} this month.`]); }
  // 6 opportunity
  const above = S.months.map(m=>agg(rowsFor(m))).filter(a=>a.scrap*100>s.mean);
  const save12 = above.reduce((acc,a)=>acc+(a.scrap-s.mean/100)*a.actual*(a.cost/(a.waste||1)),0);
  if(save12>0) items.push(["info","₹","Savings opportunity",`Holding every month at the ${s.mean.toFixed(2)}% average would have saved about ${inr(save12)} over the last 12 months.`]);
  $("insights").innerHTML = items.slice(0,6).map(([lvl,ic,t,d])=>`<li><div class="ic ${lvl}" aria-hidden="true">${ic}</div><div><b>${esc(t)}</b><span>${esc(d)}</span></div></li>`).join("");
}

/* ---------- What-if ---------- */
function renderWhatIf(){
  $("wiWasteVal").textContent = ui.wiWaste+"%";
  $("wiPriceVal").textContent = (ui.wiPrice>0?"+":"")+ui.wiPrice+"%";
  $("wiLbl").textContent = monthLabel(ui.month)+" basis";
  const a = agg(rowsFor(ui.month)); const f = ui.wiWaste/100;
  const savedKg = a.waste*f, savedInr = a.cost*f;
  const newYield = a.actual? a.set/(a.actual-savedKg):NaN;
  const yr = S.months.reduce((s,m)=>s+agg(rowsFor(m)).cost,0)*f;
  $("wiResults").innerHTML = `
    <div><div class="k">RM saved / month</div><div class="v">${kg(savedKg)}</div></div>
    <div><div class="k">Cost saved / month</div><div class="v">${inr(savedInr)}</div></div>
    <div><div class="k">New material yield</div><div class="v">${pct(newYield)}</div></div>
    <div class="hl"><div class="k">Annual saving (12 mo)</div><div class="v">${inr(yr)}</div></div>`;
}
$("wiWaste").oninput=e=>{ui.wiWaste=+e.target.value;renderWhatIf();};
$("wiPrice").oninput=e=>{ui.wiPrice=+e.target.value;render();};

/* ---------- Data table ---------- */
function renderTable(){
  if($("dataTable").hidden) return;
  const head = `<tr><th>Month</th><th>Line</th><th>Variant</th><th>Raw material</th><th>Good parts</th><th>Rejected</th><th>Set kg</th><th>Actual kg</th><th>Wastage kg</th><th>Scrap %</th><th>Scrap cost</th></tr>`;
  const body = S.months.slice().reverse().flatMap(m=>rowsFor(m).flatMap(p=>{const a=agg([p]);return rmList().map(id=>{const b=a.byRm[id];
    return `<tr><td>${monthLabel(m)}</td><td>${esc(p.line)}</td><td>${esc(vById(p.variant)?.name||p.variant)}</td><td>${esc(rmById(id).name)}</td><td>${nf0.format(p.good)}</td><td>${nf0.format(p.rejected)}</td><td>${nf1.format(b.set)}</td><td>${nf1.format(b.actual)}</td><td>${nf1.format(b.waste)}</td><td>${pct(b.waste/b.actual,2)}</td><td>${inr(b.cost)}</td></tr>`;});})).join("");
  $("dataTable").innerHTML = `<table class="data-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
$("btnTable").onclick=e=>{const t=$("dataTable");t.hidden=!t.hidden;e.target.textContent=t.hidden?"Show table":"Hide table";e.target.setAttribute("aria-expanded",String(!t.hidden));renderTable();};

/* ---------- Control limits ---------- */
document.querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{
  S.limits.mode=b.dataset.lim;
  if(S.limits.mode==="manual"&&S.limits.usl==null){const s=spcSeries();S.limits.usl=+s.usl.toFixed(1);S.limits.lsl=+s.lsl.toFixed(1);}
  save(); render();});
$("inUsl").onchange=e=>{S.limits.usl=e.target.value;save();render();};
$("inLsl").onchange=e=>{S.limits.lsl=e.target.value;save();render();};
function renderLimitMode(){
  document.querySelectorAll(".seg button").forEach(b=>b.classList.toggle("on",b.dataset.lim===S.limits.mode));
  $("limitsRow").classList.toggle("show",S.limits.mode==="manual");
}

/* ---------- Inputs drawer ---------- */
function numIn(path,val,step){return `<input type="number" min="0" step="${step||1}" data-path="${path}" value="${val}">`;}
function renderDrawer(){
  document.querySelectorAll(".tabs button").forEach(b=>b.classList.toggle("on",b.dataset.tab===ui.tab));
  const body=$("drawerBody"); let h="";
  if(ui.tab==="prod"){
    h+=`<p class="hint">Production for <b>${monthLabel(ui.month)}</b>. Change the month in the filter bar to edit another month.</p>`;
    S.prod.forEach((p,idx)=>{ if(p.month!==ui.month) return;
      h+=`<div class="fgroup"><h3>${esc(p.line)}</h3>
        <div class="frow"><label>Variant<select data-path="prod.${idx}.variant">${S.variants.map(v=>`<option value="${esc(v.id)}"${v.id===p.variant?" selected":""}>${esc(v.name)}</option>`).join("")}</select></label>
        <label>Planned parts${numIn(`prod.${idx}.planned`,p.planned)}</label>
        <label>Good parts${numIn(`prod.${idx}.good`,p.good)}</label></div>
        <div class="frow"><label>Rejected parts${numIn(`prod.${idx}.rejected`,p.rejected)}</label></div>
        <div class="frow">${S.rms.map(rm=>`<label>Actual ${esc(rm.name)} (kg)${numIn(`prod.${idx}.actual.${rm.id}`,p.actual[rm.id]||0,0.1)}</label>`).join("")}</div></div>`;});
  } else if(ui.tab==="stock"){
    h+=`<div class="fgroup"><h3>Opening stock, ${monthLabel(S.months[0])} (kg)</h3><div class="frow">${S.rms.map(rm=>`<label>${esc(rm.name)}${numIn(`stock.opening.${rm.id}`,S.stock.opening[rm.id]||0)}</label>`).join("")}</div>
      <p class="hint">Later months open with the previous month's closing stock automatically.</p></div>`;
    h+=`<div class="fgroup"><h3>Material inward, ${monthLabel(ui.month)} (kg)</h3><div class="frow">${S.rms.map(rm=>`<label>${esc(rm.name)}${numIn(`stock.inward.${ui.month}.${rm.id}`,(S.stock.inward[ui.month]||{})[rm.id]||0)}</label>`).join("")}</div></div>`;
  } else {
    h+=`<p class="hint">Standard (set) RM weight per good part. Set consumption = good parts × per-part weight. Wastage = actual − set.</p>`;
    S.variants.forEach((v,vi)=>{h+=`<div class="fgroup"><h3>${esc(v.name)} (kg per part)</h3><div class="frow">${S.rms.map(rm=>`<label>${esc(rm.name)}${numIn(`variants.${vi}.std.${rm.id}`,v.std[rm.id]||0,0.001)}</label>`).join("")}</div></div>`;});
    h+=`<div class="fgroup"><h3>RM rate (₹ per kg)</h3><div class="frow">${S.rms.map((rm,ri)=>`<label>${esc(rm.name)}${numIn(`rms.${ri}.rate`,rm.rate,0.5)}</label>`).join("")}</div></div>`;
  }
  body.innerHTML=h;
}
$("drawerBody").addEventListener("change",e=>{
  const path=e.target.dataset.path; if(!path) return;
  const keys=path.split("."); let o=S;
  for(let i=0;i<keys.length-1;i++){ if(o[keys[i]]==null) o[keys[i]]={}; o=o[keys[i]]; }
  const last=keys[keys.length-1];
  o[last] = e.target.tagName==="SELECT"? e.target.value : (parseFloat(e.target.value)||0);
  save(); render(false);
});
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{ui.tab=b.dataset.tab;renderDrawer();});
function openDrawer(o){$("drawer").classList.toggle("open",o);$("drawer").setAttribute("aria-hidden",String(!o));$("scrim").hidden=!o;if(o)renderDrawer();}
$("btnInputs").onclick=()=>openDrawer(true);
$("btnClose").onclick=()=>openDrawer(false);
$("scrim").onclick=()=>openDrawer(false);
document.addEventListener("keydown",e=>{if(e.key==="Escape")openDrawer(false);});

$("btnReset").onclick=()=>{ if(!window.confirm("Restore the demo data? Your edits in this browser will be cleared.")) return;
  try{localStorage.removeItem(STORE_KEY);}catch(e){} S=buildDemo(); ui.month=S.months[S.months.length-1]; ui.line=ui.variant=ui.rm="all"; render(); };

/* ---------- Excel template / upload ---------- */
$("btnData").onclick=()=>{$("uploadMsg").textContent="";$("dlgData").showModal();};
$("btnDlgClose").onclick=()=>$("dlgData").close();
$("btnTemplate").onclick=()=>{
  const wb=XLSX.utils.book_new();
  const prodRows=[];
  S.prod.forEach(p=>S.rms.forEach(rm=>prodRows.push({"Month":p.month,"Line":p.line,"Variant":vById(p.variant)?.name||p.variant,"Planned Parts":p.planned,"Good Parts":p.good,"Rejected Parts":p.rejected,"Raw Material":rm.name,"Actual kg":p.actual[rm.id]||0})));
  const stdRows=[]; S.variants.forEach(v=>S.rms.forEach(rm=>stdRows.push({"Variant":v.name,"Raw Material":rm.name,"Kg per Part":v.std[rm.id]||0})));
  const stRows=[]; S.months.forEach((m,i)=>S.rms.forEach(rm=>stRows.push({"Month":m,"Raw Material":rm.name,"Inward kg":(S.stock.inward[m]||{})[rm.id]||0,"Opening kg (first month only)":i===0?(S.stock.opening[rm.id]||0):""})));
  const rtRows=S.rms.map(rm=>({"Raw Material":rm.name,"Rate per kg (INR)":rm.rate}));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(prodRows),"Production");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(stdRows),"Part Weights");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(stRows),"Stock");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rtRows),"Rates");
  XLSX.writeFile(wb,"01. YieldScrap_Data_SCT_PWT.xlsx");
};
$("fileIn").onchange=async e=>{
  const f=e.target.files[0]; if(!f) return;
  try{
    const wb=XLSX.read(await f.arrayBuffer());
    const sh=n=>{const k=wb.SheetNames.find(x=>x.trim().toLowerCase()===n.toLowerCase());return k?XLSX.utils.sheet_to_json(wb.Sheets[k],{defval:""}):null;};
    const P=sh("Production"); if(!P||!P.length) throw new Error("Sheet 'Production' not found or empty.");
    const slug=s=>String(s).trim().toUpperCase().replace(/[^A-Z0-9]+/g,"").slice(0,12)||"X";
    const N={rms:[],variants:[],prod:[],months:[],stock:{opening:{},inward:{}},limits:S.limits};
    const rmId=name=>{let r=N.rms.find(x=>x.name===String(name).trim());if(!r){const old=S.rms.find(x=>x.name===String(name).trim());r={id:old?old.id:slug(name),name:String(name).trim(),rate:old?old.rate:0};N.rms.push(r);}return r.id;};
    const vId=name=>{let v=N.variants.find(x=>x.name===String(name).trim());if(!v){const old=S.variants.find(x=>x.name===String(name).trim());v={id:old?old.id:slug(name),name:String(name).trim(),std:old?{...old.std}:{}};N.variants.push(v);}return v.id;};
    const key={};
    P.forEach(r=>{
      const m=normMonth(r["Month"]); if(!m) return;
      const k=m+"|"+r["Line"];
      if(!key[k]){key[k]={month:m,line:String(r["Line"]).trim(),variant:vId(r["Variant"]),planned:+r["Planned Parts"]||0,good:+r["Good Parts"]||0,rejected:+r["Rejected Parts"]||0,actual:{}};N.prod.push(key[k]);}
      key[k].actual[rmId(r["Raw Material"])]=+r["Actual kg"]||0;
    });
    (sh("Part Weights")||[]).forEach(r=>{const v=N.variants.find(x=>x.id===vId(r["Variant"]));v.std[rmId(r["Raw Material"])]=+r["Kg per Part"]||0;});
    (sh("Rates")||[]).forEach(r=>{const id=rmId(r["Raw Material"]);N.rms.find(x=>x.id===id).rate=+r["Rate per kg (INR)"]||0;});
    N.months=[...new Set(N.prod.map(p=>p.month))].sort();
    (sh("Stock")||[]).forEach(r=>{const m=normMonth(r["Month"]);if(!m)return;const id=rmId(r["Raw Material"]);(N.stock.inward[m]=N.stock.inward[m]||{})[id]=+r["Inward kg"]||0;
      const o=r["Opening kg (first month only)"]; if(o!==""&&m===N.months[0]) N.stock.opening[id]=+o||0;});
    if(!N.months.length) throw new Error("No valid months found. Use YYYY-MM, e.g. 2026-09.");
    S=N; save(); ui.month=S.months[S.months.length-1]; ui.line=ui.variant=ui.rm="all"; render();
    $("uploadMsg").innerHTML=`<span style="color:${STATUS.good};font-weight:700">✓ Loaded ${N.prod.length} line-months, ${N.rms.length} raw materials, ${N.variants.length} variants.</span>`;
  }catch(err){$("uploadMsg").innerHTML=`<span style="color:${STATUS.crit};font-weight:700">Could not read the file: ${esc(err.message)}</span>`;}
  e.target.value="";
};
function normMonth(v){
  if(v===""||v==null) return null;
  if(typeof v==="number"){const d=new Date(Math.round((v-25569)*864e5));return d.getUTCFullYear()+"-"+String(d.getUTCMonth()+1).padStart(2,"0");}
  const s=String(v).trim(); let m=s.match(/^(\d{4})[-/](\d{1,2})/); if(m) return m[1]+"-"+m[2].padStart(2,"0");
  const d=new Date("1 "+s.replace(/[-']/g," ")); if(!isNaN(d)) return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0");
  return null;
}

/* ---------- Render all ---------- */
function render(withDrawer=true){
  renderFilters(); renderLimitMode(); renderKpis(); renderLines(); renderStock();
  renderSpc(); renderParts(); renderWaste(); renderSva(); renderInsights(); renderWhatIf(); renderTable();
  if(withDrawer && $("drawer").classList.contains("open")) renderDrawer();
}
render();
window.__monthly={charts,render};
})();
