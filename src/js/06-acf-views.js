function acfStatusClass(status){return status==='安全'?'good':status==='注意'?'warn':'bad'}

function acfMonthIncomeHtml(month){const salaries=salaryRecordsPayableInMonth(month),temps=data.tempIncomes.filter(t=>String(t.date||'').slice(0,7)===month),total=sum(salaries,r=>r.gross)+sum(temps,t=>t.amount),rows=[];for(const r of salaries){const e=employerById(r.employerId),inc=data.incomes.find(x=>x.salaryRecordId===r.id),done=r.status==='入金済'||inc?.bankApplied||inc?.bankReconciled;rows.push(`<div class="row"><div class="row-main"><div class="row-title">${esc(e?.name||'給与')}</div><div class="row-sub">${r.date?`${Number(r.date.slice(5,7))}月${Number(r.date.slice(8,10))}日`:''} ${done?'入金済':'入金予定'}・${monthLabel(r.month)}勤務分</div></div><div class="row-value green">${yen(r.gross)}</div></div>`)}if(temps.length){rows.push(`<div class="row"><div class="row-main"><div class="row-title">臨時収入</div><div class="row-sub">${temps.length}件</div></div><div class="row-value green">${yen(sum(temps,t=>t.amount))}</div></div>`)}rows.push(`<button type="button" class="row press" id="monthIncomeOpen"><div class="row-main"><div class="row-title">合計</div><div class="row-sub">給与・臨時収入の詳細を見る</div></div><div class="row-value green">${yen(total)}</div><span class="chev">›</span></button>`);return `<div class="group">${rows.join('')}</div>`}



function acfImportantRows(f){return f.rows.filter(r=>r.important)}

function acfTimelineHtml(f){const items=f.rows.filter(r=>r.date===f.startDate||r.events.length||r.flexibleCardDue>0||r.date===monthEndDate(f.startDate.slice(0,7))||r.headroom<0);return `<div class="cashflow-timeline">${items.map(r=>{const eventText=r.events.map(e=>e.label).join('・')||(r.flexibleCardDue>0?'カード支払いの引落':(r.date===f.startDate?'現在':'月末')),delta=r.income-r.mandatoryOutflow-r.flexibleCardDue;return `<div class="cashflow-event"><div class="cashflow-event-date">${Number(r.date.slice(5,7))}/${Number(r.date.slice(8,10))}</div><div><div class="cashflow-event-title">${esc(eventText)}</div><div class="cashflow-event-sub">終了予測 ${yen(r.forecastBalance)}${r.headroom<0?'・安全ラインを下回る見込み':''}</div></div><div class="cashflow-event-value ${delta>0?'green':delta<0?'red':''}">${delta?(delta>0?'+':'')+yen(delta):yen(r.forecastBalance)}</div></div>`}).join('')}</div>`}
function acfRiskHtml(f){const risks=f.risks||[];if(!risks.length)return `<div class="group"><div class="row"><div class="row-main"><div class="row-title">大きな注意点はありません</div><div class="row-sub">登録済みの予定と現在値が正しい前提で、安全ラインを維持できる見込みです。</div></div></div></div>`;return `<div class="group">${risks.map((r,i)=>r.action?`<button type="button" class="row press risk-row ${r.severity==='critical'?'critical':''}" data-risk-index="${i}"><div class="row-main"><div class="row-title">${esc(r.title)}</div><div class="row-sub">${esc(r.detail||'')}</div></div><span class="chev">›</span></button>`:`<div class="row risk-row ${r.severity==='critical'?'critical':''}"><div class="row-main"><div class="row-title">${esc(r.title)}</div><div class="row-sub">${esc(r.detail||'')}</div></div></div>`).join('')}</div>`}

