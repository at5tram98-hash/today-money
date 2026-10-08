/* === My Money 3.0 Phase 3: Assets === */
let mm3AssetChartRange='1M';
let mm3AssetChartMode='actual';
let mm3AssetSortMode='balance-desc';
let mm3AssetChartState=null;

function mm3AssetRangeDays(range){return({"1W":7,"1M":31,"3M":93,"6M":186,"1Y":366})[range]||null}
function mm3AssetDateCutoff(range){const days=mm3AssetRangeDays(range);if(!days)return null;const d=parseYmd(ymd());d.setDate(d.getDate()-days+1);return ymd(d)}
function mm3AssetSignedYen(value){const n=Math.round(Number(value)||0);return n>0?`+${yen(n)}`:yen(n)}
function mm3AssetCurrentDelta(){
  const deltas=data.banks.map(b=>bankDeltaInfo(b.id,31)).filter(x=>x.known);
  if(!deltas.length)return{known:false,delta:0,pct:null};
  const delta=sum(deltas,x=>x.delta),current=totalDeposits(),base=current-delta;
  return{known:true,delta,pct:base>0?delta/base*100:null}
}
function mm3AssetAllHistoryPoints(){
  const bankIds=new Set(data.banks.map(b=>b.id)),latest=new Map(),events=[...(data.assetSnapshots||[])].filter(s=>s&&String(s.date||s.createdAt||'')).sort((a,b)=>String(a.date||a.createdAt||'').localeCompare(String(b.date||b.createdAt||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))),points=[];
  for(const s of events){
    const date=String(s.date||String(s.createdAt||'').slice(0,10)).slice(0,10);if(!date)continue;
    if(s.bankId&&bankIds.has(s.bankId)&&s.bankBalance!=null)latest.set(s.bankId,Number(s.bankBalance)||0);
    let value=null;
    if(s.bankTotal!=null)value=Number(s.bankTotal)||0;
    else if(bankIds.size&&[...bankIds].every(id=>latest.has(id)))value=[...bankIds].reduce((a,id)=>a+(Number(latest.get(id))||0),0);
    if(value==null)continue;
    const last=points.at(-1);if(last&&last.date===date)last.value=value;else points.push({date,value});
  }
  const today=ymd(),current=totalDeposits();
  if(!points.length||points.at(-1).date<today){points.push({date:today,value:current})}else if(points.at(-1).date===today){points.at(-1).value=current}
  return points.sort((a,b)=>a.date.localeCompare(b.date))
}
function mm3AssetActualPoints(range=mm3AssetChartRange){
  const all=mm3AssetAllHistoryPoints(),cutoff=mm3AssetDateCutoff(range);if(!cutoff)return all;
  return all.filter(p=>p.date>=cutoff)
}
function mm3AssetForecastPoints(range=mm3AssetChartRange){
  const days=mm3AssetRangeDays(range)||366,endDate=addDays(ymd(),Math.max(1,days)-1);
  let forecast;try{forecast=mm3ForecastThrough(endDate)}catch(e){return[]}
  return (forecast?.rows||[]).filter(r=>r.date>=ymd()&&r.date<=endDate).map(r=>({date:r.date,value:Number(r.forecastBalance)||0,row:r}))
}
function mm3AssetDisplayPoints(){return mm3AssetChartMode==='forecast'?mm3AssetForecastPoints(mm3AssetChartRange):mm3AssetActualPoints(mm3AssetChartRange)}
function mm3AssetChartModel(points){
  const source=points||[],maxPoints=52,step=Math.max(1,Math.ceil(source.length/maxPoints)),rows=source.filter((_,i)=>i%step===0||i===source.length-1),w=342,h=168,l=4,r=42,t=14,b=23,vals=rows.map(x=>Number(x.value)||0);
  if(!rows.length)return{w,h,l,r,t,b,points:[],min:0,max:1,span:1,pw:w-l-r,ph:h-t-b,zeroY:null};
  let min=Math.min(...vals),max=Math.max(...vals);if(min<0){min=Math.min(min,0);max=Math.max(max,0)};let span=Math.max(1,max-min),pad=Math.max(1,span*.09);min-=pad;max+=pad;span=max-min;
  const pw=w-l-r,ph=h-t-b,xy=rows.map((row,i)=>({...row,x:l+i*pw/Math.max(1,rows.length-1),y:t+(max-(Number(row.value)||0))/span*ph})),zeroY=min<=0&&max>=0?t+(max/span)*ph:null;
  return{w,h,l,r,t,b,pw,ph,min,max,span,points:xy,zeroY}
}
function mm3AssetCompactMoney(value){
  const n=Number(value)||0,a=Math.abs(n),sign=n<0?'−':'';
  if(a>=1000000)return `${sign}${(a/1000000).toFixed(a>=10000000?0:1)}M`;
  if(a>=1000)return `${sign}${(a/1000).toFixed(a>=100000?0:1)}k`;
  return `${sign}${Math.round(a)}`
}
function mm3AssetChartHtml(){
  const points=mm3AssetDisplayPoints();mm3AssetChartState={points,mode:mm3AssetChartMode,range:mm3AssetChartRange};
  if(points.length<2)return `<div class="mm3-assets-empty-chart">${mm3AssetChartMode==='forecast'?'ATF予測に必要な資金予測がまだありません。':'この期間の残高履歴が不足しています。'}<br>${mm3AssetChartMode==='forecast'?'ATFの予定と対象期間を確認してください。':'残高を更新すると推移が蓄積されます。'}</div>`;
  const m=mm3AssetChartModel(points),line=m.points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),area=`${line} L${m.points.at(-1).x.toFixed(1)},${(m.t+m.ph).toFixed(1)} L${m.points[0].x.toFixed(1)},${(m.t+m.ph).toFixed(1)} Z`,ys=[m.t,m.t+m.ph*.5,m.t+m.ph],ticks=[m.max,m.max-m.span*.5,m.min],modeClass=mm3AssetChartMode==='forecast'?'forecast':'';
  return `<div class="mm3-assets-chart" id="mm3AssetChart"><svg viewBox="0 0 ${m.w} ${m.h}" preserveAspectRatio="none" role="img" aria-label="${mm3AssetChartMode==='forecast'?'ATF予測':'資産実績'}"><line class="mm3-assets-grid" x1="${m.l}" x2="${m.l+m.pw}" y1="${ys[0]}" y2="${ys[0]}"></line><line class="mm3-assets-grid" x1="${m.l}" x2="${m.l+m.pw}" y1="${ys[1]}" y2="${ys[1]}"></line><line class="mm3-assets-grid" x1="${m.l}" x2="${m.l+m.pw}" y1="${ys[2]}" y2="${ys[2]}"></line>${m.zeroY!=null?`<line class="mm3-assets-zero" x1="${m.l}" x2="${m.l+m.pw}" y1="${m.zeroY}" y2="${m.zeroY}"></line>`:''}<path class="mm3-assets-area ${modeClass}" d="${area}"></path><path class="mm3-assets-line ${modeClass}" d="${line}"></path><line class="mm3-assets-guide" data-mm3-assets-guide x1="0" x2="0" y1="${m.t}" y2="${m.t+m.ph}"></line><circle class="mm3-assets-selected ${modeClass}" data-mm3-assets-selected cx="0" cy="0" r="4.2"></circle>${ticks.map((v,i)=>`<text class="mm3-assets-axis" x="${m.l+m.pw+5}" y="${ys[i]+3}">${esc(mm3AssetCompactMoney(v))}</text>`).join('')}<text class="mm3-assets-axis" x="${m.l}" y="${m.h-4}">${esc(m.points[0].date.slice(5))}</text><text class="mm3-assets-axis" text-anchor="end" x="${m.l+m.pw}" y="${m.h-4}">${esc(m.points.at(-1).date.slice(5))}</text></svg><div class="mm3-assets-tooltip" data-mm3-assets-tooltip></div></div>`
}
function mm3AssetRangeHtml(){const ranges=mm3AssetChartMode==='forecast'?[['1W','1W'],['1M','1M'],['3M','3M'],['6M','6M'],['1Y','1Y']]:[['1W','1W'],['1M','1M'],['3M','3M'],['6M','6M'],['1Y','1Y'],['ALL','全期間']];if(mm3AssetChartMode==='forecast'&&mm3AssetChartRange==='ALL')mm3AssetChartRange='1Y';return `<div class="mm3-assets-range">${ranges.map(([v,l])=>`<button type="button" data-mm3-asset-range="${v}" class="${mm3AssetChartRange===v?'on':''}">${l}</button>`).join('')}</div>`}


