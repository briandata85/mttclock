import {deleteAccountData} from './delete-account.js';
export const aliasDomain='accounts.pokerclock.invalid';
export function username(value){const result=String(value||'').trim().toLowerCase();if(!/^[a-z][a-z0-9_]{2,23}$/.test(result))throw failure('Use 3–24 characters: letters, numbers, or underscores; start with a letter.',400);return result;}
export function usernameEmail(value){return `${username(value)}@${aliasDomain}`;}
export function nameFromEmail(email){return typeof email==='string'&&email.endsWith('@'+aliasDomain)?email.slice(0,-aliasDomain.length-1):null;}
export function normalizeCode(value){const code=String(value||'').replace(/[\s-]/g,'').toLowerCase();if(!/^[a-f0-9]{64}$/.test(code))throw failure('Check your recovery code and try again.',400);return code;}
const failure=(message,status=503)=>Object.assign(new Error(message),{status});
const hex=bytes=>Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(text){return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));}
export function createAccountsHandler({url,secretKey,publishableKey,fetcher=fetch}){
 const cors={'Access-Control-Allow-Origin':'https://pokerclock-account-staging.meadba85.chatgpt.site','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Cache-Control':'no-store','Vary':'Origin'};
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}});
 async function call(path,{body,method=body===undefined?'GET':'POST',jwt,admin=false,prefer}={}){
  const response=await fetcher(url+path,{method,headers:{apikey:admin?secretKey:publishableKey,'Content-Type':'application/json',...(jwt?{Authorization:'Bearer '+jwt}:{}),...(prefer?{Prefer:prefer}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(10000)});
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{throw failure('The account service is unavailable. Please retry.');}
  if(!response.ok){if(method==='DELETE'&&path.startsWith('/auth/v1/admin/users/')&&response.status===404)return null;const status=response.status===429?429:response.status<500?400:503;throw failure(response.status===429?'Too many attempts. Try again later.':path.includes('/token')?'Incorrect password.':data?.code==='email_exists'?'That username is already taken.':'The account request could not be completed.',status);}
  return data;
 }
 const rest=(path,options={})=>call('/rest/v1/'+path,{...options,admin:true});
 async function identity(req){const jwt=req.headers.get('authorization')?.replace(/^Bearer /i,'');if(!jwt)throw failure('Sign in again.',401);let user;try{user=await call('/auth/v1/user',{jwt});}catch{throw failure('Sign in again.',401);}if(!user?.id||user.is_anonymous||!user.email_confirmed_at)throw failure('Sign in again.',401);return user;}
 async function checkPassword(user,password){if(typeof password!=='string'||!password)throw failure('Enter your current password.',400);const session=await call('/auth/v1/token?grant_type=password',{body:{email:user.email,password}});if(session?.access_token)await call('/auth/v1/logout?scope=local',{jwt:session.access_token,method:'POST'}).catch(()=>{});}
 return async req=>{
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  try{
   const path=new URL(req.url).pathname.split('/clock-accounts')[1]||'/';
   if(!['GET','POST'].includes(req.method))return json({error:'Method not allowed.'},405);
   let body={};if(req.method==='POST'){const raw=await req.text();if(raw.length>4096)throw failure('Request too large.',413);try{body=JSON.parse(raw);}catch{throw failure('Invalid request.',400);}}
   // Shared persistent limits, independent of Edge isolate lifetime. Do not store raw IP addresses.
   const ip=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
   const bucket=path+':'+await digest(ip);
   if(!await rest('rpc/clock_auth_attempt',{body:{p_bucket:bucket,p_limit:path==='/recover'?10:30}}))throw failure('Too many attempts. Try again in 15 minutes.',429);
   if(path==='/recover'&&req.method==='POST'){
    const hash=await digest(normalizeCode(body.code));
    const owner=await rest('rpc/clock_consume_recovery',{body:{p_hash:hash}});
    if(!owner)throw failure('That recovery code is invalid or has already been used.',400);
    try{
     const user=await call('/auth/v1/admin/users/'+owner,{admin:true});
     if(!user?.email)throw failure('Account recovery is unavailable.');
     // Generates a one-time recovery token; this endpoint does not send email.
     const link=await call('/auth/v1/admin/generate_link',{admin:true,body:{type:'recovery',email:user.email}});
     if(!link?.hashed_token)throw failure('Account recovery is unavailable.');
     return json({token_hash:link.hashed_token});
    }catch(error){
     // Restore only the consumed verifier, never replace a code rotated in parallel.
     await rest('clock_account_recovery?owner_id=eq.'+owner+'&code_hash=is.null',{method:'PATCH',body:{code_hash:hash,updated_at:new Date().toISOString()}}).catch(()=>{});
     throw error;
    }
   }
   const user=await identity(req);
   const closing=(await rest('clock_account_deletions?owner_id=eq.'+user.id+'&select=status'))?.[0]||null;
   if(closing&&!['/profile','/delete'].includes(path))throw failure('Account deletion is in progress. Return to Account to finish it.',409);
   if(path==='/profile'&&req.method==='GET'){
    const rows=await rest('clock_account_recovery?owner_id=eq.'+user.id+'&select=code_hash');
    return json({username:nameFromEmail(user.email),hasRecoveryCode:!!rows?.[0]?.code_hash,deletionPending:!!closing});
   }
   if(path==='/delete'&&req.method==='POST'){
    if(body.confirmation!=='DELETE')throw failure('Type DELETE to confirm permanent account deletion.',400);
    await checkPassword(user,body.password);
    const result=await deleteAccountData({owner:user.id,
     begin:owner=>rest('rpc/clock_begin_account_deletion',{body:{p_owner:owner}}),
     listImages:owner=>call('/storage/v1/object/list/clock-artwork',{admin:true,body:{prefix:owner+'/',limit:100,offset:0,sortBy:{column:'name',order:'asc'}}}),
     removeImages:prefixes=>call('/storage/v1/object/clock-artwork',{admin:true,method:'DELETE',body:{prefixes}}),
     removeRows:async owner=>{for(const table of ['clock_tournaments','clock_artwork_assets','clock_account_recovery'])await rest(table+'?owner_id=eq.'+owner,{method:'DELETE'});},
     removeLogin:owner=>call('/auth/v1/admin/users/'+owner,{admin:true,method:'DELETE'}),
     finish:owner=>rest('clock_account_deletions?owner_id=eq.'+owner,{method:'PATCH',body:{status:'deleted',completed_at:new Date().toISOString()}})
    });
    return json(result);
   }
   if(path==='/username'&&req.method==='POST'){
    if(nameFromEmail(user.email))throw failure('Your username is already set.',409);
    const email=usernameEmail(body.username);await checkPassword(user,body.password);
    await call('/auth/v1/admin/users/'+user.id,{admin:true,method:'PUT',body:{email,email_confirm:true}});
    return json({username:username(body.username)});
   }
   if(path==='/recovery-code'&&req.method==='POST'){
    await checkPassword(user,body.password);
    const code=hex(crypto.getRandomValues(new Uint8Array(32))),hash=await digest(code);
    await rest('clock_account_recovery?on_conflict=owner_id',{body:{owner_id:user.id,code_hash:hash,updated_at:new Date().toISOString()},prefer:'resolution=merge-duplicates'});
    return json({code:code.match(/.{8}/g).join('-')});
   }
   return json({error:'Not found.'},404);
  }catch(error){return json({error:error.status?error.message:'The account service is unavailable. Please retry.'},error.status||503);}
 };
}
