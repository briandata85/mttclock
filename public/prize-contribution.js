// Full-buy-in contributions follow edits; intentional fee/custom amounts stay put.
// Preserve an unfinished blank edit rather than coercing it into a saved zero.
export function buyInContributionPatch(state,value){
  const follows=state.buyIn===state.prizePerEntry||Object.is(state.buyIn,state.prizePerEntry);
  return follows?{buyIn:value,prizePerEntry:value}:{buyIn:value};
}

// A blank optional override restores full-buy-in behavior; explicit zero is valid.
export function prizeContributionPatch(state,value){return {prizePerEntry:value===null?state.buyIn:value};}
export function contributionOverrideValue(state){return state.prizePerEntry===state.buyIn?'':state.prizePerEntry;}
