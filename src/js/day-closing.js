/* Day closing records review evidence; approval never mutates the financial ledger. */
const DAY_CLOSING_STEPS=['日締め','収入の照合','メール取引の照合','普通取引の照合','銀行残高の照合','承認','承認されました'];
const DAY_CLOSING_GROUPS=['income','mail','ordinary','banks'];
function dayClosingInRange(date){return !!systemNoticeDay(date)&&date<=ymd()&&date>=addDays(ymd(),-6)}
function dayClosingMailForDate(date){
  return data.mailImports.filter(mail=>{
    const transaction=data.transactions.find(t=>t.id===mail.transactionId);
    return mail.date===date||transaction?.date===date||(!mail.date&&mail.status==='pending'&&(date===ymd()||systemNoticeDay(mail.receivedAt||mail.createdAt)===date));
  });
}
function dayClosingReviewItems(date){
  const entry=(group,id,record,detail)=>({group,key:`${group}:${id}`,fingerprint:JSON.stringify(detail),record});
  const income=incomesForDate(date).map(x=>entry('income',x.id,x,{id:x.id,date:x.date,amount:x.amount,sourceName:x.sourceName,toType:x.toType,bankId:x.bankId,memo:x.memo||'',receivedConfirmed:!!x.receivedConfirmed,bankApplied:!!x.bankApplied,bankReconciled:!!x.bankReconciled}));
  const mail=dayClosingMailForDate(date).map(mi=>{
    const tx=txForDate(date).find(t=>t.id===mi.transactionId||t.mailImportId===mi.id);
    const item=entry('mail',mi.id,mi,{id:mi.id,date:mi.date||'',status:mi.status,amount:mi.amount,merchant:mi.merchant,category:mi.category,paymentMethod:mi.paymentMethod,paymentId:mi.paymentId,transactionId:mi.transactionId||'',direction:mi.direction||'expense',tx:tx?dayClosingTransactionFields(tx):null});
    return {...item,transaction:tx,pending:mi.status==='pending'};
  });
  const mailIds=new Set(mail.map(x=>x.transaction?.id).filter(Boolean));
  const ordinary=[];
  for(const tx of txForDate(date)){
    if(mailIds.has(tx.id))continue;
    const isMail=tx.source==='gmail'||!!tx.mailImportId||data.mailImports.some(mi=>mi.transactionId===tx.id);
    const item=entry(isMail?'mail':'ordinary',`tx:${tx.id}`,tx,dayClosingTransactionFields(tx));
    if(isMail)mail.push({...item,transaction:tx,pending:false});else ordinary.push(item);
  }
  const banks=data.banks.map(bank=>entry('banks',bank.id,bank,{id:bank.id,name:bank.name,label:bank.label||'',balance:Number(bank.balance)||0,balanceAsOf:bank.balanceAsOf||''}));
  return {income,mail,ordinary,banks};
}
function dayClosingTransactionFields(t){return {id:t.id,date:t.date,amount:t.amount,category:t.category,merchant:t.merchant,paymentMethod:t.paymentMethod,paymentId:t.paymentId,linkedBankId:t.linkedBankId||'',memo:t.memo||'',bankApplied:!!t.bankApplied,bankReconciled:!!t.bankReconciled}}
function dayClosingSignature(date){
  const items=dayClosingReviewItems(date),goal=dailyGoal(date);
  const stable=list=>list.map(x=>({key:x.key,fingerprint:x.fingerprint})).sort((a,b)=>a.key.localeCompare(b.key));
  return JSON.stringify({transactions:txForDate(date).map(dayClosingTransactionFields).sort((a,b)=>String(a.id).localeCompare(String(b.id))),incomes:stable(items.income),mail:stable(items.mail),correction:data.dailyCorrections[date]??null,goal:goal.total,categories:Object.entries(goal.categories||{}).sort(([a],[b])=>a.localeCompare(b))});
}
function dayClosingBankSignature(){return JSON.stringify(data.banks.map(b=>({id:b.id,name:b.name,label:b.label||'',balance:Number(b.balance)||0,balanceAsOf:b.balanceAsOf||''})).sort((a,b)=>String(a.id).localeCompare(String(b.id))))}
function dayClosingApprovalSignature(date){return JSON.stringify({ledger:dayClosingSignature(date),banks:dayClosingBankSignature()})}
function dayClosingStatus(date){
  const record=data.dayClosings?.[date];if(!record||record.status!=='closed')return 'open';
  if(record.signature!==dayClosingSignature(date))return 'changed';
  // A later day's bank movement must not invalidate an earlier day's approved snapshot.
  return date===ymd()&&record.bankSignature&&record.bankSignature!==dayClosingBankSignature()?'changed':'closed';
}
function dayClosingLabel(date){return {closed:'締め済み',changed:'再確認が必要',open:''}[dayClosingStatus(date)]}
function dayClosingMarkHtml(date){const status=dayClosingStatus(date);return status==='open'?'':`<span class="day-close-mark ${status}" aria-hidden="true">${status==='closed'?'✓':'!'}</span>`}
function dayClosingCardHtml(date,id='todayDayClose'){
  if(!dayClosingInRange(date))return '';
  const status=dayClosingStatus(date),copy={open:'収入・取引・残高を順番に照合します',closed:'締め済み · 日締めジャーナルに保存しています',changed:'再確認が必要 · 承認後に記録が変わりました'}[status];
  return `<button type="button" class="day-closing-card ${status}" id="${id}"><span class="day-closing-symbol" aria-hidden="true">${icon('dayClose')}</span><span><strong>日締め</strong><small>${copy}</small></span>${icon('chevronRight')}</button>`;
}
function pruneDayClosingJournal(){
  if(mm3PendingAsyncCommit)return false;
  const kept=retainedDayClosings(data.dayClosings);if(Object.keys(kept).length===Object.keys(data.dayClosings).length)return false;
  safeCommit(()=>{data.dayClosings=kept},{label:'day closing retention',invalidateAcf:false});return true;
}
function dayClosingGroupComplete(items,group,review){
  const list=items[group];return list.length?list.every(x=>!x.pending&&review.checks?.[x.key]===x.fingerprint):review.emptyGroups?.includes(group);
}
function dayClosingReviewComplete(date,review){
  if(!review||review.date!==date||review.signature!==dayClosingApprovalSignature(date))return false;
  const items=dayClosingReviewItems(date);return DAY_CLOSING_GROUPS.every(group=>dayClosingGroupComplete(items,group,review));
}
function dayClosingSnapshot(date){
  const items=dayClosingReviewItems(date),categoryTotals={};
  txForDate(date).forEach(t=>{categoryTotals[t.category]=(categoryTotals[t.category]||0)+(Number(t.amount)||0)});
  const incomeTotal=sum(incomesForDate(date),x=>x.amount),banks=data.banks.map(b=>({id:b.id,name:b.name,label:b.label||'',balance:Number(b.balance)||0,balanceAsOf:b.balanceAsOf||''}));
  return {total:spentDate(date),rawTotal:rawSpentDate(date),count:txForDate(date).length,incomeTotal,incomeCount:items.income.length,net:incomeTotal-spentDate(date),goal:dailyGoal(date).total,categoryTotals,pendingCount:items.mail.filter(x=>x.pending).length,banks,bankTotal:sum(banks,b=>b.balance),bankCheckedAt:new Date().toISOString(),incomes:incomesForDate(date).map(x=>({id:x.id,sourceName:x.sourceName,amount:x.amount,toType:x.toType,bankId:x.bankId,memo:x.memo||''})),transactions:txForDate(date).map(dayClosingTransactionFields),mail:items.mail.map(x=>({key:x.key,id:x.record.id,status:x.record.status||'imported',merchant:x.record.merchant||'',amount:x.record.amount,transactionId:x.transaction?.id||''})),reviewedCounts:Object.fromEntries(DAY_CLOSING_GROUPS.map(group=>[group,items[group].length]))};
}
function recordDayClosing(date,{review}={}){
  requireStateCommit('recordDayClosing');
  if(!dayClosingInRange(date))throw new Error('日締めは今日を含む直近7日間が対象です');
  if(!dayClosingReviewComplete(date,review))throw new Error('未照合の項目、または確認後に変更された項目があります');
  const previous=data.dayClosings[date];
  data.dayClosings=retainedDayClosings(data.dayClosings);
  data.dayClosings[date]={schemaVersion:2,status:'closed',closedAt:new Date().toISOString(),signature:dayClosingSignature(date),bankSignature:dayClosingBankSignature(),snapshot:dayClosingSnapshot(date),history:[...(previous?.history||[]),...(previous?.closedAt?[{closedAt:previous.closedAt,snapshot:previous.snapshot}]:[])].slice(-5)};
}
function dayClosingSummaryHtml(snapshot){
  return `<div class="day-close-totals"><div><span>登録収入</span><strong class="green">${yen(snapshot.incomeTotal||0)}</strong></div><div><span>実質支出</span><strong>${yen(snapshot.total)}</strong></div><div><span>収支</span><strong class="${snapshot.net<0?'red':'green'}">${yen(snapshot.net??((snapshot.incomeTotal||0)-snapshot.total))}</strong></div><div><span>銀行残高合計</span><strong>${yen(snapshot.bankTotal||0)}</strong></div></div>${snapshot.rawTotal!==snapshot.total?`<p class="day-review-note">取引合計 ${yen(snapshot.rawTotal)} → 実質支出 ${yen(snapshot.total)}<br>既存の金額修正を反映しています。</p>`:''}`;
}
function openDayClosing(date=trackingDate){
  if(!dayClosingInRange(date))return showToast('日締めは今日を含む直近7日間が対象です');
  return pushView('日締め','',root=>{
    const state={step:0,checks:{},emptyGroups:[],confirmedSignature:'',saving:false};
    root.classList.add('day-close-view');
    const review=()=>({date,checks:{...state.checks},emptyGroups:[...state.emptyGroups],signature:dayClosingApprovalSignature(date)});
    const complete=group=>dayClosingGroupComplete(dayClosingReviewItems(date),group,review());
    const firstIncomplete=()=>DAY_CLOSING_GROUPS.findIndex(group=>!complete(group))+1;
    const go=step=>{state.step=step;draw();root.querySelector('.push-body').scrollTop=0;root.querySelector('.day-close-heading')?.focus({preventScroll:true})};
    const rowsHtml=(items,group)=>{
      if(!items.length)return `<div class="day-close-empty">${icon(group==='banks'?'bank':group==='income'?'wallet':group==='mail'?'mail':'dayClose')}<strong>${group==='banks'?'登録された銀行口座はありません':group==='income'?'収入の記録はありません':group==='mail'?'この日のメール取引はありません':'普通取引の記録はありません'}</strong><p>${group==='banks'?'口座を追加するか、口座がないことを確認してください。':'入力漏れがないことを確認して次へ進みましょう。'}</p></div><label class="day-review-check"><input type="checkbox" data-empty-group="${group}" ${state.emptyGroups.includes(group)?'checked':''}>${group==='banks'?'銀行口座がないことを確認しました':'記録がないことを確認しました'}</label>`;
      return `<div class="day-close-items">${items.map(item=>{
        const record=item.record,tx=item.transaction||((group==='ordinary')?record:null),isBank=group==='banks',isIncome=group==='income';
        const title=isBank?record.name:isIncome?record.sourceName:tx?.merchant||record.merchant||record.subject||'メール取引';
        const amount=isBank?record.balance:isIncome?record.amount:tx?.amount??record.amount;
        const subtitle=isBank?(record.label||'銀行口座'):isIncome?(record.toType==='bank'?bankById(record.bankId)?.name||'口座未設定':'現金・その他'):tx?`${tx.category} · ${paymentLabel(tx)}`:record.status==='ignored'?'対象外として確認済み':record.status==='info'?'情報のみ · 家計への反映なし':'まだ家計に反映されていません';
        const checked=state.checks[item.key]===item.fingerprint;
        return `<article class="day-close-item ${checked?'checked':''}"><label class="day-close-item-check"><input type="checkbox" data-close-key="${esc(item.key)}" ${checked?'checked':''} ${item.pending?'disabled':''} aria-label="${esc(title)}を照合"><span><strong>${esc(title||'収入')}</strong><small>${esc(subtitle)}</small>${item.pending?'<small class="orange">承認または対象外の確認が必要です</small>':''}</span><b class="${isIncome?'green':''}">${yen(amount)}</b></label><div class="day-close-item-actions"><span>${item.pending?'確認待ち':checked?'照合済み':'未照合'}</span><button type="button" class="day-close-edit" data-close-edit="${esc(item.key)}">${isBank?'残高を修正':item.pending?'確認する':tx||isIncome?'編集':'詳細'}</button></div></article>`;
      }).join('')}</div>`;
    };
    const draw=()=>{
      if(!root.isConnected)return;
      const items=dayClosingReviewItems(date),snapshot=dayClosingSnapshot(date),body=root.querySelector('.push-body'),status=dayClosingStatus(date),record=data.dayClosings[date];
      // Only a matching fingerprint can remain checked after edits, imports or balance changes.
      const live=new Map(Object.values(items).flat().map(x=>[x.key,x.fingerprint]));
      for(const key of Object.keys(state.checks))if(state.checks[key]!==live.get(key))delete state.checks[key];
      state.emptyGroups=state.emptyGroups.filter(group=>!items[group].length);
      if(state.confirmedSignature!==dayClosingApprovalSignature(date))state.confirmedSignature='';
      if(state.step===6&&status!=='closed')state.step=5;
      const header=`<div class="day-close-date">${dayLabel(date)}</div><ol class="day-close-progress" aria-label="日締めの進行状況">${DAY_CLOSING_STEPS.map((label,index)=>`<li class="${index<state.step?'done':index===state.step?'current':''}" ${index===state.step?'aria-current="step"':''}><span>${index<state.step?icon('check'):index+1}</span><span class="visually-hidden">${esc(label)}</span></li>`).join('')}</ol><div class="day-close-kicker">ステップ ${state.step+1} / 7</div><h2 class="day-close-heading" tabindex="-1">${DAY_CLOSING_STEPS[state.step]}</h2>`;
      let content='';
      if(state.step===0){
        content=`<div class="day-close-opening"><div class="day-close-emblem">${icon('dayClose')}</div><h3>一日の記録を、ひとつずつ。</h3><p>収入、メール取引、普通取引、銀行残高を照合して、一日を締めましょう。</p></div>${dayClosingSummaryHtml(snapshot)}${status==='changed'?'<p class="day-review-warning">承認後に記録が変わりました。もう一度照合してください。</p>':''}${record?.closedAt?`<p class="day-review-note">前回の承認 ${esc(new Date(record.closedAt).toLocaleString('ja-JP'))} · ${dayClosingLabel(date)}</p>`:''}<button type="button" class="day-close-journal-link" id="dayCloseJournal">${icon('journal')}日締めジャーナル<span>›</span></button><p class="day-review-note">直近7日間の承認記録を保存します。締めたあとも取引を編集できます。</p>${status==='closed'?'<button type="button" class="secondary" id="dayReviewReopen">日締めを解除する</button>':''}`;
      }else if(state.step>=1&&state.step<=4){
        const group=DAY_CLOSING_GROUPS[state.step-1],notes={income:'この日の登録収入を確認します。入金予定と実際の入金を区別し、必要なら編集してください。',mail:'メールの内容と登録取引を照合します。確認待ちは既存の取込画面で承認・照合・対象外の処理をしてください。',ordinary:'手入力・固定支払い・明細取込など、メール以外の取引を確認します。返金はマイナスで表示します。',banks:'銀行アプリや通帳の残高と、登録残高を照合してください。確認時点の残高を保存します。'};
        content=`<p class="day-close-description">${notes[group]}</p>${group==='banks'?`<div class="day-close-stage-total"><span>現在の銀行残高合計</span><strong>${yen(snapshot.bankTotal)}</strong></div><p class="day-review-note">${date===ymd()?'':'過去の日付を締める場合も、'}銀行残高は確認時点の値です。過去の一日の最終残高を推定しません。残高修正は既存の残高照合処理で記帳します。</p>`:`<div class="day-close-stage-total"><span>${group==='income'?'登録収入':group==='mail'?'メールの登録取引':'普通取引'} · ${items[group].length}件</span><strong>${yen(group==='income'?snapshot.incomeTotal:sum([...new Map(items[group].map(x=>[x.transaction?.id||x.record.id,x.transaction||(group==='ordinary'?x.record:null)])).values()].filter(Boolean),x=>x.amount))}</strong></div>`}${rowsHtml(items[group],group)}<div class="day-review-actions">${group==='income'?'<button type="button" class="secondary" id="dayCloseAddIncome">収入を追加</button>':group==='ordinary'?'<button type="button" class="secondary" id="dayReviewAdd">支出を追加</button><button type="button" class="secondary" id="dayReviewCorrection">実質金額を確認</button>':group==='mail'?'<button type="button" class="secondary" id="dayReviewMail">メール取引センター</button>':!items.banks.length?'<button type="button" class="secondary" id="dayCloseAddBank">銀行口座を追加</button>':''}</div>`;
      }else if(state.step===5){
        const missing=firstIncomplete();
        content=`<p class="day-close-description">収入・支出・照合した銀行残高を最終確認して承認します。</p>${dayClosingSummaryHtml(snapshot)}<div class="day-close-bank-summary">${snapshot.banks.map(bank=>`<div><span>${esc(bank.name)}</span><strong>${yen(bank.balance)}</strong></div>`).join('')}</div><p class="day-review-note">銀行残高は確認時点の値です。収支と銀行残高の増減は、カード支払いや残高修正などにより一致しない場合があります。</p>${missing?'<div class="day-review-warning">未照合または変更された項目があります。<button type="button" class="day-review-mail" id="dayCloseMissing">未確認の項目に戻る ›</button></div>':''}<div class="day-review-actions"><button type="button" class="secondary" id="dayCloseAddIncome">収入を追加</button><button type="button" class="secondary" id="dayReviewAdd">支出を追加</button></div><label class="day-review-check"><input type="checkbox" id="dayReviewConfirmed" ${state.confirmedSignature?'checked':''} ${missing?'disabled':''}>照合結果を確認し、この内容で承認します</label><p class="day-review-note">承認は照合の記録です。取引や残高の金額は変更しません。</p>`;
      }else{
        content=`<div class="day-close-success"><div>${icon('check')}</div><h3>承認されました</h3><p>${dayLabel(date)}の日締めを保存しました。</p></div>${dayClosingSummaryHtml(record.snapshot)}<p class="day-review-note">承認 ${esc(new Date(record.closedAt).toLocaleString('ja-JP'))}<br>日締めジャーナルに7日間保存します。取引を変更した場合は再確認が必要です。</p><button type="button" class="secondary" id="dayCloseJournal">日締めジャーナルを見る</button>`;
      }
      const canNext=state.step===0||state.step===6||(state.step<5&&complete(DAY_CLOSING_GROUPS[state.step-1]));
      body.innerHTML=`<div class="day-close-content">${header}${content}</div><div class="day-close-footer">${state.step>0&&state.step<6?'<button type="button" class="secondary" id="dayCloseBack">戻る</button>':''}<button type="button" class="primary" id="${state.step===5?'dayReviewClose':'dayCloseNext'}" ${state.saving||(!(state.step===5?state.confirmedSignature&&!firstIncomplete():canNext))?'disabled':''}>${state.step===0?'進む':state.step===5?'承認して日締め':state.step===6?'完了':'次へ'}</button></div>`;
      body.querySelectorAll('[data-close-key]').forEach(input=>input.onchange=()=>{const item=Object.values(dayClosingReviewItems(date)).flat().find(x=>x.key===input.dataset.closeKey);if(item&&!item.pending&&input.checked)state.checks[item.key]=item.fingerprint;else delete state.checks[input.dataset.closeKey];draw()});
      body.querySelectorAll('[data-empty-group]').forEach(input=>input.onchange=()=>{state.emptyGroups=state.emptyGroups.filter(g=>g!==input.dataset.emptyGroup);if(input.checked)state.emptyGroups.push(input.dataset.emptyGroup);draw()});
      body.querySelectorAll('[data-close-edit]').forEach(button=>button.onclick=()=>{const item=Object.values(dayClosingReviewItems(date)).flat().find(x=>x.key===button.dataset.closeEdit);if(!item)return;if(item.group==='income')openIncomeEditor(item.record.id,date);else if(item.group==='banks')openQuickBank(item.record.id);else if(item.pending)openMailResolve(item.record.id);else if(item.transaction||item.group==='ordinary')openTransactionEdit((item.transaction||item.record).id);else openMailHistory(item.record.status==='ignored'?'ignored':'all')});
      body.querySelector('#dayCloseBack')?.addEventListener('click',()=>go(state.step-1));
      body.querySelector('#dayCloseNext')?.addEventListener('click',()=>{if(state.step===6)popView();else if(state.step===0||complete(DAY_CLOSING_GROUPS[state.step-1]))go(state.step+1)});
      body.querySelector('#dayCloseJournal')?.addEventListener('click',openDayClosingJournal);
      body.querySelector('#dayCloseAddIncome')?.addEventListener('click',()=>{if(state.step===5)go(1);openIncomeEditor('',date)});
      body.querySelector('#dayReviewAdd')?.addEventListener('click',()=>{if(state.step===5)go(3);openQuickExpense(date)});
      body.querySelector('#dayReviewCorrection')?.addEventListener('click',()=>openDailyCorrectionDetail(date));
      body.querySelector('#dayReviewMail')?.addEventListener('click',openMailOverview);
      body.querySelector('#dayCloseAddBank')?.addEventListener('click',()=>openAddBank());
      body.querySelector('#dayCloseMissing')?.addEventListener('click',()=>go(firstIncomplete()));
      body.querySelector('#dayReviewConfirmed')?.addEventListener('change',event=>{state.confirmedSignature=event.target.checked?dayClosingApprovalSignature(date):'';draw()});
      body.querySelector('#dayReviewClose')?.addEventListener('click',async()=>{
        if(state.saving||!state.confirmedSignature)return;
        const approval={...review(),signature:state.confirmedSignature};state.saving=true;draw();
        try{
          await runWithBusy(()=>safeCommitAsync(()=>recordDayClosing(date,{review:approval}),{render:true,label:'day closing approval',invalidateAcf:false}),{title:'日締めを保存しています…',sub:'照合結果を端末に保存しています'});
          state.saving=false;state.step=6;draw();feedback.approval();showToast('日締めを承認しました');
        }catch(error){state.saving=false;state.confirmedSignature='';draw();showToast(error.message||'日締めを保存できませんでした',{tone:'error'})}
      });
      body.querySelector('#dayReviewReopen')?.addEventListener('click',async()=>{
        if(state.saving)return;state.saving=true;draw();
        try{await runWithBusy(()=>safeCommitAsync(()=>{const latest=data.dayClosings[date];if(latest)data.dayClosings[date]={...latest,status:'open',reopenedAt:new Date().toISOString()}},{render:true,label:'reopen day closing',invalidateAcf:false}),{title:'日締めを更新しています…'});showToast('日締めを解除しました')}catch{}
        finally{state.saving=false;draw()}
      });
      const back=root.querySelector('.back-btn');if(back){back.disabled=state.saving;back.onclick=()=>{if(state.saving)return;if(state.step>0&&state.step<6)go(state.step-1);else popView()}}
    };
    root.__refreshDayClosing=draw;draw();
  });
}
function openDayClosingJournal(){
  return pushView('日締めジャーナル','',root=>{
    const draw=()=>{
      const records=Object.entries(retainedDayClosings(data.dayClosings)).filter(([,record])=>record.closedAt&&record.snapshot).sort(([a],[b])=>b.localeCompare(a));
      root.querySelector('.push-body').innerHTML=`<p class="day-close-description">今日を含む直近7日間の承認記録です。保存された照合結果と、現在の記録の変更状況を確認できます。</p>${records.length?records.map(([date,record])=>`<button type="button" class="day-close-journal-card" data-journal-date="${date}"><div><strong>${dayLabel(date)}</strong><span class="${dayClosingStatus(date)==='closed'?'green':'orange'}">${dayClosingLabel(date)||'解除済み'}</span></div><div><span>収入 ${yen(record.snapshot.incomeTotal||0)}</span><span>支出 ${yen(record.snapshot.total)}</span></div><small>承認 ${esc(new Date(record.closedAt).toLocaleString('ja-JP'))}</small><span class="chev">›</span></button>`).join(''):'<div class="day-close-empty">'+icon('journal')+'<strong>まだ承認記録はありません</strong><p>日締めを承認すると、ここに保存されます。</p></div>'}<p class="day-review-note">7日を過ぎた日締め記録は自動削除します。取引・収入・銀行口座のデータは保持します。</p>`;
      root.querySelectorAll('[data-journal-date]').forEach(button=>button.onclick=()=>openDayClosingJournalDetail(button.dataset.journalDate));
    };root.__refreshDayClosing=draw;draw();
  });
}
function openDayClosingJournalDetail(date){
  const record=data.dayClosings[date];if(!record?.snapshot)return;
  const snapshot=clone(record.snapshot),approvedAt=record.closedAt;
  return pushView(dayLabel(date),`<h2 class="day-close-heading">日締めジャーナル</h2><p class="day-close-description">承認した時点の照合結果です。</p>${dayClosingSummaryHtml(snapshot)}<div class="section-head">照合した銀行残高</div><div class="day-close-bank-summary">${(snapshot.banks||[]).map(bank=>`<div><span>${esc(bank.name)}</span><strong>${yen(bank.balance)}</strong></div>`).join('')||'<p class="day-review-note">口座の記録はありません。</p>'}</div><p class="day-review-note">残高の確認時点 ${esc(new Date(snapshot.bankCheckedAt||approvedAt).toLocaleString('ja-JP'))}</p><div class="section-head">収入</div><div class="group">${(snapshot.incomes||[]).map(x=>`<div class="row"><span class="row-main">${esc(x.sourceName)}</span><strong class="green">${yen(x.amount)}</strong></div>`).join('')||'<div class="row">記録なし</div>'}</div><div class="section-head">支出・返金</div><div class="group">${(snapshot.transactions||[]).map(t=>`<div class="row"><span class="row-main"><span class="row-title">${esc(t.merchant)}</span><span class="row-sub">${esc(t.category)}</span></span><strong>${yen(t.amount)}</strong></div>`).join('')||'<div class="row">記録なし</div>'}</div><p class="day-review-note">承認 ${esc(new Date(approvedAt).toLocaleString('ja-JP'))}</p><button type="button" class="secondary" id="journalReview">この日を確認し直す</button>`,root=>root.querySelector('#journalReview').onclick=()=>openDayClosing(date));
}
