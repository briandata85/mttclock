import {finances,payouts} from './domain.js';
export const defaultRecipe=()=>({itm:15,type:'normal',finalTable:9,places:null,minimumMultiple:2,roundPayouts:false});
export const payoutBasis=s=>({entrants:s.entrants,pool:Math.round(finances(s).pool*100)/100,buyIn:s.buyIn});
export function payoutReview(s){
  const values=payouts(s),basis=payoutBasis(s),saved=s.payoutConfig?.basis;
  const assigned=Math.round(values.reduce((a,b)=>a+b,0)*100)/100,difference=Math.round((basis.pool-assigned)*100)/100;
  const stale=!!saved&&(saved.entrants!==basis.entrants||saved.pool!==basis.pool||(saved.buyIn!==undefined&&saved.buyIn!==basis.buyIn));
  const errors=[];
  const missingSchedule=!values.length||!assigned;
  if(difference<0)errors.push('Payouts exceed the tournament prize pool.');
  if(values.length>s.entrants)errors.push('Paid places exceed total entrants.');
  if(values.some((v,i)=>v<=0||(i>0&&v>values[i-1])))errors.push('Each prize must be positive and no larger than the prize above it.');
  if(missingSchedule)errors.push('Add a payout schedule first.');
  return {assigned,difference,stale,missingSchedule,errors,canFinalize:!errors.length&&!stale,finalized:s.payoutConfig?.finalized===true};
}
