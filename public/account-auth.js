// Account state and transport helpers. No browser globals, network, or credentials.
export const verificationMessage='If this address can be used, check your email for a confirmation link. You can also sign in or reset your password.';
export const resetMessage='Enter the recovery code you saved when you created your account.';
export const unconfiguredMessage='Online accounts aren’t configured for this website. Sign-in and saved tournaments are unavailable. No email will be sent.';
export class AccountError extends Error {
  constructor(message,{code='account_unavailable',status=503,retryAfter=0}={}){super(message);this.name='AccountError';this.code=code;this.status=status;this.retryAfter=retryAfter;}
}
// getRandomValues remains available for the existing HTTP LAN preview path.
export function newCreationId(random=globalThis.crypto){
  if(typeof random?.randomUUID==='function')return random.randomUUID();
  if(typeof random?.getRandomValues!=='function')throw new AccountError('This browser cannot create a secure request ID. Use a current browser.');
  const bytes=random.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function safeReturn(value){return value==='/account'||/^\/t\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\/(director|display)$/.test(value||'')?value:'/tournaments';}
export function publicConfigReady(url,key){
  try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||!['','/'].includes(parsed.pathname)||parsed.hostname==='example.supabase.co')return false;}catch{return false;}
  if(typeof key!=='string')return false;
  if(/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(key))return true;
  // Legacy anon keys remain supported; never accept privileged JWTs.
  try{const parts=key.split('.');return parts.length===3&&JSON.parse(atob(parts[1].replaceAll('-','+').replaceAll('_','/'))).role==='anon';}catch{return false;}
}
export function authMessage(error,intent='signin'){
  const code=error?.code||'',status=error?.status;
  if(code==='account_unconfigured')return unconfiguredMessage;
  if(status===429||/rate_limit|over_.*rate/.test(code))return 'Too many attempts. Wait a little, then try again.';
  if(code==='request_timeout'||error?.name==='AbortError'||error?.name==='TimeoutError')return 'That took too long. Check your connection and try again.';
  if(error instanceof TypeError||error?.name==='AuthRetryableFetchError'&&status===0||/fetch|network/i.test(code))return 'Couldn’t connect. Check your connection and try again.';
  if(status>=500)return 'The sign-in service is unavailable. Please try again in a moment.';
  if(code==='weak_password')return 'Choose a longer, stronger password you don’t use elsewhere.';
  if(['email_address_invalid','validation_failed'].includes(code))return 'Check your email address and password, then try again.';
  if(error?.code==='username_request'||error instanceof Error&&error.status===undefined&&/^Use 3/.test(error.message))return error.message;
  if(intent==='signin')return 'We couldn’t verify that username and password. Try again or use your recovery code.';
  if(intent==='recover')return 'Your password change wasn’t confirmed. Please try again.';
  if(intent==='signout')return 'Sign out wasn’t confirmed. Check your connection and try again.';
  return 'That request wasn’t confirmed. Please try again in a moment.';
}
export function callbackHasError(search='',hash=''){
  return [search,hash].some(part=>{const params=new URLSearchParams(part.replace(/^[?#]/,''));return params.has('error')||params.has('error_code')||params.has('error_description');});
}
export function verifiedSession(session){return Boolean(session?.user?.id&&session.user.email_confirmed_at&&!session.user.is_anonymous);}
const duplicateCode=error=>['user_already_exists','email_exists','user_not_found','email_not_confirmed'].includes(error?.code);

export class AccountAuthFlow {
  constructor({client,configured,origin,onChange=()=>{},now=Date.now,timeoutMs=15000,defer=fn=>setTimeout(fn,0),recoveryRequested=false,callbackError=false}){
    this.client=client;this.configured=configured;this.origin=origin;this.onChange=onChange;this.now=now;this.timeoutMs=timeoutMs;this.defer=defer;this.recoveryRequested=recoveryRequested;this.callbackError=callbackError;
    this.generation=0;this.disposed=false;this.recoveryUser=null;this.recoveryToken=null;this.subscription=null;
    this.state={mode:'loading',session:null,busy:false,message:'Connecting…',pendingEmail:'',cooldownUntil:0};
  }
  emit(){if(!this.disposed)this.onChange({...this.state,recoveryReady:this.canRecover(),generation:this.generation,configured:this.configured});}
  canRecover(){return Boolean(this.recoveryUser&&this.recoveryUser===this.state.session?.user?.id&&this.recoveryToken===this.state.session?.access_token);}
  async bounded(promise){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new AccountError('Request timed out.',{code:'request_timeout'})),this.timeoutMs);})]);}finally{clearTimeout(timer);}}
  async start(){
    if(!this.configured){this.state={...this.state,mode:'unconfigured',message:unconfiguredMessage};this.emit();return;}
    this.subscription=this.client.onAuthStateChange((event,session)=>{this.defer(()=>{if(!this.disposed)this.receive(event,session);});})?.data?.subscription;
    const generation=this.generation;
    try{const {data,error}=await this.bounded(this.client.getSession());if(this.disposed||generation!==this.generation)return;if(error)throw error;
      this.state.session=data?.session||null;
      if(this.callbackError){this.state.mode='reset';this.state.message='That link is invalid or has expired. Use your saved recovery code, or return to sign in.';}
      else if(this.recoveryRequested&&!this.canRecover()){this.state.mode='reset';this.state.message='Enter your saved recovery code below.';}
      else this.adopt(this.state.session);
    }catch(error){if(generation!==this.generation||this.disposed)return;this.state.mode='signin';this.state.message=authMessage(error);}
    this.emit();
  }
  adopt(session){
    this.state.session=session||null;
    if(this.canRecover()){this.state.mode='recover';this.state.message='Choose a new password for this account.';}
    else if(verifiedSession(session)){this.state.mode='authenticated';this.state.message='';}
    else if(session?.user?.email){this.state.mode='signin';this.state.message='Your account needs attention before sign-in can continue.';}
    else{this.state.mode='signin';this.state.message='';}
  }
  receive(event,session){
    if(this.disposed)return;
    if(this.state.busy&&['SIGNED_IN','PASSWORD_RECOVERY','USER_UPDATED'].includes(event)){this.deferredAuthEvent=true;return;}
    if(event==='INITIAL_SESSION')return; // start() owns bootstrap/callback intent.
    const before=this.state.session?.user?.id||null,after=session?.user?.id||null;
    if(event==='SIGNED_OUT'){
      this.generation++;this.recoveryUser=null;this.recoveryToken=null;this.state={mode:'signin',session:null,busy:false,message:'You’ve signed out on this device.',pendingEmail:'',cooldownUntil:0};this.emit();return;
    }
    if(!['PASSWORD_RECOVERY','SIGNED_IN','TOKEN_REFRESHED','USER_UPDATED'].includes(event))return;
    if(event==='PASSWORD_RECOVERY'){
      if(!session?.access_token||!verifiedSession(session)||this.callbackError)return;
      this.generation++;this.recoveryUser=after;this.recoveryToken=session.access_token;this.state.busy=false;this.state.session=session;this.state.mode='recover';this.state.message='Choose a new password for this account.';this.emit();return;
    }
    if(event==='SIGNED_IN'&&this.recoveryUser&&session?.access_token!==this.recoveryToken){this.generation++;this.recoveryUser=null;this.recoveryToken=null;this.state.busy=false;this.adopt(session);this.emit();return;}
    if(event==='TOKEN_REFRESHED'&&this.recoveryUser===after)this.recoveryToken=session?.access_token||null;
    if(before!==after){this.generation++;this.recoveryUser=null;this.recoveryToken=null;this.state.busy=false;this.state.pendingEmail='';this.state.cooldownUntil=0;this.adopt(session);}
    else{this.state.session=session;if(!session){this.recoveryUser=null;this.recoveryToken=null;this.state.mode='signin';}else if(this.state.mode==='authenticated'&&!verifiedSession(session))this.adopt(session);}
    this.emit();
  }
  choose(mode){
    if(this.disposed||!this.configured||this.state.busy||!['signin','signup','reset','verify'].includes(mode))return false;
    this.generation++;this.recoveryUser=null;this.recoveryToken=null;this.state.mode=mode;this.state.message=mode==='verify'?verificationMessage:'';this.emit();return true;
  }
  async perform(intent,action,success){
    if(!this.configured||this.state.busy||this.disposed)return false;
    const generation=++this.generation;this.deferredAuthEvent=false;this.state.busy=true;this.state.message='Please wait…';this.emit();
    try{const result=await this.bounded(action());if(this.disposed||generation!==this.generation)return false;if(result?.error)throw result.error;success(result||{});return true;}
    catch(error){if(!this.disposed&&generation===this.generation){
      if(['resend'].includes(intent)&&duplicateCode(error)){this.state.message=intent==='reset'?resetMessage:verificationMessage;if(intent!=='reset')this.state.mode='verify';this.state.cooldownUntil=this.now()+60000;}
      else{this.state.message=intent==='signup'&&duplicateCode(error)?'That username is already taken. Try another or sign in.':authMessage(error,intent);if(error?.status===429||/rate_limit/.test(error?.code||''))this.state.cooldownUntil=this.now()+60000;}
    }return false;}
    finally{
      if(!this.disposed&&generation===this.generation&&this.deferredAuthEvent){
        try{
          const {data,error}=await this.bounded(this.client.getSession());if(error)throw error;
          if(!this.disposed&&generation===this.generation){
            const latest=data?.session||null;
            if((latest?.user?.id||null)!==(this.state.session?.user?.id||null)){
              this.recoveryUser=null;this.recoveryToken=null;this.state.backupCode=null;this.adopt(latest);
              this.state.message='The signed-in account changed in another tab.';
            }else if(latest)this.state.session=latest;
          }
        }catch{
          if(!this.disposed&&generation===this.generation){this.recoveryUser=null;this.recoveryToken=null;this.state.backupCode=null;this.adopt(null);this.state.message='Your session changed. Sign in again to continue.';}
        }
      }
      if(!this.disposed&&generation===this.generation){this.state.busy=false;this.emit();}
    }
  }
  async submit({email='',password=''}){
    const mode=this.state.mode;email=email.trim();
    if(!['signin','signup','reset','recover'].includes(mode))return false;
    if(mode==='recover'&&!this.canRecover())return false;
    if(mode==='reset'&&this.now()<this.state.cooldownUntil)return false;
    if(mode!=='recover'&&(!email||email.length>254)){this.state.message=mode==='reset'?'Enter your recovery code.':'Enter your username.';this.emit();return false;}
    if(['signup','recover'].includes(mode)&&password.length<10){this.state.message='Use at least 10 characters for your password.';this.emit();return false;}
    if(mode==='signin'&&!password){this.state.message='Enter your password.';this.emit();return false;}
    if(['signup','reset'].includes(mode))this.state.pendingEmail=email;
    if(mode==='signup')return this.perform('signup',()=>this.client.signUp({email,password,options:{emailRedirectTo:this.origin+'/login'}}),({data})=>{
      if(verifiedSession(data?.session)){this.adopt(data.session);this.state.backupCode=data.recoveryCode||null;this.state.message=data.recoveryWarning||'';}else{this.state.mode='signin';this.state.message='Account setup is not ready. Please try again later.';}
    });
    if(mode==='reset')return this.perform('reset',()=>this.client.recoverWithCode(email),({data})=>{if(!verifiedSession(data?.session))throw new AccountError('Recovery was not confirmed.');this.state.session=data.session;this.recoveryUser=data.session.user.id;this.recoveryToken=data.session.access_token;this.state.mode='recover';this.state.message='Recovery code accepted. Choose a new password.';});
    if(mode==='recover')return this.perform('recover',()=>this.client.updateUser({password}),()=>{this.recoveryUser=null;this.recoveryToken=null;this.state.mode='authenticated';this.state.message='Password updated. Open Account to create a new recovery code; the previous code has been used.';});
    return this.perform('signin',()=>this.client.signInWithPassword({email,password}),({data})=>{if(!data?.session)throw new AccountError('No session returned.');this.adopt(data.session);});
  }
  async resend(){return false;}
  async signOut(){return this.perform('signout',()=>this.client.signOut({scope:'local'}),()=>{this.generation++;this.recoveryUser=null;this.recoveryToken=null;this.state={mode:'signin',session:null,busy:false,message:'You’ve signed out on this device.',pendingEmail:'',cooldownUntil:0};this.emit();});}
  dispose(){this.disposed=true;this.generation++;this.recoveryUser=null;this.recoveryToken=null;this.state.session=null;this.state.pendingEmail='';this.subscription?.unsubscribe();}
}

