import {settingKeys} from './settings-draft.js';

export const recoveryHeld=(connection,error)=>!!connection?.recoveryRequired||error?.code==='RECOVERY_REQUIRED';
export function requireWritable(connection){
  if(connection?.recoveryRequired)throw connection.recoveryRequired;
  if(!connection?.online)throw new Error('Connection lost. Your changes are kept in this tab.');
}
export function recoverySaveMessage(pendingSave){
  return pendingSave?'Save unconfirmed. It may have reached the host. Your draft and original save request are retained in this tab; retries are paused.':'This screen is paused. Your unsaved changes are retained in this tab.';
}
// Read-only review text deliberately includes only editable setup values, never
// credentials, history, or the authoritative clock. This is not a restore file.
export function retainedChangesText(draft,structureDraft,pendingSave){
  const lines=[];
  if(pendingSave){
    lines.push(`Unconfirmed save: ${pendingSave.id}. It may have reached the host. Do not assume it failed.`);
    // An SSE echo can make the draft clean before the HTTP save is confirmed.
    // Preserve the original requested values for comparison in that case too.
    for(const key of settingKeys)if(Object.hasOwn(pendingSave.patch||{},key))lines.push(`Unconfirmed requested ${key}: ${JSON.stringify(pendingSave.patch[key],null,2)}`);
    if(pendingSave.structure)lines.push(`Unconfirmed requested blind structure: ${JSON.stringify({preset:pendingSave.structure.preset,levels:pendingSave.structure.levels},null,2)}`);
  }
  for(const key of settingKeys){
    if(!draft?.paths.some(path=>path[0]===key))continue;
    lines.push(`${key}: ${JSON.stringify(draft.value[key],null,2)}`);
  }
  if(structureDraft)lines.push(`Retained blind structure: ${JSON.stringify({preset:structureDraft.preset,levels:structureDraft.levels},null,2)}`);
  return lines.length?lines.join('\n\n'):'No unsaved setup changes are retained in this tab.';
}
export function renderRecoveryNotices(doc,{reason,draft,structureDraft,pendingSave,reviewPath}){
  for(const id of ['recovery-board','recovery-drawer'])doc.getElementById(id).hidden=!reason;
  doc.getElementById('setup-drawer').classList.toggle('recovery-held',!!reason);
  if(!reason)return;
  for(const id of ['recovery-board-message','recovery-drawer-message'])doc.getElementById(id).textContent=
    'This screen is paused: the host returned an earlier saved state. The countdown shown here is frozen at its last known state. The host tournament may still be running.';
  doc.getElementById('recovery-retention').textContent=recoverySaveMessage(pendingSave)+' Keep this tab open. Open a separate view to compare before making more changes.';
  const retained=doc.getElementById('recovery-retained'),text=retainedChangesText(draft,structureDraft,pendingSave);
  if(retained.value!==text)retained.value=text;
  // Only the current same-app path is used, never a server-supplied recovery URL.
  const path=typeof reviewPath==='string'&&reviewPath.startsWith('/')&&!reviewPath.startsWith('//')?reviewPath:'/';
  for(const id of ['recovery-board-review','recovery-drawer-review']){
    const link=doc.getElementById(id);link.setAttribute('href',path);link.setAttribute('target','_blank');link.setAttribute('rel','noopener');
  }
}
