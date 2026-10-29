import {authConfig} from './auth-config.js';
const dialog=document.getElementById('sign-in-dialog');
const trigger=document.getElementById('sign-in-open');
const status=document.getElementById('auth-status');
const form=document.getElementById('auth-email-form');
const google=document.getElementById('auth-google');
const account=document.getElementById('auth-account');
let client=null,user=null,pending=false,initializing,mode='signin';
const callbackUrl=location.origin+'/';
function message(text,error=false){status.textContent=text;status.classList.toggle('auth-error',error);}
function render(){
 trigger.textContent=user?'My account':'Sign in / Sign up';
 document.getElementById('signin-heading').textContent=user?'Your AeroCommit account':mode==='signup'?'Create your AeroCommit account':'Welcome back to AeroCommit';
 form.hidden=!client||!!user;google.hidden=!client||!authConfig.googleEnabled||!!user;account.hidden=!user;
 document.getElementById('auth-mode-switch').hidden=!!user;
 document.getElementById('auth-account-email').textContent=user?.email||'';
 for(const item of ['signin','signup']){const b=document.getElementById('auth-mode-'+item);b.setAttribute('aria-pressed',String(mode===item));b.disabled=pending;}
 document.getElementById('auth-email-submit').textContent=mode==='signup'?'Create account with email ↗':'Email me a sign-in link ↗';
 document.getElementById('auth-email-help').textContent=mode==='signup'?'We’ll email a secure link to verify your address and complete account creation. No password required.':'Already registered? Use your email to receive a secure login link.';
}
function chooseMode(next){if(pending)return;mode=next;render();if(client)message(mode==='signup'?'New here? Create an account using your email.':'Sign in with the email you used to create your account.');}
for(const item of ['signin','signup'])document.getElementById('auth-mode-'+item).onclick=()=>chooseMode(item);
function configured(){try{return new URL(authConfig.supabaseUrl).protocol==='https:'&&!!authConfig.publishableKey;}catch{return false;}}
async function initialize(){
 if(!configured()){message('Account sign-in is awaiting connection to the authentication service. You can continue using the planner without an account.');render();return;}
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/+esm');
  client=createClient(authConfig.supabaseUrl,authConfig.publishableKey,{auth:{flowType:'pkce',detectSessionInUrl:true,persistSession:true,autoRefreshToken:true}});
  const {data,error}=await client.auth.getUser();
  user=error?null:data.user;render();message(user?'You’re signed in.':'Use your email to receive a secure sign-in link.');
  client.auth.onAuthStateChange((event,session)=>{user=session?.user||null;render();if(event==='SIGNED_IN'){message('You’re signed in.');dialog.close();window.dispatchEvent(new Event('aerocommit:signed-in'));}else if(event==='SIGNED_OUT')message('You have signed out.');});
 }catch{client=null;render();message('Sign-in could not load. Please try again later. The planner is still available.',true);}
}
trigger.onclick=async()=>{dialog.showModal();if(!initializing)initializing=initialize();await initializing;};
form.addEventListener('submit',async e=>{
 e.preventDefault();if(!client||pending||!form.reportValidity())return;pending=true;const button=document.getElementById('auth-email-submit');button.disabled=true;render();message(mode==='signup'?'Sending your account verification link…':'Sending your sign-in link…');
 try{const {error}=await client.auth.signInWithOtp({email:document.getElementById('auth-email').value.trim(),options:{emailRedirectTo:callbackUrl,shouldCreateUser:mode==='signup'}});if(error)throw error;message(mode==='signup'?'Check your inbox to verify your email and finish creating your account. If you already have an account, use the link to sign in.':'If your account exists, you’ll receive a sign-in link. New to AeroCommit? Select Create account. Open the link in this browser.');}
 catch{message(mode==='signup'?'Account creation could not complete. Please check your email address or try again shortly.':'The sign-in link could not be sent. If you’re new, select Create account, or try again shortly.',true);}finally{pending=false;button.disabled=false;render();}
});
google.onclick=async()=>{if(!client||pending)return;pending=true;google.disabled=true;try{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:callbackUrl}});if(error)throw error;}catch{message('Google sign-in is unavailable. Please use email or try again later.',true);}finally{pending=false;google.disabled=false;}};
document.getElementById('auth-sign-out').onclick=async()=>{if(!client)return;const {error}=await client.auth.signOut();if(error)message('Sign-out could not complete. Please try again.',true);else{user=null;render();message('You have signed out.');}};
if(configured())initializing=initialize();else{message('Account sign-in is awaiting connection to the authentication service. You can continue using the planner without an account.');render();}
