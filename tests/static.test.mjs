import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {parse} from 'acorn';
import {Linter} from 'eslint';
import globals from 'globals';
import postcss from 'postcss';
import {build, read, manifest} from '../scripts/build.mjs';

const {javascript, styles, jsPath, cssPath} = build();

test('all JavaScript parses, including the preserved legacy page', () => {
  new vm.Script(javascript);
  for (const path of manifest.javascript.filter(p => p.endsWith('.js'))) {
    parse(read(path), {ecmaVersion: 'latest', sourceType: 'module'});
  }
  for (const [, script] of read('index 3.html').matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(script);
});

test('all CSS parses and removed sidebar styles are absent', () => {
  for (const path of manifest.styles) postcss.parse(read(path), {from: path});
  postcss.parse(styles);
  assert.ok(!/sidebar-layer|app-sidebar|sidebar-nav-button/.test(styles));
});

test('all app scopes resolve; dynamically supplied SDK globals are explicit', () => {
  const results = new Linter().verify(javascript, {
    languageOptions: {ecmaVersion: 'latest', sourceType: 'script', globals: {
      ...globals.browser, google: 'readonly', pdfjsLib: 'readonly', cardUsageLabel: 'readonly'
    }},
    rules: {
      'no-undef': 'error', 'no-dupe-args': 'error', 'no-dupe-keys': 'error',
      'no-unreachable': 'error', 'no-constant-binary-expression': 'error',
      'no-self-assign': 'error', 'valid-typeof': 'error', 'no-unsafe-optional-chaining': 'error'
    }
  });
  assert.deepEqual(results, []);
});

test('deployment assets and all template paths exist with the expected contents', () => {
  assert.equal(read(jsPath), javascript);
  assert.equal(read(cssPath), styles);
  const html = read('index.html');
  assert.ok(html.includes(`src="./${jsPath}"`));
  assert.ok(html.includes(`href="./${cssPath}"`));
  assert.ok(!html.includes('{{APP_'));
  assert.ok(!/<script>/.test(html));
  assert.ok(!/<style>/.test(html));
});

test('missing legacy salary dates normalize using the existing payroll rule', () => {
  const core = read('src/js/00-data-model.js');
  const data = vm.runInNewContext(core + `\nnormalizeData({
    employers:[{id:'e',payDay:31,payMonthOffset:1}],
    salaryRecords:[{id:'s',employerId:'e',month:'2026-01',gross:12345}]
  })`);
  assert.equal(data.salaryRecords[0].date, '2026-02-28');
  assert.equal(data.salaryRecords[0].gross, 12345);
});

test('debit plans normalize against the loaded accounts without boot state', () => {
  const data = vm.runInNewContext(read('src/js/00-data-model.js') + `\nnormalizeData({
    banks:[{id:'b',name:'Bank',balance:90000}],
    debitCards:[{id:'d',bankId:'b'}],
    largeExpensePlans:[{id:'p',paymentMethod:'debit',paymentId:'d',amount:1000,date:'2026-10-08'}]
  })`);
  assert.equal(data.largeExpensePlans[0].linkedBankId, 'b');
  assert.equal(data.banks[0].balance, 90000);
});

test('baseline storage identities and data schema remain unchanged', () => {
  for (const text of ["APP_KEY='myMoney2_v1'", "LEGACY_KEY='moneyMarginApp_v1'", "DATA_VERSION=18", "MM3_STORAGE_DB='myMoney3_storage_v1'"]) assert.ok(javascript.includes(text));
});

test('notice retention uses Tokyo midnight and preserves today, future and non-system records', () => {
  const result=vm.runInNewContext(read('src/js/00-data-model.js')+`\n(() => {
    const notices=[
      {id:'yesterday',date:'2026-10-07T14:59:59.999Z'},
      {id:'today',date:'2026-10-07T15:00:00.000Z'},
      {id:'future',date:'2026-10-10'},
      {id:'legacy-createdAt',createdAt:'2026-10-06T23:00:00+09:00'},
      {id:'legacy-key',key:'a|b|2026-10-07'},
      {id:'manual',source:'user',date:'2026-01-01'},
      {id:'undated',date:'not-a-date'},
      {id:'invalid-calendar',date:'2026-02-31'}
    ];
    return {
      ids:retainedSystemNotices(notices,new Date('2026-10-07T15:00:01Z')).map(n=>n.id),
      before:retainedSystemNotices(notices,new Date('2026-10-07T14:59:59Z')).map(n=>n.id),
      inputCount:notices.length
    };
  })()`);
  assert.deepEqual(Array.from(result.ids),['today','future','manual','undated','invalid-calendar']);
  assert.ok(result.before.includes('yesterday'));
  assert.equal(result.inputCount,8);
});

test('sidebar UI, gestures and accessibility scope are fully removed', () => {
  assert.ok(!/sidebarLayer|appSidebar|openSidebar|closeSidebar|renderSidebar|insertSidebarNav|installSidebarGestures/.test(javascript));
  assert.ok(!/sidebarLayer|appSidebar/.test(read('src/index.html')));
});
