// Independently implemented WSOP-style estimates, not official payout tables.
// Reference: https://www.wsop.com/payoutcalculator/ (checked October 1, 2026).
// Apply saves explicit amounts. Neither elimination nor display grouping changes prizes.
export const itmOptions=[5,10,12,15,18,20,25];
export const payoutTypes={steep:15,normal:10,flat:8,flatter:5};
export const recipeIncrement=(recipe={})=>[5,10,20].includes(recipe.roundingIncrement)?recipe.roundingIncrement:recipe.roundPayouts?20:5;

// Work in cents. Start at the nearest denomination, favor lower places when
// adding rounding residue, and take over-rounding from the top. Move tied groups
// together where possible so prizes stay ordered without per-dollar loops.
export function roundToPool(target,poolCents,unit,minimum){
  const budget=Math.floor(poolCents/unit)*unit;
  const amounts=target.map(v=>Math.max(minimum,Math.round((v+1e-7)/unit)*unit));
  let add=(budget-amounts.reduce((a,b)=>a+b,0))/unit;
  while(add>0){
    const last=amounts.length-1;let start=last;
    while(start>0&&amounts[start-1]===amounts[last])start--;
    const count=last-start+1,room=start?(amounts[start-1]-amounts[last])/unit:Math.ceil(add/count);
    const steps=Math.min(room,Math.floor(add/count));
    for(let i=start;i<=last;i++)amounts[i]+=steps*unit;
    add-=steps*count;
    if(add&&start&&amounts[start]===amounts[start-1])continue;
    for(let i=start;add>0&&i<=last;i++,add--)amounts[i]+=unit;
  }
  let remove=-add;
  while(remove>0){
    let end=0;while(end+1<amounts.length&&amounts[end+1]===amounts[0])end++;
    const count=end+1,below=end+1<amounts.length?amounts[end+1]:minimum;
    const room=(amounts[0]-below)/unit,steps=Math.min(room,Math.floor(remove/count));
    for(let i=0;i<=end;i++)amounts[i]-=steps*unit;
    remove-=steps*count;
    if(remove&&end+1<amounts.length&&amounts[end]===amounts[end+1])continue;
    for(let i=end;remove>0&&i>=0;i--,remove--)amounts[i]-=unit;
  }
  // A pool not divisible by the denomination needs one off-increment prize.
  // Use the lowest eligible place; never let a lower place overtake its neighbor.
  let remainder=poolCents-budget;
  for(let i=amounts.length-1;remainder>0&&i>=0;i--){
    const extra=Math.min(remainder,i?amounts[i-1]-amounts[i]:remainder);
    amounts[i]+=extra;remainder-=extra;
  }
  return amounts;
}

export function payoutGroups(amounts) {
  const groups=[];
  amounts.forEach((amount,index)=>{
    const last=groups.at(-1);
    if(last&&last.low===amount&&last.high===amount)last.to=index+1;
    else groups.push({from:index+1,to:index+1,low:amount,high:amount});
  });
  return groups;
}

// Keep the rail stationary, including imported schedules with many unique prizes.
// Such summaries explicitly show the low–high amount range, never a fictitious flat prize.
export function payoutDisplayBands(amounts,limit=15) {
  const groups=payoutGroups(amounts);
  limit=Math.max(1,Math.floor(limit));
  if(groups.length<=limit)return groups;
  const keep=Math.min(9,Math.floor(limit*.6)),result=groups.slice(0,keep);
  const rest=groups.slice(keep),slots=limit-keep;
  for(let i=0;i<slots;i++) {
    const slice=rest.slice(Math.floor(i*rest.length/slots),Math.floor((i+1)*rest.length/slots));
    result.push({from:slice[0].from,to:slice.at(-1).to,
      low:Math.min(...slice.map(g=>g.low)),high:Math.max(...slice.map(g=>g.high))});
  }
  return result;
}

// A geometric progression with a fixed last prize, adjusted to the available pool.
function geometricPrizes(count,total,last) {
  let low=1,high=Math.max(1,total/last);
  for(let iteration=0;iteration<90;iteration++) {
    const ratio=(low+high)/2;
    const sum=Array.from({length:count},(_,i)=>last*ratio**i).reduce((a,b)=>a+b,0);
    if(sum>total)high=ratio;else low=ratio;
  }
  return Array.from({length:count},(_,i)=>last*low**(count-i-1));
}

