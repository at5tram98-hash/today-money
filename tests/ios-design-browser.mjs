import assert from 'node:assert/strict';

export async function verifyIosDesign({createPage,passed,errors}){
  const seed=await createPage('app');
  const fixture=await seed.page.evaluate(()=>__mm3Test.getData());
  await seed.context.close();
  fixture.eventGoals.push({id:'ios-goal',type:'travel',name:'京都への旅行',deadline:'2026-10-23',items:[]});

  for(const width of [320,393]){
    const {page,context}=await createPage('app',{width,height:width===320?568:852,mobile:true,localOnly:true,stored:fixture});
    const read=()=>page.evaluate(()=>__mm3Test.getData());
    const tab=name=>page.locator('#tabbar [data-tab="'+name+'"]').tap();
    const sheet=page.locator('#sheet.show'), view=page.locator('.push-view.show').last();
    const waitClosed=async()=>{await page.keyboard.press('Escape');await sheet.waitFor({state:'hidden'})};
    try{
      await page.emulateMedia({reducedMotion:'reduce'});
      for(const [entry,month] of [['#todaySearch',false],['#todayCrossSearch',false],['#monthSearch',true]]){
        if(month)await page.locator('.native-home-mode:visible').getByRole('button',{name:'今月',exact:true}).tap();
        const baseline=await read();
        await page.locator(entry).tap();
        const search=view.getByRole('searchbox');
        await search.fill('京都の旅行');
        await view.getByText('該当する記録はありません。',{exact:true}).waitFor();
        assert.equal(await search.evaluate(el=>el===document.activeElement),true);
        await search.evaluate(el=>{
          el.setSelectionRange(2,2);
          el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
        });
        await page.keyboard.insertText('へ');
        await search.evaluate(el=>el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true})));
        const result=view.locator('[data-pro4-result="goal|ios-goal"]');
        await result.waitFor();
        assert.equal(await search.inputValue(),'京都への旅行');
        assert.equal(await search.evaluate(el=>el===document.activeElement&&el.selectionStart===3),true);
        const goal=view.getByRole('button',{name:'目標',exact:true});
        await goal.press('Enter');
        assert.equal(await goal.getAttribute('aria-pressed'),'true');
        assert.equal(await goal.evaluate(el=>el===document.activeElement),true);
        await result.press('Enter');
        await view.getByRole('heading',{name:'京都への旅行',exact:true}).waitFor();
        await page.keyboard.press('Escape');
        await result.waitFor();
        assert.equal(await search.inputValue(),'京都への旅行');
        await search.fill('');await view.getByText('京都への旅行',{exact:true}).waitFor();
        await page.keyboard.press('Escape');
        await page.locator('.push-view.show').waitFor({state:'hidden'});
        assert.deepEqual(await read(),baseline);
      }
      passed(`IOS-11 ${width}px: all three search entrances preserve focus, composition, selection and query on return`);

      const date='2026-10-08';
      await page.locator('#monthCalendar [data-date="'+date+'"]').tap();
      const beforeIncome=await read();
      await view.getByRole('button',{name:'臨時収入を追加',exact:true}).press('Enter');
      assert.equal(await sheet.locator('time').getAttribute('datetime'),date);
      await waitClosed();
      assert.equal(await view.locator('#inspectIncome').evaluate(el=>el===document.activeElement),true);
      assert.deepEqual(await read(),beforeIncome);
      await page.keyboard.press('Escape');await page.locator('.push-view.show').waitFor({state:'hidden'});
      passed(`IOS-05 ${width}px: the day detail offers temporary income with the selected date and restores focus on cancel`);

      await tab('payments');
      await page.locator('#mm3PaymentQuickBillingAction').tap();
      const cancelLines=await sheet.locator('#qcbCancel').evaluate(button=>{
        const range=document.createRange();
        range.selectNodeContents(button);
        return range.getClientRects().length;
      });
      assert.equal(cancelLines,1);
      const states=sheet.getByRole('radiogroup',{name:'請求の状態'});
      const confirmed=states.getByRole('radio',{name:'確定',exact:true});
      await confirmed.press('ArrowRight');
      assert.equal(await states.getByRole('radio',{name:'支払済み',exact:true}).isChecked(),true);
      const modes=sheet.getByRole('radiogroup',{name:'銀行残高への反映'});
      const reconciled=modes.getByRole('radio',{name:'すでに残高へ反映済み',exact:true});
      assert.equal(await reconciled.isChecked(),true);
      const baseline=await read(),bank=baseline.banks.find(b=>b.id===baseline.cards[0].bankId);
      assert.ok(bank);
      await sheet.locator('#qcbDate').fill('2026-10-26');
      await sheet.locator('#qcbAmount').tap();
      for(const digit of '1234')await page.locator('#calculator.show [data-k="'+digit+'"]').tap();
      await page.locator('#calcDone').tap();
      await reconciled.press('ArrowLeft');
      assert.equal(await modes.getByRole('radio',{name:'今回の請求額を残高から引く',exact:true}).isChecked(),true);
      const yen=n=>'¥'+n.toLocaleString('en-US');
      assert.match(await sheet.locator('#qcbInfo').innerText(),/10月26日/);
      await sheet.getByText(yen(bank.balance)+' → '+yen(bank.balance-1234),{exact:true}).waitFor();
      assert.deepEqual(await read(),baseline);
      await reconciled.check();
      await sheet.getByText('残高は変わりません',{exact:true}).waitFor();
      await reconciled.press('ArrowLeft');

      await page.evaluate(()=>{
        const set=Storage.prototype.setItem;
        window.restoreIosSave=()=>Storage.prototype.setItem=set;
        Storage.prototype.setItem=function(key,value){
          if(key==='myMoney2_v1')throw new DOMException('ios-audit-quota','QuotaExceededError');
          return set.call(this,key,value);
        };
      });
      await sheet.locator('#qcbSave').press('Enter');
      await sheet.locator('#qcbRetry').waitFor();
      assert.equal(await sheet.locator('#qcbSave').isEnabled(),true);
      assert.equal(await sheet.locator('#qcbAmount .val').innerText(),'¥1,234');
      const failed=await read();
      delete failed.meta.storageWriteError;
      delete baseline.meta.storageWriteError;
      assert.deepEqual(failed,baseline);
      await page.evaluate(()=>window.restoreIosSave());
      await sheet.locator('#qcbSave').press('Enter');await sheet.waitFor({state:'hidden'});
      const saved=await read();
      assert.equal(saved.banks.find(b=>b.id===bank.id).balance,bank.balance-1234);
      assert.deepEqual(saved.transactions,baseline.transactions);
      await page.reload();
      await page.waitForFunction(()=>!!globalThis.__mm3Test&&!document.getElementById('mm3StorageBoot'));
      assert.equal((await read()).banks.find(b=>b.id===bank.id).balance,bank.balance-1234);
      for(let i=errors.length-1;i>=0;i--)if(errors[i].message.includes('ios-audit-quota'))errors.splice(i,1);
      passed(`IOS-12/13 ${width}px: native selection, exact balance preview and storage retry without a double debit`);

      await tab('payments');
      await page.locator('#paymentsAdd').tap();await page.locator('#paymentAddFixed').tap();
      const frequency=sheet.getByRole('radiogroup',{name:'支払い頻度'});
      await frequency.getByRole('radio',{name:'毎月',exact:true}).press('ArrowLeft');
      assert.equal(await frequency.getByRole('radio',{name:'毎年',exact:true}).isChecked(),true);
      assert.equal(await sheet.getByRole('combobox',{name:'対象月',exact:true}).isVisible(),true);
      await frequency.getByRole('radio',{name:'毎年',exact:true}).press('ArrowRight');
      assert.equal(await frequency.getByRole('radio',{name:'毎月',exact:true}).isChecked(),true);
      assert.equal(await sheet.getByRole('combobox',{name:'対象月',exact:true}).isVisible(),false);
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'破棄',exact:true}).press('Enter');await sheet.waitFor({state:'hidden'});

      await tab('assets');
      const beforeBank=await read();
      const bankMenu=page.getByRole('button',{name:bank.name+'のその他の操作',exact:true});
      await bankMenu.press('Enter');
      await page.getByRole('menuitem',{name:'残高を更新',exact:true}).press('Enter');
      assert.equal(await sheet.locator('#qbBank').inputValue(),bank.id);
      await waitClosed();
      assert.deepEqual(await read(),beforeBank);
      passed(`IOS-05/12 ${width}px: fixed-payment frequency and accessible bank row menu`);
    }finally{await context.close()}
  }
}
