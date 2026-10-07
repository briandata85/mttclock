import {freshTournament} from './domain.js';
import {defaultRecipe} from './payout-safety.js';

// Copy configuration, not the previous night's results or sharing credentials.
export function reuseTournament(saved,name){
  const s=structuredClone(saved),fresh=freshTournament();
  s.eventName=name;s.entrants=0;s.playersLeft=0;s.currentIndex=0;
  s.timerRemaining=s.levels[0].minutes*60;
  s.clock={...fresh.clock,remainingMs:s.timerRemaining*1000};
  s.registration={...s.registration,override:'auto'};
  if(s.bounty.mode==='total')s.bounty.amount=0;
  s.appearance={...s.appearance,largestStack:null,smallestStack:null};
  s.payoutConfig={recipe:structuredClone(s.payoutConfig?.recipe||{...defaultRecipe(),itm:{top10:10,top15:15,top20:20}[s.payoutPreset]||15,places:s.payoutPreset==='winner'?1:null,roundPayouts:s.roundPayouts}),finalized:false,basis:null};
  s.payoutPreset='custom';s.customPayouts=[];
  return s;
}
