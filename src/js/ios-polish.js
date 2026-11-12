/* 第16段: ヘルスケアのような支出グラフ（D-002）・検索のフィルタと変形（Q-016・H-002）・領域ごとの読み込みと再試行（N-006） */

/* ---------- D-002 支出グラフ（日／週／月／6か月／年） ---------- */
const SPEND_RANGES=[['D','日'],['W','週'],['M','月'],['6M','6か月'],['Y','年']];
const spendChartState={day:{range:'W',offset:0,sel:null},month:{range:'M',offset:0,sel:null},analysis:{range:'M',offset:0,sel:null}};
function spendAddDays(s,n){const d=parseYmd(s);d.setDate(d.getDate()+n);return ymd(d)}
function spendMonthDays(month){const [y,m]=month.split('-').map(Number);return new Date(y,m,0).getDate()}
function spendHourOf(t){const at=t.createdAt?new Date(t.createdAt):null;return at&&!isNaN(at)&&ymd(at)===t.date?at.getHours():12}
function spendWeekStart(s){const d=parseYmd(s),ws=Number(appPrefs().weekStart)||0;d.setDate(d.getDate()-((d.getDay()-ws+7)%7));return ymd(d)}
function spendShortDay(s){const d=parseYmd(s);return `${d.getMonth()+1}/${d.getDate()}`}
function spendJpDay(s){const d=parseYmd(s);return `${d.getMonth()+1}月${d.getDate()}日`}
function spendSumRange(start,end){let total=0;for(let d=start;d<=end;d=spendAddDays(d,1))total+=spentDate(d);return total}
function spendAnchor(scope){return scope==='day'?trackingDate:scope==='month'||scope==='analysis'?(currentMonth===ym()?ymd():`${currentMonth}-${pad(spendMonthDays(currentMonth))}`):ymd()}
/* 区切りごとの集計。start/end は日付（日の表示では時刻 hour も持つ） */
function spendSeries(scope){
  const st=spendChartState[scope],anchor=spendAnchor(scope),today=ymd(),b=[];let title='',unit='日',start,end;
  if(st.range==='D'){
    const day=spendAddDays(anchor,st.offset);start=end=day;title=dayLabel(day);unit='時間';
    const tx=txForDate(day);for(let h=0;h<24;h++)b.push({label:`${h}時`,tick:h%6===0?`${h}時`:'',start:day,end:day,hour:h,value:sum(tx.filter(t=>spendHourOf(t)===h),t=>t.amount),future:day>today});
  }else if(st.range==='W'){
    start=spendAddDays(spendWeekStart(anchor),st.offset*7);end=spendAddDays(start,6);title=`${spendJpDay(start)}〜${spendJpDay(end)}`;
    for(let i=0;i<7;i++){const d=spendAddDays(start,i),w='日月火水木金土'[parseYmd(d).getDay()];b.push({label:dayLabel(d),tick:w,start:d,end:d,value:spentDate(d),future:d>today})}
  }else if(st.range==='M'){
    const month=addMonths(anchor.slice(0,7),st.offset),n=spendMonthDays(month);start=`${month}-01`;end=`${month}-${pad(n)}`;title=monthLabel(month);
    for(let i=1;i<=n;i++){const d=`${month}-${pad(i)}`;b.push({label:dayLabel(d),tick:[1,8,15,22,29].includes(i)?String(i):'',start:d,end:d,value:spentDate(d),future:d>today})}
  }else if(st.range==='6M'){
    const last=addMonths(anchor.slice(0,7),st.offset*6),first=addMonths(last,-5);start=spendWeekStart(`${first}-01`);end=`${last}-${pad(spendMonthDays(last))}`;title=`${monthLabel(first)}〜${monthLabel(last).replace(/^\d+年/,'')}`;unit='週';
    let prevMonth='';for(let d=start;d<=end;d=spendAddDays(d,7)){const e=spendAddDays(d,6)>end?end:spendAddDays(d,6),m=d.slice(0,7),tick=m!==prevMonth&&d.slice(8)<='07'?`${Number(m.slice(5))}月`:'';if(tick)prevMonth=m;b.push({label:`${spendJpDay(d)}〜${spendJpDay(e)}の週`,tick,start:d,end:e,value:spendSumRange(d,e),future:d>today})}
  }else{
    const year=Number(anchor.slice(0,4))+st.offset;start=`${year}-01-01`;end=`${year}-12-31`;title=`${year}年`;unit='か月';
    for(let i=1;i<=12;i++){const m=`${year}-${pad(i)}`;b.push({label:monthLabel(m),tick:i%3===1?`${i}月`:'',start:`${m}-01`,end:`${m}-${pad(spendMonthDays(m))}`,month:m,value:spentMonth(m),future:`${m}-01`>today})}
  }
  const total=sum(b,x=>x.value),counted=b.filter(x=>!x.future),avg=counted.length?Math.round(sum(counted,x=>x.value)/counted.length):0;
  return {buckets:b,title,unit,start,end,total,avg,range:st.range};
}
function spendNiceMax(v){if(v<=0)return 1000;const p=Math.pow(10,Math.floor(Math.log10(v))),n=v/p;return (n<=1?1:n<=2?2:n<=2.5?2.5:n<=5?5:10)*p}
function spendAxisYen(v){return v>=10000?`${Math.round(v/1000)/10}万`:v>=1000?`${Math.round(v/100)/10}千`:String(v)}
function spendChartSvg(s,sel){
  const W=340,H=176,top=10,bottom=22,right=40,n=s.buckets.length,max=spendNiceMax(Math.max(...s.buckets.map(x=>x.value),s.avg)),plotW=W-right,step=plotW/n,bw=Math.max(2,Math.min(26,step*.62)),y=v=>top+(H-top-bottom)*(1-v/max),pct=(v,t)=>(v/t*100).toFixed(2)+'%';
  const grid=[0,.5,1].map(f=>`<line class="sc-grid" x1="0" x2="${plotW}" y1="${y(max*f)}" y2="${y(max*f)}"/>`).join('');
  const axis=[0,.5,1].map(f=>`<span class="sc-axis" style="top:${pct(y(max*f),H)}">${f===0?'0':spendAxisYen(max*f)}</span>`).join('');
  const bars=s.buckets.map((b,i)=>{const x=i*step+(step-bw)/2,h=Math.max(b.value>0?2:0,(H-top-bottom)-(y(b.value)-top)),r=Math.min(bw/2,4);return h?`<path class="sc-bar${sel===i?' on':''}${sel!=null&&sel!==i?' dim':''}" d="M${x},${y(0)} v${-(h-r)} q0,${-r} ${r},${-r} h${bw-2*r} q${r},0 ${r},${r} v${h-r} z"/>`:''}).join('');
  const ticks=s.buckets.map((b,i)=>b.tick?`<span class="sc-tick" style="left:${pct(i*step+step/2,W)}">${esc(b.tick)}</span>`:'').join('');
  const avg=s.avg>0&&s.range!=='D'?`<line class="sc-avg" x1="0" x2="${plotW}" y1="${y(s.avg)}" y2="${y(s.avg)}"/>`:'';
  const cursor=sel!=null?`<line class="sc-cursor" x1="${sel*step+step/2}" x2="${sel*step+step/2}" y1="${top-6}" y2="${y(0)}"/>`:'';
  return `<svg class="sc-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" data-step="${step}" data-plotw="${plotW}">${grid}${avg}${cursor}${bars}</svg><div class="sc-labels" aria-hidden="true">${axis}${ticks}</div>`;
}
function spendBreakdown(start,end,hour=null){
  const tx=data.transactions.filter(t=>t.date>=start&&t.date<=end&&(hour==null||spendHourOf(t)===hour)),by=new Map();
  for(const t of tx)by.set(t.category,(by.get(t.category)||0)+Number(t.amount||0));
  const total=sum(tx,t=>t.amount);return {tx,total,cats:[...by].map(([name,value])=>({name,value,color:catByName(name).color,share:total?Math.round(value/total*100):0})).sort((a,b)=>b.value-a.value)};
}
function spendCatRowsHtml(cats,attr){return cats.map(c=>`<button type="button" class="row press sc-cat" ${attr}="${esc(c.name)}"><span class="sc-cat-dot" style="--c:${c.color}" aria-hidden="true"></span><div class="row-main"><div class="row-title">${esc(c.name)}</div><div class="sc-cat-bar" aria-hidden="true"><i style="width:${Math.max(3,c.share)}%;background:${c.color}"></i></div></div><div class="row-value">${yen(c.value)}<small>${c.share}%</small></div><span class="chev">${icon('chevronRight')}</span></button>`).join('')}
function spendChartHeadHtml(s,sel){
  const b=sel!=null?s.buckets[sel]:null;
  if(b)return `<div class="sc-head is-sel"><div class="sc-kicker">${esc(b.label)}</div><div class="sc-value">${yen(b.value)}</div><div class="sc-range">棒を押すと内訳を表示</div></div>`;
  const kicker=s.range==='D'?'合計':'合計';const avgText=s.range==='D'?`${s.buckets.filter(x=>x.value>0).length}時間に支出`:`1${s.unit}の平均 ${yen(s.avg)}`;
  return `<div class="sc-head"><div class="sc-kicker">${kicker}</div><div class="sc-value">${yen(s.total)}</div><div class="sc-range">${esc(s.title)}<span aria-hidden="true">・</span>${esc(avgText)}</div></div>`;
}
function spendChartCardHtml(scope){
  const st=spendChartState[scope],s=spendSeries(scope),bd=spendBreakdown(s.start,s.end),label=`${s.title}の支出は${yen(s.total)}。${s.range==='D'?'':`1${s.unit}の平均は${yen(s.avg)}。`}左右の矢印キーで期間を選び、Enterで内訳を開きます。`;
  return `<section class="sc-card" data-spend-chart="${scope}"><div class="sc-top"><div class="glass-seg sc-seg" role="radiogroup" aria-label="グラフの期間">${SPEND_RANGES.map(([v,l])=>`<button type="button" role="radio" aria-checked="${st.range===v}" data-sc-range="${v}">${l}</button>`).join('')}</div></div>
  <div class="sc-headrow">${spendChartHeadHtml(s,st.sel)}<div class="sc-pager"><button type="button" class="sc-page" data-sc-page="-1" aria-label="前の期間">${icon('chevronLeft')}</button><button type="button" class="sc-page" data-sc-page="1" aria-label="次の期間"${st.offset>=0?' disabled':''}>${icon('chevronRight')}</button></div></div>
  <div class="sc-plot" tabindex="0" role="group" aria-roledescription="グラフ" aria-label="${esc(label)}">${spendChartSvg(s,st.sel)}</div>
  ${bd.cats.length?`<div class="sc-sub">カテゴリ別</div><div class="group sc-cats">${spendCatRowsHtml(bd.cats.slice(0,6),'data-sc-cat')}</div>`:`<div class="sc-empty">${esc(s.title)}の支出はまだありません</div>`}</section>`;
}
function bindSpendCharts(root=document){
  root.querySelectorAll('[data-spend-chart]').forEach(card=>{
    const scope=card.dataset.spendChart,st=spendChartState[scope];
    const redraw=()=>{const fresh=document.createElement('div');fresh.innerHTML=spendChartCardHtml(scope);const next=fresh.firstElementChild;card.replaceWith(next);bindSpendCharts(next.parentElement)};
    card.querySelectorAll('[data-sc-range]').forEach(b=>b.onclick=()=>{if(st.range===b.dataset.scRange)return;st.range=b.dataset.scRange;st.offset=0;st.sel=null;feedback.selection?.();redraw()});
    card.querySelectorAll('[data-sc-page]').forEach(b=>b.onclick=()=>{st.offset=Math.min(0,st.offset+Number(b.dataset.scPage));st.sel=null;redraw()});
    card.querySelectorAll('[data-sc-cat]').forEach(b=>b.onclick=()=>{const s=spendSeries(scope);openSpendBreakdown({start:s.start,end:s.end,title:s.title,category:b.dataset.scCat})});
    const plot=card.querySelector('.sc-plot'),svg=plot.querySelector('svg');if(!svg)return;
    const s=spendSeries(scope),n=s.buckets.length;
    const indexAt=x=>{const g=plot.querySelector('svg'),r=g.getBoundingClientRect(),plotW=Number(g.dataset.plotw),px=(x-r.left)/r.width*340;return Math.max(0,Math.min(n-1,Math.floor(px/(plotW/n))))};
    const paint=i=>{if(st.sel===i)return;st.sel=i;const head=card.querySelector('.sc-head');head.outerHTML=spendChartHeadHtml(s,i);plot.innerHTML=spendChartSvg(s,i);if(i!=null)feedback.selection?.()};
    const open=i=>{const b=s.buckets[i];if(!b)return;openSpendBreakdown({start:b.start,end:b.end,hour:b.hour??null,title:b.label})};
    let down=null;
    plot.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,moved:false,scrub:false,id:e.pointerId,t:Date.now()}});
    plot.addEventListener('pointermove',e=>{if(!down||e.pointerId!==down.id)return;const dx=e.clientX-down.x,dy=e.clientY-down.y;if(!down.scrub&&Math.abs(dx)>6&&Math.abs(dx)>Math.abs(dy)){down.scrub=true;down.moved=true;try{plot.setPointerCapture(e.pointerId)}catch(_){}}else if(!down.scrub&&Math.abs(dy)>8){down=null;return}if(down.scrub){e.preventDefault();paint(indexAt(e.clientX))}});
    plot.addEventListener('pointerup',e=>{if(!down)return;const d=down;down=null;if(!d.moved)open(indexAt(e.clientX))});
    plot.addEventListener('pointercancel',()=>{down=null});
    plot.addEventListener('touchmove',e=>{if(down?.scrub)e.preventDefault()},{passive:false});
    plot.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const i=st.sel==null?(e.key==='ArrowRight'?0:n-1):Math.max(0,Math.min(n-1,st.sel+(e.key==='ArrowRight'?1:-1)));paint(i);plot.setAttribute('aria-label',`${s.buckets[i].label} ${yen(s.buckets[i].value)}`)}else if(e.key==='Enter'&&st.sel!=null){e.preventDefault();open(st.sel)}else if(e.key==='Escape'&&st.sel!=null){paint(null)}});
  });
}
/* 期間の内訳（棒・カテゴリを押した先） */
function openSpendBreakdown({start,end,hour=null,title='',category=''}){
  const bd=spendBreakdown(start,end,hour),list=(category?bd.tx.filter(t=>t.category===category):bd.tx).sort((a,b)=>String(b.date).localeCompare(String(a.date))||String(b.createdAt).localeCompare(String(a.createdAt))),total=category?sum(list,t=>t.amount):bd.total;
  const head=category?`${title}・${category}`:title;
  pushView(category||'支出の内訳',`<div class="sc-detail"><div class="sc-detail-hero"><div class="sc-kicker">${esc(head)}</div><div class="sc-value">${yen(total)}</div><div class="sc-range">${list.length}件の支出</div></div>
  ${!category&&bd.cats.length?`<h2 class="sc-section">カテゴリ</h2><div class="group sc-cats">${spendCatRowsHtml(bd.cats,'data-sb-cat')}</div>`:''}
  <h2 class="sc-section">取引</h2>${list.length?`<div class="group">${list.map(t=>`<button type="button" class="row press" data-sb-tx="${esc(t.id)}"><span class="sc-cat-dot" style="--c:${catByName(t.category).color}" aria-hidden="true"></span><div class="row-main"><div class="row-title">${esc(t.merchant||t.category)}</div><div class="row-sub">${esc(t.category)}・${dayLabel(t.date)}</div></div><div class="row-value">${yen(t.amount)}</div><span class="chev">${icon('chevronRight')}</span></button>`).join('')}</div>`:`<div class="sc-empty">この期間の支出はありません</div>`}</div>`,root=>{
    root.querySelectorAll('[data-sb-cat]').forEach(b=>b.onclick=()=>openSpendBreakdown({start,end,hour,title,category:b.dataset.sbCat}));
    root.querySelectorAll('[data-sb-tx]').forEach(b=>b.onclick=()=>openTransactionDetail(b.dataset.sbTx));
  });
}

