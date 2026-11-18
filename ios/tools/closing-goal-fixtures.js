/* 日締め（DayClosing.swift）と目標計画（GoalPlanner.swift）の照合データを Web 版の関数で作る。
   python3 ios/tools/fixture-server.py 8766 で開いたページのコンソールで実行 → Fixtures/closing-goal-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),seed=T.getData(),today=E('ymd')(),addDays=E('addDays'),addMonths=E('addMonths'),m0=today.slice(0,7);
  const d=JSON.parse(JSON.stringify(seed)),b0=d.banks[0].id,deb=d.debitCards[0].id;
  const cats=['食費','交通費','日用品','娯楽費','その他'];let n=0;
  const tx=(date,amount,extra={})=>d.transactions.push({id:`tx_cg_${String(n++).padStart(3,'0')}`,date,amount,category:cats[n%cats.length],merchant:`店${n}`,paymentMethod:n%4===0?'card':n%4===1?'bank':'other',paymentId:n%4===0?'card_seed_smbc':n%4===1?b0:'',memo:n%5?'':'メモ',source:'manual',createdAt:`${date}T02:00:00.000Z`,...extra});
  for(let i=-95;i<=0;i++){if(i%2===0)tx(addDays(today,i),300+((i*53)%900+900)%900);if(i%7===0)tx(addDays(today,i),1500)}
  tx(addDays(today,-1),-200,{merchant:'返金'});
  d.incomes.push({id:'inc_cg_1',date:addDays(today,-1),amount:5000,sourceName:'単発',toType:'bank',bankId:b0,memo:'',bankApplied:true,createdAt:'2026-01-01T00:00:00.000Z'});
  d.incomes.push({id:'inc_cg_2',date:today,amount:1200,sourceName:'返金',toType:'cash',bankId:''});
  d.mailImports.push({id:'mail_cg_1',date:addDays(today,-2),amount:880,merchant:'メール店',category:'食費',paymentMethod:'card',paymentId:'card_seed_smbc',status:'pending',direction:'expense'});
  d.mailImports.push({id:'mail_cg_2',date:addDays(today,-1),amount:300,merchant:'店X',status:'imported',transactionId:d.transactions.find(t=>t.date===addDays(today,-1)).id});
  d.dailyCorrections[addDays(today,-3)]=4321;
  d.dailyGoals[addDays(today,-1)]={total:3000,categories:{'食費':2000,'交通費':500},origin:'daily'};
  d.dailyGoals[addDays(today,2)]={total:2500,categories:{},origin:'daily'};
  d.monthlyGoals[m0]={total:60000,categories:{'食費':30000},daily:{'1':2000}};
  await T.replaceData(d);
  const doc=T.getData(),out={today,document:doc,closing:[],goal:{}};
  for(let i=-7;i<=0;i++){const date=addDays(today,i),items=E('dayClosingReviewItems')(date);out.closing.push({date,signature:E('dayClosingSignature')(date),approval:E('dayClosingApprovalSignature')(date),status:E('dayClosingStatus')(date),
    items:Object.fromEntries(['income','mail','ordinary','banks'].map(g=>[g,items[g].map(x=>({key:x.key,fingerprint:x.fingerprint,pending:!!x.pending}))]))})}
  out.bankSignature=E('dayClosingBankSignature')();
  /* 承認と取消（Web 版の記録の形） */
  const y=addDays(today,-1),items=E('dayClosingReviewItems')(y),review={date:y,checks:{},emptyGroups:[],signature:E('dayClosingApprovalSignature')(y)};
  for(const g of ['income','mail','ordinary','banks']){if(!items[g].length)review.emptyGroups.push(g);for(const x of items[g])review.checks[x.key]=x.fingerprint}
  E('safeCommit')(()=>E('recordDayClosing')(y,{review}),{label:'fx'});
  out.closedRecord=T.getData().dayClosings[y];out.statusAfterClose=E('dayClosingStatus')(y);
  /* 目標 */
  const G=out.goal;
  G.recDaily=E('goalRecommendation')('daily',today);G.recMonthly=E('goalRecommendation')('monthly',m0);G.recNext=E('goalRecommendation')('monthly',addMonths(m0,1));
  G.plan0=E('buildMonthlyDailyPlan')(m0,60000,{'1':2000});G.planNext=E('buildMonthlyDailyPlan')(addMonths(m0,1),45000,{});
  const st=E('createGoalPlanner')('monthly',m0);G.created={total:st.draft.total,categories:st.draft.categories,dailyPlan:st.draft.dailyPlan,locks:Object.keys(st.draft.dailyLocks)};
  st.draft.total=72000;st.draft.dailyPlanNeedsRebuild=true;E('ensureGoalDailyPlan')(st);G.rebuilt=st.draft.dailyPlan;
  G.target=E('goalPlannerTarget')(st);
  const day=addDays(today,3)<=`${m0}-31`&&addDays(today,3).startsWith(m0)?addDays(today,3):today;
  G.rebalanceDate=day;G.rebalance=E('goalPlannerRebalancePreview')(st,day,5000).next;
  const stN=E('createGoalPlanner')('monthly',addMonths(m0,1));G.createdNext={total:stN.draft.total,dailyPlan:stN.draft.dailyPlan};
  const stD=E('createGoalPlanner')('daily',today);G.createdDaily={total:stD.draft.total,categories:stD.draft.categories};
  E('commitGoalPlan')(st);G.committed={monthlyGoals:T.getData().monthlyGoals[m0],dailyGoals:T.getData().dailyGoals};
  await T.replaceData(seed);
  const r=await fetch('/__fixture/closing-goal-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} closing=${out.closing.length} status=${out.statusAfterClose} rec=${G.recMonthly.base}`;
})()
