/* ホームのハイライト（Highlights.swift）を Web 版 homeHighlights で作る → Fixtures/highlight-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),d=T.getData(),today=E('ymd')();
  const list=E('homeHighlights')().map(h=>({key:h.key,label:h.label,text:h.text,bars:h.bars.map(b=>({label:b.label,value:b.value,unit:b.unit||''}))}));
  const r=await fetch('/__fixture/highlight-compat',{method:'POST',body:JSON.stringify({today,document:d,list})});
  return `${r.status} ${list.map(h=>h.key).join(',')}`;
})()
