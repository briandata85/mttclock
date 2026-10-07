// Setup owns only editable settings. Clock ticks and live controls remain authoritative.
export const settingKeys=['eventName','entrants','playersLeft','buyIn','prizePerEntry','startingStack','autoAdvance','tableNumbers','showTableNumbers','tickerText','showTicker','payoutPreset','payoutLabel','roundPayouts','customPayouts','appearance','bounty','registration','payoutConfig','levels','structurePreset'];
const copy=value=>structuredClone(value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const read=(s,path)=>path.reduce((v,k)=>v?.[k],s);
function write(s,path,value){let at=s;for(const k of path.slice(0,-1))at=at[k]??={};at[path.at(-1)]=copy(value);}
function differences(a,b,path=[]){
  if(equal(a,b))return [];
  if(object(a)&&object(b))return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>differences(a[k],b[k],[...path,k]));
  return [path];
}
export class SettingsDraft{
  constructor(state){this.reset(state);}
  reset(state){this.base=copy(state);this.value=copy(state);this.latest=copy(state);}
  get paths(){return settingKeys.flatMap(key=>differences(this.base[key],this.value[key],[key]));}
  get dirty(){return this.paths.length>0;}
  get conflicts(){return this.paths.filter(path=>!equal(read(this.base,path),read(this.latest,path))&&!equal(read(this.value,path),read(this.latest,path)));}
  edit(patch){Object.assign(this.value,copy(patch));}
  update(state){
    const paths=this.paths,oldBase=this.base,oldValue=this.value;
    this.reset(state);
    for(const path of paths){
      if(equal(read(oldValue,path),read(state,path)))continue;
      write(this.base,path,read(oldBase,path));write(this.value,path,read(oldValue,path));
    }
  }
  keepMine(){for(const path of this.conflicts)write(this.base,path,read(this.latest,path));}
  command(){
    if(this.conflicts.length)throw new Error('Resolve the changes from another screen before saving.');
    const keys=new Set(this.paths.map(p=>p[0])),patch={};
    for(const key of keys)if(!['levels','structurePreset'].includes(key))patch[key]=copy(this.value[key]);
    const structure=keys.has('levels')||keys.has('structurePreset')?{levels:copy(this.value.levels),preset:this.value.structurePreset}:undefined;
    // Old saves can still carry the retired payout lock. Release it atomically
    // with a deliberate payout edit, not when merely opening or styling a clock.
    const changesPayouts=['payoutPreset','customPayouts','roundPayouts'].some(key=>keys.has(key))||this.paths.some(path=>path[0]==='payoutConfig'&&path[1]==='basis');
    const unlock=this.latest.payoutConfig?.finalized===true&&changesPayouts;
    return {patch,...(structure?{structure}:{}),...(unlock?{payoutAction:'unlock'}:{})};
  }
}
