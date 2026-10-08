/* Fast repeated updates reuse the established editors and their durable commit paths. */
const FINANCIAL_UPDATE_TITLES={salary:'給与の金額',cards:'カード請求額',banks:'銀行残高'};
function financialUpdateAccessHtml(kind){return `<button type="button" class="financial-update-access" data-financial-update="${kind}">${icon('edit')}<span>金額を更新</span>${icon('chevronRight')}</button>`}
function financialUpdateRows(kind,month){
  if(kind==='salary')return salaryRecordsPayableInMonth(month).map(record=>({id:record.id,title:employerById(record.employerId)?.name||'勤務先',subtitle:`${dayLabel(salaryRecordEffectiveDate(record)||record.date)} · ${salaryRecordDisplayStatus(record)}`,amount:salaryRecordExpectedOrReceivedAmount(record),amountField:record.status==='入金済'?'#srReceivedAmount':'#srGross'}));
  if(kind==='banks')return data.banks.map(bank=>({id:bank.id,title:bank.name,subtitle:bank.balanceAsOf?`確認 ${compactDateTime(bank.balanceAsOf)}`:'残高未確認',amount:Number(bank.balance)||0}));
  return data.cards.flatMap(card=>{
    let statements=cardStatementsForPaymentMonth(card.id,month);
    if(!statements.length)statements=[cardStatementForPaymentMonth(card.id,month)].filter(Boolean);
    return statements.map(statement=>({id:card.id,billingMonth:statement.billingMonth,title:card.name,subtitle:`${monthLabel(statement.billingMonth)}対象 · ${statement.paymentDate?dayLabel(statement.paymentDate)+' · ':''}${cardStatementStatusLabel(statement.status)}`,amount:Number(statement.amount)||0}));
  });
}
function openFinancialUpdates(kind,month=ym()){
  if(!Object.hasOwn(FINANCIAL_UPDATE_TITLES,kind))return;
  return pushView('金額を更新','',root=>{
    root.classList.add('financial-update-view');
    const draw=()=>{
      if(!root.isConnected)return;
      const body=root.querySelector('.push-body'),scroll=body.scrollTop,rows=financialUpdateRows(kind,month);
      body.innerHTML=`<div class="financial-update-heading"><div><small>金額を更新</small><h2>${FINANCIAL_UPDATE_TITLES[kind]}</h2></div>${kind==='banks'?'':`<button type="button" class="display-month-button" id="financialUpdateMonth">${monthLabel(month)} ${icon('chevronDown')}</button>`}</div><p class="financial-update-note">${kind==='salary'?'入金済みの給与は実際の受取額を、予定の給与は予定額を更新します。':kind==='cards'?'対象請求ごとに金額を更新します。支払い状態と口座への反映方法も確認できます。':'最新の口座残高を確認して更新します。'}保存後もこの一覧から続けて更新できます。</p><div class="financial-update-list">${rows.length?rows.map((row,index)=>`<button type="button" class="financial-update-row" data-update-row="${index}" aria-label="${esc(row.title+' '+row.subtitle+' '+yen(row.amount)+'を更新')}"><span><strong>${esc(row.title)}</strong><small>${esc(row.subtitle)}</small></span><b>${yen(row.amount)}</b>${icon('chevronRight')}</button>`).join(''):'<div class="empty">この条件の登録はありません。</div>'}</div>`;
      body.querySelector('#financialUpdateMonth')?.addEventListener('click',()=>openDisplayMonthPicker({title:'更新する月',value:month,onApply:value=>{month=value;draw()}}));
      body.querySelectorAll('[data-update-row]').forEach(button=>button.onclick=()=>{
        const row=rows[Number(button.dataset.updateRow)];if(!row)return;
        let field;
        if(kind==='salary'){if(!data.salaryRecords.some(record=>record.id===row.id))return draw();openSalaryRecordEdit(row.id);field=row.amountField}
        else if(kind==='cards'){if(!cardById(row.id))return draw();openQuickCardBilling(month,row.id,row.billingMonth);field='#qcbAmount'}
        else{if(!bankById(row.id))return draw();openQuickBank(row.id);field='#qbAmount'}
        document.querySelector(`#sheet.show ${field}`)?.click();
      });
      body.scrollTop=scroll;
    };
    root.__refreshFinancialUpdates=draw;draw();
  });
}
