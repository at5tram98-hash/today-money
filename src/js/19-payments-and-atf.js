/* === My Money 3.0 Phase 2: Payments + ATF === */
let mm3PaymentAtfState=null;

function acfPlannedCardExtrasForPaymentMonth(paymentMonth){
  const map=new Map(),add=(cardId,billingMonth,paymentDate,amount,label,sourceId)=>{amount=Math.max(0,Number(amount)||0);if(!cardId||!billingMonth||!paymentDate||paymentDate.slice(0,7)!==paymentMonth||amount<=0)return;const key=`${cardId}|${billingMonth}|${paymentDate}`,card=cardById(cardId);if(!card)return;if(!map.has(key))map.set(key,{cardId,card,cardName:card.name,billingMonth,paymentMonth,paymentDate,amount:0,labels:[],sourceIds:[],planned:true,status:'estimated'});const row=map.get(key);row.amount+=amount;if(label)row.labels.push(label);if(sourceId)row.sourceIds.push(sourceId)};
  const scanStart=addMonths(paymentMonth,-12),scanEnd=paymentMonth;for(const f of data.fixedPayments||[]){if(f.paymentMethod!=='card'||!f.paymentId)continue;const c=cardById(f.paymentId);if(!c)continue;for(let m=scanStart;m<=scanEnd;m=addMonths(m,1))for(const date of fixedDueDatesInMonth(f,m)){if((f.skippedDates||[]).includes(date))continue;if(data.transactions.some(t=>t.source==='fixed'&&t.fixedId===f.id&&t.date===date))continue;const bm=cardBillingMonthForPurchase(c,date),due=acfEffectiveCardPaymentDate(c,bm);add(c.id,bm,due,f.amount,f.name||'固定支払い',f.id)}}
  for(const p of data.largeExpensePlans||[]){if(p.status!=='planned'||p.priority!=='required'||!p.date)continue;for(const part of largeExpensePendingParts(p)){if(part.paymentMethod!=='card'||!part.paymentId||!(Number(part.amount)>0))continue;const c=cardById(part.paymentId);if(!c)continue;const bm=cardBillingMonthForPurchase(c,p.date),amount=mm3AtfBirthdayAmount(part,p),count=Math.max(1,Math.min(6,Number(p.atfInstallments?.[part.paymentId])||1));for(let i=0;i<count;i++){const bill=addMonths(bm,i),due=acfEffectiveCardPaymentDate(c,bill)||nextCardDueDate(c,p.date);add(c.id,bill,due,Math.floor(amount/count)+(i<amount%count?1:0)+(i===0&&(p.id!=='large_seed_birthday'||part.paymentId==='card_seed_smbc')?Math.max(0,Number(p.id==='large_seed_birthday'?mm3AtfOptions().birthdayFee:p.atfFee)||0):0),p.name||'大型支出',p.id)}}}return[...map.values()].sort((a,b)=>String(a.paymentDate).localeCompare(String(b.paymentDate))||String(a.cardName).localeCompare(String(b.cardName),'ja'))
}
function mm3PaymentCardItems(month){
  const base=cardPaymentStatementsInMonth(month,{includePaid:true}).map(x=>({...x,plannedAmount:0,plannedLabels:[],outstandingAmount:x.status==='paid'?0:(Number(x.amount)||0)})),extras=acfPlannedCardExtrasForPaymentMonth(month),map=new Map();
  const key=x=>`${x.cardId}|${x.billingMonth}|${x.paymentDate||''}`;
  for(const st of base)map.set(key(st),st);
  for(const ex of extras){const k=key(ex),old=map.get(k);if(old){const baseStatus=old.baseStatus||old.status,baseAmount=Number(old.amount)||0;old.baseStatus=baseStatus;old.settledBaseAmount=baseStatus==='paid'?baseAmount:0;old.amount=baseAmount+ex.amount;old.outstandingAmount=(baseStatus==='paid'?0:baseAmount)+ex.amount;old.plannedAmount=(Number(old.plannedAmount)||0)+ex.amount;old.plannedLabels=[...(old.plannedLabels||[]),...ex.labels];old.status='estimated'}else map.set(k,{...ex,plannedAmount:ex.amount,plannedLabels:[...ex.labels],base:0,newUse:0,adjustment:null,baseStatus:'estimated',settledBaseAmount:0,outstandingAmount:ex.amount})}
  return [...map.values()].sort((a,b)=>String(a.paymentDate||'9999').localeCompare(String(b.paymentDate||'9999'))||String(a.cardName).localeCompare(String(b.cardName),'ja'))
}
function mm3PaymentSummary(month=paymentHomeMonth()){
  const statements=mm3PaymentCardItems(month),cardTotal=sum(statements,x=>x.amount),cardPaid=sum(statements,x=>Number(x.settledBaseAmount)||(x.status==='paid'?Math.max(0,(Number(x.amount)||0)-(Number(x.plannedAmount)||0)):0));const fixedRows=fixedScheduledInMonth(month),fixedCashRows=fixedRows.filter(x=>x.f.paymentMethod!=='card'),fixedTotal=sum(fixedCashRows,x=>x.f.amount*x.dates.length),fixedPaid=sum(fixedCashRows,x=>x.dates.filter(d=>data.transactions.some(t=>t.source==='fixed'&&t.fixedId===x.f.id&&t.date===d&&(t.bankApplied||t.bankReconciled||x.f.paymentMethod==='other'))).length*Number(x.f.amount||0));
  const large=data.largeExpensePlans.filter(p=>String(p.date||'').slice(0,7)===month&&p.status!=='cancelled'&&p.status!=='postponed'),largeCommitted=large.filter(p=>p.status==='completed'||p.priority==='required'),largeCashAmount=p=>sum((p.status==='completed'?largeExpenseParts(p):largeExpensePendingParts(p)).filter(part=>part.paymentMethod!=='card'),part=>Number(part.amount)||0),largeTotal=sum(largeCommitted,largeCashAmount),largePaid=sum(largeCommitted.filter(p=>p.status==='completed'),p=>sum(largeExpenseParts(p).filter(part=>part.paymentMethod!=='card'),part=>Number(part.amount)||0));
  const otherTx=txForMonth(month).filter(t=>t.paymentMethod!=='card'&&t.source!=='fixed'&&t.source!=='large_plan'),otherTotal=sum(otherTx,t=>t.amount),otherPaid=sum(otherTx.filter(t=>t.date<=ymd()&&(t.paymentMethod==='other'||t.bankApplied||t.bankReconciled)),t=>t.amount),total=cardTotal+fixedTotal+largeTotal+otherTotal,paid=cardPaid+fixedPaid+largePaid+otherPaid,remaining=Math.max(0,total-paid),pending=data.mailImports.filter(x=>x.status==='pending').length,plannedCardTotal=sum(statements,x=>Number(x.plannedAmount)||0);return{month,statements,cardTotal,cardPaid,plannedCardTotal,fixedRows,fixedCashRows,fixedTotal,fixedPaid,large,largeCommitted,largeCash:largeCommitted.filter(p=>largeExpenseParts(p).some(part=>part.paymentMethod!=='card')),largeTotal,largePaid,otherTx,otherTotal,otherPaid,total,paid,remaining,pending}
}
function mm3PaymentSignedYen(value){value=Math.round(Number(value)||0);return value>0?`+${yen(value)}`:yen(value)}
function mm3PaymentMonthDelta(month,current){const prev=mm3PaymentSummary(addMonths(month,-1)),diff=current-prev.remaining,pct=prev.remaining?diff/prev.remaining*100:null;return{diff,pct,prev}}
function mm3PaymentDaysUntil(date){if(!date)return null;return Math.round((parseYmd(date)-parseYmd(ymd()))/86400000)}
function mm3PaymentNextCard(summary){
  const now=ymd(),isCurrent=summary.month===ym(),future=summary.month>ym();
  return summary.statements.filter(x=>(Number(x.outstandingAmount??x.amount)||0)>0&&(!x.paymentDate||future||!isCurrent||x.paymentDate>=now)).sort((a,b)=>String(a.paymentDate||'9999').localeCompare(String(b.paymentDate||'9999'))||String(a.cardName).localeCompare(String(b.cardName),'ja'))[0]||null
}
function mm3PaymentCardTotalForMonth(cardId,month){return sum(mm3PaymentCardItems(month).filter(x=>x.cardId===cardId),x=>Number(x.amount)||0)}
function mm3PaymentCardSeries(cardId,month,count=6){return Array.from({length:count},(_,i)=>mm3PaymentCardTotalForMonth(cardId,addMonths(month,i-count+1)))}
function mm3PaymentSparklineHtml(values){
  if(!values||values.length<2||values.every(v=>Number(v)===0))return `<span class="mm3-payment-spark-empty">履歴不足</span>`;
  const w=72,h=26,min=Math.min(...values),max=Math.max(...values),range=Math.max(1,max-min),d=values.map((v,i)=>`${i?'L':'M'}${(i*(w-2)/(values.length-1)+1).toFixed(1)},${(h-2-(Number(v)-min)/range*(h-6)).toFixed(1)}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="mm3-payment-spark-line" d="${d}"></path></svg>`
}
/* ATF: explicit day-by-day cash and credit scenario. Existing ACF remains the daily budget adviser. */
function mm3AtfOptions(){
  const x={...DEFAULT_DATA.atfSettings,...(data.atfSettings||{})};
  x.reserveFloor=Math.max(0,Math.round(Number(x.reserveFloor)||0));
  x.dailyCardSpend=Math.max(0,Math.min(100000,Math.round(Number(x.dailyCardSpend)||0)));
  x.birthdayReduction=Math.max(0,Math.min(15000,Math.round(Number(x.birthdayReduction)||0)));
  x.birthdayFee=x.birthdayFee==null||x.birthdayFee===''?null:Math.max(0,Math.round(Number(x.birthdayFee)||0));
  return x;
}
function mm3AtfBirthdayAmount(part,plan){
  const raw=Math.max(0,Number(part.amount)||0);
  return plan.id==='large_seed_birthday'&&part.paymentId==='card_seed_merpay'?Math.max(0,raw-mm3AtfOptions().birthdayReduction):raw;
}
function mm3AtfBuildForecast(requestedEnd='2026-11-30'){
  const start=ymd(),end=requestedEnd<'2026-11-30'?requestedEnd:'2026-11-30',settings=mm3AtfOptions();
  if(start>end)return{startDate:start,endDate:end,rows:[],currentDeposits:totalDeposits(),reserveFloor:settings.reserveFloor,known:false};
  const dates=dateRange(start,end,370),cards=data.cards.filter(c=>Number(c.limit)>0),available=new Map(cards.map(c=>[c.id,Number.isFinite(Number(c.availableSnapshot))&&c.availableSnapshot!==''&&c.availableSnapshot!=null?Math.min(Number(c.limit),Math.max(0,Number(c.availableSnapshot))):null]));
  const scheduled=new Map(dates.map(d=>[d,[]])),queue=(date,item)=>{if(scheduled.has(date))scheduled.get(date).push(item)};
  const paidIncome=x=>x?.bankApplied||x?.bankReconciled;
  for(const r of data.salaryRecords){const i=data.incomes.find(x=>x.salaryRecordId===r.id);if(r.status==='入金済'||paidIncome(i))continue;queue(salaryRecordEffectiveDate(r)||r.date,{type:'income',amount:Number(r.gross)||0,label:`${employerById(r.employerId)?.name||'給与'} 給与`})}
  for(const t of data.tempIncomes){if(paidIncome(linkedIncomeForTemp(t)))continue;queue(t.date,{type:'income',amount:Number(t.amount)||0,label:t.sourceName||'臨時収入'})}
  for(const i of data.incomes){if(i.salaryRecordId||i.tempIncomeId||paidIncome(i))continue;queue(i.date,{type:'income',amount:Number(i.amount)||0,label:i.sourceName||'予定収入'})}
  if(settings.extraEarlyShifts&&data.salaryRecords.some(r=>r.id==='salary_seed_muji_202610'&&Number(r.gross)===57640))queue('2026-10-25',{type:'income',amount:42320,label:'無印の追加4シフト（8時間×4＋交通費）'});
  if(settings.extraLateShifts&&data.salaryRecords.some(r=>r.id==='salary_seed_muji_202611'&&Number(r.gross)===34300))queue('2026-11-25',{type:'income',amount:23120,label:'無印の追加4シフト（合計16時間＋交通費）'});
  for(const t of data.transactions){if(t.date<=start||paidIncome(t))continue;if(t.paymentMethod==='card')queue(t.date,{type:'cardPurchase',amount:Number(t.amount)||0,cardId:t.paymentId,label:t.merchant||'カード利用'});else queue(t.date,{type:'cash',amount:Number(t.amount)||0,label:t.merchant||'予定支出'})}
  for(const f of data.fixedPayments){for(const date of dates){if(!fixedDueOn(f,date)||(f.skippedDates||[]).includes(date)||data.transactions.some(t=>t.source==='fixed'&&t.fixedId===f.id&&t.date===date))continue;queue(date,{type:f.paymentMethod==='card'?'cardPurchase':'cash',amount:Number(f.amount)||0,cardId:f.paymentId,label:f.name||'固定支払い'})}}
  for(const p of data.largeExpensePlans){if(p.status!=='planned'||p.priority!=='required'||p.date<start||p.date>end)continue;if(p.atfOptionalPass&&!settings.renewPassCash)continue;for(const part of largeExpensePendingParts(p)){const amount=mm3AtfBirthdayAmount(part,p);if(amount<=0)continue;queue(p.date,{type:part.paymentMethod==='card'?'cardPurchase':'cash',amount,cardId:part.paymentId,label:p.name||'大型支出'})}}
  for(let month=start.slice(0,7);month<=end.slice(0,7);month=addMonths(month,1))for(const st of mm3PaymentCardItems(month)){
    const amount=Math.max(0,Number(st.outstandingAmount??st.amount)||0),due=st.paymentDate;
    if(!due||due<start||due>end||amount<=0)continue;
    queue(due,{type:'cardBill',amount,cardId:st.cardId,label:`${st.cardName} 引落`});
  }
  let balance=totalDeposits(),firstCashShortage='',firstReserveBreach='',firstCardShortage='';
  const futureCardBills=new Map(),rows=[];
  const cardOrder=[...cards].sort((a,b)=>{const rank=id=>id==='card_seed_paypay'?0:id==='card_seed_merpay'?1:2;return rank(a.id)-rank(b.id)});
  for(const date of dates){
    const openingBalance=balance,items=scheduled.get(date)||[],events=[],day={income:0,cashOut:0,cardPayment:0,cardPurchased:0,cardUnpaid:0,cardShortage:0,dailyCard:0};
    const note=(type,label,amount)=>events.push({date,type,label,amount});
    for(const e of items.filter(x=>x.type==='income')){balance+=e.amount;day.income+=e.amount;note('income',e.label,e.amount)}
    for(const e of items.filter(x=>x.type==='cash')){balance-=e.amount;day.cashOut+=e.amount;note('outflow',e.label,-e.amount)}
    for(const e of items.filter(x=>x.type==='cardBill')){
      const canSettle=balance>=e.amount;
      balance-=e.amount;day.cardPayment+=e.amount;
      if(canSettle){const card=cardById(e.cardId),old=available.get(e.cardId);if(card&&old!=null)available.set(e.cardId,Math.min(Number(card.limit)||0,old+e.amount))}
      else day.cardUnpaid+=e.amount;
      note('card',canSettle?e.label:`${e.label}（残高不足）`,-e.amount)
    }
    for(const e of items.filter(x=>x.type==='cardPurchase')){
      const old=available.get(e.cardId),room=old==null?0:old;
      if(room<e.amount){day.cardShortage+=e.amount-room;if(!firstCardShortage)firstCardShortage=date}
      if(old!=null)available.set(e.cardId,Math.max(0,old-e.amount));
      day.cardPurchased+=e.amount;
      note('purchase',`${e.label}（${cardById(e.cardId)?.name||'カード'}・利用枠）`,-e.amount)
    }
    // Repayments due today free the limit before today's new card spending.
    for(const card of cards){const key=`${date}|${card.id}`,due=futureCardBills.get(key)||0;if(!due)continue;const canSettle=balance>=due;balance-=due;day.cardPayment+=due;if(canSettle){const old=available.get(card.id);if(old!=null)available.set(card.id,Math.min(Number(card.limit)||0,old+due))}else day.cardUnpaid+=due;note('card',`日々のカード利用分・${card.name} 引落${canSettle?'':'（残高不足）'}`,-due)}
    // Everyday card spending is a stated scenario, even if it exceeds the credit balance.
    let remain=settings.dailyCardSpend;
    for(const card of cardOrder){if(remain<=0)break;const old=available.get(card.id);if(old==null||old<=0)continue;const use=Math.min(remain,old);available.set(card.id,old-use);day.dailyCard+=use;remain-=use;
      const bm=cardBillingMonthForPurchase(card,date),due=acfEffectiveCardPaymentDate(card,bm);
      if(due&&due>date){const key=`${due}|${card.id}`;futureCardBills.set(key,(futureCardBills.get(key)||0)+use)}
      note('purchase',`日々のカード利用（${card.name}）`,-use)
    }
    if(remain>0){day.cardShortage+=remain;if(!firstCardShortage)firstCardShortage=date;note('risk','日々のカード利用枠が不足',-remain)}
    if(balance<0&&!firstCashShortage)firstCashShortage=date;
    if(balance<settings.reserveFloor&&!firstReserveBreach)firstReserveBreach=date;
    rows.push({date,openingBalance,income:day.income,cashOut:day.cashOut,cardPayment:day.cardPayment,cardPurchased:day.cardPurchased,dailyCard:day.dailyCard,cardShortage:day.cardShortage,cardUnpaid:day.cardUnpaid,forecastBalance:balance,mandatoryBalance:balance,events,availableByCard:Object.fromEntries(cards.map(c=>[c.id,available.get(c.id)])),flexibleTotal:settings.dailyCardSpend,flexibleCredit:day.dailyCard,flexibleCardDue:0});
  }
  const known=cards.length>0&&cards.every(c=>available.get(c.id)!=null);
  return{startDate:start,endDate:end,rows,currentDeposits:totalDeposits(),reserveFloor:settings.reserveFloor,firstCashShortage,firstReserveBreach,firstCardShortage,known,settings};
}
function mm3ForecastThrough(endDate){return mm3AtfBuildForecast(endDate)}
function mm3AtfRowEvents(row){return row?.events||[]}
function mm3AtfForMonth(month){
  if(month<ym()||month>'2026-11')return{available:false,reason:month<ym()?'past':'range',month,rows:[],events:[]};
  const forecast=mm3ForecastThrough(monthEndDate(month)),rows=forecast.rows.filter(r=>r.date.slice(0,7)===month);
  if(!rows.length)return{available:false,reason:'range',month,forecast,rows:[],events:[]};
  const low=rows.reduce((a,b)=>a.forecastBalance<=b.forecastBalance?a:b),min=low.forecastBalance,reserve=forecast.reserveFloor;
  const status=!forecast.known?'要確認':rows.some(r=>r.cardShortage>0)||min<0?'不足':min<reserve?'危険':min<reserve+5000?'注意':'安全';
  return{available:true,month,forecast,rows,events:rows.flatMap(mm3AtfRowEvents),monthEndForecast:rows.at(-1).forecastBalance,minForecastBalance:min,minForecastDate:low.date,reserveFloor:reserve,safetyHeadroom:min-reserve,status};
}
function mm3AtfChartModel(atf){
  const source=atf.rows||[],maxPoints=38,step=Math.max(1,Math.ceil(source.length/maxPoints)),rows=source.filter((_,i)=>i%step===0||i===source.length-1),w=340,h=150,l=4,r=38,t=15,b=22,vals=rows.map(x=>Number(x.forecastBalance)||0);
  let min=Math.min(...vals),max=Math.max(...vals);if(min<0){min=Math.min(min,0);max=Math.max(max,0)};let span=Math.max(1,max-min),pad=span*.10;min-=pad;max+=pad;span=max-min;
  const pw=w-l-r,ph=h-t-b,points=rows.map((row,i)=>({row,x:l+i*pw/Math.max(1,rows.length-1),y:t+(max-(Number(row.forecastBalance)||0))/span*ph,value:Number(row.forecastBalance)||0}));
  const zeroY=min<=0&&max>=0?t+(max/span)*ph:null;
  return{w,h,l,r,t,b,pw,ph,min,max,span,points,zeroY}
}
function mm3AtfSegmentHtml(model){
  const out=[];for(let i=1;i<model.points.length;i++){
    const a=model.points[i-1],b=model.points[i],av=a.value,bv=b.value;
    if((av<0)===(bv<0))out.push(`<line class="mm3-atf-segment ${av<0?'negative':''}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`);
    else{const ratio=Math.abs(av)/(Math.abs(av)+Math.abs(bv)),cx=a.x+(b.x-a.x)*ratio,cy=a.y+(b.y-a.y)*ratio;out.push(`<line class="mm3-atf-segment ${av<0?'negative':''}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy.toFixed(1)}"></line><line class="mm3-atf-segment ${bv<0?'negative':''}" x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"></line>`)}
  }return out.join('')
}
function mm3AtfEventClass(row){if((Number(row.forecastBalance)||0)<0||Number(row.cardShortage)>0)return'negative';const events=mm3AtfRowEvents(row);if(events.some(e=>e.type==='income'))return'income';if(events.some(e=>e.type==='card'))return'card';return''}
function mm3AtfChartHtml(atf){if(!atf.available)return `<div class="mm3-atf-empty">${atf.reason==='past'?'ATFは今日以降を表示します。過去月は実績をご確認ください。':'この試算は2026年11月30日までです。'}</div>`;const m=mm3AtfChartModel(atf),ticks=[0,.5,1].map(q=>m.max-q*m.span),ys=[m.t,m.t+m.ph*.5,m.t+m.ph],line=mm3AtfSegmentHtml(m),area=m.points.length?`M${m.points[0].x.toFixed(1)},${(m.t+m.ph).toFixed(1)} L${m.points.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L')} L${m.points.at(-1).x.toFixed(1)},${(m.t+m.ph).toFixed(1)} Z`:'';return `<div class="mm3-atf-chart" id="mm3AtfChart"><svg viewBox="0 0 ${m.w} ${m.h}" preserveAspectRatio="none" role="img" aria-label="${esc(monthLabel(atf.month))}のATF残高予測">${ys.map(y=>`<line class="mm3-atf-grid" x1="${m.l}" x2="${m.l+m.pw}" y1="${y}" y2="${y}"></line>`).join('')}${m.zeroY!=null?`<line class="mm3-atf-zero" x1="${m.l}" x2="${m.l+m.pw}" y1="${m.zeroY}" y2="${m.zeroY}"></line>`:''}${area?`<path class="mm3-atf-area" d="${area}"></path>`:''}${line}${m.points.filter(p=>mm3AtfRowEvents(p.row).length).map(p=>{const ev=mm3AtfRowEvents(p.row);return `<circle class="mm3-atf-event-dot ${mm3AtfEventClass(p.row)}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3.4"><title>${dayLabel(p.row.date)} ${ev.map(e=>e.label).join(' / ')}</title></circle>`}).join('')}<line class="mm3-atf-guide" data-mm3-atf-guide x1="0" x2="0" y1="${m.t}" y2="${m.t+m.ph}"></line><circle class="mm3-atf-selected" data-mm3-atf-selected cx="0" cy="0" r="4.3"></circle>${ticks.map((v,i)=>`<text class="mm3-atf-axis" x="${m.l+m.pw+4}" y="${ys[i]+3}">${esc(acfCompactSignedMoney?acfCompactSignedMoney(v):yen(v))}</text>`).join('')}<text class="mm3-atf-axis" x="${m.l}" y="${m.h-4}">${esc(m.points[0]?.row.date?.slice(5)||'')}</text><text class="mm3-atf-axis" text-anchor="end" x="${m.l+m.pw}" y="${m.h-4}">${esc(m.points.at(-1)?.row.date?.slice(5)||'')}</text></svg><div class="mm3-atf-tooltip" data-mm3-atf-tooltip></div></div>`}
function mm3PaymentStatusClass(status){return status==='安全'?'green':status==='注意'?'orange':'red'}
function mm3PaymentNextCardHtml(summary){
  const st=mm3PaymentNextCard(summary);if(!st)return `<div class="mm3-payment-detail-list"><div class="mm3-payment-detail-row" style="pointer-events:none"><div class="mm3-payment-detail-main"><strong>この月の今後のカード引落はありません</strong><small>支払済み、または請求予定が未登録です</small></div></div></div>`;
  const days=mm3PaymentDaysUntil(st.paymentDate),dayText=summary.month===ym()&&days!=null?(days===0?'今日':days>0?`あと${days}日`:'支払日超過'):'支払予定';
  return `<button type="button" class="mm3-payment-event" data-mm3-next-card="${esc(st.cardId)}"><div class="mm3-payment-event-icon">${icon('card')}</div><div class="mm3-payment-event-main"><strong>${esc(st.cardName)}</strong><small>${st.paymentDate?`${dayLabel(st.paymentDate)}・${cardStatementStatusLabel(st.status)}`:cardStatementStatusLabel(st.status)}</small></div><div class="mm3-payment-event-value"><strong>−${yen(Number(st.outstandingAmount??st.amount)||0)}</strong><small>${dayText}</small></div></button>`
}
function acfProjectedCardExposureThrough(cardId,endDate=addDays(ymd(),60)){const card=cardById(cardId);if(!card)return{current:0,max:0,minAvailable:0,limit:0};const start=ymd(),limit=Math.max(0,Number(card.limit)||0),events=[];let exposure=0;const months=new Set();for(let i=-12;i<=4;i++)months.add(addMonths(start.slice(0,7),i));for(const key of Object.keys(data.cardAdjustments||{})){const [bm,cid]=key.split('|');if(cid===cardId)months.add(bm)}for(const bm of months){if(cardStatementStatus(cardId,bm)==='paid')continue;const amount=Math.max(0,Number(acfCardBillingAmount(cardId,bm))||0);if(!amount)continue;const due=acfEffectiveCardPaymentDate(card,bm);if(due&&due<start)continue;exposure+=amount;if(due)events.push({date:due,delta:-amount,order:0})}const addPlanned=(date,amount,due)=>{amount=Math.max(0,Number(amount)||0);if(!amount||!date||date>endDate)return;if(date<=start)exposure+=amount;else events.push({date,delta:amount,order:1});if(due)events.push({date:due,delta:-amount,order:0})};for(const f of data.fixedPayments||[]){if(f.paymentMethod!=='card'||f.paymentId!==cardId)continue;for(const d of dateRange(start,endDate,400)){if(!fixedDueOn(f,d)||(f.skippedDates||[]).includes(d)||data.transactions.some(t=>t.source==='fixed'&&t.fixedId===f.id&&t.date===d))continue;const bm=cardBillingMonthForPurchase(card,d);addPlanned(d,f.amount,acfEffectiveCardPaymentDate(card,bm))}}for(const p of data.largeExpensePlans||[]){if(p.status!=='planned'||p.priority!=='required'||!p.date||p.date>endDate)continue;for(const part of largeExpensePendingParts(p)){if(part.paymentMethod!== 'card'||part.paymentId!==cardId)continue;const bm=cardBillingMonthForPurchase(card,p.date);addPlanned(p.date,part.amount,acfEffectiveCardPaymentDate(card,bm)||nextCardDueDate(card,p.date))}}const current=exposure;let max=exposure;events.sort((a,b)=>String(a.date).localeCompare(String(b.date))||a.order-b.order);for(const e of events){if(e.date<start)continue;exposure=Math.max(0,exposure+e.delta);max=Math.max(max,exposure)}return{current,max,minAvailable:limit>0?Math.max(0,limit-max):0,availableNow:limit>0?Math.max(0,limit-current):0,limit}}
function mm3PaymentCardWatchlistHtml(summary){if(!data.cards.length)return `<div class="empty">クレジットカードがありません。</div>`;const through=summary.month>=ym()?monthEndDate(summary.month):ymd();return `<div class="mm3-payment-watchlist">${data.cards.map(c=>{const items=summary.statements.filter(x=>x.cardId===c.id),bill=sum(items,x=>Number(x.amount)||0),prev=mm3PaymentCardTotalForMonth(c.id,addMonths(summary.month,-1)),diff=bill-prev,pct=prev?diff/prev*100:null,next=items.filter(x=>(Number(x.outstandingAmount??x.amount)||0)>0).sort((a,b)=>String(a.paymentDate||'9999').localeCompare(String(b.paymentDate||'9999')))[0]||items[0],status=next?.status||'estimated',multi=items.length>1?`・${items.length}件`:'',sub=next?.paymentDate?`${dayLabel(next.paymentDate)}・${cardStatementStatusLabel(status)}${multi}`:(c.dueDay?`${c.dueDay}日・${cardStatementStatusLabel(status)}${multi}`:cardStatementStatusLabel(status)),ex=acfProjectedCardExposureThrough(c.id,through);return `<button type="button" class="mm3-payment-watchrow" data-card="${c.id}"><div class="mm3-payment-watch-main"><strong>${esc(c.name)}</strong><small>${esc(sub)}</small><small>利用可能額（予定込み最小） <span data-card-available="${c.id}">${Number(c.limit)>0?yen(ex.minAvailable):'未確認'}</span></small></div><div class="mm3-payment-spark">${mm3PaymentSparklineHtml(mm3PaymentCardSeries(c.id,summary.month))}</div><div class="mm3-payment-watch-value"><strong>${bill?yen(bill):'—'}</strong><small class="${pct==null?'':diff<=0?'green':'red'}">${pct==null?'比較なし':`${diff>=0?'+':'−'}${Math.abs(pct).toFixed(1)}%`}</small></div></button>`}).join('')}</div>`}

function mm3OpenDebitList(month,targetRoot=null){
  presentFinancialView(targetRoot,'デビットカード',`<div class="mm3-payment-push-list">${data.debitCards.length?data.debitCards.map(d=>`<button class="mm3-payment-push-row" data-mm3-debit="${d.id}"><div class="row-main"><div class="row-title">${esc(d.name)}</div><div class="row-sub">${esc(bankById(d.bankId)?.name||'口座未設定')}・即時引落</div></div><div class="row-value">${yen(debitUsage(d.id,month))}</div><span class="chev">›</span></button>`).join(''):`<div class="empty">デビットカードがありません。</div>`}</div>`,root=>{root.dataset.paymentList='debit';root.dataset.paymentListMonth=month;root.querySelectorAll('[data-mm3-debit]').forEach(b=>b.onclick=()=>openDebitDetail(b.dataset.mm3Debit,month))})
}
function mm3OpenFixedList(summary,targetRoot=null){summary=mm3PaymentSummary(summary.month);
  const rows=summary.fixedRows.length?summary.fixedRows:data.fixedPayments.map(f=>({f,dates:[]}));
  presentFinancialView(targetRoot,'固定支払い',`<div class="mm3-payment-push-list">${rows.length?rows.map(x=>`<button class="mm3-payment-push-row" data-mm3-fixed="${x.f.id}"><div class="row-main"><div class="row-title">${esc(x.f.name)}</div><div class="row-sub">${x.dates.length?x.dates.map(dayLabel).join(' / '):`${x.f.frequency==='monthly'?'毎月':x.f.frequency==='yearly'?'毎年':'隔月'} ${x.f.day}日`}</div></div><div class="row-value">${yen(Number(x.f.amount||0)*Math.max(1,x.dates.length||1))}</div><span class="chev">›</span></button>`).join(''):`<div class="empty">固定支払いは未登録です。</div>`}</div>`,root=>{root.dataset.paymentList='fixed';root.dataset.paymentListMonth=summary.month;root.querySelectorAll('[data-mm3-fixed]').forEach(b=>b.onclick=()=>openFixedPayment(b.dataset.mm3Fixed,{defaultMonth:summary.month}))})
}
function mm3OpenLargeList(summary,targetRoot=null){summary=mm3PaymentSummary(summary.month);
  presentFinancialView(targetRoot,`${monthLabel(summary.month)}の大型支出`,`<div class="mm3-payment-push-list">${summary.large.length?summary.large.map(p=>`<button class="mm3-payment-push-row" data-mm3-large="${p.id}"><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${dayLabel(p.date)}・${p.status==='completed'?'完了':p.priority==='required'?'必須':'検討中'}</div></div><div class="row-value">${yen(p.amount)}</div><span class="chev">›</span></button>`).join(''):`<div class="empty">この月の大型支出はありません。</div>`}</div>`,root=>{root.dataset.paymentList='large';root.dataset.paymentListMonth=summary.month;root.querySelectorAll('[data-mm3-large]').forEach(b=>b.onclick=()=>openLargeExpenseDetail(b.dataset.mm3Large))})
}
function mm3AtfCalendarHtml(atf){
  if(!atf.available)return `<p class="mm3-atf-note">この月は対象期間外です。</p>`;
  const days=daysInMonth(atf.month),offset=parseYmd(`${atf.month}-01`).getDay(),byDate=new Map(atf.rows.map(r=>[r.date,r]));
  return `<div class="mm3-atf-weekdays">${['日','月','火','水','木','金','土'].map(x=>`<span>${x}</span>`).join('')}</div><div class="mm3-atf-calendar">${Array.from({length:offset},()=>'<span></span>').join('')}${Array.from({length:days},(_,i)=>{const d=`${atf.month}-${pad(i+1)}`,r=byDate.get(d),risk=r&&(r.forecastBalance<0||r.cardShortage>0),warn=r&&r.forecastBalance<atf.reserveFloor;return `<button type="button" ${r?'data-atf-scroll="'+d+'"':'disabled'} class="mm3-atf-day ${risk?'danger':warn?'caution':''} ${r?.events.length?'has-event':''}"><b>${i+1}</b><small>${r?esc(acfCompactSignedMoney(r.forecastBalance)):'—'}</small></button>`}).join('')}</div>`;
}
function mm3AtfDayEventsHtml(row){
  const events=mm3AtfRowEvents(row),groups=[
    {title:'収入予定',items:events.filter(e=>e.type==='income')},
    {title:'支出予定・カード引落',items:events.filter(e=>e.type==='outflow'||e.type==='card')},
    {title:'カード利用予定（預貯金からの引落前）',items:events.filter(e=>e.type==='purchase')},
    {title:'注意',items:events.filter(e=>e.type==='risk')}
  ];
  if(!events.length)return '<p class="mm3-atf-note">登録された入出金予定はありません。</p>';
  return groups.filter(g=>g.items.length).map(g=>`<div class="mm3-atf-event-group"><div class="mm3-atf-event-group-title">${g.title}</div>${g.items.map(e=>`<div class="mm3-atf-eventline"><span>${esc(e.label)}</span><b>${e.type==='purchase'?'利用枠 ':e.amount>0?'+':''}${yen(e.amount)}</b></div>`).join('')}</div>`).join('');
}
function mm3AtfDailyHtml(atf){
  if(!atf.available)return'';
  const cards=data.cards.filter(c=>Number(c.limit)>0);
  return `<div class="mm3-atf-daily">${atf.rows.map(r=>`<section class="mm3-atf-dayrow" id="atf-day-${r.date}" aria-label="${dayLabel(r.date)}"><button type="button" class="mm3-atf-dayhead mm3-atf-daytoggle" data-atf-date="${r.date}" aria-expanded="false" aria-controls="atf-events-${r.date}"><strong>${dayLabel(r.date)}</strong><span class="mm3-atf-toggle-end"><strong class="${r.forecastBalance<0?'red':r.forecastBalance<atf.reserveFloor?'orange':''}">${yen(r.forecastBalance)}</strong>${icon('chevronDown')}</span></button><div class="mm3-atf-dayflow">${r.income?`<span>入金 +${yen(r.income)}</span>`:''}${r.cashOut?`<span>振込・現金 −${yen(r.cashOut)}</span>`:''}${r.cardPayment?`<span>カード引落 −${yen(r.cardPayment)}</span>`:''}${r.cardPurchased?`<span>カード購入 ${yen(r.cardPurchased)}</span>`:''}<span>日々のカード利用 ${yen(r.dailyCard)}</span>${r.cardShortage?`<b class="red">利用枠不足 ${yen(r.cardShortage)}</b>`:''}</div><div class="mm3-atf-credit">${cards.map(c=>`<span>${esc(c.name)} <b>${r.availableByCard[c.id]==null?'未登録':yen(r.availableByCard[c.id])}</b></span>`).join('')}</div><details class="mm3-atf-daydetails" id="atf-events-${r.date}"><summary>この日の予定（${r.events.length}件）</summary>${mm3AtfDayEventsHtml(r)}</details></section>`).join('')}</div>`;
}
function mm3AtfFirstImportantEvent(forecast){
  for(const row of forecast?.rows||[])for(const event of mm3AtfRowEvents(row)){
    if(event.type==='purchase'&&String(event.label||'').startsWith('日々のカード利用'))continue;
    return event;
  }
  return null;
}
function mm3AtfOpenDay(root,date,toggle=false){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return false;
  const row=root.querySelector('#atf-day-'+date);if(!row)return false;
  const details=row.querySelector?.('.mm3-atf-daydetails');if(details)details.open=toggle?!details.open:true;
  row.querySelector?.('[data-atf-date]')?.setAttribute('aria-expanded',String(!!details?.open));
  row.scrollIntoView?.({behavior:'smooth',block:'center'});
  return true;
}
function mm3AtfNextRisk(f){
  const list=[{date:f.firstCashShortage,label:'引落・振込に使う現金が不足'},{date:f.firstReserveBreach,label:`預貯金が${yen(f.reserveFloor)}を下回る`},{date:f.firstCardShortage,label:'カードの利用枠が不足'}].filter(x=>x.date).sort((a,b)=>a.date.localeCompare(b.date));
  return list[0]||null;
}
function mm3AtfWorkHint(f){
  const risk=mm3AtfNextRisk(f);if(!risk)return'登録済みの予定では追加勤務による補填は不要です。';
  const rows=f.rows.filter(r=>r.date<=risk.date),minimum=Math.min(...rows.map(r=>r.forecastBalance)),gap=Math.max(0,f.reserveFloor-minimum),hours=Math.ceil(gap/1200);
  if(!gap)return'カード枠不足は勤務を増やしても入金前には解消しません。カードの決済方法を見直してください。';
  return risk.date<'2026-10-25'?`不足は${dayLabel(risk.date)}。無印の追加勤務は10/25入金のため、この日の不足には間に合いません。必要な先払い対策は${yen(gap)}です。`:`不足を時給1,200円だけで補う目安は約${hours}時間です。勤務日と給与入金日を確認してください。`;
}
function mm3OpenAtfSheet(atf){
  if(!atf?.available)return showAlert('ATFの対象期間外です',atf?.reason==='past'?'過去月は支払い実績をご確認ください。':'今回の資金見通しは2026年11月30日までです。');
  const forecast=mm3ForecastThrough('2026-11-30'),opts=mm3AtfOptions(),risk=mm3AtfNextRisk(forecast),nextEvent=mm3AtfFirstImportantEvent(forecast),months=['2026-09','2026-10','2026-11'].filter(m=>m>=ym()),cards=data.cards.filter(c=>Number(c.limit)>0);
  const nextEventHtml=nextEvent?`<button type="button" class="mm3-atf-next-event" id="mm3AtfNextEvent" data-atf-event-date="${nextEvent.date}"><span class="mm3-atf-next-event-icon">${icon('calendar')}</span><span class="mm3-atf-next-event-main"><strong>次の重要な資金イベントを見る</strong><small>${dayLabel(nextEvent.date)}の予定を表示</small></span><span class="mm3-atf-next-event-chevron" aria-hidden="true">›</span></button>`:'<p class="mm3-atf-note">期間内に重要な資金イベントはありません。</p>';
  const settingsHtml=`<details class="mm3-atf-settings"><summary>試算条件を変更</summary><div class="mm3-atf-form"><label>毎日のカード利用（円）<input id="atfDaily" type="number" min="0" step="100" value="${opts.dailyCardSpend}"></label><label>残したい預貯金（円）<input id="atfFloor" type="number" min="0" step="1000" value="${opts.reserveFloor}"></label><label>誕生日代の節約額（0〜15,000円）<input id="atfReduction" type="number" min="0" max="15000" step="1000" value="${opts.birthdayReduction}"></label><label>分割手数料の実額（円、未確認なら空欄）<input id="atfFee" type="number" min="0" step="1" placeholder="未確認" value="${opts.birthdayFee??''}"></label>${cards.map(c=>`<label>${esc(c.name)}の現在利用可能額（円）<input type="number" min="0" max="${Number(c.limit)||0}" data-atf-card="${esc(c.id)}" value="${c.availableSnapshot??''}" placeholder="未登録"></label>`).join('')}<label class="mm3-atf-check"><input id="atfPass" type="checkbox" ${opts.renewPassCash?'checked':''}>9/26に現金13,000円で定期を更新する仮定</label><label class="mm3-atf-check"><input id="atfEarly" type="checkbox" ${opts.extraEarlyShifts?'checked':''}>10/1〜10/10の追加4シフト（10/25入金 +42,320円）</label><label class="mm3-atf-check"><input id="atfLate" type="checkbox" ${opts.extraLateShifts?'checked':''}>10/12・20・26（18:00〜21:30）と10/21（16:00〜21:30）の追加勤務（11/25入金 +23,120円）</label><button type="button" class="primary" id="atfApply">この条件で再計算</button></div></details>`;
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="mm3AtfClose">閉じる</button><div class="sheet-title">ATF 資金見通し</div><span style="min-width:64px"></span></div><div class="sheet-body mm3-atf-body"><h2>支払える日を確認</h2><p class="mm3-atf-note">預貯金は口座間送金を合算。カード枠は３枚別々です。${opts.birthdayFee==null?'分割手数料は未確認のため、必要額に含めていません。':opts.birthdayFee>1400?'入力した手数料は目標の1,400円を超えます。':'分割手数料を入力済みです。'} 誕生日代のカード分割と定期の現金更新は仮定です。既存の分割残額（PayPay約3万円・三井住友約4.8万円）の将来請求と手数料は未確認のため、判明済みの請求以外は予測に含みません。</p><div class="mm3-atf-riskbox ${risk?'danger':''}"><b>${risk?`${dayLabel(risk.date)}：${risk.label}`:'期間中、登録済み条件で不足日はありません'}</b><small>現金が足りなくなる日：${forecast.firstCashShortage?dayLabel(forecast.firstCashShortage):"期間内になし"} ／ ${yen(opts.reserveFloor)}を割る日：${forecast.firstReserveBreach?dayLabel(forecast.firstReserveBreach):"期間内になし"}</small><small>${esc(mm3AtfWorkHint(forecast))}</small></div>${nextEventHtml}<div class="mm3-atf-monthtabs" id="atfMonthTabs">${months.map(m=>`<button type="button" data-atf-month="${m}" class="${atf.month===m?'on':''}">${esc(monthLabel(m))}</button>`).join('')}</div><div id="atfMonthContent">${mm3AtfCalendarHtml(atf)}<p class="mm3-atf-note">マスの数字はその日の残高（千円単位）です。日付を押すとその日の予定が開きます。</p>${mm3AtfDailyHtml(atf)}</div>${settingsHtml}</div>`,'full',root=>{
    root.querySelector('#mm3AtfClose').onclick=requestSheetClose;
    const showMonth=month=>{
      const next=mm3AtfForMonth(month);if(!next.available)return false;
      root.querySelectorAll('[data-atf-month]').forEach(b=>b.classList.toggle('on',b.dataset.atfMonth===month));
      root.querySelector('#atfMonthContent').innerHTML=`${mm3AtfCalendarHtml(next)}<p class="mm3-atf-note">マスの数字はその日の残高（千円単位）です。日付を押すとその日の予定が開きます。</p>${mm3AtfDailyHtml(next)}`;
      return true;
    };
    root.addEventListener('click',event=>{
      const month=event.target.closest('[data-atf-month]');if(month){
        if(month.disabled||month.classList.contains('on'))return;
        month.disabled=true;
        runWithBusy(()=>{
          if(!showMonth(month.dataset.atfMonth))showToast('この月は対象期間外です',{tone:'error'});
        },{title:'ATFを計算中…',sub:`${monthLabel(month.dataset.atfMonth)}の残高とカード枠を確認しています`})
          .catch(error=>{console.error('ATF month calculation failed',error);showToast('月別の試算に失敗しました',{tone:'error'})})
          .finally(()=>{if(month.isConnected)month.disabled=false});
        return;
      }
      const upcoming=event.target.closest('#mm3AtfNextEvent');if(upcoming){
        const date=upcoming.dataset.atfEventDate,month=date.slice(0,7);
        if(root.querySelector('[data-atf-month].on')?.dataset.atfMonth===month)mm3AtfOpenDay(root,date);
        else{upcoming.disabled=true;runWithBusy(()=>{if(showMonth(month))mm3AtfOpenDay(root,date)},{title:'ATFを計算中…',sub:`${monthLabel(month)}の予定を確認しています`})
          .catch(error=>{console.error('ATF event navigation failed',error);showToast('予定を表示できませんでした',{tone:'error'})})
          .finally(()=>{if(upcoming.isConnected)upcoming.disabled=false})}
        return;
      }
      const day=event.target.closest('[data-atf-scroll],[data-atf-date]');
      if(day)mm3AtfOpenDay(root,day.dataset.atfScroll||day.dataset.atfDate,!!day.dataset.atfDate);
    });
    root.addEventListener('toggle',event=>{const panel=event.target;if(!panel?.matches?.('.mm3-atf-daydetails'))return;panel.closest('.mm3-atf-dayrow')?.querySelector('[data-atf-date]')?.setAttribute('aria-expanded',String(panel.open))},true);
    root.querySelector('#atfApply').onclick=()=>{
      const get=id=>root.querySelector('#'+id),read=id=>Number(get(id).value),fee=get('atfFee').value.trim(),apply=get('atfApply');
      const amounts=['atfReduction','atfDaily','atfFloor'],valid=amounts.every(id=>get(id).value.trim()!==''&&Number.isFinite(read(id))&&read(id)>=0);
      const validFee=fee===''||Number.isFinite(Number(fee))&&Number(fee)>=0;
      const validCards=[...root.querySelectorAll('[data-atf-card]')].every(input=>input.value.trim()===''||Number.isFinite(Number(input.value))&&Number(input.value)>=0&&Number(input.value)<=Number(cardById(input.dataset.atfCard)?.limit||0));
      if(!valid||!validFee||!validCards||read('atfReduction')>15000)return showToast('入力額を確認してください',{tone:'error'});
      apply.disabled=true;
      runWithBusy(()=>{safeCommit(()=>{
        data.atfSettings={...data.atfSettings,dailyCardSpend:Math.round(read('atfDaily')),reserveFloor:Math.round(read('atfFloor')),birthdayReduction:Math.round(read('atfReduction')),birthdayFee:fee===''?null:Math.round(Number(fee)),renewPassCash:get('atfPass').checked,extraEarlyShifts:get('atfEarly').checked,extraLateShifts:get('atfLate').checked};
        data.acfSettings.reserveFloor=data.atfSettings.reserveFloor;
        for(const input of root.querySelectorAll('[data-atf-card]')){const c=cardById(input.dataset.atfCard);if(c)c.availableSnapshot=input.value.trim()===''?null:Math.max(0,Math.min(Number(c.limit)||0,Number(input.value)||0))}
      },{label:'atf scenario',render:true});mm3OpenAtfSheet(mm3AtfForMonth(root.querySelector('[data-atf-month].on')?.dataset.atfMonth||atf.month))},
      {title:'ATFを再計算中…',sub:'残高・引落・カードの利用可能額を確認しています'})
        .catch(error=>{console.error('ATF scenario calculation failed',error);showToast('ATFを更新できませんでした',{tone:'error'})})
        .finally(()=>{if(apply.isConnected)apply.disabled=false});
    };
  });
}
function mm3BindAtfScrubber(atf){const root=document.getElementById('mm3AtfChart');if(!root||!atf?.available)return;const svg=root.querySelector('svg'),guide=root.querySelector('[data-mm3-atf-guide]'),dot=root.querySelector('[data-mm3-atf-selected]'),tip=root.querySelector('[data-mm3-atf-tooltip]'),model=mm3AtfChartModel(atf);let active=false,last=-1;const update=e=>{const rect=svg.getBoundingClientRect(),vx=Math.max(0,Math.min(model.w,(e.clientX-rect.left)/Math.max(1,rect.width)*model.w)),idx=model.points.reduce((best,p,i)=>Math.abs(p.x-vx)<Math.abs(model.points[best].x-vx)?i:best,0),p=model.points[idx];guide.setAttribute('x1',p.x);guide.setAttribute('x2',p.x);dot.setAttribute('cx',p.x);dot.setAttribute('cy',p.y);dot.style.stroke=p.value<0?'var(--red)':'var(--blue)';const ev=mm3AtfRowEvents(p.row);tip.style.left=`${Math.max(12,Math.min(88,p.x/model.w*100))}%`;tip.innerHTML=`${esc(dayLabel(p.row.date))}<br><strong>${yen(p.value)}</strong>${ev.length?`<small>${ev.slice(0,3).map(x=>`${esc(x.label)} ${x.type==='purchase'?'利用枠 ':x.amount>0?'+':''}${yen(x.amount)}`).join('<br>')}${ev.length>3?`<br>ほか${ev.length-3}件`:''}</small>`:''}`;if(idx!==last){last=idx;feedback?.selection?.()}root.classList.add('scrubbing')};root.addEventListener('pointerdown',e=>{active=true;last=-1;root.setPointerCapture?.(e.pointerId);update(e)});root.addEventListener('pointermove',e=>{if(active)update(e)});const end=()=>{active=false;last=-1;root.classList.remove('scrubbing')};root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);root.addEventListener('lostpointercapture',end)}

function renderPayments(){
  const summary=mm3PaymentSummary(paymentHomeMonth()),delta=mm3PaymentMonthDelta(summary.month,summary.remaining),atf=mm3AtfForMonth(summary.month),fullRisk=atf.available?mm3AtfNextRisk(mm3ForecastThrough('2026-11-30')):null;mm3PaymentAtfState=atf;
  const top=document.getElementById('paymentsTop'),content=document.getElementById('paymentsContent');top.classList.add('mm3-payment-topbar');
  top.innerHTML=topbar('支払い','',`${actionBtn('plus','paymentsAdd','追加')}<button class="icon-btn" id="paymentsMenu" aria-label="メニュー">${icon('menu')}</button>`);
  const compare=delta.pct==null?`<span class="mm3-payment-monthmeta">前月比較なし</span>`:`<div class="mm3-payment-primary-change ${delta.diff<=0?'green':'red'}"><span>${mm3PaymentSignedYen(delta.diff)}</span><span>${delta.pct>=0?'+':''}${delta.pct.toFixed(1)}%</span><small>前月比</small></div>`;
  content.innerHTML=`<div class="mm3-payment-shell mm3-payment-reveal"><div class="mm3-payment-monthline"><button type="button" class="mm3-payment-monthbtn" id="mm3PaymentMonth">${esc(monthLabel(summary.month))}${icon('chevronDown')}</button><span class="mm3-payment-monthmeta">${summary.month===ym()?'今月':summary.month<ym()?'過去月':'未来月'}</span></div><div class="mm3-payment-primary"><div class="mm3-payment-primary-label">これから支払う額</div><div class="mm3-payment-primary-value">${yen(summary.remaining)}</div>${compare}</div><div class="mm3-payment-section-head"><div class="mm3-payment-atf-title"><span class="mm3-payment-section-title">資金見通し</span><span class="mm3-payment-atf-chip">ATF</span></div><button type="button" class="mm3-payment-link" id="mm3AtfOpen">ATFを開く ›</button></div><div class="mm3-payment-caption">給与・振込・カード引落を日別に試算。ATFを開くとカレンダーと３枚の利用枠を確認できます。</div>${mm3AtfChartHtml(atf)}${atf.available?`<p class="mm3-atf-overview-risk">${fullRisk?`${dayLabel(fullRisk.date)}：${esc(fullRisk.label)}`:"登録済みの期間内に不足日はありません"}</p><div class="mm3-atf-metrics"><div class="mm3-atf-metric"><span>月末予測</span><strong class="${atf.monthEndForecast<0?'red':''}">${yen(atf.monthEndForecast)}</strong></div><div class="mm3-atf-metric"><span>最低残高</span><strong class="${atf.minForecastBalance<0?'red':''}">${yen(atf.minForecastBalance)}</strong></div><div class="mm3-atf-metric"><span>状態</span><strong class="${mm3PaymentStatusClass(atf.status)}">${atf.status}</strong></div></div>`:''}<div class="mm3-payment-section-head"><span class="mm3-payment-section-title">次の引落</span><button type="button" class="mm3-payment-link" id="mm3PaymentHistoryTop">予定一覧 ›</button></div>${mm3PaymentNextCardHtml(summary)}<div class="mm3-payment-section-head"><span class="mm3-payment-section-title">カード</span><button type="button" class="mm3-payment-link" id="mm3PaymentQuickBilling">請求額を更新 ›</button></div>${mm3PaymentCardWatchlistHtml(summary)}<div class="mm3-payment-section-head"><span class="mm3-payment-section-title">詳細</span></div>${mm3PaymentDetailHtml(summary)}</div>`;
  bindPayments()
}

function bindPayments(){
  const month=document.getElementById('mm3PaymentMonth');if(month)month.onclick=()=>openAssetBillingMonthPicker(m=>mm3RenderPaymentsMaybeBusy(m));
  const atfOpen=document.getElementById('mm3AtfOpen');if(atfOpen)atfOpen.onclick=()=>{atfOpen.disabled=true;runWithBusy(()=>mm3OpenAtfSheet(mm3PaymentAtfState),{title:'ATFを計算中…',sub:'日別の残高とカードの利用可能額を確認しています'}).catch(error=>{console.error('ATF sheet failed',error);showToast('ATFを開けませんでした',{tone:'error'})}).finally(()=>{if(atfOpen.isConnected)atfOpen.disabled=false})};
  mm3BindAtfScrubber(mm3PaymentAtfState);
  document.querySelectorAll('#screen-payments [data-card]').forEach(b=>b.onclick=()=>openCardDetail(b.dataset.card,paymentHomeMonth()));
  const next=document.querySelector('#screen-payments [data-mm3-next-card]');if(next)next.onclick=()=>openCardDetail(next.dataset.mm3NextCard,paymentHomeMonth());
  const quick=document.getElementById('mm3PaymentQuickBilling');if(quick)quick.onclick=()=>openQuickCardBilling(paymentHomeMonth());
  const histTop=document.getElementById('mm3PaymentHistoryTop');if(histTop)histTop.onclick=()=>openTransactionList({month:paymentHomeMonth(),title:`${monthLabel(paymentHomeMonth())}の支払い`});
  const debit=document.getElementById('mm3PaymentDebit');if(debit)debit.onclick=()=>mm3OpenDebitList(paymentHomeMonth());
  const fixed=document.getElementById('mm3PaymentFixed');if(fixed)fixed.onclick=()=>mm3OpenFixedList(mm3PaymentSummary(paymentHomeMonth()));
  const large=document.getElementById('mm3PaymentLarge');if(large)large.onclick=()=>mm3OpenLargeList(mm3PaymentSummary(paymentHomeMonth()));
  const history=document.getElementById('mm3PaymentHistory');if(history)history.onclick=()=>openTransactionList({month:paymentHomeMonth(),title:`${monthLabel(paymentHomeMonth())}の支払い`});
  const mail=document.getElementById('mm3PaymentMail');if(mail)mail.onclick=openMailOverview;
  const add=document.getElementById('paymentsAdd');if(add)add.onclick=()=>openSheet(`<div class="sheet-nav"><button class="nav-text" id="paymentsAddClose">閉じる</button><div class="sheet-title">追加</div><span style="min-width:64px"></span></div><div class="sheet-body"><div class="action-list"><button class="secondary" id="paymentAddCard">クレジットカードを追加</button><button class="secondary" id="paymentAddDebit">デビットカードを追加</button><button class="secondary" id="paymentAddFixed">固定支払いを追加</button><button class="secondary" id="paymentAddLarge">大型支出を追加</button></div></div>`,'half',root=>{root.querySelector('#paymentsAddClose').onclick=requestSheetClose;root.querySelector('#paymentAddCard').onclick=()=>{closeSheet();setTimeout(()=>openAddCard(),320)};root.querySelector('#paymentAddDebit').onclick=()=>{closeSheet();setTimeout(()=>openAddDebit(),320)};root.querySelector('#paymentAddFixed').onclick=()=>{const defaultMonth=paymentHomeMonth();closeSheet();setTimeout(()=>openFixedPayment(null,{defaultMonth}),320)};root.querySelector('#paymentAddLarge').onclick=()=>{closeSheet();setTimeout(()=>openLargeExpenseEditor(null,{after:()=>renderAll()}),320)}});
  const menu=document.getElementById('paymentsMenu');if(menu)menu.onclick=e=>openMenu(e.currentTarget,[{label:'表示する支払月を変更',icon:'calendar',action:()=>openAssetBillingMonthPicker(()=>renderPayments())},{label:'カード請求額を更新',icon:'card',action:()=>openQuickCardBilling(paymentHomeMonth())},{label:'Gmailを同期',icon:'mail',action:()=>gmailConnected()?syncGmail():openGmailSettings()}])
}
/* === end My Money 3.0 Phase 2 === */


