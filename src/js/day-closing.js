/* Review metadata never changes ledger amounts, balances or reconciliation. */
function dayClosingSignature(date){
  const transactions=txForDate(date).map(t=>({id:t.id,amount:t.amount,category:t.category,merchant:t.merchant,paymentMethod:t.paymentMethod,paymentId:t.paymentId,memo:t.memo||''})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
  const goal=dailyGoal(date),categories=Object.entries(goal.categories||{}).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify({transactions,correction:data.dailyCorrections[date]??null,goal:goal.total,categories});
}
function dayClosingStatus(date){
  const record=data.dayClosings?.[date];
  if(!record||record.status!=='closed')return 'open';
  return record.signature===dayClosingSignature(date)?'closed':'changed';
}
function dayClosingLabel(date){return {closed:'締め済み',changed:'再確認が必要',open:''}[dayClosingStatus(date)]}
function dayClosingMarkHtml(date){const status=dayClosingStatus(date);return status==='open'?'':`<span class="day-close-mark ${status}" aria-hidden="true">${status==='closed'?'✓':'!'}</span>`}
function dayClosingCardHtml(date,id='todayDayClose'){
  if(date>ymd())return '';
  const status=dayClosingStatus(date),copy={open:'登録した支出を見直して、一日を締めましょう',closed:'確認済み。あとから取引を編集できます',changed:'締めた後に記録が変わっています'}[status];
  return `<button type="button" class="day-closing-card ${status}" id="${id}"><span class="day-closing-symbol" aria-hidden="true">${status==='closed'?'✓':status==='changed'?'!':icon('check')}</span><span><strong>${status==='open'?'この日を締める':dayClosingLabel(date)}</strong><small>${copy}</small></span>${icon('chevronRight')}</button>`;
}
function recordDayClosing(date,{allowPending=false}={}){
  requireStateCommit('recordDayClosing');
  if(!systemNoticeDay(date)||date>ymd())throw new Error('未来の日付は締められません');
  const pending=data.mailImports.filter(x=>x.status==='pending'&&(!x.date||x.date===date)).length;
  if(pending&&!allowPending)throw new Error('未確認メールの確認が必要です');
  const previous=data.dayClosings[date],categoryTotals={};
  txForDate(date).forEach(t=>{categoryTotals[t.category]=(categoryTotals[t.category]||0)+(Number(t.amount)||0)});
  data.dayClosings[date]={status:'closed',closedAt:new Date().toISOString(),signature:dayClosingSignature(date),snapshot:{total:spentDate(date),rawTotal:rawSpentDate(date),count:txForDate(date).length,goal:dailyGoal(date).total,categoryTotals,pendingCount:pending},history:[...(previous?.history||[]),...(previous?.closedAt?[{closedAt:previous.closedAt,snapshot:previous.snapshot}]:[])].slice(-5)};
}
function openDayClosing(date=trackingDate){
  if(!systemNoticeDay(date)||date>ymd())return showToast('今日までの日付を選んでください');
  pushView('日締め','',root=>{
    const draw=()=>{
      const body=root.querySelector('.push-body'),status=dayClosingStatus(date),record=data.dayClosings[date],total=spentDate(date),raw=rawSpentDate(date),goal=dailyGoal(date).total,tx=txForDate(date),pending=data.mailImports.filter(x=>x.status==='pending'&&(!x.date||x.date===date)).length;
      body.innerHTML=`<div class="day-review-date">${dayLabel(date)}</div><div class="day-review-hero"><span>${status==='closed'?'確認した登録支出':date===ymd()?'今日の登録支出を確認':'この日の登録支出を確認'}</span><strong>${yen(total)}</strong><small>${tx.length}件${goal?`・目標まで ${yen(goal-total)}`:'・目標未設定'}</small>${raw!==total?`<p>取引合計 ${yen(raw)} → 実質支出 ${yen(total)}<br>登録済みの金額修正を反映しています</p>`:''}</div>${status==='changed'?'<p class="day-review-warning">締めた後に取引・金額・目標が変わりました。もう一度確認してください。</p>':''}${record?.closedAt?`<p class="day-review-note">前回の確認 ${esc(new Date(record.closedAt).toLocaleString('ja-JP'))}・${yen(record.snapshot?.total||0)}</p>`:''}<div class="section-head">支出の内訳</div>${tx.length?`<div class="group">${tx.map(t=>`<button type="button" class="row press" data-review-tx="${esc(t.id)}"><span class="row-main"><span class="row-title">${esc(t.merchant||t.category)}</span><span class="row-sub">${esc(t.category)}・${esc(paymentLabel(t))}</span></span><span class="row-value">${yen(t.amount)}</span><span class="chev">›</span></button>`).join('')}</div>`:'<div class="empty">支出の記録はありません。使っていない日も確認できます。</div>'}<div class="day-review-actions"><button type="button" class="secondary" id="dayReviewAdd">支出を追加</button><button type="button" class="secondary" id="dayReviewCorrection">実質金額を確認</button></div>${pending?`<div class="day-review-warning"><button type="button" class="day-review-mail" id="dayReviewMail">未確認メール ${pending}件を確認 ›</button><label class="day-review-check"><input type="checkbox" id="dayReviewPending">未確認を残したまま締める</label></div>`:''}${status==='closed'?'<p class="day-review-note">締め済みです。編集すると再確認が必要になります。</p><button type="button" class="secondary" id="dayReviewReopen">締めを解除する</button>':`<label class="day-review-check"><input type="checkbox" id="dayReviewConfirmed">支出と入力漏れを確認しました</label><button type="button" class="primary" id="dayReviewClose" disabled>${status==='changed'?'確認し直して締める':'この日を締める'}</button>`}<p class="day-review-note">日締めは確認の記録です。残高・支払い・取引は変更しません。後から編集できます。</p>`;
      body.querySelectorAll('[data-review-tx]').forEach(b=>b.onclick=()=>openTransactionEdit(b.dataset.reviewTx));
      body.querySelector('#dayReviewAdd').onclick=()=>openQuickExpense(date);
      body.querySelector('#dayReviewCorrection').onclick=()=>openDailyCorrectionDetail(date);
      body.querySelector('#dayReviewMail')?.addEventListener('click',openMailOverview);
      const confirm=body.querySelector('#dayReviewConfirmed'),allow=body.querySelector('#dayReviewPending'),close=body.querySelector('#dayReviewClose');
      const update=()=>{if(close)close.disabled=!confirm.checked||!!(allow&&!allow.checked)};
      confirm?.addEventListener('change',update);allow?.addEventListener('change',update);
      if(close)close.onclick=async()=>{close.disabled=true;try{await runWithBusy(()=>safeCommitAsync(()=>recordDayClosing(date,{allowPending:!!allow?.checked}),{render:true,label:'day closing'}),{title:'日締めを保存中…'});showToast('一日の支出を確認しました')}catch{close.disabled=false}};
      body.querySelector('#dayReviewReopen')?.addEventListener('click',async()=>{try{await runWithBusy(()=>safeCommitAsync(()=>{data.dayClosings[date]={...data.dayClosings[date],status:'open',reopenedAt:new Date().toISOString()}},{render:true,label:'reopen day'}),{title:'日締めを更新中…'})}catch{}});
    };
    root.__refreshDayClosing=draw;draw();
  });
}
