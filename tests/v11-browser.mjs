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
  assert.deepEqual(await page.locator('#tabbar .tab-label').allTextContents(),['ホーム','支払い','その他']);
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

  // SALARYEDIT-191/192: swiping the month heading is an auxiliary path; vertical movement and edge starts do nothing.
  const heading=await view.locator('.card-statement-nav .date-nav-label').boundingBox(),hx=heading.x+heading.width/2,hy=heading.y+heading.height/2;
  const drag=async(fromX,fromY,toX,toY)=>{await page.mouse.move(fromX,fromY);await page.mouse.down();await page.mouse.move(toX,toY,{steps:6});await page.mouse.up();await page.waitForTimeout(120)};
  await drag(hx+30,hy,hx-40,hy);assert.notEqual(await shown(),month,'swiping left shows the next month');const next=await shown();
  await drag(hx-30,hy,hx+40,hy);assert.equal(await shown(),month,'swiping right returns one month');
  await drag(hx,hy-10,hx+10,hy+60);assert.equal(await shown(),month,'a vertical drag does not change the month');
  await drag(hx-10,hy,hx+10,hy);assert.equal(await shown(),month,'a short drag does not change the month');
  assert.ok(next>month);assert.deepEqual(await getData(page),before,'swiping months does not write data');
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
  // CALC-124: holding ⌫ deletes continuously and stops on release; a tap deletes one digit.
  await page.evaluate(()=>globalThis.__mm3Test.openCalculator('検証',0,()=>{}));await page.evaluate(()=>{for(const k of ['clear',...'123456789'])globalThis.__mm3Test.calcKey(k)});
  await page.waitForTimeout(400);
  const backKey=await page.locator('#calcGrid [data-k=back]').boundingBox();await assertTapTarget(page.locator('#calcGrid [data-k=back]'),'backspace key');
  await page.mouse.click(backKey.x+backKey.width/2,backKey.y+backKey.height/2);assert.equal(await page.locator('#calcNumber').innerText(),'12,345,678');
  await page.mouse.move(backKey.x+backKey.width/2,backKey.y+backKey.height/2);await page.mouse.down();await page.waitForTimeout(820);await page.mouse.up();
  const afterHold=Number((await page.locator('#calcNumber').innerText()).replace(/,/g,''));assert.ok(afterHold<123456&&afterHold>=0,`holding deletes several digits (${afterHold})`);
  await page.waitForTimeout(300);assert.equal(Number((await page.locator('#calcNumber').innerText()).replace(/,/g,'')),afterHold,'deleting stops when the finger lifts');
  await page.locator('#calcCancel').click();assert.deepEqual(await getData(page),third);
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
  await page.locator('#menuLayer .menu-item').filter({hasText:'手動'}).click();await page.locator('#mm3AssetOrderEdit').waitFor();await page.waitForTimeout(400);
  const rows=()=>page.locator('#mm3AssetWatchlist .mm3-assets-watchrow').evaluateAll(list=>list.map(r=>r.dataset.bank)),original=await rows();
  assert.ok(original.length>=2);await assertTapTarget(page.locator('#mm3AssetOrderEdit'),'mm3AssetOrderEdit');
  /* 並べ替えは右の ≡ だけ（上下ボタンなし）。2行目の ≡ を上へ1行なぞる */
  const dragUp=async()=>{const h=page.locator('#aoList [data-reorder-key] .drag-handle').nth(1),b=await h.boundingBox(),row=await page.locator('#aoList [data-reorder-key]').nth(1).boundingBox();await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();for(let i=1;i<=6;i++)await page.mouse.move(b.x+b.width/2,b.y+b.height/2-row.height*i/6);await page.mouse.up();await page.waitForTimeout(200)};
  await page.locator('#mm3AssetOrderEdit').click();await page.locator('#aoList .drag-handle').first().waitFor();await page.waitForTimeout(350);
  assert.equal(await page.locator('#aoList .v11-order-btn').count(),0,'no up/down buttons');
  for(const handle of await page.locator('#aoList .drag-handle').all())await assertTapTarget(handle,'drag handle');
  assert.ok((await page.locator('#aoList .drag-handle').nth(1).getAttribute('aria-label')).includes('並べ替え'));
  await dragUp();
  assert.deepEqual(await rows(),original,'moving inside the sheet is a draft');
  await page.locator('#aoCancel').click();await alertButton(page,'変更を破棄').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  assert.deepEqual(await rows(),original,'discarding keeps the saved order');
  await page.locator('#mm3AssetOrderEdit').click();await page.locator('#aoList .drag-handle').first().waitFor();await page.waitForTimeout(350);await dragUp();await page.locator('#aoSave').click();
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

