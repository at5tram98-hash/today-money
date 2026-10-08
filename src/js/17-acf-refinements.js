/* === ACF / Gmail behavior refinement 2026-09-10 === */

function acfPaymentModeLabel(cash,credit,shortage=0){
  if(shortage>0)return'不足';
  if(cash>0&&credit>0)return'カード＋現金';
  if(credit>0)return'カード';
  if(cash>0)return'現金';
  return'—'
}

/* Card ratio semantics: 100% means card-first for eligible flexible spending, while safety constraints still cap card use. */
function acfAllocateFlexiblePlan(planByDate,ctx,settings){
  settings={...acfDefaultSettings(),...(settings||{})};
  const extraUsage=new Map(),creditDue=new Map(),allocations=new Map();
  let runningBalance=ctx.openingBalance;
  const ratio=settings.creditFallbackEnabled===false?0:clamp(Number(settings.creditAggressiveness)||0,0,100)/100;
  for(let i=0;i<ctx.dates.length;i++){
    const date=ctx.dates[i],base=ctx.baseRows[i],requested=Math.max(0,Math.floor(Number(planByDate[date])||0)),existingDue=creditDue.get(date)||0;
    const preSpend=runningBalance+base.income-base.mandatoryOutflow-existingDue;
    const freeCashBefore=Math.max(0,Math.floor(acfProjectedMinBalance(ctx,i,preSpend,creditDue,date)-ctx.reserve));
    const dailyRemaining=Math.max(0,Math.floor(settings.creditDailyLimit)-dailyCardUsage(date));
    if(!requested||date>ctx.budgetEnd){
      allocations.set(date,{requested,total:0,cash:0,credit:0,shortage:0,cardParts:[],freeCashBefore,cardDailyRemaining:dailyRemaining,mode:'—',targetCard:0,cardEligiblePlanned:0,ratio});
      runningBalance=preSpend;continue
    }
    const cardEligiblePlanned=acfPlannedCreditEligibleAmount(date,requested,settings),targetCard=(ratio>0&&acfHasAnyCreditUsePlace(settings))?Math.min(cardEligiblePlanned,Math.floor(requested*ratio)):0;
    const cardCap=Math.min(targetCard,dailyRemaining),cashOnly=Math.min(requested,freeCashBefore),bridgeNeeded=Math.max(0,requested-freeCashBefore),postSafeCash=preSpend-cashOnly;
    let credit=0,bridgeAllocated=0,parts=[];
    if(cardCap>0&&settings.creditFallbackEnabled!==false){
      for(const bucket of acfEligibleCardBuckets(date,ctx,extraUsage,settings)){
        if(credit>=cardCap)break;
        let room=Math.min(cardCap-credit,bucket.available);
        if(room<=0)continue;
        let use=0;
        /* Only the portion that exceeds today's safe cash creates additional future funding risk.
           Once that bridge is funded, further card use replaces cash one-for-one and therefore
           must not be rejected merely because the same purchase was also assumed as cash. */
        const bridgeRemaining=Math.max(0,bridgeNeeded-bridgeAllocated);
        if(bridgeRemaining>0){
          const safeAtDue=Math.max(0,Math.floor(acfProjectedMinBalance(ctx,i,postSafeCash,creditDue,bucket.due)-ctx.reserve));
          const bridgeUse=Math.floor(Math.min(room,bridgeRemaining,safeAtDue));
          if(bridgeUse>0){use+=bridgeUse;room-=bridgeUse;bridgeAllocated+=bridgeUse}
        }
        if(room>0&&bridgeAllocated>=bridgeNeeded)use+=Math.floor(room);
        if(use<=0)continue;
        extraUsage.set(bucket.key,(extraUsage.get(bucket.key)||0)+use);
        creditDue.set(bucket.due,(creditDue.get(bucket.due)||0)+use);
        credit+=use;
        parts.push({cardId:bucket.card.id,amount:use,due:bucket.due,billingMonth:bucket.billingMonth})
      }
    }
    const cash=Math.min(Math.max(0,requested-credit),freeCashBefore);
    const total=cash+credit,shortage=Math.max(0,requested-total),newDueToday=Math.max(0,(creditDue.get(date)||0)-existingDue);
    runningBalance=preSpend-cash-newDueToday;
    allocations.set(date,{requested,total,cash,credit,shortage,cardParts:parts,freeCashBefore,cardDailyRemaining:dailyRemaining,mode:acfPaymentModeLabel(cash,credit,shortage),targetCard,cardEligiblePlanned,ratio})
  }
  return{allocations,extraUsage,creditDue}
}

/* Avoid re-running the same binary search for a date/context during one forecast build. */
function simulateCombinedSpend(date,ctx,settings=ctx?.settings||acfDefaultSettings()){
  if(!ctx)return{maxTotal:0,cash:0,credit:0,cardParts:[],plusOneSafe:false};
  ctx.__combinedSpendCache=ctx.__combinedSpendCache||new Map();
  const k=`${date}|${settings.creditFallbackEnabled!==false?1:0}|${Number(settings.creditAggressiveness)||0}|${Number(settings.creditDailyLimit)||0}|${settings.preferredCardId||''}`;
  if(ctx.__combinedSpendCache.has(k))return ctx.__combinedSpendCache.get(k);
  const result=simulateCombinedSpendCore(date,ctx,settings);ctx.__combinedSpendCache.set(k,result);return result
}



