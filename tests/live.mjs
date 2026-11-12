/* 公開中のサイトをiPhone相当のブラウザ設定で開いて確認する。
   GitHubのリポジトリページから公開URLを取得し、テスト用の仕掛けなしで画面だけを操作する。
   物理的なiPhoneのSafariではなく、ChromiumによるiPhoneの画面寸法・タッチ・UAの再現である点に注意。 */
import assert from 'node:assert/strict';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium, devices} from 'playwright';
import {root} from '../scripts/build.mjs';

const repository='https://github.com/at5tram98-hash/today-money';
const fallbackUrl=JSON.parse(readFileSync(resolve(root,'worker/wrangler.jsonc'),'utf8')).vars.APP_URL;
const evidence=resolve(root,'docs/v11/evidence');mkdirSync(evidence,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.MM3_CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-gpu','--no-zygote']});
const results=[],passed=name=>{results.push(name);console.log(`PASS ${name}`)};
const report={checkedAt:new Date().toISOString(),device:'Chromium による iPhone 15 Pro / 幅320 の再現（物理端末ではない）'};

try{
  // 1. GitHubのページから公開URLを取得する
  let siteUrl=process.env.MM3_LIVE_URL||'',source=siteUrl?'環境変数 MM3_LIVE_URL（ローカル確認用）':'';
  const gh=await browser.newContext();const ghPage=await gh.newPage();
  for(const path of siteUrl?[]:['','/deployments']){
    try{
      await ghPage.goto(repository+path,{waitUntil:'domcontentloaded',timeout:45000});
      const found=await ghPage.evaluate(()=>[...document.querySelectorAll('a[href]')].map(a=>a.href).find(h=>/^https:\/\/at5tram98-hash\.github\.io\/today-money\/?/.test(h))||'');
      if(found){siteUrl=found.replace(/\/?$/,'/');source=`GitHubのページ ${repository+path}`;break}
    }catch(error){console.log(`GitHub ${path||'/'}: ${error.message.split('\n')[0]}`)}
  }
  await gh.close();
  if(!siteUrl){siteUrl=fallbackUrl;source='GitHubのページ上にリンクが見つからなかったため、リポジトリ内の設定値（worker/wrangler.jsonc の APP_URL）'}
  report.siteUrl=siteUrl;report.urlSource=source;passed(`公開URLを取得: ${siteUrl}（${source}）`);

  const localIndex=readFileSync(resolve(root,'index.html'),'utf8'),localAssets=localIndex.match(/assets\/app\.[a-f0-9]{12}\.(?:js|css)/g).sort();
  for(const [label,options] of [['iphone15pro-light',{...devices['iPhone 15 Pro'],colorScheme:'light'}],['iphone15pro-dark',{...devices['iPhone 15 Pro'],colorScheme:'dark'}],['w320-light',{...devices['iPhone SE'],viewport:{width:320,height:568},colorScheme:'light'}],['w320-dark',{...devices['iPhone SE'],viewport:{width:320,height:568},colorScheme:'dark'}]]){
    const context=await browser.newContext({...options,locale:'ja-JP',timezoneId:'Asia/Tokyo'}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    page.on('response',r=>{if(r.url().startsWith(siteUrl)&&r.status()>=400)errors.push(`HTTP ${r.status()} ${r.url()}`)});
    await page.goto(siteUrl,{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>!document.getElementById('mm3StorageBoot')&&document.querySelectorAll('#tabbar .tab').length===3,null,{timeout:30000});
    await page.waitForTimeout(600);
    // 配信されているのがこのリポジトリの最新ビルドか
    const served=(await page.content()).match(/assets\/app\.[a-f0-9]{12}\.(?:js|css)/g).sort();
    assert.deepEqual([...new Set(served)],localAssets,'公開サイトがこのビルドを配信している');
    assert.deepEqual(await page.locator('#tabbar .tab-label').allTextContents(),['ホーム','支払い','その他']);
    const fits=async where=>{const d=await page.evaluate(()=>({w:document.documentElement.clientWidth,s:document.documentElement.scrollWidth,inner:[...document.querySelectorAll('.screen.active .scroll,.push-view.show .push-body,#sheet.show .sheet-body')].map(e=>e.scrollWidth-e.clientWidth)}));assert.ok(d.s<=d.w+1&&d.inner.every(x=>x<=1),`${label} ${where}: 横にはみ出さない`)};
    const tapSizes=async where=>{const small=await page.evaluate(()=>{const layer=document.querySelector('#sheet.show')||[...document.querySelectorAll('.push-view.show')].at(-1)||document.querySelector('.screen.active');return[...layer.querySelectorAll('button,[role=button],[role=switch],[role=radio],select,input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file])'),...document.querySelectorAll('#tabbar .tab')].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&!e.disabled&&!e.closest('[aria-hidden=true]')&&(r.width<43.5||r.height<43.5)}).map(e=>`${e.id||e.className} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`)});assert.deepEqual(small,[],`${label} ${where}: 操作要素は44×44pt以上`)};
    await page.screenshot({path:resolve(evidence,`live-${label}-today.png`)});
    for(const [index,name] of ['ホーム','支払い','その他'].entries()){
      await page.locator('#tabbar .tab').nth(index).tap();await page.waitForTimeout(450);
      assert.equal(await page.locator('#tabbar .tab').nth(index).evaluate(e=>e.classList.contains('active')),true,`${name}タブへ切り替わる`);
      await fits(name);await tapSizes(name);
    }
    await page.screenshot({path:resolve(evidence,`live-${label}-settings.png`)});
    // 設定 → データ管理 → 全データ削除の確認画面 → キャンセル（何も消えない）
    const stored=()=>page.evaluate(()=>JSON.stringify(Object.keys(localStorage).sort()));
    const keysBefore=await stored();
    await page.locator('#dataSettings').tap();await page.locator('#deleteAll').waitFor({timeout:15000});await page.waitForTimeout(400);await fits('データ管理');await tapSizes('データ管理');
    await page.locator('#deleteAll').tap();await page.locator('#daConfirm').waitFor();await page.waitForTimeout(400);
    assert.equal(await page.locator('#daConfirm').isDisabled(),true,'「削除」と入力するまで削除ボタンは押せない');await fits('全データ削除の確認');await tapSizes('全データ削除の確認');
    await page.screenshot({path:resolve(evidence,`live-${label}-delete-confirm.png`)});
    await page.locator('#daCancel').tap();await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));assert.equal(await stored(),keysBefore);
    // ホーム → ＋入力ハブ → 支出を記録 → 電卓 → キャンセル
    await page.locator('#pushLayer .push-view.show .back-btn').last().tap();await page.waitForFunction(()=>!document.querySelector('#pushLayer .push-view.show'));
    await page.locator('#tabbar .tab').nth(0).tap();await page.waitForTimeout(400);
    await page.locator('#addHub').tap();await page.locator('#entryExpense').waitFor();await page.waitForTimeout(350);await page.locator('#entryExpense').tap();await page.locator('#qeSave').waitFor();await page.waitForTimeout(400);await fits('支出入力');await tapSizes('支出入力');
    await page.screenshot({path:resolve(evidence,`live-${label}-expense.png`)});
    await page.locator('#qeCancel').tap();await page.waitForTimeout(300);
    if(await page.locator('#alertWrap.show').count())await page.locator('#alertActions button').last().tap();
    await page.waitForFunction(()=>!document.getElementById('sheet').classList.contains('show'));
    // 今日／今月の切替
    await page.locator('#homePeriodMonth').tap();await page.waitForTimeout(450);await fits('今月');await tapSizes('今月');
    await page.screenshot({path:resolve(evidence,`live-${label}-month.png`)});
    // Service Worker と Webアプリマニフェスト
    const pwa=await page.evaluate(async()=>{const registration=await Promise.race([navigator.serviceWorker.ready,new Promise(r=>setTimeout(()=>r(null),8000))]),link=document.querySelector('link[rel=manifest]'),manifest=link?await fetch(link.href).then(r=>r.ok?r.json():null).catch(()=>null):null;return{worker:!!registration?.active,scope:registration?.scope||'',name:manifest?.name||manifest?.short_name||'',display:manifest?.display||''}});
    assert.ok(pwa.worker&&pwa.scope.startsWith(siteUrl),'Service Workerが公開URLの範囲で有効');assert.ok(pwa.name,'Webアプリマニフェストを取得できる');
    assert.deepEqual(errors,[],`${label}: JavaScriptエラー・読み込み失敗なし`);
    report[label]={assets:[...new Set(served)],pwa};
    passed(`${label}: 最新ビルドの配信、3タブ、はみ出しなし、44pt以上、削除確認の取消、支出入力、今月表示、Service Worker`);
    await context.close();
  }
}finally{await browser.close()}
report.results=results;writeFileSync(resolve(evidence,'live-check.json'),JSON.stringify(report,null,1));
console.log(`${results.length} live checks passed`);
