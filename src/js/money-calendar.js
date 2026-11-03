/* Calendar presentation reads the existing ledger and ACF; it never invents balances. */
function navigationTab(tab){return tab==='today'?'home':['pay','payments','assets'].includes(tab)?'settings':tab}
function initializeMainNavigation(){
  document.querySelectorAll('#tabbar [data-symbol]').forEach(button=>button.querySelector('.tab-icon').innerHTML=icon(button.dataset.symbol));
}
function moneyDateHeading(date){
  const d=parseYmd(date);
  return `<span class="money-date-month">${d.getFullYear()}年${d.getMonth()+1}月</span><span class="money-date-main"><strong>${d.getDate()}日</strong><span>${'日月火水木金土'[d.getDay()]}曜日</span></span>`;
}
function moneyEmpty(symbol,title,action='',id=''){
  return `<div class="money-empty">${icon(symbol)}<p>${esc(title)}</p>${action?`<button type="button" class="money-text-action" id="${id}">${esc(action)}</button>`:''}</div>`;
}
function moneyRecordRow(record,{income=false}={}){
  const category=income?null:catByName(record.category),symbol=income?'arrowDown':normalizeCategoryIcon(category?.icon,category?.id),color=income?'var(--green)':category?.color||'var(--blue)';
  return `<button type="button" class="money-record-row" ${income?`data-money-income="${esc(record.id)}"`:`data-money-transaction="${esc(record.id)}"`}><span class="money-record-symbol" style="--item-color:${esc(color)}">${icon(symbol)}</span><span class="money-record-copy"><strong>${esc(income?(record.sourceName||'収入'):(record.merchant||record.category||'支出'))}</strong><small>${esc(income?(record.receiptMethod==='bank'?bankById(record.bankId)?.name||'銀行入金':'収入記録'):`${record.category||'その他'}・${paymentLabel(record)}`)}</small></span><span class="money-record-amount ${income||Number(record.amount)<0?'green':''}">${income?'+':''}${yen(record.amount)}</span></button>`;
}
function bindMoneyRecords(root){
  root.querySelectorAll('[data-money-transaction]').forEach(button=>{
    button.onclick=()=>openTransactionDetail(button.dataset.moneyTransaction);
    installLongPress(button,()=>openMenu(button,[{label:'詳細を見る',icon:'receipt',action:()=>openTransactionDetail(button.dataset.moneyTransaction)},{label:'編集',icon:'edit',action:()=>openTransactionEdit(button.dataset.moneyTransaction)}]),{delay:550});
  });
  root.querySelectorAll('[data-money-income]').forEach(button=>button.onclick=()=>openIncomeEditor(button.dataset.moneyIncome));
}
function moneyCalendarHtml(month,selected,{compact=false}={}){
  const first=parseYmd(month+'-01').getDay(),days=daysInMonth(month),markers=buildMonthFinancialMarkers(month);
  const count=Math.ceil((first+days)/7)*7;
  const cells=Array.from({length:count},(_,i)=>{
    const day=i-first+1;if(day<1||day>days)return '<span class="money-calendar-spacer" aria-hidden="true"></span>';
    const date=month+'-'+pad(day),goal=dayGoalForMonth(month,day),marker=markers.get(date)||{},events=[marker.salaryAmount?'給与':'',marker.cardPaymentAmount?'カード引落':'',marker.large?'大型支出':'',marker.fixed?'固定支払い':''].filter(Boolean),spent=spentDate(date);
    return `<button type="button" class="money-calendar-day ${date===selected?'selected':''} ${date===ymd()?'is-today':''}" data-money-date="${date}" data-date="${date}" aria-pressed="${date===selected}" aria-label="${esc(dayLabel(date)+'、支出 '+yen(spent)+(events.length?'、'+events.join('・'):'')+(dayClosingLabel(date)?'、'+dayClosingLabel(date):''))}"><span class="money-calendar-number">${day}</span><span class="money-calendar-state">${dayClosingMarkHtml(date)}</span><span class="money-calendar-dots" aria-hidden="true">${marker.salaryAmount?'<i class="income"></i>':''}${marker.cardPaymentAmount?'<i class="bill"></i>':''}${marker.large||marker.fixed?'<i class="planned"></i>':''}${txForDate(date).length?'<i class="recorded"></i>':''}</span>${compact?'':`<span class="money-calendar-spent">${spent?(spent<0?'−':'')+compactCalendarMoney(spent):''}</span><span class="money-calendar-plan">${goal?'計画 '+compactCalendarMoney(goal):''}</span>`}</button>`;
  }).join('');
  return `<div class="money-calendar ${compact?'compact':''}"><div class="money-calendar-week" aria-hidden="true">${[...'日月火水木金土'].map(day=>`<span>${day}</span>`).join('')}</div><div class="money-calendar-grid" role="group" aria-label="${esc(monthLabel(month))}の資金カレンダー">${cells}</div></div>`;
}
function bindMoneyCalendar(root,month,onSelect){
  root.querySelectorAll('[data-money-date]').forEach(button=>{
    button.onclick=()=>onSelect(button.dataset.moneyDate);
    installLongPress(button,()=>openDayQuickMenu(button.dataset.moneyDate),{delay:550});
  });
  root.onkeydown=event=>{
    const button=event.target.closest('[data-money-date]'),offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key];
    if(!button||!offset)return;
    const date=addDays(button.dataset.moneyDate,offset);if(date.slice(0,7)!==month)return;
    event.preventDefault();onSelect(date,true);
  };
}
function moneySelectedDayHtml(date,forecast,{compact=false}={}){
  const row=forecast?.rows.find(item=>item.date===date),markers=buildMonthFinancialMarkers(date.slice(0,7)).get(date)||{};
  const entries=[];
  if(markers.salaryAmount)entries.push({symbol:'briefcase',title:'給与の入金',amount:markers.salaryAmount,color:'var(--green)'});
  if(markers.cardPaymentAmount)entries.push({symbol:'card',title:'カード引落',amount:-markers.cardPaymentAmount,color:'var(--purple)'});
  if(markers.large||markers.fixed)entries.push({symbol:'calendar',title:'予定の支払い',amount:null,color:'var(--orange)'});
  return `<div class="money-day-detail">${compact?'':`<div class="money-list-heading"><h3>${Number(date.slice(5,7))}月${Number(date.slice(8))}日</h3><button type="button" class="money-text-action" data-money-inspect="${date}">詳細 ${icon('chevronRight')}</button></div>`}${entries.length?entries.map(entry=>`<button type="button" class="money-event-row" data-money-inspect="${date}"><span class="money-event-icon" style="color:${entry.color}">${icon(entry.symbol)}</span><span>${entry.title}</span>${entry.amount==null?'':`<strong>${entry.amount>0?'+':''}${yen(entry.amount)}</strong>`}</button>`).join(''):`<div class="money-no-events">入出金予定なし${compact?`<button class="money-text-action" data-money-inspect="${date}">詳細 ${icon('chevronRight')}</button>`:''}</div>`}${row?`<button type="button" class="money-forecast-row" data-money-inspect="${date}"><span>計画後の残高<small>ACFの予測</small></span><strong class="${row.forecastBalance<0?'red':''}">${yen(row.forecastBalance)}</strong></button>`:`<p class="money-calendar-note">${!forecast?'ACFを設定すると、予測残高を表示します。':date<ymd()?'過去の記録は「詳細」から確認できます。':'予測期間外です。ACFで確認できる範囲を表示します。'}</p>`}</div>`;
}
function bindMoneyDayDetails(root){root.querySelectorAll('[data-money-inspect]').forEach(button=>button.onclick=()=>openFinancialDayInspector(button.dataset.moneyInspect))}
function openMoneyDatePicker(date,onSelect){
  openSheet(`<div class="sheet-nav"><button id="moneyDateCancel" class="nav-text">閉じる</button><div class="sheet-title">日付を選択</div><button id="moneyDateApply" class="nav-text bold">完了</button></div><div class="sheet-body"><label class="form-label" for="moneyDateInput">日付</label><input type="date" class="field" id="moneyDateInput" value="${esc(date)}"></div>`,'half',root=>{
    root.querySelector('#moneyDateCancel').onclick=requestSheetClose;
    root.querySelector('#moneyDateApply').onclick=()=>{const value=root.querySelector('#moneyDateInput').value;if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return;closeSheet();onSelect(value)};
  });
}
