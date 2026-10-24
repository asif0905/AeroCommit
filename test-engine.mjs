import assert from 'node:assert/strict';
import {demoState,applyScenario,plan} from './dist/engine.mjs';
function check(s){const p=plan(s),eps=1e-6;
 assert(p.firm+p.hold<=p.totalSupply+eps,'supply conservation');
 assert(p.cost+p.holdCost<=s.budget+eps,'budget conservation');
 assert(p.firm<=p.totalSupply*(1-s.flex/100)+eps,'non-firm policy');
 for(const v of s.suppliers)assert(p.lanes.filter(l=>l.supplier===v.id).reduce((a,l)=>a+l.firm+l.hold,0)<=v.supply+eps,'supplier cap');
 for(const a of p.rows){assert(a.firm+a.hold<=a.demand+eps,'origin cap');assert(a.firm>=0&&a.hold>=0);assert(a.expected<=a.benefit+eps);const fs=p.flightRows.filter(f=>f.origin===a.id);assert(Math.abs(fs.reduce((n,f)=>n+f.firm,0)-a.firm)<eps,'origin reconciliation');}
 for(const f of p.flightRows){assert(f.firm+f.hold<=f.target+eps,'route target');if(f.firm>eps)assert(f.routeRisk<=s.tolerance,'route threshold');for(const a of f.allocations){assert.equal(a.origin,f.origin,'fuel at origin');assert(a.deadline>=(a.kind==='firm'?s.decision:Math.max(s.review,s.decision)));const lane=s.lanes.find(l=>l.supplier===a.supplier&&l.airport===f.origin);assert(lane,'supplier must serve origin');assert(a.deadline+lane.lead<=f.depart-2+eps,'pre-departure buffer');}}
 for(const l of p.lanes)assert(l.firm+l.hold<=l.capacity+eps,'shared physical lane cap');
 return p;
}
const p=check(demoState());assert(p.firm>0&&p.hold>0);
const route=(p,id)=>p.flightRows.find(f=>f.id===id);
assert(route(p,'R101').firm>0,'SFO-JFK can be firm');assert(route(p,'R102').firm===0&&route(p,'R102').hold>0,'same-origin SFO-MIA stays flexible');
let s=demoState();s.airports.find(a=>a.id==='MIA').risk=5;let revised=check(s);assert.equal(route(revised,'R101').routeRisk,route(p,'R101').routeRisk,'MIA risk must not alter SFO-JFK risk');assert(route(revised,'R102').routeRisk<route(p,'R102').routeRisk,'destination risk propagated');
s=demoState();s.budget=0;assert.equal(check(s).firm+check(s).hold,0);
s=demoState();s.flex=100;assert.equal(check(s).firm,0);
s=demoState();s.suppliers.forEach(v=>v.supply=0);assert.equal(check(s).firm+check(s).hold,0);
s=demoState();s.suppliers.forEach(v=>v.ci=100);assert.equal(check(s).firm+check(s).hold,0);
s=demoState();s.airports.forEach(a=>a.risk=100);s.tolerance=100;assert.equal(check(s).expected,0);
s=demoState();s.lanes.forEach(l=>l.lead=72);assert.equal(check(s).firm+check(s).hold,0);
s=demoState();s.flights=[];assert.equal(check(s).firm+check(s).hold,0);
s=demoState();s.flights=s.flights.slice(0,1);s.flights[0].depart=26;assert.equal(check(s).firm+check(s).hold,0,'early departure infeasible');
s=demoState();s.flights=s.flights.slice(0,1);s.flights[0].target=1;s.flights[0].enroute=0;s.airports.forEach(a=>{a.risk=0;a.delivery=0});s.suppliers[0].ci=20;s.flex=0;assert(Math.abs(check(s).benefit-2.967)<1e-9,'unit conversion');
s=demoState();s.flights=s.flights.slice(1,2);s.airports.forEach(a=>a.risk=0);s.flights[0].enroute=0;s.suppliers[0].supply=0;assert.equal(check(s).firm+check(s).hold,0,'destination supply cannot fulfill origin demand');
let seed=20261023;function rng(){seed=(1664525*seed+1013904223)>>>0;return seed/2**32;}
for(let i=0;i<400;i++){s=demoState();s.budget=rng()*1500000;s.flex=rng()*100;s.tolerance=rng()*100;s.review=24+rng()*12;s.suppliers.forEach(v=>{v.supply=rng()*300;v.ci=rng()*110;v.price=1000+rng()*4000});s.airports.forEach(a=>{a.risk=rng()*100;a.delivery=rng()*100;a.demand=rng()*150;a.need=24+rng()*23});s.lanes.forEach(l=>{l.lead=rng()*40;l.capacity=rng()*100});s.flights.forEach(f=>{f.enroute=rng()*100;f.target=rng()*100;f.depart=24+rng()*23});check(s);}
for(const scenario of ['clear','storm','tight'])check(applyScenario(demoState(),scenario));
console.log('PASS: route isolation, origin-only supply, shared capacities, timing, conservation, unit conversion, edge cases, 3 scenarios, 400 seeded constraint checks.');
console.log(JSON.stringify({firm:p.firm,hold:p.hold,routes:p.flightRows.map(f=>({route:f.origin+'-'+f.destination,firm:f.firm,hold:f.hold,risk:f.routeRisk}))},null,2));
