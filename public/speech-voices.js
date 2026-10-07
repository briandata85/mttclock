export function localVoice(voices=[]) {
  return voices.find(v=>v.localService&&/^en(?:-|$)/i.test(v.lang))||voices.find(v=>v.localService)||null;
}
// Chromium/Edge can return an empty voice list until voiceschanged fires.
export function waitForLocalVoice(synth,{timeoutMs=3000}={}) {
  if(!synth?.getVoices)return Promise.resolve(null);
  const current=localVoice(synth.getVoices());if(current)return Promise.resolve(current);
  return new Promise(resolve=>{
    let done=false,timer;
    const finish=voice=>{if(done)return;done=true;clearTimeout(timer);synth.removeEventListener?.('voiceschanged',changed);resolve(voice);};
    const changed=()=>{const voice=localVoice(synth.getVoices());if(voice)finish(voice);};
    synth.addEventListener?.('voiceschanged',changed);
    timer=setTimeout(()=>finish(localVoice(synth.getVoices())),timeoutMs);
    changed();
  });
}
