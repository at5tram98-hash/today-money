/* 第4段: iOS（Liquid Glass）らしさの作り直し
   - ＋: 紙がめくれるように開く全画面の電卓。「支出・臨時収入・残高・給与・カード」をガラスのレンズで選ぶ
   - ナビゲーションバー: 丸いガラスのボタン、右側はひとつのガラスのカプセル、主な操作は色つきの丸（✓）
   - タブバー: 横にコンパクト、押すとレンズがふくらみ、指に付いて滑る
   - プロフィール: ヘルスケアのような中央の写真と名前
   - 今日／今月の支出: アクティビティのような期間の切替・数値の列・大きなグラフ */

/* ---------- ＋ = 電卓（新規入力） ---------- */
const ENTRY_MODES=[
  {id:'entryExpense',key:'expense',label:'支出',sym:'cart',color:'var(--orange)'},
  {id:'entryIncome',key:'income',label:'臨時収入',sym:'wallet',color:'var(--green)'},
  {id:'entryBank',key:'bank',label:'残高',sym:'bank',color:'var(--accent)'},
  {id:'entrySalary',key:'salary',label:'給与',sym:'briefcase',color:'var(--teal)'},
  {id:'entryCard',key:'card',label:'カード請求',sym:'card',color:'var(--purple)'}
];
let entryLastMode='expense';
function entryEval(expr){
  const tokens=String(expr).match(/\d+|[+\-×÷]/g)||[];if(!tokens.length)return 0;
  /* 掛け算・割り算を先に */
  const seq=[];for(const t of tokens){if(/\d/.test(t))seq.push(Number(t));else seq.push(t)}
  while(seq.length&&typeof seq[0]==='string')seq.shift();
  while(seq.length&&typeof seq.at(-1)==='string')seq.pop();
  const pass1=[];for(let k=0;k<seq.length;k++){const t=seq[k];if(t==='×'||t==='÷'){const a=pass1.pop(),b=seq[++k];pass1.push(t==='×'?a*b:(b?a/b:a))}else pass1.push(t)}
  let total=Number(pass1[0])||0;for(let k=1;k<pass1.length;k+=2){const op=pass1[k],b=Number(pass1[k+1])||0;total=op==='+'?total+b:total-b}
  return Math.max(0,Math.round(total));
}
function entryPaymentChoices(){return [{method:'other',id:'',label:'現金・その他'},...data.banks.map(b=>({method:'bank',id:b.id,label:b.name})),...(data.debitCards||[]).map(d=>({method:'debit',id:d.id,label:d.name})),...data.cards.map(c=>({method:'card',id:c.id,label:c.name}))]}
function openEntryHub(){openEntryCalc()}
function openEntryCalc(initialMode='expense'){
  const date0=['today','day'].includes(activeTab)?trackingDate:ymd(),smart=quickExpenseSmartDefault();
  const st={mode:ENTRY_MODES.some(m=>m.key===initialMode)?initialMode:'expense',expr:'',date:date0,cat:smart.category||data.categories[0]?.name||'その他',pay:{method:smart.paymentMethod||'other',id:smart.paymentId||''},merchant:'',toType:'cash',bankId:data.banks[0]?.id||'',empId:data.employers[0]?.id||'',cardId:data.cards[0]?.id||'',typed:false,saving:false};
  const amount=()=>entryEval(st.expr);
  const modeOf=k=>ENTRY_MODES.find(m=>m.key===k);
  const keys=[['C','clear','すべて消す'],['⌫','back','1文字消す'],['÷','op','割る'],['×','op','掛ける'],['7'],['8'],['9'],['−','op','引く'],['4'],['5'],['6'],['+','op','足す'],['1'],['2'],['3'],['=','eq','計算する'],['0'],['00']];
  const html=`<div class="sheet-nav entry-nav"><button type="button" class="nav-text" id="entryClose">閉じる</button><div class="sheet-title">新規入力</div><div class="entry-nav-right"><button type="button" class="entry-plan-btn" id="entryPlan" aria-haspopup="menu">${icon('calendar')}<span>予定</span></button><button type="button" class="nav-text bold" id="entrySave">保存</button></div></div>
  <div class="sheet-body entry-calc" id="entryCalc">
    <div class="entry-modes glass-lensbar" role="radiogroup" aria-label="入力の種類" id="entryModes"><span class="lens" aria-hidden="true"></span>${ENTRY_MODES.map(m=>`<button type="button" role="radio" id="${m.id}" data-entry-mode="${m.key}" style="--m:${m.color}" aria-checked="${m.key===st.mode}">${icon(m.sym)}<span>${m.label}</span></button>`).join('')}</div>
    <div class="entry-display" id="entryDisplay" aria-live="polite"></div>
    <div class="entry-context" id="entryContext"></div>
    <div class="entry-keys" id="entryKeys">${keys.map(([k,kind='num',label])=>`<button type="button" class="entry-key ${kind}${k==='0'?' zero':''}${k==='='?' eq':''}" data-key="${k}" ${label?`aria-label="${label}"`:''}>${k}</button>`).join('')}</div>
  </div>`;
  openSheet(html,'full',root=>{
    const sheet=root.closest('#sheet');sheet?.classList.add('glass-sheet','entry-sheet');
    entryPageCurl(sheet);
    const $=s=>root.querySelector(s),display=$('#entryDisplay'),context=$('#entryContext'),modes=$('#entryModes'),lens=modes.querySelector('.lens');
    const placeLens=(animate=true)=>{const b=modes.querySelector(`[data-entry-mode="${st.mode}"]`);if(!b)return;lens.style.transition=animate&&!mm3MotionReduced()?'':'none';lens.style.width=b.offsetWidth+'px';lens.style.transform=`translateX(${b.offsetLeft}px)`;lens.style.setProperty('--m',modeOf(st.mode).color)};
    const drawDisplay=()=>{const m=modeOf(st.mode),a=amount(),bank=st.mode==='bank'?bankById(st.bankId):null;
      display.style.setProperty('--m',m.color);
      display.innerHTML=`<div class="entry-expr">${esc(/[+\-×÷]/.test(st.expr)?st.expr:'')}</div><div class="entry-amount-line"><span class="entry-mode-label">${esc(m.label)}</span><span class="entry-amount">${yen(a)}</span></div><div class="entry-hint">${st.mode==='bank'&&bank?`現在の残高 ${yen(bank.balance)}・入力した金額に置き換えます`:st.mode==='salary'?'保存すると給与の記録を開きます（総支給額）':st.mode==='card'?'保存すると請求の記録を開きます':st.mode==='income'?'給与以外の入金':'使った金額'}</div>`;
      markSheetDirty(a>0&&st.typed)};
    const dateChip=()=>{const d=parseYmd(st.date);return `<label class="entry-date" title="日付">${icon('calendar')}<span>${st.date===ymd()?'今日':`${d.getMonth()+1}/${d.getDate()}`}</span><input type="date" id="entryDate" value="${esc(st.date)}" aria-label="日付（${esc(dayLabel(st.date))}）"></label>`};
    const bindDate=()=>{const d=context.querySelector('#entryDate');if(d)d.onchange=()=>{if(d.value){st.date=d.value;drawContext()}}};
    const chip=(attr,val,label,on,extra='')=>`<button type="button" class="entry-chip${on?' on':''}" ${attr}="${esc(val)}" aria-pressed="${on}" ${extra}>${label}</button>`;
    const drawContext=()=>{let h='';
      if(st.mode==='expense'){
        const pays=entryPaymentChoices(),pay=pays.find(p=>p.method===st.pay.method&&p.id===st.pay.id)||pays[0],recent=recentExpenseTemplates(4);
        h=`<div class="entry-chips" role="group" aria-label="カテゴリとすばやく入力">${data.categories.map(c=>chip('data-entry-cat',c.name,`<i style="background:${c.color}"></i>${esc(c.name)}`,c.name===st.cat)).join('')}<span class="entry-chip-sep" aria-hidden="true"></span><button type="button" class="entry-chip ghost" id="entryDetail">${icon('list')}詳細入力</button><button type="button" class="entry-chip ghost" id="entryOneLine">${icon('edit')}一行入力</button><button type="button" class="entry-chip ghost" id="entryRecent">${icon('repeat')}最近</button>${recent.map((r,i)=>`<button type="button" class="entry-chip tpl" data-entry-tpl="${i}">${esc(r.merchant)} ${yen(r.amount)}</button>`).join('')}</div>
        <div class="entry-row2">${dateChip()}<button type="button" class="entry-field-btn" id="entryPay" aria-haspopup="menu">${icon('card')}<span>${esc(pay.label)}</span>${icon('chevronDown')}</button><label class="entry-field"><input type="text" id="entryMerchant" placeholder="店名・メモ" value="${esc(st.merchant)}" aria-label="店名・メモ"></label></div>`;
        context.innerHTML=h;bindDate();
        context.querySelectorAll('[data-entry-cat]').forEach(b=>b.onclick=()=>{st.cat=b.dataset.entryCat;feedback?.selection?.();drawContext()});
        $('#entryPay').onclick=()=>openEntryOptions('支払い方法',pays.map(p=>[`${p.method}|${p.id}`,p.label]),`${st.pay.method}|${st.pay.id}`,v=>{const [m,id]=v.split('|');st.pay={method:m,id:id||''};drawContext()});
        $('#entryMerchant').oninput=e=>{st.merchant=e.target.value};
        $('#entryOneLine').onclick=()=>{context.replaceChildren();closeSheet();openSmartInputSearch('input')};
        $('#entryDetail').onclick=()=>{const a=amount(),pre={amount:a,category:st.cat,paymentMethod:st.pay.method,paymentId:st.pay.id,merchant:(st.merchant||'').trim()};closeSheet();openQuickExpense(st.date,pre)};
        $('#entryRecent')?.addEventListener('click',()=>{context.replaceChildren();closeSheet();openQuickRepeat(st.date)});
        context.querySelectorAll('[data-entry-tpl]').forEach(b=>b.onclick=()=>{const r=recent[Number(b.dataset.entryTpl)];st.expr=String(r.amount);st.cat=r.category;st.pay={method:r.paymentMethod,id:r.paymentId};st.merchant=r.merchant;st.typed=true;feedback?.selection?.();drawDisplay();drawContext()});
        return;
      }
      if(st.mode==='income')h=`<div class="entry-chips" role="group" aria-label="入金先">${chip('data-entry-to','cash|','手持ち・未入金',st.toType==='cash')}${data.banks.map(b=>chip('data-entry-to',`bank|${b.id}`,`${icon('bank')}${esc(b.name)}`,st.toType==='bank'&&st.bankId===b.id)).join('')}<span class="entry-chip-sep" aria-hidden="true"></span><button type="button" class="entry-chip ghost" id="entryIncomeDetail">${icon('list')}詳細入力</button></div><div class="entry-row2">${dateChip()}<label class="entry-field wide"><input type="text" id="entrySource" placeholder="収入源（例：単発バイト・返金）" value="${esc(st.merchant)}" aria-label="収入源"></label></div>`;
      if(st.mode==='bank')h=data.banks.length?`<div class="entry-chips" role="group" aria-label="口座">${data.banks.map(b=>chip('data-entry-bank',b.id,`${icon('bank')}${esc(b.name)}`,st.bankId===b.id)).join('')}<span class="entry-chip-sep" aria-hidden="true"></span><button type="button" class="entry-chip ghost" id="entryBankDetail">${icon('list')}詳細入力</button></div>`:`<div class="entry-empty">銀行口座がありません。「その他」→「口座とカード」で追加できます。</div>`;
      if(st.mode==='salary')h=data.employers.length?`<div class="entry-chips" role="group" aria-label="勤務先">${data.employers.map(e=>chip('data-entry-emp',e.id,`${icon('briefcase')}${esc(e.name)}`,st.empId===e.id)).join('')}</div>`:`<div class="entry-empty">勤務先がありません。「その他」→「給与と勤務先」で追加できます。</div>`;
      if(st.mode==='card')h=data.cards.length?`<div class="entry-chips" role="group" aria-label="カード">${data.cards.map(c=>chip('data-entry-card',c.id,`${icon('card')}${esc(c.name)}`,st.cardId===c.id)).join('')}</div>`:`<div class="entry-empty">クレジットカードがありません。「その他」→「口座とカード」で追加できます。</div>`;
      context.innerHTML=h;bindDate();
      context.querySelectorAll('[data-entry-to]').forEach(b=>b.onclick=()=>{const [t,id]=b.dataset.entryTo.split('|');st.toType=t;if(id)st.bankId=id;drawContext()});
      $('#entrySource')?.addEventListener('input',e=>{st.merchant=e.target.value});
      $('#entryIncomeDetail')?.addEventListener('click',()=>{const a=amount();closeSheet();openTempIncome(st.date,a)});
      $('#entryBankDetail')?.addEventListener('click',()=>{closeSheet();openQuickBank(st.bankId)});
      context.querySelectorAll('[data-entry-bank]').forEach(b=>b.onclick=()=>{st.bankId=b.dataset.entryBank;if(!st.typed)st.expr=String(Math.round(Number(bankById(st.bankId)?.balance)||0));drawContext();drawDisplay()});
      context.querySelectorAll('[data-entry-emp]').forEach(b=>b.onclick=()=>{st.empId=b.dataset.entryEmp;drawContext()});
      context.querySelectorAll('[data-entry-card]').forEach(b=>b.onclick=()=>{st.cardId=b.dataset.entryCard;drawContext()});
    };
    const setMode=k=>{if(!modeOf(k))return;const was=st.mode;st.mode=k;entryLastMode=k;if(k!=='expense'&&was==='expense'&&!st.typed)st.merchant='';
      if(k==='bank'&&!st.typed&&bankById(st.bankId))st.expr=String(Math.round(Number(bankById(st.bankId).balance)||0));else if(was==='bank'&&!st.typed)st.expr='';
      modes.querySelectorAll('[data-entry-mode]').forEach(b=>b.setAttribute('aria-checked',String(b.dataset.entryMode===k)));placeLens();drawDisplay();drawContext()};
    installLensDrag(modes,'[data-entry-mode]',b=>{if(b.dataset.entryMode!==st.mode){feedback?.selection?.();setMode(b.dataset.entryMode)}});
    /* 金額を左右になぞると種類が変わる */
    let sw=null;display.addEventListener('pointerdown',e=>{if(e.target.closest('input,label'))return;sw={x:e.clientX,y:e.clientY}});display.addEventListener('pointerup',e=>{if(!sw)return;const dx=e.clientX-sw.x,dy=e.clientY-sw.y;sw=null;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){const i=ENTRY_MODES.findIndex(m=>m.key===st.mode),n=ENTRY_MODES[(i+(dx<0?1:-1)+ENTRY_MODES.length)%ENTRY_MODES.length];feedback?.selection?.();setMode(n.key)}});
    const press=k=>{
      if(k==='C')st.expr='';
      else if(k==='⌫')st.expr=st.expr.slice(0,-1);
      else if(k==='=')st.expr=String(amount());
      else if(/[+\-−×÷]/.test(k)){const op=k==='−'?'-':k;if(!st.expr)return;st.expr=/[+\-×÷]$/.test(st.expr)?st.expr.slice(0,-1)+op:st.expr+op}
      else{const next=(st.expr==='0'?'':st.expr)+k;const last=next.split(/[+\-×÷]/).at(-1);if(last.length>9)return;st.expr=next.replace(/^0+(?=\d)/,'')}
      st.typed=true;drawDisplay()};
    $('#entryKeys').querySelectorAll('[data-key]').forEach(b=>b.onclick=()=>{feedback?.selection?.();press(b.dataset.key)});
    const onKey=e=>{if(!document.getElementById('entryCalc')||e.target.closest?.('input'))return;const map={'*':'×','/':'÷','-':'−','Backspace':'⌫','Escape':null,'Enter':'=','Delete':'C'};const k=/^[0-9+]$/.test(e.key)?e.key:map[e.key];if(k){e.preventDefault();press(k)}};
    document.addEventListener('keydown',onKey);
    $('#entryClose').onclick=requestSheetClose;
    $('#entryPlan').onclick=e=>openMenu(e.currentTarget,[{label:'固定支払いを追加',sub:'家賃・サブスクなど毎月の支払い',icon:'repeat',action:()=>{closeSheet();openFixedPayment()}},{label:'大型支出を計画',sub:'家電・旅行など大きな出費',icon:'cart',action:()=>{closeSheet();openLargeExpenseEditor(null,{after:renderAll})}},{label:'旅行・プレゼントを計画',sub:'目標額と期限を決めて貯める',icon:'gift',action:()=>{closeSheet();openEventGoalEditor()}}],{label:'予定を追加'});
    $('#entrySave').onclick=()=>entrySave(st,amount());
    setMode(st.mode);requestAnimationFrame(()=>placeLens(false));
    return()=>document.removeEventListener('keydown',onKey);
  });
}
function openEntryOptions(title,options,current,apply){
  const menuItems=options.map(([v,l])=>({label:l,icon:v===current?'check':'',action:()=>apply(v)}));
  const anchor=document.getElementById('entryPay')||document.getElementById('entryCalc');openMenu(anchor,menuItems,{label:title});
}
function entrySave(st,a){
  if(st.saving)return;
  if(st.mode==='expense'||st.mode==='income'||st.mode==='salary'||st.mode==='card'){if(!a)return showAlert('金額を入力してください','電卓で金額を入力してから保存します。')}
  if(st.mode==='expense'){
    st.saving=true;const m=(st.merchant||'').trim()||st.cat||'支出';
    try{safeCommit(()=>recordExpense({date:st.date,amount:a,category:st.cat,merchant:m,paymentMethod:st.pay.method,paymentId:st.pay.id,saveNow:false}),{render:true,label:'entry expense'})}catch(e){st.saving=false;return}
    feedback.success();closeSheet();showToast(`${st.cat} ${yen(a)} を記録しました`);return;
  }
  if(st.mode==='income'){
    if(st.toType==='bank'&&!bankById(st.bankId))return showAlert('口座を選んでください','入金先の口座を選びます。');
    st.saving=true;const src=(st.merchant||'').trim()||'臨時収入';
    try{safeCommit(()=>{const temp={id:uid('tmp'),date:st.date,amount:a,sourceName:src,toType:st.toType,bankId:st.toType==='bank'?st.bankId:'',memo:'',incomeId:'',receivedConfirmed:false};const inc=recordIncome({date:st.date,amount:a,sourceName:src,toType:st.toType,bankId:temp.bankId,memo:'',kind:'temporary',tempIncomeId:temp.id,applyNow:false,saveNow:false});temp.incomeId=inc?.id||'';data.tempIncomes.push(temp)},{render:true,label:'entry temporary income'})}catch(e){st.saving=false;return}
    feedback.success();closeSheet();showToast(`臨時収入 ${yen(a)} を記録しました`);return;
  }
  if(st.mode==='bank'){
    if(!bankById(st.bankId))return showAlert('口座がありません','「その他」→「口座とカード」で口座を追加してください。');
    st.saving=true;
    try{safeCommit(()=>{requireFinancialEntity('bank',st.bankId);reconcileBankBalance(st.bankId,a,'残高の更新')},{render:true,label:'entry bank balance'})}catch(e){st.saving=false;return}
    feedback.success();closeSheet();refreshFinancialViews?.();showToast(`${bankById(st.bankId)?.name||'口座'}の残高を ${yen(a)} にしました`);return;
  }
  if(st.mode==='salary'){
    if(!data.employers.length)return showAlert('勤務先がありません','「その他」→「給与と勤務先」で勤務先を追加してください。');
    closeSheet();openSalaryAdd(null,st.empId,{gross:a,selectedId:st.empId});return;
  }
  if(st.mode==='card'){
    if(!data.cards.length)return showAlert('カードがありません','「その他」→「口座とカード」でカードを追加してください。');
    closeSheet();openQuickCardBilling(paymentHomeMonth(),st.cardId,'',a);return;
  }
}
/* 紙がめくれるように開く（右下の＋から、折り目が斜めに上がる） */
function entryPageCurl(sheet){
  if(!sheet||mm3MotionReduced()){return}
  sheet.classList.add('curl-open');
  requestAnimationFrame(()=>{
    const r=sheet.getBoundingClientRect(),w=r.width,h=r.height,steps=10,frames=[];
    for(let i=0;i<=steps;i++){const t=i/steps,e=1-Math.pow(1-t,2.2),D=e*(w+h);const pts=[[w,h],[Math.max(0,w-D),h],[0,Math.max(0,h-Math.max(0,D-w))],[Math.max(0,w-Math.max(0,D-h)),0],[w,Math.max(0,h-D)]];if(D<w)pts[2]=[w-D,h];if(D<h)pts[3]=[w,h-D];frames.push({clipPath:`polygon(${pts.map(([x,y])=>`${x.toFixed(1)}px ${y.toFixed(1)}px`).join(',')})`})}
    const anim=sheet.animate(frames,{duration:320,easing:'linear'});
    const band=document.createElement('div');band.className='curl-band';band.setAttribute('aria-hidden','true');const diag=Math.hypot(w,h);Object.assign(band.style,{left:r.left+'px',top:r.top+'px',width:w+'px',height:h+'px'});
    band.innerHTML=`<i style="width:${diag*1.6}px"></i>`;document.body.appendChild(band);
    const bandFrames=[];for(let i=0;i<=steps;i++){const t=i/steps,e=1-Math.pow(1-t,2.2),c=(w+h)*(1-e),x=w/2+(c-w/2-h/2)/2,y=h/2+(c-w/2-h/2)/2;bandFrames.push({transform:`translate(${x}px,${y}px) translate(-50%,-50%) rotate(-45deg)`,opacity:i===steps?0:1})}
    band.firstElementChild.animate(bandFrames,{duration:320,easing:'linear',fill:'forwards'});
    const done=()=>{band.remove();sheet.classList.remove('curl-open')};anim.onfinish=done;anim.oncancel=done;
  });
}
/* レンズの付いたガラスのバー: 押すとレンズがふくらみ、指に付いて滑り、離した位置の項目を選ぶ */
function installLensDrag(bar,itemSel,onPick){
  if(!bar||bar.__lensDrag)return;bar.__lensDrag=true;
  const lens=bar.querySelector('.lens');let g=null;
  const items=()=>[...bar.querySelectorAll(itemSel)];
  const nearest=x=>{let best=null,dist=1e9;for(const b of items()){const r=b.getBoundingClientRect(),c=r.left+r.width/2,d=Math.abs(x-c);if(d<dist){dist=d;best=b}}return best};
  bar.addEventListener('pointerdown',e=>{const b=e.target.closest(itemSel);if(!b)return;g={x:e.clientX,moved:false,id:e.pointerId,start:b};bar.classList.add('lens-active')});
  bar.addEventListener('pointermove',e=>{if(!g||e.pointerId!==g.id||!lens)return;if(Math.abs(e.clientX-g.x)>6)g.moved=true;if(!g.moved)return;try{bar.setPointerCapture(e.pointerId)}catch(_){}const r=bar.getBoundingClientRect(),w=lens.offsetWidth,x=Math.max(2,Math.min(r.width-w-2,e.clientX-r.left-w/2));lens.style.transition='none';lens.style.transform=`translateX(${x}px)`;const n=nearest(e.clientX);items().forEach(b=>b.classList.toggle('lens-over',b===n))});
  const end=e=>{if(!g)return;const moved=g.moved;g=null;bar.classList.remove('lens-active');items().forEach(b=>b.classList.remove('lens-over'));if(lens)lens.style.transition='';if(moved){const n=nearest(e.clientX);bar.__suppressClick=true;setTimeout(()=>bar.__suppressClick=false,50);if(n)onPick(n);else onPick(items().find(b=>b.getAttribute('aria-checked')==='true'||b.classList.contains('active')))}};
  bar.addEventListener('pointerup',end);bar.addEventListener('pointercancel',()=>{g=null;bar.classList.remove('lens-active')});
  bar.addEventListener('click',e=>{const b=e.target.closest(itemSel);if(bar.__suppressClick){e.preventDefault();e.stopImmediatePropagation();return}if(b)onPick(b)},true);
}

