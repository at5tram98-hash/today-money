/* 追加UI852のうち、巡回では届かなかった要素を1件ずつ確かめる。
   仕様書の観測時と同じ形のデータ（テスト口座1〜4・架空データ、テスト勤務先1・2、テスト店舗 など）に置き換えてから、
   観測画面を開いて（必要なら観測時と同じ操作をして）、仕様のIDごとに該当する要素を探す。
   合格の条件: 見えていて、読み上げ名があり、押せる範囲が44pt以上（チェックボックスは行・ラベルの大きさ）。
   見つけた要素の実際の名前を docs/v11/extra-ui-evidence.csv に書き、scripts/v11/progress.mjs が照合に使う。
   画面を開いて見るだけの段階では、会計データが変わらないことも確かめる。 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, createPage, settle, reset, closeHarness} from './v11-harness.mjs';

const evidence=[],failures=[];
// 表示の状態とお知らせ（取引の件数などから作り直される通知）は会計データではないので比較から外す
const financial=text=>{const d=JSON.parse(text);delete d.homeViewMode;delete d.notices;return JSON.stringify(d)};
const data=page=>page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));
const call=async(page,method,args=[])=>{const ok=await page.evaluate(([m,a])=>globalThis.__mm3Test.call(m,a),[method,args]);await settle(page);return ok};
const click=async(page,selector)=>{const ok=await page.evaluate(sel=>globalThis.__crawl.click(sel),selector);await settle(page);if(!ok)throw new Error(`押せない: ${selector}`)};
const clickName=async(page,re)=>{const ok=await page.evaluate(src=>{const re=new RegExp(src);const el=[...globalThis.__crawl.layer().querySelectorAll('button,[role=button]')].find(e=>globalThis.__crawl.visible(e)&&re.test(globalThis.__crawl.name(e)));if(!el)return false;el.click();return true},re.source);await settle(page);if(!ok)throw new Error(`押せない: ${re}`)};
const alertChoose=async(page,text)=>{await page.locator('#alertWrap.show').waitFor({timeout:4000});await page.locator('#alertActions button',{hasText:text}).first().click();await settle(page)};

/* 観測時のデータ（仕様書の観測で使われた名前と形） */
const observation=()=>{
  const t=globalThis.__mm3Test,d=t.getData(),now=new Date().toISOString(),bank=d.banks[0];
  d.banks.forEach((b,i)=>{b.name=`テスト口座${i+1}`;b.label='架空データ';b.balance=100000+i*10000;b.balanceAsOf=now;b.updatedAt=now});
  d.employers.forEach((e,i)=>{e.name=`テスト勤務先${i+1}`;e.hourly=[1300,1200][i]||1100;e.transport=[840,980][i]||0});
  d.salaryRecords.forEach(r=>{if(r.date>='2026-10-07')r.status='予定'});
  d.tempIncomes=[{id:'obs_temp1',date:'2026-10-05',amount:5000,sourceName:'テスト臨時収入',toType:'cash',bankId:'',memo:'',incomeId:'',receivedConfirmed:false},{id:'obs_temp2',date:'2026-10-20',amount:5000,sourceName:'テスト臨時収入',toType:'cash',bankId:'',memo:'',incomeId:'',receivedConfirmed:false}];
  const tx=(id,merchant,category,amount)=>({id,date:'2026-10-07',amount,category,merchant,paymentMethod:'other',paymentId:'',memo:'',source:'manual',createdAt:now,linkedBankId:'',bankApplied:false,bankReconciled:false,bankEffectAt:now,tagIds:[]});
  d.transactions.push(tx('obs_tx1','テスト店舗','食費',1234),tx('obs_tx2','別店舗','交通費',500),tx('obs_tx3','日締め変更確認店舗','日用品',300));
  const large=(id,date,amount,method)=>({id,name:'テスト大型支出',date,amount,category:'その他',priority:'required',paymentMethod:method,paymentId:method==='bank'?bank.id:'',linkedBankId:'',status:'planned',memo:'',splits:[],createdAt:now,updatedAt:now,tagIds:['audit_tag']});
  d.largeExpensePlans=[large('obs_large1','2026-10-06',2000,'other'),large('obs_large2','2026-10-15',2000,'bank'),large('obs_large3','2026-11-08',2000,'bank')];
  d.acfSettings={...d.acfSettings,initialized:true};
  if(d.fixedPayments[0]){d.fixedPayments[0].name='テスト定期支払';d.fixedPayments[0].tagIds=['audit_tag']}
  d.mailImports=[
    {id:'obs_mail1',date:'2026-10-07',amount:450,merchant:'架空メール店舗',sourceName:'監査用メール',category:'食費',paymentMethod:'other',paymentId:'',status:'pending',direction:'expense',categorySource:'manual'},
    {id:'obs_mail2',date:'2026-10-07',amount:777,merchant:'対象外メール',category:'食費',paymentMethod:'other',paymentId:'',status:'pending',direction:'expense',categorySource:'manual'},
    {id:'obs_mail3',date:'2026-10-07',amount:1234,merchant:'テスト店舗',category:'食費',paymentMethod:'other',paymentId:'',status:'pending',direction:'expense',categorySource:'manual'}];
  d.categories.push({...d.categories[0],id:'obs_cat',name:'監査カテゴリ'});
  d.savedSearches=[{id:'obs_search',name:'テスト店舗',query:'テスト店舗',type:'all',createdAt:now}];
  d.monthlyGoals['2026-10']={...(d.monthlyGoals['2026-10']||{}),total:60000};
  d.savedScenarios=[{id:'obs_scenario',name:'テスト購入',date:'2026-10-07',amount:20000,category:'その他',paymentMethod:'other',paymentId:'',linkedBankId:'',createdAt:now,updatedAt:now}];
  const goal=d.eventGoals.find(g=>g.id==='audit_goal');if(goal){goal.ownShareAmount=1000;goal.items=[{...goal.items[0],budget:2000,status:'planned',transactionId:''}]}
  return t.replaceData(d);
};

