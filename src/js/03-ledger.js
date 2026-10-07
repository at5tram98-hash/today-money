function catByName(n){return data.categories.find(c=>c.name===n)||data.categories[data.categories.length-1]||CATEGORY_DEFAULTS[8]}
function catIcon(n){const c=catByName(n);return icon(normalizeCategoryIcon(c?.icon,c?.id))}
function txForDate(date){return data.transactions.filter(x=>x.date===date)}
function txForMonth(month){return data.transactions.filter(x=>String(x.date).slice(0,7)===month)}
function rawSpentDate(date){return sum(txForDate(date),x=>x.amount)}
function spentDate(date){return data.dailyCorrections[date]!=null?Number(data.dailyCorrections[date]):rawSpentDate(date)}
function rawSpentMonth(month){return sum(txForMonth(month),x=>x.amount)}
function spentMonth(month){return data.monthlyCorrections[month]!=null?Number(data.monthlyCorrections[month]):rawSpentMonth(month)}
function dailyGoal(date){const g=data.dailyGoals[date]||{};return {total:Number(g.total)||0,categories:g.categories||{}}}
function monthlyGoal(month){const g=data.monthlyGoals[month]||{};return {total:Number(g.total)||0,categories:g.categories||{},daily:g.daily||{}}}
function dailyCategorySpent(date,cat){return sum(txForDate(date).filter(x=>x.category===cat),x=>x.amount)}
function monthCategorySpent(month,cat){return sum(txForMonth(month).filter(x=>x.category===cat),x=>x.amount)}
function incomesForDate(date){return data.incomes.filter(x=>x.date===date)}
function incomesForMonth(month){return data.incomes.filter(x=>String(x.date).slice(0,7)===month)}
function bankById(id){return data.banks.find(x=>x.id===id)}function cardById(id){return data.cards.find(x=>x.id===id)}function debitById(id){return data.debitCards.find(x=>x.id===id)}function employerById(id){return data.employers.find(x=>x.id===id)}
function billingCycleForCard(card,targetMonth=ym()){const [y,m]=String(targetMonth).split('-').map(Number),last=new Date(y,m,0).getDate();if(!card||card.closingDay==null||String(card.closingDay)==='月末')return{start:`${targetMonth}-01`,end:`${targetMonth}-${pad(last)}`,label:monthLabel(targetMonth)};const requested=clamp(Number(card.closingDay)||last,1,31),close=Math.min(requested,last),prev=addMonths(targetMonth,-1),[py,pm]=prev.split('-').map(Number),prevLast=new Date(py,pm,0).getDate(),prevClose=Math.min(requested,prevLast),startDate=addDays(`${prev}-${pad(prevClose)}`,1),endDate=`${targetMonth}-${pad(close)}`;return{start:startDate,end:endDate,label:`${startDate.replaceAll('-','/')}〜${endDate.replaceAll('-','/')}`}}
function cardTransactionsForBillingCycle(cardId,month=assetBillingMonth){const c=cardById(cardId),cycle=billingCycleForCard(c,month);return data.transactions.filter(x=>x.paymentMethod==='card'&&x.paymentId===cardId&&x.date>=cycle.start&&x.date<=cycle.end)}
function cardBaseUsage(cardId,month=assetBillingMonth){return sum(cardTransactionsForBillingCycle(cardId,month),x=>x.amount)}
function cardAdjustmentInfo(cardId,month=assetBillingMonth){const a=data.cardAdjustments?.[`${month}|${cardId}`];if(!a||typeof a!=='object')return null;if(a.mode==='confirmed_total')return{...a,confirmedTotal:Number(a.confirmedTotal)||0,baseAtEdit:Number(a.baseAtEdit)||0,deltaAtEdit:Number(a.deltaAtEdit)||0};const base=Number(a.baseAtEdit)||0,confirmed=a.correctedTotal!=null?Number(a.correctedTotal):base+(Number(a.delta)||0);return{...a,mode:'confirmed_total',confirmedTotal:confirmed,baseAtEdit:base,deltaAtEdit:confirmed-base}}

