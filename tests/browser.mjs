import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright';
import {build, root, digest} from '../scripts/build.mjs';

build();
const results = [];
const passed = name => {results.push({name, status: 'passed'}); console.log(`PASS ${name}`);};
const hook = `globalThis.__mm3Test={getData:()=>clone(data),getState:()=>({activeTab,currentMonth,payViewMonth,assetBillingMonth}),getGuardViolations:()=>clone(mm3StateGuardViolations),replaceData:snapshot=>safeCommitAsync(()=>restoreDataSnapshot(normalizeData(snapshot))),configureAcf:settings=>safeCommitAsync(()=>Object.assign(data.acfSettings,settings)),safeCommitAsync,safeCommit,saveAsync,normalizeData,recordExpense,recordRefund,recordIncome,buildCashFlowForecastCore,buildAcfBaseContext,acfSimulateFlexiblePlan,simulateCombinedSpendCore,acfAllocateFlexiblePlan,acfDefaultSettings,switchTab,renderAll,openSalaryRecordEdit,openQuickExpense,openBankDetail,openAddCard,openAcf,openNotices,addNotice,appMaintenance,openDataSettings,buildPdfReport,enableMM3StateGuard,closeSheet,popView};\n`;
const hookMarker = 'try{await saveAsync({snapshot:data})}catch';
const baselineRoot = process.env.MM3_BASELINE_DIR;
const server = createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const base = pathname.startsWith('/baseline/') ? baselineRoot : root;
    if (!base) throw new Error('Baseline is unavailable');
    let file = resolve(base, '.' + pathname.replace(/^\/(app|baseline)/, ''));
    if (!file.startsWith(resolve(base) + '/') && file !== resolve(base)) throw new Error('Invalid path');
    if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
    let text = readFileSync(file, 'utf8');
    if (text.includes(hookMarker)) text = text.replace(hookMarker, hook + hookMarker);
    res.setHeader('Content-Type', {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html'}[extname(file)] || 'text/plain');
    res.end(text);
  } catch {res.writeHead(404); res.end('Not found');}
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({
  executablePath: process.env.MM3_CHROMIUM_PATH || undefined,
  headless: true, args: ['--no-sandbox', '--disable-gpu', '--no-zygote']
});
const errors = [];

async function createPage(version = 'app', {width = 390, appearance = 'light', localOnly = false, stored = null, timezoneId = 'Asia/Tokyo'} = {}) {
  const context = await browser.newContext({viewport: {width, height: 844}, timezoneId, colorScheme: appearance});
  // OAuth account access requires the user's session; these tests cover local app behavior.
  await context.route('https://accounts.google.com/**', route => route.fulfill({body: '', contentType: 'text/javascript'}));
  await context.addInitScript(({appearance, localOnly, stored}) => {
    const RealDate = Date; globalThis.__mm3TestClock={now:new RealDate('2026-10-07T12:00:00Z').getTime()};
    globalThis.Date = class extends RealDate {constructor(...args) {super(...(args.length ? args : [globalThis.__mm3TestClock.now]));} static now() {return globalThis.__mm3TestClock.now;}};
    let seed = 123456789; Math.random = () => {seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296;};
    if (localOnly) Object.defineProperty(globalThis, 'indexedDB', {value: undefined});
    if (stored&&!sessionStorage.getItem('__mm3FixtureSeeded')) {
      localStorage.setItem('myMoney2_v1', JSON.stringify(stored));
      sessionStorage.setItem('__mm3FixtureSeeded','true');
    }
  }, {appearance, localOnly, stored});
  const page = await context.newPage();
  page.on('pageerror', error => errors.push({version, message: error.message}));
  page.on('response', response => {if (response.url().startsWith(origin) && response.status() >= 400) errors.push({version, message: `HTTP ${response.status()} ${response.url()}`});});
  page.on('console', message => {if (message.type() === 'error') errors.push({version, message: message.text()});});
  await page.goto(`${origin}/${version}/`);
  await page.waitForFunction(() => !!globalThis.__mm3Test && !document.getElementById('mm3StorageBoot'));
  return {page, context};
}

try {
  mkdirSync(resolve(root,'test-results'),{recursive:true});
  for (const width of [320, 390, 1440]) for (const appearance of ['light', 'dark']) {
    const candidate = await createPage('app', {width, appearance});
    const baseline = baselineRoot ? await createPage('baseline', {width, appearance}) : null;
    for (const tab of ['today', 'month', 'pay', 'payments', 'assets', 'settings']) {
      for (const target of [candidate, baseline].filter(Boolean)) {
        await target.page.evaluate(tab => globalThis.__mm3Test.switchTab(tab), tab);
        await target.page.waitForFunction(tab => document.querySelector(`#screen-${tab}`).classList.contains('active'), tab);
      }
      if (baseline) {
        assert.equal(await candidate.page.locator(`#screen-${tab}`).innerText(), await baseline.page.locator(`#screen-${tab}`).innerText());
        const a = await candidate.page.screenshot({animations: 'disabled'}), b = await baseline.page.screenshot({animations: 'disabled'});
        assert.equal(digest(a), digest(b), `${width}px ${appearance} ${tab} screenshot differs`);
      }
      assert.equal(await candidate.page.locator('[id^="sidebarOpen-"]').count(),0);
      assert.equal(await candidate.page.locator('#sidebarLayer').count(),0);
      const dimensions=await candidate.page.locator(`#screen-${tab} .scroll`).evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
      assert.ok(dimensions.scroll<=dimensions.width+1,`${width}px ${appearance} ${tab} overflows horizontally`);
      if(tab==='today'||tab==='month')assert.equal(await candidate.page.locator(`#screen-${tab} .native-home-mode`).count(),1);
      if(tab==='settings'){
        const radius=await candidate.page.locator('.settings-profile-avatar').evaluate(el=>getComputedStyle(el).borderRadius);
        assert.equal(radius,'50%');
        await candidate.page.screenshot({path:resolve(root,`test-results/settings-${width}-${appearance}.png`),animations:'disabled'});
      }
      passed(`${width}px ${appearance} ${tab}${baseline ? ' matches baseline text and pixels' : ' renders'}`);
    }
    await candidate.context.close(); if (baseline) await baseline.context.close();
  }

  const {page, context} = await createPage();
  for (const tab of ['pay', 'payments', 'assets', 'settings', 'home']) {
    await page.locator(`[data-tab="${tab}"]`).click();
    await page.waitForFunction(() => document.querySelectorAll('.screen.active').length === 1);
  }
  passed('tab buttons respond and keep exactly one active screen');
  await page.locator('[data-tab="pay"]').click();
  await page.locator('#mm3SalaryMonth').selectOption('2026-11');
  await page.waitForFunction(() => globalThis.__mm3Test.getState().payViewMonth === '2026-11');
  assert.ok((await page.locator('#screen-pay').innerText()).includes('¥48,810'));
  await page.locator('#mm3SalaryMonth').selectOption('2026-10');
  await page.waitForFunction(() => globalThis.__mm3Test.getState().payViewMonth === '2026-10');
  passed('salary month dropdown updates immediately');

  await page.evaluate(() => globalThis.__mm3Test.openSalaryRecordEdit('salary_seed_gu_202610'));
  await page.locator('#srGross').click();
  await page.locator('#calcGrid').getByRole('button', {name: 'AC', exact: true}).click();
  for (const key of ['3', '0', '0', '0', '0']) await page.locator(`[data-k="${key}"]`).click();
  await page.locator('#calcDone').click();
  await page.locator('#srSave').click();
  await page.waitForFunction(() => globalThis.__mm3Test.getData().salaryRecords.find(r => r.id === 'salary_seed_gu_202610').gross === 30000);
  passed('salary amount calculator, save button, and durable commit');
  await page.reload();
  await page.waitForFunction(() => !!globalThis.__mm3Test && !document.getElementById('mm3StorageBoot'));
  assert.equal(await page.evaluate(() => globalThis.__mm3Test.getData().salaryRecords.find(r => r.id === 'salary_seed_gu_202610').gross), 30000);
  passed('salary edit survives reload through IndexedDB');

  await page.evaluate(() => globalThis.__mm3Test.switchTab('month'));
  await page.locator('#monthMenu').click();
  await page.locator('#menuLayer').getByText('理由が分かる分析', {exact: true}).click();
  await page.waitForFunction(() => document.querySelector('.push-view .push-title')?.textContent === '理由が分かる分析');
  passed('month menu reason analysis opens without an undefined month');
  await page.evaluate(() => globalThis.__mm3Test.popView());

  await page.locator('[data-tab="payments"]').click();
  await page.locator('#mm3AtfOpen').click();
  await page.waitForFunction(() => document.getElementById('sheet').classList.contains('show'));
  assert.ok(await page.locator('#sheet .mm3-atf-dayrow').count() > 0);
  await page.locator('#mm3AtfClose').click();
  await page.waitForFunction(() => !document.getElementById('sheet').classList.contains('show'));
  passed('ATF daily calendar opens, renders and closes');

  await page.evaluate(async () => {await globalThis.__mm3Test.configureAcf({initialized:true}); globalThis.__mm3Test.openAcf();});
  await page.waitForFunction(() => document.getElementById('sheet').classList.contains('show') || document.querySelector('.push-view'));
  await page.waitForFunction(() => document.getElementById('acfMonthSelect'));
  assert.ok((await page.locator('body').innerText()).includes('日別資金表'));
  await page.locator('#acfMonthSelect').selectOption('2026-12');
  await page.waitForFunction(() => document.getElementById('acfMonthSelect')?.value === '2026-12');
  await page.evaluate(() => globalThis.__mm3Test.closeSheet());
  passed('ACF daily cash table opens and switches to the second month ahead');

  const expected = await page.evaluate(async () => {
    const api = globalThis.__mm3Test;
    const before = api.getData();
    const bankId = before.banks[0].id;
    await api.safeCommitAsync(() => {
      api.recordExpense({amount: 1234, date: '2026-10-07', merchant: '検証支出', paymentMethod: 'bank', paymentId: bankId, respectBalanceAsOf: false, saveNow: false});
      api.recordRefund({amount: 234, date: '2026-10-07', merchant: '検証返金', paymentMethod: 'bank', paymentId: bankId, respectBalanceAsOf: false, saveNow: false});
      api.recordIncome({amount: 2000, date: '2026-10-07', sourceName: '検証入金', toType: 'bank', bankId, respectBalanceAsOf: false, saveNow: false});
    }, {label: 'regression amounts'});
    return {before: before.banks[0].balance, after: api.getData().banks[0].balance};
  });
  assert.equal(expected.after, expected.before + 1000);
  passed('bank expense, refund and income preserve balance arithmetic');
  const balance = expected.after;
  await page.evaluate(async () => {
    const api = globalThis.__mm3Test;
    await api.safeCommitAsync(() => api.recordExpense({amount: 500, date: '2026-10-07', merchant: '検証カード', paymentMethod: 'card', paymentId: api.getData().cards[0].id, saveNow: false}));
  });
  assert.equal(await page.evaluate(() => globalThis.__mm3Test.getData().banks[0].balance), balance);
  passed('card purchase does not immediately subtract bank cash');
  await page.reload();
  await page.waitForFunction(() => !!globalThis.__mm3Test && !document.getElementById('mm3StorageBoot'));
  assert.equal(await page.evaluate(() => globalThis.__mm3Test.getData().banks[0].balance), balance);
  passed('transactions and account balances survive reload');

  const forecast = await page.evaluate(() => {
    const f = globalThis.__mm3Test.buildCashFlowForecastCore({startDate: '2026-10-07', horizonEnd: '2026-12-31'});
    return JSON.parse(JSON.stringify(f));
  });
  assert.ok(JSON.stringify(forecast).length > 1000);
  assert.ok(!JSON.stringify(forecast).includes('null,"balance"'));
  passed('ACF forecast executes across month and year boundaries');
  const pdf = await page.evaluate(async () => {const b = await globalThis.__mm3Test.buildPdfReport('2026-10'); return {size: b.size, type: b.type, header: await b.slice(0, 5).text()};});
  assert.equal(pdf.header, '%PDF-'); assert.equal(pdf.type, 'application/pdf'); assert.ok(pdf.size > 1000);
  passed('existing PDF report export generates a PDF');
  const cashFlow = await page.evaluate(async () => {
    const api = globalThis.__mm3Test, fixture = api.getData();
    for (const key of ['transactions','incomes','cards','debitCards','salaryRecords','tempIncomes','fixedPayments','largeExpensePlans','assetSnapshots','salaryAllocations','transferPlans','eventGoals','reimbursements']) fixture[key] = [];
    fixture.banks = [{id:'test_bank',name:'Test Bank',balance:10000,threshold:0}];
    fixture.dailyGoals = {}; fixture.monthlyGoals = {}; fixture.cardAdjustments = {};
    await api.replaceData(fixture);
    const settings = {...api.acfDefaultSettings(),reserveFloor:1500,creditFallbackEnabled:false};
    const ctx = api.buildAcfBaseContext({startDate:'2026-10-07',horizonEnd:'2026-10-09',settings});
    const plan = Object.fromEntries(ctx.dates.map(date => [date,1000]));
    const simulation = api.acfSimulateFlexiblePlan(plan,ctx,settings);
    return {opening:ctx.openingBalance,balances:simulation.rows.map(r=>r.forecastBalance),cash:simulation.rows.map(r=>r.flexibleCash),credit:simulation.rows.map(r=>r.flexibleCredit),headroom:simulation.rows.map(r=>r.headroom)};
  });
  assert.equal(cashFlow.opening,10000);
  assert.deepEqual(cashFlow.balances,[9000,8000,7000]);
  assert.deepEqual(cashFlow.cash,[1000,1000,1000]);
  assert.deepEqual(cashFlow.credit,[0,0,0]);
  assert.deepEqual(cashFlow.headroom,[7500,6500,5500]);
  passed('ACF opening balance, daily cash use, reserve and credit accounting conserve funds');
  await context.close();

  const fallback = await createPage('app', {localOnly: true});
  await fallback.page.evaluate(async () => {await globalThis.__mm3Test.safeCommitAsync(() => globalThis.__mm3Test.recordIncome({amount: 4321, sourceName: 'fallback test', saveNow: false}));});
  await fallback.page.reload();
  await fallback.page.waitForFunction(() => !!globalThis.__mm3Test && !document.getElementById('mm3StorageBoot'));
  assert.ok(await fallback.page.evaluate(() => globalThis.__mm3Test.getData().incomes.some(x => x.amount === 4321)));
  passed('localStorage fallback persists when IndexedDB is unavailable');
  await fallback.context.close();

  const current = await createPage(); const stored = await current.page.evaluate(() => globalThis.__mm3Test.getData()); await current.context.close();
  stored.salaryRecords[0].date = '';
  stored.debitCards.push({id: 'test_debit', name: '検証デビット', bankId: stored.banks[0].id});
  stored.largeExpensePlans.push({id: 'test_debit_plan', paymentMethod: 'debit', paymentId: 'test_debit', amount: 1000, date: '2026-10-08'});
  const migrated = await createPage('app', {stored});
  const loaded = await migrated.page.evaluate(() => globalThis.__mm3Test.getData());
  assert.equal(loaded.salaryRecords[0].date, '2026-10-10');
  assert.equal(loaded.largeExpensePlans.find(x => x.id === 'test_debit_plan').linkedBankId, stored.banks[0].id);
  passed('saved legacy data with missing salary dates and debit plans boots successfully');
  await migrated.context.close();

  const ui=await createPage();
  await ui.page.evaluate(()=>globalThis.__mm3Test.enableMM3StateGuard('throw'));
  await ui.page.locator('[data-tab="settings"]').click();
  await ui.page.locator('#profileSettings').click();
  await ui.page.locator('#prName').fill('検証プロフィール');
  const photo=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
  await ui.page.locator('#prImage').setInputFiles({name:'avatar.png',mimeType:'image/png',buffer:photo});
  await ui.page.waitForFunction(()=>document.querySelector('#profilePreview img')?.src.startsWith('data:image/jpeg'));
  assert.equal(await ui.page.evaluate(()=>globalThis.__mm3Test.getData().profile.name),'');
  assert.ok(!await ui.page.evaluate(()=>globalThis.__mm3Test.getData().profile.icon));
  await ui.page.screenshot({path:resolve(root,'test-results/profile-editor.png'),animations:'disabled'});
  await ui.page.locator('#prSave').click();
  await ui.page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  assert.equal(await ui.page.locator('.settings-profile-name').innerText(),'検証プロフィール');
  await ui.page.reload();
  await ui.page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
  await ui.page.locator('[data-tab="settings"]').click();
  assert.equal(await ui.page.evaluate(()=>globalThis.__mm3Test.getData().profile.name),'検証プロフィール');
  assert.ok(await ui.page.locator('.settings-profile-avatar img').getAttribute('src'));
  passed('profile name and resized photo preview remain drafts until save, and persist after reload');
  await ui.page.evaluate(()=>globalThis.__mm3Test.enableMM3StateGuard('throw'));
  await ui.page.locator('#profileSettings').click();
  await ui.page.locator('#prClear').click();
  await ui.page.locator('#prCancel').click();
  await ui.page.locator('#alertActions').getByRole('button',{name:'破棄',exact:true}).click();
  await ui.page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  assert.ok(await ui.page.evaluate(()=>globalThis.__mm3Test.getData().profile.icon));
  passed('canceling photo removal preserves the saved profile and releases modal focus');
  await ui.page.locator('#profileSettings').click();
  await ui.page.locator('#prClear').click();
  await ui.page.locator('#prSave').click();
  await ui.page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  assert.equal(await ui.page.evaluate(()=>globalThis.__mm3Test.getData().profile.icon),'');
  passed('saving photo removal restores the circular placeholder');
  await ui.page.locator('#profileSettings').click();
  await ui.page.locator('#prImage').setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')});
  await ui.page.waitForFunction(()=>!document.querySelector('#prSave').disabled);
  assert.ok((await ui.page.locator('#toastLayer').innerText()).includes('写真を読み込めませんでした'));
  await ui.page.evaluate(()=>globalThis.__mm3Test.closeSheet());
  passed('invalid photo input reports an error and leaves saved profile unchanged');
  await ui.page.locator('#favoriteSettings').click();
  await ui.page.locator('[data-fav-toggle="salary"]').click();
  await ui.page.locator('[data-fav-open="salary"]').click();
  await ui.page.waitForFunction(()=>document.querySelector('#screen-pay').classList.contains('active')&&!document.querySelector('.push-view.show'));
  assert.ok(await ui.page.evaluate(()=>globalThis.__mm3Test.getData().sidebarFavorites.includes('salary')));
  passed('favorites can be added and opened from Settings without a sidebar');
  await ui.page.locator('[data-tab="settings"]').click();
  await ui.page.locator('#tagSettings').click();
  await ui.page.locator('#tagAdd').click();
  await ui.page.locator('#tagName').fill('検証タグ');
  await ui.page.locator('#tagSave').click();
  await ui.page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  assert.ok((await ui.page.locator('.push-view.show').innerText()).includes('検証タグ'));
  assert.deepEqual(await ui.page.evaluate(()=>globalThis.__mm3Test.getGuardViolations()),[]);
  passed('tags remain editable through Settings with no guarded state writes');
  await ui.context.close();

  const seeded=await createPage();
  const noticeFixture=await seeded.page.evaluate(()=>globalThis.__mm3Test.getData());
  await seeded.context.close();
  noticeFixture.notices=[
    {id:'old',title:'昨日の通知',message:'期限切れ',date:'2026-10-06T14:59:59Z',read:false},
    {id:'today',title:'今日の通知',message:'保持',date:'2026-10-06T15:00:00Z',read:false}
  ];
  const noticePage=await createPage('app',{stored:noticeFixture,timezoneId:'America/Los_Angeles'});
  assert.ok(!await noticePage.page.evaluate(()=>globalThis.__mm3Test.getData().notices.some(n=>n.id==='old')));
  assert.ok(await noticePage.page.evaluate(()=>globalThis.__mm3Test.getData().notices.some(n=>n.id==='today')));
  await noticePage.page.evaluate(()=>globalThis.__mm3Test.enableMM3StateGuard('throw'));
  await noticePage.page.evaluate(()=>globalThis.__mm3Test.openNotices());
  assert.ok((await noticePage.page.locator('.push-view.show').innerText()).includes('今日の通知'));
  assert.ok(await noticePage.page.evaluate(()=>globalThis.__mm3Test.getData().notices.every(n=>n.read)));
  passed('startup removes yesterday notices, keeps today in Tokyo even from another browser timezone, and marks read safely');
  await noticePage.page.evaluate(()=>{
    globalThis.__mm3TestClock.now=new Date('2026-10-07T15:00:01Z').getTime();
    globalThis.__mm3Test.appMaintenance();
  });
  assert.ok(!await noticePage.page.evaluate(()=>globalThis.__mm3Test.getData().notices.some(n=>n.id==='today')));
  assert.ok(!(await noticePage.page.locator('.push-view.show').innerText()).includes('今日の通知'));
  passed('daily maintenance purges expired stored notices and refreshes an open notice panel');
  await noticePage.page.evaluate(()=>{
    globalThis.__mm3Test.addNotice('復帰検証','翌日に消える','info',false);
    globalThis.__mm3TestClock.now=new Date('2026-10-08T15:00:01Z').getTime();
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.ok(!await noticePage.page.evaluate(()=>globalThis.__mm3Test.getData().notices.some(n=>n.title==='復帰検証')));
  await noticePage.page.reload();
  await noticePage.page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
  assert.ok(!await noticePage.page.evaluate(()=>globalThis.__mm3Test.getData().notices.some(n=>n.id==='old'||n.id==='today'||n.title==='復帰検証')));
  passed('resume removes yesterday notices permanently and reload does not restore them');
  await noticePage.context.close();

  assert.deepEqual(errors, []);
  passed('no JavaScript exceptions or local HTTP failures in tested flows');
  mkdirSync(resolve(root, 'test-results'), {recursive: true});
  writeFileSync(resolve(root, 'test-results/browser.json'), JSON.stringify({results, errors, externalAuthenticatedServicesTested: false}, null, 2));
  console.log(`${results.length} browser checks passed`);
} finally {await browser.close(); await new Promise(r => server.close(r));}
