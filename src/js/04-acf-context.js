function acfDefaultSettings(){
  const x={...DEFAULT_DATA.acfSettings,...(data.acfSettings||{})};
  x.reserveFloor=Math.max(0,Number(x.reserveFloor)||0,typeof activeSalaryAllocationReserve==='function'?activeSalaryAllocationReserve():0);
  x.creditFallbackEnabled=x.creditFallbackEnabled!==false;
  x.creditDailyLimit=Math.max(0,Math.round(Number(x.creditDailyLimit??1000)||0));
  x.creditAggressiveness=clamp(Number(x.creditAggressiveness??100)||0,0,100);
  x.creditAllowAllCategories=x.creditAllowAllCategories!==false;
  x.creditAllowedCategoryIds=Array.isArray(x.creditAllowedCategoryIds)?[...new Set(x.creditAllowedCategoryIds.map(String))]:[];
  x.creditAllowedMerchants=Array.isArray(x.creditAllowedMerchants)?[...new Set(x.creditAllowedMerchants.map(String).filter(Boolean))]:[];
  x.creditBlockedMerchants=Array.isArray(x.creditBlockedMerchants)?[...new Set(x.creditBlockedMerchants.map(String).filter(Boolean))]:[];
  x.preferredCardId=String(x.preferredCardId||'');
  x.horizon='two_months';
  return x
}

function categoryIdForName(name){return data.categories.find(c=>c.name===name)?.id||''}
function acfMerchantRuleMatches(list,merchant){const key=normalizeMerchantKey(merchant);if(!key)return false;return (list||[]).some(v=>normalizeMerchantKey(v)===key)}
function isCreditAllowedForExpense(category='',merchant='',settings=acfDefaultSettings()){if(acfMerchantRuleMatches(settings.creditBlockedMerchants,merchant))return false;if(acfMerchantRuleMatches(settings.creditAllowedMerchants,merchant))return true;if(settings.creditAllowAllCategories!==false)return true;const id=categoryIdForName(category);return !!id&&(settings.creditAllowedCategoryIds||[]).includes(id)}
function acfHasAnyCreditUsePlace(settings=acfDefaultSettings()){return settings.creditAllowAllCategories!==false||(settings.creditAllowedCategoryIds||[]).length>0||(settings.creditAllowedMerchants||[]).length>0}
function acfPlannedCreditEligibleAmount(date,requested,settings=acfDefaultSettings()){
  requested=Math.max(0,Math.floor(Number(requested)||0));
  if(!requested||settings.creditFallbackEnabled===false)return 0;
  if(settings.creditAllowAllCategories!==false)return requested;
  const allowedNames=new Set(data.categories.filter(c=>(settings.creditAllowedCategoryIds||[]).includes(c.id)).map(c=>c.name));
  if(!allowedNames.size)return 0;
  const dg=dailyGoal(date),dailyCats=dg.categories||{},dailyEntries=Object.entries(dailyCats).filter(([,v])=>Number(v)>0);
  if(dailyEntries.length){
    let eligible=0;
    for(const [name,amount] of dailyEntries){
      if(!allowedNames.has(name))continue;
      const planned=Math.max(0,Number(amount)||0),spent=date===ymd()?Math.max(0,Number(dailyCategorySpent(date,name))||0):0;
      eligible+=Math.max(0,planned-spent)
    }return Math.min(requested,Math.floor(eligible))
  }const mg=monthlyGoal(String(date).slice(0,7)),monthCats=mg.categories||{},monthTotal=Math.max(0,Number(mg.total)||0),allowedTotal=sum(Object.entries(monthCats).filter(([name,v])=>allowedNames.has(name)&&Number(v)>0),([,v])=>Number(v)||0);
  if(monthTotal>0&&allowedTotal>0)return Math.min(requested,Math.floor(requested*Math.min(1,allowedTotal/monthTotal)));
  return 0
}
function dailyCardUsage(date){return sum(data.transactions.filter(t=>t.date===date&&t.paymentMethod==='card'&&Number(t.amount)>0),t=>Math.max(0,Number(t.amount)||0))}
function acfCardIsConfigured(card){return !!card&&Number(card.limit)>0&&card.closingDay!=null&&card.dueDay!=null}
function acfConfiguredCards(settings=acfDefaultSettings()){return data.cards.filter(acfCardIsConfigured).sort((a,b)=>{const ap=a.id===settings.preferredCardId?1:0,bp=b.id===settings.preferredCardId?1:0;return bp-ap||String(a.name).localeCompare(String(b.name),'ja')})}

