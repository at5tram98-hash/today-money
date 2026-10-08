/* Both presentations read the same forecast rows and use the same money formatting. */
const ACF_DAY_FIELDS=[
  ['開始残高','openingBalance','signed'],
  ['入金予定','income','plus'],
  ['カード引落','totalCardPayment','minus'],
  ['その他必須支出','otherMandatory','minus'],
  ['現金余力','cashHeadroom','signed'],
  ['計画支出（現金）','flexibleCash','minus'],
  ['現金で使う目安','safeCashBudgetRemaining','available'],
  ['カードで使う目安','safeCreditBudgetRemaining','available'],
  ['今日使える合計','safeBudgetRemaining','available'],
  ['計画後の残高','forecastBalance','signed'],
  ['安全余力','headroom','signed']
];
function acfDisplayRows(f,importantOnly,month){return (importantOnly?acfImportantRows(f):f.rows).filter(row=>!month||row.date.slice(0,7)===month)}
function acfDisplayValue(row,key){return key==='otherMandatory'?Math.max(0,(Number(row.mandatoryOutflow)||0)-(Number(row.cardPayment)||0)):Number(row[key])||0}
function acfCalendarMoney(value){
  const amount=Math.round(Number(value)||0),absolute=Math.abs(amount),sign=amount<0?'−':'';
  return absolute>=10000?`${sign}${(absolute/10000).toFixed(1)}万`:`${sign}${absolute.toLocaleString('ja-JP')}`;
}
function acfCalendarSelection(f,importantOnly,month,selectedDate){
  const rows=acfDisplayRows(f,importantOnly,month);
  return rows.find(row=>row.date===selectedDate)?.date||rows.find(row=>row.date===ymd())?.date||rows[0]?.date||'';
}
function acfCalendarHtml(f,importantOnly,month,selectedDate){
  const rows=acfDisplayRows(f,importantOnly,month),byDate=new Map(rows.map(row=>[row.date,row]));
  const first=parseYmd(`${month}-01`).getDay(),days=daysInMonth(month),selected=rows.find(row=>row.date===selectedDate);
  const cells=Array.from({length:Math.ceil((first+days)/7)*7},(_,index)=>{
    const day=index-first+1;if(day<1||day>days)return '<span class="acf-calendar-spacer" aria-hidden="true"></span>';
    const date=`${month}-${pad(day)}`,row=byDate.get(date);
    if(!row)return `<span class="acf-calendar-unavailable"><span>${day}</span><span aria-hidden="true">—</span></span>`;
    const balance=acfDisplayValue(row,'forecastBalance'),risk=balance<0?'deficit':acfDisplayValue(row,'headroom')<0?'warning':'';
    const events=[row.salary?'給与':'',row.card||row.cardPayment>0||row.flexibleCardDue>0?'カード引落':'',row.large?'大型支出':''].filter(Boolean);
    return `<button type="button" class="acf-calendar-day ${risk} ${date===ymd()?'today':''} ${date===selectedDate?'selected':''}" data-acf-select="${date}" aria-pressed="${date===selectedDate}" aria-label="${esc(dayLabel(date))}、計画後の残高 ${esc(yen(balance))}${events.length?'、'+esc(events.join('・')):''}"><span class="acf-calendar-number">${day}</span><span class="acf-calendar-amount">${acfCalendarMoney(balance)}</span><span class="acf-calendar-marks" aria-hidden="true">${row.salary?'<i class="salary"></i>':''}${row.card||row.cardPayment>0||row.flexibleCardDue>0?'<i class="card"></i>':''}${row.large?'<i class="large"></i>':''}</span></button>`;
  }).join('');
  return `<div class="acf-calendar"><div class="acf-calendar-week" aria-hidden="true">${[...'日月火水木金土'].map(day=>`<span>${day}</span>`).join('')}</div><div class="acf-calendar-grid" role="group" aria-label="${esc(monthLabel(month))}の資金カレンダー">${cells}</div><p class="acf-calendar-note">各日の数値は計画後の残高です。日付を選ぶと、表と同じ内訳を表示します。${importantOnly?'重要日のみ選択できます。':''}</p><div class="acf-calendar-legend"><span><i class="salary"></i>給与</span><span><i class="card"></i>カード引落</span><span><i class="large"></i>大型支出</span><span class="red">資金不足</span></div></div>${selected?`<section class="acf-calendar-detail" aria-label="選択日の資金内訳"><div class="acf-calendar-detail-head"><h3>${esc(dayLabel(selectedDate))}</h3><button type="button" class="acf-calendar-inspect" data-acf-day="${selectedDate}">この日の詳細 ${icon('chevronRight')}</button></div><dl>${ACF_DAY_FIELDS.map(([label,key,kind])=>`<div data-acf-field="${key}"><dt>${label}</dt><dd>${acfTableValueHtml(kind,acfDisplayValue(selected,key))}</dd></div>`).join('')}</dl></section>`:'<div class="acf-table-empty">この月に表示する日がありません。</div>'}`;
}
function bindAcfCalendarKeyboard(panel,f,importantOnly,month,onSelect){
  panel.onkeydown=event=>{
    const button=event.target.closest('[data-acf-select]');if(!button)return;
    const offsets={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7},offset=offsets[event.key];if(!offset)return;
    event.preventDefault();const rows=acfDisplayRows(f,importantOnly,month),date=button.dataset.acfSelect,target=addDays(date,offset);
    const candidate=rows.find(row=>row.date===target)||((offset>0?rows:[...rows].reverse()).find(row=>offset>0?row.date>=target:row.date<=target));
    if(candidate)onSelect(candidate.date,true);
  };
}
