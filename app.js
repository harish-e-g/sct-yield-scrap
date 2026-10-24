/* Yield & Scrap Management dashboard | Prowesstics for Sujan ContiTech, Pune */
(function(){
"use strict";

const STORE_KEY = "sct-yield-scrap-v4";
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
  const rms = AVS.RMS.map(m=>({id:m.id, name:m.name, rate:m.rate, group:m.group}));
  const variants = Object.entries(AVS.SPECS).map(([id,s])=>({id, name:s.name, std:AVS.buildStd(s)}));
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
      // loss over standard by material (see materials.js); rubber ingredients share one compound loss per line-month
      const extra = {}, cmp = r(0,1);
      AVS.RMS.forEach(m=>{ const [lo,hi]=m.loss; extra[m.id] = (m.group==="POL"||m.group==="FIL")? lo+(hi-lo)*cmp : r(lo,hi); });
      if(i===8 && line==="Line 1"){ AVS.RMS.forEach(m=>{ if(m.group==="POL"||m.group==="FIL") extra[m.id]+=0.08; }); extra.BA+=0.10; }   // Jun-26 spike
      if(i>=10){ AVS.RMS.forEach(m=>{ if(m.group==="POL"||m.group==="FIL") extra[m.id]-=0.02; }); extra.BA-=0.05; }                 // recent improvement
      const actual = {};
      rms.forEach(rm=>{actual[rm.id] = Math.round(produced*(vById[vid].std[rm.id]||0)*(1+extra[rm.id])*100)/100;});
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
const ui = {mode:"month", from:null, month:S.months[S.months.length-1], line:"all", variant:"all", rm:"all", wiWaste:20, wiPrice:0, tab:"prod"};

function load(){if(window.__SEED_STATE) return window.__SEED_STATE; try{const t=localStorage.getItem(STORE_KEY);return t?JSON.parse(t):null;}catch(e){return null;}}
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
const OTHER_GROUP = {id:"OTH", name:"Other materials", color:NEUTRAL};
const groups = ()=>{ const gs=AVS.GROUPS.slice(); if(S.rms.some(r=>!AVS.GROUPS.find(g=>g.id===r.group))) gs.push(OTHER_GROUP); return gs; };
const groupOf = id=>{ const g=rmById(id)?.group; return AVS.GROUPS.find(x=>x.id===g)||OTHER_GROUP; };
const idsIn = gid=>S.rms.filter(r=>(AVS.GROUPS.find(g=>g.id===r.group)?r.group:"OTH")===gid).map(r=>r.id);
const rmColor = id=>groupOf(id).color;
// what rows / series to show: groups when all materials, materials inside a chosen group, or one material
function units(){
  if(ui.rm==="all") return groups().map(g=>({key:g.id,name:g.name,ids:idsIn(g.id),color:g.color})).filter(u=>u.ids.length);
  if(ui.rm.startsWith("g:")){ const ids=idsIn(ui.rm.slice(2)); return ids.map((id,k)=>({key:id,name:rmById(id).name,ids:[id],color:k<SERIES.length?SERIES[k]:NEUTRAL})); }
  return [{key:ui.rm,name:rmById(ui.rm)?.name||ui.rm,ids:[ui.rm],color:rmColor(ui.rm)}];
}
function uSum(a,u){ return u.ids.reduce((o,id)=>{const b=a.byRm[id]||{set:0,actual:0,waste:0,cost:0}; o.set+=b.set;o.actual+=b.actual;o.waste+=b.waste;o.cost+=b.cost;return o;},{set:0,actual:0,waste:0,cost:0}); }
const esc = s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const lines = ()=>[...new Set(S.prod.map(p=>p.line))].sort();
const rate = id=>(rmById(id)?.rate||0)*(1+ui.wiPrice/100);

/* ---------- Core calculations ---------- */
function rowsFor(month){
  return S.prod.filter(p=>(!month||p.month===month)&&(ui.line==="all"||p.line===ui.line)&&(ui.variant==="all"||p.variant===ui.variant));
}
/* ---------- Period (single month or cumulative range) ---------- */
function periodMonths(){
  if(ui.mode!=="cum") return [ui.month];
  let a=S.months.indexOf(ui.from), b=S.months.indexOf(ui.month); if(a<0)a=0; if(a>b){const t=a;a=b;b=t;}
  return S.months.slice(a,b+1);
}
const rowsPeriod = ()=>periodMonths().flatMap(m=>rowsFor(m));
function prevPeriodRows(){
  const pm=periodMonths(), n=pm.length, s=S.months.indexOf(pm[0]);
  if(s-n<0) return null;
  return S.months.slice(s-n,s).flatMap(m=>rowsFor(m));
}
function periodLabel(short){
  const pm=periodMonths();
  if(pm.length===1) return monthLabel(pm[0]);
  return `${monthLabel(pm[0])} to ${monthLabel(pm[pm.length-1])}`+(short?"":` (${pm.length} months, cumulative)`);
}
const prevWord = ()=> ui.mode==="cum"&&periodMonths().length>1 ? `vs previous ${periodMonths().length} months` : "vs last month";
function fyStart(m){ const [y,mo]=m.split("-").map(Number); const fy = mo>=4? y : y-1; const s=fy+"-04"; return S.months.find(x=>x>=s)||S.months[0]; }
function rmList(){ if(ui.rm==="all") return S.rms.map(r=>r.id); if(ui.rm.startsWith("g:")) return idsIn(ui.rm.slice(2)); return [ui.rm]; }

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
  if(!ui.from || !S.months.includes(ui.from)) ui.from = fyStart(ui.month);
  opt(fFrom, S.months.slice().reverse().map(m=>[m,monthLabel(m)]), ui.from);
  $("fMode").value = ui.mode;
  $("fFromWrap").hidden = $("fPresets").hidden = ui.mode!=="cum";
  $("fMonthLbl").textContent = ui.mode==="cum"? "To" : "Month";
  opt(fLine, [["all","All lines"],...lines().map(l=>[l,l])], ui.line);
  opt(fVariant, [["all","All variants"],...S.variants.map(v=>[v.id,v.name])], ui.variant);
  if(ui.rm!=="all" && !ui.rm.startsWith("g:") && !rmById(ui.rm)) ui.rm="all";
  fRm.innerHTML = `<option value="all"${ui.rm==="all"?" selected":""}>All raw materials (by group)</option>` +
    groups().map(g=>{const ids=idsIn(g.id); if(!ids.length) return "";
      return `<optgroup label="${esc(g.name)}"><option value="g:${g.id}"${ui.rm==="g:"+g.id?" selected":""}>All ${esc(g.name.toLowerCase())}</option>`+
        ids.map(id=>`<option value="${esc(id)}"${ui.rm===id?" selected":""}>${esc(rmById(id).name)}</option>`).join("")+`</optgroup>`;}).join("");
  const parts=[]; if(ui.line!=="all")parts.push(ui.line); if(ui.variant!=="all")parts.push(vById(ui.variant)?.name); if(ui.rm!=="all")parts.push(ui.rm.startsWith("g:")? (groups().find(g=>g.id===ui.rm.slice(2))?.name) : rmById(ui.rm)?.name);
  filterNote.textContent = (ui.mode==="cum"? "Cumulative "+periodLabel(true)+". " : "") + (parts.length? "Showing: "+parts.join(" · ") : "Whole plant, all raw materials");
}
const $ = id=>document.getElementById(id);
const fMonth=$("fMonth"), fLine=$("fLine"), fVariant=$("fVariant"), fRm=$("fRm"), filterNote=$("filterNote");
fMonth.onchange=e=>{ui.month=e.target.value; if(ui.mode==="cum"&&ui.from>ui.month) ui.from=ui.month; render();};
const fFrom=$("fFrom");
fFrom.onchange=e=>{ui.from=e.target.value; if(ui.from>ui.month) ui.month=ui.from; render();};
$("fMode").onchange=e=>{ui.mode=e.target.value; if(ui.mode==="cum") ui.from=fyStart(ui.month); render();};
$("fPresets").addEventListener("click",e=>{const b=e.target.closest("button"); if(!b) return; const p=b.dataset.p; const last=S.months[S.months.length-1];
  ui.month=last; ui.from = p==="fy"? fyStart(last) : S.months[Math.max(0,S.months.length-(+p))]; render();});
fLine.onchange=e=>{ui.line=e.target.value;render();};
fVariant.onchange=e=>{ui.variant=e.target.value;render();};
fRm.onchange=e=>{ui.rm=e.target.value;render();};

/* ---------- KPIs ---------- */
function deltaHtml(cur, prev, lowerIsBetter, fmt){
  if(!isFinite(cur)||!isFinite(prev)) return `<span class="delta flat">no prior period to compare</span>`;
  const d = cur-prev; if(Math.abs(d)<1e-9) return `<span class="delta flat">● flat ${prevWord()}</span>`;
  const good = lowerIsBetter? d<0 : d>0;
  return `<span class="delta ${good?"good":"bad"}">${d>0?"▲":"▼"} ${fmt(Math.abs(d))}</span> <span>${prevWord()}</span>`;
}
function renderKpis(){
  const pr = prevPeriodRows();
  const a = agg(rowsPeriod()), p = pr&&pr.length? agg(pr) : null;
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
  const all=S.months.map(m=>agg(rowsFor(m))), hi=new Set(periodMonths().map(m=>S.months.indexOf(m)));
  const sp=[ VIZ.spark(all.map(x=>x.yield*100),"#1F9AA6",hi), VIZ.spark(all.map(x=>x.scrap*100),"#C98A16",hi), VIZ.spark(all.map(x=>x.waste),"#2F5BA8",hi),
    VIZ.spark(all.map(x=>x.cost),"#C98A16",hi), VIZ.spark(all.map(x=>x.good),"#2F5BA8",hi), VIZ.spark(all.map(x=>x.rejRate*100),STATUS.crit,hi) ];
  $("kpis").innerHTML = tiles.map(([l,v,s,hl],k)=>`<div class="kpi${hl?" hl":""}"><div class="lbl">${l}</div><div class="val">${v}</div><div class="sub">${s}</div>${sp[k]}<div class="spark-cap">12-month trend · dots = selected period</div></div>`).join("");
}

/* ---------- Production details (line cards) ---------- */
function renderLines(){
  $("prodMonthLbl").textContent = periodLabel();
  const all = rowsPeriod();
  if(!all.length){$("lineCards").innerHTML=`<div class="empty">No production for this filter in ${periodLabel(true)}.</div>`;return;}
  const groups = [...new Set(all.map(r=>r.line))].sort().map(ln=>{const rs=all.filter(r=>r.line===ln);
    return {rs, line:ln, variants:[...new Set(rs.map(r=>r.variant))], planned:rs.reduce((s,r)=>s+r.planned,0), good:rs.reduce((s,r)=>s+r.good,0), rejected:rs.reduce((s,r)=>s+r.rejected,0)};});
  const html = groups.map(p=>{
    const a = agg(p.rs); const vname = p.variants.map(id=>vById(id)?.name||id).join(", ");
    const scrapPill = a.scrap>0.08?"crit":a.scrap>0.05?"warn":"good";
    const us = units().map(u=>({u, b:uSum(a,u)})).filter(x=>x.b.actual>0);
    const maxAct = Math.max(...us.map(x=>x.b.actual),1);
    const tr = us.map(({u,b})=>{
      const wpp = p.good? b.waste/p.good : 0;
      const sp = b.actual? b.waste/b.actual:0;
      return `<tr>
        <td><span class="rm-name"><span class="sw" style="background:${u.color}"></span>${esc(u.name)}</span></td>
        <td>${nf0.format(b.set)}</td>
        <td>${nf0.format(b.actual)}</td>
        <td class="hide-sm"><div class="bar" title="Actual vs set"><i style="width:${(b.actual/maxAct*100).toFixed(0)}%;background:${u.color}"></i></div></td>
        <td><b>${nf0.format(b.waste)}</b> <span class="muted">(${(sp*100).toFixed(1)}%)</span></td>
        <td class="hide-sm">${(wpp*1000).toFixed(1)} g</td>
      </tr>`;}).join("");
    return `<div class="line-card">
      <div class="lc-head"><div><span class="ln">${esc(p.line)}</span> &nbsp;<span class="pn">${esc(vname)}</span></div>
        <span class="pill ${scrapPill}">${scrapPill==="good"?"✓":"!"} Scrap ${pct(a.scrap)}</span></div>
      <div class="lc-stats">
        <div><div class="k">Planned</div><div class="v">${nf0.format(p.planned)}</div></div>
        <div><div class="k">Good parts</div><div class="v">${nf0.format(p.good)}</div></div>
        <div><div class="k">Rejected</div><div class="v">${nf0.format(p.rejected)}</div></div>
        <div><div class="k">Yield</div><div class="v">${pct(a.yield)}</div></div>
      </div>
      <div class="table-wrap"><table class="rm-table">
        <thead><tr><th>${ui.rm==="all"?"Material group":"Raw material"}</th><th>Set kg</th><th>Actual kg</th><th class="hide-sm"></th><th>Wastage kg</th><th class="hide-sm">Waste / part</th></tr></thead>
        <tbody>${tr}</tbody>
      </table></div>
    </div>`;}).join("");
  $("lineCards").innerHTML = html;
}

/* ---------- Stock ---------- */
function renderStock(){
  const pm = periodMonths(), ch = stockChain();
  $("stockMonthLbl").textContent = pm.length>1? `${monthLabel(pm[0])} opening to ${monthLabel(pm[pm.length-1])} closing` : "Closing, "+monthLabel(ui.month);
  const sel = new Set(rmList());
  const rowsHtml = groups().map(g=>{ const ids=idsIn(g.id); if(!ids.length) return "";
    return `<tr class="grp-row${ids.some(id=>sel.has(id))?"":" dim"}"><td colspan="6"><span class="sw" style="background:${g.color}"></span> ${esc(g.name)}</td></tr>` + ids.map(id=>rmById(id)).map(rm=>{
    const f=ch[pm[0]][rm.id], l=ch[pm[pm.length-1]][rm.id];
    const s = {opening:f.opening, inward:pm.reduce((t,m)=>t+ch[m][rm.id].inward,0), consumed:pm.reduce((t,m)=>t+ch[m][rm.id].consumed,0), closing:l.closing, cover:l.cover};
    const dim = !sel.has(rm.id);
    const cv = s.cover; const idle = !s.consumed;
    const lvl = idle?"idle":!isFinite(cv)?"warn":cv<7?"crit":cv<15?"warn":"good";
    const txt = idle?"Not used":!isFinite(cv)?"-":cv<0?"Shortage":Math.round(cv)+" days";
    return `<tr class="${dim?"dim":""}">
      <td><span class="rm-name sub">${esc(rm.name)}</span></td>
      <td class="hide-sm">${nf0.format(s.opening)}</td><td class="hide-sm">${nf0.format(s.inward)}</td><td>${nf0.format(s.consumed)}</td>
      <td class="big">${kg(s.closing)}</td>
      <td><span class="pill ${lvl}">${lvl==="good"?"✓ ":lvl==="idle"?"":"! "}${txt}</span></td></tr>`;
  }).join(""); }).join("");
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
  const inR = new Set(periodMonths().map(m=>S.months.indexOf(m)));
  const out = s.vals.map(v=>v!==null&&(v>s.usl||v<s.lsl));
  $("inUsl").value = s.usl.toFixed(1); $("inLsl").value = s.lsl.toFixed(1);
  upsert("chSpc",{type:"line",data:{labels,datasets:[
    {label:"Scrap %",data:s.vals,borderColor:"#2F5BA8",borderWidth:2,tension:0.25,fill:"origin",backgroundColor:VIZ.fill("#2F5BA8"),
      pointRadius:s.vals.map((v,i)=>out[i]?6:inR.has(i)?5:3),
      pointBackgroundColor:s.vals.map((v,i)=>out[i]?STATUS.crit:inR.has(i)?"#2F5BA8":"#B8C2D3"),
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

const cumOn = ()=> ui.mode==="cum" && periodMonths().length>1;
function runSum(arr){let s=0;return arr.map(v=>s+=v);}
function fade(hex,on){return on?hex:hex+"55";}
function renderParts(){
  const cum=cumOn(), ms = cum? periodMonths() : S.months, labels = ms.map(monthLabel);
  $("partsTitle").textContent = cum? "Produced parts, cumulative" : "Produced parts vs month";
  const ls = ui.line==="all"? lines() : [ui.line];
  upsert("chParts",{type:"bar",data:{labels,datasets:ls.map(l=>{ const raw=ms.map(m=>S.prod.filter(p=>p.month===m&&p.line===l&&(ui.variant==="all"||p.variant===ui.variant)).reduce((s,p)=>s+p.good,0));
    const c=LINE_COLORS[l]||SERIES[3];
    return {label:l,data:cum?runSum(raw):raw,
    backgroundColor:cum?c:ms.map(m=>fade(c,m===ui.month)),borderRadius:4,borderSkipped:"start",borderColor:"#fff",borderWidth:{left:1,right:1},maxBarThickness:cum?28:18};})},
    options:{maintainAspectRatio:false,plugins:{legend:{position:"bottom"},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${nf0.format(c.parsed.y)} parts`}}},
      scales:{y:{grid:GRID,ticks:{callback:v=>v>=1e5?(v/1e5)+" L":nf0.format(v)}},x:{grid:NOGRID}}}});
}

function renderWaste(){
  const cum=cumOn(), ms = cum? periodMonths() : S.months, labels = ms.map(monthLabel);
  $("wasteTitle").textContent = cum? "Wastage kg by raw material, cumulative" : "Wastage kg by raw material";
  const aggs = ms.map(m=>agg(rowsFor(m)));
  upsert("chWaste",{type:"bar",data:{labels,datasets:units().map(u=>{const raw=aggs.map(g=>uSum(g,u).waste); return {
    label:u.name,data:cum?runSum(raw):raw,
    backgroundColor:cum?u.color:ms.map(m=>fade(u.color,m===ui.month)),borderColor:"#fff",borderWidth:{top:2},borderRadius:3,borderSkipped:false,maxBarThickness:cum?32:22};})},
    options:{maintainAspectRatio:false,plugins:{legend:{position:"bottom"},tooltip:{mode:"index",intersect:false,callbacks:{label:c=>`${c.dataset.label}: ${nf0.format(c.parsed.y)} kg`}}},
      scales:{x:{stacked:true,grid:NOGRID},y:{stacked:true,grid:GRID,ticks:{callback:v=>nf0.format(v)}}}}});
}

function renderSva(){
  $("svaLbl").textContent = periodLabel(true);
  const a = agg(rowsPeriod()); const us = units().map(u=>({u,b:uSum(a,u)})).filter(x=>x.b.actual>0);
  upsert("chSva",{type:"bar",data:{labels:us.map(x=>x.u.name),datasets:[
    {label:"Set (standard)",data:us.map(x=>x.b.set),backgroundColor:"#B8C2D3",borderRadius:4,borderSkipped:"start",maxBarThickness:16},
    {label:"Actual",data:us.map(x=>x.b.actual),backgroundColor:us.map(x=>x.u.color),borderRadius:4,borderSkipped:"start",maxBarThickness:16}
  ]},options:{indexAxis:"y",maintainAspectRatio:false,
    plugins:{legend:{position:"bottom",labels:{generateLabels:ch=>[{text:"Set (standard)",fillStyle:"#B8C2D3",strokeStyle:"#B8C2D3",borderRadius:3},{text:"Actual (RM colour)",fillStyle:"#2F5BA8",strokeStyle:"#2F5BA8",borderRadius:3}]}},
      tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${nf0.format(c.parsed.x)} kg`,afterBody:it=>{const b=us[it[0].dataIndex].b;return `Wastage: ${nf0.format(b.waste)} kg (${pct(b.waste/b.actual)})`;}}}},
    scales:{x:{grid:GRID,ticks:{maxTicksLimit:5,maxRotation:0,callback:v=>v>=1e5?(v/1e5).toFixed(0)+" L":nf0.format(v)}},y:{grid:NOGRID}}}});
}

/* ---------- Material flow, cost share, heatmap ---------- */
function renderFlow(){
  const rows=rowsPeriod(), ids=rmList(), a=agg(rows);
  const rejBy={}; ids.forEach(id=>rejBy[id]=0);
  rows.forEach(p=>{const v=vById(p.variant); ids.forEach(id=>{ rejBy[id] += p.rejected*((v&&v.std[id])||0); });});
  const rej=Object.values(rejBy).reduce((s,x)=>s+x,0), issued=a.actual, good=a.set, proc=Math.max(0,issued-good-rej);
  const LBL={POL:"Rubber: flash, runners, mixing",FIL:"Compound chemicals: flash, runners",MET:"Metal: pre-treatment, swaging rejects",PLA:"Plastic housings: moulding rejects",BND:"Bonding agent: spray overspray",OTH:"Other process loss"};
  const byG={}; ids.forEach(id=>{ const g=groupOf(id).id, b=a.byRm[id]; const pl=Math.max(0,b.waste-rejBy[id]); byG[g]=byG[g]||{kg:0,inr:0}; byG[g].kg+=pl; byG[g].inr+=pl*rate(id); });
  let rejInr=0; ids.forEach(id=>rejInr+=rejBy[id]*rate(id));
  const items=[["Locked in NG parts (all materials)",rej,rejInr]].concat(Object.entries(byG).map(([g,v])=>[LBL[g]||g,v.kg,v.inr])).filter(x=>x[1]>0.5).sort((x,y)=>y[1]-x[1]);
  $("wfLbl").textContent = periodLabel(true);
  upsert("chFlow",{type:"bar",data:{labels:items.map(x=>x[0]),datasets:[{label:"Wasted kg",data:items.map(x=>x[1]),backgroundColor:items.map(x=>x[0].startsWith("Locked")?STATUS.crit:"#2F5BA8"),borderRadius:4,borderSkipped:"start",maxBarThickness:18}]},
    options:{indexAxis:"y",maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${nf0.format(c.raw)} kg · ${inr(items[c.dataIndex][2])}`}}},
      scales:{x:{grid:GRID,ticks:{maxTicksLimit:5,maxRotation:0,callback:v=>v>=1e5?(v/1e5).toFixed(1)+" L":nf0.format(v)}},y:{grid:NOGRID,ticks:{font:{size:11}}}}}});
  $("wfFoot").innerHTML = `Of every 100 kg issued: <b>${(good/issued*100).toFixed(1)} kg</b> ends up in good parts, <b style="color:${STATUS.crit}">${(rej/issued*100).toFixed(1)} kg</b> is locked in NG parts and <b style="color:#2F5BA8">${(proc/issued*100).toFixed(1)} kg</b> is lost in process. By cost, NG parts account for <b>${inr(rejInr)}</b>.`;
}
function renderDonut(){
  const a=agg(rowsPeriod()), us=units().map(u=>({u,c:Math.max(0,uSum(a,u).cost)})).filter(x=>x.c>0).sort((x,y)=>y.c-x.c);
  const tot=us.reduce((s,x)=>s+x.c,0);
  $("dnLbl").textContent = periodLabel(true);
  upsert("chDonut",{type:"doughnut",data:{labels:us.map(x=>x.u.name),datasets:[{data:us.map(x=>x.c),backgroundColor:us.map(x=>x.u.color),borderColor:"#fff",borderWidth:2,hoverOffset:6}]},
    options:{maintainAspectRatio:false,cutout:"68%",layout:{padding:{bottom:4}},plugins:{legend:{position:"bottom",labels:{boxWidth:10,font:{size:11}}},
      tooltip:{callbacks:{label:c=>`${c.label}: ${inr(c.raw)} (${(c.raw/tot*100).toFixed(1)}%)`}}}}});
  $("dnCenter").innerHTML = `<b>${inr(tot)}</b><span>Scrap cost</span>`;
}
function renderHeat(){
  const ls=lines(), pm=new Set(periodMonths());
  const val=(m,l)=>{const g=agg(rowsFor(m).filter(p=>!l||p.line===l)); return isFinite(g.scrap)?g.scrap*100:null;};
  const grid=ls.map(l=>S.months.map(m=>val(m,l))).concat([S.months.map(m=>val(m,null))]);
  const all=grid.flat().filter(v=>v!=null), mn=Math.min(...all), mx=Math.max(...all);
  const ramp=["#FDF2EF","#F8D5C9","#F2B9A8","#E68F74","#D9674B","#BE4630","#A3301E"];
  const cell=v=>{ if(v==null) return `<td style="background:#F3F5F9">-</td>`; const t=(v-mn)/((mx-mn)||1), k=Math.min(ramp.length-1,Math.floor(t*ramp.length)); return {bg:ramp[k],fg:k>=4?"#fff":"#0E1B33"}; };
  const head=`<tr><th></th>${S.months.map(m=>`<th>${monthLabel(m).replace("-","<br>")}</th>`).join("")}</tr>`;
  const body=grid.map((row,r)=>`<tr><th class="rowh">${r<ls.length?ls[r]:"Plant"}</th>${row.map((v,c)=>{const s=cell(v); if(typeof s==="string") return s;
    return `<td class="${pm.has(S.months[c])?"sel":""}" style="background:${s.bg};color:${s.fg}" title="${r<ls.length?ls[r]:"Plant"}, ${monthLabel(S.months[c])}: ${v.toFixed(2)}% scrap">${v.toFixed(1)}</td>`;}).join("")}</tr>`).join("");
  $("heatmap").innerHTML = `<table class="heat" aria-label="Scrap percent by month and line">${head}${body}</table>
    <div class="heat-legend"><span>${mn.toFixed(1)}%</span><i></i><span>${mx.toFixed(1)}%</span><span>· outlined = selected period</span></div>`;
}

/* ---------- AI insights ---------- */
function linreg(ys){const n=ys.length;const xs=ys.map((_,i)=>i);const mx=(n-1)/2;const my=ys.reduce((s,y)=>s+y,0)/n;
  let num=0,den=0;xs.forEach((x,i)=>{num+=(x-mx)*(ys[i]-my);den+=(x-mx)**2;});const b=den?num/den:0;return {b,a:my-b*mx,n};}
function renderInsights(){
  const items=[]; const rows=rowsPeriod(); const s=spcSeries(); const PW = periodMonths().length>1? "this period" : "this month";
  // 1 top driver
  let top=null;
  [...new Set(rows.map(r=>r.line))].forEach(ln=>{const rs=rows.filter(r=>r.line===ln);const a=agg(rs);const vs=[...new Set(rs.map(r=>r.variant))];rmList().forEach(id=>{const b=a.byRm[id];if(!top||b.cost>top.cost)top={line:ln,variant:vs.map(v=>vById(v)?.name||v).join(", "),id,cost:b.cost,waste:b.waste,share:b.waste/b.actual};});});
  const tot = agg(rows).cost;
  if(top&&tot>0) items.push(["warn","!",`Top scrap driver: ${top.line}, ${rmById(top.id).name}`,`${kg(top.waste)} wasted (${pct(top.share)} of issue) on ${top.variant}, costing ${inr(top.cost)}. That is ${pct(top.cost/tot,0)} of ${PW}'s scrap cost.`]);
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
  rows.forEach(p=>{const rr=p.rejected/(p.good+p.rejected); if(rr>0.03) items.push(["warn","!",`High rejection on ${p.line}, ${monthLabel(p.month)}`,`${pct(rr,2)} of ${vById(p.variant)?.name||p.variant} parts rejected (${nf0.format(p.rejected)} pcs). Every rejected part carries its full RM weight as scrap.`]);});
  // 5b metal recovery from NG parts
  const nRej = rows.reduce((s,p)=>s+p.rejected,0);
  const metalIds = idsIn("MET");
  if(nRej>0 && metalIds.length){ let mkg=0,minr=0; rows.forEach(p=>{const v=vById(p.variant); metalIds.forEach(id=>{const k=p.rejected*((v&&v.std[id])||0); mkg+=k; minr+=k*rate(id);});});
    items.push(["info","↺","Metal recoverable from NG parts",`${kg(mkg)} of sleeves and brackets sit inside ${nf0.format(nRej)} rejected parts. De-bonding and reusing them, instead of selling as scrap, is worth up to ${inr(minr)} ${PW}.`]); }
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
  const n = periodMonths().length;
  $("wiLbl").textContent = periodLabel(true)+" basis";
  const a = agg(rowsPeriod()); const f = ui.wiWaste/100;
  const savedKg = a.waste*f, savedInr = a.cost*f;
  const newYield = a.actual? a.set/(a.actual-savedKg):NaN;
  const yr = savedInr*12/n;
  const per = n>1? `in ${n} months` : "/ month";
  $("wiResults").innerHTML = `
    <div><div class="k">RM saved ${per}</div><div class="v">${kg(savedKg)}</div></div>
    <div><div class="k">Cost saved ${per}</div><div class="v">${inr(savedInr)}</div></div>
    <div><div class="k">New material yield</div><div class="v">${pct(newYield)}</div></div>
    <div class="hl"><div class="k">Annualised saving</div><div class="v">${inr(yr)}</div></div>`;
}
$("wiWaste").oninput=e=>{ui.wiWaste=+e.target.value;renderWhatIf();};
$("wiPrice").oninput=e=>{ui.wiPrice=+e.target.value;render();};

/* ---------- Data table ---------- */
function renderTable(){
  if($("dataTable").hidden) return;
  const head = `<tr><th>Month</th><th>Line</th><th>Variant</th><th>Raw material</th><th>Good parts</th><th>Rejected</th><th>Set kg</th><th>Actual kg</th><th>Wastage kg</th><th>Scrap %</th><th>Scrap cost</th></tr>`;
  const body = periodMonths().slice().reverse().flatMap(m=>rowsFor(m).flatMap(p=>{const a=agg([p]);return rmList().map(id=>{const b=a.byRm[id];
    return `<tr><td>${monthLabel(m)}</td><td>${esc(p.line)}</td><td>${esc(vById(p.variant)?.name||p.variant)}</td><td>${esc(rmById(id).name)}</td><td>${nf0.format(p.good)}</td><td>${nf0.format(p.rejected)}</td><td>${nf1.format(b.set)}</td><td>${nf1.format(b.actual)}</td><td>${nf1.format(b.waste)}</td><td>${pct(b.waste/b.actual,2)}</td><td>${inr(b.cost)}</td></tr>`;});})).join("");
  $("dataTable").innerHTML = `<table class="data-table"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}
$("btnTable").onclick=e=>{const t=$("dataTable");t.hidden=!t.hidden;e.target.textContent=t.hidden?"Show table":"Hide table";e.target.setAttribute("aria-expanded",String(!t.hidden));renderTable();};

/* ---------- Raw material master ---------- */
function renderMaster(){
  const rec=AVS.RECIPE, tot=AVS.PHR_TOTAL;
  const rows = groups().map(g=>{ const ids=idsIn(g.id); if(!ids.length) return "";
    return `<tr class="grp-row"><td colspan="6"><span class="sw" style="background:${g.color}"></span> ${esc(g.name)} <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:500">${esc(g.note||"")}</span></td></tr>`+
      ids.map(id=>{const rm=rmById(id), m=AVS.RMS.find(x=>x.id===id);
        const share = rec[id]!=null? `${rec[id]} phr (${(rec[id]/tot*100).toFixed(1)}% of compound)` : "";
        return `<tr><td><span class="rm-name sub">${esc(rm.name)}</span></td><td>${share||"-"}</td><td>₹${nf0.format(rm.rate)}</td>
          <td>${m?`${(m.loss[0]*100).toFixed(m.loss[0]<0.1?1:0)} to ${(m.loss[1]*100).toFixed(m.loss[1]<0.1?1:0)}%`:"-"}</td><td class="left">${esc(m?m.why:"")}</td>
          <td><span class="pill ${m&&m.src==="S"?"good":"warn"}">${m&&m.src==="S"?"Sourced":"Estimated"}</span></td></tr>`;}).join(""); }).join("");
  $("rmMaster").innerHTML = `<table class="stock-table master"><thead><tr><th>Material</th><th>Recipe share</th><th>₹ / kg</th><th>Typical loss</th><th class="left">Where it is lost</th><th>Basis</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="chart-foot">Compound recipe follows a standard NR anti-vibration mount formulation (80/20 NR/SBR). Whether Sujan Continental mixes compound in-house or buys it in is not public; if bought in, the polymer and chemical rows combine into one compound line. Prices are indicative Indian market levels for 2024-26. Metal inserts, plastic housings and bonding agent are tracked in kg here; plants often track inserts in pieces.</p>`;
}

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
  const rtRows=S.rms.map(rm=>({"Raw Material":rm.name,"Group":groupOf(rm.id).name,"Rate per kg (INR)":rm.rate}));
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
    const rmId=name=>{let r=N.rms.find(x=>x.name===String(name).trim());if(!r){const old=S.rms.find(x=>x.name===String(name).trim());r={id:old?old.id:slug(name),name:String(name).trim(),rate:old?old.rate:0,group:old?old.group:"OTH"};N.rms.push(r);}return r.id;};
    const vId=name=>{let v=N.variants.find(x=>x.name===String(name).trim());if(!v){const old=S.variants.find(x=>x.name===String(name).trim());v={id:old?old.id:slug(name),name:String(name).trim(),std:old?{...old.std}:{}};N.variants.push(v);}return v.id;};
    const key={};
    P.forEach(r=>{
      const m=normMonth(r["Month"]); if(!m) return;
      const k=m+"|"+r["Line"];
      if(!key[k]){key[k]={month:m,line:String(r["Line"]).trim(),variant:vId(r["Variant"]),planned:+r["Planned Parts"]||0,good:+r["Good Parts"]||0,rejected:+r["Rejected Parts"]||0,actual:{}};N.prod.push(key[k]);}
      key[k].actual[rmId(r["Raw Material"])]=+r["Actual kg"]||0;
    });
    (sh("Part Weights")||[]).forEach(r=>{const v=N.variants.find(x=>x.id===vId(r["Variant"]));v.std[rmId(r["Raw Material"])]=+r["Kg per Part"]||0;});
    (sh("Rates")||[]).forEach(r=>{const id=rmId(r["Raw Material"]);const x=N.rms.find(z=>z.id===id);x.rate=+r["Rate per kg (INR)"]||0;
      const g=AVS.GROUPS.find(gg=>gg.name.toLowerCase()===String(r["Group"]||"").trim().toLowerCase()); if(g) x.group=g.id;});
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
  renderSpc(); renderParts(); renderWaste(); renderSva(); renderFlow(); renderDonut(); renderHeat(); renderInsights(); renderWhatIf(); renderTable(); renderMaster();
  if(withDrawer && $("drawer").classList.contains("open")) renderDrawer();
}
render();
function exportData(){
  const r1=x=>Math.round(x*10)/10, rows=rowsPeriod(), a=agg(rows), pm=periodMonths();
  const filt=[ui.line==="all"?"All lines":ui.line, ui.variant==="all"?"All variants":(vById(ui.variant)?.name||ui.variant), ui.rm==="all"?"All raw materials":(rmById(ui.rm)?.name||ui.rm)].join(" | ");
  const summary=[
    ["Report","Yield & Scrap Management, Monthly analysis"],["Prepared for","Sujan Continental, Pune"],["Prepared by","Prowesstics IT Services Pvt. Ltd."],
    ["Period",periodLabel()],["Filters",filt],["Generated",new Date().toLocaleString("en-IN")],
    ["CAUTION","DEMO DASHBOARD. All figures are simulated for illustration only and do not represent actual plant data."],[],
    ["Metric","Value"],["Material yield %",r1(a.yield*100)],["Scrap %",r1(a.scrap*100)],["Wastage kg",Math.round(a.waste)],["Scrap cost INR",Math.round(a.cost)],
    ["Planned parts",a.planned],["Good parts",a.good],["Rejected parts",a.rejected],["Rejection rate %",Math.round(a.rejRate*10000)/100],["Plan attainment %",r1(a.attain*100)]];
  const lines=[["Line","Variants","Group","Raw material","Set kg","Actual kg","Wastage kg","Scrap %","Scrap cost INR"]];
  [...new Set(rows.map(r=>r.line))].sort().forEach(ln=>{const rs=rows.filter(r=>r.line===ln), g=agg(rs), vs=[...new Set(rs.map(r=>vById(r.variant)?.name||r.variant))].join(", ");
    rmList().forEach(id=>{const b=g.byRm[id]; lines.push([ln,vs,groupOf(id).name,rmById(id).name,r1(b.set),r1(b.actual),r1(b.waste),b.actual?r1(b.waste/b.actual*100):0,Math.round(b.cost)]);});});
  const ch=stockChain(), stock=[["Group","Raw material","Opening kg","Inward kg","Consumed kg","Closing kg","Cover days","Rate INR/kg"]];
  S.rms.forEach(rm=>{const f=ch[pm[0]][rm.id], l=ch[pm[pm.length-1]][rm.id];
    stock.push([groupOf(rm.id).name,rm.name,Math.round(f.opening),Math.round(pm.reduce((t,m)=>t+ch[m][rm.id].inward,0)),Math.round(pm.reduce((t,m)=>t+ch[m][rm.id].consumed,0)),Math.round(l.closing),isFinite(l.cover)?Math.round(l.cover):"",rm.rate]);});
  const s=spcSeries(), trend=[["Month","In period","Good parts","Rejected","Set kg","Actual kg","Wastage kg","Scrap %","Scrap cost INR","USL %","Average %","LSL %"]];
  S.months.forEach(m=>{const g=agg(rowsFor(m)); trend.push([monthLabel(m),pm.includes(m)?"Yes":"",g.good,g.rejected,Math.round(g.set),Math.round(g.actual),Math.round(g.waste),isFinite(g.scrap)?Math.round(g.scrap*10000)/100:"",Math.round(g.cost),r1(s.usl),r1(s.mean),r1(s.lsl)]);});
  const data=[["Month","Line","Variant","Raw material","Planned","Good parts","Rejected","Set kg","Actual kg","Wastage kg","Scrap %","Scrap cost INR"]];
  pm.forEach(m=>rowsFor(m).forEach(p=>{const g=agg([p]); rmList().forEach(id=>{const b=g.byRm[id]; data.push([monthLabel(m),p.line,vById(p.variant)?.name||p.variant,rmById(id).name,p.planned,p.good,p.rejected,r1(b.set),r1(b.actual),r1(b.waste),b.actual?Math.round(b.waste/b.actual*10000)/100:0,Math.round(b.cost)]);});}));
  return {title:"Monthly analysis", period:periodLabel(), sheets:[["Summary",summary],["Lines",lines],["RM Stock",stock],["Monthly Trend",trend],["Detail Data",data]]};
}
window.__monthly={charts,render,exportData,getState:()=>S};
})();
