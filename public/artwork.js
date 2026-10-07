// Only application-managed raster files can be referenced by a tournament.
export const artworkModes={none:'None',cover:'Fill (crop edges)',contain:'Fit (keep whole image)',stretch:'Stretch',large:'Large image',small:'Scattered images',watermark:'Repeating watermark'};
export const artworkPresetChoices={large:'Large image',small:'Smaller images',watermark:'Watermark',cover:'Full background',none:'None · Color only'};
const simpleDefaults={opacity:20,size:65,x:70,y:70,logoSize:85,logoOpacity:100,monochrome:false};
// A finished full-background composition carries its own opacity/transparency.
// Do not fade it a second time like a foreground image used as a watermark.
const simplePresets={large:{},small:{opacity:15,size:60,x:80,y:15},watermark:{opacity:18,size:35,x:50,y:50,monochrome:true},cover:{opacity:100,x:50,y:50},none:{}};
export const artworkLimits={inputBytes:10*1024*1024,backgroundBytes:512*1024,logoBytes:128*1024,backgroundEdge:2048,logoEdge:768};
const hash=/^[a-f0-9]{64}$/;
const owner=/^(?:local|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/;
export const validArtworkRef=ref=>ref===null||!!ref&&typeof ref==='object'&&!Array.isArray(ref)&&Object.keys(ref).length===2&&hash.test(ref.id)&&owner.test(ref.owner);
const bounded=(n,lo,hi,fallback)=>Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):fallback;
export function artworkSettings(appearance={}){
  const a=appearance.artwork||{};
  return {background:validArtworkRef(a.background)?a.background:null,logo:validArtworkRef(a.logo)?a.logo:null,
    // Preserve custom values on older records; new uploads start in simple mode.
    advanced:typeof a.advanced==='boolean'?a.advanced:Object.keys(a).length>0,
    advancedConfigured:a.advancedConfigured===true||(a.advanced===undefined&&Object.keys(a).length>0),
    preset:Object.hasOwn(artworkPresetChoices,a.preset)?a.preset:Object.hasOwn(artworkPresetChoices,appearance.backgroundArt)?appearance.backgroundArt:'large',
    opacity:bounded(a.opacity,0,100,20),size:bounded(a.size,10,150,60),x:bounded(a.x,0,100,65),y:bounded(a.y,0,100,65),
    logoSize:bounded(a.logoSize,30,100,85),logoOpacity:bounded(a.logoOpacity,0,100,100),monochrome:a.monochrome===true};
}
export function renderedArtworkSettings(appearance={}){
  const a=artworkSettings(appearance);
  return a.advanced?{...a,mode:Object.hasOwn(artworkModes,appearance.backgroundArt)?appearance.backgroundArt:'large'}:
    {...a,...simpleDefaults,...simplePresets[a.preset],mode:a.preset};
}
export function withAdvancedArtwork(appearance,enabled){
  const a=artworkSettings(appearance);
  // First opt-in starts from the visible preset. Later toggles restore the user's
  // previous custom settings, without overwriting them when a preset is selected.
  if(enabled&&!a.advanced&&appearance.artwork?.advancedConfigured!==true){
    const {mode,...visible}=renderedArtworkSettings(appearance);
    return {...appearance,backgroundArt:mode,artwork:{...visible,advanced:true,advancedConfigured:true}};
  }
  return {...appearance,artwork:{...a,advanced:enabled,advancedConfigured:a.advancedConfigured||a.advanced||enabled}};
}
export function validateArtwork(appearance){
  const a=appearance?.artwork;if(a===undefined)return true;
  if(!a||typeof a!=='object'||Array.isArray(a))return false;
  if(a.advanced!==undefined&&typeof a.advanced!=='boolean'||a.advancedConfigured!==undefined&&typeof a.advancedConfigured!=='boolean')return false;
  if(a.preset!==undefined&&!Object.hasOwn(artworkPresetChoices,a.preset))return false;
  for(const key of ['background','logo'])if(a[key]!==undefined&&!validArtworkRef(a[key]))return false;
  for(const [key,min,max] of [['opacity',0,100],['size',10,150],['x',0,100],['y',0,100],['logoSize',30,100],['logoOpacity',0,100]])if(a[key]!==undefined&&(!Number.isFinite(a[key])||a[key]<min||a[key]>max))return false;
  return a.monochrome===undefined||typeof a.monochrome==='boolean';
}
let storageOrigin='';
const privateLinks=new Map();
export function setArtworkStorageOrigin(origin){storageOrigin=new URL(origin).origin;privateLinks.clear();}
export function acceptArtworkUrls(entries,now=Date.now()){
  if(!Array.isArray(entries)||!storageOrigin)return;
  for(const entry of entries.slice(0,10)){
    const ref=entry?.ref;
    if(!ref||!validArtworkRef(ref)||ref.owner==='local'||!Number.isFinite(entry.expiresAt)||entry.expiresAt<=now||entry.expiresAt>now+310000)continue;
    try{
      const generation=entry.generation??1;
      if(!Number.isSafeInteger(generation)||generation<1)continue;
      const url=new URL(entry.url),expected=`/storage/v1/object/sign/clock-artwork/${ref.owner}/${ref.id}${generation>1?'-g'+generation:''}.png`;
      if(url.origin!==storageOrigin||url.pathname!==expected||url.username||url.password||!/^[-A-Za-z0-9_.]+$/.test(url.searchParams.get('token')||''))continue;
      const previous=privateLinks.get(ref.owner+'/'+ref.id);
      // Poll responses issue fresh signatures for unchanged bytes. Keep a valid
      // link stable instead of making every clock poll reload the image.
      if(previous&&previous.url.split('?')[0]===url.href.split('?')[0]&&previous.expiresAt>now+60000)continue;
      if(previous&&previous.url.split('?')[0]===url.href.split('?')[0]&&previous.expiresAt>=entry.expiresAt)continue;
      if(privateLinks.size>=64)privateLinks.delete(privateLinks.keys().next().value);
      privateLinks.set(ref.owner+'/'+ref.id,{url:url.href,expiresAt:entry.expiresAt});
    }catch{}
  }
}
export function artworkUrl(ref,now=Date.now()){
  if(!ref||!validArtworkRef(ref))return '';
  if(ref.owner==='local')return `/artwork/local/${ref.id}.png`;
  const link=privateLinks.get(ref.owner+'/'+ref.id);
  return link&&link.expiresAt>now?link.url:'';
}
// Transparent padding is a display-only tile; the uploaded source is unchanged.
export function watermarkTileBounds(width,height){
  const padX=Math.max(1,Math.round(width*.07)),padY=Math.max(1,Math.round(height*.07));
  return {width:width+padX*2,height:height+padY*2,x:padX,y:padY};
}
const watermarkTiles=new Map();
function watermarkTile(url,key){
  if(!watermarkTiles.has(key)){
    if(watermarkTiles.size>=8)watermarkTiles.delete(watermarkTiles.keys().next().value);
    watermarkTiles.set(key,new Promise(resolve=>{
      const image=new Image();image.crossOrigin='anonymous';
      image.onload=()=>{
        const fallback={url,ratio:image.naturalWidth/image.naturalHeight||1};
        try{
          const box=watermarkTileBounds(image.naturalWidth,image.naturalHeight),canvas=document.createElement('canvas');
          canvas.width=box.width;canvas.height=box.height;canvas.getContext('2d').drawImage(image,box.x,box.y);
          resolve({url:canvas.toDataURL('image/png'),ratio:box.width/box.height});
        }catch{resolve(fallback);}
      };
      image.onerror=()=>resolve({url,ratio:1});image.src=url;
    }));
  }
  return watermarkTiles.get(key);
}
const watermarkStages=new WeakMap();
const backgroundStages=new WeakMap();
function setArtworkStyle(stage,name,value){
  const key='--art-'+name,text=String(value);
  if(stage.style.getPropertyValue(key)!==text)stage.style.setProperty(key,text);
}
export function renderArtwork(stage,appearance){
  const a=renderedArtworkSettings(appearance),url=artworkUrl(a.background),mode=url?a.mode:'none';
  if(stage.dataset.mode!==mode)stage.dataset.mode=mode;
  for(const [name,value] of Object.entries({'size-number':a.size,opacity:a.opacity/100,size:a.size+'%',x:a.x+'%',y:a.y+'%',filter:a.monochrome?'grayscale(1)':'none'}))setArtworkStyle(stage,name,value);
  if(url&&mode==='watermark'&&typeof Image!=='undefined'){
    // Signed-token refreshes identify the same file; generation changes change its path.
    backgroundStages.delete(stage);
    const key=url.split('?')[0],previous=watermarkStages.get(stage);
    if(previous?.key===key)return;
    const current={key};watermarkStages.set(stage,current);
    setArtworkStyle(stage,'image','none');
    watermarkTile(url,key).then(tile=>{
      if(watermarkStages.get(stage)!==current||stage.dataset.mode!=='watermark')return;
      setArtworkStyle(stage,'ratio',tile.ratio);setArtworkStyle(stage,'image',`url("${tile.url}")`);
    });
  }else{
    watermarkStages.delete(stage);
    const previous=backgroundStages.get(stage);
    if(!url||mode==='none'){
      backgroundStages.delete(stage);setArtworkStyle(stage,'image','none');
    }else if(previous?.url!==url){
      const current={url};backgroundStages.set(stage,current);
      // Keep the current frame while its refreshed signed URL loads. A new
      // selection clears the old image; stale loads never overwrite a newer one.
      if(previous?.url.split('?')[0]!==url.split('?')[0])setArtworkStyle(stage,'image','none');
      const apply=()=>{if(backgroundStages.get(stage)===current)setArtworkStyle(stage,'image',`url("${url}")`);};
      if(typeof Image==='undefined')apply();
      else {const image=new Image();image.onload=apply;image.onerror=()=>{if(backgroundStages.get(stage)===current)backgroundStages.delete(stage);};image.src=url;}
    }
  }
}
// Preserve already-optimized, metadata-free PNGs. Re-encoding these with canvas
// can double their byte size, trigger needless downscaling and round faint alpha.
// This is an optimization only; the host still validates CRCs and inflated pixels.
export function isUploadReadyPng(bytes,kind){
  const limit=artworkLimits[kind+'Bytes'],edge=artworkLimits[kind+'Edge'];
  if(!limit||bytes.length>limit||bytes.length<57||bytes.slice(0,8).join(',')!=='137,80,78,71,13,10,26,10')return false;
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=8,data=false;
  while(at+12<=bytes.length){
    const length=view.getUint32(at),end=at+12+length;
    if(end>bytes.length)return false;
    const type=String.fromCharCode(...bytes.slice(at+4,at+8));
    if(at===8){
      if(type!=='IHDR'||length!==13)return false;
      const width=view.getUint32(at+8),height=view.getUint32(at+12);
      if(!width||!height||width>edge||height>edge||bytes[at+16]!==8||![2,6].includes(bytes[at+17])||bytes.slice(at+18,at+21).some(v=>v!==0))return false;
    }else if(type==='IDAT')data=true;
    else if(type==='IEND')return data&&length===0&&end===bytes.length;
    else return false; // Metadata, color profiles and animation take the canvas path.
    at=end;
  }
  return false;
}
function pngDataUrl(bytes){
  let binary='';for(let at=0;at<bytes.length;at+=8192)binary+=String.fromCharCode(...bytes.subarray(at,at+8192));
  return 'data:image/png;base64,'+btoa(binary);
}
export async function prepareArtwork(file,kind){
  if(!['background','logo'].includes(kind))throw new Error('Choose a background or logo.');
  if(!file||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Choose a PNG, JPG or WebP image.');
  if(file.size>artworkLimits.inputBytes)throw new Error('Choose an image smaller than 10 MB.');
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{throw new Error('This image could not be opened. Try a PNG or JPG.');}
  try{
    if(bitmap.width*bitmap.height>40_000_000)throw new Error('Choose an image smaller than 40 megapixels.');
    const edge=artworkLimits[kind+'Edge'],limit=artworkLimits[kind+'Bytes'];
    if(file.type==='image/png'&&file.size<=limit&&Math.max(bitmap.width,bitmap.height)<=edge){
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(isUploadReadyPng(bytes,kind))return pngDataUrl(bytes);
    }
    let scale=Math.min(1,edge/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    for(let attempt=0;attempt<12;attempt++){
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      // Re-encode a still frame: no original filenames, EXIF/GPS or animation.
      const data=canvas.toDataURL('image/png');
      if((data.length-data.indexOf(',')-1)*.75<=limit)return data;
      scale*=.8;
    }
    throw new Error('This image is too detailed. Try a smaller image.');
  }finally{bitmap.close();}
}

export function forgetArtworkRef(ref){if(ref&&validArtworkRef(ref))privateLinks.delete(ref.owner+'/'+ref.id);}
export function withoutArtworkRef(appearance,ref){
  if(!ref||!validArtworkRef(ref))return appearance;
  const art=artworkSettings(appearance);let changed=false;
  for(const key of ['background','logo'])if(art[key]?.owner===ref.owner&&art[key]?.id===ref.id){art[key]=null;changed=true;}
  return changed?{...appearance,artwork:art}:appearance;
}

// Deletion is generation-bound and idempotent. A stream reconnect can invalidate
// the first HTTP response after deletion succeeded; confirm that same operation.
export async function requestArtworkDeletion(connection,ref,generation){
  const remove=()=>connection.request('/api/artwork-delete',{ref,generation});
  try{return await remove();}catch(error){
    if(error?.code!=='STALE_RESPONSE'||!connection.online||connection.recoveryRequired)throw error;
    return remove();
  }
}
