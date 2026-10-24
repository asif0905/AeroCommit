// Exact continuous one-variable optimizer for a fixed route allocation mix.
// Cash horizon: tomorrow; SAF already owned is a sunk purchase, not a refund.
export const tradeoffDefaults=()=>({mode:'budget',budget:60000,target:50,carbonPrice:250});
export function optimizeTradeoff(state,route,fuel,settings={}) {
 const o={...tradeoffDefaults(),...settings}, allocations=route?.allocations||[];
 const q=allocations.reduce((s,a)=>s+a.quantity,0);
 if(q<=0||fuel.stage==='loaded')return {available:false,reason:q<=0?'No allocated SAF tranche to optimize. Adjust supply or select another route.':'Fuel is already loaded or commingled. A selective SAF substitution cannot be optimized here.'};
 const p=Math.max(0,Math.min(1,1-route.routeRisk/100));
 const safPrice=allocations.reduce((s,a)=>s+a.quantity*a.price,0)/q;
 const saving=allocations.reduce((s,a)=>s+a.quantity*a.saving,0)/q;
 const jetFactor=state.baseline*state.lhv/1000;
 const unitCash=p*((fuel.stage==='owned'?0:safPrice)-fuel.jetPrice)-fuel.fee;
 const baseCash=q*(p*fuel.jetPrice+fuel.fee), unitReduction=p*saving;
 const evaluate=x=>({saf:x,jet:q-x,share:100*x/q,cash:baseCash+x*unitCash,emissions:p*q*jetFactor-x*unitReduction,reduction:x*unitReduction});
 const allJet=evaluate(0),allSaf=evaluate(q);
 let lo=fuel.locked?q:0,hi=q,reason='';
 // Intersect one affine constraint with the feasible interval.
 function upper(a,b){if(Math.abs(a)<1e-10){if(b< -1e-7)reason='No feasible mix meets this constraint.';}else if(a>0)hi=Math.min(hi,b/a);else lo=Math.max(lo,b/a);}
 if(o.mode==='budget')upper(unitCash,o.budget-baseCash);
 if(o.mode==='target')upper(-unitReduction,-o.target);
 if(lo>hi+1e-7)reason=o.mode==='budget'?'Budget is below the minimum feasible expected cash spend.':'GHG target exceeds the reduction available from this tranche.';
 let recommendation=null;
 if(!reason){lo=Math.max(0,Math.min(q,lo));hi=Math.max(lo,Math.min(q,hi));const slope=o.mode==='budget'?-unitReduction:o.mode==='target'?unitCash:unitCash-o.carbonPrice*unitReduction;recommendation=evaluate(slope< -1e-8?hi:slope>1e-8?lo:(unitReduction>=0?hi:lo));}
 return {available:true,q,p,safPrice,saving,allJet,allSaf,unitCash,unitReduction,reason,feasible:!!recommendation,recommendation,locked:fuel.locked,points:(fuel.locked?[1]:[0,.25,.5,.75,1]).map(f=>evaluate(q*f)),costPerTonne:unitReduction>1e-10?unitCash/unitReduction:null};
}