/* ---------- その他 → 登録（口座とカード・勤務先）。＋には置かない ---------- */
function regRowsHtml(items,attr){return items.map(x=>`<button type="button" class="row press reg-row" ${attr}="${esc(x.id)}"><span class="reg-icon" style="--c:${x.color}" aria-hidden="true">${icon(x.sym)}</span><div class="row-main"><div class="row-title">${esc(x.name)}</div>${x.sub?`<div class="row-sub">${esc(x.sub)}</div>`:''}</div>${x.value!=null?`<div class="row-value">${esc(x.value)}</div>`:''}<span class="chev">${icon('chevronRight')}</span></button>`).join('')}
function regAddHtml(id,label){return `<button type="button" class="row press reg-add" id="${id}"><span class="reg-add-icon" aria-hidden="true">${icon('plus')}</span><div class="row-main"><div class="row-title">${esc(label)}</div></div></button>`}
function openAccountsSettings(){
  const draw=()=>settingsDetailView('口座とカード',`
    <h2 class="reg-head">銀行口座</h2><div class="group">${regRowsHtml(data.banks.map(b=>({id:b.id,name:b.name,sub:b.label||'',value:yen(b.balance),sym:'bank',color:'var(--accent)'})),'data-reg-bank')}${regAddHtml('regAddBank','銀行口座を追加')}</div>
    <h2 class="reg-head">クレジットカード</h2><div class="group">${regRowsHtml(data.cards.map(c=>({id:c.id,name:c.name,sub:c.closingDay?`締め ${c.closingDay}日・支払い ${c.paymentDay||'—'}日`:'',sym:'card',color:'var(--purple)'})),'data-reg-card')}${regAddHtml('regAddCard','クレジットカードを追加')}</div>
    <h2 class="reg-head">デビットカード</h2><div class="group">${regRowsHtml((data.debitCards||[]).map(d=>({id:d.id,name:d.name,sub:bankById(d.bankId)?.name||'',sym:'card',color:'var(--green)'})),'data-reg-debit')}${regAddHtml('regAddDebit','デビットカードを追加')}</div>
    <p class="settings-section-footer">残高の更新や支出の記録は、ホームの＋から行えます。</p>`,root=>{
      root.querySelectorAll('[data-reg-bank]').forEach(b=>b.onclick=()=>openBankDetail(b.dataset.regBank));
      root.querySelectorAll('[data-reg-card]').forEach(b=>b.onclick=()=>openCardDetail(b.dataset.regCard));
      root.querySelectorAll('[data-reg-debit]').forEach(b=>b.onclick=()=>openDebitDetail(b.dataset.regDebit));
      root.querySelector('#regAddBank').onclick=()=>openAddBank();root.querySelector('#regAddCard').onclick=()=>openAddCard();root.querySelector('#regAddDebit').onclick=()=>openAddDebit();
      root.__refreshRegistrations=draw;
    });
  draw();
}
function openEmployersSettings(){
  const draw=()=>settingsDetailView('勤務先',`<h2 class="reg-head">勤務先</h2><div class="group">${regRowsHtml(data.employers.map(e=>({id:e.id,name:e.name,sub:e.payDay?`給料日 ${e.payDay}日`:'',sym:'briefcase',color:'var(--teal)'})),'data-reg-emp')}${regAddHtml('regAddEmployer','勤務先を追加')}</div><p class="settings-section-footer">給与の記録はホームの＋（給与）から行えます。</p>`,root=>{
    root.querySelectorAll('[data-reg-emp]').forEach(b=>b.onclick=()=>openEmployerDetail(b.dataset.regEmp));
    root.querySelector('#regAddEmployer').onclick=()=>openEmployerCreate(()=>{renderAll();draw()});
  });
  draw();
}