function cardUsage(cardId,month=assetBillingMonth){const a=cardAdjustmentInfo(cardId,month);return a?a.confirmedTotal:cardBaseUsage(cardId,month)}
function cardNewUsageAfterConfirmation(cardId,month=assetBillingMonth){const a=cardAdjustmentInfo(cardId,month);if(!a)return 0;const ids=new Set(Array.isArray(a.confirmedTransactionIds)?a.confirmedTransactionIds:[]),confirmedThrough=/^\d{4}-\d{2}-\d{2}$/.test(String(a.confirmedThroughDate||''))?a.confirmedThroughDate:'',confirmedAt=Date.parse(a.confirmedAt||a.updatedAt||'');return sum(cardTransactionsForBillingCycle(cardId,month).filter(t=>{if(ids.has(t.id))return false;if(confirmedThrough&&String(t.date||'')<=confirmedThrough)return false;if(ids.size)return true;const created=Date.parse(t.createdAt||t.updatedAt||'');return Number.isFinite(confirmedAt)&&Number.isFinite(created)&&created>confirmedAt}),t=>t.amount)}

function debitUsage(debitId,month=assetBillingMonth){return sum(txForMonth(month).filter(x=>x.paymentMethod==='debit'&&x.paymentId===debitId),x=>x.amount)}
function paymentBankId(method,id){if(method==='bank')return id;if(method==='debit')return debitById(id)?.bankId||(bankById(id)?.id||'');return''}
function transactionBankId(t){return t?.linkedBankId||paymentBankId(t?.paymentMethod,t?.paymentId)||''}
function totalBankBalance(){return sum(data.banks,b=>b.balance)}
function totalDeposits(){return totalBankBalance()}

function salaryRecordEffectiveDate(record){const linked=linkedIncomeForSalary(record);return record?.status==='入金済'?(record?.actualReceivedDate||linked?.date||record?.date||''):(record?.date||'')}
function salaryRecordExpectedOrReceivedAmount(record){return salaryRecordDisplayStatus(record)==='入金済み'?salaryRecordCashAmount(record):Math.max(0,Number(record?.gross)||0)}
function salaryRecordsPayableInMonth(month=payViewMonth){return data.salaryRecords.filter(x=>String(salaryRecordEffectiveDate(x)||'').slice(0,7)===month)}


function linkedIncomeForTemp(temp){return data.incomes.find(x=>x.id===temp?.incomeId)||data.incomes.find(x=>x.tempIncomeId===temp?.id)}
function linkedIncomeForSalary(record){return data.incomes.find(x=>x.salaryRecordId===record?.id)}
function salaryRecordCashAmount(record){const linked=linkedIncomeForSalary(record),explicit=Number(record?.receivedAmount);if(Number.isFinite(explicit)&&explicit>0)return explicit;if(record?.status==='入金済'&&Number(linked?.amount)>0)return Number(linked.amount);return Math.max(0,Number(record?.gross)||0)}
function salaryRecordDisplayStatus(record,today=ymd()){if(record?.status==='入金済')return'入金済み';if(record?.date&&record.date<today)return'入金日を過ぎた未確認';return'入金予定'}
function salaryStatusClass(record,today=ymd()){const s=salaryRecordDisplayStatus(record,today);return s==='入金済み'?'good':s.includes('未確認')?'warn':''}
function salaryGroupDisplayStatus(records,today=ymd()){if(!records?.length)return'未登録';const statuses=records.map(r=>salaryRecordDisplayStatus(r,today));if(statuses.every(s=>s==='入金済み'))return'入金済み';if(statuses.some(s=>s.includes('未確認')))return'入金日を過ぎた未確認';if(statuses.some(s=>s==='入金済み'))return'一部入金済み';return'入金予定'}
function salaryGroupStatusClass(records,today=ymd()){const s=salaryGroupDisplayStatus(records,today);return s==='入金済み'?'good':s.includes('未確認')?'warn':s.includes('一部')?'info':''}
function tempIncomeDisplayStatus(temp,today=ymd()){const inc=linkedIncomeForTemp(temp);if(inc?.bankApplied||inc?.bankReconciled||inc?.receivedConfirmed)return'入金済み';if(temp?.receivedConfirmed)return'入金済み';if(temp?.date&&temp.date<today)return'入金日を過ぎた未確認';return'入金予定'}



