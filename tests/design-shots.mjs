/* デザイン確認用の画面写真（ライト・ダーク）。test-results/design/<name>-<appearance>.png に保存する。 */
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPage,closeHarness,root,settle,tap,browser} from './v11-harness.mjs';
const out=resolve(root,'test-results/design',process.env.MM3_SHOT_TAG||'');mkdirSync(out,{recursive:true});
const only=process.env.MM3_SHOT_ONLY?new Set(process.env.MM3_SHOT_ONLY.split(',')):null;
for(const appearance of ['light','dark']){
  const {page,context,errors}=await createPage('app',{width:393,appearance});
  const shot=async name=>{if(only&&!only.has(name))return;await page.waitForTimeout(500);await page.screenshot({path:resolve(out,`${name}-${appearance}.png`)})};
  const closeAll=async()=>{await page.evaluate(()=>{globalThis.__mm3Test.closeSheet();while(document.querySelector('#pushLayer .push-view.show'))globalThis.__mm3Test.popView()});await settle(page)};
  await shot('home');
  await page.evaluate(()=>document.querySelector('#screen-today .scroll')?.scrollTo(0,520));await shot('home-scrolled');
  await page.evaluate(()=>document.querySelector('#screen-today .scroll')?.scrollTo(0,1300));await shot('home-highlights');
  await page.evaluate(()=>document.querySelector('#screen-today .scroll')?.scrollTo(0,0));
  await tap(page,'#homeProfile');await shot('home-settings');
  await page.evaluate(()=>document.querySelector('#homeSettingsBody')?.scrollTo(0,700));await shot('home-settings2');await closeAll();
  await tap(page,'#addHub');await shot('hub');await closeAll();
  await tap(page,'#todaySearch');await shot('search');
  await page.locator('#globalSearchInput').fill('巡回');await page.waitForTimeout(300);await shot('search-results');await closeAll();
  await tap(page,'#homeSpendCard');await shot('day');
  await tap(page,'#paymentsTab');await shot('payroot');
  await tap(page,'#settingsTab');await shot('settings');
  await page.evaluate(()=>document.querySelector('#screen-settings .scroll')?.scrollTo(0,9999));await shot('settings2');
  await tap(page,'#homeTab');await tap(page,'#homeSalaryCard');await shot('pay');
  await tap(page,'#homeTab');await tap(page,'#homeAssetsCard');await shot('assets');
  await tap(page,'#homeTab');await tap(page,'#addHub');await tap(page,'#entryExpense');await shot('sheet');await closeAll();
  await tap(page,'#homeAllTransactions');await shot('push');await closeAll();
  await page.evaluate(()=>{globalThis.__busy=globalThis.__mm3Test.beginBusy('生活費の見通しを計算中…','給与・カード・固定支払いを確認しています',{minimumMs:99999})});await shot('busy');
  console.log(appearance,errors.length?errors:'no errors');
  await context.close();
}
// 読み込み中の画面（IndexedDBの応答を止めて表示したままにする）
for(const appearance of ['light','dark']){
  if(only&&!only.has('boot'))break;
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,colorScheme:appearance,reducedMotion:'no-preference'});
  await context.route('https://accounts.google.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await context.addInitScript(()=>{indexedDB.open=()=>({})});
  const page=await context.newPage();await page.goto(process.env.MM3_SHOT_URL||'http://127.0.0.1:8765/');await page.waitForTimeout(900);
  await page.screenshot({path:resolve(out,`boot-${appearance}.png`)});await context.close();
}
// シートを開いた時に背後の画面が奥へ下がる（動きを減らさない設定）
if(!only||only.has('sheet-motion')){
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,colorScheme:'light',reducedMotion:'no-preference'});
  await context.route('https://accounts.google.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  const page=await context.newPage();await page.goto(process.env.MM3_SHOT_URL||'http://127.0.0.1:8765/');await page.waitForFunction(()=>!document.getElementById('mm3StorageBoot'));await page.waitForTimeout(500);
  await page.locator('#addHub').click();await page.waitForTimeout(700);
  await page.screenshot({path:resolve(out,'sheet-motion-light.png')});await context.close();
}
await closeHarness();
