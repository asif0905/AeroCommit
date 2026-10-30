import {authConfig} from './auth-config.js';
const $=id=>document.getElementById(id),dialog=$('sign-in-dialog'),trigger=$('sign-in-open'),form=$('auth-email-form');
let client=null,user=null,pending=false,initializing,mode='signin';
const callbackUrl=location.origin+'/';
const copy={signin:['Sign in','Welcome back. Enter your details below.','Sign in'],signup:['Create account','Get started with AeroCommit.','Create account'],reset:['Reset password','Enter your email and we’ll send a reset link.','Send reset link'],newpassword:['Set a new password','Choose a new password for your account.','Update password']};
function message(text='',error=false){$('auth-status').textContent=text;$('auth-status').hidden=!text;$('auth-status').classList.toggle('auth-error',error);}
function render(){
 const recovery=mode==='newpassword',signedIn=!!user&&!recovery,signup=mode==='signup',reset=mode==='reset';
 trigger.textContent=user?'My account':'Sign in';$('signin-heading').textContent=signedIn?'Your account':copy[mode][0];$('auth-subtitle').textContent=signedIn?'Manage your AeroCommit session.':copy[mode][1];
 form.hidden=!client||signedIn; $('auth-account').hidden=!signedIn;$('auth-account-email').textContent=user?.email||'';
 $('auth-email-group').hidden=recovery;$('auth-email').required=!recovery;
 $('auth-password-group').hidden=reset;$('auth-password').required=!reset;$('auth-password').minLength=signup||recovery?8:1;$('auth-password').autocomplete=signup||recovery?'new-password':'current-password';
 $('auth-confirm-group').hidden=!(signup||recovery);$('auth-confirm').required=signup||recovery;$('auth-password-hint').hidden=!(signup||recovery);$('auth-forgot').hidden=mode!=='signin';
 $('auth-email-submit').textContent=pending?'Please wait…':copy[mode][2];$('auth-email-submit').disabled=pending;
 $('auth-switch-line').hidden=signedIn||recovery;$('auth-switch-copy').textContent=signup?'Already have an account?':reset?'Remember your password?':'Don’t have an account?';$('auth-switch').textContent=mode==='signin'?'Sign up':'Sign in';$('auth-switch').disabled=pending;
 $('auth-google').hidden=!client||!authConfig.googleEnabled||signedIn||reset||recovery;
}
function chooseMode(next){if(pending)return;mode=next;message();$('auth-password').value='';$('auth-confirm').value='';$('auth-confirm').setCustomValidity('');$('auth-password').type='password';$('auth-show-password').textContent='Show';$('auth-show-password').setAttribute('aria-label','Show password');$('auth-show-password').setAttribute('aria-pressed','false');render();}
$('auth-switch').onclick=()=>chooseMode(mode==='signin'?'signup':'signin');$('auth-forgot').onclick=()=>chooseMode('reset');
$('auth-show-password').onclick=()=>{const show=$('auth-password').type==='password';$('auth-password').type=show?'text':'password';$('auth-show-password').textContent=show?'Hide':'Show';$('auth-show-password').setAttribute('aria-label',show?'Hide password':'Show password');$('auth-show-password').setAttribute('aria-pressed',String(show));};
$('auth-confirm').oninput=()=>$('auth-confirm').setCustomValidity('');
function configured(){try{return new URL(authConfig.supabaseUrl).protocol==='https:'&&!!authConfig.publishableKey;}catch{return false;}}
async function initialize(){
 if(!configured()){message('Sign-in is temporarily unavailable. You can still use the planner.');render();return;}
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
  client=createClient(authConfig.supabaseUrl,authConfig.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
  client.auth.onAuthStateChange((event,session)=>{user=session?.user||null;if(event==='PASSWORD_RECOVERY'){mode='newpassword';render();message();if(!dialog.open)dialog.showModal();}else if(event==='SIGNED_IN'&&mode!=='newpassword'){render();dialog.close();window.dispatchEvent(new Event('aerocommit:signed-in'));}else{render();}});
  const {data,error}=await client.auth.getUser();user=error?null:data.user;render();
 }catch{client=null;render();message('Sign-in could not load. Please try again later.',true);}
}
trigger.onclick=async()=>{if(mode!=='newpassword')chooseMode('signin');dialog.showModal();if(!initializing)initializing=initialize();await initializing;};
form.addEventListener('submit',async e=>{
 e.preventDefault();if(!client||pending)return;const action=mode;
 if((action==='signup'||action==='newpassword')&&$('auth-password').value!==$('auth-confirm').value){$('auth-confirm').setCustomValidity('Passwords do not match.');$('auth-confirm').reportValidity();return;}
 if(!form.reportValidity())return;pending=true;message();render();
 try{
  const email=$('auth-email').value.trim(),password=$('auth-password').value;let result;
  if(action==='signin')result=await client.auth.signInWithPassword({email,password});
  else if(action==='signup')result=await client.auth.signUp({email,password,options:{emailRedirectTo:callbackUrl}});
  else if(action==='reset')result=await client.auth.resetPasswordForEmail(email,{redirectTo:callbackUrl});
  else{if(!user)throw {code:'recovery_expired'};result=await client.auth.updateUser({password});}
  if(result.error)throw result.error;
  $('auth-password').value='';$('auth-confirm').value='';
  if(action==='signup'&&!result.data?.session)message('Check your inbox to confirm your email, then sign in. If this email is already registered, sign in or reset your password.');
  if(action==='reset')message('If an account exists for this email, you’ll receive a password-reset link. Open it in this browser.');
  if(action==='newpassword'){mode='signin';message('Your password has been updated.');}
 }catch(error){const code=error?.code;message(code==='invalid_credentials'?'Incorrect email or password. Try again or reset your password.':code==='email_not_confirmed'?'Please confirm your email before signing in.':code==='weak_password'?'Choose a stronger password with at least 8 characters.':code==='recovery_expired'?'This reset session has expired. Request a new reset link.':code==='over_email_send_rate_limit'||code==='over_request_rate_limit'?'Too many attempts. Please wait and try again.':'Unable to complete this request. Check your details and try again.',true);}
 finally{pending=false;render();}
});
$('auth-google').onclick=async()=>{if(!client||pending)return;const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:callbackUrl}});if(error)message('Google sign-in is unavailable. Please use email and password.',true);};
$('auth-sign-out').onclick=async()=>{if(!client)return;const {error}=await client.auth.signOut();if(error)message('Unable to sign out. Please try again.',true);else{user=null;chooseMode('signin');message('You have signed out.');}};
dialog.addEventListener('close',()=>{if(mode!=='newpassword'){$('auth-password').value='';$('auth-confirm').value='';}});
render();if(configured())initializing=initialize();else message('Sign-in is temporarily unavailable. You can still use the planner.');
