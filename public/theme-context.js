import {boardTheme,fieldVisible,remainingMs,wsopBlinds} from './domain.js';

// Presentation only: share the clock's supplied time and never mutate its state.
export function themeContext(s,now) {
  const theme=boardTheme(s),level=s.levels[s.currentIndex];
  const seconds=Math.max(0,remainingMs(s,now)/1000);
  const percent=level.minutes>0?Math.max(0,Math.min(100,seconds/(level.minutes*60)*100)):0;
  const showProgress=['wsop-arena','wsop-digital'].includes(theme);
  const agenda=[];
  if(['wsop-split','wsop-compact','wsop-digital'].includes(theme)&&fieldVisible(s,'nextBlinds')) {
    let playNumber=s.levels.slice(0,s.currentIndex+1).filter(row=>!row.isBreak).length;
    for(const row of s.levels.slice(s.currentIndex+1)) {
      if(!row.isBreak)playNumber++;
      if(row.isBreak&&!fieldVisible(s,'nextBreak'))continue;
      agenda.push({label:row.isBreak?'Break':`Level ${playNumber}`,value:row.isBreak?'No blinds':wsopBlinds(row,fieldVisible(s,'nextAnte')),minutes:row.minutes,isBreak:!!row.isBreak});
      if(agenda.length===(theme==='wsop-compact'?5:3))break;
    }
  }
  return {showProgress,percent,progressLabel:level.isBreak?'Break remaining':'Level remaining',status:({running:'Running',paused:'Paused',ready:'Ready',finished:'Finished'})[s.clock.status]||'',agenda};
}
