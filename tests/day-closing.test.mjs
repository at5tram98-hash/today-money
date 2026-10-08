import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {read} from '../scripts/build.mjs';

function fixture(){
  const clock={now:Date.parse('2026-10-07T12:00:00Z')};
  class ClockDate extends Date{constructor(...args){super(...(args.length?args:[clock.now]))}static now(){return clock.now}}
  const context=vm.createContext({Date:ClockDate,console,clock});
  vm.runInContext(read('src/js/00-data-model.js')+`
    let data=normalizeData({transactions:[
      {id:'ordinary',date:'2026-10-07',amount:1001,category:'食費',merchant:'店',paymentMethod:'other'},
      {id:'mail-tx',date:'2026-10-07',amount:300,category:'食費',merchant:'メール店',source:'gmail',mailImportId:'mail',paymentMethod:'card',paymentId:'card'},
      {id:'refund',date:'2026-10-07',amount:-100,category:'その他',merchant:'返金',paymentMethod:'other'}
    ],incomes:[{id:'income',date:'2026-10-07',amount:3000,sourceName:'売上',toType:'cash',receivedConfirmed:true}],
    banks:[{id:'bank',name:'銀行',balance:9000,balanceAsOf:'2026-10-06T00:00:00Z'}],cards:[{id:'card',name:'カード'}],
    mailImports:[{id:'mail',date:'2026-10-07',amount:300,merchant:'メール店',status:'imported',transactionId:'mail-tx'}],dailyCorrections:{'2026-10-07':900}});
    let allowed=false,mm3PendingAsyncCommit=false;
    function requireStateCommit(){if(!allowed)throw new Error('outside commit')}
    function safeCommit(fn){allowed=true;try{return fn()}finally{allowed=false}}
  `+read('src/js/03-ledger.js')+read('src/js/day-closing.js')+`
    function reviewed(date='2026-10-07'){
      const items=dayClosingReviewItems(date);
      return {date,signature:dayClosingApprovalSignature(date),checks:Object.fromEntries(Object.values(items).flat().map(x=>[x.key,x.fingerprint])),emptyGroups:Object.keys(items).filter(k=>!items[k].length)};
    }
    function financial(){const copy=clone(data);delete copy.dayClosings;return JSON.stringify(copy)}
    function approve(review=reviewed()){safeCommit(()=>recordDayClosing('2026-10-07',{review}))}
  `,context);
  return{run:code=>vm.runInContext(code,context),clock};
}

test('approval preserves all ledger fields and captures corrected totals, refunds, income and bank evidence',()=>{
  const f=fixture(),before=f.run('financial()');f.run('approve()');assert.equal(f.run('financial()'),before);
  assert.equal(f.run("data.dayClosings['2026-10-07'].snapshot.total"),900);
  assert.equal(f.run("data.dayClosings['2026-10-07'].snapshot.rawTotal"),1201);
  assert.equal(f.run("data.dayClosings['2026-10-07'].snapshot.incomeTotal"),3000);
  assert.equal(f.run("data.dayClosings['2026-10-07'].snapshot.net"),2100);
  assert.equal(f.run("data.dayClosings['2026-10-07'].snapshot.bankTotal"),9000);
  assert.equal(f.run("dayClosingStatus('2026-10-07')"),'closed');
  assert.throws(()=>f.run("recordDayClosing('2026-10-07',{review:reviewed()})"),/outside commit/);
});

test('missing checks, unchecked empty groups and pending dated or undated mail cannot be approved',()=>{
  const f=fixture();assert.throws(()=>f.run('approve({})'),/未照合/);
  f.run("let review=reviewed();delete review.checks['income:income']");assert.throws(()=>f.run('approve(review)'),/未照合/);
  f.run("data.mailImports.push({id:'pending',status:'pending',date:'2026-10-07',amount:10})");assert.throws(()=>f.run('approve()'),/未照合/);
  f.run("data.mailImports.pop();data.mailImports.push({id:'unknown',status:'pending',date:'',amount:10})");assert.throws(()=>f.run('approve()'),/未照合/);
  f.run("data.mailImports=[];data.transactions=[];data.incomes=[];data.banks=[];review=reviewed();review.emptyGroups=[]");assert.throws(()=>f.run('approve(review)'),/未照合/);
  f.run('approve()');assert.equal(f.run("dayClosingStatus('2026-10-07')"),'closed');
});

test('a stale approval cannot accept edited amounts, new rows, bank changes or altered mail resolution',()=>{
  for(const mutation of ["data.transactions[0].amount=1002","data.incomes[0].amount=3001","data.banks[0].balance=8999","data.mailImports[0].status='ignored'","data.transactions.push({...data.transactions[0],id:'new'})","data.dailyCorrections['2026-10-07']=901"]){
    const f=fixture();f.run('let stale=reviewed()');f.run(mutation);assert.throws(()=>f.run('approve(stale)'),/未照合/);assert.equal(f.run('Object.keys(data.dayClosings).length'),0);
  }
});

test('later edits require re-closing without rewriting an approved snapshot; next-day bank movement leaves history intact',()=>{
  const f=fixture();f.run('approve()');const approved=f.run("JSON.stringify(data.dayClosings['2026-10-07'].snapshot)");
  f.run('data.transactions[0].amount=1002');assert.equal(f.run("dayClosingStatus('2026-10-07')"),'changed');assert.equal(f.run("JSON.stringify(data.dayClosings['2026-10-07'].snapshot)"),approved);
  f.run('data.transactions[0].amount=1001;data.banks[0].balance=9001');assert.equal(f.run("dayClosingStatus('2026-10-07')"),'changed');
  f.clock.now=Date.parse('2026-10-08T12:00:00Z');assert.equal(f.run("dayClosingStatus('2026-10-07')"),'closed');
});