const has=(page,re)=>page.evaluate(src=>{const re=new RegExp(src);return [...document.querySelectorAll('button,input,[role=button]')].some(e=>globalThis.__crawl.visible(e)&&re.test(globalThis.__crawl.name(e)))},re.source);
/* 仕様のIDの要素を探す。見えて・名前があり・44pt以上のものだけ合格 */
async function expect(page,ids,{re,sel,note=''}){
  const found=await page.evaluate(([src,sel])=>{
    const c=globalThis.__crawl,re=src?new RegExp(src):null,all='button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=radio],[role=option],[role=menuitem],.push-title,.sheet-title,#alertTitle';
    const list=[...document.querySelectorAll(sel||all)].filter(e=>c.visible(e)&&!e.closest('[aria-hidden=true]'));
    const hit=list.find(e=>re?re.test(c.name(e)):true);if(!hit)return{ok:false,why:'見つからない',near:list.map(e=>c.name(e)).filter(Boolean).slice(0,40)};
    let r=hit.getBoundingClientRect();if(/^(checkbox|radio)$/.test(hit.type||'')){const host=hit.closest('label,.row,.switch-row,.field-row');if(host)r=host.getBoundingClientRect()}
    const heading=hit.matches('.push-title,.sheet-title,#alertTitle'),name=c.name(hit);
    if(!name)return{ok:false,why:'読み上げ名がない'};if(!heading&&(r.width<43.5||r.height<43.5))return{ok:false,why:`44pt未満 ${Math.round(r.width)}×${Math.round(r.height)} 「${name}」`};
    return{ok:true,name,size:`${Math.round(r.width)}×${Math.round(r.height)}`};
  },[re?.source||'',sel||'']);
  for(const id of ids.split(' ')){
    if(found.ok)evidence.push([id,found.name,found.size,note]);
    else failures.push(`${id}: ${found.why}${found.near?' ／ 画面: '+found.near.join(' | ').slice(0,600):''}`);
  }
  console.log(found.ok?'PASS':'FAIL',ids,found.ok?found.name.slice(0,70):found.why);
}
/* 観測時のデータにしてから開く。見るだけの段階で会計データが変わらないことを確認する */
async function screen(page,name,{tab='home',open,checks,readOnly=true}){
  try{
    await reset(page,tab);await page.evaluate(observation);await settle(page);
    const before=await data(page);
    await open(page);
    if(readOnly){const after=await data(page);if(financial(after)!==financial(before)){const A=JSON.parse(financial(before)),B=JSON.parse(financial(after));throw new Error(`開いただけで会計データが変わった: ${Object.keys(B).filter(k=>JSON.stringify(A[k])!==JSON.stringify(B[k])).map(k=>k+' '+JSON.stringify(A[k]).slice(0,200)+' => '+JSON.stringify(B[k]).slice(0,200)).join(' / ')}`)}}
    await checks(page);
  }catch(error){failures.push(`${name}: ${error.message.split('\n')[0]}`);console.log('FAIL',name,error.message.split('\n')[0])}
}

