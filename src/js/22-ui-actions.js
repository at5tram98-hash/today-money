/* === My Money 3.0 Phase 5: Quiet iOS actions + bug fixes === */
function mm3QuietIconSvg(kind){const names={records:'list',split:'arrowUpDown',reconcile:'check',bag:'cart',history:'clock',timeline:'chart',transfer:'repeat'};return icon(names[kind]||kind)}
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
function mm3AssetDetailHtml(){return `<div class="mm3-action-section-label">口座</div><div class="mm3-action-group">${mm3QuietActionRow({id:'mm3AssetQuick',title:'銀行残高を更新',sub:'最新の残高を記録',kind:'bank',primary:true})}${mm3QuietActionRow({id:'mm3AssetHistoryRow',title:'残高履歴',sub:'過去の残高更新を確認',kind:'history'})}</div><div class="mm3-action-section-label">資金計画</div><div class="mm3-action-group">${mm3QuietActionRow({id:'mm3AssetTimeline',title:'お金のタイムライン',sub:'30 / 60 / 90日の資金推移',kind:'timeline'})}${mm3QuietActionRow({id:'mm3AssetTransfer',title:'引落準備',sub:'不足口座と振替計画',kind:'transfer'})}${mm3QuietActionRow({id:'mm3AssetAcf',title:'ACF',sub:'ACFで安全残高を確認',kind:'target'})}</div>`}

/* Salary record list is rendered in Push, so give it Push-safe markup and status styling. */
function mm3SalaryRecordsOpen(month){
  const summary=mm3SalaryMonthSummary(month);
  pushView(`${monthLabel(month)}の給与記録`,`<div class="mm3-salary-records-push"><div class="mm3-salary-record-list">${summary.records.length?summary.records.map(r=>{const e=employerById(r.employerId),status=salaryRecordDisplayStatus(r),amount=salaryRecordExpectedOrReceivedAmount(r),paid=status==='入金済み',overdue=status.includes('未確認');return `<button type="button" class="mm3-salary-record-row" data-mm3-salary-record="${r.id}"><div class="row-main"><div class="row-title">${esc(e?.name||'勤務先')}</div><div class="row-sub">${dayLabel(salaryRecordEffectiveDate(r)||r.date)}</div><span class="mm3-salary-record-state ${paid?'paid':overdue?'overdue':''}">${esc(status)}</span></div><div class="mm3-salary-record-amount ${paid?'green':''}">${yen(amount)}</div><span class="chev">›</span></button>`}).join(''):`<div class="empty">この月の給与記録はありません。</div>`}</div></div>`,root=>{root.dataset.salaryListMonth=month;root.querySelectorAll('[data-mm3-salary-record]').forEach(b=>b.onclick=()=>openSalaryRecordEdit(b.dataset.mm3SalaryRecord))})
}

/* === end My Money 3.0 Phase 5 === */


