/* 固まり・不具合の検査（ランダムに操作する）。
   動きあり（アニメーションを有効）で、見えているボタンをでたらめに押し続け、次を記録する:
   - JavaScriptエラー
   - 1秒を超えるメインスレッドの停止（固まり）
   - 待機表示・メニューの幕・シートの暗幕が消えないまま残る
   - どこも押せない（前面に押せる部品が無い）状態
   乱数は固定（MM3_MONKEY_SEED）。結果は test-results/monkey.json */
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPage,closeHarness,root,browser} from './v11-harness.mjs';

const steps=Number(process.env.MM3_MONKEY_STEPS||600),seed0=Number(process.env.MM3_MONKEY_SEED||20261113);
let seed=seed0;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
const p0=(await createPage('app',{width:393,appearance:'light'})).page;const url=new URL(p0.url()).origin+'/';
const report={seed:seed0,steps,errors:[],freezes:[],stuck:[],dead:[],actions:0};
for(const [width,appearance] of [[393,'light'],[320,'dark']]){
  const ctx=await browser.newContext({viewport:{width,height:width===320?568:852},isMobile:true,hasTouch:true,colorScheme:appearance,reducedMotion:'no-preference',timezoneId:'Asia/Tokyo'});
  await ctx.route('https://accounts.google.com/**',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await ctx.route(/googleapis\.com|wikipedia\.org/,r=>r.fulfill({status:503,body:'{}',contentType:'application/json'}));
  await ctx.addInitScript(()=>{window.__long=[];try{new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.duration>1000)window.__long.push(Math.round(e.duration))}).observe({type:'longtask',buffered:true})}catch(e){}window.print=()=>{};window.open=()=>null});
  const page=await ctx.newPage();
  page.on('pageerror',e=>report.errors.push(`${width}-${appearance}: ${String(e.message||e).split('\n')[0]}`));
  page.on('dialog',d=>d.dismiss().catch(()=>{}));
  await page.goto(url);await page.waitForFunction(()=>!document.getElementById('mm3StorageBoot'),null,{timeout:15000});await page.waitForTimeout(500);
  let last='',deadSince=0,deadLogged=false;
  for(let i=0;i<steps;i++){
    const pick=await page.evaluate(r=>{
      const vis=el=>{const b=el.getBoundingClientRect();if(b.width<8||b.height<8||b.bottom<0||b.top>innerHeight||b.right<0||b.left>innerWidth)return false;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.pointerEvents==='none'||el.disabled)return false;const x=Math.min(innerWidth-1,Math.max(0,b.left+b.width/2)),y=Math.min(innerHeight-1,Math.max(0,b.top+b.height/2)),top=document.elementFromPoint(x,y);return top&&(top===el||el.contains(top))};
      const all=[...document.querySelectorAll('button,[role=button],[role=radio],[role=switch],a[href],summary,.date-nav-label')].filter(vis).filter(b=>!/削除|すべてのデータ|初期化|リセット|接続を解除|ログアウト|復元/.test(b.textContent+b.getAttribute('aria-label')));
      if(!all.length)return null;const b=all[Math.floor(r*all.length)],box=b.getBoundingClientRect();return{x:box.left+box.width/2,y:box.top+box.height/2,label:(b.id||b.getAttribute('aria-label')||b.textContent||'').trim().slice(0,24),count:all.length};
    },rnd());
    if(!pick){const top=await page.evaluate(()=>[[innerWidth/2,innerHeight/3],[innerWidth/2,innerHeight-60]].map(([x,y])=>{const e=document.elementFromPoint(x,y);return `${e?.tagName}#${e?.id}.${String(e?.className).slice(0,30)}<${e?.parentElement?.id||String(e?.parentElement?.className).slice(0,20)}`}).join(' | ')+` alert=${!!document.querySelector('#alertWrap.show')} sheet=${!!document.querySelector('#sheet.show')} calc=${!!document.querySelector('#calculator.show')} lock=${!!document.querySelector('.lock-screen,#lockScreen.show')}`);deadSince=deadSince||Date.now();if(Date.now()-deadSince>3000&&!deadLogged){deadLogged=true;await page.screenshot({path:resolve(root,`test-results/monkey-dead-${width}-${i}.png`)});report.dead.push(`${width}-${appearance} step ${i}: 3秒以上どこも押せない（直前: ${last}） ${top}`)}await page.waitForTimeout(250);await page.evaluate(()=>{globalThis.__mm3Test?.closeSheet?.();document.getElementById('alertWrap')?.classList.remove('show')});await page.keyboard.press('Escape');continue}
    deadSince=0;deadLogged=false;last=pick.label;report.actions++;
    try{await page.mouse.click(pick.x,pick.y)}catch(e){}
    await page.waitForTimeout(90+Math.round(rnd()*160));
    /* ときどき戻る・閉じる・入力・左端スワイプを混ぜる */
    const r=rnd();
    if(r<.08)await page.keyboard.press('Escape');
    else if(r<.12)await page.evaluate(()=>{const f=[...document.querySelectorAll('input[type=text],input[type=search],textarea')].find(x=>x.getBoundingClientRect().height>0);if(f){f.value='テスト 580';f.dispatchEvent(new Event('input',{bubbles:true}))}});
    else if(r<.15){await page.mouse.move(4,420);await page.mouse.down();await page.mouse.move(220,424,{steps:6});await page.mouse.up()}
    if(i%25===24){
      const st=await page.evaluate(()=>({long:window.__long.splice(0),busy:!!document.querySelector('.busy-overlay.show'),scrim:!!document.querySelector('#menuScrim.show')&&!document.querySelector('#menuLayer.show'),dim:!!document.querySelector('#dim.show')&&!document.querySelector('#sheet.show')&&!document.querySelector('#calculator.show'),pushes:document.querySelectorAll('#pushLayer .push-view.show').length}));
      for(const ms of st.long)report.freezes.push(`${width}-${appearance} 〜step ${i}: ${ms}ms（直前: ${last}）`);
      if(st.busy){await page.waitForTimeout(6000);if(await page.locator('.busy-overlay.show').count())report.stuck.push(`${width}-${appearance} step ${i}: 待機表示が6秒以上消えない（直前: ${last}）`)}
      if(st.scrim)report.stuck.push(`${width}-${appearance} step ${i}: メニューの幕だけが残る（直前: ${last}）`);
      if(st.dim)report.stuck.push(`${width}-${appearance} step ${i}: シートの暗幕だけが残る（直前: ${last}）`);
      if(st.pushes>12)report.stuck.push(`${width}-${appearance} step ${i}: 画面が${st.pushes}枚重なった`);
    }
    if(i%60===59){await page.evaluate(()=>{const t=globalThis.__mm3Test;t?.closeSheet?.();t?.closeMenu?.();document.getElementById('alertWrap')?.classList.remove('show');while(document.querySelector('#pushLayer .push-view.show'))if(t.popView()===false)break;t?.switchTab?.('today')});await page.waitForTimeout(300)}
  }
  await ctx.close();
}
mkdirSync(resolve(root,'test-results'),{recursive:true});writeFileSync(resolve(root,'test-results/monkey.json'),JSON.stringify(report,null,1));
console.log(JSON.stringify({actions:report.actions,errors:report.errors.length,freezes:report.freezes.length,stuck:report.stuck.length,dead:report.dead.length},null,1));
for(const k of ['errors','freezes','stuck','dead'])for(const x of [...new Set(report[k])].slice(0,12))console.log(k,x);
await closeHarness();
if(process.env.MM3_MONKEY_STRICT){assert.equal(report.errors.length,0,'JavaScriptエラーなし');assert.equal(report.stuck.length,0,'消えない幕・待機表示なし');assert.equal(report.dead.length,0,'押せない状態なし');assert.equal(report.freezes.length,0,'1秒を超える停止なし')}