function mm3AssetWatchlistHtml(){
  const banks=mm3AssetSortedBanks();if(!banks.length)return `<div class="empty">銀行口座がありません。</div>`;
  return `<div class="mm3-assets-watchlist" id="mm3AssetWatchlist">${banks.map(b=>{const pts=bankSnapshotSeries(b.id,31),d=bankDeltaInfo(b.id,31),change=d.known?`${d.delta>=0?'+':'−'}${yen(Math.abs(d.delta))}`:'比較不可',sub=b.balanceAsOf?`確認 ${compactDateTime(b.balanceAsOf)}`:(b.label||'残高未確認');return `<button type="button" class="mm3-assets-watchrow mm3-assets-sort-flip" data-bank="${b.id}" data-balance="${Number(b.balance)||0}" data-updated="${esc(b.balanceAsOf||'')}" data-name="${esc(b.name)}"><div class="mm3-assets-watch-main"><strong>${esc(b.name)}</strong><small>${esc(sub)}</small></div><div class="mm3-assets-spark">${miniSparklineHtml(pts.slice(-12))}</div><div class="mm3-assets-watch-value"><strong>${yen(b.balance)}</strong><small class="${d.known?(d.delta>=0?'green':'red'):''}">${change}</small></div></button>`}).join('')}</div>`
}

