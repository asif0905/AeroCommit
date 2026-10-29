import {authConfig} from './auth-config.js';
const dialog=document.getElementById('sign-in-dialog');
const trigger=document.getElementById('sign-in-open');
const status=document.getElementById('auth-status');
const form=document.getElementById('auth-email-form');
const google=document.getElementById('auth-google');
const account=document.getElementById('auth-account');
let client=null,user=null,pending=false,initializing;
const callbackUrl=location.origin+'/';
function message(text,error=false){status.textContent=text;status.classList.toggle('auth-error',error);}
function render(){trigger.textContent=user?'My account':'Sign in ↗';document.getElementById('signin-heading').textContent=user?'Your AeroCommit account':'Sign in to AeroCommit';form.hidden=!client||!!user;google.hidden=!client||!authConfig.googleEnabled||!!user;account.hidden=!user;document.getElementById('auth-account-email').textContent=user?.email||'';}
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
 e.preventDefault();if(!client||pending||!form.reportValidity())return;pending=true;const button=document.getElementById('auth-email-submit');button.disabled=true;message('Sending your sign-in link…');
 try{const {error}=await client.auth.signInWithOtp({email:document.getElementById('auth-email').value.trim(),options:{emailRedirectTo:callbackUrl}});if(error)throw error;message('Check your inbox for a sign-in link. Use it in this browser to finish signing in.');}
 catch{message('The sign-in link could not be sent. Try again shortly or check the email address.',true);}finally{pending=false;button.disabled=false;}
});
google.onclick=async()=>{if(!client||pending)return;pending=true;google.disabled=true;try{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:callbackUrl}});if(error)throw error;}catch{message('Google sign-in is unavailable. Please use email or try again later.',true);}finally{pending=false;google.disabled=false;}};
document.getElementById('auth-sign-out').onclick=async()=>{if(!client)return;const {error}=await client.auth.signOut();if(error)message('Sign-out could not complete. Please try again.',true);else{user=null;render();message('You have signed out.');}};
if(configured())initializing=initialize();else{message('Account sign-in is awaiting connection to the authentication service. You can continue using the planner without an account.');render();}
