import {createAccountsHandler} from './handler.js';
function key(name){try{return JSON.parse(Deno.env.get(name)||'{}').default;}catch{return null;}}
const secretKey=key('SUPABASE_SECRET_KEYS'),publishableKey=key('SUPABASE_PUBLISHABLE_KEYS'),url=Deno.env.get('SUPABASE_URL');
if(!secretKey||!publishableKey||!url)throw new Error('Account service is not configured.');
Deno.serve(createAccountsHandler({url,secretKey,publishableKey}));
