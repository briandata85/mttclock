// A small, owner-only saved snapshot. Never a live clock or an authorization input.
const statuses=new Set(['ready','running','paused','finished']);
const count=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000000?n:null;
export function savedTournamentSummary(value){
  if(!value||!statuses.has(value.status))return null;
  const playersLeft=count(value.playersLeft),entrants=count(value.entrants);
  const consistent=playersLeft===null||entrants===null||playersLeft<=entrants;
  const remainingMs=value.status!=='running'&&Number.isSafeInteger(value.remainingMs)&&value.remainingMs>=0&&value.remainingMs<=86400000?value.remainingMs:null;
  return {status:value.status,playersLeft:consistent?playersLeft:null,entrants:consistent?entrants:null,remainingMs};
}
export function savedProgressLabels(value){
  const s=savedTournamentSummary(value);if(!s)return null;
  const status={ready:'Ready',running:'Running',paused:'Paused',finished:'Finished'}[s.status];
  let clock=null;
  if(s.remainingMs!==null){const seconds=Math.ceil(s.remainingMs/1000);clock=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;}
  const players=s.playersLeft===null?null:s.entrants===null?`${s.playersLeft} remaining`:`${s.playersLeft} / ${s.entrants}`;
  return {status,clock,players};
}
