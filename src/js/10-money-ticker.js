/* ===== Money Snapshot ticker ===== */
const moneyTickerControllers=new Map();

function moneyTickerTotalSeries(days=31){
  const cutoff=addDays(ymd(),-Math.max(1,days));
  const rows=(data.assetSnapshots||[])
    .filter(s=>s.bankTotal!=null&&String(s.date||'')>=cutoff)
    .map(s=>({date:String(s.date||String(s.createdAt||'').slice(0,10)),value:Number(s.bankTotal)||0,createdAt:String(s.createdAt||s.date||'')}))
    .filter(x=>x.date)
    .sort((a,b)=>(a.date+a.createdAt).localeCompare(b.date+b.createdAt));
  const latestByDay=new Map();
  for(const r of rows) latestByDay.set(r.date,r);
  return [...latestByDay.values()];
}

function moneyTickerCardSeries(cardId,paymentMonth){
  const rows=[];for(let i=-5;i<=0;i++){const m=addMonths(paymentMonth,i),agg=cardStatementsAggregate(cardId,m);if(agg.items.length||agg.amount>0)rows.push({date:m+'-01',value:agg.amount})}return rows
}

function moneyTickerSparklineHtml(points){
  const p=(points||[]).filter(x=>Number.isFinite(Number(x.value))).slice(-12);
  if(p.length<2)return '<span class="money-ticker-spark-empty">履歴<br>不足</span>';
  const w=52,h=31,pad=1.5,vals=p.map(x=>Number(x.value)||0),min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
  const xy=p.map((v,i)=>({x:pad+i*(w-pad*2)/Math.max(1,p.length-1),y:h-pad-(Number(v.value)-min)/range*(h-pad*2)}));
  const line=xy.map((c,i)=>(i?'L':'M')+c.x.toFixed(1)+','+c.y.toFixed(1)).join(' ');
  const area=`${line} L${xy[xy.length-1].x.toFixed(1)},${h} L${xy[0].x.toFixed(1)},${h} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path class="money-ticker-spark-fill" d="${area}"/><path class="money-ticker-spark-line" d="${line}"/></svg>`;
}

function moneyTickerItems(context='today',paymentMonth=ym()){
  const items=[],total=totalDeposits(),totalSeries=moneyTickerTotalSeries(31),totalDelta=totalSeries.length>1?totalSeries.at(-1).value-totalSeries[0].value:null;
  items.push({kind:'assets',id:'',title:'現金・預金',value:total,primary:totalDelta==null?'現在残高合計':`${totalDelta>=0?'+':'−'}${yen(Math.abs(totalDelta))}・30日`,secondary:'資産を表示',points:totalSeries});
  for(const b of data.banks){const d=bankDeltaInfo(b.id,31),pts=bankSnapshotSeries(b.id,31);items.push({kind:'bank',id:b.id,title:b.name,value:Number(b.balance)||0,primary:d.known?`${d.delta>=0?'+':'−'}${yen(Math.abs(d.delta))}・30日`:'30日比較は履歴不足',secondary:b.balanceAsOf?`確認 ${compactDateTime(b.balanceAsOf)}`:'残高未確認',points:pts})}
  for(const c of data.cards){const agg=cardStatementsAggregate(c.id,paymentMonth),st=agg.next,count=agg.count,multi=count>1?`・${count}件`:'';const due=st?.paymentDate?`${dayLabel(st.paymentDate)}${multi}`:(c.dueDay?`${c.dueDay}日支払い${multi}`:'支払日未設定');items.push({kind:'card',id:c.id,title:c.name,value:agg.amount,primary:`${monthLabel(paymentMonth)}請求・${cardStatementStatusLabel(agg.status)}${multi}`,secondary:due,points:moneyTickerCardSeries(c.id,paymentMonth),state:agg.status==='paid'?'paid':(!st?.paymentDate&&agg.amount>0?'warning':'')})}
  return items
}

function moneyTickerCardHtml(item,{duplicate=false,month=ym()}={}){
  const stateClass=item.state==='warning'?' is-warning':item.state==='danger'?' is-danger':item.state==='paid'?' is-paid':'';
  const valueText=yen(item.value),valueClass=valueText.length>=15?' very-large-value large-value':valueText.length>=12?' large-value':'';
  const ariaPrefix=item.kind==='card'?'請求額':item.kind==='bank'?'残高':'合計残高';
  return `<button type="button" class="money-ticker-card${stateClass}${valueClass}" data-kind="${esc(item.kind)}" data-id="${esc(item.id||'')}" data-month="${esc(month)}"${duplicate?' data-duplicate="1" tabindex="-1" aria-hidden="true"':''} aria-label="${esc(item.title)} ${ariaPrefix} ${esc(valueText)}"><div class="money-ticker-name">${esc(item.title)}</div><div class="money-ticker-value">${valueText}</div><div class="money-ticker-spark">${moneyTickerSparklineHtml(item.points)}</div><div class="money-ticker-meta"><strong>${esc(item.primary||'')}</strong><span>${esc(item.secondary||'')}</span></div></button>`;
}

