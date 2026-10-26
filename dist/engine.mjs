import {maximize} from './lp.mjs';

export function demoState() {
  return {
    date: '2026-10-23', scenario:'mixed', budget:900000, flex:30, tolerance:30, decision:21, review:30, baseline:89, lhv:43,
    suppliers:[
      {id:'west',name:'Pacific Renewables',location:'West coast hub',supply:170,price:2350,ci:24,x:95,y:125},
      {id:'gulf',name:'Gulf Biofuels',location:'Gulf coast hub',supply:150,price:2100,ci:32,x:430,y:335},
      {id:'east',name:'Atlantic Fuels',location:'East coast hub',supply:130,price:2550,ci:18,x:735,y:165}
    ],
    airports:[
      {id:'SFO',name:'San Francisco',hazard:'Smoke advisory',risk:18,delivery:8,wind:18,demand:80,need:42,x:125,y:185},
      {id:'LAX',name:'Los Angeles',hazard:'Stable conditions',risk:9,delivery:4,wind:12,demand:65,need:42,x:170,y:270},
      {id:'ORD',name:'Chicago',hazard:'Strong headwinds',risk:24,delivery:7,wind:38,demand:75,need:42,x:500,y:145},
      {id:'ATL',name:'Atlanta',hazard:'Thunderstorms',risk:42,delivery:12,wind:32,demand:90,need:42,x:585,y:255},
      {id:'MIA',name:'Miami',hazard:'Hurricane disruption',risk:65,delivery:20,wind:58,demand:60,need:42,x:630,y:350},
      {id:'JFK',name:'New York',hazard:'Crosswinds',risk:12,delivery:6,wind:24,demand:70,need:42,x:710,y:110}
    ],
    flights:[
      {id:'R101',airline:'Meridian Air (demo)',origin:'SFO',destination:'JFK',target:45,enroute:2,depart:44,duration:6},
      {id:'R102',airline:'Meridian Air (demo)',origin:'SFO',destination:'MIA',target:35,enroute:12,depart:44,duration:6},
      {id:'R103',airline:'Pacific Air (demo)',origin:'LAX',destination:'JFK',target:40,enroute:3,depart:44,duration:6},
      {id:'R104',airline:'Pacific Air (demo)',origin:'LAX',destination:'ATL',target:25,enroute:8,depart:44,duration:5},
      {id:'R105',airline:'Northern Air (demo)',origin:'ORD',destination:'LAX',target:75,enroute:4,depart:44,duration:4},
      {id:'R106',airline:'Meridian Air (demo)',origin:'ATL',destination:'JFK',target:90,enroute:6,depart:44,duration:3},
      {id:'R107',airline:'Coastal Air (demo)',origin:'MIA',destination:'ORD',target:60,enroute:10,depart:44,duration:3},
      {id:'R108',airline:'Northern Air (demo)',origin:'JFK',destination:'LAX',target:70,enroute:3,depart:44,duration:6}
    ],
    lanes:[
      {supplier:'west',airport:'SFO',lead:8,freight:80,capacity:90},
      {supplier:'west',airport:'LAX',lead:10,freight:100,capacity:75},
      {supplier:'west',airport:'ORD',lead:22,freight:230,capacity:50},
      {supplier:'gulf',airport:'ORD',lead:16,freight:150,capacity:80},
      {supplier:'gulf',airport:'ATL',lead:12,freight:100,capacity:100},
      {supplier:'gulf',airport:'MIA',lead:14,freight:130,capacity:70},
      {supplier:'east',airport:'JFK',lead:6,freight:60,capacity:80},
      {supplier:'east',airport:'ATL',lead:14,freight:170,capacity:65},
      {supplier:'east',airport:'MIA',lead:22,freight:230,capacity:50}
    ]
  };
}

export function applyScenario(state, scenario) {
  const base=demoState(); state.scenario=scenario;
  state.airports.forEach((a,i)=>{Object.assign(a,{risk:base.airports[i].risk,delivery:base.airports[i].delivery,wind:base.airports[i].wind,hazard:base.airports[i].hazard})});
  state.suppliers.forEach((s,i)=>s.supply=base.suppliers[i].supply);
  if(scenario==='clear')state.airports.forEach(a=>Object.assign(a,{risk:6,delivery:3,wind:10,hazard:'Stable conditions'}));
  if(scenario==='storm')state.airports.forEach(a=>{if(['ATL','MIA','JFK'].includes(a.id)){a.risk=Math.min(90,a.risk+25);a.delivery+=10;a.wind+=18;a.hazard='Storm escalation'}});
  if(scenario==='tight'){state.suppliers.forEach(s=>s.supply=Math.round(s.supply*.55));}
  return state;
}

