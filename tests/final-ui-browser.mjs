import assert from 'node:assert/strict';
import {resolve} from 'node:path';

async function enterAmount(page,value){
  await page.locator('#calcGrid').getByRole('button',{name:'AC',exact:true}).click();
  for(const digit of String(value))await page.locator(`[data-k="${digit}"]`).click();
  await page.locator('#calcDone').click();
}
async function settleSave(page){await page.locator('.busy-overlay.show').waitFor({state:'hidden'});await page.locator('#sheet.show').waitFor({state:'hidden'});}
async function approveDay(page){
  const view=page.locator('.day-close-view').last();await view.locator('#dayCloseNext').click();
  for(let step=1;step<=4;step++){
    const checks=view.locator('[data-close-key],[data-empty-group]');
    for(let index=0;index<await checks.count();index++)await checks.nth(index).check();
    await view.locator('#dayCloseNext').click();
  }
  await view.locator('#dayReviewConfirmed').check();await view.locator('#dayReviewClose').click();
  await page.locator('.busy-overlay.show').waitFor({state:'hidden'});await view.locator('.day-close-success').waitFor();
}
async function horizontalGesture(page,locator,left=true,touch=false){
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate(async el=>{await Promise.all(el.closest('.push-view').getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})))});
  const box=await locator.boundingBox(),x=box.x+box.width*.65,y=box.y+box.height*.5;
  if(touch){
    const session=await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=8;step++)await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+(left?-100:100)*step/8,y}]});
    await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();return;
  }
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+(left?-100:100),y,{steps:8});await page.mouse.up();
}
async function assertEqualActions(locator){
  const sizes=await locator.evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return{width:box.width,height:box.height,top:box.top}}));
  assert.equal(sizes.length,2);assert.ok(Math.abs(sizes[0].width-sizes[1].width)<=1);assert.ok(Math.abs(sizes[0].height-sizes[1].height)<=1);assert.ok(Math.abs(sizes[0].top-sizes[1].top)<=1);assert.ok(sizes.every(size=>size.height>=44));
}

