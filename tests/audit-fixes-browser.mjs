import assert from 'node:assert/strict';

export async function verifyAuditFixes({createPage,passed}){
  const narrow=await createPage('app',{width:320,height:568,mobile:true});
  try{
    await narrow.page.evaluate(()=>globalThis.__mm3Test.switchTab('month'));
    const title=await narrow.page.locator('#monthName').evaluate(el=>({
      width:el.clientWidth,content:el.scrollWidth,height:el.getBoundingClientRect().height,
      right:el.getBoundingClientRect().right,text:el.textContent.trim()
    }));
    const action=await narrow.page.locator('#monthGoal').boundingBox();
    assert.match(title.text,/2026年10月/);
    assert.ok(title.content<=title.width+1,JSON.stringify(title));
    assert.ok(title.height>=44&&action&&title.right+6<=action.x);
    passed('AUD8-001: 320px full month title fits beside 44px toolbar controls');
  }finally{await narrow.context.close()}

  for(const width of [320,393]){
    const review=await createPage('app',{width,height:852,mobile:true});
    try{
      await review.page.evaluate(()=>globalThis.__mm3Test.openDataSettings());
      await review.page.locator('#deleteAll').click();
      const warning=await review.page.locator('#sheet .form-section').first().evaluate(el=>{
        const heading=el.querySelector('strong').getBoundingClientRect();
        const description=el.querySelector('.form-helper').getBoundingClientRect();
        return {headingBottom:heading.bottom,descriptionTop:description.top};
      });
      assert.ok(warning.descriptionTop>=warning.headingBottom+4,JSON.stringify(warning));
      assert.equal(await review.page.locator('#deleteConfirmProceed').isDisabled(),true);
      passed(`AUD8-002: ${width}px destructive warning and explanation do not overlap`);
    }finally{await review.context.close()}
  }

  const budget=await createPage('app',{width:393,height:852,mobile:true});
  const page=budget.page;
  try{
    await page.evaluate(async()=>{
      const api=globalThis.__mm3Test,state=api.getData();
      state.transactions=[{id:'audit-budget-spend',date:'2026-10-07',amount:1234,
        category:'食費',merchant:'予算回帰テスト',paymentMethod:'other',paymentId:'',memo:''}];
      state.monthlyGoals['2026-10']={total:30000,categories:{'食費':20000,'その他':10000}};
      state.dailyGoals['2026-10-07']={total:1000,categories:{'食費':1000}};
      await api.replaceData(state);api.openMonthlyGoalPlanner('2026-10');
    });
    const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
    await page.locator('#goalStart').click();
    for(let step=1;step<5;step++)await page.locator('#goalNext').click();
    await page.locator('[data-goal-day="2026-10-07"]').click();
    const amount=async()=>Number((await page.locator('#gdpValue').innerText()).replace(/\D/g,''));
    assert.equal(await amount(),2334);
    await page.locator('#gdpPlus').click();assert.equal(await amount(),2434);
    await page.locator('#gdpMinus').click();assert.equal(await amount(),2334);
    await page.locator('#gdpCalc').click();
    await page.locator('#calcGrid [data-k="2"]').click();
    await page.locator('#calcGrid [data-k="3"]').click();
    await page.locator('#calcGrid [data-k="3"]').click();
    await page.locator('#calcGrid [data-k="4"]').click();
    await page.locator('#calcDone').click();assert.equal(await amount(),2334);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
    passed('AUD8-003: daily budget preserves exact yen in calculator and reversible +/-100 steps without saving');
  }finally{await budget.context.close()}

  const filters=await createPage('app',{width:393,height:852,mobile:true});
  try{
    await filters.page.locator('#todayTransactions').click();
    const category=filters.page.getByRole('combobox',{name:'カテゴリで絞り込み',exact:true});
    assert.equal(await category.count(),1);
    await category.selectOption('食費');
    assert.equal(await category.inputValue(),'食費');
    passed('AUD8-004: transaction category filter exposes its purpose to assistive technology');
  }finally{await filters.context.close()}

  const preferred=await createPage('app',{width:393,height:852,mobile:true});
  try{
    await preferred.page.evaluate(()=>globalThis.__mm3Test.openAcfSettings());
    await preferred.page.locator('#acfDetailsToggle').click();
    const card=preferred.page.getByRole('combobox',{name:'優先して使うカード',exact:true});
    assert.equal(await card.count(),1);
    assert.equal(await card.isVisible(),true);
    passed('AUD8-005: ACF preferred-card selector has a meaningful accessible name');
  }finally{await preferred.context.close()}


  const icons=await createPage('app',{width:393,height:852,mobile:true});
  try{
    await icons.page.evaluate(()=>globalThis.__mm3Test.switchTab('settings'));
    await icons.page.locator('#categorySettings').click();
    await icons.page.locator('#catAdd').click();
    const choices=icons.page.locator('.icon-picker button');
    assert.equal(await choices.count(),18);
    const iconData=await icons.page.evaluate(()=>globalThis.__mm3Test.getData());
    for(const button of await choices.all()){
      assert.ok(await button.getAttribute('aria-label'));
      await button.click();
      assert.equal(await button.getAttribute('aria-pressed'),'true');
      assert.equal(await icons.page.locator('.icon-picker [aria-pressed="true"]').count(),1);
    }
    assert.deepEqual(await icons.page.evaluate(()=>globalThis.__mm3Test.getData()),iconData);
    const coffee=icons.page.getByRole('button',{name:'コーヒー',exact:true});
    await coffee.click();
    assert.equal(await coffee.getAttribute('aria-pressed'),'true');
    assert.equal(await icons.page.getByRole('button',{name:'食事',exact:true}).getAttribute('aria-pressed'),'false');
    passed('AUD8-006: all category icons have meaningful names and expose their selection state');
  }finally{await icons.context.close()}

  const timeline=await createPage('app',{width:393,height:852,mobile:true});
  try{
    await timeline.page.evaluate(()=>globalThis.__mm3Test.openMoneyTimeline());
    const scope=timeline.page.getByRole('combobox',{name:'表示する口座',exact:true});
    assert.equal(await scope.count(),1);
    assert.equal(await scope.isVisible(),true);
    passed('AUD8-007: money timeline account filter exposes its purpose to assistive technology');
  }finally{await timeline.context.close()}


  const ratio=await createPage('app',{width:393,height:852,mobile:true});
  try{
    await ratio.page.evaluate(()=>globalThis.__mm3Test.openAcfSetup());
    const slider=ratio.page.getByRole('slider',{name:'カードで支払う割合',exact:true});
    assert.equal(await slider.count(),1);
    await ratio.page.locator('#acfSetupUseCard').click();
    assert.equal(await slider.count(),1);
    assert.equal(await slider.isDisabled(),true);
    passed('AUD8-008: setup card-ratio slider retains its accessible name while disabled');
  }finally{await ratio.context.close()}


  const lockedPlan=await createPage('app',{width:393,height:852,mobile:true});
  try{
    const page=lockedPlan.page;
    await page.evaluate(async()=>{
      const api=globalThis.__mm3Test,d=api.getData();
      d.monthlyGoals['2026-10']={total:30000,categories:{'食費':30000}};
      d.dailyGoals={};
      for(let day=7;day<=31;day++)d.dailyGoals[`2026-10-${String(day).padStart(2,'0')}`]={total:1000,categories:{},origin:'daily'};
      await api.replaceData(d);api.openMonthlyGoalPlanner('2026-10');
    });
    const saved=await page.evaluate(()=>globalThis.__mm3Test.getData());
    await page.locator('#goalStart').click();
    for(let step=1;step<5;step++)await page.locator('#goalNext').click();
    const draft=await page.evaluate(()=>globalThis.__mm3Test.getGoalState().draft);
    await page.locator('#goalAutoBalance').click();
    await page.locator('#alertWrap.show').waitFor();
    assert.equal(await page.locator('#alertTitle').innerText(),'自動調整できません');
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getGoalState().draft),draft);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),saved);
    await page.locator('#alertActions button').last().click();
    await page.locator('[data-goal-day="2026-10-08"]').click({delay:700});
    await page.locator('#menuLayer button').filter({hasText:'固定を解除'}).click();
    await page.locator('#goalAutoBalance').click();
    const adjusted=await page.evaluate(()=>globalThis.__mm3Test.getGoalState().draft);
    assert.equal(Object.values(adjusted.dailyPlan).reduce((a,b)=>a+Number(b||0),0),30000);
    assert.equal(adjusted.dailyPlan[8],6000);
    assert.equal(Object.keys(adjusted.dailyLocks).length,24);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),saved);
    passed('AUD8-009: impossible redistribution explains locked days without changing drafts; unlocking one day balances every yen');
  }finally{await lockedPlan.context.close()}


  const keyboard=await createPage('app',{width:393,height:852,mobile:true});
  try{
    const page=keyboard.page;
    await page.evaluate(()=>globalThis.__mm3Test.openDailyGoalPlanner('2026-10-07'));
    const saved=await page.evaluate(()=>globalThis.__mm3Test.getData());
    await page.locator('#goalStart').click();await page.locator('#goalNext').click();await page.locator('#goalNext').click();
    const handle=page.locator('#goalApproval .approval-handle');
    await handle.scrollIntoViewIfNeeded();
    const b=await handle.boundingBox(),rail=await page.locator('#goalApproval').boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();
    await page.mouse.move(rail.x+rail.width-8,b.y+b.height/2,{steps:12});
    await handle.dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse'});await page.mouse.up();
    await page.waitForTimeout(350);
    assert.equal(await page.locator('#goalDone').count(),0);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),saved);
    await handle.focus();await page.keyboard.press('Enter');
    await page.locator('#alertWrap.show').waitFor();
    assert.equal(await page.locator('#alertTitle').innerText(),'この目標を承認しますか？');
    await page.locator('#alertActions button').first().click();
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),saved);
    await handle.focus();await page.keyboard.press('Space');
    await page.locator('#alertWrap.show').waitFor();
    await page.locator('#alertActions button').last().click();
    await page.locator('#goalDone').waitFor({timeout:15000});
    const after=await page.evaluate(()=>globalThis.__mm3Test.getData());
    assert.ok(after.dailyGoals['2026-10-07'].total>0);
    assert.deepEqual(after.banks,saved.banks);
    passed('AUD8-010: pointer cancellation saves nothing; keyboard approval supports cancel and explicit confirmation');
  }finally{await keyboard.context.close()}

  const disabledApproval=await createPage('app',{width:393,height:852,mobile:true});
  try{
    const page=disabledApproval.page;
    await page.evaluate(()=>globalThis.__mm3Test.openDailyGoalPlanner('2026-10-07'));
    const saved=await page.evaluate(()=>globalThis.__mm3Test.getData());
    await page.locator('#goalStart').click();
    await page.locator('#goalAmountEdit').click();await page.locator('#calcGrid [data-k="clear"]').click();await page.locator('#calcDone').click();
    await page.locator('#goalNext').click();await page.locator('#goalNext').click();
    assert.equal(await page.locator('#goalApproval').getAttribute('aria-disabled'),'true');
    assert.equal(await page.locator('#goalApproval .approval-handle').isDisabled(),true);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),saved);
    passed('AUD8-011: invalid budgets disable the actual approval button for keyboard and assistive technology');
  }finally{await disabledApproval.context.close()}

  const backup=await createPage('app',{width:393,height:852,mobile:true,localOnly:true});
  try{
    const page=backup.page;await page.evaluate(()=>globalThis.__mm3Test.openDataSettings());
    await page.locator('#backupImport').waitFor();
    const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
    const choose=async payload=>{
      const chooser=page.waitForEvent('filechooser');await page.locator('#backupImport').click();
      await(await chooser).setFiles({name:'audit-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(payload))});
      await page.locator('#alertWrap.show').waitFor();
    };
    await choose({version:before.version});
    assert.equal(await page.locator('#alertTitle').innerText(),'復元できませんでした');
    assert.match(await page.locator('#alertMessage').innerText(),/バックアップデータがありません/);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
    await page.keyboard.press('Escape');
    const payload=structuredClone(before);payload.profile.name='Backup regression fixture';
    await choose(payload);assert.equal(await page.locator('#alertTitle').innerText(),'バックアップを復元しますか？');
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
    await choose(payload);await page.locator('#alertActions').getByRole('button',{name:'復元',exact:true}).click();
    await page.waitForFunction(()=>globalThis.__mm3Test.getData().profile.name==='Backup regression fixture');
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().banks),before.banks);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().transactions),before.transactions);
    const recovery=await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('myMoney2_recovery_v1_')).map(k=>JSON.parse(localStorage.getItem(k))));
    assert.ok(recovery.some(x=>JSON.stringify(x)===JSON.stringify(before)));
    await page.reload();await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
    assert.equal(await page.evaluate(()=>globalThis.__mm3Test.getData().profile.name),'Backup regression fixture');
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().banks),before.banks);
    passed('AUD8-012: version-only backups are rejected without writes; valid restore cancels safely, protects the original and persists every bank balance');
  }finally{await backup.context.close()}

  const favoriteDrag=await createPage('app',{width:393,height:852,mobile:true});
  try{
    const page=favoriteDrag.page;
    await page.evaluate(async()=>{const api=globalThis.__mm3Test,d=api.getData();d.sidebarFavorites=['quickExpense','quickBank','salary'];d.sidebarFavoriteOrder=[...d.sidebarFavorites];await api.replaceData(d);api.openFavoritesEditor()});
    const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
    const drag=async cancel=>{
      const grip=page.locator('[data-fav-grip="quickExpense"]');
      const a=await grip.boundingBox(),b=await page.locator('[data-fav-row="salary"]').boundingBox();assert.ok(a&&b);
      await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2,b.y+b.height-4,{steps:12});
      if(cancel)await grip.dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',isPrimary:true});
      await page.mouse.up();await page.waitForTimeout(350);
    };
    await drag(true);
    assert.deepEqual(await page.locator('[data-fav-row]').evaluateAll(es=>es.map(e=>e.dataset.favRow)),['quickExpense','quickBank','salary']);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
    assert.equal(await page.locator('.fav-editor-row.dragging').count(),0);
    await drag(false);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().sidebarFavoriteOrder),['quickBank','salary','quickExpense']);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().banks),before.banks);
    await page.reload();await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().sidebarFavoriteOrder),['quickBank','salary','quickExpense']);
    passed('AUD8-013: canceled favorite drags preserve order and data; only a released drop persists the new order');
  }finally{await favoriteDrag.context.close()}

  const assetDrag=await createPage('app',{width:393,height:852,mobile:true});
  try{
    const page=assetDrag.page;await page.evaluate(()=>globalThis.__mm3Test.switchTab('assets'));
    await page.locator('#mm3AssetSort').click();await page.locator('#menuLayer button').filter({hasText:'手動'}).click();
    await page.locator('#mm3AssetWatchlist.mm3-assets-manual').waitFor();
    const rows=page.locator('#mm3AssetWatchlist .mm3-assets-watchrow');
    const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
    const order=await rows.evaluateAll(es=>es.map(e=>e.dataset.bank));
    const prefs=await page.evaluate(()=>localStorage.getItem('mymoney3_ui_prefs_v1'));
    const drag=async cancel=>{
      await rows.last().scrollIntoViewIfNeeded();await rows.first().scrollIntoViewIfNeeded();
      const grip=rows.first(),a=await grip.boundingBox(),b=await rows.nth(2).boundingBox();assert.ok(a&&b&&b.y+b.height-4<852);
      await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.waitForTimeout(400);
      assert.equal(await page.locator('.mm3-assets-dragging').count(),1);
      await page.mouse.move(a.x+a.width/2,b.y+b.height-4,{steps:12});
      if(cancel)await grip.dispatchEvent('pointercancel',{pointerId:1,pointerType:'mouse',isPrimary:true});
      await page.mouse.up();await page.waitForTimeout(350);
    };
    await drag(true);
    assert.deepEqual(await rows.evaluateAll(es=>es.map(e=>e.dataset.bank)),order);
    assert.equal(await page.evaluate(()=>localStorage.getItem('mymoney3_ui_prefs_v1')),prefs);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
    assert.equal(await page.locator('.mm3-assets-dragging,.mm3-assets-reorder-placeholder').count(),0);
    await drag(false);
    const expected=[...order];expected.splice(0,1);expected.splice(2,0,order[0]);
    assert.deepEqual(await rows.evaluateAll(es=>es.map(e=>e.dataset.bank)),expected);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
    await page.reload();await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));await page.evaluate(()=>globalThis.__mm3Test.switchTab('assets'));
    assert.deepEqual(await rows.evaluateAll(es=>es.map(e=>e.dataset.bank)),expected);
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData().banks),before.banks);
    passed('AUD8-014: canceled manual account drags preserve DOM order and preferences; released drops persist without changing balances');
  }finally{await assetDrag.context.close()}

  const resetPrefs=await createPage('app',{width:393,height:852,mobile:true,localOnly:true});
  try{
    const page=resetPrefs.page;await page.evaluate(()=>globalThis.__mm3Test.switchTab('assets'));
    await page.locator('#mm3AssetSort').click();await page.locator('#menuLayer button').filter({hasText:'手動'}).click();
    assert.ok(await page.evaluate(()=>JSON.parse(localStorage.getItem('mymoney3_ui_prefs_v1')).assetManualOrder.length>0));
    await page.reload();await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
    await page.evaluate(()=>globalThis.__mm3Test.switchTab('assets'));assert.match(await page.locator('#mm3AssetSort').innerText(),/手動/);
    await page.evaluate(()=>{localStorage.setItem('audit_unrelated_app_key','keep');return globalThis.__mm3Test.openDataSettings()});
    await page.locator('#deleteAll').click();await page.locator('#deleteModeKeep').click();await page.locator('#deleteConfirmPhrase').fill('削除');
    await page.locator('#deleteConfirmProceed').click();await page.locator('#alertWrap.show').waitFor();
    await page.locator('#alertActions').getByRole('button',{name:'全データを削除',exact:true}).click();
    await page.locator('#sheet.show').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>localStorage.getItem('mymoney3_ui_prefs_v1')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('audit_unrelated_app_key')),'keep');
    assert.ok(await page.evaluate(()=>globalThis.__mm3Test.getData().banks.length>0));
    assert.equal(await page.evaluate(()=>globalThis.__mm3Test.getData().transactions.length),0);
    await page.evaluate(()=>globalThis.__mm3Test.switchTab('assets'));assert.match(await page.locator('#mm3AssetSort').innerText(),/残高順/);
    await page.reload();await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('mymoney3_ui_prefs_v1')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('audit_unrelated_app_key')),'keep');
    passed('AUD8-015: reset with sample data removes old UI preferences, restores live defaults and preserves unrelated storage');
  }finally{await resetPrefs.context.close()}


  for(const width of [320,393]){
    const navTarget=await createPage('app',{width,height:852,mobile:true});
    try{
      const page=navTarget.page;
      await page.evaluate(async()=>{
        const api=globalThis.__mm3Test,state=api.getData();
        state.tempIncomes.push({id:'audit-nav-target',date:'2026-10-07',amount:2500,
          sourceName:'操作領域テスト',toType:'cash',bankId:'',memo:'',receivedConfirmed:false});
        await api.replaceData(state);api.openTempIncomeHistory();
      });
      await page.locator('[data-temp="audit-nav-target"]').click();
      const button=page.locator('.push-view.show #tempEditNav');await button.waitFor();
      await page.waitForFunction(()=>{const view=document.querySelector('.push-view.show #tempEditNav')?.closest('.push-view');return view&&getComputedStyle(view).transform==='matrix(1, 0, 0, 1, 0, 0)'});
      const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
      const targets=await button.locator('..').locator(':scope > button').evaluateAll(es=>es.map(e=>{
        const b=e.getBoundingClientRect();return {id:e.id,width:b.width,height:b.height,left:b.left,right:b.right};
      }));
      assert.ok(targets.length>0);
      for(const b of targets)assert.ok(b.width>=44&&b.height>=44&&b.left>=0&&b.right<=width,JSON.stringify(b));
      await button.click({position:{x:1,y:22}});await page.locator('#teSave').waitFor();
      assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      await page.locator('#teCancel').click();await page.locator('#sheet.show').waitFor({state:'hidden'});
      assert.ok(await button.isVisible());
      assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      passed(`AUD8-016: ${width}px temporary-income Edit and adjacent navigation targets are at least 44px; edge tap opens editor and cancel preserves data`);
    }finally{await navTarget.context.close()}
  }


  for(const width of [320,393]){
    const mailFields=await createPage('app',{width,height:852,mobile:true});
    try{
      const page=mailFields.page;
      await page.evaluate(async()=>{
        const api=globalThis.__mm3Test,state=api.getData();
        state.mailImports=[{id:'audit-hit-pending',date:'2026-10-07',amount:450,merchant:'架空の確認待ち',status:'pending',direction:'expense',paymentMethod:'other',paymentId:'',category:'食費',categorySource:'manual'},
          {id:'audit-hit-ignored',date:'2026-10-07',amount:777,merchant:'対象外の記録',status:'ignored',direction:'expense',paymentMethod:'other',paymentId:'',category:'食費',categorySource:'manual'}];
        await api.replaceData(state);api.renderAll();
      });
      const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
      await page.locator('#todayMenu').click();
      await page.locator('#menuLayer').getByRole('menuitem',{name:'メール取引',exact:true}).click();
      await page.locator('#mailHistoryOverview').click();await page.locator('#mm3MailHistorySearch').waitFor();
      for(const selector of ['#mm3MailHistorySearch','#mm3MailHistoryFilter']){
        const b=await page.locator(selector).boundingBox();assert.ok(b&&b.width>=44&&b.height>=44,JSON.stringify({selector,b}));
      }
      const search=page.locator('#mm3MailHistorySearch');await search.click({position:{x:30,y:1}});
      assert.equal(await page.evaluate(()=>document.activeElement?.id),'mm3MailHistorySearch');
      assert.equal(await page.locator('#mm3MailHistoryList [data-mail-id]').count(),2);
      await search.fill('架空');assert.equal(await page.locator('#mm3MailHistoryList [data-mail-id="audit-hit-pending"]').count(),1);
      await page.locator('#mm3MailHistoryFilter').selectOption('ignored');assert.equal(await page.locator('#mm3MailHistoryList [data-mail-id]').count(),0);
      await search.fill('');assert.equal(await page.locator('#mm3MailHistoryList [data-mail-id="audit-hit-ignored"]').count(),1);
      assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      const history=page.locator('.mail-center-history');const id=await history.getAttribute('id');
      await history.locator('.back-btn').click();await page.locator('#'+id).waitFor({state:'detached'});
      assert.ok(await page.locator('#mailHistoryOverview').isVisible());
      assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      passed(`AUD8-017: ${width}px mail-history search and filter provide 44px targets, filter actual records and preserve data on Back`);
    }finally{await mailFields.context.close()}

    const parsedFields=await createPage('app',{width,height:852,mobile:true});
    try{
      const page=parsedFields.page;const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
      await page.evaluate(()=>globalThis.__mm3Test.openSmartInputSearch('input'));
      await page.locator('#pro4Lines').fill('今日 操作領域テスト 650円');await page.locator('#pro4Parse').click();
      await page.locator('[data-draft-cat="0"]').waitFor();
      for(const selector of ['[data-draft-cat="0"]','[data-draft-pay="0"]']){
        const b=await page.locator(selector).boundingBox();assert.ok(b&&b.width>=44&&b.height>=44,JSON.stringify({selector,b}));
      }
      await page.locator('[data-draft-cat="0"]').selectOption('交通費');
      assert.equal(await page.locator('[data-draft-cat="0"]').inputValue(),'交通費');
      await page.locator('[data-draft-pay="0"]').selectOption('other|');
      assert.equal(await page.locator('[data-draft-pay="0"]').inputValue(),'other|');
      const view=page.locator('.push-view.show').last(),id=await view.getAttribute('id');
      await view.locator('.back-btn').click();await page.locator('#'+id).waitFor({state:'detached'});
      assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      passed(`AUD8-018: ${width}px parsed category and payment selectors provide 44px targets; edits remain drafts and Back preserves the ledger`);
    }finally{await parsedFields.context.close()}
  }


  for(const width of [320,393]){
    const calculatorFocus=await createPage('app',{width,height:852,mobile:true});
    try{
      const page=calculatorFocus.page;const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
      await page.locator('#quickExpense').click();await page.locator('#qeAmount').waitFor();
      const value=await page.locator('#qeAmount .val').innerText();
      for(const mode of ['tap','keyboard']){
        if(mode==='tap')await page.locator('#qeAmount').click();
        else{await page.locator('#qeAmount').focus();await page.keyboard.press('Enter')}
        await page.locator('#calculator.show').waitFor();
        await page.locator('#calcGrid [data-k="clear"]').click();
        for(let i=0;i<3;i++)await page.locator('#calcGrid [data-k="7"]').click();
        if(mode==='tap')await page.locator('#calcCancel').click();else await page.keyboard.press('Escape');
        await page.locator('#calculator.show').waitFor({state:'hidden'});
        await page.waitForFunction(()=>document.activeElement?.id==='qeAmount');
        assert.equal(await page.locator('#qeAmount .val').innerText(),value);
        assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      }
      await page.locator('#qeCancel').click();await page.locator('#sheet.show').waitFor({state:'hidden'});
      await page.evaluate(()=>globalThis.__mm3Test.openEventGoalEditor(null));
      await page.locator('#eventGoalAddItem').click();await page.locator('#goalItemAmount').click();
      await page.locator('#calculator.show').waitFor();
      await page.locator('#calcGrid [data-k="7"]').click();await page.locator('#calcCancel').click();
      await page.locator('#calculator.show').waitFor({state:'hidden'});
      await page.waitForFunction(()=>document.activeElement?.id==='goalItemAmount');
      await page.locator('#goalItemCancel').click();
      await page.waitForFunction(()=>document.activeElement?.id==='eventGoalAddItem');
      await page.locator('#eventGoalCancel').click();await page.locator('#sheet.show').waitFor({state:'hidden'});
      assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      passed(`AUD8-019: ${width}px calculator cancel restores the originating amount control for tap, keyboard and nested editors without writes`);
    }finally{await calculatorFocus.context.close()}
  }

  for(const width of [320,393]){
    const {page,context}=await createPage('app',{width,height:852,mobile:true});
    try{
      await page.getByRole('button',{name:'今月',exact:true}).click();
      const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
      const entry=page.getByRole('button',{name:'月間目標',exact:true});
      await entry.tap();
      const planner=page.locator('.push-view.show').last();
      const back=planner.getByRole('button',{name:'今月に戻る'});
      const prompt=page.getByRole('alertdialog',{name:'変更を破棄しますか？'});
      await back.tap();
      await planner.waitFor({state:'hidden'});
      assert.equal(await prompt.isVisible(),false);

      await entry.tap();
      await planner.locator('#goalStart').tap();
      await planner.locator('#goalNext').tap();
      await planner.locator('#goalLargeAdd').tap();
      await page.locator('#leName').fill('監査用大型支出');
      await page.locator('#leAmount').tap();
      await page.locator('#calculator.show').waitFor();
      for(const key of ['4','5','0','0'])await page.locator(`#calcGrid [data-k="${key}"]`).tap();
      await page.locator('#calcDone').tap();
      await page.locator('#leSave').tap();
      const draft=planner.getByRole('button',{name:/監査用大型支出.*¥4,500/});
      await draft.waitFor();
      await planner.locator('#goalBack').tap();
      await planner.locator('#goalNext').tap();
      await draft.waitFor();

      await back.tap();
      await prompt.getByRole('button',{name:'編集を続ける'}).tap();
      await draft.waitFor();
      await page.keyboard.press('Escape');
      await prompt.waitFor();
      await page.keyboard.press('Escape');
      await prompt.waitFor({state:'hidden'});
      assert.equal(await draft.count(),1);

      const touch=await context.newCDPSession(page);
      try{
        await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:8,y:250}]});
        for(const x of [30,55,80,110,145,180]){
          await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:250}]});
        }
        await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      }finally{await touch.detach()}
      await prompt.getByRole('button',{name:'破棄',exact:true}).tap();
      await planner.waitFor({state:'hidden'});
      await entry.tap();
      await planner.locator('#goalStart').tap();
      await planner.locator('#goalNext').tap();
      assert.equal(await draft.count(),0);
      assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      passed(`AUD8-020: ${width}px monthly expense drafts survive Back, Escape and swipe cancellation until confirmed discard; saved data is unchanged`);
    }finally{await context.close()}
  }

  for(const width of [320,393]){
    const height=width===320?568:852;
    const {page,context}=await createPage('app',{width,height,mobile:true});
    const touch=await context.newCDPSession(page);
    try{
      await page.getByRole('button',{name:'今月',exact:true}).tap();
      const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
      await page.getByRole('button',{name:'月間目標',exact:true}).tap();
      await page.locator('#goalStart').tap();
      await page.locator('#goalNext').tap();
      await page.locator('#goalLargeAdd').tap();
      const editor=page.locator('#leAmount');
      for(const motion of ['no-preference','reduce']){
        await page.emulateMedia({reducedMotion:motion});
        await editor.tap();
        const early=await page.evaluate(()=>{
          const calculator=document.getElementById('calculator');
          const key=calculator.querySelector('[data-k="2"]');
          const rect=key.getBoundingClientRect();
          const x=rect.x+rect.width/2,y=rect.y+rect.height/2;
          return {x,y,target:document.elementFromPoint(x,y)?.closest('[data-k]')?.dataset.k,
            moving:calculator.getAnimations().some(animation=>animation.transitionProperty==='transform')};
        });
        assert.equal(early.moving,false);
        assert.equal(early.target,'2');
        await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:early.x,y:early.y}]});
        await page.waitForTimeout(60);
        await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert.equal(await page.locator('#calcNumber').innerText(),'2');
        await page.locator('#calcCancel').tap();
        assert.equal(await editor.locator('.val').innerText(),'¥0');
        assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      }
      passed(`AUD8-021: ${width}px calculator keys stay at their hit positions while opening, with and without motion`);
    }finally{await touch.detach();await context.close()}
  }

  const focusAudit=await createPage('app',{width:393,height:852,mobile:true});
  try{
    const {page}=focusAudit;
    await page.evaluate(()=>globalThis.__mm3Test.switchTab('payments'));
    await page.locator('#mm3AtfOpen').click();
    const summary=page.locator('.mm3-atf-settings > summary');
    await summary.focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'mm3AtfClose');
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'atfDaily');
    await page.keyboard.press('Escape');
    await page.evaluate(async()=>{
      const api=globalThis.__mm3Test,state=api.getData();
      state.monthlyGoals['2026-10']={total:30000,categories:{'食費':30000}};
      await api.replaceData(state);
      api.switchTab('month');
      api.openBudgetRebalance();
    });
    const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
    await page.locator('[data-rebalance-mode="selected"]').focus();
    const forward=[];
    for(let i=0;i<3;i++){
      await page.keyboard.press('Tab');
      forward.push(await page.evaluate(()=>document.activeElement.id));
      if(forward.at(-1)==='rebalanceApply')break;
    }
    assert.ok(forward.includes('rebalanceApply'),JSON.stringify(forward));
    await page.keyboard.press('Escape');
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
    passed('AUD8-022: native details and scrolling previews retain forward keyboard navigation without writes');
  }finally{await focusAudit.context.close()}

  for(const [width,height] of [[320,568],[393,852]]){
    const {page,context}=await createPage('app',{width,height,mobile:true});
    try{
      const read=()=>page.evaluate(()=>globalThis.__mm3Test.getData());
      const before=await read();
      await page.locator('#quickExpense').tap();
      await page.locator('#qeAmount').tap();
      await page.waitForFunction(()=>document.activeElement.id==='calcTitle');
      await page.keyboard.type('101');
      const split=page.locator('[data-calc-tool="split"]');
      await split.press('Enter');
      assert.equal(await split.getAttribute('aria-expanded'),'true');
      await page.locator('#calcToolValue').fill('1');
      assert.equal(await page.locator('#calcToolApply').isDisabled(),true);
      await page.locator('#calcToolCancel').press('Enter');
      assert.equal(await page.locator('#calcTools').isVisible(),false);
      assert.equal(await split.evaluate(button=>button===document.activeElement),true);
      assert.equal(await page.locator('#calcNumber').innerText(),'101');
      await page.keyboard.press('Enter');
      await page.locator('#calcToolValue').fill('3');
      await page.locator('#calcToolApply').press('Enter');
      assert.equal(await page.locator('#calcTools').isVisible(),false);
      assert.equal(await split.evaluate(button=>button===document.activeElement),true);
      assert.equal(await page.locator('#calcNumber').innerText(),'33');
      await page.locator('#calcDone').press('Enter');
      assert.match(await page.locator('#qeAmount').innerText(),/¥33/);
      await page.locator('#qeCancel').tap();
      await page.locator('#alertActions button').last().tap();
      assert.deepEqual(await read(),before);
      passed(`AUD8-023: ${width}px calculator Enter activates the focused tool and returns focus after Back or Apply`);
    }finally{await context.close()}
  }

  const planFixture=await createPage('app',{width:393,height:852,mobile:true});
  let storedPlan;
  try{
    storedPlan=await planFixture.page.evaluate(()=>globalThis.__mm3Test.getData());
  }finally{await planFixture.context.close()}
  storedPlan.monthlyGoals={'2026-10':{total:30000,categories:{'食費':30000},daily:{8:1500}}};
  const planModeAudit=await createPage('app',{width:393,height:852,mobile:true,stored:storedPlan});
  try{
    const {page}=planModeAudit;
    await page.getByRole('button',{name:'今月',exact:true}).tap();
    const read=()=>page.evaluate(()=>globalThis.__mm3Test.getData());
    const before=await read();
    assert.equal(before.monthlyGoals['2026-10'].total,30000);
    assert.equal(before.monthlyGoals['2026-11'],undefined);
    await page.locator('#monthPlanEdit').tap();
    assert.equal(await page.locator('#monthPlanEdit').innerText(),'調整を終了');
    await page.locator('#monthMenu').tap();
    await page.getByRole('menuitem',{name:'次月',exact:true}).tap();
    assert.equal(await page.locator('#monthPlanEdit').count(),0);
    await page.locator('#monthCalendar [data-date="2026-11-08"]').tap();
    await page.locator('.push-view.show #inspectLarge').waitFor({timeout:5000});
    assert.equal(await page.locator('.push-view.show .push-title').innerText(),'その日の資金詳細');
    assert.equal(await page.locator('#sheet.show').count(),0);
    await page.locator('.push-view.show .back-btn').tap();
    await page.locator('#monthMenu').tap();
    await page.getByRole('menuitem',{name:'前月',exact:true}).tap();
    assert.equal(await page.locator('#monthPlanEdit').innerText(),'日別計画を調整');
    assert.deepEqual(await read(),before);
    passed('AUD8-024: leaving a planned month clears adjustment mode when the new month has no plan');
  }finally{await planModeAudit.context.close()}

  for(const [width,height] of [[320,568],[393,852]]){
    const {page,context}=await createPage('app',{width,height,mobile:true});
    const touch=await context.newCDPSession(page);
    try{
      await page.getByRole('button',{name:'今月',exact:true}).tap();
      const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
      const day=page.locator('#monthCalendar [data-date="2026-10-08"]');
      await day.scrollIntoViewIfNeeded();
      const rect=await day.boundingBox();
      assert.ok(rect);
      const points=[{x:Math.round(rect.x+rect.width/2),y:Math.round(rect.y+rect.height/2)}];
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
      const menu=page.locator('#sheet.show #dqmClose');
      await menu.waitFor();
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.equal(await menu.isVisible(),true);
      assert.equal(await page.locator('.push-view.show').count(),0);
      await menu.tap();
      await menu.waitFor({state:'hidden'});
      await day.press('Enter');
      await page.locator('.push-view.show #inspectExpense').waitFor({timeout:5000});
      await page.locator('.push-view.show .back-btn').tap();
      assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
      passed(`AUD8-025: ${width}px calendar long-touch release preserves its menu and the day still works with Enter`);
    }finally{await touch.detach();await context.close()}
  }

  const fixedPaymentLabel=await createPage('app',{width:393,height:852,mobile:true});
  try{
    const {page}=fixedPaymentLabel;
    const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
    await page.evaluate(()=>globalThis.__mm3Test.openFixedPayment());
    const payment=page.getByRole('combobox',{name:'支払い方法',exact:true});
    assert.equal(await payment.getAttribute('id'),'fpPay');
    await payment.selectOption(`bank|${before.banks[0].id}`);
    assert.equal(await payment.inputValue(),`bank|${before.banks[0].id}`);
    await page.locator('#fpCancel').click();
    if(await page.locator('#alertWrap.show').count())await page.locator('#alertActions button').last().click();
    await page.locator('#sheet.show').waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
    passed('AUD8-026: fixed payment method has its visible accessible name and cancel preserves data');
  }finally{await fixedPaymentLabel.context.close()}

}