// Divisible-tonnage, two-stage recommendation. The default solver is an exact linear program:
// stage 1 maximizes expected firm tCO2e under every shared constraint; stage 2 maximizes expected
// conditional-hold tCO2e from what remains. method:'greedy' keeps the original ranking heuristic.
// Holds reserve planning capacity and full purchase budget, not actual supplier options.
export function planGreedy(s){return plan(s,{method:'greedy'});}
export function plan(s,{method='lp'}={}) {
  const supply=Object.fromEntries(s.suppliers.map(v=>[v.id,v.supply]));
  const demand=Object.fromEntries(s.airports.map(v=>[v.id,v.demand]));
  const totalSupply=Object.values(supply).reduce((a,b)=>a+b,0);
  const empty=()=>({firm:0,hold:0,benefit:0,expected:0,cost:0,holdCost:0,allocations:[]});
  const rows=s.airports.map(a=>({...a,...empty()}));
  const byId=Object.fromEntries(rows.map(a=>[a.id,a]));
  const flightRows=s.flights.map(f=>{
    const origin=byId[f.origin],destination=byId[f.destination];
    const operationProbability=(1-origin.risk/100)*(1-destination.risk/100)*(1-f.enroute/100);
    return {...f,...empty(),originRisk:origin.risk,destinationRisk:destination.risk,routeRisk:100*(1-operationProbability),deliveryRisk:origin.delivery,probability:operationProbability*(1-origin.delivery/100),originHazard:origin.hazard,destinationHazard:destination.hazard,remaining:f.target};
  });
  let budget=s.budget,firmLimit=totalSupply*(1-s.flex/100),firmTotal=0;
  const lanes=s.lanes.map((l,i)=>{
    const a=byId[l.airport],v=s.suppliers.find(v=>v.id===l.supplier);
    const saving=(s.baseline-v.ci)*s.lhv/1000;
    return {...l,index:i,remaining:l.capacity,deadline:a.need-l.lead,saving,price:v.price+l.freight,firm:0,hold:0};
  });
  const candidates=flightRows.flatMap(f=>lanes.filter(l=>l.airport===f.origin).map(l=>({f,l,deadline:Math.min(byId[f.origin].need,f.depart-2)-l.lead,score:l.saving*f.probability/l.price})));
  candidates.sort((a,b)=>b.score-a.score||a.l.index-b.l.index||a.f.id.localeCompare(b.f.id));
  function allocate(c,kind,limit=Infinity){
    const {f,l,deadline}=c;
    const q=Math.max(0,Math.min(supply[l.supplier],demand[f.origin],f.remaining,l.remaining,budget/l.price,limit));
    if(q<1e-8)return;
    supply[l.supplier]-=q;demand[f.origin]-=q;f.remaining-=q;l.remaining-=q;budget-=q*l.price;l[kind]+=q;
    const allocation={supplier:l.supplier,flight:f.id,origin:f.origin,destination:f.destination,kind,quantity:q,price:l.price,deadline,saving:l.saving,probability:f.probability};
    for(const row of [byId[f.origin],f]){row[kind]+=q;row.allocations.push(allocation);if(kind==='firm'){row.cost+=q*l.price;row.benefit+=q*l.saving;row.expected+=q*l.saving*f.probability;}else row.holdCost+=q*l.price;}
    if(kind==='firm')firmTotal+=q;
  }
  const firmEligible=c=>c.deadline>=s.decision&&c.f.routeRisk<=s.tolerance&&c.l.saving>0;
  const holdEligible=c=>c.deadline>=Math.max(s.review,s.decision)&&c.l.saving>0&&c.f.probability>0;
  // Solve one stage exactly against the resources still available, then book it in rank order.
  function solveStage(kind,eligible,cap){
    const vars=candidates.filter(eligible);
    if(!vars.length||budget<=0)return;
    const A=[],b=[],group=(key,limit)=>{const keys=[...new Set(vars.map(key))];for(const k of keys){A.push(vars.map(c=>key(c)===k?1:0));b.push(Math.max(0,limit(k)));}};
    group(c=>c.l.supplier,k=>supply[k]);
    group(c=>c.f.origin,k=>demand[k]);
    group(c=>c.f.id,k=>vars.find(c=>c.f.id===k).f.remaining);
    group(c=>c.l.index,k=>lanes[k].remaining);
    A.push(vars.map(c=>c.l.price));b.push(Math.max(0,budget));
    if(Number.isFinite(cap)){A.push(vars.map(()=>1));b.push(Math.max(0,cap));}
    // Expected lifecycle tCO2e; a negligible price term breaks ties toward cheaper supply.
    const {x}=maximize(vars.map(c=>c.l.saving*c.f.probability-1e-9*c.l.price),A,b);
    vars.forEach((c,j)=>{if(x[j]>1e-9)allocate(c,kind,x[j]);});
  }
  if(method==='greedy'){
    for(const c of candidates)if(firmEligible(c))allocate(c,'firm',firmLimit-firmTotal);
    for(const c of candidates)if(holdEligible(c))allocate(c,'hold');
  }else{
    solveStage('firm',firmEligible,firmLimit);
    solveStage('hold',holdEligible,Infinity);
  }
  function status(r){return r.firm>0?(r.hold>0?'Split plan':'Commit'):(r.hold>0?'Keep flexible':'Unallocated');}
  for(const f of flightRows){
    f.unfilled=Math.max(0,f.target-f.firm-f.hold);f.status=status(f);f.reasons=[];
    f.reasons.push(`SAF is supplied at ${f.origin} for ${f.origin} → ${f.destination}. Destination inventory is not used for this outbound leg.`);
    f.reasons.push(`Origin ${f.originRisk}%, destination ${f.destinationRisk}%, and en-route ${f.enroute}% assumptions imply ${f.routeRisk.toFixed(1)}% combined operational disruption under the independence assumption.`);
    if(f.firm>0)f.reasons.push(`Route risk is within the ${s.tolerance}% firm threshold; delivery is feasible before the two-hour pre-departure buffer.`);
    if(f.routeRisk>s.tolerance)f.reasons.push(`Combined route disruption exceeds the ${s.tolerance}% firm threshold. SAF's per-unit lifecycle benefit is unchanged.`);
    if(f.hold>0)f.reasons.push(`Keep ${f.hold.toFixed(1)} t conditional and reassess at ${formatHour(s.review)}.`);
    const cs=candidates.filter(c=>c.f.id===f.id);
    if(!cs.length)f.reasons.push('No supplier lane serves the departure airport.');
    else if(cs.every(c=>c.deadline<s.decision))f.reasons.push('All release deadlines have passed for this departure.');
    else if(!f.firm&&!f.hold&&cs.every(c=>c.deadline<Math.max(s.review,s.decision)))f.reasons.push('Waiting until reassessment would miss every delivery window.');
    if(f.unfilled>.01)f.reasons.push(`${f.unfilled.toFixed(1)} t of route target remains uncovered by the budget, shared inventory/capacity, risk policy, or timing constraints.`);
  }
  for(const row of rows){
    const fs=flightRows.filter(f=>f.origin===row.id);
    row.unfilled=fs.reduce((a,f)=>a+f.unfilled,0);row.status=status(row);row.reasons=[`Supply at ${row.id} supports ${fs.length} outbound route group(s). Each destination is assessed separately.`,...fs.map(f=>`${f.origin} → ${f.destination}: ${f.status}; ${f.routeRisk.toFixed(1)}% route risk; ${f.firm.toFixed(1)} t firm / ${f.hold.toFixed(1)} t conditional.`)];
  }
  const sum=k=>rows.reduce((a,b)=>a+b[k],0);
  const baseline=method==='greedy'?null:plan(s,{method:'greedy'});
  return {solver:method,greedyExpected:baseline?baseline.expected:sum('expected'),rows,flightRows,lanes,firm:sum('firm'),hold:sum('hold'),unallocated:Object.values(supply).reduce((a,b)=>a+b,0),unfilled:sum('unfilled'),cost:sum('cost'),holdCost:sum('holdCost'),benefit:sum('benefit'),expected:sum('expected'),remainingBudget:Math.max(0,budget),totalSupply,supply};
}
export function formatHour(n){
  const day=Math.floor(n/24),minute=Math.round(((n%24)+24)%24*60),hour=Math.floor(minute/60)%24;
  const label=day===0?'Day before':day===1?'Delivery day':day===2?'Following day':day<0?'Earlier day':'Day +'+(day-1);
  return `${label} ${String(hour).padStart(2,'0')}:${String(minute%60).padStart(2,'0')} UTC`;
}