export async function verifyFinalUiBrowser({createPage,passed,root,financialBaselineRoot}){
  const target=await createPage(),page=target.page;
  await page.evaluate(async()=>{const api=globalThis.__mm3Test;await api.configureAcf({...api.acfDefaultSettings(),initialized:true});api.renderAll()});
  let before=await page.evaluate(()=>globalThis.__mm3Test.getData()),forecast;
  if(financialBaselineRoot){
    const baseline=await createPage('baseline');
    for(const subject of [page,baseline.page])await subject.evaluate(async snapshot=>{await globalThis.__mm3Test.replaceData(snapshot)},before);
    const expected=await baseline.page.evaluate(()=>globalThis.__mm3Test.buildCashFlowForecast());
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.buildCashFlowForecast()),expected);
    for(const patch of [{balance:1000,reserveFloor:1500,creditFallbackEnabled:false},{balance:125678,reserveFloor:5000,creditFallbackEnabled:true}]){
      const fixture=structuredClone(before);fixture.banks[0].balance=patch.balance;Object.assign(fixture.acfSettings,patch);delete fixture.acfSettings.balance;
      for(const subject of [page,baseline.page])await subject.evaluate(async snapshot=>{await globalThis.__mm3Test.replaceData(snapshot)},fixture);
      assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.buildCashFlowForecast()),await baseline.page.evaluate(()=>globalThis.__mm3Test.buildCashFlowForecast()));
    }
    await page.evaluate(async snapshot=>{await globalThis.__mm3Test.replaceData(snapshot);globalThis.__mm3Test.renderAll()},before);
    passed('ACF forecast rows match the deployed baseline for normal, shortage and card-enabled cash scenarios');await baseline.context.close();
  }
  before=await page.evaluate(()=>globalThis.__mm3Test.getData());forecast=await page.evaluate(()=>globalThis.__mm3Test.buildCashFlowForecast());
  await page.evaluate(()=>{void globalThis.__mm3Test.openAcfDetail()});await page.locator('#acfViewMode').waitFor();await page.locator('.busy-overlay.show').waitFor({state:'hidden'});
  const order=await page.locator('#acfViewMode').evaluate(el=>({switchBottom:el.getBoundingClientRect().bottom,monthTop:el.parentElement.querySelector('.acf-month-nav').getBoundingClientRect().top}));assert.ok(order.switchBottom<=order.monthTop);
  const months=await page.locator('#acfMonthSelect option').evaluateAll(options=>options.map(option=>option.value));
  for(const month of months){
    await page.locator('#acfViewMode [data-view="table"]').click();await page.locator('#acfMonthSelect').selectOption(month);
    const dates=await page.locator('#acfTablePanel [data-acf-day]').evaluateAll(headers=>headers.map(header=>header.dataset.acfDay));
    const date=dates.find(date=>date.endsWith('-15'))||dates[0],column=dates.indexOf(date)+1;
    const tableValues=await page.locator('#acfTablePanel tbody tr').evaluateAll((rows,column)=>rows.map(row=>row.children[column].textContent),column);
    await page.locator('#acfViewMode [data-view="calendar"]').click();await page.locator(`[data-acf-select="${date}"]`).click();
    assert.deepEqual(await page.locator('.acf-calendar-detail dd').allTextContents(),tableValues);
    assert.equal(await page.locator('[data-acf-select]').count(),dates.length);
    const selected=await page.locator(`[data-acf-select="${date}"]`).getAttribute('aria-pressed');assert.equal(selected,'true');
    await page.locator('#acfTableMode [data-v="important"]').click();const important=forecast.rows.filter(row=>row.date.slice(0,7)===month&&row.important);
    assert.equal(await page.locator('[data-acf-select]').count(),important.length);
    await page.locator('#acfTableMode [data-v="all"]').click();
  }
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
  passed('ACF table and calendar show identical values for all 11 fields, months and important-day filters without ledger changes');
  await page.locator('#acfMonthSelect').selectOption(months[0]);const first=await page.locator('[data-acf-select]').first().getAttribute('data-acf-select');
  await page.locator(`[data-acf-select="${first}"]`).focus();await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[data-acf-select][aria-pressed="true"]').getAttribute('data-acf-select'),'2026-10-08');
  await page.locator('.acf-calendar-inspect').click();assert.ok(await page.locator('.push-view').last().locator('#inspectExpense').isVisible());await page.evaluate(()=>globalThis.__mm3Test.popView());
  await page.evaluate(()=>globalThis.__mm3Test.popView());await page.evaluate(()=>{void globalThis.__mm3Test.openAcfDetail()});await page.locator('.busy-overlay.show').waitFor({state:'hidden'});
  assert.ok(await page.locator('.acf-calendar-grid').isVisible());passed('ACF calendar supports keyboard selection, existing day details and saved display preference');
  await target.context.close();

  const goal=await createPage(),gp=goal.page;await gp.locator('#todayGoalAction').click();assert.ok(await gp.locator('#goalStart').isVisible());await gp.locator('#goalStart').click();
  assert.ok(await gp.locator('#goalAmountRange').isVisible());assert.equal(await gp.locator('[data-goal-plan]').count(),0);
  await assertEqualActions(gp.locator('.goal-nav-actions button'));
  const goalBefore=await gp.evaluate(()=>globalThis.__mm3Test.getData());await gp.locator('#goalAmountRange').focus();await gp.keyboard.press('ArrowRight');
  const sliderValue=await gp.locator('#goalAmountRange').inputValue();assert.equal(await gp.locator('#goalAmountEdit').innerText(),`¥${Number(sliderValue).toLocaleString('ja-JP')}`);
  await gp.locator('#goalAmountEdit').click();await enterAmount(gp,4235);assert.equal(await gp.locator('#goalAmountEdit').innerText(),'¥4,235');
  await gp.locator('#goalBack').click();assert.ok(await gp.locator('#goalStart').isVisible());await gp.locator('#goalStart').click();assert.equal(await gp.locator('#goalAmountEdit').innerText(),'¥4,235');
  await gp.locator('#goalNext').click();assert.equal(await gp.locator('.goal-step-title').innerText(),'カテゴリ配分');await gp.locator('#goalNext').click();assert.equal(await gp.locator('.goal-step-title').innerText(),'確認');
  assert.deepEqual(await gp.evaluate(()=>globalThis.__mm3Test.getData()),goalBefore);
  const handle=await gp.locator('.approval-handle').boundingBox(),slider=await gp.locator('#goalApproval').boundingBox();await gp.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await gp.mouse.down();await gp.mouse.move(slider.x+slider.width-15,handle.y+handle.height/2,{steps:12});await gp.mouse.up();await gp.locator('#goalDone').waitFor();
  assert.equal(await gp.evaluate(()=>globalThis.__mm3Test.getData().dailyGoals['2026-10-07'].total),4235);await gp.locator('#goalDone').click();await gp.reload();await gp.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));assert.equal(await gp.evaluate(()=>globalThis.__mm3Test.getData().dailyGoals['2026-10-07'].total),4235);
  passed('daily goal opens directly to slider or exact-yen calculator input, preserves drafts on Back and uses the existing approval/save path');
  await gp.evaluate(()=>globalThis.__mm3Test.openMonthlyGoalPlanner('2026-10'));await gp.locator('#goalStart').click();assert.ok(await gp.locator('[data-goal-plan]').count());assert.ok((await gp.locator('.goal-step-compact-count').innerText()).includes('/ 7'));await goal.context.close();passed('monthly goal retains its existing seven-step workflow');

  const warning=await createPage(),wg=warning.page;
  await wg.evaluate(async()=>{const t=globalThis.__mm3Test;await t.safeCommitAsync(()=>t.recordExpense({date:'2026-10-07',amount:500,category:'食費',merchant:'予算警告の検証',paymentMethod:'other',saveNow:false}));t.renderAll()});
  await wg.locator('#todayGoalAction').click();await wg.locator('#goalStart').click();await wg.locator('#goalAmountRange').focus();await wg.keyboard.press('Home');assert.ok(await wg.locator('#goalAmountWarning').isVisible());await wg.keyboard.press('End');assert.equal(await wg.locator('#goalAmountWarning').isVisible(),false);
  passed('budget warnings update immediately when the slider crosses recorded spending');await warning.context.close();

  const closing=await createPage(),cp=closing.page;await cp.locator('#todayDayClose').click();const cv=cp.locator('.day-close-view').last();
  await horizontalGesture(cp,cv.locator('.day-close-heading'));assert.equal(await cv.locator('.day-close-heading').innerText(),'収入の照合');
  await horizontalGesture(cp,cv.locator('.day-close-heading'));assert.equal(await cv.locator('.day-close-heading').innerText(),'収入の照合');
  await cv.locator('.day-close-heading').focus();await cp.keyboard.press('ArrowLeft');assert.equal(await cv.locator('.day-close-heading').innerText(),'日締め');
  await horizontalGesture(cp,cv.locator('.day-close-heading'),true,true);assert.equal(await cv.locator('.day-close-heading').innerText(),'収入の照合');await cv.locator('.day-close-heading').focus();await cp.keyboard.press('ArrowLeft');
  passed('day closing supports horizontal swipes and arrow keys while incomplete reviews cannot advance');
  await approveDay(cp);await cv.locator('#dayCloseNext').click();const approved=await cp.evaluate(()=>globalThis.__mm3Test.getData().dayClosings['2026-10-07']);
  await cp.locator('#todayDayClose').click();const locked=cp.locator('.day-close-view').last();assert.equal(await locked.locator('.day-close-heading').innerText(),'承認済');assert.equal(await locked.locator('[data-close-edit],#dayCloseNext,#dayReviewClose').count(),0);await assertEqualActions(locked.locator('.day-close-footer button'));
  await locked.locator('#dayCloseModify').click();await cp.locator('#alertActions').getByRole('button',{name:'キャンセル',exact:true}).click();assert.equal(await locked.locator('.day-close-heading').innerText(),'承認済');assert.deepEqual(await cp.evaluate(()=>globalThis.__mm3Test.getData().dayClosings['2026-10-07']),approved);
  await locked.locator('#dayCloseModify').click();await cp.locator('#alertActions').getByRole('button',{name:'修正を始める',exact:true}).click();assert.equal(await locked.locator('.day-close-heading').innerText(),'日締め');assert.deepEqual(await cp.evaluate(()=>globalThis.__mm3Test.getData().dayClosings['2026-10-07']),approved);
  await approveDay(cp);const revised=await cp.evaluate(()=>globalThis.__mm3Test.getData().dayClosings['2026-10-07']);assert.equal(revised.history.length,1);assert.deepEqual(revised.history[0].snapshot,approved.snapshot);
  passed('approved day closing stays read-only, explicit revision can be canceled, and re-approval preserves the previous journal snapshot');await closing.context.close();

  const update=await createPage(),up=update.page;
  await up.locator('[data-tab="pay"]').click();await up.locator('#screen-pay [data-financial-update]').click();let uv=up.locator('.financial-update-view').last();
  const originalBanks=await up.evaluate(()=>globalThis.__mm3Test.getData().banks);
  for(const amount of [41000,41500]){
    await uv.locator('[data-update-row]').first().click();assert.equal(await up.locator('#calcTitle').innerText(),'受取予定額（控除後）');await enterAmount(up,amount);await up.locator('#srSave').click();await settleSave(up);
    assert.equal(await uv.locator('.financial-update-row b').first().innerText(),`¥${amount.toLocaleString('ja-JP')}`);
  }
  assert.deepEqual(await up.evaluate(()=>globalThis.__mm3Test.getData().banks),originalBanks);assert.equal(await up.evaluate(()=>globalThis.__mm3Test.getData().incomes.length),0);
  await up.evaluate(()=>globalThis.__mm3Test.popView());await up.locator('[data-tab="payments"]').click();await up.locator('#screen-payments [data-financial-update]').click();uv=up.locator('.financial-update-view').last();
  for(const amount of [32000,33000]){await uv.locator('[data-update-row]').first().click();await enterAmount(up,amount);await up.locator('#qcbSave').click();await settleSave(up);assert.equal(await uv.locator('.financial-update-row b').first().innerText(),`¥${amount.toLocaleString('ja-JP')}`);}
  assert.deepEqual(await up.evaluate(()=>globalThis.__mm3Test.getData().banks),originalBanks);
  await up.evaluate(()=>globalThis.__mm3Test.popView());await up.locator('[data-tab="assets"]').click();await up.locator('#screen-assets [data-financial-update]').click();uv=up.locator('.financial-update-view').last();
  for(const amount of [150000,151000]){await uv.locator('[data-update-row]').first().click();await enterAmount(up,amount);await up.locator('#qbSave').click();await settleSave(up);assert.equal(await uv.locator('.financial-update-row b').first().innerText(),`¥${amount.toLocaleString('ja-JP')}`);assert.equal(await up.evaluate(()=>globalThis.__mm3Test.getData().banks[0].balance),amount);}
  const afterUpdates=await up.evaluate(()=>globalThis.__mm3Test.getData());await uv.locator('[data-update-row]').first().click();await up.locator('#calcCancel').click();await up.locator('#qbCancel').click();assert.deepEqual(await up.evaluate(()=>globalThis.__mm3Test.getData()),afterUpdates);
  await up.reload();await up.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));const persisted=await up.evaluate(()=>globalThis.__mm3Test.getData());assert.equal(persisted.banks[0].balance,151000);assert.equal(persisted.salaryRecords.find(record=>record.id==='salary_seed_gu_202610').gross,41500);
  assert.deepEqual(await up.evaluate(()=>globalThis.__mm3Test.getGuardViolations()),[]);
  passed('repeated salary, card and bank updates refresh the shared list, persist after reload and never invent receipts or double-apply bank effects');await update.context.close();

  const paid=await createPage(),pp=paid.page;
  await pp.evaluate(async()=>{const t=globalThis.__mm3Test,d=t.getData();d.banks[0].balance=100000;d.banks[0].balanceAsOf='2026-10-06T12:00:00Z';for(const e of d.employers)e.bankId=d.banks[0].id;for(const c of d.cards)c.bankId=d.banks[0].id;await t.replaceData(d);t.renderAll()});
  await pp.locator('[data-tab="pay"]').click();await pp.locator('#screen-pay [data-financial-update]').click();let pv=pp.locator('.financial-update-view').last();
  await pv.locator('[data-update-row]').first().click();await pp.locator('#calcCancel').click();await pp.locator('#srStatus [data-v="入金済"]').click();await pp.locator('#srActualDate').fill('2026-10-07');await pp.locator('#srReceipt').selectOption('bank');await pp.locator('#srReceivedAmount').click();await enterAmount(pp,40000);await pp.locator('#srSave').click();await settleSave(pp);assert.equal(await pp.evaluate(()=>globalThis.__mm3Test.getData().banks[0].balance),140000);
  for(const amount of [41000,42000]){await pv.locator('[data-update-row]').first().click();assert.equal(await pp.locator('#calcTitle').innerText(),'実際の受取額');await enterAmount(pp,amount);await pp.locator('#srSave').click();await settleSave(pp);const actual=await pp.evaluate(()=>globalThis.__mm3Test.getData());assert.equal(actual.banks[0].balance,100000+amount);assert.equal(actual.incomes.length,1);assert.equal(actual.incomes[0].amount,amount);}
  await pp.evaluate(()=>globalThis.__mm3Test.popView());await pp.locator('[data-tab="payments"]').click();await pp.locator('#screen-payments [data-financial-update]').click();pv=pp.locator('.financial-update-view').last();
  await pv.locator('[data-update-row]').first().click();await enterAmount(pp,33000);await pp.locator('#qcbDate').fill('2026-10-07');await pp.locator('#qcbStatus [data-v="paid"]').click();await pp.locator('#qcbBalanceMode [data-v="apply"]').click();await pp.locator('#qcbSave').click();await settleSave(pp);assert.equal(await pp.evaluate(()=>globalThis.__mm3Test.getData().banks[0].balance),109000);
  for(const amount of [34000,34000]){await pv.locator('[data-update-row]').first().click();await enterAmount(pp,amount);await pp.locator('#qcbSave').click();await settleSave(pp);assert.equal(await pp.evaluate(()=>globalThis.__mm3Test.getData().banks[0].balance),108000);}
  passed('received salary updates replace one linked receipt and paid-card updates apply only the difference, including repeated identical saves');await paid.context.close();

  const waiting=await createPage(),wp=waiting.page;
  const result=await wp.evaluate(async()=>{const started=performance.now();const promise=globalThis.__mm3Test.runWithBusy(async()=>{await new Promise(resolve=>setTimeout(resolve,100));return 17},{title:'ACFを計算中…'});await new Promise(resolve=>setTimeout(resolve,350));const phase=document.getElementById('busyOverlay').dataset.phase,visible=!!document.querySelector('.busy-overlay.show'),value=await promise;return{elapsed:performance.now()-started,phase,visible,value,hidden:!document.querySelector('.busy-overlay.show')}});
  assert.ok(result.elapsed>=1800);assert.equal(result.phase,'paint');assert.equal(result.visible,true);assert.equal(result.value,17);assert.equal(result.hidden,true);passed('ACF waiting lasts at least 1.8 seconds and distinguishes calculation completion from result painting');await waiting.context.close();

  for(const width of [320,390])for(const appearance of ['light','dark']){
    const mobile=await createPage('app',{width,appearance}),mp=mobile.page;
    await mp.evaluate(async()=>{const api=globalThis.__mm3Test;await api.configureAcf({...api.acfDefaultSettings(),initialized:true});void api.openAcfDetail()});await mp.locator('#acfViewMode').waitFor();await mp.locator('.busy-overlay.show').waitFor({state:'hidden'});await mp.locator('#acfViewMode [data-view="calendar"]').click();
    assert.equal(await mp.locator('.push-view').last().locator('.push-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);await assertEqualActions(mp.locator('#acfViewMode button'));await mp.locator('.acf-calendar-grid').scrollIntoViewIfNeeded();await mp.screenshot({path:resolve(root,`test-results/acf-calendar-${width}-${appearance}.png`),animations:'disabled'});
    await mp.evaluate(()=>globalThis.__mm3Test.popView());await mp.locator('#todayDayClose').click();const mv=mp.locator('.day-close-view').last();await mv.locator('#dayCloseNext').click();await assertEqualActions(mv.locator('.day-close-footer button'));assert.equal(await mv.locator('.push-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await mp.screenshot({path:resolve(root,`test-results/day-closing-${width}-${appearance}.png`),animations:'disabled'});
    await mp.evaluate(()=>globalThis.__mm3Test.popView());await mp.locator('#todayGoalAction').click();await mp.locator('#goalStart').click();await assertEqualActions(mp.locator('.goal-nav-actions button'));assert.equal(await mp.locator('.push-view').last().locator('.push-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    await mp.screenshot({path:resolve(root,`test-results/daily-budget-${width}-${appearance}.png`),animations:'disabled'});
    await mp.locator('#goalBack').click();await mp.locator('#goalCancel').click();await mp.locator('[data-tab="assets"]').click();await mp.locator('#screen-assets [data-financial-update]').click();assert.equal(await mp.locator('.financial-update-view').last().locator('.push-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    passed(`${width}px ${appearance} calendar, day closing, goal and update views fit; paired buttons have equal width and height`);await mobile.context.close();
  }
}
