/* 巡回では届かなかった操作を、正しい入口と必要な状態を用意して1件ずつ押す。
   画面が開く・閉じる・状態が変わることと、保存データの変化が想定どおりかを確かめる。
   以前の画面整理で入口がメニューへ移った操作は、移った先の入口で確かめ、その旨を備考に書く。
   結果は docs/v11/remaining-ops.csv。 */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, createPage, settle, openScreen, closeHarness} from './v11-harness.mjs';

const results=[];
const data=page=>page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));
const visible=async(page,sel,wait=3000)=>{try{await page.waitForFunction(sel=>[...document.querySelectorAll(sel)].some(e=>globalThis.__crawl.visible(e)),sel,{timeout:wait});return true}catch{return false}};
const press=async(page,sel)=>{assert.ok(await page.evaluate(sel=>globalThis.__crawl.click(sel),sel),`押せる: ${sel}`);await settle(page)};
const menu=async(page,label)=>{await page.locator('#menuLayer.show .menu-item').filter({hasText:label}).first().click();await settle(page)};
const title=page=>page.evaluate(()=>{const l=globalThis.__crawl.layer();return(l.querySelector('.sheet-title,.push-title,#alertTitle')?.textContent||'').trim()});
const csv=n=>"利用日/キャンセル日,利用店名・商品名,利用金額,支払区分,当月支払金額,当月お支払日\n"+Array.from({length:n},(_,i)=>`2026/09/${String(i+5).padStart(2,'0')},巡回検査ストア${i},1200,1回,1200,2026/10/27`).join('\n')+'\n';
async function check(id,note,page,body){
  try{await body();results.push({id,result:'合格',note});console.log('PASS',id)}
  catch(error){results.push({id,result:'不合格',note:`${note}｜${error.message.split('\n')[0]}`});console.log('FAIL',id,error.message.split('\n')[0])}
}
const approveDay=async(page,{keepData=false}={})=>{
  await openScreen(page,{tab:'today',keepData,patch:"s.mailImports=[]",setup:{method:'openDayClosing',args:['2026-10-07']}});
  for(let i=0;i<8&&!(await page.locator('#dayReviewClose:visible').count());i++){await page.evaluate(()=>{for(let n=0;n<30;n++){const b=globalThis.__crawl.layer().querySelector('[data-close-key]:not(:checked),[data-empty-group]:not(:checked)');if(!b)break;b.click()}globalThis.__crawl.click('#dayCloseNext')});await settle(page)}
  await page.locator('#dayReviewConfirmed:visible').check();await settle(page);await page.locator('#dayReviewClose:visible').click();await page.locator('.day-close-success, #dayCloseJournal').first().waitFor({timeout:8000});await settle(page);
};
const statement=async(page,rows=1)=>{await openScreen(page,{tab:'payments',setup:{method:'openCardStatementImport',args:['$card'],upload:{selector:'#stmtFile',name:`remaining-${rows}.csv`,text:csv(rows)}}});await press(page,'#stmtStartReview')};

