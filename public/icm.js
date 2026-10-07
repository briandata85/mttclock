// Exact Malmuth-Harville subset recurrence; presentation-only, no saved-state writes.
export function icmEquities(stacks,prizes){
 const n=stacks.length;
 if(n<2||n>15||stacks.some(x=>!Number.isSafeInteger(x)||x<=0||x>1e12))throw Error('Enter 2–15 positive whole-number stacks, up to 1 trillion each.');
 if(!prizes.length||prizes.length>n||prizes.some((x,i)=>!Number.isFinite(x)||x<0||x>1e12||(i>0&&x>prizes[i-1]))||!prizes.some(x=>x>0))throw Error('Enter positive remaining prizes, highest first, with no more prizes than players. Zero unpaid places are allowed.');
 const total=stacks.reduce((a,b)=>a+b,0),size=1<<n,prob=new Float64Array(size),chips=new Float64Array(size),count=new Uint8Array(size),equity=new Float64Array(n);prob[0]=1;
 for(let mask=0;mask<size;mask++){
  if(mask){const bit=mask&-mask,i=31-Math.clz32(bit),rest=mask^bit;chips[mask]=chips[rest]+stacks[i];count[mask]=count[rest]+1;}
  const rank=count[mask];if(rank>=prizes.length)continue;
  for(let i=0;i<n;i++)if(!(mask&(1<<i))){const p=prob[mask]*stacks[i]/(total-chips[mask]);equity[i]+=p*prizes[rank];prob[mask|(1<<i)]+=p;}
 }
 return Array.from(equity);
}
export function parseIcmLines(text){return text.trim().split(/\n/).filter(x=>x.trim()).map(x=>/^\d+(\.\d+)?$/.test(x.trim())?Number(x.trim()):NaN);}
export function installIcm({root,getPayouts,getCurrency,formatMoney}){
 const $=id=>root.getElementById(id),out=$('icm-results'),status=$('icm-status'),container=$('icm-player-rows');
 let rows=Array.from({length:3},()=>({name:'',stack:'',prize:''}));
 const clear=()=>{out.replaceChildren();status.textContent='';};
 const render=()=>{
  container.replaceChildren();rows.forEach((data,i)=>{
   const row=root.createElement('div');row.className='icm-player-row';
   for(const key of ['name','stack','prize']){const input=root.createElement('input');input.type=key==='name'?'text':'number';input.value=data[key];input.placeholder=key==='name'?`Player ${i+1}`:key==='prize'?`${i+1}${i===0?'st':i===1?'nd':i===2?'rd':'th'} prize`:'Chips';input.setAttribute('aria-label',key==='name'?`Player ${i+1} name`:key==='stack'?`Player ${i+1} chips`:`Place ${i+1} prize`);if(key==='name')input.maxLength=50;else{input.min=key==='stack'?'1':'0';input.step=key==='stack'?'1':'0.01';}input.oninput=()=>{data[key]=input.validity.badInput?'invalid':input.value;clear();};row.append(input);}
   const remove=root.createElement('button');remove.type='button';remove.className='icm-remove';remove.textContent='×';remove.setAttribute('aria-label',`Remove player ${i+1}`);remove.disabled=rows.length<=2;remove.onclick=()=>{rows.splice(i,1);clear();render();};row.append(remove);container.append(row);
  });$('icm-add-player').disabled=rows.length>=15;
 };
 $('icm-add-player').onclick=()=>{if(rows.length>=15)return;rows.push({name:'',stack:'',prize:''});clear();render();};
 $('icm-use-payouts').onclick=()=>{clear();const prizes=getPayouts();rows.forEach((r,i)=>r.prize=String(prizes[i]??0));render();status.textContent=`Loaded top ${rows.length} places. Check remaining prizes.`;};
 $('icm-calculate').onclick=()=>{clear();try{
  const stacks=rows.map(r=>r.stack.trim()?Number(r.stack):NaN),prizes=rows.map(r=>r.prize.trim()?Number(r.prize):0),equity=icmEquities(stacks,prizes),currency=getCurrency(),pool=prizes.reduce((a,b)=>a+b,0);
  equity.forEach((amount,i)=>{const row=root.createElement('div'),label=root.createElement('span'),value=root.createElement('strong');label.textContent=rows[i].name.trim()||`Player ${i+1}`;value.textContent=`${formatMoney(amount,currency)} · ${(amount/pool*100).toFixed(2)}%`;row.append(label,value);out.append(row);});
  status.textContent=`ICM estimates · ${formatMoney(pool,currency)} remaining prizes`;
 }catch(e){status.textContent=e.message;}};render();
}
