// Display access controls are available only on a supporting hosted owner session.
export function canManageDisplay(snapshot,cloudMode){return Boolean(cloudMode&&snapshot?.role==='director'&&snapshot.capabilities?.displayAccess===true&&typeof snapshot.displayEnabled==='boolean');}
export function renderDisplayAccess(document,snapshot,{cloudMode=false,blocked=false}={}){
  const panel=document.getElementById('display-access-controls'),button=document.getElementById('display-access-toggle'),status=document.getElementById('display-access-status');
  if(!panel||!button||!status)return;
  const supported=canManageDisplay(snapshot,cloudMode);panel.hidden=!supported;button.disabled=!supported||blocked;
  if(!supported){status.textContent='';return;}
  button.textContent=snapshot.displayEnabled?'Disable Display access':'Enable Display access';
  const message=snapshot.displayEnabled?'Display access is enabled. Anyone with this URL can view the clock and use display sound.':'Display access is disabled. This URL cannot retrieve clock data or request display sound. Re-enabling restores the same URL.';
  if(status.textContent!==message)status.textContent=message;
}
