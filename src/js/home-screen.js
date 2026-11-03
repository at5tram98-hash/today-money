/* The home workspace follows My Time: records above, calendar below, a draggable boundary. */
let moneyHomeMonth=trackingDate.slice(0,7),moneyHomePane=Number(mm3LoadUiPrefs().homeRecordsHeight)||270;
let moneyCalendarDate=ymd();
function moneyHomeForecast(){return data.acfSettings.initialized?buildCashFlowForecast({lightweight:true}):null}
function renderToday(){
  const date=trackingDate,day=parseYmd(date),records=txForDate(date),income=incomesForDate(date),forecast=moneyHomeForecast(),row=forecast?.rows.find(item=>item.date===date),goal=dailyGoal(date).total,notices=unreadNotices();
  document.getElementById('todayTop').innerHTML=`<button type="button" class="money-date-heading" id="homeDate" aria-label="${esc(dayLabel(date))}、日付を選択">${moneyDateHeading(date)}</button><div class="nav-actions">${actionBtn('search','todaySearch','検索')}${actionBtn('plus','quickExpense','支出を追加')}${actionBtn('more','todayMenu','その他の操作')}</div>`;
  const content=document.getElementById('todayContent');content.classList.add('money-home-workspace');
  content.innerHTML=`<section class="money-record-pane" id="homeRecordPane" style="height:${moneyHomePane}px" aria-label="選択日の記録"><div class="money-home-summary"><button type="button" id="todayHero" class="money-summary-value"><span>${date===ymd()?'今日':'この日'}の支出</span><strong>${yen(spentDate(date))}</strong></button><button type="button" id="acfToday" class="money-summary-value money-safe-value"><span>${date===ymd()?'今日':'この日'}使える目安</span><strong>${row?yen(row.safeTotalBudget):forecast?'—':'設定する'}</strong></button><button type="button" class="money-text-action" id="todayGoalAction">${goal?'目標 '+yen(goal):'目標を設定'}</button></div><div class="money-record-list"><div class="money-list-heading"><h2>${date===ymd()?'今日':'この日'}の記録 <span>${records.length+income.length}件</span></h2><button type="button" class="money-text-action money-close-action" id="todayDayClose">${icon('dayClose')}${dayClosingLabel(date)||'日締め'}</button></div>${records.length||income.length?`<div class="money-records">${income.map(record=>moneyRecordRow(record,{income:true})).join('')}${records.map(record=>moneyRecordRow(record)).join('')}</div>`:moneyEmpty('receipt','まだ記録がありません','支出を記録','homeEmptyAdd')}</div><button type="button" class="money-compact-summary" id="homeCompactSummary">${icon('receipt')}<span>${day.getDate()}日の支出</span><strong>${yen(spentDate(date))}</strong>${icon('chevronDown')}</button></section><div class="money-splitter" id="homeSplitter" role="separator" tabindex="0" aria-label="記録とカレンダーの境界。上下キーで高さを変更" aria-orientation="horizontal" aria-valuemin="0" aria-valuemax="420" aria-valuenow="${moneyHomePane}"><span></span></div><section class="money-home-calendar" id="homeCalendarPane" aria-label="資金カレンダー"></section>`;
  const selectDate=value=>{trackingDate=value;moneyHomeMonth=value.slice(0,7);renderToday()};
  document.getElementById('homeDate').onclick=()=>openMoneyDatePicker(date,selectDate);
  document.getElementById('todayHero').onclick=()=>openDailyCorrectionDetail(date);
  document.getElementById('todayGoalAction').onclick=()=>openDailyGoalPlanner(date);
  document.getElementById('acfToday').onclick=openAcf;
  document.getElementById('todaySearch').onclick=()=>openSmartInputSearch('search');
  document.getElementById('quickExpense').onclick=()=>openQuickExpense(date);
  installLongPress(document.getElementById('quickExpense'),()=>openQuickRepeat(date),{delay:550});
  document.getElementById('homeEmptyAdd')?.addEventListener('click',()=>openQuickExpense(date));
  document.getElementById('todayDayClose').onclick=()=>openDayClosing(date);
  document.getElementById('homeCompactSummary').onclick=()=>{moneyHomePane=270;renderToday()};
  document.getElementById('todayMenu').onclick=event=>openMenu(event.currentTarget,[
    {label:'すべての機能',icon:'grid',action:openMoneyFeatureDirectory},
    {label:'一行入力',icon:'plus',action:()=>openSmartInputSearch('input')},
    {label:'選択日の分析',icon:'chart',action:()=>openDailyAnalysis(date)},
    {label:'収入を追加',icon:'arrowDown',action:()=>openTempIncome(date)},
    {label:'残高を更新',icon:'bank',action:openQuickBank},
    {label:'生活費の見通し',icon:'chart',action:openAcf},
    {label:'お知らせ'+(notices?`（${notices}件）`:''),icon:'bell',action:openNotices},
    {label:'実質金額を確認',icon:'calc',action:()=>openDailyCorrectionDetail(date)},
    {label:'最近の支出を再利用',icon:'repeat',action:()=>openQuickRepeat(date)},
    {label:'月間目標を見直す',icon:'target',action:()=>openMonthlyGoalPlanner(date.slice(0,7))}
  ]);
  bindMoneyRecords(content);bindHomeSplitter(content);
  renderHomeCalendar(forecast);
}
function renderHomeCalendar(forecast=moneyHomeForecast()){
  const pane=document.getElementById('homeCalendarPane');if(!pane)return;
  pane.innerHTML=`<div class="money-calendar-toolbar"><button type="button" class="icon-btn" id="homeMonthPrev" aria-label="前の月">${icon('chevronLeft')}</button><button type="button" class="money-calendar-title" id="homeCalendarOpen"><strong>${Number(moneyHomeMonth.slice(5))}月</strong><small>資金カレンダー</small></button><button type="button" class="icon-btn" id="homeMonthNext" aria-label="次の月">${icon('chevronRight')}</button></div>${moneyCalendarHtml(moneyHomeMonth,trackingDate,{compact:true})}<div id="homeSelectedDay">${moneySelectedDayHtml(trackingDate,forecast,{compact:true})}</div>`;
  pane.querySelector('#homeMonthPrev').onclick=()=>{moneyHomeMonth=addMonths(moneyHomeMonth,-1);renderHomeCalendar(forecast)};
  pane.querySelector('#homeMonthNext').onclick=()=>{moneyHomeMonth=addMonths(moneyHomeMonth,1);renderHomeCalendar(forecast)};
  pane.querySelector('#homeCalendarOpen').onclick=()=>{currentMonth=moneyHomeMonth;moneyCalendarDate=trackingDate;switchTab('month')};
  bindMoneyCalendar(pane,moneyHomeMonth,(date,focus)=>{trackingDate=date;renderToday();if(focus)document.querySelector(`#homeCalendarPane [data-money-date="${date}"]`)?.focus()});
  bindMoneyDayDetails(pane);
}
function bindHomeSplitter(content){
  const splitter=content.querySelector('#homeSplitter'),pane=content.querySelector('#homeRecordPane');let drag=null;
  const maximum=()=>Math.max(120,Math.min(420,content.clientHeight-160));
  const set=value=>{moneyHomePane=clamp(Math.round(value),0,maximum());pane.style.height=moneyHomePane+'px';pane.dataset.density=moneyHomePane<48?'hidden':moneyHomePane<140?'compact':'full';splitter.setAttribute('aria-valuenow',String(moneyHomePane));splitter.setAttribute('aria-valuemax',String(maximum()))};
  set(moneyHomePane);
  splitter.onpointerdown=event=>{if(event.button!==0||event.isPrimary===false)return;drag={id:event.pointerId,y:event.clientY,height:moneyHomePane};splitter.setPointerCapture(event.pointerId)};
  splitter.onpointermove=event=>{if(drag?.id===event.pointerId)set(drag.height+event.clientY-drag.y)};
  splitter.onpointerup=event=>{if(drag?.id!==event.pointerId)return;drag=null;mm3SaveUiPrefs({homeRecordsHeight:moneyHomePane});feedback.selection()};
  splitter.onpointercancel=()=>{if(drag)set(drag.height);drag=null};
  splitter.onlostpointercapture=()=>{if(drag)set(drag.height);drag=null};
  splitter.ondblclick=()=>{set(moneyHomePane<140?270:72);mm3SaveUiPrefs({homeRecordsHeight:moneyHomePane})};
  splitter.onkeydown=event=>{const delta={ArrowUp:-40,ArrowDown:40}[event.key];if(!delta&&event.key!=='Home'&&event.key!=='End')return;event.preventDefault();set(event.key==='Home'?72:event.key==='End'?maximum():moneyHomePane+delta);mm3SaveUiPrefs({homeRecordsHeight:moneyHomePane})};
}
function renderMonth(){
  if(moneyCalendarDate.slice(0,7)!==currentMonth)moneyCalendarDate=currentMonth===ym()?ymd():currentMonth+'-01';
  const forecast=moneyHomeForecast(),content=document.getElementById('monthContent');content.classList.add('money-calendar-page');
  document.getElementById('monthTop').innerHTML=`<button type="button" class="money-date-heading" id="monthName" aria-label="表示月を選択"><span class="money-date-month">${currentMonth.slice(0,4)}年</span><span class="money-date-main"><strong>${Number(currentMonth.slice(5))}月</strong>${icon('chevronDown')}</span></button><div class="nav-actions">${actionBtn('today','calendarToday','今日へ')}${actionBtn('plus','calendarAdd','予定を追加')}${actionBtn('more','monthMenu','その他の操作')}</div>`;
  content.innerHTML=`<div class="money-calendar-period"><button class="money-text-action" id="calendarPrev">${icon('chevronLeft')}前月</button><span>${monthPlanEditMode?'日別計画を調整中':'資金カレンダー'}</span><button class="money-text-action" id="calendarNext">次月${icon('chevronRight')}</button></div>${moneyCalendarHtml(currentMonth,moneyCalendarDate)}<div class="money-calendar-key"><span><i class="income"></i>給与</span><span><i class="bill"></i>カード</span><span><i class="planned"></i>予定支出</span></div><button type="button" class="money-text-action money-plan-toggle" id="monthPlanEdit">${monthPlanEditMode?'調整を終了':'日別計画を調整'}</button>${moneySelectedDayHtml(moneyCalendarDate,forecast)}<div class="money-section-links"><button class="row press" id="acfMonth"><span class="money-event-icon blue">${icon('chart')}</span><span class="row-main"><span class="row-title">生活費の見通し</span><span class="row-sub">ACFで日別の予測を確認</span></span>${icon('chevronRight')}</button><button class="row press" id="monthGoal"><span class="money-event-icon blue">${icon('target')}</span><span class="row-main"><span class="row-title">月間計画</span><span class="row-sub">日ごとの予算を調整</span></span>${icon('chevronRight')}</button></div>`;
  document.getElementById('monthName').onclick=()=>openDisplayMonthPicker({title:'表示月',value:currentMonth,onApply:month=>{currentMonth=month;renderAll()}});
  document.getElementById('calendarToday').onclick=()=>{currentMonth=ym();moneyCalendarDate=ymd();renderAll()};
  document.getElementById('calendarPrev').onclick=()=>monthShift(-1);document.getElementById('calendarNext').onclick=()=>monthShift(1);
  document.getElementById('calendarAdd').onclick=()=>openLargeExpenseEditor(null,{initialDate:moneyCalendarDate});
  document.getElementById('monthPlanEdit').onclick=()=>{monthPlanEditMode=!monthPlanEditMode;renderMonth()};
  document.getElementById('acfMonth').onclick=openAcf;document.getElementById('monthGoal').onclick=()=>openMonthlyGoalPlanner(currentMonth);
  document.getElementById('monthMenu').onclick=event=>openMenu(event.currentTarget,[{label:'すべての機能',icon:'grid',action:openMoneyFeatureDirectory},{label:'日別計画を調整',icon:'target',action:()=>openDayPlanSheet(moneyCalendarDate)},{label:'お金のタイムライン',icon:'clock',action:openMoneyTimeline},{label:'予算を立て直す',icon:'target',action:()=>openBudgetRebalance(currentMonth)},{label:'理由が分かる分析',icon:'chart',action:()=>openReasonAnalysis({kind:'expense',month:currentMonth})},{label:'月間目標を見直す',icon:'target',action:()=>openMonthlyGoalPlanner(currentMonth)},{label:'月締めレビュー',icon:'dayClose',action:()=>openMonthCloseReview(currentMonth)},{label:'旅行・プレゼント目標',icon:'gift',action:()=>openEventGoals(currentMonth)}]);
  bindMoneyCalendar(content,currentMonth,(date,focus)=>{moneyCalendarDate=date;if(monthPlanEditMode&&!focus){openDayPlanSheet(date);return}renderMonth();if(focus)content.querySelector(`[data-money-date="${date}"]`)?.focus()});bindMoneyDayDetails(content);
  installHorizontalSwipe(content.querySelector('.money-calendar-grid'),()=>monthShift(1),()=>monthShift(-1),78);
}
