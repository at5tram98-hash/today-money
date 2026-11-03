import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';

const text=readFileSync(new URL('../src/js/07-navigation.js',import.meta.url),'utf8');
const names=['pruneRetiredPushViews','pushView','popView','replaceTopPush'];
const source=parse(text,{ecmaVersion:'latest'}).body.filter(node=>node.type==='FunctionDeclaration'&&names.includes(node.id.name)).map(node=>text.slice(node.start,node.end)).join('\n');
function navigation(){
  const elements=new Map();let sequence=0;
  const make=()=>({id:'',style:{},className:'',classList:{add(){},remove(){}},querySelector:()=>({onclick:null}),setAttribute(){},remove(){elements.delete(this.id)}});
  const context=vm.createContext({document:{createElement:make,getElementById:id=>id==='pushLayer'?{appendChild:element=>elements.set(element.id,element)}:elements.get(id),querySelectorAll:()=>[...elements.values()]},pushStack:[],uid:()=>String(++sequence),esc:String,activeTab:'today',goalPlannerState:null,icon:()=>'',requestAnimationFrame:callback=>callback(),setTimeout:()=>0,installInteractiveBack:()=>{}});
  vm.runInContext(source,context);return code=>vm.runInContext(code,context);
}
test('returning an assigned event handler from a legacy binder never invokes it on Back',()=>{
  const run=navigation();
  assert.equal(run(`let calls=0;pushView('記録','',root=>root.querySelector('button').onclick=()=>calls++);popView();calls`),0);
  assert.equal(run('pushStack.length'),0);
});
test('explicit owned resources are disposed once when a view is popped or replaced',()=>{
  const run=navigation();
  run(`let disposed=0;pushView('プレビュー','',root=>{root.__dispose=()=>disposed++});popView();popView()`);
  assert.equal(run('disposed'),1);
  run(`pushView('スナップショット','',root=>{root.__dispose=()=>disposed++});replaceTopPush('次の画面','')`);
  assert.equal(run('disposed'),2);assert.equal(run('pushStack.length'),1);
});
test('new navigation removes only retired animation views and preserves the live stack',()=>{
  const run=navigation();
  run(`pushView('親','');pushView('戻る画面','');popView();pushView('新しい画面','')`);
  assert.equal(run('document.querySelectorAll().length'),2);assert.equal(run('pushStack[0].title'),'親');
  assert.equal(run('pushStack[1].title'),'新しい画面');
});

test('original five tabs and today/month mode stay in their familiar locations',()=>{
  const html=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
  assert.deepEqual([...html.matchAll(/data-tab="([^"]+)"/g)].map(m=>m[1]),['home','pay','payments','assets','settings']);
  const accessibility=readFileSync(new URL('../src/js/24-accessibility.js',import.meta.url),'utf8');
  assert.ok(accessibility.includes("[['today','今日'],['month','今月']]"));
  const settings=readFileSync(new URL('../src/js/settings.js',import.meta.url),'utf8');
  assert.ok(!settings.includes('finance-pay'));
  assert.ok(!settings.includes('allFeatures'));
});