test('mail rows are classified once while manual, statement and refund rows retain signed ledger values',()=>{
  const f=fixture();assert.equal(f.run("dayClosingReviewItems('2026-10-07').mail.length"),1);assert.equal(f.run("dayClosingReviewItems('2026-10-07').ordinary.length"),2);
  f.run("data.transactions.push({id:'statement',date:'2026-10-07',source:'card_statement',amount:400});data.mailImports.push({id:'linked',date:'2026-10-07',status:'imported',transactionId:'statement'})");
  assert.equal(f.run("dayClosingReviewItems('2026-10-07').mail.length"),2);assert.equal(f.run("dayClosingReviewItems('2026-10-07').ordinary.length"),2);f.run('approve()');assert.equal(f.run("data.dayClosings['2026-10-07'].snapshot.rawTotal"),1601);
});

test('seven calendar days are retained across month boundaries and expiry never deletes financial records',()=>{
  const f=fixture();assert.equal(f.run("JSON.stringify(Object.keys(retainedDayClosings({'2026-09-24':{},'2026-09-25':{},'2026-10-01':{},'2026-10-02':{},invalid:{}},'2026-10-01')))"),'["2026-09-25","2026-10-01"]');
  f.run("data.dayClosings={'2026-09-30':{closedAt:'old'},'2026-10-01':{closedAt:'keep'},'2026-10-07':{closedAt:'today'}}");const before=f.run('financial()');assert.equal(f.run('pruneDayClosingJournal()'),true);assert.equal(f.run('financial()'),before);assert.equal(f.run('Object.keys(data.dayClosings).length'),2);
  assert.equal(f.run("Object.keys(normalizeData({...data,dayClosings:{'2026-09-30':{},'2026-10-07':{status:'closed'}}}).dayClosings).length"),1);
  assert.throws(()=>f.run("safeCommit(()=>recordDayClosing('2026-09-30',{review:reviewed('2026-09-30')}))"),/7日/);
});

test('closing is gated at exactly 18:00 Tokyo time, while earlier dates remain available',()=>{
  const f=fixture();f.clock.now=Date.parse('2026-10-07T08:59:59.999Z');
  assert.equal(f.run("dayClosingAvailable('2026-10-07')"),false);
  assert.equal(f.run("dayClosingAvailable('2026-10-06')"),true);
  assert.equal(f.run("dayClosingAvailable('invalid')"),false);
  assert.throws(()=>f.run('approve()'),/18:00/);assert.equal(f.run('Object.keys(data.dayClosings).length'),0);
  f.clock.now=Date.parse('2026-10-07T09:00:00Z');f.run('approve()');
  assert.equal(f.run("dayClosingStatus('2026-10-07')"),'closed');
});
test('cancellation requires deliberate confirmation and preserves approval evidence and every ledger field',()=>{
  const f=fixture();f.run('approve();let expectedRecord=JSON.stringify(data.dayClosings["2026-10-07"]);let options={expectedRecord,reason:"誤って承認した",acknowledged:true,confirmation:"取消"}');
  const before=f.run('financial()'),snapshot=f.run('JSON.stringify(data.dayClosings["2026-10-07"].snapshot)');
  for(const patch of ['acknowledged:false','confirmation:""','reason:""'])assert.throws(()=>f.run(`safeCommit(()=>cancelDayClosing('2026-10-07',{...options,${patch}}))`),/最終確認/);
  assert.throws(()=>f.run("cancelDayClosing('2026-10-07',options)"),/outside commit/);
  f.run("safeCommit(()=>cancelDayClosing('2026-10-07',options))");
  assert.equal(f.run('financial()'),before);assert.equal(f.run('JSON.stringify(data.dayClosings["2026-10-07"].snapshot)'),snapshot);
  assert.equal(f.run("dayClosingStatus('2026-10-07')"),'cancelled');
  assert.equal(f.run("dayClosingLabel('2026-10-07')"),'取消済');
  assert.throws(()=>f.run("safeCommit(()=>cancelDayClosing('2026-10-07',options))"),/記録が変わりました/);
  f.run('approve()');assert.equal(f.run('data.dayClosings["2026-10-07"].history.at(-1).cancellationReason'),'誤って承認した');assert.equal(f.run('financial()'),before);
});
test('cancellation rejects stale approvals, times before the cutoff and expired journal dates',()=>{
  const f=fixture();f.run('approve();let options={expectedRecord:JSON.stringify(data.dayClosings["2026-10-07"]),reason:"誤って承認した",acknowledged:true,confirmation:"取消"}');
  f.clock.now=Date.parse('2026-10-07T08:59:59Z');assert.throws(()=>f.run("safeCommit(()=>cancelDayClosing('2026-10-07',options))"),/18:00/);
  f.clock.now=Date.parse('2026-10-07T12:00:01Z');f.run('approve()');assert.throws(()=>f.run("safeCommit(()=>cancelDayClosing('2026-10-07',options))"),/記録が変わりました/);
  f.clock.now=Date.parse('2026-10-14T12:00:00Z');assert.throws(()=>f.run("safeCommit(()=>cancelDayClosing('2026-10-07',options))"),/7日/);
});
