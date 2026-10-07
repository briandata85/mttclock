import {finances,payouts} from './domain.js';

// A cleared required number is an unfinished edit, never an implicit zero.
export const settingNumber=value=>String(value).trim()===''?null:Number(value);
const validNumber=(value,min,max,integer=false)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max&&(!integer||Number.isInteger(value));
const issue=(panel,selector,message)=>({panel,selector,message});

// Friendly preflight only. The host still validates and commits the complete
// command atomically; this function never changes a value to make it fit.
export function firstSetupIssue(s){
  for(const [key,id,label,max,integer] of [
    ['entrants','entrants-input','Entrants',10000,true],
    ['playersLeft','players-input','Players left',10000,true],
    ['buyIn','buy-in-input','Buy-in',1e8,false],
    ['startingStack','starting-stack-input','Starting stack',1e8,false],
    ['prizePerEntry','prize-entry-input','Contribution per entry',1e8,false]
  ]){
    if(!validNumber(s[key],0,max,integer))return issue('tournament',`#${id}`,`${label}: enter ${integer?'a whole number':'an amount'} from 0 to ${max.toLocaleString('en-US')}.`);
  }
  if(s.playersLeft>s.entrants)return issue('tournament','#players-input','Players left cannot exceed entrants.');
  for(const [key,label] of [['largestStack','Largest stack'],['smallestStack','Smallest stack']]){
    const value=s.appearance[key];
    if(value!=null&&!validNumber(value,0,1e12,true))return issue('tournament',`#presentation-${key}`,`${label}: enter a whole number from 0 to 1 trillion, or leave it blank.`);
  }
  if(!validNumber(s.bounty.amount,0,1e10))return issue('tournament','#bounty-amount','Enter a bounty amount of 0 or more.');
  const f=finances(s);
  if(f.reserve>f.gross)return issue('tournament','#bounty-amount','Bounties exceed the available pool.');
  if(!Array.isArray(s.levels)||s.levels.length<1||s.levels.length>300)return issue('blinds','#structure-preset','Use between 1 and 300 structure rows.');
  for(let i=0;i<s.levels.length;i++)for(const [field,min,max,label] of [['minutes',1,1440,'Minutes'],['small',0,1e10,'Small blind'],['big',0,1e10,'Big blind'],['ante',0,1e10,'Ante']]){
    if(!validNumber(s.levels[i]?.[field],min,max))return issue('blinds',`[aria-label="Row ${i+1} ${field}"]`,`Row ${i+1} — ${label}: enter a number from ${min} to ${max.toLocaleString('en-US')}.`);
  }
  const recipe=s.payoutConfig?.recipe;
  if(recipe?.places!=null&&!validNumber(recipe.places,1,1000,true))return issue('payouts','#calculator-places','Paid places: enter a whole number from 1 to 1,000, or leave it blank.');
  if(s.payoutPreset==='custom'){
    if(s.customPayouts.length>1000)return issue('payouts','#add-payout','Use no more than 1,000 paid places.');
    const bad=s.customPayouts.findIndex(value=>!validNumber(value,0,1e10)||value===0);
    if(bad>=0){
      let first=bad;while(first>0&&s.customPayouts[first-1]===s.customPayouts[bad])first--;
      return issue('payouts',`#payout-editor input[data-from="${first+1}"]`,'Enter a payout greater than 0, or remove this paid place.');
    }
    const assigned=Math.round(payouts(s).reduce((a,b)=>a+b,0)*100)/100;
    if(assigned>f.pool)return issue('payouts','#payout-editor input','Payouts exceed the prize pool. Adjust the amounts or fill a new schedule.');
  }
  for(const [key,id,label] of [['board','board-color-text','Board'],['accent','accent-color-text','Accent']]){
    if(!/^#[a-f0-9]{6}$/i.test(s.appearance[key]))return issue('appearance',`#${id}`,`${label} color: use a six-digit hex color, such as #063b1d.`);
  }
  return null;
}
