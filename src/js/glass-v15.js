/* ======================================================================
   Liquid Glass 第2段
   - 並べ替えは右の「≡」を上下になぞる（上下ボタンは置かない）。キーボードでは ≡ に合わせて上下の矢印キー
   - プロフィールボタン = ホーム専用の設定（他のタブへ移るボタンは置かない）
   - ＋ = すぐに全画面の「新規入力」。何を入力するかをその場で選ぶ
   - 専用画面（今日の支出・今月の支出・給与・資産・請求一覧）も左端からのスワイプで戻る
   - 検索 = ガラスの検索欄・種類の切替・最近の検索・グループごとの結果・強調表示。かな/カナ・全角/半角・金額・日付で探せる
   - その他 = アプリ全体の設定（起動時の画面・週の始まり・ガラスの質感・数字の書体・文字の太さ・ボタンの形・コントラスト・プライバシー）
   会計データ（取引・残高・請求・給与）はここでは書き換えない。保存するのは表示の設定だけ。
   ====================================================================== */

/* ---------- 並べ替え（≡ を上下になぞる） ---------- */
const GRIP_SVG='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';
function dragHandleHtml(label){return `<button type="button" class="drag-handle" aria-label="${esc(label)}の並べ替え。上下にドラッグ、または上下の矢印キーで移動">${GRIP_SVG}</button>`}
/* list の直下の [data-reorder-key] を並べ替える。onReorder(新しい順のキー配列, 動かしたキー) */
function installDragReorder(list,onReorder){
  if(!list||list.dataset.reorderBound)return;list.dataset.reorderBound='1';
  const rows=()=>[...list.querySelectorAll(':scope > [data-reorder-key]')];
  const commit=(order,key)=>{onReorder(order,key);requestAnimationFrame(()=>list.querySelector(`[data-reorder-key="${CSS.escape(key)}"] .drag-handle`)?.focus({preventScroll:true}))};
  list.addEventListener('keydown',e=>{
    const h=e.target.closest?.('.drag-handle');if(!h||!['ArrowUp','ArrowDown'].includes(e.key))return;
    const row=h.closest('[data-reorder-key]'),all=rows(),i=all.indexOf(row),j=i+(e.key==='ArrowUp'?-1:1);if(i<0||j<0||j>=all.length)return;
    e.preventDefault();const order=all.map(r=>r.dataset.reorderKey);order.splice(j,0,order.splice(i,1)[0]);feedback?.selection?.();commit(order,row.dataset.reorderKey);
  });
  list.addEventListener('pointerdown',e=>{
    const h=e.target.closest?.('.drag-handle');if(!h||!list.contains(h)||e.button>0)return;
    const row=h.closest('[data-reorder-key]'),all=rows(),from=all.indexOf(row);if(from<0)return;
    e.preventDefault();const rects=all.map(r=>r.getBoundingClientRect()),startY=e.clientY,height=rects[from].height;let to=from;
    try{h.setPointerCapture(e.pointerId)}catch(err){}
    row.classList.add('reorder-lifted');list.classList.add('reordering');feedback?.selection?.();
    const move=ev=>{
      const dy=ev.clientY-startY;row.style.transform=`translateY(${dy}px) scale(1.02)`;
      const center=rects[from].top+height/2+dy;let t=from;
      for(let k=0;k<rects.length;k++){const mid=rects[k].top+rects[k].height/2;if(k<from&&center<=mid){t=k;break}if(k>from&&center>=mid)t=k}
      if(t!==to){to=t;feedback?.selection?.()}
      all.forEach((r,k)=>{if(r===row)return;const s=from<to&&k>from&&k<=to?-height:from>to&&k>=to&&k<from?height:0;r.style.transform=s?`translateY(${s}px)`:''});
    };
    const up=()=>{
      h.removeEventListener('pointermove',move);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up);
      all.forEach(r=>{r.style.transform=''});row.classList.remove('reorder-lifted');list.classList.remove('reordering');
      if(to!==from){const order=all.map(r=>r.dataset.reorderKey);order.splice(to,0,order.splice(from,1)[0]);commit(order,row.dataset.reorderKey)}
    };
    h.addEventListener('pointermove',move);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up);
  });
}

