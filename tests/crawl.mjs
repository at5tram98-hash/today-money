/* 全画面巡回の検査。
   304操作の識別子と各画面の操作要素を実際に押して辿り、到達した全状態で
   ・横方向のはみ出し ・44×44pt未満の操作要素 ・読み上げ名のない操作要素 ・JavaScriptエラー
   を検査する。MM3_BASELINE_DIR を指定すると、同じ操作を旧ビルドにも行い、
   全要素の算出スタイルが一致することを確認する（CSSの書き直しの検証用）。 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync, statSync, mkdirSync, writeFileSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {chromium} from 'playwright';
import {build, root} from '../scripts/build.mjs';

if(!process.env.MM3_CRAWL_NO_BUILD)build();
const baselineRoot=process.env.MM3_BASELINE_DIR||'';
const candidateRoot=process.env.MM3_CANDIDATE_DIR||root;
const maxDepth=Number(process.env.MM3_CRAWL_DEPTH||5);
const configs=(process.env.MM3_CRAWL_CONFIGS||'393-light,320-dark,320-light,393-dark').split(',').map(x=>{const [width,appearance]=x.split('-');return{width:Number(width),appearance}});
const hook=`globalThis.__mm3Test={getData:()=>clone(data),replaceData:snapshot=>safeCommitAsync(()=>restoreDataSnapshot(normalizeData(snapshot))),switchTab,closeSheet,popView,closeCalc,closeMenu,renderAll,resetPlanner:()=>{goalPlannerState=null},seed:()=>safeCommitAsync(()=>{const bank=data.banks[0];recordExpense({amount:1234,date:ymd(),category:data.categories[0]?.name||'その他',merchant:'巡回検査の支出',paymentMethod:bank?'bank':'other',paymentId:bank?.id||'',respectBalanceAsOf:false,saveNow:false});if(Array.isArray(data.tags)&&!data.tags.length)data.tags.push({id:uid('tag'),name:'巡回検査',color:'#1673F7'})})};\n`;
const hookMarker='try{await saveAsync({snapshot:data})}catch';
const server=createServer((req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),base=pathname.startsWith('/baseline/')?baselineRoot:candidateRoot;
    if(!base)throw new Error('no baseline');
    let file=resolve(base,'.'+pathname.replace(/^\/(app|baseline)/,''));
    if(!file.startsWith(resolve(base)+'/')&&file!==resolve(base))throw new Error('invalid');
    if(statSync(file).isDirectory())file=resolve(file,'index.html');
    let text=extname(file)==='.png'?readFileSync(file):readFileSync(file,'utf8');
    if(file===resolve(base,'push-config.json'))text=JSON.stringify({apiBase:'',vapidPublicKey:''});
    if(typeof text==='string'&&text.includes(hookMarker))text=text.replace(hookMarker,hook+hookMarker);
    res.setHeader('Content-Type',{'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'}[extname(file)]||'text/plain');
    res.end(text);
  }catch{res.writeHead(404);res.end('Not found')}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.MM3_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-gpu','--no-zygote']});

const ledger=readFileSync(resolve(root,'docs/v11/operation-ids.json'),'utf8');
const operations=JSON.parse(ledger).map(o=>({...o,selector:o.dom.startsWith('[')?o.dom:o.dom.includes('${')?`[id^="${o.dom.split('${')[0]}"]`:`#${o.dom}`}));

async function createPage(version,{width,appearance}){
  const context=await browser.newContext({viewport:{width,height:width===320?568:852},isMobile:true,hasTouch:true,timezoneId:'Asia/Tokyo',colorScheme:appearance,reducedMotion:'reduce'});
  await context.route('https://accounts.google.com/**',route=>route.fulfill({body:'',contentType:'text/javascript'}));
  await context.addInitScript(()=>{
    const RealDate=Date;globalThis.__clock={now:new RealDate('2026-10-07T12:00:00Z').getTime()};
    globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[globalThis.__clock.now]))}static now(){return globalThis.__clock.now}};
    let seed=123456789;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
    window.print=()=>{};window.open=()=>null;try{Object.defineProperty(navigator,'share',{value:undefined,configurable:true});Object.defineProperty(navigator,'canShare',{value:undefined,configurable:true})}catch(e){}
    HTMLAnchorElement.prototype.click=function(){};HTMLInputElement.prototype.showPicker=function(){};
    const inputClick=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type==='file')return;return inputClick.call(this)};
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('dialog',d=>d.dismiss().catch(()=>{}));
  await page.goto(`${origin}/${version}/`);
  await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
  // 同じ初期データを両方のビルドで使う（現金・カード・取引のある状態）
  // 取引・タグが1件ずつある状態から始め、編集や削除の画面にも到達できるようにする
  await page.evaluate(async()=>{await globalThis.__mm3Test.seed();globalThis.__mm3Test.renderAll();globalThis.__original=JSON.stringify(globalThis.__mm3Test.getData())});
  return{page,context,errors};
}

/* ---- ページ内の補助関数 ---- */
const inPage=`
globalThis.__crawl={
  layer(){
    const shown=id=>{const el=document.getElementById(id);return el&&el.classList.contains('show')?el:null};
    const alert=shown('alertWrap');if(alert)return alert;
    const calc=shown('calculator');if(calc)return calc;
    const menu=shown('menuLayer');if(menu)return menu;
    const sheet=shown('sheet');if(sheet)return sheet;
    const views=[...document.querySelectorAll('#pushLayer .push-view.show')];if(views.length)return views.at(-1);
    return document.querySelector('.screen.active')||document.body;
  },
  visible(el){if(!el||!el.isConnected)return false;const r=el.getBoundingClientRect();if(r.width<=0||r.height<=0)return false;const s=getComputedStyle(el);return s.visibility!=='hidden'&&s.display!=='none'&&!el.closest('[hidden],[inert]')},
  path(el){const parts=[];for(let n=el;n&&n.nodeType===1&&n!==document.body;n=n.parentElement){let i=1;for(let s=n.previousElementSibling;s;s=s.previousElementSibling)if(s.tagName===n.tagName)i++;parts.unshift(n.tagName.toLowerCase()+':nth-of-type('+i+')')}return 'body>'+parts.join('>')},
  targets(selectors,generic){
    const layer=this.layer(),found=[];
    for(const [id,selector] of selectors){let el=null;try{el=[...layer.querySelectorAll(selector)].find(e=>this.visible(e)&&!e.disabled)}catch(e){}if(el)found.push({id,selector:this.path(el)})}
    if(generic){const seen=new Set(found.map(x=>x.selector));let n=0;for(const el of layer.querySelectorAll('button,[role=button],.row.press,[role=tab]')){if(n>=generic)break;if(!this.visible(el)||el.disabled)continue;const p=this.path(el);if(seen.has(p))continue;const label=(el.id?'#'+el.id:'')||(el.getAttribute('aria-label')||el.textContent||'').trim().replace(/\\s+/g,' ').slice(0,24);if(!label)continue;found.push({id:'*'+label,selector:p});seen.add(p);n++}}
    return found;
  },
  click(selector){const el=document.querySelector(selector);if(!el||!this.visible(el)||el.disabled)return false;el.scrollIntoView({block:'center'});el.click();return true},
  signature(){const l=this.layer();return (l.id||l.className)+'|'+document.querySelectorAll('#pushLayer .push-view.show').length+'|'+(l.querySelector('.sheet-title,.push-title,.large-title,#alertTitle,#calcTitle')?.textContent||'').trim()+'|'+l.querySelectorAll('*').length},
  name(el){
    const text=x=>(x||'').replace(/\\s+/g,' ').trim();
    if(text(el.getAttribute('aria-label')))return text(el.getAttribute('aria-label'));
    const by=el.getAttribute('aria-labelledby');if(by){const t=text(by.split(/\\s+/).map(i=>document.getElementById(i)?.textContent||'').join(' '));if(t)return t}
    if(el.id){const l=document.querySelector('label[for="'+CSS.escape(el.id)+'"]');if(l&&text(l.textContent))return text(l.textContent)}
    const wrap=el.closest('label');if(wrap&&text(wrap.textContent))return text(wrap.textContent);
    if(text(el.textContent))return text(el.textContent);
    return text(el.getAttribute('title'))||text(el.getAttribute('placeholder'))||text(el.getAttribute('alt'))||(el.querySelector('img[alt],svg[aria-label]')?'icon':'');
  },
  audit(){
    const layer=this.layer(),small=[],unnamed=[];
    for(const el of layer.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=radio],[role=option],[role=tab],[role=menuitem],[role=slider]')){
      if(!this.visible(el)||el.disabled||el.getAttribute('aria-hidden')==='true'||el.closest('[aria-hidden=true]'))continue;
      let box=el.getBoundingClientRect();
      // 小さな入力部品は、押せる範囲を広げている行やラベルの大きさで判定する
      if(/^(checkbox|radio)$/.test(el.type||'')||el.type==='range'||el.type==='file'){const host=el.closest('label,.row,.switch-row,.field-row,.range-row');if(host)box=host.getBoundingClientRect()}
      const hit=el.closest('[data-hit-area]');if(hit)box=hit.getBoundingClientRect();
      if(box.width<43.5||box.height<43.5)small.push((el.id?'#'+el.id:el.className||el.tagName)+' '+Math.round(box.width)+'×'+Math.round(box.height)+' "'+this.name(el).slice(0,16)+'"');
      if(!this.name(el))unnamed.push((el.id?'#'+el.id:'')+'.'+String(el.className).slice(0,40)+' <'+el.tagName.toLowerCase()+'>');
    }
    const scroller=layer.querySelector('.scroll,.push-body,.sheet-body')||layer;
    return{small,unnamed,overflow:scroller.scrollWidth>scroller.clientWidth+1?scroller.scrollWidth-scroller.clientWidth:0};
  },
  styles(){
    // 表示中の画面と重なっている層の全要素について、算出スタイルを名前順に並べて返す
    const out=[],all=[document.documentElement,document.body,...document.body.querySelectorAll('*')];
    if(!this.props){const s=getComputedStyle(document.body);this.props=[...s].filter(p=>!p.startsWith('--')&&(!p.startsWith('-webkit-')||/backdrop|line-clamp|text-fill|overflow-scrolling|tap-highlight/.test(p))).sort();this.custom=[...getComputedStyle(document.documentElement)].filter(p=>p.startsWith('--')).sort()}
    for(const el of all){
      if(el.tagName==='SCRIPT'||el.tagName==='STYLE'||el.closest('.screen:not(.active)'))continue;
      const row=[el.tagName+(el.id?'#'+el.id:'')+'.'+(typeof el.className==='string'?el.className:'')];
      for(const pseudo of [null,'::before','::after']){
        const s=getComputedStyle(el,pseudo);
        if(pseudo&&(s.content==='none'||s.content==='normal')){row.push('');continue}
        if(!pseudo&&s.display==='none'){row.push('display:none');continue}
        let t='';for(const p of this.props)t+=p+':'+s.getPropertyValue(p)+';';
        if(el===document.documentElement&&!pseudo)for(const p of this.custom)t+=p+':'+s.getPropertyValue(p).trim()+';';
        row.push(t);
      }
      out.push(row);
    }
    return out;
  }
};`;

