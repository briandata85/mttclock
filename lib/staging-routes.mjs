export const backendOrigin='https://sipqgkatvkczxzafhcfn.supabase.co';
export const securityHeaders=Object.freeze({
  'Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'no-referrer',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':`default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: ${backendOrigin}; media-src 'self' blob:; connect-src 'self' ${backendOrigin}; worker-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
});
const uuid='[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const boardRoute=new RegExp(`^/t/${uuid}/(?:director|display)$`);
const observerRoute=new RegExp(`^/watch/${uuid}/[A-Za-z0-9_-]{43}$`);
export function stagingRoute(pathname){
  if(pathname==='/')return 'redirect';
  if(['/login','/tournaments','/account','/auth/callback'].includes(pathname))return 'account';
  if(boardRoute.test(pathname)||observerRoute.test(pathname))return 'board';
  return 'not-found';
}
export function shellResponse(request,account,board){
  const headers={...securityHeaders,'Content-Type':'text/html; charset=utf-8'};
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed.',{status:405,headers:{...securityHeaders,Allow:'GET, HEAD'}});
  const route=stagingRoute(new URL(request.url).pathname);
  if(route==='redirect')return new Response(null,{status:302,headers:{...securityHeaders,Location:'/login'}});
  const html=route==='account'?account:route==='board'?board:'<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Not found · MTTClock</title><body><h1>Page not found</h1><p>This staging app supports online account tournaments.</p><a href="/tournaments">My tournaments</a></body></html>';
  return new Response(request.method==='HEAD'?null:html,{status:route==='not-found'?404:200,headers});
}
