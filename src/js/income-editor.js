
/** An editor for received income. Linked salaries keep their existing payroll editor. */
function openIncomeEditor(incomeId='',date=trackingDate){
  const initial=incomeId?data.incomes.find(x=>x.id===incomeId):null;
  if(incomeId&&!initial)return showToast('収入が見つかりません',{tone:'error'});
  if(initial?.salaryRecordId&&data.salaryRecords.some(x=>x.id===initial.salaryRecordId))return openSalaryRecordEdit(initial.salaryRecordId);
  let amount=Number(initial?.amount)||0,toType=initial?.toType==='bank'?'bank':'cash';
  const temp=initial?data.tempIncomes.find(x=>x.id===initial.tempIncomeId||x.incomeId===initial.id):null;
  const confirmed=initial?!!(initial.receivedConfirmed||temp?.receivedConfirmed||initial.bankApplied||initial.bankReconciled):true;
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="ieCancel">キャンセル</button><div class="sheet-title">${initial?'収入を編集':'収入を追加'}</div><button type="button" class="nav-text bold" id="ieSave">保存</button></div><div class="sheet-body"><div class="form-card"><div class="form-section"><label class="form-label" for="ieSource">収入源</label><input class="field" id="ieSource" value="${esc(initial?.sourceName||'')}" placeholder="例：臨時収入、売上"></div><div class="form-section">${moneyButton('ieAmount','金額',amount)}</div><div class="form-section"><label class="form-label" for="ieDate">日付</label><input class="field" id="ieDate" type="date" max="${ymd()}" value="${esc(initial?.date||date)}"></div></div><div class="form-card"><div class="form-section"><div class="form-label">受取先</div><div class="seg" id="ieType"><button type="button" data-type="cash" class="${toType==='cash'?'on':''}">現金・その他</button><button type="button" data-type="bank" class="${toType==='bank'?'on':''}">銀行口座</button></div></div><div class="form-section ${toType==='bank'?'':'hidden'}" id="ieBankWrap"><label class="form-label" for="ieBank">銀行口座</label><select class="field field-select" id="ieBank"><option value="">選択してください</option>${data.banks.map(b=>`<option value="${esc(b.id)}" ${b.id===initial?.bankId?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div><div class="form-section"><label class="day-review-check"><input type="checkbox" id="ieReceived" ${confirmed?'checked':''}>実際に受け取りました</label></div></div><div class="form-card"><div class="form-section"><label class="form-label" for="ieMemo">メモ</label><input class="field" id="ieMemo" value="${esc(initial?.memo||'')}" placeholder="任意"></div></div><p class="form-helper">銀行への反映は既存の残高基準日時に従います。残高に含まれる過去の入金は二重に加算しません。</p></div>`,'full',root=>{
    const amountButton=root.querySelector('#ieAmount');
    amountButton.onclick=()=>openCalculator('収入額',amount,value=>{amount=value;amountButton.querySelector('.val').textContent=yen(value);markSheetDirty()});
    root.querySelectorAll('#ieType button').forEach(button=>button.onclick=()=>{toType=button.dataset.type;markSheetDirty();root.querySelectorAll('#ieType button').forEach(x=>x.classList.toggle('on',x===button));root.querySelector('#ieBankWrap').classList.toggle('hidden',toType!=='bank')});
    root.querySelector('#ieCancel').onclick=requestSheetClose;
    root.querySelector('#ieSave').onclick=()=>{
      const nextDate=root.querySelector('#ieDate').value,bankId=toType==='bank'?root.querySelector('#ieBank').value:'',received=root.querySelector('#ieReceived').checked;
      if(!Number.isFinite(amount)||amount<=0)return showAlert('金額を確認してください','収入額は0円より大きい金額にしてください。');
      if(!systemNoticeDay(nextDate)||nextDate>ymd())return showAlert('日付を確認してください','今日までの日付を入力してください。');
      if(toType==='bank'&&!bankById(bankId))return showAlert('口座を選択してください','入金先の銀行口座が必要です。');
      // Future schedules and unconfirmed receipts retain their existing dedicated workflow.
      if(!received)return showAlert('入金状態を確認してください','日締めでは実際に受け取った収入を記録します。予定の編集は給与・臨時収入の画面で行ってください。');
      const fields={date:nextDate,amount,sourceName:root.querySelector('#ieSource').value.trim()||'臨時収入',toType,bankId,memo:root.querySelector('#ieMemo').value.trim(),receivedConfirmed:true};
      runSaveAction(root.querySelector('#ieSave'),()=>{
        let income=incomeId?data.incomes.find(x=>x.id===incomeId):null;
        if(incomeId&&!income)throw new Error('収入が見つかりません');
        if(bankId)requireFinancialEntity('bank',bankId);
        if(income){
          const linked=data.tempIncomes.find(x=>x.id===income.tempIncomeId||x.incomeId===income.id);
          reverseBankEffectForIncome(income);Object.assign(income,fields,{bankApplied:false,bankReconciled:false});
          if(linked)Object.assign(linked,fields,{incomeId:income.id});
          if(toType==='bank')applyBankEffectForIncome(income,{respectBalanceAsOf:true,eventAt:income.bankEffectAt||income.createdAt||`${nextDate}T00:00:00`});
        }else{
          const record={id:uid('tmp'),...fields,incomeId:''};
          income=recordIncome({...fields,tempIncomeId:record.id,kind:'temporary',saveNow:false});
          income.receivedConfirmed=true;record.incomeId=income.id;data.tempIncomes.push(record);
        }
      },{label:'received income edit',busy:true,success:initial?'収入を更新しました':'収入を追加しました',afterCommit:refreshFinancialViews,close:closeSheet});
    };
  });
}