function openAcf(){data.acfSettings.initialized?openAcfDetail():openAcfSetup()}
function openProtectedCashDetail(f){pushView('確保しておく現金',`<div class="hero"><div class="hero-kicker">現在預金</div><div class="hero-value">${yen(f.currentDeposits)}</div><div class="acf-plan-compare"><span>今後に確保</span><strong>${yen(f.protectedCashNow)}</strong></div><div class="acf-plan-compare"><span>自由に使える現金</span><strong class="green">${yen(f.freeCashNow)}</strong></div></div><div class="group"><div class="row"><div class="row-main"><div class="row-title">安全残高</div></div><div class="row-value">${yen(f.reserveFloor)}</div></div><div class="row"><div class="row-main"><div class="row-title">カード引落</div></div><div class="row-value">${yen(f.mandatoryBreakdown.card)}</div></div><div class="row"><div class="row-main"><div class="row-title">固定支払い</div></div><div class="row-value">${yen(f.mandatoryBreakdown.fixed)}</div></div><div class="row"><div class="row-main"><div class="row-title">大型必須支出</div></div><div class="row-value">${yen(f.mandatoryBreakdown.large)}</div></div><div class="row"><div class="row-main"><div class="row-title">その他確定支出</div></div><div class="row-value">${yen(f.mandatoryBreakdown.other)}</div></div></div><div class="hero-sub">上の支払い額を単純に全額ロックしているわけではありません。支払日前に入る給与やその他の入金を日付順に考慮し、「今この時点で残しておく必要がある現金」を計算しています。</div>`)}


