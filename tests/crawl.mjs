/* 全画面巡回の検査。
   304操作の識別子と各画面の操作要素を実際に押して辿り、到達した全状態で
   ・横方向のはみ出し ・44×44pt未満の操作要素 ・読み上げ名のない操作要素 ・JavaScriptエラー
   を検査する。MM3_BASELINE_DIR を指定すると、同じ操作を旧ビルドにも行い、
   全要素の算出スタイルが一致することを確認する（CSSの書き直しの検証用）。 */
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, baselineRoot, operations, createPage, settle, reset, openScreen, closeHarness} from './v11-harness.mjs';

const maxDepth=Number(process.env.MM3_CRAWL_DEPTH||5);
const configs=(process.env.MM3_CRAWL_CONFIGS||'393-light,320-dark,320-light,393-dark').split(',').map(x=>{const [width,appearance]=x.split('-');return{width:Number(width),appearance}});
const diffStyles=(a,b)=>{
  const out=[];
  for(let i=0;i<a.length&&out.length<12;i++){
    for(let k=1;k<4;k++)if(a[i][k]!==b[i][k]){
      const pa=a[i][k].split(';'),pb=b[i][k].split(';'),changed=[];
      for(let j=0;j<Math.max(pa.length,pb.length);j++)if(pa[j]!==pb[j])changed.push(`${pa[j]} → ${(pb[j]||'').split(':').slice(1).join(':')}`);
      out.push(`${a[i][0]}${['','::before','::after'][k-1]}: ${changed.slice(0,4).join(' | ')}`);
    }
  }
  return out;
};

