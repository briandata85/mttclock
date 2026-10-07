import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(p,'utf8');
test('visible app branding uses MTTClock across account, director/display, metadata and fallback',()=>{
 for(const p of ['site-shells/account.html','site-shells/board.html','lib/staging-routes.mjs','public/wsop.css']){
  const s=read(p);assert.doesNotMatch(s,/poker[\s_-]*clock/i,p);assert.match(s,/MTTClock/,p);
 }
});
test('rebrand preserves existing username aliases and saved interface preference compatibility',()=>{
 assert.match(read('cloud/accounts/handler.js'),/accounts\.pokerclock\.invalid/);
 assert.match(read('public/username-auth.js'),/accounts\.pokerclock\.invalid/);
 assert.match(read('public/interface-style.js'),/pokerclock-interface-style-v1/);
});

test('settings section subtitles and disclosure headings use consistent title case',()=>{
 const html=read('site-shells/board.html');
 for(const text of ['Tournament Essentials','Make It Your Table','Connect Your Screens','Stack Details','Advanced Settings','Payout Calculator','ICM Calculator','Advanced Image Settings'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/>Tournament essentials<|>Make it your table<|>Connect your screens</);
});

test('image controls delete the saved image instead of silently detaching it',()=>{
 const html=read('site-shells/board.html'),script=read('public/app.js');
 assert.doesNotMatch(html,/Removing an image from this tournament keeps it in your library/);
 assert.match(script,/onclick=\(\)=>void deleteSelectedImage\(kind\)/);
 assert.match(script,/await deleteSavedImage\(item,index\+1\)/);
});

test('watermark alternates rows with a half-tile horizontal offset',()=>{
 const css=read('public/wsop.css');assert.match(css,/background-position:calc\(var\(--tile-width\) \/ 2\) 0/);assert.match(css,/mask-size:100% calc\(var\(--tile-height\) \* 2\)/);assert.match(read('public/artwork.js'),/image.naturalWidth\/image.naturalHeight/);
});

import {watermarkTileBounds} from '../public/artwork.js';
test('watermark tiles add a small transparent gap around every image',()=>{
 assert.deepEqual(watermarkTileBounds(1000,500),{width:1140,height:570,x:70,y:35});
});