/* 既存のジェスチャー（第11版 C章「直接操作」）: いずれも見えるボタンの代替があり、操作だけでは保存しない */
async function verifyExistingGestures(page){
  const state=()=>page.evaluate(()=>globalThis.__mm3Test.getState()),sheetShown=()=>page.evaluate(()=>document.getElementById('sheet').classList.contains('show'));
  // 月の切替後は予測の再計算中表示（最低1.8秒）が出るので、消えるのを待ってから次の操作をする
  const drag=async(x,y,toX,toY,{hold=0,steps=8}={})=>{await page.mouse.move(x,y);await page.mouse.down();if(hold)await page.waitForTimeout(hold);await page.mouse.move(toX,toY,{steps});await page.mouse.up();await page.waitForTimeout(450);await page.waitForFunction(()=>!document.querySelector('.busy-overlay.show'),null,{timeout:8000})};
  // 操作部品の上ではない、横スワイプを始められる点を探す
  const freePoint=sel=>page.evaluate(sel=>{const root=document.querySelector(sel),r=root.getBoundingClientRect();for(let y=Math.max(r.top,0)+20;y<Math.min(r.bottom,innerHeight-120);y+=14)for(let x=r.left+130;x<r.right-130;x+=20){const el=document.elementFromPoint(x,y);if(el&&root.contains(el)&&!el.closest('button,input,select,textarea,a,[role=slider],[data-scrub],svg,.money-ticker-viewport,.mm3-atf-chart,.mm3-salary-trend'))return{x,y}}return null},sel);
  // 今日の日付の左右スワイプ（矢印ボタンの補助）
  await page.evaluate(()=>globalThis.__mm3Test.switchTab('day'));await page.waitForTimeout(200);const before=await getData(page),day=(await state()).trackingDate;
  await page.locator('#todayDateNavigator').evaluate(el=>el.scrollIntoView({block:'center'}));const nav=await page.locator('#todayDateNavigator').boundingBox(),ny=nav.y+nav.height/2;
  await drag(nav.x+nav.width/2-40,ny,nav.x+nav.width/2+60,ny);assert.ok((await state()).trackingDate<day,'swiping right shows the previous day');
  await drag(nav.x+nav.width/2+40,ny,nav.x+nav.width/2-60,ny);assert.equal((await state()).trackingDate,day,'swiping left returns');
  // 第14版: 最近の支出の再利用は＋入力ハブの「その他の入力」から（旧: 支出入力ボタンの長押し）
  await page.locator('#addHub').click();await page.locator('#entryCalc').waitFor();await page.locator('#entryRecent').click();
  await page.locator('#qrClose').waitFor();await page.locator('#qrClose').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  assert.equal(await page.locator('#qeSave').count(),0,'opening recent expenses does not also open the expense form');
  await page.evaluate(()=>globalThis.__mm3Test.popView());
  // シートのつまみ: 上へ引くと全画面、下へ引くと半分の高さへ戻る（支出の記録は＋入力ハブから）
  await page.locator('#addHub').click();await page.locator('#entryDetail').click();await page.locator('#qeSave').waitFor();await page.waitForTimeout(350);
  const mode=()=>page.locator('#sheet').evaluate(el=>el.classList.contains('full')?'full':'half');
  if(await mode()==='half'){let g=await page.locator('#sheet .grabber').boundingBox();await drag(g.x+g.width/2,g.y+g.height/2,g.x+g.width/2,g.y-90);assert.equal(await mode(),'full','pulling up expands the sheet');g=await page.locator('#sheet .grabber').boundingBox();await drag(g.x+g.width/2,g.y+g.height/2,g.x+g.width/2,g.y+90);assert.equal(await mode(),'half','pulling down returns to half height');assert.equal(await sheetShown(),true)}
  await page.locator('#qeCancel').click();if(await page.locator('#alertWrap.show').count())await alertButton(page,'変更を破棄').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  // 今月カレンダーの日付: タップは詳細、長押しは日付メニュー
  await page.evaluate(()=>globalThis.__mm3Test.switchTab('month'));await page.waitForTimeout(200);const monthBefore=await getData(page);
  const cell=page.locator('.day-cell:not(.out)').nth(3);await cell.evaluate(el=>el.scrollIntoView({block:'center'}));const cb=await cell.boundingBox();
  await page.mouse.move(cb.x+cb.width/2,cb.y+cb.height/2);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
  await page.locator('#dqmClose').waitFor();assert.equal(await page.locator('#pushLayer .push-view.show').count(),0,'a long press opens only the day menu');
  await page.locator('#dqmClose').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  await cell.click();await page.locator('#pushLayer .push-view.show').waitFor();await page.locator('#pushLayer .push-view.show .back-btn').last().click();await page.waitForFunction(()=>!document.querySelector('#pushLayer .push-view.show'));
  assert.deepEqual(await getData(page),monthBefore,'calendar gestures never write data');
  // 月ホイール: 途中で止めても中央の候補へ吸着し、確定するまで親の表示は変わらない
  await page.locator('#monthName').click();await page.locator('#monthWheel-month').waitFor();await page.waitForTimeout(300);const shownMonth=(await state()).currentMonth;
  await page.locator('#monthWheel-month').evaluate(el=>{el.scrollTop=el.scrollTop+44*2+17});await page.waitForTimeout(450);
  const top=await page.locator('#monthWheel-month').evaluate(el=>el.scrollTop);assert.equal(top%44,0,'the wheel settles on a row');
  assert.equal(await page.locator('#monthWheel-month [aria-selected=true]').count(),1);assert.equal((await state()).currentMonth,shownMonth);
  await page.locator('#mpClose').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));assert.equal((await state()).currentMonth,shownMonth);
  // 給与・支払いの月スワイプ: 横に離すと切替、縦の動きでは切り替えない
  for(const [tab,content,key] of [['pay','#payContent','payViewMonth'],['payments','#paymentsContent','assetBillingMonth']]){
    await page.evaluate(tab=>globalThis.__mm3Test.switchTab(tab),tab);await page.waitForTimeout(350);const start=(await state())[key],p=await freePoint(content);assert.ok(p,`${tab}: a free point to swipe from`);
    await drag(p.x,p.y,p.x+12,p.y+90);assert.equal((await state())[key],start,`${tab}: a vertical drag keeps the month`);
    await drag(p.x,p.y,p.x-120,p.y);await page.waitForFunction(([key,start])=>globalThis.__mm3Test.getState()[key]!==start,[key,start]);
    const next=(await state())[key];assert.ok(next>start,`${tab}: swiping left shows the next month`);
    await page.locator(content).evaluate(el=>el.closest('.scroll')?.scrollTo(0,0));await page.waitForTimeout(200);const p2=await freePoint(content)||p;await drag(p2.x,p2.y,p2.x+120,p2.y);await page.waitForFunction(([key,start])=>globalThis.__mm3Test.getState()[key]===start,[key,start]);
  }
  // 支払いのATF予測グラフ: なぞると日付と残高を表示する
  const atf=page.locator('#mm3AtfChart svg');if(await atf.count()){await atf.evaluate(el=>el.scrollIntoView({block:'center'}));const ab=await atf.boundingBox();await drag(ab.x+10,ab.y+ab.height/2,ab.x+ab.width*.6,ab.y+ab.height/2);assert.ok((await page.locator('[data-mm3-atf-tooltip]').innerText()).includes('¥'),'the forecast tooltip follows the finger')}
  assert.deepEqual(await getData(page),monthBefore,'gestures never write financial data');
  await closeEverything(page);
}