function moneyTickerHtml(context='today',paymentMonth=ym()){
  const items=moneyTickerItems(context,paymentMonth);
  if(!items.length)return'';
  const primary=items.map(x=>moneyTickerCardHtml(x,{month:paymentMonth})).join('');
  const duplicate=items.map(x=>moneyTickerCardHtml(x,{duplicate:true,month:paymentMonth})).join('');
  return `<div class="money-ticker-shell" data-money-ticker-shell="${esc(context)}"><div class="money-ticker-viewport" id="moneyTicker-${esc(context)}" role="region" aria-label="銀行残高とカード請求のスナップショット"><div class="money-ticker-track"><div class="money-ticker-copy money-ticker-primary">${primary}</div><div class="money-ticker-copy money-ticker-duplicate" aria-hidden="true">${duplicate}</div></div></div></div>`;
}

function stopMoneyTicker(context){
  const ctl=moneyTickerControllers.get(context);
  if(!ctl)return;
  ctl.stopped=true;
  if(ctl.raf)cancelAnimationFrame(ctl.raf);
  if(ctl.resumeTimer)clearTimeout(ctl.resumeTimer);
  moneyTickerControllers.delete(context);
}

function openMoneyTickerItem(button){
  const kind=button?.dataset.kind,id=button?.dataset.id,month=button?.dataset.month||ym();
  if(kind==='assets')return switchTab('assets');
  if(kind==='bank'&&id)return openBankDetail(id);
  if(kind==='card'&&id)return openCardDetail(id,month);
}

function bindMoneyTicker(context='today'){
  const viewport=document.getElementById(`moneyTicker-${context}`);
  if(!viewport)return;
  stopMoneyTicker(context);

  let pointerStart=null,moved=false;
  const pause=(ms=2600)=>{
    const ctl=moneyTickerControllers.get(context);
    if(!ctl)return;
    ctl.pausedUntil=performance.now()+ms;
    viewport.closest('.money-ticker-shell')?.classList.add('money-ticker-paused');
    if(ctl.resumeTimer)clearTimeout(ctl.resumeTimer);
    ctl.resumeTimer=setTimeout(()=>viewport.closest('.money-ticker-shell')?.classList.remove('money-ticker-paused'),ms);
  };

  viewport.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY,t:performance.now()};moved=false;pause(3200)},{passive:true});
  viewport.addEventListener('pointermove',e=>{if(pointerStart&&Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>7)moved=true},{passive:true});
  viewport.addEventListener('pointerup',()=>{if(pointerStart&&performance.now()-pointerStart.t>350)moved=true;pointerStart=null;pause(2200)},{passive:true});
  viewport.addEventListener('pointercancel',()=>{pointerStart=null;pause(1600)},{passive:true});
  viewport.addEventListener('wheel',()=>pause(3200),{passive:true});
  viewport.addEventListener('focusin',()=>pause(5000));
  viewport.addEventListener('mouseenter',()=>pause(1800),{passive:true});

  viewport.querySelectorAll('.money-ticker-card').forEach(btn=>{
    btn.addEventListener('click',e=>{if(moved){e.preventDefault();e.stopPropagation();moved=false;return}openMoneyTickerItem(btn)});
  });

  const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches||data.feedbackSettings?.motion===false;
  const first=viewport.querySelector('.money-ticker-primary');
  const duplicate=viewport.querySelector('.money-ticker-duplicate');
  if(reduce||!first||!duplicate){
    duplicate?.setAttribute('hidden','');
    return;
  }
  const initialFirstWidth=first.getBoundingClientRect().width;
  if(initialFirstWidth<=viewport.clientWidth+8){
    duplicate.setAttribute('hidden','');
    return;
  }

  const ctl={stopped:false,raf:0,resumeTimer:0,pausedUntil:performance.now()+1300,last:performance.now(),position:viewport.scrollLeft};
  moneyTickerControllers.set(context,ctl);
  viewport.addEventListener('scroll',()=>{if(performance.now()<ctl.pausedUntil)ctl.position=viewport.scrollLeft},{passive:true});
  const tick=now=>{
    if(ctl.stopped||!document.body.contains(viewport)){if(ctl.raf)cancelAnimationFrame(ctl.raf);return}
    const screen=viewport.closest('.screen'),active=!!screen?.classList.contains('active');
    const firstWidth=first.getBoundingClientRect().width;
    const canMove=firstWidth>viewport.clientWidth+8;
    if(active&&document.visibilityState==='visible'&&canMove&&now>=ctl.pausedUntil){
      const dt=Math.min(40,Math.max(0,now-ctl.last));
      ctl.position+=dt*0.018;
      if(firstWidth>0&&ctl.position>=firstWidth)ctl.position-=firstWidth;
      viewport.scrollLeft=ctl.position;
    }
    ctl.last=now;
    ctl.raf=requestAnimationFrame(tick);
  };
  ctl.raf=requestAnimationFrame(tick);
}
/* ===== end Money Snapshot ticker ===== */