function orderly(values) {
  for(let i=0;i<values.length-1;i++) {
    const gap=values[i]-values[i+1];
    if(gap<1e-7)return false;
    if(i&&gap>values[i-1]-values[i]+1e-7)return false;
  }
  return true;
}

// For a small field, tidy prizes to contribution-sized steps, while preserving
// increasing jumps toward first place. Use finer steps if that would not fit.
function smallFieldPrizes(count,total,minimum,contribution) {
  const target=geometricPrizes(count,total,minimum);
  let step=contribution;
  for(let attempt=0;attempt<20;attempt++,step/=2) {
    const values=target.map(v=>Math.floor((v+1e-7)/step)*step);
    values[count-1]=minimum;
    for(let i=count-2;i>=0;i--)values[i]=Math.max(values[i],values[i+1]+step);
    let remainder=total-values.reduce((a,b)=>a+b,0),iterations=0;
    while(Math.abs(remainder)>=step-1e-6&&iterations++<2000) {
      const direction=remainder>0?1:-1;
      const candidates=[];
      for(let i=1;i<count-1;i++) {
        const candidate=[...values];candidate[i]+=direction*step;
        if(orderly(candidate))candidates.push({i,score:direction*(target[i]-values[i])});
      }
      candidates.sort((a,b)=>b.score-a.score||a.i-b.i);
      if(candidates.length)values[candidates[0].i]+=direction*step;
      else {
        const candidate=[...values];candidate[0]+=direction*step;
        if(!orderly(candidate))break;
        values[0]=candidate[0];
      }
      remainder-=direction*step;
    }
    values[0]+=remainder;
    if(orderly(values))return values;
  }
  return target;
}

function tieredPrizes(places,total,minimum,contribution,finalTable,factor) {
  // Individual final-table places followed by wider equal-prize bands. Keep the
  // generated schedule within 15 rows so the WSOP display needs no scrolling.
  const remainder=places-finalTable,bandCount=Math.min(15-finalTable,Math.max(1,Math.ceil(Math.log2(remainder+2))-1),Math.max(1,Math.floor(remainder/2)));
  const weights=Array.from({length:bandCount},(_,i)=>1.55**i),weightTotal=weights.reduce((a,b)=>a+b,0);
  let allocated=0;
  const counts=weights.map((weight,i)=>{
    if(i===bandCount-1)return remainder-allocated;
    const count=2+Math.floor((remainder-2*bandCount)*weight/weightTotal);allocated+=count;return count;
  });
  const tiers=[...Array(finalTable).fill(1),...counts];
  // Start with contribution multiples in the tail, then put the rest at the
  // final table. If a wide ITM setting leaves less room, smoothly flatten the
  // progression instead of exceeding the pool or producing zero/negative prizes.
  const ladder=[minimum/contribution,2,2.5,3,4,5,6,7,8,9,10,12].filter((v,i,a)=>i===0||v>a[0]);
  while(ladder.length<bandCount)ladder.push(ladder.at(-1)+Math.max(1,ladder[0]/2));
  let tail=counts.map((_,i)=>ladder[bandCount-i-1]*contribution);
  const ftWeights=Array.from({length:finalTable},(_,i)=>factor**((finalTable-i-1)/(finalTable-1)));
  let tailSum=tail.reduce((sum,v,i)=>sum+v*counts[i],0),ftBudget=total-tailSum;
  const ftWeightTotal=ftWeights.reduce((a,b)=>a+b,0);
  // Avoid a disproportionate jump at the final-table boundary. Widen the tail's
  // prizes (not its minimum) and solve both budgets together at a 1.26 seam ratio.
  if(bandCount>1&&ftBudget/ftWeightTotal>tail[0]*1.4) {
    const shape=tail.map(v=>(v-minimum)/(tail[0]-minimum));
    const weightedShape=shape.reduce((sum,v,i)=>sum+v*counts[i],0);
    const lastFinal=(total-minimum*(remainder-weightedShape))/(ftWeightTotal+weightedShape/1.26);
    tail=shape.map(v=>minimum+v*(lastFinal/1.26-minimum));
    const step=contribution/2;
    tail=tail.map(v=>Math.max(minimum,Math.floor((v+1e-7)/step)*step));
    tailSum=tail.reduce((sum,v,i)=>sum+v*counts[i],0);ftBudget=total-tailSum;
  }
  let values=ftWeights.map(w=>w*ftBudget/ftWeightTotal).concat(tail);
  if(values[finalTable-1]<tail[0]||ftBudget<=0) {
    const ideal=[...ftWeights.map(w=>w*(tail[0]+contribution)),...tail];
    const extras=ideal.map(v=>Math.max(0,v-minimum));
    const weighted=extras.reduce((sum,v,i)=>sum+v*tiers[i],0);
    values=extras.map(v=>minimum+(total-minimum*places)*v/weighted);
  } else {
    // Tidy the individual final-table prizes to contribution-sized steps. The
    // caller completes the underlying distribution before denomination rounding.
    values=values.map((v,i)=>i<finalTable?Math.max(tail[0],Math.floor((v+1e-7)/contribution)*contribution):v);
  }
  return tiers.flatMap((count,i)=>Array(count).fill(values[i]));
}

