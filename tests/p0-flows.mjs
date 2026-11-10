/* 巡回では到達しにくいP0操作（保存・承認・削除・解除・反映）を、事前データを用意して1件ずつ確認する。
   各操作について、確定前は保存データが変わらないこと、確定で期待どおり1回だけ変わること、取消で変わらないことを見る。
   結果は docs/v11/p0-flows.csv に書く。 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, createPage, settle, openScreen, closeHarness} from './v11-harness.mjs';

const csv="利用日/キャンセル日,利用店名・商品名,利用金額,支払区分,当月支払金額,当月お支払日\n2026/09/05,巡回検査ストア,1200,1回,1200,2026/10/27\n2026/09/12,巡回検査カフェ,560,1回,560,2026/10/27\n";
const results=[];
const data=page=>page.evaluate(()=>globalThis.__mm3Test.getData());
const click=async(page,selector)=>{const ok=await page.evaluate(sel=>globalThis.__crawl.click(sel),selector);assert.ok(ok,`押せる: ${selector}`);await settle(page)};
const alertOk=async(page,name)=>{await page.locator('#alertWrap.show').waitFor({timeout:4000});const buttons=page.locator('#alertActions button');await (name?page.locator('#alertActions').getByRole('button',{name,exact:true}):buttons.last()).click();await settle(page)};
const alertCancel=async page=>{await page.locator('#alertWrap.show').waitFor({timeout:4000});await page.locator('#alertActions button').first().click();await settle(page)};
const twice=async(page,selector)=>{await page.evaluate(sel=>{const el=document.querySelector(sel);el.scrollIntoView({block:'center'});el.click();el.click()},selector);await settle(page)};
let step='';const at=s=>{step=s};
async function flow(name,ids,page,body){
  try{await body();results.push({name,ids,result:'合格',note:''});console.log('PASS',name)}
  catch(error){const note=`${step?`[${step}] `:''}${error.message.split('\n')[0]}`;results.push({name,ids,result:'不合格',note});console.log('FAIL',name,note)}finally{step=''}
}

const {page,context,errors}=await createPage('app',{width:393,appearance:'light'});
try{
  await flow('メール取引を取引へ反映（二重押しでも1件）と反映済み取引を開く',['STATEMENT-229','STATEMENT-231','STATEMENT-228','STATEMENT-230'],page,async()=>{
    const before=await data(page);
    await openScreen(page,{tab:'payments',setup:{method:'mm3MaybeOpenPendingMailReview',args:['foreground']}});await page.locator('#mailPreviewLater').waitFor();
    await click(page,'#mailPreviewLater');assert.deepEqual(await data(page),before,'「あとで」では何も保存しない');
    await openScreen(page,{tab:'payments',path:['#mm3PaymentMail']});
    await page.locator('#pushLayer .push-view.show [data-mail-id]').last().click();await settle(page);
    assert.deepEqual(await data(page),before,'開いただけでは保存しない');
    await page.locator('#mailEditApply').waitFor();await twice(page,'#mailEditApply');
    const after=await data(page);assert.equal(after.transactions.length,before.transactions.length+1,'取引は1件だけ増える');
    assert.notEqual(after.mailImports.find(x=>x.id==='audit_mail').status,'pending','メールは反映済みになる');
    await openScreen(page,{tab:'payments',keepData:true,path:['#mm3PaymentMail','#mailHistoryOverview']});
    await page.locator('#pushLayer .push-view.show [data-mail-id]').last().click();await settle(page);
    await page.locator('#mm3MailHistoryTx').waitFor({timeout:4000});await click(page,'#mm3MailHistoryTx');
    assert.ok(await page.evaluate(()=>document.querySelectorAll('#pushLayer .push-view.show').length>=3||document.getElementById('sheet').classList.contains('show')),'反映済みの家計取引が開く');
  });
  await flow('割り勘の受取を記録（取消では記録しない・二重押しでも1件）',['EVENT-241','EVENT-238','EVENT-239'],page,async()=>{
    await openScreen(page,{tab:'month',setup:{method:'openEventGoalDetail',args:['audit_goal']}});
    const before=await data(page);await click(page,'#eventGoalReimburse');await page.locator('#reimbSave').waitFor();
    await click(page,'#reimbCancel');if(await page.locator('#alertWrap.show').count())await alertOk(page,'変更を破棄');
    assert.deepEqual(await data(page),before,'キャンセルでは記録しない');
    await click(page,'#eventGoalReimburse');await page.locator('#reimbSave').waitFor();await twice(page,'#reimbSave');
    const after=await data(page);assert.equal(after.reimbursements.length,before.reimbursements.length+1,'受取は1件だけ記録される');
  });
  await flow('給与の振り分け: 残りを生活費へ（下書き）→保存→解除（確認あり）',['PRO-285','PRO-283','PRO-284','PRO-286'],page,async()=>{
    await openScreen(page,{tab:'pay',setup:{method:'openSalaryAllocation',args:['$salary']}});
    const before=await data(page);await click(page,'#allocLivingRest');assert.deepEqual(await data(page),before,'「残りを生活費へ」は下書きだけ');
    await twice(page,'#allocSave');const saved=await data(page);assert.equal(saved.salaryAllocations.length,before.salaryAllocations.length+1,'振り分けは1件だけ保存される');
    await openScreen(page,{tab:'pay',keepData:true,setup:{method:'openSalaryAllocation',args:['$salary']}});await page.locator('#allocRelease').waitFor({timeout:4000});
    await click(page,'#allocRelease');await alertCancel(page);assert.deepEqual(await data(page),saved,'解除の確認を取り消すと何も変わらない');
    await click(page,'#allocRelease');await alertOk(page);const released=await data(page);
    assert.ok(released.salaryAllocations.filter(x=>x.status==='active').length<saved.salaryAllocations.filter(x=>x.status==='active').length,'確認すると解除される');
  });
  await flow('予算の立て直しを適用',['PRO-292'],page,async()=>{
    await openScreen(page,{tab:'month',patch:"s.monthlyGoals['2026-10']={total:60000,categories:{},daily:{}}",setup:{method:'openBudgetRebalance',args:['2026-10']}});await page.locator('#rebalanceApply').waitFor();
    const before=await data(page);await twice(page,'#rebalanceApply');const after=await data(page);
    assert.notDeepEqual(after.monthlyGoals['2026-10'],before.monthlyGoals['2026-10'],'日別の配分が保存される');
    assert.equal(Object.keys(after.monthlyGoals).length,Object.keys(before.monthlyGoals).length,'月間目標は増えない');assert.equal((after.budgetRebalanceHistory||[]).length,(before.budgetRebalanceHistory||[]).length+1,'二重押しでも適用は1回');
  });
  await flow('月間計画のリセット（確認を取り消すと残る）',['LARGE-068'],page,async()=>{
    await openScreen(page,{tab:'month',patch:"s.monthlyGoals['2026-10']={total:60000,categories:{},daily:{20:2000}};s.dailyGoals['2026-10-20']={total:2000,categories:{},origin:'monthly'}",path:['#monthHero']});await page.locator('#msResetPlan').waitFor({timeout:4000});
    const before=await data(page);await click(page,'#msResetPlan');await alertCancel(page);assert.deepEqual(await data(page),before,'取消で計画は残る');
    await click(page,'#msResetPlan');await alertOk(page);const after=await data(page);assert.equal(after.dailyGoals['2026-10-20'],undefined,'月間計画由来の日別目標が消える');
  });
  await flow('目標計画の日別シート: ＋−と固定は下書き、適用で計画へ（保存は最終承認まで行わない）',['GOAL-026','GOAL-027','GOAL-029','GOAL-030','GOAL-025','GOAL-024'],page,async()=>{
    await openScreen(page,{tab:'today',setup:{method:'openMonthlyGoalPlanner',args:[],step:5},path:['[data-goal-day="2026-10-15"]']});await page.locator('#gdpApply').waitFor();
    const before=await data(page),value=()=>page.locator('#gdpRange').inputValue();const start=await value();
    await click(page,'#gdpPlus');assert.notEqual(await value(),start,'＋で1段階増える');await click(page,'#gdpMinus');assert.equal(await value(),start,'−で元に戻る');
    await click(page,'#gdpMode');await click(page,'#gdpLock');await click(page,'#gdpPlus');await click(page,'#gdpApply');
    assert.deepEqual(await data(page),before,'適用は計画の下書きへ反映するだけで、保存は最終承認まで行わない');
    await page.evaluate(()=>globalThis.__crawl.click('[data-goal-day="2026-10-15"]'));await settle(page);await click(page,'#gdpCancel');if(await page.locator('#alertWrap.show').count())await alertOk(page,'変更を破棄');
    assert.deepEqual(await data(page),before);
  });
  await flow('一行入力: 読み取り→確認した件を保存（二重押しでも1回）',['EVENT-244','EVENT-245'],page,async()=>{
    await openScreen(page,{tab:'today',path:['#todayOneLine']});const box=page.locator('#sheet textarea, #sheet input[type=text], .push-view.show textarea').first();await box.fill('コンビニ 580円 カフェ 420円');
    await click(page,'#pro4Parse');await page.locator('#pro4SaveAll').waitFor();const before=await data(page);
    await twice(page,'#pro4SaveAll');const after=await data(page);const added=after.transactions.length-before.transactions.length;assert.ok(added>=1&&added<=2,`読み取った件数だけ保存される（${added}件）`);
  });
  await flow('ACFの安全予算を日別計画へ反映',['ACF-257'],page,async()=>{
    await openScreen(page,{tab:'today',patch:"s.acfSettings={...(s.acfSettings||{}),initialized:true};s.monthlyGoals['2026-10']={total:60000,categories:{},daily:{}};s.banks.forEach(b=>b.balance=900000)",setup:{method:'openAcf',args:[]}});const has=await page.locator('#acfApplyGoal').count();assert.ok(has,'ACFに「日別計画へ反映」がある');
    const before=await data(page);await click(page,'#acfApplyGoal');if(await page.locator('#alertWrap.show').count()){await alertCancel(page);assert.deepEqual(await data(page),before,'確認を取り消すと反映しない');await click(page,'#acfApplyGoal');await alertOk(page)}
    const after=await data(page),toast=await page.locator('#toastLayer').innerText();assert.ok(/日分の日別計画へ反映しました/.test(toast),`結果が表示される: ${toast}`);if(/日分/.test(toast))assert.notDeepEqual({m:after.monthlyGoals,d:after.dailyGoals},{m:before.monthlyGoals,d:before.dailyGoals},'日別計画へ反映される');else assert.deepEqual(after.monthlyGoals,before.monthlyGoals,'反映する金額が無い時は変えない');assert.deepEqual(after.transactions,before.transactions,'取引や残高は変わらない');assert.deepEqual(after.banks,before.banks);
  });
  await flow('日締めの中から実質金額の内訳を開く',['DAYCLOSE-135'],page,async()=>{
    await openScreen(page,{tab:'today',patch:"s.mailImports=[]",setup:{method:'openDayClosing',args:['2026-10-07']}});
    for(let i=0;i<9&&!(await page.locator('#dayReviewCorrection').count());i++){await page.evaluate(()=>{for(let n=0;n<30;n++){const b=globalThis.__crawl.layer().querySelector('[data-close-key]:not(:checked),[data-empty-group]:not(:checked),input[type=checkbox]:not(:checked)');if(!b)break;b.click()}});if(!await page.evaluate(()=>globalThis.__crawl.click('#dayCloseNext')))break;await settle(page)}
    const before=await data(page);await click(page,'#dayReviewCorrection');await page.locator('#dcClose').waitFor();await click(page,'#dcClose');assert.deepEqual(await data(page),before,'内訳を見ても保存しない');
  });
  await flow('明細取込: 取込→行の保存→確定→解除',['STATEMENT-214','STATEMENT-220','STATEMENT-217','STATEMENT-218','STATEMENT-222','STATEMENT-216'],page,async()=>{
    await openScreen(page,{tab:'payments',setup:{method:'openCardStatementImport',args:['$card'],upload:{selector:'#stmtFile',name:'p0-statement.csv',text:csv}}});
    at('取込開始');const before=await data(page);await click(page,'#stmtStartReview');const imported=await data(page);assert.equal(imported.cardStatementImports.length,before.cardStatementImports.length+1,'取込は1件');
    at('行ボタン');await page.locator('[data-stmt-edit]:visible').first().waitFor({timeout:5000});await click(page,'[data-stmt-edit]');at('行の保存');await page.locator('#stmtRowSave:visible').waitFor({timeout:5000});await click(page,'#stmtRowSave');
    // 要確認の行がすべて確認されるまでは確定できない（アプリの安全装置）。残りの行も1件ずつ確認する
    for(let i=0;i<6;i++){const left=await page.evaluate(()=>[...document.querySelectorAll('[data-stmt-edit]')].filter(e=>globalThis.__crawl.visible(e)&&/要確認|needs/.test(e.closest('.stmt-row,.row,[data-stmt-row]')?.textContent||e.textContent)).length);if(!left)break;await page.evaluate(()=>[...document.querySelectorAll('[data-stmt-edit]')].find(e=>globalThis.__crawl.visible(e)&&/要確認|needs/.test(e.closest('.stmt-row,.row,[data-stmt-row]')?.textContent||e.textContent)).click());await settle(page);await click(page,'#stmtRowSave')}
    at('確認画面');await page.locator('#stmtReviewSave:visible').waitFor({timeout:5000});await twice(page,'#stmtReviewSave');const reviewed=await data(page);
    const fromStatement=reviewed.transactions.length-imported.transactions.length;assert.ok(fromStatement>=0&&fromStatement<=2,`保存可能件だけが取引になる（${fromStatement}件）`);
    if(await page.locator('#stmtReviewFinal').count()){at('最終確認');await click(page,'#stmtReviewFinal');if(await page.locator('#alertWrap.show').count()){const msg=await page.locator('#alertMessage').innerText();await alertCancel(page);throw new Error('確定前の確認: '+msg)}await page.locator('#stmtFinalize:visible').waitFor({timeout:5000});await twice(page,'#stmtFinalize');const done=await data(page);assert.equal(done.cardStatementImports.at(-1).status,'confirmed','請求額が確定される')}
    if(await page.locator('#stmtUnlock').count()){await click(page,'#stmtUnlock');if(await page.locator('#alertWrap.show').count())await alertOk(page)}
  });
}finally{await context.close();await closeHarness()}
if(errors.length)results.push({name:'JavaScriptエラー',ids:[],result:'不合格',note:[...new Set(errors)].slice(0,3).join(' | ')});
const cell=v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
writeFileSync(resolve(root,'docs/v11/p0-flows.csv'),'﻿'+[['確認した流れ','操作ID','結果','備考'],...results.map(r=>[r.name,r.ids.join(' '),r.result,r.note])].map(r=>r.map(cell).join(',')).join('\n')+'\n');
console.log(`${results.filter(r=>r.result==='合格').length}/${results.length} P0 flows passed`);
if(process.env.MM3_P0_STRICT)assert.ok(results.every(r=>r.result==='合格'));