/* ---------- シートのナビゲーション: 閉じる→×、保存→✓（文字は読み上げ用に残す） ---------- */
const NAV_CLOSE_RE=/^(キャンセル|閉じる|やめる)$/,NAV_PRIMARY_RE=/^(保存|完了|追加|登録|適用|決定|確定|更新|設定して開始|作成|OK)$/;
function decorateSheetNav(nav){
  if(!nav)return;
  for(const b of nav.querySelectorAll(':scope > button.nav-text, :scope > div > button.nav-text, :scope > span > button.nav-text')){
    const label=(b.querySelector('.nav-icon-label')?.textContent||b.textContent||'').trim();
    if(b.classList.contains('nav-icon')&&b.querySelector('.nav-glyph'))continue;
    const close=NAV_CLOSE_RE.test(label),primary=!close&&(NAV_PRIMARY_RE.test(label)||(b.classList.contains('bold')&&label.length<=4&&!/削除|中…|中\.\.\./.test(label)));
    if(!close&&!primary){b.classList.remove('nav-icon','primary');continue}
    b.classList.add('nav-icon');b.classList.toggle('primary',primary);
    if(!b.getAttribute('aria-label'))b.setAttribute('aria-label',label);else if(b.dataset.navAuto)b.setAttribute('aria-label',label);
    b.dataset.navAuto='1';
    b.innerHTML=`<span class="nav-glyph" aria-hidden="true">${icon(close?'close':'check')}</span><span class="nav-icon-label">${esc(label)}</span>`;
  }
}
(function installNavDecorators(){
  const sheet=document.getElementById('sheet');if(!sheet)return;
  let busy=false;const run=()=>{if(busy)return;busy=true;try{decorateSheetNav(sheet.querySelector('.sheet-nav'))}finally{busy=false}};
  new MutationObserver(muts=>{if(busy)return;if(muts.some(m=>m.target===sheet||m.target.closest?.('.sheet-nav')||[...m.addedNodes].some(n=>n.classList?.contains('sheet-nav')||n.querySelector?.('.sheet-nav'))))run()}).observe(sheet,{childList:true,subtree:true,characterData:true});
  run();
  /* タブバー: 押している間はレンズがふくらむ */
  const bar=document.getElementById('tabbar');if(bar){let t=0;bar.addEventListener('pointerdown',()=>{clearTimeout(t);bar.classList.add('lens-press')});const off=()=>{clearTimeout(t);t=setTimeout(()=>bar.classList.remove('lens-press'),140)};['pointerup','pointercancel','pointerleave'].forEach(ev=>bar.addEventListener(ev,off))}
})();

