/* Gmail のメール解析（MailImport.swift）の照合データを Web 版の関数で作る → Fixtures/mail-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),seed=T.getData(),today=E('ymd')();
  const b64=s=>{const bytes=new TextEncoder().encode(s);let bin='';bytes.forEach(b=>bin+=String.fromCharCode(b));return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
  const msg=(id,from,subject,body,{html=false,date='Mon, 16 Nov 2026 10:00:00 +0900',multi=false,internal=''}={})=>{
    const headers=[{name:'From',value:from},{name:'Subject',value:subject}];if(date)headers.push({name:'Date',value:date});
    const part=(mime,txt)=>({mimeType:mime,body:{data:b64(txt)}});
    const payload=multi?{mimeType:'multipart/alternative',headers,parts:[part('text/html','<div>HTMLだけの文</div>'),part('text/plain',body)]}:{mimeType:html?'text/html':'text/plain',headers,body:{data:b64(body)}};
    const m={id,threadId:'th_'+id,payload};if(internal)m.internalDate=internal;return m};
  const msgs=[
    msg('m1','PayPayカード <no-reply@paypay-card.co.jp>','【PayPayカード】ご利用のお知らせ','ご利用日時：2026/11/15 12:34\nご利用金額：1,280円\nご利用先：セブン-イレブン京都店\n'),
    msg('m2','三井住友カード <statement@vpass.ne.jp>','ご利用のお知らせ【三井住友カード】','<p>ご利用日：11/14</p><p>ご利用先：スターバックス&amp;コーヒー</p><p>ご利用金額：480円</p><script>x=1</script>',{html:true}),
    msg('m3','三井住友カード <statement@vpass.ne.jp>','ご利用のお知らせ','明細はVpassでご確認ください'),
    msg('m4','PayPayカード <no-reply@paypay-card.co.jp>','【PayPayカード】ご請求金額確定のお知らせ','ご請求金額：23,456円\nお支払日：2026/11/27'),
    msg('m5','三井住友銀行 <info@smbc.co.jp>','口座引落のお知らせ','引落金額：12,000円\n摘要：三井住友カード'),
    msg('m6','Shop <a@shop.jp>','返金のお知らせ','金額：¥3,000\n利用先：ユニクロ'),
    msg('m7','友だち <f@example.com>','こんにちは','元気？'),
    msg('m8','Olive <x@smbc.co.jp>','デビットカードご利用のお知らせ','ご利用日時 2026年11月10日\nご利用金額 2,200円\nご利用先 ローソン 烏丸店',{multi:true}),
    msg('m9','JCB <info@jcb.co.jp>','カードご利用のお知らせ','ご利用金額：5,000円\n利用先：なぞの店｜カード番号****',{date:'',internal:String(Date.parse('2026-01-03T09:00:00+09:00'))}),
    msg('m10','PayPay銀行 <bank@paypay-bank.co.jp>','口座振替のお知らせ','口座振替額：8,800円\n摘要：関西電力'),
    msg('m11','楽天カード <info@rakuten-card.co.jp>','カード利用速報','12/30 ご利用 金額 15000円 ご利用店：Amazon マーケットプレイス',{date:'Fri, 02 Jan 2026 08:00:00 +0900'})];
  const orig=E('onlineCategorizeMerchant');E('onlineCategorizeMerchant=async()=>null');
  const out={today,messages:msgs,runs:[]};
  for(const sourceIds of [[],['card_seed_paypay']]){
    const d=JSON.parse(JSON.stringify(seed));d.gmailSettings.sourceIds=sourceIds;await T.replaceData(d);
    const parsed=[];for(const m of msgs)parsed.push(await E('parseFinancialMessage')(m));
    out.runs.push({document:T.getData(),parsed});
  }
  globalThis.__restoreOnline=orig;E('onlineCategorizeMerchant=globalThis.__restoreOnline');delete globalThis.__restoreOnline;
  out.confidence=[{amount:0,merchant:'',category:''},{amount:100,merchant:'a',category:'食費',categorySource:'rules'},{amount:100,merchant:'a',category:'食費',categorySource:''}].map(mi=>({mi,c:E('mailReviewConfidence')(mi)}));
  await T.replaceData(seed);
  const r=await fetch('/__fixture/mail-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} ${out.runs[0].parsed.map(p=>p?p.status+':'+p.type:'null').join(' ')}`;
})()
