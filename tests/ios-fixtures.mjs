/* iOS 版（ios/Packages/TodayMoneyCore）の照合データを作る。
   Web 版の実際の関数で計算した結果を JSON に書き出し、Swift の `swift test` で同じ結果になるか確かめる。
   使い方: MM3_CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/ios-fixtures.mjs */
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPage,closeHarness,root} from './v11-harness.mjs';

const NOW='2026-11-14T08:50:00Z',TODAY='2026-11-14';
const {page}=await createPage('app',{width:393,appearance:'light',clock:NOW,seed:false});
const out=await page.evaluate(async({TODAY})=>{
  const T=globalThis.__mm3Test,E=s=>T.ev(s),seed=T.getData();
  const fx={today:TODAY,now:new Date().toISOString(),document:seed};
  const addMonths=E('addMonths'),addDays=E('addDays'),daysInMonth=E('daysInMonth'),yen=E('yen'),monthLabel=E('monthLabel'),dayLabel=E('dayLabel');
  fx.dates={
    addMonths:[['2026-11',1],['2026-12',1],['2026-01',-1],['2026-11',-14],['2027-03',25]].map(([s,n])=>({s,n,out:addMonths(s,n)})),
    addDays:[['2026-11-14',1],['2026-11-30',1],['2026-12-31',1],['2026-03-01',-1],['2028-02-28',1]].map(([s,n])=>({s,n,out:addDays(s,n)})),
    daysInMonth:['2026-02','2028-02','2026-11','2026-12'].map(m=>({m,out:daysInMonth(m)})),
    yen:[0,1234,-1234,1234.5,-0.4,99999999,1e3].map(n=>({n,out:yen(n)})),
    monthLabel:['2026-11','2027-01'].map(s=>({s,out:monthLabel(s)})),
    dayLabel:['2026-11-14','2026-11-15','2027-01-01'].map(s=>({s,out:dayLabel(s)}))
  };
  const emps=seed.employers,payDate=E('employerPayDate'),workMonth=E('shiftWorkMonth');
  fx.payroll={
    payDate:emps.flatMap(e=>['2026-09','2026-10','2026-11','2026-12','2027-01','2027-02'].map(m=>({employerId:e.id,workMonth:m,out:payDate(e,m)}))),
    workMonth:emps.flatMap(e=>['2026-11-01','2026-11-10','2026-11-11','2026-11-30','2026-12-31'].map(d=>({employerId:e.id,date:d,out:workMonth(e,d)})))
  };
  const parse=E('parseShiftText');
  const texts=['2026-11-15 10:00-18:00 GU\n2026-11-16 17:00-22:00 無印良品','2026/11/15 10:00-18:00 GU','2026年11月15日 10:00〜18:00 ジーユー 新宿店','11/20 09:00-15:00 GU','2/3 10:00-14:00 GU',
    '2026-11-15 22:00-05:00 GU\n2026-11-16 18:00-24:00 無印良品','2026-11-15 00:00-00:00 GU\n2026-11-16 10:00-10:00 無印良品\n2026-11-17 10:00-12:00 GU',
    '2026-11-15 午前10:00-午後6:00 GU\n2026-11-16 9:00 AM-5:30 PM 無印良品','2026-11-15 10:00-18:00 GU\n2026-11-15 10:00-18:00 GU\n2026-11-15 19:00-21:00 GU',
    '２０２６－１１－１５　１０：００－１８：００　ＧＵ','2026-11-15 10:00-18:00 GU | 店舗A, 早番','シフトなし\nabc','[{"date":"2026-11-20","start":"10:00","end":"18:00","title":"GU"},{"date":"bad","start":"1","end":"2"}]',
    '2026-11-15 10:00から18:00 GU;2026-11-16 10:00~16:00 無印良品'];
  fx.parse=texts.map(text=>({text,out:parse(text)}));
  const dur=E('shiftDuration'),gu=emps.find(e=>e.name==='GU'),mu=emps.find(e=>e.name==='無印良品');
  fx.duration=[['10:00','18:00'],['10:00','15:00'],['10:00','13:00'],['10:00','17:00'],['22:00','05:00'],['18:00','24:00'],['21:00','23:30'],['04:00','12:00'],['09:00','21:00']]
    .flatMap(([a,b])=>[{start:a,end:b,rules:gu.breakRules,autoBreak:true},{start:a,end:b,rules:mu.breakRules,autoBreak:true},{start:a,end:b,rules:[],autoBreak:true},{start:a,end:b,rules:[],autoBreak:false}])
    .map(x=>({...x,out:dur(x.start,x.end,x.autoBreak,x.rules)}));
  const est=E('shiftEstimate'),settings=E('shiftSettings')();
  const estTexts=[texts[0],texts[5],texts[8],Array.from({length:40},(_,i)=>{const d=addDays('2026-11-01',i);return `${d} 09:00-18:00 ${i%2?'GU':'無印良品'}`}).join('\n')];
  fx.estimate=estTexts.map(text=>({text,out:est(parse(text),settings).map(g=>({employerId:g.employerId,month:g.month,gross:g.gross,transport:g.transport,transportUncapped:g.transportUncapped??null,minutes:g.minutes,night:g.night,count:g.shifts.length,payDate:g.payDate}))}));
  /* 自動取り込み: 毎回まっさらな初期データから、続けて送られた内容を順に反映する */
  const apply=E('applyShiftsAuto'),view=d=>({salary:d.salaryRecords.map(r=>({employerId:r.employerId,month:r.month,date:r.date,gross:r.gross,transport:r.transport,status:r.status,source:r.source||''})).sort((a,b)=>(a.employerId+a.month+a.date).localeCompare(b.employerId+b.month+b.date)),plans:d.shiftPlans.map(p=>({employerId:p.employerId,date:p.date,start:p.start,end:p.end,pay:p.pay})).sort((a,b)=>(a.date+a.start+a.employerId).localeCompare(b.date+b.start+b.employerId))});
  const scenarios=[
    {name:'作成',steps:['2026-11-15 10:00-18:00 GU\n2026-11-16 17:00-22:00 無印良品\n2026-11-25 18:00-23:30 GU\n2026-12-05 09:00-17:00 無印良品\n2026-11-17 09:00-10:00 歯医者']},
    {name:'入れ替え・消えた月',steps:['2026-11-15 10:00-18:00 GU\n2026-12-03 10:00-18:00 GU','2026-11-16 10:00-15:00 GU']},
    {name:'同じ日2回・終日',steps:['2026-11-15 10:00-14:00 GU\n2026-11-15 17:00-21:00 GU\n2026-11-16 00:00-00:00 GU']},
    {name:'手入力は7日間そのまま',manual:{employer:'GU',month:'2026-11',gross:20000,daysAgo:2},steps:['2026-11-15 10:00-18:00 GU']},
    {name:'手入力8日後は自動',manual:{employer:'GU',month:'2026-11',gross:20000,daysAgo:8},steps:['2026-11-15 10:00-18:00 GU']},
    {name:'入金済みは変えない',paid:{employer:'無印良品',month:'2026-12'},steps:['2026-11-16 10:00-18:00 無印良品']}
  ];
  fx.sync=[];
  for(const sc of scenarios){
    const d=JSON.parse(JSON.stringify(seed));const eid=n=>d.employers.find(e=>e.name===n).id;
    if(sc.manual)d.salaryRecords.push({id:'manual_test',employerId:eid(sc.manual.employer),month:sc.manual.month,date:'2026-12-10',gross:sc.manual.gross,transport:0,status:'予定',source:'manual',manualAt:new Date(Date.now()-sc.manual.daysAgo*864e5).toISOString()});
    if(sc.paid)d.salaryRecords.push({id:'paid_test',employerId:eid(sc.paid.employer),month:sc.paid.month,date:'2026-12-25',gross:50000,transport:0,status:'入金済',receivedAmount:50000,actualReceivedDate:'2026-11-14'});
    await T.replaceData(d);const initial=T.getData();const results=[];
    for(const text of sc.steps){const r=apply(parse(text));results.push({count:r.count,total:r.total,unmatched:r.unmatched,states:r.results.map(x=>`${x.g.employerId}|${x.g.month}=${x.state}`),...view(T.getData())})}
    fx.sync.push({name:sc.name,document:initial,steps:sc.steps,results});
  }
  await T.replaceData(seed);
  /* 月の給与のまとめ（初期データ＋入金済み・臨時収入の例） */
  const d=JSON.parse(JSON.stringify(seed));
  d.salaryRecords.push({id:'s_paid_late',employerId:d.employers[0].id,month:'2026-08',date:'2026-09-10',gross:30000,transport:0,status:'入金済',receivedAmount:28000,actualReceivedDate:'2026-10-02'});
  d.tempIncomes.push({id:'t1',date:'2026-11-20',amount:8000,sourceName:'臨時',receivedConfirmed:false},{id:'t2',date:'2026-11-02',amount:3000,sourceName:'返金',receivedConfirmed:true},{id:'t3',date:'2026-11-03',amount:1000,sourceName:'未確認'});
  await T.replaceData(d);const sum=E('mm3SalaryMonthSummary'),payable=E('salaryRecordsPayableInMonth'),spent=E('spentMonth'),bank=E('totalBankBalance');
  fx.summary={document:T.getData(),months:['2026-09','2026-10','2026-11','2026-12','2027-01'].map(m=>{const s=sum(m);return{month:m,received:s.received,overdue:s.overdue,planned:s.planned,total:s.total,tempTotal:s.tempTotal,records:s.records.map(r=>r.id),payable:payable(m).map(r=>r.id).sort()}})};
  fx.spending={months:['2026-09','2026-10','2026-11'].map(m=>({month:m,out:spent(m)})),totalBankBalance:bank()};
  await T.replaceData(seed);
  return fx;
},{TODAY});
const file=resolve(root,'ios/Packages/TodayMoneyCore/Tests/TodayMoneyCoreTests/Fixtures/web-compat.json');
writeFileSync(file,JSON.stringify(out,null,1)+'\n');
console.log('wrote',file,'parse',out.parse.length,'duration',out.duration.length,'sync',out.sync.length);
await closeHarness();
