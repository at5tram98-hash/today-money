import assert from 'node:assert/strict';
import {resolve} from 'node:path';

async function money(page,button,value){
  await page.locator(button).click();await page.locator('#calcGrid').getByRole('button',{name:'AC',exact:true}).click();
  for(const key of String(value))await page.locator(`[data-k="${key}"]`).click();await page.locator('#calcDone').click();
}
async function checkStage(view){
  const checks=view.locator('[data-close-key],[data-empty-group]');
  for(let i=0;i<await checks.count();i++)await checks.nth(i).check();
  await view.locator('#dayCloseNext').click();
}
async function seed(page,{pending=false}={}){
  await page.evaluate(async pending=>{
    const api=globalThis.__mm3Test,d=api.getData(),date='2026-10-07';
    d.transactions=[{id:'manual',date,amount:1001,category:'食費',merchant:'手入力の店',paymentMethod:'other',paymentId:'',source:'manual',memo:''},{id:'refund',date,amount:-100,category:'その他',merchant:'返金',paymentMethod:'other',paymentId:'',source:'manual'}, {id:'mail-tx',date,amount:300,category:'食費',merchant:'メール店',paymentMethod:'card',paymentId:'close-card',source:'gmail',mailImportId:'imported'}];
    d.incomes=[{id:'close-income',date,amount:2000,sourceName:'売上',toType:'cash',kind:'temporary',receivedConfirmed:true}];d.tempIncomes=[];d.salaryRecords=[];d.fixedPayments=[];d.largeExpensePlans=[];d.assetSnapshots=[];d.cardAdjustments={};d.dailyCorrections={[date]:900};d.dayClosings={};
    d.banks=[{id:'close-bank',name:'照合テスト銀行',balance:10000,balanceAsOf:'2026-10-06T00:00:00Z'}];d.cards=[{id:'close-card',name:'照合カード',bankId:'close-bank',closingDay:'月末',dueDay:26,limit:100000}];d.debitCards=[];
    d.mailImports=[{id:'imported',date,amount:300,merchant:'メール店',category:'食費',status:'imported',transactionId:'mail-tx',paymentMethod:'card',paymentId:'close-card'}];
    if(pending)d.mailImports.push({id:'waiting',date,amount:250,merchant:'未確認メール',category:'食費',paymentMethod:'other',paymentId:'',status:'pending',direction:'expense',categorySource:'manual'});
    await api.replaceData(d);api.renderAll();api.enableMM3StateGuard('throw');api.openDayClosing(date);
  },pending);
}
export async function verifyDayClosingBrowser({createPage,passed,root,errors}){
  const target=await createPage('app',{width:390,appearance:'dark'}),page=target.page;await seed(page);
  const view=page.locator('.day-close-view').last();await view.locator('#dayCloseNext').click();
  await view.locator('[data-close-key="income:close-income"]').check();
  await view.locator('[data-close-edit="income:close-income"]').click();await page.locator('#ieCancel').click();
  assert.equal(await view.locator('[data-close-key="income:close-income"]').isChecked(),true);
  await view.locator('[data-close-edit="income:close-income"]').click();await money(page,'#ieAmount',2500);await page.locator('#ieSave').click();await page.locator('.busy-overlay.show').waitFor({state:'hidden'});await page.locator('#sheet.show').waitFor({state:'hidden'});
  assert.equal(await view.locator('[data-close-key="income:close-income"]').isChecked(),false);assert.equal(await view.locator('#dayCloseNext').isDisabled(),true);assert.equal(await page.evaluate(()=>globalThis.__mm3Test.getData().incomes[0].amount),2500);
  passed('income edit uses durable saves; cancel keeps the check and a saved amount change invalidates it');
  await view.locator('#dayCloseAddIncome').click();await page.locator('#ieSource').fill('追加の収入');await money(page,'#ieAmount',750);await page.locator('#ieSave').click();await page.locator('.busy-overlay.show').waitFor({state:'hidden'});
  const incomeData=await page.evaluate(()=>globalThis.__mm3Test.getData());assert.equal(incomeData.incomes.length,2);assert.equal(incomeData.tempIncomes.length,1);assert.equal(incomeData.tempIncomes[0].incomeId,incomeData.incomes[1].id);assert.equal(incomeData.incomes[1].receivedConfirmed,true);assert.equal(incomeData.banks[0].balance,10000);
  passed('income added during closing links to temporary income without changing bank cash for a cash receipt');
  await checkStage(view);await checkStage(view);assert.equal(await view.locator('.day-close-heading').innerText(),'普通取引の照合');
  await view.locator('[data-close-key="ordinary:tx:manual"]').check();await view.locator('[data-close-edit="ordinary:tx:manual"]').click();await page.locator('#teMerchant').fill('変更した店');await page.locator('#teSave').click();await page.locator('#sheet.show').waitFor({state:'hidden'});
  assert.equal(await view.locator('[data-close-key="ordinary:tx:manual"]').isChecked(),false);
  await view.locator('#dayReviewAdd').click();await page.locator('#qeMerchant').fill('追加支出');await money(page,'#qeAmount',125);await page.locator('#qeSave').click();await page.locator('#sheet.show').waitFor({state:'hidden'});
  assert.ok(await page.evaluate(()=>globalThis.__mm3Test.getData().transactions.some(t=>t.merchant==='追加支出'&&t.amount===125&&t.date==='2026-10-07')));
  passed('ordinary transaction editing clears its check and expense addition keeps the selected closing date');
  await checkStage(view);await view.locator('[data-close-key="banks:close-bank"]').check();await view.locator('[data-close-edit="banks:close-bank"]').click();await money(page,'#qbAmount',11000);await page.locator('#qbSave').click();await page.locator('#sheet.show').waitFor({state:'hidden'});
  assert.equal(await view.locator('[data-close-key="banks:close-bank"]').isChecked(),false);const bankData=await page.evaluate(()=>globalThis.__mm3Test.getData());assert.equal(bankData.banks[0].balance,11000);assert.ok(bankData.banks[0].balanceAsOf);assert.ok(bankData.assetSnapshots.some(s=>s.bankBalance===11000));
  passed('bank correction reuses balance reconciliation and snapshots, and requires another reconciliation check');
  await checkStage(view);await page.screenshot({path:resolve(root,'test-results/day-closing-approval-390-dark.png')});
  const ledgerBefore=await page.evaluate(()=>{const d=globalThis.__mm3Test.getData();delete d.dayClosings;return d});await view.locator('#dayReviewConfirmed').check();await view.locator('#dayReviewClose').click();await view.locator('.day-close-success').waitFor();
  const ledgerAfter=await page.evaluate(()=>{const d=globalThis.__mm3Test.getData();delete d.dayClosings;return d});assert.deepEqual(ledgerAfter,ledgerBefore);assert.equal(await page.evaluate(()=>globalThis.__mm3Test.buildPushSummary().closed),true);
  await view.locator('#dayCloseJournal').click();await page.locator('[data-journal-date="2026-10-07"]').click();await page.locator('#journalReview').waitFor();assert.ok((await page.locator('.push-view').last().innerText()).includes('追加支出'));assert.ok((await page.locator('.push-view').last().innerText()).includes('11,000'));assert.ok((await page.locator('.push-view').last().innerText()).includes('3,250'));
  await page.reload();await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));assert.equal(await page.evaluate(()=>globalThis.__mm3Test.dayClosingStatus('2026-10-07')),'closed');
  passed('approval preserves every financial record; rich journal evidence survives reload and feeds day-close Push status');
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getGuardViolations()),[]);await target.context.close();

  const cash=await createPage(),cp=cash.page;await seed(cp);const cv=cp.locator('.day-close-view').last();await cv.locator('#dayCloseNext').click();
  await cv.locator('[data-close-edit="income:close-income"]').click();await cp.locator('[data-type="bank"]').click();await cp.locator('#ieBank').selectOption('close-bank');await money(cp,'#ieAmount',3000);await cp.locator('#ieSave').click();await cp.locator('.busy-overlay.show').waitFor({state:'hidden'});
  assert.equal(await cp.evaluate(()=>globalThis.__mm3Test.getData().banks[0].balance),13000);
  await cp.evaluate(()=>globalThis.__mm3Test.openQuickBank('close-bank'));await money(cp,'#qbAmount',20000);await cp.locator('#qbSave').click();await cp.locator('#sheet.show').waitFor({state:'hidden'});
  await cv.locator('[data-close-edit="income:close-income"]').click();await money(cp,'#ieAmount',3200);await cp.locator('#ieSave').click();await cp.locator('.busy-overlay.show').waitFor({state:'hidden'});
  const reconciledIncome=await cp.evaluate(()=>globalThis.__mm3Test.getData());assert.equal(reconciledIncome.banks[0].balance,20000);assert.equal(reconciledIncome.incomes[0].bankApplied,false);assert.equal(reconciledIncome.incomes[0].bankReconciled,true);assert.equal(reconciledIncome.incomes[0].amount,3200);
  passed('editing legacy bank income after a balance reconciliation never adds the same receipt twice');
  await cp.evaluate(()=>globalThis.__mm3TestClock.now+=1000);await cv.locator('#dayCloseAddIncome').click();await cp.locator('[data-type="bank"]').click();await cp.locator('#ieBank').selectOption('close-bank');await money(cp,'#ieAmount',500);await cp.locator('#ieSave').click();await cp.locator('.busy-overlay.show').waitFor({state:'hidden'});
  assert.equal(await cp.evaluate(()=>globalThis.__mm3Test.getData().banks[0].balance),20500);assert.equal(await cp.evaluate(()=>globalThis.__mm3Test.getData().incomes[1].bankApplied),true);
  passed('a newly received bank income after the baseline applies once through the existing bank-effect function');await cash.context.close();

  const mail=await createPage(),mp=mail.page;await seed(mp,{pending:true});const mv=mp.locator('.day-close-view').last();await mv.locator('#dayCloseNext').click();await checkStage(mv);
  assert.equal(await mv.locator('[data-close-key="mail:waiting"]').isDisabled(),true);assert.equal(await mv.locator('#dayCloseNext').isDisabled(),true);
  await mv.locator('[data-close-edit="mail:waiting"]').click();await mp.locator('#mailEditApply').click();await mp.locator('#mailEditApply').waitFor({state:'hidden'});assert.equal(await mv.locator('[data-close-key="mail:waiting"]').isEnabled(),true);
  const imported=await mp.evaluate(()=>globalThis.__mm3Test.getData());assert.equal(imported.transactions.filter(t=>t.mailImportId==='waiting').length,1);assert.equal(imported.mailImports.find(m=>m.id==='waiting').status,'imported');await mv.locator('[data-close-key="mail:waiting"]').check();await mv.locator('[data-close-key="mail:imported"]').check();assert.equal(await mv.locator('#dayCloseNext').isEnabled(),true);
  passed('pending mail blocks closing until existing Gmail approval records exactly one transaction');await mail.context.close();

  const busy=await createPage(),bp=busy.page;
  await bp.evaluate(()=>{globalThis.__busyWork=globalThis.__mm3Test.runWithBusy(async()=>{await new Promise(resolve=>globalThis.__finishBusy=resolve);document.getElementById('todayDayClose').dataset.afterPaint='ready';return 42},{title:'ATFを計算中…'})});
  await bp.waitForFunction(()=>typeof globalThis.__finishBusy==='function');await bp.waitForTimeout(1250);assert.equal(await bp.locator('.busy-overlay.show').count(),1);await bp.evaluate(()=>globalThis.__finishBusy());assert.equal(await bp.evaluate(()=>globalThis.__busyWork),42);assert.equal(await bp.locator('.busy-overlay.show').count(),0);assert.equal(await bp.locator('#todayDayClose').getAttribute('data-after-paint'),'ready');
  passed('ATF waiting remains visible until asynchronous work, the 1.8-second minimum and redraw complete');
  const concurrency=await bp.evaluate(async()=>{const api=globalThis.__mm3Test;let release;const first=api.runWithBusy(()=>new Promise(resolve=>release=resolve),{title:'長い計算',minimumMs:0});await new Promise(resolve=>setTimeout(resolve,150));await api.runWithBusy(()=>7,{title:'短い計算',minimumMs:0});const stillVisible=!!document.querySelector('.busy-overlay.show'),title=document.getElementById('busyTitle').textContent;release(9);const result=await first;let error='';try{await api.runWithBusy(()=>{throw new Error('expected failure')},{minimumMs:0})}catch(e){error=e.message}return{stillVisible,title,result,error,hidden:!document.querySelector('.busy-overlay.show')}});
  assert.deepEqual(concurrency,{stillVisible:true,title:'長い計算',result:9,error:'expected failure',hidden:true});passed('overlapping busy jobs retain the remaining job; rejection also releases the overlay');
  await busy.context.close();

  const failure=await createPage('app',{localOnly:true}),sp=failure.page;await seed(sp);const sv=sp.locator('.day-close-view').last();await sv.locator('#dayCloseNext').click();for(let i=0;i<4;i++)await checkStage(sv);await sv.locator('#dayReviewConfirmed').check();
  const beforeFailure=await sp.evaluate(()=>globalThis.__mm3Test.getData()),errorStart=errors.length;
  await sp.evaluate(()=>{const original=Storage.prototype.setItem;globalThis.__restoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(key,value){if(key==='myMoney2_v1')throw new DOMException('expected quota failure','QuotaExceededError');return original.call(this,key,value)}});
  await sv.locator('#dayReviewClose').click();await sp.locator('.busy-overlay.show').waitFor({state:'hidden'});assert.equal(await sv.locator('.day-close-success').count(),0);assert.equal(await sv.locator('#dayReviewConfirmed').isChecked(),false);const failedData=await sp.evaluate(()=>globalThis.__mm3Test.getData());assert.equal(failedData.meta.storageWriteError,true);delete failedData.meta.storageWriteError;assert.deepEqual(failedData,beforeFailure);
  const failureLogs=errors.splice(errorStart);assert.ok(failureLogs.some(e=>e.message.includes('async commit failed day closing approval')));assert.ok(failureLogs.every(e=>e.message.includes('expected quota failure')||e.message.includes('async commit failed day closing approval')));
  await sp.evaluate(()=>globalThis.__restoreStorage());await sv.locator('#dayReviewConfirmed').check();await sv.locator('#dayReviewClose').click();await sv.locator('.day-close-success').waitFor();assert.equal(await sp.evaluate(()=>Object.keys(globalThis.__mm3Test.getData().dayClosings).length),1);
  passed('storage failure rolls back closing evidence, releases the overlay and allows a single successful retry');await failure.context.close();

  for(const appearance of ['light','dark']){
    const mobile=await createPage('app',{width:320,appearance}),p=mobile.page;await seed(p);const v=p.locator('.day-close-view').last();await p.waitForTimeout(350);
    await p.screenshot({path:resolve(root,`test-results/day-closing-opening-320-${appearance}.png`)});await v.locator('#dayCloseNext').click();
    for(let step=1;step<=4;step++){
      assert.equal(await v.locator('.push-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);assert.ok(await v.locator('#dayCloseNext').isVisible());await checkStage(v);
    }
    assert.equal(await v.locator('.push-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);await p.screenshot({path:resolve(root,`test-results/day-closing-approval-320-${appearance}.png`)});passed(`all closing review stages fit 320px ${appearance} without horizontal scrolling`);await mobile.context.close();
  }
  const expiry=await createPage(),ep=expiry.page;await seed(ep);await ep.evaluate(async()=>{const api=globalThis.__mm3Test,d=api.getData();d.dayClosings={'2026-10-01':{status:'closed',closedAt:'2026-10-01T10:00:00Z',snapshot:{total:50,rawTotal:50}},'2026-10-07':{status:'closed',closedAt:'2026-10-07T10:00:00Z',snapshot:{total:900,rawTotal:900}}};await api.replaceData(d);while(document.querySelector('.push-view.show'))api.popView();api.openDayClosingJournal()});
  assert.equal(await ep.locator('[data-journal-date]').count(),2);await ep.evaluate(()=>{globalThis.__mm3TestClock.now=new Date('2026-10-07T15:00:00Z').getTime();globalThis.__mm3Test.appMaintenance()});assert.equal(await ep.locator('[data-journal-date]').count(),1);assert.equal(await ep.evaluate(()=>globalThis.__mm3Test.getData().transactions.length),3);await ep.reload();await ep.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));assert.equal(await ep.evaluate(()=>!!globalThis.__mm3Test.getData().dayClosings['2026-10-01']),false);
  passed('journal expiry at local Tokyo midnight refreshes the open journal, survives reload and preserves transactions');await expiry.context.close();
}