const elementSet=process.env.MM3_CRAWL_ELEMENTS?new Set():null,motionMode=!!process.env.MM3_CRAWL_MOTION;
const tabs=['today','day','month','pay','payroot','payments','assets','settings'];
const routes=JSON.parse(readFileSync(resolve(root,'docs/v11/screen-routes.json'),'utf8'));
// 画面を直接開く入口（元の監査の75画面と前提状態）。タブからの巡回だけでは届かない段階や編集画面へ到達する
const seeds=[...routes.screens.filter(s=>s.setup),...routes.preconditions].map(s=>({tab:s.tab,setup:s.setup,patch:s.patch||null,name:s.name,path:s.path.map(selector=>({id:'*'+selector,selector}))}));
// 同じ流れの中で繰り返し押す「次へ」。押す前に、その段階の確認チェックを付ける
const repeatable=new Set(['GOAL-015','DAYCLOSE-140','DAYCLOSE-145']);
const press=async(page,step)=>{if(repeatable.has(step.id))await page.evaluate(()=>{for(let n=0;n<30;n++){const box=globalThis.__crawl.layer().querySelector('[data-close-key]:not(:checked),[data-empty-group]:not(:checked),input[type=checkbox]:not(:checked)');if(!box)break;box.click()}});const ok=await page.evaluate(sel=>globalThis.__crawl.click(sel),step.selector);await settle(page);return ok};
const report={configs:[],reached:{},behaviour:{},paths:{},seedsOpened:{},inventory:{},motion:{},issues:{small:{},unnamed:{},overflow:{},overlaps:{},smallText:{},styleDiffs:{},structure:{},errors:[]},states:0};
const note=(bucket,key,where)=>{(report.issues[bucket][key]??=[]).push(where)};
try{
  for(const config of configs){
    const label=`${config.width}-${config.appearance}`,candidate=await createPage('app',config),baseline=baselineRoot?await createPage('baseline',config):null,pages=[candidate,baseline].filter(Boolean);
    const selectors=operations.map(o=>[o.id,o.selector]),visited=new Set(),signatures=new Set(),queue=[...tabs.map(tab=>({tab,path:[]})),...seeds.map(s=>({...s}))];let states=0;
    while(queue.length){
      const state=queue.shift(),where=`${label} ${state.tab}${state.setup?` [${state.name}]`:''}${state.path.map(s=>' > '+s.id).join('')}`;
      let ok=true,before=null;
      for(const p of pages){
        if(!await openScreen(p.page,{tab:state.tab,setup:state.setup,patch:state.patch,path:[]})){ok=false;break}
        for(const [index,step] of state.path.entries()){
          if(index===state.path.length-1&&p===candidate)before=await p.page.evaluate(()=>({data:JSON.stringify(globalThis.__mm3Test.getData()),layer:globalThis.__crawl.signature()}));
          if(!await press(p.page,step)){ok=false;break}
        }
        if(!ok)break;
      }
      if(!ok)continue;
      const signature=state.tab+'|'+await candidate.page.evaluate(()=>globalThis.__crawl.signature());
      if(state.path.length&&signatures.has(signature)&&!state.path.at(-1).id.match(/^[A-Z]+-\d+$/))continue;
      if(state.setup&&!state.path.length)report.seedsOpened[state.name]=true;
      signatures.add(signature);states++;if(states%100===0)console.log(`  ${label}: ${states} states, ${queue.length} queued`);
      if(state.path.length){
        const id=state.path.at(-1).id;
        if(/^[A-Z]+-\d+$/.test(id)){
          (report.reached[id]??=[]).push(label);report.paths[id]??={tab:state.tab,setup:state.setup||null,path:state.path.map(s=>s.selector)};
          if(before&&!report.behaviour[id]){
            const after=await candidate.page.evaluate(()=>({data:JSON.stringify(globalThis.__mm3Test.getData()),layer:globalThis.__crawl.signature(),confirm:!!document.querySelector('#alertWrap.show')}));
            const changedKeys=after.data===before.data?[]:(()=>{const x=JSON.parse(before.data),y=JSON.parse(after.data);return Object.keys({...x,...y}).filter(k=>JSON.stringify(x[k])!==JSON.stringify(y[k]))})();
            report.behaviour[id]={changedKeys,wroteData:after.data!==before.data,layerChanged:after.layer!==before.layer,askedConfirmation:after.confirm,path:where};
            // 確定操作: 同じ操作を連続2回押しても1回分しか保存されない
            const op=operations.find(o=>o.id===id);
            if(op.kind==='確定'&&after.data!==before.data){
              let replay=await openScreen(candidate.page,{tab:state.tab,setup:state.setup,patch:state.patch,path:[]});
              for(const [index,step] of state.path.entries()){
                if(!replay)break;
                if(index===state.path.length-1){replay=await candidate.page.evaluate(sel=>{const el=document.querySelector(sel);if(!el)return false;el.click();el.click();return true},step.selector);await settle(candidate.page)}
                else replay=await press(candidate.page,step);
              }
              const shape=text=>{const d=JSON.parse(text),out={};for(const [k,v] of Object.entries(d))out[k]=Array.isArray(v)?v.length:v&&typeof v==='object'?Object.keys(v).length:v;out.__balances=(d.banks||[]).map(b=>b.balance);out.__amounts=(d.transactions||[]).map(x=>x.amount);return JSON.stringify(out)};
              if(replay){const twice=await candidate.page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));report.behaviour[id].doubleTapIdempotent=shape(twice)===shape(after.data)}
              await openScreen(candidate.page,{tab:state.tab,setup:state.setup,patch:state.patch,path:[]});for(const step of state.path)await press(candidate.page,step);
            }
          }
        }
      }
      const audit=await candidate.page.evaluate(()=>globalThis.__crawl.audit());
      for(const x of audit.smallText)note('smallText',x,where);for(const x of audit.inventory)report.inventory[x]=(report.inventory[x]||0)+1;
      if(motionMode)for(const [k,v] of Object.entries(await candidate.page.evaluate(()=>globalThis.__crawl.motion())))report.motion[k]??={...v,where};
      for(const x of audit.overlaps)note('overlaps',x,where);
      for(const x of audit.small)note('small',x,where);for(const x of audit.unnamed)note('unnamed',x,where);if(audit.overflow)note('overflow',`${audit.overflow}px`,where);
      if(elementSet)for(const e of await candidate.page.evaluate(()=>[...new Set([...document.querySelectorAll('*')].map(el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(typeof el.className==='string'&&el.className.trim()?'.'+el.className.trim().split(/\s+/).join('.'):'')))]))elementSet.add(e);
      if(baseline){
        const read=()=>Promise.all([baseline.page.evaluate(()=>globalThis.__crawl.styles()),candidate.page.evaluate(()=>globalThis.__crawl.styles())]);
        let [a,b]=await read();
        // 片方だけ後片付けが終わっていない場合があるので、要素の並びが違うときは少し待って読み直す
        if(a.length!==b.length||a.some((row,i)=>row[0]!==b[i][0])){await candidate.page.waitForTimeout(500);[a,b]=await read()}
        if(a.length!==b.length)note('structure',`${a.length} → ${b.length}`,where);
        else{
          // 状態クラスが一時的に違う要素（押下中など）だけを除き、残りの全要素を比較する
          const same=a.map((row,i)=>row[0]===b[i][0]),skipped=same.filter(x=>!x).length;
          if(skipped>a.length*.02)note('structure',`${skipped} of ${a.length} elements differ in class`,where);
          report.comparedElements=(report.comparedElements||0)+a.length-skipped;report.skippedElements=(report.skippedElements||0)+skipped;
          for(const d of diffStyles(a.filter((_,i)=>same[i]),b.filter((_,i)=>same[i])))note('styleDiffs',d,where);
        }
      }
      const depth=state.path.filter(s=>!repeatable.has(s.id)).length+(state.setup?1:0);
      if(depth<maxDepth&&state.path.length<12){
        const next=await candidate.page.evaluate(([selectors,generic])=>globalThis.__crawl.targets(selectors,generic),[selectors,state.setup?0:[40,12,0,0,0,0][depth]||0]);
        for(const target of next){
          const again=state.path.filter(s=>s.id===target.id).length,key=target.id.startsWith('*')?`${state.tab}|${state.name||''}|${state.path.map(s=>s.id).join('>')}|${target.id}`:repeatable.has(target.id)?`${state.name||state.tab}|${target.id}@${again}`:target.id;
          if(again>7)continue;
          if(visited.has(key))continue;visited.add(key);queue.push({tab:state.tab,setup:state.setup,patch:state.patch,name:state.name,path:[...state.path,target]});
        }
      }
    }
    for(const p of pages)for(const e of p.errors)report.issues.errors.push(`${label}: ${e.slice(0,200)}`);
    report.configs.push({label,states});report.states+=states;console.log(`crawled ${label}: ${states} states`);
    for(const p of pages)await p.context.close();
  }
}finally{await closeHarness()}

