/* === My Money 3.0 Phase 4: Motion / Gesture / Unified final polish === */
const MM3_UI_PREFS_KEY='mymoney3_ui_prefs_v1';
function mm3MotionReduced(){return matchMedia('(prefers-reduced-motion: reduce)').matches||data.feedbackSettings?.motion===false||document.documentElement.classList.contains('motion-off')}
function mm3LoadUiPrefs(){try{return JSON.parse(localStorage.getItem(MM3_UI_PREFS_KEY)||'{}')||{}}catch(e){return{}}}
function mm3SaveUiPrefs(patch={}){try{const next={...mm3LoadUiPrefs(),...patch};localStorage.setItem(MM3_UI_PREFS_KEY,JSON.stringify(next));return next}catch(e){return mm3LoadUiPrefs()}}
const mm3UiPrefs=mm3LoadUiPrefs();
if(['share','trend'].includes(mm3UiPrefs.salaryChartMode))mm3SalaryChartMode=mm3UiPrefs.salaryChartMode;
if(['1M','3M','6M','1Y','ALL'].includes(mm3UiPrefs.salaryTrendRange))mm3SalaryTrendRange=mm3UiPrefs.salaryTrendRange;
if(['actual','forecast'].includes(mm3UiPrefs.assetChartMode))mm3AssetChartMode=mm3UiPrefs.assetChartMode;
if(['1W','1M','3M','6M','1Y','ALL'].includes(mm3UiPrefs.assetChartRange))mm3AssetChartRange=mm3UiPrefs.assetChartRange;
if(['balance-desc','balance-asc','updated','name','manual'].includes(mm3UiPrefs.assetSortMode))mm3AssetSortMode=mm3UiPrefs.assetSortMode;


/* UI-20260917: month changes commit once; canceled gestures keep the current month. */
function mm3MonthTransition(root,dir,commit){
  if(!root||typeof commit!=='function'||root._nativeMonthBusy)return;
  const shell=root.querySelector('.mm3-salary-shell,.mm3-payment-shell');
  if(!shell||mm3MotionReduced()||typeof shell.animate!=='function'){commit();return}
  root._nativeMonthBusy=true;
  const out=shell.animate([{opacity:1,transform:'translateX(0)'},{opacity:.35,transform:`translateX(${dir>0?-12:12}px)`}],{duration:120,easing:'ease-out',fill:'forwards'});
  out.finished.then(async()=>{if(!shell.isConnected)return;out.cancel();await commit();const fresh=root.querySelector('.mm3-salary-shell,.mm3-payment-shell');fresh?.animate([{opacity:.5,transform:`translateX(${dir>0?12:-12}px)`},{opacity:1,transform:'translateX(0)'}],{duration:190,easing:'ease-out'})}).catch(error=>{console.error('Month transition failed',error)}).finally(()=>{root._nativeMonthBusy=false})
}
function mm3InstallMonthSwipe(root,commit){
  if(!root)return;root._mm3MonthSwipeCleanup?.();
  let gesture=null,shell=null,suppressUntil=0;
  const reset=()=>{if(shell){shell.style.transform='';shell.style.opacity='';shell.classList.remove('mm3-month-gesture')}shell=null};
  const cancel=()=>{const id=gesture?.id;gesture=null;try{if(id!=null&&root.hasPointerCapture?.(id))root.releasePointerCapture(id)}catch(_){}reset()};
  const down=e=>{if(e.isPrimary===false||e.button>0||root._nativeMonthBusy)return;cancel();if(e.target.closest('button,input,select,textarea,a,[role=slider],.mm3-atf-chart,.mm3-salary-trend')||e.clientX-root.getBoundingClientRect().left<28)return;gesture={id:e.pointerId,x:e.clientX,y:e.clientY,at:performance.now(),horizontal:false};shell=root.querySelector('.mm3-salary-shell,.mm3-payment-shell')};
  const move=e=>{if(!gesture||e.pointerId!==gesture.id)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(!gesture.horizontal){if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)*1.12){cancel();return}if(Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.1){gesture.horizontal=true;root.setPointerCapture?.(e.pointerId)}}if(!gesture.horizontal)return;e.preventDefault();if(shell&&!mm3MotionReduced()){shell.classList.add('mm3-month-gesture');shell.style.transform=`translateX(${Math.max(-15,Math.min(15,dx*.16))}px)`;shell.style.opacity=String(Math.max(.8,1-Math.abs(dx)/700))}};
  const end=e=>{if(!gesture||e.pointerId!==gesture.id)return;const dx=e.clientX-gesture.x,dt=Math.max(1,performance.now()-gesture.at),go=gesture.horizontal&&(Math.abs(dx)>54||(Math.abs(dx)>24&&Math.abs(dx)/dt>.62));cancel();if(go){suppressUntil=Date.now()+400;e.preventDefault();feedback.selection?.();mm3MonthTransition(root,dx<0?1:-1,()=>commit(dx<0?1:-1))}};
  const click=e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation()}};
  root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move,{passive:false});root.addEventListener('pointerup',end);root.addEventListener('pointercancel',cancel);root.addEventListener('click',click,true);
  root._mm3MonthSwipeCleanup=()=>{cancel();root.removeEventListener('pointerdown',down);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',end);root.removeEventListener('pointercancel',cancel);root.removeEventListener('click',click,true)}
}

