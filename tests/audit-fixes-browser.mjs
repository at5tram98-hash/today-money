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

}
