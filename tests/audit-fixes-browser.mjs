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
}