function mm3BindSalaryTrendScrub(){
  const root=document.querySelector('#screen-pay .mm3-salary-trend');if(!root||root.dataset.mm3Scrub==='1')return;root.dataset.mm3Scrub='1';
  const months=mm3SalaryRangeMonths(payViewMonth,mm3SalaryTrendRange),points=months.map(m=>({month:m,value:mm3SalaryMonthSummary(m).total}));if(points.length<2)return;
  root.insertAdjacentHTML('beforeend','<i class="mm3-salary-scrub-guide"></i><i class="mm3-salary-scrub-dot"></i><div class="mm3-salary-scrub-tip"></div>');
  const guide=root.querySelector('.mm3-salary-scrub-guide'),dot=root.querySelector('.mm3-salary-scrub-dot'),tip=root.querySelector('.mm3-salary-scrub-tip'),svg=root.querySelector('svg');
  const vals=points.map(p=>p.value),max=Math.max(1,...vals),min=Math.min(0,...vals),range=Math.max(1,max-min);let active=false,last=-1;
  const update=e=>{const r=svg.getBoundingClientRect(),x=Math.max(0,Math.min(r.width,e.clientX-r.left)),idx=Math.min(points.length-1,Math.max(0,Math.round(x/Math.max(1,r.width)*(points.length-1)))),p=points[idx],pct=points.length===1?0:idx/(points.length-1),yPct=(9+(max-p.value)/range*(132-9-24))/132;guide.style.left=`${pct*100}%`;dot.style.left=`${pct*100}%`;dot.style.top=`${Math.max(7,Math.min(89,yPct*100))}%`;tip.style.left=`${Math.max(13,Math.min(87,pct*100))}%`;tip.innerHTML=`${esc(monthLabel(p.month))}<strong>${yen(p.value)}</strong>`;if(idx!==last){last=idx;feedback?.selection?.()}root.classList.add('scrubbing')};
  root.addEventListener('pointerdown',e=>{if(e.target.closest('button,[role=button],a,input,select,textarea'))return;active=true;last=-1;root.setPointerCapture?.(e.pointerId);update(e)});root.addEventListener('pointermove',e=>{if(active)update(e)});const finish=()=>{active=false;last=-1;root.classList.remove('scrubbing')};root.addEventListener('pointerup',finish);root.addEventListener('pointercancel',finish);root.addEventListener('lostpointercapture',finish)
}

