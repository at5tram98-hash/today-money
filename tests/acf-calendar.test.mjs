import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const refinement=read('src/js/17-acf-refinements.js');
const formatNames=['formatAcfIncome','formatAcfOutflow','formatAcfAvailable','acfNegativeMoneyHtml','acfTableValueHtml','acfTableHtml'];
const formatting=parse(refinement,{ecmaVersion:'latest'}).body.filter(node=>node.type==='FunctionDeclaration'&&formatNames.includes(node.id.name)).map(node=>refinement.slice(node.start,node.end)).join('\n');
const helpers=[['src/js/11-home-and-month.js','daysInMonth'],['src/js/06-acf-views.js','acfImportantRows']].map(([path,name])=>{const text=read(path),node=parse(text,{ecmaVersion:'latest'}).body.find(node=>node.type==='FunctionDeclaration'&&node.id.name===name);return text.slice(node.start,node.end)}).join('\n');
const source=read('src/js/00-data-model.js')+'\n'+helpers+'\n'+read('src/js/acf-calendar.js')+'\n'+formatting;
function evaluate(code){return vm.runInNewContext(source+'\n'+code,{icon:()=>''});}

test('ACF table and calendar share every field without changing forecast rows',()=>{
  const result=evaluate(`(()=>{
    const row={date:'2026-12-31',important:true,openingBalance:12000,income:1234,totalCardPayment:5600,mandatoryOutflow:6100,cardPayment:5600,cashHeadroom:-2300,flexibleCash:876,safeCashBudgetRemaining:345,safeCreditBudgetRemaining:456,safeBudgetRemaining:801,forecastBalance:-5432,headroom:-20432,salary:true,events:[]};
    const f={rows:[row],firstNegativeDate:row.date},before=JSON.stringify(f),table=acfTableHtml(f,false,'2026-12'),calendar=acfCalendarHtml(f,false,'2026-12',row.date);
    return {unchanged:before===JSON.stringify(f),fields:ACF_DAY_FIELDS.map(([label,key,kind])=>({label,key,value:acfDisplayValue(row,key),formatted:acfTableValueHtml(kind,acfDisplayValue(row,key))})),table,calendar};
  })()`);
  assert.equal(result.unchanged,true);
  assert.equal(result.fields.length,11);
  assert.equal(result.fields.find(field=>field.key==='otherMandatory').value,500);
  const plain=html=>html.replace(/<[^>]*>/g,'');
  for(const field of result.fields){assert.ok(result.table.includes(field.label));assert.ok(result.calendar.includes(field.label));assert.ok(plain(result.table).includes(plain(field.formatted)));assert.ok(plain(result.calendar).includes(plain(field.formatted)));}
  assert.ok(result.calendar.includes('−¥5,432'));assert.ok(result.calendar.includes('acf-calendar-day deficit'));
});

test('calendar dates keep their weekday positions across year and leap-month boundaries',()=>{
  const result=evaluate(`['2026-12','2027-01','2028-02'].map(month=>{
    const rows=Array.from({length:daysInMonth(month)},(_,index)=>({date:month+'-'+pad(index+1),forecastBalance:1000,events:[]}));
    return {month,days:rows.length,first:parseYmd(month+'-01').getDay(),html:acfCalendarHtml({rows},false,month,rows[0].date)};
  })`);
  for(const month of result){
    assert.equal((month.html.match(/data-acf-select=/g)||[]).length,month.days);
    const beforeFirst=month.html.split('data-acf-select=')[0];
    assert.equal((beforeFirst.match(/acf-calendar-spacer/g)||[]).length,month.first);
  }
  assert.equal(result[2].days,29);
});

test('important-day filtering never invents balances for excluded or unavailable days',()=>{
  const result=evaluate(`(()=>{
    const f={rows:[{date:'2027-01-08',forecastBalance:1000,important:false},{date:'2027-01-10',forecastBalance:-250,important:true}]};
    return {selected:acfCalendarSelection(f,true,'2027-01','2027-01-08'),html:acfCalendarHtml(f,true,'2027-01','2027-01-10'),empty:acfCalendarSelection(f,true,'2027-02','2027-01-10')};
  })()`);
  assert.equal(result.selected,'2027-01-10');assert.equal(result.empty,'');
  assert.equal((result.html.match(/data-acf-select=/g)||[]).length,1);
  assert.ok(result.html.includes('data-acf-select="2027-01-10"'));
  assert.ok(!result.html.includes('data-acf-select="2027-01-08"'));
});
