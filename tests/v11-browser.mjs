import assert from 'node:assert/strict';
import {resolve} from 'node:path';

/* 第11版の確定仕様のうち、会計データを誤って書き換えやすい操作を実ブラウザで検証する。
   各検証は「操作前後の保存データの比較」を必ず含む。 */
const api=fn=>`globalThis.__mm3Test.${fn}`;
const getData=page=>page.evaluate(()=>globalThis.__mm3Test.getData());
const yenNumber=text=>Number(String(text).replace(/[^0-9-]/g,''));
const alertButton=(page,name)=>page.locator('#alertActions').getByRole('button',{name,exact:true});
async function closeEverything(page){
  await page.evaluate(()=>{const t=globalThis.__mm3Test;t.closeCalc();document.getElementById('alertWrap').classList.remove('show');t.closeSheet();while(document.querySelector('.push-view.show')&&t.popView()!==false);});
  await page.waitForTimeout(80);
}
async function assertTapTarget(locator,label){
  const box=await locator.boundingBox();assert.ok(box,`${label} is visible`);
  /* a moving sheet reports 43.99…px for a 44px control */assert.ok(box.width>=43.5&&box.height>=43.5,`${label} is at least 44×44 (got ${Math.round(box.width)}×${Math.round(box.height)})`);
}
async function assertSheetFits(page,label){
  const d=await page.locator('#sheet').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));
  assert.ok(d.scroll<=d.width+1,`${label} does not overflow horizontally`);
}

async function verifyTokens(page,appearance){
  const tokens=await page.evaluate(()=>{const s=getComputedStyle(document.documentElement),probe=document.createElement('div');probe.style.color='var(--accent)';probe.style.background='var(--bg)';probe.style.borderColor='var(--danger)';probe.style.outlineColor='var(--success)';document.body.append(probe);const c=getComputedStyle(probe),out={accent:c.color,bg:c.backgroundColor,danger:c.borderTopColor,success:c.outlineColor,tap:s.getPropertyValue('--tap-min').trim(),push:s.getPropertyValue('--motion-push').trim(),sheet:s.getPropertyValue('--motion-sheet').trim()};probe.remove();return out});
  if(appearance==='light'){
    assert.equal(tokens.accent,'rgb(22, 115, 247)');assert.equal(tokens.danger,'rgb(217, 59, 70)');assert.equal(tokens.success,'rgb(22, 134, 93)');assert.equal(tokens.bg,'rgb(246, 247, 250)');
  }else assert.equal(tokens.bg,'rgb(10, 11, 14)');
  assert.equal(tokens.tap,'44px');assert.equal(tokens.push,'220ms');assert.equal(tokens.sheet,'260ms');
  assert.deepEqual(await page.locator('#tabbar .tab-label').allTextContents(),['今日','給与','支払い','資産','設定']);
}

async function findCardMonth(page){
  return page.evaluate(async()=>{
    const t=globalThis.__mm3Test,card=t.getData().cards.find(c=>c.bankId&&t.getData().banks.some(b=>b.id===c.bankId));
    await t.safeCommitAsync(()=>t.recordExpense({amount:500,date:'2026-10-07',merchant:'第11版の検証',paymentMethod:'card',paymentId:card.id,saveNow:false}));
    for(const month of ['2026-10','2026-11','2026-12','2027-01']){
      t.openCardDetail(card.id,month);const root=[...document.querySelectorAll('#pushLayer .push-view')].at(-1),value=Number(root.querySelector('.pro-finance-value').textContent.replace(/[^0-9-]/g,''));
      t.popView();if(value>=500)return{cardId:card.id,bankId:card.bankId,month};
    }
    throw new Error('no payment month shows the card expense');
  });
}

