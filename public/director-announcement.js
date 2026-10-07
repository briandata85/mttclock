// Unlock local audio during the button gesture; delivery to the display remains
// independent of local speaker availability. Never repeat a rejected command.
export async function announceFromDirector({sound,text,volume,send,canPlay=()=>true}) {
  sound.volume=volume;
  const ready=sound.enable().then(()=>true,()=>false);
  const sent=await send('announce',{text});
  const localReady=await ready;
  if(!sent)return {sent:false,local:false};
  const local=localReady&&canPlay()&&await sound.announce(text,canPlay)===true;
  return {sent:true,local};
}
