export function newEntryPatch(state) {
  if(state.entrants>=10000)throw new Error('This tournament has reached the 10,000-entry limit.');
  return {entrants:state.entrants+1,playersLeft:state.playersLeft+1};
}

export function adjacentLevelIndex(state,direction) {
  if(direction!==-1&&direction!==1)throw new Error('Invalid level direction');
  const index=state.currentIndex+direction;
  return index>=0&&index<state.levels.length?index:null;
}

// Clock identity, not packet revision: player edits and ordinary countdown
// ticks must not invalidate a time edit, but a new level/pause/time change must.
export const clockEditVersion=state=>JSON.stringify([state.currentIndex,state.clock.run,state.clock.status,state.clock.deadline,state.clock.remainingMs]);

export function parseRemainingTime(value) {
  const match=String(value).trim().match(/^(\d{1,4}):([0-5]\d)$/);
  if(!match)throw new Error('Enter minutes and seconds, for example 12:30.');
  const seconds=Number(match[1])*60+Number(match[2]);
  if(seconds>86400)throw new Error('Use a remaining time from 0:00 to 1440:00.');
  return seconds;
}
