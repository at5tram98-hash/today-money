
let data=await loadDataAsync();
let acfForecastCache=null;
let commitDepth=0,commitDeferredEffects=[],storageErrorToastShown=false;
/* Developer-only guard. Enable with ?mm3StateGuard=warn or ?mm3StateGuard=throw.
   It observes mutations made through data and nested references obtained from it. */
let mm3StateGuardMode='',mm3StateGuardPermit=0,mm3StateGuardTargets=new WeakMap(),mm3StateGuardRaw=new WeakMap();
const mm3StateGuardViolations=[];
function mm3AllowInternalStateWrite(fn){mm3StateGuardPermit++;try{return fn()}finally{mm3StateGuardPermit--}}
function mm3GuardData(value,path='data'){
  if(!value||typeof value!=='object')return value;
  if(mm3StateGuardRaw.has(value))return value;
  if(mm3StateGuardTargets.has(value))return mm3StateGuardTargets.get(value);
  const check=key=>{if(!mm3StateGuardMode||commitDepth>0||mm3StateGuardPermit>0)return;const message=`コミット外の書き込み: ${path}.${String(key)}`;mm3StateGuardViolations.push({message,stack:new Error().stack});if(mm3StateGuardMode==='throw')throw new Error(message);console.warn(message)};
  const proxy=new Proxy(value,{
    get(target,key){return mm3GuardData(Reflect.get(target,key,target),`${path}.${String(key)}`)},
    set(target,key,next){check(key);return Reflect.set(target,key,mm3StateGuardRaw.get(next)||next,target)},
    deleteProperty(target,key){check(key);return Reflect.deleteProperty(target,key)},
    defineProperty(target,key,descriptor){check(key);return Reflect.defineProperty(target,key,descriptor)}
  });
  mm3StateGuardTargets.set(value,proxy);mm3StateGuardRaw.set(proxy,value);return proxy
}
function enableMM3StateGuard(mode='warn'){if(!['warn','throw'].includes(mode))throw new Error('guard mode must be warn or throw');mm3StateGuardMode=mode;data=mm3GuardData(data);return mm3StateGuardViolations}

