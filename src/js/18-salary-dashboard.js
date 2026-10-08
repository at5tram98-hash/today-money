/* === My Money 3.0 Phase 1: salary === */
let mm3SalaryChartMode='share';
let mm3SalaryTrendRange='3M';

function mm3SalaryMonthSummary(month){
  const records=salaryMonthRows(month);
  const temps=data.tempIncomes.filter(t=>String(t.date||'').slice(0,7)===month);
  const received=sum(records.filter(r=>salaryRecordDisplayStatus(r)==='入金済み'),r=>salaryRecordCashAmount(r))
    +sum(temps.filter(t=>tempIncomeDisplayStatus(t)==='入金済み'),t=>Math.max(0,Number(t.amount)||0));
  const overdue=sum(records.filter(r=>salaryRecordDisplayStatus(r).includes('未確認')),r=>Math.max(0,Number(r.gross)||0))
    +sum(temps.filter(t=>tempIncomeDisplayStatus(t).includes('未確認')),t=>Math.max(0,Number(t.amount)||0));
  const planned=sum(records.filter(r=>salaryRecordDisplayStatus(r)==='入金予定'),r=>Math.max(0,Number(r.gross)||0))
    +sum(temps.filter(t=>tempIncomeDisplayStatus(t)==='入金予定'),t=>Math.max(0,Number(t.amount)||0));
  return{month,records,temps,received,overdue,planned,total:received+overdue+planned,tempTotal:sum(temps,t=>Math.max(0,Number(t.amount)||0))}
}
function mm3SalarySignedYen(value){
  const n=Math.round(Number(value)||0);
  if(n===0)return yen(0);
  return `${n>0?'+':'−'}${yen(Math.abs(n))}`
}
function mm3SalaryMonthDelta(month,total){
  const prev=mm3SalaryMonthSummary(addMonths(month,-1)).total,diff=total-prev;
  return{prev,diff,pct:prev>0?diff/prev*100:null}
}

