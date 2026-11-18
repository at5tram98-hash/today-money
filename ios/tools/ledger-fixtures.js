/* iOS 版の支払い計算（TodayMoneyCore/Ledger.swift）の照合データを Web 版の実際の関数で作る。
   使い方: python3 ios/tools/fixture-server.py 8766 で開いたページのコンソールで、このファイルの中身を実行する。
   結果は Fixtures/ledger-compat.json に保存される。 */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),seed=T.getData(),today=E('ymd')(),now=new Date().toISOString();
  const d=JSON.parse(JSON.stringify(seed)),addDays=E('addDays'),addMonths=E('addMonths'),m0=today.slice(0,7);
  d.cards.push({id:'card_t15',company:'テスト',name:'15日締めカード',closingDay:15,dueDay:10,limit:50000,bankId:d.banks[0].id,tagIds:[]});
  d.cards.push({id:'card_t25',company:'テスト',name:'25日締め翌月27日',closingDay:25,dueDay:27,limit:50000,bankId:d.banks[1].id,tagIds:[]});
  d.cards.push({id:'card_t31',company:'テスト',name:'31日締め',closingDay:31,dueDay:5,limit:50000,bankId:d.banks[0].id,tagIds:[]});
  d.cards.push({id:'card_nodue',company:'テスト',name:'引落日なし',closingDay:null,dueDay:null,limit:0,bankId:'',tagIds:[]});
  const tx=(date,amount,method,id,extra={})=>d.transactions.push({id:`tx_fx_${d.transactions.length}`,date,amount,category:'食費',merchant:`店${d.transactions.length}`,paymentMethod:method,paymentId:id,memo:'',source:'manual',createdAt:`${date}T03:00:00.000Z`,...extra});
  for(let i=-75;i<=40;i+=4){const date=addDays(today,i);tx(date,500+i*7+1000,'card','card_t15');tx(date,300+(i%3)*111,'card','card_t25');tx(date,1200,'card','card_seed_smbc');}
  for(let i=-20;i<=5;i+=5)tx(addDays(today,i),800,'bank',d.banks[0].id,{bankApplied:true});
  tx(addDays(today,-2),2500,'other','');tx(addDays(today,-1),-400,'card','card_t31');tx(today,999,'debit',d.debitCards[0].id,{bankReconciled:true});
  d.cardAdjustments[`${addMonths(m0,-1)}|card_t15`]={mode:'confirmed_total',confirmedTotal:12345,baseAtEdit:10000,status:'confirmed',paymentDateOverride:'',confirmedTransactionIds:[],confirmedThroughDate:addDays(`${addMonths(m0,-1)}-15`,-3),confirmedAt:'2026-01-01T00:00:00.000Z'};
  d.cardAdjustments[`${m0}|card_t25`]={baseAtEdit:1000,delta:777,status:'paid',paymentDateOverride:`${addMonths(m0,1)}-03`,paidAmount:1777};
  d.fixedPayments.push({id:'fx_bi',name:'2か月ごと',amount:3000,day:31,frequency:'bimonthly',startMonth:addMonths(m0,-3),paymentMethod:'bank',paymentId:d.banks[0].id,skippedDates:[],tagIds:[]});
  d.fixedPayments.push({id:'fx_year',name:'年払い',amount:12000,day:15,frequency:'yearly',startMonth:addMonths(m0,-14),annualMonth:Number(addMonths(m0,1).slice(5,7)),paymentMethod:'card',paymentId:'card_t15',skippedDates:[],tagIds:[]});
  d.fixedPayments.push({id:'fx_mon',name:'サブスク',amount:980,day:3,frequency:'monthly',startMonth:addMonths(m0,-2),paymentMethod:'card',paymentId:'card_t25',skippedDates:[`${m0}-03`],tagIds:[]});
  d.fixedPayments.push({id:'fx_cash',name:'家賃',amount:40000,day:27,frequency:'monthly',startMonth:addMonths(m0,-6),paymentMethod:'other',paymentId:'',skippedDates:[],tagIds:[]});
  d.largeExpensePlans.push({id:'lg_card',name:'パソコン',date:addDays(today,9),amount:90000,priority:'required',status:'planned',paymentMethod:'card',paymentId:'card_t15',splits:[],atfInstallments:{card_t15:3},atfFee:500,category:'その他',memo:'',linkedBankId:'',tagIds:[]});
  d.largeExpensePlans.push({id:'lg_split',name:'旅行',date:addDays(today,20),amount:50000,priority:'required',status:'planned',paymentMethod:'card',paymentId:'card_t25',splits:[{paymentMethod:'card',paymentId:'card_t25',amount:30000},{paymentMethod:'bank',paymentId:d.banks[0].id,amount:20000}],category:'その他',memo:'',linkedBankId:'',tagIds:[]});
  d.largeExpensePlans.push({id:'lg_opt',name:'任意の買い物',date:addDays(today,3),amount:7000,priority:'optional',status:'planned',paymentMethod:'bank',paymentId:d.banks[0].id,splits:[],category:'その他',memo:'',linkedBankId:'',tagIds:[]});
  d.largeExpensePlans.push({id:'lg_done',name:'済んだ買い物',date:addDays(today,-3),amount:5000,priority:'required',status:'completed',paymentMethod:'bank',paymentId:d.banks[0].id,splits:[],category:'その他',memo:'',linkedBankId:'',tagIds:[]});
  d.dailyCorrections[addDays(today,-2)]=1111;
  await T.replaceData(d);
  const doc=T.getData(),cards=doc.cards,months=Array.from({length:9},(_,i)=>addMonths(m0,i-5)),dates=[`${m0}-01`,`${m0}-15`,`${m0}-16`,`${m0}-25`,`${m0}-26`,`${m0}-${String(E('daysInMonth')(m0)).padStart(2,'0')}`,'2027-02-28','2028-02-29','2026-12-31'];
  const st=x=>({cardId:x.cardId,billingMonth:x.billingMonth,paymentMonth:x.paymentMonth,paymentDate:x.paymentDate,amount:x.amount,status:x.status,plannedAmount:x.plannedAmount??0,outstandingAmount:x.outstandingAmount??null,settledBaseAmount:x.settledBaseAmount??0});
  const fx={today,document:doc};
  fx.cycle=cards.flatMap(c=>months.map(m=>({cardId:c.id,month:m,out:E('billingCycleForCard')(c,m)})));
  fx.purchase=cards.flatMap(c=>dates.map(x=>({cardId:c.id,date:x,out:E('cardBillingMonthForPurchase')(c,x)})));
  fx.payDate=cards.flatMap(c=>months.map(m=>({cardId:c.id,month:m,out:E('cardPaymentDateForBillingMonth')(c,m)})));
  fx.usage=cards.flatMap(c=>months.map(m=>({cardId:c.id,month:m,base:E('cardBaseUsage')(c.id,m),amount:E('acfCardBillingAmount')(c.id,m),newUse:E('cardNewUsageAfterConfirmation')(c.id,m),status:E('cardStatementStatus')(c.id,m)})));
  fx.statements=cards.flatMap(c=>months.map(m=>({cardId:c.id,month:m,out:E('cardStatementsForPaymentMonth')(c.id,m).map(st)})));
  fx.inMonth=months.map(m=>({month:m,out:E('cardPaymentStatementsInMonth')(m).map(st),all:E('cardPaymentStatementsInMonth')(m,{includePaid:true}).map(st)}));
  fx.items=months.map(m=>({month:m,out:E('mm3PaymentCardItems')(m).map(st)}));
  fx.summary=months.map(m=>{const s=E('mm3PaymentSummary')(m),n=E('mm3PaymentNextCard')(s);return{month:m,cardTotal:s.cardTotal,cardPaid:s.cardPaid,plannedCardTotal:s.plannedCardTotal,fixedTotal:s.fixedTotal,fixedPaid:s.fixedPaid,largeTotal:s.largeTotal,largePaid:s.largePaid,otherTotal:s.otherTotal,otherPaid:s.otherPaid,total:s.total,paid:s.paid,remaining:s.remaining,next:n?st(n):null}});
  fx.fixed=doc.fixedPayments.flatMap(f=>months.map(m=>({fixedId:f.id,month:m,out:E('fixedDueDatesInMonth')(f,m)})));
  fx.events=E('financialEventsFrom')(today,90).map(e=>({date:e.date,type:e.type,title:e.title,amount:e.amount,detail:e.detail}));
  fx.nextDue=cards.map(c=>({cardId:c.id,out:E('nextCardDueDate')(c,today)}));
  fx.spentDate=Array.from({length:6},(_,i)=>addDays(today,-i)).map(x=>({date:x,out:E('spentDate')(x)}));
  fx.series=cards.map(c=>({cardId:c.id,out:E('mm3PaymentCardSeries')(c.id,m0,6)}));
  await T.replaceData(seed);
  const r=await fetch('/__fixture/ledger-compat',{method:'POST',body:JSON.stringify(fx)});
  return `${r.status} cycle=${fx.cycle.length} statements=${fx.statements.length} events=${fx.events.length}`;
})()
