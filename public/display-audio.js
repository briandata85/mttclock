// Optional fields in the existing shared presentation object also work with saved
// tournaments and older hosts. Only a director can change that object.
export function soundSettings(state) {
  const volume=state?.appearance?.soundVolume;
  return {enabled:state?.appearance?.soundEnabled!==false,volume:typeof volume==='number'&&Number.isFinite(volume)?Math.max(0,Math.min(100,volume))/100:.7};
}

// A venue display owns a short sound lease. Directors control the preference but
// never compete for that lease; observers cannot acquire one at all.
export class DisplayAudio {
  constructor({sound,request,client,now=()=>performance.now()}) {
    // Lease age is local elapsed time; wall-clock corrections must not extend
    // ownership. Cue timestamps still use the authoritative time passed to accept.
    Object.assign(this,{sound,request,client,now});
    this.announcementReady=false;this.lastAnnouncement=null;this.active=false;this.pending=false;this.blocked=false;this.leaseUntil=0;this.epoch=0;
  }
  sync(state,view,online) {
    const config=soundSettings(state);
    this.sound.volume=config.volume;
    const active=view==='display'&&online&&config.enabled;
    if(active===this.active)return;
    this.active=active;this.epoch++;this.blocked=false;
    if(active)void this.pulse();else this.stop();
  }
  async pulse({gesture=false}={}) {
    if(!this.active)return;
    // A fresh gesture must reach resume() synchronously, even while an earlier
    // autoplay attempt is waiting for the browser's permission.
    if(gesture)this.sound.unlock();
    if(this.pending||(this.blocked&&!gesture))return;
    this.pending=true;const epoch=this.epoch;
    try {
      try{await this.sound.enable();this.blocked=false;}catch(error){this.blocked=true;throw error;}
      if(!this.active||epoch!==this.epoch)return;
      let requestedAt=this.now();
      try{await this.request('/api/sound',{client:this.client});}
      catch(error){
        // A clean hosted stream rotation fences the old response without
        // ending this audio epoch. Reconfirm this same client once, keeping
        // any still-valid lease audible while the new request is pending.
        if(error?.code!=='STALE_RESPONSE'||!this.active||epoch!==this.epoch)throw error;
        requestedAt=this.now();
        await this.request('/api/sound',{client:this.client});
      }
      if(!this.active||epoch!==this.epoch){await this.release();return;}
      this.leaseUntil=requestedAt+10000;
    } catch {
      this.leaseUntil=0;this.sound.disable();
      // Lease contention is retried on the next pulse; blocked autoplay waits
      // for a gesture. Neither needs a control or notification on the board.
    } finally {
      if(!this.active||epoch!==this.epoch)this.sound.disable();
      this.pending=false;
    }
  }
  accept(cues,now) {
    // Remember even muted or unleased cues: enabling audio must not replay them.
    this.sound.accept(cues,now,this.active&&this.now()<this.leaseUntil);
  }
  announce(event,now) {
    // Initial loads never replay a message, and muted/unleased displays consume it.
    if(!this.announcementReady){this.announcementReady=true;this.lastAnnouncement=event?.id;return;}
    if(!event||event.id===this.lastAnnouncement)return;
    this.lastAnnouncement=event.id;
    if(this.active&&this.now()<this.leaseUntil&&now-event.at>=-100&&now-event.at<10000)void this.sound.announce(event.text,()=>this.active&&this.now()<this.leaseUntil);
  }
  async release(){try{await this.request('/api/sound',{client:this.client,release:true});}catch{}}
  stop() {
    const owned=this.leaseUntil>0;
    this.leaseUntil=0;this.sound.disable();
    if(owned)void this.release();
  }
  disconnect(){this.active=false;this.epoch++;this.blocked=false;this.stop();}
}
