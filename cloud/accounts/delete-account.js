// All operations are scoped to the server-verified owner. Never accept an owner ID from the request body.
export async function deleteAccountData({owner,begin,listImages,removeImages,removeRows,removeLogin,finish}){
 if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(owner))throw new Error('Invalid account owner.');
 await begin(owner);
 // Restart at offset zero after every deletion, so retries do not skip objects.
 for(let page=0;page<20;page++){
  const files=await listImages(owner);
  if(!Array.isArray(files))throw new Error('Image cleanup could not be confirmed.');
  if(!files.length){
   await removeRows(owner);await removeLogin(owner);
   // The login and all user data are gone even if bookkeeping is briefly unavailable.
   await finish(owner).catch(()=>{});return {deleted:true};
  }
  const paths=files.map(file=>{
   // MTTClock stores only flat, content-addressed PNGs inside an owner's directory.
   if(!/^[a-f0-9]{64}(?:-g[1-9][0-9]*)?\.png$/.test(file.name))throw new Error('An unexpected image path needs review before account deletion.');
   return owner+'/'+file.name;
  });
  await removeImages(paths);
 }
 throw new Error('Image cleanup needs another attempt.');
}
