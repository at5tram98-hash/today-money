import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {navigateMoney} from './navigation.mjs';

export async function verifyWorkspace({createPage,passed,root}){
  const target=await createPage('app',{width:393,height:852,mobile:true}),page=target.page;
  const bankBefore=await page.evaluate(()=>globalThis.__mm3Test.getData().banks);
  assert.deepEqual(await page.locator('#tabbar .tab-label').allTextContents(),['ホーム','カレンダー','取引','分析','その他']);
  await page.locator('#quickExpense').click();await page.locator('#qeMerchant').fill('新UI検証');
  await page.locator('#qePay').selectOption('other|');await page.locator('#qeAmount').click();
  await page.locator('[data-k="clear"]').click();for(const digit of '1234')await page.locator(`[data-k="${digit}"]`).click();
  await page.locator('#calcDone').click();await page.locator('#qeSave').click();await page.locator('#sheet.show').waitFor({state:'hidden'});
  assert.ok((await page.locator('#todayHero').innerText()).includes('1,234'));
  assert.ok((await page.locator('.money-record-list').innerText()).includes('新UI検証'));
  await navigateMoney(page,'ledger');await page.locator('#ledgerSearch').fill('新UI検証');assert.equal(await page.locator('#ledgerRecords .money-record-row').count(),1);
  await page.locator('[data-ledger-filter="income"]').click();assert.equal(await page.locator('#ledgerRecords .money-record-row').count(),0);
  await page.locator('[data-ledger-filter="expense"]').click();await page.locator('#ledgerRecords .money-record-row').click();await page.locator('#txEdit').click();
  await page.locator('#teMerchant').fill('編集後の記録');await page.locator('#teSave').click();await page.locator('#sheet.show').waitFor({state:'hidden'});
  await page.locator('#ledgerSearch').fill('編集後');assert.equal(await page.locator('#ledgerRecords .money-record-row').count(),1);
  await page.reload();await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
  assert.ok((await page.locator('.money-record-list').innerText()).includes('編集後の記録'));
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().banks),bankBefore);
  passed('new home → expense entry → ledger search/filter → edit → reload preserves the record and does not alter an unrelated bank');

  const before=await page.locator('#homeSplitter').getAttribute('aria-valuenow');
  await page.locator('#homeSplitter').focus();await page.keyboard.press('Home');assert.equal(await page.locator('#homeRecordPane').getAttribute('data-density'),'compact');
  await page.keyboard.press('ArrowUp');assert.equal(await page.locator('#homeRecordPane').getAttribute('data-density'),'hidden');
  await page.keyboard.press('ArrowDown');assert.equal(await page.locator('#homeRecordPane').getAttribute('data-density'),'compact');
  await page.keyboard.press('End');assert.ok(Number(await page.locator('#homeSplitter').getAttribute('aria-valuenow'))>=Number(before));
  passed('home record/calendar boundary can minimize, hide and restore the record pane with accessible keyboard controls');

  for(const tab of ['pay','payments','assets']){
    await navigateMoney(page,tab);assert.equal(await page.locator('.screen.active').getAttribute('id'),'screen-'+tab);
    await page.locator('.screen.active [data-finance-back]').click();assert.equal(await page.locator('.screen.active').getAttribute('id'),'screen-settings');
  }
  await page.locator('#allFeatures').click();const ids=await page.locator('[data-feature]').evaluateAll(elements=>elements.map(el=>el.dataset.feature));
  for(const id of ['one-line','cross-search','daily-correction','daily-transactions','month-transactions','daily-goal','monthly-goal','day-plan','monthly-summary','rebalance','event-goals','large-add','day-close','journal','month-close','acf','simulator','timeline','snapshot','daily-analysis','month-analysis','reason-analysis','month-trend','salary','payments','assets','bank-update','mail','notices','expense','income','quick-repeat'])assert.ok(ids.includes(id),id+' is unreachable');
  await page.locator('#featureSearch').fill('一行');assert.equal(await page.locator('[data-feature]').count(),1);await page.locator('[data-feature="one-line"]').click();await page.locator('.push-view.show').last().waitFor();
  assert.ok((await page.locator('.push-view.show').last().innerText()).length>20);
  passed('all 32 moved actions remain discoverable and the salary, payments and assets sections return to More');
  await target.context.close();

  for(const id of ids){
    const check=await createPage('app',{width:393,height:852,mobile:true}),subject=check.page;
    const finance=state=>({banks:state.banks,transactions:state.transactions,incomes:state.incomes,salaryRecords:state.salaryRecords,cardAdjustments:state.cardAdjustments,dailyGoals:state.dailyGoals,monthlyGoals:state.monthlyGoals,largeExpensePlans:state.largeExpensePlans});
    const initial=finance(await subject.evaluate(()=>globalThis.__mm3Test.getData()));
    await navigateMoney(subject,'settings');await subject.locator('#allFeatures').click();await subject.locator(`[data-feature="${id}"]`).click();
    await subject.waitForFunction(()=>document.querySelector('.screen.active')?.id!=='screen-settings'||document.querySelector('.push-view.show,#sheet.show,#alertWrap.show'));
    await subject.locator('.busy-overlay.show').waitFor({state:'hidden'});
    assert.deepEqual(finance(await subject.evaluate(()=>globalThis.__mm3Test.getData())),initial,`${id} changed financial data merely by opening`);
    await check.context.close();
  }
  passed('each of the 32 relocated actions opens its existing screen or applicable prerequisite prompt without changing financial records');

  for(const width of [320,393,1440])for(const appearance of ['light','dark']){
    const screen=await createPage('app',{width,height:width===393?852:844,mobile:width<500,appearance});
    for(const tab of ['home','month','ledger','insights','settings']){
      await navigateMoney(screen.page,tab);
      const size=await screen.page.locator('.screen.active').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(size.scroll<=size.width+1,`${tab} overflows ${width}px`);
      assert.equal(await screen.page.locator('.tab.active').getAttribute('data-tab'),tab);
    }
    await navigateMoney(screen.page,'home');await screen.page.screenshot({path:resolve(root,`test-results/workspace-home-${width}-${appearance}.png`),animations:'disabled'});
    await screen.context.close();
  }
  passed('all five primary workspaces fit 320px, iPhone 15 Pro 393×852 and desktop in light and dark appearance');
}