const settle=async page=>{
  await page.waitForTimeout(140);
  for(let i=0;i<40;i++){if(!await page.evaluate(()=>!!document.querySelector('.busy-overlay.show')))break;await page.waitForTimeout(150)}
  await page.waitForTimeout(40);
};
async function reset(page,tab){
  await page.evaluate(async tab=>{
    const t=globalThis.__mm3Test,layers=()=>document.querySelectorAll('#pushLayer .push-view.show').length;
    document.getElementById('alertWrap')?.classList.remove('show');try{t.closeCalc()}catch(e){}try{t.closeMenu()}catch(e){}try{t.closeSheet()}catch(e){}try{t.resetPlanner()}catch(e){}
    for(let i=0;i<12&&layers();i++){const before=layers();try{t.popView()}catch(e){}if(layers()===before){document.querySelectorAll('#pushLayer .push-view').forEach(v=>v.remove());break}}
    document.querySelectorAll('.busy-overlay.show').forEach(b=>b.classList.remove('show'));
    if(JSON.stringify(t.getData())!==globalThis.__original){await t.replaceData(JSON.parse(globalThis.__original))}
    document.activeElement?.blur?.();t.switchTab(tab);t.renderAll();document.querySelectorAll('.scroll').forEach(s=>s.scrollTop=0);
  },tab);
  await page.waitForTimeout(60);
}
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