const statementCsv="利用日/キャンセル日,利用店名・商品名,利用金額,支払区分,当月支払金額,当月お支払日\n2026/10/01,監査用カード店舗,1000,1回,1000,2026/10/27\n";

try{
  const {page,context,errors}=await createPage('app',{width:393,appearance:'light'});

  await screen(page,'給与（10月）',{open:p=>p.evaluate(()=>globalThis.__mm3Test.switchTab('pay')).then(()=>settle(p)),checks:async p=>{
    await expect(p,'A8-0121',{re:/^テスト勤務先110月10日（土）・入金予定時給 ¥1,300 ・ 交通費支給 ¥840／勤務¥/});
    await expect(p,'A8-0122',{re:/^テスト勤務先210月25日（日）・入金予定時給 ¥1,200 ・ 交通費支給 ¥980／勤務¥/});
    await expect(p,'A8-0202',{re:/^¥テスト勤務先110月10日（土）・入金予定\+¥[\d,]+あと3日$/});
  }});
  await screen(page,'給与（月ホイールで11月）',{open:async p=>{await p.evaluate(()=>globalThis.__mm3Test.switchTab('pay'));await settle(p);await click(p,'#mm3SalaryMonth');await click(p,'#month-month-11');await click(p,'#monthPickerApply')},checks:async p=>{
    await expect(p,'A8R-0117',{re:/^¥テスト勤務先111月10日（火）・入金予定\+¥[\d,]+あと34日$/});
    await expect(p,'A8R-0118',{re:/^テスト勤務先111月10日（火）・入金予定時給 ¥1,300 ・ 交通費支給 ¥840／勤務¥/});
    await expect(p,'A8R-0119',{re:/^テスト勤務先211月25日（水）・入金予定時給 ¥1,200 ・ 交通費支給 ¥980／勤務¥/});
  }});
  await screen(page,'横断検索',{open:async p=>{await click(p,'#todaySearch');const q=p.locator('#pushLayer .push-view.show input[type=search],#pushLayer .push-view.show input').first();if(await q.count()){await q.fill('テスト店舗');await settle(p)}},checks:async p=>{
    await expect(p,'A8-0223 A8-0277 A8R-0091',{re:/^テスト店舗10月7日（水）・食費・現金・その他¥1,234$/});
  }});
  await screen(page,'最近の支出を再利用',{open:p=>call(p,'openQuickRepeat'),checks:async p=>{
    await expect(p,'A8-0227',{re:/^テスト店舗食費・現金・その他¥1,234$/});
  }});
  await screen(page,'お金のタイムライン',{open:p=>call(p,'openMoneyTimeline',[30]),checks:async p=>{
    await expect(p,'A8-0251',{re:/^テスト大型支出10月15日（木）・終了 ¥[\d,]+−¥[\d,]+$/});
    await expect(p,'A8-0243',{re:/^現在10月7日（水）・終了 ¥[\d,]+−¥[\d,]+$/});
  }});
  await screen(page,'臨時収入の履歴',{open:p=>call(p,'openTempIncomeHistory'),checks:async p=>{
    await expect(p,'A8-0241',{re:/^テスト臨時収入2026-10-05・未入金・手持ち\+¥5,000$/});
    await expect(p,'A8-0242',{re:/^テスト臨時収入2026-10-20・未入金・手持ち\+¥5,000$/});
  }});
  await screen(page,'口座の準備タイムライン',{open:p=>call(p,'openMoneyTimeline',[90,'$bank']),checks:async p=>{
    await expect(p,'A8R-0271',{re:/^テスト大型支出10月15日（木）・終了 ¥[\d,]+−¥2,000$/});
    await expect(p,'A8R-0274',{re:/^テスト大型支出11月8日（日）・終了 ¥[\d,]+−¥2,000$/});
  }});
  await screen(page,'ATF（観測時は名前のなかったカードの利用可能額）',{tab:'payments',open:async p=>{await click(p,'#mm3AtfOpen');await p.locator('#sheet.show [data-atf-card]').first().waitFor({state:'attached',timeout:20000});
    // 観測時と同じく、カードの利用可能額を含む「詳細条件」を開く
    await p.evaluate(()=>{for(const d of document.querySelectorAll('#sheet details'))if(d.querySelector('[data-atf-card]'))d.open=true});await settle(p)},checks:async p=>{
    const n=await p.locator('#sheet.show [data-atf-card]').count();assert.ok(n>=3,`カードの利用可能額の欄が3つ以上（${n}）`);
    for(const [i,ids] of [[0,'A8-0346 A8R-0002'],[1,'A8-0347'],[2,'A8-0348']])await expect(p,ids,{sel:`#sheet.show [data-atf-card]:nth-of-type(1)`,re:new RegExp(`^${await p.locator('#sheet.show [data-atf-card]').nth(i).evaluate(e=>globalThis.__crawl.name(e).replace(/[()（）]/g,'.'))}$`),note:'観測時は名前なし→現在は読み上げ名あり'});
  }});
  await screen(page,'通知（この端末を接続済み）',{tab:'settings',open:async p=>{await p.evaluate(()=>localStorage.setItem('myMoney3_pushDevice_v1',JSON.stringify({token:'audit-token',enrolledAt:new Date().toISOString()})));await call(p,'openNotificationSettings')},checks:async p=>{
    await expect(p,'A8-0446',{sel:'#pushDisable',note:'表示名「この端末の通知を停止」'});
    await expect(p,'A8-0448',{sel:'#pushReconnect',note:'表示名「接続を確認・復旧」'});
    await expect(p,'A8-0449',{sel:'#pushTest',note:'表示名「テスト通知を送る」'});
    await p.evaluate(()=>localStorage.removeItem('myMoney3_pushDevice_v1'));
  }});
  await screen(page,'日締め：照合→承認→ジャーナル→修正→取消',{readOnly:false,open:async p=>{await p.evaluate(()=>{const t=globalThis.__mm3Test,d=t.getData();d.mailImports=[];return t.replaceData(d)});await settle(p);await call(p,'openDayClosing',['2026-10-07'])},checks:async p=>{
    for(let i=0;i<8&&!(await p.locator('#dayReviewClose:visible').count());i++){
      if(await p.locator('[data-close-key]:visible').count()){
        if(!evidence.some(e=>e[0]==='A8R-0157')&&await has(p,/^テスト店舗を照合$/))await expect(p,'A8R-0157',{re:/^テスト店舗を照合$/});
        if(!evidence.some(e=>e[0]==='A8R-0159')&&await has(p,/^日締め変更確認店舗を照合$/))await expect(p,'A8R-0159',{re:/^日締め変更確認店舗を照合$/});
      }
      await p.evaluate(()=>{for(let n=0;n<40;n++){const b=globalThis.__crawl.layer().querySelector('[data-close-key]:not(:checked):not(:disabled),[data-empty-group]:not(:checked)');if(!b)break;b.click()}globalThis.__crawl.click('#dayCloseNext')});await settle(p);
      if(await p.locator('#alertWrap.show').count())await alertChoose(p,'')
    }
    for(const [id,re] of [['A8R-0157',/^テスト店舗を照合$/],['A8R-0159',/^日締め変更確認店舗を照合$/]])if(!evidence.some(e=>e[0]===id))failures.push(`${id}: 日締めの照合段階で見つからない`);
    await p.locator('#dayReviewConfirmed:visible').check();await settle(p);await click(p,'#dayReviewClose');await p.locator('#dayCloseJournal').first().waitFor({timeout:8000});await settle(p);
    await click(p,'#dayCloseJournal');
    await expect(p,'A8R-0011',{re:/^10月7日（水）承認済収入 ¥[\d,]+支出 ¥[\d,]+承認 2026\/10\/7 21:00:00$/});
    await clickName(p,/^10月7日（水）承認済/);await clickName(p,/^この日を確認し直す$/);
    await expect(p,'A8R-0012',{re:/^10月7日（水）に戻る$/});
    await call(p,'openDayClosing',['2026-10-07']);
    await click(p,'#dayCloseModify');
    await expect(p,'A8R-0014',{sel:'#alertActions button',re:/^修正を始める$/});await alertChoose(p,'キャンセル');
    await call(p,'openDayClosingCancellation',['2026-10-07']);const view=p.locator('.day-close-view').last();
    await view.locator('#dayCancelNext').click();await view.locator('#dayCancelReason').selectOption('誤って承認した');await view.locator('#dayCancelAck').check();await view.locator('#dayCancelNext').click();
    await view.locator('#dayCancelConfirm').fill('取消');await view.locator('#dayCancelNext').click();await settle(p);await click(p,'#dayCancelJournal');
    await expect(p,'A8R-0017',{re:/^10月7日（水）取消済収入 ¥[\d,]+支出 ¥[\d,]+承認 2026\/10\/7 21:00:00 · 取消 2026\/10\/7 21:00:00$/});
  }});
  await screen(page,'月間計画の手順',{open:p=>call(p,'openMonthlyGoalPlanner'),checks:async p=>{
    for(let s=0;s<8&&!evidence.some(e=>e[0]==='A8R-0068');s++){await p.evaluate(n=>globalThis.__mm3Test.plannerStep(n),s);await settle(p);if(await p.evaluate(()=>[...document.querySelectorAll('button')].some(b=>globalThis.__crawl.visible(b)&&/^テスト大型支出2026-10-06・必須/.test(globalThis.__crawl.name(b)))))break}
    await expect(p,'A8R-0068',{re:/^テスト大型支出2026-10-06・必須¥2,000$/});
  }});
  await screen(page,'取引一覧',{open:p=>click(p,'#homeAllTransactions'),checks:async p=>{
    await expect(p,'A8R-0092',{re:/^別店舗交通費・現金・その他¥500$/});
  }});
  await screen(page,'旅行・プレゼント',{open:p=>call(p,'openEventGoals'),checks:async p=>{
    await expect(p,'A8R-0172',{re:/期限 11月6日（金）・1費目未回収あり総費用¥2,000自分の最終負担¥1,000支払済み¥0未回収¥1,000$/});
    await call(p,'openEventGoalDetail',['audit_goal']);
    await expect(p,'A8R-0173',{re:/^支出として記録$/});
  }});
  await screen(page,'今日（月間計画の承認後：カテゴリ目標あり）',{tab:'home',readOnly:false,open:async p=>{await p.evaluate(()=>{const t=globalThis.__mm3Test,d=t.getData();d.dailyGoals['2026-10-07']={total:2777,categories:{食費:1000},origin:'monthly'};return t.replaceData(d)});await settle(p);await p.evaluate(()=>globalThis.__mm3Test.renderAll());await settle(p);await click(p,'#homeSpendCard')},checks:async p=>{
    await expect(p,'A8R-0194',{re:/^食費¥[\d,]+目標 ¥1,000・\d+%$/});
  }});
  await screen(page,'ACFカレンダー',{open:p=>call(p,'openAcf'),checks:async p=>{
    await clickName(p,/^カレンダー$/);await p.waitForTimeout(500);await settle(p);
    await expect(p,'A8R-0201',{re:/^10月10日（土）、計画後の残高 ¥[\d,]+、給与$/});
    await expect(p,'A8R-0208',{re:/^10月25日（日）、計画後の残高 ¥[\d,]+、給与$/});
  }});
  await screen(page,'買う前に試す（保存した比較案を開く）',{open:p=>call(p,'openAcfSimulator',['2026-10-07','obs_scenario']),checks:async p=>{
    await p.waitForTimeout(800);await settle(p);
    await expect(p,'A8R-0218',{re:/^比較案に保存$/});
    await expect(p,'A8R-0219',{re:/^予定に追加$/});
  }});
  await screen(page,'メール取引センター',{tab:'payments',open:p=>click(p,'#mm3PaymentMail'),checks:async p=>{
    await expect(p,'A8R-0224',{re:/^架空メール店舗¥4502026-10-07 · 監査用メール現金・その他$/});
    await expect(p,'A8R-0225',{re:/^架空メール店舗を対象外にする$/});
    await expect(p,'A8R-0227',{re:/^対象外メール¥7772026-10-07 · Gmail現金・その他$/});
    await expect(p,'A8R-0228',{re:/^対象外メールを対象外にする$/});
    await expect(p,'A8R-0229',{re:/^テスト店舗¥1,2342026-10-07 · Gmail現金・その他$/});
    await expect(p,'A8R-0230',{re:/^テスト店舗を対象外にする$/});
    await expect(p,'A8R-0231',{re:/^既存取引に紐づける$/});
  }});
  await screen(page,'予算の立て直しを適用→取り消す',{readOnly:false,open:p=>call(p,'openBudgetRebalance'),checks:async p=>{
    await click(p,'#rebalanceApply');await p.waitForTimeout(700);
    await expect(p,'A8R-0278',{sel:'#toastLayer .toast-action',re:/^取り消す$/});
    await click(p,'#toastLayer .toast-action');
  }});
  await screen(page,'セキュリティ（パスコード有効）',{tab:'settings',open:async p=>{await p.evaluate(()=>{const t=globalThis.__mm3Test,d=t.getData();d.security={...d.security,enabled:true,passcode:d.security.passcode||'audit',relock:'immediate'};return t.replaceData(d)});await settle(p);await call(p,'openSecuritySettings')},readOnly:false,checks:async p=>{
    await expect(p,'A8R-0279',{re:/^すぐ/});await expect(p,'A8R-0280',{re:/^1分後/});await expect(p,'A8R-0281',{re:/^しない/});
  }});
  await screen(page,'カテゴリ管理',{tab:'settings',open:p=>click(p,'#categorySettings'),checks:async p=>{
    await expect(p,'A8R-0339',{re:/^監査カテゴリ$/});/* 上下ボタンは利用者の指示で廃止。並べ替えは右の ≡（ドラッグ・矢印キー）1つ */await expect(p,'A8R-0340 A8R-0341',{re:/^監査カテゴリの並べ替え。上下にドラッグ、または上下の矢印キーで移動$/});
  }});
  await screen(page,'保存した検索',{open:async p=>{await click(p,'#todaySearch')},checks:async p=>{
    await expect(p,'A8R-0355',{re:/^テスト店舗テスト店舗$/});
  }});
  await screen(page,'タグの項目',{open:p=>call(p,'openTagItems',['audit_tag']),checks:async p=>{
    await expect(p,'A8R-0377',{re:/^テスト定期支払固定支払い$/});await expect(p,'A8R-0378',{re:/^テスト大型支出大型支出$/});
  }});
  await screen(page,'カード明細の取込→確認→確定→履歴',{tab:'payments',readOnly:false,open:async p=>{
    const card=await p.evaluate(()=>globalThis.__mm3Test.getData().cards.find(c=>/PayPay/.test(c.name))?.id);
    await p.evaluate(id=>globalThis.__mm3Test.call('openCardStatementImport',[id]),card);await settle(p);
    await p.locator('#stmtFile').setInputFiles({name:'audit-paypay.csv',mimeType:'text/csv',buffer:Buffer.from(statementCsv)});await settle(p);await click(p,'#stmtStartReview');
  },checks:async p=>{
    await expect(p,'A8R-0364',{re:/^監査用カード店舗2026-10-01・その他要確認$/});
    await click(p,'[data-stmt-edit]');await p.locator('#stmtRowCat').selectOption('食費');await click(p,'#stmtRowSave');
    await expect(p,'A8R-0365',{re:/^監査用カード店舗2026-10-01・食費分類済み$/});
    await click(p,'#stmtReviewSave');
    await expect(p,'A8R-0366',{re:/^監査用カード店舗2026-10-01・食費分類済み・照合済み$/});
    if(await p.locator('#stmtReviewFinal').count()){await click(p,'#stmtReviewFinal');await p.locator('#stmtFinalize:visible').waitFor({timeout:5000});await click(p,'#stmtFinalize')}
    // 取込の履歴はカードの詳細（請求月）に並ぶ
    const imp=await p.evaluate(()=>globalThis.__mm3Test.getData().cardStatementImports.at(-1));
    await p.evaluate(()=>{globalThis.__mm3Test.closeSheet();for(let i=0;i<6;i++)globalThis.__mm3Test.popView()});await settle(p);
    await p.evaluate(([id,m])=>globalThis.__mm3Test.call('openCardDetail',[id,m]),[imp.cardId,imp.paymentMonth]);await settle(p);
    await expect(p,'A8R-0368',{re:/^PayPayカード・1件audit-paypay\.csv・最終確定済み・10\/7 21:00¥1,000$/});
    await clickName(p,/audit-paypay\.csv・最終確定済み/);await clickName(p,/^明細を見る$/);
    await expect(p,'A8R-0369',{re:/^確定済みカード明細に戻る$/});
  }});

  if(errors.length)failures.push(`JavaScriptエラー: ${[...new Set(errors)].slice(0,3).join(' | ')}`);
  await context.close();
}finally{await closeHarness()}
const cell=v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
writeFileSync(resolve(root,'docs/v11/extra-ui-evidence.csv'),'﻿'+[['追加UI ID','実際の要素の読み上げ名','押せる範囲(pt)','備考'],...evidence].map(r=>r.map(cell).join(',')).join('\n')+'\n');
console.log(`${evidence.length} extra-UI IDs verified, ${failures.length} failed`);for(const f of failures)console.log('FAIL',f.slice(0,900));
if(process.env.MM3_EXTRA_STRICT)assert.equal(failures.length,0);
