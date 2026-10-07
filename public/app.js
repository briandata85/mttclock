import {announceFromDirector} from './director-announcement.js';
import {installIcm} from './icm.js';
import {levelsFor,payouts,finances,boardLayout,boardTheme,themes,featuredThemes,themeDetails,boardThemeDetails,colorPresets,boardColors,boardGradient,boardColorChoice,appearanceForLayout,backgroundChoices,backgroundArt,currencies,currencyCode,displayFields,fieldVisible,fieldConfigurable} from './domain.js';
import {renderBoard,money,clock,ordinal,levelName} from './board.js';
import {Connection} from './sync.js';
import {recoveryHeld,requireWritable,recoverySaveMessage,renderRecoveryNotices} from './recovery.js';
import {createThemePreview} from './theme-preview.js';
import {CueAudio} from './audio.js';
import {DisplayAudio,soundSettings} from './display-audio.js';
import {newEntryPatch,adjacentLevelIndex,clockEditVersion,parseRemainingTime} from './director-actions.js';
import {SettingsDraft} from './settings-draft.js';
import {consumeCreationSetup} from './new-tournament.js';
import {buyInContributionPatch,prizeContributionPatch,contributionOverrideValue} from './prize-contribution.js';
import {firstSetupIssue,settingNumber} from './setup-validation.js';
import {noAnteEnabled,withNoAnte} from './blind-options.js';
import {defaultRecipe,payoutBasis,payoutReview} from './payout-safety.js';
import {payoutPlan,payoutGroups,recipeIncrement} from './payout-plans.js';
import {installControlIcons} from './controls.js';
import {shareOrigin,sharingOrigins,sharedLink,accountShareLinks,localSharingAddresses} from './sharing-links.js';
import {canManageDisplay,renderDisplayAccess} from './display-access.js';
import {artworkSettings,artworkUrl,renderArtwork,prepareArtwork,setArtworkStorageOrigin,acceptArtworkUrls,forgetArtworkRef,withoutArtworkRef,requestArtworkDeletion,artworkPresetChoices,withAdvancedArtwork} from './artwork.js';
const $=id=>document.getElementById(id),sound=new CueAudio();
// One inert board template is shared by the live display and static previews.
$('app').prepend($('board-template').content.cloneNode(true));
const themePreviews=new Map();let selectedThemePreview,pendingThemeKey=null;
const id=()=>Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16)).join('-');
const clientId=id();let snapshot=null,connection=null,view='',busy=false,structureDraft=null,toastTimer,leaseTimer,drawTimer,fullscreenTimer;
const previewSound=new CueAudio();
sound.onAnnouncementError=message=>notify(message);
previewSound.onAnnouncementError=message=>notify(message.replaceAll('display','device'));
const displayAudio=new DisplayAudio({sound,request:(path,data)=>connection.request(path,data),client:clientId});
let previousClockKey='',lastFormRevision=-1,setupDraft=null,pendingSave=null,saveMessage='',validationVisible=false;
let cloudMode=false,tournamentId='local';
let pairingPath='',observerPath='',displayAccessPending=false,sharingLoading=false;
let timeEditTarget=null;
let artworkAvailable=false,artworkLibraryAvailable=false,legacyDisplayHeaders=null;
const formState=()=>setupDraft?.value||snapshot?.state;
const hasDraft=()=>!!setupDraft?.dirty;
const payoutSignature=s=>JSON.stringify([payoutBasis(s),s.payoutPreset,s.customPayouts,s.roundPayouts]);
const credentials={get:role=>localStorage.getItem(`not-bravo-${role}`),set:(role,value)=>localStorage.setItem(`not-bravo-${role}`,value)};
function notify(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),5000);}
function ask(message,label='Continue'){
  const dialog=$('confirm-action');if(formState())dialog.style.setProperty('--ui-accent',boardColors(formState()).board);$('confirm-message').textContent=message;$('confirm-accept').textContent=label;
  return new Promise(resolve=>{const finish=value=>{dialog.close();resolve(value);};$('confirm-accept').onclick=()=>finish(true);$('confirm-cancel').onclick=()=>finish(false);dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.showModal();$('confirm-cancel').focus();});
}
function showAccess(message){displayAudio.disconnect();closeTimeEditor(false);$('access-screen').setAttribute('aria-busy','false');$('access-message').textContent=message;$('access-screen').hidden=false;$('app').hidden=true;$('director-controls').hidden=true;hideSetup();}
function updateDisabled(){document.querySelectorAll('[data-command],#set-time,#director-time').forEach(b=>b.disabled=busy||!!pendingSave||!connection?.online);
  document.querySelector('.drawer-scroll').inert=busy||!!pendingSave||recoveryHeld(connection);
  document.querySelectorAll('#payout-editor button,#payout-editor input').forEach(el=>el.disabled=formState()?.payoutPreset!=='custom');
  $('apply-calculated-payouts').disabled=!currentPayoutPlan()?.ok;
  $('announce-message').disabled=busy||!!pendingSave||!connection?.online;
  renderSaveState();
  const s=snapshot?.state;if(s){document.querySelector('[data-command="restore"]').disabled=busy||!!pendingSave||!connection?.online||s.playersLeft>=s.entrants;document.querySelector('[data-command="remove"]').disabled=busy||!!pendingSave||!connection?.online||s.playersLeft===0;document.querySelector('[data-command="add-entry"]').disabled=busy||!!pendingSave||!connection?.online||s.entrants>=10000;}
  if(s){document.querySelector('[data-command="previous"]').disabled||=adjacentLevelIndex(s,-1)===null;document.querySelector('[data-command="next"]').disabled||=adjacentLevelIndex(s,1)===null;}
  renderDisplayAccess(document,snapshot,{cloudMode,blocked:busy||displayAccessPending||!!pendingSave||!connection?.online||recoveryHeld(connection)});
  $('time-input').readOnly=busy||recoveryHeld(connection);$('cancel-time').disabled=busy;
  if(s&&!$('time-editor').hidden&&timeEditTarget!==clockEditVersion(snapshot.state)){
    $('set-time').disabled=true;if(!busy)timeEditorError('Clock changed. Close and reopen Set Time before applying a new value.');
  }
}
function timeEditorError(message){$('time-editor-error').textContent=message;$('time-editor-error').hidden=!message;$('time-input').setAttribute('aria-invalid',String(!!message));}
function closeTimeEditor(restoreFocus=true){timeEditTarget=null;$('time-editor').hidden=true;$('director-time').setAttribute('aria-expanded','false');timeEditorError('');if(restoreFocus)$('director-time').focus();}
function status(online){
  if(recoveryHeld(connection)){
    clearInterval(drawTimer);clearInterval(leaseTimer);displayAudio.disconnect();
    if(snapshot)renderBoard(snapshot.state,connection.now());
    $('connection-status').textContent='This screen is paused — recovery review required';
  }else{
    $('connection-status').textContent=online?'':'Disconnected — showing last known countdown';
    displayAudio.sync(snapshot?.state,view,online);
  }
  $('connection-status').hidden=!$('connection-status').textContent;
  $('connection-status').classList.toggle('disconnected',!online);updateDisabled();
}
function receive(next){
  if(recoveryHeld(connection))return;
  if(snapshot && next.revision<snapshot.revision)return;
  acceptArtworkUrls(next.artworkUrls);
  const key=JSON.stringify([next.state.clock.status,next.state.clock.deadline,next.state.clock.run]);
  if(previousClockKey && key!==previousClockKey)sound.stop();previousClockKey=key;
  snapshot=next;if(setupDraft)setupDraft.update(next.state);
  displayAudio.sync(next.state,view,!!connection?.online);
  displayAudio.accept(next.cues||[],connection?.now()||next.serverNow);
  displayAudio.announce(next.announcement,connection?.now()||next.serverNow);
  renderBoard(next.state,connection?.now()||next.serverNow);
  const review=payoutReview(next.state);
  const missingSchedule=next.state.entrants>0&&finances(next.state).pool>0&&review.missingSchedule===true;
  const payoutWarning=review.stale?'Payout review needed: entries or prize pool changed.':review.difference<0?'Payouts exceed the prize pool.':missingSchedule?'No payout schedule assigned.':'';
  const warning=view==='director'?payoutWarning:'',warningBox=$('director-payout-warning'),warningText=$('director-payout-warning-text');
  if(warning){warningBox.hidden=false;if(warningText.textContent!==warning)warningText.textContent=warning;}
  else {warningBox.hidden=true;if(warningText.textContent)warningText.textContent='';}
  if(view==='director' && lastFormRevision!==next.revision){renderInputs();lastFormRevision=next.revision;}
  updateDisabled();
  $('director-toggle').disabled=busy||!!pendingSave||!connection?.online||(!next.state.clock.remainingMs && next.state.clock.status!=='running');
}
async function send(type,args={},revision=snapshot?.revision){
  if(busy||pendingSave||!connection?.online){notify('Finish the pending save and wait for a connection before changing the tournament.');return false;}
  busy=true;updateDisabled();$('save-status').textContent='Saving…';
  try {const result=await connection.request('/api/command',{id:id(),revision,type,...args});requireWritable(connection);receive(result);$('save-status').textContent=cloudMode?'Saved online':'Saved on host';return true;}
  catch(error){if(recoveryHeld(connection,error)){$('save-status').textContent='Change unconfirmed. This screen is paused.';return false;}notify(error.message);$('save-status').textContent='Change not confirmed';
    try{receive(await connection.request('/api/state'));}catch{}
    renderInputs(true);return false;
  } finally {busy=false;updateDisabled();}
}
const patch=value=>{if(pendingSave||busy||recoveryHeld(connection))return false;setupDraft??=new SettingsDraft(snapshot.state);setupDraft.edit(value);saveMessage='';renderInputs();updateDisabled();return true;};
function put(id,value,check=false,force=false){const el=$(id);if(force||document.activeElement!==el){if(check)el.checked=value;else el.value=value;el.dataset.editRevision=snapshot.revision;}}
function renderInputs(force=false){
  const s=formState(),f=finances(s),sum=payouts(s).reduce((a,b)=>a+b,0),cash=n=>money(n,currencyCode(s));
  for(const [input,key] of Object.entries({'event-name-input':'eventName','entrants-input':'entrants','players-input':'playersLeft','buy-in-input':'buyIn','starting-stack-input':'startingStack','table-numbers-input':'tableNumbers','ticker-text-input':'tickerText'}))put(input,s[key],false,force);
  put('prize-entry-input',contributionOverrideValue(s),false,force);
  $('prize-entry-input').placeholder=Number.isFinite(s.buyIn)?`Full buy-in (${cash(s.buyIn)})`:'Full buy-in';
  $('advanced-settings-summary').textContent=s.prizePerEntry===s.buyIn?'Optional':'Custom prize amount';
  const validContribution=Number.isFinite(s.entrants)&&s.entrants>=0&&Number.isFinite(s.prizePerEntry)&&s.prizePerEntry>=0&&Number.isFinite(f.reserve)&&f.reserve>=0;
  $('use-buy-in').disabled=!Number.isFinite(s.buyIn)||s.buyIn<0||s.prizePerEntry===s.buyIn;
  const zeroContribution=s.entrants>0&&s.buyIn>0&&s.prizePerEntry===0;
  $('prize-contribution-warning').hidden=!zeroContribution;
  $('prize-contribution-warning').textContent=zeroContribution?`Prize contribution is ${cash(0)}, so the prize pool is ${cash(0)}. Use full buy-in or enter the amount going to prizes.`:'';
  $('prize-pool-formula').textContent=validContribution?`${s.entrants.toLocaleString()} entries × ${cash(s.prizePerEntry)}${f.reserve?` − ${cash(f.reserve)} in bounties`:''} = ${cash(f.pool)} in prizes`:'Enter valid entries and prize contribution to calculate the pool.';
  for(const [input,key] of Object.entries({'show-table-numbers-input':'showTableNumbers','auto-advance-input':'autoAdvance','show-ticker-input':'showTicker'}))put(input,s[key],true,force);
  const colors=boardColors(s);
  $('setup-drawer').style.setProperty('--ui-accent',colors.board);
  for(const [input,key] of [['board-color-input','board'],['board-color-text','board'],['accent-color-input','accent'],['accent-color-text','accent']])put(input,input.endsWith('-text')?s.appearance[key]:colors[key],false,force);
  $('custom-colors').hidden=boardColorChoice(s)!=='custom';
  document.querySelectorAll('button[data-color-preset]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.colorPreset===boardColorChoice(s))));
  renderBounty(force);
  const audio=soundSettings(s);put('sound-enable',audio.enabled,true,force);put('sound-volume',Math.round(audio.volume*100),false,force);
  $('sound-volume-value').textContent=`${Math.round(audio.volume*100)}%`;
  put('board-theme-input',boardTheme(s),false,force);
  renderThemePicker(s);
  put('background-art-input',backgroundArt(s),false,force);
  renderArtworkInputs(s,force);
  put('currency-input',currencyCode(s),false,force);
  for(const option of $('calculator-rounding').options)option.textContent=cash(Number(option.value));
  put('payout-visibility-input',s.appearance.payoutVisibility==='after-registration'?'after-registration':'always',false,force);
  for(const field of displayFields){put(`field-${field.key}`,fieldVisible(s,field.key),true,force);$(`field-${field.key}`).closest('label').hidden=!fieldConfigurable(s,field.key);}
  $('display-fields-legend').textContent=boardLayout(s)==='wsop'?'Visible Fields':'Optional Classic Fields';
  document.querySelectorAll('[data-wsop-only]').forEach(el=>el.hidden=boardLayout(s)!=='wsop');
  document.querySelectorAll('[data-classic-only]').forEach(el=>el.hidden=boardLayout(s)==='wsop');
  for(const key of ['largestStack','smallestStack','playDownText'])put(`presentation-${key}`,s.appearance[key]??'',false,force);
  if(document.activeElement!==$('registration-cutoff')||force){
    $('registration-cutoff').replaceChildren(...s.levels.map((l,i)=>new Option(`Before ${levelName(s,i)}${l.isBreak?` (row ${i+1})`:''}`,String(i))),new Option('At end of final level',String(s.levels.length)));
    $('registration-cutoff').value=s.registration.cutoffIndex;
  }
  for(const [key,value] of [['calc-gross',cash(f.gross)],['calc-bounty',cash(f.reserve)],['calc-prize-pool',cash(f.pool)],['payout-places',payouts(s).length],['payout-assigned',cash(sum)],['payout-difference',cash(Math.round((f.pool-sum)*100)/100)]])$(key).textContent=value;
  if(!structureDraft)renderStructure(s.levels,s.structurePreset);
  // Preserve an amount being typed, but a focused Remove button must not keep
  // deleted rows on screen after the host accepts the change.
  if(!document.activeElement?.matches('#payout-editor input')||force)renderPayouts();
  $('add-payout').hidden=s.payoutPreset!=='custom';
  $('edit-saved-payouts').hidden=s.payoutPreset==='custom';
  const recipe=s.payoutConfig?.recipe||{...defaultRecipe(),roundPayouts:s.roundPayouts};
  for(const [input,key] of Object.entries({'calculator-itm':'itm','calculator-type':'type','calculator-final-table':'finalTable','calculator-places':'places','calculator-minimum':'minimumMultiple'}))put(input,recipe[key]??'',false,force);
  put('calculator-rounding',recipeIncrement(recipe),false,force);
  $('rounding-summary').textContent=cash(recipeIncrement(recipe));
  $('paid-place-summary').textContent=recipe.places==null?'Automatic':`${recipe.places} ${recipe.places===1?'place':'places'}`;
  renderPayoutPreview();renderPayoutSafety();renderSaveState();renderSetupValidation();
}
// Selection still travels through the existing settings draft and Save/Discard.
function buildThemeGallery(){
  const gallery=$('theme-gallery');if(!gallery)return;
  // Curated gallery only; legacy IDs remain valid for saved tournaments.
  const choices=featuredThemes.map(key=>{
    const theme=themeDetails[key];
    const button=document.createElement('button');button.type='button';button.className='theme-choice';button.dataset.themeChoice=key;button.setAttribute('aria-pressed','false');
    const heading=document.createElement('span');heading.className='theme-choice-heading';
    const name=document.createElement('strong');name.id=`theme-choice-name-${key}`;name.textContent=theme.label;
    const status=document.createElement('span');status.className='theme-choice-status';status.setAttribute('aria-hidden','true');status.textContent='Choose layout';heading.append(name,status);
    const description=document.createElement('span');description.id=`theme-choice-reason-${key}`;description.className='theme-choice-reason';description.textContent=theme.description;
    button.setAttribute('aria-labelledby',name.id);button.setAttribute('aria-describedby',description.id);
    const preview=createThemePreview($('board-template'));themePreviews.set(key,preview);
    button.append(preview.element,heading,description);return button;
  });
  $('theme-options').replaceChildren(...choices);
  gallery.addEventListener('click',event=>{
    const button=event.target.closest('button[data-theme-choice]');
    if(!button||!gallery.contains(button)||busy||pendingSave||recoveryHeld(connection)||!snapshot)return;
    pendingThemeKey=button.dataset.themeChoice;
    renderThemePicker(formState());
  });
}
function openThemePicker(){
  const dialog=$('theme-picker-dialog');
  if(busy||pendingSave||recoveryHeld(connection)||!snapshot||view!=='director'||dialog.open)return;
  pendingThemeKey=boardTheme(formState());renderThemePicker(formState());
  dialog.showModal();$('open-theme-picker').setAttribute('aria-expanded','true');
  const selected=dialog.querySelector('button[data-theme-choice][aria-pressed="true"]');
  selected?.focus({preventScroll:true});selected?.scrollIntoView({block:'nearest',inline:'nearest'});
}
function applyThemePicker(){
  if(busy||pendingSave||recoveryHeld(connection)||!pendingThemeKey)return;
  const select=$('board-theme-input');
  if(select.value!==pendingThemeKey){select.value=pendingThemeKey;select.dispatchEvent(new Event('change',{bubbles:true}));}
  closeThemePicker();
}
function closeThemePicker(){
  pendingThemeKey=null;
  const dialog=$('theme-picker-dialog');if(dialog?.open)dialog.close();
  $('open-theme-picker').setAttribute('aria-expanded','false');
}
function renderThemePicker(s){
  const key=boardTheme(s),theme=boardThemeDetails(s),sample=$('theme-style-sample'),gallery=$('theme-gallery');
  $('theme-description').textContent=theme.description;
  document.querySelector('.theme-sample-caption').textContent=theme.signaturePalette?'This layout uses its own palette. Color presets still style your controls. Save changes to apply; artwork is previewed under Images.':'Sample tournament with your colors and visible fields. Save changes to apply. Artwork is previewed under Images.';
  $('open-theme-picker').setAttribute('aria-label',`Change layout, current: ${theme.label}`);
  if(!selectedThemePreview){
    selectedThemePreview=createThemePreview($('board-template'));
    sample.prepend(selectedThemePreview.element);
  }
  $('theme-sample-name').textContent=theme.label;sample.dataset.theme=key;
  selectedThemePreview.update(s,key);
  for(const [themeId,preview] of themePreviews)preview.update(s,themeId);
  gallery?.querySelectorAll('button[data-theme-choice]').forEach(button=>{
    const selected=button.dataset.themeChoice===(pendingThemeKey||key);button.setAttribute('aria-pressed',String(selected));
    button.querySelector('.theme-choice-status').textContent=selected?'Selected':'Choose layout';
  });
}
function renderArtworkInputs(s,force=false){
  const art=artworkSettings(s.appearance);
  put('art-preset',art.preset,false,force);put('art-advanced',art.advanced,true,force);
  $('art-preset').disabled=art.advanced;$('art-advanced-controls').disabled=!art.advanced;
  $('art-advanced-status').textContent=art.advanced?'On':'Off';
  for(const key of ['opacity','size','x','y','logoSize','logoOpacity'])put('art-'+key,art[key],false,force);
  put('art-monochrome',art.monochrome,true,force);
  $('art-opacity-value').textContent=art.opacity+'%';$('art-size-value').textContent=art.size+'%';
  $('art-size').disabled=!['large','small','watermark'].includes(backgroundArt(s));
  for(const key of ['x','y'])$('art-'+key).disabled=['none','stretch'].includes(backgroundArt(s));
  renderArtwork($('artwork-preview'),s.appearance);
  for(const [stop,color] of Object.entries(boardGradient(s)))$('artwork-preview').parentElement.style.setProperty('--preview-'+stop,color);
  const logo=artworkUrl(art.logo);$('current-logo-preview').hidden=!logo;$('logo-preview').hidden=!logo;if(logo&&$('logo-preview').getAttribute('src')!==logo)$('logo-preview').src=logo;else if(!logo&&$('logo-preview').hasAttribute('src'))$('logo-preview').removeAttribute('src');
  for(const kind of ['background','logo']){$(kind+'-upload').disabled=!artworkAvailable;$('remove-'+kind).disabled=!art[kind];}
  $('image-library').hidden=!artworkLibraryAvailable;
}
function resetArtworkStatus(){$('artwork-status').textContent=artworkAvailable?'PNG, JPG or WebP · Up to 10 MB':cloudMode?'Uploads aren’t enabled for online tournaments yet. The account service needs its image-storage update.':'Restart the local clock host to enable image uploads, then refresh this page.';}
async function uploadArtwork(kind){
  const input=$(kind+'-upload'),file=input.files[0];if(!file||busy||pendingSave||!artworkAvailable||!connection?.online)return;
  busy=true;updateDisabled();$('artwork-status').textContent='Preparing image…';
  try{
    const data=await prepareArtwork(file,kind);requireWritable(connection);$('artwork-status').textContent='Uploading image…';
    const uploaded=await connection.request('/api/artwork',{kind,data});requireWritable(connection);
    const {ref}=uploaded;acceptArtworkUrls([uploaded]);
    const appearance={...formState().appearance,artwork:{...artworkSettings(formState().appearance),[kind]:ref}};
    if(kind==='background'&&(!appearance.backgroundArt||appearance.backgroundArt==='none'))appearance.backgroundArt='contain';
    // Image files are stored independently. Only Save changes applies their references.
    setupDraft.edit({appearance});renderInputs();$('artwork-status').textContent='Image ready. Save changes to update the display.';
  }catch(error){$('artwork-status').textContent=error.message;}
  finally{input.value='';busy=false;updateDisabled();}
  if($('image-library-grid').childElementCount)await loadImageLibrary();
}
async function loadImageLibrary(){
  if(busy||pendingSave||!connection?.online||recoveryHeld(connection))return;
  busy=true;updateDisabled();$('image-library-status').textContent='Loading your saved images…';
  try{
    const result=await connection.request('/api/artwork');requireWritable(connection);
    const images=Array.isArray(result.images)?result.images.slice(0,10):[];
    acceptArtworkUrls(images);
    const cards=images.map((item,index)=>{
      const card=document.createElement('div');card.className='image-library-card';
      const ready=!item.status||item.status==='ready';
      if(ready){const preview=document.createElement('img');preview.alt=`Saved image ${index+1}`;preview.src=artworkUrl(item.ref);preview.loading='lazy';card.append(preview);}
      else{const note=document.createElement('p');note.textContent=item.status==='deleting'?'Removal pending. Retry Delete to finish.':'Upload not confirmed. Retry the original file to finish.';card.append(note);}
      const actions=document.createElement('div');actions.className='image-library-actions';
      for(const kind of ['background','logo']){
        const button=document.createElement('button');button.type='button';button.className='secondary-button';button.textContent=kind==='background'?'Background':'Logo';button.setAttribute('aria-label',`Use saved image ${index+1} as ${kind}`);button.disabled=!ready;
        button.onclick=()=>{
          if(!artworkUrl(item.ref)){void loadImageLibrary();$('artwork-status').textContent='Refreshing image links. Choose your image again.';return;}
          if(patch({appearance:{...formState().appearance,artwork:{...artworkSettings(formState().appearance),[kind]:item.ref}}}))$('artwork-status').textContent='Saved image selected. Save changes to update the display.';
        };
        actions.append(button);
      }
      if(result.canDelete&&Number.isSafeInteger(item.generation)){
        const remove=document.createElement('button');remove.type='button';remove.className='secondary-button image-delete';remove.textContent=item.status==='deleting'?'Retry delete':'Delete';remove.setAttribute('aria-label',`Delete saved image ${index+1}`);remove.disabled=item.status==='pending';remove.onclick=()=>void deleteSavedImage(item,index+1);actions.append(remove);
      }
      card.append(actions);return card;
    });
    $('image-library-grid').replaceChildren(...cards);$('load-image-library').textContent='Refresh';
    $('image-library-status').textContent=images.length?`${images.length} / 10 images · Choose Background or Logo to apply.`:'No saved images yet. Upload a background or logo above to start your library.';
  }catch(error){$('image-library-status').textContent=error.message;}
  finally{busy=false;updateDisabled();}
}
async function deleteSelectedImage(kind){
  if(busy||pendingSave||!connection?.online||recoveryHeld(connection))return;
  const ref=artworkSettings(formState().appearance)[kind];if(!ref)return;
  busy=true;updateDisabled();let item,index;
  try{
    const result=await connection.request('/api/artwork');requireWritable(connection);
    index=(result.images||[]).findIndex(image=>image.ref?.id===ref.id&&image.ref?.owner===ref.owner);
    item=result.images?.[index];
    if(!result.canDelete||!item||!Number.isSafeInteger(item.generation))throw new Error('Refresh your saved images before deleting this image.');
  }catch(error){$('artwork-status').textContent=error.message;return;}
  finally{busy=false;updateDisabled();}
  await deleteSavedImage(item,index+1);
}
async function deleteSavedImage(item,number){
  if(busy||pendingSave||!connection?.online||recoveryHeld(connection))return;
  if(!await ask(`Delete saved image ${number}? It will also be removed from all your tournament backgrounds and logos. This cannot be undone.`,'Delete image'))return;
  if(busy||pendingSave||!connection?.online||recoveryHeld(connection))return;
  busy=true;updateDisabled();let removed=false;
  try{
    const result=await requestArtworkDeletion(connection,item.ref,item.generation);
    if(result.deleted!==true)throw new Error('Image deletion was not confirmed. Refresh the library and retry.');
    removed=true;forgetArtworkRef(item.ref);
    const appearance=withoutArtworkRef(formState().appearance,item.ref);
    if(appearance!==formState().appearance){setupDraft??=new SettingsDraft(snapshot.state);setupDraft.edit({appearance});}
    receive(await connection.request('/api/state'));requireWritable(connection);renderInputs(true);
    $('artwork-status').textContent='Image deleted from your library and tournament displays.';
  }catch(error){$('image-library-status').textContent=removed?'Image deleted. Refresh to load the latest tournament state.':`Deletion was not confirmed. It may have completed. Retry Delete to confirm. ${error.message}`;}
  finally{busy=false;updateDisabled();}
  if(removed)await loadImageLibrary();
}
function renderBounty(force=false){
  const s=formState(),bounty=s.bounty,cash=n=>money(n,currencyCode(s));
  put('bounty-mode',bounty.mode,false,force);put('bounty-amount',bounty.amount??'',false,force);
  $('bounty-amount').disabled=bounty.mode==='off';
  document.querySelectorAll('[data-bounty-total]').forEach(row=>row.hidden=bounty.mode==='off');
  $('bounty-amount-label').textContent=bounty.mode==='per-entry'?'Amount per entry':'Bounty amount';
  const f=finances({...s,bounty});
  const error=!Number.isFinite(bounty.amount)||bounty.amount<0||bounty.amount>1e10?'Enter a valid bounty amount.':f.reserve>f.gross?'Bounties exceed the available pool.':'';
  $('bounty-summary').textContent=error?'Check amount':bounty.mode==='off'?'Off':`${cash(bounty.amount)} ${bounty.mode==='per-entry'?'per entry':'total'}`;
  $('bounty-error').textContent=error;$('bounty-error').hidden=!error;
  $('bounty-amount').setAttribute('aria-invalid',String(!!error));
}
const rangeLabel=group=>group.from===group.to?ordinal(group.from):`${ordinal(group.from)}–${ordinal(group.to)}`;
const calculatorRecipe=()=>({itm:Number($('calculator-itm').value),type:$('calculator-type').value,finalTable:Number($('calculator-final-table').value),places:$('calculator-places').value===''?null:Number($('calculator-places').value),minimumMultiple:Number($('calculator-minimum').value),roundPayouts:Number($('calculator-rounding').value)===20,roundingIncrement:Number($('calculator-rounding').value)});
function currentPayoutPlan(){if(!snapshot)return null;const s=formState();return payoutPlan({entrants:s.entrants,buyIn:s.buyIn,pool:finances(s).pool},calculatorRecipe());}
function renderPayoutPreview(){
  const plan=currentPayoutPlan();if(!plan)return;
  const s=formState(),cash=n=>money(n,currencyCode(s)),pool=finances(s).pool;
  $('calculator-entries').textContent=Number.isFinite(s.entrants)?s.entrants.toLocaleString():'—';$('calculator-pool').textContent=cash(pool);
  $('calculator-status').textContent=plan.ok?`${plan.places} paid ${plan.places===1?'place':'places'} · ${cash(plan.assigned)} total`:
      plan.message+(plan.required?` Requires ${cash(plan.required)}; available ${cash(pool)}.`:'');
  $('calculator-status').classList.toggle('invalid',!plan.ok);
  $('calculator-preview').replaceChildren(...plan.groups.map(group=>{const row=document.createElement('div'),label=document.createElement('span'),amount=document.createElement('strong');label.textContent=rangeLabel(group);amount.textContent=cash(group.low);row.append(label,amount);return row;}));
  $('apply-calculated-payouts').disabled=!plan.ok;
}
function editPayouts(values,extra={}){const s=formState();patch({...extra,payoutPreset:'custom',customPayouts:values,payoutConfig:{...s.payoutConfig,basis:payoutBasis(s)}});}
function renderPayouts(){const s=formState();$('payout-editor').replaceChildren(...payoutGroups(payouts(s)).map(group=>{
  const label=document.createElement('label');label.className='payout-row';const span=document.createElement('span');span.textContent=rangeLabel(group);
  const input=document.createElement('input');input.type='number';input.min='0';input.step='.01';input.value=group.low;input.dataset.from=group.from;input.disabled=s.payoutPreset!=='custom';input.setAttribute('aria-label',`${rangeLabel(group)} payout`);
  input.addEventListener('input',()=>{const values=[...formState().customPayouts];values.fill(settingNumber(input.value),group.from-1,group.to);editPayouts(values);});
  const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label',`Remove ${rangeLabel(group)} payout`);remove.hidden=s.payoutPreset!=='custom';remove.onclick=()=>{const values=[...formState().customPayouts];values.splice(group.from-1,group.to-group.from+1);editPayouts(values);};
  label.append(span,input,remove);return label;
}));}
function renderStructure(levels,preset){
  if(structureDraft&&setupDraft){setupDraft.edit({levels,structurePreset:preset});renderSaveState();}
  $('structure-preset').value=preset;const noAnte=noAnteEnabled(levels);$('no-ante').checked=noAnte;let play=0;
  $('levels-body').replaceChildren(...levels.map((row,i)=>{const tr=document.createElement('tr');const num=document.createElement('td');num.textContent=row.isBreak?'B':++play;tr.append(num);
    for(const field of ['minutes','small','big','ante','isBreak']){const td=document.createElement('td'),input=document.createElement('input');input.type=field==='isBreak'?'checkbox':'number';input.min=field==='minutes'?'1':'0';input.value=row[field];input.checked=Boolean(row[field]);input.setAttribute('aria-label',`Row ${i+1} ${field}`);input.disabled=(row.isBreak&&['small','big','ante'].includes(field))||(noAnte&&field==='ante');
      input.oninput=()=>{ensureDraft();const edited=structureDraft.levels[i];edited[field]=field==='isBreak'?input.checked:settingNumber(input.value);if(field==='ante')delete edited.anteWhenEnabled;if(field==='isBreak'&&input.checked){Object.assign(edited,{small:0,big:0,ante:0});delete edited.anteWhenEnabled;}structureDraft.preset='custom';setupDraft.edit({levels:structureDraft.levels,structurePreset:'custom'});$('structure-preset').value='custom';renderSaveState();renderSetupValidation();if(field==='isBreak')renderStructure(structureDraft.levels,'custom');};td.append(input);tr.append(td);}
    const td=document.createElement('td'),remove=document.createElement('button');remove.textContent='×';remove.type='button';remove.setAttribute('aria-label',`Remove row ${i+1}`);remove.onclick=()=>{ensureDraft();if(structureDraft.levels.length>1)structureDraft.levels.splice(i,1);structureDraft.preset='custom';renderStructure(structureDraft.levels,'custom');};td.append(remove);tr.append(td);return tr;
  }));
  $('structure-summary').textContent=`${play} levels · ${levels.length-play} breaks`;
}
function ensureDraft(){saveMessage='';setupDraft??=new SettingsDraft(snapshot.state);if(!structureDraft)structureDraft={levels:structuredClone(formState().levels),preset:formState().structurePreset};}
async function openSetup(){if(view!=='director')return;if(document.fullscreenElement)await document.exitFullscreen();setupDraft??=new SettingsDraft(snapshot.state);$('drawer-backdrop').hidden=false;$('setup-drawer').inert=false;$('setup-drawer').classList.add('open');$('setup-drawer').setAttribute('aria-hidden','false');$('app').inert=$('director-controls').inert=true;document.body.classList.add('setup-open');renderInputs();updateDisabled();$('setup-title').focus({preventScroll:true});}
async function openPayoutSettings(){if(view!=='director')return;await openSetup();if(view!=='director'||$('setup-drawer').getAttribute('aria-hidden')==='true')return;tab('payouts');$('tab-payouts').focus({preventScroll:true});}
async function enterCreationSetup(){
  if(!consumeCreationSetup({view,role:snapshot?.role,location,history,recovery:recoveryHeld(connection)}))return false;
  await openSetup();
  if(view!=='director'||snapshot?.role!=='director'||recoveryHeld(connection)||$('setup-drawer').getAttribute('aria-hidden')==='true')return false;
  tab('tournament');$('new-tournament-guide').hidden=false;$('tab-tournament').focus({preventScroll:true});return true;
}
function hideSetup(){previewSound.disable();closeThemePicker();$('new-tournament-guide').hidden=true;$('drawer-backdrop').hidden=true;$('setup-drawer').classList.remove('open');$('setup-drawer').setAttribute('aria-hidden','true');$('setup-drawer').inert=true;$('app').inert=$('director-controls').inert=false;document.body.classList.remove('setup-open');if($('director-settings').getClientRects().length)$('director-settings').focus({preventScroll:true});}
function discardDraft(){if(recoveryHeld(connection))return false;setupDraft=new SettingsDraft(snapshot.state);structureDraft=null;saveMessage='';validationVisible=false;resetArtworkStatus();renderInputs(true);updateDisabled();return true;}
function focusSettingsAfterAction(opener){
  if(recoveryHeld(connection)||(document.activeElement!==opener&&document.activeElement!==document.body))return;
  const target=document.querySelector('#setup-drawer [data-tab].active');
  if(target&&!target.disabled&&!target.closest('[inert]')&&target.getClientRects().length)target.focus({preventScroll:true});
}
async function confirmDiscardDraft(){
  if(!await ask('Discard your unsaved setup changes and use the latest saved settings?','Discard changes')||!discardDraft())return;
  // Closing the confirmation restores focus to Discard, which is now disabled.
  // Keep keyboard navigation in Settings without changing cancel/close behavior.
  focusSettingsAfterAction($('discard-draft'));
}
async function closeSetup(){if(recoveryHeld(connection)){hideSetup();return;}if(busy||pendingSave)return notify('Please finish or retry the pending save first.');if(hasDraft()&&!await ask('Discard your unsaved setup changes? The live tournament will not be changed.','Discard changes'))return;discardDraft();hideSetup();}
function renderSaveState(){
  if(recoveryHeld(connection))$('new-tournament-guide').hidden=true;
  renderRecoveryNotices(document,{reason:connection?.recoveryRequired,draft:setupDraft,structureDraft,pendingSave,reviewPath:location.pathname});
  const conflicts=setupDraft?.conflicts||[],held=recoveryHeld(connection),dirty=hasDraft(),retryPending=!!pendingSave,changesPending=dirty||retryPending;
  $('save-status').textContent=recoveryHeld(connection)?recoverySaveMessage(pendingSave):busy?'Saving…':saveMessage||(!snapshot?.capabilities?.setupDrafts?'This host needs the setup-safety backend update before drafts can be saved.':conflicts.length?'Another screen changed these settings. Review below.':hasDraft()?'Unsaved changes — not yet on the display':'');
  $('save-status').hidden=!$('save-status').textContent;
  $('save-close').textContent=held&&changesPending?'Saving paused':busy?'Saving…':retryPending?'Retry save':'Save + Close';
  const saveBlocked=changesPending&&(held||!connection?.online||(!retryPending&&conflicts.length>0)||!snapshot?.capabilities?.setupDrafts);
  $('save-close').disabled=busy||saveBlocked;
  $('discard-draft').disabled=busy||!!pendingSave||!hasDraft()||recoveryHeld(connection);
  $('draft-conflicts').hidden=!conflicts.length;
  $('conflict-list').replaceChildren(...conflicts.map(path=>{const li=document.createElement('li'),get=s=>path.reduce((v,k)=>v?.[k],s),describe=v=>Array.isArray(v)?`${v.length} rows`:JSON.stringify(v)??'Not set';li.textContent=`${path.join(' › ')} — saved: ${describe(get(setupDraft.latest))}; yours: ${describe(get(setupDraft.value))}`;return li;}));
}
function renderPayoutSafety(){
  const s=formState(),review=payoutReview(s),cash=n=>money(n,currencyCode(s));
  $('payout-warning').textContent=[...review.errors,...(review.stale?['Entries, buy-in or prize pool changed since these amounts were calculated. Update the amounts or open the payout calculator.']:[]),...(review.difference>0?[`${cash(review.difference)} remains unassigned.`]:[])].join(' ');
}
function renderSetupValidation(){
  document.querySelectorAll('[data-setup-invalid]').forEach(el=>{el.removeAttribute('data-setup-invalid');if(el.id!=='bounty-amount')el.removeAttribute('aria-invalid');el.removeAttribute('aria-errormessage');});
  const problem=validationVisible?firstSetupIssue(formState()):null;
  $('setup-validation').hidden=!problem;$('setup-validation').textContent=problem?.message||'';
  if(problem){const field=document.querySelector(problem.selector);if(field){field.dataset.setupInvalid='true';field.setAttribute('aria-invalid','true');field.setAttribute('aria-errormessage','setup-validation');}}
  return problem;
}
function focusSetupIssue(problem){
  tab(problem.panel);
  const field=document.querySelector(problem.selector);
  if(field){for(let parent=field.closest('details');parent;parent=parent.parentElement?.closest('details'))parent.open=true;field.scrollIntoView({block:'center'});field.focus({preventScroll:true});}
  saveMessage=problem.message;renderSaveState();
}
async function saveSetup(){
  if(busy||!connection?.online)return;
  if(!pendingSave){validationVisible=true;const problem=renderSetupValidation();if(problem){focusSetupIssue(problem);return;}}
  const restoreFocus=document.activeElement===$('save-close');
  busy=true;saveMessage='';updateDisabled();let invalidAfterRefresh=null,saved=false;
  try{
    if(!pendingSave){
      const latest=await connection.request('/api/state');requireWritable(connection);receive(latest);
      const problem=renderSetupValidation();if(problem){invalidAfterRefresh=problem;return;}
      const args=setupDraft.command(),revision=snapshot.revision;
      if(args.structure){const confirmed=await ask('Save all setup changes and restart at the first level, paused? Only a changed blind structure resets the clock.','Save and restart');requireWritable(connection);if(!confirmed)return;}
      requireWritable(connection);
      pendingSave={id:id(),revision,type:'setup',...args};
    }
    const result=await connection.request('/api/command',pendingSave);
    requireWritable(connection);
    pendingSave=null;structureDraft=null;receive(result);
    setupDraft.reset(snapshot.state);validationVisible=false;saveMessage='';resetArtworkStatus();renderInputs(true);saved=true;
  }catch(e){
    if(recoveryHeld(connection,e)){saveMessage=recoverySaveMessage(pendingSave);return;}
    // Unknown transport outcomes must retry the exact command ID, never a new mutation.
    if(e.status&&e.status<500){pendingSave=null;try{receive(await connection.request('/api/state'));}catch{}}
    saveMessage=pendingSave?'Save not confirmed. Your draft is kept; reconnect and Retry save.':`${e.message} Your draft is kept.`;notify(saveMessage);
  }finally{busy=false;updateDisabled();if(invalidAfterRefresh)focusSetupIssue(invalidAfterRefresh);else if(saved&&restoreFocus)focusSettingsAfterAction($('save-close'));}
  return saved;
}
async function completeOrSaveSetup(){if(busy)return;if(!hasDraft()&&!pendingSave)return hideSetup();if(await saveSetup())hideSetup();}
function renderSetupGuideStep(name){const labels={tournament:'Tournament',blinds:'Blinds',payouts:'Payouts',appearance:'Appearance',sharing:'Sharing'},steps=[...document.querySelectorAll('[data-guide-tab]')],index=steps.findIndex(step=>step.dataset.guideTab===name);steps.forEach(step=>{if(step.dataset.guideTab===name)step.setAttribute('aria-current','step');else step.removeAttribute('aria-current');});$('setup-guide-status').textContent=index>=0?`Viewing step ${index+1} of 3 · ${labels[name]}`:`Optional section · ${labels[name]}. Choose a numbered step to continue.`;}
function tab(name){const tabs=[...document.querySelectorAll('[data-tab]')],changed=tabs.find(el=>el.classList.contains('active'))?.dataset.tab!==name;tabs.forEach(el=>{const selected=el.dataset.tab===name;el.classList.toggle('active',selected);el.setAttribute('aria-selected',String(selected));el.tabIndex=selected?0:-1;});tabs.find(el=>el.dataset.tab===name)?.scrollIntoView?.({block:'nearest',inline:'nearest'});document.querySelectorAll('[data-panel]').forEach(el=>el.classList.toggle('active',el.dataset.panel===name));renderSetupGuideStep(name);if(changed)document.querySelector('.drawer-scroll').scrollTop=0;if(name==='sharing')loadLinks();}
const origin=()=>shareOrigin($('network-origin').value==='custom'?$('custom-share-origin').value:$('network-origin').value);
function refreshSharingLinks(){
  const base=origin(),custom=$('network-origin').value==='custom';
  $('custom-share-origin-label').hidden=!custom;
  const account=accountShareLinks(base,tournamentId);
  $('director-link').value=account.director;$('display-link').value=account.display;
  $('pairing-link').value=sharedLink(base,pairingPath);$('observer-link').value=sharedLink(base,observerPath);
  for(const id of ['pair-phone','pair-display','create-observer'])$(id).disabled=!base;
  for(const [button,input] of [['copy-director','director-link'],['copy-display','display-link'],['copy-pairing','pairing-link'],['copy-observer','observer-link']])$(button).disabled=!$(input).value;
  $('share-address-help').textContent=base?'These copied links use '+base+'. This frontend is private. Enabled backend Display access exposes full test tournament data.':
    'Choose a valid hosted app address before copying a link.';
}
async function loadLinks(){
  if(sharingLoading)return;
  sharingLoading=true;$('panel-sharing').setAttribute('aria-busy','true');
  $('network-origin').disabled=true;$('share-address-help').textContent='Preparing screen links…';
  for(const id of ['director-link','display-link'])if(!$(id).value)$(id).placeholder='Preparing link…';
  for(const [button,input]of [['copy-director','director-link'],['copy-display','display-link']])if(!$(input).value)$(button).disabled=true;
  try {
    const data=await connection.request('/api/links');
    const previous=origin()||localStorage.getItem('not-bravo-share-origin')||'';
    const customSelected=$('network-origin').value==='custom';
    let lan=Array.isArray(data.lan)?data.lan:[];
    if(cloudMode&&!shareOrigin(location.origin))lan=await localSharingAddresses(fetch,credentials.get('director'));
    const options=sharingOrigins(location.origin,lan);
    $('network-origin').replaceChildren(...options.map(value=>new Option(value,value)),new Option('Enter another address…','custom'));
    if(options.includes(previous))$('network-origin').value=previous;
    else if((customSelected||!options.length)&&shareOrigin(previous)){$('custom-share-origin').value=previous;$('network-origin').value='custom';}
    refreshSharingLinks();
    $('observer-status').textContent=data.observerEnabled?'Observer sharing is enabled. Regenerate for a new link if you no longer have it.':'Observer sharing is disabled.';
  }catch(e){refreshSharingLinks();notify(e.message);}
  finally{sharingLoading=false;$('network-origin').disabled=false;$('panel-sharing').removeAttribute('aria-busy');for(const id of ['director-link','display-link'])$(id).placeholder=$(id).value?'':'Link unavailable';}
}
async function changeDisplaySharing(){
  const allowed=()=>canManageDisplay(snapshot,cloudMode)&&view==='director'&&!busy&&!pendingSave&&connection?.online&&!recoveryHeld(connection);
  if(displayAccessPending||!allowed())return false;
  const before=snapshot,enabled=!before.displayEnabled,opener=$('display-access-toggle'),restoreFocus=document.activeElement===opener;let ownsBusy=false;displayAccessPending=true;updateDisabled();
  try{
    const explanation=enabled?'Enable Display access? Anyone with the existing Display URL will be able to view the clock and use display sound again. The URL stays the same.':'Disable Display access? Public Display connections will stop receiving clock updates and sound access. Observer links are managed separately. Previously issued online image links can remain usable until their five-minute expiry. Downloaded copies cannot be revoked.';
    if(!await ask(explanation,enabled?'Enable Display access':'Disable Display access'))return false;
    if(!allowed()||snapshot.id!==before.id||snapshot.displayEnabled!==before.displayEnabled){notify('Display access or the connection changed. Review the current setting before trying again.');return false;}
    busy=true;ownsBusy=true;updateDisabled();
    const result=await connection.request('/api/display-access',{enabled,revision:snapshot.revision});requireWritable(connection);receive(result);
    if(snapshot.displayEnabled!==enabled){notify('Display access changed again on another screen. Review the current setting.');return false;}
    notify(enabled?'Display access enabled. The existing Display URL works again.':'Display access disabled. Separate observer links remain unchanged.');return true;
  }catch(error){
    if(recoveryHeld(connection,error)){notify('Display access change is unconfirmed. This screen is paused.');return false;}
    notify(error.message||'Display access change was not confirmed.');
    try{receive(await connection.request('/api/state'));}catch{}
    return false;
  }finally{if(ownsBusy)busy=false;displayAccessPending=false;updateDisabled();if(restoreFocus&&document.activeElement===document.body&&!opener.disabled&&!opener.closest('[inert]')&&opener.getClientRects().length)opener.focus({preventScroll:true});}
}
async function pairing(role){if(!origin())return notify('Choose an address that your phone can reach first.');try{const data=await connection.request('/api/pairing',{role});pairingPath=data.path;refreshSharingLinks();notify(`Created one-use ${role} link. Expires in 10 minutes.`);}catch(e){notify(e.message);}}
async function copy(input){const el=$(input);if(!el.value){notify('Create a link first.');return;}try{await navigator.clipboard.writeText(el.value);notify('Link copied');}catch{el.focus();el.select();notify('Link selected. Use Copy on your device.');}}
async function observer(enabled){if(enabled&&!origin())return notify('Choose an address that your phone can reach first.');try{const data=await connection.request('/api/observer',{enabled});observerPath=data.path||'';refreshSharingLinks();await loadLinks();notify(enabled?'New observer link created. Previous viewers disconnected.':'Observer access revoked.');}catch(e){notify(e.message);}}
function revealFullscreen(){if(view==='director')return;$('app').classList.add('controls-visible');clearTimeout(fullscreenTimer);fullscreenTimer=setTimeout(()=>$('app').classList.remove('controls-visible'),2500);}
function wire(){
  for(const key of ['payout','icm']){$(`open-${key}-calculator`).onclick=()=>{if(busy||pendingSave)return;$(`${key}-calculator-dialog`).showModal();};}
  document.querySelectorAll('[data-close-calculator]').forEach(button=>button.onclick=()=>$(button.dataset.closeCalculator).close());
  installIcm({root:document,getPayouts:()=>payouts(formState()),getCurrency:()=>currencyCode(formState()),formatMoney:money});
  installControlIcons();
  const chromeSizer=new ResizeObserver(()=>{const height=$('director-controls').getBoundingClientRect().height;if(height>0)document.documentElement.style.setProperty('--director-reserve',`${Math.ceil(height+40)}px`);});
  chromeSizer.observe($('director-controls'));
  $('open-theme-picker').onclick=openThemePicker;
  $('close-theme-picker').onclick=closeThemePicker;
  $('apply-theme-picker').onclick=applyThemePicker;
  $('theme-picker-dialog').onclose=()=>{pendingThemeKey=null;$('open-theme-picker').setAttribute('aria-expanded','false');};
  $('load-image-library').onclick=()=>void loadImageLibrary();
  $('art-preset').onchange=e=>patch({appearance:{...formState().appearance,artwork:{...artworkSettings(formState().appearance),preset:e.target.value}}});
  $('art-advanced').onchange=e=>patch({appearance:withAdvancedArtwork(formState().appearance,e.target.checked)});
  for(const kind of ['background','logo']){
    $(kind+'-upload').onchange=()=>void uploadArtwork(kind);
    $('remove-'+kind).onclick=()=>void deleteSelectedImage(kind);
  }
  for(const key of ['opacity','size','x','y','logoSize','logoOpacity','monochrome'])$('art-'+key).oninput=e=>patch({appearance:{...formState().appearance,artwork:{...artworkSettings(formState().appearance),[key]:key==='monochrome'?e.target.checked:Number(e.target.value)}}});
  const rememberShareOrigin=()=>{refreshSharingLinks();if(origin())localStorage.setItem('not-bravo-share-origin',origin());};
  $('network-origin').onchange=rememberShareOrigin;
  $('custom-share-origin').oninput=refreshSharingLinks;$('custom-share-origin').onchange=rememberShareOrigin;
  const themeGroups=new Map();
  for(const [value,label] of Object.entries(themes)){
    const group=themeDetails[value].group;
    if(!themeGroups.has(group)){const optionGroup=document.createElement('optgroup');optionGroup.label=group;themeGroups.set(group,optionGroup);}
    themeGroups.get(group).append(new Option(label,value));
  }
  $('board-theme-input').replaceChildren(...themeGroups.values());
  buildThemeGallery();
  for(const [input,choices] of [['background-art-input',backgroundChoices],['art-preset',artworkPresetChoices],['currency-input',currencies]])$(input).replaceChildren(...Object.entries(choices).map(([value,label])=>new Option(label,value)));
  $('color-presets').replaceChildren(...[...Object.entries(colorPresets),['custom',{label:'Custom'}]].map(([key,preset])=>{
    const button=document.createElement('button');button.type='button';button.dataset.colorPreset=key;button.setAttribute('aria-label',preset.label);button.setAttribute('aria-pressed','false');
    const swatch=document.createElement('i');swatch.setAttribute('aria-hidden','true');swatch.style.setProperty('--swatch',preset.board||'conic-gradient(#ad0000,#805600,#063b1d,#125d8c,#632487,#ad0000)');
    const label=document.createElement('span');label.textContent=preset.label;button.append(swatch,label);
    button.onclick=()=>patch({appearance:{...formState().appearance,...(key==='custom'?boardColors(formState()):{board:preset.board,accent:preset.accent}),colorPreset:key}});
    return button;
  }));
  $('display-fields').replaceChildren(...displayFields.map(field=>{
    const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.id=`field-${field.key}`;input.dataset.fieldInput=field.key;
    const span=document.createElement('span');span.textContent=field.label;label.append(input,span);
    input.onchange=()=>{if(fieldConfigurable(formState(),field.key))patch({appearance:{...formState().appearance,fields:{...formState().appearance.fields,[field.key]:input.checked}}},input);};
    return label;
  }));
  $('setup-drawer').addEventListener('focusin',e=>{if(snapshot&&e.target.matches('input,select'))e.target.dataset.editRevision=snapshot.revision;});
  $('setup-drawer').addEventListener('keydown',e=>{
    if(e.defaultPrevented||document.querySelector('dialog[open]'))return;
    if(e.key==='Escape'){e.preventDefault();void closeSetup();return;}
    if(e.key!=='Tab')return;
    const controls=[...$('setup-drawer').querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(el=>{
      if(el.tabIndex<0||!el.getClientRects().length||el.closest('[inert]'))return false;
      // Closed details can retain layout boxes in Chromium, but their contents
      // cannot receive focus. Include only the summary until they are expanded.
      for(let parent=el.parentElement;parent&&parent!==$('setup-drawer');parent=parent.parentElement)if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(el))return false;
      return true;
    });
    const at=controls.indexOf(document.activeElement);
    if(controls.length&&((e.shiftKey&&at<=0)||(!e.shiftKey&&at===controls.length-1))){e.preventDefault();controls[e.shiftKey?controls.length-1:0].focus();}
  });
  document.querySelector('.setup-tabs').addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key)||!e.target.matches('[data-tab]'))return;
    e.preventDefault();const buttons=[...document.querySelectorAll('[data-tab]')],at=buttons.indexOf(e.target);
    const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(at+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;
    tab(buttons[next].dataset.tab);buttons[next].focus();
  });
  $('director-settings').onclick=openSetup;$('close-setup').onclick=$('drawer-backdrop').onclick=closeSetup;$('save-close').onclick=completeOrSaveSetup;
  $('discard-draft').onclick=confirmDiscardDraft;
  $('keep-draft').onclick=async()=>{const before=$('conflict-list').textContent;if(await ask('Keep your values for the listed conflicts? They will replace those saved values when you press Save changes.','Keep my values')){if(recoveryHeld(connection))return;if(before!==$('conflict-list').textContent)return notify('Saved values changed again. Review the updated conflicts first.');setupDraft.keepMine();renderSaveState();}};
  window.addEventListener('beforeunload',e=>{if(hasDraft()||pendingSave){e.preventDefault();e.returnValue='';}});
  const goToTournaments=async e=>{if(recoveryHeld(connection)&&(hasDraft()||pendingSave)){e.preventDefault();return notify('Keep this tab open to retain your changes. Use the recovery review link to open a separate view.');}if(busy||pendingSave){e.preventDefault();return notify('Finish or retry the pending save before leaving.');}if(!hasDraft())return;e.preventDefault();if(await ask('Leave this tournament and discard unsaved setup changes?','Discard and leave')){if(recoveryHeld(connection))return;setupDraft=null;structureDraft=null;location.assign('/tournaments');}};
  $('director-my-tournaments').onclick=goToTournaments;
  $('dismiss-tournament-guide').onclick=()=>{$('new-tournament-guide').hidden=true;const active=[...document.querySelectorAll('[data-tab]')].find(button=>button.classList.contains('active'));const target=active||$('tab-tournament');if(!target.disabled)target.focus({preventScroll:true});};
  document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.tab));
  document.querySelectorAll('[data-guide-tab]').forEach(b=>b.onclick=()=>tab(b.dataset.guideTab));
  const stepLevel=direction=>{const index=adjacentLevelIndex(snapshot.state,direction);if(index!==null)return send('level',{index});};
  const actions={toggle:()=>send(snapshot.state.clock.status==='running'?'pause':'start'),previous:()=>stepLevel(-1),next:()=>stepLevel(1),remove:()=>send('players',{delta:-1}),restore:()=>send('players',{delta:1}),'add-entry':()=>{try{return send('settings',{patch:newEntryPatch(snapshot.state)});}catch(e){notify(e.message);}}};
  document.querySelectorAll('[data-command]').forEach(b=>b.onclick=actions[b.dataset.command]);
  $('director-time').onclick=()=>{
    if(busy||pendingSave||!connection?.online)return;
    if(!$('time-editor').hidden)return closeTimeEditor();
    const s=snapshot.state,seconds=Math.ceil((s.clock.status==='running'?Math.max(0,s.clock.deadline-connection.now()):s.clock.remainingMs)/1000);
    timeEditTarget=clockEditVersion(s);timeEditorError('');$('time-editor').hidden=false;$('director-time').setAttribute('aria-expanded','true');
    $('time-input').value=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;updateDisabled();$('time-input').focus();$('time-input').select();
  };
  $('cancel-time').onclick=closeTimeEditor;
  $('time-input').oninput=()=>{if(timeEditTarget===clockEditVersion(snapshot.state))timeEditorError('');};
  $('time-editor').onsubmit=async e=>{
    e.preventDefault();if(busy||pendingSave||!connection?.online)return;
    if(timeEditTarget!==clockEditVersion(snapshot.state))return timeEditorError('Clock changed. Close and reopen Set Time before applying a new value.');
    let seconds;try{seconds=parseRemainingTime($('time-input').value);}catch(error){timeEditorError(error.message);$('time-input').focus();return;}
    if(await send('time',{seconds}))closeTimeEditor();
  };
  $('display-fullscreen').onclick=()=>{void displayAudio.pulse({gesture:true});const action=document.fullscreenElement?document.exitFullscreen():$('app').requestFullscreen?.();action?.catch(()=>notify('Fullscreen is not available in this browser.'));};
  $('app').addEventListener('pointermove',revealFullscreen,{passive:true});
  $('app').addEventListener('pointerdown',revealFullscreen,{passive:true});
  // A click anywhere on a venue display is enough to unlock browser audio.
  document.addEventListener('click',()=>{if(view==='display')void displayAudio.pulse({gesture:true});});
  document.addEventListener('keydown',()=>{revealFullscreen();if(view==='display')void displayAudio.pulse({gesture:true});});
  document.addEventListener('fullscreenchange',()=>{$('display-fullscreen').setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');revealFullscreen();});
  $('board-theme-input').onchange=e=>patch({appearance:appearanceForLayout(formState(),e.target.value)},e.target);
  for(const [input,key] of [['background-art-input','backgroundArt'],['currency-input','currency']])$(input).onchange=e=>patch({appearance:{...formState().appearance,[key]:e.target.value}},e.target);
  $('payout-visibility-input').onchange=e=>{
    const appearance={...formState().appearance,payoutVisibility:e.target.value};
    if(e.target.value==='after-registration')appearance.fields={...appearance.fields,prizePool:true,payouts:true};
    patch({appearance},e.target);
  };
  document.querySelectorAll('[data-presentation-input]').forEach(input=>input.oninput=()=>{
    const key=input.dataset.presentationInput,value=input.type==='number'?(input.value===''?null:Number(input.value)):input.value.trim();
    if(input.type==='number'&&value!==null&&(!Number.isSafeInteger(value)||value<0||value>1e12)){notify('Enter a whole stack between 0 and 1 trillion, or leave it blank.');renderInputs(true);return;}
    patch({appearance:{...formState().appearance,[key]:value}},input);
  });
  for(const [input,key,type]of [['event-name-input','eventName','text'],['entrants-input','entrants','number'],['players-input','playersLeft','number'],['buy-in-input','buyIn','number'],['prize-entry-input','prizePerEntry','number'],['starting-stack-input','startingStack','number'],['table-numbers-input','tableNumbers','text'],['ticker-text-input','tickerText','text'],['show-table-numbers-input','showTableNumbers','check'],['auto-advance-input','autoAdvance','check'],['show-ticker-input','showTicker','check']])$(input).oninput=e=>{const value=type==='check'?e.target.checked:type==='number'?settingNumber(e.target.value):e.target.value;patch(key==='buyIn'?buyInContributionPatch(formState(),value):key==='prizePerEntry'?prizeContributionPatch(formState(),e.target.validity?.badInput?NaN:value):{[key]:value},e.target);};
  $('use-buy-in').onclick=()=>{const amount=formState().buyIn;if(Number.isFinite(amount)&&amount>=0)patch({prizePerEntry:amount});};
  for(const [input,key]of [['board-color-input','board'],['board-color-text','board'],['accent-color-input','accent'],['accent-color-text','accent']])$(input).oninput=e=>patch({appearance:{...formState().appearance,...boardColors(formState()),colorPreset:'custom',[key]:e.target.value}},e.target);
  $('bounty-mode').onchange=e=>{const bounty={...formState().bounty,mode:e.target.value};if(bounty.mode==='off'&&(!Number.isFinite(bounty.amount)||bounty.amount<0||bounty.amount>1e10))bounty.amount=0;patch({bounty});};
  $('bounty-amount').oninput=e=>patch({bounty:{...formState().bounty,amount:e.target.value===''?null:Number(e.target.value)}});
  $('registration-cutoff').onchange=e=>patch({registration:{cutoffIndex:Number(e.target.value),override:'auto'}},e.target);
  $('edit-saved-payouts').onclick=()=>editPayouts(payouts(formState()));
  for(const key of ['calculator-itm','calculator-places','calculator-minimum','calculator-type','calculator-final-table','calculator-rounding'])$(key).oninput=()=>patch({payoutConfig:{...formState().payoutConfig,recipe:calculatorRecipe()}});
  $('apply-calculated-payouts').onclick=async()=>{const plan=currentPayoutPlan(),before=payoutSignature(formState());if(!plan?.ok)return renderPayoutPreview();if(payouts(formState()).length&&!await ask('Replace the payouts below? Save changes will update the display.','Apply payouts'))return;if(before!==payoutSignature(formState()))return notify('The pool or payouts changed. Review the updated preview and try again.');editPayouts(plan.amounts,{roundPayouts:Number($('calculator-rounding').value)===20});$('payout-calculator-dialog').close();notify(`${plan.places} payouts filled. Save changes to update the display.`);};
  $('add-payout').onclick=()=>editPayouts([...formState().customPayouts,0]);
  $('no-ante').onchange=e=>{ensureDraft();structureDraft.levels=withNoAnte(structureDraft.levels,e.target.checked);structureDraft.preset='custom';renderStructure(structureDraft.levels,'custom');};
  $('structure-preset').onchange=e=>{ensureDraft();const noAnte=$('no-ante').checked;structureDraft.preset=e.target.value;if(e.target.value!=='custom'){structureDraft.levels=levelsFor(e.target.value);if(noAnte){structureDraft.levels=withNoAnte(structureDraft.levels,true);structureDraft.preset='custom';}}renderStructure(structureDraft.levels,structureDraft.preset);};
  const addRow=isBreak=>{ensureDraft();const last=structureDraft.levels.findLast(row=>!row.isBreak)||{minutes:20,small:100,big:200,ante:200};structureDraft.levels.push(isBreak?{minutes:15,small:0,big:0,ante:0,isBreak:true}:{...last,isBreak:false});structureDraft.preset='custom';renderStructure(structureDraft.levels,'custom');};
  $('add-level').onclick=()=>addRow(false);$('add-break').onclick=()=>addRow(true);
  $('pair-phone').onclick=()=>pairing('director');$('pair-display').onclick=()=>pairing('display');$('copy-pairing').onclick=()=>copy('pairing-link');$('copy-observer').onclick=()=>copy('observer-link');
  $('copy-director').onclick=()=>copy('director-link');$('copy-display').onclick=()=>copy('display-link');
  $('display-access-toggle').onclick=changeDisplaySharing;
  $('create-observer').onclick=()=>observer(true);$('disable-observer').onclick=()=>observer(false);
  $('open-display').onclick=()=>window.open($('director-open-display').href,'_blank','noopener');
  $('director-sound-check').onclick=async()=>{
    if(view!=='director')return;const button=$('director-sound-check'),status=$('director-sound-check-status');button.disabled=true;status.textContent='Loading sound…';
    try{previewSound.volume=soundSettings(formState()).volume;await previewSound.enable();if(!$('setup-drawer').classList.contains('open')){previewSound.disable();return;}previewSound.play(60);status.textContent='Playing chime + one-minute announcement on this device.';}catch(e){status.textContent=e.message||'Sound could not play on this device.';}finally{button.disabled=false;}
  };
  $('custom-announcement').oninput=()=>{$('announcement-count').textContent=`${$('custom-announcement').value.length}/240`;};
  $('announce-message').onclick=async()=>{
    if(view!=='director')return;
    const text=$('custom-announcement').value.trim(),result=$('announcement-status');
    if(!text){result.textContent='Enter a message first.';$('custom-announcement').focus();return;}
    if(hasDraft()){result.textContent='Save your Settings changes before announcing.';return;}
    result.textContent='Sending and loading voice…';
    const outcome=await announceFromDirector({sound:previewSound,text,volume:soundSettings(snapshot.state).volume,send,canPlay:()=>$('setup-drawer').classList.contains('open')});
    result.textContent=!outcome.sent?'Announcement not sent. Please retry.':outcome.local?'Playing here and sent to the sound-enabled display.':'Sent to the display. Local playback is unavailable on this device.';
  };
  $('sound-enable').onchange=e=>patch({appearance:{...formState().appearance,soundEnabled:e.target.checked}},e.target);
  $('sound-volume').oninput=e=>patch({appearance:{...formState().appearance,soundVolume:Number(e.target.value)}},e.target);
}
async function init(){
  // Hosted staging does not install the local-clock offline service worker.
  wire();let credential,connectionOptions={};
  const cloudRoute=location.pathname.match(/^\/t\/([a-f0-9-]{36})\/(director|display)$/),cloudWatch=location.pathname.match(/^\/watch\/([a-f0-9-]{36})\/([A-Za-z0-9_-]{43})$/);
  if(cloudRoute||cloudWatch){
    cloudMode=true;tournamentId=(cloudRoute||cloudWatch)[1];view=cloudWatch?'observer':cloudRoute[2];
    $('local-access-help').hidden=true;
    try {
      const {auth,accessToken,cloudUrl,publishableKey,accountConfigured}=await import('./cloud-auth.js');
      if(!accountConfigured)throw new Error('Online accounts are unavailable in this staging build. Return to My tournaments for details.');
      setArtworkStorageOrigin(cloudUrl);
      if(view==='director'&&!await accessToken()){location.replace('/login?next='+encodeURIComponent(location.pathname));return;}
      if(view==='display')legacyDisplayHeaders=async()=>{const token=await accessToken();return token?{apikey:publishableKey,Authorization:`Bearer ${token}`}:null;};
      credential='account';connectionOptions={rotateStreams:true,base:`${cloudUrl}/functions/v1/clock/t/${tournamentId}`,headers:async()=>{
        if(cloudWatch)return {apikey:publishableKey,'x-observer-token':cloudWatch[2]};
        if(view==='display')return {apikey:publishableKey,'x-clock-display':'1'};
        const jwt=await accessToken();if(!jwt){const e=new Error('Please sign in again.');e.status=401;throw e;}return {apikey:publishableKey,Authorization:`Bearer ${jwt}`};
      }};
      if(view==='director')auth.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT'){connection?.stop();displayAudio.disconnect();clearInterval(drawTimer);snapshot=null;showAccess('You have signed out. Sign in to reopen this tournament.');}});
      for(const key of ['pair-phone','pair-display','local-pairing-help'])$(key).hidden=true;
      $('account-links').hidden=false;$('open-director').href=`/t/${tournamentId}/director`;
      $('sharing-help').textContent='Sign in with the same test account on your PC or phone. No pairing is needed. This frontend is private; share only synthetic tournament data.';
      $('save-status').textContent='Changes save when accepted by the online service.';
    }catch(e){return showAccess(e.message);}
  }
  if(location.pathname==='/pair'){
    const token=location.hash.slice(1);history.replaceState(null,'','/pair');
    if(!token)return showAccess('Use a current pairing link from the host or director.');
    try{const response=await fetch('/api/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});const data=await response.json();if(!response.ok)throw new Error(data.error);credentials.set(data.role,data.credential);location.replace(`/t/${data.id}/${data.role}`);return;}catch(e){return showAccess(e.message);}
  }
  if(!cloudMode){if(location.pathname.startsWith('/watch/')){view='observer';credential=location.pathname.split('/')[2];}
  else {view=location.pathname.endsWith('/display')?'display':'director';credential=credentials.get(view)||(view==='display'?credentials.get('director'):null);}}
  if(!cloudMode&&view==='display'){
    const oldCredential=credential;legacyDisplayHeaders=async()=>oldCredential?{Authorization:`Bearer ${oldCredential}`}:null;
    credential='public-display';connectionOptions.headers=async()=>({'x-clock-display':'1'});
  }
  $('director-open-display').href=`/t/${tournamentId}/display`;
  if(!credential)return showAccess('This screen has not been paired yet.');
  connection=new Connection(credential,receive,status,()=>{displayAudio.disconnect();clearInterval(drawTimer);snapshot=null;showAccess(cloudMode?(view==='display'?'This Display link is unavailable. The owner may have disabled access. Reopen this page if access is enabled again.':'Access has ended. Sign in again, or request a current observer link.'):'This link or session is no longer authorized. Request a new pairing or observer link.');},connectionOptions);
  try{let initial;
    try{initial=await connection.request('/api/state');}catch(error){
      // Do not break an already-authorized preview while its older host awaits update.
      const fallback=view==='display'&&[401,403].includes(error.status)?await legacyDisplayHeaders?.():null;
      if(!fallback)throw error;connection.options.headers=async()=>{const current=await legacyDisplayHeaders();if(!current){const e=new Error('Please sign in again.');e.status=401;throw e;}return current;};initial=await connection.request('/api/state');
    }
    if(view==='director'&&initial.role!=='director')return showAccess('This session is read-only. Pair as director to control the clock.');
    if(view==='display'&&initial.role==='observer')return showAccess('Pair this screen as a display.');
    receive(initial);$('access-screen').hidden=true;$('app').hidden=false;
    if(view==='director'){
      try{const capabilities=await connection.request('/api/links');artworkAvailable=capabilities.artworkUploads===true;artworkLibraryAvailable=capabilities.artworkLibrary===true;}catch{}
      resetArtworkStatus();renderInputs();
    }
    document.body.classList.toggle('readonly',view!=='director');$('director-controls').hidden=$('director-settings').hidden=view!=='director';
    $('display-fullscreen').hidden=view==='director';revealFullscreen();
    drawTimer=setInterval(()=>{if(snapshot&&!recoveryHeld(connection))renderBoard(snapshot.state,connection.now());},200);
    leaseTimer=setInterval(()=>void displayAudio.pulse(),4000);connection.run();
    await enterCreationSetup();
  }catch(e){showAccess(e.message);}
}
init();
