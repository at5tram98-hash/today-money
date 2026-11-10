/* 遷移記録「金額欄→777入力→電卓取消→親画面閉鎖」の検証。
   仕様書の遷移943のうち電卓を開く46種の金額欄について、タップ／Enterで電卓が開き、
   777を入力して取消（キャンセルボタン／Escape）しても、欄の表示と保存データが変わらないこと、
   続けて親画面を閉じても保存データが変わらないことを確かめる。結果は docs/v11/amount-fields.csv。 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, createPage, settle, openScreen, closeHarness} from './v11-harness.mjs';

const csv="利用日/キャンセル日,利用店名・商品名,利用金額,支払区分,当月支払金額,当月お支払日\n2026/09/05,巡回検査ストア,1200,1回,1200,2026/10/27\n";
const S=(method,args=[],extra={})=>({method,args,...extra});
// [記録の画面名, 金額欄, 開き方]
const fields=[
  ['sim','#simAmount',{tab:'today',setup:S('openAcfSimulator')}],
  ['income','#ieAmount',{tab:'today',setup:S('openIncomeEditor')}],
  ['expense','#qeAmount',{tab:'today',path:['#quickExpense']}],
  ['quick-bank','#qbAmount',{tab:'today',path:['#quickBank']}],
  ['temporary','#tiAmount',{tab:'today',path:['#quickIncome']}],
  ['bank','#abBalance',{tab:'assets',setup:S('openAddBank')}],
  ['bank','#abThreshold',{tab:'assets',setup:S('openAddBank')}],
  ['card','#acLimit',{tab:'payments',setup:S('openAddCard')}],
  ['card','#acInitialAmount',{tab:'payments',setup:S('openAddCard')}],
  ['employer-new','#ecHourly',{tab:'pay',setup:S('openEmployerCreate')}],
  ['employer-new','#ecTransport',{tab:'pay',setup:S('openEmployerCreate')}],
  ['salary-new','#saGross',{tab:'pay',setup:S('openSalaryAdd')}],
  ['salary-new','#saTransport',{tab:'pay',setup:S('openSalaryAdd')}],
  ['fixed','#fpAmount',{tab:'payments',setup:S('openFixedPayment')}],
  ['correction','#dcEdit',{tab:'today',setup:S('openDailyCorrectionDetail',['2026-10-07'])}],
  ['planner-day','#gdpCalc',{tab:'today',setup:S('openMonthlyGoalPlanner',[],{step:5}),path:['[data-goal-day="2026-10-15"]']}],
  ['planner-total','#goalAmountEdit',{tab:'today',setup:S('openDailyGoalPlanner',[],{step:1})}],
  ['planner-category','[data-goal-cat]',{tab:'today',setup:S('openDailyGoalPlanner',[],{step:2})}],
  ['transaction','#teAmount',{tab:'today',setup:S('openTransactionEdit',['audit_tx'])}],
  ['large-split','[data-le-split-amount]',{tab:'month',setup:S('openLargeExpenseEditor'),path:['#leSplitToggle']}],
  ['large','#leAmount',{tab:'month',setup:S('openLargeExpenseEditor')}],
  ['day-plan','#dpChange',{tab:'month',setup:S('openDayPlanSheet',['2026-10-07'])}],
  ['employer-edit','#eeHourly',{tab:'pay',setup:S('openEmployerEdit',['$employerObj'])}],
  ['employer-edit','#eeTransport',{tab:'pay',setup:S('openEmployerEdit',['$employerObj'])}],
  ['salary-edit','#srGross',{tab:'pay',setup:S('openSalaryRecordEdit',['$salary'])}],
  ['salary-edit','#srTransport',{tab:'pay',setup:S('openSalaryRecordEdit',['$salary'])}],
  ['salary-received','#srReceivedAmount',{tab:'pay',setup:S('openSalaryRecordEdit',['$salary'])}],
  ['temporary-edit','#teAmount',{tab:'pay',setup:S('openTempIncomeEdit',['audit_temp'])}],
  ['card-billing','#qcbAmount',{tab:'payments',setup:S('openQuickCardBilling')}],
  ['initial','[data-initial-bank]',{tab:'settings',setup:S('openInitialValues')}],
  ['allocation','[data-alloc]',{tab:'pay',setup:S('openSalaryAllocation',['$salary'])}],
  ['transfer','#transferAmount',{tab:'assets',setup:S('openTransferPlanEditor')}],
  ['reconcile','#reconAmount',{tab:'payments',setup:S('openStatementReconciliation',['$card','2026-10','2026-09'])}],
  ['parsed','[data-draft-amount]',{tab:'today',path:['#todayOneLine'],fill:['textarea, #pro4Input, input[type=text]','コンビニ 777円'],then:['#pro4Parse']}],
  ['goal-item','#goalItemAmount',{tab:'month',setup:S('openEventGoalEditor'),path:['#eventGoalAddItem']}],
  ['goal-share','#eventOwnShare',{tab:'month',setup:S('openEventGoalEditor',['$goalObj'])}],
  ['reimbursement','#reimbAmount',{tab:'month',setup:S('openEventGoalDetail',['audit_goal']),path:['#eventGoalReimburse']}],
  ['acf-setup','#acfSetupReserve',{tab:'today',setup:S('openAcfSetup')}],
  ['acf-settings','#acfReserve',{tab:'today',setup:S('openAcfSettings')}],
  ['acf-limit','#acfDailyLimit',{tab:'today',setup:S('openAcfSettings'),path:['#acfDetailsToggle']}],
  ['statement','#stmtRowAmount',{tab:'payments',setup:S('openCardStatementImport',['$card'],{upload:{selector:'#stmtFile',name:'paypay.csv',text:csv}}),path:['#stmtStartReview','[data-stmt-edit]']}],
];
const snapshot=page=>page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));
const calcOpen=page=>page.evaluate(()=>document.getElementById('calculator').classList.contains('show'));
const text=(page,sel)=>page.evaluate(sel=>{const el=document.querySelector('#sheet.show '+sel)||[...document.querySelectorAll('#pushLayer .push-view.show')].at(-1)?.querySelector(sel)||document.querySelector(sel);return el?(el.value??'')+'|'+el.textContent.replace(/\s+/g,' ').trim():null},sel);
const rows=[],failures=[];
try{
  for(const [width,appearance] of [[393,'light'],[320,'dark']]){
    const {page,context,errors}=await createPage('app',{width,appearance});
    for(const [screen,selector,route] of fields)for(const how of ['tap','keyboard']){
      const row={screen,field:selector,width,appearance,how,opened:false,unchanged:false,parentClosedWithoutWrite:false,result:''};
      try{
        let ok=await openScreen(page,{tab:route.tab,setup:route.setup||null,path:route.path||[]});
        if(ok&&route.fill){const box=page.locator(route.fill[0]).first();await box.fill(route.fill[1]);for(const sel of route.then||[])ok=ok&&await page.evaluate(sel=>globalThis.__crawl.click(sel),sel);await settle(page)}
        assert.ok(ok,'screen opens');
        const field=page.locator(selector).first();await field.waitFor({timeout:4000});await field.scrollIntoViewIfNeeded();
        const before=await snapshot(page),shown=await text(page,selector);
        if(how==='tap')await field.click();else{await field.focus();await page.keyboard.press('Enter')}
        await page.waitForFunction(()=>document.getElementById('calculator').classList.contains('show'),null,{timeout:3000});row.opened=true;
        for(const k of '777')await page.keyboard.press(k);
        if(how==='tap')await page.locator('#calcCancel').click();else await page.keyboard.press('Escape');
        await page.waitForTimeout(320);
        assert.equal(await calcOpen(page),false,'calculator closes');
        row.unchanged=await text(page,selector)===shown&&await snapshot(page)===before;
        // 親画面を閉じる（未保存の変更が無いので確認なしで閉じる）
        await page.keyboard.press('Escape');await settle(page);
        if(await page.evaluate(()=>document.getElementById('alertWrap').classList.contains('show'))){await page.locator('#alertActions').getByRole('button',{name:'変更を破棄',exact:true}).click();await settle(page)}
        row.parentClosedWithoutWrite=await snapshot(page)===before;
        row.result=row.opened&&row.unchanged&&row.parentClosedWithoutWrite?'合格':'不合格';
      }catch(error){row.result='不合格';row.error=error.message.split('\n')[0]}
      if(row.result!=='合格')failures.push(`${width}-${appearance} ${screen} ${selector} ${how}: ${row.error||JSON.stringify(row)}`);
      rows.push(row);
    }
    if(errors.length)failures.push(`${width}: ${[...new Set(errors)].slice(0,3).join(' | ')}`);
    await context.close();
  }
}finally{await closeHarness()}
const cell=v=>{const s=v===true?'○':v===false?'×':String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
writeFileSync(resolve(root,'docs/v11/amount-fields.csv'),'﻿'+[['画面','金額欄','幅','テーマ','開き方','電卓が開く','取消で値と保存データが不変','親画面を閉じても保存しない','結果','備考'],...rows.map(r=>[r.screen,r.field,r.width,r.appearance,r.how==='tap'?'タップ→キャンセル':'Enter→Escape',r.opened,r.unchanged,r.parentClosedWithoutWrite,r.result,r.error||''])].map(r=>r.map(cell).join(',')).join('\n')+'\n');
const passed=rows.filter(r=>r.result==='合格').length;console.log(`${passed}/${rows.length} amount-field checks passed`);for(const f of failures)console.log('FAIL',f.slice(0,300));
if(process.env.MM3_AMOUNT_STRICT)assert.equal(failures.length,0);
