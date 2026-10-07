// Browser-local interface preference. Never changes tournament state or TV layout.
export const interfaceStyleKey='pokerclock-interface-style-v1';
export function normalizeInterfaceStyle(value){return value==='forest'?'forest':'current';}
export function readInterfaceStyle(storage){try{return normalizeInterfaceStyle(storage?.getItem(interfaceStyleKey));}catch{return 'current';}}
export function saveInterfaceStyle(storage,value){try{storage?.setItem(interfaceStyleKey,normalizeInterfaceStyle(value));return !!storage;}catch{return false;}}
export function installInterfaceStyle(doc,win){
  let storage;try{storage=win.localStorage;}catch{}
  const buttons=[...doc.querySelectorAll('button[data-interface-style]')];
  const message=doc.getElementById('interface-style-status');
  const apply=value=>{const style=normalizeInterfaceStyle(value);doc.documentElement.dataset.interfaceStyle=style;for(const button of buttons)button.setAttribute('aria-pressed',String(button.dataset.interfaceStyle===style));return style;};
  apply(readInterfaceStyle(storage));
  for(const button of buttons)button.addEventListener('click',()=>{
    const style=apply(button.dataset.interfaceStyle),saved=saveInterfaceStyle(storage,style);
    if(message)message.textContent=saved?'Follows your tournament color. Applies immediately on this browser; your display layout stays unchanged.':'Applied for this visit. Browser storage is unavailable.';
  });
  win.addEventListener('storage',event=>{if(event.storageArea===storage&&(event.key===interfaceStyleKey||event.key===null))apply(readInterfaceStyle(storage));});
}
if(typeof document!=='undefined'&&typeof window!=='undefined')installInterfaceStyle(document,window);
