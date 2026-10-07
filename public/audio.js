import {waitForLocalVoice} from './speech-voices.js';
export class CueAudio {
  constructor(){this.speechEpoch=0;this.context=null;this.enabled=false;this.volume=.7;this.sources=[];this.seen=new Set();this.buffers=new Map();}
  unlock() {
    this.context ||= new (window.AudioContext||window.webkitAudioContext)();
    // Calling from a click/tap unlocks Web Audio on browsers that block autoplay.
    return this.context.resume().catch(()=>{});
  }
  async enable() {
    let timeout;
    try{await Promise.race([this.unlock(),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(new Error('Tap the display once to allow sound.')),700);})]);}
    finally{clearTimeout(timeout);}
    for(const [mark,name] of [['beep','pacer-beep'],[60,'one-minute'],[0,'level-end']]) {
      if(!this.buffers.has(mark)) {
        const response=await fetch(`/audio/${name}.wav`);if(!response.ok)throw new Error('Sound cue audio is unavailable.');
        this.buffers.set(mark,await this.context.decodeAudioData(await response.arrayBuffer()));
      }
    }
    if(this.context.state!=='running')throw new Error('Tap the display once to allow sound.');
    this.enabled=true;
  }
  stop(){this.speechEpoch++;clearTimeout(this.speechTimer);if(this.utterance){window.speechSynthesis?.cancel();this.utterance=null;}for(const source of this.sources){try{source.stop();}catch{}}this.sources=[];}
  disable(){this.enabled=false;this.stop();}
  play(mark){
    // Ignore retired/unknown cues, including ten-second events from an older host.
    if(![60,0].includes(mark) || !this.enabled || this.context?.state!=='running')return;
    this.stop();const ctx=this.context,start=ctx.currentTime+.03;
    // Original synthesized chime; no third-party sound sample is bundled.
    const beep=this.buffers.get('beep');
    if(!beep)return;
    const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=beep;gain.gain.value=this.volume;
    source.connect(gain).connect(ctx.destination);source.start(start);this.sources.push(source);
    if(this.buffers.has(mark)) {const voice=ctx.createBufferSource(),voiceGain=ctx.createGain();voice.buffer=this.buffers.get(mark);voiceGain.gain.value=this.volume;voice.connect(voiceGain).connect(ctx.destination);voice.start(start+beep.duration+.15);this.sources.push(voice);}
  }
  async announce(text,canPlay=()=>true){
    if(!this.enabled||this.context?.state!=='running')return false;
    const synth=window.speechSynthesis;
    if(!synth||!window.SpeechSynthesisUtterance){this.onAnnouncementError?.('Speech is not supported in this browser.');return false;}
    this.stop();const epoch=this.speechEpoch;
    const voice=await waitForLocalVoice(synth);
    if(epoch!==this.speechEpoch||!this.enabled||this.context?.state!=='running'||!canPlay())return false;
    if(!voice){this.onAnnouncementError?.('No local voice was found after loading. Add a Windows speech voice, then restart Edge.');return false;}
    const beep=this.buffers.get('beep'),ctx=this.context;
    if(beep){const source=ctx.createBufferSource(),gain=ctx.createGain();source.buffer=beep;gain.gain.value=this.volume;source.connect(gain).connect(ctx.destination);source.start();this.sources.push(source);}
    this.speechTimer=setTimeout(()=>{
      if(!this.enabled||epoch!==this.speechEpoch||!canPlay())return;
      const utterance=new window.SpeechSynthesisUtterance(text);utterance.voice=voice;utterance.lang=voice.lang;utterance.volume=this.volume;utterance.rate=1;this.utterance=utterance;
      utterance.onend=()=>{if(this.utterance===utterance)this.utterance=null;};
      utterance.onerror=event=>{if(this.utterance===utterance){this.utterance=null;if(!['canceled','interrupted'].includes(event.error))this.onAnnouncementError?.('Tap this display to allow spoken announcements, then send again.');}};
      synth.speak(utterance);
    },((beep?.duration||0)+.15)*1000);
    return true;
  }
  accept(cues,now,audible=true){for(const cue of cues){if(this.seen.has(cue.id))continue;this.seen.add(cue.id);if(this.seen.size>1000)this.seen.delete(this.seen.values().next().value);if(audible&&now-cue.at>=-100 && now-cue.at<1800)this.play(cue.mark);}}
}
