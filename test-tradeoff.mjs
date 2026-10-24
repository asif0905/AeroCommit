import assert from 'node:assert/strict';
import {optimizeTradeoff} from './dist/tradeoff.mjs';
import {fallbackDefaults} from './dist/fallback.mjs';
const s={baseline:89,lhv:43},route={routeRisk:20,allocations:[{quantity:100,price:2400,saving:2.795}]},fuel={...fallbackDefaults(),jetPrice:800,fee:0};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
let t=optimizeTradeoff(s,route,fuel,{mode:'budget',budget:128000});
near(t.recommendation.saf,50);near(t.recommendation.cash,128000);near(t.recommendation.reduction,111.8);near(t.recommendation.emissions,194.36);near(t.costPerTonne,1600/2.795);
let target=optimizeTradeoff(s,route,fuel,{mode:'target',target:111.8});near(target.recommendation.saf,50);
assert.equal(optimizeTradeoff(s,route,fuel,{mode:'budget',budget:1}).feasible,false);
assert.equal(optimizeTradeoff(s,route,fuel,{mode:'target',target:300}).feasible,false);
near(optimizeTradeoff(s,route,fuel,{mode:'value',carbonPrice:100}).recommendation.saf,0);
near(optimizeTradeoff(s,route,fuel,{mode:'value',carbonPrice:1000}).recommendation.saf,100);
near(optimizeTradeoff(s,route,{...fuel,stage:'owned'},{mode:'budget',budget:0}).recommendation.cash,0);
near(optimizeTradeoff(s,route,{...fuel,stage:'owned'},{mode:'value',carbonPrice:0}).recommendation.saf,100);
assert.equal(optimizeTradeoff(s,route,{...fuel,locked:true},{mode:'budget',budget:128000}).feasible,false);
near(optimizeTradeoff(s,route,{...fuel,locked:true},{mode:'value',carbonPrice:0}).recommendation.saf,100);
assert.equal(optimizeTradeoff(s,route,{...fuel,stage:'loaded'}).available,false);
assert.equal(optimizeTradeoff(s,null,fuel).available,false);
assert.equal(optimizeTradeoff(s,{...route,routeRisk:100},fuel,{mode:'target',target:1}).feasible,false);
near(optimizeTradeoff(s,{...route,routeRisk:100},fuel,{mode:'budget',budget:0}).recommendation.emissions,0);
near(optimizeTradeoff(s,route,{...fuel,fee:5000},{mode:'target',target:0}).recommendation.saf,100);
// Independent exhaustive grid confirms objective bounds across diverse linear slopes.
for(let i=0;i<180;i++){
 const r={routeRisk:i%101,allocations:[{quantity:100,price:500+(i%13)*250,saving:(i%7)-1}]};
 const f={...fuel,fee:(i%4)*150,stage:i%5===0?'owned':'unpurchased'};
 const mode=['budget','target','value'][i%3],o={mode,budget:100000,target:75,carbonPrice:(i%11)*100};
 const out=optimizeTradeoff(s,r,f,o),p=1-r.routeRisk/100,benefit=r.allocations[0].saving;
 const candidates=Array.from({length:1001},(_,j)=>{const x=j/10;return{x,c:p*(x*(f.stage==='owned'?0:r.allocations[0].price)+(100-x)*f.jetPrice)+(100-x)*f.fee,g:p*x*benefit,e:p*100*s.baseline*s.lhv/1000-p*x*benefit}}).filter(v=>mode==='budget'?v.c<=o.budget+1e-7:mode==='target'?v.g>=o.target-1e-7:true);
 if(candidates.length){assert.ok(out.feasible);const a=out.recommendation;assert.ok(a.saf>=0&&a.saf<=100);if(mode==='budget'){assert.ok(a.cash<=o.budget+1e-6);assert.ok(a.reduction>=Math.max(...candidates.map(v=>v.g))-1e-6);}else if(mode==='target'){assert.ok(a.reduction>=o.target-1e-6);assert.ok(a.cash<=Math.min(...candidates.map(v=>v.c))+1e-6);}else assert.ok(a.cash+o.carbonPrice*a.emissions<=Math.min(...candidates.map(v=>v.c+o.carbonPrice*v.e))+1e-6);}
}
console.log('Trade-off optimizer: analytic cases, blocking, owned inventory and 180 independent grid comparisons passed.');