function acfBudgetTrendHtml(f){
  const rows=(f?.rows||[]).filter(r=>r.date<=f.startDate.slice(0,7)+'-'+String(new Date(parseYmd(f.startDate).getFullYear(),parseYmd(f.startDate).getMonth()+1,0).getDate()).padStart(2,'0')).slice(0,14);
  const src=(rows.length?rows:f.rows||[]).slice(0,31),step=Math.max(1,Math.ceil(src.length/16)),pts=src.filter((_,i)=>i%step===0||i===src.length-1).map(r=>({date:r.date,value:Number(r.safeTotalBudget)||0}));
  if(pts.length<2)return'';
  const w=350,h=142,l=5,r=5,t=9,b=23,vals=pts.map(x=>x.value),max=Math.max(1,...vals),plotW=w-l-r,plotH=h-t-b;
  const xy=pts.map((p,i)=>({x:l+i*plotW/Math.max(1,pts.length-1),y:t+(1-p.value/max)*plotH,...p}));
  const line=xy.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' '),area=`${line} L${xy.at(-1).x.toFixed(1)},${t+plotH} L${xy[0].x.toFixed(1)},${t+plotH} Z`;
  return `<div class="acf-graph-card"><div class="acf-graph-head"><strong>日別の生活費目安</strong><span>ACF Forecast</span></div><svg class="acf-trend-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="日別の生活費目安グラフ"><line class="acf-trend-grid" x1="${l}" x2="${w-r}" y1="${t+plotH}" y2="${t+plotH}"/><line class="acf-trend-grid" x1="${l}" x2="${w-r}" y1="${t+plotH/2}" y2="${t+plotH/2}"/><path class="acf-trend-area" d="${area}"/><path class="acf-trend-line" d="${line}"/>${xy.map(p=>`<circle class="acf-trend-dot" cx="${p.x}" cy="${p.y}" r="2.8"><title>${dayLabel(p.date)} ${yen(p.value)}</title></circle>`).join('')}<text class="acf-trend-axis" x="${l}" y="${h-5}">${esc(pts[0].date.slice(5))}</text><text class="acf-trend-axis" text-anchor="end" x="${w-r}" y="${h-5}">${esc(pts.at(-1).date.slice(5))}</text></svg><div class="acf-plain-note">同じACF計算結果から、各日に安全に使える生活費の目安を表示しています。</div></div>`
}

function acfCashCardGraphHtml(f){
  const rows=(f?.rows||[]).filter(r=>r.date<=f.endDate).slice(0,7);if(!rows.length)return'';
  const max=Math.max(1,...rows.map(r=>Number(r.safeTotalBudget)||0));
  return `<div class="acf-graph-card"><div class="acf-graph-head"><strong>現金 / カード配分</strong><span>${Math.round(Number(f.settings.creditAggressiveness)||0)}% カード設定</span></div><div class="acf-budget-bars">${rows.map(r=>{const cash=Number(r.safeCashBudget)||0,card=Number(r.safeCreditBudget)||0,total=Math.max(0,cash+card),cashH=total?cash/max*94:0,cardH=total?card/max*94:0;return `<div class="acf-budget-col" title="${dayLabel(r.date)} カード ${yen(card)} / 現金 ${yen(cash)}"><div class="acf-budget-stack"><div class="acf-budget-cardpart" style="height:${cardH}px"></div><div class="acf-budget-cashpart" style="height:${cashH}px"></div></div><div class="acf-budget-label">${Number(r.date.slice(5,7))}/${Number(r.date.slice(8,10))}</div></div>`}).join('')}</div><div class="acf-legend-line"><span><i class="acf-legend-card"></i>カード</span><span><i class="acf-legend-cash"></i>現金</span></div></div>`
}





