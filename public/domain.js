export const structures = {
  deepstack: { name: 'Deepstack', rows: [[20,100,200,200],[20,200,400,400],[20,300,600,600],[15,0,0,0,true],[20,400,800,800],[20,600,1200,1200],[20,1000,1500,1500],[15,0,0,0,true],[20,1000,2000,2000],[20,1500,3000,3000],[20,2000,4000,4000],[15,0,0,0,true],[20,3000,6000,6000],[20,4000,8000,8000],[20,5000,10000,10000],[20,6000,12000,12000]] },
  standard: { name: 'Standard', rows: [[15,100,200,200],[15,200,300,300],[15,200,400,400],[10,0,0,0,true],[15,300,600,600],[15,400,800,800],[15,500,1000,1000],[10,0,0,0,true],[15,600,1200,1200],[15,1000,1500,1500],[15,1000,2000,2000],[10,0,0,0,true],[15,1500,3000,3000],[15,2000,4000,4000],[15,3000,6000,6000]] },
  turbo: { name: 'Turbo', rows: [[8,100,200,200],[8,200,400,400],[8,300,600,600],[8,500,1000,1000],[8,0,0,0,true],[8,1000,1500,1500],[8,1000,2000,2000],[8,1500,3000,3000],[8,2000,4000,4000],[8,3000,6000,6000],[8,0,0,0,true],[8,4000,8000,4000],[8,5000,10000,5000],[8,7500,15000,15000]] },
  mixed: { name: 'Omaha / Stud Mixed', rows: [[30,100,200,100],[30,200,400,200],[30,300,600,300],[15,0,0,0,true],[30,500,1000,500],[30,600,1200,600],[30,1000,2000,1000],[15,0,0,0,true],[30,1500,3000,1500],[30,2000,4000,2000],[30,3000,6000,3000],[15,0,0,0,true],[30,4000,8000,4000],[30,5000,10000,5000]] }
};
export const levelsFor = key => structures[key].rows.map(([minutes, small, big, ante, isBreak = false]) => ({minutes, small, big, ante, isBreak}));
export const defaults = () => ({
  eventName: "$130 NO-LIMIT HOLD'EM TRIPLE STACK TURBO", entrants: 91, playersLeft: 42,
  buyIn: 300, prizePerEntry: 255, startingStack: 10000, autoAdvance: true,
  tableNumbers: '', showTableNumbers: false, tickerText: 'WELCOME POKER CHIP FORUM - GOOD LUCK!', showTicker: true,
  structurePreset: 'deepstack', structureName: 'Deepstack', levels: levelsFor('deepstack'),
  currentIndex: 0, timerRemaining: 1200, payoutPreset: 'top10', payoutLabel: 'Remaining Places', roundPayouts: false, customPayouts: [],
  appearance: {board: '#063b1d', accent: '#f5ea36', boardFont: 'arial-bold', scale: 100},
  bounty: {mode: 'off', amount: 0}, registration: {cutoffIndex: 4, override: 'auto'},
  clock: {status: 'ready', deadline: null, remainingMs: 1200000, run: 0, consumed: [], lastCheck: null}
});
export function remainingMs(s, now = Date.now()) { return Math.max(0, s.clock.status === 'running' ? s.clock.deadline - now : s.clock.remainingMs); }
// Existing records and legacy imports keep their values; only new tournaments start empty.
export const freshTournament=()=>({...defaults(),eventName:'Poker Tournament',entrants:0,playersLeft:0,buyIn:0,prizePerEntry:0,payoutPreset:'custom',customPayouts:[],tickerText:'WELCOME POKER PLAYERS - GOOD LUCK!'});
// Optional nested settings keep older saved tournaments and hosted APIs compatible.
// Theme IDs describe presentation only. Colors, artwork and tournament rules are
// separate settings. Variations reorganize the director's enabled fields;
// contextual schedule panels derive only from those same visibility choices.
export const themeDetails = {
  classic:{label:'Classic',group:'Originals',description:'The original board layout and familiar bold Arial typography.',font:'Arial, Helvetica, sans-serif',timerFont:'Arial, Helvetica, sans-serif'},
  wsop:{label:'Modern',group:'Originals',description:'The familiar three-column display: a central clock, side statistics and a stationary payout rail.',font:"'Clock Roboto', Arial, sans-serif",timerFont:"'Clock Roboto', Arial, sans-serif"},
  'wsop-broadcast':{signaturePalette:true,label:'Broadcast',group:'Room & event',description:'A navy broadcast desk with ice-white numbers, cyan rails and a sharp lower-third ribbon. Its own studio palette.',font:"'Clock Roboto', Arial, sans-serif",timerFont:"'Clock Roboto', Arial, sans-serif",timer:9.6,timerHours:8.2,preview:'ribbon'},
  'wsop-arena':{signaturePalette:true,label:'Neon Arena',group:'Room & event',description:'Electric violet, cyan and hot pink: a luminous stadium countdown with a field-score band. Fixed neon palette.',font:"'Clock Roboto', Arial, sans-serif",timerFont:"'Clock Roboto', Arial, sans-serif",timer:11.5,timerHours:9.8,preview:'bold'},
  'wsop-final-table':{signaturePalette:true,label:'Club Royale',group:'Room & event',description:'Champagne type, oxblood panels and Art Deco borders. A prize-led private-club display with its own palette.',font:"Georgia, 'Times New Roman', serif",timerFont:"Georgia, 'Times New Roman', serif",timer:9.1,timerHours:7.7,preview:'serif'},
  'wsop-club':{label:'Event',group:'Room & event',description:'For your event artwork: an open picture area, a clear clock card and a wide lower prize ribbon. Add your image under Images.',font:"'Trebuchet MS', Arial, sans-serif",timerFont:"'Trebuchet MS', Arial, sans-serif",timer:9.4,timerHours:8,preview:'rounded'},
  'wsop-split':{label:'Split Stage',group:'Planning & information',description:'For planning ahead: the current clock occupies one stage and upcoming levels occupy the other.',font:"'Clock Roboto', Arial, sans-serif",timerFont:"'Clock Roboto', Arial, sans-serif",timer:9.5,timerHours:8,preview:'split'},
  'wsop-rail':{label:'Bottom Rail',group:'Planning & information',description:'For wide screens: an open clock stage with tournament totals collected into a horizontal bottom rail.',font:'Arial, Helvetica, sans-serif',timerFont:'Arial, Helvetica, sans-serif',timer:10,timerHours:8.5,preview:'rail'},
  'wsop-compact':{label:'Run Sheet',group:'Planning & information',description:'For the tournament desk: a five-row upcoming schedule with explicit breaks, beside the current clock and payouts.',font:'Verdana, Arial, sans-serif',timerFont:'Verdana, Arial, sans-serif',timer:8.5,timerHours:7.1,preview:'compact'},
  'wsop-scoreboard':{signaturePalette:true,label:'Retro Desktop',group:'Planning & information',description:'Cream windows, forest-green title bars and mint number panels. A chunky typewriter-era desktop for your table.',font:"'Courier New', 'Liberation Mono', monospace",timerFont:"'Courier New', 'Liberation Mono', monospace",timer:9,timerHours:7.5,preview:'score'},
  'wsop-digital':{signaturePalette:true,label:'Terminal',group:'Planning & information',description:'Phosphor-green type on near-black, a live progress meter and a command-center schedule. Fixed terminal palette.',font:"'Courier New', 'Liberation Mono', monospace",timerFont:"'Courier New', 'Liberation Mono', monospace",timer:9.2,timerHours:7.8,preview:'digital'},
  'wsop-focus':{signaturePalette:true,label:'Flip Clock',group:'Distance & clarity',description:'A vintage station clock: warm ivory numerals on split charcoal panels, brass rules and a full-width time stage. Its own mechanical palette.',font:"'Courier New', 'Liberation Mono', monospace",timerFont:"'Clock Roboto', Arial, sans-serif",timer:12.6,timerHours:10.4,preview:'focus'},
  'wsop-minimal':{signaturePalette:true,label:'Paper Ledger',group:'Distance & clarity',description:'An ivory editorial page with ink-black serif numerals and rust-red rules. Quiet, bright and deliberately different.',font:"Georgia, 'Times New Roman', serif",timerFont:"Georgia, 'Times New Roman', serif",timer:9.5,timerHours:8.1,preview:'minimal'},
  'wsop-contrast':{label:'High Contrast',group:'Distance & clarity',description:'For clear visual separation: large white-on-black reading blocks and firm borders around each information group.',font:'Arial, Helvetica, sans-serif',timerFont:'Arial, Helvetica, sans-serif',timer:10,timerHours:8.5,preview:'contrast'}
};
export const featuredThemes = Object.freeze(['classic','wsop','wsop-scoreboard','wsop-broadcast','wsop-minimal','wsop-digital','wsop-final-table','wsop-arena','wsop-focus']);
export const themes = Object.fromEntries(Object.entries(themeDetails).map(([key,details])=>[key,details.label]));
export const colorPresets = {
  blue:{label:'Blue',board:'#125d8c',accent:'#f5ea36'},red:{label:'Red',board:'#ad0000',accent:'#f5ea36'},
  gold:{label:'Gold',board:'#805600',accent:'#f5ea36'},green:{label:'Green',board:'#063b1d',accent:'#f5ea36'},
  purple:{label:'Purple',board:'#632487',accent:'#f5ea36'},black:{label:'Black',board:'#000000',accent:'#f5ea36'}
};
const legacyColor = s => /^wsop-(blue|red|gold|green|purple|black)$/.exec(s.appearance?.theme)?.[1];
export const boardTheme = s => Object.hasOwn(themes,s.appearance?.theme) ? s.appearance.theme : (legacyColor(s)||s.appearance?.layout==='wsop'?'wsop':'classic');
export const boardLayout = s => boardTheme(s)==='classic'?'classic':'wsop';
export const boardThemeDetails = s => themeDetails[boardTheme(s)];
export function boardColorChoice(s) {
  const a=s.appearance||{};
  if(a.colorPreset==='custom'||Object.hasOwn(colorPresets,a.colorPreset))return a.colorPreset;
  if(legacyColor(s))return legacyColor(s);
  if(boardLayout(s)==='wsop')return 'blue';
  return Object.keys(colorPresets).find(key=>colorPresets[key].board===a.board?.toLowerCase()&&colorPresets[key].accent===a.accent?.toLowerCase())||'custom';
}
export function boardColors(s) {
  const preset=colorPresets[boardColorChoice(s)],a=s.appearance||{};
  return {board:preset?.board||a.board||'#063b1d',accent:preset?.accent||a.accent||'#f5ea36'};
}
// Legacy font settings remain readable, but both layouts now use their standard type.
export const boardFontChoice = () => 'arial-bold';
export const shadeColor = (hex,ratio) => '#'+[1,3,5].map(i=>Math.round(parseInt(hex.slice(i,i+2),16)*ratio).toString(16).padStart(2,'0')).join('');
export function boardGradient(s) {
  const {board}=boardColors(s);
  // Artwork is an overlay only: every image choice shares exactly the same gradient.
  return {top:board,middle:shadeColor(board,.65),bottom:shadeColor(board,.3)};
}
// Freeze implicit legacy defaults when changing layout; keep color and artwork independent.
export const appearanceForLayout = (s,theme) => ({...s.appearance,...boardColors(s),theme,layout:theme==='classic'?'classic':'wsop',colorPreset:boardColorChoice(s),backgroundArt:backgroundArt(s)});
export const backgroundChoices = {none:'None · Color only',cover:'Fill (crop edges)',contain:'Fit (keep whole image)',stretch:'Stretch',large:'Large image',small:'Scattered images',watermark:'Repeating watermark'};
export const backgroundArt = s => Object.hasOwn(backgroundChoices,s.appearance?.backgroundArt) ? s.appearance.backgroundArt : legacyColor(s)==='gold'?'small':'large';
export const currencies = {USD:'US dollar ($)',EUR:'Euro (€)',CAD:'Canadian dollar (CA$)',GBP:'British pound (£)'};
export const currencyCode = s => Object.hasOwn(currencies,s.appearance?.currency) ? s.appearance.currency : 'USD';
export const displayFields = [
  {key:'prizePool',label:'Prize pool'}, {key:'entrants',label:'Entrants',onlyClassic:true},
  {key:'playersLeft',label:'Players left'}, {key:'chopValue',label:'Chop value',classicOptional:true},
  {key:'lateReg',label:'Late registration',classicOptional:true}, {key:'payouts',label:'Payout list'},
  {key:'nextPrize',label:'Next prize',onlyWsop:true},
  {key:'nextBlinds',label:'Next blinds'}, {key:'nextAnte',label:'Next ante'},
  {key:'totalChips',label:'Total chips',wsop:false}, {key:'averageStack',label:'Average stack'},
  {key:'nextBreak',label:'Next break'}, {key:'wallClock',label:'Time-of-day clock'},
  {key:'largestStack',label:'Largest stack',onlyWsop:true}, {key:'smallestStack',label:'Smallest stack',onlyWsop:true},
  {key:'playDown',label:'Play-down message',onlyWsop:true}
];
export function fieldConfigurable(s,key) {
  const field=displayFields.find(f=>f.key===key);
  return !!field&&(boardLayout(s)==='wsop'?!field.onlyClassic:field.classicOptional===true);
}
export function fieldVisible(s,key) {
  const field=displayFields.find(f=>f.key===key);
  if(!field)return false;
  const wsop=boardLayout(s)==='wsop';
  if(wsop&&field.onlyClassic||!wsop&&field.onlyWsop)return false;
  // A WSOP field preference must not remove a fixed field from Classic.
  if(!wsop&&!field.classicOptional)return true;
  if(typeof s.appearance?.fields?.[key]==='boolean')return s.appearance.fields[key];
  return wsop ? field.wsop!==false : true;
}
export const playersRatio = s => `${s.playersLeft.toLocaleString('en-US')} / ${s.entrants.toLocaleString('en-US')}`;
export function wsopBlinds(level,showAnte=true) {
  return level ? `${level.small.toLocaleString('en-US')} | ${level.big.toLocaleString('en-US')}${showAnte&&level.ante>0?` (${level.ante.toLocaleString('en-US')})`:''}` : '—';
}
export function finances(s) {
  const gross = Math.round(s.entrants * s.prizePerEntry * 100) / 100;
  const reserve = s.bounty.mode === 'off' ? 0 : Math.round(s.bounty.amount * (s.bounty.mode === 'per-entry' ? s.entrants : 1) * 100) / 100;
  return {gross, reserve, pool: Math.max(0, Math.round((gross - reserve) * 100) / 100)};
}
export function payouts(s) {
  if (s.payoutPreset === 'custom') return [...s.customPayouts];
  // Draft input can temporarily exceed the validated 10,000-entry server limit.
  const n = s.payoutPreset === 'winner' ? 1 : Math.min(2000,Math.max(1, Math.ceil((Number.isFinite(s.entrants)?s.entrants:0) * ({top10:.1,top15:.15,top20:.2}[s.payoutPreset] || .1))));
  const pool = finances(s).pool;
  const decay = s.payoutPreset === 'top20' ? .84 : s.payoutPreset === 'top15' ? .80 : .74;
  const weights = Array.from({length:n}, (_, i) => decay ** i), sum = weights.reduce((a,b) => a+b,0);
  if(!s.roundPayouts) {
    // Preserve the original preset schedule: whole dollars, remainder to first place.
    const values=weights.map(w=>Math.floor(pool*w/sum));
    values[0]=Math.round((values[0]+pool-values.reduce((a,b)=>a+b,0))*100)/100;
    return values;
  }
  // Allocate whole units by largest remainder; rounding never manufactures prize money.
  const unit = 20;
  const units = Math.floor((pool + 1e-7) / unit);
  const exact = weights.map(w => units*w/sum), result = exact.map(Math.floor);
  const order = exact.map((v,i) => ({i, fraction:v-result[i]})).sort((a,b) => b.fraction-a.fraction || a.i-b.i);
  for (let i=0, rest=units-result.reduce((a,b)=>a+b,0); i<rest; i++) result[order[i].i]++;
  return result.map(v => Math.round(v*unit*100)/100);
}
export function registration(s, now = Date.now()) {
  // Older saves may contain manual overrides. Keep them readable, but registration
  // is now always derived from the selected level boundary on every screen.
  if (s.currentIndex >= s.registration.cutoffIndex) return {closed:true, seconds:0};
  let ms = remainingMs(s,now);
  for(let i=s.currentIndex+1; i<s.registration.cutoffIndex; i++) ms += s.levels[i].minutes*60000;
  return {closed:ms<=0, seconds:Math.ceil(ms/1000)};
}
// Display policy only: never rewrites the payout schedule or tournament finances.
export function payoutPresentation(s, now = Date.now()) {
  const reg=registration(s,now),schedule=payouts(s),paid=schedule.slice(0,s.playersLeft);
  const holding=s.appearance?.payoutVisibility==='after-registration'&&!reg.closed;
  const showPayouts=fieldVisible(s,'payouts')&&!holding&&paid.length>0;
  const statusRight=!reg.closed||!showPayouts;
  const rightStatus=statusRight&&(fieldVisible(s,'lateReg')||fieldVisible(s,'playersLeft'));
  const inMoney=s.playersLeft>0&&s.playersLeft<=schedule.length;
  return {reg,paid,holding,showPayouts,statusRight,rightStatus,
    nextPrize:inMoney?schedule[s.playersLeft-1]:null,
    showNextPrize:fieldVisible(s,'nextPrize')&&!holding&&inMoney,
    showChop:fieldVisible(s,'chopValue')&&(!holding||boardLayout(s)==='classic'),
    payoutRows:showPayouts&&rightStatus?10:15};
}
export const fontChoices = {
  rounded: {family:"'Arial Rounded MT Bold', 'Trebuchet MS', Arial, sans-serif",weight:900},
  arial:{family:'Arial, Helvetica, sans-serif',weight:400}, 'arial-bold':{family:'Arial, Helvetica, sans-serif',weight:700},
  georgia:{family:"Georgia, 'Times New Roman', serif",weight:700},trebuchet:{family:"'Trebuchet MS', Arial, sans-serif",weight:700},verdana:{family:'Verdana, Arial, sans-serif',weight:700}
};