const count=o=>Object.keys(o).length,reachedIds=Object.keys(report.reached).length;
const readOnlyKinds=new Set(['取消','閉じる','戻る','画面へ移動','メニュー','検索','ホイール選択','分析画面への行入口','分析へ移動','危険操作','金額入力','グラフ表示メニュー入口','前月送り矢印','次月送り矢印','支払月ピッカー','残高反映オプション','バックアップ復元フローの入口','承認解除フローへの入口','残高履歴への行入口','台帳詳細への行入口','電卓の値適用ボタン','補助計算結果の適用ボタン','計算機キー群','最終承認スライド']);
// 表示の状態（通知の既読、今日／今月の表示モード）の保存は会計データの書き込みではない
const displayStateKeys=new Set(['notices','homeViewMode']);
report.violations={wroteOnTap:[],doubleSave:[]};
for(const [id,b] of Object.entries(report.behaviour)){const op=operations.find(o=>o.id===id);if(b.wroteData&&readOnlyKinds.has(op.kind)&&(b.changedKeys||['?']).some(k=>!displayStateKeys.has(k)))report.violations.wroteOnTap.push(`${id} ${op.label} (${op.kind})`);if(b.doubleTapIdempotent===false)report.violations.doubleSave.push(`${id} ${op.label}`)}
report.summary={states:report.states,wroteOnTap:report.violations.wroteOnTap.length,doubleSave:report.violations.doubleSave.length,operationsReached:reachedIds,operationsTotal:operations.length,notReached:operations.filter(o=>!report.reached[o.id]).map(o=>o.id),seedsOpened:count(report.seedsOpened),seedsTotal:seeds.length,small:count(report.issues.small),smallText:count(report.issues.smallText),overlaps:count(report.issues.overlaps),unnamed:count(report.issues.unnamed),overflow:count(report.issues.overflow),styleDiffs:count(report.issues.styleDiffs),structureMismatch:count(report.issues.structure),errors:[...new Set(report.issues.errors)].length};
mkdirSync(resolve(root,'test-results'),{recursive:true});
if(elementSet)writeFileSync(resolve(root,process.env.MM3_CRAWL_ELEMENTS),JSON.stringify([...elementSet].sort()));
writeFileSync(resolve(root,process.env.MM3_CRAWL_OUT||'test-results/crawl.json'),JSON.stringify(report,null,1));
console.log(JSON.stringify({...report.summary,notReached:report.summary.notReached.length},null,1));
if(process.env.MM3_CRAWL_STRICT){
  assert.deepEqual(report.violations,{wroteOnTap:[],doubleSave:[]},'表示・取消・確認の操作は保存せず、確定は二重に保存しない');
  assert.equal(report.summary.small,0,'操作要素は44×44pt以上');assert.equal(report.summary.unnamed,0,'操作要素に読み上げ名がある');
  assert.equal(report.summary.overflow,0,'横方向にはみ出さない');assert.equal(report.summary.overlaps,0,'操作要素が重ならない');assert.equal(report.summary.smallText,0,'11px未満の文字がない');assert.equal(report.summary.styleDiffs,0,'算出スタイルが基準と一致');assert.equal(report.summary.errors,0,'JavaScriptエラーなし');
}
