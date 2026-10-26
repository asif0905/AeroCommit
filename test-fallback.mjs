import assert from 'node:assert/strict';
import {demoState,plan} from './dist/engine.mjs';
import {compareFallback,fallbackDefaults} from './dist/fallback.mjs';
const s=demoState(),p=plan(s),r=p.flightRows.find(f=>f.id==='R102');
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const before=JSON.stringify(p),base=compareFallback(s,r);
close(base.q,35);close(base.safPrice,2430);close(base.netIfOperates,53550);// SFO delivery risk 8% → SAF arrival 0.92; premium and GHG only accrue if the flight operates and SAF arrives.
close(base.d,0.92);close(base.expectedPremium,0.25256*0.92*55300-1750);close(base.wasteAvoided,0);close(base.ghgDeferred,24.706682*0.92);close(base.futureOpportunity,88.0425);
const owned=compareFallback(s,r,{stage:'owned'});close(owned.cashBenefit,-9263.66);close(owned.retainedAsset,85050);
const loss=compareFallback(s,r,{loss:10});close(loss.wasteAvoided,2.61604);
for(const options of [{stage:'loaded'},{locked:true},{share:0}]){const c=compareFallback(s,r,options);for(const k of ['q','cashBenefit','wasteAvoided','ghgDeferred','futureOpportunity'])close(c[k],0);}
assert.ok(compareFallback(s,r,{jetPrice:3000}).netIfOperates<0);
close(compareFallback(s,{...r,routeRisk:100}).expectedPremium,-1750);
close(compareFallback(s,{...r,routeRisk:0}).expectedPremium,0.92*55300-1750);
close(compareFallback(s,{...r,routeRisk:0,deliveryRisk:0}).expectedPremium,53550);
close(compareFallback(s,r,{stage:'owned'}).d,1);
close(compareFallback(s,r,{reuse:0}).futureOpportunity,0);
assert.equal(compareFallback(s,null).blocked,true);
assert.equal(compareFallback(s,p.flightRows.find(f=>f.id==='R105')).blocked,true);
assert.equal(JSON.stringify(p),before);
console.log('PASS fallback: cost arithmetic, inventory vs cash, zero loss, loaded/contract blocks, extreme risk/prices, empty routes, no allocation mutation.');
console.log(JSON.stringify(base,null,2));