/* HOME-010・MONTH-046: 行のタップで分析画面へ移り、そこのグラフだけを指でなぞって値を確認する。なぞっても保存しない */
async function verifyChartScrub(page){
  const before=await getData(page);
  await page.evaluate(()=>globalThis.__mm3Test.switchTab('day'));await page.locator('#todayAnalysis').click();
  const view=page.locator('#pushLayer .push-view.show').last(),chart=view.locator('.bars[data-scrub]').first();await chart.waitFor();await page.waitForTimeout(300);
  await chart.evaluate(el=>el.scrollIntoView({block:'center'}));await page.waitForTimeout(150);
  const box=await chart.boundingBox(),cols=await chart.locator('[data-scrub-item]').count(),readout=chart.locator('xpath=following-sibling::output[1]');assert.ok(cols>=2);
  await page.mouse.move(box.x+6,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width-6,box.y+box.height/2,{steps:10});
  const lastLabel=await chart.locator('[data-scrub-item]').last().getAttribute('data-label');assert.ok((await readout.innerText()).includes(lastLabel),'the readout follows the finger to the last bar');
  await page.mouse.move(box.x+6,box.y+box.height/2,{steps:10});await page.mouse.up();
  const firstLabel=await chart.locator('[data-scrub-item]').first().getAttribute('data-label');assert.ok((await readout.innerText()).includes(firstLabel),'the readout follows back to the first bar');
  assert.equal(await chart.locator('.scrub-on').count(),1);
  await chart.focus();await page.keyboard.press('ArrowRight');assert.equal(await chart.locator('[data-scrub-item]').nth(1).evaluate(el=>el.classList.contains('scrub-on')),true,'arrow keys move the selection');
  assert.equal(await chart.locator('xpath=following-sibling::table[1]').locator('tr').count(),cols,'a table carries the same values for screen readers');
  assert.equal(await page.locator('#pushLayer .push-view.show').count(),1,'scrubbing never navigates');
  await view.locator('.back-btn').click();await page.waitForFunction(()=>!document.querySelector('#pushLayer .push-view.show'));
  // 月間詳細分析の折れ線グラフ
  await page.evaluate(()=>globalThis.__mm3Test.switchTab('month'));await page.waitForTimeout(150);const monthBefore=await getData(page);
  await page.locator('#monthAnalysis').click();const line=page.locator('#pushLayer .push-view.show svg.svg-chart[data-scrub]').first();await line.waitFor();await page.waitForTimeout(300);
  await line.evaluate(el=>el.scrollIntoView({block:'center'}));await page.waitForTimeout(150);const lb=await line.boundingBox();
  await page.mouse.move(lb.x+4,lb.y+lb.height/2);await page.mouse.down();await page.mouse.move(lb.x+lb.width/2,lb.y+lb.height/2,{steps:6});await page.mouse.up();
  assert.equal(await line.locator('.scrub-on').count(),1,'the line chart highlights the nearest point');
  assert.deepEqual(await getData(page),monthBefore,'scrubbing never writes data');
  await closeEverything(page);
}

