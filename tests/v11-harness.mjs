/* 巡回検査と画面シナリオ検査が共有する実行基盤。
   ビルド済みのアプリを配信し、検査用の入口（画面を開く関数、初期データの投入）を差し込む。 */
import {createServer} from 'node:http';
import {readFileSync, statSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, extname, basename} from 'node:path';
import {chromium} from 'playwright';
import {build, root} from '../scripts/build.mjs';

if(!process.env.MM3_CRAWL_NO_BUILD)build();
export {root};
export const baselineRoot=process.env.MM3_BASELINE_DIR||'';
const candidateRoot=process.env.MM3_CANDIDATE_DIR||root;
// 元の監査（第8段階）が画面を開くのに使っていた関数。存在しないものは null になる
export const screenMethods=["openDataSettings", "openDailyGoalPlanner", "openMonthlyGoalPlanner", "openAcf", "openFinancialUpdates", "openAddBank", "openAddCard", "openAddDebit", "openSalaryAdd", "openFixedPayment", "openDailyCorrectionDetail", "openTempIncomeHistory", "openQuickCardBilling", "openInitialValues", "openSmartInputSearch", "openEventGoals", "openEventGoalEditor", "openEventGoalDetail", "openReasonAnalysis", "openMonthCloseReview", "openFavoritesEditor", "openTagsManager", "openTagEdit", "openTagItems", "openTagAssignment", "openMoneyTimeline", "openSalaryAllocationPicker", "openTransferPlans", "openTransferPlanEditor", "openBudgetRebalance", "openAcfSetup", "openAcfSimulator", "openAcfSettings", "openDayClosingJournal", "openDayClosing", "openAssetBillingMonthPicker", "openQuickRepeat", "openCalculator", "openCalcAssist", "openTransactionDetail", "openTransactionEdit", "openFinancialDayInspector", "openDayPlanSheet", "openDayQuickMenu", "openLargeExpenseEditor", "openLargeExpenseDetail", "openEmployerCreate", "openEmployerEdit", "openSalaryRecordEdit", "openTempIncomeDetail", "openTempIncomeEdit", "openBankDetail", "openCardDetail", "openCardBillingMonthPicker", "openCardPaidConfirmation", "openCategoryEdit", "openIncomeEditor", "openGmailSettings", "openFeedbackSettings", "openNotificationSettings", "openSecuritySettings", "openAppearanceSettings", "openCardStatementImport", "openStatementReconciliation", "mm3OpenMailEditor", "mm3OpenMailReview", "openSalaryAllocation", "openGoalPlannerDaySheet", "openAcfSimulator", "openSalaryAdd", "openQuickCardBilling", "openTransferPlanEditor", "openAcfSetup", "openEventGoalEditor", "openEventGoalDetail", "openBudgetRebalance", "mm3MaybeOpenPendingMailReview", "openSecuritySettings", "openDayClosingCancellation", "mm3OpenStatementEntry"];
const fixture=`async()=>{await safeCommitAsync(()=>{
  const bank=data.banks[0],other=data.banks[1],category=data.categories[0]?.name||'その他',now=new Date().toISOString();
  recordExpense({amount:1234,date:ymd(),category,merchant:'巡回検査の支出',paymentMethod:bank?'bank':'other',paymentId:bank?.id||'',respectBalanceAsOf:false,saveNow:false});
  if(Array.isArray(data.tags)&&!data.tags.length)data.tags.push({id:'audit_tag',name:'巡回検査',color:'#1673F7'});
  data.largeExpensePlans.push({id:'audit_large',name:'巡回検査の大型支出',date:addDays(ymd(),5),amount:30000,category,priority:'optional',paymentMethod:bank?'bank':'other',paymentId:bank?.id||'',linkedBankId:'',status:'planned',memo:'',splits:[],createdAt:now,updatedAt:now});
  if(bank&&other&&Array.isArray(data.transferPlans))data.transferPlans.push({id:'audit_transfer',fromBankId:bank.id,toBankId:other.id,amount:5000,date:addDays(ymd(),3),status:'planned',createdAt:now,updatedAt:now});
  if(Array.isArray(data.eventGoals))data.eventGoals.push({id:'audit_goal',name:'巡回検査の旅行',type:'travel',deadline:addDays(ymd(),30),splitMode:'amount',participants:2,ownShareAmount:2000,status:'active',items:[{id:'audit_item',name:'巡回検査の交通費',budget:6000,date:ymd(),status:'paid',paymentMethod:'other',paymentId:''}],createdAt:now});
  if(Array.isArray(data.mailImports))data.mailImports.push({id:'audit_mail',date:ymd(),amount:250,merchant:'巡回検査メール',category,paymentMethod:'other',paymentId:'',status:'pending',direction:'expense',categorySource:'manual'});
  data.salaryRecords.slice(0,2).forEach(row=>row.status='入金済');
  data.tempIncomes.push({id:'audit_temp',date:addDays(ymd(),7),amount:8000,sourceName:'巡回検査の臨時収入',toType:bank?'bank':'cash',bankId:bank?.id||'',memo:'',incomeId:'',receivedConfirmed:false});
})}`;
const resolver=`(args)=>args.map(a=>a==='$bank'?data.banks[0]?.id:a==='$card'?data.cards[0]?.id:a==='$large'?'audit_large':a==='$largeObj'?data.largeExpensePlans.find(x=>x.id==='audit_large'):a==='$temp'?'audit_temp':a==='$salary'?data.salaryRecords[0]?.id:a==='$employerObj'?data.employers[0]:a==='$fixedObj'?data.fixedPayments[0]:a==='$tagObj'?data.tags[0]:a==='$goalObj'?data.eventGoals.find(x=>x.id==='audit_goal'):a==='audit_tx'?data.transactions.find(x=>x.merchant==='巡回検査の支出')?.id:a)`;
const hook=`globalThis.__mm3Test={getData:()=>clone(data),safeCommitAsync,recordExpense,getState:()=>({activeTab,currentMonth,payViewMonth,assetBillingMonth,trackingDate}),replaceData:snapshot=>safeCommitAsync(()=>restoreDataSnapshot(normalizeData(snapshot))),switchTab,closeSheet,popView,closeCalc,closeMenu,renderAll,resetPlanner:()=>{goalPlannerState=null},plannerDraft:fn=>{if(!goalPlannerState)return false;fn(goalPlannerState.draft);renderGoalPlanner();return true},makeRecovery:()=>writeRecoverySnapshotAsync('before_import',data),plannerError:message=>{if(!goalPlannerState)return false;goalPlannerState.locked=false;goalPlannerState.processing=false;goalPlannerState.error=message;renderGoalPlanner();return true},plannerStep:n=>{if(!goalPlannerState)return false;if(goalPlannerState.type==='monthly'&&n>=5)ensureGoalDailyPlan(goalPlannerState,{force:true});goalPlannerState.step=n;renderGoalPlanner();return true},methods:{${screenMethods.map(n=>`${n}:typeof ${n}==='function'?${n}:null`).join(',')}},call:(name,args=[])=>{const fn=globalThis.__mm3Test.methods[name];if(!fn)return false;fn(...(${resolver})(args));return true},seed:${fixture}};\n`;
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
export const browser=await chromium.launch({executablePath:process.env.MM3_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-gpu','--no-zygote']});

const ledger=readFileSync(resolve(root,'docs/v11/operation-ids.json'),'utf8');
export const operations=JSON.parse(ledger).map(o=>({...o,selector:o.dom.startsWith('[')?o.dom:o.dom.includes('${')?`[id^="${o.dom.split('${')[0]}"]`:`#${o.dom}`}));

export async function createPage(version,{width,appearance}){
  const context=await browser.newContext({viewport:{width,height:width===320?568:852},isMobile:true,hasTouch:true,timezoneId:'Asia/Tokyo',colorScheme:appearance,reducedMotion:process.env.MM3_CRAWL_MOTION?'no-preference':'reduce'});
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
  await page.evaluate(inPage);
  await page.evaluate(()=>globalThis.__crawl.recordFlow());
  const close=context.close.bind(context);context.close=async(...args)=>{await collectFlow(page);return close(...args)};
  pages.add(page);
  return{page,context,errors};
}
/* 流れのテスト（P0・残りの操作・81画面・金額欄）で実際に表示された操作要素を記録し、追加UIの照合に使う。
   記録するのは、見えていて・読み上げ名があり・44pt以上の要素だけ。 */
const flowInventory=new Set(),pages=new Set();
async function collectFlow(page){if(!pages.has(page))return;pages.delete(page);try{for(const x of await page.evaluate(()=>[...(globalThis.__flowInv||[])]))flowInventory.add(x)}catch(e){}}

/* ---- ページ内の補助関数 ---- */
export const inPage=`
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
  // 最前面の層で見えている要素を優先して押す（背後の層に同じ識別子が残っていても誤って押さない）
  click(selector){let list=[];try{list=[...this.layer().querySelectorAll(selector),...document.querySelectorAll(selector)]}catch(e){return false}const el=list.find(e=>this.visible(e)&&!e.disabled);if(!el)return false;el.scrollIntoView({block:'center'});el.click();return true},
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
  /* DOMが変わるたびに（200ms待ってから）合格した操作要素を記録する */
  recordFlow(){const inv=globalThis.__flowInv=new Set();let timer=0;const snap=()=>{timer=0;try{const sel='button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=radio],[role=option],[role=menuitem],[role=listbox]';for(const el of document.querySelectorAll(sel)){if(!this.visible(el)||el.closest('[aria-hidden=true]'))continue;const n=this.name(el),r=el.getBoundingClientRect();if(!n||r.width<43.5||r.height<43.5)continue;inv.add(el.tagName+'|'+(el.id||'')+'|'+n.slice(0,60))}for(const el of document.querySelectorAll('.push-title,.sheet-title,.large-title,[role=dialog] h2,#alertTitle'))if(this.visible(el)&&this.name(el))inv.add('DIV|'+(el.id||'')+'|'+this.name(el).slice(0,60))}catch(e){}};new MutationObserver(()=>{if(!timer)timer=setTimeout(snap,200)}).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','hidden']});snap()},
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
    // 操作要素どうしの重なり（入れ子は除く）
    const overlaps=[],boxes=[...layer.querySelectorAll('button,a[href],select,[role=button],[role=switch],[role=radio]')].filter(el=>this.visible(el)&&!el.closest('[aria-hidden=true]')).map(el=>{let {left,top,right,bottom}=el.getBoundingClientRect();for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){if(getComputedStyle(p).overflow==='visible')continue;const c=p.getBoundingClientRect();left=Math.max(left,c.left);top=Math.max(top,c.top);right=Math.min(right,c.right);bottom=Math.min(bottom,c.bottom)}return{el,r:{left,top,right,bottom}}}).filter(b=>b.r.right-b.r.left>4&&b.r.bottom-b.r.top>4&&b.r.bottom>0&&b.r.top<innerHeight);
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(a.el.contains(b.el)||b.el.contains(a.el))continue;const w=Math.min(a.r.right,b.r.right)-Math.max(a.r.left,b.r.left),h=Math.min(a.r.bottom,b.r.bottom)-Math.max(a.r.top,b.r.top);if(w>6&&h>6){const floating=el=>{for(let n=el;n&&n!==layer;n=n.parentElement)if(/fixed|sticky/.test(getComputedStyle(n).position))return true;return!!el.closest('.tabbar,[data-floating]')};if([a.el,b.el].some(floating))continue;overlaps.push((a.el.id||String(a.el.className).split(' ')[0])+' × '+(b.el.id||String(b.el.className).split(' ')[0])+' '+Math.round(w)+'×'+Math.round(h))}}
    // 読める最小の文字（11px未満）と、追加UIの照合に使う操作要素の一覧
    const smallText=[],inventory=[];
    for(const el of layer.querySelectorAll('*')){if(el.children.length||!el.textContent.trim()||!this.visible(el)||el.closest('[aria-hidden=true],svg'))continue;const size=parseFloat(getComputedStyle(el).fontSize);if(size<11)smallText.push((el.id?'#'+el.id:'.'+String(el.className).split(' ')[0])+' '+size+'px')}
    for(const el of layer.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=switch],[role=radio],[role=option],[role=menuitem],[role=listbox]')){if(this.visible(el))inventory.push(el.tagName+'|'+(el.id||'')+'|'+this.name(el).slice(0,60))}
    // 画面の見出しと最下段のタブも、追加UIの照合対象にする
    for(const el of [...layer.querySelectorAll('.push-title,.sheet-title,.large-title,[role=dialog] h2,#alertTitle'),...document.querySelectorAll('#tabbar .tab')]){if(this.visible(el))inventory.push((el.matches('button')?'BUTTON':'DIV')+'|'+(el.id||'')+'|'+this.name(el).slice(0,60))}
    return{small,unnamed,overlaps:[...new Set(overlaps)].slice(0,8),smallText:[...new Set(smallText)],inventory:[...new Set(inventory)],overflow:scroller.scrollWidth>scroller.clientWidth+1?scroller.scrollWidth-scroller.clientWidth:0};
  },
  motion(){
    // 動きの設定を持つ要素の、遷移とアニメーションの時間（ms）
    const out={},ms=v=>Math.max(0,...String(v).split(',').map(x=>parseFloat(x)*(x.trim().endsWith('ms')?1:1000)||0));
    for(const el of [this.layer(),...this.layer().querySelectorAll('*'),document.getElementById('dim'),document.getElementById('tabbar')?.querySelector('.tab-selection')].filter(Boolean)){
      const s=getComputedStyle(el),t=ms(s.transitionDuration),a=s.animationName!=='none'?ms(s.animationDuration):0;if(!t&&!a)continue;
      const key=(el.id&&!/^view_|^month-|^cbm-/.test(el.id)?'#'+el.id:el.tagName.toLowerCase()+'.'+String(el.className&&el.className.baseVal!==undefined?el.className.baseVal:el.className).trim().split(/\\s+/).slice(0,2).join('.'));
      out[key]??={transition:t,properties:s.transitionProperty.slice(0,60),animation:a,name:s.animationName,iterations:s.animationIterationCount};
    }
    return out;
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

export const settle=async page=>{
  await page.waitForTimeout(process.env.MM3_CRAWL_MOTION?420:140);
  for(let i=0;i<40;i++){if(!await page.evaluate(()=>!!document.querySelector('.busy-overlay.show')))break;await page.waitForTimeout(150)}
  await page.waitForTimeout(40);
};
export async function reset(page,tab){
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
export const closeHarness=async()=>{for(const p of [...pages])await collectFlow(p);if(flowInventory.size){mkdirSync(resolve(root,'test-results'),{recursive:true});writeFileSync(resolve(root,`test-results/flow-inventory-${basename(process.argv[1]||'test','.mjs')}.json`),JSON.stringify([...flowInventory].sort(),null,1))}await browser.close();await new Promise(r=>server.close(r))};
/* 画面を開く: reset → 前提の関数呼び出し → 目標計画の段階指定 → セレクタの順押し */
export async function openScreen(page,{tab,setup=null,path=[],patch=null,keepData=false}){
  // keepData: 直前の操作で保存した内容を保ったまま開き直す（画面だけを閉じる）
  if(keepData)await page.evaluate(()=>{const t=globalThis.__mm3Test;document.getElementById('alertWrap')?.classList.remove('show');try{t.closeCalc()}catch(e){}try{t.closeSheet()}catch(e){}while(document.querySelector('#pushLayer .push-view.show')&&t.popView()!==false);});
  else await reset(page,tab);
  // patch: 保存データの一部を変えた状態から始める（関数の本文。s が保存データの複製）
  if(patch){await page.evaluate(async body=>{const t=globalThis.__mm3Test,s=t.getData();new Function('s',body)(s);await t.replaceData(s);t.renderAll()},patch);await settle(page)}
  if(setup){
    if(!await page.evaluate(([name,args])=>globalThis.__mm3Test.call(name,args),[setup.method,setup.args||[]]))return false;
    await settle(page);
    // ファイル選択が必要な画面（明細取込）は、実際の入力欄へファイルを渡す
    if(setup.upload){await page.locator(setup.upload.selector).setInputFiles({name:setup.upload.name,mimeType:setup.upload.type||'text/csv',buffer:Buffer.from(setup.upload.text)});await page.waitForTimeout(600);await settle(page)}
    if(setup.step){await page.evaluate(()=>document.querySelector('#goalStart')?.click());await settle(page);if(setup.step>1){await page.evaluate(n=>globalThis.__mm3Test.plannerStep(n),setup.step);await settle(page)}}
  }
  for(const selector of path){if(!await page.evaluate(sel=>globalThis.__crawl.click(sel),selector))return false;await settle(page)}
  return true;
}
