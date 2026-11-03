import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function declaration(path,name){const source=read(path);const node=parse(source,{ecmaVersion:'latest'}).body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);return source.slice(node.start,node.end)}
function engine(){
  const context=vm.createContext({});
  vm.runInContext(`
    let acfForecastCache=null,builds=0;
    const ymd=()=> '2026-11-03';
    const acfDefaultSettings=()=>({reserveFloor:0,creditFallbackEnabled:false});
    const buildAcfBaseContext=options=>{builds++;return {dates:[ymd()],start:ymd(),end:ymd(),budgetEnd:options.budgetEnd||ymd(),baseRows:[]}};
    const acfBuildOptimizedFlexiblePlan=()=>({rows:[{date:ymd(),flexibleTotal:7}]});
    const acfPlanWithStoredGoals=()=>({hasStored:false});
    const simulateCombinedSpend=()=>({maxTotal:100,cash:100,credit:0});
    const buildForecastPure=input=>({max:input.combined.maxTotal,budgetEnd:input.ctx.budgetEnd});
    const totalDeposits=()=>100, dailyGoal=()=>({}),dayGoalForMonth=()=>0,spentDate=()=>0,monthEndDate=()=>ymd(),acfAllowedCategorySummary=()=>'';
    const getForecastRiskCore=()=>[],getForecastConfidence=()=>({});
    ${declaration('src/js/05-acf-engine.js','buildCashFlowForecastCore')}
  `,context);
  return code=>vm.runInContext(code,context);
}
test('a lightweight forecast cannot poison the full maximum-spend calculation in either order',()=>{
  for(const first of [true,false]){
    const run=engine();
    assert.equal(run(`buildCashFlowForecastCore({lightweight:${first}}).max`),first?7:100);
    assert.equal(run(`buildCashFlowForecastCore({lightweight:${!first}}).max`),first?100:7);
    const builds=run('builds');run(`buildCashFlowForecastCore({lightweight:${!first}})`);
    assert.equal(run('builds'),builds,'identical requests still reuse the cache');
  }
});
test('a custom budget end and optional purchases never reuse or replace the default forecast',()=>{
  const run=engine();run('buildCashFlowForecastCore()');
  assert.equal(run("buildCashFlowForecastCore({budgetEnd:'2026-11-20'}).budgetEnd"),'2026-11-20');
  assert.equal(run('buildCashFlowForecastCore().budgetEnd'),'2026-11-03');
  assert.equal(run('builds'),2);
  run('buildCashFlowForecastCore({includeOptional:true})');assert.equal(run('builds'),3);
  run('buildCashFlowForecastCore()');assert.equal(run('builds'),3);
});
test('six installments remain in the safety horizon through the final withdrawal',()=>{
  const result=vm.runInNewContext(read('src/js/00-data-model.js')+`
    const data={cards:[{id:'c',closingDay:31}],fixedPayments:[],largeExpensePlans:[{id:'p',status:'planned',priority:'required',date:'2026-11-08',atfInstallments:{c:6}}]};
    const acfDefaultSettings=()=>({includeRequiredLargeExpenses:true,creditFallbackEnabled:false});
    const acfVisibleEnd=()=> '2027-01-31';
    const acfCardBillingAmount=()=>0;
    const cardBillingMonthForPurchase=()=> '2026-12';
    const acfEffectiveCardPaymentDate=(card,month)=>month+'-27';
    const acfPlansWithScenario=plans=>plans;
    const largeExpensePendingParts=()=>[{paymentMethod:'card',paymentId:'c'}];
    const cardById=()=>data.cards[0];
    ${declaration('src/js/04-acf-context.js','acfHorizonEnd')}
    acfHorizonEnd({start:'2026-11-03'})
  `);
  assert.equal(result,'2027-05-27');
});
