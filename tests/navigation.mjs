export async function navigateMoney(page,tab){
  if(['pay','payments','assets'].includes(tab)){
    await page.locator('[data-tab="settings"]').click();
    await page.locator('#finance-'+tab).click();
  }else await page.locator(`[data-tab="${tab}"]`).click();
}
