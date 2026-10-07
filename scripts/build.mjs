import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
const url=process.env.SUPABASE_URL||'',publishableKey=process.env.SUPABASE_PUBLISHABLE_KEY||'';
let parsed;try{parsed=new URL(url)}catch{throw new Error('Set SUPABASE_URL to the Supabase project HTTPS origin.');}
if(parsed.protocol!=='https:'||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password||!parsed.hostname.endsWith('.supabase.co'))throw new Error('SUPABASE_URL must be the project HTTPS origin.');
if(!/^sb_publishable_[A-Za-z0-9_-]{8,}$/.test(publishableKey))throw new Error('Set SUPABASE_PUBLISHABLE_KEY to a publishable key, never a secret or service-role key.');
await rm('dist',{recursive:true,force:true});await mkdir('dist',{recursive:true});await cp('public','dist',{recursive:true});
await cp('THIRD_PARTY_NOTICES.md','dist/THIRD_PARTY_NOTICES.md');
await writeFile('dist/mtt-config.js',`export const cloudConfig=${JSON.stringify({url:parsed.origin,publishableKey})};\n`);
const account=await readFile('site-shells/account.html','utf8'),board=await readFile('site-shells/board.html','utf8');
await writeFile('dist/account-shell.html',account);await writeFile('dist/board-shell.html',board);
await writeFile('dist/404.html','<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page Not Found · MTTClock</title><body><h1>Page Not Found</h1><a href="/tournaments">My Tournaments</a></body></html>');
await writeFile('dist/_redirects',`/ /tournaments 302\n/login /account-shell.html 200\n/tournaments /account-shell.html 200\n/account /account-shell.html 200\n/auth/callback /account-shell.html 200\n/t/:id/director /board-shell.html 200\n/t/:id/display /board-shell.html 200\n/watch/:id/:token /board-shell.html 200\n`);
await writeFile('dist/_headers',`/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${parsed.origin}; media-src 'self' blob:; connect-src 'self' ${parsed.origin}; worker-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'\n`);
console.log('Built standalone static frontend in dist/.');