function openAcfSetup(){
  let reserve=Math.max(0,Number(data.acfSettings.reserveFloor)||30000),useCard=data.acfSettings.creditFallbackEnabled!==false,ratio=clamp(Number(data.acfSettings.creditAggressiveness??100)||0,0,100);
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="acfSetupCancel">閉じる</button><div class="sheet-title">ACFを設定</div><span style="min-width:64px"></span></div><div class="sheet-body"><div class="goal-intro-card"><div class="goal-intro-icon">${icon('chart')}</div><div class="goal-intro-title">ACF</div><div class="goal-intro-copy">給与・カード引落・固定支払い・大型支出を日付順に見て、今日使える生活費を予測します。</div></div><div class="form-group-title">基本設定</div><div class="form-card"><div class="form-section">${moneyButton('acfSetupReserve','最低残したい金額',reserve)}</div><div class="form-section"><div class="inline-value-row"><div><div class="form-label">カードを利用</div><div class="row-sub">対象支出をカード比率に合わせて配分</div></div><button type="button" class="switch ${useCard?'on':''}" id="acfSetupUseCard"></button></div></div><div class="form-section"><div class="acf-credit-head"><span>カードで支払う割合</span><strong id="acfSetupRatioText">${Math.round(ratio)}%</strong></div><input type="range" class="acf-credit-range" id="acfSetupRatio" min="0" max="100" step="1" value="${ratio}" ${useCard?'':'disabled'}></div></div><div class="group"><div class="row"><div class="row-main"><div class="row-title">現在の全銀行預金</div></div><div class="row-value">${yen(totalDeposits())}</div></div><div class="row"><div class="row-main"><div class="row-title">カード1日上限</div><div class="row-sub">詳細設定で変更できます</div></div><div class="row-value">${yen(acfDefaultSettings().creditDailyLimit)}</div></div></div><button type="button" class="primary" id="acfSetupStart">設定して開始</button></div>`,'full',root=>{
    const reserveBtn=root.querySelector('#acfSetupReserve'),toggle=root.querySelector('#acfSetupUseCard'),range=root.querySelector('#acfSetupRatio'),txt=root.querySelector('#acfSetupRatioText');
    reserveBtn.onclick=()=>openCalculator('最低残したい金額',reserve,v=>{reserve=v;reserveBtn.querySelector('.val').textContent=yen(v)});
    toggle.onclick=e=>{useCard=!useCard;e.currentTarget.classList.toggle('on',useCard);range.disabled=!useCard;txt.textContent=useCard?`${Math.round(ratio)}%`:'OFF'};
    range.oninput=e=>{ratio=Number(e.target.value)||0;txt.textContent=`${Math.round(ratio)}%`};
    root.querySelector('#acfSetupCancel').onclick=requestSheetClose;
    root.querySelector('#acfSetupStart').onclick=()=>{try{safeCommit(()=>{data.acfSettings={...acfDefaultSettings(),reserveFloor:reserve,creditFallbackEnabled:useCard,creditAggressiveness:ratio,initialized:true}},{render:true,label:'acf setup'});feedback.success();closeSheet();openAcfDetail()}catch(e){}}
  })
}

function _openAcfDetailImmediate(){
  let important=false,month=ym();
  pushView('ACF','',root=>{
    const draw=()=>{
      const current=buildCashFlowForecast(),conf=current.confidence,body=root.querySelector('.push-body'),canApply=!!monthlyGoal(ym()).total,next=current.nextCardPayment;
      const visibleEnd=acfVisibleEnd(current.startDate),months=[...new Set(current.rows.filter(r=>r.date<=visibleEnd).map(r=>r.date.slice(0,7)))];
      if(!months.includes(month))month=months[0]||ym();
      const ratio=current.settings.creditFallbackEnabled===false?0:Math.round(Number(current.settings.creditAggressiveness)||0),cash=Number(current.safeCashBudget)||0,card=Number(current.safeCreditBudget)||0;
      body.innerHTML=`<div class="hero"><div class="summary-hero-head"><div><div class="hero-kicker">ACF・生活費の見通し</div><div class="hero-value">${yen(current.safeTotalBudget)}</div><div class="hero-sub">今日使える目安</div></div><span class="status-chip ${acfStatusClass(current.status)}">${current.status}</span></div><div class="acf-home-split"><div><span>カードで支払う目安</span><strong>${yen(card)}</strong></div><div><span>現金で支払う目安</span><strong>${yen(cash)}</strong></div><div class="ratio"><span>カード比率</span><strong>${ratio}%</strong></div></div><div class="acf-plain-note">設定比率は支払い方法の希望です。カードの限度額・1日上限・禁止カテゴリ・将来の引落残高をACFが確認し、安全な範囲に制限します。</div></div>${acfShortageCalloutHtml(current)}<div class="section-head">日別資金表</div><div class="hero-sub">${dayLabel(current.startDate)}〜${dayLabel(visibleEnd)}を月ごとに表示。カード利用後の請求は${dayLabel(current.endDate)}まで確認します。</div><div class="acf-month-nav"><label for="acfMonthSelect">表示月<select id="acfMonthSelect" aria-label="日別資金表の表示月">${months.map(m=>`<option value="${m}" ${m===month?'selected':''}>${Number(m.slice(0,4))}年${Number(m.slice(5))}月</option>`).join('')}</select></label></div><div class="seg" id="acfTableMode"><button type="button" class="${!important?'on':''}" data-v="all" aria-pressed="${!important}">すべての日</button><button type="button" class="${important?'on':''}" data-v="important" aria-pressed="${important}">重要日のみ</button></div><div id="acfTablePanel">${acfTableHtml(current,important,month)}</div><div class="hero-sub">現金余力は、必須の入出金後に将来残せる最低残高と安全残高の差です。計画生活費は含めません。「計画支出（現金）」は実際の引落しではありません。ACFが想定した生活費を使う場合の金額を「計画後の残高」から引きます。カードで使う目安は利用日の現金からは引かず、後日の請求に反映します。日付列をタップすると詳細を開けます。</div>${cashFlowProChartHtml(current)}${acfBudgetTrendHtml(current)}${acfCashCardGraphHtml(current)}<div class="section-head">次の重要な資金イベント</div>${acfTimelineHtml(current)}<div class="section-head">計算内訳</div><div class="acf-summary-grid"><div class="acf-summary-tile"><span>現在預金</span><strong>${yen(current.currentDeposits)}</strong></div><button type="button" class="acf-summary-tile hero-button" id="acfProtected"><span>確保しておく金額</span><strong>${yen(current.protectedCashNow)}</strong></button><div class="acf-summary-tile"><span>最低残したい金額</span><strong>${yen(current.reserveFloor)}</strong></div><div class="acf-summary-tile"><span>月末予測</span><strong>${yen(current.monthEndForecast)}</strong></div></div><div class="section-head">もし使ったら？</div><div class="group"><button type="button" class="row press" id="acfSimulator"><div class="row-main"><div class="row-title">購入前シミュレーション</div><div class="row-sub">保存前に現在と使用後のお金の流れを比較</div></div><span class="chev">›</span></button></div>${canApply?`<button type="button" class="secondary" id="acfApplyGoal">ACFの安全予算を日別計画へ反映</button>`:''}<div class="section-head">予測の信頼度</div><div class="card card-pad"><div class="summary-hero-head"><div><div class="row-title">予測の信頼度 ${conf.label}</div><div class="row-sub">${conf.score}%・登録情報の鮮度と完全性から算出</div></div><strong>${conf.score}%</strong></div><div class="confidence-meter"><i style="width:${conf.score}%"></i></div>${conf.reasons.length?`<div class="group" style="margin-top:12px;margin-bottom:0">${conf.reasons.map((r,i)=>`<button type="button" class="row press" data-confidence="${i}"><div class="row-main"><div class="row-title">${esc(r.text)}</div></div><span class="chev">›</span></button>`).join('')}</div>`:'<div class="hero-sub">大きな未確認項目はありません。</div>'}</div><div class="section-head">注意点</div>${acfRiskHtml(current)}${next?`<div class="hero-sub" style="margin-top:8px">次のカード引落予定：${dayLabel(next.date)} ${yen(next.amount)}</div>`:''}<div class="section-head">設定</div><div class="group"><button type="button" class="row press" id="acfOpenSettings"><div class="row-main"><div class="row-title">ACF設定</div><div class="row-sub">最低残高・カード比率・詳細条件</div></div><span class="chev">›</span></button></div>`;
      bindFinanceChart(body,cashFlowProChartPoints(current));
      body.querySelector('#acfProtected').onclick=()=>openProtectedCashDetail(current);
      const tablePanel=body.querySelector('#acfTablePanel');
      const updateTable=()=>{
        tablePanel.innerHTML=acfTableHtml(current,important,month);
        body.querySelector('#acfMonthSelect').value=month;
        body.querySelectorAll('#acfTableMode button').forEach(b=>{b.classList.toggle('on',(b.dataset.v==='important')===important);b.setAttribute('aria-pressed',String((b.dataset.v==='important')===important))});
      };
      body.querySelector('#acfMonthSelect').onchange=e=>{month=e.target.value;updateTable()};
      body.querySelector('#acfTableMode').onclick=e=>{const b=e.target.closest('[data-v]');if(!b)return;important=b.dataset.v==='important';updateTable()};
      tablePanel.onclick=e=>{const b=e.target.closest('[data-acf-day]');if(b)openFinancialDayInspector(b.dataset.acfDay)};
      tablePanel.onkeydown=e=>{if(e.key!=='Enter'&&e.key!==' ')return;const b=e.target.closest('[data-acf-day]');if(!b)return;e.preventDefault();openFinancialDayInspector(b.dataset.acfDay)};
      body.querySelector('#acfSimulator').onclick=()=>openAcfSimulator();
      body.querySelector('#acfApplyGoal')?.addEventListener('click',()=>applyAcfSafeBudgetToMonthlyPlan());
      body.querySelector('#acfOpenSettings').onclick=openAcfSettings;
      body.querySelectorAll('[data-confidence]').forEach(b=>b.onclick=()=>openAcfAction(conf.reasons[Number(b.dataset.confidence)]?.action));
      body.querySelectorAll('[data-risk-index]').forEach(b=>b.onclick=()=>openAcfAction(current.risks[Number(b.dataset.riskIndex)]?.action))
    };draw()
  })
}
function openAcfDetail(){return runWithBusy(_openAcfDetailImmediate,{title:'ACFを更新中…',sub:'給与・カード・固定支払いを確認しています'}).catch(error=>{console.error('ACF view failed',error);showToast('ACFを表示できませんでした',{tone:'error'})})}

function openAcfSettings(){
  const settings={...acfDefaultSettings(),creditAllowedCategoryIds:[...(acfDefaultSettings().creditAllowedCategoryIds||[])],creditAllowedMerchants:[...(acfDefaultSettings().creditAllowedMerchants||[])],creditBlockedMerchants:[...(acfDefaultSettings().creditBlockedMerchants||[])]};
  let timer=0,detailsOpen=false;
  pushView('ACF設定',`<div class="form-group-title">基本設定</div><div class="acf-settings-summary"><div class="row"><div class="row-main"><div class="row-title">最低残したい金額</div><div class="row-sub">この金額を将来もできるだけ維持します</div></div><button type="button" class="row-value mini-action" id="acfReserve">${yen(settings.reserveFloor)}</button></div><div class="row"><div class="row-main"><div class="row-title">カードを利用</div><div class="row-sub">カード利用可能な支出を比率で配分</div></div><button type="button" class="switch ${settings.creditFallbackEnabled?'on':''}" id="acfFallback"></button></div><div class="row" style="display:block"><div class="acf-credit-control"><div class="acf-credit-head"><span>カードで支払う割合</span><strong class="acf-ratio-value" id="acfCreditValue">${settings.creditFallbackEnabled?Math.round(settings.creditAggressiveness)+'%':'OFF'}</strong></div><input type="range" class="acf-credit-range" id="acfCredit" min="0" max="100" step="1" value="${settings.creditAggressiveness}" ${settings.creditFallbackEnabled?'':'disabled'} aria-label="カード支払い比率"><div class="hero-sub">100%なら、カードで支払える生活費は安全な範囲で原則100%カードになります。</div></div></div></div><div class="card card-pad"><div class="row-title">リアルタイム試算</div><div class="acf-credit-preview" id="acfCreditPreview" style="margin-top:10px"><div class="acf-preview-loading">計算中…</div></div></div><button type="button" class="form-link" id="acfDetailsToggle"><span>詳細設定</span><span id="acfDetailsChev">›</span></button><div class="acf-details-panel hidden" id="acfDetailsPanel"><div class="form-group-title">安全条件</div><div class="form-card"><div class="form-section"><div class="form-label">安全確認期間</div><div class="row-sub">日別表は翌々月末まで表示し、その後に到来するカード支払日も確認します。</div></div></div><div class="form-group-title">カード詳細</div><div class="group"><button type="button" class="row press" id="acfDailyLimit"><div class="row-main"><div class="row-title">カード1日上限</div></div><div class="row-value val">${yen(settings.creditDailyLimit)}</div><span class="chev">›</span></button><div class="row"><div class="row-main"><div class="row-title">優先して使うカード</div></div><select class="field field-select" id="acfPreferred" style="width:48%;min-height:38px"><option value="">自動</option>${data.cards.map(c=>`<option value="${c.id}" ${settings.preferredCardId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><button type="button" class="row press" id="acfCreditPlaces"><div class="row-main"><div class="row-title">カードを使っていい場所</div><div class="row-sub" id="acfPlacesSummary">${esc(acfAllowedCategorySummary(settings))}</div></div><span class="chev">›</span></button></div><div class="form-group-title">予測</div><div class="group"><div class="row"><div class="row-main"><div class="row-title">曜日傾向を利用</div></div><button type="button" class="switch ${settings.useWeekdayWeights?'on':''}" id="acfWeights"></button></div><div class="row"><div class="row-main"><div class="row-title">必須の大型支出を含める</div></div><button type="button" class="switch ${settings.includeRequiredLargeExpenses?'on':''}" id="acfRequired"></button></div><div class="row"><div class="row-main"><div class="row-title">予測リスク通知</div></div><button type="button" class="switch ${settings.riskNotifications?'on':''}" id="acfRiskNoti"></button></div></div></div><button type="button" class="primary" id="acfSettingsSave" style="margin-top:14px">保存</button>`,root=>{
    const reserveBtn=root.querySelector('#acfReserve'),limitBtn=root.querySelector('#acfDailyLimit'),creditRange=root.querySelector('#acfCredit'),preview=root.querySelector('#acfCreditPreview'),saveBtn=root.querySelector('#acfSettingsSave'),panel=root.querySelector('#acfDetailsPanel');
    const draw=()=>{preview.innerHTML='<div class="acf-preview-loading">ACFを計算中…</div>';clearTimeout(timer);timer=setTimeout(()=>{try{const f=buildCashFlowForecast({settings}),ratio=settings.creditFallbackEnabled?Math.round(settings.creditAggressiveness):0;root.querySelector('#acfCreditValue').textContent=settings.creditFallbackEnabled?`${ratio}%`:'OFF';root.querySelector('#acfPlacesSummary')&&(root.querySelector('#acfPlacesSummary').textContent=acfAllowedCategorySummary(settings));preview.innerHTML=`<div><span>今日使える</span><strong>${yen(f.safeTotalBudget)}</strong></div><div><span>カード</span><strong>${yen(f.safeCreditBudget||0)}</strong></div><div><span>現金</span><strong>${yen(f.safeCashBudget||0)}</strong></div>`}catch(e){preview.innerHTML='<div class="acf-preview-loading">計算できませんでした</div>'}},170)};
    reserveBtn.onclick=()=>openCalculator('最低残したい金額',settings.reserveFloor,v=>{settings.reserveFloor=v;reserveBtn.textContent=yen(v);draw()});
    root.querySelector('#acfFallback').onclick=e=>{settings.creditFallbackEnabled=!settings.creditFallbackEnabled;e.currentTarget.classList.toggle('on',settings.creditFallbackEnabled);creditRange.disabled=!settings.creditFallbackEnabled;draw()};
    creditRange.oninput=e=>{settings.creditAggressiveness=Number(e.target.value)||0;root.querySelector('#acfCreditValue').textContent=`${Math.round(settings.creditAggressiveness)}%`;const tick=Math.round(settings.creditAggressiveness/25);if(tick!==creditRange.__tick){creditRange.__tick=tick;feedback.sliderTick()}};
    creditRange.onchange=()=>{feedback.sliderCommit();draw()};
    root.querySelector('#acfDetailsToggle').onclick=()=>{detailsOpen=!detailsOpen;panel.classList.toggle('hidden',!detailsOpen);root.querySelector('#acfDetailsChev').textContent=detailsOpen?'⌄':'›';feedback.selection()};
    limitBtn.onclick=()=>openCalculator('カード1日上限',settings.creditDailyLimit,v=>{settings.creditDailyLimit=v;limitBtn.querySelector('.val').textContent=yen(v);draw()});
    root.querySelector('#acfPreferred').onchange=e=>{settings.preferredCardId=e.target.value;draw()};
    root.querySelector('#acfCreditPlaces').onclick=()=>openCreditUsageRules(settings,draw);
    for(const [id,key] of [['acfWeights','useWeekdayWeights'],['acfRequired','includeRequiredLargeExpenses'],['acfRiskNoti','riskNotifications']])root.querySelector(`#${id}`).onclick=e=>{settings[key]=!settings[key];e.currentTarget.classList.toggle('on',settings[key]);draw()};
    saveBtn.onclick=()=>runSaveAction(saveBtn,()=>{data.acfSettings={...data.acfSettings,...settings,initialized:true}},{render:true,label:'acf settings',success:'ACF設定を保存しました',close:popView});draw();return()=>clearTimeout(timer)
  })
}

/* Gmail review helpers */
function mailReviewConfidence(mi){
  const missing=[];if(!(Number(mi.amount)>0))missing.push('金額');if(!String(mi.merchant||'').trim())missing.push('利用先');if(!String(mi.category||'').trim())missing.push('カテゴリ');
  if(missing.length)return{label:`${missing.join('・')}要確認`,tone:'warn',ready:false};
  if(mi.categorySource==='manual'||mi.categorySource==='rules')return{label:'高い確度',tone:'good',ready:true};
  return{label:'確認推奨',tone:'warn',ready:true}
}
function prepareMailForReview(mi){
  if(!mi||mi.status==='ignored')return mi;
  mi.status='pending';mi.transactionId='';mi.bankApplied=false;mi.bankReconciled=false;mi.userResolved=false;mi.reviewPending=true;mi.reviewConfidence=mailReviewConfidence(mi).label;return mi
}
let openGmailReview;

/* All manually synced financial messages must be reviewed before they affect the ledger. */
async function syncGmail({silent=false}={}){
  if(gmailSyncing)return;
  if(!gmailTokenValid()){if(!silent)await connectGmail();return}
  gmailSyncing=true;
  const reviewIds=[];let added=0,reparsed=0;
  const busyToken=!silent&&!document.querySelector('.mail-center-view')?beginBusy('メールを確認しています…','Gmailから新しい金融メールを探しています'):null;
  try{
    const q=String(data.gmailSettings.query||DEFAULT_DATA.gmailSettings.query).trim();let pageToken='',ids=[],pages=0;
    do{const u=new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');u.searchParams.set('maxResults','100');if(q)u.searchParams.set('q',q);if(pageToken)u.searchParams.set('pageToken',pageToken);const list=await gmailFetch(u.toString());ids.push(...(list.messages||[]).map(x=>x.id));pageToken=list.nextPageToken||'';pages++}while(pageToken&&pages<3);
    if(!silent){if(busyToken)updateBusy(busyToken,'金額と利用先を読み取っています…',`${Math.min(ids.length,200)}件まで確認します`);await new Promise(r=>requestAnimationFrame(r))}
    const parsedMessages=[],byEmail=new Map(data.mailImports.map(x=>[x.emailId,x])),targets=ids.filter(id=>{const old=byEmail.get(id);return !old||Number(old.parserVersion||0)<GMAIL_PARSER_VERSION}).slice(0,200);
    for(let i=0;i<targets.length;i+=6){
      const batch=targets.slice(i,i+6),messages=await Promise.all(batch.map(id=>gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=full`)));
      for(const msg of messages){
        parsedMessages.push({msg,parsed:await parseFinancialMessage(msg)});
      }
    }
    safeCommit(()=>{const byEmail=new Map(data.mailImports.map(x=>[x.emailId,x]));for(const {msg,parsed} of parsedMessages){
        const old=byEmail.get(msg.id);
        if(!old){if(parsed){if(parsed.status!=='ignored'){prepareMailForReview(parsed);reviewIds.push(parsed.id)}data.mailImports.push(parsed);byEmail.set(msg.id,parsed);added++}continue}
        if(old.userResolved||old.transactionId){if(parsed){old.date=parsed.date;old.receivedAt=parsed.receivedAt;old.parserVersion=GMAIL_PARSER_VERSION}reparsed++;continue}
        if(!parsed){Object.assign(old,{status:'ignored',parserVersion:GMAIL_PARSER_VERSION,ignoredReason:'金融取引対象外',transactionId:'',bankApplied:false,bankReconciled:false,reviewPending:false});reparsed++;continue}
        const keep={id:old.id,createdAt:old.createdAt||parsed.createdAt};Object.assign(old,parsed,keep,{transactionId:''});if(old.status!=='ignored'){prepareMailForReview(old);reviewIds.push(old.id)}reparsed++
}data.gmailSettings.lastSyncAt=new Date().toISOString()},{label:'gmail sync'});
    refreshUnknownMailView();
    if(!silent){if(busyToken){updateBusy(busyToken,'読み取り結果を準備しています…',reviewIds.length?`${reviewIds.length}件を確認してください`:'新しい取引はありません');await endBusy(busyToken)}if(reviewIds.length)openGmailReview(reviewIds);else await showAlert('メールを確認しました','新しい支払いメールはありませんでした。',{okText:'OK',cancelText:'閉じる'})}
    else if(reviewIds.length)addNotice('Gmailに確認待ちの取引があります',`${reviewIds.length}件の読み取り結果を確認してください。`,'warning',false);
    if(activeTab==='today')renderToday();else if(activeTab==='month')renderMonth();else if(activeTab==='settings')renderSettings()
  }catch(e){console.error(e);if(busyToken)await endBusy(busyToken);if(!silent)showAlert('Gmail同期に失敗しました',e.message)}finally{gmailSyncing=false;for(const view of pushStack)document.getElementById(view.id)?.__refreshDayClosing?.();if(busyToken)await endBusy(busyToken)}
};

/* Pending now means any mail waiting for user review, not only an unknown category. */







/* UI-only home mode changes should not invalidate the ACF forecast cache. */


/* ACF visible labels are rendered directly by their canonical templates. */
/* === end ACF / Gmail behavior refinement === */



/* === ACF signed balances and shortage visibility === */

function formatAcfIncome(value){
  const n=Math.round(Number(value)||0);
  return n>0?`+${yen(n)}`:yen(n)
}
function formatAcfOutflow(value){
  const n=Math.abs(Math.round(Number(value)||0));
  return n>0?`−${yen(n)}`:yen(0)
}
function formatAcfAvailable(value){ return yen(Math.max(0,Math.round(Number(value)||0))) }
function acfNegativeMoneyHtml(value,{pulse=false}={}){
  const n=Math.round(Number(value)||0);
  if(n>=0)return yen(n);
  return `<span class="acf-negative-value ${pulse?'acf-pulse':''}"><span class="acf-negative-sign">−</span>¥${Math.abs(n).toLocaleString('ja-JP')}</span>`
}
function acfTableValueHtml(kind,value,{pulse=false}={}){
  if(kind==='plus')return formatAcfIncome(value);
  if(kind==='minus')return formatAcfOutflow(value);
  if(kind==='available')return formatAcfAvailable(value);
  return acfNegativeMoneyHtml(value,{pulse})
}
function acfCompactSignedMoney(value){
  const n=Number(value)||0,a=Math.abs(n),sign=n<0?'−':'';
  if(a>=1000000)return `${sign}${(a/1000000).toFixed(a>=10000000?0:1)}M`;
  if(a>=1000)return `${sign}${(a/1000).toFixed(a>=10000?0:1)}k`;
  return `${sign}${Math.round(a)}`
}
function acfDecorateSignedForecast(f){
  if(!f||!Array.isArray(f.rows))return f;
  const reserve=Math.max(0,Number(f.reserveFloor)||0);
  let futureMandatoryMin=Infinity;
  for(let i=f.rows.length-1;i>=0;i--){
    const row=f.rows[i],forecastBalance=Number(row.forecastBalance)||0;
    futureMandatoryMin=Math.min(futureMandatoryMin,Number(row.mandatoryBalance)||0);
    row.availableCash=Math.max(0,Number(row.freeCash)||0);
    row.cashHeadroom=Math.floor(futureMandatoryMin-reserve);
    row.cashShortage=Math.max(0,-forecastBalance);
    row.reserveShortage=Math.max(0,reserve-forecastBalance);
  }
  const minBalance=Number(f.minForecastBalance)||0;
  f.cashShortage=Math.max(0,-minBalance);
  f.minimumCashShortage=f.cashShortage;
  f.minimumCashShortageDate=f.cashShortage>0?(f.minForecastDate||''):'';
  f.reserveShortage=Math.max(0,reserve-minBalance);
  f.firstNegativeDate=f.rows.find(r=>(Number(r.forecastBalance)||0)<0)?.date||'';
  f.firstReserveBreachDate=f.rows.find(r=>(Number(r.forecastBalance)||0)<reserve)?.date||'';
  if(f.cashShortage>0||(Number(f.minMandatoryBalance)||0)<0)f.status='不足';
  else if((Number(f.minMandatoryBalance)||0)<reserve||minBalance<reserve)f.status='危険';
  else if((Number(f.planShortageTotal)||0)>0||minBalance<reserve+5000)f.status='注意';
  else f.status='安全';
  return f
}

function getForecastRisk(forecast){
  const base=getForecastRiskCore(forecast)||[],extra=[];
  if((Number(forecast?.cashShortage)||0)>0){
    const d=forecast.minimumCashShortageDate||forecast.minForecastDate||forecast.startDate;
    extra.push({
      severity:'critical',
      title:`${dayLabel(d)}に資金不足となる見込みです`,
      detail:`最低予測残高 ${yen(forecast.minForecastBalance)}・不足 ${yen(forecast.cashShortage)}`,
      date:d,action:{type:'day',date:d}
    })
  }else if((Number(forecast?.reserveShortage)||0)>0){
    const d=forecast.firstReserveBreachDate||forecast.minForecastDate||forecast.startDate;
    extra.push({
      severity:'warning',
      title:`${dayLabel(d)}に最低残したい金額を下回る見込みです`,
      detail:`安全余力 ${yen((Number(forecast.minForecastBalance)||0)-(Number(forecast.reserveFloor)||0))}`,
      date:d,action:{type:'day',date:d}
    })
  }
  const merged=[...extra,...base],seen=new Set();
  return merged.filter(r=>{
    const key=`${r.severity||''}|${r.title||''}|${r.date||''}`;
    if(seen.has(key))return false;seen.add(key);return true
  })
}

function buildCashFlowForecast(options={}){
  const f=acfDecorateSignedForecast(buildCashFlowForecastCore(options));
  f.risks=getForecastRisk(f);
  return f
}

function acfShortageCalloutHtml(f,{compact=false}={}){
  if(!f)return'';
  const shortage=Math.max(0,Number(f.cashShortage)||0);
  if(shortage>0){
    const d=f.minimumCashShortageDate||f.minForecastDate||f.startDate;
    return `<div class="acf-shortage-callout critical"><div class="acf-shortage-icon">!</div><div class="acf-shortage-main"><div class="acf-shortage-title">資金不足</div><div class="acf-shortage-copy">${dayLabel(d)}に予測残高が ${acfNegativeMoneyHtml(-shortage,{pulse:true})} まで不足する見込みです。${compact?'':'「今日使える額」が0円でも、不足額は隠さず表示します。'}</div></div></div>`
  }
  const reserveShortage=Math.max(0,Number(f.reserveShortage)||0);
  if(reserveShortage>0){
    const d=f.firstReserveBreachDate||f.minForecastDate||f.startDate;
    return `<div class="acf-shortage-callout"><div class="acf-shortage-icon">!</div><div class="acf-shortage-main"><div class="acf-shortage-title">安全残高不足</div><div class="acf-shortage-copy">${dayLabel(d)}に最低残したい金額を下回る見込みです。安全余力 ${acfNegativeMoneyHtml(-reserveShortage)}。</div></div></div>`
  }
  return''
}

function acfTableHtml(f,importantOnly=false,month=''){
  const rows=(importantOnly?acfImportantRows(f):f.rows).filter(r=>!month||r.date.slice(0,7)===month);
  if(!rows.length)return '<div class="acf-table-empty">この月に表示する日がありません。</div>';
  const firstDeficit=f.firstNegativeDate||rows.find(r=>(Number(r.forecastBalance)||0)<0)?.date||'';
  const defs=[
    ['開始残高','openingBalance','signed'],
    ['入金予定','income','plus'],
    ['カード引落','totalCardPayment','minus'],
    ['その他必須支出','otherMandatory','minus'],
    ['現金余力','cashHeadroom','signed'],
    ['計画支出（現金）','flexibleCash','minus'],
    ['現金で使う目安','safeCashBudgetRemaining','available'],
    ['カードで使う目安','safeCreditBudgetRemaining','available'],
    ['今日使える合計','safeBudgetRemaining','available'],
    ['計画後の残高','forecastBalance','signed'],
    ['安全余力','headroom','signed']
  ];
  const head=rows.map(r=>{
    const first=r.date===firstDeficit,actualDeficit=(Number(r.forecastBalance)||0)<0;
    return `<th class="cf-day ${r.date===ymd()?'cf-today':''} ${actualDeficit?'cf-deficit-day':''} ${first?'cf-first-deficit-day':''}" data-acf-day="${r.date}" tabindex="0" aria-label="${dayLabel(r.date)}の資金詳細"><div>${Number(r.date.slice(5,7))}/${Number(r.date.slice(8,10))}${first?'<span class="acf-deficit-marker">!</span>':''}</div><div class="cashflow-day-mark">${r.salary?'<span class="cf-marker salary">¥</span>':''}${r.card||r.cardPayment>0||r.flexibleCardDue>0?'<span class="cf-marker card">●</span>':''}${r.large?'<span class="cf-marker large">●</span>':''}<span>${'日月火水木金土'[parseYmd(r.date).getDay()]}</span></div></th>`
  }).join('');
  const body=defs.map(([label,key,kind])=>`<tr><td class="cf-label">${label}</td>${rows.map(r=>{
    const value=key==='otherMandatory'
      ?Math.max(0,(Number(r.mandatoryOutflow)||0)-(Number(r.cardPayment)||0))
      :Number(r[key])||0;
    const signedNegative=kind==='signed'&&value<0;
    const pulse=signedNegative&&(key==='openingBalance'||key==='forecastBalance')&&(Number(r.forecastBalance)||0)<0;
    const actualDeficit=(Number(r.forecastBalance)||0)<0;
    const classes=[
      r.date===ymd()?'cf-today':'',
      actualDeficit?'cf-deficit-day':'',
      signedNegative?'cf-signed-negative':'',
      signedNegative?'acf-risk-reveal':''
    ].filter(Boolean).join(' ');
    return `<td class="${classes}">${acfTableValueHtml(kind,value,{pulse})}</td>`
  }).join('')}</tr>`).join('');
  return `<div class="cashflow-scroll"><table class="cashflow-table"><thead><tr><th class="cf-label">項目</th>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

function acfForecastLineChartHtml(points){
  if(points.length<2)return `<div class="pro-chart-empty">予測に必要な残高・予定が不足しています。</div>`;
  const w=350,h=220,l=4,r=50,t=15,b=27,vals=points.map(x=>Number(x.value)||0);
  let min0=Math.min(0,...vals),max0=Math.max(0,...vals),span=Math.max(1,max0-min0),pad=Math.max(1,span*.12);
  let min=min0-pad,max=max0+pad;
  if(min0===0&&max0===0){min=-1;max=1}
  const range=max-min||1,plotW=w-l-r,plotH=h-t-b;
  const xy=points.map((v,i)=>({x:l+i*plotW/Math.max(1,points.length-1),y:t+(max-(Number(v.value)||0))/range*plotH,value:Number(v.value)||0,date:v.date,label:v.label||v.date}));
  const line=xy.map((c,i)=>(i?'L':'M')+c.x.toFixed(1)+','+c.y.toFixed(1)).join(' ');
  const area=`${line} L${xy.at(-1).x.toFixed(1)},${t+plotH} L${xy[0].x.toFixed(1)},${t+plotH} Z`;
  const zeroY=t+(max-0)/range*plotH;
  const ticks=[0,.33,.66,1].map(q=>max-q*range),grid=[0,.33,.66,1].map(q=>t+q*plotH);
  const firstNeg=xy.findIndex(c=>c.value<0);
  return `<div class="pro-chart-wrap" data-fin-chart><svg class="pro-chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="ACF残高予測グラフ">${grid.map(y=>`<line class="pro-chart-grid" x1="${l}" x2="${l+plotW}" y1="${y}" y2="${y}"/>`).join('')}<line class="acf-zero-line" x1="${l}" x2="${l+plotW}" y1="${zeroY}" y2="${zeroY}"/><path class="pro-chart-fill" d="${area}"/><path class="pro-chart-line" d="${line}"/>${xy.map((c,i)=>`<circle class="pro-chart-point ${c.value<0?'acf-chart-negative':''} ${i===firstNeg?'acf-chart-first-negative':''}" data-chart-point="${i}" cx="${c.x}" cy="${c.y}" r="3.2"><title>${dayLabel(c.date)} ${yen(c.value)}</title></circle>`).join('')}<line class="pro-chart-guide hidden" data-chart-guide x1="0" x2="0" y1="${t}" y2="${t+plotH}"/><circle class="pro-chart-selected hidden" data-chart-selected cx="0" cy="0" r="4.7"/>${ticks.map((v,i)=>`<text class="pro-chart-axis" x="${l+plotW+4}" y="${grid[i]+3}">${esc(acfCompactSignedMoney(v))}</text>`).join('')}<text class="pro-chart-axis acf-zero-axis" x="${l+plotW+4}" y="${zeroY+3}">0</text><text class="pro-chart-axis" x="${l}" y="${h-5}">${esc(points[0].date?.slice(5)||'')}</text><text class="pro-chart-axis" text-anchor="end" x="${l+plotW}" y="${h-5}">${esc(points.at(-1).date?.slice(5)||'')}</text></svg></div><div class="pro-chart-readout" data-chart-readout><span>期間の推移</span><strong>${acfNegativeMoneyHtml(points.at(-1).value,{pulse:(Number(points.at(-1).value)||0)<0})}</strong></div>`
}
function cashFlowProChartHtml(forecast){
  const points=cashFlowProChartPoints(forecast);
  return `<div class="pro-section-title">残高予測</div>${acfForecastLineChartHtml(points)}`
}

function acfMiniCardHtml(){
  if(!data.acfSettings.initialized)return `<button type="button" class="acf-card acf-home-card hero-button" id="acfToday"><div class="acf-home-name">ACF</div><div class="acf-home-sub">生活費の見通し</div><div class="acf-home-amount">設定する</div><div class="acf-plain-note">最低残したい金額とカードで支払う割合を設定すると、今日使える目安を計算します。</div><div class="acf-link">ACFを設定する ›</div></button>`;
  const f=buildCashFlowForecast(),ratio=f.settings.creditFallbackEnabled===false?0:Math.round(Number(f.settings.creditAggressiveness)||0),cash=Number(f.safeCashBudget)||0,card=Number(f.safeCreditBudget)||0;
  const note=f.status==='安全'?`次の支払いを含めても最低残高を維持できる見込みです。`:f.status==='注意'?'支払い予定を確認しながら使うのがおすすめです。':f.status==='危険'?'残高は残る見込みですが、最低残したい金額を下回ります。':'確定支払いに対して資金不足が発生する見込みです。';
  const statusClass=f.status==='不足'?'acf-status-critical':'';
  return `<button type="button" class="acf-card acf-home-card hero-button" id="acfToday"><div class="acf-head"><div><div class="acf-home-name">ACF</div><div class="acf-home-sub">生活費の見通し</div></div><span class="status-chip ${acfStatusClass(f.status)} ${statusClass}">${f.status}</span></div><div class="acf-home-amount">${formatAcfAvailable(f.safeTotalBudget)}</div><div class="acf-home-caption">今日使える目安</div>${acfShortageCalloutHtml(f,{compact:true})}<div class="acf-home-split"><div><span>カード</span><strong>${formatAcfAvailable(card)}</strong></div><div><span>現金</span><strong>${formatAcfAvailable(cash)}</strong></div><div class="ratio"><span>カード比率</span><strong>${ratio}%</strong></div></div><div class="acf-plain-note">${esc(note)}</div><div class="acf-link">詳しく見る ›</div></button>`
}

function acfMonthCardHtml(month){
  if(month!==ym())return `<div class="acf-card"><div class="acf-home-name">ACF</div><div class="acf-home-sub">生活費の見通し</div><div class="acf-plain-note">ACFは現在時点から先を予測します。過去月の閲覧では現在の予測値を変更しません。</div></div>`;
  if(!data.acfSettings.initialized)return `<button type="button" class="acf-card hero-button" id="acfMonth"><div class="acf-home-name">ACF</div><div class="acf-home-sub">生活費の見通し</div><div class="acf-plain-note">最低残したい金額を設定すると、給与・支払いを日付順に考慮して予測します。</div><div class="acf-link">ACFを設定する ›</div></button>`;
  const f=buildCashFlowForecast(),next=f.nextCardPayment,ratio=f.settings.creditFallbackEnabled===false?0:Math.round(Number(f.settings.creditAggressiveness)||0),statusClass=f.status==='不足'?'acf-status-critical':'';
  return `<button type="button" class="acf-card hero-button" id="acfMonth"><div class="acf-head"><div><div class="acf-home-name">ACF</div><div class="acf-home-sub">生活費の見通し</div></div><span class="status-chip ${acfStatusClass(f.status)} ${statusClass}">${f.status}</span></div><div class="acf-value">${acfNegativeMoneyHtml(f.monthEndForecast,{pulse:(Number(f.monthEndForecast)||0)<0})}</div><div class="acf-subtitle">月末予測</div>${acfShortageCalloutHtml(f,{compact:true})}<div class="acf-metrics"><div class="acf-metric"><span>今日使える</span><strong>${formatAcfAvailable(f.safeTotalBudget)}</strong></div><div class="acf-metric"><span>カード比率</span><strong>${ratio}%</strong></div><div class="acf-metric"><span>最低残高</span><strong>${acfNegativeMoneyHtml(f.minForecastBalance,{pulse:(Number(f.minForecastBalance)||0)<0})}</strong></div></div>${next?`<div class="acf-plan-compare"><span>次のカード引落</span><strong>${yen(next.amount)}・${Number(next.date.slice(5,7))}/${Number(next.date.slice(8,10))}</strong></div>`:''}<div class="acf-link">ACFを詳しく見る ›</div></button>`
}

const __acfSignedDayInspectorBase=openFinancialDayInspector;
openFinancialDayInspector=function(date){
  __acfSignedDayInspectorBase(date);
  requestAnimationFrame(()=>{
    try{
      const top=pushStack?.[pushStack.length-1],root=top&&document.getElementById(top.id),anchor=root?.querySelector('.day-inspector-actions');
      if(!root||!anchor||root.querySelector('.acf-day-state-block'))return;
      const f=data.acfSettings.initialized?buildCashFlowForecast():null,row=f?.rows.find(r=>r.date===date);
      if(!row)return;
      const dayGoalAmount=Number(data.dailyGoals[date]?.total)||0;
      const monthGoalAmount=Number(data.monthlyGoals[date.slice(0,7)]?.daily?.[Number(date.slice(8,10))])||0;
      const planSource=dayGoalAmount>0?'日別計画':monthGoalAmount>0?'月間計画':'ACFの自動配分';
      const state=document.createElement('div');
      state.className='acf-day-state-block';
      state.innerHTML=`<div class="section-head">ACF資金状態</div><div class="group"><div class="row"><div class="row-main"><div class="row-title">開始残高</div></div><div class="row-value ${Number(row.openingBalance)<0?'red':''}">${acfNegativeMoneyHtml(row.openingBalance,{pulse:Number(row.openingBalance)<0})}</div></div><div class="row"><div class="row-main"><div class="row-title">現金余力</div><div class="row-sub">この日以降の必須支出後の最低残高と安全残高との差</div></div><div class="row-value ${Number(row.cashHeadroom)<0?'red':''}">${acfNegativeMoneyHtml(row.cashHeadroom)}</div></div><div class="row"><div class="row-main"><div class="row-title">計画支出（現金）</div><div class="row-sub">${planSource}をもとにした試算・未使用なら減りません</div></div><div class="row-value">${formatAcfOutflow(row.flexibleCash)}</div></div><div class="row"><div class="row-main"><div class="row-title">計画後の残高</div></div><div class="row-value ${Number(row.forecastBalance)<0?'red':''}">${acfNegativeMoneyHtml(row.forecastBalance,{pulse:Number(row.forecastBalance)<0})}</div></div><div class="row"><div class="row-main"><div class="row-title">安全余力</div><div class="row-sub">最低残したい金額との差</div></div><div class="row-value ${Number(row.headroom)<0?'red':''}">${acfNegativeMoneyHtml(row.headroom)}</div></div></div>`;
      anchor.parentNode.insertBefore(state,anchor)
    }catch(e){console.warn('ACF day signed state render failed',e)}
  })
};
/* === end ACF signed balances and shortage visibility === */