const {page,context,errors}=await createPage('app',{width:393,appearance:'light'});
try{
  await check('STATEMENT-226・227','未確認のメール取引のお知らせ',page,async()=>{
    await openScreen(page,{tab:'payments',setup:{method:'mm3MaybeOpenPendingMailReview',args:['foreground']}});await page.locator('#mailPreviewReview').waitFor({timeout:4000});
    await press(page,'#mailPreviewReview');assert.match(await title(page),/メール取引/);});
  await check('HOME-012','入口は今日のメニュー「メール取引」へ移動済み（画面整理で今日の画面の行を廃止）',page,async()=>{
    await openScreen(page,{tab:'today',path:['#todayMenu']});const before=await data(page);await menu(page,'メール取引');assert.match(await title(page),/メール取引/);assert.equal(await data(page),before);});
  await check('MONTH-050','入口は支払いタブ「メール取引」と今日のメニューへ統合済み（今月の画面の行を廃止）',page,async()=>{
    await openScreen(page,{tab:'payments',path:['#mm3PaymentMail']});assert.match(await title(page),/メール取引/);});
  await check('MONTH-045','月間計画がある月で表示',page,async()=>{
    await openScreen(page,{tab:'month',patch:"s.monthlyGoals['2026-10']={total:60000,categories:{},daily:{}}"});const before=await data(page);
    await press(page,'#monthPlanEdit');assert.match(await page.locator('#monthPlanEdit').innerText(),/調整を終了/);await press(page,'#monthPlanEdit');assert.equal(await data(page),before,'表示の切替だけで保存しない');});
  await check('LARGE-069','入口は支払いの「大型支出を追加」・日付の「大型支出を追加」へ統合済み（今月の大型支出計画の一覧を廃止）',page,async()=>{
    await openScreen(page,{tab:'payments',path:['#paymentsAdd','#paymentAddLarge']});assert.ok(await visible(page,'#leSave'),'大型支出の作成画面が開く');});
  await check('PAY-086','',page,async()=>{await openScreen(page,{tab:'pay',path:['#salaryAddNav','#salaryAddTemp']});assert.ok(await visible(page,'#tiSave'),'臨時収入の入力が開く');});
  await check('PAYMENTS-098','',page,async()=>{await openScreen(page,{tab:'payments',path:['#paymentsAdd','#paymentAddDebit']});assert.ok(await visible(page,'#adSave'),'デビットカードの登録が開く');});
  await check('PAYMENTS-100','',page,async()=>{await openScreen(page,{tab:'payments',path:['#paymentsAdd','#paymentAddLarge']});assert.ok(await visible(page,'#leSave'));});
  await check('SET-114','パスコード有効時に表示',page,async()=>{
    await openScreen(page,{tab:'settings',patch:"s.security={...s.security,enabled:true,passcode:'0000'}",setup:{method:'openSecuritySettings',args:[]}});const before=await data(page);
    await press(page,'#changePass');assert.ok(await visible(page,'#psCancel'),'パスコード変更が開く');await press(page,'#psCancel');assert.equal(await data(page),before,'キャンセルでは変えない');});
  await check('BANK-172','実質金額を修正済みの日で表示',page,async()=>{
    await openScreen(page,{tab:'today',patch:"s.dailyCorrections['2026-10-07']=500",setup:{method:'openDailyCorrectionDetail',args:['2026-10-07']}});
    await press(page,'#dcReset');const after=JSON.parse(await data(page));assert.equal(after.dailyCorrections['2026-10-07'],undefined,'自動集計に戻る');});
  await check('BACKUP-209','端末内に復旧用コピーがある時に表示',page,async()=>{
    await openScreen(page,{tab:'settings'});await page.evaluate(()=>globalThis.__mm3Test.makeRecovery());await openScreen(page,{tab:'settings',keepData:true,setup:{method:'openDataSettings',args:[]}});
    await page.locator('#recoveryExport').waitFor({timeout:4000});const before=await data(page);await press(page,'#recoveryExport');assert.equal(await data(page),before,'書き出しは保存データを変えない');});
  await check('SIM-270','今月の収入の欄は画面整理で今月の画面から外れた。同じ行き先（その月の給与・臨時収入）は給与タブの表示月で確かめる',page,async()=>{
    await openScreen(page,{tab:'month'});const month=await page.evaluate(()=>globalThis.__mm3Test.getState().currentMonth);await page.evaluate(()=>globalThis.__mm3Test.switchTab('pay'));await settle(page);
    assert.equal(await page.evaluate(()=>globalThis.__mm3Test.getState().payViewMonth),month,'給与タブは同じ月を表示');assert.ok(await visible(page,'#mm3SalaryRecords'),'その月の給与と臨時収入の一覧がある');});
  await check('GOAL-020','日別計画の合計が月間総額とずれた時に表示',page,async()=>{
    await openScreen(page,{tab:'today',setup:{method:'openMonthlyGoalPlanner',args:[],step:5},path:['[data-goal-day="2026-10-15"]']});
    await press(page,'#gdpCancel');await page.evaluate(()=>globalThis.__mm3Test.plannerDraft(d=>{d.dailyPlan[20]=(Number(d.dailyPlan[20])||0)+5000}));await settle(page);
    await page.locator('#goalAutoBalance').waitFor({timeout:4000});const before=await data(page);await press(page,'#goalAutoBalance');
    assert.equal(await visible(page,'#goalAutoBalance'),false,'ずれが解消される');assert.equal(await data(page),before,'計画の下書きだけを直す');});
  await check('GOAL-031','月間計画の承認後',page,async()=>{
    await openScreen(page,{tab:'today',setup:{method:'openMonthlyGoalPlanner',args:[],step:7}});await page.locator('#goalApprovalConfirm').waitFor({timeout:5000});
    await press(page,'#goalApprovalConfirm');await page.locator('#alertActions').getByRole('button',{name:'確定',exact:true}).click();await page.locator('#goalSeeCalendar').waitFor({timeout:6000});
    await press(page,'#goalSeeCalendar');assert.equal(await page.evaluate(()=>document.querySelector('.screen.active')?.id),'screen-month','今月の画面へ移る');assert.ok(await visible(page,'#screen-month .day-cell'),'日別計画のカレンダーが見える');});
  await check('GOAL-033','保存に失敗した時の画面（失敗状態を作って表示）',page,async()=>{
    await openScreen(page,{tab:'today',setup:{method:'openDailyGoalPlanner',args:[],step:3}});await page.evaluate(()=>globalThis.__mm3Test.plannerError('保存できませんでした'));await settle(page);
    await page.locator('#goalErrorBack').waitFor({timeout:4000});await press(page,'#goalErrorBack');assert.ok(await visible(page,'#goalApproval'),'最終確認へ戻る');});
  await check('DAYCLOSE-136','未確認のメール取引がある日',page,async()=>{
    await openScreen(page,{tab:'today',setup:{method:'openDayClosing',args:['2026-10-07']}});for(let i=0;i<4&&!(await visible(page,'#dayReviewMail'));i++){await page.evaluate(()=>{for(let n=0;n<30;n++){const b=globalThis.__crawl.layer().querySelector('[data-close-key]:not(:checked),[data-empty-group]:not(:checked),input[type=checkbox]:not(:checked)');if(!b)break;b.click()}});await page.evaluate(()=>globalThis.__crawl.click('#dayCloseNext'));await settle(page)}
    const before=await data(page);await press(page,'#dayReviewMail');assert.match(await title(page),/メール取引/);assert.equal(await data(page),before);});
  await check('DAYCLOSE-137','銀行口座が無い場合',page,async()=>{
    await openScreen(page,{tab:'today',patch:"s.mailImports=[];s.banks=[];s.transactions=s.transactions.filter(t=>t.paymentMethod!=='bank')",setup:{method:'openDayClosing',args:['2026-10-07']}});
    for(let i=0;i<6&&!(await visible(page,'#dayCloseAddBank'));i++){await page.evaluate(()=>{for(let n=0;n<30;n++){const b=globalThis.__crawl.layer().querySelector('[data-close-key]:not(:checked),[data-empty-group]:not(:checked),input[type=checkbox]:not(:checked)');if(!b)break;b.click()}});await page.evaluate(()=>globalThis.__crawl.click('#dayCloseNext'));await settle(page)}
    await press(page,'#dayCloseAddBank');assert.ok(await visible(page,'#abSave'),'銀行口座の登録が開く');});
  await check('DAYCLOSE-130','日締めの承認後',page,async()=>{
    await openScreen(page,{tab:'today',patch:"s.mailImports=[]",setup:{method:'openDayClosing',args:['2026-10-07']}});
    for(let i=0;i<8&&!(await visible(page,'#dayReviewClose'));i++){await page.evaluate(()=>{for(let n=0;n<30;n++){const b=globalThis.__crawl.layer().querySelector('[data-close-key]:not(:checked),[data-empty-group]:not(:checked),input[type=checkbox]:not(:checked)');if(!b)break;b.click()}});await page.evaluate(()=>globalThis.__crawl.click('#dayCloseNext'));await settle(page)}
    await page.locator('#dayReviewConfirmed:visible').check();await settle(page);await press(page,'#dayReviewClose');await page.locator('.day-close-success, #dayCloseJournal').first().waitFor({timeout:8000});
    // 承認済みの日を開き直すと、閲覧用の「完了」が出る
    await openScreen(page,{tab:'today',keepData:true,setup:{method:'openDayClosing',args:['2026-10-07']}});await page.locator('#dayCloseDone:visible').waitFor({timeout:5000});
    await press(page,'#dayCloseDone');assert.equal(await page.evaluate(()=>document.querySelectorAll('#pushLayer .push-view.show').length),0,'日締めの画面を閉じる');});
  await check('DAYCLOSE-143','承認済みの日の取消',page,async()=>{
    // 取消は「理由」「影響の確認」「取消と入力」の3段階（既存の日締めテストと同じ手順）を経て完了し、完了画面からジャーナルを開く
    await openScreen(page,{tab:'today',keepData:true,setup:{method:'openDayClosingCancellation',args:['2026-10-07']}});const view=page.locator('.day-close-view').last();
    await view.locator('#dayCancelNext').click();await view.locator('#dayCancelReason').selectOption('誤って承認した');await view.locator('#dayCancelAck').check();await view.locator('#dayCancelNext').click();
    await view.locator('#dayCancelConfirm').fill('取消');await view.locator('#dayCancelNext').click();await settle(page);await page.locator('#dayCancelJournal:visible').waitFor({timeout:8000});
    const before=await data(page);await press(page,'#dayCancelJournal');assert.match(await title(page),/ジャーナル|日締め/);assert.equal(await data(page),before,'記録を見るだけでは何も変えない');});
  await check('DAYCLOSE-138','承認の段階を開いたまま、別の経路（同期など）で記録が増えた時の安全装置。画面から支出を追加した場合は自動で該当段階へ戻る',page,async()=>{
    await openScreen(page,{tab:'today',patch:"s.mailImports=[]",setup:{method:'openDayClosing',args:['2026-10-07']}});
    for(let i=0;i<8&&!(await page.locator('#dayReviewClose:visible').count());i++){await page.evaluate(()=>{for(let n=0;n<30;n++){const b=globalThis.__crawl.layer().querySelector('[data-close-key]:not(:checked),[data-empty-group]:not(:checked)');if(!b)break;b.click()}globalThis.__crawl.click('#dayCloseNext')});await settle(page)}
    await page.evaluate(async()=>{const t=globalThis.__mm3Test;await t.safeCommitAsync(()=>t.recordExpense({amount:300,date:'2026-10-07',merchant:'同期で増えた支出',paymentMethod:'other',saveNow:false}));t.renderAll()});await settle(page);
    await page.locator('#dayCloseMissing:visible').waitFor({timeout:5000});assert.equal(await page.locator('#dayReviewClose:visible').isDisabled().catch(()=>true),true,'未確認がある間は承認できない');
    await press(page,'#dayCloseMissing');assert.ok(await page.locator('[data-close-key]:not(:checked)').count(),'未確認の記録がある段階へ戻る');});
  await check('STATEMENT-213','同じ明細ファイルを2回取り込んだ時',page,async()=>{
    await statement(page,1);await openScreen(page,{tab:'payments',keepData:true,setup:{method:'openCardStatementImport',args:['$card'],upload:{selector:'#stmtFile',name:'remaining-1.csv',text:csv(1)}}});
    await page.locator('#stmtOpenExisting').waitFor({timeout:5000});const before=await data(page);await press(page,'#stmtOpenExisting');await page.waitForTimeout(400);assert.match(await title(page),/明細/);assert.equal(await data(page),before,'二重に取り込まない');});
  await check('STATEMENT-219・221','明細行の編集',page,async()=>{
    await statement(page,1);const before=await data(page);await press(page,'[data-stmt-edit]');await press(page,'#stmtRowClose');assert.equal(await visible(page,'#stmtRowSave',600),false,'閉じる');assert.equal(await data(page),before,'閉じるだけでは変えない');
    // 「この明細を除外する」は明示的な操作ボタン（押すとその行だけ反映対象から外して保存する）。もう一度押すと元に戻る
    await press(page,'[data-stmt-edit]');await press(page,'#stmtRowExclude');const excluded=JSON.parse(await data(page));assert.equal(excluded.cardStatementImports.at(-1).rows[0].included,false,'行が除外される');
    await press(page,'[data-stmt-edit]');await press(page,'#stmtRowExclude');if(await page.locator('#alertWrap.show').count()){await page.locator('#alertActions').getByRole('button',{name:'変更を破棄',exact:true}).click();await settle(page)}
    assert.notEqual(JSON.parse(await data(page)).cardStatementImports.at(-1).rows[0].included,false,'もう一度押すと反映対象に戻る');});
  await check('STATEMENT-223・215','請求額の最終確認から戻る／確定した明細を見る',page,async()=>{
    await statement(page,1);await press(page,'[data-stmt-edit]');await press(page,'#stmtRowSave');await press(page,'#stmtReviewFinal');await page.locator('#stmtBackReview').waitFor({timeout:4000});
    await press(page,'#stmtBackReview');assert.ok(await visible(page,'#stmtReviewSave'),'確認画面へ戻る');
    await press(page,'#stmtReviewFinal');await press(page,'#stmtFinalize');await openScreen(page,{tab:'payments',keepData:true,setup:{method:'openCardStatementImport',args:['$card'],upload:{selector:'#stmtFile',name:'remaining-1.csv',text:csv(1)}}});await press(page,'#stmtOpenExisting');await page.waitForTimeout(500);
    if(await visible(page,'#stmtConfirmedRows')){await press(page,'#stmtConfirmedRows');assert.match(await title(page),/明細/)}else throw new Error('確定済み明細の画面が開かない');});
  await check('EVENT-246','一行入力で1件だけ読み取った時',page,async()=>{
    await openScreen(page,{tab:'today',path:['#todayOneLine']});await page.locator('#sheet textarea, #sheet input[type=text], .push-view.show textarea').first().fill('コンビニ 580円');await press(page,'#pro4Parse');
    const before=await data(page);await press(page,'#pro4NormalForm');assert.ok(await visible(page,'#qeSave'),'通常の支出入力が開く');assert.equal(await data(page),before,'開いただけでは保存しない');});
}finally{await context.close();await closeHarness()}
if(errors.length)results.push({id:'JavaScriptエラー',result:'不合格',note:[...new Set(errors)].slice(0,3).join(' | ')});
results.push({id:'GMAIL-296・297',result:'未検証',note:'Googleアカウントへの接続が前提。外部認証のため自動検証できない（接続していない時はボタン自体が出ない）'});
const cell=v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
writeFileSync(resolve(root,'docs/v11/remaining-ops.csv'),'﻿'+[['操作ID','結果','備考'],...results.map(r=>[r.id,r.result,r.note])].map(r=>r.map(cell).join(',')).join('\n')+'\n');
console.log(`${results.filter(r=>r.result==='合格').length}/${results.length} remaining operations passed`);