function acfAllowedCategorySummary(settings=acfDefaultSettings()){if(settings.creditAllowAllCategories!==false)return'すべてのカテゴリ';const names=data.categories.filter(c=>(settings.creditAllowedCategoryIds||[]).includes(c.id)).map(c=>c.name);if(!names.length)return settings.creditAllowedMerchants?.length?'登録したお店のみ':'なし';return names.length<=3?names.join('・'):`${names.slice(0,3).join('・')}＋ほか${names.length-3}件`}


function openAcfAction(action){if(!action)return;if(action.type==='bank')openBankDetail(action.id);else if(action.type==='card'){const c=cardById(action.id);if(c)openAddCard(c)}else if(action.type==='mail')openMailOverview();else if(action.type==='salary')switchTab('pay');else if(action.type==='acf')openAcfSettings();else if(action.type==='goal')openDailyGoalPlanner(action.date||ymd());else if(action.type==='day')openFinancialDayInspector(action.date||ymd())}

function acfPlansWithScenario(plans,scenario){const out=(plans||data.largeExpensePlans).map(clone);if(scenario?.amount>0)out.push({id:'scenario',name:scenario.name||'What-if',date:scenario.date||ymd(),amount:Number(scenario.amount)||0,category:scenario.category||'その他',priority:'required',paymentMethod:scenario.paymentMethod||'other',paymentId:scenario.paymentId||'',linkedBankId:scenario.linkedBankId||'',status:'planned',memo:'simulation',splits:[]});return out}
function acfEffectiveCardPaymentDate(card,billingMonth){if(!card||!billingMonth)return null;const adj=cardAdjustmentInfo(card.id,billingMonth);return adj?.paymentDateOverride||cardPaymentDateForBillingMonth(card,billingMonth)}
function acfVisibleEnd(start=ymd()){return monthEndDate(addMonths(start.slice(0,7),2))}
function acfHorizonEnd({start=ymd(),settings=acfDefaultSettings(),plans=data.largeExpensePlans,scenario=null}={}){
  const visibleEnd=acfVisibleEnd(start),startMonth=start.slice(0,7);
  let lastDue=visibleEnd;
  const consider=due=>{if(due&&due>lastDue)lastDue=due};
  for(const c of data.cards){
    const lastBillingMonth=cardBillingMonthForPurchase(c,visibleEnd);
    for(let i=-2;i<=5;i++){
      const bm=addMonths(startMonth,i);
      if(lastBillingMonth&&bm>lastBillingMonth)break;
      const amount=acfCardBillingAmount(c.id,bm);
      if(amount>0)consider(acfEffectiveCardPaymentDate(c,bm));
    }
    if(settings.creditFallbackEnabled&&Number(settings.creditAggressiveness)>0&&c.closingDay!=null){
      consider(acfEffectiveCardPaymentDate(c,lastBillingMonth));
    }
  }
  /* Include the bills generated by spending in the visible two-month window. */
  for(const f of data.fixedPayments||[]){
    if(f.paymentMethod!=='card'||!f.paymentId)continue;
    const c=cardById(f.paymentId);if(!c)continue;
    for(const date of dateRange(start,visibleEnd,100)){
      if(!fixedDueOn(f,date)||(f.skippedDates||[]).includes(date))continue;
      if(data.transactions.some(t=>t.source==='fixed'&&t.fixedId===f.id&&t.date===date))continue;
      const bm=cardBillingMonthForPurchase(c,date);consider(acfEffectiveCardPaymentDate(c,bm));
    }
  }
  const all=acfPlansWithScenario(plans,scenario),includePlan=p=>p?.status==='planned'&&((p.id==='scenario')||(p.priority==='required'&&settings.includeRequiredLargeExpenses!==false));
  for(const p of all.filter(p=>includePlan(p)&&p.date>=start&&p.date<=visibleEnd)){
    for(const part of largeExpensePendingParts(p)){
      if(part.paymentMethod!=='card')continue;
      const c=cardById(part.paymentId);if(!c)continue;
      const bm=cardBillingMonthForPurchase(c,p.date);consider(acfEffectiveCardPaymentDate(c,bm)||nextCardDueDate(c,p.date));
    }
  }
  return lastDue
}
function addCashFlowEvent(map,date,patch){if(!date||!map.has(date))return;const e=map.get(date);for(const k of ['income','mandatoryOutflow','cardPayment','largeExpense','largeExpenseCash','fixedPayment'])e[k]+=Number(patch[k])||0;if(patch.label)e.events.push({label:patch.label,amount:Number(patch.amount)||0,type:patch.type||'info'});if(patch.salary)e.salary=true;if(patch.card)e.card=true;if(patch.large)e.large=true}
function buildAcfBaseContext(options={}){const scenario=options.scenario||null,settings={...acfDefaultSettings(),...(options.settings||{})},plans=acfPlansWithScenario(options.largeExpensePlans||data.largeExpensePlans,scenario),start=options.startDate||ymd(),end=options.horizonEnd||acfHorizonEnd({start,settings,plans,scenario:null}),dates=dateRange(start,end,370),events=new Map(dates.map(d=>[d,{income:0,mandatoryOutflow:0,cardPayment:0,largeExpense:0,largeExpenseCash:0,fixedPayment:0,events:[],salary:false,card:false,large:false}]));
  for(const r of data.salaryRecords){if(!r.date||r.date<start||r.date>end)continue;const inc=data.incomes.find(x=>x.salaryRecordId===r.id),received=r.status==='入金済'||inc?.bankApplied||inc?.bankReconciled;if(!received)addCashFlowEvent(events,r.date,{income:r.gross,label:`${employerById(r.employerId)?.name||'給与'} 給与`,amount:r.gross,type:'income',salary:true})}
  for(const t of data.tempIncomes){if(!t.date||t.date<start||t.date>end)continue;const inc=linkedIncomeForTemp(t);if(inc?.bankApplied||inc?.bankReconciled)continue;addCashFlowEvent(events,t.date,{income:t.amount,label:t.sourceName||'臨時収入',amount:t.amount,type:'income'})}
  for(const x of data.incomes){if(!x.date||x.date<start||x.date>end||x.salaryRecordId||x.tempIncomeId||x.bankApplied||x.bankReconciled)continue;addCashFlowEvent(events,x.date,{income:x.amount,label:x.sourceName||'予定収入',amount:x.amount,type:'income'})}
  for(const t of data.transactions){if(!t.date||t.date<=start||t.date>end||t.paymentMethod==='card'||t.bankApplied||t.bankReconciled)continue;addCashFlowEvent(events,t.date,{mandatoryOutflow:t.amount,label:t.merchant||'予定支出',amount:-Number(t.amount||0),type:'outflow'})}
  for(const f of data.fixedPayments){for(const date of dates){if(!fixedDueOn(f,date)||(f.skippedDates||[]).includes(date))continue;if(data.transactions.some(t=>t.source==='fixed'&&t.fixedId===f.id&&t.date===date))continue;if(f.paymentMethod==='card')continue;addCashFlowEvent(events,date,{mandatoryOutflow:f.amount,fixedPayment:f.amount,label:f.name||'固定支払い',amount:-Number(f.amount||0),type:'fixed'})}}
  const cardExtras=new Map(),addCardExtra=(cardId,bm,amount,label,purchaseDate)=>{if(!cardId||!amount)return;const key=`${cardId}|${bm}`;if(!cardExtras.has(key))cardExtras.set(key,{amount:0,labels:[]});const x=cardExtras.get(key);x.amount+=Number(amount)||0;x.labels.push({label,amount:Number(amount)||0,purchaseDate})};
  for(const f of data.fixedPayments){if(f.paymentMethod!=='card'||!f.paymentId)continue;for(const date of dates){if(!fixedDueOn(f,date)||(f.skippedDates||[]).includes(date)||data.transactions.some(t=>t.source==='fixed'&&t.fixedId===f.id&&t.date===date))continue;const c=cardById(f.paymentId),bm=cardBillingMonthForPurchase(c,date);addCardExtra(f.paymentId,bm,f.amount,f.name||'固定支払い',date)}}
  for(const p of plans){const includePlan=p.id==='scenario'||(p.priority==='required'&&settings.includeRequiredLargeExpenses!==false)||(p.priority==='optional'&&options.includeOptional===true);if(p.status!=='planned'||!includePlan||!p.date||p.date<start||p.date>end)continue;for(const part of largeExpensePendingParts(p)){const amount=mm3AtfBirthdayAmount(part,p);if(amount<=0)continue;addCashFlowEvent(events,p.date,{largeExpense:amount,label:part.paymentMethod==='card'?`${p.name||'大型支出'}（カード利用 ${yen(amount)}）`:(p.name||'大型支出'),amount:part.paymentMethod==='card'?0:-amount,type:'large',large:true});if(part.paymentMethod==='card'){const c=cardById(part.paymentId);if(!c)continue;const bm=cardBillingMonthForPurchase(c,p.date),count=Math.max(1,Math.min(6,Number(p.atfInstallments?.[part.paymentId])||1)),fee=Math.max(0,Number(p.id==='large_seed_birthday'?mm3AtfOptions().birthdayFee:p.atfFee)||0);for(let i=0;i<count;i++){const bill=addMonths(bm,i),share=Math.floor(amount/count)+(i<amount%count?1:0)+(i===0&&(p.id!=='large_seed_birthday'||part.paymentId==='card_seed_smbc')?fee:0);addCardExtra(part.paymentId,bill,share,p.name||'大型支出',p.date)}}else addCashFlowEvent(events,p.date,{mandatoryOutflow:amount,largeExpenseCash:amount})}}
  const startMonth=start.slice(0,7),endMonth=end.slice(0,7),[sy,sm]=startMonth.split('-').map(Number),[ey,em]=endMonth.split('-').map(Number),span=(ey-sy)*12+(em-sm),cardBaseByKey=new Map();for(const c of data.cards){for(let i=-2;i<=span+2;i++){const bm=addMonths(startMonth,i),extra=cardExtras.get(`${c.id}|${bm}`)?.amount||0,base=acfCardBillingAmount(c.id,bm),adj=cardAdjustmentInfo(c.id,bm),status=cardStatementStatus(c.id,bm),amount=(status==='paid'?0:base)+extra;cardBaseByKey.set(`${c.id}|${bm}`,amount);if(amount<=0)continue;const due=adj?.paymentDateOverride||cardPaymentDateForBillingMonth(c,bm);if(!due){if(extra>0)addCashFlowEvent(events,end,{mandatoryOutflow:amount,cardPayment:amount,label:`${c.name} 支払い（支払日未設定）`,amount:-amount,type:'card',card:true});continue}if(due<start||due>end)continue;addCashFlowEvent(events,due,{mandatoryOutflow:amount,cardPayment:amount,label:`${c.name} 支払い`,amount:-amount,type:'card',card:true})}}
  const reserve=Math.max(0,Number(settings.reserveFloor)||0),baseRows=[];let mandatoryBalance=totalDeposits();for(const date of dates){const e=events.get(date),opening=mandatoryBalance;mandatoryBalance+=e.income-e.mandatoryOutflow;baseRows.push({date,openingBalance:opening,...e,mandatoryBalance})}let minFuture=Infinity;for(let i=baseRows.length-1;i>=0;i--){minFuture=Math.min(minFuture,baseRows[i].mandatoryBalance);baseRows[i].maxSpendCash=Math.max(0,Math.floor(minFuture-reserve));baseRows[i].minMandatoryFromHere=minFuture}return{scenario,settings,plans,start,end,dates,events,cardExtras,cardBaseByKey,reserve,baseRows,openingBalance:baseRows[0]?.openingBalance??totalDeposits(),configuredCards:acfConfiguredCards(settings),budgetEnd:options.budgetEnd||(end<acfVisibleEnd(start)?end:acfVisibleEnd(start))}}
