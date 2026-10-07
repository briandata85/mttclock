import {fontChoices,finances,remainingMs,boardLayout,boardTheme,boardThemeDetails,boardColors,boardColorChoice,boardFontChoice,boardGradient,shadeColor,backgroundArt,currencyCode,currencies,fieldVisible,playersRatio,wsopBlinds,payoutPresentation} from './domain.js';
import {payoutDisplayBands} from './payout-plans.js';
import {setControlIcon} from './controls.js';
import {renderedArtworkSettings,artworkUrl,renderArtwork} from './artwork.js';
import {themeContext} from './theme-context.js';
const number=new Intl.NumberFormat('en-US');
export const money=(n,currency='USD')=>new Intl.NumberFormat('en-US',{style:'currency',currency:Object.hasOwn(currencies,currency)?currency:'USD',maximumFractionDigits:Number.isInteger(n)?0:2}).format(n);
export const clock=(n,alwaysHours=false)=>{n=Math.max(0,Math.ceil(n));const h=Math.floor(n/3600),m=Math.floor(n%3600/60),s=n%60;return (h||alwaysHours?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');};
export const duration=n=>{const minutes=Math.max(0,Math.ceil(n/60)),hours=Math.floor(minutes/60),remainder=minutes%60;return hours?`${hours}hr${remainder?`${remainder}min`:''}`:`${minutes}min`;};
export const ordinal=n=>`${n}${n%100>=11&&n%100<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th')}`;
// A row crosses the viewport every three seconds, regardless of field size.
// Both columns contain the entire list; the second starts halfway around it.
export const classicPayoutScroll=count=>({scroll:count>6,duration:count>6?count*3:0,stagger:count>6?-count*1.5:0});
function classicPayoutEmptyMessage(s,presentation) {
  if(s.entrants===0){
    if(s.payoutPreset==='custom'&&!s.customPayouts?.length)return 'No payout amounts are configured';
    return presentation.holding?'Payouts appear after the first entry and late registration closes':'Payouts appear after the first entry';
  }
  if(s.playersLeft===0)return 'No players remain';
  if(presentation.paid.length===0)return 'No payout amounts are configured';
  if(presentation.holding)return 'Payouts appear after late registration closes';
  return '';
}
export const levelName=(s,i)=>s.levels[i].isBreak?'BREAK':`Level ${s.levels.slice(0,i+1).filter(l=>!l.isBreak).length}`;
export function stackParts(value,bigBlind) {
  if(value===null||value===undefined||value===''||!Number.isFinite(Number(value))||Number(value)<0)return {chips:'—',bb:''};
  const chips=Math.round(Number(value));
  return {chips:number.format(chips),bb:bigBlind>0?`(${number.format(Math.round(chips/bigBlind))} BB)`:''};
}
// Each document owns its selectors and caches. Static previews use this same
// renderer without sharing live styles, payout signatures, or fitted text.
export function createBoardRenderer(document,{wallNow=Date.now}={}) {
const $=id=>document.getElementById(id);
const getComputedStyle=el=>document.defaultView.getComputedStyle(el);
let signature='',appearance='',lastSecond=-1,agendaSignature='';
let fitCache=new WeakMap();
document.fonts?.addEventListener('loadingdone',()=>{fitCache=new WeakMap();});
function fitClassicTitle() {
  const el=$('event-name');
  if(!el.getClientRects().length)return;
  const font=getComputedStyle(el),base=getComputedStyle(el.parentElement).fontSize;
  const key=['classic-title',el.textContent,el.clientWidth,el.clientHeight,base,font.fontFamily,font.fontWeight,font.fontStyle,font.fontStretch].join('|');
  if(fitCache.get(el)===key)return;
  // Keep Classic's original CSS size when it fits. A long name shrinks within
  // its existing row, without changing the favorite layout or truncating text.
  el.style.removeProperty('font-size');
  const css=getComputedStyle(el),size=parseFloat(css.fontSize);
  const available=el.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
  const range=document.createRange();range.selectNodeContents(el);
  const width=range.getBoundingClientRect().width;
  if(Number.isFinite(size)&&width>available&&available>2)el.style.fontSize=`${size*(available-2)/width}px`;
  fitCache.set(el,key);
}
function fitText(el,maxEm,container=el.parentElement,measureContent=false) {
  if(!el.getClientRects().length)return;
  const board=document.querySelector('.wsop-board'),base=parseFloat(getComputedStyle(board).fontSize);
  const css=getComputedStyle(container);let available=container.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
  if(css.display==='flex'&&css.flexDirection==='row'&&el.parentElement===container){
    const siblings=Array.from(container.children).filter(child=>child!==el&&!child.hidden&&child.getClientRects().length);
    available-=siblings.reduce((sum,child)=>sum+child.getBoundingClientRect().width,0)+(parseFloat(css.columnGap)||0)*siblings.length;
  }
  const font=getComputedStyle(el),key=[el.textContent,maxEm,available,base,font.fontFamily,font.fontWeight].join('|');
  if(fitCache.get(el)===key)return;
  el.style.fontSize=`${base*maxEm}px`;
  // A timer occupying an allocated grid cell can include padding. Measure its
  // text, not the padded cell itself, when fitting the redesigned variants.
  let width=el.scrollWidth;
  if(measureContent){const range=document.createRange();range.selectNodeContents(el);width=range.getBoundingClientRect().width;}
  if(width>available&&available>0)el.style.fontSize=`${base*maxEm*(available-2)/width}px`;
  fitCache.set(el,key);
}
function render(s,now) {
  const level=s.levels[s.currentIndex],next=s.levels.slice(s.currentIndex+1).find(l=>!l.isBreak);
  const left=Math.ceil(remainingMs(s,now)/1000),f=finances(s),cash=n=>money(n,currencyCode(s));
  // Both presentations receive the same derived values; only one is visible.
  const text=(id,value)=>{for(const key of [id,`wsop-${id}`]){const el=$(key);if(el&&el.textContent!==String(value))el.textContent=value;}};
  text('timer',clock(left));text('level-kicker',levelName(s,s.currentIndex));
  // This read-only Settings strip is part of the accepted board render. It
  // receives the same state and clock instant, never the editable draft.
  const settingsClock=$('settings-live-context');
  if(settingsClock){
    settingsClock.hidden=false;
    text('settings-live-timer',clock(left));text('settings-live-level',levelName(s,s.currentIndex));
    text('settings-live-status',({running:'Running',paused:'Paused',ready:'Ready',finished:'Finished'})[s.clock.status]||'');
    const players=$('settings-live-players'),showPlayers=fieldVisible(s,'playersLeft');
    players.hidden=!showPlayers;players.textContent=showPlayers?`${number.format(s.playersLeft)} players`:'';
  }
  text('director-summary',`${levelName(s,s.currentIndex)} · ${clock(left)} · ${s.clock.status==='running'?'Running':s.clock.status==='ready'?'Ready':s.clock.status==='finished'?'Finished':'Paused'} · ${s.playersLeft} players`);
  $('timer').classList.toggle('paused',s.clock.status==='paused');$('pause-label').hidden=s.clock.status!=='paused';
  $('wsop-timer').classList.toggle('paused',s.clock.status==='paused');$('wsop-timer').classList.toggle('has-hours',left>=3600);
  text('wsop-pause-label',s.clock.status==='paused'?'PAUSED':'');
  text('event-name',s.eventName||'Poker Tournament');
  for(const [id,key] of [['ante','ante'],['small-blind','small'],['big-blind','big']]) text(id,level.isBreak?(key==='small'?'BREAK':'—'):number.format(level[key]));
  text('next-ante',next?number.format(next.ante):'—');text('next-blinds',next?`${number.format(next.small)} - ${number.format(next.big)}`:'Final level');
  const shownBlinds=level.isBreak?next:level;
  text('wsop-blinds-label',level.isBreak?'After the break':'Blinds');
  text('wsop-current-blinds',wsopBlinds(shownBlinds));
  text('wsop-next-blinds',next?wsopBlinds(next,fieldVisible(s,'nextAnte')):'Final level');
  text('entrants',number.format(s.entrants));text('players-left',number.format(s.playersLeft));text('prize-pool',cash(f.pool));
  text('wsop-players-left',playersRatio(s));
  text('chop-value',s.playersLeft?cash(Math.round(f.pool/s.playersLeft*100)/100):'—');
  text('total-chips',number.format(s.entrants*s.startingStack));text('average-stack',s.playersLeft?number.format(Math.round(s.entrants*s.startingStack/s.playersLeft)):'—');
  const stack=(id,value)=>{
    const el=$(id),{chips,bb}=stackParts(value,shownBlinds?.big);
    if(el.textContent===chips+bb)return;
    const suffix=document.createElement('span');suffix.className='wsop-stack-bb';suffix.textContent=bb;
    el.replaceChildren(document.createTextNode(chips),suffix);
  };
  stack('wsop-average-stack',s.playersLeft?s.entrants*s.startingStack/s.playersLeft:null);
  stack('wsop-largest-stack',s.appearance.largestStack);stack('wsop-smallest-stack',s.appearance.smallestStack);
  let breakTime=left,found=level.isBreak;
  if(!found)for(const l of s.levels.slice(s.currentIndex+1)){if(l.isBreak){found=true;break;}breakTime+=l.minutes*60;}
  text('next-break',level.isBreak?'Now':found?duration(breakTime):'—');
  text('wsop-next-break',level.isBreak?'Now':found?`${Math.floor(breakTime/60)}:${String(breakTime%60).padStart(2,'0')}`:'—');
  const presentation=payoutPresentation(s,now),{reg,paid}=presentation;
  text('late-reg',reg.closed?'Closed':duration(reg.seconds));
  text('wsop-late-reg',reg.closed?'Closed':clock(reg.seconds,true));
  text('wsop-play-down',typeof s.appearance.playDownText==='string'?s.appearance.playDownText:'');
  $('level-progress').style.width=`${Math.min(100,left/(level.minutes*60)*100)}%`;
  setControlIcon($('director-toggle')?.querySelector('[data-control-icon]'),s.clock.status==='running'?'pause':'play');
  text('director-toggle-label',s.clock.status==='running'?'Pause':s.clock.status==='paused'?'Resume':'Start');
  text('ticker-text',s.tickerText);$('ticker').hidden=!s.showTicker||!s.tickerText.trim();document.querySelector('.board-grid').classList.toggle('no-ticker',$('ticker').hidden);
  const values=s.tableNumbers.split(/[,\s]+/).filter(Boolean).slice(0,6);
  for(const id of ['table-numbers','wsop-table-numbers']) {
    if($(id).dataset.values!==JSON.stringify(values)) {$(id).replaceChildren(...values.map(v=>{const b=document.createElement('b');b.textContent=v;return b;}));$(id).dataset.values=JSON.stringify(values);}
    $(id).hidden=!s.showTableNumbers||!values.length;
  }
  const visiblePaid=presentation.showPayouts?paid:[];
  const classicEmpty=boardLayout(s)==='classic'&&!presentation.showPayouts?classicPayoutEmptyMessage(s,presentation):'';
  for(const id of ['payout-empty-left','payout-empty-right']){
    const el=$(id);if(!el)continue;
    if(classicEmpty){el.hidden=false;if(el.textContent!==classicEmpty)el.textContent=classicEmpty;}
    else {el.hidden=true;if(el.textContent)el.textContent='';}
  }
  const sig=JSON.stringify([visiblePaid,presentation.payoutRows,currencyCode(s)]);
  text('wsop-next-prize',presentation.nextPrize===null?'—':cash(presentation.nextPrize));
  if(sig!==signature) {
    signature=sig;document.querySelectorAll('.panel-heading span').forEach(el=>el.textContent='Remaining Places');
    const rows=visiblePaid.map((value,i)=>`<li${i===0?' class="first-place"':''}><span>${ordinal(i+1)}</span><i></i><strong>${cash(value)}</strong></li>`).join('');
    const {scroll,duration,stagger}=classicPayoutScroll(visiblePaid.length);
    for(const id of ['payout-list','payout-list-right']) {
      $(id).innerHTML=scroll?rows+rows:rows;$(id).classList.toggle('scrolling-feed',scroll);
      $(id).style.setProperty('--payout-cycle',`${duration}s`);
      $(id).style.setProperty('--payout-stagger',`${stagger}s`);
      if(scroll)Array.from($(id).children).slice(visiblePaid.length).forEach(el=>el.setAttribute('aria-hidden','true'));
    }
    const bands=payoutDisplayBands(visiblePaid,presentation.payoutRows);
    $('wsop-payout-list').style.setProperty('--theme-payout-count',Math.max(1,bands.length));
    // Event uses three columns; only the number of display rows is derived.
    $('wsop-payout-list').style.setProperty('--theme-payout-ribbon-rows',Math.max(1,Math.ceil(bands.length/3)));
    document.querySelector('.wsop-board').dataset.payoutCount=String(bands.length);
    text('theme-places-paid',`${visiblePaid.length} ${visiblePaid.length===1?'place':'places'}`);
    $('wsop-payout-list').replaceChildren(...bands.map(band=>{
      const li=document.createElement('li'),place=document.createElement('span'),amount=document.createElement('strong');
      if(band.from===1)li.className='first-place';
      place.textContent=band.from===band.to?ordinal(band.from):`${ordinal(band.from)}–${ordinal(band.to)}`;
      amount.textContent=band.low===band.high?cash(band.low):`${cash(band.low)}–${cash(band.high)}`;
      if(band.low!==band.high){li.classList.add('payout-amount-range');li.title='Prize amounts vary within these places; shown from lowest to highest.';}
      li.append(place,amount);return li;
    }));
    $('wsop-payout-list').classList.remove('scrolling-feed');
    $('wsop-payout-range-note').hidden=!bands.some(band=>band.low!==band.high);
    text('places-paid-label',`${visiblePaid.length} ${visiblePaid.length===1?'place':'places'}`);text('places-paid-label-right',`${visiblePaid.length} ${visiblePaid.length===1?'place':'places'}`);
    $('wsop-payout-list').style.setProperty('--wsop-payout-rows',presentation.payoutRows);
  }
  for(const id of ['places-paid-label','places-paid-label-right']){
    const el=$(id);if(!el)continue;el.hidden=!presentation.showPayouts;if(!presentation.showPayouts)el.textContent='';
  }
  // Signed image links can renew without any tournament revision or settings change.
  const style=JSON.stringify(s.appearance);
  renderArtwork(document.querySelector('.wsop-background-art'),s.appearance);
  const currentLogo=document.querySelector('.wsop-wordmark'),currentLogoUrl=artworkUrl(s.appearance.artwork?.logo);
  currentLogo.hidden=!currentLogoUrl;
  if(currentLogoUrl&&currentLogo.getAttribute('src')!==currentLogoUrl)currentLogo.src=currentLogoUrl;
  else if(!currentLogoUrl&&currentLogo.hasAttribute('src'))currentLogo.removeAttribute('src');
  if(style!==appearance) {
    fitCache=new WeakMap();
    appearance=style;const root=document.documentElement,font=fontChoices[boardFontChoice(s)],colors=boardColors(s),gradient=boardGradient(s);
    $('app').dataset.layout=boardLayout(s);
    $('app').dataset.theme=boardTheme(s);
    const theme=boardThemeDetails(s),board=document.querySelector('.wsop-board');
    board.style.setProperty('--theme-font',theme.font);board.style.setProperty('--theme-timer-font',theme.timerFont);
    board.setAttribute('aria-label',`Live tournament display - ${theme.label}`);
    $('app').dataset.colorPreset=boardColorChoice(s);
    $('app').dataset.backgroundArt=backgroundArt(s);
    const art=renderedArtworkSettings(s.appearance),logo=document.querySelector('.wsop-wordmark');
    logo.style.width=`${17*art.logoSize/100}em`;logo.style.opacity=art.logoOpacity/100;
    $('app').dataset.wsopTypography='reference';
    root.style.setProperty('--board',colors.board);root.style.setProperty('--accent',colors.accent);
    root.style.setProperty('--board-deep',shadeColor(colors.board,.48));
    root.style.setProperty('--wsop-gradient-mid',gradient.middle);root.style.setProperty('--wsop-gradient-end',gradient.bottom);
    const themeColor=document.querySelector('meta[name="theme-color"]');if(themeColor)themeColor.content=colors.board;
    for(const k of ['board','timer']){root.style.setProperty(`--font-${k}`,font.family);root.style.setProperty(`--font-${k}-weight`,font.weight);}
    root.style.setProperty('--display-scale','1');
  }
  document.querySelectorAll('[data-display-field]').forEach(el=>el.hidden=!fieldVisible(s,el.dataset.displayField));
  document.querySelectorAll('[data-display-field="chopValue"]').forEach(el=>el.hidden=!presentation.showChop);
  document.querySelectorAll('[data-display-field="payouts"]').forEach(el=>el.hidden=!!el.closest('.wsop-board')&&!presentation.showPayouts);
  $('wsop-next-prize-field').hidden=!presentation.showNextPrize;
  $('wsop-play-down').hidden=!fieldVisible(s,'playDown')||!$('wsop-play-down').textContent.trim();
  for(const id of ['wsop-break-strip','wsop-stack-strip'])$(id).hidden=Array.from($(id).children).every(el=>el.hidden);
  // These compositions deliberately group the field/registration counts with
  // tournament totals, leaving a dedicated prize ladder. Original layouts keep
  // their existing placement policy and every saved visibility choice remains.
  const statusWithTotals=['wsop-broadcast','wsop-arena','wsop-final-table','wsop-club','wsop-compact','wsop-scoreboard','wsop-focus'].includes(boardTheme(s));
  const statusOnRight=presentation.statusRight&&!statusWithTotals;
  const rightStatus=presentation.rightStatus&&statusOnRight;
  const factTarget=$(statusOnRight?'wsop-right-facts':'wsop-left-facts');
  for(const id of ['wsop-late-reg-field','wsop-players-field'])if($(id).parentElement!==factTarget)factTarget.append($(id));
  $('wsop-right-facts').hidden=!rightStatus;
  document.querySelector('.wsop-right').classList.toggle('with-status-and-payouts',presentation.showPayouts&&rightStatus);
  document.querySelector('.board-grid').classList.remove('hide-payouts');
  document.querySelector('.stats-panel').hidden=!fieldVisible(s,'entrants')&&!fieldVisible(s,'playersLeft');
  const theme=boardThemeDetails(s);
  const context=themeContext(s,now);
  $('theme-context').hidden=!context.showProgress;
  text('theme-progress-label',context.progressLabel);
  text('theme-progress-text',`${context.status} · ${Math.round(context.percent)}%`);
  $('theme-progress').setAttribute('aria-label',context.progressLabel);
  $('theme-progress').setAttribute('aria-valuenow',String(Math.round(context.percent)));
  $('theme-progress-fill').style.width=`${context.percent}%`;
  $('theme-agenda').hidden=!context.agenda.length;
  const agendaKey=JSON.stringify(context.agenda);
  if(agendaKey!==agendaSignature) {
    agendaSignature=agendaKey;
    $('theme-agenda-list').replaceChildren(...context.agenda.map(row=>{
      const li=document.createElement('li'),label=document.createElement('span'),value=document.createElement('strong'),length=document.createElement('small');
      li.className='theme-agenda-row';li.classList.toggle('is-break',row.isBreak);
      label.textContent=row.label;value.textContent=row.value;length.textContent=`${row.minutes} min`;
      li.append(label,value,length);return li;
    }));
  }
  const content=document.querySelector('.wsop-content');
  const factCount=[...$('wsop-left-facts').children].filter(el=>!el.hidden).length;
  document.querySelector('.wsop-board').dataset.factCount=String(factCount);
  content.dataset.hasFacts=String(factCount>0);
  content.dataset.hasPayouts=String(presentation.showPayouts);
  content.dataset.hasStatus=String(rightStatus);
  content.dataset.hasAgenda=String(context.agenda.length>0);
  const themeCss=getComputedStyle(document.querySelector('.wsop-board'));
  const size=(name,fallback)=>{const value=parseFloat(themeCss.getPropertyValue(`--theme-${name}-size`));return Number.isFinite(value)&&value>0?value:fallback;};
  // Original displays retain their exact sizing. Variants fit their timer to
  // the allotted panel, including three-part hour counts and mono/serif type.
  fitClassicTitle();
  if(theme.timer)fitText($('wsop-timer'),left>=3600?size('hours',theme.timerHours):size('timer',theme.timer),$('wsop-timer'),true);
  else $('wsop-timer').style.removeProperty('font-size');
  fitText($('wsop-event-name'),2.8,$('wsop-event-name'));
  document.querySelectorAll('.wsop-stack-strip strong').forEach(el=>fitText(el,theme.timer?size('stack',2.2):2.2));
  document.querySelectorAll('.wsop-fact strong').forEach(el=>fitText(el,theme.timer?size('fact',2.35):2.35));
  fitText($('wsop-current-blinds'),theme.timer?size('blinds',3):3,theme.timer?document.querySelector('.wsop-blinds'):document.querySelector('.wsop-hero'));
  fitText($('wsop-next-blinds'),theme.timer?size('next',2.7):2.7,theme.timer?document.querySelector('.wsop-next'):document.querySelector('.wsop-hero'));
  document.querySelectorAll('#wsop-payout-list li strong').forEach(el=>fitText(el,theme.timer?size('payout',1.9):1.9,el));
  document.querySelectorAll('.theme-agenda-row strong').forEach(el=>fitText(el,size('agenda',2.2),el));
  const wallTime=wallNow(),second=Math.floor(wallTime/1000);
  if(second!==lastSecond){lastSecond=second;const d=new Date(wallTime),sec=d.getSeconds(),m=d.getMinutes()+sec/60,h=d.getHours()%12+m/60;
    for(const prefix of ['','wsop-']) {
      for(const [id,deg] of [['hour-hand',h*30],['minute-hand',m*6],['second-hand',sec*6]])$(prefix+id).style.transform=`translateX(-50%) rotate(${deg}deg)`;
      $(prefix+'wall-clock').setAttribute('aria-label',`Current time ${d.toLocaleTimeString()}`);
    }
  }
}

return render;
}

let liveRenderer;
export function renderBoard(s,now) {
  liveRenderer??=createBoardRenderer(document);
  liveRenderer(s,now);
}
