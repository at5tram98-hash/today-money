import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync, existsSync, statSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright';
import {verifyDayClosingBrowser} from './day-closing-browser.mjs';
import {verifyFinalUiBrowser} from './final-ui-browser.mjs';
import {verifyClosingRefinements} from './closing-refinements-browser.mjs';
import {build, root, digest} from '../scripts/build.mjs';

build();
const results = [];
const passed = name => {results.push({name, status: 'passed'}); console.log(`PASS ${name}`);};
const hook = `globalThis.__mm3Test={getData:()=>clone(data),getState:()=>({activeTab,currentMonth,payViewMonth,assetBillingMonth}),getGuardViolations:()=>clone(mm3StateGuardViolations),replaceData:snapshot=>safeCommitAsync(()=>restoreDataSnapshot(normalizeData(snapshot))),configureAcf:settings=>safeCommitAsync(()=>Object.assign(data.acfSettings,settings)),safeCommitAsync,safeCommit,saveAsync,normalizeData,recordExpense,recordRefund,recordIncome,buildCashFlowForecastCore,buildAcfBaseContext,acfSimulateFlexiblePlan,simulateCombinedSpendCore,acfAllocateFlexiblePlan,acfDefaultSettings,switchTab,renderAll,openSalaryRecordEdit,openQuickExpense,openBankDetail,openAddCard,openAcf,openNotices,addNotice,appMaintenance,openDataSettings,buildPdfReport,enableMM3StateGuard,closeSheet,popView,openCalculator,closeCalc,calcKey,calcFinalValue,calcAssistResult,openDisplayMonthPicker,openQuickBank,openIncomeEditor,openDayClosingJournal,dayClosingReviewItems,dayClosingApprovalSignature,runWithBusy,beginBusy,endBusy,openDayClosing,openAcfDetail,openDailyGoalPlanner,openMonthlyGoalPlanner,openFinancialUpdates,financialUpdateRows,acfDisplayRows,acfDisplayValue,ACF_DAY_FIELDS,buildCashFlowForecast,getGoalState:()=>clone(goalPlannerState),recordDayClosing,cancelDayClosing,dayClosingAvailable,openDayClosingCancellation,dayClosingStatus,dayClosingSignature,buildPushSummary,openNotificationSettings};\n`;
const hookMarker = 'try{await saveAsync({snapshot:data})}catch';
const baselineRoot = process.env.MM3_BASELINE_DIR;
const financialBaselineRoot=process.env.MM3_FINANCIAL_BASELINE_DIR;
const baselineHook=`globalThis.__mm3Test={getData:()=>clone(data),replaceData:snapshot=>safeCommitAsync(()=>restoreDataSnapshot(normalizeData(snapshot))),buildCashFlowForecastCore,buildCashFlowForecast};\n`;
let workerRelease=1;
const server = createServer((req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const base = pathname.startsWith('/baseline/') ? (baselineRoot||financialBaselineRoot) : root;
    if (!base) throw new Error('Baseline is unavailable');
    let file = resolve(base, '.' + pathname.replace(/^\/(app|baseline)/, ''));
    if (!file.startsWith(resolve(base) + '/') && file !== resolve(base)) throw new Error('Invalid path');
    if (statSync(file).isDirectory()) file = resolve(file, 'index.html');
    let text = ['.png'].includes(extname(file))?readFileSync(file):readFileSync(file, 'utf8');
    // Financial/UI fixtures must never connect to the production notification server.
    if(file===resolve(base,'push-config.json'))text=JSON.stringify({apiBase:'',vapidPublicKey:''});
    if(file===resolve(root,'sw.js'))text+='\n// test release '+workerRelease+'\n';
    if (typeof text==='string' && text.includes(hookMarker)) text = text.replace(hookMarker, (pathname.startsWith('/baseline/')?baselineHook:hook) + hookMarker);
    res.setHeader('Content-Type', {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.svg':'image/svg+xml', '.png':'image/png', '.json':'application/json', '.webmanifest':'application/manifest+json'}[extname(file)] || 'text/plain');
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

async function finishDayClosing(page){
  const view=page.locator('.day-close-view').last();
  assert.equal(await view.locator('.day-close-heading').innerText(),'日締め');
  await view.locator('#dayCloseNext').click();
  for(const label of ['収入の照合','メール取引の照合','普通取引の照合','銀行残高の照合']){
    assert.equal(await view.locator('.day-close-heading').innerText(),label);
    const checks=view.locator('[data-close-key], [data-empty-group]');
    for(let i=0;i<await checks.count();i++)await checks.nth(i).check();
    assert.equal(await view.locator('#dayCloseNext').isEnabled(),true);await view.locator('#dayCloseNext').click();
  }
  assert.equal(await view.locator('#dayReviewClose').isDisabled(),true);
  await view.locator('#dayReviewConfirmed').check();await view.locator('#dayReviewClose').click();
  await view.locator('.day-close-success').waitFor();await page.locator('.busy-overlay.show').waitFor({state:'hidden'});
}

try {
  mkdirSync(resolve(root,'test-results'),{recursive:true});
  if(!process.env.MM3_CLOSING_REFINEMENTS_ONLY&&!process.env.MM3_DAY_CLOSING_ONLY&&!process.env.MM3_FINAL_UI_ONLY){
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
  await page.locator('#mm3SalaryMonth').click();await page.locator('#monthWheel-month').focus();await page.keyboard.press('ArrowDown');await page.locator('#monthPickerApply').click();
  await page.waitForFunction(() => globalThis.__mm3Test.getState().payViewMonth === '2026-11');
  assert.ok((await page.locator('#screen-pay').innerText()).includes('¥48,810'));
  await page.locator('#mm3SalaryMonth').click();await page.locator('#monthWheel-month').focus();await page.keyboard.press('ArrowUp');await page.locator('#monthPickerApply').click();
  await page.waitForFunction(() => globalThis.__mm3Test.getState().payViewMonth === '2026-10');
  passed('salary month wheel confirms and updates the view');

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


  const features=await createPage('app',{width:320});const fp=features.page;
  await fp.evaluate(()=>globalThis.__mm3Test.openCalculator('家計の金額',1001,value=>globalThis.__usedAmount=value));
  assert.equal(await fp.locator('[data-k="sign"]').count(),0);
  await fp.locator('[data-calc-tool="split"]').click();await fp.locator('#calcToolValue').fill('3');
  assert.ok((await fp.locator('#calcToolNote').innerText()).includes('334円 × 2人'));
  await fp.locator('#calcToolApply').click();await fp.locator('#calcDone').click();
  assert.equal(await fp.evaluate(()=>globalThis.__usedAmount),333);
  passed('split assistance distributes every yen and uses the chosen amount at 320px');
  await fp.evaluate(()=>globalThis.__mm3Test.openCalculator('割引',1000));await fp.locator('[data-calc-tool="discount"]').click();await fp.locator('#calcToolValue').fill('20');assert.equal(await fp.locator('#calcToolPreview').innerText(),'800円');await fp.locator('#calcToolCancel').click();assert.equal(await fp.evaluate(()=>globalThis.__mm3Test.calcFinalValue()),1000);await fp.locator('[data-calc-tool="add"]').click();await fp.locator('#calcToolValue').fill('10');await fp.locator('#calcToolApply').click();assert.equal(await fp.evaluate(()=>globalThis.__mm3Test.calcFinalValue()),1100);await fp.locator('#calcCancel').click();
  passed('discount/addition assistance previews rounding and cancel preserves the original');
  const arithmetic=await fp.evaluate(()=>{
    const t=globalThis.__mm3Test;t.openCalculator('計算',0);['clear','1','0','0','op:+','2','0','done','done'].forEach(t.calcKey);const repeated=t.calcFinalValue();t.closeCalc();t.openCalculator('負の金額',-100,null,{allowNegative:true});const negative=t.calcFinalValue();t.closeCalc();t.openCalculator('0で割る',0);['clear','1','op:/','0'].forEach(t.calcKey);const zero=t.calcFinalValue();t.closeCalc();return{repeated,negative,zero};
  });assert.deepEqual(arithmetic,{repeated:140,negative:-100,zero:null});passed('existing repeated equals, signed context and division-by-zero arithmetic are preserved');
  await fp.locator('[data-tab="payments"]').click();const originalMonth=await fp.evaluate(()=>globalThis.__mm3Test.getState().assetBillingMonth);await fp.locator('#mm3PaymentMonth').click();await fp.locator('#monthWheel-month').focus();await fp.keyboard.press('ArrowDown');await fp.locator('#monthPickerCancel').click();assert.equal(await fp.evaluate(()=>globalThis.__mm3Test.getState().assetBillingMonth),originalMonth);await fp.locator('#mm3PaymentMonth').click();await fp.locator('#monthWheel-month').focus();await fp.keyboard.press('ArrowDown');await fp.locator('#monthPickerApply').click();await fp.waitForFunction(()=>globalThis.__mm3Test.getState().assetBillingMonth==='2026-11');passed('payments uses the same month wheel; cancel cannot change the visible month');
  await fp.locator('#mm3PaymentMonth').click();await fp.locator('#month-month-12').click();await fp.locator('#monthPickerApply').click();await fp.waitForFunction(()=>globalThis.__mm3Test.getState().assetBillingMonth==='2026-12');passed('tapping a month and immediately confirming uses the tapped month');
  const date='2026-10-07';
  // Replace through the normal durable path; no nested commit is permitted.
  await fp.evaluate(async date=>{const t=globalThis.__mm3Test,state=t.getData();state.transactions=[{id:'review-a',date,amount:1001,category:'食費',merchant:'検証',paymentMethod:'other',paymentId:'',memo:''}];state.dailyCorrections[date]=900;await t.replaceData(state);t.switchTab('today')},date);
  const beforeClose=await fp.evaluate(()=>{const d=globalThis.__mm3Test.getData();return{transactions:d.transactions,banks:d.banks,cards:d.cards,dailyCorrections:d.dailyCorrections}});
  await fp.locator('#todayDayClose').click();assert.ok((await fp.locator('.day-close-totals').innerText()).includes('900'));await finishDayClosing(fp);
  const afterClose=await fp.evaluate(()=>{const d=globalThis.__mm3Test.getData();return{transactions:d.transactions,banks:d.banks,cards:d.cards,dailyCorrections:d.dailyCorrections}});assert.deepEqual(afterClose,beforeClose);passed('seven-step daily close requires all checks, uses corrected spending and preserves ledger balances');
  await fp.reload();await fp.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));assert.equal(await fp.evaluate(date=>globalThis.__mm3Test.dayClosingStatus(date),date),'closed');
  await fp.evaluate(async date=>{const t=globalThis.__mm3Test,state=t.getData();state.transactions[0].amount=2000;await t.replaceData(state);t.renderAll()},date);assert.equal(await fp.evaluate(date=>globalThis.__mm3Test.dayClosingStatus(date),date),'changed');assert.ok((await fp.locator('#todayDayClose').innerText()).includes('再確認'));await fp.locator('.native-home-mode').getByText('今月',{exact:true}).click();assert.ok((await fp.locator('[data-date="2026-10-07"]').getAttribute('aria-label')).includes('再確認'));passed('day closing persists and detects later edits even when an override keeps the total unchanged');
  await fp.locator('[data-date="2026-10-07"]').click();await fp.locator('#inspectDayClose').click();await fp.locator('#dayCloseModify').click();await fp.locator('#alertActions').getByRole('button',{name:'修正を始める',exact:true}).click();await finishDayClosing(fp);await fp.locator('.day-close-view').last().locator('#dayCloseNext').click();await fp.locator('#inspectDayClose').click();assert.equal(await fp.locator('.day-close-view').last().locator('.day-close-heading').innerText(),'承認済');await fp.locator('#dayCloseModify').click();await fp.locator('#alertActions').getByRole('button',{name:'修正を始める',exact:true}).click();assert.equal(await fp.locator('.day-close-view').last().locator('.day-close-heading').innerText(),'日締め');assert.equal(await fp.evaluate(date=>globalThis.__mm3Test.dayClosingStatus(date),date),'closed');passed('calendar opens the seven-step review and protects approved evidence until explicit revision');
  await fp.evaluate(()=>{while(document.querySelector('.push-view.show'))globalThis.__mm3Test.popView();globalThis.__mm3Test.switchTab('settings');globalThis.__mm3Test.openNotificationSettings()});await fp.waitForSelector('#pushEnable');assert.equal(await fp.locator('#pushEnable').isDisabled(),true);assert.ok((await fp.locator('.push-view.show').innerText()).includes('通知サーバー未接続'));const summary=await fp.evaluate(()=>globalThis.__mm3Test.buildPushSummary());assert.equal(summary.spending,null);assert.ok(!('transactions' in summary)&&!('gmailSettings' in summary));passed('unconfigured Push stays off and the default summary excludes amounts and Gmail credentials');
  await fp.evaluate(()=>{while(document.querySelector('.push-view.show'))globalThis.__mm3Test.popView();globalThis.__mm3Test.openCalculator('320px',999999999)});await fp.waitForTimeout(350);assert.ok(await fp.locator('#calcDone').isVisible());await fp.screenshot({path:resolve(root,'test-results/calculator-320-light.png')});await fp.locator('#calcCancel').click();await features.context.close();

  }
  if(!process.env.MM3_DAY_CLOSING_ONLY&&!process.env.MM3_FINAL_UI_ONLY)await verifyClosingRefinements({createPage,passed,root,errors});
  if(!process.env.MM3_CLOSING_REFINEMENTS_ONLY&&!process.env.MM3_FINAL_UI_ONLY)await verifyDayClosingBrowser({createPage,passed,root,errors});
  if(!process.env.MM3_CLOSING_REFINEMENTS_ONLY&&!process.env.MM3_DAY_CLOSING_ONLY)await verifyFinalUiBrowser({createPage,passed,root,financialBaselineRoot});

  const lifecycle=await createPage();const lp=lifecycle.page;
  const vapid=Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),device={apiBase:'https://money.push-test.example',vapidPublicKey:vapid,token:'test-device-token',endpoint:'https://web.push.apple.com/test-old'};
  await lp.evaluate(async connection=>{await globalThis.MoneyPushConnection.write(connection);localStorage.setItem('myMoney3_pushDevice_v1',JSON.stringify(connection));await navigator.serviceWorker.ready},device);
  await lp.reload();await lp.waitForFunction(()=>!!globalThis.__mm3Test);assert.equal((await lp.evaluate(()=>globalThis.MoneyPushConnection.read())).token,device.token);passed('Push credentials persist across page reload outside financial backups');
  await lp.evaluate(async()=>{const r=await navigator.serviceWorker.ready;globalThis.__previousPushWorker=r.active});workerRelease++;
  await lp.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r.update()});await lp.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return r.active&&r.active!==globalThis.__previousPushWorker});assert.equal((await lp.evaluate(()=>globalThis.MoneyPushConnection.read())).endpoint,device.endpoint);passed('a real Service Worker update preserves the same registration and saved Push credentials');
  let renewals=0;await lifecycle.context.route('https://money.push-test.example/v1/subscription',route=>{renewals++;assert.equal(route.request().headers().authorization,'Bearer test-device-token');return route.fulfill({json:{ok:true}})});
  const recovered=await lp.evaluate(async connection=>{const subscription={endpoint:'https://web.push.apple.com/test-new',options:{},toJSON(){return{endpoint:this.endpoint,keys:{}}}};const registration={pushManager:{getSubscription:async()=>null,subscribe:async()=>subscription}};return(await globalThis.MoneyPushConnection.reconcile(registration,connection)).connection},device);assert.equal(recovered.endpoint,'https://web.push.apple.com/test-new');assert.equal(recovered.token,device.token);assert.equal(renewals,1);passed('expired or missing subscriptions reconnect with the existing device token');
  const keyGuard=await lp.evaluate(async connection=>{let unsubscribed=false,subscribed=false;const old={endpoint:connection.endpoint,options:{applicationServerKey:new Uint8Array(65).fill(7).buffer},unsubscribe:async()=>{unsubscribed=true}};try{await globalThis.MoneyPushConnection.reconcile({pushManager:{getSubscription:async()=>old,subscribe:async()=>{subscribed=true}}},connection)}catch(error){return{error:error.message,unsubscribed,subscribed}}},device);assert.ok(keyGuard.error.includes('公開鍵'));assert.equal(keyGuard.unsubscribed,false);assert.equal(keyGuard.subscribed,false);assert.equal(renewals,1);passed('a changed VAPID key cannot silently destroy or redirect a working subscription');await lifecycle.context.close();

  assert.deepEqual(errors, []);
  passed('no JavaScript exceptions or local HTTP failures in tested flows');
  mkdirSync(resolve(root, 'test-results'), {recursive: true});
  writeFileSync(resolve(root, process.env.MM3_CLOSING_REFINEMENTS_ONLY?'test-results/browser-closing-refinements.json':process.env.MM3_DAY_CLOSING_ONLY?'test-results/browser-day-closing.json':process.env.MM3_FINAL_UI_ONLY?'test-results/browser-final-ui.json':'test-results/browser.json'), JSON.stringify({results, errors, externalAuthenticatedServicesTested: false}, null, 2));
  console.log(`${results.length} browser checks passed`);
} finally {await browser.close(); await new Promise(r => server.close(r));}
