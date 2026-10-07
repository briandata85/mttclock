// Compatibility with an older hosted service, without deploying it or modifying saves.
// Call only immediately after creating a fresh tournament, never for duplicates.
export async function initializeNewTournament(request,id,commandId=()=>crypto.randomUUID()) {
  const packet=await request(`/t/${id}/state`);
  if(packet.state.tableNumbers===''&&packet.state.showTableNumbers===false)return;
  if(packet.revision!==0)throw new Error('This tournament was already edited on another screen. Its settings were kept.');
  await request(`/t/${id}/command`,{id:commandId(),revision:packet.revision,type:'settings',patch:{tableNumbers:'',showTableNumbers:false}});
}

// A navigation hint only, never an authorization signal or a setup command.
// The caller must already have loaded and accepted the server's owner state.
export function consumeCreationSetup({view,role,location,history,recovery=false}) {
  if(view!=='director'||role!=='director'||recovery)return false;
  const query=new URLSearchParams(location.search),values=query.getAll('setup');
  if(values.length!==1||values[0]!=='1')return false;
  // Do not handle onboarding while an Auth callback/recovery is in progress.
  const fragment=new URLSearchParams((location.hash||'').replace(/^#/,''));
  if(['code','recovery','error','error_code','error_description','token_hash','access_token','refresh_token'].some(key=>query.has(key)||fragment.has(key))||query.get('intent')==='recovery'||query.get('type')==='recovery'||fragment.get('type')==='recovery')return false;
  // Preserve the spelling/order of all other query values and the whole hash.
  const remaining=location.search.replace(/^\?/,'').split('&').filter(part=>!new URLSearchParams(part).has('setup')).join('&');
  history.replaceState(history.state,'',location.pathname+(remaining?'?'+remaining:'')+(location.hash||''));
  return true;
}
