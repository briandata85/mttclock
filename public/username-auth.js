import {auth,cloudUrl,publishableKey} from './cloud-auth.js';
const suffix='@accounts.pokerclock.invalid';
export function normalizeUsername(value){const name=String(value||'').trim().toLowerCase();if(!/^[a-z][a-z0-9_]{2,23}$/.test(name))throw new Error('Use 3–24 characters: letters, numbers, or underscores; start with a letter.');return name;}
export function loginIdentifier(value,{signup=false}={}){const input=String(value||'').trim();return !signup&&input.includes('@')?input:normalizeUsername(input)+suffix;}
export function accountName(user){return user?.email?.endsWith(suffix)?user.email.slice(0,-suffix.length):user?.email||'';}
export async function usernameRequest(path,body,{anonymous=false,expectedOwner=null}={}){
 const {data}=anonymous?{data:{}}:await auth.auth.getSession();
 if(expectedOwner&&data.session?.user?.id!==expectedOwner)throw Object.assign(new Error('The signed-in account changed. Please try again.'),{status:409});
 if(!anonymous&&!data.session)throw Object.assign(new Error('Please sign in again.'),{status:401});
 const response=await fetch(cloudUrl+'/functions/v1/clock-accounts'+path,{method:body===undefined?'GET':'POST',headers:{apikey:publishableKey,'Content-Type':'application/json',...(!anonymous?{Authorization:'Bearer '+data.session.access_token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(path==='/delete'?60000:15000)});
 const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'The account request failed.'),{status:response.status,code:'username_request'});return result;
}
export const usernameClient=new Proxy(auth.auth,{get(target,property){
 if(property==='signInWithPassword')return async({email,password})=>{try{return await target.signInWithPassword({email:loginIdentifier(email),password});}catch(error){return {error};}};
 if(property==='signUp')return async({email,password})=>{
  try{
   const settingsResponse=await fetch(cloudUrl+'/auth/v1/settings',{headers:{apikey:publishableKey},signal:AbortSignal.timeout(10000)});
   if(!settingsResponse.ok||(await settingsResponse.json()).mailer_autoconfirm!==true)return {error:{code:'username_request',status:409,message:'New account creation is temporarily unavailable. Please try again later.'}};
   const result=await target.signUp({email:loginIdentifier(email,{signup:true}),password});
   if(result.error||!result.data?.session)return result;
   try{result.data.recoveryCode=(await usernameRequest('/recovery-code',{password},{expectedOwner:result.data.session.user.id})).code;}
   catch{result.data.recoveryWarning='Account created. Open Account to create your recovery code before signing out.';}
   return result;
  }catch(error){return {error};}
 };
 if(property==='recoverWithCode')return async(code)=>{try{const result=await usernameRequest('/recover',{code},{anonymous:true});return await target.verifyOtp({token_hash:result.token_hash,type:'recovery'});}catch(error){return {error};}};
 const value=target[property];return typeof value==='function'?value.bind(target):value;
}});