function mm3BindSalaryTrendRange(){document.querySelectorAll('[data-mm3-salary-range]').forEach(b=>b.onclick=()=>{mm3SalaryTrendRange=b.dataset.mm3SalaryRange;feedback?.selection?.();mm3RefreshSalaryViz()})}
const __mm3P4BindSalaryTrendRange=mm3BindSalaryTrendRange;
mm3BindSalaryTrendRange=function(){
  __mm3P4BindSalaryTrendRange();document.querySelectorAll('[data-mm3-salary-range]').forEach(b=>{const old=b.onclick;b.onclick=()=>{old?.();mm3SaveUiPrefs({salaryTrendRange:mm3SalaryTrendRange});requestAnimationFrame(mm3BindSalaryTrendScrub)}});requestAnimationFrame(mm3BindSalaryTrendScrub)
};
const __mm3P4BindSalaryHome=bindSalaryHome;
bindSalaryHome=function(){
  __mm3P4BindSalaryHome();
  const vizMenu=document.getElementById('mm3SalaryVizMenu');if(vizMenu)vizMenu.onclick=e=>openMenu(e.currentTarget,[{label:`${mm3SalaryChartMode==='share'?'✓ ':''}勤務先別`,icon:mm3SalaryChartMode==='share'?'check':'chart',action:()=>{mm3SalaryChartMode='share';mm3SaveUiPrefs({salaryChartMode:mm3SalaryChartMode});feedback?.selection?.();mm3RefreshSalaryViz()}},{label:`${mm3SalaryChartMode==='trend'?'✓ ':''}給与推移`,icon:mm3SalaryChartMode==='trend'?'check':'chart',action:()=>{mm3SalaryChartMode='trend';mm3SaveUiPrefs({salaryChartMode:mm3SalaryChartMode});feedback?.selection?.();mm3RefreshSalaryViz();requestAnimationFrame(mm3BindSalaryTrendScrub)}}]);
  mm3InstallMonthSwipe(document.getElementById('payContent'),dir=>changeSalaryMonth(addMonths(payViewMonth,dir)));requestAnimationFrame(mm3BindSalaryTrendScrub)
};

const __mm3P4BindPayments=bindPayments;
bindPayments=function(){__mm3P4BindPayments();mm3InstallMonthSwipe(document.getElementById('paymentsContent'),dir=>{assetBillingMonth=addMonths(paymentHomeMonth(),dir);renderPayments()})};

let mm3AssetSuppressClickUntil=0;
function mm3AssetManualOrder(){const p=mm3LoadUiPrefs(),saved=Array.isArray(p.assetManualOrder)?p.assetManualOrder:[],ids=data.banks.map(b=>b.id);return [...saved.filter(id=>ids.includes(id)),...ids.filter(id=>!saved.includes(id))]}
function mm3AssetSortedBanks(){
  const banks=[...data.banks];
  if(mm3AssetSortMode==='balance-asc')banks.sort((a,b)=>(Number(a.balance)||0)-(Number(b.balance)||0));
  else if(mm3AssetSortMode==='updated')banks.sort((a,b)=>String(b.balanceAsOf||'').localeCompare(String(a.balanceAsOf||''))||String(a.name).localeCompare(String(b.name),'ja'));
  else if(mm3AssetSortMode==='name')banks.sort((a,b)=>String(a.name).localeCompare(String(b.name),'ja'));
  else banks.sort((a,b)=>(Number(b.balance)||0)-(Number(a.balance)||0));
  return banks
}
const __mm3P4AssetSortedBanks=mm3AssetSortedBanks;
mm3AssetSortedBanks=function(){if(mm3AssetSortMode!=='manual')return __mm3P4AssetSortedBanks();const map=new Map(data.banks.map(b=>[b.id,b]));return mm3AssetManualOrder().map(id=>map.get(id)).filter(Boolean)};
function mm3AssetSortLabel(){return({"balance-desc":'残高順 ↓',"balance-asc":'残高順 ↑',updated:'更新順',name:'名前順'})[mm3AssetSortMode]||'残高順 ↓'}
const __mm3P4AssetSortLabel=mm3AssetSortLabel;
mm3AssetSortLabel=function(){return mm3AssetSortMode==='manual'?'手動':__mm3P4AssetSortLabel()};

