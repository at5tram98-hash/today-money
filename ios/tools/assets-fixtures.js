/* 資産画面の数字（Assets.swift）を Web 版の関数で作る → Fixtures/assets-compat.json（6か月分の残高履歴があるデータで） */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),d=T.getData(),today=E('ymd')();
  const ids=d.banks.map(b=>b.id);
  const series={},deltas={};for(const id of ids){series[id]={};deltas[id]={};for(const n of [7,31,93,186,365,366]){series[id][n]=E('bankSnapshotSeries')(id,n).map(p=>({date:p.date,value:p.value}));deltas[id][n]=E('bankDeltaInfo')(id,n)}}
  const ranges={};for(const r of ['1W','1M','3M','6M','1Y','ALL'])ranges[r]=E('mm3AssetActualPoints')(r);
  const sorts={};for(const m of ['balance-desc','balance-asc','updated','name']){E(`mm3AssetSortMode='${m}'`);sorts[m]=E('mm3AssetSortedBanks')().map(b=>b.id)}E(`mm3AssetSortMode='balance-desc'`);
  const details={};for(const id of ids){details[id]={};for(const p of ['1w','1m','3m','6m','1y']){const m=E('bankDetailData')(id,p);details[id][p]={points:m.points.map(x=>({date:x.date,value:x.value})),delta:m.delta,periodIn:m.periodIn,periodOut:m.periodOut,reserved:m.reserved,free:m.free,related:m.related.map(x=>[x.date,x.label,x.amount])}}}
  const out={today,document:d,all:E('mm3AssetAllHistoryPoints')(),ranges,series,deltas,current:E('mm3AssetCurrentDelta')(),parts:E('homeBankParts')(),sorts,details};
  const r=await fetch('/__fixture/assets-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} all=${out.all.length} 1M=${ranges['1M'].length}`;
})()
