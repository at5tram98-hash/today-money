/* 押した時の反応の点検（自動）: 各タブ・各画面で見えているボタンを押しっぱなしにして、
   見た目（大きさ・透明度・背景・影・明るさ）が変わるかを調べる。変わらないボタンは「反応なし」。
   幅393ライト/320ダーク。結果は test-results/press-feedback.json。MM3_PRESS_STRICT=1 で0件を必須にする */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPage,closeHarness,settle,screenMethods,root} from './v11-harness.mjs';

const list=page=>page.evaluate(()=>{
  const top=document.querySelector('#sheet.show')||[...document.querySelectorAll('#pushLayer .push-view.show')].at(-1)||document.querySelector('.screen.active');
  const extra=top.classList.contains('screen')?[...document.querySelectorAll('#app .tabbar .tab, #addHub')]:[];
  const els=[...top.querySelectorAll('button, [role=button], a[href], .row.press, label.row, summary')].concat(extra);
  const out=[];let n=0;
  for(const e of els){
    const r=e.getBoundingClientRect();if(r.width<8||r.height<8||r.bottom<60||r.top>innerHeight-20||r.left<0||r.right>innerWidth)continue;
    const cs=getComputedStyle(e);if(cs.visibility==='hidden'||+cs.opacity<.05||cs.pointerEvents==='none'||e.disabled||e.closest('[aria-hidden=true],[inert]'))continue;
    const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);if(!hit||!(e===hit||e.contains(hit)))continue;
    if(e.matches('input,select,textarea')||e.closest('.sr-only'))continue;
    e.setAttribute('data-press-probe',String(n));out.push({i:n++,x,y,name:`${e.tagName.toLowerCase()}${e.id?'#'+e.id:''}.${String(e.className).split(' ').filter(Boolean).slice(0,2).join('.')}「${(e.getAttribute('aria-label')||e.textContent).trim().replace(/\s+/g,' ').slice(0,14)}」`});
    if(n>=40)break;
  }
  return out;
});
const snap=(page,i)=>page.evaluate(i=>{const e=document.querySelector(`[data-press-probe="${i}"]`);if(!e)return null;const pick=el=>{if(!el)return '';const cs=getComputedStyle(el),b=getComputedStyle(el,'::before'),a=getComputedStyle(el,'::after');return [cs.transform,cs.opacity,cs.backgroundColor,cs.boxShadow,cs.filter,cs.color,b.transform,b.backgroundColor,b.opacity,a.transform,a.width].join('|')};return [e,e.parentElement,e.firstElementChild,e.querySelector('svg')].map(pick).join('||')},i);
const report={rows:[],checked:0};
for(const [width,appearance] of [[393,'light'],[320,'dark']]){
  const {page,context}=await createPage('app',{width,appearance});
  const close=()=>page.evaluate(()=>{const t=globalThis.__mm3Test;t.closeSheet();t.closeMenu?.();while(document.querySelector('#pushLayer .push-view.show'))if(t.popView()===false)break;document.getElementById('alertWrap')?.classList.remove('show')});
  const probe=async key=>{const items=await list(page);for(const it of items){await page.mouse.move(it.x,it.y);await page.waitForTimeout(260);/* ホバー（スマホにはない）の変化を除くため、指を乗せてから比べる */const before=await snap(page,it.i);if(before==null)continue;await page.mouse.down();await page.waitForTimeout(140);const during=await snap(page,it.i);await page.mouse.move(2,2);await page.mouse.up();await page.waitForTimeout(40);report.checked++;
      /* 押した結果、画面が変わったら（離す前に開くタイプ）押下反応ありとみなす */
      const gone=during==null;if(!gone&&before===during){const k=`${key}|${it.name}`;if(!report.rows.some(r=>r.k===k))report.rows.push({k,cfg:`${width}-${appearance}`,screen:key,where:it.name})}}
    await page.evaluate(()=>document.querySelectorAll('[data-press-probe]').forEach(e=>e.removeAttribute('data-press-probe')));};
  /* 自己確認: 反応しないボタンを1つ置き、検出できることを確かめる */
  await page.evaluate(()=>{const b=document.createElement('button');b.id='pressControl';b.textContent='対照';b.setAttribute('style','all:unset;display:block;position:relative;z-index:9;width:120px;height:44px;margin:200px auto 0;color:#000;background:#fff;transition:none!important');document.querySelector('.screen.active .scroll').prepend(b)});
  {const before=report.rows.length;await probe('control');const hit=report.rows.slice(before).some(r=>r.where.includes('#pressControl'));report.rows=report.rows.slice(0,before);assert.ok(hit,'反応しないボタンを検出できる');report.selfTest='ok';await page.evaluate(()=>document.getElementById('pressControl')?.remove())}
  for(const tab of ['today','payroot','settings']){await close();await page.evaluate(t=>globalThis.__mm3Test.switchTab(t),tab);await settle(page);await probe('tab:'+tab)}
  for(const m of [...new Set(screenMethods)].filter(m=>!/Picker$|DayQuickMenu|Calculator|CalcAssist|MaybeOpen|Cancellation/.test(m)).slice(0,60)){await close();await settle(page);let ok=false;try{ok=await page.evaluate(m=>globalThis.__mm3Test.call(m,[]),m)}catch(e){}await settle(page);await page.waitForTimeout(150);if(ok)await probe(m)}
  await context.close();
}
report.total=report.rows.length;
writeFileSync(resolve(root,'test-results/press-feedback.json'),JSON.stringify(report,null,1));
console.log('press feedback: checked',report.checked,'no-feedback',report.total);
for(const r of report.rows.slice(0,120))console.log(`${r.cfg.padEnd(10)} ${r.screen.padEnd(26)} ${r.where}`);
await closeHarness();
if(process.env.MM3_PRESS_STRICT)assert.equal(report.total,0,'押しても反応しないボタン0件');