function mm3AssetExitManualMode(){
  const list=document.getElementById('mm3AssetWatchlist');if(!list)return;if(list._mm3ManualCleanup)list._mm3ManualCleanup();list._mm3ManualCleanup=null;list.classList.remove('mm3-assets-manual');list.querySelectorAll('.mm3-assets-reorder-handle').forEach(x=>x.remove());document.querySelector('#screen-assets .mm3-assets-manual-hint')?.remove()
}
function mm3FlipRows(list,rows,before){if(mm3MotionReduced())return;requestAnimationFrame(()=>rows.forEach(r=>{const a=before.get(r),b=r.getBoundingClientRect();if(!a)return;const dy=a.top-b.top;if(Math.abs(dy)>.5)r.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:300,easing:'cubic-bezier(.2,.85,.2,1)'})}))}
function mm3AssetInstallManualReorder(){
  const list=document.getElementById('mm3AssetWatchlist');if(!list||mm3AssetSortMode!=='manual')return;mm3AssetExitManualMode();list.classList.add('mm3-assets-manual');
  const head=list.previousElementSibling;if(head?.classList.contains('mm3-assets-section-head')&&!document.querySelector('#screen-assets .mm3-assets-manual-hint'))head.insertAdjacentHTML('afterend','<div class="mm3-assets-manual-hint">口座を長押しして、そのまま上下に動かすと並べ替えられます。</div>');
  [...list.querySelectorAll('.mm3-assets-watchrow')].forEach(row=>row.insertAdjacentHTML('afterbegin','<span class="mm3-assets-reorder-handle" aria-hidden="true">•••</span>'));
  let state=null,timer=null,placeholder=null,dragRect=null;
  const clearTimer=()=>{if(timer){clearTimeout(timer);timer=null}};
  const cleanupRow=row=>{if(!row)return;row.classList.remove('mm3-assets-dragging');for(const k of ['position','left','top','width','height','zIndex','margin','transform'])row.style[k]=''};
  const begin=()=>{if(!state?.row)return;const row=state.row;dragRect=row.getBoundingClientRect();placeholder=document.createElement('div');placeholder.className='mm3-assets-reorder-placeholder';placeholder.style.height=dragRect.height+'px';list.insertBefore(placeholder,row);row.classList.add('mm3-assets-dragging');Object.assign(row.style,{position:'fixed',left:dragRect.left+'px',top:dragRect.top+'px',width:dragRect.width+'px',height:dragRect.height+'px',zIndex:'999',margin:'0'});state.active=true;mm3AssetSuppressClickUntil=Date.now()+800;feedback?.selection?.()};
  const down=e=>{if(e.button!=null&&e.button!==0)return;const row=e.target.closest('.mm3-assets-watchrow');if(!row||!list.contains(row))return;clearTimer();state={row,pid:e.pointerId,sx:e.clientX,sy:e.clientY,lastY:e.clientY,active:false};timer=setTimeout(begin,280)};
  const move=e=>{if(!state||e.pointerId!==state.pid)return;state.lastY=e.clientY;const dx=e.clientX-state.sx,dy=e.clientY-state.sy;if(!state.active){if(Math.hypot(dx,dy)>10){clearTimer();state=null}return}e.preventDefault();state.row.style.top=(dragRect.top+dy)+'px';const others=[...list.querySelectorAll('.mm3-assets-watchrow')].filter(r=>r!==state.row),before=new Map(others.map(r=>[r,r.getBoundingClientRect()]));let target=null;for(const r of others){const rr=r.getBoundingClientRect();if(e.clientY<rr.top+rr.height/2){target=r;break}}const oldNext=placeholder?.nextElementSibling;if(target)list.insertBefore(placeholder,target);else list.appendChild(placeholder);if(placeholder?.nextElementSibling!==oldNext)mm3FlipRows(list,others,before)};
  const end=e=>{clearTimer();if(!state)return;const row=state.row,wasActive=state.active;state=null;if(!wasActive){placeholder?.remove();placeholder=null;return}if(placeholder?.parentNode)placeholder.parentNode.insertBefore(row,placeholder);placeholder?.remove();placeholder=null;cleanupRow(row);const order=[...list.querySelectorAll('.mm3-assets-watchrow')].map(r=>r.dataset.bank).filter(Boolean);mm3SaveUiPrefs({assetManualOrder:order,assetSortMode:'manual'});mm3AssetSuppressClickUntil=Date.now()+500;feedback?.success?.()};
  const clickCapture=e=>{if(mm3AssetSortMode==='manual'){e.preventDefault();e.stopImmediatePropagation()}};
  list.addEventListener('pointerdown',down);list.addEventListener('pointermove',move,{passive:false});list.addEventListener('pointerup',end);list.addEventListener('pointercancel',end);list.addEventListener('click',clickCapture,true);
  list._mm3ManualCleanup=()=>{clearTimer();if(state?.row)cleanupRow(state.row);placeholder?.remove();placeholder=null;state=null;list.removeEventListener('pointerdown',down);list.removeEventListener('pointermove',move);list.removeEventListener('pointerup',end);list.removeEventListener('pointercancel',end);list.removeEventListener('click',clickCapture,true)}
}
function mm3AssetApplySort(mode){
  mm3AssetSortMode=mode;const list=document.getElementById('mm3AssetWatchlist');if(!list)return renderAssets();
  const rows=[...list.querySelectorAll('.mm3-assets-watchrow')],before=new Map(rows.map(r=>[r,r.getBoundingClientRect()])),order=mm3AssetSortedBanks().map(b=>b.id),map=new Map(rows.map(r=>[r.dataset.bank,r]));order.forEach(id=>{const row=map.get(id);if(row)list.appendChild(row)});const reduce=matchMedia('(prefers-reduced-motion:reduce)').matches||document.documentElement.classList.contains('motion-off');if(!reduce)requestAnimationFrame(()=>{rows.forEach(r=>{const first=before.get(r),last=r.getBoundingClientRect(),dy=first.top-last.top;if(Math.abs(dy)>.5)r.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:360,easing:'cubic-bezier(.2,.85,.2,1)'})})});const btn=document.getElementById('mm3AssetSort');if(btn)btn.innerHTML=`${mm3AssetSortLabel()} ${icon('chevronDown')}`;feedback?.selection?.()
}
const __mm3P4AssetApplySort=mm3AssetApplySort;
mm3AssetApplySort=function(mode){
  if(mode==='manual'){
    const prefs=mm3LoadUiPrefs(),hasSaved=Array.isArray(prefs.assetManualOrder)&&prefs.assetManualOrder.length;
    if(!hasSaved){const current=[...document.querySelectorAll('#mm3AssetWatchlist .mm3-assets-watchrow')].map(r=>r.dataset.bank).filter(Boolean);if(current.length)mm3SaveUiPrefs({assetManualOrder:current})}
  }else mm3AssetExitManualMode();
  __mm3P4AssetApplySort(mode);mm3SaveUiPrefs({assetSortMode:mode});if(mode==='manual')requestAnimationFrame(mm3AssetInstallManualReorder)
};

