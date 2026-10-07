try{await saveAsync({snapshot:data})}catch(e){console.warn('initial persistence unavailable',e);data.meta={...(data.meta||{}),storageWriteError:true}}
renderAll();renderLock();initializeTabIndicator();mm3BootLayer.remove();
setTimeout(()=>maybeAutoSyncGmail(true),1800);setInterval(()=>maybeAutoSyncGmail(false),60000);
try{const stateGuardMode=new URLSearchParams(location.search).get('mm3StateGuard');if(['warn','throw'].includes(stateGuardMode))enableMM3StateGuard(stateGuardMode)}catch(e){console.warn('state write guard unavailable',e)}
