import assert from 'node:assert/strict';
// 第14版: 「最近の支出を再利用」は＋入力ハブの「その他の入力」から
const openRepeat=async page=>{await page.evaluate(()=>{while(document.querySelector('#pushLayer .push-view.show'))globalThis.__mm3Test.popView()});await page.locator('#addHub').click();await page.locator('#menuLayer .menu-item').filter({hasText:'その他の入力'}).click();await page.locator('#ihRepeat').click()};
export async function verifyRepeatShortcut(page){
  const before=await page.evaluate(()=>globalThis.__mm3Test.getData());
  await openRepeat(page);await page.locator('#qrClose').waitFor();
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),before);
  await page.locator('#qrClose').click();
  await page.evaluate(()=>globalThis.__mm3Test.recordExpense({amount:480,merchant:'再利用テスト',category:'その他',paymentMethod:'other'}));
  const recorded=await page.evaluate(()=>globalThis.__mm3Test.getData());
  await openRepeat(page);await page.locator('[data-repeat]').filter({hasText:'再利用テスト'}).click();
  assert.equal(await page.locator('#qeMerchant').inputValue(),'再利用テスト');
  assert.ok((await page.locator('#qeAmount').innerText()).includes('480'));
  await page.locator('#qeCancel').click();
  assert.deepEqual(await page.evaluate(()=>globalThis.__mm3Test.getData()),recorded);
  await openRepeat(page);await page.locator('[data-repeat]').filter({hasText:'再利用テスト'}).click();await page.locator('#qeSave').click();
  await page.waitForFunction(()=>globalThis.__mm3Test.getData().transactions.filter(x=>x.merchant==='再利用テスト').length===2);
  const saved=await page.evaluate(()=>globalThis.__mm3Test.getData());assert.deepEqual(saved.banks,recorded.banks);
  assert.equal(saved.transactions.filter(x=>x.merchant==='再利用テスト').length,2);
  await page.evaluate(()=>{while(document.querySelector('#pushLayer .push-view.show'))globalThis.__mm3Test.popView()});await page.waitForTimeout(300);
}