function fixedDueOn(f,date){if(!f||!date)return false;const month=String(date).slice(0,7),day=Number(String(date).slice(8,10)),start=String(f.startMonth||month);if(month<start)return false;const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate(),due=Math.min(Math.max(1,Number(f.day)||1),last);if(day!==due)return false;if(f.frequency==='yearly')return m===(Number(f.annualMonth)||Number(start.slice(5,7))||1);if(f.frequency==='bimonthly'){const [sy,sm]=start.split('-').map(Number),diff=(y-sy)*12+(m-sm);return diff>=0&&diff%2===0}return true}
function fixedDueDatesInMonth(f,month){const days=daysInMonth(month),out=[];for(let d=1;d<=days;d++){const ds=`${month}-${pad(d)}`;if(fixedDueOn(f,ds))out.push(ds)}return out}




function monthEndDate(month){return `${month}-${pad(daysInMonth(month))}`}
function dateRange(start,end,maxDays=370){const out=[];const safeMax=Math.max(1,Math.min(370,Math.floor(Number(maxDays)||370)));for(let d=start,i=0;d<=end&&i<safeMax;d=addDays(d,1),i++)out.push(d);return out}
function cardBillingMonthForPurchase(card,date){const month=String(date).slice(0,7),day=Number(String(date).slice(8,10));if(!card||card.closingDay==null)return month;if(String(card.closingDay)==='月末')return month;const [y,m]=month.split('-').map(Number),last=new Date(y,m,0).getDate(),close=Math.min(clamp(Number(card.closingDay)||last,1,31),last);return day<=close?month:addMonths(month,1)}
function cardPaymentDateForBillingMonth(card,billingMonth){if(!card||card.dueDay==null)return null;const closeRaw=card.closingDay,due=clamp(Number(card.dueDay)||1,1,31);let payMonth=billingMonth;if(String(closeRaw)==='月末')payMonth=addMonths(billingMonth,1);else if(closeRaw!=null){const [y,m]=billingMonth.split('-').map(Number),last=new Date(y,m,0).getDate(),close=Math.min(clamp(Number(closeRaw)||last,1,31),last);if(due<=close)payMonth=addMonths(billingMonth,1)}const [py,pm]=payMonth.split('-').map(Number),last=new Date(py,pm,0).getDate();return `${payMonth}-${pad(Math.min(due,last))}`}
function cardStatementStatus(cardId,billingMonth){const a=cardAdjustmentInfo(cardId,billingMonth);return ['estimated','confirmed','paid'].includes(a?.status)?a.status:(a?'confirmed':'estimated')}
function cardStatementStatusLabel(status){return status==='paid'?'支払済み':status==='confirmed'?'確定':'見込み'}
function billingMonthForPaymentMonth(card,paymentMonth){if(!card)return paymentMonth;for(let i=-2;i<=1;i++){const bm=addMonths(paymentMonth,i),due=cardPaymentDateForBillingMonth(card,bm);if(due&&due.slice(0,7)===paymentMonth)return bm}return paymentMonth}
function billingMonthForPaymentDate(card,date){
  const paymentMonth=String(date||'').slice(0,7)||ym();if(!card)return paymentMonth;
  const exact=[];for(const [key,raw] of Object.entries(data.cardAdjustments||{})){const [bm,cid]=key.split('|');if(cid!==card.id)continue;const a=cardAdjustmentInfo(card.id,bm);if(a?.paymentDateOverride===date)exact.push(bm)}
  if(exact.length===1)return exact[0];if(exact.length>1)return exact.sort()[0];
  for(let i=-2;i<=1;i++){const bm=addMonths(paymentMonth,i),due=cardPaymentDateForBillingMonth(card,bm);if(due===date)return bm}
  return billingMonthForPaymentMonth(card,paymentMonth)
}
function cardStatementItem(card,billingMonth,paymentMonth){
  const adj=cardAdjustmentInfo(card.id,billingMonth),paymentDate=adj?.paymentDateOverride||cardPaymentDateForBillingMonth(card,billingMonth)||'';
  return{cardId:card.id,card,cardName:card.name,billingMonth,paymentMonth,paymentDate,amount:acfCardBillingAmount(card.id,billingMonth),status:cardStatementStatus(card.id,billingMonth),base:cardBaseUsage(card.id,billingMonth),adjustment:adj,newUse:cardNewUsageAfterConfirmation(card.id,billingMonth)}
}
function cardStatementsForPaymentMonth(cardId,paymentMonth=assetBillingMonth){
  const card=cardById(cardId);if(!card)return[];
  const candidates=new Set([billingMonthForPaymentMonth(card,paymentMonth)]);for(let i=-12;i<=2;i++)candidates.add(addMonths(paymentMonth,i));
  for(const key of Object.keys(data.cardAdjustments||{})){const [bm,cid]=key.split('|');if(cid===cardId)candidates.add(bm)}
  const out=[];for(const bm of candidates){const item=cardStatementItem(card,bm,paymentMonth);if(!item.paymentDate||item.paymentDate.slice(0,7)!==paymentMonth)continue;out.push(item)}
  return out.sort((a,b)=>String(a.paymentDate).localeCompare(String(b.paymentDate))||String(a.billingMonth).localeCompare(String(b.billingMonth)))
}
function cardStatementForPaymentMonth(cardId,paymentMonth=assetBillingMonth){
  const card=cardById(cardId);if(!card)return null;const items=cardStatementsForPaymentMonth(cardId,paymentMonth),positive=items.find(x=>Number(x.amount)>0);if(positive)return positive;if(items.length)return items[0];
  const bm=billingMonthForPaymentMonth(card,paymentMonth);return cardStatementItem(card,bm,paymentMonth)
}
function cardStatementExact(cardId,billingMonth,paymentMonth=''){const c=cardById(cardId);if(!c||!billingMonth)return null;const st=cardStatementItem(c,billingMonth,paymentMonth||String(acfEffectiveCardPaymentDate(c,billingMonth)||'').slice(0,7));return st}
function cardStatementsAggregate(cardId,paymentMonth=assetBillingMonth){const items=cardStatementsForPaymentMonth(cardId,paymentMonth),amount=sum(items,x=>Number(x.amount)||0),unpaid=items.filter(x=>x.status!=='paid'),status=items.length&&items.every(x=>x.status==='paid')?'paid':items.some(x=>x.status==='confirmed')?'confirmed':'estimated',next=(unpaid.length?unpaid:items).slice().sort((a,b)=>String(a.paymentDate||'9999').localeCompare(String(b.paymentDate||'9999')))[0]||null;return{items,amount,status,next,count:items.length}}
function cardPaymentStatementsInMonth(paymentMonth,{includePaid=false}={}){
  const out=[];for(const c of data.cards){const exact=cardStatementsForPaymentMonth(c.id,paymentMonth),items=exact.length?exact:[cardStatementForPaymentMonth(c.id,paymentMonth)];for(const st of items){if(!st||!(st.amount>0)||(!includePaid&&st.status==='paid'))continue;out.push(st)}}
  return out.sort((a,b)=>String(a.paymentDate||'9999').localeCompare(String(b.paymentDate||'9999'))||String(a.cardName).localeCompare(String(b.cardName),'ja')||String(a.billingMonth).localeCompare(String(b.billingMonth)))
}

