/* デザイン確認用の画面写真（ライト・ダーク）。test-results/design/<name>-<appearance>.png に保存する。 */
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPage,closeHarness,root,settle,tap,browser} from './v11-harness.mjs';
const out=resolve(root,'test-results/design',process.env.MM3_SHOT_TAG||'');mkdirSync(out,{recursive:true});
let baseUrl=process.env.MM3_SHOT_URL||'';
const only=process.env.MM3_SHOT_ONLY?new Set(process.env.MM3_SHOT_ONLY.split(',')):null;
for(const appearance of ['light','dark']){
  const {page,context,errors}=await createPage('app',{width:393,appearance});if(!baseUrl)baseUrl=new URL(page.url()).origin+'/';
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
  await closeAll();
  await page.evaluate(async()=>{const t=globalThis.__mm3Test,s=t.getData(),base=s.transactions[0],cats=['食費','交通費','日用品','娯楽費'];for(let i=0;i<40;i++){const d=new Date(2026,9,7-i);s.transactions.push({...base,id:'tx_shot'+i,date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,amount:300+((i*737)%2600),category:cats[i%4],merchant:['コンビニ','電車','ドラッグストア','映画'][i%4],bankApplied:false,createdAt:new Date(2026,9,7-i,8+(i%12)).toISOString()})}await t.replaceData(s);t.renderAll()});await settle(page);
  await tap(page,'#homeTab');await tap(page,'#homeSpendCard');await page.evaluate(()=>{const c=document.querySelector('#dayContent [data-spend-chart]');c.closest('.scroll').scrollTop=c.offsetTop-150});await shot('chart-week');
  await page.evaluate(()=>document.querySelector('#dayContent [data-sc-range="M"]').click());await shot('chart-month');
  {const b=await page.locator('#dayContent .sc-plot').boundingBox();await page.mouse.move(b.x+30,b.y+90);await page.mouse.down();await page.mouse.move(b.x+150,b.y+92,{steps:6});await shot('chart-scrub');await page.mouse.up()}
  await page.evaluate(()=>document.querySelector('#dayContent [data-sc-range="Y"]').click());await shot('chart-year');
  await tap(page,'#homeTab');await tap(page,'#homeAllTransactions');await shot('txlist');
  {const row=page.locator('.push-view.show .txl-row').nth(1),b=await row.boundingBox();await page.mouse.move(b.x+300,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+80,b.y+b.height/2,{steps:8});await page.mouse.up();await shot('txswipe')}
  await page.evaluate(()=>document.querySelector('.push-view.show .txl-row:not(.swiped)')?.click());await shot('txdetail');await closeAll();
  await tap(page,'#todaySearch');await page.locator('#globalSearchInput').fill('コンビニ');await page.locator('#gsPeriodChip').click();await shot('search-period');await page.locator('[data-gsf="month"]').click();await shot('search-filtered');await closeAll();
  await tap(page,'#homeAssetsCard');await page.evaluate(()=>{globalThis.__slowA=new Promise(r=>globalThis.__relA=r);globalThis.__mm3Test.runInArea('#mm3AssetChartBlock',()=>globalThis.__slowA,{title:'資産予測を計算しています…',sub:'長期の給与・カード・固定支払いを確認しています',label:'資産予測'})});await page.evaluate(()=>document.querySelector('#mm3AssetChartBlock').scrollIntoView({block:'center'}));await shot('area-loading');
  await page.evaluate(()=>globalThis.__relA());await page.waitForTimeout(500);await page.evaluate(()=>globalThis.__mm3Test.runInArea('#mm3AssetChartBlock',()=>{throw new Error('x')},{label:'資産予測'}).catch(()=>{}));await shot('area-error');await closeAll();await tap(page,'#homeTab');
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
  const page=await context.newPage();await page.goto(baseUrl);await page.waitForTimeout(900);
  await page.screenshot({path:resolve(out,`boot-${appearance}.png`)});await context.close();
}
// シートを開いた時に背後の画面が奥へ下がる（動きを減らさない設定）
if(!only||only.has('sheet-motion')){
  const context=await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,colorScheme:'light',reducedMotion:'no-preference'});
  await context.route('https://accounts.google.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  const page=await context.newPage();await page.goto(baseUrl);await page.waitForFunction(()=>!document.getElementById('mm3StorageBoot'));await page.waitForTimeout(500);
  await page.locator('#addHub').click();await page.waitForTimeout(700);
  await page.screenshot({path:resolve(out,'sheet-motion-light.png')});
  await page.evaluate(()=>globalThis.__mm3Test?.closeSheet?.());await page.waitForTimeout(400);await page.evaluate(()=>{document.getElementById('sheet').classList.remove('show');document.getElementById('dim')?.classList.remove('show')});await page.waitForTimeout(300);
  await page.locator('#todaySearch').click();await page.waitForTimeout(110);await page.screenshot({path:resolve(out,'search-morph-light.png')});await context.close();
}
await closeHarness();
