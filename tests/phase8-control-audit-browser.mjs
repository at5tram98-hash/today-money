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
  ['today-transactions','home','#todayTransactions'],['today-mail','home','#todayMail'],
  ['month-selector','month','#monthName'],['month-hero','month','#monthHero'],
  ['month-search','month','#monthSearch'],['month-menu','month','#monthMenu'],
  ['month-analysis','month','#monthAnalysis'],['month-reason','month','#monthReasonAnalysis'],
  ['month-review','month','#monthCloseReview'],['month-transactions','month','#monthTransactions'],
  ['month-goal','month','#monthGoal'],['salary-month','pay','#mm3SalaryMonth'],
  ['salary-viz','pay','#mm3SalaryVizMenu'],['payment-month','payments','#mm3PaymentMonth'],
  ['payment-card-update','payments','#mm3PaymentQuickBilling'],
  ['payment-history','payments','#mm3PaymentHistoryTop'],
  ['asset-history','assets','#mm3AssetHistoryTop']
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
 const listedIDs=new Set(catalog.filter(x=>!x.domIdentifier.startsWith('[')&&!x.domIdentifier.includes('
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
async function oneScene(createPage,dir,def,viewport){
 const [name,tab,click,method,step2,step3]=def;
 const scene={name,tab,viewport,actions:[],error:'',matched:[],smallText:[],unregistered:[],unregisteredTotal:0};
 const session=await createPage('app',{width:viewport.width,height:viewport.height,mobile:true,appearance:viewport.theme});
 const page=session.page;
 try{
   await page.evaluate(tab=>globalThis.__mm3Test.switchTab(tab),tab);
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
   await page.locator('.busy-overlay.show').waitFor({state:'hidden',timeout:7500}).catch(()=>{});
   const observed=await page.evaluate(inspectAll,registry.controls);
   scene.matched=observed.matched;
   scene.smallText=observed.smallText;
   scene.unregistered=observed.unregistered;
   scene.unregisteredTotal=observed.unregisteredTotal;
   scene.activeScreen=observed.activeScreen;
   const path='phase8-ui-depth/'+viewport.width+'-'+viewport.theme+'-'+name+'.png';
   await page.screenshot({path:resolve(dir,path),animations:'disabled'});
   scene.screenshot=path;
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
   renderedControls:controls.filter(x=>x.observed.length).length,
   under44:controls.filter(x=>x.observed.some(y=>y.under44)).map(x=>x.id),
   missingLabel:controls.filter(x=>x.observed.some(y=>y.missingLabel)).map(x=>x.id),
   sceneFailures:scenes.filter(x=>x.error).map(x=>({name:x.name,error:x.error})),
   unregistered:scenes.flatMap(x=>x.unregistered.map(y=>({...y,scene:x.name})) ),
   scenes:scenes.map(x=>({name:x.name,tab:x.tab,viewport:x.viewport,
     actions:x.actions,screenshot:x.screenshot,error:x.error,smallText:x.smallText,
     unregisteredTotal:x.unregisteredTotal,unregistered:x.unregistered})),
   controls
 };
 writeFileSync(resolve(dir,'phase8-304-controls-audit.json'),JSON.stringify(output,null,2));
 passed('304 original IDs audited for runtime geometry where reachable; action coverage remains UNVERIFIED');
 return output
}
)).map(x=>x.domIdentifier));
 const unregistered=[...document.querySelectorAll('button,[role="button"]')]
  .filter(el=>{const r=el.getBoundingClientRect(),css=getComputedStyle(el);return r.width>0&&r.height>0&&css.display!=='none'&&css.visibility!=='hidden'&&!el.closest('[hidden],[inert],[aria-hidden="true"]')&&!listedIDs.has(el.id)})
  .map(el=>{const r=el.getBoundingClientRect();return {id:el.id||'',className:String(el.className||'').slice(0,90),label:(el.getAttribute('aria-label')||el.textContent||'').trim().slice(0,65),width:+r.width.toFixed(1),height:+r.height.toFixed(1),under44:r.width<43.5||r.height<43.5}});
 const smallText=[];
 const check=[...document.querySelectorAll('.screen.active *, #sheet.show *, .push-view:last-child *, #menuLayer.show *')];
 for(const el of check){
   if(el.children.length||!el.textContent?.trim())continue;
   const rect=el.getBoundingClientRect(),size=parseFloat(getComputedStyle(el).fontSize);
   if(rect.width>0&&rect.height>0&&size<12)smallText.push({
     snippet:el.textContent.trim().slice(0,48),size,kind:el.id||String(el.className).slice(0,45)
   });
 }
 return {matched,smallText:smallText.slice(0,80),activeScreen:document.querySelector('.screen.active')?.id||''};
}
async function oneScene(createPage,dir,def,viewport){
 const [name,tab,click,method,step2,step3]=def;
 const scene={name,tab,viewport,actions:[],error:'',matched:[],smallText:[]};
 const session=await createPage('app',{width:viewport.width,height:viewport.height,mobile:true,appearance:viewport.theme});
 const page=session.page;
 try{
   await page.evaluate(tab=>globalThis.__mm3Test.switchTab(tab),tab);
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
   const observed=await page.evaluate(inspectAll,registry.controls);
   scene.matched=observed.matched;
   scene.smallText=observed.smallText;
   scene.activeScreen=observed.activeScreen;
   const path='phase8-ui-depth/'+viewport.width+'-'+viewport.theme+'-'+name+'.png';
   await page.screenshot({path:resolve(dir,path),animations:'disabled'});
   scene.screenshot=path;
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
   renderedControls:controls.filter(x=>x.observed.length).length,
   under44:controls.filter(x=>x.observed.some(y=>y.under44)).map(x=>x.id),
   missingLabel:controls.filter(x=>x.observed.some(y=>y.missingLabel)).map(x=>x.id),
   sceneFailures:scenes.filter(x=>x.error).map(x=>({name:x.name,error:x.error})),
   scenes:scenes.map(x=>({name:x.name,tab:x.tab,viewport:x.viewport,
     actions:x.actions,screenshot:x.screenshot,error:x.error,smallText:x.smallText})),
   controls
 };
 writeFileSync(resolve(dir,'phase8-304-controls-audit.json'),JSON.stringify(output,null,2));
 passed('304 original IDs audited for runtime geometry where reachable; action coverage remains UNVERIFIED');
 return output
}
