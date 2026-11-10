import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, manifest, assemble} from '../scripts/build.mjs';

const javascript=assemble(manifest.javascript),styles=assemble(manifest.styles);
const read=path=>readFileSync(resolve(root,path),'utf8');

test('第11版 C章: semantic colour, spacing and motion tokens live in tokens.css',()=>{
  const tokens=read('src/css/tokens.css');
  for(const value of ['--accent: #1673F7','--danger: #D93B46','--success: #16865D','--bg: #F6F7FA','--bg: #0A0B0E','--tap-min: 44px','--row-height: 56px','--cta-height: 52px','--motion-push: 220ms','--motion-sheet: 260ms'])assert.ok(tokens.includes(value),value);
  assert.ok(tokens.includes('--blue: var(--accent)')&&tokens.includes('--red: var(--danger)')&&tokens.includes('--green: var(--success)'));
  assert.equal(manifest.styles[0],'src/css/tokens.css');
  // 層をなくした構成: ファイルは部品単位で、版や段階の名前を持たない
  for(const file of manifest.styles)assert.match(file,/^src\/css\/[a-z-]+\.css$/);
  assert.ok(!manifest.styles.some(file=>/\d|native-ui|workspace|v11/.test(file)));
  // トークン（カスタムプロパティ）を :root / html.dark に定義するのは tokens.css だけ
  for(const file of manifest.styles.slice(1))assert.ok(!/^\s*(:root|html(\.dark)?) \{[^}]*[{;] ?--[a-z-]+:/m.test(read(file)),`${file} does not define tokens`);
});

test('CALC-117/120: no calculator callback writes the ledger without a separate confirmation',()=>{
  const calls=[...javascript.matchAll(/openCalculator\((?:[^()]|\((?:[^()]|\([^()]*\))*\))*?,(async )?(\w+|\([^)]*\))=>\{(.{0,260})/g)];
  assert.ok(calls.length>=3);
  for(const call of calls){
    const body=call[3];
    if(/safeCommit|runSaveAction|reconcileBankBalance/.test(body))assert.ok(body.includes('confirmAmountDraft('),`calculator callback commits directly: ${body.slice(0,90)}`);
  }
  assert.equal((javascript.match(/await confirmAmountDraft\(/g)||[]).length,3);
  const apply=javascript.slice(javascript.indexOf("document.getElementById('calcToolApply').onclick"));
  assert.ok(!/safeCommit|runSaveAction/.test(apply.slice(0,apply.indexOf('document.addEventListener'))));
});

test('SALARYEDIT-199/200: the balance switch never commits; only the explicit buttons do',()=>{
  const start=javascript.indexOf('function openCardPaidConfirmation('),body=javascript.slice(start,javascript.indexOf('\nfunction bindCardDetail(',start));
  assert.ok(body.includes('id="cpApply" role="switch" aria-checked="false"'));
  const toggle=body.slice(body.indexOf('toggle.onclick='),body.indexOf('const commit='));
  assert.ok(toggle&&!/markCardStatementPaid|runSaveAction|safeCommit/.test(toggle));
  assert.equal((body.match(/markCardStatementPaid\(/g)||[]).length,1);
  assert.ok(body.includes("reconciled.onclick=()=>{if(!reflect)commit(reconciled,'reconciled')}")&&body.includes("apply.onclick=()=>{if(reflect&&bank)commit(apply,'apply')}"));
});

test('SALARYEDIT-191/192/193: arrows step one month and the wheel applies only on confirmation',()=>{
  assert.ok(javascript.includes("root.querySelector('#cardPrevPay').onclick=()=>refreshCardDetail(id,addMonths(paymentMonth,-1))"));
  assert.ok(javascript.includes("root.querySelector('#cardNextPay').onclick=()=>refreshCardDetail(id,addMonths(paymentMonth,1))"));
  const start=javascript.indexOf('function openCardBillingMonthPicker('),body=javascript.slice(start,javascript.indexOf('function openCardPaidConfirmation(',start));
  assert.equal((body.match(/refreshCardDetail\(/g)||[]).length,1);
  assert.ok(body.includes("root.querySelector('#cbmApply').onclick=")&&body.indexOf('refreshCardDetail(')>body.indexOf("'#cbmApply').onclick="));
});

test('GOAL-034: approval needs an 85% release or the confirmed alternative',()=>{
  assert.ok(javascript.includes('if(ratio>=.85){handle.style.transform'));
  assert.ok(javascript.includes('id="goalApprovalConfirm"')&&javascript.includes("if(alt)alt.onclick=confirmApproval"));
  assert.ok(styles.includes('.approval-slider.returning .approval-handle { transition: transform .17s'));
});

test('BACKUP-208/210: restore passes through the preview and no cancel path deletes data',()=>{
  const start=javascript.indexOf('async function importBackup('),body=javascript.slice(start,javascript.indexOf('function backupPreviewRows(',start));
  assert.ok(!/saveAsync|prepareLoadedData|writeRecoverySnapshotAsync/.test(body),'file selection never writes');
  assert.ok(body.includes('openBackupRestorePreview(obj,check,f)'));
  assert.equal((javascript.match(/await restoreBackupPayload\(/g)||[]).length,1);
  assert.ok(!javascript.includes("cancelText:'完全に空にする'"),'cancel can no longer wipe everything');
  const del=javascript.slice(javascript.indexOf('function openDeleteAllConfirmation('));
  assert.ok(del.indexOf("field.value.trim()!=='削除'")<del.indexOf('await resetAllData('));
});

test('第11版 C章: 動きは仕様の時間内（処理中を示すスピナーだけが繰り返す）',async()=>{
  const {default:postcss}=await import('postcss'),long=[];
  for(const file of manifest.styles)postcss.parse(read(file)).walkDecls(/^(transition|animation)(-duration)?$/,d=>{
    const ms=[...d.value.matchAll(/(\d*\.?\d+)(ms|s)\b/g)].map(x=>parseFloat(x[1])*(x[2]==='s'?1000:1)),durations=d.prop.startsWith('animation')?ms.slice(0,1):ms;
    const spinner=/infinite/.test(d.value)&&/busy|spin|Spin|Orbit|Sweep|Breathe/.test(d.value);
    if(!spinner&&durations.some(v=>v>270))long.push(`${file}: ${d.parent.selector} ${d.value}`);
    if(/infinite/.test(d.value)&&!spinner)long.push(`${file}: ${d.parent.selector} repeats forever`);
  });
  assert.deepEqual(long,[]);
  const tokens=read('src/css/tokens.css');for(const v of ['--motion-push: 220ms','--motion-sheet: 260ms','--motion-menu: 160ms'])assert.ok(tokens.includes(v),v);
});
