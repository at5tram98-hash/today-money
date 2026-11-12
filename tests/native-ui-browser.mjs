import assert from 'node:assert/strict';
export async function verifyNativeUi({createPage,passed}){
  const {page,context}=await createPage('app',{width:393,height:852,mobile:true});
  const original=await page.evaluate(()=>globalThis.__mm3Test.getData());
  assert.deepEqual(await page.locator('#tabbar .tab-label').allTextContents(),['ホーム','支払い','その他']);
  // 第14版 Q-001: 主要な入力の起点は右下の＋（タブの上・最初の画面で押せる位置）
  const primary=await page.locator('#addHub').boundingBox();assert.ok(primary.y+primary.height<800&&primary.width>=48&&primary.height>=48);
  for(const button of await page.locator('#todayTop button').all()){
    const rect=await button.boundingBox();assert.ok(rect.width>=44&&rect.height>=44);
  }
  await page.locator('#addHub').click();await page.locator('#entryDetail').click();await page.locator('#qeMerchant').waitFor();
  await page.locator('#qeMerchant').fill('長い店名でも入力と保存が使えるかを確認');
  const merchant=page.locator('#qeMerchant');assert.equal(await merchant.getAttribute('enterkeyhint'),'done');
  await merchant.focus();
  await page.evaluate(()=>{
    const viewport=window.visualViewport;
    Object.defineProperty(viewport,'height',{configurable:true,get:()=>532});viewport.dispatchEvent(new Event('resize'));
  });
  await page.waitForFunction(()=>document.documentElement.classList.contains('native-keyboard'));
  assert.equal(await page.locator('#tabbar').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  const save=await page.locator('#qeSave').boundingBox();assert.ok(save.y>=0&&save.y+save.height<=532,'save remains above the keyboard');
  const dimensions=await page.locator('#sheet').evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.width+1);
  await page.evaluate(()=>{document.activeElement.blur();delete window.visualViewport.height;window.visualViewport.dispatchEvent(new Event('resize'))});
  await page.waitForFunction(()=>!document.documentElement.classList.contains('native-keyboard'));
  await page.locator('#qeMerchant').fill('');await page.locator('#qeCancel').click();
  if(await page.locator('#alertWrap.show').count())await page.locator('#alertActions button').last().click();
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),original);
  passed('393×852 native form keeps 44px toolbar targets and Save above simulated keyboard, restores tabs and cancels without data writes');
  await context.close();
}
