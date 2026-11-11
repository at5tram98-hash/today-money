/* 仕様書の「81画面シナリオ」を1件ずつ開いて確認する。
   各シナリオで、画面が開くこと、5タブ、44pt、読み上げ名、横はみ出し、開いただけで保存データが変わらないこと、
   戻る／キャンセル／閉じるで元の画面へ戻り保存データが変わらないことを確かめ、結果を docs/v11/scenarios-81.csv に書く。 */
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, createPage, settle, reset, closeHarness, relocate, tap} from './v11-harness.mjs';

const routes=JSON.parse(readFileSync(resolve(root,'docs/v11/screen-routes.json'),'utf8')),screens=new Map(routes.screens.map(s=>[s.name,s]));
const shots=resolve(root,'test-results/scenarios');mkdirSync(shots,{recursive:true});
const rows=[],failures=[];
// 表示の状態（通知の既読、今日／今月の表示モード）は会計データではないので比較から外す
const financial=text=>{const d=JSON.parse(text);delete d.homeViewMode;d.notices=(d.notices||[]).map(({read,...rest})=>rest);return JSON.stringify(d)};
const press=tap;
const layers=page=>page.evaluate(()=>({sheet:document.getElementById('sheet').classList.contains('show'),push:document.querySelectorAll('#pushLayer .push-view.show').length,menu:document.getElementById('menuLayer').classList.contains('show'),calc:document.getElementById('calculator').classList.contains('show'),alert:document.getElementById('alertWrap').classList.contains('show'),tab:document.querySelector('.screen.active')?.id||''}));
const detailScreens=['screen-day','screen-month','screen-pay','screen-assets','screen-payments'];
const depth=l=>l.push+(l.sheet?1:0)+(l.menu?1:0)+(l.calc?1:0)+(l.alert?1:0)+(detailScreens.includes(l.tab)?1:0);
/* 最前面の層を、その画面自身の戻る・キャンセル・閉じるで1枚ずつ閉じる */
async function closeTop(page){
  const l=await layers(page);
  if(l.alert){await page.locator('#alertActions button').first().click();await settle(page);return 'ダイアログの取消'}
  if(l.calc){await page.locator('#calcCancel').click();await settle(page);return '電卓のキャンセル'}
  if(l.menu){await page.keyboard.press('Escape');await settle(page);return 'メニューを閉じる'}
  if(l.sheet){
    const label=await page.evaluate(()=>{const b=document.querySelector('#sheet .sheet-nav button');if(!b)return'';const t=b.textContent.trim();b.click();return t});await settle(page);
    if((await layers(page)).alert){await page.locator('#alertActions').getByRole('button',{name:'変更を破棄',exact:true}).click();await settle(page)}
    return label?`シートの「${label}」`:'';
  }
  if(l.push){const label=await page.evaluate(()=>{const b=[...document.querySelectorAll('#pushLayer .push-view.show')].at(-1).querySelector('.back-btn');if(!b)return'';const t=b.getAttribute('aria-label')||b.textContent.trim();b.click();return t});await settle(page);return label?`「${label}」`:''}
  // 第14版: 専用画面（今日の支出・今月の支出・給与・資産・請求一覧）は、上部の「‹ 起点」で開いた起点のrootへ戻る
  const back=await page.evaluate(()=>{const b=document.querySelector('.screen.active .detail-back');if(!b)return'';const t=b.getAttribute('aria-label');b.click();return t});
  if(back){await settle(page);return `「${back}」`}
  return '';
}

try{
  const groups=new Map();for(const s of routes.scenarios){const key=`${s.width}-${s.theme}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s)}
  for(const [key,list] of groups){
    const [width,appearance]=key.split('-'),{page,context,errors}=await createPage('app',{width:Number(width),appearance});
    for(const scenario of list){
      const legacy=screens.get(scenario.screen),moved=relocate(legacy.tab,legacy.path),route={...legacy,tab:moved.root,via:moved.via,path:moved.rest},row={id:scenario.id,screen:scenario.screen,width,theme:appearance,opened:false,tabs:false,small:0,unnamed:0,overflow:0,openedWithoutWrite:false,returned:'',returnedWithoutWrite:false,result:''};
      try{
        await reset(page,route.tab);
        const before=await page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData())),base=await layers(page);
        let ok=true;
        for(const selector of route.via){if(!ok)break;ok=await press(page,selector)}
        if(ok&&route.setup){ok=await page.evaluate(([name,args])=>globalThis.__mm3Test.call(name,args),[route.setup.method,route.setup.args||[]]);await settle(page)}
        for(const selector of route.path){if(!ok)break;ok=await press(page,selector)}
        const now=await layers(page);
        row.opened=ok&&(route.path.length||route.via.length||route.setup?depth(now)>depth(base):now.tab===`screen-${route.tab==='home'?'today':route.tab}`);row.via=moved.label;
        row.tabs=(await page.locator('#tabbar .tab-label').allTextContents()).join('／')==='ホーム／支払い／その他';
        const audit=await page.evaluate(()=>globalThis.__crawl.audit());row.small=audit.small.length+audit.overlaps.length;row.unnamed=audit.unnamed.length;row.overflow=audit.overflow;
        row.openedWithoutWrite=financial(await page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData())))===financial(before);
        await page.screenshot({path:resolve(shots,`${scenario.id}.png`)});
        // 戻る・キャンセル・閉じる
        const used=[];for(let i=0;i<6&&depth(await layers(page))>depth(base);i++){const how=await closeTop(page);if(!how)break;used.push(how)}
        const end=await layers(page);row.returned=used.join(' → ')||'（最上位の画面）';
        const back=depth(end)===depth(base)&&end.tab===base.tab;
        row.returnedWithoutWrite=back&&financial(await page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData())))===financial(before);
        const pass=row.opened&&row.tabs&&!row.small&&!row.unnamed&&!row.overflow&&row.openedWithoutWrite&&row.returnedWithoutWrite;
        row.result=pass?'合格':'不合格';if(!pass)failures.push(`${scenario.id}: ${JSON.stringify(row)} ${audit.small.concat(audit.unnamed,audit.overlaps).slice(0,3).join(' / ')}`);
      }catch(error){row.result='不合格';failures.push(`${scenario.id}: ${error.message.split('\n')[0]}`)}
      rows.push(row);
    }
    if(errors.length)failures.push(`${key}: ${[...new Set(errors)].slice(0,3).join(' | ')}`);
    await context.close();console.log(`${key}: ${list.length} scenarios`);
  }
}finally{await closeHarness()}
const header=['シナリオID','画面','第14版の入口','幅','テーマ','画面が開く','3タブ','44pt未満・重なり','読み上げ名なし','横はみ出し(px)','開いただけでは保存しない','戻り方','戻っても保存しない','結果'];
const cell=v=>{const s=v===true?'○':v===false?'×':String(v);return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
writeFileSync(resolve(root,'docs/v11/scenarios-81.csv'),'﻿'+[header,...rows.map(r=>[r.id,r.screen,r.via||'',r.width,r.theme,r.opened,r.tabs,r.small,r.unnamed,r.overflow,r.openedWithoutWrite,r.returned,r.returnedWithoutWrite,r.result])].map(r=>r.map(cell).join(',')).join('\n')+'\n');
const passed=rows.filter(r=>r.result==='合格').length;
console.log(`${passed}/${rows.length} scenarios passed`);for(const f of failures.slice(0,40))console.log('FAIL',f.slice(0,420));
if(process.env.MM3_SCENARIOS_STRICT)assert.equal(failures.length,0);
