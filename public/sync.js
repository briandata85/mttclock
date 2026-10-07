export class RecoveryRequiredError extends Error {
  constructor(knownRevision,receivedRevision){
    super('Sync paused: the host returned an earlier saved state. Review it in a new tab before making more changes.');
    this.name='RecoveryRequiredError';this.code='RECOVERY_REQUIRED';
    this.knownRevision=knownRevision;this.receivedRevision=receivedRevision;
  }
}
// Header providers may wait on authentication indefinitely. Cancellation must
// settle our operation even when that provider (or a test transport) ignores it.
function abortable(operation,signal){
  signal.throwIfAborted();
  return new Promise((resolve,reject)=>{
    const abort=()=>{cleanup();reject(signal.reason);};
    const cleanup=()=>signal.removeEventListener('abort',abort);
    signal.addEventListener('abort',abort,{once:true});
    let pending;try{signal.throwIfAborted();pending=operation();}catch(error){cleanup();reject(error);return;}
    Promise.resolve(pending).then(
      value=>{cleanup();resolve(value);},error=>{cleanup();reject(error);});
  });
}
export class Connection {
  constructor(credential,onState,onStatus,onRevoked,options={}) {
    Object.assign(this,{credential,onState,onStatus,onRevoked,options});
    this.online=false;this.stopped=false;this.controller=null;this.offset=0;this.lastPacket=0;
    this.recoveryRequired=null;this.frozenNow=null;
    this.monotonicNow=options.monotonicNow??(()=>performance.now());
    this.wallNow=options.wallNow??(()=>Date.now());
    const local=this.monotonicNow(),server=this.wallNow();
    this.clockAnchor={local,server};
    this.clockSynced=false;this.clockGeneration=0;this.clockObservations=0;
    this.latestRevision=null;this.latestServerNow=null;
    this.lifetime=new AbortController();
    this.offline=()=>{if(this.stopped)return;this.online=false;this.controller?.abort();this.onStatus(false);};
    window.addEventListener('offline',this.offline);
  }
  url(path){return this.options.base?this.options.base+path.replace(/^\/api/,''):path;}
  async headers(){if(this.options.headers)return this.options.headers();return {Authorization:`Bearer ${this.credential}`};}
  checkRequest(signal,generation){
    this.lifetime.signal.throwIfAborted();signal.throwIfAborted();
    if(generation!==this.clockGeneration){const error=new Error('Connection changed before the response was confirmed.');error.code='STALE_RESPONSE';throw error;}
  }
  requireRecovery(knownRevision,receivedRevision){
    if(this.recoveryRequired)return this.recoveryRequired;
    if(this.stopped)return this.lifetime.signal.reason;
    this.frozenNow=this.now();
    const error=this.recoveryRequired=new RecoveryRequiredError(knownRevision,receivedRevision);
    this.stop(error);this.onStatus(false);return error;
  }
  async request(path,body,attemptSignal,{resetClock=false}={}) {
    // Capture before awaiting credentials: concurrent observations may advance
    // latestRevision while this request is still legitimately returning its baseline.
    const generation=this.clockGeneration,observations=this.clockObservations,baseline=this.latestRevision;
    const signal=AbortSignal.any([this.lifetime.signal,AbortSignal.timeout(10000),...(attemptSignal?[attemptSignal]:[])]);
    this.checkRequest(signal,generation);
    const headers=await abortable(()=>this.headers(),signal);this.checkRequest(signal,generation);
    const response=await abortable(()=>fetch(this.url(path),{method:body===undefined?'GET':'POST',headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),signal}),signal);
    this.checkRequest(signal,generation);
    let data;try{data=await abortable(()=>response.json(),signal);}catch(error){this.checkRequest(signal,generation);if(response.ok)throw error;}
    this.checkRequest(signal,generation);
    if(!response.ok){const error=new Error(typeof data?.error==='string'?data.error:'Request failed');error.status=response.status;throw error;}
    const snapshot=(path==='/api/state'||path==='/api/command')&&data?.state&&typeof data.state==='object';
    if(snapshot&&Number.isSafeInteger(data.revision)&&data.revision>=0&&baseline!==null&&data.revision<baseline)throw this.requireRecovery(baseline,data.revision);
    this.observe(data,{received:this.monotonicNow(),reset:resetClock&&observations===this.clockObservations});
    return data;
  }
  fresh(data,reset=false){
    const revision=Number.isFinite(data?.revision)?data.revision:null;
    if(revision!==null&&this.latestRevision!==null&&revision<this.latestRevision)return false;
    const newerRevision=revision!==null&&(this.latestRevision===null||revision>this.latestRevision);
    return reset||newerRevision||!Number.isFinite(data?.serverNow)||this.latestServerNow===null||data.serverNow>=this.latestServerNow;
  }
  observe(data,{received=this.monotonicNow(),reset=false}={}){
    if(this.stopped||!this.fresh(data,reset))return false;
    if(Number.isFinite(data?.revision))this.latestRevision=data.revision;
    if(Number.isFinite(data?.serverNow)){
      // Interpolate server time using a monotonic clock. Wall-clock corrections
      // must not add or remove time from a running tournament on this screen.
      // serverNow at receipt is a conservative lower bound. Adding half the
      // round trip could mistake server work for transit time and end early.
      // A later faster sample corrects the remaining response-latency lag.
      const current=this.clockAnchor.server+Math.max(0,received-this.clockAnchor.local);
      this.clockAnchor={local:received,server:!this.clockSynced||reset?data.serverNow:Math.max(current,data.serverNow)};
      this.latestServerNow=data.serverNow;this.clockSynced=true;
      this.offset=this.clockAnchor.server-this.wallNow();
    }
    if(Number.isFinite(data?.revision)||Number.isFinite(data?.serverNow))this.clockObservations++;
    return true;
  }
  now(){return this.frozenNow??(this.clockAnchor.server+Math.max(0,this.monotonicNow()-this.clockAnchor.local));}
  async delay(ms) {
    if(this.stopped)return;
    await new Promise(resolve=>{
      const done=()=>{clearTimeout(timer);this.lifetime.signal.removeEventListener('abort',done);resolve();};
      const timer=setTimeout(done,ms);this.lifetime.signal.addEventListener('abort',done,{once:true});
    });
  }
  revoke(){if(this.stopped)return;this.stop();this.onRevoked();}
  async run() {
    while(!this.stopped) {
      if(!navigator.onLine){await this.delay(1000);continue;}
      const controller=new AbortController();this.controller=controller;
      const generation=++this.clockGeneration;
      try {
        // Only a fresh state request may reset the clock epoch. A lower
        // authoritative revision instead latches a terminal recovery hold.
        const initial=await this.request('/api/state',undefined,controller.signal,{resetClock:true});
        if(this.stopped)return;if(this.fresh(initial))this.onState(initial);if(this.stopped)return;
        // Bound connection establishment as well as inactivity after headers arrive.
        const connectTimeout=setTimeout(()=>controller.abort(),this.options.connectTimeoutMs??10000);
        let response;
        try {
          const headers=await abortable(()=>this.headers(),controller.signal);this.checkRequest(controller.signal,generation);
          response=await abortable(()=>fetch(this.url('/api/events'),{headers,signal:controller.signal}),controller.signal);
          this.checkRequest(controller.signal,generation);
        } finally {clearTimeout(connectTimeout);}
        if(this.stopped){await response.body?.cancel().catch(()=>{});return;}
        if(response.status===401||response.status===403){await response.body?.cancel().catch(()=>{});this.revoke();return;}
        if(!response.ok||!response.body){await response.body?.cancel().catch(()=>{});throw new Error('Connection unavailable');}
        this.online=true;this.lastPacket=this.monotonicNow();this.onStatus(true);
        const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
        const watchdog=setInterval(()=>{if(this.monotonicNow()-this.lastPacket>16000)controller.abort();},2000);
        let cleanEnd=false;
        try {
          while(!this.stopped) {
            const {done,value}=await abortable(()=>reader.read(),controller.signal);if(this.stopped)return;
            if(done){cleanEnd=true;break;}
            buffer+=decoder.decode(value,{stream:true});
            if(buffer.length>2_000_000)throw new Error('Connection frame too large');
            let boundary;
            while((boundary=/\r?\n\r?\n/.exec(buffer))) {
              const frame=buffer.slice(0,boundary.index);buffer=buffer.slice(boundary.index+boundary[0].length);this.lastPacket=this.monotonicNow();
              const lines=frame.split(/\r?\n/);
              const event=lines.find(line=>line.startsWith('event:'))?.slice(6).trim();
              if(event==='revoked'){this.revoke();return;}
              const data=lines.filter(line=>line.startsWith('data:')).map(line=>line.slice(5).replace(/^ /,'')).join('\n');
              if(data){const packet=JSON.parse(data);if(this.observe(packet))this.onState(packet);if(this.stopped)return;}
            }
          }
        } finally {clearInterval(watchdog);await reader.cancel().catch(()=>{});}
        // Hosted streams rotate before their worker time limit. A normal rotation
        // must not mute the venue sound or show a false offline warning.
        if(cleanEnd&&this.options.rotateStreams&&!this.stopped)continue;
      } catch(error) {
        if(this.stopped)return;
        if(error.status===401||error.status===403){this.revoke();return;}
      } finally {controller.abort();if(this.controller===controller)this.controller=null;}
      if(this.stopped)return;
      this.online=false;this.onStatus(false);
      await this.delay(1500);
    }
  }
  stop(reason){this.stopped=true;this.lifetime.abort(reason);this.controller?.abort(reason);this.online=false;window.removeEventListener('offline',this.offline);}
}
