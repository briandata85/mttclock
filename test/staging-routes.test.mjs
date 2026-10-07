import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {backendOrigin,securityHeaders,stagingRoute,shellResponse} from '../lib/staging-routes.mjs';
import {publicConfigReady,unconfiguredMessage} from '../public/account-auth.js';
const id='11111111-1111-4111-8111-111111111111';
test('only exact account, director, display and observer routes receive shells',()=>{
  assert.equal(stagingRoute('/'),'redirect');
  for(const p of ['/login','/tournaments','/account','/auth/callback'])assert.equal(stagingRoute(p),'account');
  for(const p of [`/t/${id}/director`,`/t/${id}/display`,`/watch/${id}/${'a'.repeat(43)}`])assert.equal(stagingRoute(p),'board');
  for(const p of ['/api/state','/.env','/server.js','/cloud/edge.js','/t/local/director','/login/else',`/t/${id}/command`,`/watch/${id}/short`,`/watch/${id}/${'a'.repeat(43)}/extra`])assert.equal(stagingRoute(p),'not-found');
});
test('account responses preserve browser callback URL and set exact security headers',async()=>{
  const response=shellResponse(new Request('https://site.invalid/login?recovery=1'),'account html','board html');assert.equal(response.status,200);assert.equal(await response.text(),'account html');
  for(const [name,value] of Object.entries(securityHeaders))assert.equal(response.headers.get(name),value);
  assert.equal(response.headers.get('content-security-policy').match(/https:\/\/[^; ]+/g).length,2);
  assert.ok(response.headers.get('content-security-policy').includes(backendOrigin));assert.ok(!response.headers.get('content-security-policy').includes('*'));
  const root=shellResponse(new Request('https://site.invalid/'),'a','b');assert.equal(root.status,302);assert.equal(root.headers.get('location'),'/login');
  const head=shellResponse(new Request('https://site.invalid/account',{method:'HEAD'}),'private html','b');assert.equal(head.status,200);assert.equal(await head.text(),'');
});
test('non-GET calls never invoke a backend or return a shell',async()=>{
  for(const method of ['POST','DELETE','PUT']){const r=shellResponse(new Request('https://site.invalid/tournaments',{method}),'a','b');assert.equal(r.status,405);assert.equal(await r.text(),'Method not allowed.');}
});
test('staging uses honest online-only account copy and retains unavailable operations',()=>{
  const html=fs.readFileSync('site-shells/account.html','utf8');assert.ok(!html.includes('account-preview-note'));assert.ok(!html.includes('export-account'));assert.ok(!html.includes('href="/t/local/'));
  assert.ok(html.includes('id="delete-account"'));assert.ok(html.includes('pattern="DELETE"'));assert.ok(html.includes('id="delete-account-password"'));assert.ok(!html.includes('data-unavailable="true"'));
});

test('hosted board never instructs viewers to pair or keep a local PC host running',()=>{
  const html=fs.readFileSync('site-shells/board.html','utf8'),app=fs.readFileSync('public/app.js','utf8');
  assert.ok(!html.includes('href="/t/local/'));assert.ok(!html.includes('Your PC must stay awake'));assert.ok(!html.includes('customizable local'));assert.ok(!unconfiguredMessage.includes('local clock'));assert.ok(unconfiguredMessage.includes('unavailable'));
  assert.match(html,/id="local-access-help" hidden/);assert.ok(!app.includes('website still runs locally'));assert.ok(!app.includes('For a local preview, keep this PC running'));
});