function mm3AssetForecastMetric(){const atf=mm3AtfForMonth(ym());return atf?.available?{known:true,value:atf.monthEndForecast}:{known:false,value:0}}
function mm3RefreshAssetChart(){
  const root=document.getElementById('mm3AssetChartBlock');if(!root)return;root.innerHTML=`${mm3AssetChartHtml()}${mm3AssetRangeHtml()}`;const caption=document.getElementById('mm3AssetCaption');if(caption)caption.textContent=mm3AssetChartMode==='forecast'?'登録済みの予定に基づくATF残高。今回の試算は2026年11月30日まで。':'登録済みの残高履歴だけを使用。グラフをなぞると日付と残高を確認できます。';root.classList.remove('mm3-assets-chart-switch');void root.offsetWidth;root.classList.add('mm3-assets-chart-switch');mm3BindAssetChart();
}
function mm3AssetForecastIsHeavy(range=mm3AssetChartRange){return mm3AssetChartMode==='forecast'&&['3M','6M','1Y','ALL'].includes(range)}
function mm3RefreshAssetChartMaybeBusy(){if(mm3AssetForecastIsHeavy())return runWithBusy(()=>mm3RefreshAssetChart(),{title:'資産予測を計算中…',sub:`${mm3AssetChartRange==='1Y'?'1年間':'長期'}の給与・カード・固定支払いを確認しています`});return mm3RefreshAssetChart()}
function mm3RenderPaymentsMaybeBusy(month=paymentHomeMonth()){const [cy,cm]=ym().split('-').map(Number),[ty,tm]=String(month).split('-').map(Number),diff=(ty-cy)*12+(tm-cm);if(diff>=2)return runWithBusy(()=>renderPayments(),{title:'ATFを計算中…',sub:`${monthLabel(month)}までの資金見通しを計算しています`});return renderPayments()}


