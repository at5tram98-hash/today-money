// 304-ID runtime design inventory. A rendered control is NOT a passed action.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';

const registry=JSON.parse(readFileSync(new URL('./phase8-control-inventory.json',import.meta.url),'utf8'));
const main=['home','month','pay','payments','assets','settings'];
const routes=[
  ['search','home','#todaySearch'],['notices','home','#todayNotice'],
  ['home-menu','home','#todayMenu'],['expense','home','#quickExpense'],
  ['quick-bank','home','#quickBank'],['quick-income','home','#quickIncome'],
  ['salary-menu','pay','#salaryMenu'],['salary-add','pay','#salaryAddNav'],
  ['payment-menu','payments','#paymentsMenu'],['atf','payments','#mm3AtfOpen'],
  ['assets-menu','assets','#assetMenuSimple'],['profile','settings','#profileSettings'],
  ['data','settings',null,'openDataSettings'],
  ['delete-guard','settings','#deleteAll','openDataSettings'],
  ['events','month','#monthEventGoals'],
  ['new-event','month','#monthEventGoals',null,'#eventGoalAdd'],
  ['new-event-item','month','#monthEventGoals',null,'#eventGoalAdd','#eventGoalAddItem'],
  ['daily-budget','home',null,'openDailyGoalPlanner'],
  ['acf','home',null,'openAcf'],
  ['financial-update','assets',null,'openFinancialUpdates'],
  ['today-repeat','home','#todayRepeat'],['today-one-line','home','#todayOneLine'],
  ['today-cross-search','home','#todayCrossSearch'],['today-analysis','home','#todayAnalysis'],
  ['today-transactions','home','#todayTransactions'],
  ['today-mail','home','#todayMenu',null,'#menuLayer button:has-text("メール取引")'],
  ['month-selector','month','#monthName'],['month-hero','month','#monthHero'],
  ['month-search','month','#monthSearch'],['month-menu','month','#monthMenu'],
  ['month-analysis','month','#monthAnalysis'],['month-reason','month','#monthReasonAnalysis'],
  ['month-review','month','#monthCloseReview'],['month-transactions','month','#monthTransactions'],
  ['month-goal','month','#monthGoal'],['salary-month','pay','#mm3SalaryMonth'],
  ['salary-viz','pay','#mm3SalaryVizMenu'],['payment-month','payments','#mm3PaymentMonth'],
  ['payment-card-update','payments','#mm3PaymentQuickBilling'],
  ['payment-history','payments','#mm3PaymentHistoryTop'],
  ['asset-history','assets','#mm3AssetHistoryTop'],
  ['editor-bank','settings',null,'openAddBank'],
  ['editor-credit-card','settings',null,'openAddCard'],
  ['editor-debit-card','settings',null,'openAddDebit'],
  ['editor-payroll','pay',null,'openSalaryAdd'],
  ['editor-fixed-bill','payments',null,'openFixedPayment'],
  ['editor-daily-correction','home',null,'openDailyCorrectionDetail'],
  ['history-temporary-income','pay',null,'openTempIncomeHistory'],
  ['editor-billing','payments',null,'openQuickCardBilling'],
  ['initial-financial-settings','settings',null,'openInitialValues'],
  ['search-voice-entry','home',null,'openSmartInputSearch'],
  ['event-goal-list','month',null,'openEventGoals'],
  ['event-goal-editor','month',null,'openEventGoalEditor'],
  ['reason-analysis','month',null,'openReasonAnalysis'],
  ['month-closing-review','month',null,'openMonthCloseReview'],
  ['favorites','settings',null,'openFavoritesEditor'],
  ['tags-manage','settings',null,'openTagsManager'],
  ['tags-editor','settings',null,'openTagEdit'],
  ['timeline','assets',null,'openMoneyTimeline'],
  ['salary-allocation-picker','pay',null,'openSalaryAllocationPicker'],
  ['bank-transfer-plans','assets',null,'openTransferPlans'],
  ['bank-transfer-editor','assets',null,'openTransferPlanEditor'],
  ['budget-rebalance','month',null,'openBudgetRebalance'],
  ['acf-setup','home',null,'openAcfSetup'],
  ['acf-simulator','home',null,'openAcfSimulator'],
  ['acf-settings','home',null,'openAcfSettings'],
  ['day-closing-journal','home',null,'openDayClosingJournal'],
  ['asset-billing-month','assets',null,'openAssetBillingMonthPicker'],
  ['quick-repeat-direct','home',null,'openQuickRepeat']
];
function inspectAll(catalog){
 const matched=[];
 for(const item of catalog){
   let el,loc=item.domIdentifier;
   if(loc.startsWith('[')){
     try{el=document.querySelector(loc)}catch{}
   }else if(loc.includes('$')){
     const prefix=loc.split('$')[0];
     el=[...document.querySelectorAll('[id]')].find(x=>x.id.startsWith(prefix));
   }else el=document.getElementById(loc);
   if(!el)continue;
   const rect=el.getBoundingClientRect(),css=getComputedStyle(el);
   const visible=rect.width>0&&rect.height>0&&css.visibility!=='hidden'&&css.display!=='none'&&!el.closest('[hidden],[inert],[aria-hidden="true"]');
   const label=(el.getAttribute('aria-label')||el.getAttribute('title')||el.innerText||el.textContent||'').trim().slice(0,90);
   matched.push({id:item.id,visible:!!visible,label,disabled:!!el.disabled,
     tag:el.tagName,focusable:el.tabIndex>=0,
     rect:{x:rect.x,y:rect.y,w:rect.width,h:rect.height},
     fontSize:parseFloat(css.fontSize)||0,
     under44:!!visible&&(rect.width<43.5||rect.height<43.5),
     missingLabel:!!visible&&!label});
 }
 const ids=new Set(catalog.filter(item=>item.domIdentifier[0]!=='[').map(item=>item.domIdentifier));
 const unregistered=[...document.querySelectorAll('button,[role=button]')]
   .filter(el=>{
     const rect=el.getBoundingClientRect(),css=getComputedStyle(el);
     return rect.width>0&&rect.height>0&&css.display!=='none'
       &&css.visibility!=='hidden'&&!el.closest('[hidden],[inert],[aria-hidden=true]')
       &&!ids.has(el.id);
   })
   .map(el=>{
     const r=el.getBoundingClientRect();
     return {id:el.id||'',className:String(el.className||'').slice(0,85),
       label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,65),
       width:+r.width.toFixed(1),height:+r.height.toFixed(1),
       under44:r.width<43.5||r.height<43.5};
   });
 const smallText=[];
 const check=[...document.querySelectorAll('.screen.active *, #sheet.show *, .push-view:last-child *, #menuLayer.show *')];
 for(const el of check){
   if(el.children.length||!el.textContent?.trim())continue;
   const rect=el.getBoundingClientRect(),size=parseFloat(getComputedStyle(el).fontSize);
   if(rect.width>0&&rect.height>0&&size<12)smallText.push({
     snippet:el.textContent.trim().slice(0,48),size,kind:el.id||String(el.className).slice(0,45)
   });
 }
 return {matched,unregistered:unregistered.slice(0,120),unregisteredTotal:unregistered.length,smallText:smallText.slice(0,80),activeScreen:document.querySelector('.screen.active')?.id||''};
}
const expectedDestinations={
  "search": "#pro4SaveSearch",
  "notices": ".push-view.show",
  "home-menu": "#menuLayer.show",
  "expense": "#qeCancel",
  "quick-bank": "#qbCancel",
  "quick-income": "#tiCancel",
  "salary-menu": "#menuLayer.show",
  "salary-add": "#salaryAddClose",
  "payment-menu": "#menuLayer.show",
  "atf": "#mm3AtfClose",
  "assets-menu": "#menuLayer.show",
  "profile": "#prCancel",
  "data": "#deleteAll",
  "delete-guard": "#deleteConfirmPhrase",
  "events": "#eventGoalAdd",
  "new-event": "#eventGoalCancel",
  "new-event-item": "#goalItemCancel",
  "daily-budget": "#goalStart",
  "acf": "#acfSetupCancel",
  "financial-update": ".push-view.show",
  "today-repeat": "#qrClose",
  "today-one-line": "#pro4Parse",
  "today-cross-search": "#pro4SaveSearch",
  "today-analysis": ".push-view.show",
  "today-transactions": "#txSearch",
  "today-mail": "#mailSyncOverview",
  "month-selector": "#mpClose",
  "month-hero": "#msClose",
  "month-search": "#pro4SaveSearch",
  "month-menu": "#menuLayer.show",
  "month-analysis": "#monthTrend",
  "month-reason": ".push-view.show",
  "month-review": "#monthReviewConfirm",
  "month-transactions": "#txSearch",
  "month-goal": "#goalStart",
  "salary-month": "#monthPickerCancel",
  "salary-viz": "#menuLayer.show",
  "payment-month": "#monthPickerCancel",
  "payment-card-update": "#qcbCancel",
  "payment-history": "#txSearch",
  "asset-history": ".push-view.show",
  "editor-bank": "#abCancel",
  "editor-credit-card": "#acCancel",
  "editor-debit-card": "#adCancel",
  "editor-payroll": "#saCancel",
  "editor-fixed-bill": "#fpCancel",
  "editor-daily-correction": "#dcClose",
  "history-temporary-income": ".push-view.show",
  "editor-billing": "#qcbCancel",
  "initial-financial-settings": ".push-view.show",
  "search-voice-entry": "#pro4Parse",
  "event-goal-list": "#eventGoalAdd",
  "event-goal-editor": "#eventGoalCancel",
  "reason-analysis": ".push-view.show",
  "month-closing-review": "#monthReviewConfirm",
  "favorites": ".push-view.show",
  "tags-manage": "#tagAdd",
  "tags-editor": "#tagCancel",
  "timeline": ".push-view.show",
  "salary-allocation-picker": "#allocPickClose",
  "bank-transfer-plans": "#transferAdd",
  "bank-transfer-editor": "#transferCancel",
  "budget-rebalance": "#rebalanceApply",
  "acf-setup": "#acfSetupCancel",
  "acf-simulator": "#simCancel",
  "acf-settings": "#acfSettingsSave",
  "day-closing-journal": ".push-view.show",
  "asset-billing-month": "#monthPickerCancel",
  "quick-repeat-direct": "#qrClose"
};
const expectedPushTitles={notices:'システムからのお知らせ','today-analysis':'詳細分析',
 'financial-update':'金額を更新','month-reason':'理由が分かる分析','asset-history':'残高履歴',
 'history-temporary-income':'臨時収入','initial-financial-settings':'初期データ・現在値',
 'reason-analysis':'理由が分かる分析',favorites:'お気に入り',timeline:'お金のタイムライン',
 'day-closing-journal':'日締めジャーナル'};
