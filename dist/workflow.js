const workflow=document.getElementById('allocation-workflow');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const stages=[
 ['GATHER INPUTS','Start with the supply you can actually plan around.','Bring together available gallons, batch carbon intensity, prices, route demand and disruption assumptions.'],
 ['CHECK FEASIBILITY','Check the limits before committing supply.','Compare available stock, route and airport demand, lane capacities, delivery windows and budget. Confirm eligibility separately using verified batch documentation.'],
 ['BALANCE PRIORITIES','Compare cost with expected lifecycle GHG benefit.','The airline planner prioritizes expected GHG savings within its selected constraints. Supplier and compliance tools evaluate their own scenario objectives.'],
 ['RECOMMEND','Commit what fits. Keep uncertainty flexible.','Recommend firm allocations, then conditional holds from remaining supply and budget. Review unallocated demand when inputs change; no orders or reservations are executed.']
];
const network=document.getElementById('mission-network');
let weather=false;
let stage=0,paused=reduceMotion.matches,visible=false,timer;
function showStage(index){stage=index;workflow.dataset.stage=String(index);document.querySelectorAll('[data-workflow-step]').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));document.getElementById('workflow-stage-number').textContent=String(index+1).padStart(2,'0')+' / '+stages[index][0];document.getElementById('workflow-stage-title').textContent=stages[index][1];document.getElementById('workflow-stage-description').textContent=(weather&&index===3?'When destination disruption risk rises, reassess commitments against your selected risk limits. Keep eligible volume conditional where feasible, or review other allocations. This animation explains the decision process; it does not run a live allocation.':stages[index][2]);}
function sync(){clearInterval(timer);const stop=paused||reduceMotion.matches; if(stop||!visible||document.hidden){network.pauseAnimations();}else{network.unpauseAnimations();}workflow.classList.toggle('workflow-paused',stop);const b=document.getElementById('workflow-pause');b.textContent=stop?'▶ Play workflow':'Ⅱ Pause workflow';b.setAttribute('aria-pressed',String(stop));if(visible&&!stop&&!document.hidden)timer=setInterval(()=>showStage((stage+1)%4),4200);}
document.getElementById('workflow-pause').onclick=()=>{paused=!paused;sync();};
document.querySelectorAll('[data-workflow-step]').forEach(b=>b.onclick=()=>{paused=true;showStage(Number(b.dataset.workflowStep));sync();});
reduceMotion.addEventListener('change',()=>{if(reduceMotion.matches)paused=true;sync();});
document.addEventListener('visibilitychange',sync);
if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();},{threshold:.15}).observe(workflow);else visible=true;
showStage(0);sync();

document.getElementById('workflow-weather').onclick=()=>{weather=!weather;workflow.classList.toggle('mission-weather-mode',weather);const b=document.getElementById('workflow-weather');b.setAttribute('aria-pressed',String(weather));b.textContent=weather?'↻ Return to normal conditions':'↻ See what changes with weather';showStage(weather?3:0);sync();};
