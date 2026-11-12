function applyAppearance(){const a=data.appearance||'system',dark=a==='dark'||(a==='system'&&matchMedia('(prefers-color-scheme:dark)').matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.classList.toggle('motion-off',data.feedbackSettings?.motion===false);document.querySelector('meta[name="theme-color"]').content=dark?'#000000':'#F2F2F7'}
applyAppearance();matchMedia('(prefers-color-scheme:dark)').addEventListener?.('change',()=>{if(data.appearance==='system')applyAppearance()});
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
  installTabSlide(bar);
}
/* Follow the finger, committing once on release. Vertical/canceled gestures keep the current tab. */
function installTabSlide(bar){
  let gesture=null,suppressUntil=0;
  const buttons=()=>[...bar.querySelectorAll('.tab')];
  const buttonAt=x=>buttons().reduce((nearest,b)=>Math.abs(b.getBoundingClientRect().left+b.offsetWidth/2-x)<Math.abs(nearest.getBoundingClientRect().left+nearest.offsetWidth/2-x)?b:nearest);
  const finish=(event,commit)=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const moved=gesture.moved;gesture=null;
    bar.classList.remove('tab-dragging');
    if(moved){
      suppressUntil=performance.now()+400;
      const rect=bar.getBoundingClientRect();
      if(commit&&event.clientY>=rect.top-24&&event.clientY<=rect.bottom+24)switchRoot(buttonAt(event.clientX).dataset.tab);
      syncTabIndicator();
    }
  };
  bar.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.isPrimary===false)return;
    gesture={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
  });
  bar.addEventListener('pointermove',event=>{
    if(!gesture||gesture.id!==event.pointerId)return;
    const dx=Math.abs(event.clientX-gesture.x),dy=Math.abs(event.clientY-gesture.y);
    if(!gesture.moved){
      if(dy>24&&dy>dx){gesture=null;return}
      if(dx<6)return;
      gesture.moved=true;bar.setPointerCapture(event.pointerId);bar.classList.add('tab-dragging');
    }
    const indicator=bar.querySelector('.tab-selection'),rect=bar.getBoundingClientRect(),button=buttonAt(event.clientX);
    indicator.style.width=`${button.offsetWidth}px`;
    indicator.style.transform=`translate3d(${clamp(event.clientX-rect.left-button.offsetWidth/2,5,rect.width-button.offsetWidth-5)}px,0,0)`;
  });
  bar.addEventListener('pointerup',event=>finish(event,true));
  bar.addEventListener('pointercancel',event=>finish(event,false));
  bar.addEventListener('lostpointercapture',event=>{if(event.target===bar)finish(event,false)});
  bar.addEventListener('click',event=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation()}},true);
}
/* 第14版 N-001〜003: 下部タブは「ホーム／支払い／その他」の3つ。
   給与・資産・支出（今日／今月）・請求一覧は、どのrootから開いても同じ専用画面（detail）として開き、
   戻るボタンで開いた起点のrootへ表示位置ごと戻る。旧5タブの画面と機能はそのまま残す。 */
