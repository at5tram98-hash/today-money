/* Storage v1: one unchanged data object and bounded recovery copies in IndexedDB. */
const MM3_STORAGE_DB='myMoney3_storage_v1',MM3_STORAGE_REV_KEY=`${APP_KEY}_storageRevision`,MM3_STORAGE_SIG_KEY=`${APP_KEY}_storageSignature`;
let mm3Db=null,mm3StorageRevision=0,mm3StorageMode='local',mm3WriteQueue=Promise.resolve(),mm3PendingAsyncCommit=false,mm3LocalMirrorAllowed=true,mm3LastSavedRaw='';
function mm3StorageSignature(raw){let hash=2166136261;for(let i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619)}return String(hash>>>0)}
function mm3OpenDatabase(){return new Promise((resolve,reject)=>{
  if(!globalThis.indexedDB)return reject(new Error('IndexedDB unavailable'));
  const req=indexedDB.open(MM3_STORAGE_DB,1);let finished=false;
  const timeout=setTimeout(()=>finish(new Error('IndexedDB opening timed out')),4500);
  function finish(error,db){if(finished){db?.close?.();return}finished=true;clearTimeout(timeout);error?reject(error):resolve(db)}
  req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('state'))db.createObjectStore('state');if(!db.objectStoreNames.contains('recovery'))db.createObjectStore('recovery')};
  req.onerror=()=>finish(req.error||new Error('IndexedDB opening failed'));
  req.onblocked=()=>finish(new Error('IndexedDB upgrade blocked'));
  req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();if(mm3Db===db){mm3Db=null;mm3StorageMode='local'}};finish(null,db)};
})}
function mm3DbRequest(storeName,mode,operation){return new Promise((resolve,reject)=>{
  if(!mm3Db)return reject(new Error('IndexedDB unavailable'));
  let tx,result;try{tx=mm3Db.transaction(storeName,mode);const request=operation(tx.objectStore(storeName));if(request)request.onsuccess=()=>{result=request.result};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||new Error('IndexedDB transaction failed'));tx.onabort=()=>reject(tx.error||new Error('IndexedDB transaction aborted'))}catch(e){try{tx?.abort()}catch(_){}reject(e)}
})}
function mm3DbPutMain(snapshot,revision){return mm3DbRequest('state','readwrite',store=>store.put({data:snapshot,revision,savedAt:new Date().toISOString()},'main'))}
function mm3WriteLocal(raw,revision){const previous=localStorage.getItem(APP_KEY),previousRevision=localStorage.getItem(MM3_STORAGE_REV_KEY),previousSignature=localStorage.getItem(MM3_STORAGE_SIG_KEY);try{
  localStorage.setItem(APP_KEY,raw);localStorage.setItem(MM3_STORAGE_REV_KEY,String(revision));localStorage.setItem(MM3_STORAGE_SIG_KEY,mm3StorageSignature(raw))
}catch(e){try{previous==null?localStorage.removeItem(APP_KEY):localStorage.setItem(APP_KEY,previous);previousRevision==null?localStorage.removeItem(MM3_STORAGE_REV_KEY):localStorage.setItem(MM3_STORAGE_REV_KEY,previousRevision);previousSignature==null?localStorage.removeItem(MM3_STORAGE_SIG_KEY):localStorage.setItem(MM3_STORAGE_SIG_KEY,previousSignature)}catch(restoreError){console.error('local fallback restore failed',restoreError)}throw e}}
async function mm3RecoveryRows(){if(!mm3Db)return[];return(await mm3DbRequest('recovery','readonly',store=>store.getAll())||[]).sort((a,b)=>String(b.id).localeCompare(String(a.id)))}
async function mm3TrimRecovery(keep=3){if(!mm3Db)return;const obsolete=(await mm3RecoveryRows()).slice(keep).map(x=>x.id);if(obsolete.length)await mm3DbRequest('recovery','readwrite',store=>{for(const id of obsolete)store.delete(id)})}
async function writeRecoverySnapshotAsync(label,payload){const raw=typeof payload==='string'?payload:JSON.stringify(payload),stamp=new Date().toISOString().replace(/[:.]/g,'-'),id=`${RECOVERY_KEY_PREFIX}${stamp}_${Math.random().toString(36).slice(2,8)}_${String(label||'snapshot').replace(/[^a-z0-9_-]/gi,'_')}`;
  if(mm3Db){try{await mm3DbRequest('recovery','readwrite',store=>store.put({id,raw,createdAt:new Date().toISOString(),label},id));await mm3TrimRecovery();return id}catch(e){console.warn('IndexedDB recovery snapshot failed; trying local storage',e)}}
  const key=writeRecoverySnapshot(label,raw);if(!key)throw new Error('復旧用コピーを保存できませんでした');return key
}
async function mm3RecoveryList(){
  let records=[];try{records=await mm3RecoveryRows()}catch(e){console.warn('recovery list unavailable',e)}
  const seen=new Set(records.map(x=>x.id));
  for(const id of storageRecoveryKeys())if(!seen.has(id))records.push({id,raw:null,legacy:true});
  return records.sort((a,b)=>String(b.id).localeCompare(String(a.id)))
}
async function mm3ClearRecovery(){
  if(mm3Db)await mm3DbRequest('recovery','readwrite',store=>store.clear());
  for(const key of storageRecoveryKeys())localStorage.removeItem(key)
}
async function mm3MigrateRecovery(){if(!mm3Db)return;for(const key of storageRecoveryKeys()){
  let raw='';try{raw=localStorage.getItem(key)||''}catch(e){continue}if(!raw)continue;
  try{await mm3DbRequest('recovery','readwrite',store=>store.put({id:key,raw,createdAt:new Date().toISOString(),label:'legacy'},key));localStorage.removeItem(key)}catch(e){console.warn('recovery migration postponed',e)}
}await mm3TrimRecovery()}
async function loadDataAsync(){let localRaw='',localRecord=null,localRevision=0,idbRecord=null,recoveryProtected=true,corruptedSource=false,untrackedLocal=false;
  try{localRaw=localStorage.getItem(APP_KEY)||'';localRevision=Number(localStorage.getItem(MM3_STORAGE_REV_KEY))||0;const signature=localStorage.getItem(MM3_STORAGE_SIG_KEY);untrackedLocal=!!(localRaw&&signature&&signature!==mm3StorageSignature(localRaw));if(localRaw){const parsed=JSON.parse(localRaw);if(!validateStoredShape(parsed).ok)throw new Error('Invalid local data shape');localRecord=parsed}}catch(e){console.warn('local data unavailable',e)}
  try{mm3Db=await mm3OpenDatabase();mm3StorageMode='indexeddb';idbRecord=await mm3DbRequest('state','readonly',store=>store.get('main'))}catch(e){console.warn('IndexedDB unavailable; using local storage',e);try{mm3Db?.close()}catch(_){}mm3Db=null;mm3StorageMode='local'}
  if(localRaw&&!localRecord){corruptedSource=true;try{await writeRecoverySnapshotAsync('load_failure',localRaw)}catch(e){recoveryProtected=false;mm3LocalMirrorAllowed=false;console.error('corrupt local data could not be protected',e)}}
  if(idbRecord?.data&&!validateStoredShape(idbRecord.data).ok){corruptedSource=true;try{await writeRecoverySnapshotAsync('idb_load_failure',idbRecord.data)}catch(e){recoveryProtected=false;console.error('corrupt IndexedDB data could not be protected',e);mm3Db=null;mm3StorageMode='local'}idbRecord=null}
  if(untrackedLocal&&localRecord&&idbRecord?.data)try{await writeRecoverySnapshotAsync('before_legacy_local',idbRecord.data)}catch(e){console.error('prior IndexedDB version could not be protected',e);mm3Db=null;mm3StorageMode='local'}
  const dbRevision=Number(idbRecord?.revision)||0,chooseDb=!!idbRecord?.data&&!untrackedLocal&&(!localRecord||dbRevision>localRevision||dbRevision===localRevision&&dbRevision>0);
  const source=chooseDb?idbRecord.data:localRecord;
  mm3StorageRevision=Math.max(localRevision,dbRevision);
  if(mm3Db){try{await mm3MigrateRecovery()}catch(e){console.warn('recovery migration postponed',e)}}
  let loaded;
  if(source)loaded=prepareLoadedData(source,{applySeed:true,allowLegacy:true});
  else{loaded=prepareLoadedData({},{applySeed:true,allowLegacy:true});if(corruptedSource){loaded.meta.loadRecovery=true;loaded.notices.push({id:uid('notice'),title:'保存データを読み込めませんでした',detail:recoveryProtected?'復旧用データを確認してください。':'元データを保護できませんでした。旧データは上書きせず保持しています。',tone:'warning',read:false,createdAt:new Date().toISOString()})}}
  if(mm3Db&&!chooseDb&&source){try{await mm3DbPutMain(JSON.parse(JSON.stringify(loaded)),mm3StorageRevision)}catch(e){console.warn('IndexedDB migration postponed; using local storage',e);mm3Db=null;mm3StorageMode='local'}}
  // Only a confirmed durable copy may suppress a subsequent identical boot save.
  mm3LastSavedRaw=mm3Db?(chooseDb?JSON.stringify(idbRecord.data):source?JSON.stringify(loaded):''):localRecord?JSON.stringify(localRecord):'';
  return loaded
}
const mm3BootLayer=document.createElement('div');mm3BootLayer.id='mm3StorageBoot';mm3BootLayer.setAttribute('role','status');mm3BootLayer.style.cssText='position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:var(--bg,#f5f5f7);color:var(--text,#111);font:600 16px -apple-system,BlinkMacSystemFont,sans-serif';mm3BootLayer.textContent='データを読み込んでいます…';document.body.appendChild(mm3BootLayer);
