/* 文字の表示崩れの点検（自動）: 全root・専用画面・各入力画面で、
   1) 「…」なしで横に切れている文字  2) 縦に切れている文字  3) 文字どうしの重なり  4) 画面の外へはみ出す文字 を探す。
   幅393/320 × ライト/ダーク。結果は test-results/text-layout.json。MM3_TEXT_STRICT=1 で問題0件を必須にする */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPage,closeHarness,settle,screenMethods,root} from './v11-harness.mjs';

const scan=page=>page.evaluate(()=>{
  const top=document.querySelector('#sheet.show')||[...document.querySelectorAll('#pushLayer .push-view.show')].at(-1)||document.querySelector('.screen.active');
  const title=(top.querySelector('.sheet-title,.push-title,.large-title')?.textContent||top.id||'').trim().slice(0,20);
  const vis=e=>{const r=e.getBoundingClientRect();if(r.width<1||r.height<1)return false;const cs=getComputedStyle(e);return cs.visibility!=='hidden'&&cs.display!=='none'&&+cs.opacity>0.05};
  const inView=r=>r.bottom>0&&r.top<innerHeight;
  const leaves=[...top.querySelectorAll('*')].filter(e=>{if(!vis(e))return false;if(['SVG','PATH','svg','path','g','line','rect','circle','text','INPUT','SELECT','TEXTAREA','OPTION'].includes(e.tagName))return false;const own=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());return own});
  const inHScroll=e=>{let p=e.parentElement;while(p&&p!==document.body){const cs=getComputedStyle(p);if(/auto|scroll/.test(cs.overflowX)&&p.scrollWidth>p.clientWidth+2)return true;p=p.parentElement}return false};
  const srOnly=e=>{let x=e;for(let i=0;i<3&&x;i++,x=x.parentElement){const cs=getComputedStyle(x),r=x.getBoundingClientRect();if(/inset\(50%\)/.test(cs.clipPath)||cs.clip!=='auto'&&cs.position==='absolute'||(r.width<=1&&r.height<=1))return true}return false};
  const inBar=e=>!!e.closest('.topbar,.push-nav,.sheet-nav,.tabbar,#tabbar');
  const issues=[];const name=e=>`${e.tagName.toLowerCase()}${e.id?'#'+e.id:''}.${String(e.className).split(' ').slice(0,2).join('.')}「${e.textContent.trim().slice(0,14)}」`;
  for(const e of leaves){
    if(srOnly(e)||inHScroll(e))continue;
    const r=e.getBoundingClientRect();if(!inView(r))continue;const cs=getComputedStyle(e);
    if(r.right>innerWidth+1||r.left<-1)issues.push(['画面外',name(e)]);
    if(e.scrollWidth>e.clientWidth+2&&cs.overflowX!=='visible'&&cs.textOverflow!=='ellipsis'&&!/auto|scroll/.test(cs.overflowX))issues.push(['横に切れる',name(e)]);
    if(e.scrollHeight>e.clientHeight+3&&cs.overflowY==='hidden'&&!cs.webkitLineClamp?.match(/\d/)&&!/ellipsis/.test(cs.textOverflow))issues.push(['縦に切れる',name(e)]);
  }
  /* 細すぎる列で1〜2文字ずつ折り返す文字・背景と区別しにくい文字 */
  const rgb=c=>{const m=String(c).match(/[\d.]+/g);return m?m.map(Number):[0,0,0,0]};
  const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
  const bgOf=e=>{let x=e;while(x){const c=rgb(getComputedStyle(x).backgroundColor);if(c[3]===undefined||c[3]>0.85)return c;if(getComputedStyle(x).backgroundImage!=='none')return null;x=x.parentElement}return document.documentElement.classList.contains('dark')?[0,0,0]:[242,242,247]};
  for(const e of leaves){if(srOnly(e)||inHScroll(e))continue;const r=e.getBoundingClientRect();if(!inView(r))continue;
    const text=[...e.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim();const tops=new Set();for(const n of e.childNodes){if(n.nodeType!==3||!n.textContent.trim())continue;const rg=document.createRange();rg.selectNodeContents(n);for(const x of rg.getClientRects())if(x.width>1)tops.add(Math.round(x.top))}const lines=tops.size;
    if(text.length>=4&&lines>=3&&text.length/lines<=2.2)issues.push(['細い列で折り返す',name(e)]);
    const cs=getComputedStyle(e),fg=rgb(cs.color),bg=bgOf(e);if(bg&&(fg[3]===undefined||fg[3]>.5)&&+cs.opacity>.5){const L1=lum(fg),L2=lum(bg),ratio=(Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);if(ratio<2.6&&!e.closest('button:disabled,[aria-disabled=true],.disabled'))issues.push(['読みにくい色',`${name(e)} ${ratio.toFixed(1)}`])}
  }
  /* 親の overflow:hidden で切られる文字 */
  for(const e of leaves){if(srOnly(e)||inHScroll(e))continue;const r=e.getBoundingClientRect();if(!inView(r))continue;let p=e.parentElement;while(p&&p!==top){const cs=getComputedStyle(p);if((cs.overflowX==='hidden'||cs.overflow==='hidden')&&!/auto|scroll/.test(cs.overflowY)){const pr=p.getBoundingClientRect();if(r.right>pr.right+2&&getComputedStyle(e).textOverflow!=='ellipsis'&&pr.width>40){issues.push(['親で切れる',name(e)]);break}}p=p.parentElement}}
  /* 文字どうしの重なり（範囲のテキスト矩形で判定） */
  const clipTo=(x,b)=>({left:Math.max(x.left,b.left),right:Math.min(x.right,b.right),top:Math.max(x.top,b.top),bottom:Math.min(x.bottom,b.bottom)});const rects=leaves.map(e=>{const rg=document.createRange();rg.selectNodeContents(e);const cs=getComputedStyle(e),own=e.getBoundingClientRect();let rr=[...rg.getClientRects()].map(x=>cs.overflow!=='visible'||cs.textOverflow==='ellipsis'?clipTo(x,own):x).filter(x=>x.right-x.left>2&&x.bottom-x.top>2);return{e,rr}}).filter(x=>x.rr.length);
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(a.e.contains(b.e)||b.e.contains(a.e)||inBar(a.e)!==inBar(b.e)||srOnly(a.e)||srOnly(b.e))continue;
    let hit=false;for(const x of a.rr){for(const y of b.rr){const w=Math.min(x.right,y.right)-Math.max(x.left,y.left),h=Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top);if(w>3&&h>4){hit=true;break}}if(hit)break}
    if(hit&&a.rr[0].bottom>0&&a.rr[0].top<innerHeight){const za=document.elementFromPoint(a.rr[0].left+2,(a.rr[0].top+a.rr[0].bottom)/2),zb=document.elementFromPoint(b.rr[0].left+2,(b.rr[0].top+b.rr[0].bottom)/2);if((za&&(a.e.contains(za)||za.contains(a.e)))||(zb&&(b.e.contains(zb)||zb.contains(b.e))))issues.push(['重なり',`${name(a.e)} × ${name(b.e)}`])}}
  return{title,issues};
});
const report={rows:[],total:0};
for(const [width,appearance] of [[393,'light'],[320,'dark'],[320,'light'],[393,'dark']]){
  const {page,context}=await createPage('app',{width,appearance});
  const close=()=>page.evaluate(()=>{const t=globalThis.__mm3Test;t.closeSheet();t.closeMenu?.();while(document.querySelector('#pushLayer .push-view.show'))if(t.popView()===false)break;document.getElementById('alertWrap')?.classList.remove('show')});
  const check=async key=>{for(const y of [0,700,1500]){await page.evaluate(y=>{const top=document.querySelector('#sheet.show .sheet-body')||[...document.querySelectorAll('#pushLayer .push-view.show .push-body')].at(-1)||document.querySelector('.screen.active .scroll');top?.scrollTo(0,y)},y);await page.waitForTimeout(60);const r=await scan(page);for(const [kind,where] of r.issues){const k=`${kind}|${where}`;if(!report.rows.some(x=>x.k===k)){report.rows.push({k,cfg:`${width}-${appearance}`,screen:key,title:r.title,kind,where})}}}};
  for(const tab of ['today','payroot','settings','day','month','pay','assets','payments']){await close();await page.evaluate(t=>globalThis.__mm3Test.switchTab(t),tab);await settle(page);await check('tab:'+tab)}
  for(const m of [...new Set(screenMethods)].filter(m=>!/Picker$|DayQuickMenu|Calculator|CalcAssist|MaybeOpen|Cancellation/.test(m))){await close();await settle(page);let ok=false;try{ok=await page.evaluate(m=>globalThis.__mm3Test.call(m,[]),m)}catch(e){}await settle(page);await page.waitForTimeout(150);if(ok)await check(m)}
  await close();await page.locator('#addHub').click();await settle(page);await page.waitForTimeout(300);await check('entryCalc');
  await context.close();
}
report.total=report.rows.length;
writeFileSync(resolve(root,'test-results/text-layout.json'),JSON.stringify(report,null,1));
const by={};for(const r of report.rows)by[r.kind]=(by[r.kind]||0)+1;
console.log('text layout issues',report.total,JSON.stringify(by));
for(const r of report.rows.slice(0,80))console.log(`${r.cfg.padEnd(10)} ${r.screen.padEnd(28)} ${r.kind}  ${r.where}`);
await closeHarness();
if(process.env.MM3_TEXT_STRICT)assert.equal(report.total,0,'文字の表示崩れ0件');
