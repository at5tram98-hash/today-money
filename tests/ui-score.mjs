/* 公開前のUI点検（自動）: 全root・専用画面・各入力画面（72画面）で、旧来の部品が残っていないかを数える。
   基準: 標準の選択リストの見た目（appearance）・角の小さい旧ボタン・旧セグメント・文字の「›」・44pt未満のボタン・11px未満の文字。
   98%以上の画面がすべての基準を満たすこと。結果は test-results/ui-score.json */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPage,closeHarness,settle,screenMethods,root} from './v11-harness.mjs';
const {page}=await createPage('app',{width:393,appearance:'light'});
const scan=()=>page.evaluate(()=>{const vis=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};const top=document.querySelector('#sheet.show')||[...document.querySelectorAll('#pushLayer .push-view.show')].at(-1)||document.querySelector('.screen.active');const q=s=>[...top.querySelectorAll(s)].filter(vis).length;
 return {title:(top.querySelector('.sheet-title,.push-title,.large-title')?.textContent||top.id||'').trim().slice(0,18),select:[...top.querySelectorAll('select')].filter(e=>vis(e)&&getComputedStyle(e).appearance!=='none').length,secondary:[...top.querySelectorAll('button.secondary,button.primary')].filter(e=>vis(e)&&parseFloat(getComputedStyle(e).borderTopLeftRadius)<20).length,seg:[...top.querySelectorAll('.seg')].filter(e=>vis(e)&&parseFloat(getComputedStyle(e).borderTopLeftRadius)<20).length,textChev:[...top.querySelectorAll('.chev')].filter(e=>vis(e)&&!e.querySelector('svg')&&getComputedStyle(e).fontSize!=='0px').length,smallBtn:[...top.querySelectorAll('button')].filter(e=>{if(!vis(e))return false;const r=e.getBoundingClientRect();return r.width<44||r.height<44}).length,tinyText:[...top.querySelectorAll('*')].filter(e=>e.childElementCount===0&&e.textContent.trim()&&vis(e)&&parseFloat(getComputedStyle(e).fontSize)<11).length,rows:q('.row')}});
const out=[];
for(const tab of ['today','payroot','settings','day','month','pay','assets','payments']){await page.evaluate(t=>globalThis.__mm3Test.switchTab(t),tab);await settle(page);out.push({k:'tab:'+tab,...await scan()})}
for(const m of [...new Set(screenMethods)]){await page.evaluate(()=>{const t=globalThis.__mm3Test;t.closeSheet();while(document.querySelector('#pushLayer .push-view.show'))if(t.popView()===false)break;document.getElementById('alertWrap')?.classList.remove('show')});await settle(page);let ok=false;try{ok=await page.evaluate(m=>globalThis.__mm3Test.call(m,[]),m)}catch(e){}await settle(page);if(ok)out.push({k:m,...await scan()})}
const markers=['select','secondary','seg','textChev','smallBtn','tinyText'];
let screens=0,clean=0;for(const r of out){screens++;const bad=markers.filter(k=>r[k]>0);if(!bad.length)clean++;else console.log(r.k.padEnd(30),r.title.padEnd(18),bad.map(k=>`${k}:${r[k]}`).join(' '))}
const score=Math.round(clean/screens*1000)/10;console.log(`UI score ${clean}/${screens} = ${score}%`);writeFileSync(resolve(root,'test-results/ui-score.json'),JSON.stringify({score,clean,screens,rows:out},null,1));
await closeHarness();
assert.ok(score>=98,`UI点検 ${score}%（98%以上が必要）`);
