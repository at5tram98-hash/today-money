function buildForecastPure(input){
  const {ctx,settings,sim,maximums,combined,deposits,todayGoal,spentToday,
    monthEnd,explicit,storedPlanUsed,cardAllowedSummary}=input;
  const rows=sim.rows.map((source,i)=>{
    const maxResult=maximums[i],row={...source};
    row.safeCashBudgetRemaining=row.flexibleCash||0;
    row.safeCreditBudgetRemaining=row.flexibleCredit||0;
    row.safeBudgetRemaining=row.flexibleTotal||0;
    row.safeCashBudget=row.flexibleCash||0;
    row.safeCreditBudget=row.flexibleCredit||0;
    row.safeTotalBudget=row.flexibleTotal||0;
    row.safeDailyBudget=row.safeTotalBudget;
    row.maxSpendCash=maxResult.cash||0;
    row.maxSpendCredit=maxResult.credit||0;
    row.maxSpendCombined=maxResult.maxTotal||0;
    row.maxSpend=row.maxSpendCombined;
    row.combinedBoundarySafe=!maxResult.plusOneSafe;
    row.freeCash=Math.max(0,Number(row.freeCashBefore)||0);
    return row;
  });
  const today=rows[0]||{};
  const desiredToday=todayGoal?Math.max(0,todayGoal-spentToday):0;
  const monthRow=rows.find(r=>r.date===monthEnd)||rows.filter(r=>r.date<=monthEnd).at(-1)||rows.at(-1);
  const minRow=rows.reduce((a,r)=>!a||r.forecastBalance<a.forecastBalance?r:a,null);
  const minMandatory=ctx.baseRows.reduce((a,r)=>!a||r.mandatoryBalance<a.mandatoryBalance?r:a,null);
  const firstShortage=rows.find(r=>(Number(r.flexibleShortage)||0)>0);
  const freeCashNow=Math.max(0,Math.floor(Number(ctx.baseRows?.[0]?.maxSpendCash)||0));
  const protectedCashNow=Math.max(0,deposits-freeCashNow);
  const futureCardPayments=ctx.baseRows.reduce((n,r)=>n+(Number(r.cardPayment)||0),0);
  const futureMandatoryPayments=ctx.baseRows.reduce((n,r)=>n+(Number(r.mandatoryOutflow)||0),0);
  const forecast={
    startDate:ctx.start,endDate:ctx.end,reserveFloor:ctx.reserve,settings,rows,
    currentDeposits:deposits,protectedCashNow,freeCashNow,
    futureCardPayments,futureMandatoryPayments,safeCreditCapacity:combined.credit||0,
    safeDailyBudget:today.safeTotalBudget||0,safeTotalBudget:today.safeTotalBudget||0,
    safeCashBudget:today.safeCashBudget||0,safeCreditBudget:today.safeCreditBudget||0,
    remainingToday:today.safeBudgetRemaining||0,maxSpendToday:combined.maxTotal||0,
    maxSpendTodayCash:combined.cash||0,maxSpendTodayCredit:combined.credit||0,
    monthEndForecast:monthRow?.forecastBalance??deposits,
    endForecast:rows.at(-1)?.forecastBalance??deposits,
    minForecastBalance:minRow?.forecastBalance??deposits,minForecastDate:minRow?.date||ctx.start,
    minMandatoryBalance:minMandatory?.mandatoryBalance??deposits,minMandatoryDate:minMandatory?.date||ctx.start,
    explicitPlan:!!explicit,storedPlanUsed,planFeasible:sim.feasible,
    planShortageTotal:Math.max(0,Number(sim.totalShortage)||0),planShortageDate:firstShortage?.date||'',
    desiredBudgetToday:desiredToday,todayShortage:Math.max(0,desiredToday-(today.safeTotalBudget||0)),
    todayMode:today.paymentMode||(today.safeCashBudget>0&&today.safeCreditBudget>0?'カード＋現金':
      today.flexibleShortage>0?'不足':today.safeCreditBudget>0?'カード':today.safeCashBudget>0?'現金':'—')
  };
  // A shortage must take priority over the selected payment method.
  if(!today.paymentMode&&today.flexibleShortage>0)forecast.todayMode='不足';
  const fixedMandatory=ctx.baseRows.reduce((n,r)=>n+(Number(r.fixedPayment)||0),0);
  const largeMandatory=ctx.baseRows.reduce((n,r)=>n+(Number(r.largeExpenseCash)||0),0);
  forecast.mandatoryBreakdown={card:futureCardPayments,fixed:fixedMandatory,large:largeMandatory,
    other:Math.max(0,futureMandatoryPayments-futureCardPayments-fixedMandatory-largeMandatory)};
  const next=rows.find(r=>(Number(r.cardPayment)||0)+(Number(r.flexibleCardDue)||0)>0);
  forecast.nextCardPayment=next?{date:next.date,amount:(Number(next.cardPayment)||0)+(Number(next.flexibleCardDue)||0)}:null;
  forecast.cardAllowedSummary=cardAllowedSummary;
  forecast.creditFallbackStartDate=rows.find(r=>(Number(r.flexibleCredit)||0)>0)?.date||'';
  const creditIndex=rows.findIndex(r=>(Number(r.flexibleCredit)||0)>0);
  forecast.cashDaysRemaining=creditIndex<0?null:Math.max(0,creditIndex);
  forecast.status=forecast.minMandatoryBalance<0?'不足':
    forecast.minMandatoryBalance<ctx.reserve?'危険':
    forecast.minForecastBalance<ctx.reserve?'危険':
    forecast.planShortageTotal>0?'注意':
    forecast.minForecastBalance<ctx.reserve+5000?'注意':'安全';
  return forecast;
}

