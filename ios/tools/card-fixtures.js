/* カード詳細の数字（CardDashboard.swift）を Web 版の関数で作る → Fixtures/card-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),d=T.getData(),today=E('ymd')(),cur=E('ym')(),addMonths=E('addMonths');
  const months=[-2,-1,0,1,2].map(i=>addMonths(cur,i)),out={today,document:d,cards:{}};
  for(const c of d.cards){const per={};
    for(const m of months){const items=E('cardStatementsForPaymentMonth')(c.id,m);const bm=(items.find(x=>x.status!=='paid')||items[0])?.billingMonth||E('billingMonthForPaymentMonth')(c,m);
      const end=m>=cur?E('monthEndDate')(m):today,ex=E('acfProjectedCardExposureThrough')(c.id,end),adj=E('cardAdjustmentInfo')(c.id,bm);
      per[m]={billingMonth:bm,history:E('cardMonthHistory')(c.id,m,6).map(x=>({month:x.month,amount:x.amount,status:x.status,count:x.count})),
        handling:E('cardStatementBankHandling')(c.id,bm).label,deltaAtEdit:adj?.deltaAtEdit||0,exposureEnd:end,minAvailable:ex.minAvailable,max:ex.max}}
    out.cards[c.id]={unpaid:E('cardUnpaidEstimate')(c.id),months:per}}
  const r=await fetch('/__fixture/card-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} ${d.cards.length} cards ${JSON.stringify(Object.values(out.cards).map(x=>x.unpaid))}`;
})()