function mm3OpenAssetHistory(){
  const history=[...(data.assetSnapshots||[])].sort((a,b)=>String(b.createdAt||b.date).localeCompare(String(a.createdAt||a.date))).slice(0,40);
  pushView('残高履歴',`<div class="group">${history.length?history.map(s=>{const b=bankById(s.bankId);return `<div class="row"><div class="row-main"><div class="row-title">${esc(b?.name||'銀行残高')}</div><div class="row-sub">${esc(String(s.date||''))}・${esc(s.memo||'残高更新')}</div></div><div class="row-value">${yen(s.bankBalance??s.bankTotal??0)}</div></div>`}).join(''):`<div class="row"><div class="row-main"><div class="row-title">残高履歴はまだありません</div></div></div>`}</div>`)
}
function mm3BindAssets(){
  document.querySelector('#screen-assets [data-financial-update]')?.addEventListener('click',()=>openFinancialUpdates('banks',ym()));
  document.getElementById('mm3AssetHistoryRow')?.addEventListener('click',mm3OpenAssetHistory);
  const mode=document.getElementById('mm3AssetMode');if(mode)mode.onclick=e=>openMenu(e.currentTarget,[{label:`${mm3AssetChartMode==='actual'?'✓ ':''}実績`,icon:mm3AssetChartMode==='actual'?'check':'chart',action:()=>{mm3AssetChartMode='actual';feedback?.selection?.();mode.innerHTML=`実績 ${icon('chevronDown')}`;mm3RefreshAssetChart()}},{label:`${mm3AssetChartMode==='forecast'?'✓ ':''}ATF予測`,icon:mm3AssetChartMode==='forecast'?'check':'chart',action:()=>{mm3AssetChartMode='forecast';if(mm3AssetChartRange==='ALL')mm3AssetChartRange='1Y';feedback?.selection?.();mode.innerHTML=`ATF予測 ${icon('chevronDown')}`;mm3RefreshAssetChartMaybeBusy()}}]);
  const sort=document.getElementById('mm3AssetSort');if(sort)sort.onclick=e=>openMenu(e.currentTarget,[{label:`${mm3AssetSortMode==='balance-desc'?'✓ ':''}残高が多い順`,icon:mm3AssetSortMode==='balance-desc'?'check':'list',action:()=>mm3AssetApplySort('balance-desc')},{label:`${mm3AssetSortMode==='balance-asc'?'✓ ':''}残高が少ない順`,icon:mm3AssetSortMode==='balance-asc'?'check':'list',action:()=>mm3AssetApplySort('balance-asc')},{label:`${mm3AssetSortMode==='updated'?'✓ ':''}更新が新しい順`,icon:mm3AssetSortMode==='updated'?'check':'calendar',action:()=>mm3AssetApplySort('updated')},{label:`${mm3AssetSortMode==='name'?'✓ ':''}名前順`,icon:mm3AssetSortMode==='name'?'check':'list',action:()=>mm3AssetApplySort('name')},{label:'手動（第4回）',icon:'menu',action:()=>showToast('手動並べ替えは第4回で仕上げます')}]);
  mm3BindAssetChart();
  document.querySelectorAll('#screen-assets [data-bank]').forEach(b=>b.onclick=()=>openBankDetail(b.dataset.bank));
  const quick=document.getElementById('mm3AssetQuick');if(quick)quick.onclick=openQuickBank;
  const timeline=document.getElementById('mm3AssetTimeline');if(timeline)timeline.onclick=()=>openMoneyTimeline();
  const transfer=document.getElementById('mm3AssetTransfer');if(transfer)transfer.onclick=openTransferPlans;
  const acf=document.getElementById('mm3AssetAcf');if(acf)acf.onclick=openAcf;
  const add=document.getElementById('assetAddBankOnly');if(add)add.onclick=()=>openAddBank();
  const menu=document.getElementById('assetMenuSimple');if(menu)menu.onclick=e=>openMenu(e.currentTarget,[{label:'銀行残高をクイック更新',icon:'bank',action:openQuickBank},{label:'残高履歴',icon:'list',action:mm3OpenAssetHistory},{label:'生活費の見通し',icon:'chart',action:openAcf},{label:'お知らせ',icon:'bell',action:openNotices}])
}