function openAcfSimulator(defaultDate=ymd(),loadId=''){
  const loaded=(data.savedScenarios||[]).find(x=>x.id===loadId)||null;
  let amount=Math.max(0,Number(loaded?.amount)||0),date=loaded?.date||defaultDate,method=loaded?.paymentMethod||'other',paymentId=loaded?.paymentId||'',name=loaded?.name||'',category=loaded?.category||data.categories[0]?.name||'その他',timer=null;
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="simCancel">閉じる</button><div class="sheet-title">買う前に試す</div><button type="button" class="nav-text bold" id="simRun">再計算</button></div><div class="sheet-body"><div class="form-group-title">試算条件</div><div class="form-card"><div class="form-section"><div class="form-label">内容・お店</div><input class="field" id="simName" value="${esc(name)}" placeholder="例：旅行のホテル"></div><div class="form-section"><div class="form-label">カテゴリ</div><select class="field field-select" id="simCat">${data.categories.map(c=>`<option ${c.name===category?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="form-section"><div class="form-label">購入予定日</div><input class="field" id="simDate" type="date" value="${esc(date)}"></div><div class="form-section">${moneyButton('simAmount','金額',amount)}</div><div class="form-section"><div class="form-label">基準にする支払い方法</div><select class="field field-select" id="simPay">${paymentOptions()}</select></div></div><div id="simResult"></div><div class="form-group-title">保存した比較案</div><div id="simSaved"></div></div>`,'full',root=>{
    const amountBtn=root.querySelector('#simAmount'),result=root.querySelector('#simResult'),pay=root.querySelector('#simPay'),saved=root.querySelector('#simSaved');
    if(loaded){
      const v=`${method}|${paymentId}`;
      if([...pay.options].some(o=>o.value===v))pay.value=v
    }const read=()=>{
      name=root.querySelector('#simName').value.trim()||'比較案';
      category=root.querySelector('#simCat').value;
      date=root.querySelector('#simDate').value||ymd();
      [method,paymentId]=pay.value.split('|')
    };
    const scenarioFor=(m,p,d=date,label='')=>({name:label||name,date:d,amount,category,paymentMethod:m,paymentId:p||'',linkedBankId:m==='debit'?paymentBankId(m,p):'',_label:label});
    const compareOne=sc=>{
      const card=sc.paymentMethod==='card'?cardById(sc.paymentId):null,bm=card?cardBillingMonthForPurchase(card,sc.date):'',due=card?acfEffectiveCardPaymentDate(card,bm):'',baseEnd=addDays(ymd(),89),horizonEnd=due&&due>baseEnd?due:baseEnd,before=buildCashFlowForecast({horizonEnd}),after=buildCashFlowForecast({scenario:sc,horizonEnd}),dueRow=due?after.rows.find(r=>r.date===due):null,purchaseRow=after.rows.find(r=>r.date===sc.date)||after.rows[0],nextIncome=after.rows.find(r=>r.date>=sc.date&&Number(r.income)>0),until=nextIncome?after.rows.filter(r=>r.date>=sc.date&&r.date<=nextIncome.date):after.rows.filter(r=>r.date>=sc.date).slice(0,31),minUntil=until.reduce((a,r)=>!a||r.forecastBalance<a.forecastBalance?r:a,null),allowed=sc.paymentMethod!=='card'||isCreditAllowedForExpense(category,name),dailyImpact=(Number(after.safeTotalBudget)||0)-(Number(before.safeTotalBudget)||0);
      return{sc,after,allowed,due,dueRow,purchaseRow,minUntil,nextIncome,dailyImpact,score:(after.minMandatoryBalance>=after.reserveFloor?2:0)+(allowed?1:0)+(after.planShortageTotal<=0?1:0)}
    };
    const buildCandidates=()=>{
      read();
      const chosen=scenarioFor(method,paymentId,date,'選択中');
      const list=[chosen];
      const bank=data.banks[0];
      if(method!=='bank'&&bank)list.push(scenarioFor('bank',bank.id,date,bank.name));
      const altCard=data.cards.find(c=>!(method==='card'&&c.id===paymentId));
      if(list.length<3&&altCard)list.push(scenarioFor('card',altCard.id,date,altCard.name));
      if(list.length<3)list.push(scenarioFor(method,paymentId,addDays(date,7),'7日後に購入'));
      const seen=new Set();
      return list.filter(x=>{
        const k=[x.paymentMethod,x.paymentId,x.date].join('|');
        if(seen.has(k))return false;
        seen.add(k);
        return true
      }).slice(0,3).map(compareOne)
    };
    const drawSaved=()=>{
      const arr=data.savedScenarios||[];
      saved.innerHTML=arr.length?`<div class="group">${arr.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${esc(x.name)}</div><div class="row-sub">${x.date}・${yen(x.amount)}・${esc(paymentLabel({paymentMethod:x.paymentMethod,paymentId:x.paymentId}))}</div></div><button type="button" class="pro3-mini-btn" data-load-scenario="${x.id}">開く</button><button type="button" class="pro3-mini-btn" data-del-scenario="${x.id}">削除</button></div>`).join('')}</div>`:'<div class="empty">保存した比較案はありません。最大3件まで保存できます。</div>';
      saved.querySelectorAll('[data-load-scenario]').forEach(b=>b.onclick=()=>{
        closeSheet();
        setTimeout(()=>openAcfSimulator(defaultDate,b.dataset.loadScenario),280)
      });
      saved.querySelectorAll('[data-del-scenario]').forEach(b=>b.onclick=()=>{
        try{
          safeCommit(()=>data.savedScenarios=data.savedScenarios.filter(x=>x.id!==b.dataset.delScenario),{render:false,label:'scenario delete'});
          feedback.delete();
          showToast('比較案を削除しました');
          drawSaved()
        }catch(e){
          }
      })
    };
    const renderResult=({alert=false}={})=>{
      read();
      if(amount<=0){
        result.innerHTML='<div class="impact-card"><div class="impact-title">比較結果</div><div class="hero-sub">金額を入力すると、支払い方法と購入日の違いを比較します。</div></div>';
        if(alert)showAlert('金額を入力してください','試算する金額を入力してください。');
        return
      }const rows=buildCandidates(),best=[...rows].sort((a,b)=>b.score-a.score||b.after.minMandatoryBalance-a.after.minMandatoryBalance)[0];
      result.innerHTML=`<div class="form-group-title">比較結果</div><div class="pro3-scenario-grid">${rows.map((x,i)=>{
        const sc=x.sc,card=sc.paymentMethod==='card'?cardById(sc.paymentId):null,payLabel=sc._label||paymentLabel(sc),purchaseAfter=x.purchaseRow?.forecastBalance??x.after.currentDeposits,minimum=x.minUntil?.forecastBalance??x.after.minForecastBalance,dueText=card?(x.due?dayLabel(x.due):'支払日未設定'):(sc.date===date?'購入時に支払い':'購入時に支払い'),danger=x.after.minMandatoryBalance<x.after.reserveFloor||!x.allowed;
        return `<div class="pro3-scenario ${x===best?'recommended':''}"><div class="pro3-scenario-head"><div><div class="pro3-scenario-title">${esc(payLabel)}</div><div class="pro3-scenario-status">${x===best?'登録内容上の比較候補':'比較案'}${!x.allowed?'・カード利用ルール対象外':''}</div></div><span class="status-chip ${danger?'warning':'good'}">${danger?'要確認':'見込みOK'}</span></div><div class="pro3-scenario-metrics"><div><span>購入直後の予測残高</span><strong>${yen(purchaseAfter)}</strong></div><div><span>次の入金前の最低残高</span><strong class="${minimum<x.after.reserveFloor?'red':''}">${yen(minimum)}</strong></div><div><span>実際のカード支払日</span><strong>${esc(dueText)}</strong></div><div><span>支払後の予測残高</span><strong class="${x.dueRow&&x.dueRow.forecastBalance<x.after.reserveFloor?'red':''}">${x.dueRow?yen(x.dueRow.forecastBalance):'—'}</strong></div><div><span>今日の1日予算への影響</span><strong class="${x.dailyImpact<0?'red':x.dailyImpact>0?'green':''}">${x.dailyImpact>0?'+':''}${yen(x.dailyImpact)}</strong></div><div><span>90日または支払日までの最低残高</span><strong class="${x.after.minMandatoryBalance<x.after.reserveFloor?'red':''}">${yen(x.after.minMandatoryBalance)}</strong></div></div><div class="pro3-scenario-actions"><button type="button" class="pro3-mini-btn" data-save-candidate="${i}">比較案に保存</button><button type="button" class="pro3-mini-btn" data-plan-candidate="${i}">予定に追加</button>${sc.date<=ymd()?`<button type="button" class="pro3-mini-btn" data-tx-candidate="${i}">支出として記録</button>`:''}</div></div>`
      }).join('')}</div><div class="hero-sub" style="margin-top:9px">比較案は実際の残高や請求へ反映しません。「予定に追加」または「支出として記録」を明示的に選んだときだけ保存します。</div>`;
      result.querySelectorAll('[data-save-candidate]').forEach(b=>b.onclick=()=>{
        const x=rows[Number(b.dataset.saveCandidate)]?.sc;
        if(!x)return;
        if((data.savedScenarios||[]).length>=3)return showAlert('比較案は3件までです','不要な比較案を削除してから保存してください。');
        try{
          safeCommit(()=>data.savedScenarios.push({id:uid('scenario'),name:x._label&&x._label!=='選択中'?`${name}・${x._label}`:name,date:x.date,amount:x.amount,category:x.category,paymentMethod:x.paymentMethod,paymentId:x.paymentId,linkedBankId:x.linkedBankId||'',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}),{render:false,label:'scenario save'});
          feedback.success();
          showToast('比較案を保存しました');
          drawSaved()
        }catch(e){
          }
      });
      result.querySelectorAll('[data-plan-candidate]').forEach(b=>b.onclick=()=>{
        const x=rows[Number(b.dataset.planCandidate)]?.sc;
        if(!x)return;
        try{
          safeCommit(()=>data.largeExpensePlans.push({id:uid('large'),name,date:x.date,amount:x.amount,category:x.category,priority:'optional',paymentMethod:x.paymentMethod,paymentId:x.paymentId,linkedBankId:x.linkedBankId||'',status:'planned',memo:'買う前に試すから予定へ追加',splits:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}),{render:true,label:'scenario plan'});
          feedback.success();
          showToast('予定に追加しました');
          closeSheet()
        }catch(e){
          }
      });
      result.querySelectorAll('[data-tx-candidate]').forEach(b=>b.onclick=()=>{
        const x=rows[Number(b.dataset.txCandidate)]?.sc;
        if(!x)return;
        try{
          safeCommit(()=>recordExpense({date:x.date,amount:x.amount,category:x.category,merchant:name,paymentMethod:x.paymentMethod,paymentId:x.paymentId,linkedBankId:x.linkedBankId||'',saveNow:false}),{render:true,label:'scenario transaction'});
          feedback.success();
          showToast('支出として記録しました');
          closeSheet()
        }catch(e){
          }
      })
    };
    const schedule=()=>{
      clearTimeout(timer);
      timer=setTimeout(()=>renderResult(),180)
    };
    amountBtn.onclick=()=>openCalculator('試算金額',amount,v=>{
      amount=v;
      amountBtn.querySelector('.val').textContent=yen(v);
      markSheetDirty();
      schedule()
    });
    root.querySelector('#simCancel').onclick=requestSheetClose;
    root.querySelector('#simRun').onclick=()=>renderResult({alert:true});
    root.querySelector('#simName').oninput=schedule;
    root.querySelector('#simCat').onchange=schedule;
    root.querySelector('#simDate').onchange=schedule;
    pay.onchange=schedule;
    drawSaved();
    renderResult();
    return()=>clearTimeout(timer)
  })
}
function openCreditUsageRules(settings,onChange){const merchants=[...new Set(data.transactions.map(t=>String(t.merchant||'').trim()).filter(Boolean))].slice(0,40);const redraw=(root)=>{root.querySelector('.push-body').innerHTML=`<div class="form-group-title">カテゴリ</div><div class="group"><div class="row"><div class="row-main"><div class="row-title">すべてのカテゴリで利用可</div><div class="row-sub">OFFのときだけカテゴリごとに指定します</div></div><button type="button" class="switch ${settings.creditAllowAllCategories!==false?'on':''}" id="creditAllCategories"></button></div>${settings.creditAllowAllCategories!==false?'':data.categories.map(c=>`<div class="row"><div class="row-main"><div class="row-title">${esc(c.name)}</div></div><button type="button" class="switch ${(settings.creditAllowedCategoryIds||[]).includes(c.id)?'on':''}" data-credit-cat="${c.id}"></button></div>`).join('')}</div><div class="section-head">お店ごとの例外設定</div><div class="hero-sub" style="margin:0 4px 10px">「利用しない」が最優先、次に「利用OK」、未登録のお店はカテゴリ設定に従います。</div>${merchants.length?`<div class="group">${merchants.map(m=>{const allow=acfMerchantRuleMatches(settings.creditAllowedMerchants,m),block=acfMerchantRuleMatches(settings.creditBlockedMerchants,m);return `<div class="row merchant-rule-row"><div class="row-main"><div class="row-title">${esc(m)}</div><div class="row-sub">${block?'利用しない':allow?'利用OK':'カテゴリに従う'}</div></div><div class="merchant-rule-actions"><button type="button" class="pill ${allow?'on':''}" data-merchant-allow="${esc(m)}">利用OK</button><button type="button" class="pill block ${block?'on':''}" data-merchant-block="${esc(m)}">利用しない</button></div></div>`}).join('')}</div>`:'<div class="empty">取引履歴にお店がまだありません。</div>'}`;root.querySelector('#creditAllCategories').onclick=e=>{settings.creditAllowAllCategories=settings.creditAllowAllCategories===false;e.currentTarget.classList.toggle('on',settings.creditAllowAllCategories);onChange?.();redraw(root)};root.querySelectorAll('[data-credit-cat]').forEach(b=>b.onclick=e=>{const id=b.dataset.creditCat,set=new Set(settings.creditAllowedCategoryIds||[]);set.has(id)?set.delete(id):set.add(id);settings.creditAllowedCategoryIds=[...set];e.currentTarget.classList.toggle('on',set.has(id));onChange?.()});root.querySelectorAll('[data-merchant-allow]').forEach(b=>b.onclick=()=>{const m=b.dataset.merchantAllow,allow=new Set(settings.creditAllowedMerchants||[]),block=new Set(settings.creditBlockedMerchants||[]),key=normalizeMerchantKey(m);const found=[...allow].find(x=>normalizeMerchantKey(x)===key);if(found)allow.delete(found);else{allow.add(m);for(const x of [...block])if(normalizeMerchantKey(x)===key)block.delete(x)}settings.creditAllowedMerchants=[...allow];settings.creditBlockedMerchants=[...block];onChange?.();redraw(root)});root.querySelectorAll('[data-merchant-block]').forEach(b=>b.onclick=()=>{const m=b.dataset.merchantBlock,allow=new Set(settings.creditAllowedMerchants||[]),block=new Set(settings.creditBlockedMerchants||[]),key=normalizeMerchantKey(m);const found=[...block].find(x=>normalizeMerchantKey(x)===key);if(found)block.delete(found);else{block.add(m);for(const x of [...allow])if(normalizeMerchantKey(x)===key)allow.delete(x)}settings.creditAllowedMerchants=[...allow];settings.creditBlockedMerchants=[...block];onChange?.();redraw(root)})};pushView('カードを使っていい場所','',root=>redraw(root))}

