/* Pro の計算（Pro.swift）の照合データを Web 版の関数で作る → Fixtures/pro-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),seed=T.getData(),today=E('ymd')(),A=E('addDays'),M=E('addMonths'),m0=today.slice(0,7),now=new Date().toISOString();
  const d=JSON.parse(JSON.stringify(seed)),b0=d.banks[0].id,b1=d.banks[1].id;
  const cats=['食費','交通費','日用品','娯楽費','その他'],shops=['コンビニ','スーパー','カフェ','駅','本屋'];let n=0;
  const tx=(date,amount,extra={})=>{n++;d.transactions.push({id:`tx_pro_${String(n).padStart(3,'0')}`,date,amount,category:cats[n%5],merchant:shops[(n*3)%5],paymentMethod:['other','card','bank','debit'][n%4],paymentId:['','card_seed_smbc',b0,d.debitCards[0].id][n%4],memo:'',source:'manual',createdAt:`${date}T01:00:00.000Z`,...extra})};
  for(let i=-75;i<=0;i++){if(i%2===0)tx(A(today,i),200+((i*71)%1300+1300)%1300);if(i%9===0)tx(A(today,i),2800)}
  d.employers[0].bankId=b0;d.employers[1].bankId=b1;
  d.salaryRecords.push({id:'sal_paid',employerId:d.employers[0].id,month:M(m0,-1),date:A(today,-3),gross:52000,transport:0,status:'入金済',receivedAmount:50000,actualReceivedDate:A(today,-2)});
  d.salaryRecords.push({id:'sal_late',employerId:d.employers[1].id,month:M(m0,-1),date:A(today,-1),gross:30000,transport:0,status:'予定'});
  d.fixedPayments.push({id:'fx_rent',name:'家賃',amount:30000,day:27,frequency:'monthly',startMonth:M(m0,-3),paymentMethod:'bank',paymentId:b0,skippedDates:[],tagIds:[]});
  d.largeExpensePlans.push({id:'lg_opt',name:'旅行の積立',date:A(today,10),amount:15000,priority:'optional',status:'planned',paymentMethod:'bank',paymentId:b0,splits:[],category:'その他',memo:'',linkedBankId:'',tagIds:[]});
  d.transferPlans.push({id:'tr1',fromBankId:b0,toBankId:b1,amount:8000,date:A(today,5),status:'planned'});
  d.monthlyGoals[m0]={total:40000,categories:{},daily:{'1':1000,'2':1500}};d.dailyGoals[A(today,2)]={total:2500,categories:{},origin:'daily'};
  d.eventGoals.push({id:'goal_trip',name:'名古屋旅行',type:'travel',deadline:A(today,40),splitMode:'equal',participants:3,ownShareAmount:0,status:'active',items:[{id:'gi1',name:'ホテル',budget:24000,plannedDate:A(today,30),category:'その他',paymentMethod:'card',paymentId:'card_seed_smbc',status:'paid',transactionId:''},{id:'gi2',name:'新幹線',budget:21000,plannedDate:A(today,35),category:'交通費',paymentMethod:'bank',paymentId:b0,status:'planned'},{id:'gi3',name:'取消',budget:5000,plannedDate:A(today,35),category:'その他',paymentMethod:'other',paymentId:'',status:'cancelled'}],createdAt:now});
  d.eventGoals.push({id:'goal_gift',name:'誕生日',type:'gift',deadline:A(today,-2),splitMode:'amount',participants:2,ownShareAmount:3000,status:'active',items:[{id:'gj1',name:'プレゼント',budget:8000,plannedDate:A(today,-3),category:'その他',paymentMethod:'other',paymentId:'',status:'paid'}],createdAt:now});
  d.reimbursements.push({id:'re1',goalId:'goal_gift',amount:2000,date:A(today,-1),status:'received'});
  await T.replaceData(d);
  E('safeCommit')(()=>{E('syncEventGoalPlans')('goal_trip');E('syncEventGoalPlans')('goal_gift')},{label:'fx'});
  const doc=T.getData(),out={today,document:doc};
  out.dims=[];for(const month of [m0,M(m0,-1)])for(const dim of ['category','merchant','weekday','payment'])for(const mode of ['elapsed','full'])out.dims.push({month,dim,mode,rows:E('pro4ExpenseDimensionRows')(month,dim,mode)});
  out.insight=['elapsed','full'].map(mode=>({mode,text:E('pro4ExpenseInsight')(m0,mode)}));
  out.salary=[m0,M(m0,-1),M(m0,1)].map(month=>({month,rows:E('pro4SalaryRows')(month)}));
  out.issues=[m0,M(m0,-1)].map(month=>({month,issues:E('monthReviewIssues')(month).map(i=>({type:i.type,title:i.title,sub:i.sub}))}));
  out.banks=doc.banks.map(b=>{const f=E('pro3BankForecast')(b.id,60);return{bankId:b.id,min:f.minBalance,minDate:f.minDate,end:f.endBalance,rows:f.rows.filter(r=>r.events.length).map(r=>({date:r.date,income:r.income,outflow:r.outflow,labels:r.events.map(e=>e.label),bal:r.forecastBalance}))}});
  out.rebalance=['even','weighted','selected'].map(mode=>{const sel=[A(today,1),A(today,3)].filter(x=>x.startsWith(m0));const p=E('pro3RebalancePlan')(m0,mode,sel);return{mode,selected:sel,plan:p.plan,remaining:p.remaining,past:p.past,chosen:p.chosen,locked:[...p.locked]}});
  out.goals=doc.eventGoals.map(g=>({id:g.id,summary:E('eventGoalSummary')(g)}));
  out.goalPlans=doc.largeExpensePlans.filter(p=>p.goalId).map(p=>({goalItemId:p.goalItemId,name:p.name,date:p.date,amount:p.amount,status:p.status,linkedBankId:p.linkedBankId}));
  const rec=E('salaryAllocationRecommendation')(doc.salaryRecords.find(r=>r.id==='sal_paid'));out.allocation=rec;
  await T.replaceData(seed);
  const r=await fetch('/__fixture/pro-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} dims=${out.dims.length} issues=${out.issues[0].issues.length} alloc=${JSON.stringify(rec)}`;
})()
