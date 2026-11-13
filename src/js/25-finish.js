try{await saveAsync({snapshot:data})}catch(e){console.warn('initial persistence unavailable',e);data.meta={...(data.meta||{}),storageWriteError:true}}
updateBootMessage('画面を準備しています…','集計結果を画面に反映しています');
renderAll();void initializeWebPush();renderLock();initializeTabIndicator();
await waitForUiPaint();const bootRemaining=700-(performance.now()-mm3BootStarted);if(bootRemaining>0)await new Promise(resolve=>setTimeout(resolve,bootRemaining));await waitForUiPaint();try{maybeOpenShiftImportFromUrl()}catch(e){}try{applyStartupPrefs()}catch(e){console.warn('startup prefs',e)}mm3BootLayer.classList.add('done');mm3BootLayer.setAttribute('aria-hidden','true');setTimeout(()=>mm3BootLayer.remove(),matchMedia('(prefers-reduced-motion:reduce)').matches?0:300);
function appMaintenance(){
  try{const noticesChanged=pruneExpiredSystemNotices(),journalChanged=pruneDayClosingJournal();if(noticesChanged||journalChanged)renderAll()}catch(e){console.error('app maintenance failed',e)}
  queuePushSummary();maybeAutoSyncGmail(false);
}
setTimeout(()=>maybeAutoSyncGmail(true),1800);setTimeout(()=>{try{maybeAutoSyncShifts()}catch(e){}},2600);setInterval(appMaintenance,60000);
try{const stateGuardMode=new URLSearchParams(location.search).get('mm3StateGuard');if(['warn','throw'].includes(stateGuardMode))enableMM3StateGuard(stateGuardMode)}catch(e){console.warn('state write guard unavailable',e)}