const elementSet=process.env.MM3_CRAWL_ELEMENTS?new Set():null;
const tabs=['today','month','pay','payments','assets','settings'];
const report={configs:[],reached:{},behaviour:{},issues:{small:{},unnamed:{},overflow:{},styleDiffs:{},structure:{},errors:[]},states:0};
const note=(bucket,key,where)=>{(report.issues[bucket][key]??=[]).push(where)};
try{
  for(const config of configs){
    const label=`${config.width}-${config.appearance}`,candidate=await createPage('app',config),baseline=baselineRoot?await createPage('baseline',config):null,pages=[candidate,baseline].filter(Boolean);
    for(const p of pages)await p.page.evaluate(inPage);
    const selectors=operations.map(o=>[o.id,o.selector]),visited=new Set(),signatures=new Set(),queue=tabs.map(tab=>({tab,path:[]}));let states=0;
    while(queue.length){
      const state=queue.shift(),where=`${label} ${state.tab}${state.path.map(s=>' > '+s.id).join('')}`;
      let ok=true,before=null;
      for(const p of pages){
        await reset(p.page,state.tab);
        for(const [index,step] of state.path.entries()){
          const last=index===state.path.length-1&&p===candidate;
          if(last)before=await p.page.evaluate(()=>({data:JSON.stringify(globalThis.__mm3Test.getData()),layer:globalThis.__crawl.signature()}));
          if(!await p.page.evaluate(sel=>globalThis.__crawl.click(sel),step.selector)){ok=false;break}await settle(p.page);
        }
        if(!ok)break;
      }
      if(!ok)continue;
      const signature=state.tab+'|'+await candidate.page.evaluate(()=>globalThis.__crawl.signature());
      if(state.path.length&&signatures.has(signature)&&!state.path.at(-1).id.match(/^[A-Z]+-\d+$/))continue;
      signatures.add(signature);states++;if(states%100===0)console.log(`  ${label}: ${states} states, ${queue.length} queued`);
      if(state.path.length){
        const id=state.path.at(-1).id;
        if(/^[A-Z]+-\d+$/.test(id)){
          (report.reached[id]??=[]).push(label);
          if(before&&!report.behaviour[id]){
            const after=await candidate.page.evaluate(()=>({data:JSON.stringify(globalThis.__mm3Test.getData()),layer:globalThis.__crawl.signature(),confirm:!!document.querySelector('#alertWrap.show')}));
            report.behaviour[id]={wroteData:after.data!==before.data,layerChanged:after.layer!==before.layer,askedConfirmation:after.confirm,path:where};
            // 確定操作: 同じ操作を連続2回押しても1回分しか保存されない
            const op=operations.find(o=>o.id===id);
            if(op.kind==='確定'&&after.data!==before.data){
              await reset(candidate.page,state.tab);let replay=true;
              for(const [index,step] of state.path.entries()){
                if(index===state.path.length-1){replay=await candidate.page.evaluate(sel=>{const el=document.querySelector(sel);if(!el)return false;el.click();el.click();return true},step.selector)}
                else replay=await candidate.page.evaluate(sel=>globalThis.__crawl.click(sel),step.selector);
                if(!replay)break;await settle(candidate.page);
              }
              const shape=text=>{const d=JSON.parse(text),out={};for(const [k,v] of Object.entries(d))out[k]=Array.isArray(v)?v.length:v&&typeof v==='object'?Object.keys(v).length:v;out.__balances=(d.banks||[]).map(b=>b.balance);out.__amounts=(d.transactions||[]).map(x=>x.amount);return JSON.stringify(out)};
              if(replay){const twice=await candidate.page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));report.behaviour[id].doubleTapIdempotent=shape(twice)===shape(after.data)}
              await reset(candidate.page,state.tab);for(const step of state.path){await candidate.page.evaluate(sel=>globalThis.__crawl.click(sel),step.selector);await settle(candidate.page)}
            }
          }
        }
      }
      const audit=await candidate.page.evaluate(()=>globalThis.__crawl.audit());
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
      if(state.path.length<maxDepth){
        const next=await candidate.page.evaluate(([selectors,generic])=>globalThis.__crawl.targets(selectors,generic),[selectors,[40,12,0,0,0,0][state.path.length]||0]);
        for(const target of next){
          const key=target.id.startsWith('*')?`${state.tab}|${state.path.map(s=>s.id).join('>')}|${target.id}`:target.id;
          if(visited.has(key))continue;visited.add(key);queue.push({tab:state.tab,path:[...state.path,target]});
        }
      }
    }
    for(const p of pages)for(const e of p.errors)report.issues.errors.push(`${label}: ${e.slice(0,200)}`);
    report.configs.push({label,states});report.states+=states;console.log(`crawled ${label}: ${states} states`);
    for(const p of pages)await p.context.close();
  }
}finally{await browser.close();await new Promise(r=>server.close(r))}

