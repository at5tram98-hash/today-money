/* ======================================================================
   UI-20260917 · Presentation/accessibility lifecycle
   No data migration, storage keys, amount formulas or import rules change.
   ====================================================================== */
(() => {
  const $=id=>document.getElementById(id);
  
  const amountSelector='.hero-value,.ring-amount,.goal-side-value,.summary-value,.account-balance,.row-value,.money-ticker-value,.mm3-salary-primary-value,.mm3-payment-primary-value,.mm3-assets-primary-value,.mm3-salary-metric strong,.mm3-atf-metric strong,.mm3-assets-metric strong,.mm3-salary-watch-value strong,.mm3-assets-watch-value strong,.mm3-payment-watch-value strong,.calc-number';
  const fitted=new WeakSet(),fitQueue=new Set();let fitFrame=0;
  function fitAmounts(){
    fitFrame=0;
    for(const el of fitQueue){
      if(!el.isConnected||!el.getClientRects().length||el.childElementCount)continue;
      if(!/[¥￥円\d]/.test(el.textContent))continue;
      el.style.removeProperty('font-size');
      const base=parseFloat(getComputedStyle(el).fontSize),available=el.clientWidth;
      if(available>0&&el.scrollWidth>available+1){const size=Math.max(12,Math.floor(base*available/el.scrollWidth));el.style.fontSize=size+'px';el.title=el.textContent.trim()}
    }
    fitQueue.clear();
  }
  function enqueueFit(el){fitQueue.add(el);if(!fitFrame)fitFrame=requestAnimationFrame(fitAmounts)}
  const resizer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>entries.forEach(x=>enqueueFit(x.target))):null;
  function enhance(root){
    if(!root?.querySelectorAll)return;if(root.matches?.(amountSelector))enqueueFit(root);
    root.querySelectorAll('input,select,textarea').forEach(el=>{
      if(!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')&&!el.labels?.length){
        const row=el.closest('.form-section,.form-row,.pro4-parse-row,.goal-category-row');
        const label=row?.querySelector('.form-label,label,.row-title');
        const name=label?.textContent.trim()||el.placeholder;
        if(name)el.setAttribute('aria-label',name);
      }
      if(el.type==='number'&&!el.inputMode)el.inputMode=el.step&&el.step!=='1'?'decimal':'numeric';
      if(el.type==='search'&&!el.enterKeyHint)el.enterKeyHint='search';
    });
    root.querySelectorAll('button.switch').forEach(el=>{
      el.setAttribute('role','switch');el.setAttribute('aria-checked',String(el.classList.contains('on')));
      if(!el.getAttribute('aria-label')){const name=el.closest('.row,.form-section')?.querySelector('.row-title,.form-label')?.textContent.trim();if(name)el.setAttribute('aria-label',name)}
    });
    root.querySelectorAll('.date-nav-btn').forEach(el=>{if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',/prev/i.test(el.id)?'前へ':'次へ')});
    root.querySelectorAll('.large-title,.month-name-btn').forEach(el=>{if(el.tagName!=='BUTTON'){el.setAttribute('role','heading');el.setAttribute('aria-level','1')}});
    root.querySelectorAll(amountSelector).forEach(el=>{if(!fitted.has(el)){fitted.add(el);resizer?.observe(el)}enqueueFit(el)});
    root.querySelectorAll('button svg').forEach(el=>{if(!el.hasAttribute('aria-label')){el.setAttribute('aria-hidden','true');el.setAttribute('focusable','false')}});
  }
  function addShortcut(content,after,label,action){
    if(!after||content.querySelector('.native-quick-action'))return;
    const button=document.createElement('button');button.type='button';button.className='native-quick-action';button.innerHTML=icon('plus')+`<span>${label}</span>`;button.onclick=()=>action();after.after(button);
  }
  function decorate(tab){
    const root=$(`screen-${tab}`);if(!root)return;
    const top=root.querySelector('.topbar'),content=root.querySelector('.scroll');
    insertSidebarNav(top);
    // Keep nodes and their existing handlers; moving them cannot register twice.
    if(tab==='today'||tab==='month'){
      const modes=document.createElement('div');modes.className='native-home-mode';modes.setAttribute('role','group');modes.setAttribute('aria-label','ホームの表示');
      for(const [mode,label] of [['today','今日'],['month','今月']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(tab===mode));b.onclick=()=>{if(activeTab!==mode)switchTab(mode)};modes.appendChild(b)}
      content.querySelector('.native-home-mode')?.remove();content.prepend(modes);
      if(tab==='today'){
        const quick=content.querySelector('.quick-grid'),hero=content.querySelector('.today-goal-hero');if(quick&&hero)hero.after(quick);
        for(const [id,label] of [['quickExpense','支出を入力'],['quickBank','残高を更新'],['quickIncome','臨時収入']]){const span=$(id)?.querySelector('span');if(span)span.textContent=label}
      }else addShortcut(content,content.querySelector('#monthHero'),'今日の支出を入力',()=>openQuickExpense(ymd()));
    }else if(tab==='pay')addShortcut(content,content.querySelector('.mm3-salary-primary'),'給与を登録',openSalaryAdd);
    else if(tab==='payments')addShortcut(content,content.querySelector('.mm3-payment-primary'),'請求額を更新',()=>openQuickCardBilling(paymentHomeMonth()));
    else if(tab==='assets')addShortcut(content,content.querySelector('.mm3-assets-primary'),'残高を更新',openQuickBank);
    if(!content.dataset.nativeScrollBound){content.dataset.nativeScrollBound='true';content.addEventListener('scroll',()=>top.classList.toggle('native-scrolled',content.scrollTop>4),{passive:true})}
    top.classList.toggle('native-scrolled',content.scrollTop>4);
    enhance(root);syncTabState();
  }
  const renders={today:renderToday,month:renderMonth,pay:renderPay,payments:renderPayments,assets:renderAssets,settings:renderSettings};
  renderToday=function(...args){const r=renders.today.apply(this,args);decorate('today');return r};
  renderMonth=function(...args){const r=renders.month.apply(this,args);decorate('month');return r};
  renderPay=function(...args){const r=renders.pay.apply(this,args);decorate('pay');return r};
  renderPayments=function(...args){const r=renders.payments.apply(this,args);decorate('payments');return r};
  renderAssets=function(...args){const r=renders.assets.apply(this,args);decorate('assets');return r};
  renderSettings=function(...args){const r=renders.settings.apply(this,args);decorate('settings');return r};
  function syncTabState(){
    $('tabbar').setAttribute('aria-label','メインナビゲーション');
    document.querySelectorAll('.tab').forEach(b=>{const on=b.dataset.tab===activeTab||(b.dataset.tab==='home'&&['today','month'].includes(activeTab));b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  }
  const dialogs=[$('sheet'),$('calculator'),$('alertWrap'),$('sidebarLayer')];
  for(const el of dialogs){el.setAttribute('role',el.id==='alertWrap'?'alertdialog':'dialog');el.setAttribute('aria-modal','true');el.tabIndex=-1}
  $('calculator').setAttribute('aria-labelledby','calcTitle');$('alertWrap').setAttribute('aria-labelledby','alertTitle');$('alertWrap').setAttribute('aria-describedby','alertMessage');$('sidebarLayer').setAttribute('aria-label','サイドバー');
  const visible=el=>el?.classList.contains('show');
  function activeScope(){
    if(visible($('lockScreen')))return $('lockScreen');
    if($('sidebarLayer').classList.contains('open'))return $('sidebarLayer');
    if(visible($('alertWrap')))return $('alertWrap');
    if(visible($('calculator')))return $('calculator');
    if(visible($('menuLayer')))return $('menuLayer');
    if(visible($('sheet')))return $('sheet');
    const view=pushStack.at(-1);return (view&&$(view.id))||null;
  }
  const returns=new WeakMap();let previousScope=null,scheduled=false;const added=new Set();
  function syncLayers(){
    const scope=activeScope();
    $('app').inert=!!scope;
    document.querySelectorAll('.push-view').forEach(el=>{el.inert=el!==scope});
    for(const el of dialogs){const shown=el.id==='sidebarLayer'?el.classList.contains('open')||el.classList.contains('interactive'):visible(el);el.inert=!shown||(!!scope&&scope!==el);el.setAttribute('aria-hidden',String(!shown))}
    $('menuLayer').inert=!visible($('menuLayer'));
    $('sheet').setAttribute('aria-label',$('sheet').querySelector('.sheet-title')?.textContent.trim()||'入力');
    // The backdrop must always act on the topmost presentation.
    $('dim').onclick=()=>visible($('calculator'))?closeCalc():requestSheetClose();
    if(scope!==previousScope){
      const old=previousScope;previousScope=scope;
      if(scope&&!scope.contains(document.activeElement)){
        if(!returns.has(scope))returns.set(scope,document.activeElement);
        const returnTo=old&&returns.get(old);
        if(returnTo?.isConnected&&scope.contains(returnTo))returnTo.focus({preventScroll:true});
        else{const title=scope.querySelector('.sheet-title,.push-title,#calcTitle,#alertTitle')||scope.querySelector('button')||scope;title.tabIndex=title.matches('button')?title.tabIndex:-1;title.focus({preventScroll:true})}
      }else if(!scope&&old){const el=returns.get(old);if(el?.isConnected&&!el.closest('[inert]'))el.focus({preventScroll:true})}
      if(old&&!old.classList.contains('show')&&!old.classList.contains('open'))returns.delete(old);
    }
  }
  function flush(){scheduled=false;for(const node of added){if(node.isConnected)enhance(node)}added.clear();syncLayers();syncTabState()}
  const observer=new MutationObserver(records=>{
    for(const r of records){if(r.type==='childList'){if(r.target.matches?.(amountSelector))enqueueFit(r.target);for(const n of r.removedNodes){if(n.nodeType!==1||n.isConnected)continue;const removed=[...(n.matches(amountSelector)?[n]:[]),...n.querySelectorAll(amountSelector)];removed.forEach(el=>{resizer?.unobserve(el);fitted.delete(el);fitQueue.delete(el)})}for(const n of r.addedNodes)if(n.nodeType===1)added.add(n);if(r.target.matches?.('.sheet-body,.push-body,.sheet'))added.add(r.target)}else if(r.target.matches?.('button.switch'))enhance(r.target.parentElement)}
    if(!scheduled){scheduled=true;queueMicrotask(flush)}
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{if(e.target.closest?.('#sheet button.switch'))markSheetDirty()});
  document.addEventListener('keydown',e=>{
    const scope=activeScope();if(!scope)return;
    if(e.key==='Escape'){
      if(scope.id==='lockScreen')return;
      e.preventDefault();e.stopImmediatePropagation();
      if(scope.id==='alertWrap')$('alertActions').querySelector('button')?.click();
      else if(scope.id==='calculator')closeCalc();else if(scope.id==='sheet')requestSheetClose();else if(scope.id==='sidebarLayer')closeSidebar();else if(scope.id==='menuLayer')closeMenu();else popView();return;
    }
    if(e.key==='Tab'){
      const list=[...scope.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(el=>!el.closest('[inert]')&&el.getClientRects().length);
      if(!list.length){e.preventDefault();scope.focus();return}
      const index=list.indexOf(document.activeElement);if(index<0||(e.shiftKey&&index===0)||(!e.shiftKey&&index===list.length-1)){e.preventDefault();list[e.shiftKey?list.length-1:0].focus()}
    }
  },true);
  // Track the visible viewport only while editing, preserving pinch zoom.
  let viewportFrame=0;
  function updateViewport(){viewportFrame=0;const vv=window.visualViewport;if(!vv)return;const editing=document.activeElement?.matches('input,textarea,[contenteditable=true]'),inset=Math.max(0,innerHeight-vv.height-vv.offsetTop),keyboard=editing&&vv.scale<=1.05&&inset>100;document.documentElement.classList.toggle('native-keyboard',!!keyboard);document.documentElement.style.setProperty('--native-keyboard-inset',keyboard?inset+'px':'0px');document.documentElement.style.setProperty('--native-viewport-height',vv.height+'px');if(keyboard)document.activeElement.scrollIntoView({block:'nearest',behavior:'auto'})}
  const viewportChanged=()=>{if(!viewportFrame)viewportFrame=requestAnimationFrame(updateViewport)};
  window.visualViewport?.addEventListener('resize',viewportChanged);window.visualViewport?.addEventListener('scroll',viewportChanged);document.addEventListener('focusin',viewportChanged);document.addEventListener('focusout',viewportChanged);
  window.addEventListener('resize',()=>{document.querySelectorAll(amountSelector).forEach(enqueueFit)},{passive:true});
  enhance(document);syncLayers();
})();
/* End UI-20260917 accessibility lifecycle. */

