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

}
