import {usernameClient,usernameRequest,accountName} from './username-auth.js';
import {auth,accountRequest,safeReturn,accountConfigured} from './cloud-auth.js';
import {AccountAuthFlow,callbackHasError,newCreationId} from './account-auth.js';
import {initializeNewTournament} from './new-tournament.js';
import {setControlIcon} from './controls.js';
import {savedProgressLabels} from './tournament-summary.js';

export function mountAccountPage({document=globalThis.document,location=globalThis.location,history=globalThis.history,client=usernameClient,configured=accountConfigured,request=accountRequest,initialize=initializeNewTournament,now=Date.now,authOptions={},lifecycle=globalThis}={}){
const $=id=>document.getElementById(id),params=new URLSearchParams(location.search);
const settingsView=location.pathname==='/account';
let busy=false,trashView=false,capabilities={},dialogAction=null,pendingCreation=null,renderedOwner=null,lastMode='',lastIdentity=null,managementEpoch=0,redirected=false;
let authWasBusy=false,authFocus=null,modeFocus=null;
let flow;
function message(text){$('account-status').textContent=text;}
function focusIfUnclaimed(target,origin){
  const active=document.activeElement,dialog=target?.closest?.('dialog');
  if(redirected||flow?.disposed||!target||target.isConnected===false||target.disabled||target.hidden||target.closest?.('[hidden]')||dialog&&!dialog.open)return;
  if(!active||active===document.body||active===document.documentElement||active===origin)target.focus();
}
function canPaint(generation,owner){return flow.state.mode==='authenticated'&&flow.generation===generation&&flow.state.session?.user?.id===owner;}
function clearPrivateView(){
  managementEpoch++;busy=false;capabilities={};dialogAction=null;pendingCreation=null;trashView=false;renderedOwner=null;
  $('tournament-list').replaceChildren();$('tournament-list').setAttribute('aria-busy','false');$('tournament-dialog').close();$('backup-dialog').close();$('delete-account-dialog').close();$('delete-account-password').value='';$('delete-account-confirmation').value='';$('backup-code').value='';$('account-current-password').value='';$('recovery-current-password').value='';$('account-email').textContent='';$('settings-email').textContent='';
  $('tournament-name').value='';$('tournament-name').readOnly=false;$('cancel-create').hidden=true;$('reuse-name').value='';$('password').value='';
}
function disableButtons(){
  const locked=busy||flow?.state.busy;
  document.querySelectorAll('button').forEach(b=>b.disabled=!!(locked||b.dataset.unavailable||b.dataset.requires&&!capabilities[b.dataset.requires]));
  if(!configured)document.querySelectorAll('button').forEach(b=>b.disabled=true);

}
async function locked(action){
  if(busy||flow.state.busy||flow.state.mode!=='authenticated')return;
  const focusOrigin=document.activeElement,epoch=++managementEpoch,generation=flow.generation,owner=flow.state.session?.user?.id;busy=true;disableButtons();
  const current=()=>epoch===managementEpoch&&canPaint(generation,owner);
  try{await action(current);}catch(error){if(current()){if(error.status===401){flow.receive('SIGNED_OUT',null);message('Your session needs to be renewed. Please sign in again.');}else message(error.message||'The account service is unavailable. Please try again.');}}
  finally{if(epoch===managementEpoch){busy=false;disableButtons();if(current())focusIfUnclaimed(focusOrigin,focusOrigin);}}
}
function renderAuth(state){
  const activeBefore=document.activeElement;
  if(state.busy&&!authWasBusy)authFocus={mode:state.mode,element:activeBefore};
  const finishedAuth=authWasBusy&&!state.busy;authWasBusy=state.busy;
  const identity=state.session?.user?.id||null;
  if(identity!==lastIdentity||state.mode==='signin'&&lastMode==='authenticated'){clearPrivateView();lastIdentity=identity;}
  const authenticated=state.mode==='authenticated',form=['signin','signup','reset','recover'].includes(state.mode),recover=state.mode==='recover',reset=state.mode==='reset',signup=state.mode==='signup';
  $('account-navigation').hidden=false;
  $('nav-account').hidden=!authenticated;
  $('nav-tournaments').hidden=!authenticated||!settingsView;
  $('nav-tournaments').setAttribute('aria-current',authenticated&&!settingsView?'page':'false');
  $('nav-account').setAttribute('aria-current',authenticated&&settingsView?'page':'false');
  $('account-unconfigured').hidden=state.mode!=='unconfigured';$('account-login').hidden=!form;
  $('account-dashboard').hidden=!authenticated||settingsView;$('account-settings').hidden=!authenticated||!settingsView;
  $('auth-title').textContent=recover?'Choose a new password':reset?'Reset your password':signup?'Create your account':'Welcome back';
  $('auth-intro').textContent=recover?'Your recovery code was accepted. Choose a new password.':reset?'Enter your saved recovery code. It works once; you’ll create a new one after signing in.':signup?'Save your tournaments and run them from your PC or phone.':'Sign in to save tournaments and control them from your PC or phone.';
  $('auth-submit').textContent=recover?'Save password':reset?'Use recovery code':signup?'Create account':'Sign in';
  $('auth-switch').textContent=recover?'Cancel password reset':state.mode==='signin'?'Create an account':'Back to sign in';
  $('email-label').hidden=recover;$('email').required=!recover;
  $('identity-label').textContent=reset?'Recovery code':signup?'Username':'Username or existing email';$('email').autocomplete=reset?'off':'username';$('email').placeholder=reset?'Your saved recovery code':signup?'e.g. friday_poker':'';
  $('username-hint').hidden=!signup;
  $('password-label').hidden=reset;$('password').required=!reset;$('show-password').hidden=reset;
  $('password').minLength=signup||recover?10:1;$('password').autocomplete=signup||recover?'new-password':'current-password';
  $('password-hint').hidden=!signup&&!recover;$('auth-reset').hidden=state.mode!=='signin';
  if(lastMode!==state.mode){$('password').value='';$('password').type='password';$('show-password').setAttribute('aria-label','Show password');$('show-password').setAttribute('aria-pressed','false');}
  // Token refresh can arrive while a list/action is pending. Keep its useful
  // progress feedback instead of replacing it with an empty Auth message.
  if(!busy||state.message)message(state.message);disableButtons();
  const changedMode=lastMode!==state.mode;lastMode=state.mode;
  if(changedMode)modeFocus={mode:state.mode,element:authFocus?.element||activeBefore};
  if(authenticated){
    $('account-email').textContent=accountName(state.session.user);$('settings-email').textContent=accountName(state.session.user);
    if(state.backupCode){showBackup(state.backupCode);return;}
    if(settingsView&&changedMode)readyProfile();
    const next=safeReturn(params.get('next'));
    if(!redirected&&next!=='/tournaments'&&next!==location.pathname){redirected=true;location.replace(next);return;}
    if(renderedOwner!==identity){renderedOwner=identity;if(!settingsView){history.replaceState(null,'','/tournaments');locked(async current=>{message('Loading saved tournaments…');await refresh();if(current()&&state.message)message(state.message);});}}
  }
  if(!state.busy){
    const id=state.mode==='unconfigured'?'unconfigured-title':form?'auth-title':authenticated?(settingsView?'settings-title':'dashboard-title'):null;
    if(modeFocus?.mode===state.mode){if(id)focusIfUnclaimed($(id),modeFocus.element);modeFocus=null;}
    else if(finishedAuth&&authFocus?.mode===state.mode){const origin=authFocus.element;focusIfUnclaimed(origin?.disabled&&id?$(id):origin,origin);}
    if(finishedAuth)authFocus=null;
  }
}
function actionContent(element,label,icon){
  const symbol=document.createElement('span'),text=document.createElement('span');
  symbol.className='action-symbol';setControlIcon(symbol,icon);text.className='action-label';text.textContent=label;
  element.replaceChildren(symbol,text);
}
async function refresh(nextTrash=trashView){
  const generation=flow.generation,owner=flow.state.session?.user?.id;
  message('Loading saved tournaments…');$('tournament-list').setAttribute('aria-busy','true');
  let data;try{data=await request(nextTrash?'/tournaments?trash=1':'/tournaments');}finally{if(canPaint(generation,owner))$('tournament-list').setAttribute('aria-busy','false');}
  const tournaments=data.tournaments;if(!canPaint(generation,owner))return false;trashView=nextTrash;capabilities=Object.fromEntries(['trash','permanentDelete','reuse','idempotentCreate'].map(key=>[key,data.capabilities?.[key]===true]));
  $('create-capability-note').hidden=capabilities.idempotentCreate;
  $('show-trash').hidden=true;
  $('list-heading').textContent=trashView?'Trash':'Saved Tournaments';
  $('create-form').hidden=trashView;$('trash-help').hidden=!trashView;
  $('reuse-help').hidden=trashView;$('tournament-list').setAttribute('aria-label',trashView?'Deleted tournaments':'Saved tournaments');
  $('account-capability-note').hidden=!!(capabilities.permanentDelete&&capabilities.reuse);
  const focusedAction=document.activeElement,focusKey=$('tournament-list').contains(focusedAction)?focusedAction?.dataset?.focusKey:null;
  let replacementFocus=null;
  $('tournament-list').replaceChildren();
  if(!tournaments.length){const empty=document.createElement('div');empty.className='empty-state';const title=document.createElement('h3'),p=document.createElement('p');title.textContent=trashView?'Nothing in Trash':'Your First Tournament';p.textContent=trashView?'Deleted tournaments will appear here, ready to restore.':'Create your first tournament above. You can reuse its setup for every game night.';empty.append(title,p);$('tournament-list').append(empty);}
  for(const item of tournaments){
    const card=document.createElement('article');card.className='tournament-card';
    const progress=!trashView?savedProgressLabels(item.summary):null;
    const topActions=document.createElement('div');topActions.className='tournament-card-tools';
    const heading=document.createElement('div');heading.className='tournament-card-heading'+(progress?' has-progress':'');
    const title=document.createElement('h3');title.textContent=item.name;
    const badge=document.createElement('span');badge.className='saved-badge';badge.textContent=trashView?'In Trash':'Saved';
    heading.append(title,badge);
    const info=document.createElement('p');info.className='saved-date';const date=new Date(trashView?item.deleted_at:item.updated_at),time=document.createElement('time');
    if(Number.isFinite(date.getTime())){time.dateTime=date.toISOString();time.textContent=date.toLocaleString(undefined,{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});}else time.textContent='Date unavailable';
    info.append(document.createTextNode(trashView?'Deleted ':'Last saved '),time);
    const actions=document.createElement('div');actions.className='actions tournament-actions';
    if(!trashView)for(const [label,view] of [['Open Director','director'],['Open Display','display']]){const a=document.createElement('a');actionContent(a,label,view==='director'?'play':'display');a.className='action'+(view==='display'?' secondary':'');a.href=`/t/${item.id}/${view}`;a.dataset.focusKey=`${item.id}:${view}`;if(a.dataset.focusKey===focusKey)replacementFocus=a;a.setAttribute('aria-label',`${label}: ${item.name}${view==='display'?' (opens in a new tab)':''}`);if(view==='display'){a.target='_blank';a.rel='noopener';a.title='Open display in a new tab';}actions.append(a);}
    for(const [action,label] of trashView?[['restore','Restore']]:[['reuse','Use Again'],['delete','Delete']]){
      const button=document.createElement('button');button.type='button';actionContent(button,label,action==='delete'?'trash':'restore');button.className=action==='delete'?'text-button danger':'secondary';button.dataset.requires=action==='reuse'?'reuse':action==='delete'?'permanentDelete':'trash';button.setAttribute('aria-label',`${label}: ${item.name}`);button.title=action==='reuse'?'Create a fresh tournament with this saved setup':`${label}: ${item.name}`;button.onclick=()=>openTournamentDialog(item,action);if(action==='reuse')topActions.append(button);else actions.append(button);
      button.dataset.focusKey=`${item.id}:${action}`;if(button.dataset.focusKey===focusKey)replacementFocus=button;
    }
    card.append(topActions,heading,info);
    if(progress){
      const section=document.createElement('section');section.className='saved-progress';section.setAttribute('aria-label','Progress at last save');
      const label=document.createElement('p');label.className='saved-progress-label';label.textContent='At last save';
      const facts=document.createElement('dl');
      for(const [name,value] of [['Status',progress.status],['Clock',progress.clock],['Players left / entries',progress.players]]){
        if(value===null)continue;const fact=document.createElement('div'),term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=name;detail.textContent=value;fact.append(term,detail);facts.append(fact);
      }
      section.append(label,facts);card.append(section);
    }
    card.append(actions);$('tournament-list').append(card);
  }
  message('');disableButtons();if(focusKey)focusIfUnclaimed(replacementFocus&&!replacementFocus.disabled?replacementFocus:$('list-heading'),focusedAction);return true;
}
function openTournamentDialog(item,action){
  if(busy||flow.state.mode!=='authenticated')return;
  dialogAction={item,action,creationId:newCreationId(),focusOrigin:document.activeElement};$('tournament-dialog-error').textContent='';
  $('reuse-name').readOnly=false;
  $('tournament-dialog-title').textContent=action==='reuse'?'Use this setup again':action==='delete'?'Delete tournament?':'Restore tournament?';
  $('tournament-dialog-description').textContent=action==='reuse'?`Use the last saved settings from “${item.name}”. The original stays unchanged. Save any open setup draft in its Director screen first.`:action==='delete'?`Permanently delete “${item.name}” and its saved tournament history? Its director and display links will stop working. This cannot be undone. Images in your saved library will remain.`:`Restore “${item.name}”? Its saved setup and results will return, paused. Its existing sharing links will work again.`;
  $('reuse-details').hidden=$('reuse-name-label').hidden=action!=='reuse';$('reuse-name').required=action==='reuse';$('reuse-name').value=`${item.name.slice(0,54)} — copy`;
  $('tournament-dialog-submit').textContent=action==='reuse'?'Create New':action==='delete'?'Delete Permanently':'Restore tournament';
  $('tournament-dialog-submit').classList.toggle('danger',action==='delete');
  $('tournament-dialog').showModal();(action==='reuse'?$('reuse-name'):$('tournament-dialog-cancel')).focus();
}
$('tournament-dialog-cancel').onclick=()=>{if(!busy){$('tournament-dialog').close();dialogAction=null;}};
$('tournament-dialog').oncancel=e=>{if(busy)e.preventDefault();else dialogAction=null;};
$('tournament-dialog-form').onsubmit=e=>{e.preventDefault();return locked(async current=>{
  if(!dialogAction)return;const actionState=dialogAction,{item,action,creationId}=actionState;
  const name=$('reuse-name').value.trim();if(action==='reuse'&&!name){$('tournament-dialog-error').textContent='Enter a name for the new tournament.';return;}
  // Hold the same creation ID/name after an uncertain response: retry cannot make two copies.
  dialogAction.payload??=action==='reuse'?{name,creationId}:{revision:item.revision,confirmation:'DELETE'};
  $('reuse-name').readOnly=true;$('tournament-dialog-error').textContent='';
  try{await request(`/t/${item.id}/${action}`,actionState.payload);}
  catch(error){if(error?.status===401)throw error;if(current())$('tournament-dialog-error').textContent=(error.message||'The action was not confirmed.')+' You can retry this action safely, or cancel and refresh the list.';return;}
  if(!current()||dialogAction!==actionState)return;
  $('tournament-dialog').close();dialogAction=null;$('reuse-name').readOnly=false;
  const result=action==='reuse'?'Tournament created with your saved setup, zero entrants and a fresh clock. The original is unchanged.':action==='delete'?'Tournament permanently deleted.':'Tournament restored, paused. Open Director when you are ready.';
  try{await refresh();if(current()){focusIfUnclaimed($('list-heading'),actionState.focusOrigin);message(result);}}catch(error){if(error?.status===401)throw error;if(current()){focusIfUnclaimed($('list-heading'),actionState.focusOrigin);message(result+' The list could not refresh; use Refresh to reload it.');}}
});};
$('refresh-tournaments').onclick=()=>locked(()=>refresh());
$('show-trash').onclick=()=>locked(()=>refresh(!trashView));
$('auth-switch').onclick=()=>flow.state.mode==='recover'?flow.signOut():flow.choose(flow.state.mode==='signin'?'signup':'signin');
$('auth-reset').onclick=()=>flow.choose('reset');
$('show-password').onclick=()=>{const show=$('password').type==='password';$('password').type=show?'text':'password';$('show-password').setAttribute('aria-label',show?'Hide password':'Show password');$('show-password').setAttribute('aria-pressed',String(show));};
$('auth-form').onsubmit=e=>{e.preventDefault();const input={email:$('email').value,password:$('password').value};$('password').value='';return flow.submit(input);};
$('create-form').onsubmit=e=>{e.preventDefault();return locked(async current=>{
  if(!capabilities.idempotentCreate){message('Creating tournaments is unavailable until the account service supports safe retries.');return;}
  const name=$('tournament-name').value.trim();if(!name){message('Enter a tournament name.');return;}
  pendingCreation??={name,creationId:newCreationId()};const attempt=pendingCreation;
  $('tournament-name').value=attempt.name;$('tournament-name').readOnly=true;$('cancel-create').hidden=false;
  message('Saving tournament…');let created;
  try{created=await request('/tournaments',attempt);}catch(error){if(error?.status===401)throw error;if(current())message((error.message||'Creation was not confirmed.')+' Retry to recover this same tournament, or cancel the retry and refresh the list.');return;}
  if(!current()||pendingCreation!==attempt)return;
  pendingCreation=null;$('tournament-name').readOnly=false;$('cancel-create').hidden=true;
  try{await initialize((...args)=>{if(!current())throw new Error('Account changed.');return request(...args);},created.id,()=>newCreationId());}catch(error){
    if(error?.status===401)throw error;if(!current())return;try{await refresh();}catch(refreshError){if(refreshError?.status===401)throw refreshError;}
    if(current())message('Tournament created. Open its Director link to check table settings. The initial setup was not confirmed.');return;
  }
  if(current()){redirected=true;location.assign(`/t/${created.id}/director?setup=1`);}
});};
$('cancel-create').onclick=()=>{if(busy)return;pendingCreation=null;$('tournament-name').readOnly=false;$('cancel-create').hidden=true;message('Retry cancelled. This does not delete a tournament that may already have been created. Refresh the list before creating another.');};
for(const id of ['sign-out','settings-sign-out'])$(id).onclick=()=>flow.signOut();
function showBackup(code){
  $('backup-copy').textContent='Copy Code';$('backup-code').value=code;if(!$('backup-dialog').open)$('backup-dialog').showModal();
}
function installUsernameSettings(){
 $('delete-account').onclick=()=>{if(busy)return;$('delete-account-error').textContent='';$('delete-account-password').value='';$('delete-account-confirmation').value='';$('delete-account-dialog').showModal();$('delete-account-cancel').focus();};
 $('delete-account-cancel').onclick=()=>{if(!busy){$('delete-account-dialog').close();$('delete-account-password').value='';$('delete-account-confirmation').value='';}};
 $('delete-account-dialog').oncancel=e=>{if(busy)e.preventDefault();else{$('delete-account-password').value='';$('delete-account-confirmation').value='';}};
 $('delete-account-form').onsubmit=e=>{e.preventDefault();return locked(async current=>{
  const password=$('delete-account-password').value,confirmation=$('delete-account-confirmation').value;$('delete-account-error').textContent='';
  try{const result=await usernameRequest('/delete',{password,confirmation});if(!current())return;if(!result.deleted)throw new Error('Deletion was not confirmed.');$('delete-account-dialog').close();await client.signOut({scope:'local'});redirected=true;location.replace('/login?deleted=1');}
  catch(error){if(current())$('delete-account-error').textContent=(error.message||'Account deletion was not confirmed.')+' If deletion already started, some data may have been removed. Retry to finish.';}
  finally{$('delete-account-password').value='';}
 });};
 $('backup-dialog').oncancel=e=>e.preventDefault();
 $('backup-done').onclick=()=>{$('backup-dialog').close();$('delete-account-dialog').close();$('delete-account-password').value='';$('delete-account-confirmation').value='';$('backup-code').value='';flow.state.backupCode=null;flow.emit();};
 $('backup-copy').onclick=async()=>{try{await navigator.clipboard.writeText($('backup-code').value);$('backup-copy').textContent='Copied';}catch{$('backup-code').select();}};
 $('username-form').onsubmit=e=>{e.preventDefault();return locked(async current=>{
  const password=$('account-current-password').value,name=$('account-username').value;let result;
  try{result=await usernameRequest('/username',{username:name,password});}finally{$('account-current-password').value='';}
  if(!current())return;await client.refreshSession();$('settings-email').textContent=result.username;$('username-form').hidden=true;message('Username saved. Use it with your existing password.');
 });};
 $('recovery-code-form').onsubmit=e=>{e.preventDefault();return locked(async current=>{
  const password=$('recovery-current-password').value;let result;
  try{result=await usernameRequest('/recovery-code',{password});}finally{$('recovery-current-password').value='';}
  if(current()){showBackup(result.code);message('New recovery code created. Your previous code no longer works.');}
 });};
 
}
async function readyProfile(){
 const expectedOwner=flow.state.session?.user?.id;
 await new Promise(resolve=>setTimeout(resolve,0));
 try{const result=await usernameRequest('/profile');if(flow.state.mode!=='authenticated'||flow.state.session?.user?.id!==expectedOwner)return;$('username-form').hidden=!!result.username||result.deletionPending;$('recovery-code-form').hidden=!!result.deletionPending;$('delete-account').textContent=result.deletionPending?'Finish Account Deletion':'Delete Account';if(result.deletionPending)message('Account deletion is in progress. Finish it below; changes to tournaments and images are blocked.');$('recovery-note').textContent=result.hasRecoveryCode?'Keep your recovery code somewhere safe. Creating a new code replaces the old one.':'Create a recovery code before signing out. Without your password or recovery code, your account cannot be recovered.';}catch{}
}
flow=new AccountAuthFlow({client,configured,origin:location.origin,onChange:renderAuth,now,recoveryRequested:params.get('recovery')==='1'||params.get('intent')==='recovery',callbackError:callbackHasError(location.search,location.hash),timeoutMs:45000,...authOptions});
installUsernameSettings();
const timer=setInterval(disableButtons,1000);
const ready=flow.start().then(()=>{if(params.get('deleted')==='1'&&flow.state.mode==='signin')message('Your account has been deleted.');if(settingsView&&flow.state.mode==='authenticated')readyProfile();
  // Auth consumes callback data first. Keep only an allowlisted local return path.
  if(location.hash||params.has('error')||params.has('error_code')||params.has('error_description')||params.has('code')){const next=safeReturn(params.get('next'));history.replaceState(null,'',location.pathname+(next!=='/tournaments'?'?next='+encodeURIComponent(next):''));}
});
function dispose(){clearInterval(timer);flow.dispose();managementEpoch++;}
lifecycle.addEventListener?.('pagehide',()=>{clearPrivateView();$('account-dashboard').hidden=true;$('account-settings').hidden=true;message('Checking your session…');dispose();},{once:true});
lifecycle.addEventListener?.('pageshow',event=>{if(event.persisted)location.reload();});
return {ready,flow,dispose,refresh};
}
if(typeof document!=='undefined')mountAccountPage();
