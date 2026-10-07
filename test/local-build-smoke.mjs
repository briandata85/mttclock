import {spawn} from 'node:child_process';import fs from 'node:fs';import assert from 'node:assert/strict';
const log=fs.openSync('/workspace/scratch/880f040dce1e/PokerClock-cloud/cycle-16-frontend-evidence/local-worker.txt','w');
const child=spawn('npm',['run','start','--','--port','4392'],{stdio:['ignore',log,log],detached:true});
try{
 let ready=false;
 for(let i=0;i<50;i++){await new Promise(r=>setTimeout(r,200));if(fs.readFileSync('/workspace/scratch/880f040dce1e/PokerClock-cloud/cycle-16-frontend-evidence/local-worker.txt','utf8').includes('Ready on')){ready=true;break;}if(child.exitCode!==null)break;}
 assert.ok(ready,'Local worker did not become ready');
 const paths=['/','/login','/login?recovery=1','/tournaments','/account','/auth/callback','/t/11111111-1111-4111-8111-111111111111/director','/t/11111111-1111-4111-8111-111111111111/display','/watch/11111111-1111-4111-8111-111111111111/'+ 'a'.repeat(43),'/account.js','/tournament-summary.js','/cloud-auth.js','/account.css','/surfaces.css','/.env','/api/state','/sw.js'];
 const results=[];
 for(const path of paths){const r=await fetch('http://127.0.0.1:4392'+path,{redirect:'manual',signal:AbortSignal.timeout(5000)});const body=await r.text();const expected=path==='/'?302:['/.env','/api/state','/sw.js'].includes(path)?404:200;assert.equal(r.status,expected,path);assert.equal(r.headers.get('cache-control'),'no-store',path);assert.equal(r.headers.get('referrer-policy'),'no-referrer',path);assert.equal(r.headers.get('x-content-type-options'),'nosniff',path);assert.ok(r.headers.get('content-security-policy')?.includes('https://sipqgkatvkczxzafhcfn.supabase.co'),path);if(path==='/login')assert.ok(body.includes('Private staging'));results.push({path,status:r.status,bytes:body.length,headersPassed:true});}
 fs.writeFileSync('/workspace/scratch/880f040dce1e/PokerClock-cloud/cycle-16-frontend-evidence/local-http-results.json',JSON.stringify(results,null,2)+'\n');console.log(`PASS:${paths.length} built-worker routes/assets and security headers`);
} finally {try{process.kill(-child.pid,'SIGTERM');}catch{}fs.closeSync(log);}
