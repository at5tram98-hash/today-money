/* === My Money 3.0 Phase 5: Quiet iOS actions + bug fixes === */
function mm3QuietIconSvg(kind){
  const p={
    records:'<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="5" cy="6" r="1.4"/><circle cx="5" cy="12" r="1.4"/><circle cx="5" cy="18" r="1.4"/>',
    split:'<path d="M4 7h16"/><path d="M8 7v10"/><path d="M16 7v10"/><path d="M6 17l2 2 2-2"/><path d="M14 15l2-2 2 2"/>',
    plus:'<path d="M12 5v14M5 12h14"/><circle cx="18" cy="6" r="2"/>',
    chart:'<path d="M5 19V9"/><path d="M12 19V5"/><path d="M19 19v-7"/>',
    reconcile:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M15.5 15.5l1.8 1.8 3.2-4"/>',
    card:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M18 4v4M16 6h4"/>',
    wallet:'<path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5v-9Z"/><path d="M15 11h6v5h-6a2.5 2.5 0 0 1 0-5Z"/>',
    calendar:'<path d="M7 3v4M17 3v4"/><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16"/><path d="M9 15h6"/>',
    bag:'<path d="M6 7h13l-1.3 7.2a2 2 0 0 1-2 1.6H9a2 2 0 0 1-2-1.6L6 7Z"/><path d="M9 7V5a3 3 0 0 1 6 0v2"/>',
    history:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/><path d="M18 6l2-2"/>',
    mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    bank:'<path d="M3 9h18"/><path d="M5 19h14"/><path d="M6 9v10M10 9v10M14 9v10M18 9v10"/><path d="M4 9 12 4l8 5"/>',
    timeline:'<path d="M4 18h16"/><path d="M6 15V9"/><path d="M12 15V5"/><path d="M18 15v-7"/>',
    transfer:'<path d="M8 7H5v3"/><path d="M16 17h3v-3"/><path d="M5 10c1.5-3 4-4 7-4s5.5 1 7 4"/><path d="M19 14c-1.5 3-4 4-7 4s-5.5-1-7-4"/>',
    target:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2"/>'
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${p[kind]||p.records}</svg>`
}
function mm3QuietActionRow({id,title,sub,kind='records',primary=false,trailing=''}){
  return `<button type="button" class="mm3-action-row ${primary?'is-primary':''}" id="${id}"><span class="mm3-action-icon">${mm3QuietIconSvg(kind)}</span><span class="mm3-action-main"><strong>${esc(title)}</strong><small>${esc(sub||'')}</small></span>${trailing?`<span class="mm3-action-trailing">${trailing}</span>`:''}<span class="mm3-action-chev">›</span></button>`
}
function mm3OpenReconPicker(){
  if(!data.cards.length)return showAlert('カードがありません','先にクレジットカードを登録してください。');
  if(data.cards.length===1)return openStatementReconciliation(data.cards[0].id,paymentHomeMonth());
  openSheet(`<div class="sheet-nav"><button class="nav-text" id="mm3ReconPickClose">閉じる</button><div class="sheet-title">カードを選ぶ</div><span style="min-width:64px"></span></div><div class="sheet-body"><div class="group">${data.cards.map(c=>`<button class="row press" data-mm3-recon-pick="${c.id}"><div class="row-main"><div class="row-title">${esc(c.name)}</div></div><span class="chev">›</span></button>`).join('')}</div></div>`,'half',root=>{root.querySelector('#mm3ReconPickClose').onclick=requestSheetClose;root.querySelectorAll('[data-mm3-recon-pick]').forEach(b=>b.onclick=()=>{closeSheet();setTimeout(()=>openStatementReconciliation(b.dataset.mm3ReconPick,paymentHomeMonth()),280)})})
}

/* Limit the salary chart palette to monochrome + blue/green instead of a rainbow. */
function mm3SalaryComposition(summary){
  const palette=['var(--blue)','var(--green)','#8e8e93','#6e6e73','#b0b0b6'];
  const items=data.employers.map((e,index)=>{const recs=summary.records.filter(r=>r.employerId===e.id),amount=sum(recs,r=>salaryRecordExpectedOrReceivedAmount(r));return{id:e.id,type:'employer',name:e.name,amount,recs,color:palette[index%palette.length]}}).filter(x=>x.amount>0);
  if(summary.tempTotal>0)items.push({id:'temp',type:'temp',name:'臨時収入',amount:summary.tempTotal,recs:[],color:'#b0b0b6'});
  const total=sum(items,x=>x.amount);if(total<=0)return items.map(x=>({...x,pct:0,rawPct:0}));
  const work=items.map((x,i)=>({...x,rawPct:x.amount/total*100,pct:Math.floor(x.amount/total*100),_i:i}));let remain=100-sum(work,x=>x.pct);
  [...work].sort((a,b)=>(b.rawPct-b.pct)-(a.rawPct-a.pct)||a._i-b._i).slice(0,remain).forEach(x=>x.pct++);return work
}
function mm3SalaryWatchlistHtml(summary){
  const palette=['var(--blue)','var(--green)','#8e8e93','#6e6e73','#b0b0b6'],composition=mm3SalaryComposition(summary),pctMap=new Map(composition.filter(x=>x.type==='employer').map(x=>[x.id,x.pct]));
  const rows=data.employers.map((e,index)=>{const recs=summary.records.filter(r=>r.employerId===e.id),amount=sum(recs,r=>salaryRecordExpectedOrReceivedAmount(r)),status=salaryGroupDisplayStatus(recs),next=recs.find(r=>salaryRecordDisplayStatus(r)!=='入金済み')||recs[0],date=next?(salaryRecordEffectiveDate(next)||next.date):'',pct=pctMap.get(e.id)||0,color=palette[index%palette.length];return `<button type="button" class="mm3-salary-watchrow" data-emp="${e.id}"><div class="mm3-salary-watch-main"><strong>${esc(e.name)}</strong><small>${recs.length?(date?`${dayLabel(date)}・${esc(status)}`:esc(status)):'この月の給与は未登録'}</small><small>時給 ${yen(e.hourly)} ・ 交通費支給 ${yen(e.transport)}${e.transportUnit==='per_shift'?'／勤務':''}</small></div><div class="mm3-salary-spark">${mm3SalarySparklineHtml(mm3SalaryEmployerSeries(e.id,summary.month),color)}</div><div class="mm3-salary-watch-value"><strong>${recs.length?yen(amount):'—'}</strong><small>${recs.length?`${pct}%`:'—'}</small></div></button>`}).join('');
  return rows?`<div class="mm3-salary-watchlist">${rows}</div>`:`<div class="empty">勤務先がありません。</div>`
}

/* Settings-style management rows restored under the Stocks-style overview. */
function mm3SalaryDetailHtml(summary){return `<div class="mm3-action-section-label">給与管理</div><div class="mm3-action-group">${mm3QuietActionRow({id:'mm3SalaryRecords',title:'給与記録',sub:`${summary.records.length}件・記録の確認、編集、入金状態`,kind:'records',primary:true})}${mm3QuietActionRow({id:'mm3SalaryAllocation',title:'給料日の振り分け',sub:'受取済み給与を用途別に分ける',kind:'split'})}${mm3QuietActionRow({id:'salaryTempHistory',title:'臨時収入',sub:`${summary.temps.length}件・${yen(summary.tempTotal)}`,kind:'plus'})}</div><div class="mm3-action-section-label">分析</div><div class="mm3-action-group">${mm3QuietActionRow({id:'salaryReasonAnalysis',title:'給与分析',sub:'勤務先別・入金月別を比較',kind:'chart'})}${mm3QuietActionRow({id:'mm3SalaryRecon',title:'請求照合',sub:'カード請求と明細の差額を確認',kind:'reconcile'})}</div>`}
function mm3PaymentDetailHtml(summary){
  const debitTotal=sum(data.debitCards,d=>debitUsage(d.id,summary.month)),fixedCount=summary.fixedRows.reduce((n,x)=>n+x.dates.length,0),largeCount=summary.large.length;
  return `<div class="mm3-action-section-label">支払い管理</div><div class="mm3-action-group">${mm3QuietActionRow({id:'mm3PaymentQuickBillingAction',title:'カード請求額を更新',sub:'確定した請求額をすばやく反映',kind:'card',primary:true})}${mm3QuietActionRow({id:'mm3PaymentDebit',title:'デビットカード',sub:`${data.debitCards.length}枚・即時引落`,kind:'wallet',trailing:yen(debitTotal)})}${mm3QuietActionRow({id:'mm3PaymentFixed',title:'固定支払い',sub:`${fixedCount}件・カード払いは請求日に集約`,kind:'calendar',trailing:yen(summary.fixedTotal)})}${mm3QuietActionRow({id:'mm3PaymentLarge',title:'大型支出',sub:`${largeCount}件・この月`,kind:'bag',trailing:yen(summary.largeTotal)})}</div><div class="mm3-action-section-label">履歴・連携</div><div class="mm3-action-group">${mm3QuietActionRow({id:'mm3PaymentHistory',title:'支出履歴',sub:`${summary.otherTx.length}件のその他取引`,kind:'history'})}${mm3QuietActionRow({id:'mm3PaymentMail',title:'Gmail・未確認取引',sub:`${gmailConnected()?'同期済み':'未接続'}・未確認 ${summary.pending}件`,kind:'mail',trailing:summary.pending?`<span class="badge">${summary.pending}</span>`:''})}</div>`
}
function mm3AssetDetailHtml(){return `<div class="mm3-action-section-label">口座</div><div class="mm3-action-group">${mm3QuietActionRow({id:'mm3AssetQuick',title:'銀行残高を更新',sub:'最新の残高を記録',kind:'bank',primary:true})}${mm3QuietActionRow({id:'mm3AssetHistoryRow',title:'残高履歴',sub:'過去の残高更新を確認',kind:'history'})}</div><div class="mm3-action-section-label">資金計画</div><div class="mm3-action-group">${mm3QuietActionRow({id:'mm3AssetTimeline',title:'お金のタイムライン',sub:'30 / 60 / 90日の資金推移',kind:'timeline'})}${mm3QuietActionRow({id:'mm3AssetTransfer',title:'引落準備',sub:'不足口座と振替計画',kind:'transfer'})}${mm3QuietActionRow({id:'mm3AssetAcf',title:'生活費の見通し',sub:'ACFで安全残高を確認',kind:'target'})}</div>`}

/* Salary record list is rendered in Push, so give it Push-safe markup and status styling. */
function mm3SalaryRecordsOpen(month){
  const summary=mm3SalaryMonthSummary(month);
  pushView(`${monthLabel(month)}の給与記録`,`<div class="mm3-salary-records-push"><div class="mm3-salary-record-list">${summary.records.length?summary.records.map(r=>{const e=employerById(r.employerId),status=salaryRecordDisplayStatus(r),amount=salaryRecordExpectedOrReceivedAmount(r),paid=status==='入金済み',overdue=status.includes('未確認');return `<button type="button" class="mm3-salary-record-row" data-mm3-salary-record="${r.id}"><div class="row-main"><div class="row-title">${esc(e?.name||'勤務先')}</div><div class="row-sub">${dayLabel(salaryRecordEffectiveDate(r)||r.date)}</div><span class="mm3-salary-record-state ${paid?'paid':overdue?'overdue':''}">${esc(status)}</span></div><div class="mm3-salary-record-amount ${paid?'green':''}">${yen(amount)}</div><span class="chev">›</span></button>`}).join(''):`<div class="empty">この月の給与記録はありません。</div>`}</div></div>`,root=>{root.dataset.salaryListMonth=month;root.querySelectorAll('[data-mm3-salary-record]').forEach(b=>b.onclick=()=>openSalaryRecordEdit(b.dataset.mm3SalaryRecord))})
}

/* Keep existing logic, only add a visual class after the salary record editor opens. */
const __mm3P5OpenSalaryRecordEdit=openSalaryRecordEdit;
openSalaryRecordEdit=function(recordId){__mm3P5OpenSalaryRecordEdit(recordId);document.getElementById('sheet')?.classList.add('mm3-salary-edit-sheet')};

/* Bind new restored rows after the already-final Phase 4 binders so swipe/scrub/reorder remain intact. */
const __mm3P5BindSalaryHome=bindSalaryHome;
bindSalaryHome=function(){
  __mm3P5BindSalaryHome();
  document.getElementById('mm3SalaryAllocation')?.addEventListener('click',openSalaryAllocationPicker);
  document.getElementById('mm3SalaryRecon')?.addEventListener('click',mm3OpenReconPicker)
};
const __mm3P5BindPayments=bindPayments;
bindPayments=function(){
  __mm3P5BindPayments();
  document.getElementById('mm3PaymentQuickBillingAction')?.addEventListener('click',()=>openQuickCardBilling(paymentHomeMonth()))
};
const __mm3P5BindAssets=mm3BindAssets;
mm3BindAssets=function(){
  __mm3P5BindAssets();
  document.getElementById('mm3AssetHistoryRow')?.addEventListener('click',mm3OpenAssetHistory)
};
/* === end My Money 3.0 Phase 5 === */