export function tokenError(error){
  if(error instanceof AccountError)return error;
  const expired=error?.status===401||error?.name==='AuthSessionMissingError'||['refresh_token_not_found','refresh_token_already_used','invalid_refresh_token','session_not_found','bad_jwt','invalid_jwt','user_not_found'].includes(error?.code);
  return new AccountError(expired?'Please sign in again.':authMessage(error,'session'),{code:expired?'auth_required':'session_unavailable',status:expired?401:503});
}

export function createAccountRequest({configured,getToken,fetcher=fetch,url,key}){
  return async(path,body)=>{
    if(!configured)throw new AccountError(unconfiguredMessage,{code:'account_unconfigured'});
    let jwt;try{jwt=await getToken();}catch(error){throw tokenError(error);}if(!jwt)throw new AccountError('Please sign in again.',{code:'auth_required',status:401});
    let response;
    try{response=await fetcher(`${url}/functions/v1/clock${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:key,Authorization:`Bearer ${jwt}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(10000)});}
    catch(error){throw new AccountError(authMessage(error),{code:error?.name==='TimeoutError'?'request_timeout':'network_error'});}
    let data;try{data=await response.json();}catch{throw new AccountError('The account service returned an unreadable response. Please try again.');}
    if(response.status===401){
      let current;try{current=await getToken();}catch(error){throw tokenError(error);}
      // This response rejected only the credential sent with this request.
      // Do not sign out a newer session, or replay an action as another owner.
      if(current&&current!==jwt)throw new AccountError('Your session changed while this request was in progress. Please try again.',{code:'session_changed',status:503});
    }
    if(!response.ok)throw new AccountError(response.status===401?'Please sign in again.':response.status===429?'Too many requests. Wait a little, then try again.':typeof data?.error==='string'?data.error:'The account service is unavailable. Please try again.',{status:response.status,code:data?.code||'account_request_failed',retryAfter:Number(response.headers.get('Retry-After'))||0});
    return data;
  };
}
