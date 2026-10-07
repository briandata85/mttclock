const same=(a,b)=>a.mode===b.mode&&a.amount===b.amount;

// Treat type + amount as one edit. An acknowledgement must never replace newer
// typing, and a second device's bounty edit must never be silently overwritten.
export class BountyEditor {
  constructor({snapshot,save,ready=()=>true,changed=()=>{},delay=250}){
    Object.assign(this,{snapshot,save,ready,changed,delay});
    this.draft=null;this.base=null;this.error='';this.saving=false;this.version=0;this.timer=null;
  }
  value(){return this.draft||this.snapshot().state.bounty;}
  edit(field,value){
    if(!this.draft){this.base={...this.snapshot().state.bounty};this.draft={...this.base};}
    this.draft[field]=value;this.version++;this.error='';this.schedule();this.changed();
  }
  schedule(){clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;void this.flush();},this.delay);}
  async flush(){
    clearTimeout(this.timer);this.timer=null;
    if(!this.draft||this.saving)return;
    if(!this.ready()){this.schedule();return;}
    const latest=this.snapshot();
    if(!same(latest.state.bounty,this.base)){
      this.error='Bounty settings changed on another screen. Use the saved settings below, then make your change again.';this.changed();return;
    }
    const bounty={...this.draft},version=this.version;
    if(!Number.isFinite(bounty.amount)||bounty.amount<0){this.error='Enter a valid bounty amount of $0 or more.';this.changed();return;}
    this.saving=true;this.error='';this.changed();
    let accepted=false;
    try {accepted=await this.save(bounty,latest.revision);}
    catch(error){this.error=error.message;}
    this.saving=false;
    if(accepted){
      if(version===this.version){this.draft=null;this.base=null;}
      else {this.base=bounty;this.schedule();}
    }else this.error||='Bounty change was not saved. Check the connection and amount, then retry.';
    this.changed();
  }
  discard(){clearTimeout(this.timer);this.timer=null;this.version++;this.draft=null;this.base=null;this.error='';this.changed();}
}
