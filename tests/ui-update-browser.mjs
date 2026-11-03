import assert from 'node:assert/strict';
import {resolve} from 'node:path';

export async function verifyUiUpdate({createPage,passed,root}){
  const {page,context}=await createPage('app',{width:393,height:852,mobile:true});
  const original=await page.evaluate(()=>globalThis.__mm3Test.getData());
  const versions=await page.evaluate(()=>{
    const api=globalThis.__mm3Test;
    const full=api.buildCashFlowForecastCore(),lite=api.buildCashFlowForecastCore({lightweight:true}),fullAgain=api.buildCashFlowForecastCore();
    const fields=f=>f.rows.map(r=>[r.date,r.forecastBalance,r.safeTotalBudget,r.safeCashBudget,r.safeCreditBudget]);
    const now=performance.now();api.buildCashFlowForecastCore({settings:api.acfDefaultSettings(),lightweight:true});const liteMs=performance.now()-now;
    const start=performance.now();api.buildCashFlowForecastCore({settings:api.acfDefaultSettings()});const fullMs=performance.now()-start;
    return {full:fields(full),lite:fields(lite),max:full.maxSpendToday,maxAgain:fullAgain.maxSpendToday,liteMs,fullMs};
  });
  assert.deepEqual(versions.full,versions.lite);assert.equal(versions.max,versions.maxAgain);
  console.log(`ACF preview ${versions.liteMs.toFixed(1)}ms; full ${versions.fullMs.toFixed(1)}ms`);
  passed('lightweight previews preserve every balance and cash/card budget without contaminating full forecast results');

  await page.locator('#acfToday').click();
  await page.locator('#acfSetupStart').waitFor();
  await page.locator('#acfSetupReserve').click();await page.locator('[data-k="clear"]').click();await page.locator('#calcDone').click();
  await page.locator('#acfSetupStart').click();await page.locator('#acfViewMode').waitFor();await page.locator('.busy-overlay.show').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>globalThis.__mm3Test.getData().acfSettings.reserveFloor),0);
  await page.locator('#acfOpenSettings').click();
  await page.locator('#acfReserve').click();await page.locator('[data-k="clear"]').click();
  for(const digit of '12345')await page.locator(`[data-k="${digit}"]`).click();
  await page.locator('#calcDone').click();
  await page.locator('#acfCreditPreview strong').first().waitFor();
  await page.locator('#acfSettingsSave').click();
  await page.waitForFunction(()=>!document.getElementById('acfSettingsSave'));
  const summary=page.locator('.push-view.show').last().locator('.acf-summary-tile').filter({hasText:'最低残したい金額'});
  assert.ok((await summary.innerText()).includes('12,345'));
  assert.equal(await page.locator('.push-view.show').last().locator('.hero-value').first().innerText(),await page.evaluate(()=> '¥'+globalThis.__mm3Test.buildCashFlowForecast().safeTotalBudget.toLocaleString('ja-JP')));
  passed('ACF accepts a zero reserve and refreshes the parent forecast immediately after settings are saved');

  await page.locator('[data-view="calendar"]').click();await page.locator('.acf-calendar-grid').scrollIntoViewIfNeeded();
  assert.ok(await page.locator('.acf-calendar-grid').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await page.screenshot({path:resolve(root,'test-results/iphone15pro-acf-light.png'),animations:'disabled'});
  await page.locator('.acf-calendar-inspect').press('Enter');await page.locator('#inspectExpense').waitFor();
  assert.equal(await page.locator('.push-view.show').count(),2);
  await page.evaluate(()=>{globalThis.__mm3Test.popView();globalThis.__mm3Test.popView()});
  passed('393×852 touch viewport fits all seven ACF calendar columns and keyboard activation opens one day inspector');

  const bankBefore=await page.evaluate(()=>globalThis.__mm3Test.getData().banks);
  for(const tab of ['month','ledger','insights','settings','home']){
    await page.locator(`[data-tab="${tab}"]`).click();
    await page.waitForFunction(()=>document.querySelectorAll('.screen.active').length===1);
    assert.equal(await page.locator('.screen.active').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
    assert.equal(await page.locator('.tab.active').getAttribute('data-tab'),tab);
  }
  const home=await page.locator('[data-tab="home"]').boundingBox(),assets=await page.locator('[data-tab="insights"]').boundingBox();
  const y=home.y+home.height/2;
  await page.mouse.move(home.x+home.width/2,y);await page.mouse.down();await page.mouse.move(assets.x+assets.width/2,y,{steps:10});
  assert.equal(await page.locator('.tab.active').getAttribute('data-tab'),'home');
  await page.mouse.up();assert.equal(await page.locator('.tab.active').getAttribute('data-tab'),'insights');
  await page.waitForTimeout(420);
  await page.locator('[data-tab="home"]').click();
  assert.equal(await page.locator('.tab.active').getAttribute('data-tab'),'home');
  await page.mouse.move(home.x+home.width/2,y);await page.mouse.down();await page.mouse.move(assets.x+assets.width/2,y,{steps:8});
  await page.locator('#tabbar').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
  assert.equal(await page.locator('.tab.active').getAttribute('data-tab'),'home');
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().banks),bankBefore);
  passed('tab sliding previews without switching, commits once on release, and cancellation preserves navigation and bank balances');

  await page.waitForTimeout(450);await page.screenshot({path:resolve(root,'test-results/iphone15pro-home-light.png'),animations:'disabled'});
  await page.emulateMedia({colorScheme:'dark',reducedMotion:'reduce'});
  await page.waitForFunction(()=>document.documentElement.classList.contains('dark'));
  await page.screenshot({path:resolve(root,'test-results/iphone15pro-home-dark.png'),animations:'disabled'});
  assert.equal(await page.locator('#tabbar').evaluate(el=>getComputedStyle(el).height),'62px');
  passed('My Time design tokens render at iPhone 15 Pro size in light, dark and reduced-motion modes');
  const after=await page.evaluate(()=>globalThis.__mm3Test.getData());
  assert.deepEqual(after.transactions,original.transactions);assert.deepEqual(after.salaryRecords,original.salaryRecords);
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getGuardViolations()),[]);
  await context.close();
}
