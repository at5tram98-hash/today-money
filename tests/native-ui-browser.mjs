import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
export async function verifyNativeUi({createPage,passed}){
  const {page,context}=await createPage('app',{width:393,height:852,mobile:true});
  const original=await page.evaluate(()=>globalThis.__mm3Test.getData());
  assert.deepEqual(await page.locator('#tabbar .tab-label').allTextContents(),['今日','給与','支払い','資産','設定']);
  const primary=await page.locator('#quickExpense').boundingBox();assert.ok(primary.y+primary.height<650);
  for(const button of await page.locator('#todayTop button').all()){
    const rect=await button.boundingBox();assert.ok(rect.width>=44&&rect.height>=44);
  }
  await page.locator('#quickExpense').click();await page.locator('#qeMerchant').waitFor();
  await page.locator('#qeMerchant').fill('長い店名でも入力と保存が使えるかを確認');
  const merchant=page.locator('#qeMerchant');assert.equal(await merchant.getAttribute('enterkeyhint'),'done');
  await merchant.focus();
  await page.evaluate(()=>{
    const viewport=window.visualViewport;
    Object.defineProperty(viewport,'height',{configurable:true,get:()=>532});viewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(()=>document.documentElement.classList.contains('native-keyboard'));
  assert.equal(await page.locator('#tabbar').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  const save=await page.locator('#qeSave').boundingBox();assert.ok(save.y>=0&&save.y+save.height<=532,'save remains above the keyboard');
  const dimensions=await page.locator('#sheet').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.width+1);
  await page.evaluate(()=>{document.activeElement.blur();delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'))});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('native-keyboard'));
  await page.locator('#qeMerchant').fill('');await page.locator('#qeCancel').click();
  if(await page.locator('#alertWrap.show').count())await page.locator('#alertActions button').last().click();
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),original);
  passed('393×852 native form keeps 44px toolbar targets and Save above simulated keyboard, restores tabs and cancels without data writes');
  await context.close();

  mkdirSync('test-results/phase8-screenshots',{recursive:true});
  // Phase 8: exercise every rendered button on all five top-level screens,
  // in two viewport/appearance combinations without writing financial data.
  for(const settings of [
    {width:320,height:568,mobile:true,appearance:'light'},
    {width:393,height:852,mobile:true,appearance:'dark'}
  ]) {
    const audit=await createPage('app',settings);
    const initial=await audit.page.evaluate(()=>globalThis.__mm3Test.getData());
    let checked=0;
    for(const tab of ['home','pay','payments','assets','settings','home']) {
      await audit.page.locator(`#tabbar [data-tab="${tab}"]`).click();
      const results=await audit.page.evaluate(()=>{
        const screen=document.querySelector('.screen.active');
        return [...screen.querySelectorAll('button')].map(el=>{
          const r=el.getBoundingClientRect(),style=getComputedStyle(el);
          return {name:el.id||el.getAttribute('aria-label')||el.textContent.trim().slice(0,32),
            visible:r.width>0&&r.height>0&&style.visibility!=='hidden'&&style.display!=='none',
            width:r.width,height:r.height};
        }).filter(item=>item.visible);
      });
      for(const item of results) {
        assert.ok(item.width>=43.5,`${settings.width}px ${tab}: button width <44px: ${item.name} (${item.width})`);
        assert.ok(item.height>=43.5,`${settings.width}px ${tab}: button height <44px: ${item.name} (${item.height})`);
      }
      checked+=results.length;
      assert.equal(await audit.page.locator('.screen.active').count(),1);
      await audit.page.screenshot({path:`test-results/phase8-screenshots/${settings.width}-${settings.appearance}-${tab}.png`,animations:'disabled'});
    }
    assert.ok(checked>=75,`expected most top-level button renders to be inspected; got ${checked}`);
    assert.deepEqual(await audit.page.evaluate(()=>globalThis.__mm3Test.getData()),initial);
    const tokens=await audit.page.evaluate(()=>({
      soft:getComputedStyle(document.documentElement).getPropertyValue('--action-soft').trim(),
      focus:getComputedStyle(document.documentElement).getPropertyValue('--action-focus').trim()
    }));
    assert.ok(tokens.soft&&tokens.focus,'semantic control tokens must resolve for both appearances');
    await audit.context.close();
    passed(`${settings.width}px ${settings.appearance} top-level buttons retain 44px targets, five-tab navigation and unmodified financial data`);
  }

  // P0 / C01: zero daily and monthly goals may not block expense entry.
  const noGoal=await createPage('app',{width:393,height:852,mobile:true});
  await noGoal.page.evaluate(async()=>{
    const state=globalThis.__mm3Test.getData();
    state.dailyGoals={};state.monthlyGoals={};
    await globalThis.__mm3Test.replaceData(state);
  });
  const emptyBudget=await noGoal.page.evaluate(()=>globalThis.__mm3Test.getData());
  await noGoal.page.locator('#quickExpense').click();
  await noGoal.page.locator('#qeMerchant').waitFor();
  assert.equal(await noGoal.page.locator('#qeSave').count(),1);
  await noGoal.page.locator('#qeCancel').click();
  await noGoal.page.locator('#qeMerchant').waitFor({state:'detached'});
  assert.deepEqual(await noGoal.page.evaluate(()=>globalThis.__mm3Test.getData()),emptyBudget);
  passed('P0 quick expense opens and cancels without a daily/monthly goal or financial writes');
  await noGoal.context.close();

  // P0 / C02: a travel goal's child item editor must preserve the live
  // unsaved parent form on cancel, save and return (including calculator use).
  const travel=await createPage('app',{width:393,height:852,mobile:true});
  await travel.page.evaluate(()=>globalThis.__mm3Test.switchTab('month'));
  // Opening the month screen legitimately updates homeViewMode; keep that
  // navigation preference out of the draft-cancellation comparison.
  const beforeTravel=await travel.page.evaluate(()=>globalThis.__mm3Test.getData());
  await travel.page.locator('#monthEventGoals').click();
  await travel.page.locator('#eventGoalAdd').click();
  await travel.page.locator('#eventGoalName').fill('未保存の旅行計画');
  const deadline=await travel.page.locator('#eventGoalDeadline').inputValue();
  const parentNode=await travel.page.locator('#eventGoalName').evaluate(el=>{el.dataset.parentMarker='preserved';return el.dataset.parentMarker});
  assert.equal(parentNode,'preserved');

  await travel.page.locator('#eventGoalAddItem').click();
  assert.equal(await travel.page.evaluate(()=>document.activeElement?.id),'goalItemCancel','child sheet must receive initial focus');
  await travel.page.locator('#goalItemName').fill('キャンセルする費目');
  assert.equal(await travel.page.locator('#sheet #eventGoalName').inputValue(),'未保存の旅行計画');
  await travel.page.locator('#goalItemCancel').click();
  await travel.page.locator('#alertWrap.show').waitFor();
  await travel.page.locator('#alertActions button').filter({hasText:'費目の変更を破棄'}).click();
  await travel.page.locator('#goalItemName').waitFor({state:'detached'});
  // Focus restoration follows the alert's next paint; wait for the actual
  // accessible focus target instead of racing its animation frame.
  await travel.page.waitForFunction(()=>document.activeElement?.id==='eventGoalAddItem',null,{timeout:2200});
  assert.equal(await travel.page.evaluate(()=>document.activeElement?.id),'eventGoalAddItem','parent focus must be restored on child cancel');
  assert.equal(await travel.page.locator('#eventGoalName').inputValue(),'未保存の旅行計画');
  assert.equal(await travel.page.locator('#eventGoalName').getAttribute('data-parent-marker'),'preserved');
  assert.equal(await travel.page.locator('#eventGoalDeadline').inputValue(),deadline);

  await travel.page.locator('#eventGoalAddItem').click();
  await travel.page.locator('#goalItemName').fill('宿泊費');
  await travel.page.locator('#goalItemAmount').click();
  await travel.page.locator('#calcGrid [data-k="1"]').click();
  await travel.page.locator('#calcGrid [data-k="00"]').click();
  await travel.page.locator('#calcDone').click();
  await travel.page.locator('#goalItemSave').click();
  await travel.page.locator('#goalItemName').waitFor({state:'detached'});
  assert.equal(await travel.page.locator('#eventGoalName').inputValue(),'未保存の旅行計画');
  assert.match(await travel.page.locator('#eventGoalItems').innerText(),/宿泊費/);
  assert.match(await travel.page.locator('#eventGoalItems').innerText(),/100/);
  await travel.page.locator('#eventGoalCancel').click();
  await travel.page.locator('#alertWrap.show').waitFor();
  await travel.page.locator('#alertActions button').filter({hasText:'破棄'}).last().click();
  await travel.page.locator('#eventGoalName').waitFor({state:'detached'});
  assert.deepEqual(await travel.page.evaluate(()=>globalThis.__mm3Test.getData()),beforeTravel);
  passed('P0 child expense editor returns to live parent draft on cancel/save, and discarding parent never writes financial records');
  await travel.context.close();

  // P0 / C03: a previously registered required plan must never be re-added
  // as a second scenario when its detail shows the ACF forecast.
  const acfDetail=await createPage('app',{width:393,height:852,mobile:true});
  const financialBefore=await acfDetail.page.evaluate(()=>globalThis.__mm3Test.getData());
  const plannedRequired=financialBefore.largeExpensePlans.find(p=>p.status==='planned'&&p.priority==='required');
  assert.ok(plannedRequired,'seed must contain a planned required large expense');
  const expectedForecast=await acfDetail.page.evaluate(()=>globalThis.__mm3Test.buildCashFlowForecast());
  await acfDetail.page.evaluate(id=>globalThis.__mm3Test.openLargeExpenseDetail(id),plannedRequired.id);
  await acfDetail.page.locator('#leEditDetail').waitFor();
  const detailText=await acfDetail.page.locator('#pushLayer .push-view:last-child').innerText();
  assert.match(detailText,/現在のACF予測/);
  const shownMin=await acfDetail.page.locator('#pushLayer .push-view:last-child .acf-plan-compare').nth(1).locator('strong').innerText();
  assert.equal(Number(shownMin.replace(/[^0-9-]/g,'')),Math.round(expectedForecast.minMandatoryBalance),
    'detail must agree with canonical ACF, not charge a required plan a second time');
  assert.deepEqual(await acfDetail.page.evaluate(()=>globalThis.__mm3Test.getData()),financialBefore);
  passed('P0 registered required large expense uses the exact canonical ACF forecast without double-counting');
  await acfDetail.context.close();

  // P1 / C08: the ATF calendar must not expire on 2026-11-30.
  // Shift only the isolated test clock; no real balances or stored records change.
  const atfRolling=await createPage('app',{width:393,height:852,mobile:true});
  const atfBefore=await atfRolling.page.evaluate(()=>globalThis.__mm3Test.getData());
  const atfWindow=await atfRolling.page.evaluate(()=>{
    globalThis.__mm3TestClock.now=new Date('2026-12-05T12:00:00+09:00').getTime();
    const api=globalThis.__mm3Test;
    return {
      end:api.mm3AtfHorizonEnd(),
      december:api.mm3AtfForMonth('2026-12'),
      january:api.mm3AtfForMonth('2027-01'),
      february:api.mm3AtfForMonth('2027-02'),
      march:api.mm3AtfForMonth('2027-03')
    };
  });
  assert.equal(atfWindow.end,'2027-02-28');
  for(const [month,result] of [['2026-12',atfWindow.december],['2027-01',atfWindow.january],['2027-02',atfWindow.february]]){
    assert.equal(result.available,true,`ATF must include ${month} after the original deadline`);
    assert.ok(result.rows.length>0,`ATF should produce dated rows for ${month}`);
  }
  assert.equal(atfWindow.march.available,false,'ATF ends after the rolling three-month window');
  assert.deepEqual(await atfRolling.page.evaluate(()=>globalThis.__mm3Test.getData()),atfBefore);
  passed('P1 ATF rolling forecast remains usable after 2026-11-30, rolls into 2027 and preserves financial records');
  await atfRolling.context.close();

  // P0 / C04: dangerous financial reset requires mode, exact phrase and
  // a separate destructive confirmation; every cancellation preserves data.
  const deleteReview=await createPage('app',{width:393,height:852,mobile:true});
  const snapshotBefore=await deleteReview.page.evaluate(()=>globalThis.__mm3Test.getData());
  await deleteReview.page.evaluate(()=>globalThis.__mm3Test.openDataSettings());
  await deleteReview.page.locator('#deleteAll').click();
  assert.equal(await deleteReview.page.locator('#deleteConfirmProceed').isDisabled(),true);
  assert.equal(await deleteReview.page.locator('#deleteModeKeep').getAttribute('aria-pressed'),'true');
  await deleteReview.page.locator('#deleteModeEmpty').click();
  assert.equal(await deleteReview.page.locator('#deleteModeEmpty').getAttribute('aria-pressed'),'true');
  await deleteReview.page.locator('#deleteConfirmPhrase').fill('消去');
  assert.equal(await deleteReview.page.locator('#deleteConfirmProceed').isDisabled(),true);
  await deleteReview.page.locator('#deleteConfirmPhrase').fill('削除');
  assert.equal(await deleteReview.page.locator('#deleteConfirmProceed').isEnabled(),true);
  const destructiveBounds=await deleteReview.page.locator('#deleteConfirmProceed').boundingBox();
  assert.ok(destructiveBounds.width>=44&&destructiveBounds.height>=44);
  await deleteReview.page.locator('#deleteConfirmProceed').click();
  await deleteReview.page.locator('#alertWrap.show').waitFor();
  assert.match(await deleteReview.page.locator('#alertMessage').innerText(),/取引.*Gmail認証.*復旧コピー/);
  await deleteReview.page.locator('#alertActions button').filter({hasText:'戻る'}).click();
  assert.deepEqual(await deleteReview.page.evaluate(()=>globalThis.__mm3Test.getData()),snapshotBefore);
  await deleteReview.page.locator('#deleteAllCancel').click();
  await deleteReview.page.locator('#alertWrap.show').waitFor();
  await deleteReview.page.locator('#alertActions button').filter({hasText:'破棄'}).click();
  await deleteReview.page.locator('#deleteConfirmPhrase').waitFor({state:'detached'});
  assert.deepEqual(await deleteReview.page.evaluate(()=>globalThis.__mm3Test.getData()),snapshotBefore);
  passed('P0 delete-all requires mode and exact phrase; final cancel and sheet cancel preserve all stored financial records');
  await deleteReview.context.close();

  // The actual destructive path is permitted only within this throwaway
  // isolated Playwright profile, never against the published application.
  const deleteFixture=await createPage('app',{width:393,height:852,mobile:true});
  const seeded=await deleteFixture.page.evaluate(()=>globalThis.__mm3Test.getData());
  assert.ok(seeded.banks.length>0,'fixture must start with sample bank records');
  await deleteFixture.page.evaluate(()=>globalThis.__mm3Test.openDataSettings());
  await deleteFixture.page.locator('#deleteAll').click();
  await deleteFixture.page.locator('#deleteModeEmpty').click();
  await deleteFixture.page.locator('#deleteConfirmPhrase').fill('削除');
  await deleteFixture.page.locator('#deleteConfirmProceed').click();
  await deleteFixture.page.locator('#alertWrap.show').waitFor();
  await deleteFixture.page.locator('#alertActions button').filter({hasText:'全データを削除'}).click();
  await deleteFixture.page.locator('#sheet.show').waitFor({state:'hidden'});
  const erased=await deleteFixture.page.evaluate(()=>globalThis.__mm3Test.getData());
  for(const key of ['transactions','incomes','banks','cards','debitCards','salaryRecords','fixedPayments','largeExpensePlans']){
    assert.equal(erased[key].length,0,`complete reset should clear ${key}`);
  }
  passed('P0 complete reset erases financial fixture data only after exact phrase and destructive approval');
  await deleteFixture.context.close();
}
