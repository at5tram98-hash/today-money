/* iOS 版の ACF（TodayMoneyCore/ACF.swift）の照合データを Web 版の実際の関数で作る。
   使い方: python3 ios/tools/fixture-server.py 8766 で開いたページのコンソールで実行 → Fixtures/acf-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),seed=T.getData(),today=E('ymd')(),now=new Date().toISOString(),addDays=E('addDays'),addMonths=E('addMonths'),m0=today.slice(0,7);
  const view=f=>({
    startDate:f.startDate,endDate:f.endDate,reserveFloor:f.reserveFloor,currentDeposits:f.currentDeposits,protectedCashNow:f.protectedCashNow,freeCashNow:f.freeCashNow,
    futureCardPayments:f.futureCardPayments,futureMandatoryPayments:f.futureMandatoryPayments,safeCreditCapacity:f.safeCreditCapacity,
    safeTotalBudget:f.safeTotalBudget,safeCashBudget:f.safeCashBudget,safeCreditBudget:f.safeCreditBudget,maxSpendToday:f.maxSpendToday,
    maxSpendTodayCash:f.maxSpendTodayCash,maxSpendTodayCredit:f.maxSpendTodayCredit,monthEndForecast:f.monthEndForecast,endForecast:f.endForecast,
    minForecastBalance:f.minForecastBalance,minForecastDate:f.minForecastDate,minMandatoryBalance:f.minMandatoryBalance,minMandatoryDate:f.minMandatoryDate,
    storedPlanUsed:f.storedPlanUsed,planFeasible:f.planFeasible,planShortageTotal:f.planShortageTotal,todayShortage:f.todayShortage,status:f.status,
    cashShortage:f.cashShortage,reserveShortage:f.reserveShortage,firstReserveBreachDate:f.firstReserveBreachDate,
    nextCardPayment:f.nextCardPayment,creditFallbackStartDate:f.creditFallbackStartDate,
    risks:f.risks.map(r=>r.title),confidence:f.confidence.score,
    rows:f.rows.map(r=>({date:r.date,openingBalance:r.openingBalance,income:r.income,mandatoryOutflow:r.mandatoryOutflow,cardPayment:r.cardPayment,
      mandatoryBalance:r.mandatoryBalance,flexibleCash:r.flexibleCash,flexibleCredit:r.flexibleCredit,flexibleTotal:r.flexibleTotal,flexibleCardDue:r.flexibleCardDue,
      forecastBalance:r.forecastBalance,maxSpendCash:r.maxSpendCash,maxSpendCredit:r.maxSpendCredit,maxSpendCombined:r.maxSpendCombined,cashHeadroom:r.cashHeadroom,
      important:!!r.important,paymentMode:r.paymentMode}))
  });
  const idx=f=>{const x=E('acfIndexFor')(f);return{value:Number.isFinite(x.value)?x.value:null,have:x.have,need:x.need,income:x.income,out:x.out,end:x.end,events:x.events.length}};
  const base=JSON.parse(JSON.stringify(seed));base.acfSettings={...base.acfSettings,initialized:true};
  /* カードの設定が揃っているデータ（ledger-fixtures と同じ考え方） */
  const rich=JSON.parse(JSON.stringify(base));
  rich.cards.push({id:'card_t15',company:'テスト',name:'15日締めカード',closingDay:15,dueDay:10,limit:50000,bankId:rich.banks[0].id,tagIds:[]});
  for(let i=-30;i<=0;i+=3)rich.transactions.push({id:`tx_acf_${i}`,date:addDays(today,i),amount:700+((i*37)%500+500)%500,category:i%2?'食費':'交通費',merchant:`店${i}`,paymentMethod:i%3?'other':'card',paymentId:i%3?'':'card_t15',memo:'',source:'manual',createdAt:`${addDays(today,i)}T03:00:00.000Z`});
  rich.banks[1].balance=220000;rich.banks[1].balanceAsOf=now;
  rich.fixedPayments.push({id:'fx_rent',name:'家賃',amount:30000,day:27,frequency:'monthly',startMonth:addMonths(m0,-6),paymentMethod:'bank',paymentId:rich.banks[0].id,skippedDates:[],tagIds:[]});
  const goals=JSON.parse(JSON.stringify(rich));goals.monthlyGoals[m0]={total:40000,categories:{'食費':20000,'交通費':5000},daily:{}};goals.dailyGoals[addDays(today,1)]={total:2500,categories:{'食費':2000},origin:'daily'};
  const cases=[
    ['seed',base,{}],
    ['rich',rich,{}],
    ['rich-credit-off',rich,{creditFallbackEnabled:false}],
    ['rich-50',rich,{creditAggressiveness:50,creditDailyLimit:3000}],
    ['rich-no-weights',rich,{useWeekdayWeights:false,preferredCardId:'card_t15'}],
    ['rich-categories',goals,{creditAllowAllCategories:false,creditAllowedCategoryIds:['food']}],
    ['goals',goals,{}],
    ['tight',rich,{reserveFloor:120000}],
    ['c100',{...rich,acfSettings:{...rich.acfSettings,c100Mode:true}},{}],
  ];
  const out={today,now,cases:[]};
  for(const [name,doc,settings] of cases){
    await T.replaceData(doc);
    const f=E('buildCashFlowForecast')({settings});
    out.cases.push({name,document:T.getData(),settings,forecast:view(f),index:idx(f)});
  }
  await T.replaceData(seed);
  const r=await fetch('/__fixture/acf-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} ${out.cases.map(c=>`${c.name}:${c.forecast.safeTotalBudget}/${c.forecast.status}/${c.forecast.rows.length}`).join(' ')}`;
})()