function mm3SalaryDonutHtml(summary){
  const items=mm3SalaryComposition(summary);
  if(!items.length)return `<div class="mm3-salary-empty-viz">この月の給与予定はまだありません。<br>＋から給与記録を追加できます。</div>`;
  let offset=0;
  const arcs=items.map(x=>{const dash=Math.max(0,x.pct),html=`<circle class="mm3-salary-donut-arc" cx="60" cy="60" r="42" pathLength="100" style="stroke:${x.color};stroke-dasharray:${dash} ${100-dash};stroke-dashoffset:${-offset}"></circle>`;offset+=dash;return html}).join('');
  return `<div class="mm3-salary-composition"><div class="mm3-salary-donut"><svg viewBox="0 0 120 120" role="img" aria-label="${esc(monthLabel(summary.month))}の勤務先別給与構成"><circle class="mm3-salary-donut-track" cx="60" cy="60" r="42" pathLength="100"></circle>${arcs}</svg><div class="mm3-salary-donut-center"><span>${summary.month===ym()?'今月':esc(monthLabel(summary.month).replace(/\d+年/,''))}</span><strong>100%</strong></div></div><div class="mm3-salary-legend">${items.map(x=>`<div class="mm3-salary-legend-row"><i class="mm3-salary-legend-dot" style="background:${x.color}"></i><div class="mm3-salary-legend-main"><b>${esc(x.name)}</b><small>${yen(x.amount)}</small></div><strong class="mm3-salary-legend-pct">${x.pct}%</strong></div>`).join('')}</div></div>`
}
function mm3SalaryRangeMonths(endMonth,range){
  const fixed={"1M":1,"3M":3,"6M":6,"1Y":12};
  let count=fixed[range]||3;
  if(range==='ALL'){
    const months=[...data.salaryRecords.map(r=>String(salaryRecordEffectiveDate(r)||'').slice(0,7)),...data.tempIncomes.map(t=>String(t.date||'').slice(0,7))].filter(Boolean).sort();
    if(months.length){
      const [ey,em]=endMonth.split('-').map(Number),[sy,sm]=months[0].split('-').map(Number);
      count=Math.max(1,(ey-sy)*12+(em-sm)+1)
    }
  }
  return Array.from({length:count},(_,i)=>addMonths(endMonth,i-count+1))
}
function mm3SalaryTrendHtml(summary){
  const months=mm3SalaryRangeMonths(summary.month,mm3SalaryTrendRange),points=months.map(m=>({month:m,value:mm3SalaryMonthSummary(m).total}));
  const w=330,h=132,l=7,r=8,t=9,b=24,vals=points.map(x=>x.value),max=Math.max(1,...vals),min=Math.min(0,...vals),range=Math.max(1,max-min),pw=w-l-r,ph=h-t-b;
  const xy=points.map((p,i)=>({x:l+i*pw/Math.max(1,points.length-1),y:t+(max-p.value)/range*ph,...p}));
  const line=xy.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' '),area=xy.length?`${line} L${xy.at(-1).x.toFixed(1)},${t+ph} L${xy[0].x.toFixed(1)},${t+ph} Z`:'';
  const tickIds=[0,.5,1].map(q=>t+q*ph);
  return `<div class="mm3-salary-trend"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="給与推移">${tickIds.map(y=>`<line class="mm3-salary-grid" x1="${l}" x2="${l+pw}" y1="${y}" y2="${y}"></line>`).join('')}${area?`<path class="mm3-salary-trend-fill" d="${area}"></path><path class="mm3-salary-trend-line" d="${line}"></path>`:''}${xy.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="2.8" fill="var(--green)"><title>${esc(monthLabel(p.month))} ${yen(p.value)}</title></circle>`).join('')}${points.length?`<text class="mm3-salary-axis" x="${l}" y="${h-5}">${esc(monthLabel(points[0].month).replace(/\d+年/,''))}</text><text class="mm3-salary-axis" text-anchor="end" x="${l+pw}" y="${h-5}">${esc(monthLabel(points.at(-1).month).replace(/\d+年/,''))}</text>`:''}</svg><div class="mm3-salary-range">${[['1M','1M'],['3M','3M'],['6M','6M'],['1Y','1Y'],['ALL','全期間']].map(([v,lbl])=>`<button type="button" data-mm3-salary-range="${v}" class="${mm3SalaryTrendRange===v?'on':''}">${lbl}</button>`).join('')}</div></div>`
}
function mm3SalaryVizHtml(summary){return mm3SalaryChartMode==='trend'?mm3SalaryTrendHtml(summary):mm3SalaryDonutHtml(summary)}
function mm3SalaryEmployerSeries(employerId,endMonth,count=6){return Array.from({length:count},(_,i)=>{const m=addMonths(endMonth,i-count+1);return sum(salaryRecordsPayableInMonth(m).filter(r=>r.employerId===employerId),r=>salaryRecordExpectedOrReceivedAmount(r))})}
function mm3SalarySparklineHtml(values,color='var(--green)'){
  if(!values||values.length<2||values.every(v=>Number(v)===0))return `<span class="mm3-salary-spark-empty">履歴不足</span>`;
  const w=72,h=28,p=2,min=Math.min(...values),max=Math.max(...values),range=max-min||1,pts=values.map((v,i)=>({x:p+i*(w-2*p)/Math.max(1,values.length-1),y:h-p-(v-min)/range*(h-2*p)})),d=pts.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="mm3-salary-spark-line" style="stroke:${color}" d="${d}"></path></svg>`
}
function mm3SalaryNextEvent(summary){
  const today=ymd(),c=[];
  for(const r of summary.records){const date=salaryRecordEffectiveDate(r)||r.date||'';if(date&&salaryRecordDisplayStatus(r)!=='入金済み'&&(summary.month>today.slice(0,7)||date>=today))c.push({type:'salary',id:r.id,date,amount:Math.max(0,Number(r.gross)||0),name:employerById(r.employerId)?.name||'給与'})}
  for(const t of summary.temps){const date=t.date||'';if(date&&tempIncomeDisplayStatus(t)!=='入金済み'&&(summary.month>today.slice(0,7)||date>=today))c.push({type:'temp',id:t.id,date,amount:Math.max(0,Number(t.amount)||0),name:t.sourceName||t.source||'臨時収入'})}
  return c.sort((a,b)=>a.date.localeCompare(b.date))[0]||null
}
function mm3SalaryDaysUntil(date){if(!date)return'';const a=parseYmd(ymd()),b=parseYmd(date);return Math.ceil((b-a)/86400000)}
function mm3SalaryNextEventHtml(summary){
  const e=mm3SalaryNextEvent(summary);
  if(!e)return `<div class="mm3-salary-detail-group"><div class="mm3-salary-detail-row" style="pointer-events:none"><div><strong>この月の今後の入金予定はありません</strong><small>受取済み、または予定が未登録です</small></div></div></div>`;
  const days=mm3SalaryDaysUntil(e.date),dayText=days===0?'今日':days>0?`あと${days}日`:'予定日超過';
  return `<button type="button" class="mm3-salary-event" data-mm3-next-type="${e.type}" data-mm3-next-id="${esc(e.id)}"><div class="mm3-salary-event-icon">¥</div><div class="mm3-salary-event-main"><strong>${esc(e.name)}</strong><small>${dayLabel(e.date)}・${e.type==='salary'?'入金予定':'臨時収入'}</small></div><div class="mm3-salary-event-value"><strong>+${yen(e.amount)}</strong><small>${dayText}</small></div></button>`
}



