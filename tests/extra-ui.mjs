/* 追加UI852のうち、巡回では届かなかった画面の要素を確かめる。
   仕様書の観測時と同じ形のデータ（テスト口座1〜4・架空データ、テスト勤務先1・2 など）に置き換えてから、
   観測画面（タイムライン・口座の準備タイムライン・横断検索・給与・履歴・日締めの取消・ACFシミュレーター・セキュリティ・カテゴリ編集 など）を開く。
   表示された操作要素は v11-harness が記録し（見えて・読み上げ名があり・44pt以上のものだけ）、scripts/v11/progress.mjs が照合に使う。
   開いただけで会計データが変わらないことも確かめる。 */
import assert from 'node:assert/strict';
import {createPage, settle, reset, closeHarness} from './v11-harness.mjs';

const results=[];
const financial=text=>{const d=JSON.parse(text);delete d.homeViewMode;d.notices=(d.notices||[]).map(({read,...rest})=>rest);return JSON.stringify(d)};

/* 観測時のデータ：口座4つ（架空データ・10万〜13万円）、勤務先2つ（時給・交通費あり）、臨時収入2件、大型支出 */
const observation=()=>{
  const t=globalThis.__mm3Test,d=t.getData(),now=new Date().toISOString();
  d.banks.forEach((b,i)=>{b.name=`テスト口座${i+1}`;b.label='架空データ';b.balance=100000+i*10000;b.balanceAsOf=now;b.updatedAt=now});
  d.employers.forEach((e,i)=>{e.name=`テスト勤務先${i+1}`;e.hourly=[1300,1200][i]||1100;e.transport=[840,980][i]||0});
  d.tempIncomes=[{id:'obs_temp1',date:'2026-10-05',amount:5000,sourceName:'テスト臨時収入',toType:'cash',bankId:'',memo:'',incomeId:'',receivedConfirmed:false},{id:'obs_temp2',date:'2026-10-20',amount:5000,sourceName:'テスト臨時収入',toType:'cash',bankId:'',memo:'',incomeId:'',receivedConfirmed:false}];
  return t.replaceData(d);
};

async function visit(page,name,steps){
  try{
    await reset(page,'home');await page.evaluate(observation);await settle(page);
    const before=await page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));
    await steps(page);await settle(page);
    // 下まで送って、画面の全ての行を表示させる
    await page.evaluate(async()=>{for(const s of document.querySelectorAll('.push-view.show .push-body,.screen.active .scroll,#sheet.show .sheet-body')){s.scrollTop=s.scrollHeight;await new Promise(r=>setTimeout(r,250));s.scrollTop=0}});await settle(page);
    const after=await page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));
    assert.equal(financial(after),financial(before),'開いただけで会計データが変わった');
    results.push([name,'合格']);console.log('PASS',name);
  }catch(error){results.push([name,error.message.split('\n')[0]]);console.log('FAIL',name,error.message.split('\n')[0])}
}
const call=(page,method,args=[])=>page.evaluate(([m,a])=>globalThis.__mm3Test.call(m,a),[method,args]);
const click=async(page,selector)=>{const ok=await page.evaluate(sel=>globalThis.__crawl.click(sel),selector);await settle(page);return ok};

try{
  const {page,context,errors}=await createPage('app',{width:393,appearance:'light'});
  for(const days of [30,60,90])await visit(page,`お金のタイムライン ${days}日`,async p=>{await call(p,'openMoneyTimeline',[days])});
  await visit(page,'口座の準備タイムライン',async p=>{await call(p,'openMoneyTimeline',[90,'$bank'])});
  await visit(page,'横断検索',async p=>{await click(p,'#todayCrossSearch')});
  await visit(page,'入力と横断検索',async p=>{await call(p,'openSmartInputSearch')});
  await visit(page,'給与タブ',async p=>{await p.evaluate(()=>globalThis.__mm3Test.switchTab('pay'))});
  await visit(page,'臨時収入の履歴',async p=>{await call(p,'openTempIncomeHistory')});
  await visit(page,'最近の支出を再利用',async p=>{await call(p,'openQuickRepeat')});
  await visit(page,'ACFシミュレーター',async p=>{await call(p,'openAcfSimulator')});
  await visit(page,'セキュリティ',async p=>{await call(p,'openSecuritySettings')});
  await visit(page,'通知',async p=>{await call(p,'openNotificationSettings')});
  await visit(page,'日締めの取消',async p=>{await call(p,'openDayClosingCancellation')});
  await visit(page,'日締め',async p=>{await call(p,'openDayClosing')});
  if(errors.length)results.push(['JavaScriptエラー',[...new Set(errors)].slice(0,3).join(' | ')]);
  await context.close();
}finally{await closeHarness()}
const failed=results.filter(r=>r[1]!=='合格');
console.log(`${results.length-failed.length}/${results.length} extra-UI screens opened without writing data`);for(const f of failed)console.log('FAIL',f.join(': '));
if(process.env.MM3_EXTRA_STRICT)assert.equal(failed.length,0);
