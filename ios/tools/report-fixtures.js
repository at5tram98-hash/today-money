/* PDF 家計レポートの数字（MonthReport.swift）を Web 版 buildPdfReport と同じ式で作る → Fixtures/report-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),orig=T.getData(),today=E('ymd')(),cur=E('ym')();
  const seed=JSON.parse(JSON.stringify(orig)),prev=E('addMonths')(cur,-1),tx=(id,date,amount,merchant,category)=>({id,date,amount,merchant,category,paymentMethod:'cash',paymentId:'',memo:'',createdAt:'2026-11-01T00:00:00.000Z'});
  /* 同じ日が並ぶ・順不同・30件超（2ページ）・手直しあり・収入・目標・大型支出・ACF 有効 */
  for(let i=0;i<30;i++)seed.transactions.push(tx('r'+i,`${cur}-${String(1+(i*7)%15).padStart(2,'0')}`,100+i*37,'店'+i,'食費'));
  seed.transactions.push(tx('p1',prev+'-20',5000,'前の月','娯楽費'),tx('p2',prev+'-03',800,'前の月2','食費'));
  seed.incomes.push({id:'i1',date:cur+'-10',amount:120000,sourceName:'給与',toType:'cash',bankId:'',memo:''},{id:'i2',date:prev+'-25',amount:3000,sourceName:'臨時',toType:'cash',bankId:'',memo:''});
  seed.monthlyCorrections[prev]=7000;seed.monthlyGoals[cur]={total:80000,categories:{}};
  seed.largeExpensePlans.push({id:'lp1',name:'旅行',date:cur+'-28',amount:30000,priority:'optional',status:'planned',paymentMethod:'cash',paymentId:'',linkedBankId:'',splits:[]},{id:'lp2',name:'済',date:cur+'-05',amount:999,priority:'optional',status:'completed',paymentMethod:'cash',paymentId:'',linkedBankId:'',splits:[]});
  seed.acfSettings.initialized=true;await T.replaceData(seed);
  const months=[...new Set([cur,...seed.transactions.map(t=>String(t.date).slice(0,7))])].sort();
  const reports=months.map(month=>{
    const tx=[...E('txForMonth')(month)].sort((a,b)=>a.date.localeCompare(b.date)),raw=E('rawSpentMonth')(month),spent=E('spentMonth')(month);
    const acf=month===cur&&E('data').acfSettings.initialized?E('buildCashFlowForecast')():null;
    return {month,ids:tx.map(t=>t.id),income:E('sum')(E('incomesForMonth')(month),x=>x.amount),rawSpent:raw,spent,correction:spent-raw,goal:E('monthlyGoal')(month).total,
      large:E('sum')(E('data').largeExpensePlans.filter(p=>String(p.date||'').slice(0,7)===month&&p.status==='planned'),p=>p.amount),
      acfMonthEnd:acf?acf.monthEndForecast:null,acfReserveFloor:acf?acf.reserveFloor:null,pages:Math.max(1,Math.ceil(tx.length/24))}});
  const out={today,now:Date.now(),document:T.getData(),reports};await T.replaceData(orig);
  const r=await fetch('/__fixture/report-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} ${reports.map(x=>x.month+':'+x.ids.length+(x.acfMonthEnd!=null?'*':'')).join(' ')}`;
})()