/** Keep state reads, search and cache management outside the pure forecast assembler. */
function buildCashFlowForecastCore(options={}){
  const lightweight=options.lightweight===true;
  const settings={...acfDefaultSettings(),...(options.settings||{})};
  const scenario=options.scenario||null;
  const cacheable=!scenario&&!options.horizonEnd&&!options.largeExpensePlans&&!options.settings&&
    !options.flexibleBudgetPlan&&(options.startDate||ymd())===ymd();
  const settingsKey=JSON.stringify([settings.reserveFloor,settings.horizon,settings.creditFallbackEnabled,
    settings.creditDailyLimit,settings.creditAggressiveness,settings.creditAllowAllCategories,
    settings.creditAllowedCategoryIds,settings.creditAllowedMerchants,settings.creditBlockedMerchants,
    settings.preferredCardId,settings.useWeekdayWeights,settings.includeRequiredLargeExpenses]);
  const cacheKey=cacheable?`${ymd()}|${settingsKey}`:'';
  if(cacheable&&acfForecastCache?.key===cacheKey)return acfForecastCache.value;
  const ctx=buildAcfBaseContext({...options,settings});
  const explicit=options.flexibleBudgetPlan&&typeof options.flexibleBudgetPlan==='object';
  const plan={};
  if(explicit){
    for(const date of ctx.dates){
      if(date>ctx.budgetEnd)continue;
      let v=Math.max(0,Number(options.flexibleBudgetPlan[date])||0);
      if(options.planIncludesSpent&&date===ctx.start)v=Math.max(0,v-spentDate(date));
      if(date<ctx.start)v=0;
      plan[date]=v;
    }
  }
  let storedPlanUsed=false,sim;
  if(explicit)sim=acfSimulateFlexiblePlan(plan,ctx,settings);
  else{
    const optimized=acfBuildOptimizedFlexiblePlan(ctx,settings);
    const merged=acfPlanWithStoredGoals(ctx,optimized);
    storedPlanUsed=merged.hasStored;
    if(!storedPlanUsed)sim=optimized;
    else{
      const full=acfSimulateFlexiblePlan(merged.makePlan(1),ctx,settings);
      if(full.feasible)sim=full;
      else{
        const fixedOnly=acfSimulateFlexiblePlan(merged.makePlan(0),ctx,settings);
        if(!fixedOnly.feasible)sim=fixedOnly;
        else{
          let lo=0,hi=1,best=fixedOnly;
          for(let i=0;i<22;i++){
            const mid=(lo+hi)/2,test=acfSimulateFlexiblePlan(merged.makePlan(mid),ctx,settings);
            if(test.feasible){lo=mid;best=test}else hi=mid;
          }
          sim=best;
        }
      }
    }
  }
  const maximums=sim.rows.map(row=>!lightweight&&row.date<=ctx.budgetEnd?
    simulateCombinedSpend(row.date,ctx,settings):
    {maxTotal:Number(row.flexibleTotal)||0,cash:Number(row.flexibleCash)||0,
      credit:Number(row.flexibleCredit)||0,plusOneSafe:false});
  const combined=lightweight?
    {maxTotal:Number(sim.rows[0]?.flexibleTotal)||0,cash:Number(sim.rows[0]?.flexibleCash)||0,
      credit:Number(sim.rows[0]?.flexibleCredit)||0}:
    simulateCombinedSpend(ctx.start,ctx,settings);
  const forecast=buildForecastPure({ctx,settings,sim,maximums,combined,deposits:totalDeposits(),
    todayGoal:dailyGoal(ctx.start).total||dayGoalForMonth(ctx.start.slice(0,7),Number(ctx.start.slice(8,10))),
    spentToday:spentDate(ctx.start),monthEnd:monthEndDate(ctx.start.slice(0,7)),
    explicit,storedPlanUsed,cardAllowedSummary:acfAllowedCategorySummary(settings)});
  forecast.risks=getForecastRiskCore(forecast);
  forecast.confidence=getForecastConfidence(forecast);
  if(cacheable)acfForecastCache={key:cacheKey,value:forecast};
  return forecast;
}
function getSafeDailyBudget(date,forecast=buildCashFlowForecast()){return forecast.rows.find(r=>r.date===date)?.safeTotalBudget||0}
function getMaxSpendForDate(date,forecast=buildCashFlowForecast(),method='cash',paymentId=''){
  const row=forecast.rows.find(r=>r.date===date);
  if(!row)return 0;
  if(method==='cash'||method==='bank'||method==='debit'||method==='other')return row.maxSpendCash||0;
  if(method==='combined')return row.maxSpendCombined||0;
  if(method==='card'&&!paymentId)return row.maxSpendCredit||0;
  if(method==='card'&&paymentId){
    const c=cardById(paymentId),settings=forecast.settings||acfDefaultSettings();
    if(!acfCardIsConfigured(c)||settings.creditFallbackEnabled===false)return 0;
    const ctx=buildAcfBaseContext({startDate:forecast.startDate,settings}),dailyRemaining=Math.max(0,settings.creditDailyLimit-dailyCardUsage(date)),levelCap=Math.floor(dailyRemaining*clamp(Number(settings.creditAggressiveness)||0,0,100)/100),bucket=acfEligibleCardBuckets(date,ctx,new Map(),settings).find(x=>x.card.id===paymentId);
    if(!bucket)return 0;
    const idx=ctx.baseRows.findIndex(r=>r.date===bucket.due);
    if(idx<0)return 0;
    let min=Infinity;
    for(let i=idx;i<ctx.baseRows.length;i++)min=Math.min(min,ctx.baseRows[i].mandatoryBalance);
    return Math.max(0,Math.floor(Math.min(bucket.available,levelCap,min-ctx.reserve)))
  }return row.maxSpendCombined||0
}

