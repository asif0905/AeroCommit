// Illustrative scenario presets; not real-time weather, operational advisories, or confirmed supplier data.
import {applyScenario} from './engine.mjs';
export const WEATHER_SCENARIOS={
 mixed:{label:'Mixed conditions',detail:'Baseline airport-specific risk assumptions.'},
 clear:{label:'Clear skies',detail:'Low disruption and delivery risk across demo airports.'},
 storm:{label:'Eastern storm escalation',detail:'Higher disruption and delivery risk at ATL, MIA and JFK.'},
 thunder:{label:'Southeast thunderstorms',detail:'Thunderstorm-related disruption at ATL and MIA.'},
 hurricane:{label:'Atlantic hurricane',detail:'Severe MIA disruption with additional ATL and JFK exposure.'},
 winter:{label:'Northeast winter storm',detail:'Winter-weather disruption at JFK and ORD.'},
 fog:{label:'Coastal low visibility',detail:'Fog-related disruption at SFO, LAX and JFK.'},
 wind:{label:'Strong crosswinds',detail:'Higher operational risk and en-route assumptions across affected routes.'},
 heat:{label:'Extreme heat and smoke',detail:'Elevated disruption at Western airports, plus smoke-related delivery risk.'}
};
export const SUPPLY_SCENARIOS={
 normal:{label:'Normal supply',detail:'Original illustrative supplier volumes, prices and lanes.'},
 tight:{label:'General shortage',detail:'All supplier inventories reduced to 55% of baseline.'},
 outage:{label:'Gulf supplier outage',detail:'Gulf supplier availability reduced 85%.'},
 port:{label:'West Coast logistics delay',detail:'West-origin delivery lanes delayed and reduced in capacity.'},
 constrained:{label:'East Coast terminal bottleneck',detail:'Reduced JFK, ATL and MIA inbound capacity.'},
 premium:{label:'SAF price spike',detail:'Supplier acquisition prices increase by 35%.'},
 surge:{label:'High SAF demand',detail:'Airport and flight demand increased by 30%, subject to existing lanes.'},
 recovery:{label:'Supply recovery',detail:'Inventories increase 20% and delivery windows improve.'}
};
const clamp=x=>Math.max(0,Math.min(95,x));
export function buildDecisionScenario(weather='mixed',supply='normal',baseState){
 const s=baseState;applyScenario(s,weather==='clear'?'clear':weather==='storm'?'storm':'mixed');
 const change=(ids,risk,delivery,wind,hazard)=>s.airports.filter(a=>ids.includes(a.id)).forEach(a=>{a.risk=clamp(a.risk+risk);a.delivery=clamp(a.delivery+delivery);a.wind+=wind;a.hazard=hazard;});
 switch(weather){
 case 'thunder':change(['ATL','MIA'],20,8,15,'Severe thunderstorms');break;
 case 'hurricane':change(['MIA'],27,27,30,'Atlantic hurricane');change(['ATL','JFK'],16,12,18,'Hurricane spillover');break;
 case 'winter':change(['JFK','ORD'],31,19,25,'Winter storm');break;
 case 'fog':change(['SFO','LAX','JFK'],22,8,0,'Low visibility / fog');break;
 case 'wind':change(['ORD','JFK','SFO'],17,6,32,'Strong crosswinds');s.flights.forEach(f=>f.enroute=Math.min(95,f.enroute+8));break;
 case 'heat':change(['SFO','LAX'],25,14,7,'Extreme heat / smoke');break;
 }
 switch(supply){
 case 'tight':s.suppliers.forEach(x=>x.supply=Math.round(x.supply*.55));break;
 case 'outage':s.suppliers.filter(x=>x.id==='gulf').forEach(x=>x.supply=Math.round(x.supply*.15));break;
 case 'port':s.lanes.filter(x=>x.supplier==='west').forEach(x=>{x.lead+=16;x.capacity=Math.round(x.capacity*.5);});break;
 case 'constrained':s.lanes.filter(x=>['JFK','ATL','MIA'].includes(x.airport)).forEach(x=>x.capacity=Math.round(x.capacity*.4));break;
 case 'premium':s.suppliers.forEach(x=>x.price=Math.round(x.price*1.35));break;
 case 'surge':s.airports.forEach(x=>x.demand=Math.round(x.demand*1.3));s.flights.forEach(x=>x.target=Math.round(x.target*1.3));break;
 case 'recovery':s.suppliers.forEach(x=>x.supply=Math.round(x.supply*1.2));s.lanes.forEach(x=>x.lead=Math.max(1,x.lead-3));break;
 }
 s.scenario=weather+' / '+supply;
 return s;
}
