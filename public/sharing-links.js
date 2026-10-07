// Only construct links here; never transfer sessions between browser origins.
export function shareOrigin(value) {
  try {
    const url=new URL(value);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash||url.pathname!=='/')return '';
    const host=url.hostname.toLowerCase();
    if(host==='localhost'||host.endsWith('.localhost')||/^127\./.test(host)||['[::1]','0.0.0.0','[::]'].includes(host))return '';
    return url.origin;
  }catch{return '';}
}

export function sharingOrigins(current,lan=[]) {
  return [...new Set([current,...lan].map(shareOrigin).filter(Boolean))];
}

export function sharedLink(base,path) {
  const origin=shareOrigin(base);
  if(!origin||typeof path!=='string'||!path.startsWith('/')||path.startsWith('//'))return '';
  try {const url=new URL(path,origin);return url.origin===origin?url.href:'';}catch{return '';}
}

export function accountShareLinks(base,tournamentId) {
  const path=`/t/${encodeURIComponent(tournamentId)}`;
  return {director:sharedLink(base,`${path}/director`),display:sharedLink(base,`${path}/display`)};
}

// Account tournaments get links from the online service, which cannot know the
// preview PC's LAN address. Reuse only an existing LOCAL session to ask the local
// host for its network addresses. Never send an account token to this endpoint.
export async function localSharingAddresses(fetcher,credential) {
  if(!credential)return [];
  try {
    const response=await fetcher('/api/links',{headers:{Authorization:`Bearer ${credential}`},signal:AbortSignal.timeout(3000)});
    if(!response.ok)return [];
    const data=await response.json();return Array.isArray(data.lan)?data.lan:[];
  }catch{return [];}
}