/* ---------- H-002 虫眼鏡から検索欄への連続変形（閉じると逆再生） ---------- */
let searchMorphOrigin=null;
document.addEventListener('pointerdown',e=>{const b=e.target.closest?.('#todaySearch,#monthSearch,#payrootSearch');if(b)searchMorphOrigin=b},true);
function searchMotionReduced(){return mm3MotionReduced()}
function searchMorphShape(rect){const el=document.createElement('div');el.className='gsearch-morph';el.setAttribute('aria-hidden','true');el.innerHTML=`${icon('search')}<span>取引・給与・口座・カード・設定を検索</span>`;Object.assign(el.style,{left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px'});document.body.appendChild(el);return el}
function searchMorphFrames(a,b){const f=r=>({left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',paddingLeft:(r.width<64?Math.max(0,(r.width-20)/2):12)+'px'});return [f(a),f(b)]}
function openGlobalSearch(initialScope='all'){
  const origin=searchMorphOrigin&&searchMorphOrigin.isConnected&&searchMorphOrigin.getClientRects().length?searchMorphOrigin:document.querySelector('#todaySearch');searchMorphOrigin=null;
  const from=origin?.getBoundingClientRect(),reduced=searchMotionReduced();
  openGlobalSearchView(initialScope);
  const v=document.getElementById(pushStack.at(-1)?.id);if(!v||!from||!from.width||reduced)return v;
  v.classList.add('gsearch-morphing');
  const field=v.querySelector('.gsearch-field'),to=field.getBoundingClientRect(),shape=searchMorphShape(from);
  const anim=shape.animate(searchMorphFrames(from,to),{duration:260,easing:'cubic-bezier(.2,.85,.25,1)',fill:'forwards'});
  shape.querySelector('span').animate([{opacity:0},{opacity:1}],{duration:200,delay:80,fill:'forwards'});
  const done=()=>{shape.remove();v.classList.remove('gsearch-morphing')};anim.onfinish=done;anim.oncancel=done;
  const dispose=v.__dispose;
  v.__dispose=()=>{try{dispose?.()}catch(e){}
    if(searchMotionReduced()||/translateX/.test(v.style.transform)||!origin?.isConnected)return;
    const a=v.querySelector('.gsearch-field')?.getBoundingClientRect(),b=origin.getBoundingClientRect();if(!a||!b.width)return;
    v.classList.add('gsearch-closing');const back=searchMorphShape(a);back.querySelector('span').style.opacity='0';
    const r=back.animate(searchMorphFrames(a,b),{duration:240,easing:'cubic-bezier(.3,.7,.3,1)',fill:'forwards'});
    const fin=()=>back.remove();r.onfinish=fin;r.oncancel=fin;
  };
  return v;
}

/* ---------- N-006 データ領域だけの読み込み表示と、その領域だけの再試行 ---------- */
/* area: 要素・セレクタ・要素を返す関数。計算中はその領域だけを骨格で覆い、短い日本語の状態行を出す。
   失敗したら前の表示（金額）を残したまま、領域の上に「再試行」を出す。保存の待機（runWithBusy）は変えない。 */
function areaEl(area){return typeof area==='function'?area():typeof area==='string'?document.querySelector(area):area}
function areaSkeletonHtml(title,sub){return `<div class="area-status" role="status" aria-live="polite">${busyAnimationHtml('small')}<span><b>${esc(title)}</b>${sub?`<small>${esc(sub)}</small>`:''}</span></div><div class="area-skel-rows" aria-hidden="true"><i class="sk sk-title"></i><i class="sk sk-value"></i><i class="sk sk-chart"></i><i class="sk"></i><i class="sk sk-short"></i></div>`}
async function runInArea(area,fn,{title='計算しています…',sub='',minimumMs=360,retry=null,label='この部分'}={}){
  const el=areaEl(area);if(!el||!el.isConnected||!el.getClientRects().length)return fn();
  el.querySelector(':scope > .area-error')?.remove();
  const skel=document.createElement('div');skel.className='area-skel'+(el.clientHeight<170?' compact':'');skel.style.top=el.scrollTop+'px';{const bg=getComputedStyle(el).backgroundColor;if(bg&&!/rgba\(0, 0, 0, 0\)|transparent/.test(bg))skel.style.background=bg}skel.style.height=Math.max(64,el.clientHeight)+'px';skel.innerHTML=areaSkeletonHtml(title,sub);
  el.classList.add('area-busy');el.setAttribute('aria-busy','true');el.prepend(skel);
  const started=performance.now(),finish=()=>{const now=areaEl(area)||el;skel.remove();for(const x of [el,now]){x.classList.remove('area-busy');x.removeAttribute('aria-busy')}now.classList.remove('area-fresh');void now.offsetWidth;now.classList.add('area-fresh');setTimeout(()=>now.classList.remove('area-fresh'),260)};
  try{
    await waitForUiPaint();const result=await fn();
    const rest=minimumMs-(performance.now()-started);if(rest>0){const now=areaEl(area);if(now&&!skel.isConnected){now.classList.add('area-busy');now.setAttribute('aria-busy','true');now.prepend(skel)}await new Promise(r=>setTimeout(r,rest))}
    finish();return result;
  }catch(error){
    skel.remove();el.classList.remove('area-busy');el.removeAttribute('aria-busy');
    const target=areaEl(area)||el,box=document.createElement('div');box.className='area-error';box.setAttribute('role','alert');
    box.innerHTML=`<span class="area-error-icon" aria-hidden="true">${icon('warning')}</span><div class="area-error-text"><b>${esc(label)}を表示できません</b><small>前の金額はそのまま表示しています。</small></div><button type="button" class="area-retry">再試行</button>`;
    target.prepend(box);
    box.querySelector('.area-retry').onclick=()=>{box.remove();feedback?.selection?.();Promise.resolve().then(()=>retry?retry():runInArea(area,fn,{title,sub,minimumMs,label})).catch(()=>{})};
    throw error;
  }
}

/* ---------- 取引の一覧と詳細（ウォレットのような見た目） ---------- */
function openOptionSheet(title,options,current,apply){
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="optCancel">キャンセル</button><div class="sheet-title">${esc(title)}</div><span style="min-width:64px"></span></div><div class="sheet-body gsearch-filter-sheet"><div class="group" role="radiogroup" aria-label="${esc(title)}">${options.map(([v,l])=>`<button type="button" class="row press option-row" role="radio" aria-checked="${current===v}" data-opt="${esc(v)}"><div class="row-main"><div class="row-title">${esc(l)}</div></div><span class="option-check" aria-hidden="true">${current===v?icon('check'):''}</span></button>`).join('')}</div></div>`,'half',root=>{
    root.querySelector('#optCancel').onclick=closeSheet;
    root.querySelectorAll('[data-opt]').forEach(b=>b.onclick=()=>{feedback?.selection?.();closeSheet();apply(b.dataset.opt)});
  });
}
function txRowHtml(t){const c=catByName(t.category);return `<button type="button" class="row press txl-row" data-tx="${esc(t.id)}"><span class="txl-icon" style="--c:${c.color}" aria-hidden="true">${catIcon(t.category)}</span><div class="row-main"><div class="row-title">${esc(t.merchant||t.category)}</div><div class="row-sub">${esc(t.category)}・${esc(paymentLabel(t))}</div></div><div class="row-value ${t.amount<0?'green':''}">${t.amount<0?'+':''}${yen(Math.abs(t.amount))}</div><span class="chev">${icon('chevronRight')}</span></button>`}
function txListGroupsHtml(list){
  const by=new Map();for(const t of list){if(!by.has(t.date))by.set(t.date,[]);by.get(t.date).push(t)}
  const today=ymd(),yesterday=spendAddDays(today,-1);
  return [...by].map(([date,rows])=>`<section class="txl-day"><h2 class="txl-day-head"><span>${date===today?'今日':date===yesterday?'昨日':''}${date===today||date===yesterday?`<small>${esc(dayLabel(date))}</small>`:esc(dayLabel(date))}</span><span class="txl-day-total">${yen(sum(rows,x=>x.amount))}</span></h2><div class="group">${rows.map(txRowHtml).join('')}</div></section>`).join('');
}
const TX_SOURCE_LABELS={manual:'手入力',mail:'メール',gmail:'メール',fixed:'固定支払い',statement:'明細取込',quick:'すばやく入力',repeat:'再利用',oneLine:'一行入力',large:'大型支出',import:'取込'};
function txDetailHtml(t){
  const c=catByName(t.category),source=TX_SOURCE_LABELS[t.source||'manual']||t.source||'手入力';
  return `<div class="txd-hero"><span class="txd-icon" style="--c:${c.color}" aria-hidden="true">${catIcon(t.category)}</span><div class="txd-merchant">${esc(t.merchant||t.category)}</div><div class="txd-amount">${t.amount<0?'+':''}${yen(Math.abs(t.amount))}</div><div class="txd-date">${esc(dayLabel(t.date))}</div></div>
  <div class="group"><div class="row"><div class="row-main"><div class="row-title">カテゴリ</div></div><div class="row-value txd-cat"><i style="background:${c.color}" aria-hidden="true"></i>${esc(t.category)}</div></div><div class="row"><div class="row-main"><div class="row-title">支払い方法</div></div><div class="row-value">${esc(paymentLabel(t))}</div></div><div class="row"><div class="row-main"><div class="row-title">記録の方法</div></div><div class="row-value">${esc(source)}</div></div>${t.memo?`<div class="row txd-memo"><div class="row-main"><div class="row-title">メモ</div><div class="row-sub">${esc(t.memo)}</div></div></div>`:''}</div>
  <div class="group txd-actions"><button type="button" class="row press txd-action" id="txEdit">取引を編集</button><button type="button" class="row press txd-action danger" id="txDelete">この取引を削除</button></div>`;
}

/* 行を左へなぞると「編集」「削除」（iOSのスワイプ操作）。ボタンはなぞった時だけ作る */
let swipeOpenRow=null;
function closeSwipeRow(row=swipeOpenRow,animate=true){if(!row)return;const acts=row.__swipeActs;row.style.transition=animate&&!searchMotionReduced()?'transform .24s cubic-bezier(.22,.88,.22,1)':'none';row.style.transform='translateX(0)';row.classList.remove('swiped');if(swipeOpenRow===row)swipeOpenRow=null;setTimeout(()=>{if(row.classList.contains('swiped'))return;acts?.remove();row.__swipeActs=null;row.style.transition='';row.style.transform='';row.classList.remove('swiping')},animate?250:0)}
function installRowSwipeActions(root,{selector='.txl-row',actions}){
  const W=148;
  const make=row=>{if(row.__swipeActs)return row.__swipeActs;row.parentElement.style.position='relative';const id=row.dataset.tx,acts=document.createElement('div');acts.className='swipe-actions';acts.style.top=row.offsetTop+'px';acts.style.height=row.offsetHeight+'px';acts.innerHTML=actions.map(a=>`<button type="button" class="swipe-act ${a.tone||''}" data-swipe="${a.key}">${icon(a.icon)}<span>${esc(a.label)}</span></button>`).join('');
    acts.querySelectorAll('[data-swipe]').forEach(b=>b.onclick=e=>{e.stopPropagation();const a=actions.find(x=>x.key===b.dataset.swipe);closeSwipeRow(row);a?.run(id)});
    row.parentElement.style.position='relative';row.parentElement.insertBefore(acts,row);row.__swipeActs=acts;row.classList.add('swiping');return acts};
  root.querySelectorAll(selector).forEach(row=>{
    let g=null;
    row.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;if(swipeOpenRow&&swipeOpenRow!==row)closeSwipeRow();g={x:e.clientX,y:e.clientY,base:row.classList.contains('swiped')?-W:0,h:false,id:e.pointerId,dx:0}});
    row.addEventListener('pointermove',e=>{if(!g||e.pointerId!==g.id)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;
      if(!g.h){if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){g=null;return}if(Math.abs(dx)<8)return;if(dx>0&&!g.base){g=null;return}g.h=true;make(row);try{row.setPointerCapture(e.pointerId)}catch(_){}}
      e.preventDefault();g.dx=dx;let x=Math.min(0,g.base+dx);if(x<-W)x=-W+(x+W)*.35;row.style.transition='none';row.style.transform=`translateX(${x}px)`});
    const end=e=>{if(!g)return;const cur=g;g=null;if(!cur.h)return;row.__swallowClick=true;setTimeout(()=>{row.__swallowClick=false},60);const x=cur.base+cur.dx;
      if(x<-W*.45){row.style.transition=searchMotionReduced()?'none':'transform .24s cubic-bezier(.22,.88,.22,1)';row.style.transform=`translateX(${-W}px)`;row.classList.add('swiped');swipeOpenRow=row;feedback?.selection?.()}else closeSwipeRow(row)};
    row.addEventListener('pointerup',end);row.addEventListener('pointercancel',e=>{if(g?.h){g.dx=0}end(e)});
    row.addEventListener('click',e=>{if(row.__swallowClick||row.classList.contains('swiped')){e.preventDefault();e.stopImmediatePropagation();if(!row.__swallowClick)closeSwipeRow(row)}},true);
  });
}
function bindTransactionRowSwipes(root){installRowSwipeActions(root,{actions:[{key:'edit',label:'編集',icon:'edit',tone:'edit',run:id=>openTransactionEdit(id)},{key:'delete',label:'削除',icon:'trash',tone:'delete',run:id=>deleteTransactionFlow(id,{pop:false})}]})}