function mm3BindAssetChart(){
  document.querySelectorAll('#screen-assets [data-mm3-asset-range]').forEach(b=>b.onclick=()=>{mm3AssetChartRange=b.dataset.mm3AssetRange;feedback?.selection?.();mm3RefreshAssetChartMaybeBusy()});
  const root=document.getElementById('mm3AssetChart'),state=mm3AssetChartState;if(!root||!state?.points?.length||state.points.length<2)return;
  const svg=root.querySelector('svg'),guide=root.querySelector('[data-mm3-assets-guide]'),dot=root.querySelector('[data-mm3-assets-selected]'),tip=root.querySelector('[data-mm3-assets-tooltip]'),model=mm3AssetChartModel(state.points);let active=false,last=-1;
  const update=e=>{const rect=svg.getBoundingClientRect(),vx=Math.max(0,Math.min(model.w,(e.clientX-rect.left)/Math.max(1,rect.width)*model.w)),idx=model.points.reduce((best,p,i)=>Math.abs(p.x-vx)<Math.abs(model.points[best].x-vx)?i:best,0),p=model.points[idx];guide.setAttribute('x1',p.x);guide.setAttribute('x2',p.x);dot.setAttribute('cx',p.x);dot.setAttribute('cy',p.y);tip.style.left=`${Math.max(14,Math.min(86,p.x/model.w*100))}%`;const ev=state.mode==='forecast'?mm3AtfRowEvents(p.row)[0]:null;tip.innerHTML=`${esc(dayLabel(p.date))}<strong>${yen(p.value)}</strong>${ev?`<small>${esc(ev.label)} ${Number(ev.amount)>0?'+':''}${yen(Number(ev.amount)||0)}</small>`:''}`;if(idx!==last){last=idx;feedback?.selection?.()}root.classList.add('scrubbing')};
  root.addEventListener('pointerdown',e=>{active=true;last=-1;root.setPointerCapture?.(e.pointerId);update(e)});root.addEventListener('pointermove',e=>{if(active)update(e)});const end=()=>{active=false;last=-1;root.classList.remove('scrubbing')};root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);root.addEventListener('lostpointercapture',end)
}
const __mm3P4BindAssetChart=mm3BindAssetChart;
mm3BindAssetChart=function(){
  __mm3P4BindAssetChart();document.querySelectorAll('#screen-assets [data-mm3-asset-range]').forEach(b=>{const old=b.onclick;b.onclick=()=>{old?.();mm3SaveUiPrefs({assetChartRange:mm3AssetChartRange})}})
};
const __mm3P4BindAssets=mm3BindAssets;
mm3BindAssets=function(){
  __mm3P4BindAssets();
  const mode=document.getElementById('mm3AssetMode');if(mode)mode.onclick=e=>openMenu(e.currentTarget,[{label:`${mm3AssetChartMode==='actual'?'✓ ':''}実績`,icon:mm3AssetChartMode==='actual'?'check':'chart',action:()=>{mm3AssetChartMode='actual';mm3SaveUiPrefs({assetChartMode:mm3AssetChartMode});feedback?.selection?.();mode.innerHTML=`実績 ${icon('chevronDown')}`;mm3RefreshAssetChart()}},{label:`${mm3AssetChartMode==='forecast'?'✓ ':''}ATF予測`,icon:mm3AssetChartMode==='forecast'?'check':'chart',action:()=>{mm3AssetChartMode='forecast';if(mm3AssetChartRange==='ALL')mm3AssetChartRange='1Y';mm3SaveUiPrefs({assetChartMode:mm3AssetChartMode,assetChartRange:mm3AssetChartRange});feedback?.selection?.();mode.innerHTML=`ATF予測 ${icon('chevronDown')}`;mm3RefreshAssetChartMaybeBusy()}}]);
  const sort=document.getElementById('mm3AssetSort');if(sort)sort.onclick=e=>openMenu(e.currentTarget,[{label:`${mm3AssetSortMode==='balance-desc'?'✓ ':''}残高が多い順`,icon:mm3AssetSortMode==='balance-desc'?'check':'list',action:()=>mm3AssetApplySort('balance-desc')},{label:`${mm3AssetSortMode==='balance-asc'?'✓ ':''}残高が少ない順`,icon:mm3AssetSortMode==='balance-asc'?'check':'list',action:()=>mm3AssetApplySort('balance-asc')},{label:`${mm3AssetSortMode==='updated'?'✓ ':''}更新が新しい順`,icon:mm3AssetSortMode==='updated'?'check':'calendar',action:()=>mm3AssetApplySort('updated')},{label:`${mm3AssetSortMode==='name'?'✓ ':''}名前順`,icon:mm3AssetSortMode==='name'?'check':'list',action:()=>mm3AssetApplySort('name')},{label:`${mm3AssetSortMode==='manual'?'✓ ':''}手動`,icon:mm3AssetSortMode==='manual'?'check':'menu',action:()=>mm3AssetApplySort('manual')}]);
  document.querySelectorAll('#screen-assets [data-bank]').forEach(b=>b.onclick=()=>{if(Date.now()<mm3AssetSuppressClickUntil||mm3AssetSortMode==='manual')return;openBankDetail(b.dataset.bank)});
  if(mm3AssetSortMode==='manual')requestAnimationFrame(mm3AssetInstallManualReorder)
};


/* Keep the already-stable Push, interactive-back and Sheet systems intact. Phase 4 only reuses them. */
/* === end My Money 3.0 Phase 4 === */



