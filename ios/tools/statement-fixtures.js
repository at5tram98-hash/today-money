/* カード明細の読み取り（Statements.swift）の照合データを Web 版の関数で作る → Fixtures/statement-compat.json */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),seed=T.getData(),today=E('ymd')();
  const d=JSON.parse(JSON.stringify(seed));
  d.merchantRules=Object.assign({},d.merchantRules,{'いつものパン屋':'食費','ジム会費':'娯楽費','abcマート':'衣服費','テスト':'存在しないカテゴリ'});
  await T.replaceData(d);
  const csv=['利用日/キャンセル日,利用店名・商品名,利用者,支払区分,利用金額,手数料,支払総額,当月支払金額,翌月以降繰越金額,調整額,当月お支払日,決済方法',
    '2026/10/01,セブン－イレブン京都店,本人,1回,"1,280",0,"1,280","1,280",0,0,2026/11/27,カード',
    '2026/10/02,PayPay いつものパン屋,本人,1回,540,0,540,540,0,0,2026/11/27,PayPay',
    '2026/10/02,PayPay いつものパン屋,本人,1回,540,0,540,540,0,0,2026/11/27,PayPay',
    '2026/10/03,"（分割変更）ヨドバシカメラ, 梅田",本人,均等 2/6,"60,000",320,"60,320","10,000","50,000",0,2026/11/27,カード',
    '2026/10/04,ユニクロ四条店,本人,1回,-2990,0,-2990,-2990,0,0,2026/11/27,カード',
    '2026/10/05,なぞの店,家族,1回,１２３４,0,１２３４,１２３４,0,-34,2026/11/27,カード',
    ',,,,,,,,,,,',
    '2026/10/6,JR西日本 ICOCA チャージ,本人,1回,3000,0,3000,3000,0,0,,カード',
    '2026/10/07,ＡＭＡＺＯＮ．ＣＯ．ＪＰ,本人,1回,"2,480",0,"2,480","2,480",0,0,2026/11/27,カード',
    '2026/10/08,"ダブル""クォート""店",本人,1回,100,0,100,100,0,0,2026/11/27,カード'].join('\r\n')+'\r\n';
  const out={today,document:T.getData(),csv};
  out.paypay=await E('parsePayPayStatementCsv')(new File([csv],'paypay.csv',{type:'text/csv'}));
  out.paypayErrors=[];
  for(const bad of ['','a,b\n1,2']){try{await E('parsePayPayStatementCsv')(new File([bad],'x.csv'));out.paypayErrors.push('')}catch(e){out.paypayErrors.push(e.message)}}
  const smbcLines=['三井住友カード ご利用明細','お支払い日 2026年12月10日','お支払い合計額 23,456円',
    '26/10/01 ローソン 烏丸店 650 1 1 650','26/10/02 スターバックス コーヒー 480 1 1 480','26/10/02 スターバックス コーヒー 480 1 1 480',
    '26/10/03 ビックカメラ 有楽町 120,000 12 3 10,000 120,000 0','26/10/04 ＧＵ 河原町 −1,990 1 1 −1,990 返品',
    '26/10/05 ふしぎな店 1,000 1 1 1,000 1,000 0 取消','99/12/31 昔の店 100 1 1 100','合計 23,456'];
  globalThis.pdfjsLib={getDocument:()=>({promise:Promise.resolve({numPages:1,getPage:async()=>({getTextContent:async()=>({items:smbcLines.map((str,i)=>({str,transform:[1,0,0,1,10,800-i*20]}))})})})})};
  out.smbcLines=smbcLines;
  out.smbc=await E('parseSmbcStatementPdf')(new File(['x'],'smbc.pdf',{type:'application/pdf'}));
  delete globalThis.pdfjsLib;
  const merchants=[['セブンイレブン',''],['いつものパン屋 本店',''],['ABC-MART 梅田',''],['テスト',''],['Amazon マーケット',''],['不明','JR西日本 きっぷ'],['ふつうの店','gu 店'],['',''],['ジム会費','']];
  out.categories=merchants.map(([m,c])=>({m,c,cat:E('categoryForMerchant')(m,c)}));
  out.keys=['Ａ Ｂ・C（テスト）\t改行\nあり','【PayPay】 ショップ-1'].map(v=>({v,key:E('normalizeMerchantKey')(v)}));
  await T.replaceData(seed);
  const r=await fetch('/__fixture/statement-compat',{method:'POST',body:JSON.stringify(out)});
  return `${r.status} paypay=${out.paypay.rows.length} smbc=${out.smbc.rows.length} total=${out.smbc.officialTotal}`;
})()