/* ---------- 今日の目標: 輪をやめ、アクティビティのような3つの数値と細い棒 ---------- */
function ringHtml(date,prefix='today'){
  const s=spentDate(date),g=dailyGoal(date).total||spendDayGoal(date),rate=goalRate(s,g),y=addDays(date,-1),ys=spentDate(y),has=g>0,over=has&&s>g;
  return `<div class="hero today-goal-hero dg-card"><button class="today-spend-tap" id="${prefix}Hero" type="button" aria-label="${date===ymd()?'今日':'この日'}使った金額 ${yen(s)}・目標 ${has?yen(g):'未設定'}">
    <div class="dg-metrics"><div class="dg-metric" style="--c:var(--orange)"><span>使った金額</span><b>${yen(s)}</b></div><div class="dg-metric" style="--c:var(--green)"><span>目標</span><b>${has?yen(g):'—'}</b></div><div class="dg-metric" style="--c:var(--accent)"><span>昨日</span><b>${yen(ys)}</b></div></div>
    <div class="dg-bar${over?' over':''}" aria-hidden="true"><i style="width:${has?clamp(rate,0,100):0}%"></i></div>
    <div class="dg-note">${has?(over?`目標を ${yen(s-g)} 超えています`:`目標の ${rate}%・あと ${yen(g-s)} 使えます`):'目標を決めると、使える残りがわかります'}</div>
  </button><button type="button" class="goal-plan-action" id="${prefix}GoalAction"><span>${has?'目標を見直す':'目標をつくる'}</span><span>›</span></button></div>`;
}