async function verifyCardFlows(page,label,root){
  const {cardId,bankId,month}=await findCardMonth(page);await page.waitForTimeout(350);
  await page.evaluate(([id,m])=>globalThis.__mm3Test.openCardDetail(id,m),[cardId,month]);
  const view=page.locator('#pushLayer .push-view').last();await view.locator('#cardPrevPay').waitFor();
  const before=await getData(page);

  // SALARYEDIT-191/192: one tap moves exactly one month and never opens the wheel.
  await assertTapTarget(view.locator('#cardPrevPay'),'cardPrevPay');await assertTapTarget(view.locator('#cardNextPay'),'cardNextPay');
  const shown=()=>view.evaluate(el=>el.dataset.cardMonth);
  await view.locator('#cardPrevPay').click();const previous=await shown();
  assert.equal(previous,await page.evaluate(m=>{const [y,mo]=m.split('-').map(Number),d=new Date(y,mo-2,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`},month));
  assert.equal(await page.locator('#sheet.show').count(),0,'arrows never open the month wheel');
  await view.locator('#cardNextPay').click();assert.equal(await shown(),month);
  assert.deepEqual(await getData(page),before,'month arrows do not write data');

  // SALARYEDIT-193/197: the wheel is a draft; only the confirmation changes the displayed month.
  await view.locator('#cardBillingMonth').click();const wheel=page.locator('#cbmWheel');await wheel.waitFor();
  await assertTapTarget(page.locator('#cbmClose'),'cbmClose');await assertSheetFits(page,`${label} billing month wheel`);
  await wheel.focus();await page.keyboard.press('ArrowUp');
  assert.ok((await page.locator('#cbmResult').innerText()).includes('現在の表示'));
  assert.equal(await page.locator('#cbmWheel [aria-selected=true]').getAttribute('data-card-billing-month'),previous);
  assert.equal(await shown(),month,'moving the wheel keeps the parent month');
  await page.locator('#cbmClose').click();await page.locator('#sheet.show').waitFor({state:'detached'}).catch(()=>{});
  await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));assert.equal(await shown(),month,'closing the wheel restores the original month');
  await view.locator('#cardBillingMonth').click();await wheel.waitFor();await wheel.focus();await page.keyboard.press('ArrowUp');await page.locator('#cbmApply').click();
  await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));assert.equal(await shown(),previous);
  await view.locator('#cardNextPay').click();assert.equal(await shown(),month);
  assert.deepEqual(await getData(page),before,'choosing a display month does not write data');

  // SALARYEDIT-198/199/200: the switch alone never posts to the bank balance.
  await view.locator('#cardPaidToggle').click();await page.locator('#cpApply').waitFor();
  await assertTapTarget(page.locator('#cpClose'),'cpClose');await assertTapTarget(page.locator('#cpApply'),'cpApply');await assertSheetFits(page,`${label} paid confirmation`);
  const amount=yenNumber(await page.locator('#sheet .hero-value').innerText()),balance=before.banks.find(b=>b.id===bankId).balance;
  assert.ok(amount>=500);assert.equal(await page.locator('#cpApply').getAttribute('aria-checked'),'false');
  if(root){await page.waitForTimeout(350);await page.screenshot({path:resolve(root,`test-results/v11-card-paid-${label}.png`)})}
  assert.equal(await page.locator('#cpAfterValue').innerText(),'変更なし');assert.ok(await page.locator('#cpReconciled').isVisible());assert.ok(await page.locator('#cpCommitApply').isHidden());
  await page.locator('#cpApply').click();
  assert.equal(await page.locator('#cpApply').getAttribute('aria-checked'),'true');assert.equal(yenNumber(await page.locator('#cpAfterValue').innerText()),balance-amount);
  assert.ok(await page.locator('#cpCommitApply').isVisible());assert.ok(await page.locator('#cpReconciled').isHidden());
  assert.deepEqual(await getData(page),before,'toggling the switch does not change any saved data');
  await page.locator('#cpApply').click();await page.locator('#cpApply').click();assert.deepEqual(await getData(page),before);
  await page.locator('#cpClose').click();await alertButton(page,'編集を続ける').click();assert.ok(await page.locator('#cpApply').isVisible(),'"keep editing" keeps the draft open');
  await page.locator('#cpClose').click();await alertButton(page,'変更を破棄').click();
  await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));assert.deepEqual(await getData(page),before,'discarding leaves balance and statement unchanged');

  // Explicit commit happens once even when the button is pressed twice.
  await view.locator('#cardPaidToggle').click();await page.locator('#cpApply').click();
  await page.locator('#cpCommitApply').evaluate(el=>{el.click();el.click()});
  await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));await page.locator('.busy-overlay.show').waitFor({state:'hidden'}).catch(()=>{});
  const after=await getData(page);assert.equal(after.banks.find(b=>b.id===bankId).balance,balance-amount,'balance is reduced exactly once');
  assert.equal(after.transactions.length,before.transactions.length,'no ledger transaction is duplicated');
  await closeEverything(page);
}

async function verifyCalculatorDraft(page){
  const date='2026-10-07',before=await getData(page);
  const enter=async value=>{await page.evaluate(v=>{for(const k of ['clear',...String(v)])globalThis.__mm3Test.calcKey(k)},value);await page.locator('#calcDone').click()};
  // CALC-117 with BANK-171
  await page.evaluate(d=>globalThis.__mm3Test.openDailyCorrectionDetail(d),date);await page.locator('#dcEdit').click();await enter(1234);
  await page.locator('#alertWrap.show').waitFor();assert.ok((await page.locator('#alertMessage').innerText()).includes('¥1,234'));
  assert.deepEqual(await getData(page),before,'"use this amount" does not save');
  await alertButton(page,'キャンセル').click();assert.deepEqual(await getData(page),before);
  await page.locator('#dcClose').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));assert.equal(await page.locator('#alertWrap.show').count(),0,'an abandoned amount leaves no dirty draft');
  await page.evaluate(d=>globalThis.__mm3Test.openDailyCorrectionDetail(d),date);await page.locator('#dcEdit').click();await enter(1234);await alertButton(page,'保存').click();
  await page.waitForFunction(d=>globalThis.__mm3Test.getData().dailyCorrections[d]===1234,date);
  const saved=await getData(page);delete saved.dailyCorrections[date];const expected=structuredClone(before);delete expected.dailyCorrections[date];assert.deepEqual(saved,expected,'only the confirmed correction changes');
  // CALC-117 with MONTH-058
  const mid=await getData(page);await closeEverything(page);
  await page.evaluate(d=>globalThis.__mm3Test.openDayPlanSheet(d),date);await page.locator('#dpChange').click();await enter(2500);
  await page.locator('#alertWrap.show').waitFor();assert.deepEqual(await getData(page),mid);await alertButton(page,'キャンセル').click();assert.deepEqual(await getData(page),mid);
  await page.locator('#dpChange').click();await enter(2500);await alertButton(page,'保存').click();
  await page.waitForFunction(d=>globalThis.__mm3Test.getData().dailyGoals[d]?.total===2500,date);
  // CALC-117 with the initial bank balance
  const third=await getData(page);await closeEverything(page);
  await page.evaluate(()=>globalThis.__mm3Test.openInitialValues());await page.locator('[data-initial-bank]').first().click();await enter(987654);
  await page.locator('#alertWrap.show').waitFor();assert.deepEqual(await getData(page),third);await alertButton(page,'キャンセル').click();assert.deepEqual(await getData(page),third,'bank balance stays until the separate save');
  // CALC-120: the helper result returns to the calculator draft only.
  await page.evaluate(()=>{const t=globalThis.__mm3Test;t.openCalculator('検証',1000,()=>{globalThis.__v11CalcUsed=true})});await page.locator('[data-calc-tool=discount]').click();await page.locator('#calcToolApply').click();
  assert.equal(await page.locator('#calcNumber').innerText(),'900');assert.equal(await page.evaluate(()=>globalThis.__v11CalcUsed),undefined);assert.deepEqual(await getData(page),third);
  await page.locator('#calcCancel').click();await closeEverything(page);
}

async function verifyApproval(page){
  await page.evaluate(()=>globalThis.__mm3Test.openDailyGoalPlanner('2026-10-08'));await page.locator('#goalStart').click();
  await page.locator('#goalNext').click();await page.locator('#goalNext').click();await page.locator('#goalApproval').waitFor();
  const before=await getData(page),track=await page.locator('#goalApproval').boundingBox(),handle=await page.locator('.approval-handle').boundingBox(),y=handle.y+handle.height/2;
  assert.ok(track.height>=56);
  if(await page.locator('#goalApprovalConfirm').isDisabled()){await closeEverything(page);return false}
  // A tap on the track and an incomplete drag never approve.
  await page.mouse.click(track.x+track.width*.7,y);
  await page.mouse.move(handle.x+handle.width/2,y);await page.mouse.down();await page.mouse.move(track.x+track.width*.55,y,{steps:8});await page.mouse.up();
  await page.waitForTimeout(260);assert.equal(await page.evaluate(()=>globalThis.__mm3Test.getGoalState().locked),false);
  assert.equal(await page.locator('.approval-handle').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41),0,'the handle returns to its start');
  assert.deepEqual(await getData(page),before,'an incomplete slide saves nothing');
  // Visible alternative: explicit final confirmation, cancel keeps the draft.
  await assertTapTarget(page.locator('#goalApprovalConfirm'),'goalApprovalConfirm');
  await page.locator('#goalApprovalConfirm').click();await alertButton(page,'戻る').click();assert.deepEqual(await getData(page),before);
  await page.locator('.approval-handle').focus();await page.keyboard.press('Enter');await alertButton(page,'戻る').click();assert.deepEqual(await getData(page),before,'keyboard path also asks before saving');
  await page.locator('#goalApprovalConfirm').click();await alertButton(page,'確定').click();await page.locator('#goalDone').waitFor();
  const after=await getData(page);assert.ok(after.dailyGoals['2026-10-08'].total>0);
  await page.locator('#goalDone').click();await closeEverything(page);return true;
}

async function verifyBackupAndDelete(page,label,root,errors){
  const before=await getData(page),errorStart=errors.length;
  await page.evaluate(()=>globalThis.__mm3Test.openDataSettings());await page.locator('#backupImport').waitFor();
  const choose=async(name,text)=>{await page.locator('#importFile').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(text)})};
  // BACKUP-208: empty, broken and newer files never touch current data.
  for(const [name,text,message] of [['empty.json','','空のファイル'],['broken.json','{"version":','読み取れない'],['future.json',JSON.stringify({...before,version:9999}),'新しいバックアップ']]){
    await choose(name,text);await page.locator('#alertWrap.show').waitFor();assert.ok((await page.locator('#alertMessage').innerText()).includes(message),`${name}: ${message}`);
    await page.locator('#alertActions button').last().click();assert.deepEqual(await getData(page),before,`${name} leaves data unchanged`);assert.equal(await page.locator('#brProceed').count(),0);
  }
  // The broken file is logged once on purpose; anything else is a real failure.
  const logged=errors.splice(errorStart);assert.equal(logged.length,1);assert.ok(logged[0].message.includes('Unexpected end of JSON input'));
  const backup=structuredClone(before);assert.ok(before.transactions.length>0);backup.transactions=[];backup.backupMeta={app:'My Money 2.0',exportedAt:'2026-10-01T03:00:00.000Z',format:'single-html-json'};
  await choose('MyMoney2-backup.json',JSON.stringify(backup));await page.locator('#brProceed').waitFor();
  assert.deepEqual(await getData(page),before,'selecting a valid file only opens the preview');
  const rows=await page.locator('#brCompare tbody tr').first().locator('td').allTextContents();assert.deepEqual(rows,[`${before.transactions.length}件`,'0件']);
  await assertSheetFits(page,`${label} restore preview`);await assertTapTarget(page.locator('#brCancel'),'brCancel');
  await page.waitForTimeout(350);await page.screenshot({path:resolve(root,`test-results/v11-restore-preview-${label}.png`)});
  await page.locator('#brCancel').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));assert.deepEqual(await getData(page),before,'cancelling the preview restores nothing');
  await choose('MyMoney2-backup.json',JSON.stringify(backup));await page.locator('#brProceed').click();await alertButton(page,'キャンセル').click();
  assert.deepEqual(await getData(page),before,'cancelling the final confirmation restores nothing');
  await page.locator('#brProceed').click();await alertButton(page,'復元').click();
  await page.waitForFunction(()=>globalThis.__mm3Test.getData().transactions.length===0&&!document.getElementById('sheet').classList.contains('show'));
  assert.equal((await getData(page)).banks.length,before.banks.length,'restored data matches the backup');

  // BACKUP-210: every cancel path keeps data; the previous "cancel = wipe everything" path is gone.
  const kept=await getData(page);
  await page.evaluate(()=>globalThis.__mm3Test.openDataSettings());await page.locator('#deleteAll').click();await page.locator('#daConfirm').waitFor();
  assert.equal(await page.locator('#daConfirm').isDisabled(),true);await assertSheetFits(page,`${label} delete confirmation`);
  await page.waitForTimeout(350);await page.screenshot({path:resolve(root,`test-results/v11-delete-all-${label}.png`)});
  await page.locator('#daCancel').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));assert.deepEqual(await getData(page),kept);
  await page.locator('#deleteAll').click();await page.locator('#daConfirmText').fill('さくじょ');assert.equal(await page.locator('#daConfirm').isDisabled(),true);
  await page.locator('#daConfirmText').fill('削除');await page.locator('[data-da-mode=empty]').click();assert.equal(await page.locator('[data-da-mode=empty]').getAttribute('aria-checked'),'true');
  await page.locator('#daConfirm').click();await alertButton(page,'キャンセル').click();assert.deepEqual(await getData(page),kept,'cancelling the final dialog deletes nothing');
  await page.locator('#daConfirm').click();await alertButton(page,'全データを削除').click();
  await page.waitForFunction(()=>globalThis.__mm3Test.getData().transactions.length===0&&globalThis.__mm3Test.getData().banks.length===0);
  await closeEverything(page);
}

async function verifyAlternatives(page){
  const before=await getData(page);
  // ASSETS-103: 長押しドラッグの代替として、上下ボタンで並べ替えられる
  await page.evaluate(()=>globalThis.__mm3Test.switchTab('assets'));await page.locator('#mm3AssetSort').click();
  await page.locator('#menuLayer .menu-item').filter({hasText:'手動'}).click();await page.locator('#mm3AssetOrderEdit').waitFor();
  const rows=()=>page.locator('#mm3AssetWatchlist .mm3-assets-watchrow').evaluateAll(list=>list.map(r=>r.dataset.bank)),original=await rows();
  assert.ok(original.length>=2);await assertTapTarget(page.locator('#mm3AssetOrderEdit'),'mm3AssetOrderEdit');
  await page.locator('#mm3AssetOrderEdit').click();await page.locator('#aoList .v11-order-btn').first().waitFor();await page.waitForTimeout(350);
  for(const button of await page.locator('#aoList .v11-order-btn').all())await assertTapTarget(button,'order button');
  assert.equal(await page.locator('#aoList .v11-order-btn').first().isDisabled(),true,'the first account cannot move up');
  assert.ok((await page.locator('#aoList .v11-order-btn').nth(1).getAttribute('aria-label')).endsWith('を下へ'));
  await page.locator('#aoList .v11-order-btn').nth(1).click();
  assert.deepEqual(await rows(),original,'moving inside the sheet is a draft');
  await page.locator('#aoCancel').click();await alertButton(page,'変更を破棄').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  assert.deepEqual(await rows(),original,'discarding keeps the saved order');
  await page.locator('#mm3AssetOrderEdit').click();await page.locator('#aoList .v11-order-btn').nth(1).click();await page.locator('#aoSave').click();
  await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  assert.deepEqual(await rows(),[original[1],original[0],...original.slice(2)],'Done saves the new order');
  assert.deepEqual(await getData(page),before,'reordering accounts never changes financial data');
  // SET-111: スライダーの代替として音量を5%ずつ変えられる
  await page.evaluate(()=>globalThis.__mm3Test.switchTab('settings'));await page.locator('#feedbackSettingsRow').click();await page.locator('#fbVolumeUp').waitFor();await page.waitForTimeout(350);
  await assertTapTarget(page.locator('#fbVolumeUp'),'fbVolumeUp');await assertTapTarget(page.locator('#fbVolumeDown'),'fbVolumeDown');
  const volume=async()=>Number((await page.locator('#fbVolumeLabel').innerText()).replace('%','')),start=await volume();
  await page.locator(start>=100?'#fbVolumeDown':'#fbVolumeUp').click();assert.equal(await volume(),start>=100?95:start+5);
  await page.locator(start>=100?'#fbVolumeUp':'#fbVolumeDown').click();assert.equal(await volume(),start);
  await closeEverything(page);
}

export async function verifyV11({createPage,passed,root,errors}){
  let approvalChecked=0;
  for(const width of [320,393])for(const appearance of ['light','dark']){
    const label=`${width}-${appearance}`,{page,context}=await createPage('app',{width,height:width===320?568:852,mobile:true,appearance});
    await verifyTokens(page,appearance);
    await verifyCardFlows(page,label,root);
    await verifyCalculatorDraft(page);
    if(await verifyApproval(page))approvalChecked++;
    await verifyAlternatives(page);
    await verifyBackupAndDelete(page,label,root,errors);
    passed(`第11版 ${width}px ${appearance}: tokens, month arrows/wheel, button alternatives for reordering and volume, balance switch, calculator drafts, approval slider alternative, restore preview and delete-all confirmation keep data intact until the explicit commit`);
    await context.close();
  }
  assert.ok(approvalChecked>0,'the approval alternative was exercised');

  // Reduce Motion: the same flows work and movement is removed.
  const reduced=await createPage('app',{width:393,height:852,mobile:true}),rp=reduced.page;await rp.emulateMedia({reducedMotion:'reduce'});
  const durations=await rp.evaluate(()=>{globalThis.__mm3Test.openInitialValues();const s=getComputedStyle(document.getElementById('sheet')),v=getComputedStyle(document.querySelector('#pushLayer .push-view'));return[s.transitionDuration,v.transitionDuration].map(x=>parseFloat(x)*(x.endsWith('ms')?1:1000))});
  assert.ok(durations.every(ms=>ms<=1),`reduced motion removes sheet/push movement (${durations})`);
  await closeEverything(rp);await verifyCardFlows(rp,'393-reduced-motion');
  passed('第11版 Reduce Motion: sheet and push transitions are instantaneous and the card payment flow still completes');
  await reduced.context.close();
}