function cardStatementBankHandling(cardId,billingMonth){const a=cardAdjustmentInfo(cardId,billingMonth),c=cardById(cardId),bankId=a?.bankIdAtPayment||c?.bankId||'',bank=bankById(bankId);if(a?.status!=='paid')return{mode:'none',label:'未払い',bankId,bank};if(a?.bankApplied)return{mode:'apply',label:bank?`${bank.name}の残高へ反映済み`:'口座残高へ反映済み',bankId,bank};if(a?.bankReconciled)return{mode:'reconciled',label:bank?`${bank.name}の現在残高に反映済み扱い`:'現在残高に反映済み扱い',bankId,bank};return{mode:'none',label:bank?'口座残高は未反映':'引落口座未設定・残高未反映',bankId,bank}}
function cardBankEffectWithinBaseline(bankId,paymentDate,effectAt=''){if(!bankId||!paymentDate)return false;return bankEffectWithinBaseline(bankId,{date:paymentDate,createdAt:effectAt||new Date().toISOString()},{respectBalanceAsOf:true,eventAt:`${paymentDate}T23:59:59`})}
function reverseCardStatementBankEffect(cardId,billingMonth,adj=null){requireStateCommit('reverseCardStatementBankEffect');const a=adj||cardAdjustmentInfo(cardId,billingMonth);if(!a?.bankApplied)return false;const bankId=a.bankIdAtPayment||cardById(cardId)?.bankId||'',b=bankById(bankId);if(!b){a.bankApplied=false;return false}if(b.balanceAsOf&&a.bankEffectAt&&Date.parse(a.bankEffectAt)<=Date.parse(b.balanceAsOf)){a.bankApplied=false;a.bankReconciled=true;return false}updateBank(bankId,Math.max(0,Number(a.paidAmount??a.confirmedTotal)||0),`${cardById(cardId)?.name||'カード'}支払い・取消`);a.bankApplied=false;a.bankReconciled=false;return true}
function setCardStatement(cardId,billingMonth,amount,{paymentDate='',status='confirmed',memo='手動請求額',balanceMode='keep'}={}){requireStateCommit('setCardStatement');const card=requireFinancialEntity('card',cardId),base=cardBaseUsage(cardId,billingMonth),prev=cardAdjustmentInfo(cardId,billingMonth)||{},oldDisplayed=acfCardBillingAmount(cardId,billingMonth),cycleIds=cardTransactionsForBillingCycle(cardId,billingMonth).map(t=>t.id),nextStatus=['estimated','confirmed','paid'].includes(status)?status:'confirmed',nextAmount=Math.max(0,Number(amount)||0),now=new Date().toISOString(),payDate=/^\d{4}-\d{2}-\d{2}$/.test(String(paymentDate||''))?paymentDate:'',wasPaid=prev.status==='paid',willPaid=nextStatus==='paid',oldPaidAmount=Math.max(0,Number(prev.paidAmount??oldDisplayed)||0);let bankApplied=!!prev.bankApplied,bankReconciled=!!prev.bankReconciled,bankEffectAt=prev.bankEffectAt||'',bankIdAtPayment=prev.bankIdAtPayment||card?.bankId||'',paidAmount=willPaid?nextAmount:0;if(wasPaid&&!willPaid){reverseCardStatementBankEffect(cardId,billingMonth,prev);bankApplied=false;bankReconciled=false;bankEffectAt='';bankIdAtPayment='';paidAmount=0}else if(wasPaid&&willPaid){if(bankApplied&&nextAmount!==oldPaidAmount&&bankIdAtPayment){const b=bankById(bankIdAtPayment);if(b?.balanceAsOf&&bankEffectAt&&Date.parse(bankEffectAt)<=Date.parse(b.balanceAsOf)){bankApplied=false;bankReconciled=true}else updateBank(bankIdAtPayment,-(nextAmount-oldPaidAmount),`${card?.name||'カード'}支払額修正`)}if(balanceMode==='reconciled'&&bankApplied){bankReconciled=false}else if(balanceMode==='none'&&!bankApplied){bankReconciled=false}}else if(!wasPaid&&willPaid){bankIdAtPayment=card?.bankId||'';if(balanceMode==='apply'&&bankIdAtPayment){if(cardBankEffectWithinBaseline(bankIdAtPayment,payDate||cardPaymentDateForBillingMonth(card,billingMonth)||'',now)){bankApplied=false;bankReconciled=true}else{updateBank(bankIdAtPayment,-nextAmount,`${card?.name||'カード'}支払い`);bankApplied=true;bankReconciled=false;bankEffectAt=now}}else if(balanceMode==='reconciled'){bankApplied=false;bankReconciled=true;bankEffectAt=now}else{bankApplied=false;bankReconciled=false;bankEffectAt=''}}const next={...prev,mode:'confirmed_total',confirmedTotal:nextAmount,baseAtEdit:base,deltaAtEdit:nextAmount-base,confirmedTransactionIds:nextStatus==='estimated'?(prev.confirmedTransactionIds||[]):cycleIds,confirmedAt:nextStatus==='estimated'?(prev.confirmedAt||''):(prev.confirmedAt||now),confirmedThroughDate:nextStatus==='estimated'?(prev.confirmedThroughDate||''):billingCycleForCard(card,billingMonth).end,updatedAt:now,memo,status:nextStatus,paymentDateOverride:payDate,paidAt:willPaid?(prev.paidAt||now):'',paidAmount,bankApplied,bankReconciled,bankEffectAt,bankIdAtPayment};data.cardAdjustments[`${billingMonth}|${cardId}`]=next;return next}
function markCardStatementPaid(cardId,billingMonth,paid=true,{balanceMode='keep'}={}){requireStateCommit('markCardStatementPaid');const a=cardAdjustmentInfo(cardId,billingMonth),amount=acfCardBillingAmount(cardId,billingMonth),card=cardById(cardId),payDate=a?.paymentDateOverride||cardPaymentDateForBillingMonth(card,billingMonth)||ymd();return setCardStatement(cardId,billingMonth,amount,{paymentDate:payDate,status:paid?'paid':'confirmed',memo:a?.memo||'支払い状況を更新',balanceMode})}