/* MONTH-041/065: 今月画面の表示月は下書きのホイールで選び、確定した時だけ切り替わる */
async function verifyMonthWheel(page){
  // 「今月」へ切り替えると表示モードの設定が保存される（既存の仕様）ので、比較は切り替えた後から
  await page.evaluate(()=>globalThis.__mm3Test.switchTab('month'));await page.waitForTimeout(150);
  const before=await getData(page),state=()=>page.evaluate(()=>globalThis.__mm3Test.getState().currentMonth);
  await page.locator('#monthName').click();await page.locator('#monthWheel-month').waitFor();await page.waitForTimeout(300);
  await assertTapTarget(page.locator('#mpClose'),'mpClose');await assertTapTarget(page.locator('#monthPickerApply'),'monthPickerApply');await assertSheetFits(page,'month wheel');
  const start=await state();await page.locator('#monthWheel-month').focus();await page.keyboard.press('ArrowUp');
  assert.equal(await state(),start,'moving the wheel keeps the displayed month');
  await page.locator('#mpClose').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));assert.equal(await state(),start,'closing restores the month');
  await page.locator('#monthName').click();await page.locator('#monthWheel-month').waitFor();await page.waitForTimeout(250);await page.locator('#monthWheel-month').focus();await page.keyboard.press('ArrowUp');await page.locator('#monthPickerApply').click();
  await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  const [y,m]=start.split('-').map(Number),prev=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`;assert.equal(await state(),prev,'applying shows the chosen month');
  assert.ok((await page.locator('#monthName').innerText()).includes(`${Number(prev.slice(5))}月`));
  assert.deepEqual(await getData(page),before,'choosing a month never writes data');
  await closeEverything(page);
}

/* 既存のジェスチャーの確認: シートの下スワイプ、口座の長押しドラッグ、資産グラフのなぞり */
async function verifyGestures(page){
  const before=await getData(page);
  const drag=async(x,y,toX,toY,hold=0)=>{await page.mouse.move(x,y);await page.mouse.down();if(hold)await page.waitForTimeout(hold);await page.mouse.move(toX,toY,{steps:8});await page.mouse.up();await page.waitForTimeout(200)};
  const sheetShown=()=>page.evaluate(()=>document.getElementById('sheet').classList.contains('show'));
  // 閲覧だけのシートはつまみを下へ引くと閉じる。短い移動では閉じない
  await page.evaluate(()=>globalThis.__mm3Test.openDailyCorrectionDetail('2026-10-07'));await page.waitForTimeout(350);
  let grab=await page.locator('#sheet .grabber').boundingBox();
  await drag(grab.x+grab.width/2,grab.y+grab.height/2,grab.x+grab.width/2,grab.y+40);assert.equal(await sheetShown(),true,'a short pull keeps the sheet open');
  grab=await page.locator('#sheet .grabber').boundingBox();
  await drag(grab.x+grab.width/2,grab.y+grab.height/2,grab.x+grab.width/2,grab.y+160);await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  // 編集中のシートは、下へ引いても無断で破棄しない
  await page.evaluate(()=>globalThis.__mm3Test.openQuickExpense());await page.locator('#qeMerchant').fill('下スワイプの検証');await page.waitForTimeout(350);
  grab=await page.locator('#sheet .grabber').boundingBox();const mode=await page.locator('#sheet').evaluate(el=>el.classList.contains('full')?'full':'half');
  await drag(grab.x+grab.width/2,grab.y+grab.height/2,grab.x+grab.width/2,grab.y+170);
  if(mode==='full'){grab=await page.locator('#sheet .grabber').boundingBox();await drag(grab.x+grab.width/2,grab.y+grab.height/2,grab.x+grab.width/2,grab.y+170)}
  await page.locator('#alertWrap.show').waitFor();await alertButton(page,'編集を続ける').click();
  assert.equal(await page.locator('#qeMerchant').inputValue(),'下スワイプの検証','the draft survives the swipe');
  await page.locator('#qeCancel').click();await alertButton(page,'変更を破棄').click();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
  assert.deepEqual(await getData(page),before,'sheet gestures never write data');
  // ASSETS-103: 手動の並び順で、口座を長押ししてから上下に動かす
  await page.evaluate(()=>globalThis.__mm3Test.switchTab('assets'));await page.locator('#mm3AssetSort').click();await page.locator('#menuLayer .menu-item').filter({hasText:'手動'}).click();await page.locator('#mm3AssetOrderEdit').waitFor();await page.waitForTimeout(400);
  const order=()=>page.locator('#mm3AssetWatchlist .mm3-assets-watchrow').evaluateAll(list=>list.map(r=>r.dataset.bank)),start=await order();
  await page.locator('#mm3AssetWatchlist').evaluate(el=>el.scrollIntoView({block:'center'}));await page.waitForTimeout(250);
  const first=await page.locator('#mm3AssetWatchlist .mm3-assets-watchrow').nth(0).boundingBox(),second=await page.locator('#mm3AssetWatchlist .mm3-assets-watchrow').nth(1).boundingBox();
  await drag(first.x+first.width/2,first.y+first.height/2,first.x+first.width/2,first.y+12);assert.deepEqual(await order(),start,'moving without a long press does not reorder');
  await drag(first.x+first.width/2,first.y+first.height/2,second.x+second.width/2,second.y+second.height*.9,360);await page.waitForTimeout(400);
  assert.deepEqual(await order(),[start[1],start[0],...start.slice(2)],'long press and drag moves the account down one place');
  assert.deepEqual(await getData(page),before,'reordering by drag never changes financial data');
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
    await verifyExistingGestures(page);
    await verifyChartScrub(page);
    await verifyMonthWheel(page);
    await verifyGestures(page);
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