function restoreDataSnapshot(snapshot){mm3AllowInternalStateWrite(()=>{for(const k of Object.keys(data))if(!(k in snapshot))delete data[k];for(const [k,v] of Object.entries(snapshot))data[k]=clone(v)});acfForecastCache=null}
function afterCommit(fn){if(typeof fn!=='function')return;if(commitDepth>0)commitDeferredEffects.push(fn);else{try{fn()}catch(e){console.error('post-commit effect failed',e)}}}
/** Reject mutations of records retrieved from data outside an active safeCommit. */
function requireStateCommit(name){if(commitDepth<=0)throw new Error(`${name} must be called within safeCommit`)}
/** The synchronous compatibility path remains durable in localStorage until its callers move to safeCommitAsync. */
function save(options={}){
  const invalidate=!(options&&typeof options==='object'&&options.invalidateAcf===false),force=!!(options&&typeof options==='object'&&options.force);
  if(invalidate)acfForecastCache=null;
  if(commitDepth>0&&!force)return true;
  if(mm3PendingAsyncCommit)throw new Error('保存中です。完了後にもう一度お試しください');
  try{
    if(data.meta?.storageWriteError)mm3AllowInternalStateWrite(()=>{delete data.meta.storageWriteError});
    const revision=mm3StorageRevision+1,raw=JSON.stringify(data),snapshot=JSON.parse(raw);
    mm3WriteLocal(raw,revision);mm3StorageRevision=revision;mm3LastSavedRaw=raw;storageErrorToastShown=false;queuePushSummary();
    if(mm3Db)mm3WriteQueue=mm3WriteQueue.catch(()=>{}).then(()=>mm3DbPutMain(snapshot,revision)).catch(e=>console.warn('IndexedDB mirror pending; local data remains durable',e));
    return true
  }catch(e){mm3AllowInternalStateWrite(()=>{data.meta={...(data.meta||{}),storageWriteError:true}});try{e.__storageWriteError=true}catch(_){}console.error('save failed',e);throw e}
}
/** Resolve only after the IndexedDB transaction has completed. A private-mode fallback writes localStorage. */
async function saveAsync({snapshot=data,invalidateAcf=true}={}){
  const plain=JSON.parse(JSON.stringify(snapshot));if(plain.meta)delete plain.meta.storageWriteError;
  const raw=JSON.stringify(plain);
  if(raw===mm3LastSavedRaw){
    if(snapshot.meta?.storageWriteError)mm3AllowInternalStateWrite(()=>{delete snapshot.meta.storageWriteError});
    return true;
  }
  if(invalidateAcf)acfForecastCache=null;
  const revision=mm3StorageRevision+1;
  if(mm3Db){
    try{
      await mm3WriteQueue.catch(()=>{});
      try{await mm3DbPutMain(plain,revision)}catch(e){if(e?.name!=='QuotaExceededError')throw e;await mm3TrimRecovery(2);await mm3DbPutMain(plain,revision)}
      mm3StorageRevision=revision;mm3LastSavedRaw=raw;mm3StorageMode='indexeddb';storageErrorToastShown=false;queuePushSummary();
      if(snapshot.meta?.storageWriteError)mm3AllowInternalStateWrite(()=>{delete snapshot.meta.storageWriteError});
      if(mm3LocalMirrorAllowed)try{mm3WriteLocal(raw,revision)}catch(e){console.warn('local fallback mirror unavailable; IndexedDB save succeeded',e);try{localStorage.removeItem(APP_KEY);localStorage.removeItem(MM3_STORAGE_REV_KEY);localStorage.removeItem(MM3_STORAGE_SIG_KEY)}catch(_){}}
      return true
    }catch(e){console.warn('IndexedDB save unavailable; trying local storage',e);try{mm3Db.close()}catch(_){}mm3Db=null;mm3StorageMode='local'}
  }
  if(!mm3LocalMirrorAllowed)throw new Error('破損した旧データの保護が完了せず、保存を停止しました');
  try{mm3WriteLocal(raw,revision);mm3StorageRevision=revision;mm3LastSavedRaw=raw;storageErrorToastShown=false;queuePushSummary();if(snapshot.meta?.storageWriteError)mm3AllowInternalStateWrite(()=>{delete snapshot.meta.storageWriteError});return true}
  catch(e){try{e.__storageWriteError=true}catch(_){}throw e}
}
function safeCommit(mutator,{render=false,label='',skipUnchanged=false,invalidateAcf=true}={}){
  if(mm3PendingAsyncCommit&&commitDepth===0)throw new Error('保存中です。完了後にもう一度お試しください');
  const before=clone(data),outer=commitDepth===0;let result,effects=[];if(outer)commitDeferredEffects=[];commitDepth++;
  try{result=mutator?.();commitDepth=Math.max(0,commitDepth-1);if(outer){if(!skipUnchanged||JSON.stringify(data)!==JSON.stringify(before))save({force:true,invalidateAcf});effects=commitDeferredEffects.splice(0)}}
  catch(e){commitDepth=Math.max(0,commitDepth-1);restoreDataSnapshot(before);if(e?.__storageWriteError)mm3AllowInternalStateWrite(()=>{data.meta={...(data.meta||{}),storageWriteError:true}});if(outer)commitDeferredEffects=[];console.error('commit failed',label,e);showToast('保存できませんでした。入力内容は保持しています',{tone:'error'});throw e}
  if(outer)for(const fn of effects){try{fn()}catch(e){console.error('post-commit effect failed',label,e)}}
  if(render){try{renderAll()}catch(e){console.error('render failed after successful save',label,e);showToast('保存しましたが、画面の更新に失敗しました。再表示してください',{tone:'error'})}}
  return result
}
/** Save a synchronous mutation through IndexedDB before exposing it as complete. */
async function safeCommitAsync(mutator,{render=false,label='',skipUnchanged=false,invalidateAcf=true}={}){
  if(commitDepth>0)throw new Error('非同期コミットを入れ子にできません');
  if(mm3PendingAsyncCommit)throw new Error('保存中です。完了後にもう一度お試しください');
  const before=clone(data);mm3PendingAsyncCommit=true;commitDeferredEffects=[];let result,effects=[];commitDepth++;
  try{
    result=mutator?.();if(result&&typeof result.then==='function')throw new Error('コミット内の処理は同期的に完了してください');
    commitDepth--;
    if(!skipUnchanged||JSON.stringify(data)!==JSON.stringify(before))await saveAsync({snapshot:data,invalidateAcf});
    effects=commitDeferredEffects.splice(0)
  }catch(e){commitDepth=Math.max(0,commitDepth-1);restoreDataSnapshot(before);if(e?.__storageWriteError)mm3AllowInternalStateWrite(()=>{data.meta={...(data.meta||{}),storageWriteError:true}});commitDeferredEffects=[];console.error('async commit failed',label,e);showToast('保存できませんでした。入力内容は保持しています',{tone:'error'});throw e}
  finally{mm3PendingAsyncCommit=false}
  for(const fn of effects){try{fn()}catch(e){console.error('post-commit effect failed',label,e)}}
  if(render){try{renderAll()}catch(e){console.error('render failed after successful save',label,e);showToast('保存しましたが、画面の更新に失敗しました。再表示してください',{tone:'error'})}}
  return result
}
function initialSalaryViewMonth(){
  const current=ym();
  if(current==='2026-09'&&data.meta?.atfSeeded&&
      !data.salaryRecords.some(r=>String(r.date||'').slice(0,7)===current)&&
      data.salaryRecords.some(r=>r.id==='salary_seed_gu_202610'&&r.date==='2026-10-10')&&
      data.salaryRecords.some(r=>r.id==='salary_seed_muji_202610'&&r.date==='2026-10-25'))return '2026-10';
  return current;
}
let activeTab='today',trackingDate=ymd(),currentMonth=ym(),payViewMonth=initialSalaryViewMonth(),assetBillingMonth=ym(),monthPlanEditMode=false,pushStack=[],sheetCleanup=null,goalPlannerState=null,tabScrollPositions={today:0,month:0,pay:0,assets:0,settings:0},sheetDirtyState=false,sheetDragCleanup=null;
let feedbackAudioContext=null,toastTimer=null,lastFeedbackTick=0;
function feedbackSettings(){return {...DEFAULT_DATA.feedbackSettings,...(data.feedbackSettings||{})}}
function feedbackTone(kind='success'){const f=feedbackSettings();if(!f.sound||!window.AudioContext&&!window.webkitAudioContext)return;try{const AC=window.AudioContext||window.webkitAudioContext;feedbackAudioContext=feedbackAudioContext||new AC();const ctx=feedbackAudioContext;if(ctx.state==='suspended')ctx.resume?.();const now=ctx.currentTime,g=ctx.createGain(),o=ctx.createOscillator();o.type='sine';const map={success:[620,.055],approval:[720,.07],commit:[540,.045],sync:[660,.05],warning:[330,.06],error:[210,.08],delete:[260,.05],selection:[420,.025]};const [hz,dur]=map[kind]||map.selection;o.frequency.setValueAtTime(hz,now);if(kind==='success'||kind==='approval')o.frequency.exponentialRampToValueAtTime(hz*1.22,now+dur);g.gain.setValueAtTime(0.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.001,.045*f.volume),now+.008);g.gain.exponentialRampToValueAtTime(.0001,now+dur);o.connect(g);g.connect(ctx.destination);o.start(now);o.stop(now+dur+.01)}catch(e){}}
function feedbackHaptic(pattern=8){const f=feedbackSettings();if(!f.haptic||typeof navigator.vibrate!=='function')return;try{navigator.vibrate(pattern)}catch(e){}}
const feedback={selection(){feedbackHaptic(6)},success(){feedbackTone('success');feedbackHaptic(16)},warning(){feedbackTone('warning');feedbackHaptic([12,24,12])},error(){feedbackTone('error');feedbackHaptic([18,28,18])},delete(){feedbackTone('delete');feedbackHaptic(12)},sliderTick(){const now=performance.now();if(now-lastFeedbackTick<90)return;lastFeedbackTick=now;feedbackHaptic(4)},sliderCommit(){feedbackTone('commit');feedbackHaptic(10)},sync({silent=false}={}){if(!silent){feedbackTone('sync');feedbackHaptic(10)}},approval(){feedbackTone('approval');feedbackHaptic(18)}};
function showToast(message,{actionLabel='',action=null,duration=4600,tone='normal'}={}){const layer=document.getElementById('toastLayer');if(!layer)return;clearTimeout(toastTimer);layer.innerHTML=`<div class="toast ${tone==='error'?'error':''}"><span class="toast-message">${esc(message)}</span>${actionLabel?`<button type="button" class="toast-action">${esc(actionLabel)}</button>`:''}</div>`;const btn=layer.querySelector('.toast-action');if(btn)btn.onclick=()=>{clearTimeout(toastTimer);layer.innerHTML='';try{action?.()}catch(e){console.error(e)}};toastTimer=setTimeout(()=>{layer.innerHTML=''},duration)}
function setButtonSaving(btn,on,label='保存中…'){if(!btn)return;btn.classList.toggle('saving',!!on);btn.disabled=!!on;if(on){btn.__saveText=btn.textContent;btn.textContent=label}else if(btn.__saveText!=null){btn.textContent=btn.__saveText;delete btn.__saveText}}
async function runSaveAction(btn,mutator,{render=true,label='save',success='保存しました',successAction=null,close=null,afterCommit=null,busy=false,busyTitle='記録中…',busySub='保存内容と画面を更新しています'}={}){
 const ownerSheet=btn?.closest?.('#sheet');if(btn?.disabled||ownerSheet?.dataset.commitPending==='true')return false;
 if(ownerSheet)ownerSheet.dataset.commitPending='true';setButtonSaving(btn,true);
 if(busy){busyJobCount++;showBusy(busyTitle,busySub)}
 try{
   // Let the overlay paint before a costly commit or synchronous redraw.
   await new Promise(resolve=>requestAnimationFrame(()=>busy?setTimeout(resolve,36):resolve()));
   try{await safeCommitAsync(mutator,{render:false,label})}catch(e){feedback.error();return false}
   // A render failure must never roll back or retry an already persisted transaction.
   let uiError=null;
   for(const effect of [render?renderAll:null,afterCommit,close])if(typeof effect==='function'){try{effect()}catch(e){uiError=e;console.error('post-commit UI failed',label,e)}}
   if(uiError)showToast('保存しましたが画面を更新できませんでした。再表示してください',{tone:'error'});
   else{feedback.success();showToast(success,successAction||{})}
   return true;
 }finally{
   setButtonSaving(btn,false);if(ownerSheet)delete ownerSheet.dataset.commitPending;
   if(busy&&--busyJobCount===0)hideBusy();
 }
}
function ensureBusyOverlay(){let el=document.getElementById('busyOverlay');if(el)return el;el=document.createElement('div');el.id='busyOverlay';el.className='busy-overlay';el.setAttribute('role','status');el.setAttribute('aria-live','polite');el.innerHTML='<div class="busy-card"><div class="busy-spinner" aria-hidden="true"></div><div class="busy-title" id="busyTitle">計算中…</div><div class="busy-sub" id="busySub">お金の流れを確認しています</div></div>';document.body.appendChild(el);return el}
function showBusy(title='計算中…',sub='お金の流れを確認しています'){const el=ensureBusyOverlay();el.querySelector('#busyTitle').textContent=title;el.querySelector('#busySub').textContent=sub;el.classList.add('show');return el}
function hideBusy(){document.getElementById('busyOverlay')?.classList.remove('show')}
let busyJobCount=0;
function runWithBusy(fn,{title='ACFを計算中…',sub='給与・カード・固定支払いを確認しています'}={}){
  busyJobCount++;showBusy(title,sub);
  return new Promise((resolve,reject)=>requestAnimationFrame(()=>setTimeout(()=>{
    try{resolve(fn())}catch(error){reject(error)}finally{if(--busyJobCount===0)hideBusy()}
  },36)));
}
function installLongPress(el,onLong,{delay=600,moveTolerance=10,feedbackOn=true}={}){if(!el)return()=>{};let timer=null,longPressed=false,sx=0,sy=0;const clear=()=>{if(timer){clearTimeout(timer);timer=null}};const down=e=>{longPressed=false;el.__longPressed=false;sx=e.clientX;sy=e.clientY;clear();timer=setTimeout(()=>{timer=null;longPressed=true;el.__longPressed=true;if(feedbackOn)feedback.selection();onLong?.(e)},delay)};const move=e=>{if(timer&&(Math.abs(e.clientX-sx)>moveTolerance||Math.abs(e.clientY-sy)>moveTolerance))clear()};const suppress=e=>{if(longPressed||el.__longPressed){e.preventDefault();e.stopImmediatePropagation();longPressed=false;el.__longPressed=false}};el.addEventListener('pointerdown',down);el.addEventListener('pointermove',move);el.addEventListener('pointerup',clear);el.addEventListener('pointercancel',clear);el.addEventListener('pointerleave',clear);el.addEventListener('click',suppress,true);el.addEventListener('contextmenu',e=>e.preventDefault());el.addEventListener('selectstart',e=>e.preventDefault());return()=>{clear();el.removeEventListener('pointerdown',down);el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',clear);el.removeEventListener('pointercancel',clear);el.removeEventListener('pointerleave',clear);el.removeEventListener('click',suppress,true)}}