function mm3RefreshSalaryViz(){
  const root=document.getElementById('mm3SalaryViz');if(!root)return;
  const summary=mm3SalaryMonthSummary(payViewMonth);
  root.innerHTML=mm3SalaryVizHtml(summary);root.classList.remove('mm3-salary-viz-switch');void root.offsetWidth;root.classList.add('mm3-salary-viz-switch');
  const title=document.getElementById('mm3SalaryVizTitle'),caption=document.getElementById('mm3SalaryVizCaption'),btn=document.getElementById('mm3SalaryVizMenu');
  if(title)title.textContent=mm3SalaryChartMode==='trend'?'給与推移':'今月の給与構成';
  if(caption)caption.textContent=mm3SalaryChartMode==='trend'?'月ごとの受取額を比較':'今月の受取見込みを100%として勤務先別に表示';
  if(btn)btn.innerHTML=`${mm3SalaryChartMode==='trend'?'給与推移':'勤務先別'} ${icon('chevronDown')}`;
  mm3BindSalaryTrendRange();
}


function renderPay(){
  const summary=mm3SalaryMonthSummary(payViewMonth),delta=mm3SalaryMonthDelta(payViewMonth,summary.total),top=document.getElementById('payTop'),content=document.getElementById('payContent'),hasNetPlans=summary.records.some(r=>r.amountBasis==='net');
  top.classList.add('mm3-salary-topbar');
  top.innerHTML=topbar('給与','',`<button class="icon-btn" id="salaryAddNav" aria-label="追加">${icon('plus')}</button><button class="icon-btn" id="salaryMenu" aria-label="メニュー">${icon('menu')}</button>`);
  const compare=delta.pct==null?`<span class="mm3-salary-compare-label">前月比較なし</span>`:`<div class="mm3-salary-primary-change ${delta.diff>=0?'green':'red'}"><span>${mm3SalarySignedYen(delta.diff)}</span><span>${delta.pct>=0?'+':''}${delta.pct.toFixed(1)}%</span><small>前月比</small></div>`;
  content.innerHTML=`<div class="mm3-salary-shell"><div class="mm3-salary-monthline"><button type="button" class="display-month-button" id="mm3SalaryMonth" aria-label="給与の表示月">${monthLabel(payViewMonth)} ${icon('chevronDown')}</button><span class="mm3-salary-compare-label">${payViewMonth===ym()?'今月':'表示月'}</span></div><div class="mm3-salary-primary"><div class="mm3-salary-primary-label">${payViewMonth===ym()?'今月':'この月'}の受取見込み</div><div class="mm3-salary-primary-value">${yen(summary.total)}</div>${compare}</div>${hasNetPlans?'<p class="mm3-salary-section-caption mm3-salary-seed-note">登録済みの給与予定は控除後の金額です。交通費は別途加算していません。</p>':''}<div class="mm3-salary-section-head"><span class="mm3-salary-section-title" id="mm3SalaryVizTitle">${mm3SalaryChartMode==='trend'?'給与推移':'今月の給与構成'}</span><button type="button" class="mm3-salary-pull" id="mm3SalaryVizMenu">${mm3SalaryChartMode==='trend'?'給与推移':'勤務先別'} ${icon('chevronDown')}</button></div><div class="mm3-salary-section-caption" id="mm3SalaryVizCaption">${mm3SalaryChartMode==='trend'?'月ごとの受取額を比較':'今月の受取見込みを100%として勤務先別に表示'}</div><div class="mm3-salary-viz" id="mm3SalaryViz">${mm3SalaryVizHtml(summary)}</div><div class="mm3-salary-metrics"><div class="mm3-salary-metric"><span>入金済み</span><strong>${yen(summary.received)}</strong></div><div class="mm3-salary-metric"><span>これから</span><strong>${yen(summary.planned)}</strong></div><div class="mm3-salary-metric"><span>未確認</span><strong>${yen(summary.overdue)}</strong></div></div><div class="mm3-salary-section-head"><span class="mm3-salary-section-title">次の入金</span></div>${mm3SalaryNextEventHtml(summary)}<div class="mm3-salary-section-head"><span class="mm3-salary-section-title">勤務先</span><button type="button" class="mm3-salary-link" id="mm3SalaryEmployerManage">分析 ›</button></div>${mm3SalaryWatchlistHtml(summary)}<div class="mm3-salary-section-head"><span class="mm3-salary-section-title">詳細</span></div>${mm3SalaryDetailHtml(summary)}</div>`;
  bindSalaryHome()
}

