import assert from 'node:assert/strict';
import {resolve} from 'node:path';

const day='2026-10-07';
async function approve(page){
  const view=page.locator('.day-close-view').last();await view.locator('#dayCloseNext').click();
  for(let step=1;step<=4;step++){
    const checks=view.locator('[data-close-key],[data-empty-group]');
    for(let i=0;i<await checks.count();i++)await checks.nth(i).check();
    await view.locator('#dayCloseNext').click();
  }
  await view.locator('#dayReviewConfirmed').check();await view.locator('#dayReviewClose').click();await page.locator('.busy-overlay.show').waitFor({state:'hidden'});
  await view.locator('#dayCloseNext').click();
  await page.evaluate(day=>globalThis.__mm3Test.openDayClosing(day),day);
}
async function ledger(page){return page.evaluate(()=>{const data=globalThis.__mm3Test.getData();delete data.dayClosings;return data})}
async function seed(page){
  await page.evaluate(async day=>{
    const api=globalThis.__mm3Test,data=api.getData();
    data.transactions=[{id:'review-expense',date:day,amount:800,category:'食費',merchant:'確認する支出',paymentMethod:'other'}];
    data.incomes=[{id:'review-income',date:day,amount:2000,sourceName:'確認する収入',toType:'cash',receivedConfirmed:true}];
    data.banks=[{id:'review-bank',name:'確認する銀行',balance:9000}];
    data.mailImports=[];data.dayClosings={};data.salaryRecords=[];data.fixedPayments=[];data.largeExpensePlans=[];data.tempIncomes=[];data.dailyCorrections={};
    await api.replaceData(data);api.renderAll();api.enableMM3StateGuard('throw');api.openDayClosing(day);
  },day);
}
async function cancelSteps(page){
  await page.locator('#dayCloseCancel').click();const view=page.locator('.day-close-view').last();
  await view.locator('#dayCancelNext').click();
  assert.equal(await view.locator('#dayCancelNext').isDisabled(),true);
  await view.locator('#dayCancelReason').selectOption('誤って承認した');
  assert.equal(await view.locator('#dayCancelNext').isDisabled(),true);
  await view.locator('#dayCancelAck').check();await view.locator('#dayCancelNext').click();
  assert.equal(await view.locator('#dayCancelNext').isDisabled(),true);
  await view.locator('#dayCancelConfirm').fill('取り消し');assert.equal(await view.locator('#dayCancelNext').isDisabled(),true);
  await view.locator('#dayCancelConfirm').fill('取消');assert.equal(await view.locator('#dayCancelNext').isEnabled(),true);return view;
}
export async function verifyClosingRefinements({createPage,passed,root,errors}){
  const target=await createPage(),page=target.page;await seed(page);
  const view=page.locator('.day-close-view').last();await view.locator('#dayCloseNext').click();
  await view.locator('input').first().focus();await page.keyboard.press('Space');
  assert.equal(await view.locator('input').first().isChecked(),true);
  assert.equal(await view.locator('.day-close-content').evaluate(el=>getComputedStyle(el).animationName),'none');
  assert.equal(await view.locator('input').first().evaluate(el=>document.activeElement===el),true);
  await page.keyboard.press('Space');assert.equal(await view.locator('input').first().isChecked(),false);
  assert.equal(await view.locator('#dayCloseNext').isDisabled(),true);await view.locator('#dayCloseBack').click();await approve(page);
  passed('checking and unchecking do not replay sideways navigation animation, and keyboard focus remains on the checkbox');

  const before=await ledger(page),record=await page.evaluate(day=>globalThis.__mm3Test.getData().dayClosings[day],day);
  let cancel=await cancelSteps(page);await cancel.locator('#dayCancelBack').click();await cancel.locator('#dayCancelBack').click();await cancel.locator('#dayCancelBack').click();
  assert.deepEqual(await page.evaluate(day=>globalThis.__mm3Test.getData().dayClosings[day],day),record);
  assert.deepEqual(await ledger(page),before);
  passed('the three cancellation stages require reason, acknowledgement and exact confirmation; leaving them preserves approval');
  cancel=await cancelSteps(page);await cancel.locator('#dayCancelNext').click();await page.locator('.busy-overlay.show').waitFor({state:'hidden'});
  const cancelled=await page.evaluate(day=>globalThis.__mm3Test.getData().dayClosings[day],day);
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.closedAt,record.closedAt);assert.deepEqual(cancelled.snapshot,record.snapshot);
  assert.ok(cancelled.cancelledAt);assert.equal(cancelled.cancellationReason,'誤って承認した');assert.deepEqual(await ledger(page),before);
  assert.equal(await page.evaluate(()=>globalThis.__mm3Test.buildPushSummary().closed),false);
  await cancel.locator('#dayCancelNext').click();await page.locator('#dayCancelNext').waitFor({state:'detached'});assert.equal(await page.locator('.day-close-view').last().locator('.day-close-heading').innerText(),'取消済');
  await page.reload();await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
  await page.evaluate(()=>globalThis.__mm3Test.openDayClosingJournal());await page.locator(`[data-journal-date="${day}"]`).click();
  assert.ok((await page.locator('.push-view').last().innerText()).includes('誤って承認した'));
  assert.ok((await page.locator('.push-view').last().innerText()).includes('確認する支出'));
  passed('durable cancellation retains the complete journal receipt, changes Push closed state and never changes money');

  await page.evaluate(()=>{globalThis.__mm3Test.popView();globalThis.__mm3Test.popView();globalThis.__mm3TestClock.now=Date.parse('2026-10-07T08:59:59.999Z');globalThis.__mm3Test.openDayClosing('2026-10-07')});
  assert.ok((await page.locator('.day-close-view').last().innerText()).includes('この日の日締めは18:00以降に可能です'));
  assert.equal(await page.locator('#dayCloseModify,#dayReviewClose,#dayCloseNext,#dayCloseCancel').count(),0);
  await page.locator('#dayCloseJournal').click();assert.equal(await page.locator('[data-journal-date]').count(),1);
  await page.locator('[data-journal-date]').click();assert.ok((await page.locator('.push-view').last().innerText()).includes('取消済'));
  await page.evaluate(()=>{globalThis.__mm3Test.popView();globalThis.__mm3Test.popView();globalThis.__mm3Test.popView();globalThis.__mm3TestClock.now=Date.parse('2026-10-07T09:00:00Z');globalThis.__mm3Test.openDayClosing('2026-10-07')});
  await page.locator('#dayCloseModify').click();await page.locator('#alertActions').getByRole('button',{name:'修正を始める',exact:true}).click();await approve(page);
  assert.ok(await page.locator('#dayCloseCancel').isVisible());
  assert.equal(await page.evaluate(day=>globalThis.__mm3Test.getData().dayClosings[day].history.at(-1).cancellationReason,day),'誤って承認した');
  await page.evaluate(()=>{globalThis.__mm3Test.popView();globalThis.__mm3TestClock.now=Date.parse('2026-10-08T00:00:00Z');globalThis.__mm3Test.openDayClosing('2026-10-07')});
  assert.equal(await page.locator('.day-close-view').last().locator('.day-close-heading').innerText(),'承認済');
  passed('17:59:59 blocks all closing actions but permits journal viewing; 18:00 permits reapproval and earlier dates stay accessible');
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getGuardViolations()),[]);await target.context.close();

  const failure=await createPage('app',{localOnly:true}),fp=failure.page;await seed(fp);await approve(fp);let failureView=await cancelSteps(fp);
  const saved=await fp.evaluate(()=>globalThis.__mm3Test.getData()),errorStart=errors.length;
  await fp.evaluate(()=>{const original=Storage.prototype.setItem;globalThis.__restoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=function(key,value){if(key==='myMoney2_v1')throw new DOMException('expected cancellation quota failure','QuotaExceededError');return original.call(this,key,value)}});
  await failureView.locator('#dayCancelNext').click();await fp.locator('.busy-overlay.show').waitFor({state:'hidden'});
  const rolledBack=await fp.evaluate(()=>globalThis.__mm3Test.getData());delete rolledBack.meta.storageWriteError;assert.deepEqual(rolledBack,saved);
  assert.equal(await failureView.locator('.day-close-heading').innerText(),'取消の最終確認');assert.equal(await failureView.locator('#dayCancelNext').isEnabled(),true);
  const expectedErrors=errors.splice(errorStart);assert.ok(expectedErrors.some(error=>error.message.includes('async commit failed day closing cancellation')));assert.ok(expectedErrors.every(error=>error.message.includes('expected cancellation quota failure')||error.message.includes('async commit failed day closing cancellation')));
  await fp.evaluate(()=>globalThis.__restoreStorage());await failureView.locator('#dayCancelNext').click();await fp.locator('.busy-overlay.show').waitFor({state:'hidden'});
  assert.equal(await fp.evaluate(day=>globalThis.__mm3Test.dayClosingStatus(day),day),'cancelled');
  passed('failed cancellation storage restores the approval and ledger, releases waiting state and permits a successful retry');await failure.context.close();

  for(const appearance of ['light','dark']){
    const mobile=await createPage('app',{width:320,appearance}),page=mobile.page;await seed(page);await approve(page);await page.locator('#dayCloseCancel').click();
    for(let step=0;step<3;step++){
      const view=page.locator('.day-close-view').last();
      assert.equal(await view.locator('.push-body').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
      const sizes=await view.locator('.day-close-footer button').evaluateAll(buttons=>buttons.map(button=>{const box=button.getBoundingClientRect();return{width:box.width,height:box.height,top:box.top}}));
      assert.equal(sizes.length,2);assert.ok(Math.abs(sizes[0].width-sizes[1].width)<=1);assert.ok(Math.abs(sizes[0].height-sizes[1].height)<=1);assert.ok(sizes.every(size=>size.height>=44));
      if(await page.locator('#toastLayer .toast').count())assert.ok(await page.locator('#toastLayer .toast').evaluate(el=>el.getBoundingClientRect().bottom)<=Math.min(...sizes.map(size=>size.top)),'toast must not cover cancellation actions');
      if(step===2)assert.ok(await view.locator('#dayCancelNext').evaluate(button=>{const range=document.createRange();range.selectNodeContents(button);return range.getBoundingClientRect().height<=parseFloat(getComputedStyle(button).fontSize)*1.8}));
      if(step===1){await view.locator('#dayCancelReason').selectOption('誤って承認した');await view.locator('#dayCancelAck').check()}
      if(step<2)await view.locator('#dayCancelNext').click();
    }
    await page.locator('.push-view.show').last().evaluate(async root=>{await Promise.all(root.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})))});
    await page.locator('#toastLayer .toast').waitFor({state:'detached'});
    await page.screenshot({path:resolve(root,`test-results/day-closing-cancel-320-${appearance}.png`)});
    passed(`all deliberate cancellation stages fit 320px ${appearance} with equally sized 44px-or-larger actions`);await mobile.context.close();
  }

  for(const width of [320,390])for(const appearance of ['light','dark']){
    const target=await createPage('app',{width,appearance}),page=target.page;
    await page.evaluate(()=>globalThis.__mm3Test.switchTab('assets'));
    const history=page.locator('#mm3AssetHistoryTop');const box=await history.boundingBox();assert.ok(box.height>=44);
    assert.equal(await history.locator('svg').count(),1);assert.equal(await history.evaluate(el=>getComputedStyle(el).borderTopWidth),'0px');
    for(const id of ['mm3AssetHistoryTop','mm3AssetHistoryRow']){await page.locator('#'+id).click();assert.equal(await page.locator('.push-view').last().locator('.push-title').innerText(),'残高履歴');await page.locator('.push-view').last().locator('.back-btn').click();}
    await page.evaluate(()=>globalThis.__mm3Test.switchTab('settings'));
    for(const id of ['profileSettings','gmailSettings','categorySettings','initialValuesSettings','acfSettingsRow','favoriteSettings','tagSettings','notificationSettings','appearanceSettings','feedbackSettingsRow','securitySettings','helpSettings','dataSettings']){
      await page.locator('#'+id).click();
      if(['profileSettings','gmailSettings'].includes(id)){
        const sheet=page.locator('#sheet.show');await sheet.waitFor();
        assert.ok(await sheet.locator('.sheet-body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),`${id} sheet overflow ${width}`);
        await sheet.locator('.sheet-nav button').first().click();await sheet.waitFor({state:'hidden'});continue;
      }
      const detail=page.locator('.push-view').last();await detail.locator('.push-title').waitFor();
      assert.ok((await detail.innerText()).trim().length>10);
      assert.ok(await detail.evaluate(el=>el.querySelector('.push-body').scrollWidth<=el.querySelector('.push-body').clientWidth+1),`${id} overflow ${width}`);
      if(id==='categorySettings'){
        const categories=await page.evaluate(()=>globalThis.__mm3Test.getData().categories);
        await page.locator('[data-down="0"]').click();await page.locator('[data-up="1"]').click();
        assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().categories),categories);
        await page.locator('[data-ci="0"]').click();await page.locator('#ceCancel').click();await page.locator('#sheet.show').waitFor({state:'hidden'});
      }
      if(id==='appearanceSettings'){
        for(const value of ['dark','light','system']){await page.locator(`[data-app="${value}"]`).click();assert.equal(await page.locator(`[data-app="${value}"]`).getAttribute('aria-pressed'),'true');}
      }
      if(id==='feedbackSettingsRow'){
        for(const selector of ['#fbSound','#fbHaptic','#fbMotion']){const control=page.locator(selector),on=await control.getAttribute('aria-checked');await control.click();assert.notEqual(await control.getAttribute('aria-checked'),on);await control.click();assert.equal(await control.getAttribute('aria-checked'),on);}
        await page.locator('#fbVolume').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.locator('#fbVolumeLabel').innerText(),'50%');
        assert.equal(await page.evaluate(()=>globalThis.__mm3Test.getData().feedbackSettings.volume),.5);
      }
      if(id==='notificationSettings'){
        const control=page.locator('[data-noti="balance"]');await control.scrollIntoViewIfNeeded();const scroll=await detail.locator('.push-body').evaluate(el=>el.scrollTop);
        await control.click();assert.ok(Math.abs(await page.locator('.push-view').last().locator('.push-body').evaluate(el=>el.scrollTop)-scroll)<=2);
      }
      if(id==='securitySettings'){const security=await page.evaluate(()=>globalThis.__mm3Test.getData().security);await page.locator('#passSwitch').click();await page.locator('[data-pk="1"]').click();await page.locator('#psCancel').click();await page.locator('#sheet.show').waitFor({state:'hidden'});assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().security),security);}
      if(id==='helpSettings'){await detail.locator('summary').nth(3).click();assert.ok(await detail.locator('details').nth(3).getAttribute('open')!==null);assert.ok((await detail.innerText()).includes('My Money 3.0'));}
      await page.locator('.push-view').last().locator('.back-btn').click();
    }
    await page.locator('#feedbackSettingsRow').click();await page.locator('.push-view.show').last().waitFor();
    await page.locator('.push-view.show').last().evaluate(async root=>{await Promise.all(root.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})))});
    await page.screenshot({path:resolve(root,`test-results/settings-refined-${width}-${appearance}.png`)});
    passed(`asset history and every settings route operate without overflow at ${width}px ${appearance}; switches, appearance, volume, help and passcode cancel work`);
    await target.context.close();
  }
}
