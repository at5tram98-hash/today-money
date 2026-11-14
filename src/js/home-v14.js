/* ======================================================================
   第14版: ホーム（H-001〜081）・支払いroot（P-001〜015）・＋入力ハブ（Q-001〜006）・
   プロフィールパネル（H-003〜007）・日付カレンダー（H-011）・ホームの表示項目の編集（H-081）
   金額の計算・保存は既存の関数（spentDate, mm3SalaryMonthSummary, buildCashFlowForecast,
   mm3PaymentSummary, financialEventsFrom など）をそのまま使い、表示と入口だけを変える。
   ホームを開く・カードを押す・グラフをなぞる・長押しのプレビューでは会計データを書き換えない。
   ====================================================================== */

/* ---------- 共通の小部品 ---------- */
const HOME_CARD_KEYS=['spend','assets','salary','acf','payment'];
const HOME_ROW_KEYS=['highlights','categories','transactions','dayclose','compare','mail','large','goals'];
const HOME_SECTION_LABELS={spend:'支出',assets:'総資産',salary:'今月の給与',acf:'ACF',payment:'次の支払い',highlights:'ハイライト',categories:'カテゴリ別支出',transactions:'最近の取引',dayclose:'日締め',compare:'今月の比較',mail:'未確認の明細',large:'大型支出の計画',goals:'旅行・プレゼント'};
function homeLayout(){
  const raw=data.homeLayout||{},norm=(list,keys)=>{const seen=(Array.isArray(list)?list:[]).filter(k=>keys.includes(k));return [...new Set([...seen,...keys])]};
  return{cards:norm(raw.cards,HOME_CARD_KEYS),rows:norm(raw.rows,HOME_ROW_KEYS),hidden:new Set((raw.hidden||[]).filter(k=>HOME_CARD_KEYS.includes(k)||HOME_ROW_KEYS.includes(k)))};
}
/* homePeriod・setHomePeriod は glass-v15.js（開いた時の期間の設定に従う） */
function homeTimeLabel(iso){if(!iso)return '';const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';return `${d.getMonth()+1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`}
function homeShortDate(date){const d=parseYmd(date);return `${d.getMonth()+1}/${d.getDate()}`}
const HOME_CHART_COLORS=['var(--accent)','var(--teal)','var(--orange)','var(--purple)','var(--green)','var(--yellow)'];
/* ミニ棒グラフ。values: [{label,value}]。読み上げ用に名前を持つ */
function miniBarsSvg(values,label){
  const w=128,h=56,n=Math.max(1,values.length),max=Math.max(1,...values.map(v=>Math.abs(Number(v.value)||0))),gap=n>16?1.5:3,bw=Math.max(1.5,(w-gap*(n-1))/n);
  const bars=values.map((v,i)=>{const val=Math.abs(Number(v.value)||0),bh=val?Math.max(2,val/max*(h-4)):1.5;return `<rect x="${(i*(bw+gap)).toFixed(2)}" y="${(h-bh).toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" rx="${Math.min(2,bw/2).toFixed(2)}" class="${val?'':'empty'}"/>`}).join('');
  return `<svg class="mini-chart mini-bars" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" data-points="${esc(JSON.stringify(values.map(v=>[v.label,Number(v.value)||0])))}">${bars}</svg>`;
}
/* ミニドーナツ。parts: [{label,value}]（正の値だけ） */
function miniDonutSvg(parts,label){
  const total=sum(parts,p=>p.value),r=22,c=2*Math.PI*r;let offset=0;
  const segs=parts.map((p,i)=>{const len=p.value/total*c,seg=`<circle cx="28" cy="28" r="${r}" stroke="${HOME_CHART_COLORS[i%HOME_CHART_COLORS.length]}" stroke-dasharray="${Math.max(0,len-1.5).toFixed(2)} ${(c-Math.max(0,len-1.5)).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"/>`;offset+=len;return seg}).join('');
  return `<svg class="mini-chart mini-donut" viewBox="0 0 56 56" role="img" aria-label="${esc(label)}" data-points="${esc(JSON.stringify(parts.map(p=>[p.label,p.value])))}"><g transform="rotate(-90 28 28)">${segs}</g></svg>`;
}
/* ミニ折れ線。安全残高（threshold）を点線で区別する */
function miniSparkSvg(values,threshold,label){
  const w=128,h=56,nums=values.map(v=>Number(v.value)||0),lo=Math.min(...nums,threshold??Infinity),hi=Math.max(...nums,threshold??-Infinity),span=Math.max(1,hi-lo),x=i=>(i/Math.max(1,nums.length-1)*w),y=v=>(h-4-(v-lo)/span*(h-8));
  const path=nums.map((v,i)=>`${i?'L':'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' '),line=threshold!=null&&Number.isFinite(threshold)?`<line class="spark-threshold" x1="0" x2="${w}" y1="${y(threshold).toFixed(1)}" y2="${y(threshold).toFixed(1)}"/>`:'';
  return `<svg class="mini-chart mini-spark" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" data-points="${esc(JSON.stringify(values.map(v=>[v.label,Number(v.value)||0])))}">${line}<path d="${path}"/></svg>`;
}
/* グラフをなぞると、その位置の値をカード内に表示する（H-022・H-041・H-051）。値は書き換えない。
   なぞった後の指離しでは画面遷移しない */
function installMiniScrub(card){
  const chart=card.querySelector('.mini-chart[data-points]'),out=card.querySelector('.home-card-readout');if(!chart||!out)return;
  let points=[];try{points=JSON.parse(chart.dataset.points)}catch(e){return}
  let active=null;
  const show=x=>{const r=chart.getBoundingClientRect(),i=clamp(Math.round((x-r.left)/Math.max(1,r.width)*(points.length-1)),0,points.length-1),p=points[i];if(!p)return;out.textContent=`${p[0]}・${yen(p[1])}`;out.hidden=false};
  chart.addEventListener('pointerdown',e=>{active={x:e.clientX,y:e.clientY,moved:false,id:e.pointerId}},{passive:true});
  chart.addEventListener('pointermove',e=>{if(!active||active.id!==e.pointerId)return;if(!active.moved&&Math.abs(e.clientX-active.x)<6)return;active.moved=true;show(e.clientX)},{passive:true});
  const end=e=>{if(!active)return;if(active.moved){card.dataset.suppressClick=String(performance.now()+450)}active=null};
  chart.addEventListener('pointerup',end);chart.addEventListener('pointercancel',end);
}
function cardClickAllowed(card){return !(Number(card.dataset.suppressClick||0)>performance.now())}
/* カード・行の長押し（長押しだけが唯一の経路になる操作は作らない） */
function homeLongPress(el,items){if(el&&typeof installLongPress==='function')installLongPress(el,()=>{feedback?.selection?.();openMenu(el,typeof items==='function'?items():items)},{delay:550,moveTolerance:10})}

/* ---------- ヘッダー（H-001〜007） ---------- */
function profileState(){
  if(data.meta?.storageWriteError)return{key:'warning',label:'端末に保存できません',note:'空き容量やSafariのストレージ設定を確認してください'};
  if(typeof gmailSyncing!=='undefined'&&gmailSyncing)return{key:'syncing',label:'Gmailを同期中',note:'同期が終わるまで、もう一度押しても重複しません'};
  if(typeof gmailConnected==='function'&&gmailConnected())return{key:'ok',label:'端末に保存済み・Gmail連携中',note:`Gmailの最終同期 ${homeTimeLabel(data.gmailSettings?.lastSyncAt)||'未同期'}`};
  return{key:'local',label:'端末に保存済み',note:'Gmailは未接続。バックアップはデータ管理から作成できます'};
}
function homeHeaderHtml(){
  const st=profileState();
  return topbar('ホーム','',`<button class="icon-btn glass-btn" id="todaySearch" aria-label="検索">${icon('search')}</button><button type="button" class="profile-btn ring-${st.key}" id="homeProfile" aria-label="プロフィール・ホームの設定・${esc(st.label)}" aria-haspopup="dialog">${profileAvatarHtml('profile-btn-avatar')}</button>`);
}
/* プロフィールボタンはホーム専用の設定（openHomeSettings、glass-v15.js）。他のタブへ移るボタンは置かない */
/* 重要なお知らせ（H-008・H-009）: 警告がある時だけ支出カードの上。×はこのカードだけ閉じる（お知らせ一覧には残る） */
let homeDismissedNotices=new Set();
function homeAlertHtml(){
  const n=(data.notices||[]).find(x=>!x.read&&x.type==='warning'&&!homeDismissedNotices.has(x.id));if(!n)return '';
  return `<div class="home-alert" role="status"><button type="button" class="home-alert-body" id="homeAlert" data-notice="${esc(n.id)}"><span class="home-alert-icon">${icon('warning')}</span><span class="home-alert-text"><strong>${esc(n.title)}</strong><span>${esc(n.message||'')}</span></span></button><button type="button" class="home-alert-close" id="homeAlertClose" aria-label="このお知らせを閉じる">${icon('close')}</button></div>`;
}

/* ---------- サマリーカード（H-020〜061） ---------- */
function homeSpendCardHtml(){
  const month=homePeriod()==='month',date=trackingDate,mk=currentMonth,spent=month?spentMonth(mk):spentDate(date),goal=month?monthlyGoal(mk).total:dailyGoal(date).total;
  let values;
  if(month){const days=daysInMonth(mk);values=Array.from({length:days},(_,i)=>{const d=`${mk}-${pad(i+1)}`;return{label:`${i+1}日`,value:d<=ymd()?spentDate(d):0}})}
  else{const hours=Array(24).fill(0);for(const t of txForDate(date)){const at=new Date(t.createdAt||`${date}T12:00:00`),h=Number.isNaN(at.getTime())?12:at.getHours();hours[h]+=Math.max(0,Number(t.amount)||0)}values=hours.map((v,h)=>({label:`${h}時台`,value:v}))}
  const main=spent>0?yen(spent):goal>0?yen(goal):'目標未設定',mainCaption=spent>0?(month?'今月使った金額':'この日に使った金額'):goal>0?'目標（まだ使っていません）':'まだ使っていません';
  const status=!goal?{cls:'link',text:spent>0?'目標未設定・目標をつくる':'目標をつくる'}:spent>goal?{cls:'over',text:`目標超過 ${yen(spent-goal)}`}:{cls:'ok',text:`残り ${yen(goal-spent)}`};
  const dateLabel=month?monthLabel(mk):(date===ymd()?`今日・${parseYmd(date).getMonth()+1}月${parseYmd(date).getDate()}日`:dayLabel(date));
  return `<section class="home-card-wrap" data-home-section="spend"><div class="home-card-head"><h2 class="home-card-title">支出</h2><div class="home-period" role="group" aria-label="集計期間"><span class="home-period-indicator" aria-hidden="true"></span><button type="button" id="homePeriodToday" aria-pressed="${!month}">今日</button><button type="button" id="homePeriodMonth" aria-pressed="${month}">今月</button></div></div>
  <div class="home-card"><button type="button" class="home-date" id="homeDate" aria-label="${esc(dateLabel)}・日付を選ぶ">${esc(dateLabel)}${icon('chevronDown')}</button>
  <button type="button" class="home-card-body" id="homeSpendCard" aria-label="${esc(`支出 ${mainCaption} ${main}・支出詳細を開く`)}"><span class="home-card-left"><span class="home-card-value">${main}</span><span class="home-card-caption">${mainCaption}</span></span><span class="home-card-right">${miniBarsSvg(values,month?'日別の支出':'時間帯別の支出')}</span></button>
  <p class="home-card-readout" hidden aria-live="polite"></p><button type="button" class="home-card-status ${status.cls}" id="homeGoalStatus">${esc(status.text)}${icon('chevronRight')}</button></div></section>`;
}
function homeBankParts(){return data.banks.map(b=>({label:b.name||'口座',value:Math.max(0,Number(b.balance)||0)})).filter(p=>p.value>0)}
function homeAssetsCardHtml(){
  const total=totalDeposits(),parts=homeBankParts(),latest=data.banks.map(b=>b.balanceAsOf||b.updatedAt).filter(Boolean).sort().at(-1);
  const right=parts.length>=1?miniDonutSvg(parts,'口座ごとの残高の割合'):'<span class="home-card-empty">割合は未集計</span>';
  const body=data.banks.length?`<span class="home-card-left"><span class="home-card-value">${yen(total)}</span><span class="home-card-caption">${latest?`更新 ${homeTimeLabel(latest)}`:'残高の更新記録なし'}</span></span><span class="home-card-right">${right}</span>`:`<span class="home-card-left"><span class="home-card-value small">口座が未登録です</span><span class="home-card-caption">＋の「その他の入力」から銀行口座を追加できます</span></span>`;
  return `<section class="home-card-wrap" data-home-section="assets"><h2 class="home-card-title">総資産</h2><div class="home-card"><button type="button" class="home-card-body" id="homeAssetsCard" aria-label="${esc(`総資産 ${data.banks.length?yen(total):'口座未登録'}・資産詳細を開く`)}">${body}</button><p class="home-card-readout" hidden aria-live="polite"></p></div></section>`;
}
function homeNextPayday(){const today=ymd();return data.salaryRecords.filter(r=>r.status!=='入金済'&&r.date&&r.date>=today).sort((a,b)=>a.date.localeCompare(b.date))[0]||null}
function homeSalaryCardHtml(){
  const m=ym(),summary=mm3SalaryMonthSummary(m),has=data.employers.length||data.salaryRecords.length,values=Array.from({length:6},(_,i)=>{const mm=addMonths(m,i-5);return{label:monthLabel(mm),value:mm3SalaryMonthSummary(mm).total}}),next=homeNextPayday();
  const body=has?`<span class="home-card-left"><span class="home-card-value">${yen(summary.total)}</span><span class="home-card-caption">今月の受取見込み${(summary.records||[]).some(r=>r.source==="shift")?"・シフトから自動":""}</span></span><span class="home-card-right">${values.some(v=>v.value>0)?miniBarsSvg(values,'直近6か月の給与'):'<span class="home-card-empty">給与の記録がまだありません</span>'}</span>`:`<span class="home-card-left"><span class="home-card-value small">給与が未登録です</span><span class="home-card-caption">＋の「給与を登録」から記録できます</span></span>`;
  return `<section class="home-card-wrap" data-home-section="salary"><h2 class="home-card-title">今月の給与</h2><div class="home-card"><button type="button" class="home-card-body" id="homeSalaryCard" aria-label="${esc(`今月の給与 ${has?yen(summary.total):'未登録'}・給与詳細を開く`)}">${body}</button><p class="home-card-readout" hidden aria-live="polite"></p>${next?`<button type="button" class="home-card-status" id="homeNextPayday">次の給料日 ${homeShortDate(next.date)}${icon('chevronRight')}</button>`:''}</div></section>`;
}
function homeAcfCardHtml(){
  let body,risk='';
  if(!data.acfSettings.initialized)body=`<span class="home-card-left"><span class="home-card-value small">未設定</span><span class="home-card-caption">最低残したい金額を決めると、今日使える目安を計算します</span></span>`;
  else{const f=buildCashFlowForecast(),rows=(f.rows||[]).slice(0,30),floor=Number(f.reserve??f.settings?.reserve??f.reserveFloor);body=`<span class="home-card-left"><span class="home-card-value">${formatAcfAvailable(f.safeTotalBudget)}</span><span class="home-card-caption">今日使える目安・${esc(f.status||'')}</span></span><span class="home-card-right">${rows.length>1?miniSparkSvg(rows.map(r=>({label:dayLabel(r.date),value:r.forecastBalance})),Number.isFinite(floor)?floor:null,'30日間の残高の見通し'):''}</span>`;if(f.status&&f.status!=='安全')risk=`<p class="home-card-note">${esc(f.status==='不足'?'支払いに対して資金不足になる日があります':'最低残したい金額を下回る日があります')}</p>`}
  return `<section class="home-card-wrap" data-home-section="acf"><h2 class="home-card-title">ACF</h2><div class="home-card"><button type="button" class="home-card-body" id="homeAcfCard" aria-label="ACFの詳細を開く">${body}</button><p class="home-card-readout" hidden aria-live="polite"></p>${risk}</div></section>`;
}
function homePaymentEvents(limit=3){return financialEventsFrom(ymd(),60).filter(e=>e.type!=='income').slice(0,limit)}
function homePaymentCardHtml(){
  const list=homePaymentEvents(4),within=financialEventsFrom(ymd(),30).filter(e=>e.type!=='income'),total=sum(within,e=>Math.abs(Number(e.amount)||0)),ev=list[0];
  const kind=e=>({card:'カード',fixed:'固定',large:'大型'}[e.type]||'支払い');
  const rows=list.map(e=>{const d=parseYmd(e.date),days=Math.round((d-parseYmd(ymd()))/864e5);return `<span class="np-row"><span class="np-date" aria-hidden="true"><b>${d.getDate()}</b><i>${d.getMonth()+1}月</i></span><span class="np-main"><span class="np-title">${esc(e.title)}</span><span class="np-sub">${days===0?'今日':days===1?'明日':`${days}日後`}・${kind(e)}${e.detail?`・${esc(e.detail)}`:''}</span></span><span class="np-amount">${yen(Math.abs(e.amount))}</span></span>`}).join('');
  const body=ev?`<span class="np-summary"><span class="np-summary-label">30日以内</span><span class="np-summary-value"><span class="home-card-value np-total">${yen(total)}</span><span class="np-count">${within.length}件</span></span></span><span class="np-list">${rows}</span>`:`<span class="home-card-left"><span class="home-card-value small">60日以内の支払い予定はありません</span><span class="home-card-caption">カード・固定支払い・大型支出を登録すると表示します</span></span>`;
  return `<section class="home-card-wrap" data-home-section="payment"><h2 class="home-card-title">次の支払い</h2><div class="home-card"><button type="button" class="home-card-body np-body" id="homePaymentCard" aria-label="${esc(ev?`次の支払い ${ev.title} ${homeShortDate(ev.date)} ${yen(Math.abs(ev.amount))}・30日以内 ${within.length}件 ${yen(total)}・詳細を開く`:'次の支払い・予定なし')}">${body}</button><button type="button" class="home-card-status link" id="homeAllPayments">すべての支払いを見る${icon('chevronRight')}</button></div></section>`;
}
/* ハイライト（ヘルスケアの「ハイライト」のように、比べて分かる短い文と2本の棒） */
function homeHighlights(){
  const m=ym(),pm=addMonths(m,-1),today=parseYmd(ymd()).getDate(),pdays=daysInMonth(pm),upto=Math.min(today,pdays);
  const spentUntil=(mk,n)=>{let t=0;for(let i=1;i<=n;i++)t+=spentDate(`${mk}-${pad(i)}`);return t};
  const cur=spentUntil(m,today),prev=spentUntil(pm,upto),out=[];
  if(cur||prev)out.push({key:'pace',sym:'cart',color:'var(--orange)',label:'支出のペース',text:cur<=prev?`今月は先月の同じ時期より ${yen(prev-cur)} 少ないペースです。`:`今月は先月の同じ時期より ${yen(cur-prev)} 多いペースです。`,bars:[{label:monthLabel(m),value:cur},{label:monthLabel(pm),value:prev}],open:()=>openMonthAnalysis(m)});
  const avgCur=today?Math.round(cur/today):0,avgPrev=pdays?Math.round(spentMonth(pm)/pdays):0;
  if(avgCur||avgPrev)out.push({key:'average',sym:'chart',color:'var(--accent)',label:'1日の平均',text:avgCur<=avgPrev?'今月の1日あたりの支出は先月より少なめです。':'今月の1日あたりの支出は先月より多めです。',bars:[{label:monthLabel(m),value:avgCur,unit:'/日'},{label:monthLabel(pm),value:avgPrev,unit:'/日'}],open:()=>openMonthAnalysis(m)});
  const cats=data.categories.map(c=>({c,v:monthCategorySpent(m,c.name)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v),monthTotal=spentMonth(m);
  if(cats.length)out.push({key:'category',sym:normalizeCategoryIcon(cats[0].c.icon,cats[0].c.id),color:'var(--purple)',label:'いちばん多いカテゴリ',text:`今月は「${cats[0].c.name}」が支出の ${Math.round(cats[0].v/Math.max(1,monthTotal)*100)}% です。`,bars:cats.slice(0,2).map(x=>({label:x.c.name,value:x.v})),open:()=>openTransactionList({month:m,category:cats[0].c.name,title:`${cats[0].c.name}・${monthLabel(m)}`})});
  const salary=mm3SalaryMonthSummary(m).total;
  if(salary)out.push({key:'balance',sym:'wallet',color:'var(--green)',label:'収入と支出',text:salary>=monthTotal?`今月の給与見込みから支出を引くと ${yen(salary-monthTotal)} 残ります。`:`今月の支出が給与見込みを ${yen(monthTotal-salary)} 上回っています。`,bars:[{label:'給与見込み',value:salary},{label:'支出',value:monthTotal}],open:()=>{payViewMonth=m;switchTab('pay')}});
  return out;
}
function homeHighlightsHtml(){
  const list=homeHighlights();if(!list.length)return '';
  return `<div class="home-highlights" data-home-section="highlights">${list.map(h=>{const max=Math.max(1,...h.bars.map(b=>b.value));return `<button type="button" class="hl-card" data-home-highlight="${h.key}" style="--hl:${h.color}" aria-label="${esc(`${h.label}・${h.text}`)}"><span class="hl-head"><span class="hl-icon" aria-hidden="true">${icon(h.sym)}</span>${esc(h.label)}<span class="chev" aria-hidden="true">${icon('chevronRight')}</span></span><span class="hl-text">${esc(h.text)}</span><span class="hl-bars" aria-hidden="true">${h.bars.map((b,i)=>`<span class="hl-bar-row"><span class="hl-bar-value">${yen(b.value)}${b.unit?`<small>${b.unit}</small>`:''}</span><span class="hl-bar ${i?'muted':''}" style="width:${Math.max(18,b.value/max*100).toFixed(1)}%"><span>${esc(b.label)}</span></span></span>`).join('')}</span></button>`}).join('')}</div>`;
}
function openPaymentEvent(ev){
  if(!ev)return switchRoot('payments');
  if(ev.type==='card'&&ev.cardId)return openCardDetail(ev.cardId,ev.date.slice(0,7));
  if(ev.type==='fixed'&&ev.fixedId){const f=data.fixedPayments.find(x=>x.id===ev.fixedId);if(f)return openFixedPayment(f)}
  if(ev.type==='large'&&ev.largeId)return openLargeExpenseDetail(ev.largeId);
  switchTab('payments');
}

/* ---------- 最近の動き（H-070〜081） ---------- */
function homeCategoryRows(){const month=homePeriod()==='month';return data.categories.map(c=>({c,v:month?monthCategorySpent(currentMonth,c.name):dailyCategorySpent(trackingDate,c.name)})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v)}
function categoryTableRowHtml(x,total){const pct=Math.round(x.v/Math.max(1,total)*100);return `<button type="button" class="row press home-row" data-home-cat="${esc(x.c.name)}"><span class="row-icon cat-line">${icon(normalizeCategoryIcon(x.c.icon,x.c.id))}</span><div class="row-main"><div class="row-title">${esc(x.c.name)}</div><div class="home-ratio" aria-hidden="true"><i style="width:${pct}%"></i></div></div><div class="row-value">${yen(x.v)}<small>${pct}%</small></div><span class="chev">${icon('chevronRight')}</span></button>`}
function homeRecentTransactions(limit=3){return [...data.transactions].sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt||'').localeCompare(String(a.createdAt||''))).slice(0,limit)}
function homeRowsHtml(){
  const L=homeLayout(),month=homePeriod()==='month',parts={};
  const cats=homeCategoryRows(),total=sum(cats,x=>x.v);
  parts.categories=`<div class="group home-table" data-home-section="categories" aria-label="カテゴリ別支出">${cats.length?cats.slice(0,homePrefs().recentCount).map(x=>categoryTableRowHtml(x,total)).join(''):`<div class="row"><div class="row-main"><div class="row-title">カテゴリ別支出</div><div class="row-sub">${month?'今月':'この日'}の支出はまだありません</div></div></div>`}${cats.length?`<button type="button" class="row press home-row link-row" id="homeAllCategories"><div class="row-main"><div class="row-title">カテゴリをすべて見る</div></div><span class="chev">${icon('chevronRight')}</span></button>`:''}</div>`;
  const txs=homeRecentTransactions(homePrefs().recentCount);
  parts.transactions=`<div class="group home-table" data-home-section="transactions" aria-label="最近の取引">${txs.length?txs.map(t=>`<button type="button" class="row press home-row" data-home-tx="${esc(t.id)}"><span class="row-icon cat-line">${icon(normalizeCategoryIcon(catByName(t.category)?.icon,catByName(t.category)?.id))}</span><div class="row-main"><div class="row-title">${esc(t.merchant||t.category||'支出')}</div><div class="row-sub">${homeShortDate(t.date)}・${esc(t.category||'')}</div></div><div class="row-value">${yen(t.amount)}</div><span class="chev">${icon('chevronRight')}</span></button>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">最近の取引</div><div class="row-sub">まだ記録がありません。＋から支出を記録できます</div></div></div>'}<button type="button" class="row press home-row link-row" id="homeAllTransactions"><div class="row-main"><div class="row-title">すべての取引</div></div><span class="chev">${icon('chevronRight')}</span></button></div>`;
  const dcLabel=typeof dayClosingLabel==='function'?dayClosingLabel(trackingDate):'',pendingMail=data.mailImports.filter(x=>x.status==='pending').length;
  parts.dayclose=`<button type="button" class="row press home-row" id="homeDayClose"><span class="row-icon">${icon('dayClose')}</span><div class="row-main"><div class="row-title">日締め</div><div class="row-sub">${dcLabel?esc(dcLabel):'まだ締めていません'}${pendingMail?`・未確認 ${pendingMail}件`:''}</div></div><span class="chev">${icon('chevronRight')}</span></button>`;
  const m=ym(),cur=spentMonth(m),prev=spentMonth(addMonths(m,-1)),diff=cur-prev;
  parts.compare=`<button type="button" class="row press home-row" id="homeCompare"><span class="row-icon">${icon('chart')}</span><div class="row-main"><div class="row-title">今月の比較</div><div class="row-sub">先月より ${diff>=0?'+':'−'}${yen(Math.abs(diff))}</div></div><span class="chev">${icon('chevronRight')}</span></button>`;
  parts.mail=pendingMail?`<button type="button" class="row press home-row" id="homeMail"><span class="row-icon">${icon('mail')}</span><div class="row-main"><div class="row-title">未確認の明細 ${pendingMail}件</div><div class="row-sub">メール取引センターで確認</div></div><span class="chev">${icon('chevronRight')}</span></button>`:'';
  const large=data.largeExpensePlans.filter(p=>p.status==='planned');
  parts.large=large.length?`<button type="button" class="row press home-row" id="homeLarge"><span class="row-icon">${icon('cart')}</span><div class="row-main"><div class="row-title">大型支出の計画 ${large.length}件</div><div class="row-sub">次は ${homeShortDate([...large].sort((a,b)=>a.date.localeCompare(b.date))[0].date)}</div></div><span class="chev">${icon('chevronRight')}</span></button>`:'';
  const goals=(data.eventGoals||[]).filter(g=>g.status==='active'||g.status==='planning');
  parts.goals=goals.length?`<button type="button" class="row press home-row" id="homeGoals"><span class="row-icon">${icon('gift')}</span><div class="row-main"><div class="row-title">旅行・プレゼント ${goals.length}件</div><div class="row-sub">${esc(goals[0].name)}・期限 ${homeShortDate(goals[0].deadline)}</div></div><span class="chev">${icon('chevronRight')}</span></button>`:'';
  parts.highlights=homeHighlightsHtml();
  /* 並び順どおりに出す。日締め・比較などの1行の項目は、続いている間は1つの表にまとめる */
  const visible=L.rows.filter(k=>!L.hidden.has(k)&&parts[k]),out=[];let lineBuf=[];
  const flush=()=>{if(lineBuf.length)out.push(`<div class="group home-table">${lineBuf.join('')}</div>`);lineBuf=[]};
  let recentHead=false;const head=()=>{if(!recentHead){recentHead=true;out.push('<h2 class="section-head home-section-head">最近の動き</h2>')}};
  for(const k of visible){if(k==='highlights'){flush();out.push(`<h2 class="section-head home-section-head">ハイライト</h2>${parts[k]}`)}else if(['categories','transactions'].includes(k)){flush();head();out.push(parts[k])}else{if(!lineBuf.length)head();lineBuf.push(parts[k])}}
  flush();
  return out.join('');
}

/* ---------- ホームの描画 ---------- */
function renderToday(){
  document.getElementById('todayTop').innerHTML=homeHeaderHtml();
  const L=homeLayout(),cards={spend:homeSpendCardHtml,assets:homeAssetsCardHtml,salary:homeSalaryCardHtml,acf:homeAcfCardHtml,payment:homePaymentCardHtml};
  document.getElementById('todayContent').innerHTML=`${homeAlertHtml()}<div class="home-cards">${L.cards.filter(k=>!L.hidden.has(k)).map(k=>cards[k]()).join('')}</div>${homeRowsHtml()}`;
  bindHome();applyHomePrefs();
}
function bindHome(){
  const $=id=>document.getElementById(id),on=(id,fn)=>{const el=$(id);if(el)el.onclick=fn};
  on('todaySearch',()=>openGlobalSearch());
  on('homeProfile',openHomeSettings);
  on('homeAlert',openNotices);
  on('homeAlertClose',e=>{homeDismissedNotices.add($('homeAlert')?.dataset.notice);renderToday()});
  on('homePeriodToday',()=>setHomePeriod('today'));on('homePeriodMonth',()=>setHomePeriod('month'));
  installPeriodDrag($('homePeriodToday')?.parentElement);
  const month=homePeriod()==='month';
  const dateBtn=$('homeDate');
  if(dateBtn){
    dateBtn.onclick=()=>month?openDisplayMonthPicker({title:'表示する月',value:currentMonth,onApply:m=>{currentMonth=m;renderToday()}}):openDayCalendar(trackingDate,d=>{trackingDate=d;renderToday()});
    homeLongPress(dateBtn,()=>month?[{label:'先月',icon:'chevronLeft',action:()=>{currentMonth=addMonths(currentMonth,-1);renderToday()}},{label:'今月',icon:'today',action:()=>{currentMonth=ym();renderToday()}}]:[{label:'日付ホイールで選ぶ',icon:'calendar',action:()=>openDayWheel(trackingDate,d=>{trackingDate=d;renderToday()})},{label:'今日に戻る',icon:'today',action:()=>{trackingDate=ymd();renderToday()}}]);
    installHorizontalSwipe(dateBtn,()=>{if(month){currentMonth=addMonths(currentMonth,1);renderToday()}else shiftTrackingDate(1)},()=>{if(month){currentMonth=addMonths(currentMonth,-1);renderToday()}else shiftTrackingDate(-1)});
  }
  const card=(id,open,menu)=>{const el=$(id);if(!el)return;const wrap=el.closest('.home-card');installMiniScrub(wrap);el.onclick=e=>{if(!cardClickAllowed(wrap))return;open(e)};if(menu)homeLongPress(el,menu)};
  card('homeSpendCard',()=>switchTab(month?'month':'day'),()=>[{label:'支出を記録',icon:'plus',action:()=>openQuickExpense(trackingDate)},{label:'支出履歴',icon:'list',action:()=>openTransactionList(month?{month:currentMonth,title:`${monthLabel(currentMonth)}の支払い`}:{date:trackingDate,title:`${dayLabel(trackingDate)}の支払い`})},{label:'目標設定',icon:'target',action:()=>month?openMonthlyGoalPlanner(currentMonth):openDailyGoalPlanner(trackingDate)}]);
  on('homeGoalStatus',()=>month?openMonthlyGoalPlanner(currentMonth):openDailyGoalPlanner(trackingDate));
  card('homeAssetsCard',e=>{switchTab('assets');if(e.target.closest('.mini-donut'))requestAnimationFrame(()=>document.querySelector('#assetsContent .mm3-assets-list,#mm3AssetSort')?.scrollIntoView({block:'start'}))},()=>homeBankParts().length?homeBankParts().map(p=>({label:p.label,value:yen(p.value),preview:true})):[{label:'口座はまだありません',preview:true}]);
  card('homeSalaryCard',()=>{payViewMonth=ym();switchTab('pay')},()=>{const s=mm3SalaryMonthSummary(ym()),by=new Map();for(const r of s.records||[]){const name=data.employers.find(e=>e.id===r.employerId)?.name||'勤務先';by.set(name,(by.get(name)||0)+salaryRecordExpectedOrReceivedAmount(r))}return by.size?[...by].map(([label,v])=>({label,value:yen(v),preview:true})):[{label:'今月の給与記録はありません',preview:true}]});
  on('homeNextPayday',()=>{payViewMonth=homeNextPayday()?.date.slice(0,7)||ym();switchTab('pay')});
  card('homeAcfCard',openAcf,()=>[{label:'計算条件を見る',icon:'settings',action:openAcfSettings},{label:'再計算',icon:'repeat',action:()=>{acfForecastCache=null;renderToday();showToast('ACFを再計算しました')}}]);
  card('homePaymentCard',()=>openPaymentEvent(homePaymentEvents(1)[0]),()=>{const list=homePaymentEvents(3);return list.length?list.map(ev=>({label:`${homeShortDate(ev.date)} ${ev.title}`,value:yen(Math.abs(ev.amount)),preview:true})):[{label:'予定はありません',preview:true}]});
  on('homeAllPayments',()=>switchRoot('payments'));
  document.querySelectorAll('#todayContent [data-home-cat]').forEach(b=>{const name=b.dataset.homeCat,open=()=>openTransactionList(month?{month:currentMonth,category:name,title:`${name}・${monthLabel(currentMonth)}`}:{date:trackingDate,category:name,title:name});b.onclick=open;homeLongPress(b,[{label:'明細を見る',icon:'list',action:open},{label:'カテゴリ設定',icon:'settings',action:openCategorySettings}])});
  on('homeAllCategories',openHomeCategoryList);
  document.querySelectorAll('#todayContent [data-home-tx]').forEach(b=>{const id=b.dataset.homeTx;b.onclick=()=>openTransactionDetail(id);homeLongPress(b,[{label:'編集',icon:'edit',action:()=>openTransactionEdit(id)},{label:'削除',icon:'trash',danger:true,action:()=>{openTransactionDetail(id);requestAnimationFrame(()=>document.querySelector('#pushLayer .push-view.show:last-child #txDelete')?.click())}}])});
  on('homeAllTransactions',()=>openTransactionList({title:'すべての取引'}));
  const dc=$('homeDayClose');if(dc){dc.onclick=openDayClosingJournal;homeLongPress(dc,[{label:'日付を選んで日締め',icon:'calendar',action:()=>openDayCalendar(trackingDate,d=>openDayClosing(d),{title:'日締めする日',apply:'この日を開く'})},{label:'今日の日締め',icon:'dayClose',action:()=>openDayClosing(ymd())}])}
  on('homeCompare',()=>openMonthAnalysis(ym()));
  on('homeMail',openMailOverview);
  const lg=$('homeLarge');if(lg){lg.onclick=openLargeExpenseList;homeLongPress(lg,[{label:'大型支出を計画',icon:'plus',action:()=>openLargeExpenseEditor(null,{after:renderAll})}])}
  const gl=$('homeGoals');if(gl){gl.onclick=()=>openEventGoals(ym());homeLongPress(gl,[{label:'新しい目標',icon:'plus',action:()=>openEventGoalEditor()}])}
  document.querySelectorAll('#todayContent [data-home-highlight]').forEach(b=>{const h=homeHighlights().find(x=>x.key===b.dataset.homeHighlight);if(h)b.onclick=h.open});
}
/* 今日／今月の切替: 指でなぞると選択が指に付いてきて、離した位置で決まる（H-010） */
function installPeriodDrag(group){
  if(!group||group.dataset.dragBound)return;group.dataset.dragBound='1';let g=null;
  group.addEventListener('pointerdown',e=>{g={x:e.clientX,moved:false,id:e.pointerId}});
  group.addEventListener('pointermove',e=>{if(!g||g.id!==e.pointerId)return;if(Math.abs(e.clientX-g.x)>6){g.moved=true;const r=group.getBoundingClientRect();group.style.setProperty('--drag',String(clamp((e.clientX-r.left)/r.width,0,1)));group.classList.add('dragging')}});
  const end=e=>{if(!g)return;const moved=g.moved;g=null;group.classList.remove('dragging');group.style.removeProperty('--drag');if(moved){const r=group.getBoundingClientRect();setHomePeriod(e.clientX-r.left>r.width/2?'month':'today');group.dataset.suppress=String(performance.now()+400)}};
  group.addEventListener('pointerup',end);group.addEventListener('pointercancel',()=>{g=null;group.classList.remove('dragging')});
  group.addEventListener('click',e=>{if(Number(group.dataset.suppress||0)>performance.now()){e.stopPropagation();e.preventDefault()}},true);
}
function openHomeCategoryList(){
  const month=homePeriod()==='month',cats=homeCategoryRows(),total=sum(cats,x=>x.v);
  pushView(month?`${monthLabel(currentMonth)}のカテゴリ`:`${dayLabel(trackingDate)}のカテゴリ`,`<div class="group home-table">${cats.length?cats.map(x=>categoryTableRowHtml(x,total)).join(''):'<div class="row"><div class="row-main"><div class="row-title">支出はまだありません</div></div></div>'}</div>`,root=>root.querySelectorAll('[data-home-cat]').forEach(b=>b.onclick=()=>{const name=b.dataset.homeCat;openTransactionList(month?{month:currentMonth,category:name,title:`${name}・${monthLabel(currentMonth)}`}:{date:trackingDate,category:name,title:name})}));
}
function openLargeExpenseList(){
  const draw=()=>{const list=data.largeExpensePlans.filter(p=>p.status==='planned').sort((a,b)=>a.date.localeCompare(b.date));return `<div class="group home-table">${list.length?list.map(p=>`<button type="button" class="row press" data-large-plan="${esc(p.id)}"><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${esc(p.date)}・${p.priority==='required'?'必須':'任意'}</div></div><div class="row-value">${yen(p.amount)}</div><span class="chev">${icon('chevronRight')}</span></button>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">計画中の大型支出はありません</div></div></div>'}</div><button type="button" class="secondary" id="largeListAdd">大型支出を計画</button>`};
  pushView('大型支出の計画',draw(),root=>{const bind=()=>{root.querySelectorAll('[data-large-plan]').forEach(b=>b.onclick=()=>openLargeExpenseDetail(b.dataset.largePlan));root.querySelector('#largeListAdd').onclick=()=>openLargeExpenseEditor(null,{after:()=>{root.querySelector('.push-body').innerHTML=draw();bind();renderAll()}})};bind()});
}
/* 表示する項目の編集（H-081）は「ホームの設定」（プロフィールボタン）の中。並べ替えは ≡ を上下になぞる */
function openHomeLayoutEditor(){openHomeSettings()}

/* ---------- 日付の選択（H-011・Q-011）: 確定するまで表示中の日付は変わらない ---------- */
function openDayCalendar(initial,onApply,{title='日付を選ぶ',apply='この日を表示'}={}){
  const {min,max}=trackingDateBounds();let month=initial.slice(0,7),picked=initial;
  const ws=typeof appPrefs==='function'?appPrefs().weekStart:0,wnames=['日','月','火','水','木','金','土'];
  const draw=()=>{const [y,m]=month.split('-').map(Number),first=(new Date(y,m-1,1).getDay()-ws+7)%7,days=daysInMonth(month),cells=[];for(let i=0;i<first;i++)cells.push('<span class="cal-cell out" aria-hidden="true"></span>');for(let d=1;d<=days;d++){const ds=`${month}-${pad(d)}`,off=ds<min||ds>max;cells.push(`<button type="button" class="cal-cell ${ds===picked?'on':''} ${ds===ymd()?'today':''}" data-cal="${ds}" ${off?'disabled':''} aria-pressed="${ds===picked}" aria-label="${esc(dayLabel(ds))}">${d}</button>`)}
    return `<div class="cal-head"><button type="button" class="date-nav-btn" id="calPrev" aria-label="前の月" ${`${month}-01`<=min?'disabled':''}>${icon('chevronLeft')}</button><strong>${monthLabel(month)}</strong><button type="button" class="date-nav-btn" id="calNext" aria-label="次の月" ${`${month}-${pad(days)}`>=max?'disabled':''}>${icon('chevronRight')}</button></div><div class="cal-week" aria-hidden="true">${[...wnames.slice(ws),...wnames.slice(0,ws)].map(w=>`<span>${w}</span>`).join('')}</div><div class="cal-grid">${cells.join('')}</div>`};
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="calCancel">キャンセル</button><div class="sheet-title">${esc(title)}</div><span style="min-width:64px"></span></div><div class="sheet-body"><div class="day-calendar" id="dayCalendar">${draw()}</div><button type="button" class="primary" id="calApply">${esc(apply)}</button></div>`,'half',root=>{
    const box=root.querySelector('#dayCalendar'),bind=()=>{box.querySelector('#calPrev').onclick=()=>{month=addMonths(month,-1);box.innerHTML=draw();bind()};box.querySelector('#calNext').onclick=()=>{month=addMonths(month,1);box.innerHTML=draw();bind()};box.querySelectorAll('[data-cal]').forEach(b=>b.onclick=()=>{picked=b.dataset.cal;feedback?.selection?.();box.innerHTML=draw();bind()})};bind();
    root.querySelector('#calCancel').onclick=closeSheet;root.querySelector('#calApply').onclick=()=>{closeSheet();onApply(picked)};
  });
}
/* 長押し: 月・日のホイールで選ぶ（既存の月ホイールと同じ吸着） */
function openDayWheel(initial,onApply){
  const {min,max}=trackingDateBounds();
  openDisplayMonthPicker({title:'月を選ぶ',value:initial.slice(0,7),onApply:m=>{const days=daysInMonth(m),list=Array.from({length:days},(_,i)=>`${m}-${pad(i+1)}`).filter(d=>d>=min&&d<=max);if(!list.length)return showToast('この月は選べません');openDayCalendar(list.includes(initial)?initial:list.at(-1),onApply)}});
}

/* ---------- ＋入力ハブ（Q-001〜006） ---------- */
function syncAddHub(){const b=document.getElementById('addHub');if(b)b.hidden=false}
/* ＋は全画面の「新規入力」（openEntryHub、glass-v15.js） */
/* ＋から開く入力シートは右下（＋の位置）を起点に広がる（Q-002「右下を起点に全画面入力へ」。ページめくりはWebで不安定なため、仕様の代替である連続拡大にする） */

/* ---------- 支払いroot（P-001〜015） ---------- */
let payrootDismissedRisk='';
function renderPayRoot(){
  const month=paymentHomeMonth(),summary=mm3PaymentSummary(month),atf=mm3AtfForMonth(month),risk=atf.available?mm3AtfNextRisk(mm3ForecastThrough('2026-11-30')):null;mm3PaymentAtfState=atf;
  const top=document.getElementById('payrootTop'),content=document.getElementById('payrootContent');
  top.innerHTML=topbar('支払い','',`<button class="icon-btn glass-btn" id="payrootSearch" aria-label="検索">${icon('search')}</button><button class="icon-btn" id="payrootMenu" aria-label="支払いの管理">${icon('menu')}</button>`);
  const cards=mm3PaymentCardItems(month),fixedRows=fixedScheduledInMonth(month),fixedTotal=sum(fixedRows,x=>x.f.paymentMethod==='card'?0:x.f.amount*x.dates.length),cardTotal=sum(cards,x=>Number(x.amount)||0),largeRows=data.largeExpensePlans.filter(p=>p.status==='planned'&&String(p.date).slice(0,7)===month);
  const largeTotal=sum(largeRows,p=>Number(p.amount)||0),parts=[{label:'カード',value:cardTotal},{label:'固定支払い',value:fixedTotal},{label:'大型支出',value:largeTotal}].filter(p=>p.value>0);
  const next=financialEventsFrom(ymd(),60).filter(e=>e.type!=='income');
  const riskKey=risk?`${risk.date}|${risk.label}`:'';
  const pendingMail=data.mailImports.filter(x=>x.status==='pending').length;
  const status=st=>st.status==='paid'?'支払済み':st.plannedAmount?'予定を含む':st.confirmed||st.statementConfirmed?'確定':'見込み';
  content.innerHTML=`${risk&&payrootDismissedRisk!==riskKey?`<div class="home-alert danger" role="alert"><button type="button" class="home-alert-body" id="payrootRisk"><span class="home-alert-icon">${icon('warning')}</span><span class="home-alert-text"><strong>引落予定に対して残高が不足しています</strong><span>${esc(dayLabel(risk.date))}：${esc(risk.label||'')}</span></span></button><button type="button" class="home-alert-close" id="payrootRiskClose" aria-label="この警告を閉じる（不足は解決しません）">${icon('close')}</button></div>`:''}
  <div class="payroot-month"><button type="button" class="date-nav-btn" id="payrootPrev" aria-label="前の月">${icon('chevronLeft')}</button><button type="button" class="home-date" id="payrootMonth" aria-label="${esc(monthLabel(month))}・支払月を選ぶ">${esc(monthLabel(month))}${icon('chevronDown')}</button><button type="button" class="date-nav-btn" id="payrootNext" aria-label="次の月">${icon('chevronRight')}</button></div>
  <div class="home-cards">
  <section class="home-card-wrap"><h2 class="home-card-title">${month===ym()?'今月':'この月'}の支払予定</h2><div class="home-card"><button type="button" class="home-card-body" id="payrootSummary" aria-label="${esc(`支払予定 ${yen(summary.remaining)}・請求一覧を開く`)}"><span class="home-card-left"><span class="home-card-value">${yen(summary.remaining)}</span><span class="home-card-caption">これから支払う額</span></span><span class="home-card-right">${parts.length?miniDonutSvg(parts,'支払予定の内訳'):'<span class="home-card-empty">予定はありません</span>'}</span></button><p class="home-card-readout" hidden aria-live="polite"></p></div></section>
  <section class="home-card-wrap"><h2 class="home-card-title">次の引落</h2><div class="home-card"><button type="button" class="home-card-body" id="payrootNextDebit" aria-label="${esc(next[0]?`次の引落 ${next[0].title} ${homeShortDate(next[0].date)} ${yen(Math.abs(next[0].amount))}`:'次の引落・予定なし')}">${next[0]?`<span class="home-card-left"><span class="home-card-value">${yen(Math.abs(next[0].amount))}</span><span class="home-card-caption">${esc(next[0].title)}・${homeShortDate(next[0].date)}</span><span class="home-card-caption sub">${esc(next[0].detail||'')}</span></span>`:'<span class="home-card-left"><span class="home-card-value small">60日以内の引落はありません</span></span>'}</button></div></section></div>
  <h2 class="section-head">カード別の請求</h2><div class="group home-table">${cards.length?cards.slice(0,3).map(st=>`<button type="button" class="row press home-row" data-payroot-card="${esc(st.cardId)}"><span class="mini-card-art" style="--art:${cardArtGradient(cardById(st.cardId)||{name:st.cardName})}" aria-hidden="true"><i></i></span><div class="row-main"><div class="row-title">${esc(st.cardName)}</div><div class="row-sub">${st.paymentDate?`${homeShortDate(st.paymentDate)}引落・`:''}${status(st)}</div></div><div class="row-value">${yen(st.amount)}</div><span class="chev">${icon('chevronRight')}</span></button>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">この月のカード請求はありません</div></div></div>'}<button type="button" class="row press home-row link-row" id="payrootAllCards"><div class="row-main"><div class="row-title">カード請求をすべて見る</div></div><span class="chev">${icon('chevronRight')}</span></button></div>
  <h2 class="section-head">固定支払い</h2><div class="group home-table">${data.fixedPayments.length?data.fixedPayments.slice(0,3).map(f=>`<button type="button" class="row press home-row" data-payroot-fixed="${esc(f.id)}"><span class="row-icon">${icon('repeat')}</span><div class="row-main"><div class="row-title">${esc(f.name||'固定支払い')}</div><div class="row-sub">${f.day?`毎月${f.day}日`:''}</div></div><div class="row-value">${yen(f.amount)}</div><span class="chev">${icon('chevronRight')}</span></button>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">固定支払いはありません</div><div class="row-sub">＋の「その他の入力」から追加できます</div></div></div>'}${data.fixedPayments.length>3?`<button type="button" class="row press home-row link-row" id="payrootAllFixed"><div class="row-main"><div class="row-title">固定支払いをすべて表示</div></div><span class="chev">${icon('chevronRight')}</span></button>`:''}</div>
  ${largeRows.length?`<h2 class="section-head">大型支出の予定</h2><div class="group home-table">${largeRows.map(p=>`<button type="button" class="row press home-row" data-payroot-large="${esc(p.id)}"><span class="row-icon">${icon('cart')}</span><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${homeShortDate(p.date)}・${p.priority==='required'?'必須':'任意'}</div></div><div class="row-value">${yen(p.amount)}</div><span class="chev">${icon('chevronRight')}</span></button>`).join('')}</div>`:''}
  ${pendingMail?`<div class="group home-table"><button type="button" class="row press home-row" id="payrootMail"><span class="row-icon">${icon('mail')}</span><div class="row-main"><div class="row-title">未確認の明細 ${pendingMail}件</div><div class="row-sub">明細照合センターで確認</div></div><span class="chev">${icon('chevronRight')}</span></button></div>`:''}
  <h2 class="section-head">支払い後の資金見通し</h2><div class="group home-table"><button type="button" class="row press home-row" id="payrootAtf"><span class="row-icon">${icon('chart')}</span><div class="row-main"><div class="row-title">ACF</div><div class="row-sub">${atf.available?`月末予測 ${yen(atf.monthEndForecast)}・最低残高 ${yen(atf.minForecastBalance)}`:'計算に必要な情報がまだありません'}</div></div><span class="chev">${icon('chevronRight')}</span></button></div>`;
  bindPayRoot(month,next,atf,riskKey);
}
function bindPayRoot(month,next,atf,riskKey){
  const $=id=>document.getElementById(id),on=(id,fn)=>{const el=$(id);if(el)el.onclick=fn};
  on('payrootSearch',()=>openGlobalSearch('payment'));
  on('payrootMenu',e=>openMenu(e.currentTarget,[{label:'請求一覧を開く',icon:'list',action:()=>switchTab('payments')},{label:'カードの請求額を更新',icon:'card',action:()=>openQuickCardBilling(month)},{label:'明細照合センター',icon:'mail',action:openMailOverview},{label:'カードを追加',icon:'card',action:()=>openAddCard()},{label:'デビットカードを追加',icon:'card',action:()=>openAddDebit()}]));
  on('payrootRisk',()=>mm3OpenAtfSheet(atf));
  on('payrootRiskClose',()=>{payrootDismissedRisk=riskKey;renderPayRoot()});
  on('payrootMonth',()=>openAssetBillingMonthPicker(()=>renderAll()));
  on('payrootPrev',()=>{assetBillingMonth=addMonths(paymentHomeMonth(),-1);renderAll()});
  on('payrootNext',()=>{assetBillingMonth=addMonths(paymentHomeMonth(),1);renderAll()});
  const summary=$('payrootSummary');if(summary){installMiniScrub(summary.closest('.home-card'));summary.onclick=()=>{if(cardClickAllowed(summary.closest('.home-card')))switchTab('payments')};homeLongPress(summary,()=>{const s=mm3PaymentSummary(month);return[{label:'カード',value:yen(sum(mm3PaymentCardItems(month),x=>Number(x.amount)||0)),preview:true},{label:'これから支払う額',value:yen(s.remaining),preview:true}]})}
  const nd=$('payrootNextDebit');if(nd){nd.onclick=()=>openPaymentEvent(next[0]);homeLongPress(nd,()=>next.slice(0,3).length?next.slice(0,3).map(ev=>({label:`${homeShortDate(ev.date)} ${ev.title}`,value:yen(Math.abs(ev.amount)),preview:true})):[{label:'予定はありません',preview:true}])}
  document.querySelectorAll('#payrootContent [data-payroot-card]').forEach(b=>{const id=b.dataset.payrootCard;b.onclick=()=>openCardDetail(id,month);homeLongPress(b,[{label:'請求額を更新',icon:'edit',action:()=>openQuickCardBilling(month)},{label:'照合する',icon:'check',action:()=>openStatementReconciliation(id,month)}])});
  on('payrootAllCards',()=>switchTab('payments'));
  document.querySelectorAll('#payrootContent [data-payroot-fixed]').forEach(b=>{const f=data.fixedPayments.find(x=>x.id===b.dataset.payrootFixed);b.onclick=()=>openFixedPayment(f);homeLongPress(b,()=>[{label:'編集',icon:'edit',action:()=>openFixedPayment(f)},...fixedDueDatesInMonth(f,month).slice(0,2).map(d=>({label:`次回 ${homeShortDate(d)}`,value:yen(f.amount),preview:true}))])});
  on('payrootAllFixed',openFixedPaymentList);
  document.querySelectorAll('#payrootContent [data-payroot-large]').forEach(b=>b.onclick=()=>openLargeExpenseDetail(b.dataset.payrootLarge));
  on('payrootMail',openMailOverview);
  on('payrootAtf',()=>mm3OpenAtfSheet(atf));
}
function openFixedPaymentList(){pushView('固定支払い',`<div class="group home-table">${data.fixedPayments.map(f=>`<button type="button" class="row press" data-fixed-open="${esc(f.id)}"><div class="row-main"><div class="row-title">${esc(f.name||'固定支払い')}</div><div class="row-sub">${f.day?`毎月${f.day}日`:''}</div></div><div class="row-value">${yen(f.amount)}</div><span class="chev">${icon('chevronRight')}</span></button>`).join('')}</div>`,root=>root.querySelectorAll('[data-fixed-open]').forEach(b=>b.onclick=()=>openFixedPayment(data.fixedPayments.find(x=>x.id===b.dataset.fixedOpen))))}