const count=o=>Object.keys(o).length,reachedIds=Object.keys(report.reached).length;
const readOnlyKinds=new Set(['取消','閉じる','戻る','画面へ移動','メニュー','検索','ホイール選択','分析画面への行入口','分析へ移動','危険操作','金額入力','グラフ表示メニュー入口','前月送り矢印','次月送り矢印','支払月ピッカー','残高反映オプション','バックアップ復元フローの入口','承認解除フローへの入口','残高履歴への行入口','台帳詳細への行入口','電卓の値適用ボタン','補助計算結果の適用ボタン','計算機キー群','最終承認スライド']);
report.violations={wroteOnTap:[],doubleSave:[]};
for(const [id,b] of Object.entries(report.behaviour)){const op=operations.find(o=>o.id===id);if(b.wroteData&&readOnlyKinds.has(op.kind))report.violations.wroteOnTap.push(`${id} ${op.label} (${op.kind})`);if(b.doubleTapIdempotent===false)report.violations.doubleSave.push(`${id} ${op.label}`)}
report.summary={states:report.states,wroteOnTap:report.violations.wroteOnTap.length,doubleSave:report.violations.doubleSave.length,operationsReached:reachedIds,operationsTotal:operations.length,notReached:operations.filter(o=>!report.reached[o.id]).map(o=>o.id),small:count(report.issues.small),unnamed:count(report.issues.unnamed),overflow:count(report.issues.overflow),styleDiffs:count(report.issues.styleDiffs),structureMismatch:count(report.issues.structure),errors:[...new Set(report.issues.errors)].length};
mkdirSync(resolve(root,'test-results'),{recursive:true});
if(elementSet)writeFileSync(resolve(root,process.env.MM3_CRAWL_ELEMENTS),JSON.stringify([...elementSet].sort()));
writeFileSync(resolve(root,process.env.MM3_CRAWL_OUT||'test-results/crawl.json'),JSON.stringify(report,null,1));
console.log(JSON.stringify({...report.summary,notReached:report.summary.notReached.length},null,1));
if(process.env.MM3_CRAWL_STRICT){
  assert.deepEqual(report.violations,{wroteOnTap:[],doubleSave:[]},'表示・取消・確認の操作は保存せず、確定は二重に保存しない');
  assert.equal(report.summary.small,0,'操作要素は44×44pt以上');assert.equal(report.summary.unnamed,0,'操作要素に読み上げ名がある');
  assert.equal(report.summary.overflow,0,'横方向にはみ出さない');assert.equal(report.summary.styleDiffs,0,'算出スタイルが基準と一致');assert.equal(report.summary.errors,0,'JavaScriptエラーなし');
}
