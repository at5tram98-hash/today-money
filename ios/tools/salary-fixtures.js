/* 給与画面の数字（SalaryDashboard.swift）を Web 版の関数で作る → Fixtures/salary-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),d=T.getData(),today=E('ymd')(),cur=E('ym')(),addMonths=E('addMonths');
  const months=[-3,-2,-1,0,1].map(i=>addMonths(cur,i)),out={today,document:d,months:{}};
  for(const m of months){const s=E('mm3SalaryMonthSummary')(m);
    const rows=d.employers.map(e=>{const recs=s.records.filter(r=>r.employerId===e.id),next=recs.find(r=>E('salaryRecordDisplayStatus')(r)!=='入金済み')||recs[0];return{id:e.id,amount:recs.reduce((a,r)=>a+E('salaryRecordExpectedOrReceivedAmount')(r),0),status:E('salaryGroupDisplayStatus')(recs),date:next?(E('salaryRecordEffectiveDate')(next)||next.date):'',series:E('mm3SalaryEmployerSeries')(e.id,m)}});
    const trend={};for(const r of ['1M','3M','6M','1Y','ALL']){E(`mm3SalaryTrendRange='${r}'`);trend[r]=E('mm3SalaryRangeMonths')(m,r).map(x=>({month:x,value:E('mm3SalaryMonthSummary')(x).total}))}E(`mm3SalaryTrendRange='3M'`);
    out.months[m]={total:s.total,received:s.received,planned:s.planned,overdue:s.overdue,delta:E('mm3SalaryMonthDelta')(m,s.total),composition:E('mm3SalaryComposition')(s).map(x=>({id:x.id,name:x.name,amount:x.amount,pct:x.pct})),rows,trend}}
  const r=await fetch('/__fixture/salary-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} ${months.map(m=>m+':'+out.months[m].composition.map(x=>x.pct).join('/')).join(' ')}`;
})()