/* ---------- 画面の行き来: 専用画面は右から入り、戻ると右へ出る（iOSのpushと同じ）。rootどうしは短いクロスフェード ---------- */
let screenSwapSkip=false;
function animateScreenSwap(prev,next){
  if(screenSwapSkip){screenSwapSkip=false;return}
  if(!prev||prev===next||mm3MotionReduced())return;
  const a=document.getElementById(`screen-${prev}`),b=document.getElementById(`screen-${next}`);if(!a||!b)return;
  const enterDetail=isDetailScreen(next)&&!isDetailScreen(prev),leaveDetail=isDetailScreen(prev)&&!isDetailScreen(next),detailToDetail=isDetailScreen(prev)&&isDetailScreen(next);
  const ease='cubic-bezier(.32,.72,0,1)',dur=320;
  a.classList.add('screen-leaving');
  const done=()=>{a.classList.remove('screen-leaving');for(const el of [a,b]){el.style.zIndex='';el.style.boxShadow=''}};
  let anims=[];
  if(enterDetail||detailToDetail){
    b.style.zIndex='3';b.style.boxShadow='-12px 0 30px rgba(0,0,0,.12)';a.style.zIndex='2';
    anims=[b.animate([{transform:'translateX(100%)'},{transform:'translateX(0)'}],{duration:dur,easing:ease}),a.animate([{transform:'translateX(0)',filter:'brightness(1)'},{transform:'translateX(-28%)',filter:'brightness(.92)'}],{duration:dur,easing:ease})];
  }else if(leaveDetail){
    a.style.zIndex='3';a.style.boxShadow='-12px 0 30px rgba(0,0,0,.12)';b.style.zIndex='2';
    anims=[a.animate([{transform:'translateX(0)'},{transform:'translateX(100%)'}],{duration:dur-40,easing:ease}),b.animate([{transform:'translateX(-28%)',filter:'brightness(.92)'},{transform:'translateX(0)',filter:'brightness(1)'}],{duration:dur-40,easing:ease})];
  }else{
    b.style.zIndex='3';a.style.zIndex='2';
    anims=[b.animate([{opacity:0},{opacity:1}],{duration:160,easing:'ease-out'})];
  }
  Promise.all(anims.map(x=>x.finished.catch(()=>{}))).then(done);
}

