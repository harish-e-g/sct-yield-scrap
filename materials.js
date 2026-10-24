/* Raw material master for a rubber-to-metal bonded AVS plant (engine mounts, bushes, dampers, hydro mounts).
   Sources: Hoffmann Mineral AVM NR reference recipe; Parker Chemlok 205 TDS; Rubber Board / Kerala market prices (2024-26);
   Reliance SBR price notes; IndiaMART listings; Autocar Professional coverage of Sujan ContiTech Chakan.
   Loss ranges are industry-typical estimates unless stated. All figures are for demo use and must be confirmed with the plant. */
(function(){
"use strict";
const GROUPS = [
  {id:"POL", name:"Polymers",               color:"#2F5BA8", note:"Elastomers mixed into the rubber compound"},
  {id:"FIL", name:"Fillers & chemicals",    color:"#1F9AA6", note:"Carbon black, oil, activators, cure system, antidegradants"},
  {id:"MET", name:"Metal inserts",          color:"#C98A16", note:"Inner and outer sleeves, brackets, castings"},
  {id:"PLA", name:"Plastic housings",       color:"#8E5BB5", note:"PA66-GF hydro-mount housings and brackets"},
  {id:"BND", name:"Bonding & fluids",       color:"#5E8C31", note:"Primer + cover coat bonding agent, hydro-mount fluid"}
];
// rate = indicative INR/kg; loss = [low, high] fraction over standard; src = S (sourced) or E (estimated)
const RMS = [
  {id:"NR",  group:"POL", name:"Natural Rubber (RSS-4 / ISNR-20)",     rate:182,  loss:[0.08,0.12], src:"S", why:"mixing loss, flash, runners, sprues"},
  {id:"SBR", group:"POL", name:"SBR 1502",                              rate:132,  loss:[0.08,0.12], src:"S", why:"mixing loss, flash, runners, sprues"},
  {id:"CB",  group:"FIL", name:"Carbon Black (N550 / N774)",            rate:115,  loss:[0.085,0.125],src:"S", why:"bag and dust loss at mixing, then moulding loss"},
  {id:"OIL", group:"FIL", name:"Process Oil (naphthenic)",              rate:110,  loss:[0.08,0.12], src:"E", why:"drum residue, metering, moulding loss"},
  {id:"ZNO", group:"FIL", name:"Zinc Oxide",                            rate:285,  loss:[0.08,0.12], src:"E", why:"weighing loss, moulding loss"},
  {id:"STE", group:"FIL", name:"Stearic Acid",                          rate:130,  loss:[0.08,0.12], src:"E", why:"weighing loss, moulding loss"},
  {id:"CUR", group:"FIL", name:"Cure System (Sulphur, CBS, TMTD)",      rate:180,  loss:[0.08,0.13], src:"S", why:"weighing loss, scorch scrap"},
  {id:"AOX", group:"FIL", name:"Antidegradants (6PPD, TMQ, Wax)",       rate:260,  loss:[0.08,0.12], src:"S", why:"weighing loss, moulding loss"},
  {id:"IS",  group:"MET", name:"Inner Sleeve (steel tube)",             rate:95,   loss:[0.006,0.015],src:"E", why:"pre-treatment rejects, bonded-part rejects"},
  {id:"OS",  group:"MET", name:"Outer Sleeve / Bracket (steel, Al)",    rate:160,  loss:[0.006,0.02], src:"E", why:"swaging cracks, casting porosity, dimensional rejects"},
  {id:"PA",  group:"PLA", name:"PA66-GF30 Housing",                     rate:330,  loss:[0.015,0.03], src:"E", why:"short shots, warpage, weld-line cracks"},
  {id:"BA",  group:"BND", name:"Bonding Agent (primer + cover coat)",   rate:3200, loss:[0.40,0.55], src:"S", why:"spray overspray (30-60% transfer efficiency), pot life"},
  {id:"GL",  group:"BND", name:"Hydro Damping Fluid (glycol-water)",    rate:110,  loss:[0.03,0.07], src:"E", why:"fill overflow, leak-test rejects"}
];
// Reference compound (phr): NR/SBR blend on the Hoffmann AVM NR recipe
const RECIPE = {NR:80, SBR:20, CB:50, OIL:5, ZNO:3, STE:1, CUR:3.8, AOX:3};
const PHR_TOTAL = Object.values(RECIPE).reduce((s,x)=>s+x,0);
// spec: kg per part of compound, inner sleeve, outer sleeve/bracket, plastic, bonding agent, fluid
function buildStd(spec){
  const std={};
  Object.entries(RECIPE).forEach(([k,phr])=>{ std[k]=+(spec.compound*phr/PHR_TOTAL).toFixed(5); });
  std.IS=spec.inner||0; std.OS=spec.outer||0; std.PA=spec.plastic||0; std.BA=spec.bond||0; std.GL=spec.fluid||0;
  return std;
}
const SPECS = {
  "5220":  {name:"5220 Mass Damper",              compound:0.42, inner:0.18, outer:0.95, bond:0.0025},
  "EM310": {name:"Hydro Engine Mount EM-310",     compound:0.58, inner:0.30, outer:0.70, plastic:0.35, bond:0.0030, fluid:0.10},
  "BS140": {name:"Suspension Bush SB-140",        compound:0.16, inner:0.12, outer:0.20, bond:0.0012}
};
window.AVS = {GROUPS, RMS, RECIPE, PHR_TOTAL, SPECS, buildStd};
})();
