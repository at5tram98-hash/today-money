// Phase 8: independent per-ID click-outcome tests for safe, deterministic UI routes.
// Each case gets a new, isolated browser context and a financial-data invariant.
// A successful screenshot or DOM presence alone is NEVER counted as an action pass.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';

const registry=JSON.parse(readFileSync(new URL('./phase8-control-inventory.json',import.meta.url),'utf8'));
const byID=new Map(registry.controls.map(x=>[x.id,x]));
const financeFields=['transactions','incomes','tempIncomes','banks','cards','debitCards','salaryRecords','fixedPayments','largeExpensePlans','dayClosings','dayClosingRecords','assetSnapshots'];
const cases=[
  {id:'HOME-001',tab:'home',target:'#pro4SaveSearch'},
  {id:'HOME-002',tab:'home',target:'#pushLayer .push-view.show'},
  {id:'HOME-003',tab:'home',target:'#menuLayer.show'},
  {id:'HOME-004',tab:'home',target:'#qeCancel'},
  {id:'HOME-005',tab:'home',target:'#qbCancel'},
  {id:'HOME-006',tab:'home',target:'#tiCancel'},
  {id:'HOME-007',tab:'home',target:'#qrClose'},
  {id:'HOME-008',tab:'home',target:'#pro4Parse'},
  {id:'HOME-009',tab:'home',target:'#pro4SaveSearch'},
  {id:'HOME-010',tab:'home',target:'#pushLayer .push-view.show'},
  {id:'HOME-011',tab:'home',target:'#txSearch'},
  {id:'MONTH-041',tab:'month',target:'#mpClose'},
  {id:'MONTH-042',tab:'month',target:'#pro4SaveSearch'},
  {id:'MONTH-043',tab:'month',target:'#menuLayer.show'},
  {id:'MONTH-044',tab:'month',target:'#msClose'},
  {id:'MONTH-046',tab:'month',target:'#monthTrend'},
  {id:'MONTH-047',tab:'month',target:'#pushLayer .push-view.show'},
  {id:'MONTH-048',tab:'month',target:'#monthReviewConfirm'},
  {id:'MONTH-049',tab:'month',target:'#txSearch'},
  {id:'PAY-079',tab:'pay',target:'#salaryAddClose'},
  {id:'PAY-080',tab:'pay',target:'#menuLayer.show'},
  {id:'PAY-081',tab:'pay',target:'#monthPickerCancel'},
  {id:'PAY-082',tab:'pay',target:'#menuLayer.show'},
  {id:'PAYMENTS-088',tab:'payments',target:'#menuLayer.show'},
  {id:'PAYMENTS-089',tab:'payments',target:'#monthPickerCancel'},
  {id:'PAYMENTS-090',tab:'payments',target:'#mm3AtfClose'},
  {id:'PAYMENTS-091',tab:'payments',target:'#txSearch'},
  {id:'PAYMENTS-092',tab:'payments',target:'#qcbCancel'},
  {id:'ASSETS-101',tab:'assets',target:'#menuLayer.show'},
  {id:'ASSETS-103',tab:'assets',target:'#menuLayer.show'},
  {id:'ASSETS-104',tab:'assets',target:'#pushLayer .push-view.show'},
  {id:'SET-105',tab:'settings',target:'#prCancel'},
  {id:'BACKUP-210',tab:'settings',setup:'openDataSettings',target:'#deleteConfirmPhrase',requireDisabled:'#deleteConfirmProceed'},
  {id:'EVENT-232',tab:'month',before:['#monthEventGoals'],target:'#eventGoalCancel'},
  {id:'EVENT-237',tab:'month',before:['#monthEventGoals','#eventGoalAdd'],target:'#goalItemCancel'},
  {id:'REPEAT-299',tab:'home',before:['#todayRepeat'],target:'#sheet:not(.show)'},
  {id:'PICKER-125',tab:'pay',before:['#mm3SalaryMonth'],target:'#sheet:not(.show)'},
  {id:'BANK-147',tab:'home',before:['#quickBank'],target:'#sheet:not(.show)'},
  {id:'BANK-149',tab:'home',before:['#quickIncome'],target:'#sheet:not(.show)'},
  {id:'SALARYEDIT-189',tab:'payments',before:['#mm3PaymentQuickBilling'],target:'#sheet:not(.show)'},
];
for(const item of cases)if(!byID.has(item.id))throw Error('Unknown source control: '+item.id);