/* ---------- 支払いなどのカード: どこを押しても開き、押している間はカード全体が少し縮む（ホームは 26-liquid-v16.js が受け持つ） ---------- */
(function installCardTaps(){
  const skip='button,a,input,select,textarea,label,[role=button],[role=radio],[role=switch],.home-period';
  document.addEventListener('click',e=>{const wrap=e.target.closest?.('.home-card-wrap');if(!wrap||wrap.closest('#todayContent')||e.target.closest(skip))return;const body=wrap.querySelector('.home-card-body');if(body&&!body.disabled){e.preventDefault();body.click()}});
  let pressed=null;const clear=()=>{pressed?.classList.remove('card-pressing');pressed=null};
  document.addEventListener('pointerdown',e=>{const wrap=e.target.closest?.('.home-card-wrap');if(!wrap||wrap.closest('#todayContent')||e.target.closest('.home-period,input,select,textarea'))return;if(!wrap.querySelector('.home-card-body'))return;pressed=wrap;wrap.classList.add('card-pressing')},true);
  for(const ev of ['pointerup','pointercancel','pointerleave','scroll'])document.addEventListener(ev,clear,true);
  document.addEventListener('pointermove',e=>{if(pressed&&(Math.abs(e.movementY)>4||Math.abs(e.movementX)>6))clear()},true);
})();