/* ---------- ホームの設定（プロフィールボタン） ---------- */
const HOME_PREF_DEFAULTS={startPeriod:'last',hideAmounts:false,showCharts:true,showCaptions:true,showAlert:true,recentCount:3,wash:true,compact:false};
function homePrefs(){return{...HOME_PREF_DEFAULTS,...(data.homePrefs&&typeof data.homePrefs==='object'?data.homePrefs:{})}}
let homeSessionPeriod=null,homeSessionData=null;
function homePeriod(){if(homeSessionData!==data)homeSessionPeriod=null;if(homeSessionPeriod)return homeSessionPeriod;const p=homePrefs().startPeriod;if(p==='today'||p==='month')return p;return data.homeViewMode==='month'?'month':'today'}
function setHomePeriod(mode){
  if(homePeriod()===mode&&data.homeViewMode===mode)return;homeSessionPeriod=mode;homeSessionData=data;
  try{safeCommit(()=>{data.homeViewMode=mode},{label:'home period',invalidateAcf:false})}catch(e){}
  feedback?.selection?.();renderToday();
}
function saveHomeSettings(fn){
  const L=homeLayout(),next={layout:{cards:[...L.cards],rows:[...L.rows],hidden:[...L.hidden]},prefs:homePrefs()};fn(next);
  try{safeCommit(()=>{data.homeLayout=next.layout;data.homePrefs=next.prefs},{label:'home settings',invalidateAcf:false})}catch(e){return false}
  renderToday();return true;
}
function homeSettingsHtml(){
  const L=homeLayout(),P=homePrefs(),st=profileState();
  const item=(k)=>`<div class="row hs-row" data-reorder-key="${k}"><button type="button" class="switch ${L.hidden.has(k)?'':'on'}" data-layout-toggle="${k}" role="switch" aria-checked="${!L.hidden.has(k)}" aria-label="${esc(HOME_SECTION_LABELS[k])}を表示"></button><div class="row-main"><div class="row-title">${esc(HOME_SECTION_LABELS[k])}</div></div>${dragHandleHtml(HOME_SECTION_LABELS[k])}</div>`;
  const sw=(k,title,sub='')=>`<div class="row hs-row"><div class="row-main"><div class="row-title">${esc(title)}</div>${sub?`<div class="row-sub">${esc(sub)}</div>`:''}</div><button type="button" class="switch ${P[k]?'on':''}" data-home-pref="${k}" role="switch" aria-checked="${!!P[k]}" aria-label="${esc(title)}"></button></div>`;
  const seg=(k,label,opts)=>`<div class="hs-seg-block"><div class="hs-seg-label">${esc(label)}</div><div class="glass-seg" role="radiogroup" aria-label="${esc(label)}">${opts.map(([v,l])=>`<button type="button" role="radio" aria-checked="${String(P[k])===String(v)}" data-home-pref-set="${k}" data-value="${v}">${esc(l)}</button>`).join('')}</div></div>`;
  return `<div class="hs-hero hs-hero-center"><div class="hs-avatar ring-${st.key}">${profileAvatarHtml('hs-avatar-img')}</div><div class="hs-name">${esc(data.profile?.name||'ホーム')}</div><div class="hs-state"><span class="profile-state-mark ring-${st.key}" aria-hidden="true"></span>${esc(st.label)}<span class="hs-state-note">${esc(st.note||'')}</span></div></div>
  <h2 class="section-head">カード</h2><p class="hs-help">右の ≡ を上下になぞると並び順が変わります。スイッチで表示・非表示。</p><div class="group hs-list" id="hsCards">${L.cards.map(item).join('')}</div>
  <h2 class="section-head">最近の動き</h2><div class="group hs-list" id="hsRows">${L.rows.map(item).join('')}</div>
  <h2 class="section-head">支出カード</h2><div class="group hs-block">${seg('startPeriod','開いた時の期間',[['last','前回のまま'],['today','今日'],['month','今月']])}</div>
  <h2 class="section-head">表示</h2><div class="group">${sw('hideAmounts','金額を隠す','ホームの金額を「••••」で表示')}${sw('showCharts','カードのグラフ')}${sw('showCaptions','カードの補足','更新時刻や説明の行')}${sw('showAlert','警告カード','確認が必要なお知らせをホームの上に表示')}${sw('wash','上部の色のにじみ')}${sw('compact','カードを詰めて表示','余白を減らして多く表示')}</div>
  <h2 class="section-head">一覧の件数</h2><div class="group hs-block">${seg('recentCount','カテゴリと取引の表示件数',[[3,'3件'],[5,'5件'],[10,'10件']])}</div>
  <button type="button" class="secondary hs-reset" id="hsReset">ホームの表示を初期の状態に戻す</button><p class="form-helper">ここで変えるのはホームの見た目だけです。記録や残高は変わりません。</p>`;
}
function openHomeSettings(){
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="hsClose">閉じる</button><div class="sheet-title">ホームの設定</div><span></span></div><div class="sheet-body home-settings" id="homeSettingsBody">${homeSettingsHtml()}</div>`,'full',root=>{
    root.closest('#sheet')?.classList.add('glass-sheet');
    const body=root.querySelector('#homeSettingsBody');
    const redraw=()=>{const y=body.scrollTop;body.innerHTML=homeSettingsHtml();body.scrollTop=y;bind()};
    const bind=()=>{
      body.querySelectorAll('[data-layout-toggle]').forEach(b=>b.onclick=()=>{const k=b.dataset.layoutToggle;if(saveHomeSettings(n=>{const h=n.layout.hidden;n.layout.hidden=h.includes(k)?h.filter(x=>x!==k):[...h,k]})){feedback?.selection?.();redraw()}});
      body.querySelectorAll('[data-home-pref]').forEach(b=>b.onclick=()=>{const k=b.dataset.homePref;if(saveHomeSettings(n=>{n.prefs[k]=!n.prefs[k]})){feedback?.selection?.();redraw()}});
      body.querySelectorAll('[data-home-pref-set]').forEach(b=>b.onclick=()=>{const k=b.dataset.homePrefSet,v=k==='recentCount'?Number(b.dataset.value):b.dataset.value;if(k==='startPeriod'){homeSessionPeriod=v==='last'?null:v;homeSessionData=data}if(saveHomeSettings(n=>{n.prefs[k]=v})){feedback?.selection?.();redraw()}});
      installDragReorder(body.querySelector('#hsCards'),order=>{if(saveHomeSettings(n=>{n.layout.cards=order}))redraw()});
      installDragReorder(body.querySelector('#hsRows'),order=>{if(saveHomeSettings(n=>{n.layout.rows=order}))redraw()});
      body.querySelector('#hsReset').onclick=async()=>{if(!await showAlert('ホームの表示を戻しますか？','カードの並び・表示と、このページの設定を初期の状態に戻します。記録は変わりません。',{okText:'戻す',destructive:true}))return;homeSessionPeriod=null;try{safeCommit(()=>{data.homeLayout={};data.homePrefs={}},{label:'home settings reset',invalidateAcf:false})}catch(e){return}renderToday();redraw();showToast('ホームの表示を初期の状態に戻しました')};
    };
    root.querySelector('#hsClose').onclick=closeSheet;bind();
  });
}
/* ホームの描画後に表示の設定を反映する（金額を隠す・グラフ・補足・警告・にじみ・詰めて表示） */
function applyHomePrefs(){
  const P=homePrefs(),screen=document.getElementById('screen-today'),content=document.getElementById('todayContent');if(!screen||!content)return;
  screen.classList.toggle('no-wash',!P.wash);content.classList.toggle('home-compact',!!P.compact);content.classList.toggle('home-no-charts',!P.showCharts);content.classList.toggle('home-no-captions',!P.showCaptions);
  if(!P.showAlert)content.querySelector('.home-alert')?.remove();
  if(P.hideAmounts){content.classList.add('home-hidden-amounts');content.querySelectorAll('.home-card-value,.row-value,.hl-value,.np-amount,.hl-bar-value').forEach(el=>{if(/[¥￥\d]/.test(el.textContent)&&!el.dataset.masked){el.dataset.masked='1';el.setAttribute('aria-label','金額は非表示');el.textContent='••••'}});content.querySelectorAll('.home-card-body[aria-label]').forEach(b=>b.setAttribute('aria-label',b.getAttribute('aria-label').replace(/[−-]?[¥￥][\d,]+/g,'金額非表示')))}
  else content.classList.remove('home-hidden-amounts');
}

/* ---------- ＋ = 全画面の「新規入力」 ---------- */
function entryHubGroups(){
  const date=['today','day'].includes(activeTab)?trackingDate:ymd();
  return[
    {title:'よく使う入力',big:true,items:[
      {id:'entryExpense',sym:'cart',color:'var(--orange)',title:'支出を記録',sub:'使った金額を記録',run:()=>openQuickExpense(date)},
      {id:'entryIncome',sym:'wallet',color:'var(--green)',title:'臨時収入',sub:'給与以外の入金',run:()=>openTempIncome(date)},
      {id:'entryBank',sym:'bank',color:'var(--accent)',title:'残高を更新',sub:'口座の今の残高',run:openQuickBank},
      {id:'entrySalary',sym:'briefcase',color:'var(--teal)',title:'給与を登録',sub:'今月の給与・予定',run:openSalaryAdd}]},
    {title:'すばやく入力',items:[
      {id:'ihCard',sym:'card',color:'var(--purple)',title:'カードの請求額を更新',sub:'カードを選んで今月の請求額を入力',run:()=>openQuickCardBilling(paymentHomeMonth())},
      {id:'ihRepeat',sym:'repeat',color:'var(--orange)',title:'最近の支出を再利用',sub:'前に記録した支出から選ぶ',run:()=>openQuickRepeat(trackingDate)},
      {id:'ihOneLine',sym:'edit',color:'var(--accent)',title:'一行入力',sub:'「コンビニ 580円」のように書いて記録',run:()=>openSmartInputSearch('input')}]},
    {title:'新しく登録',items:[
      {id:'ihBank',sym:'bank',color:'var(--accent)',title:'銀行口座を追加',sub:'',run:openAddBank},
      {id:'ihEmployer',sym:'briefcase',color:'var(--teal)',title:'勤務先を追加',sub:'',run:()=>openEmployerCreate(()=>renderAll())},
      {id:'ihCredit',sym:'card',color:'var(--purple)',title:'クレジットカードを追加',sub:'',run:()=>openAddCard()},
      {id:'ihDebit',sym:'card',color:'var(--green)',title:'デビットカードを追加',sub:'',run:()=>openAddDebit()},
      {id:'ihFixed',sym:'repeat',color:'var(--red)',title:'固定支払いを追加',sub:'家賃・サブスクなど',run:()=>openFixedPayment()},
      {id:'ihLarge',sym:'cart',color:'var(--orange)',title:'大型支出を計画',sub:'',run:()=>openLargeExpenseEditor(null,{after:renderAll})},
      {id:'ihGoal',sym:'gift',color:'var(--purple)',title:'旅行・プレゼント目標',sub:'',run:()=>openEventGoalEditor()}]}
  ];
}
function openEntryHub(){
  const groups=entryHubGroups(),all=groups.flatMap(g=>g.items);
  const tile=x=>`<button type="button" class="entry-tile" id="${x.id}" style="--tile:${x.color}"><span class="entry-tile-icon" aria-hidden="true">${icon(x.sym)}</span><span class="entry-tile-title">${esc(x.title)}</span><span class="entry-tile-sub">${esc(x.sub)}</span></button>`;
  const row=x=>`<button type="button" class="row press entry-row" id="${x.id}" style="--tile:${x.color}"><span class="entry-row-icon" aria-hidden="true">${icon(x.sym)}</span><div class="row-main"><div class="row-title">${esc(x.title)}</div>${x.sub?`<div class="row-sub">${esc(x.sub)}</div>`:''}</div><span class="chev">${icon('chevronRight')}</span></button>`;
  const html=`<div class="sheet-nav"><button type="button" class="nav-text" id="entryClose">閉じる</button><div class="sheet-title">新規入力</div><span></span></div><div class="sheet-body entry-hub" id="entryHub"><p class="entry-lead">何を入力しますか？</p>${groups.map(g=>`<h2 class="section-head">${esc(g.title)}</h2>${g.big?`<div class="entry-grid">${g.items.map(tile).join('')}</div>`:`<div class="group">${g.items.map(row).join('')}</div>`}`).join('')}</div>`;
  openSheet(html,'full',root=>{
    const sheet=root.closest('#sheet');sheet?.classList.add('glass-sheet','from-hub');setTimeout(()=>sheet?.classList.remove('from-hub'),600);
    root.querySelector('#entryClose').onclick=closeSheet;
    for(const x of all)root.querySelector('#'+x.id).onclick=()=>{feedback?.selection?.();closeSheet();x.run()};
  });
}
document.getElementById('addHub')?.addEventListener('click',()=>{feedback?.selection?.();openEntryHub()});
/* 旧「その他の入力」（push画面）も同じ「新規入力」へ */
function openOtherInputs(){openEntryHub()}
function addHubItems(){return entryHubGroups().flatMap(g=>g.items).map(x=>({label:x.title,icon:x.sym,action:x.run}))}

/* ---------- 専用画面の左端スワイプで戻る ---------- */
(function installDetailEdgeBack(){
  const app=document.getElementById('app');if(!app)return;let g=null;
  const blocked=()=>document.getElementById('sheet')?.classList.contains('show')||document.querySelector('#pushLayer .push-view.show')||document.getElementById('menuLayer')?.classList.contains('show')||document.getElementById('calculator')?.classList.contains('show')||(typeof goalPlannerState!=='undefined'&&goalPlannerState?.locked);
  const reset=()=>{if(!g)return;for(const el of [g.screen,g.under]){el.style.transition='';el.style.transform='';el.style.opacity=''}g.under.classList.remove('swipe-under');g.screen.classList.remove('swipe-top');g=null};
  app.addEventListener('touchstart',e=>{
    if(!isDetailScreen()||blocked()||e.touches.length>1)return;const t=e.touches[0];if(t.clientX>24)return;
    const screen=document.getElementById(`screen-${activeTab}`),under=document.getElementById(`screen-${ROOT_SCREENS[detailOrigin]||'today'}`);if(!screen||!under)return;
    g={screen,under,sx:t.clientX,sy:t.clientY,lastX:t.clientX,lastAt:performance.now(),horizontal:false};
  },{passive:true,capture:true});
  app.addEventListener('touchmove',e=>{
    if(!g)return;const t=e.touches[0],dx=Math.max(0,t.clientX-g.sx),dy=Math.abs(t.clientY-g.sy);
    if(!g.horizontal){if(dy>11&&dy>dx*1.15){g=null;return}if(dx<7)return;g.horizontal=true;g.under.classList.add('swipe-under');g.screen.classList.add('swipe-top')}
    e.preventDefault();e.stopPropagation();g.lastX=t.clientX;g.lastAt=performance.now();
    const w=g.screen.clientWidth,x=Math.min(w,dx),r=x/Math.max(1,w);g.screen.style.transform=`translateX(${x}px)`;g.under.style.transform=`translateX(${(-30+30*r).toFixed(2)}%)`;g.under.style.opacity=String(.85+.15*r);
  },{passive:false,capture:true});
  const end=e=>{
    if(!g)return;if(!g.horizontal){g=null;return}e.stopPropagation();
    const t=e.changedTouches?.[0],x=t?.clientX??g.lastX,dx=Math.max(0,x-g.sx),v=Math.max(0,(x-g.lastX)/Math.max(1,performance.now()-g.lastAt)),w=g.screen.clientWidth,done=dx>w*.31||(dx>24&&v>.5);
    const cur=g;const ease='transform .26s cubic-bezier(.22,.88,.22,1),opacity .26s';cur.screen.style.transition=ease;cur.under.style.transition=ease;
    if(done){cur.screen.style.transform='translateX(100%)';cur.under.style.transform='translateX(0)';cur.under.style.opacity='1';setTimeout(()=>{g=cur;reset();closeDetailScreen()},265)}
    else{cur.screen.style.transform='translateX(0)';cur.under.style.transform='translateX(-30%)';setTimeout(()=>{g=cur;reset()},270)}
    g=null;
  };
  app.addEventListener('touchend',end,{capture:true});app.addEventListener('touchcancel',()=>{reset()},{capture:true});
})();

/* ---------- 検索（ガラスの検索欄・横断検索） ---------- */
function searchFold(s){return String(s??'').normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60)).replace(/[\s,，、・]/g,'')}
function searchParseQuery(q){
  const tokens=String(q||'').normalize('NFKC').trim().split(/[\s　]+/).filter(Boolean),out={words:[],min:null,max:null,amounts:[],dates:[],months:[]};
  for(const raw of tokens){
    const t=raw.replace(/[¥￥,円]/g,'');let m;
    if((m=t.match(/^>=?(\d+)$/)))out.min=Number(m[1]);
    else if((m=t.match(/^<=?(\d+)$/)))out.max=Number(m[1]);
    else if((m=t.match(/^(\d+)[-〜~](\d+)$/))&&!/^\d{4}[-/]\d{1,2}$/.test(t)){out.min=Number(m[1]);out.max=Number(m[2])}
    else if((m=t.match(/^(\d{1,2})\/(\d{1,2})$/)))out.dates.push(`-${pad(Number(m[1]))}-${pad(Number(m[2]))}`);
    else if((m=t.match(/^(\d{1,2})月(\d{1,2})日?$/)))out.dates.push(`-${pad(Number(m[1]))}-${pad(Number(m[2]))}`);
    else if((m=t.match(/^(\d{1,2})月$/)))out.months.push(`-${pad(Number(m[1]))}-`);
    else if((m=t.match(/^(\d{4})[-/](\d{1,2})$/)))out.months.push(`${m[1]}-${pad(Number(m[2]))}`);
    else if(/^\d{3,}$/.test(t)){out.amounts.push(Number(t));out.words.push(searchFold(raw))}
    else out.words.push(searchFold(raw));
  }
  return out;
}
const SEARCH_SCOPES=[['all','すべて'],['transaction','支出'],['salary','給与'],['account','口座'],['card','カード'],['payment','支払い'],['goal','目標'],['setting','設定']];
const SEARCH_GROUP_META={transaction:['支出','cart','var(--orange)'],income:['臨時収入','wallet','var(--green)'],salary:['給与','briefcase','var(--teal)'],account:['口座','bank','var(--accent)'],card:['カード','card','var(--purple)'],payment:['支払い','repeat','var(--red)'],goal:['目標','gift','var(--purple)'],category:['カテゴリ','grid','var(--orange)'],setting:['設定','settings','#8E8E93']};
function searchSettingEntries(){
  if(!document.querySelector('#settingsContent .settings-list-row'))try{renderSettings()}catch(e){}
  return [...document.querySelectorAll('#settingsContent .settings-list-row[id]')].map(b=>({type:'setting',id:b.id,title:b.querySelector('.settings-row-title')?.textContent||'',sub:b.querySelector('.settings-row-detail')?.textContent||'その他',hay:b.textContent,open:()=>document.getElementById(b.id)?.click()}));
}
function searchIndex(){
  const out=[],cat=n=>catByName(n);
  for(const t of data.transactions)out.push({type:'transaction',cat:t.category,id:t.id,title:t.merchant||t.category||'支出',sub:`${dayLabel(t.date)}・${t.category||''}・${paymentLabel(t)}`,amount:Number(t.amount)||0,date:t.date,hay:`${t.merchant} ${t.category} ${t.memo||''} ${paymentLabel(t)} ${(t.tags||[]).join(' ')}`,sym:normalizeCategoryIcon(cat(t.category)?.icon,cat(t.category)?.id),open:()=>openTransactionDetail(t.id)});
  for(const x of data.tempIncomes||[])out.push({type:'income',id:x.id,title:x.name||x.source||'臨時収入',sub:dayLabel(x.date),amount:Number(x.amount)||0,date:x.date,hay:`${x.name||''} ${x.source||''} ${x.memo||''} 臨時収入`,open:()=>openTempIncomeHistory()});
  for(const r of data.salaryRecords){const e=data.employers.find(x=>x.id===r.employerId);out.push({type:'salary',id:r.id,title:e?.name||'給与',sub:`${r.date?dayLabel(r.date):''}・${r.status||''}`,amount:salaryRecordExpectedOrReceivedAmount(r),date:r.date,hay:`${e?.name||''} 給与 ${r.status||''} ${r.memo||''}`,open:()=>openSalaryRecordEdit(r.id)})}
  for(const e of data.employers)out.push({type:'salary',id:'emp-'+e.id,title:e.name,sub:'勤務先',hay:`${e.name} 勤務先`,open:()=>openEmployerDetail(e.id)});
  for(const b of data.banks)out.push({type:'account',id:b.id,title:b.name||'口座',sub:'銀行口座',amount:Number(b.balance)||0,hay:`${b.name} 銀行 口座 残高`,open:()=>openBankDetail(b.id)});
  for(const c of data.cards)out.push({type:'card',id:c.id,title:c.name,sub:'クレジットカード',hay:`${c.name} カード クレジット`,open:()=>openCardDetail(c.id,assetBillingMonth)});
  for(const d of data.debitCards||[])out.push({type:'card',id:'debit-'+d.id,title:d.name,sub:'デビットカード',hay:`${d.name} デビット カード`,open:()=>openDebitDetail(d.id)});
  for(const f of data.fixedPayments)out.push({type:'payment',id:f.id,title:f.name||'固定支払い',sub:`固定支払い${f.day?`・毎月${f.day}日`:''}`,amount:Number(f.amount)||0,hay:`${f.name} 固定 支払い サブスク`,open:()=>openFixedPayment(f)});
  for(const p of data.largeExpensePlans)out.push({type:'payment',id:p.id,title:p.name,sub:`大型支出・${p.date?dayLabel(p.date):''}`,amount:Number(p.amount)||0,date:p.date,hay:`${p.name} 大型 支出 計画`,open:()=>openLargeExpenseDetail(p.id)});
  for(const g of data.eventGoals||[])out.push({type:'goal',id:g.id,title:g.name,sub:`目標${g.deadline?`・期限 ${dayLabel(g.deadline)}`:''}`,amount:Number(g.targetAmount||g.amount)||0,hay:`${g.name} 目標 旅行 プレゼント`,open:()=>openEventGoalDetail(g.id)});
  for(const c of data.categories)out.push({type:'category',id:'cat-'+c.id,title:c.name,sub:'カテゴリの取引を表示',hay:`${c.name} カテゴリ`,sym:normalizeCategoryIcon(c.icon,c.id),open:()=>openTransactionList({category:c.name,title:c.name})});
  return out.concat(searchSettingEntries());
}
const SEARCH_SCOPE_TYPES={all:null,transaction:['transaction','income','category'],salary:['salary'],account:['account'],card:['card'],payment:['payment'],goal:['goal'],setting:['setting']};
const SEARCH_PERIODS=[['all','すべての期間'],['today','今日'],['week','今週'],['month','今月'],['lastMonth','先月'],['3m','過去3か月'],['year','今年']];
function searchPeriodRange(p){const t=ymd(),m=t.slice(0,7),end=x=>`${x}-${pad(new Date(Number(x.slice(0,4)),Number(x.slice(5,7)),0).getDate())}`;
  if(p==='today')return [t,t];if(p==='week'){const s=spendWeekStart(t);return [s,spendAddDays(s,6)]}if(p==='month')return [`${m}-01`,end(m)];
  if(p==='lastMonth'){const l=addMonths(m,-1);return [`${l}-01`,end(l)]}if(p==='3m')return [`${addMonths(m,-2)}-01`,t];if(p==='year')return [`${t.slice(0,4)}-01-01`,`${t.slice(0,4)}-12-31`];return null}
function runGlobalSearch(query,scope='all',filters={}){
  const q=searchParseQuery(query),types=SEARCH_SCOPE_TYPES[scope]||null,range=filters.period&&filters.period!=='all'?searchPeriodRange(filters.period):null,cat=filters.category||'',empty=!q.words.length&&q.min==null&&q.max==null&&!q.dates.length&&!q.months.length;if(empty&&!range&&!cat)return[];
  const res=[];
  for(const it of searchIndex()){
    if(types&&!types.includes(it.type))continue;
    if(range&&(!it.date||it.date<range[0]||it.date>range[1]))continue;
    if(cat&&it.cat!==cat)continue;
    const hay=searchFold(`${it.title} ${it.hay||''} ${it.sub||''}`),title=searchFold(it.title);let score=0,ok=true;
    for(const w of q.words){const amountHit=q.amounts.length&&it.amount!=null&&q.amounts.includes(Math.round(Math.abs(it.amount)))&&/^\d+$/.test(w);if(hay.includes(w)){score+=title.startsWith(w)?30:title.includes(w)?20:8}else if(amountHit)score+=25;else{ok=false;break}}
    if(!ok)continue;
    if(q.min!=null||q.max!=null){if(it.amount==null)continue;const a=Math.abs(it.amount);if(q.min!=null&&a<q.min||q.max!=null&&a>q.max)continue;score+=5}
    if(q.dates.length){if(!it.date||!q.dates.some(d=>it.date.endsWith(d.slice(1))||it.date.includes(d)))continue;score+=10}
    if(q.months.length){if(!it.date||!q.months.some(m=>it.date.includes(m)))continue;score+=6}
    if(it.date)score+=Math.max(0,3-Math.floor((Date.now()-parseYmd(it.date).getTime())/864e5/60));
    res.push({...it,score});
  }
  return res.sort((a,b)=>b.score-a.score||String(b.date||'').localeCompare(String(a.date||'')));
}
function searchHighlight(text,query){
  let html=esc(text);const words=String(query||'').normalize('NFKC').trim().split(/[\s　]+/).filter(w=>w&&!/^[<>]/.test(w)).map(w=>w.replace(/[¥￥,円]/g,'')).filter(Boolean);
  for(const w of words){const re=new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi');html=html.replace(re,m=>`<mark>${m}</mark>`)}
  return html;
}
function recentSearches(){return Array.isArray(data.recentSearches)?data.recentSearches.slice(0,8):[]}
function rememberSearch(q){q=String(q||'').trim();if(!q)return;try{safeCommit(()=>{data.recentSearches=[q,...recentSearches().filter(x=>x!==q)].slice(0,8)},{render:false,label:'recent search',invalidateAcf:false})}catch(e){}}
function openGlobalSearchView(initialScope='all'){
  let query='',scope=initialScope,expanded=new Set(),period='all',category='';
  pushView('検索',`<div class="gsearch"><div class="gsearch-bar"><label class="gsearch-field">${icon('search')}<input type="search" id="globalSearchInput" enterkeyhint="search" autocomplete="off" placeholder="取引・給与・口座・カード・設定を検索" aria-label="検索"><button type="button" class="gsearch-clear" id="globalSearchClear" aria-label="検索語を消す" hidden>${icon('close')}</button></label></div><div class="gsearch-scopes glass-seg wide" role="radiogroup" aria-label="検索する種類" id="globalSearchScopes"></div><div class="gsearch-filters" id="globalSearchFilters"></div><div class="gsearch-results" id="globalSearchResults" aria-live="polite"></div></div>`,root=>{
    root.classList.add('gsearch-view');
    const input=root.querySelector('#globalSearchInput'),clear=root.querySelector('#globalSearchClear'),scopes=root.querySelector('#globalSearchScopes'),out=root.querySelector('#globalSearchResults'),filters=root.querySelector('#globalSearchFilters');
    const filtered=()=>period!=='all'||!!category;
    const drawFilters=()=>{const pl=SEARCH_PERIODS.find(x=>x[0]===period)?.[1]||'すべての期間';filters.innerHTML=`<button type="button" class="gsearch-filter${period!=='all'?' on':''}" id="gsPeriodChip" aria-haspopup="dialog" aria-label="期間で絞り込む（現在: ${esc(pl)}）">${icon('calendar')}<span>${esc(period==='all'?'期間':pl)}</span>${icon('chevronDown')}</button><button type="button" class="gsearch-filter${category?' on':''}" id="gsCategoryChip" aria-haspopup="dialog" aria-label="カテゴリで絞り込む（現在: ${esc(category||'すべて')}）">${icon('grid')}<span>${esc(category||'カテゴリ')}</span>${icon('chevronDown')}</button>`;
      filters.querySelector('#gsPeriodChip').onclick=()=>pickFilter('期間',SEARCH_PERIODS,period,v=>{period=v});
      filters.querySelector('#gsCategoryChip').onclick=()=>pickFilter('カテゴリ',[['','すべてのカテゴリ'],...data.categories.map(c=>[c.name,c.name])],category,v=>{category=v})};
    const pickFilter=(title,options,current,apply)=>openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="gsfCancel">キャンセル</button><div class="sheet-title">${esc(title)}</div><span style="min-width:64px"></span></div><div class="sheet-body gsearch-filter-sheet"><div class="group" role="radiogroup" aria-label="${esc(title)}">${options.map(([v,l])=>`<button type="button" class="row press option-row" role="radio" aria-checked="${current===v}" data-gsf="${esc(v)}"><div class="row-main"><div class="row-title">${esc(l)}</div>${title==='期間'&&v!=='all'?`<div class="row-sub">${(r=>r?`${spendJpDay(r[0])}〜${spendJpDay(r[1])}`:'')(searchPeriodRange(v))}</div>`:''}</div><span class="option-check" aria-hidden="true">${current===v?icon('check'):''}</span></button>`).join('')}</div></div>`,'half',sh=>{
      sh.querySelector('#gsfCancel').onclick=closeSheet;
      sh.querySelectorAll('[data-gsf]').forEach(b=>b.onclick=()=>{apply(b.dataset.gsf);feedback?.selection?.();closeSheet();expanded.clear();drawFilters();draw()})});
    const drawScopes=()=>{scopes.innerHTML=SEARCH_SCOPES.map(([v,l])=>`<button type="button" role="radio" aria-checked="${scope===v}" data-search-scope="${v}">${esc(l)}</button>`).join('');scopes.querySelectorAll('[data-search-scope]').forEach(b=>b.onclick=()=>{scope=b.dataset.searchScope;expanded.clear();feedback?.selection?.();drawScopes();draw()})};
    const suggestions=()=>{const freq=new Map();for(const t of data.transactions.slice(-200)){if(t.merchant)freq.set(t.merchant,(freq.get(t.merchant)||0)+1)}return [...freq].sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]).concat(data.categories.slice(0,4).map(c=>c.name))};
    const draw=()=>{
      clear.hidden=!query;
      if(!query.trim()&&!filtered()){
        const rec=recentSearches(),saved=data.savedSearches||[];
        out.innerHTML=`${rec.length?`<div class="gsearch-section-head"><h2>最近の検索</h2><button type="button" class="gsearch-link" id="gsClearRecent">消去</button></div><div class="group">${rec.map(r=>`<button type="button" class="row press" data-gs-recent="${esc(r)}"><span class="gsearch-row-icon" aria-hidden="true">${icon('clock')}</span><div class="row-main"><div class="row-title">${esc(r)}</div></div><span class="chev">${icon('chevronRight')}</span></button>`).join('')}</div>`:''}
        ${saved.length?`<div class="gsearch-section-head"><h2>保存した検索</h2></div><div class="group">${saved.map(x=>`<button type="button" class="row press" data-load-search="${esc(x.id)}"><span class="gsearch-row-icon" aria-hidden="true">${icon('star')}</span><div class="row-main"><div class="row-title">${esc(x.name)}</div><div class="row-sub">${esc([x.query,x.period&&x.period!=='all'?SEARCH_PERIODS.find(p=>p[0]===x.period)?.[1]:'',x.category].filter(Boolean).join('・')||'条件のみ')}</div></div><span class="chev">${icon('chevronRight')}</span></button>`).join('')}</div>`:''}
        <div class="gsearch-section-head"><h2>候補</h2></div><div class="gsearch-chips">${suggestions().map(s=>`<button type="button" class="gsearch-chip" data-gs-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <div class="gsearch-tips"><strong>検索のこつ</strong><span>「&gt;5000」で5,000円以上、「1000-3000」で範囲、「10/7」「10月」で日付、「カフェ 500」のように並べると両方を含む結果。ひらがな・カタカナ、全角・半角は区別しません。</span></div>`;
      }else{
        const res=runGlobalSearch(query,scope,{period,category}),by=new Map();for(const r of res){if(!by.has(r.type))by.set(r.type,[]);by.get(r.type).push(r)}
        out.innerHTML=res.length?`<div class="gsearch-count">${res.length}件</div>${[...by].map(([type,list])=>{const [label,sym,color]=SEARCH_GROUP_META[type]||[type,'search','var(--accent)'],open=expanded.has(type),shown=open?list:list.slice(0,5);return `<section class="gsearch-group" style="--g:${color}"><div class="gsearch-section-head"><h2>${esc(label)}<small>${list.length}</small></h2>${list.length>5?`<button type="button" class="gsearch-link" data-gs-more="${type}">${open?'閉じる':'すべて表示'}</button>`:''}</div><div class="group">${shown.map(r=>`<button type="button" class="row press gsearch-result" data-gs-type="${type}" data-gs-id="${esc(r.id)}"><span class="gsearch-row-icon tinted" aria-hidden="true">${icon(r.sym||sym)}</span><div class="row-main"><div class="row-title">${searchHighlight(r.title,query)}</div><div class="row-sub">${searchHighlight(r.sub||'',query)}</div></div>${r.amount!=null&&r.type!=='setting'&&r.type!=='category'?`<div class="row-value">${yen(Math.abs(r.amount))}</div>`:''}<span class="chev">${icon('chevronRight')}</span></button>`).join('')}</div></section>`}).join('')}<button type="button" class="secondary gsearch-save" id="pro4SaveSearch">この検索を保存</button>`:`<div class="gsearch-empty"><span aria-hidden="true">${icon('search')}</span><strong>${query.trim()?`「${esc(query)}」の結果はありません`:'条件に合う結果はありません'}</strong><small>別の言葉や、金額・日付（例: 10/7, &gt;1000）で試してください。</small></div>`;
        out._results=res;
      }
      bind();
    };
    const bind=()=>{
      out.querySelectorAll('[data-gs-recent]').forEach(b=>b.onclick=()=>{query=b.dataset.gsRecent;input.value=query;draw()});
      out.querySelectorAll('[data-gs-suggest]').forEach(b=>b.onclick=()=>{query=b.dataset.gsSuggest;input.value=query;draw()});
      out.querySelector('#gsClearRecent')?.addEventListener('click',()=>{try{safeCommit(()=>{data.recentSearches=[]},{render:false,label:'recent search clear',invalidateAcf:false})}catch(e){}draw()});
      out.querySelectorAll('[data-load-search]').forEach(b=>b.onclick=()=>{const x=(data.savedSearches||[]).find(v=>v.id===b.dataset.loadSearch);if(!x)return;query=x.query||'';scope=SEARCH_SCOPE_TYPES[x.type]!==undefined?x.type:'all';period=x.period||'all';category=x.category||'';input.value=query;drawScopes();drawFilters();draw()});
      out.querySelectorAll('[data-gs-more]').forEach(b=>b.onclick=()=>{const t=b.dataset.gsMore;expanded.has(t)?expanded.delete(t):expanded.add(t);draw()});
      out.querySelectorAll('[data-gs-id]').forEach(b=>b.onclick=()=>{const r=(out._results||[]).find(x=>x.type===b.dataset.gsType&&x.id===b.dataset.gsId);if(!r)return;rememberSearch(query);r.open()});
      const save=out.querySelector('#pro4SaveSearch');if(save)save.onclick=()=>{if((data.savedSearches||[]).some(v=>v.query===query&&(v.type||'all')===scope&&(v.period||'all')===period&&(v.category||'')===category)){showToast('この検索は保存済みです');return}try{safeCommit(()=>{data.savedSearches=[...(data.savedSearches||[]),{id:uid('search'),name:[query.trim(),period!=='all'?SEARCH_PERIODS.find(x=>x[0]===period)?.[1]:'',category].filter(Boolean).join('・')||'検索',query,type:scope,period,category,createdAt:new Date().toISOString()}].slice(-10)},{render:false,label:'save search'})}catch(e){return}showToast('検索を保存しました')};
    };
    let timer=0;input.oninput=()=>{query=input.value;clearTimeout(timer);timer=setTimeout(draw,90)};
    input.onkeydown=e=>{if(e.key==='Enter'){rememberSearch(query);input.blur()}};
    clear.onclick=()=>{query='';input.value='';draw();input.focus()};
    drawScopes();drawFilters();draw();setTimeout(()=>input.focus({preventScroll:true}),320);
  });
}

/* ---------- その他: アプリ全体の設定 ---------- */
const APP_PREF_DEFAULTS={startTab:'home',weekStart:0,payMonth:'current',glass:'standard',numberFont:'rounded',boldText:false,buttonShapes:false,contrast:false,privacyBlur:false,tabBadge:true};
function appPrefs(){return{...APP_PREF_DEFAULTS,...(data.appPrefs&&typeof data.appPrefs==='object'?data.appPrefs:{})}}
function setAppPref(k,v){try{safeCommit(()=>{data.appPrefs={...appPrefs(),[k]:v}},{label:'app prefs',invalidateAcf:false})}catch(e){return false}applyAppPrefs();renderAll();return true}
const APP_PREF_OPTIONS={
  startTab:{title:'起動時に開く画面',options:[['home','ホーム'],['payments','支払い']],footer:'アプリを開いた時に最初に表示するタブです。'},
  weekStart:{title:'週の始まり',options:[[0,'日曜日'],[1,'月曜日']],footer:'カレンダーの並びに使います。'},
  payMonth:{title:'支払いタブの表示月',options:[['current','今月'],['nextDebit','次の引落がある月']],footer:'アプリを開いた時に支払いタブで表示する月です。'},
  glass:{title:'ガラスの質感',options:[['standard','標準（透ける）'],['subtle','控えめ'],['solid','不透明']],footer:'タブバー・ボタン・検索欄などのガラス素材の透け具合です。端末の「透明度を下げる」がオンの時は常に不透明になります。'},
  numberFont:{title:'数字の書体',options:[['rounded','丸みのある数字'],['standard','標準の数字']],footer:'金額などの数字の書体です。'}
};
function appPrefLabel(k){const o=APP_PREF_OPTIONS[k];if(!o)return'';const v=appPrefs()[k];return o.options.find(([x])=>String(x)===String(v))?.[1]||''}
function appPrefsGroups(){
  return[
    ['一般',[{id:'prefStartTab',symbol:'house',color:'var(--accent)',title:'起動時に開く画面',value:appPrefLabel('startTab')},{id:'prefWeekStart',symbol:'calendar',color:'var(--red)',title:'週の始まり',value:appPrefLabel('weekStart')},{id:'prefPayMonth',symbol:'card',color:'var(--purple)',title:'支払いタブの表示月',value:appPrefLabel('payMonth')}]],
    ['表示とアクセシビリティ',[{id:'prefGlass',symbol:'sparkles',color:'var(--teal)',title:'ガラスの質感',value:appPrefLabel('glass')},{id:'prefNumberFont',symbol:'textsize',color:'var(--orange)',title:'数字の書体',value:appPrefLabel('numberFont')},{id:'prefReadability',symbol:'appearance',color:'#5856D6',title:'読みやすさ',detail:'文字を太く・ボタンの形・コントラスト'}]],
    ['プライバシー',[{id:'prefPrivacy',symbol:'lock',color:'#8E8E93',title:'画面のぼかしとバッジ',detail:'アプリを離れた時のぼかし・その他タブの数字'}]]
  ];
}
function openAppPrefOptions(k){
  const o=APP_PREF_OPTIONS[k];
  const draw=()=>settingsDetailView(o.title,`<div class="group" role="radiogroup" aria-label="${esc(o.title)}">${o.options.map(([v,l])=>`<button type="button" class="row press option-row" role="radio" aria-checked="${String(appPrefs()[k])===String(v)}" data-pref-value="${v}"><div class="row-main"><div class="row-title">${esc(l)}</div></div><span class="option-check" aria-hidden="true">${String(appPrefs()[k])===String(v)?icon('check'):''}</span></button>`).join('')}</div><p class="settings-section-footer">${esc(o.footer)}</p>`,root=>root.querySelectorAll('[data-pref-value]').forEach(b=>b.onclick=()=>{const raw=b.dataset.prefValue,v=k==='weekStart'?Number(raw):raw;if(setAppPref(k,v)){feedback?.selection?.();draw()}}));
  draw();
}
function openSwitchPrefs(title,items,footer){
  const draw=()=>settingsDetailView(title,`<div class="group">${items.map(([k,t,s])=>`<div class="row"><div class="row-main"><div class="row-title">${esc(t)}</div><div class="row-sub">${esc(s)}</div></div><button type="button" class="switch ${appPrefs()[k]?'on':''}" role="switch" aria-checked="${!!appPrefs()[k]}" aria-label="${esc(t)}" data-pref-switch="${k}"></button></div>`).join('')}</div><p class="settings-section-footer">${esc(footer)}</p>`,root=>root.querySelectorAll('[data-pref-switch]').forEach(b=>b.onclick=()=>{const k=b.dataset.prefSwitch;if(setAppPref(k,!appPrefs()[k])){feedback?.selection?.();draw()}}));
  draw();
}
function bindAppPrefRows(root){
  const on=(id,fn)=>{const el=root.querySelector('#'+id);if(el)el.onclick=fn};
  on('prefStartTab',()=>openAppPrefOptions('startTab'));on('prefWeekStart',()=>openAppPrefOptions('weekStart'));on('prefPayMonth',()=>openAppPrefOptions('payMonth'));
  on('prefGlass',()=>openAppPrefOptions('glass'));on('prefNumberFont',()=>openAppPrefOptions('numberFont'));
  on('prefReadability',()=>openSwitchPrefs('読みやすさ',[['boldText','文字を太くする','画面の文字を少し太く表示'],['buttonShapes','ボタンの形を表示','文字だけのボタンに背景を付ける'],['contrast','コントラストを上げる','薄い文字と境界を濃くする']],'端末の設定とは別に、このアプリだけに使います。'));
  on('prefPrivacy',()=>openSwitchPrefs('画面のぼかしとバッジ',[['privacyBlur','アプリを離れたらぼかす','アプリの切り替え画面で金額が見えないようにする'],['tabBadge','その他タブに未読数を表示','システムのお知らせの未読数']],'記録の内容は変わりません。'));
}
function applyAppPrefs(){
  const P=appPrefs(),h=document.documentElement;
  h.classList.toggle('glass-subtle',P.glass==='subtle');h.classList.toggle('glass-solid-pref',P.glass==='solid');
  h.classList.toggle('num-standard',P.numberFont==='standard');h.classList.toggle('bold-text',!!P.boldText);h.classList.toggle('button-shapes',!!P.buttonShapes);h.classList.toggle('more-contrast',!!P.contrast);
  const tab=document.getElementById('settingsTab'),n=P.tabBadge&&typeof unreadNotices==='function'?unreadNotices():0;
  if(tab){let b=tab.querySelector('.tab-badge');if(n){if(!b){b=document.createElement('span');b.className='tab-badge';b.setAttribute('aria-hidden','true');tab.appendChild(b)}b.textContent=n>99?'99+':String(n);tab.setAttribute('aria-label',`その他・未読のお知らせ${n}件`)}else{b?.remove();tab.removeAttribute('aria-label')}}
}
let appStartupApplied=false;
function applyStartupPrefs(){
  if(appStartupApplied)return;appStartupApplied=true;applyAppPrefs();
  const P=appPrefs();
  if(P.payMonth==='nextDebit'){const ev=financialEventsFrom(ymd(),62).find(e=>e.type!=='income');if(ev)assetBillingMonth=ev.date.slice(0,7)}
  if(P.startTab==='payments'&&activeTab==='today')switchRoot('payments');
}
/* アプリを離れたらぼかす */
(function(){
  const shield=()=>{let el=document.getElementById('privacyShield');if(!el){el=document.createElement('div');el.id='privacyShield';el.setAttribute('aria-hidden','true');el.innerHTML='<span>My Money</span>';document.body.appendChild(el)}return el};
  const set=on=>{if(!appPrefs().privacyBlur&&on)return;shield().classList.toggle('show',on)};
  document.addEventListener('visibilitychange',()=>set(document.visibilityState==='hidden'));
  window.addEventListener('pagehide',()=>set(true));window.addEventListener('pageshow',()=>set(false));
  window.addEventListener('focus',()=>set(false));
})();