function financialSnapshot(obj){
 return Object.fromEntries(financeFields.filter(x=>x in obj).map(key=>[key,obj[key]]))
}
function targetVisible(page,selector){
 // Must be shown to a user, except explicit closed-state checks.
 if(selector==='#sheet:not(.show)')return page.locator('#sheet').evaluate(e=>!e.classList.contains('show'));
 return page.locator(selector).first().isVisible();
}
export async function verifyPerControlActions({createPage,passed,root}){
 const entries=[];
 for(const item of cases){
   const entry={id:item.id,tab:item.tab,selector:byID.get(item.id).domIdentifier,target:item.target,
     verdict:'unverified',problem:'',clicked:false,financeUnchanged:false,afterVisible:false};
   let session;
   try{
     session=await createPage('app',{width:393,height:852,mobile:true,appearance:'light'});
     const {page}=session;
     await page.evaluate(tab=>globalThis.__mm3Test.switchTab(tab),item.tab);
     if(item.setup)await page.evaluate(name=>globalThis.__mm3Test[name](),item.setup);
     for(const sel of item.before||[]) {
       const el=page.locator(sel).first();
       await el.click({timeout:4500});
       await page.waitForTimeout(90);
     }
     const before=financialSnapshot(await page.evaluate(()=>globalThis.__mm3Test.getData()));
     const clickable=page.locator('#'+byID.get(item.id).domIdentifier).first();
     const bbox=await clickable.boundingBox();
     if(!bbox||bbox.width<43.5||bbox.height<43.5)throw Error('control not visible or target below 44px');
     entry.beforeBounds={width:+bbox.width.toFixed(1),height:+bbox.height.toFixed(1)};
     const beforeTarget=await targetVisible(page,item.target);
     entry.beforeTargetVisible=beforeTarget;
     await clickable.click({timeout:4500});
     entry.clicked=true;
     await page.locator('.busy-overlay.show').waitFor({state:'hidden',timeout:10000});
     await page.waitForTimeout(130);
     entry.afterVisible=await targetVisible(page,item.target);
     if(item.requireDisabled&&!await page.locator(item.requireDisabled).isDisabled())throw Error('expected follow-up confirmation to be disabled');
     const after=financialSnapshot(await page.evaluate(()=>globalThis.__mm3Test.getData()));
     entry.financeUnchanged=JSON.stringify(before)===JSON.stringify(after);
     // For closed-state checks, beforeTarget must be false. For other routes,
     // a visible expected UI is sufficient only when it was not already there.
     if(!entry.afterVisible)throw Error('expected destination not visible after tap');
     if(beforeTarget)throw Error('destination was already visible BEFORE click');
     if(!entry.financeUnchanged)throw Error('a supposedly safe navigation altered financial records');
     entry.verdict='verified_safe_transition';
   }catch(error){entry.problem=String(error).slice(0,290)}
   finally{if(session)await session.context.close()}
   entries.push(entry);
 }
 const verified=entries.filter(x=>x.verdict==='verified_safe_transition');
 const summary={denominator:304,requiredFor90:274,attempted:entries.length,
   verified:verified.length,failed:entries.length-verified.length,
   qualifier:'Only this precisely observed safe transition is verified. Edit, persistence, VoiceOver, gesture and 200% dynamic text are not covered.',
   controls:entries};
 mkdirSync(resolve(root,'test-results'),{recursive:true});
 writeFileSync(resolve(root,'test-results/phase8-action-evidence.json'),JSON.stringify(summary,null,2));
 assert.equal(new Set(entries.map(x=>x.id)).size,entries.length);
 // Count successes only when expected route AND absence of financial changes
 // are both proven. There is no minimum that can turn a failed case into PASS.
 passed('Per-ID safe transition evidence recorded for '+verified.length+'/'+entries.length+' attempted controls (not all 304)');
 return summary
}
