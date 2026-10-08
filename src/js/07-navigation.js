function applyAppearance(){const a=data.appearance||'system',dark=a==='dark'||(a==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.classList.toggle('motion-off',data.feedbackSettings?.motion===false);document.querySelector('meta[name="theme-color"]').content=dark?'#000000':'#F2F2F7'}
applyAppearance();matchMedia('(prefers-color-scheme:dark)').addEventListener?.('change',()=>{if(data.appearance==='system')applyAppearance()});
function icon(name){const p={
dayClose:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="m8 8 1 1 2-2M13 8h3m-8 5 1 1 2-2M13 13h3M8 18h8"/></svg>',
journal:'<svg viewBox="0 0 24 24"><path d="M7 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3ZM7 3v18M11 8h5M11 12h5"/></svg>',

search:'<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg>',
menu:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="8" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
target:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>',
calendar:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18"/></svg>',
bell:'<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>',
calc:'<svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M7 7h10M8 12h1M12 12h1M16 12h1M8 16h1M12 16h1M16 16h1"/></svg>',
plus:'<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
card:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 9h18"/></svg>',
bank:'<svg viewBox="0 0 24 24"><path d="M3 9h18L12 4 3 9Z"/><path d="M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18"/></svg>',
person:'<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6"/></svg>',
star:'<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2 7.5 14 3 9.6l6.2-.9z"/></svg>',
tag:'<svg viewBox="0 0 24 24"><path d="M3 3h8l10 10-8 8L3 11V3Z"/><circle cx="7.5" cy="7.5" r="1"/></svg>',
wave:'<svg viewBox="0 0 24 24"><path d="M4 10v4M8 6v12M12 3v18M16 6v12M20 10v4"/></svg>',
grid:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>',
upload:'<svg viewBox="0 0 24 24"><path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 13v7h14v-7"/></svg>',
download:'<svg viewBox="0 0 24 24"><path d="M12 4v12M8 12l4 4 4-4"/><path d="M5 13v7h14v-7"/></svg>',
appearance:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16V4Z"/></svg>',
lock:'<svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
help:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.5 2.5 0 0 1 4.8 1c0 2-2.5 2-2.5 4M12 18h.01"/></svg>',
warning:'<svg viewBox="0 0 24 24"><path d="M12 3 2.8 20h18.4L12 3Z"/><path d="M12 9v4M12 17h.01"/></svg>',
mail:'<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m4 7 8 6 8-6"/></svg>',
chart:'<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
list:'<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
wallet:'<svg viewBox="0 0 24 24"><path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H19v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z"/><path d="M16 10h5v5h-5a2.5 2.5 0 0 1 0-5Z"/></svg>',
chevronLeft:'<svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>',
chevronRight:'<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>',
chevronDown:'<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>',
check:'<svg viewBox="0 0 24 24"><path d="m5 12 4 4 10-10"/></svg>',
trash:'<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>',
edit:'<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/></svg>',
repeat:'<svg viewBox="0 0 24 24"><path d="M17 4l3 3-3 3M20 7H8a5 5 0 0 0-5 5"/><path d="m7 20-3-3 3-3M4 17h12a5 5 0 0 0 5-5"/></svg>',
briefcase:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V4h6v3M3 12h18"/></svg>',
clock:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
fork:'<svg viewBox="0 0 24 24"><path d="M7 3v7M4.5 3v5a2.5 2.5 0 0 0 5 0V3M7 10v11M15 3v18M15 3c4 3 4 8 0 10"/></svg>',
tram:'<svg viewBox="0 0 24 24"><rect x="5" y="4" width="14" height="14" rx="3"/><path d="M8 8h8M7 12h10M8 21l2-3M16 21l-2-3"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/></svg>',
bus:'<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M7 8h10M7 12h10M8 21v-2M16 21v-2"/><circle cx="8.5" cy="15.5" r="1"/><circle cx="15.5" cy="15.5" r="1"/></svg>',
bag:'<svg viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
cart:'<svg viewBox="0 0 24 24"><path d="M3 4h2l2 11h10l2-7H6"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
tshirt:'<svg viewBox="0 0 24 24"><path d="M8 4 4 6l-2 4 4 2v8h12v-8l4-2-2-4-4-2a4 4 0 0 1-8 0Z"/></svg>',
ticket:'<svg viewBox="0 0 24 24"><path d="M4 7h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4V7Z"/><path d="M12 7v12"/></svg>',
game:'<svg viewBox="0 0 24 24"><path d="M7 8h10a4 4 0 0 1 4 4v4a3 3 0 0 1-5 2l-2-2h-4l-2 2a3 3 0 0 1-5-2v-4a4 4 0 0 1 4-4Z"/><path d="M7 12h4M9 10v4M16 11h.01M18 13h.01"/></svg>',
book:'<svg viewBox="0 0 24 24"><path d="M4 5a4 4 0 0 1 4-2h4v17H8a4 4 0 0 0-4 2V5Z"/><path d="M20 5a4 4 0 0 0-4-2h-4v17h4a4 4 0 0 1 4 2V5Z"/></svg>',
bolt:'<svg viewBox="0 0 24 24"><path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/></svg>',
ellipsis:'<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none"/></svg>',
house:'<svg viewBox="0 0 24 24"><path d="M3 11 12 3l9 8v10h-6v-6H9v6H3V11Z"/></svg>',
heart:'<svg viewBox="0 0 24 24"><path d="M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10-8 10Z"/></svg>',
gift:'<svg viewBox="0 0 24 24"><rect x="3" y="9" width="18" height="12" rx="2"/><path d="M12 9v12M2 9h20V6H2v3ZM12 6c-2-4-6-3-6-1 0 1 1 1 3 1h3Zm0 0c2-4 6-3 6-1 0 1-1 1-3 1h-3Z"/></svg>',
phone:'<svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M10 18h4"/></svg>',
coffee:'<svg viewBox="0 0 24 24"><path d="M4 8h13v7a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V8Z"/><path d="M17 10h2a3 3 0 0 1 0 6h-2M7 3v2M11 3v2M15 3v2"/></svg>',
medical:'<svg viewBox="0 0 24 24"><path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/></svg>'
};return p[name]||p.ellipsis}
function categoryIconHtml(category,cls='cat-icon'){const c=typeof category==='string'?catByName(category):category;const color=c?.color||'#8E8E93';return `<span class="${cls}" style="background:${color}">${icon(normalizeCategoryIcon(c?.icon,c?.id))}</span>`}
function settingsIconHtml(symbol,color='var(--blue)'){return `<div class="settings-icon" aria-hidden="true" style="background:${color}">${icon(symbol)}</div>`}
function profileAvatarHtml(cls='settings-icon',profile=data.profile){return profile.icon?`<div class="${cls} profile-avatar"><img src="${esc(profile.icon)}" alt=""></div>`:`<div class="${cls} profile-avatar" aria-hidden="true">${icon('person')}</div>`}
function menuSymbol(token){const map={'＋':'plus','↻':'repeat','⚙︎':'ellipsis','¥':'wallet','M':'mail','⇧':'upload','⇩':'download','◎':'target','!':'bell'};return icon(map[token]||token||'ellipsis')}
function actionBtn(name,id,title=''){return `<button class="icon-btn" id="${id}" aria-label="${esc(title||name)}">${icon(name)}</button>`}
function topbar(title,sub,actions=''){return `<div class="topbar-main"><div class="large-title">${title}</div>${sub?`<div class="date-line">${sub}</div>`:''}</div><div class="nav-actions">${actions}</div>`}
function syncTabIndicator(instant=false){
  const bar=document.getElementById('tabbar'),indicator=bar?.querySelector('.tab-selection');
  if(!bar||!indicator)return;
  const button=bar.querySelector('.tab.active');
  if(!button)return;
  if(instant||mm3MotionReduced())bar.classList.add('tab-instant');
  indicator.style.width=`${button.offsetWidth}px`;
  indicator.style.transform=`translate3d(${button.offsetLeft}px,0,0)`;
  bar.classList.add('tab-ready');
  if(bar.classList.contains('tab-instant')){
    void indicator.offsetWidth;
    requestAnimationFrame(()=>bar.classList.remove('tab-instant'));
  }
}
function initializeTabIndicator(){
  const bar=document.getElementById('tabbar');if(!bar)return;
  syncTabIndicator(true);
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>syncTabIndicator(true)).observe(bar);
  else window.addEventListener('resize',()=>syncTabIndicator(true),{passive:true});
}
function switchTab(tab){
  if(goalPlannerState?.locked)return;
  const target=tab==='home'?(data.homeViewMode||'today'):tab;
  if(!['today','month','pay','payments','assets','settings'].includes(target))return;
  if((target==='today'||target==='month')&&(data.homeViewMode||'today')!==target){
    try{safeCommit(()=>{data.homeViewMode=target},{label:'tab selection',invalidateAcf:false})}catch(e){return}
  }
  if(target===activeTab){
    const current=document.querySelector(`#screen-${activeTab} .scroll`);
    current?.scrollTo({top:0,behavior:mm3MotionReduced()?'auto':'smooth'});
    return;
  }
  const perform=()=>{
    const previous=activeTab,current=document.querySelector(`#screen-${previous} .scroll`);
    if(current)tabScrollPositions[previous]=current.scrollTop;
    if(previous==='today'||previous==='month')stopMoneyTicker(previous);
    activeTab=target;
    document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===`screen-${target}`));
    document.querySelectorAll('.tab').forEach(button=>{
      const selected=button.dataset.tab===target||(button.dataset.tab==='home'&&['today','month'].includes(target));
      button.classList.toggle('active',selected);
      if(selected)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');
    });
    syncTabIndicator();
    feedback?.selection?.();
    renderAll();
    requestAnimationFrame(()=>{
      if(activeTab!==target)return;
      const next=document.querySelector(`#screen-${target} .scroll`);
      if(next)next.scrollTop=tabScrollPositions[target]||0;
    });
  };
  const heavyAssets=target==='assets'&&mm3AssetForecastIsHeavy();
  const [cy,cm]=ym().split('-').map(Number),[py,pm]=String(paymentHomeMonth()).split('-').map(Number);
  const heavyPayments=target==='payments'&&(py-cy)*12+pm-cm>=2;
  if(heavyAssets||heavyPayments)return runWithBusy(perform,{
    title:heavyAssets?'資産予測を計算中…':'ATFを計算中…',
    sub:heavyAssets?'長期の給与・カード・固定支払いを確認しています':`${monthLabel(paymentHomeMonth())}までの資金見通しを計算しています`
  });
  return perform();
}
document.getElementById('tabbar').addEventListener('click',e=>{const b=e.target.closest('.tab');if(b)switchTab(b.dataset.tab)});
function installHorizontalSwipe(el,onNext,onPrev,threshold=56){
  if(!el)return;el.__horizontalSwipeCleanup?.();let gesture=null,suppressUntil=0;
  const down=e=>{if(e.isPrimary===false||e.button>0)return;gesture=null;if(e.target.closest?.('input,select,textarea,a,[role=slider],.money-ticker-viewport')||e.clientX-el.getBoundingClientRect().left<28)return;gesture={id:e.pointerId,x:e.clientX,y:e.clientY}};
  const cancel=()=>{gesture=null};
  const up=e=>{if(!gesture||e.pointerId!==gesture.id)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;gesture=null;if(Math.abs(dx)>threshold&&Math.abs(dx)>Math.abs(dy)*1.35){suppressUntil=Date.now()+400;e.preventDefault();dx<0?onNext?.():onPrev?.()}};
  const click=e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation()}};
  el.addEventListener('pointerdown',down);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',cancel);el.addEventListener('click',click,true);
  el.__horizontalSwipeCleanup=()=>{cancel();el.removeEventListener('pointerdown',down);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',cancel);el.removeEventListener('click',click,true);el.__horizontalSwipeCleanup=null}
}
function trackingDateBounds(){const today=ymd();return {min:addDays(today,-4),max:today}}
function shiftTrackingDate(delta){const {min,max}=trackingDateBounds(),next=addDays(trackingDate,delta);if(next<min||next>max)return;trackingDate=next;renderAll()}
function dateNavigatorHtml(date){const {min,max}=trackingDateBounds();return `<div class="date-navigator" id="todayDateNavigator"><button class="date-nav-btn" id="dayPrev" ${date<=min?'disabled':''}>${icon('chevronLeft')}</button><div class="date-nav-label">${date===ymd()?`今日・${parseYmd(date).getMonth()+1}月${parseYmd(date).getDate()}日`:dayLabel(date)}</div><button class="date-nav-btn" id="dayNext" ${date>=max?'disabled':''}>${icon('chevronRight')}</button></div>`}
function pruneExpiredSystemNotices(){
  if(mm3PendingAsyncCommit&&commitDepth===0)return false;
  const notices=retainedSystemNotices(data.notices);
  if(notices.length===data.notices.length)return false;
  safeCommit(()=>{data.notices=notices},{label:'expired system notices',skipUnchanged:true,invalidateAcf:false});
  return true;
}
function addNotice(title,message,type='info',notify=true,options={}){
  const key=`${title}|${message}|${systemNoticeDay(new Date())}`;
  if(data.notices.some(n=>n.key===key))return false;
  if(commitDepth===0)return safeCommit(()=>addNotice(title,message,type,notify,{...options,saveNow:false}),{label:'notice add',skipUnchanged:true});
  data.notices.unshift({id:uid('note'),key,title,message,type,source:'system',date:new Date().toISOString(),read:false});
  data.notices=data.notices.slice(0,80);
  if(options?.saveNow!==false)save();
  if(notify&&(type==='warning'||/給料日|支払日|固定支払い/.test(title)))afterCommit(()=>sendBrowserNotice('My Money 2.0',`${title}：${message}`));
  return true;
}
function unreadNotices(){return data.notices.filter(n=>!n.read).length}
function showAlert(title,message,opts={}){return new Promise(resolve=>{const w=document.getElementById('alertWrap');document.getElementById('alertTitle').textContent=title;document.getElementById('alertMessage').textContent=message;const a=document.getElementById('alertActions');a.innerHTML='';const cancel=document.createElement('button');cancel.textContent=opts.cancelText||'キャンセル';cancel.onclick=()=>{w.classList.remove('show');resolve(false)};const ok=document.createElement('button');ok.textContent=opts.okText||'OK';if(opts.destructive)ok.className='destructive';ok.onclick=()=>{w.classList.remove('show');resolve(true)};a.append(cancel,ok);w.classList.add('show')})}
function closeMenu(){const m=document.getElementById('menuLayer');m?.classList.remove('show')}function openMenu(anchor,items){const menu=document.getElementById('menuLayer');if(!menu||!anchor)return;closeMenu();const visible=items.filter(x=>!x.disabled),r=anchor.getBoundingClientRect(),width=Math.min(260,Math.max(220,...visible.map(x=>String(x.label||'').length*15+70)));menu.style.width=width+'px';menu.innerHTML=visible.map((x,i)=>`<button type="button" class="menu-item ${x.danger?'danger':''}" data-menu-index="${i}" role="menuitem"><span class="menu-label">${esc(x.label)}</span><span class="menu-icon">${menuSymbol(x.icon)}</span></button>`).join('');menu.style.visibility='hidden';menu.classList.add('show');const h=menu.offsetHeight,left=clamp(r.right-width,8,innerWidth-width-8),spaceBelow=innerHeight-r.bottom-8,top=spaceBelow>=h?Math.min(innerHeight-h-8,r.bottom+5):Math.max(8,r.top-h-5);menu.style.left=left+'px';menu.style.right='auto';menu.style.top=top+'px';menu.style.transformOrigin=`${clamp(r.left+r.width/2-left,18,width-18)}px ${spaceBelow>=h?'0':'100%'}`;menu.style.visibility='';menu.onclick=e=>{const b=e.target.closest('[data-menu-index]');if(!b)return;const item=visible[Number(b.dataset.menuIndex)];closeMenu();item?.action?.()}}document.addEventListener('pointerdown',e=>{const m=document.getElementById('menuLayer');if(m?.classList.contains('show')&&!m.contains(e.target)&&!e.target.closest('.icon-btn'))closeMenu()},{capture:true});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()})
function markSheetDirty(value=true){sheetDirtyState=!!value}
let nativeSheetClosePending=false;
async function requestSheetClose(){
  if(nativeSheetClosePending)return;
  if(document.getElementById('calculator').classList.contains('show')){closeCalc();return}
  const sheet=document.getElementById('sheet');if(!sheet.classList.contains('show')||sheet.dataset.commitPending==='true')return;
  nativeSheetClosePending=true;const revision=sheet.dataset.nativeRevision;
  try{if(sheetDirtyState&&!await showAlert('変更を破棄しますか？','まだ保存していない変更があります。',{destructive:true,okText:'破棄',cancelText:'戻る'}))return;if(sheet.dataset.nativeRevision===revision)closeSheet()}finally{nativeSheetClosePending=false}
}
function installSheetDrag(sheet){
  const grabber=sheet?.querySelector('.grabber');if(!grabber)return()=>{};
  let pid=null,startY=0,lastY=0,startMode='half';
  const reset=()=>{sheet.classList.remove('detent-moving');sheet.style.transform=''};
  const cancel=()=>{const id=pid;pid=null;try{if(id!=null&&grabber.hasPointerCapture?.(id))grabber.releasePointerCapture(id)}catch(_){}reset()};
  const down=e=>{if(e.isPrimary===false||e.button>0||pid!=null)return;pid=e.pointerId;startY=lastY=e.clientY;startMode=sheet.classList.contains('full')?'full':'half';grabber.setPointerCapture?.(pid);sheet.classList.add('detent-moving')};
  const move=e=>{if(e.pointerId!==pid)return;lastY=e.clientY;const dy=lastY-startY;sheet.style.transform=`translate(-50%,${startMode==='half'&&dy<0?Math.max(-70,dy*.32):Math.max(0,dy)}px)`};
  const finish=e=>{if(e.pointerId!==pid)return;const dy=e.clientY-startY;cancel();if(startMode==='half'&&dy<-46){sheet.classList.replace('half','full');feedback.selection?.()}else if(startMode==='full'&&dy>64){sheet.classList.replace('full','half');feedback.selection?.()}else if(startMode==='half'&&dy>92)requestSheetClose()};
  grabber.addEventListener('pointerdown',down);grabber.addEventListener('pointermove',move);grabber.addEventListener('pointerup',finish);grabber.addEventListener('pointercancel',cancel);
  return()=>{cancel();grabber.removeEventListener('pointerdown',down);grabber.removeEventListener('pointermove',move);grabber.removeEventListener('pointerup',finish);grabber.removeEventListener('pointercancel',cancel)}
}
function openSheet(html,mode='half',binder){if(sheetCleanup)try{sheetCleanup()}catch(e){}if(sheetDragCleanup)try{sheetDragCleanup()}catch(e){}const s=document.getElementById('sheet'),d=document.getElementById('dim');sheetDirtyState=false;s.dataset.nativeRevision=String((Number(s.dataset.nativeRevision)||0)+1);s.className=`sheet ${mode}`;s.style.transform='';s.innerHTML=`<div class="grabber"></div>${html}`;d.classList.add('show');s.classList.add('show');d.onclick=requestSheetClose;const cleanup=binder?.(s),dirty=e=>{if(e.target.closest('.sheet-nav'))return;if(e.target.matches('input,select,textarea,[type=range]'))sheetDirtyState=true};s.addEventListener('input',dirty,true);s.addEventListener('change',dirty,true);sheetDragCleanup=installSheetDrag(s);sheetCleanup=()=>{s.removeEventListener('input',dirty,true);s.removeEventListener('change',dirty,true);try{cleanup?.()}catch(e){}}}
function closeSheet(){const s=document.getElementById('sheet');sheetDirtyState=false;s.classList.remove('show');s.style.transform='';if(!document.getElementById('calculator').classList.contains('show'))document.getElementById('dim').classList.remove('show');if(sheetDragCleanup)try{sheetDragCleanup()}catch(e){}sheetDragCleanup=null;if(sheetCleanup)try{sheetCleanup()}catch(e){}sheetCleanup=null;setTimeout(()=>{if(!s.classList.contains('show'))s.innerHTML=''},310)}
function pushView(title,html,binder,right='',backOverride=null){const id=uid('view'),v=document.createElement('section'),tabNames={today:'今日',month:'今月',pay:'給与・支払',assets:'資産',settings:'設定'},parent=pushStack[pushStack.length-1],backLabel=backOverride||parent?.title||tabNames[activeTab]||'戻る';v.className='push-view';if(activeTab==='settings')v.classList.add('settings-detail-view');v.id=id;v.innerHTML=`<div class="push-nav"><button class="back-btn" aria-label="${esc(backLabel)}に戻る">${icon('chevronLeft')}<span>${esc(backLabel)}</span></button><div class="push-title">${esc(title)}</div><div class="push-right">${right}</div></div><div class="push-body">${html}</div>`;document.getElementById('pushLayer').appendChild(v);pushStack.push({id,binder,title,backLabel});v.querySelector('.back-btn').onclick=()=>{if(pushStack.at(-1)?.id===id)popView()};requestAnimationFrame(()=>v.classList.add('show'));installInteractiveBack(v,id);binder?.(v);return v}
function popView(){if(goalPlannerState?.locked)return false;const x=pushStack.pop();if(!x)return false;const v=document.getElementById(x.id);v?.classList.remove('show');if(v)v.style.pointerEvents='none';if(goalPlannerState?.viewId===x.id)goalPlannerState=null;setTimeout(()=>v?.remove(),300);return true}
function replaceTopPush(title,html,binder,right=''){const x=pushStack.pop();document.getElementById(x?.id)?.remove();return pushView(title,html,binder,right,x?.backLabel||null)}
function installInteractiveBack(v,id){let sx=0,sy=0,lastX=0,lastAt=0,tracking=false,horizontal=false,prev=null;const cancel=()=>{tracking=false;horizontal=false;v.classList.remove('interactive');v.style.transform='';if(prev){prev.style.transform='';prev.style.opacity=''}};const start=e=>{if(goalPlannerState?.locked)return;if(pushStack[pushStack.length-1]?.id!==id||document.getElementById('sheet').classList.contains('show')||document.getElementById('calculator').classList.contains('show')||document.getElementById('menuLayer')?.classList.contains('show'))return;const t=e.touches?.[0]||e;if(t.clientX-v.getBoundingClientRect().left>24||e.touches?.length>1)return;sx=lastX=t.clientX;sy=t.clientY;lastAt=performance.now();tracking=true;horizontal=false;prev=v.previousElementSibling?.classList.contains('push-view')?v.previousElementSibling:null};const move=e=>{if(!tracking)return;const t=e.touches?.[0]||e,dx=Math.max(0,t.clientX-sx),dy=Math.abs(t.clientY-sy);if(!horizontal){if(dy>11&&dy>dx*1.15){cancel();return}if(dx>7)horizontal=true}if(!horizontal)return;e.preventDefault();lastX=t.clientX;lastAt=performance.now();const x=Math.min(v.clientWidth,dx);v.classList.add('interactive');v.style.transform=`translateX(${x}px)`;if(prev){const ratio=Math.min(1,x/Math.max(1,v.clientWidth));prev.style.transform=`translateX(${(-18+18*ratio).toFixed(2)}px)`;prev.style.opacity=String(.88+.12*ratio)}};const end=e=>{if(!tracking&&!horizontal)return;const t=e.changedTouches?.[0]||e,now=performance.now(),x=t?.clientX??lastX,dx=Math.max(0,x-sx),dt=Math.max(1,now-lastAt),velocity=Math.max(0,(x-lastX)/dt);tracking=false;v.classList.remove('interactive');const complete=horizontal&&(dx>v.clientWidth*.31||(dx>24&&velocity>.5));v.style.transition='transform .26s cubic-bezier(.22,.88,.22,1)';if(prev)prev.style.transition='transform .26s cubic-bezier(.22,.88,.22,1),opacity .26s';if(complete){v.style.pointerEvents='none';v.style.transform='translateX(100%)';if(prev){prev.style.transform='translateX(0)';prev.style.opacity='1'}setTimeout(()=>{if(pushStack[pushStack.length-1]?.id===id){pushStack.pop();if(goalPlannerState?.viewId===id)goalPlannerState=null;v.remove()}if(prev){prev.style.transform='';prev.style.opacity='';prev.style.transition=''}},265)}else{v.style.transform='translateX(0)';if(prev){prev.style.transform='';prev.style.opacity=''}setTimeout(()=>{v.style.transform='';v.style.transition='';if(prev)prev.style.transition=''},270)}horizontal=false};v.addEventListener('touchstart',start,{passive:true});v.addEventListener('touchmove',move,{passive:false});v.addEventListener('touchend',end,{passive:true});v.addEventListener('touchcancel',()=>{cancel()},{passive:true})}
function refreshEmployerDetail(id){const e=employerById(id),top=pushStack[pushStack.length-1],root=top&&document.getElementById(top.id);if(e&&root&&root.dataset?.employerId===id){if(popView())openEmployerDetail(id)}else renderAll()}
function refreshSalaryOpenView(){
  const top=pushStack.at(-1),root=top&&document.getElementById(top.id);
  if(root?.dataset?.employerId){refreshEmployerDetail(root.dataset.employerId);return}
  if(root?.dataset?.salaryListMonth){const month=root.dataset.salaryListMonth;if(popView())mm3SalaryRecordsOpen(month)}
}

function moneyButton(id,label,value){return `<button class="field money-field press" id="${id}"><span class="hint">${esc(label)}</span><span class="val">${yen(value)}</span></button>`}