/* ---------- カードのプレビュー（ウォレットのようなカードの絵） ---------- */
const CARD_ARTS=['linear-gradient(135deg,#5E5CE6 0%,#3A2FB8 55%,#1C1B4D 100%)','linear-gradient(135deg,#FF375F 0%,#C2185B 55%,#4A0D2E 100%)','linear-gradient(135deg,#30B0C7 0%,#0A6E8A 55%,#08304A 100%)','linear-gradient(135deg,#3C3C43 0%,#1C1C1E 60%,#000 100%)','linear-gradient(135deg,#FF9F0A 0%,#E0561B 55%,#5A1D07 100%)','linear-gradient(135deg,#34C759 0%,#0F7A4A 55%,#06331F 100%)'];
function cardArtGradient(c){const key=String(c?.name||'')+String(c?.id||'');let h=0;for(const ch of key)h=(h*31+ch.charCodeAt(0))>>>0;return CARD_ARTS[h%CARD_ARTS.length]}

/* ---------- ACF C100モード（カード100%の試算）: トグルでON/OFF ---------- */
function acfC100ToggleHtml(){
  const on=data.acfSettings?.c100Mode===true;
  return `<div class="acf-c100${on?' on':''}"><div class="acf-c100-badge" aria-hidden="true">C100</div><div class="acf-c100-text"><b>C100モード（試算）</b><small>${on?'今日からずっと現金を使わず、すべてカードで払う前提で計算しています。カードの限度額と引落後の残高は確認します。記録と設定は変わりません。':'今日からずっと現金を使わず、すべてカードで払ったらどうなるかを試算します。'}</small></div><button type="button" class="switch${on?' on':''}" id="acfC100Toggle" role="switch" aria-checked="${on}" aria-label="C100モード（カード100%の試算）"></button></div>`;
}
function setAcfC100(on){
  try{safeCommit(()=>{data.acfSettings={...(data.acfSettings||{}),c100Mode:!!on}},{render:true,label:'acf c100 mode'})}catch(e){return false}
  document.documentElement.classList.toggle('acf-c100',!!on);feedback?.selection?.();
  showToast(on?'C100モード：カード100%で試算しています':'C100モードを終了しました');return true;
}
function bindAcfC100(root,redraw){const b=root.querySelector('#acfC100Toggle');if(b)b.onclick=()=>{if(setAcfC100(!(data.acfSettings?.c100Mode===true)))redraw?.()}}