const ROOT_SCREENS={home:'today',payments:'payroot',settings:'settings'};
const DETAIL_SCREENS={day:'今日の支出',month:'今月の支出',pay:'給与',assets:'資産',payments:'請求一覧'};
const ROOT_LABELS={today:'ホーム',payroot:'支払い',settings:'その他'};
let detailOrigin='today';
function isDetailScreen(screen=activeTab){return Object.prototype.hasOwnProperty.call(DETAIL_SCREENS,screen)}
function rootScreenOf(screen=activeTab){return isDetailScreen(screen)?detailOrigin:screen}
function rootTabOf(screen=activeTab){const root=rootScreenOf(screen);return Object.keys(ROOT_SCREENS).find(k=>ROOT_SCREENS[k]===root)||'home'}
/* indicator=false: 状態の同期だけ（クラスを変えない限り変更を起こさない。読み上げ層の監視から呼ぶため） */
function syncTabButtons(indicator=true){
  const tab=rootTabOf();
  document.querySelectorAll('#tabbar .tab').forEach(button=>{
    const selected=button.dataset.tab===tab;
    button.classList.toggle('active',selected);
    if(selected){if(button.getAttribute('aria-current')!=='page')button.setAttribute('aria-current','page')}else if(button.hasAttribute('aria-current'))button.removeAttribute('aria-current');
  });
  if(indicator)syncTabIndicator();
}
/* 下部タブから: rootへ。表示中のrootをもう一度押すと先頭へ（T-001〜003） */
function switchRoot(tab){
  const root=ROOT_SCREENS[tab];if(!root)return;
  if(root===activeTab){const current=document.querySelector(`#screen-${activeTab} .scroll`);current?.scrollTo({top:0,behavior:mm3MotionReduced()?'auto':'smooth'});return}
  switchTab(root);
}
/* 専用画面の戻る: 開いた起点のrootへ（表示位置・期間はtabScrollPositionsと各状態変数に残っている） */
function closeDetailScreen(){if(isDetailScreen())switchTab(detailOrigin)}
function switchTab(tab){
  if(goalPlannerState?.locked)return;
  const target=tab==='home'?'today':tab;
  if(!['today','day','month','pay','payments','payroot','assets','settings'].includes(target))return;
  if(target===activeTab){
    const current=document.querySelector(`#screen-${activeTab} .scroll`);
    current?.scrollTo({top:0,behavior:mm3MotionReduced()?'auto':'smooth'});
    return;
  }
  const perform=()=>{
    const previous=activeTab,current=document.querySelector(`#screen-${previous} .scroll`);
    if(current)tabScrollPositions[previous]=current.scrollTop;
    if(previous==='day'||previous==='month')stopMoneyTicker(previous==='day'?'today':previous);
    if(isDetailScreen(target)){if(!isDetailScreen(previous))detailOrigin=previous}
    else detailOrigin=target;
    activeTab=target;
    document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===`screen-${target}`));
    syncTabButtons();
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
  if(heavyAssets||heavyPayments){
    /* N-006: 移動先の画面を先に出し、データ領域だけを骨格で覆って計算する */
    document.querySelectorAll('.screen').forEach(el=>el.classList.toggle('active',el.id===`screen-${target}`));
    return runInArea(`#screen-${target} .scroll`,perform,{
      title:heavyAssets?'資産予測を計算しています…':'ACFを計算しています…',
      sub:heavyAssets?'長期の給与・カード・固定支払いを確認しています':`${monthLabel(paymentHomeMonth())}までの資金見通しを計算しています`,
      label:heavyAssets?'資産予測':'資金見通し'
    }).catch(error=>{console.error('heavy tab render failed',error)});
  }
  return perform();
}
/* 専用画面の上部に「‹ 起点」の戻るボタンを置く（各画面の描画後に呼ぶ） */
function placeDetailBack(screen){
  const top=document.querySelector(`#screen-${screen} .topbar`);if(!top)return;
  top.querySelector('.detail-back')?.remove();
  if(!isDetailScreen(screen))return;
  const b=document.createElement('button');b.type='button';b.className='back-btn detail-back';b.id=`detailBack-${screen}`;
  b.setAttribute('aria-label',`${ROOT_LABELS[detailOrigin]||'ホーム'}に戻る`);
  b.innerHTML=`${icon('chevronLeft')}<span>${esc(ROOT_LABELS[detailOrigin]||'ホーム')}</span>`;
  b.onclick=closeDetailScreen;top.prepend(b);top.classList.add('has-detail-back');
}
document.getElementById('tabbar').addEventListener('click',e=>{const b=e.target.closest('.tab');if(b)switchRoot(b.dataset.tab)});
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
/* 第11版 HOME-003ほか: メニューは背景を少し暗くし、押したボタンの位置から0.98→1倍で開く（160ms）。閉じる時は130ms */
function closeMenu(){const m=document.getElementById('menuLayer');m?.classList.remove('show');document.getElementById('menuScrim')?.classList.remove('show');for(const x of document.querySelectorAll('.icon-btn.menu-anchor-active'))x.classList.remove('menu-anchor-active')}/* items: {label, sub?, icon, action, danger?, preview?}。preview は押しても何もしない読み取り専用の行（長押しのプレビュー用）。
   opts.html を渡すと、項目の代わりにその内容をパネルとして同じ位置・同じ動きで開く（opts.bind で結び付け） */