function acfCardExposureAtDate(card,date,ctx,extraUsage=new Map()){
  if(!card||!ctx)return 0;let used=0;const prefix=`${card.id}|`;
  for(const [k] of ctx.cardBaseByKey||[]){
    if(!String(k).startsWith(prefix))continue;const bm=String(k).slice(prefix.length),due=acfEffectiveCardPaymentDate(card,bm);if(due&&due<date)continue;
    const status=cardStatementStatus(card.id,bm);let actual=0;
    if(status!=='paid'){
      const adj=cardAdjustmentInfo(card.id,bm);
      if(adj)actual=Math.max(0,Number(acfCardBillingAmount(card.id,bm))||0);
      else actual=Math.max(0,sum(cardTransactionsForBillingCycle(card.id,bm).filter(t=>!t.date||t.date<=date),t=>Number(t.amount)||0));
    }
    let planned=0;const ex=ctx.cardExtras?.get(`${card.id}|${bm}`);
    if(ex)planned=sum(ex.labels||[],x=>(!x.purchaseDate||x.purchaseDate<=date)?Math.max(0,Number(x.amount)||0):0);
    used+=actual+planned;
  }
  for(const [k,v] of extraUsage||[]){if(!String(k).startsWith(prefix))continue;const bm=String(k).slice(prefix.length),due=acfEffectiveCardPaymentDate(card,bm);if(due&&due<date)continue;used+=Math.max(0,Number(v)||0)}
  return Math.max(0,used)
}
function acfEligibleCardBuckets(date,ctx,extraUsage=new Map(),settings=ctx?.settings||acfDefaultSettings()){
  if(settings.creditFallbackEnabled===false||Number(settings.creditAggressiveness)<=0||!acfHasAnyCreditUsePlace(settings))return[];const rows=[];
  for(const c of ctx.configuredCards){
    const bm=cardBillingMonthForPurchase(c,date),due=acfEffectiveCardPaymentDate(c,bm);if(!due||due<date||due>ctx.end)continue;const key=`${c.id}|${bm}`;
    const used=acfCardExposureAtDate(c,date,ctx,extraUsage),available=Math.max(0,Math.floor((Number(c.limit)||0)-used));
    if(available>0)rows.push({card:c,billingMonth:bm,due,key,available,outstanding:used})
  }
  return rows.sort((a,b)=>{const ap=a.card.id===settings.preferredCardId?1:0,bp=b.card.id===settings.preferredCardId?1:0;return bp-ap||String(b.due).localeCompare(String(a.due))||b.available-a.available})
}
function acfProjectedMinBalance(ctx,index,balanceAfterDate,creditDue,fromDate){let balance=balanceAfterDate,min=ctx.dates[index]>=fromDate?balance:Infinity;for(let j=index+1;j<ctx.baseRows.length;j++){const base=ctx.baseRows[j];balance+=base.income-base.mandatoryOutflow-(creditDue.get(base.date)||0);if(base.date>=fromDate)min=Math.min(min,balance)}return Number.isFinite(min)?min:balanceAfterDate}
function acfSimulateFlexiblePlan(planByDate,ctx,settings){
  const allocation=acfAllocateFlexiblePlan(planByDate,ctx,settings),rows=[];
  let balance=ctx.openingBalance,minBalance=Infinity,minDate=ctx.start,totalShortage=0;
  for(const base of ctx.baseRows){
    const a=allocation.allocations.get(base.date)||{requested:0,total:0,cash:0,credit:0,shortage:0,cardParts:[],freeCashBefore:0,cardDailyRemaining:0,mode:'現金'},extraCardDue=allocation.creditDue.get(base.date)||0,opening=balance;
    balance+=base.income-base.mandatoryOutflow-extraCardDue-a.cash;
    const headroom=balance-ctx.reserve,status=headroom<0?'short':headroom<5000?'watch':'safe';
    if(balance<minBalance){
      minBalance=balance;
      minDate=base.date
    }totalShortage+=a.shortage||0;
    rows.push({...base,openingBalance:opening,flexibleCash:a.cash,flexibleCredit:a.credit,flexibleTotal:a.total,requestedFlexible:a.requested,flexibleShortage:a.shortage,flexibleCardDue:extraCardDue,forecastBalance:balance,reserveFloor:ctx.reserve,headroom,status,cardParts:a.cardParts,freeCashBefore:a.freeCashBefore,cardDailyRemaining:a.cardDailyRemaining,paymentMode:a.mode,totalCardPayment:(Number(base.cardPayment)||0)+extraCardDue,important:base.date===ctx.start||base.date===ctx.budgetEnd||base.income>0||base.mandatoryOutflow>0||base.largeExpense>0||extraCardDue>0||headroom<0||a.credit>0||a.shortage>0})
  }return{feasible:minBalance>=ctx.reserve&&totalShortage<=0,rows,minBalance,minDate,totalShortage,allocation}
}
function acfWeightedPlanForScale(ctx,settings,scale){const weights=settings.useWeekdayWeights?weekdaySpendingWeights(ctx.start.slice(0,7),8).weights:Array(7).fill(1),plan={};for(const date of ctx.dates){if(date>ctx.budgetEnd)continue;plan[date]=Math.max(0,Math.floor((weights[parseYmd(date).getDay()]*(Number(scale)||0))/100)*100)}return plan}
function acfBuildOptimizedFlexiblePlan(ctx,settings){if(ctx.baseRows.some(r=>r.mandatoryBalance<ctx.reserve))return acfSimulateFlexiblePlan({},ctx,settings);let lo=0,hi=1000;while(hi<2000000&&acfSimulateFlexiblePlan(acfWeightedPlanForScale(ctx,settings,hi),ctx,settings).feasible)hi*=2;for(let i=0;i<24;i++){const mid=(lo+hi)/2,test=acfSimulateFlexiblePlan(acfWeightedPlanForScale(ctx,settings,mid),ctx,settings);if(test.feasible)lo=mid;else hi=mid}return acfSimulateFlexiblePlan(acfWeightedPlanForScale(ctx,settings,lo),ctx,settings)}