function getForecastRiskCore(forecast){
  const risks=[];
  if(forecast.minMandatoryBalance<forecast.reserveFloor){
    const shortage=forecast.reserveFloor-forecast.minMandatoryBalance;
    risks.push({severity:forecast.minMandatoryBalance<0?'critical':'warning',title:`${dayLabel(forecast.minMandatoryDate)}に安全ラインを下回る見込みです`,detail:`不足見込み ${yen(shortage)}`,date:forecast.minMandatoryDate,action:{type:'day',date:forecast.minMandatoryDate}})
  }if(forecast.planShortageTotal>0){
    const d=forecast.planShortageDate||forecast.startDate;
    risks.push({severity:'warning',title:`${dayLabel(d)}以降の計画に不足があります`,detail:`安全に使える額に対して合計 ${yen(forecast.planShortageTotal)} 不足しています。`,date:d,action:{type:'goal',date:d}})
  }else if(forecast.explicitPlan&&forecast.minForecastBalance<forecast.reserveFloor){
    const shortage=forecast.reserveFloor-forecast.minForecastBalance;
    risks.push({severity:'warning',title:`${dayLabel(forecast.minForecastDate)}に計画が安全ラインを超えます`,detail:`日別計画を ${yen(shortage)} 以上見直す必要があります。`,date:forecast.minForecastDate,action:{type:'goal',date:forecast.minForecastDate}})
  }if(forecast.settings.creditFallbackEnabled){
    for(const c of data.cards){
      const missing=[];
      if(!(Number(c.limit)>0))missing.push('利用限度額');
      if(c.closingDay==null)missing.push('締め日');
      if(c.dueDay==null)missing.push('支払日');
      if(missing.length)risks.push({severity:'warning',title:`${c.name}のカード支払い設定が未完成です`,detail:`${missing.join('・')}を設定すると日常のカード支払いに利用できます。`,action:{type:'card',id:c.id}})
    }
  }const unknownAmount=data.mailImports.filter(x=>x.status==='pending'&&!(Number(x.amount)>0)).length;
  if(unknownAmount)risks.push({severity:'warning',title:'金額不明のGmail取引があります',detail:`${unknownAmount}件の金額確認が必要です。`,action:{type:'mail'}});
  for(const c of data.cards){
    const limit=Number(c.limit)||0,ex=acfProjectedCardExposureThrough(c.id,forecast.endDate||addDays(ymd(),60));
    if(limit>0&&ex.max/limit>=.8)risks.push({severity:'watch',title:`${c.name}の利用可能額が20%未満になる見込みです`,detail:`予定込み最大利用 ${yen(ex.max)} / 枠 ${yen(limit)}`,action:{type:'card',id:c.id}})
  }if(forecast.desiredBudgetToday&&forecast.todayShortage>0)risks.push({severity:'watch',title:'今日の計画額をすべて安全に使う余裕がありません',detail:`不足 ${yen(forecast.todayShortage)}・安全に使える目安 ${yen(forecast.safeTotalBudget)}`,action:{type:'goal',date:forecast.startDate}});
  if((forecast.safeTotalBudget||0)<500&&(forecast.safeCreditCapacity||0)<=0&&forecast.minMandatoryBalance>=forecast.reserveFloor)risks.push({severity:'watch',title:'現在の登録内容では追加支出の余裕がほとんどありません',detail:'現在の登録内容では追加支出の余裕がありません。',action:{type:'acf'}});
  return risks
}
function getForecastConfidence(forecast=null){
  let score=100;
  const reasons=[],now=Date.now();
  for(const b of data.banks){
    const t=Date.parse(b.balanceAsOf||'');
    if(!Number.isFinite(t)){
      score-=10;
      reasons.push({text:`${b.name}の残高基準日時が未確認`,action:{type:'bank',id:b.id}});
      continue
    }const days=(now-t)/86400000;
    if(days>7){
      score-=8;
      reasons.push({text:`${b.name}の残高確認が7日以上前`,action:{type:'bank',id:b.id}})
    }else if(days>3){
      score-=4;
      reasons.push({text:`${b.name}の残高確認が3日以上前`,action:{type:'bank',id:b.id}})
    }
  }const amountUnknown=data.mailImports.filter(x=>x.status==='pending'&&!(Number(x.amount)>0)).length,categoryOnly=data.mailImports.filter(x=>x.status==='pending'&&Number(x.amount)>0).length;
  if(amountUnknown){
    score-=Math.min(24,amountUnknown*10);
    reasons.push({text:`金額不明Gmail ${amountUnknown}件`,action:{type:'mail'}})
  }if(categoryOnly){
    score-=Math.min(8,categoryOnly*2);
    reasons.push({text:`カテゴリ未確認Gmail ${categoryOnly}件`,action:{type:'mail'}})
  }if(acfDefaultSettings().creditFallbackEnabled){
    for(const c of data.cards){
      const missing=[];
      if(!(Number(c.limit)>0))missing.push('利用限度額');
      if(c.closingDay==null)missing.push('締め日');
      if(c.dueDay==null)missing.push('支払日');
      if(missing.length){
        score-=6;
        reasons.push({text:`${c.name}の${missing.join('・')}が未設定`,action:{type:'card',id:c.id}})
      }
    }
  }for(const st of cardPaymentStatementsInMonth(ym(),{includePaid:true})){
    if(st.status==='estimated'){
      score-=7;
      reasons.push({text:`${st.cardName}の今月請求額が見込み`,action:{type:'card',id:st.cardId}})
    }
  }for(const r of data.salaryRecords.filter(r=>r.status!=='入金済')){
    const d=String(r.date||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d)){
      score-=5;
      reasons.push({text:'給与予定日の確認が必要',action:{type:'salary'}})
    }
  }score=clamp(Math.round(score),25,100);
  const unique=[];
  for(const r of reasons)if(!unique.some(x=>x.text===r.text))unique.push(r);
  return{score,label:score>=85?'高':score>=65?'中':'低',reasons:unique.slice(0,6)}
}
function simulateCashFlow(scenario){return buildCashFlowForecast({scenario})}
function applyAcfSafeBudgetToMonthlyPlan(month=ym()){const mg=data.monthlyGoals[month];if(!mg?.total)return false;const forecast=buildCashFlowForecast(),today=ymd(),days=daysInMonth(month);try{safeCommit(()=>{const current=data.monthlyGoals[month];if(!current?.total)throw new Error('月間計画が見つかりません');const next={...current,daily:{...(current.daily||{})}};for(let day=1;day<=days;day++){const date=`${month}-${pad(day)}`,raw=data.dailyGoals[date];if(raw?.origin==='daily')continue;if(month===ym()&&date<today)continue;const safe=Math.max(0,Math.round(getSafeDailyBudget(date,forecast)));if(safe>0){next.daily[day]=safe;data.dailyGoals[date]={total:safe,categories:raw?.categories||{},origin:'monthly'}}else{delete next.daily[day];if(raw?.origin==='monthly')delete data.dailyGoals[date]}}data.monthlyGoals[month]=next},{label:'ACF monthly budget'});renderAll();return true}catch(e){return false}}