function openMenu(anchor,items,opts={}){const menu=document.getElementById('menuLayer');if(!menu||!anchor)return;closeMenu();const visible=(items||[]).filter(x=>!x.disabled),r=anchor.getBoundingClientRect(),width=opts.width||Math.min(320,innerWidth-16,Math.max(220,...visible.map(x=>Math.max(String(x.label||'').length,String(x.sub||'').length*.8)*17+76)));menu.style.width=width+'px';menu.classList.toggle('menu-panel',!!opts.html);menu.setAttribute('aria-label',opts.label||'メニュー');menu.innerHTML=opts.html||visible.map((x,i)=>x.preview?`<div class="menu-item menu-preview" role="none"><span class="menu-label">${esc(x.label)}${x.sub?`<small>${esc(x.sub)}</small>`:''}</span>${x.value?`<span class="menu-value">${esc(x.value)}</span>`:''}</div>`:`<button type="button" class="menu-item ${x.danger?'danger':''}" data-menu-index="${i}" role="menuitem"><span class="menu-label">${esc(x.label)}${x.sub?`<small>${esc(x.sub)}</small>`:''}</span><span class="menu-icon">${menuSymbol(x.icon)}</span></button>`).join('');opts.bind?.(menu);menu.classList.add('measuring');const h=menu.offsetHeight,left=clamp(r.right-width,8,innerWidth-width-8),spaceBelow=innerHeight-r.bottom-8,top=spaceBelow>=h?Math.min(innerHeight-h-8,r.bottom+5):Math.max(8,r.top-h-5);menu.style.left=left+'px';menu.style.right='auto';menu.style.top=top+'px';menu.style.transformOrigin=`${clamp(r.left+r.width/2-left,18,width-18)}px ${spaceBelow>=h?'0':'100%'}`;menu.classList.remove('measuring');void menu.offsetWidth;menu.classList.add('show');if(anchor.classList.contains('icon-btn'))anchor.classList.add('menu-anchor-active');document.getElementById('menuScrim')?.classList.add('show');menu.onclick=e=>{const b=e.target.closest('[data-menu-index]');if(!b)return;const item=visible[Number(b.dataset.menuIndex)];closeMenu();item?.action?.()}}document.addEventListener('pointerdown',e=>{const m=document.getElementById('menuLayer');if(m?.classList.contains('show')&&!m.contains(e.target)&&!e.target.closest('.icon-btn,#addHub'))closeMenu()},{capture:true});document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()})
function markSheetDirty(value=true){sheetDirtyState=!!value}
let nativeSheetClosePending=false;
async function requestSheetClose(){
  if(nativeSheetClosePending)return;
  if(document.getElementById('calculator').classList.contains('show')){closeCalc();return}
  const sheet=document.getElementById('sheet');if(!sheet.classList.contains('show')||sheet.dataset.commitPending==='true')return;
  nativeSheetClosePending=true;const revision=sheet.dataset.nativeRevision;
  try{if(sheetDirtyState&&!await showAlert('変更を破棄しますか？','まだ保存していない変更があります。保存済みの記録は変わりません。',{destructive:true,okText:'変更を破棄',cancelText:'編集を続ける'}))return;if(sheet.dataset.nativeRevision===revision)closeSheet()}finally{nativeSheetClosePending=false}
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
function pruneRetiredPushViews(){const retained=new Set(pushStack.map(view=>view.id));document.querySelectorAll('#pushLayer .push-view').forEach(view=>{if(!retained.has(view.id))view.remove()})}
function pushView(title,html,binder,right='',backOverride=null){pruneRetiredPushViews();const id=uid('view'),v=document.createElement('section'),tabNames={today:'今日',month:'今月',pay:'給与',payments:'支払い',assets:'資産',settings:'設定'},parent=pushStack[pushStack.length-1],backLabel=backOverride||parent?.title||tabNames[activeTab]||'戻る';v.className='push-view';if(activeTab==='settings')v.classList.add('settings-detail-view');v.id=id;v.innerHTML=`<div class="push-nav"><button class="back-btn" aria-label="${esc(backLabel)}に戻る">${icon('chevronLeft')}<span>${esc(backLabel)}</span></button><div class="push-title">${esc(title)}</div><div class="push-right">${right}</div></div><div class="push-body">${html}</div>`;document.getElementById('pushLayer').appendChild(v);pushStack.push({id,binder,title,backLabel});v.querySelector('.back-btn').onclick=()=>{if(pushStack.at(-1)?.id===id)popView()};requestAnimationFrame(()=>v.classList.add('show'));installInteractiveBack(v,id);binder?.(v);return v}
function popView(){if(goalPlannerState?.locked)return false;const x=pushStack.pop();if(!x)return false;const v=document.getElementById(x.id);v?.classList.remove('show');if(v){v.style.pointerEvents='none';v.inert=true;v.setAttribute('aria-hidden','true');if(typeof v.__dispose==='function')v.__dispose()}if(goalPlannerState?.viewId===x.id)goalPlannerState=null;setTimeout(()=>v?.remove(),300);return true}
function replaceTopPush(title,html,binder,right=''){const x=pushStack.pop();const previous=document.getElementById(x?.id);if(typeof previous?.__dispose==='function')previous.__dispose();previous?.remove();return pushView(title,html,binder,right,x?.backLabel||null)}
function installInteractiveBack(v,id){let sx=0,sy=0,lastX=0,lastAt=0,tracking=false,horizontal=false,prev=null;const cancel=()=>{tracking=false;horizontal=false;v.classList.remove('interactive');v.style.transform='';if(prev){prev.style.transform='';prev.style.opacity=''}};const start=e=>{if(goalPlannerState?.locked)return;if(pushStack[pushStack.length-1]?.id!==id||document.getElementById('sheet').classList.contains('show')||document.getElementById('calculator').classList.contains('show')||document.getElementById('menuLayer')?.classList.contains('show'))return;const t=e.touches?.[0]||e;if(t.clientX-v.getBoundingClientRect().left>24||e.touches?.length>1)return;sx=lastX=t.clientX;sy=t.clientY;lastAt=performance.now();tracking=true;horizontal=false;prev=v.previousElementSibling?.classList.contains('push-view')?v.previousElementSibling:null};const move=e=>{if(!tracking)return;const t=e.touches?.[0]||e,dx=Math.max(0,t.clientX-sx),dy=Math.abs(t.clientY-sy);if(!horizontal){if(dy>11&&dy>dx*1.15){cancel();return}if(dx>7)horizontal=true}if(!horizontal)return;e.preventDefault();lastX=t.clientX;lastAt=performance.now();const x=Math.min(v.clientWidth,dx);v.classList.add('interactive');v.style.transform=`translateX(${x}px)`;if(prev){const ratio=Math.min(1,x/Math.max(1,v.clientWidth));prev.style.transform=`translateX(${(-18+18*ratio).toFixed(2)}px)`;prev.style.opacity=String(.88+.12*ratio)}};const end=e=>{if(!tracking&&!horizontal)return;const t=e.changedTouches?.[0]||e,now=performance.now(),x=t?.clientX??lastX,dx=Math.max(0,x-sx),dt=Math.max(1,now-lastAt),velocity=Math.max(0,(x-lastX)/dt);tracking=false;v.classList.remove('interactive');const complete=horizontal&&(dx>v.clientWidth*.31||(dx>24&&velocity>.5));v.style.transition='transform .26s cubic-bezier(.22,.88,.22,1)';if(prev)prev.style.transition='transform .26s cubic-bezier(.22,.88,.22,1),opacity .26s';if(complete){v.style.pointerEvents='none';v.style.transform='translateX(100%)';if(prev){prev.style.transform='translateX(0)';prev.style.opacity='1'}setTimeout(()=>{if(pushStack[pushStack.length-1]?.id===id){pushStack.pop();if(goalPlannerState?.viewId===id)goalPlannerState=null;v.remove()}if(prev){prev.style.transform='';prev.style.opacity='';prev.style.transition=''}},265)}else{v.style.transform='translateX(0)';if(prev){prev.style.transform='';prev.style.opacity=''}setTimeout(()=>{v.style.transform='';v.style.transition='';if(prev)prev.style.transition=''},270)}horizontal=false};v.addEventListener('touchstart',start,{passive:true});v.addEventListener('touchmove',move,{passive:false});v.addEventListener('touchend',end,{passive:true});v.addEventListener('touchcancel',()=>{cancel()},{passive:true})}
function refreshEmployerDetail(id){const e=employerById(id),top=pushStack[pushStack.length-1],root=top&&document.getElementById(top.id);if(e&&root&&root.dataset?.employerId===id){if(popView())openEmployerDetail(id)}else renderAll()}
function refreshSalaryOpenView(){
  const top=pushStack.at(-1),root=top&&document.getElementById(top.id);
  if(root?.dataset?.employerId){refreshEmployerDetail(root.dataset.employerId);return}
  if(root?.dataset?.salaryListMonth){const month=root.dataset.salaryListMonth;if(popView())mm3SalaryRecordsOpen(month)}
}

function moneyButton(id,label,value){return `<button class="field money-field press" id="${id}"><span class="hint">${esc(label)}</span><span class="val">${yen(value)}</span></button>`}