function simulateCombinedSpendCore(date,ctx,settings=ctx?.settings||acfDefaultSettings()){
  if(!ctx||date>ctx.budgetEnd)return{maxTotal:0,cash:0,credit:0,cardParts:[],plusOneSafe:false};
  const base=ctx.baseRows.find(r=>r.date===date),cashCeiling=Math.max(0,Number(base?.maxSpendCash)||0),cardCeiling=sum(ctx.configuredCards,c=>Number(c.limit)||0),dailyLimit=Math.max(0,Number(settings.creditDailyLimit)||0);
  let lo=0,hi=Math.max(1,Math.floor(cashCeiling+Math.min(cardCeiling,dailyLimit)+1));
  const feasible=amount=>acfSimulateFlexiblePlan({[date]:amount},ctx,settings).feasible;
  while(hi<100000000&&feasible(hi))hi*=2;
  for(let i=0;i<28&&lo+1<hi;i++){
    const mid=Math.floor((lo+hi)/2);
    if(feasible(mid))lo=mid;
    else hi=mid
  }const sim=acfSimulateFlexiblePlan({[date]:lo},ctx,settings),row=sim.rows.find(r=>r.date===date)||{};
  return{maxTotal:lo,cash:Number(row.flexibleCash)||0,credit:Number(row.flexibleCredit)||0,cardParts:row.cardParts||[],plusOneSafe:feasible(lo+1)}
}




