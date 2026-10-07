import {defaults,themes,boardColors,boardColorChoice,currencyCode,displayFields} from './domain.js';
import {createBoardRenderer} from './board.js';

// Frozen sample data, never a second tournament or a snapshot of the saved one.
export const PREVIEW_NOW=Date.UTC(2020,0,1,10,8,0);
const PREVIEW_WIDTH=1000;
export const themePreviewRatio=theme=>theme==='classic'?1.58:16/9;
export function themePreviewState(source,theme) {
  const s=defaults(),colors=boardColors(source);
  const color=(value,fallback)=>/^#[\da-f]{6}$/i.test(value)?value:fallback;
  s.eventName='POKER TOURNAMENT';s.entrants=72;s.playersLeft=36;
  s.buyIn=100;s.prizePerEntry=100;s.startingStack=20000;
  s.payoutPreset='custom';s.customPayouts=[2700,1700,1100,800,550,350];
  s.tickerText='WELCOME PLAYERS — GOOD LUCK!';s.showTicker=source.showTicker!==false;
  s.tableNumbers='1, 2, 3';s.showTableNumbers=source.showTableNumbers===true;
  s.levels=[
    {minutes:20,small:25,big:50,ante:50,isBreak:false},
    {minutes:20,small:50,big:100,ante:100,isBreak:false},
    {minutes:20,small:75,big:150,ante:150,isBreak:false},
    {minutes:20,small:100,big:200,ante:200,isBreak:false},
    {minutes:20,small:150,big:300,ante:300,isBreak:false},
    {minutes:20,small:200,big:400,ante:400,isBreak:false},
    {minutes:10,small:0,big:0,ante:0,isBreak:true},
    {minutes:20,small:300,big:600,ante:600,isBreak:false},
    {minutes:20,small:400,big:800,ante:800,isBreak:false}
  ];
  s.currentIndex=3;s.registration={cutoffIndex:7,override:'auto'};
  // Copy only visual preferences, never arbitrary appearance values (including
  // artwork references, manual stack amounts, messages, or sound settings).
  s.appearance={
    theme:Object.hasOwn(themes,theme)?theme:'classic',
    board:color(colors.board,'#063b1d'),accent:color(colors.accent,'#f5ea36'),
    colorPreset:boardColorChoice(source),currency:currencyCode(source),backgroundArt:'none',
    fields:Object.fromEntries(displayFields.filter(({key})=>typeof source.appearance?.fields?.[key]==='boolean').map(({key})=>[key,source.appearance.fields[key]])),
    payoutVisibility:source.appearance?.payoutVisibility==='after-registration'?'after-registration':'always',
    largestStack:95000,smallestStack:20000,playDownText:'Playing down to 9 players',
    soundEnabled:false
  };
  return s;
}

// No application scripts run in the frame. Its only network dependencies are
// the same local styles and fonts as the board. Artwork/media/API access is
// blocked as a second safeguard in addition to using synthetic data only.
const previewDocument=`<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'none'; media-src 'none'; connect-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'">
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/local.css"><link rel="stylesheet" href="/wsop.css">
<style>
html,body {width:100%;height:100%;min-height:0;margin:0;padding:0;overflow:hidden;}
body .app,body .app[data-layout="wsop"] {width:100vw;height:100vh;min-height:0;margin:0;}
/* A static sample retains every layout rule, but does not blink or scroll. */
*,*::before,*::after {animation:none!important;transition:none!important;}
</style></head><body></body></html>`;

export function createThemePreview(template) {
  const owner=template.ownerDocument,element=owner.createElement('span');
  element.className='theme-board-preview';element.setAttribute('aria-hidden','true');
  const frame=owner.createElement('iframe');
  frame.title='Static tournament layout preview';frame.tabIndex=-1;frame.inert=true;
  frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-same-origin');
  frame.width=String(PREVIEW_WIDTH);
  let state=null,render=null,started=false,signature='';
  const resize=()=>{
    if(!state)return;
    const height=PREVIEW_WIDTH/themePreviewRatio(state.appearance.theme);
    frame.style.width=`${PREVIEW_WIDTH}px`;frame.style.height=`${height}px`;
    const scale=Math.min(element.clientWidth/PREVIEW_WIDTH,element.clientHeight/height);
    frame.style.transform=`translate(${(element.clientWidth-PREVIEW_WIDTH*scale)/2}px,${(element.clientHeight-height*scale)/2}px) scale(${scale})`;
  };
  const draw=()=>{
    if(!render||!state)return;
    resize();render(state,PREVIEW_NOW);element.dataset.previewReady='true';
  };
  const show=()=>{
    resize();
    // Do not create 15 documents on a normal tournament/display load. Wait
    // until Appearance (and the gallery disclosure) are actually visible.
    if(!state||!element.getClientRects().length||!element.clientWidth)return;
    if(!started){started=true;frame.srcdoc=previewDocument;element.append(frame);}else draw();
  };
  frame.addEventListener('load',()=>{
    if(!started)return;
    const document=frame.contentDocument;if(!document?.querySelector('link[href="/styles.css"]'))return;
    const app=document.createElement('main');app.id='app';app.className='app';
    app.append(document.importNode(template.content,true));
    app.querySelectorAll('[aria-live]').forEach(el=>el.removeAttribute('aria-live'));
    document.body.replaceChildren(app);
    render=createBoardRenderer(document,{wallNow:()=>PREVIEW_NOW});draw();
    // Refit once bundled fonts load, without a timer or live subscription.
    document.fonts?.ready.then(draw);
  });
  const observer=new ResizeObserver(show);observer.observe(element);
  return {element,update(source,theme){
    const next=themePreviewState(source,theme),key=JSON.stringify(next);
    if(key===signature)return;
    signature=key;state=next;element.dataset.theme=next.appearance.theme;
    show();
  }};
}