async function closeScene(page){
 for(let i=0;i<6;i++){
  let close=page.locator('#sheet.show .sheet-nested-content .sheet-nav button').filter({hasText:/キャンセル|閉じる|戻る/}).first();
  if(!await close.isVisible())close=page.locator('#sheet.show > .sheet-nav button').filter({hasText:/キャンセル|閉じる|戻る/}).first();
  if(!await close.isVisible())close=page.locator('.push-view.show').last().locator('.back-btn').first();
  if(await close.isVisible()){await close.click();await page.waitForTimeout(350);continue}
  if(await page.locator('#menuLayer.show').isVisible()){await page.keyboard.press('Escape');await page.waitForTimeout(100)}
  break;
 }
 return await page.locator('#sheet.show,.push-view.show,#menuLayer.show').count()===0;
}
async function oneScene(createPage,dir,def,viewport){
 const [name,tab,click,method,step2,step3]=def;
 const scene={name,tab,viewport,actions:[],error:'',matched:[],smallText:[],unregistered:[],unregisteredTotal:0,
   destinationVerified:false,backOrCancelVerified:false,financeUnchanged:false};
 const session=await createPage('app',{width:viewport.width,height:viewport.height,mobile:true,appearance:viewport.theme});
 const page=session.page;
 try{
   await page.evaluate(tab=>globalThis.__mm3Test.switchTab(tab),tab);
   if(name==='salary-allocation-picker'||name==='budget-rebalance'){
     scene.fixture=name==='salary-allocation-picker'?'two paid test salaries':'configured monthly test budget';
     await page.evaluate(async name=>{
       const api=globalThis.__mm3Test,state=api.getData();
       if(name==='salary-allocation-picker')state.salaryRecords.slice(0,2).forEach(row=>row.status='入金済');
       else state.monthlyGoals['2026-10']={total:30000,categories:{'食費':30000}};
       await api.replaceData(state);api.renderAll();
     },name);
   }
   const before=await page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));
   if(method){
     await page.evaluate(async method=>{
       const api=globalThis.__mm3Test;
       if(!api[method])throw new Error('missing hook: '+method);
       if(method==='openFinancialUpdates')await api[method]('banks','2026-10');
       else await api[method]();
     },method);
   }
   for(const selector of [click,step2,step3].filter(Boolean)){
     const el=page.locator(selector).first();
     if(!await el.count()||await el.isHidden()){
       scene.actions.push({selector,status:'not-visible'});break
     }
     const b=await el.boundingBox();
     await el.click({timeout:1900});
     scene.actions.push({selector,status:'clicked',bbox:b});
     await page.waitForTimeout(90);
   }
   await page.locator('.busy-overlay.show').waitFor({state:'hidden',timeout:10000});
   const expected=expectedDestinations[name]||(main.includes(name)?'#screen-'+(name==='home'?'today':name)+'.active':null);
   if(!expected)throw new Error('missing destination oracle: '+name);
   await page.locator(expected).first().waitFor({state:'visible',timeout:5000});
   if(expectedPushTitles[name])assert.equal(await page.locator('.push-view.show .push-title').last().innerText(),expectedPushTitles[name]);
   scene.destinationVerified=true;
   const observed=await page.evaluate(inspectAll,registry.controls);
   scene.matched=observed.matched;
   scene.smallText=observed.smallText;
   scene.unregistered=observed.unregistered;
   scene.unregisteredTotal=observed.unregisteredTotal;
   scene.activeScreen=observed.activeScreen;
   const path='phase8-ui-depth/'+viewport.width+'-'+viewport.theme+'-'+name+'.png';
   await page.screenshot({path:resolve(dir,path),animations:'disabled'});
   scene.screenshot=path;
   scene.backOrCancelVerified=main.includes(name)||await closeScene(page);
   scene.financeUnchanged=before===await page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));
   if(!scene.backOrCancelVerified)throw new Error('return or cancel path did not close the destination');
   if(!scene.financeUnchanged)throw new Error('screen navigation unexpectedly changed stored data');
 }catch(error){scene.error=String(error).slice(0,450)}
 finally{await session.context.close()}
 return scene;
}
export async function verifyPhase8Inventory({createPage,passed,root}){
 assert.equal(registry.total,304);
 assert.equal(registry.controls.length,304);
 assert.equal(new Set(registry.controls.map(x=>x.id)).size,304);
 const dir=resolve(root,'test-results');
 mkdirSync(resolve(dir,'phase8-ui-depth'),{recursive:true});
 const scenes=[];
 for(const vp of [
   {width:320,height:568,theme:'light'},
   {width:393,height:852,theme:'dark'}
 ])for(const tab of main)scenes.push(await oneScene(createPage,dir,[tab,tab],vp));
 const vp={width:393,height:852,theme:'light'};
 for(const scene of routes)scenes.push(await oneScene(createPage,dir,scene,vp));
 const controls=registry.controls.map(row=>{
   const observed=scenes.flatMap(s=>s.matched.filter(x=>x.id===row.id&&x.visible).map(x=>({
     scene:s.name,viewport:s.viewport,rect:x.rect,fontSize:x.fontSize,
     label:x.label,under44:x.under44,missingLabel:x.missingLabel,disabled:x.disabled
   })));
   return {id:row.id,section:row.id.split('-')[0],dom:row.domIdentifier,label:row.label,
     expected:row.expectedAction,source:row.source,
     verdict:observed.length?'geometry-observed-only':'not-observed',observed};
 });
 const output={
   status:'incomplete',definition:'Geometry, initial screenshots and attempts at safe navigation only; not 90% individual action verification.',
   catalogCount:registry.total,neededFor90:274,actionVerifiedByThisCollector:0,
   verifiedScreenScenarios:scenes.filter(s=>!s.error&&s.destinationVerified&&s.backOrCancelVerified&&s.financeUnchanged).length,
   renderedControls:controls.filter(x=>x.observed.length).length,
   under44:controls.filter(x=>x.observed.some(y=>y.under44)).map(x=>x.id),
   missingLabel:controls.filter(x=>x.observed.some(y=>y.missingLabel)).map(x=>x.id),
   sceneFailures:scenes.filter(x=>x.error).map(x=>({name:x.name,error:x.error})),
   unregistered:scenes.flatMap(x=>x.unregistered.map(y=>({...y,scene:x.name}))),
   scenes:scenes.map(x=>({name:x.name,tab:x.tab,viewport:x.viewport,
     destinationVerified:x.destinationVerified,backOrCancelVerified:x.backOrCancelVerified,
     financeUnchanged:x.financeUnchanged,fixture:x.fixture||'',
     actions:x.actions,screenshot:x.screenshot,error:x.error,smallText:x.smallText,
     unregisteredTotal:x.unregisteredTotal,unregistered:x.unregistered})),
   controls
 };
 writeFileSync(resolve(dir,'phase8-304-controls-audit.json'),JSON.stringify(output,null,2));
 passed('304 original IDs audited for runtime geometry where reachable; action coverage remains UNVERIFIED');
 assert.ok(output.verifiedScreenScenarios>=73,`${output.verifiedScreenScenarios}/81 screen destinations and returns verified; need at least 73`);
 passed(`${output.verifiedScreenScenarios}/81 expected screen destinations, return paths and stored-data invariants verified`);
 return output
}
