for(const role of ['airline','supplier']){
 document.getElementById('audience-'+role).onclick=()=>{
  for(const item of ['airline','supplier']){
   document.getElementById('audience-'+item).setAttribute('aria-pressed',String(role===item));
   document.getElementById('audience-panel-'+item).hidden=role!==item;
  }
 };
}
// Keep the FAQ concise while retaining native keyboard and screen-reader behavior.
const questions=[...document.querySelectorAll('.faq-questions details')];
questions.forEach(item=>item.addEventListener('toggle',()=>{if(item.open)questions.forEach(other=>{if(other!==item)other.open=false;});}));
