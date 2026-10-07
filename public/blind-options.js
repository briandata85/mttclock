// Store the disabled ante beside its level so saves, copies and row edits keep it.
const validAnte=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=1e10;
export function noAnteEnabled(levels){
  const playing=levels.filter(row=>!row.isBreak);
  return playing.length>0&&playing.every(row=>row.ante===0);
}
export function withNoAnte(levels,enabled){
  return levels.map(row=>{
    const {anteWhenEnabled,...level}=row;
    if(row.isBreak)return {...level,ante:0};
    if(enabled)return {...level,ante:0,anteWhenEnabled:row.ante===0&&validAnte(anteWhenEnabled)?anteWhenEnabled:row.ante};
    return {...level,ante:validAnte(anteWhenEnabled)?anteWhenEnabled:row.ante>0?row.ante:row.big};
  });
}
