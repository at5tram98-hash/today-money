/* 月間詳細分析（MonthAnalysis.swift）を Web 版の式で作る → Fixtures/analysis-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),d=T.getData(),today=E('ymd')(),cur=E('ym')(),addMonths=E('addMonths'),spentMonth=E('spentMonth'),mcs=E('monthCategorySpent');
  const out={today,document:d,months:{}};
  for(const m of [addMonths(cur,-1),cur]){
    const prev=spentMonth(addMonths(m,-1)),c=spentMonth(m),ya=spentMonth(addMonths(m,-12));
    out.months[m]={pva:E('planVsActualForMonth')(m),months:[-2,-1,0].map(i=>spentMonth(addMonths(m,i))),change:prev?Math.round((c-prev)/prev*100):0,yoy:ya?Math.round((c-ya)/ya*100):null,
      cats:d.categories.map(x=>({label:x.name,value:mcs(m,x.name)})).sort((a,b)=>b.value-a.value).map(x=>x.label+'|'+x.value),
      top:[...E('txForMonth')(m)].sort((a,b)=>Math.abs(b.amount)-Math.abs(a.amount)).slice(0,5).map(t=>t.id),
      surging:d.categories.filter(x=>{const a=mcs(m,x.name),b=mcs(addMonths(m,-1),x.name);return b&&a/b>=1.4}).map(x=>x.name)}}
  const r=await fetch('/__fixture/analysis-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} ${Object.keys(out.months).map(m=>m+':'+out.months[m].surging.join('/')).join(' ')}`;
})()
