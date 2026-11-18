/* 一行入力・電卓の補助・横断検索の照合データ → Fixtures/quick-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),seed=T.getData(),today=E('ymd')();
  const d=JSON.parse(JSON.stringify(seed));
  d.transactions.push({id:'tx_q1',date:E('addDays')(today,-1),amount:780,category:'食費',merchant:'マック',paymentMethod:'card',paymentId:'card_seed_paypay',memo:'',source:'manual',createdAt:'2026-01-01T00:00:00.000Z'});
  d.transactions.push({id:'tx_q2',date:today,amount:450,category:'日用品',merchant:'スーパー玉出',paymentMethod:'bank',paymentId:d.banks[0].id,memo:'',source:'manual',createdAt:'2026-01-02T00:00:00.000Z'});
  d.quickInputRules['ローソン']={category:'食費',paymentMethod:'debit',paymentId:d.debitCards[0].id};
  await T.replaceData(d);
  const lines=['昨日 マック 780円 PayPayカード','今日 JR 230円','11/3 ユニクロ 2,990円 三井住友カード','スタバ ¥650 カード','ローソン 320','2026/10/05 映画 1800円 現金','PayPay カラオケ 1200円','GU 1500円','教科書 3,200円 SBI新生銀行','ランチ','スーパー玉出 450円','2026-02-30 本 900円','一昨日 タクシー 1,480円 Oliveデビットカード'];
  const out={today,document:T.getData(),lines:lines.map(l=>{const x=E('parseQuickExpenseLine')(l,today);return{line:l,date:x.date,amount:x.amount,merchant:x.merchant,category:x.category,paymentMethod:x.paymentMethod,paymentId:x.paymentId,ambiguous:x.paymentAmbiguous,candidates:x.paymentCandidates.map(c=>c.method+'|'+c.id),notes:x.notes,dups:x.duplicateIds.length}})};
  out.calc=[[1000,'discount',10],[999,'discount',15],[1234,'add',8],[5,'add',10],[10000,'split',3],[1001,'split',2],[1000,'split',1],[100,'discount',120]].map(([b,k,v])=>{const r=E('calcAssistResult')(b,k,v);return{base:b,kind:k,value:v,amount:r?r.amount:null,copy:r?r.copy:null}});
  out.search=['','マック','食費','GU','銀行','カード','2026-11'].flatMap(q=>['all','transaction','salary','account','card','goal'].map(t=>({q,t,ids:E('pro4SearchItems')(q,t).map(r=>r.type+'|'+r.id)})));
  await T.replaceData(seed);
  const r=await fetch('/__fixture/quick-compat',{method:'POST',body:JSON.stringify(out)});
  return r.status+' '+JSON.stringify(out.lines.map(x=>[x.merchant,x.category,x.paymentMethod,x.amount]))
})()