function nextCardDueDate(card,from=ymd()){if(!card)return null;let best='';for(const [key] of Object.entries(data.cardAdjustments||{})){const [bm,cid]=key.split('|');if(cid!==card.id)continue;const d=acfEffectiveCardPaymentDate(card,bm);if(d&&d>=from&&(!best||d<best))best=d}if(card.dueDay!=null){const base=String(from).slice(0,7);for(let i=-1;i<=3;i++){const bm=addMonths(base,i),d=acfEffectiveCardPaymentDate(card,bm);if(d&&d>=from&&(!best||d<best))best=d}}return best||null}
function largeExpenseParts(plan){const splits=Array.isArray(plan?.splits)?plan.splits.filter(s=>Number(s.amount)>0):[];return splits.length?splits:[{paymentMethod:plan?.paymentMethod||'other',paymentId:plan?.paymentId||'',linkedBankId:plan?.linkedBankId||'',amount:Number(plan?.amount)||0}]}
function largeExpensePartTransaction(plan,part,index=0){if(!plan||!part)return null;const ids=Array.isArray(plan.linkedTransactionIds)?plan.linkedTransactionIds:[];if(ids[index]){const t=data.transactions.find(x=>x.id===ids[index]);if(t)return t}if(index===0&&plan.linkedTransactionId){const t=data.transactions.find(x=>x.id===plan.linkedTransactionId);if(t)return t}const direct=data.transactions.find(t=>t.largePlanId===plan.id&&(t.largePlanPartIndex==null||Number(t.largePlanPartIndex)===index));if(direct)return direct;const key=normalizeMerchantKey(plan.name||'');return data.transactions.find(t=>String(t.date||'')===String(plan.date||'')&&Math.abs(Math.abs(Number(t.amount)||0)-Math.abs(Number(part.amount)||0))<1&&t.paymentMethod===part.paymentMethod&&String(t.paymentId||'')===String(part.paymentId||'')&&key&&normalizeMerchantKey(t.merchant||'')===key)||null}
function largeExpensePendingParts(plan){return largeExpenseParts(plan).map((part,index)=>({...part,_index:index,_recorded:largeExpensePartTransaction(plan,part,index)})).filter(x=>!x._recorded)}



