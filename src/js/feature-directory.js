/* Every action moved from the former home/month screens remains reachable here. */
function moneyFeatureGroups(){
  const date=activeTab==='month'?moneyCalendarDate:trackingDate,month=activeTab==='insights'?moneyInsightMonth:currentMonth;
  return [
    {title:'記録・確認',items:[
      {id:'expense',title:'支出を入力',symbol:'receipt',run:()=>openQuickExpense(date)},
      {id:'income',title:'臨時収入を入力',symbol:'arrowDown',run:()=>openTempIncome(date)},
      {id:'quick-repeat',title:'最近の支出を再利用',symbol:'repeat',run:()=>openQuickRepeat(date)},
      {id:'one-line',title:'一行入力',symbol:'plus',run:()=>openSmartInputSearch('input')},
      {id:'cross-search',title:'横断検索',symbol:'search',run:()=>openSmartInputSearch('search')},
      {id:'daily-correction',title:'実質金額を確認・修正',symbol:'calc',run:()=>openDailyCorrectionDetail(date)},
      {id:'daily-transactions',title:'当日の実績済支払い取引一覧',symbol:'list',run:()=>openTransactionList({date,title:dayLabel(date)+'の支払い'})},
      {id:'month-transactions',title:'月間の実績済支払い取引一覧',symbol:'list',run:()=>openTransactionList({month,title:monthLabel(month)+'の支払い'})},
      {id:'mail',title:'メール取引',symbol:'mail',run:openMailOverview},
      {id:'notices',title:'システムからのお知らせ',symbol:'bell',run:openNotices}
    ]},
    {title:'計画・日締め',items:[
      {id:'daily-goal',title:'当日目標',symbol:'target',run:()=>openDailyGoalPlanner(date)},
      {id:'monthly-goal',title:'月間目標',symbol:'target',run:()=>openMonthlyGoalPlanner(month)},
      {id:'day-plan',title:'日別計画を調整・固定',symbol:'calendar',run:()=>openDayPlanSheet(date)},
      {id:'monthly-summary',title:'月間支出の確認・計画のリセット',symbol:'receipt',run:()=>{currentMonth=month;openMonthSummaryDetail()}},
      {id:'rebalance',title:'予算を立て直す',symbol:'arrowUpDown',run:()=>openBudgetRebalance(month)},
      {id:'event-goals',title:'旅行・プレゼント目標',symbol:'gift',run:()=>openEventGoals(month)},
      {id:'large-add',title:'大型支出計画を追加',symbol:'calendar',run:()=>openLargeExpenseEditor(null,{initialDate:date})},
      {id:'day-close',title:'日締め',symbol:'dayClose',run:()=>openDayClosing(date)},
      {id:'journal',title:'日締めジャーナル',symbol:'journal',run:openDayClosingJournal},
      {id:'month-close',title:'月締めレビュー',symbol:'check',run:()=>openMonthCloseReview(month)}
    ]},
    {title:'見通し・分析',items:[
      {id:'acf',title:'生活費の見通し（ACF）',symbol:'chart',run:openAcf},
      {id:'simulator',title:'購入前シミュレーション',symbol:'calc',run:()=>openAcfSimulator(date)},
      {id:'timeline',title:'お金のタイムライン',symbol:'clock',run:openMoneyTimeline},
      {id:'snapshot',title:'残高・請求スナップショット',symbol:'wallet',run:openMoneySnapshot},
      {id:'daily-analysis',title:'当日の詳細分析',symbol:'chart',run:()=>openDailyAnalysis(date)},
      {id:'month-analysis',title:'月間の詳細分析',symbol:'chart',run:()=>openMonthAnalysis(month)},
      {id:'reason-analysis',title:'理由が分かる分析',symbol:'chart',run:()=>openReasonAnalysis({kind:'expense',month})},
      {id:'month-trend',title:'月次比較・トレンド',symbol:'chart',run:()=>{currentMonth=month;openMonthlyTrendAnalysis()}}
    ]},
    {title:'給与・支払い・資産',items:[
      {id:'salary',title:'給与・勤務先・入金予定',symbol:'briefcase',run:()=>switchTab('pay')},
      {id:'payments',title:'カード・固定支払い・大型支出・ATF',symbol:'card',run:()=>switchTab('payments')},
      {id:'assets',title:'銀行・資産・カード利用枠',symbol:'bank',run:()=>switchTab('assets')},
      {id:'bank-update',title:'銀行残高を更新',symbol:'bank',run:openQuickBank}
    ]}
  ];
}
function openMoneyFeatureDirectory(){
  const groups=moneyFeatureGroups();
  pushView('すべての機能',`<label class="money-search money-feature-search">${icon('search')}<input id="featureSearch" type="search" placeholder="機能を検索" aria-label="機能を検索"></label><div id="featureResults"></div>`,root=>{
    const list=root.querySelector('#featureResults');
    const draw=query=>{
      const normalized=query.trim().toLocaleLowerCase('ja');
      list.innerHTML=groups.map(group=>({title:group.title,items:group.items.filter(item=>!normalized||item.title.toLocaleLowerCase('ja').includes(normalized))})).filter(group=>group.items.length).map(group=>`<section class="money-feature-section"><h2>${esc(group.title)}</h2><div class="group">${group.items.map(item=>`<button type="button" class="row press" data-feature="${item.id}"><span class="money-event-icon blue">${icon(item.symbol)}</span><span class="row-main"><span class="row-title">${esc(item.title)}</span></span><span class="settings-chevron">${icon('chevronRight')}</span></button>`).join('')}</div></section>`).join('')||moneyEmpty('search','一致する機能がありません');
      list.querySelectorAll('[data-feature]').forEach(button=>button.onclick=()=>{
        const action=groups.flatMap(group=>group.items).find(item=>item.id===button.dataset.feature);if(!action)return;
        popView();action.run();
      });
    };
    root.querySelector('#featureSearch').oninput=event=>draw(event.target.value);draw('');
  });
}
function openMoneySnapshot(){
  pushView('残高・請求スナップショット',moneyTickerHtml('snapshot',currentMonth)+`<div class="hero-sub">銀行・カードを横へスライドすると、現在値と履歴を確認できます。</div>`,root=>{bindMoneyTicker('snapshot');root.__dispose=()=>stopMoneyTicker('snapshot')});
}