export function payoutPlan({entrants,buyIn,pool,roundPayouts=false},options={}) {
  const itm=options.itm??15,type=options.type??'normal',finalTable=options.finalTable??9;
  const multiplier=options.minimumMultiple??2;
  const places=options.places??Math.max(1,Math.floor(entrants*itm/100));
  const invalid=message=>({ok:false,message,places,amounts:[],groups:[]});
  if(!Number.isInteger(entrants)||entrants<1||entrants>10000)return invalid('Enter between 1 and 10,000 entrants.');
  if(!itmOptions.includes(itm))return invalid('Choose a supported percentage of entries to pay.');
  if(!Object.hasOwn(payoutTypes,type))return invalid('Choose a payout type.');
  if(![5,7,9].includes(finalTable))return invalid('Choose a final table of 5, 7 or 9.');
  if(!Number.isInteger(places)||places<1||places>Math.min(entrants,1000))return invalid('Paid places must be between 1 and the smaller of your entry count or 1,000.');
  if(![1,1.5,2].includes(multiplier))return invalid('Choose a minimum cash of 1x, 1.5x or 2x Buy-In.');
  if(!Number.isFinite(buyIn)||buyIn<=0||buyIn>1e8)return invalid('Enter a positive Buy-In in Tournament settings to calculate minimum cash.');
  if(!Number.isFinite(pool)||pool<=0||pool>1e12)return invalid('Add money to the tournament prize pool before calculating payouts.');
  const increment=options.roundingIncrement??(roundPayouts?20:1);
  if(![1,5,10,20].includes(increment))return invalid('Choose $5, $10 or $20 rounding.');
  const poolCents=Math.round(pool*100),unit=increment*100;
  if(places===1){const amount=poolCents/100;return {ok:true,places,minimum:amount,contribution:amount/entrants,amounts:[amount],groups:payoutGroups([amount]),assigned:amount,unassigned:0};}
  const budget=Math.floor(poolCents/unit)*unit,contribution=poolCents/entrants;
  const minimum=Math.ceil((Math.round(buyIn*100)*multiplier-1e-7)/unit)*unit;
  const required=minimum*places;
  if(!budget||required>budget)return {...invalid('The pool cannot cover this minimum cash. Reduce paid places, the minimum cash, or the rounding increment.'),required:required/100,minimum:minimum/100};
  let target;
  if(places===2)target=[budget-minimum,minimum];
  else if(places<=finalTable+1)target=smallFieldPrizes(places,budget,minimum,contribution);
  else target=tieredPrizes(places,budget,minimum,contribution,finalTable,payoutTypes[type]);
  target[0]+=budget-target.reduce((a,b)=>a+b,0);
  const amounts=roundToPool(target,poolCents,unit,minimum);
  const values=amounts.map(v=>v/100);
  return {ok:true,places,minimum:values.at(-1),contribution:contribution/100,amounts:values,groups:payoutGroups(values),
    assigned:poolCents/100,unassigned:0};
}