function acfCardBillingAmount(cardId,month){return Math.max(0,cardUsage(cardId,month)+cardNewUsageAfterConfirmation(cardId,month))}

function getSalaryPaymentEvents(start,end,records=data.salaryRecords){return (records||[]).map(r=>({...r,_eventDate:salaryRecordEffectiveDate(r)})).filter(r=>r._eventDate&&r._eventDate>=start&&r._eventDate<=end).map(r=>({date:r._eventDate,recordId:r.id,employerId:r.employerId,employerName:employerById(r.employerId)?.name||'給与',workMonth:r.month||'',amount:salaryRecordExpectedOrReceivedAmount(r),status:salaryRecordDisplayStatus(r)})).sort((a,b)=>a.date.localeCompare(b.date))}
function getCardPaymentEvents(start,end){const out=[],startMonth=String(start).slice(0,7),endMonth=String(end).slice(0,7),[sy,sm]=startMonth.split('-').map(Number),[ey,em]=endMonth.split('-').map(Number),span=Math.max(0,(ey-sy)*12+(em-sm));for(let i=0;i<=span;i++){const paymentMonth=addMonths(startMonth,i);for(const st of cardPaymentStatementsInMonth(paymentMonth)){if(!st.paymentDate||st.paymentDate<start||st.paymentDate>end)continue;out.push({date:st.paymentDate,cardId:st.cardId,cardName:st.cardName,billingMonth:st.billingMonth,paymentMonth,amount:st.amount,status:st.status})}}return out.sort((a,b)=>a.date.localeCompare(b.date)||a.cardName.localeCompare(b.cardName,'ja'))}
function buildMonthFinancialMarkers(month,{largeExpensePlans=data.largeExpensePlans}={}){
  const start=`${month}-01`,end=monthEndDate(month),map=new Map();
  const get=date=>{
    if(!map.has(date))map.set(date,{salaryAmount:0,salaries:[],cardPaymentAmount:0,cardPayments:[],fixed:false,fixedPayments:[],large:false,largePlans:[]});
    return map.get(date)
  };
  for(const e of getSalaryPaymentEvents(start,end)){
    const x=get(e.date);
    x.salaryAmount+=e.amount;
    x.salaries.push(e)
  }for(const e of getCardPaymentEvents(start,end)){
    const x=get(e.date);
    x.cardPaymentAmount+=e.amount;
    x.cardPayments.push(e)
  }for(const f of data.fixedPayments){
    for(const date of fixedDueDatesInMonth(f,month)){
      if((f.skippedDates||[]).includes(date))continue;
      const x=get(date);
      x.fixed=true;
      x.fixedPayments.push({id:f.id,name:f.name,amount:Number(f.amount)||0,paymentMethod:f.paymentMethod,paymentId:f.paymentId})
    }
  }for(const p of (largeExpensePlans||[])){
    if(p.status!=='planned'||String(p.date||'').slice(0,7)!==month)continue;
    const x=get(p.date);
    x.large=true;
    x.largePlans.push(p)
  }return map
}
function nextFinancialEvent(from=ymd(),days=90){
  const end=addDays(from,days),events=[];
  for(const e of getSalaryPaymentEvents(from,end))events.push({date:e.date,type:'income',title:`${e.employerName}給与`,amount:e.amount,detail:`${Number((e.workMonth||'').slice(5,7))||''}月勤務分`});
  const startMonth=from.slice(0,7),endMonth=end.slice(0,7),[sy,sm]=startMonth.split('-').map(Number),[ey,em]=endMonth.split('-').map(Number),span=Math.max(0,(ey-sy)*12+(em-sm));
  for(let i=0;i<=span;i++){
    const pm=addMonths(startMonth,i);
    for(const st of mm3PaymentCardItems(pm)){
      const amount=Number(st.outstandingAmount??st.amount)||0;
      if(amount<=0||!st.paymentDate||st.paymentDate<from||st.paymentDate>end)continue;
      events.push({date:st.paymentDate,type:'card',title:`${st.cardName}支払`,amount:-amount,detail:`${monthLabel(st.billingMonth)}対象${st.plannedAmount?`・予定含む`:''}`})
    }
  }for(const f of data.fixedPayments){
    if(f.paymentMethod==='card')continue;
    for(const d of dateRange(from,end,days+2)){
      if(fixedDueOn(f,d)&&!(f.skippedDates||[]).includes(d)&&!data.transactions.some(t=>t.source==='fixed'&&t.fixedId===f.id&&t.date===d))events.push({date:d,type:'fixed',title:f.name||'固定支払い',amount:-Number(f.amount||0),detail:'固定支払い'})
    }
  }for(const p of data.largeExpensePlans){
    if(p.status!=='planned'||p.priority!=='required'||p.date<from||p.date>end)continue;
    for(const part of largeExpensePendingParts(p)){
      if(part.paymentMethod==='card')continue;
      events.push({date:p.date,type:'large',title:p.name||'大型支出',amount:-Number(part.amount||0),detail:`必須・${largeExpensePaymentLabel({...p,splits:[part],paymentMethod:part.paymentMethod,paymentId:part.paymentId})}`})
    }
  }events.sort((a,b)=>a.date.localeCompare(b.date)||({income:0,card:1,fixed:2,large:3}[a.type]-({income:0,card:1,fixed:2,large:3}[b.type])));
  return events[0]||null
}
function nextFinancialEventHtml(){const e=nextFinancialEvent();if(!e)return'';const diff=Math.max(0,Math.round((parseYmd(e.date)-parseYmd(ymd()))/86400000)),symbol=e.type==='income'?'¥':e.type==='card'?'$':e.type==='large'?'●':'•';return `<button type="button" class="financial-event-card" id="nextMoneyEvent" data-date="${e.date}"><span class="financial-event-symbol ${e.type}">${symbol}</span><span class="financial-event-main"><span class="financial-event-title">次の動き　${esc(e.title)}</span><span class="financial-event-sub">${diff===0?'今日':`あと${diff}日`}・${Number(e.date.slice(5,7))}/${Number(e.date.slice(8,10))}${e.detail?`・${esc(e.detail)}`:''}</span></span><span class="financial-event-value ${e.amount<0?'red':e.amount>0?'green':''}">${e.amount?`${e.amount>0?'+':''}${yen(e.amount)}`:'予定'}</span></button>`}
/* ACF: daily spending capacity. The ATF scenario calculator is separate below. */
