// Independent what-if comparison. Does not place orders or change planner allocations.
import {safArrival} from './tradeoff.mjs';
export const fallbackDefaults=()=>({jetPrice:850,share:100,fee:50,loss:0,reuse:90,stage:'unpurchased',locked:false});
export function compareFallback(state,route,options={}){
 const o={...fallbackDefaults(),...options};
 const allocated=route?route.allocations.reduce((s,a)=>s+a.quantity,0):0;
 const blocked=!route||allocated<=0||o.stage==='loaded'||o.locked;
 const q=blocked?0:allocated*Math.max(0,Math.min(100,o.share))/100;
 const safPrice=allocated?route.allocations.reduce((s,a)=>s+a.quantity*a.price,0)/allocated:0;
 const unitSaving=allocated?route.allocations.reduce((s,a)=>s+a.quantity*a.saving,0)/allocated:0;
 const p=route?Math.max(0,1-route.routeRisk/100):0,d=safArrival(route,o.stage);
 // The SAF premium and its GHG benefit only materialize if the flight operates and the SAF arrives.
 const premium=q*(safPrice-o.jetPrice),fees=q*o.fee;
 const expectedPremium=p*d*premium-fees;
 const cashBenefit=o.stage==='owned'?-p*q*o.jetPrice-fees:expectedPremium;
 return {q,allocated,blocked,safPrice,unitSaving,p,d,premium,fees,netIfOperates:premium-fees,expectedPremium,cashBenefit,jetCost:q*o.jetPrice,safCost:q*safPrice,retainedAsset:o.stage==='owned'?q*safPrice:0,atRisk:q*(1-p),wasteAvoided:q*(1-p)*o.loss/100,ghgDeferred:p*d*q*unitSaving,futureOpportunity:q*o.reuse/100*unitSaving,reason:!route?'Add a route to compare.':allocated<=0?'No feasible SAF allocation exists for this route. No supply can be claimed as retained.':o.stage==='loaded'?'Fuel is already loaded or blended into shared inventory: this prototype cannot selectively recover SAF. Switching is blocked.':o.locked?'A minimum-use obligation or contract prevents this switch. Comparison is blocked.':'Comparison only: planned allocations and purchase budget are unchanged.'};
}
