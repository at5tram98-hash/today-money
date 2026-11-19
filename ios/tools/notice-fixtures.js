/* アプリ内のお知らせ（SystemNotices.swift）を Web 版の関数で作る → Fixtures/notice-compat.json。終わったらデータを元に戻す */
(async()=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),today=E('ymd')(),tomorrow=E('addDays')(today,1),yesterday=E('addDays')(today,-1),day=Number(tomorrow.slice(8));
  const orig=T.getData();
  let doc,notices,err='';
  try{
    E(`mm3AllowInternalStateWrite(()=>{data.notices=[];data.notificationSettings={level:'recommended',goal:true,salary:true,payment:true,unknown:true,balance:true};data.acfSettings.riskNotifications=false;
      if(data.cards[0])data.cards[0].dueDay=${day};if(data.employers[0]){data.employers[0].payType='fixed';data.employers[0].payDay=${day};data.employers[0].payMonthOffset=0}
      if(data.fixedPayments[0]){data.fixedPayments[0].frequency='monthly';data.fixedPayments[0].day=${day};data.fixedPayments[0].skippedDates=[]}
      data.dailyGoals['${yesterday}']={total:Math.max(1,spentDate('${yesterday}')-100),categories:{}};data.monthlyGoals[ym()]={...(data.monthlyGoals[ym()]||{}),total:spentMonth(ym())}})`);
    doc=T.getData();
    E('generateSystemNotices()');E(`checkGoalNotice('${yesterday}')`);
    notices=T.getData().notices.map(n=>({title:n.title,message:n.message,type:n.type,key:n.key}));
  }catch(e){err=String(e)}
  finally{E(`mm3AllowInternalStateWrite(()=>{data=${JSON.stringify(orig)}});save()`)}
  if(err)return err;
  const r=await fetch('/__fixture/notice-compat',{method:'POST',body:JSON.stringify({today,yesterday,document:doc,notices})});
  return `${r.status} ${notices.length} ${notices.map(n=>n.title).join(',')}`;
})()