function renderAssets(){
  const deposits=totalDeposits(),delta=mm3AssetCurrentDelta(),forecastMetric=mm3AssetForecastMetric(),top=document.getElementById('assetsTop'),content=document.getElementById('assetsContent');
  top.classList.add('mm3-assets-topbar');top.innerHTML=topbar('資産','',`${actionBtn('plus','assetAddBankOnly','追加')}<button class="icon-btn" id="assetMenuSimple" aria-label="メニュー">${icon('menu')}</button>`);
  const change=delta.known?`<div class="mm3-assets-primary-change ${delta.delta>=0?'green':'red'}"><span>${mm3AssetSignedYen(delta.delta)}</span>${delta.pct==null?'':`<span>${delta.pct>=0?'+':''}${delta.pct.toFixed(1)}%</span>`}<small>直近30日</small></div>`:`<div class="mm3-assets-primary-change"><small>30日比較は履歴が増えると表示されます</small></div>`;
  content.innerHTML=`<div class="mm3-assets-shell"><div class="mm3-assets-primary"><div class="mm3-assets-primary-label">現金・預金</div><div class="mm3-assets-primary-value">${yen(deposits)}</div>${change}</div><div class="mm3-assets-divider"></div><div class="mm3-assets-section-head"><span class="mm3-assets-section-title">資産推移</span><button type="button" class="mm3-assets-menu-btn" id="mm3AssetMode">${mm3AssetChartMode==='forecast'?'ATF予測':'実績'} ${icon('chevronDown')}</button></div><div class="mm3-assets-caption" id="mm3AssetCaption">${mm3AssetChartMode==='forecast'?'登録済みの予定に基づくATF残高。今回の試算は2026年11月30日まで。':'登録済みの残高履歴だけを使用。グラフをなぞると日付と残高を確認できます。'}</div><div id="mm3AssetChartBlock">${mm3AssetChartHtml()}${mm3AssetRangeHtml()}</div><div class="mm3-assets-metrics"><div class="mm3-assets-metric"><span>今日</span><strong>${yen(deposits)}</strong></div><div class="mm3-assets-metric"><span>30日変化</span><strong class="${delta.known?(delta.delta>=0?'green':'red'):''}">${delta.known?mm3AssetSignedYen(delta.delta):'比較不可'}</strong></div><div class="mm3-assets-metric"><span>ATF月末予測</span><strong class="${forecastMetric.known&&forecastMetric.value<0?'red':''}">${forecastMetric.known?yen(forecastMetric.value):'未設定'}</strong></div></div><div class="mm3-assets-section-head"><span class="mm3-assets-section-title">口座</span><button type="button" class="mm3-assets-menu-btn" id="mm3AssetSort">${mm3AssetSortLabel()} ${icon('chevronDown')}</button></div>${mm3AssetWatchlistHtml()}${financialUpdateAccessHtml('banks')}<div class="mm3-assets-section-head"><span class="mm3-assets-section-title">詳細</span><button type="button" class="atf-open" id="mm3AssetHistoryTop">残高履歴 ›</button></div>${mm3AssetDetailHtml()}</div>`;
  mm3BindAssets();const hist=document.getElementById('mm3AssetHistoryTop');if(hist)hist.onclick=mm3OpenAssetHistory
}
/* === end My Money 3.0 Phase 3 === */



