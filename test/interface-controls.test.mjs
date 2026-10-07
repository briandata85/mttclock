import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buyInContributionPatch,prizeContributionPatch,contributionOverrideValue} from '../public/prize-contribution.js';
import {settingNumber} from '../public/setup-validation.js';
import {installInterfaceStyle,interfaceStyleKey} from '../public/interface-style.js';
test('blank advanced override follows buy-in; custom and zero overrides remain',()=>{
 let s={buyIn:100,prizePerEntry:80};assert.equal(contributionOverrideValue(s),80);
 s={...s,...prizeContributionPatch(s,null)};assert.equal(s.prizePerEntry,100);assert.equal(contributionOverrideValue(s),'');
 s={...s,...buyInContributionPatch(s,120)};assert.equal(s.prizePerEntry,120);
 for(const amount of [90,0]){s={...s,...prizeContributionPatch(s,amount)};s={...s,...buyInContributionPatch(s,150)};assert.equal(s.prizePerEntry,amount);}
});
test('actual form binding treats blank override as full buy-in and preserves intentional zero',()=>{
 const source=fs.readFileSync('public/app.js','utf8'),line=source.split('\n').find(x=>x.includes("for(const [input,key,type]of [['event-name-input'"));
 const controls=new Map(),state={buyIn:100,prizePerEntry:80};const $=id=>{if(!controls.has(id))controls.set(id,{});return controls.get(id);};
 vm.runInNewContext(line,{$,settingNumber,buyInContributionPatch,prizeContributionPatch,formState:()=>state,patch:value=>Object.assign(state,value)});
 $('prize-entry-input').oninput({target:{value:''}});assert.equal(state.prizePerEntry,100);
 $('buy-in-input').oninput({target:{value:'200'}});assert.equal(state.prizePerEntry,200);
 $('prize-entry-input').oninput({target:{value:'0'}});$('buy-in-input').oninput({target:{value:'300'}});assert.equal(state.prizePerEntry,0);
 $('prize-entry-input').oninput({target:{value:'250'}});$('buy-in-input').oninput({target:{value:'400'}});assert.equal(state.prizePerEntry,250);
 $('prize-entry-input').oninput({target:{value:'',validity:{badInput:true}}});assert.ok(Number.isNaN(state.prizePerEntry));
 $('prize-entry-input').oninput({target:{value:'',validity:{badInput:false}}});assert.equal(state.prizePerEntry,400);
});
test('single style toggle is in navigation and contribution is in advanced disclosure',()=>{
 const html=fs.readFileSync('site-shells/board.html','utf8');
 assert.equal((html.match(/data-interface-style="forest"/g)||[]).length,1);
 assert.ok(html.indexOf('data-interface-style="forest"')<html.indexOf('class="director-actions"'));
 assert.ok(!html.includes('class="interface-style-picker"'));
 const advanced=html.indexOf('id="more-settings"'),prize=html.indexOf('id="prize-entry-input"');assert.ok(prize>advanced);assert.ok(prize<html.indexOf('id="panel-blinds"'));
 assert.equal((html.match(/id="prize-entry-input"/g)||[]).length,1);assert.match(html,/Advanced Settings/);assert.match(html,/Leave blank to use the full buy-in/);
});
test('toolbar style switch persists without requiring a drawer status element',()=>{
 const store=new Map(),buttons=['current','forest'].map(value=>({dataset:{interfaceStyle:value},setAttribute(k,v){this[k]=v;},addEventListener(k,fn){this[k]=fn;}}));
 const doc={documentElement:{dataset:{}},querySelectorAll:()=>buttons,getElementById:()=>null},win={localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},addEventListener(){}};
 installInterfaceStyle(doc,win);buttons[1].click();assert.equal(doc.documentElement.dataset.interfaceStyle,'forest');assert.equal(store.get(interfaceStyleKey),'forest');buttons[0].click();assert.equal(doc.documentElement.dataset.interfaceStyle,'current');
});