function acfPlanWithStoredGoals(ctx,optimizedSim){
  const basePlan={},fixedPlan={},storedDates=new Set();
  for(const r of optimizedSim.rows)if(r.date<=ctx.budgetEnd)basePlan[r.date]=Math.max(0,Math.floor(Number(r.flexibleTotal)||0));
  for(const date of ctx.dates){
    if(date>ctx.budgetEnd)continue;
    const month=date.slice(0,7),day=Number(date.slice(8,10)),raw=dayGoalForMonth(month,day);
    if(!(raw>0))continue;
    storedDates.add(date);
    fixedPlan[date]=date===ctx.start?Math.max(0,Math.floor(raw-spentDate(date))):Math.max(0,Math.floor(raw))
  }const makePlan=scale=>{
    const plan={};
    for(const date of ctx.dates){
      if(date>ctx.budgetEnd)continue;
      if(storedDates.has(date))plan[date]=fixedPlan[date];
      else{
        const v=Math.max(0,Number(basePlan[date])||0);
        plan[date]=Math.max(0,Math.floor(v*Math.max(0,Math.min(1,Number(scale)||0))/100)*100)
      }
    }return plan
  };
  return{hasStored:storedDates.size>0,storedDates,makePlan}
}
/**
 * Assemble an ACF forecast from already computed inputs. This function reads no
 * application state and leaves both the simulation and base context untouched.
 * The caller owns card eligibility, feasibility search, risk and confidence.
 * @param {{ctx:object,settings:object,sim:object,maximums:object[],combined:object,
 *   deposits:number,todayGoal:number,spentToday:number,monthEnd:string,
 *   explicit:boolean,storedPlanUsed:boolean,cardAllowedSummary:string}} input
 * @returns {object} The same field contract as the legacy forecast core, before diagnostics.
 */