function bindSalaryHome(){
  const monthBtn=document.getElementById('mm3SalaryMonth');if(monthBtn)monthBtn.onclick=openPayMonthPicker;
  const vizMenu=document.getElementById('mm3SalaryVizMenu');if(vizMenu)vizMenu.onclick=e=>openMenu(e.currentTarget,[{label:`${mm3SalaryChartMode==='share'?'✓ ':''}勤務先別`,icon:mm3SalaryChartMode==='share'?'check':'chart',action:()=>{mm3SalaryChartMode='share';feedback?.selection?.();mm3RefreshSalaryViz()}},{label:`${mm3SalaryChartMode==='trend'?'✓ ':''}給与推移`,icon:mm3SalaryChartMode==='trend'?'check':'chart',action:()=>{mm3SalaryChartMode='trend';feedback?.selection?.();mm3RefreshSalaryViz()}}]);
  mm3BindSalaryTrendRange();
  const add=document.getElementById('salaryAddNav');if(add)add.onclick=()=>openSheet(`<div class="sheet-nav"><button class="nav-text" id="salaryAddClose">閉じる</button><div class="sheet-title">追加</div><span style="min-width:64px"></span></div><div class="sheet-body"><div class="action-list"><button class="secondary" id="salaryAddRecord">給与記録を追加</button><button class="secondary" id="salaryAddTemp">臨時収入を追加</button><button class="secondary" id="salaryAddEmployer">勤務先を追加</button></div></div>`,'half',root=>{root.querySelector('#salaryAddClose').onclick=requestSheetClose;root.querySelector('#salaryAddRecord').onclick=()=>{closeSheet();setTimeout(()=>openSalaryAdd(),320)};root.querySelector('#salaryAddTemp').onclick=()=>{closeSheet();setTimeout(()=>openTempIncome(ymd()),320)};root.querySelector('#salaryAddEmployer').onclick=()=>{closeSheet();setTimeout(()=>openEmployerCreate(),320)}});
  const menu=document.getElementById('salaryMenu');if(menu)menu.onclick=e=>openMenu(e.currentTarget,[{label:'給与分析',icon:'chart',action:()=>openReasonAnalysis({kind:'salary',month:payViewMonth})},{label:'表示月を変更',icon:'calendar',action:openPayMonthPicker},{label:'臨時収入の履歴',icon:'list',action:openTempIncomeHistory}]);
  document.querySelectorAll('#screen-pay [data-emp]').forEach(b=>b.onclick=()=>openEmployerDetail(b.dataset.emp));
  document.querySelectorAll('#screen-pay [data-mm3-next-type]').forEach(b=>b.onclick=()=>b.dataset.mm3NextType==='salary'?openSalaryRecordEdit(b.dataset.mm3NextId):openTempIncomeHistory());
  const records=document.getElementById('mm3SalaryRecords');if(records)records.onclick=()=>mm3SalaryRecordsOpen(payViewMonth);
  const temp=document.getElementById('salaryTempHistory');if(temp)temp.onclick=openTempIncomeHistory;
  const analysis=document.getElementById('salaryReasonAnalysis');if(analysis)analysis.onclick=()=>openReasonAnalysis({kind:'salary',month:payViewMonth});
  const employerManage=document.getElementById('mm3SalaryEmployerManage');if(employerManage)employerManage.onclick=()=>openReasonAnalysis({kind:'salary',month:payViewMonth})
}
/* === end My Money 3.0 Phase 1 === */


