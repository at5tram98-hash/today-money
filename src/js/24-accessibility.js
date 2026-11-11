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
      if(!el.enterKeyHint&&el.tagName!=='TEXTAREA')el.enterKeyHint=el.type==='search'?'search':'done';
    });
    root.querySelectorAll('button.switch').forEach(el=>{
      el.setAttribute('role','switch');el.setAttribute('aria-checked',String(el.classList.contains('on')));
      if(!el.getAttribute('aria-label')){const name=el.closest('.row,.form-section')?.querySelector('.row-title,.form-label')?.textContent.trim();if(name)el.setAttribute('aria-label',name)}
    });
    root.querySelectorAll('.date-nav-btn').forEach(el=>{if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',/prev/i.test(el.id)?'前へ':'次へ')});
    root.querySelectorAll('.large-title,.month-name-btn').forEach(el=>{if(el.tagName!=='BUTTON'){el.setAttribute('role','heading');el.setAttribute('aria-level','1')}});
    root.querySelectorAll(amountSelector).forEach(el=>{if(!fitted.has(el)){fitted.add(el);resizer?.observe(el)}enqueueFit(el)});
    // A disclosure is artwork, not a font-dependent text character.
    root.querySelectorAll('.chev,.mm3-action-chev,.goal-plan-action>span:last-child').forEach(el=>{
      if(/^[›»]$/.test(el.textContent.trim())&&!el.querySelector('svg'))el.innerHTML=icon('chevronRight');
    });
    root.querySelectorAll('.acf-link').forEach(el=>{
      if(el.childElementCount||!/[›»]\s*$/.test(el.textContent))return;
      const label=document.createElement('span');label.textContent=el.textContent.replace(/\s*[›»]\s*$/,'');
      el.replaceChildren(label);el.insertAdjacentHTML('beforeend',icon('chevronRight'));
    });
    root.querySelectorAll('button svg').forEach(el=>{if(!el.hasAttribute('aria-label')){el.setAttribute('aria-hidden','true');el.setAttribute('focusable','false')}});
  }
  function decorate(tab){
    const root=$(`screen-${tab}`);if(!root)return;
    const top=root.querySelector('.topbar'),content=root.querySelector('.scroll');
    // Keep nodes and their existing handlers; moving them cannot register twice.
    // 第14版: 入力の入口は＋ハブだけ（各画面に同じ入力ボタンを足さない）。今日／今月の切替はホームの支出カード内にある
    // Liquid Glass: 少しスクロールしたら上端をガラスに、見出しの高さ分スクロールしたら中央の小見出しへ切り替える
    const syncScrolled=()=>{const y=content.scrollTop;top.classList.toggle('native-scrolled',y>4);top.classList.toggle('lg-collapsed',y>28)};
    if(!content.dataset.nativeScrollBound){content.dataset.nativeScrollBound='true';content.addEventListener('scroll',syncScrolled,{passive:true})}
    const compact=top.querySelector('.large-title')?.textContent.trim()||'';if(compact)top.dataset.compactTitle=compact;else delete top.dataset.compactTitle;
    syncScrolled();
    enhance(root);syncTabState();
  }
  const renders={today:renderToday,day:renderDay,month:renderMonth,pay:renderPay,payments:renderPayments,payroot:renderPayRoot,assets:renderAssets,settings:renderSettings};
  renderToday=function(...args){const r=renders.today.apply(this,args);decorate('today');return r};
  renderDay=function(...args){const r=renders.day.apply(this,args);decorate('day');return r};
  renderMonth=function(...args){const r=renders.month.apply(this,args);decorate('month');return r};
  renderPayRoot=function(...args){const r=renders.payroot.apply(this,args);decorate('payroot');return r};
  renderPay=function(...args){const r=renders.pay.apply(this,args);decorate('pay');return r};
  renderPayments=function(...args){const r=renders.payments.apply(this,args);decorate('payments');return r};
  renderAssets=function(...args){const r=renders.assets.apply(this,args);decorate('assets');return r};
  renderSettings=function(...args){const r=renders.settings.apply(this,args);decorate('settings');return r};
  function syncTabState(){
    $('tabbar').setAttribute('aria-label','メインナビゲーション');
    syncTabButtons(false);
  }
  const dialogs=[$('sheet'),$('calculator'),$('alertWrap')];
  for(const el of dialogs){el.setAttribute('role',el.id==='alertWrap'?'alertdialog':'dialog');el.setAttribute('aria-modal','true');el.tabIndex=-1}
  $('calculator').setAttribute('aria-labelledby','calcTitle');$('alertWrap').setAttribute('aria-labelledby','alertTitle');$('alertWrap').setAttribute('aria-describedby','alertMessage');
  const visible=el=>el?.classList.contains('show');
  function activeScope(){
    if(visible($('lockScreen')))return $('lockScreen');
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
    for(const el of dialogs){const shown=visible(el);el.inert=!shown||(!!scope&&scope!==el);el.setAttribute('aria-hidden',String(!shown))}
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
      else if(scope.id==='calculator')closeCalc();else if(scope.id==='sheet')requestSheetClose();else if(scope.id==='menuLayer')closeMenu();else popView();return;
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

