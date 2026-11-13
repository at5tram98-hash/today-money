/* ===================================================================
   第16版 UI監査（2026-11-13）
   参考: iOS「ヘルスケア」タブバー・アクティビティの期間切替・メモのボタン変形
   #1  タブバー: 幅を詰め、押すとレンズがふくらみ、なぞると追従、離すと吸着
   #3  今日／今月: 同じレンズ。なぞって切り替えられる（指が外れても追従）
   #4  メニュー: 押したボタンから形を変えながら現れる
   #5  資産: 期間切替をレンズ化し、期間の変化・最高・最低を表示
   #6  ACF設定: ヘルスケア風の大きな数値・目盛りダイヤル・比率スライダー
   #7  資金イベント: 直近3件だけ。残りは「すべて」で開く
   #8  ホームのカード: どこを押しても開く
   #9  現金／カード配分: ヘルスケア風の棒グラフ。棒を押すとその日の内訳
   #10-12 編集・登録シート: カードの見た目プレビュー、日付ダイヤル、選択チップ
   #13 カテゴリ: 構成比の帯＋金額順の一覧
   #14 ホーム「ACF」: ACF指標（1.0が収支ちょうど）
   #15 大型支出: 一覧を常に最新に保ち、左スワイプで編集・削除
   =================================================================== */

const LG_EASE_SPRING='cubic-bezier(.3,1.3,.45,1)';
const lgLastPos=new Map();
function lgReduced(){try{return mm3MotionReduced()}catch(_){return matchMedia('(prefers-reduced-motion: reduce)').matches}}
function lgTick(){try{feedback?.selection?.()}catch(_){}}

/* ---------- 共通: ガラスのレンズ（タブバー・期間切替・セグメント） ---------- */
function lgInstall(bar,{item,isActive,kind,touch='pan-y'}){
  if(!bar||bar.__lg)return;bar.__lg=true;
  bar.classList.add('lg-bar',`lg-${kind}`);bar.style.touchAction=touch;
  const lens=document.createElement('span');lens.className='lg-lens';lens.setAttribute('aria-hidden','true');bar.prepend(lens);
  const items=()=>[...bar.querySelectorAll(item)].filter(b=>b.offsetParent!==null);
  const active=()=>items().find(isActive)||null;
  const geom=el=>({x:el.offsetLeft,w:el.offsetWidth,y:el.offsetTop,h:el.offsetHeight});
  const set=({x,w,y,h},instant)=>{if(instant)lens.classList.add('lg-instant');lens.style.setProperty('--x',`${x}px`);lens.style.setProperty('--w',`${w}px`);lens.style.setProperty('--y',`${y}px`);lens.style.setProperty('--h',`${h}px`);if(instant){void lens.offsetWidth;lens.classList.remove('lg-instant')}};
  const place=instant=>{const a=active();lens.classList.toggle('lg-none',!a);if(!a)return;const g=geom(a);set(g,instant);lgLastPos.set(kind,g)};
  const under=x=>{let best=null,d=1e9;for(const b of items()){const r=b.getBoundingClientRect(),c=r.left+r.width/2,dd=Math.abs(x-c);if(dd<d){d=dd;best=b}}return best};
  const prev=lgLastPos.get(kind),now=active();
  if(prev&&now&&!lgReduced()&&Math.abs(prev.x-now.offsetLeft)>2&&bar.isConnected){set(prev,true);requestAnimationFrame(()=>requestAnimationFrame(()=>place(false)))}else place(true);
  let g=null,suppress=0,releaseTimer=0;
  const clearUnder=()=>items().forEach(b=>b.classList.remove('lg-under'));
  bar.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    const start=e.target.closest(item);if(!start)return;
    clearTimeout(releaseTimer);g={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false,start,dir:null};
    bar.classList.add('lg-press');start.classList.add('lg-under');
  });
  bar.addEventListener('pointermove',e=>{
    if(!g||e.pointerId!==g.id)return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;
    if(!g.dir){if(Math.abs(dx)<6&&Math.abs(dy)<6)return;g.dir=Math.abs(dx)>=Math.abs(dy)?'h':'v';if(g.dir==='v'&&touch!=='none'){bar.classList.remove('lg-press');clearUnder();g=null;return}try{bar.setPointerCapture(e.pointerId)}catch(_){}}
    g.moved=true;e.preventDefault();
    const r=bar.getBoundingClientRect(),w=lens.offsetWidth||40,x=clamp(e.clientX-r.left-w/2,-6,r.width-w+6);
    lens.classList.add('lg-follow');lens.style.setProperty('--x',`${x}px`);
    const n=under(e.clientX);items().forEach(b=>b.classList.toggle('lg-under',b===n));
    if(n&&n!==g.over){g.over=n;if(g.overSeen)lgTick();g.overSeen=true}
  });
  const finish=(e,cancel)=>{
    if(!g||(e&&e.pointerId!==g.id))return;const cur=g;g=null;lens.classList.remove('lg-follow');clearUnder();
    suppress=performance.now()+450;
    const target=cancel?null:(cur.moved?under(e.clientX):cur.start);
    if(target){const gg=geom(target);set(gg,false);lgLastPos.set(kind,gg)}else place(false);
    releaseTimer=setTimeout(()=>bar.classList.remove('lg-press'),lgReduced()?0:cur.moved?140:230);
    if(target){if(!isActive(target))lgTick();target.click()}
  };
  bar.addEventListener('pointerup',e=>finish(e,false));
  bar.addEventListener('pointercancel',e=>finish(e,true));
  bar.addEventListener('lostpointercapture',e=>{if(g&&g.moved)finish(e,false)});
  bar.addEventListener('click',e=>{if(e.detail!==0&&performance.now()<suppress){e.preventDefault();e.stopImmediatePropagation()}},true);
  const mo=new MutationObserver(()=>{if(!g)place(false)});mo.observe(bar,{attributes:true,subtree:true,attributeFilter:['class','aria-pressed','aria-checked','aria-selected']});
  if(typeof ResizeObserver==='function')new ResizeObserver(()=>{if(!g)place(true)}).observe(bar);
  bar.__lgPlace=place;
}
/* 以前の個別ドラッグ処理はレンズに統合した */
function installTabSlide(){}
function installPeriodDrag(){}

function lgScan(root=document){
  const q=(sel,fn)=>root.querySelectorAll?.(sel).forEach(fn);
  q('#tabbar',b=>lgInstall(b,{item:'.tab',isActive:x=>x.classList.contains('active'),kind:'tab',touch:'none'}));
  q('.home-period',b=>lgInstall(b,{item:'button',isActive:x=>x.getAttribute('aria-pressed')==='true',kind:'period'}));
  q('.mm3-assets-range',b=>{lgInstall(b,{item:'[data-mm3-asset-range]',isActive:x=>x.classList.contains('on'),kind:'range'});lgAssetStats(b)});
  q('.glass-seg',b=>lgInstall(b,{item:'button',isActive:x=>x.getAttribute('aria-checked')==='true'||x.classList.contains('on'),kind:'gseg'}));
  q('.sheet .seg, .push-view .seg, .lg-seg',b=>{if(b.closest('.entry-modes'))return;lgInstall(b,{item:'button',isActive:x=>x.classList.contains('on')||x.getAttribute('aria-pressed')==='true'||x.getAttribute('aria-checked')==='true',kind:'seg'})});
}

/* ---------- #4 メニュー: 押したボタンから形を変えて現れる ---------- */
let lgAnchorRect=null,lgAnchorAt=0;
document.addEventListener('pointerdown',e=>{const b=e.target.closest?.('button,[role="button"]');if(b){lgAnchorRect=b.getBoundingClientRect();lgAnchorAt=performance.now()}},true);
document.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const b=document.activeElement;if(b?.matches?.('button')){lgAnchorRect=b.getBoundingClientRect();lgAnchorAt=performance.now()}}},true);
function lgMorphFromAnchor(el,{radius=22}={}){
  if(!el||lgReduced())return;
  requestAnimationFrame(()=>{
    const m=el.getBoundingClientRect();if(!m.width)return;
    const a=lgAnchorRect&&performance.now()-lgAnchorAt<1500?lgAnchorRect:null;
    let from;
    if(a){const t=clamp(a.top-m.top,0,m.height-8),l=clamp(a.left-m.left,0,m.width-8),r=clamp(m.right-a.right,0,m.width-8),b=clamp(m.bottom-a.bottom,0,m.height-8);from=`inset(${t}px ${r}px ${b}px ${l}px round ${Math.min(a.height,a.width)/2}px)`}
    else from=`inset(0 ${m.width*.35}px ${m.height*.6}px ${m.width*.35}px round 999px)`;
    el.animate([{clipPath:from,filter:'blur(5px)',opacity:.35},{clipPath:`inset(0 0 0 0 round ${radius}px)`,filter:'blur(0px)',opacity:1}],{duration:320,easing:'cubic-bezier(.22,1.18,.36,1)'});
    el.querySelectorAll(':scope > .menu-item, :scope > button, :scope > .menu-sep').forEach((it,i)=>it.animate([{opacity:0,transform:'translateY(-8px) scale(.94)'},{opacity:1,transform:'none'}],{duration:260,delay:40+i*24,easing:'cubic-bezier(.2,1.1,.35,1)',fill:'backwards'}));
  });
}
(()=>{const menu=document.getElementById('menuLayer');if(!menu)return;let shown=false;new MutationObserver(()=>{const on=menu.classList.contains('show');if(on&&!shown)lgMorphFromAnchor(menu);shown=on}).observe(menu,{attributes:true,attributeFilter:['class']})})();

/* ---------- #8 ホームのカードはどこを押しても開く ---------- */
document.addEventListener('click',e=>{
  const wrap=e.target.closest?.('.home-card-wrap');if(!wrap||!wrap.closest('#todayContent'))return;
  if(e.target.closest('button,a,input,select,textarea,label,[role="button"],[role="switch"],.home-period,.lg-bar'))return;
  const body=wrap.querySelector('.home-card-body');if(body&&!body.disabled){e.preventDefault();body.click()}
});
document.addEventListener('pointerdown',e=>{const wrap=e.target.closest?.('#todayContent .home-card-wrap');if(!wrap||e.target.closest('.home-period,.lg-bar'))return;wrap.classList.add('lg-card-press');const up=()=>{wrap.classList.remove('lg-card-press');removeEventListener('pointerup',up,true);removeEventListener('pointercancel',up,true)};addEventListener('pointerup',up,true);addEventListener('pointercancel',up,true)},true);

/* ---------- #14 ACF指標 ---------- */
function acfIndexFor(f){
  const rows=f?.rows||[],start=f?.startDate||ymd();
  const pay=rows.find(r=>r.date>start&&(r.salary||(r.events||[]).some(e=>e.type==='salary')));
  const end=pay?pay.date:(rows.find(r=>r.date>=addDaysYmd(start,30))?.date||addDaysYmd(start,30));
  const span=Math.max(1,Math.round((parseYmd(end)-parseYmd(start))/864e5)+1);
  /* 支払いはホームの「次の支払い」と同じ予定（カード・固定・大型）から数える */
  let fin=[];try{fin=financialEventsFrom(start,span).filter(e=>e.date>=start&&e.date<=end)}catch(_){}
  const win=rows.filter(r=>r.date>=start&&r.date<=end);
  const rowIncome=win.reduce((s,r)=>s+(Number(r.income)||0),0),finIncome=fin.filter(e=>e.type==='income').reduce((s,e)=>s+Math.abs(Number(e.amount)||0),0);
  const income=Math.max(rowIncome,finIncome);
  const payments=fin.filter(e=>e.type!=='income');
  const out=Math.max(payments.reduce((s,e)=>s+Math.abs(Number(e.amount)||0),0),win.reduce((s,r)=>s+(Number(r.mandatoryOutflow)||0),0));
  const balance=Number(f?.currentDeposits)||0,reserve=Number(f?.reserveFloor??f?.settings?.reserveFloor)||0;
  const have=balance+income,need=out+reserve;
  const value=need>0?have/need:(have>0?Infinity:1);
  const finIn=fin.filter(e=>e.type==='income').map(e=>({label:e.title,amount:Math.abs(Number(e.amount)||0),date:e.date,dir:1}));
  const rowIn=finIn.length?[]:win.flatMap(r=>(r.events||[]).filter(e=>Number(e.amount)>0&&(e.type==='income'||e.type==='salary'||r.salary)&&!/支払|引落/.test(e.label)).map(e=>({label:e.label,amount:Math.abs(Number(e.amount)||0),date:r.date,dir:1})));
  const events=[...finIn,...rowIn,...payments.map(e=>({label:e.title,amount:Math.abs(Number(e.amount)||0),date:e.date,dir:-1}))].sort((a,b)=>a.date.localeCompare(b.date));
  return {value,have,need,balance,income,out,reserve,surplus:have-need,start,end,payday:pay?.date||null,events};
}
function addDaysYmd(s,n){const d=parseYmd(s);d.setDate(d.getDate()+n);return ymd(d)}
function acfIndexText(v){return !Number.isFinite(v)?'∞':v>=10?v.toFixed(1):v.toFixed(2)}
function acfIndexTone(v){return v<1?'deficit':v<1.2?'tight':'surplus'}
function acfIndexLabel(v){return v<1?'赤字':v<1.2?'ぎりぎり黒字':'黒字'}
function acfGaugeSvg(v,size=64){
  const max=2,t=clamp(Number.isFinite(v)?v:max,0,max)/max,r=size/2-6,c=size/2,arc=a=>{const ang=Math.PI*(1-a);return [c+r*Math.cos(ang),c-r*Math.sin(ang)]};
  const [x0,y0]=arc(0),[x1,y1]=arc(1),[xm,ym]=arc(.5),[xv,yv]=arc(t);
  return `<svg class="acf-gauge ${acfIndexTone(v)}" viewBox="0 0 ${size} ${size/2+8}" aria-hidden="true"><path class="track" d="M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}"/><path class="fill" d="M${x0},${y0} A${r},${r} 0 0 1 ${xv.toFixed(2)},${yv.toFixed(2)}"/><line class="mid" x1="${xm}" y1="${ym-5}" x2="${xm}" y2="${ym+5}"/><circle class="knob" cx="${xv.toFixed(2)}" cy="${yv.toFixed(2)}" r="4.2"/></svg>`;
}
function homeAcfCardHtml(){
  let body,note='';
  if(!data.acfSettings.initialized)body=`<span class="home-card-left"><span class="home-card-value small">未設定</span><span class="home-card-caption">最低残したい金額を決めると、ACF指標を計算します</span></span>`;
  else{
    let f=null;try{f=buildCashFlowForecast()}catch(e){console.error('ACF index failed',e)}
    if(!f)body=`<span class="home-card-left"><span class="home-card-value small">計算できません</span></span>`;
    else{const x=acfIndexFor(f),tone=acfIndexTone(x.value);
      body=`<span class="home-card-left"><span class="acf-idx-line"><span class="home-card-value acf-idx-value ${tone}">${acfIndexText(x.value)}</span><span class="acf-idx-badge ${tone}">${acfIndexLabel(x.value)}</span></span><span class="home-card-caption">${x.surplus>=0?'＋':'−'}${yen(Math.abs(x.surplus))}・${x.payday?`給料日 ${Number(x.payday.slice(5,7))}/${Number(x.payday.slice(8,10))} まで`:'30日間'}</span></span><span class="home-card-right">${acfGaugeSvg(x.value,72)}</span>`;
      if(x.value<1)note=`<p class="home-card-note">給料日までの支払いと最低残高に ${yen(Math.abs(x.surplus))} 足りません</p>`}
  }
  return `<section class="home-card-wrap" data-home-section="acf"><h2 class="home-card-title">ACF</h2><div class="home-card"><button type="button" class="home-card-body" id="homeAcfCard" aria-label="ACF指標の詳細を開く">${body}</button><p class="home-card-readout" hidden aria-live="polite"></p>${note}</div></section>`;
}
try{HOME_SECTION_LABELS.acf='ACF'}catch(_){}
document.addEventListener('click',e=>{const b=e.target.closest?.('#homeAcfCard');if(!b||!data.acfSettings.initialized)return;e.preventDefault();e.stopImmediatePropagation();openAcfIndexDetail()},true);

function openAcfIndexDetail(){
  let f;try{f=buildCashFlowForecast()}catch(e){return openAcfDetail()}
  const x=acfIndexFor(f),tone=acfIndexTone(x.value),pct=clamp((Number.isFinite(x.value)?x.value:2)/2*100,0,100);
  const ev=x.events.slice(0,12);
  pushView('ACF指標',`<div class="acf-idx-hero ${tone}"><div class="acf-idx-kicker">ACF指標</div><div class="acf-idx-big">${acfIndexText(x.value)}</div><div class="acf-idx-state"><span class="acf-idx-badge ${tone}">${acfIndexLabel(x.value)}</span><span>${x.surplus>=0?'余る見込み':'足りない見込み'} ${yen(Math.abs(x.surplus))}</span></div>
    <div class="acf-idx-scale" role="img" aria-label="ACF指標 ${acfIndexText(x.value)}。1.0で収支ちょうど"><div class="acf-idx-track"><i style="width:${pct}%"></i><b class="one"></b></div><div class="acf-idx-ticks"><span>0</span><span>1.0 収支ちょうど</span><span>2.0+</span></div></div>
    <p class="acf-idx-period">${dayLabel(x.start)}〜${dayLabel(x.end)}${x.payday?'（次の給料日まで）':'（30日間）'}</p></div>
    <h2 class="section-head">内訳</h2><div class="acf-idx-eq"><div class="acf-idx-part have"><span>使えるお金</span><strong>${yen(x.have)}</strong><small>残高 ${yen(x.balance)} ＋ 入金 ${yen(x.income)}</small></div><div class="acf-idx-div">÷</div><div class="acf-idx-part need"><span>予定支出</span><strong>${yen(x.need)}</strong><small>支払い ${yen(x.out)} ＋ 最低残高 ${yen(x.reserve)}</small></div></div>
    <p class="hs-help">1.0 で収支がちょうど0円です。1.0 以上なら黒字、1.0 未満なら赤字の見込みです。日々の生活費は含みません。</p>
    <h2 class="section-head">対象期間の入出金</h2><div class="group">${ev.length?ev.map(e=>`<div class="row"><div class="row-main"><div class="row-title">${esc(e.label)}</div><div class="row-sub">${dayLabel(e.date)}</div></div><div class="row-value ${e.dir>0?'green':''}">${e.dir>0?'＋':'−'}${yen(e.amount)}</div></div>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">予定された入出金はありません</div></div></div>'}</div>
    <div class="group"><button type="button" class="row press" id="acfIdxDetail"><div class="row-main"><div class="row-title">ACFの日別資金表</div><div class="row-sub">今日使える目安・カード配分・注意点</div></div><span class="chev">${icon('chevronRight')}</span></button><button type="button" class="row press" id="acfIdxSettings"><div class="row-main"><div class="row-title">ACF設定</div><div class="row-sub">最低残高・カード比率</div></div><span class="chev">${icon('chevronRight')}</span></button></div>`,root=>{
    root.querySelector('#acfIdxDetail').onclick=()=>openAcfDetail();
    root.querySelector('#acfIdxSettings').onclick=()=>openAcfSettings();
  });
}

/* ---------- #7 次の重要な資金イベント: 直近3件だけ ---------- */
function acfTimelineRowsHtml(f,limit=Infinity){const items=f.rows.filter(r=>r.date===f.startDate||r.events.length||r.flexibleCardDue>0||r.date===monthEndDate(f.startDate.slice(0,7))||r.headroom<0);return {count:items.length,html:items.slice(0,limit).map(r=>{const eventText=r.events.map(e=>e.label).join('・')||(r.flexibleCardDue>0?'カード支払いの引落':(r.date===f.startDate?'現在':'月末')),delta=r.income-r.mandatoryOutflow-r.flexibleCardDue;return `<div class="cashflow-event"><div class="cashflow-event-date">${Number(r.date.slice(5,7))}/${Number(r.date.slice(8,10))}</div><div><div class="cashflow-event-title">${esc(eventText)}</div><div class="cashflow-event-sub">終了予測 ${yen(r.forecastBalance)}</div></div><div class="cashflow-event-amount ${delta>0?'green':delta<0?'red':''}">${delta?`${delta>0?'+':'−'}${yen(Math.abs(delta))}`:yen(r.forecastBalance)}</div></div>`}).join('')}}
function acfTimelineHtml(f){
  const {count,html}=acfTimelineRowsHtml(f,3);
  return `<div class="cashflow-timeline lg-timeline">${html}${count>3?`<button type="button" class="lg-more" data-acf-timeline-all>すべてのイベント<span>${count}件</span>${icon('chevronRight')}</button>`:''}</div>`;
}
document.addEventListener('click',e=>{if(!e.target.closest?.('[data-acf-timeline-all]'))return;let f;try{f=buildCashFlowForecast()}catch(_){return}pushView('資金イベント',`<div class="cashflow-timeline">${acfTimelineRowsHtml(f).html}</div>`,()=>{})});

/* ---------- #9 現金／カード配分（ヘルスケア風） ---------- */
function acfCashCardGraphHtml(f){
  const rows=(f?.rows||[]).filter(r=>r.date<=f.endDate).slice(0,7);if(!rows.length)return'';
  const vals=rows.map(r=>({date:r.date,card:Math.max(0,Number(r.safeCreditBudget)||0),cash:Math.max(0,Number(r.safeCashBudget)||0)}));
  const max=Math.max(1,...vals.map(v=>v.card+v.cash)),avg=vals.reduce((s,v)=>s+v.card+v.cash,0)/vals.length;
  const W=320,H=150,top=16,bot=24,ph=H-top-bot,rightPad=40,colW=(W-rightPad)/vals.length,bw=Math.min(26,colW*.58),y=v=>top+ph-(v/max)*ph;
  const wd='日月火水木金土';
  const bars=vals.map((v,i)=>{const cx=i*colW+colW/2,x=cx-bw/2,hc=(v.card/max)*ph,hs=(v.cash/max)*ph,gap=hc&&hs?2:0;return `<g class="acfcc-col ${i===0?'sel':''}" data-acfcc="${i}"><rect class="hit" x="${i*colW}" y="0" width="${colW}" height="${H}"/>${hs?`<rect class="bs" x="${x}" y="${(top+ph-hs).toFixed(1)}" width="${bw}" height="${hs.toFixed(1)}" rx="${Math.min(5,bw/2)}"/>`:''}${hc?`<rect class="bc" x="${x}" y="${(top+ph-hs-hc-gap).toFixed(1)}" width="${bw}" height="${Math.max(1,hc).toFixed(1)}" rx="${Math.min(5,bw/2)}"/>`:''}<text class="x" x="${cx}" y="${H-6}" text-anchor="middle">${i===0?'今日':wd[parseYmd(v.date).getDay()]}</text></g>`}).join('');
  const ay=y(avg).toFixed(1);
  const data_=esc(JSON.stringify(vals));
  return `<div class="acf-graph-card acfcc" data-acfcc-vals="${data_}"><div class="acfcc-head"><div class="acfcc-metric mc"><span>カード</span><strong data-acfcc-card>${yen(vals[0].card)}</strong></div><div class="acfcc-metric ms"><span>現金</span><strong data-acfcc-cash>${yen(vals[0].cash)}</strong></div><div class="acfcc-when" data-acfcc-when>今日・カード比率 ${Math.round(Number(f.settings.creditAggressiveness)||0)}%</div></div><svg class="acfcc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="7日間の現金とカードの使える目安"><line class="grid" x1="0" x2="${W-rightPad}" y1="${top}" y2="${top}"/><line class="grid" x1="0" x2="${W-rightPad}" y1="${top+ph}" y2="${top+ph}"/><text class="yl" x="${W-rightPad+6}" y="${top+4}">${spendAxisYen(max)}</text><text class="yl" x="${W-rightPad+6}" y="${top+ph+4}">0</text>${bars}<line class="avg" x1="0" x2="${W-rightPad}" y1="${ay}" y2="${ay}"/><text class="avgl" x="${W-rightPad+6}" y="${Number(ay)-2}">平均</text><text class="avgl v" x="${W-rightPad+6}" y="${Number(ay)+9}">${spendAxisYen(Math.round(avg))}</text></svg><div class="acfcc-title">7日間の現金とカードの使える目安</div></div>`;
}
document.addEventListener('click',e=>{const col=e.target.closest?.('[data-acfcc]');if(!col)return;const card=col.closest('.acfcc');let vals;try{vals=JSON.parse(card.dataset.acfccVals)}catch(_){return}const i=Number(col.dataset.acfcc),v=vals[i];if(!v)return;card.querySelectorAll('.acfcc-col').forEach(c=>c.classList.toggle('sel',c===col));card.querySelector('[data-acfcc-card]').textContent=yen(v.card);card.querySelector('[data-acfcc-cash]').textContent=yen(v.cash);card.querySelector('[data-acfcc-when]').textContent=i===0?'今日':dayLabel(v.date);lgTick()});

/* ---------- 目盛りダイヤル（ヘルスケアの数値入力に近い操作） ---------- */
function lgRulerHtml(id,{value,step,max}){const n=Math.round(max/step);return `<div class="lg-ruler" id="${id}" data-step="${step}" data-max="${max}" data-value="${value}" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${value}"><div class="lg-ruler-track">${Array.from({length:n+1},(_,i)=>`<i class="${i%10===0?'major':i%5===0?'mid':''}">${i%10===0?`<b>${spendAxisYen(i*step)}</b>`:''}</i>`).join('')}</div><span class="lg-ruler-needle" aria-hidden="true"></span></div>`}
function lgBindRuler(el,onChange){
  if(!el)return;const step=Number(el.dataset.step),max=Number(el.dataset.max),gap=10;let value=Number(el.dataset.value)||0,lock=false,raf=0;
  const toScroll=v=>{lock=true;el.scrollLeft=Math.round(v/step)*gap;requestAnimationFrame(()=>{lock=false})};
  requestAnimationFrame(()=>toScroll(value));
  el.addEventListener('scroll',()=>{if(lock)return;cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const v=clamp(Math.round(el.scrollLeft/gap)*step,0,max);if(v!==value){value=v;el.setAttribute('aria-valuenow',v);el.setAttribute('aria-valuetext',yen(v));lgTick();onChange(v)}})},{passive:true});
  el.addEventListener('keydown',e=>{const d=e.key==='ArrowRight'||e.key==='ArrowUp'?1:e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:0;if(!d)return;e.preventDefault();value=clamp(value+d*step,0,max);toScroll(value);onChange(value)});
  el.__set=v=>{value=clamp(Number(v)||0,0,max);toScroll(value)};
}
function lgChipsHtml(attr,list,cur){return `<div class="lg-chips">${list.map(v=>`<button type="button" class="lg-chip ${v===cur?'on':''}" ${attr}="${v}">${v?spendAxisYen(v):'なし'}</button>`).join('')}</div>`}
function lgRatioHtml(id,ratio,disabled){return `<div class="lg-ratio ${disabled?'off':''}" style="--r:${ratio}"><div class="lg-ratio-bar"><i class="rc"></i><i class="rs"></i></div><div class="lg-ratio-legend"><span class="rc">カード <b data-ratio-card>${Math.round(ratio)}%</b></span><span class="rs">現金 <b data-ratio-cash>${100-Math.round(ratio)}%</b></span></div><input type="range" class="acf-credit-range lg-slider" id="${id}" min="0" max="100" step="5" value="${ratio}" ${disabled?'disabled':''} aria-label="カードで払う割合（%）"><div class="lg-ratio-ticks"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div></div>`}
function lgSyncRatio(root,ratio,on){const box=root.querySelector('.lg-ratio');if(!box)return;box.style.setProperty('--r',on?ratio:0);box.classList.toggle('off',!on);box.querySelector('[data-ratio-card]').textContent=`${on?Math.round(ratio):0}%`;box.querySelector('[data-ratio-cash]').textContent=`${on?100-Math.round(ratio):100}%`}

/* ---------- #6 ACF設定（初回シート） ---------- */
function openAcfSetup(){
  let reserve=acfDefaultSettings().reserveFloor,useCard=data.acfSettings.creditFallbackEnabled!==false,ratio=clamp(Number(data.acfSettings.creditAggressiveness??100)||0,0,100);
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="acfSetupCancel">閉じる</button><div class="sheet-title">ACFを設定</div><span style="min-width:64px"></span></div><div class="sheet-body lg-acf">
    <div class="lg-acf-intro">${icon('chart')}<div><strong>ACF</strong><span>給与・カード引落・固定支払い・大型支出を日付順に見て、給料日までの収支を ACF指標 で示します。</span></div></div>
    <section class="lg-metric orange"><header>${icon('wallet')}<span>最低残したい金額</span></header><button type="button" class="lg-metric-value" id="acfSetupReserve"><span class="val">${yen(reserve)}</span><small>タップして入力</small></button>${lgRulerHtml('acfSetupRuler',{value:reserve,step:1000,max:300000})}${lgChipsHtml('data-reserve-chip',[0,10000,20000,30000,50000],reserve)}</section>
    <section class="lg-metric purple"><header>${icon('card')}<span>カードで支払う割合</span><button type="button" class="switch ${useCard?'on':''}" id="acfSetupUseCard" role="switch" aria-checked="${useCard}" aria-label="カードを利用"></button></header><strong class="lg-metric-num" id="acfSetupRatioText">${useCard?Math.round(ratio)+'%':'OFF'}</strong>${lgRatioHtml('acfSetupRatio',ratio,!useCard)}</section>
    <div class="lg-facts"><div><span>現在の全銀行預金</span><strong>${yen(totalDeposits())}</strong></div><div><span>カード1日上限</span><strong>${yen(acfDefaultSettings().creditDailyLimit)}</strong></div></div>
    <button type="button" class="primary" id="acfSetupStart">設定して開始</button></div>`,'full',root=>{
    const reserveBtn=root.querySelector('#acfSetupReserve'),ruler=root.querySelector('#acfSetupRuler'),toggle=root.querySelector('#acfSetupUseCard'),range=root.querySelector('#acfSetupRatio'),txt=root.querySelector('#acfSetupRatioText');
    const setReserve=(v,fromRuler)=>{reserve=v;reserveBtn.querySelector('.val').textContent=yen(v);root.querySelectorAll('[data-reserve-chip]').forEach(c=>c.classList.toggle('on',Number(c.dataset.reserveChip)===v));if(!fromRuler)ruler.__set?.(v)};
    lgBindRuler(ruler,v=>setReserve(v,true));
    reserveBtn.onclick=()=>openCalculator('最低残したい金額',reserve,v=>setReserve(v));
    root.querySelectorAll('[data-reserve-chip]').forEach(c=>c.onclick=()=>{setReserve(Number(c.dataset.reserveChip));lgTick()});
    toggle.onclick=e=>{useCard=!useCard;e.currentTarget.classList.toggle('on',useCard);e.currentTarget.setAttribute('aria-checked',String(useCard));range.disabled=!useCard;txt.textContent=useCard?`${Math.round(ratio)}%`:'OFF';lgSyncRatio(root,ratio,useCard)};
    range.oninput=e=>{ratio=Number(e.target.value)||0;txt.textContent=`${Math.round(ratio)}%`;lgSyncRatio(root,ratio,useCard);if(ratio%25===0)lgTick()};
    root.querySelector('#acfSetupCancel').onclick=requestSheetClose;
    root.querySelector('#acfSetupStart').onclick=()=>{try{safeCommit(()=>{data.acfSettings={...acfDefaultSettings(),reserveFloor:reserve,creditFallbackEnabled:useCard,creditAggressiveness:ratio,initialized:true}},{render:true,label:'acf setup'});feedback.success();closeSheet();openAcfDetail()}catch(e){}}
  })
}

/* ---------- #6 ACF設定（画面） ---------- */
function openAcfSettings(){
  const settings={...acfDefaultSettings(),creditAllowedCategoryIds:[...(acfDefaultSettings().creditAllowedCategoryIds||[])],creditAllowedMerchants:[...(acfDefaultSettings().creditAllowedMerchants||[])],creditBlockedMerchants:[...(acfDefaultSettings().creditBlockedMerchants||[])]};
  let timer=0,detailsOpen=false;
  pushView('ACF設定',`<div class="lg-acf">
    <div class="lg-acf-preview" id="acfCreditPreview"><div class="acf-preview-loading">計算中…</div></div>
    <section class="lg-metric orange"><header>${icon('wallet')}<span>最低残したい金額</span></header><button type="button" class="lg-metric-value" id="acfReserve"><span class="val">${yen(settings.reserveFloor)}</span><small>この金額を将来もできるだけ維持します</small></button>${lgRulerHtml('acfReserveRuler',{value:settings.reserveFloor,step:1000,max:300000})}${lgChipsHtml('data-reserve-chip',[0,10000,20000,30000,50000],settings.reserveFloor)}</section>
    <section class="lg-metric purple"><header>${icon('card')}<span>カードで支払う割合</span><button type="button" class="switch ${settings.creditFallbackEnabled?'on':''}" id="acfFallback" role="switch" aria-checked="${!!settings.creditFallbackEnabled}" aria-label="カードを利用"></button></header><strong class="lg-metric-num acf-ratio-value" id="acfCreditValue">${settings.creditFallbackEnabled?Math.round(settings.creditAggressiveness)+'%':'OFF'}</strong>${lgRatioHtml('acfCredit',settings.creditAggressiveness,!settings.creditFallbackEnabled)}<p class="lg-metric-help">100%なら、カードで払える生活費は安全な範囲で原則すべてカードにします。</p></section>
    <section class="lg-metric indigo"><header>${icon('card')}<span>カード1日上限</span></header><button type="button" class="lg-metric-value" id="acfDailyLimit"><span class="val">${yen(settings.creditDailyLimit)}</span><small>1日にカードで使う目安の上限</small></button>${lgRulerHtml('acfLimitRuler',{value:settings.creditDailyLimit,step:500,max:50000})}</section>
    <button type="button" class="form-link" id="acfDetailsToggle"><span>詳細設定</span><span id="acfDetailsChev">›</span></button><div class="acf-details-panel hidden" id="acfDetailsPanel"><div class="form-group-title">カード詳細</div><div class="group"><div class="row"><div class="row-main"><div class="row-title">優先して使うカード</div></div><select class="field field-select" id="acfPreferred" style="width:48%;min-height:38px"><option value="">自動</option>${data.cards.map(c=>`<option value="${c.id}" ${settings.preferredCardId===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><button type="button" class="row press" id="acfCreditPlaces"><div class="row-main"><div class="row-title">カードを使っていい場所</div><div class="row-sub" id="acfPlacesSummary">${esc(acfAllowedCategorySummary(settings))}</div></div><span class="chev">›</span></button></div><div class="form-group-title">予測</div><div class="group"><div class="row"><div class="row-main"><div class="row-title">曜日傾向を利用</div></div><button type="button" class="switch ${settings.useWeekdayWeights?'on':''}" id="acfWeights"></button></div><div class="row"><div class="row-main"><div class="row-title">必須の大型支出を含める</div></div><button type="button" class="switch ${settings.includeRequiredLargeExpenses?'on':''}" id="acfRequired"></button></div><div class="row"><div class="row-main"><div class="row-title">予測リスク通知</div></div><button type="button" class="switch ${settings.riskNotifications?'on':''}" id="acfRiskNoti"></button></div></div><p class="hs-help">日別表は翌々月末まで表示し、その後に来るカードの支払日も確認します。</p></div>
    <button type="button" class="primary" id="acfSettingsSave" style="margin-top:14px">保存</button></div>`,root=>{
    const reserveBtn=root.querySelector('#acfReserve'),limitBtn=root.querySelector('#acfDailyLimit'),creditRange=root.querySelector('#acfCredit'),preview=root.querySelector('#acfCreditPreview'),saveBtn=root.querySelector('#acfSettingsSave'),panel=root.querySelector('#acfDetailsPanel'),rRuler=root.querySelector('#acfReserveRuler'),lRuler=root.querySelector('#acfLimitRuler');
    const draw=()=>{clearTimeout(timer);preview.classList.add('busy');timer=setTimeout(()=>{try{const f=buildCashFlowForecast({settings,lightweight:true}),x=acfIndexFor(f),tone=acfIndexTone(x.value);root.querySelector('#acfCreditValue').textContent=settings.creditFallbackEnabled?`${Math.round(settings.creditAggressiveness)}%`:'OFF';const ps=root.querySelector('#acfPlacesSummary');if(ps)ps.textContent=acfAllowedCategorySummary(settings);preview.innerHTML=`<div class="lg-prev-idx ${tone}"><span>ACF指標</span><strong>${acfIndexText(x.value)}</strong><em class="acf-idx-badge ${tone}">${acfIndexLabel(x.value)}</em></div><div class="lg-prev-split"><div><span>今日使える</span><strong>${yen(f.safeTotalBudget)}</strong></div><div><span>カード</span><strong>${yen(f.safeCreditBudget||0)}</strong></div><div><span>現金</span><strong>${yen(f.safeCashBudget||0)}</strong></div></div>`}catch(e){preview.innerHTML='<div class="acf-preview-loading">計算できませんでした</div>'}preview.classList.remove('busy')},170)};
    const setReserve=(v,fromRuler)=>{settings.reserveFloor=v;reserveBtn.querySelector('.val').textContent=yen(v);root.querySelectorAll('[data-reserve-chip]').forEach(c=>c.classList.toggle('on',Number(c.dataset.reserveChip)===v));if(!fromRuler)rRuler.__set?.(v);draw()};
    const setLimit=(v,fromRuler)=>{settings.creditDailyLimit=v;limitBtn.querySelector('.val').textContent=yen(v);if(!fromRuler)lRuler.__set?.(v);draw()};
    lgBindRuler(rRuler,v=>setReserve(v,true));lgBindRuler(lRuler,v=>setLimit(v,true));
    reserveBtn.onclick=()=>openCalculator('最低残したい金額',settings.reserveFloor,v=>setReserve(v));
    limitBtn.onclick=()=>openCalculator('カード1日上限',settings.creditDailyLimit,v=>setLimit(v));
    root.querySelectorAll('[data-reserve-chip]').forEach(c=>c.onclick=()=>{setReserve(Number(c.dataset.reserveChip));lgTick()});
    root.querySelector('#acfFallback').onclick=e=>{settings.creditFallbackEnabled=!settings.creditFallbackEnabled;e.currentTarget.classList.toggle('on',settings.creditFallbackEnabled);e.currentTarget.setAttribute('aria-checked',String(settings.creditFallbackEnabled));creditRange.disabled=!settings.creditFallbackEnabled;lgSyncRatio(root,settings.creditAggressiveness,settings.creditFallbackEnabled);draw()};
    creditRange.oninput=e=>{settings.creditAggressiveness=Number(e.target.value)||0;root.querySelector('#acfCreditValue').textContent=`${Math.round(settings.creditAggressiveness)}%`;lgSyncRatio(root,settings.creditAggressiveness,true);const tick=Math.round(settings.creditAggressiveness/25);if(tick!==creditRange.__tick){creditRange.__tick=tick;feedback.sliderTick?.()}};
    creditRange.onchange=()=>{feedback.sliderCommit?.();draw()};
    root.querySelector('#acfDetailsToggle').onclick=()=>{detailsOpen=!detailsOpen;panel.classList.toggle('hidden',!detailsOpen);root.querySelector('#acfDetailsChev').textContent=detailsOpen?'⌄':'›';feedback.selection()};
    root.querySelector('#acfPreferred').onchange=e=>{settings.preferredCardId=e.target.value;draw()};
    root.querySelector('#acfCreditPlaces').onclick=()=>openCreditUsageRules(settings,draw);
    for(const [id,key] of [['acfWeights','useWeekdayWeights'],['acfRequired','includeRequiredLargeExpenses'],['acfRiskNoti','riskNotifications']])root.querySelector(`#${id}`).onclick=e=>{settings[key]=!settings[key];e.currentTarget.classList.toggle('on',settings[key]);draw()};
    saveBtn.onclick=()=>runSaveAction(saveBtn,()=>{data.acfSettings={...data.acfSettings,...settings,initialized:true}},{render:true,label:'acf settings',success:'ACF設定を保存しました',close:popView});draw();return()=>clearTimeout(timer)
  })
}

/* ---------- #13 カテゴリ: 構成比の帯と金額順の一覧 ---------- */
function categoryCards(date){
  const actual=spentDate(date),raw=rawSpentDate(date),correction=actual-raw,g=dailyGoal(date);
  const all=data.categories.map(c=>({c,v:dailyCategorySpent(date,c.name),goal:Number(g.categories[c.name])||0}));
  const used=all.filter(x=>x.v).sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)),idle=all.filter(x=>!x.v),total=Math.max(1,used.reduce((s,x)=>s+Math.abs(x.v),0));
  const band=used.length?`<div class="lg-cat-band" role="img" aria-label="カテゴリの構成比">${used.map(x=>`<i style="flex:${Math.abs(x.v)};background:${x.c.color}"></i>`).join('')}</div>`:'';
  const rows=used.map(x=>{const pct=Math.round(Math.abs(x.v)/total*100),goalPct=x.goal?Math.round(x.v/x.goal*100):null;return `<button type="button" class="lg-cat-row" data-cat="${esc(x.c.name)}">${categoryIconHtml(x.c)}<span class="lg-cat-main"><span class="lg-cat-name">${esc(x.c.name)}</span><span class="lg-cat-meter"><i style="width:${x.goal?clamp(goalPct,0,100):pct}%;background:${x.c.color}"></i></span></span><span class="lg-cat-val"><strong>${yen(x.v)}</strong><small>${x.goal?`目標の${goalPct}%`:`${pct}%`}</small></span><span class="chev">${icon('chevronRight')}</span></button>`}).join('');
  const corr=correction?`<div class="lg-cat-row static"><span class="cat-icon" style="background:var(--fill2);color:var(--label2)">${icon('adjust')}</span><span class="lg-cat-main"><span class="lg-cat-name">修正差額</span><small class="lg-cat-note">実質支出と記録上支出の差</small></span><span class="lg-cat-val"><strong class="${correction>0?'red':'green'}">${correction>0?'+':''}${yen(correction)}</strong></span></div>`:'';
  const chips=idle.length?`<div class="lg-cat-idle"><span class="lg-cat-idle-label">${used.length?'支出なし':'この日の支出はまだありません'}</span><div class="lg-cat-chips">${idle.map(x=>`<button type="button" class="lg-cat-chip" data-cat="${esc(x.c.name)}" style="--c:${x.c.color}">${categoryIconHtml(x.c,'cat-icon mini')}${esc(x.c.name)}</button>`).join('')}</div></div>`:'';
  return `<div class="lg-cats">${used.length?`<div class="lg-cat-sum"><span>合計</span><strong>${yen(actual)}</strong></div>${band}<div class="lg-cat-list">${rows}${corr}</div>`:corr}${chips}</div>`;
}

/* ---------- #15 大型支出の計画: 常に最新・スワイプで編集／削除 ---------- */
function openLargeExpenseList(){
  const draw=()=>{const list=data.largeExpensePlans.filter(p=>p.status==='planned').sort((a,b)=>a.date.localeCompare(b.date));return `<p class="hs-help lg-swipe-hint">${list.length?'左にスワイプすると編集・削除できます。':''}</p><div class="group home-table lg-large-list">${list.length?list.map(p=>`<button type="button" class="row press le-row" data-large-plan="${esc(p.id)}" data-tx="${esc(p.id)}"><div class="row-main"><div class="row-title">${esc(p.name)}</div><div class="row-sub">${esc(p.date)}・${p.priority==='required'?'必須':'任意'}</div></div><div class="row-value">${yen(p.amount)}</div><span class="chev">${icon('chevronRight')}</span></button>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">計画中の大型支出はありません</div></div></div>'}</div><button type="button" class="secondary" id="largeListAdd">大型支出を計画</button>`};
  pushView('大型支出の計画',draw(),root=>{
    let sig='';
    const signature=()=>JSON.stringify(data.largeExpensePlans.map(p=>[p.id,p.status,p.name,p.date,p.amount,p.priority]));
    const refresh=()=>{const s=signature();if(s===sig)return;sig=s;const body=root.querySelector('.push-body');if(!body)return;if(typeof closeSwipeRow==='function'&&swipeOpenRow&&root.contains(swipeOpenRow))swipeOpenRow=null;body.innerHTML=draw();bind()};
    const remove=async id=>{const p=data.largeExpensePlans.find(x=>x.id===id);if(!p)return refresh();if(!await showAlert('大型支出計画を削除しますか？','実際の取引は削除しません。',{destructive:true,okText:'削除'}))return;const snap=clone(p);try{safeCommit(()=>{if(!data.largeExpensePlans.some(x=>x.id===id))throw new Error('大型支出が見つかりません');data.largeExpensePlans=data.largeExpensePlans.filter(x=>x.id!==id)},{render:true,label:'delete large expense'});feedback.delete?.();refreshFinancialViews?.();refresh();showToast('削除しました',{actionLabel:'元に戻す',action:()=>{undoDeletedLargeExpense(snap);refresh()}})}catch(e){console.error('large expense delete failed',e)}};
    const edit=id=>{const p=data.largeExpensePlans.find(x=>x.id===id);if(!p)return refresh();openLargeExpenseEditor(p,{after:()=>{refresh();renderAll()}})};
    const bind=()=>{sig=signature();
      root.querySelectorAll('[data-large-plan]').forEach(b=>b.onclick=()=>{if(!data.largeExpensePlans.some(x=>x.id===b.dataset.largePlan))return refresh();openLargeExpenseDetail(b.dataset.largePlan)});
      root.querySelector('#largeListAdd').onclick=()=>openLargeExpenseEditor(null,{after:()=>{refresh();renderAll()}});
      installRowSwipeActions(root,{selector:'.le-row',actions:[{key:'edit',label:'編集',icon:'edit',tone:'edit',run:edit},{key:'delete',label:'削除',icon:'trash',tone:'delete',run:id=>remove(id)}]});
    };
    root.__refreshNotices=refresh;root.addEventListener('transitionend',()=>refresh());
    const iv=setInterval(()=>{if(!root.isConnected)return clearInterval(iv);if(pushStack.at(-1)?.id===root.id)refresh()},700);
    bind();
  });
}

/* ---------- #5 資産: 期間の変化・最高・最低 ---------- */
function lgAssetStats(rangeEl){
  const block=rangeEl.closest('#mm3AssetChartBlock')||rangeEl.parentElement;if(!block||block.querySelector('.lg-asset-stats'))return;
  const pts=(typeof mm3AssetChartState!=='undefined'&&mm3AssetChartState?.points)||[];
  const vals=pts.map(p=>Number(p.value??p.balance??p.y)).filter(Number.isFinite);
  const box=document.createElement('div');box.className='lg-asset-stats';
  if(vals.length<2){box.innerHTML=`<div><span>期間の変化</span><strong>—</strong></div><div><span>最高</span><strong>—</strong></div><div><span>最低</span><strong>—</strong></div>`}
  else{const first=vals[0],last=vals.at(-1),d=last-first,pct=first?d/Math.abs(first)*100:0;box.innerHTML=`<div><span>期間の変化</span><strong class="${d>0?'green':d<0?'red':''}">${d>=0?'+':'−'}${yen(Math.abs(d))}</strong><small>${first?`${d>=0?'+':'−'}${Math.abs(pct).toFixed(1)}%`:''}</small></div><div><span>最高</span><strong>${yen(Math.max(...vals))}</strong></div><div><span>最低</span><strong>${yen(Math.min(...vals))}</strong></div>`}
  block.prepend(box);
}

/* ---------- #10-12 編集・登録シート ---------- */
function lgEnhanceSheet(sheet){
  if(!sheet)return;
  sheet.querySelectorAll('select.field-select:not([data-lg])').forEach(sel=>{
    const opts=[...sel.options];if(!opts.length||sel.multiple)return;sel.dataset.lg='1';
    const isDay=opts.filter(o=>/^\d+日$/.test(o.textContent.trim())).length>=28;
    if(!isDay&&opts.length>6)return;
    const box=document.createElement('div');box.className=isDay?'lg-daydial':'lg-pick';box.setAttribute('role','radiogroup');box.setAttribute('aria-label',sel.closest('.form-section')?.querySelector('.form-label')?.textContent||'選択');
    box.innerHTML=opts.map(o=>`<button type="button" role="radio" data-v="${esc(o.value)}" aria-checked="${o.value===sel.value}" class="${o.value===sel.value?'on':''}">${isDay&&/^\d+日$/.test(o.textContent.trim())?`<b>${esc(o.textContent.trim().replace('日',''))}</b><small>日</small>`:esc(o.textContent.trim())}</button>`).join('');
    sel.classList.add('lg-native');sel.after(box);
    const sync=()=>{box.querySelectorAll('button').forEach(b=>{const on=b.dataset.v===sel.value;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on))});const on=box.querySelector('.on');if(on&&isDay&&box.offsetParent)box.scrollTo({left:on.offsetLeft-box.clientWidth/2+on.offsetWidth/2,behavior:lgReduced()?'auto':'smooth'})};
    box.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;sel.value=b.dataset.v;sel.dispatchEvent(new Event('change',{bubbles:true}));sel.dispatchEvent(new Event('input',{bubbles:true}));try{markSheetDirty()}catch(_){}lgTick();sync()});
    sel.addEventListener('change',sync);
    new MutationObserver(()=>{box.classList.toggle('hidden',sel.classList.contains('hidden'));requestAnimationFrame(sync)}).observe(sel,{attributes:true,attributeFilter:['class']});
    box.classList.toggle('hidden',sel.classList.contains('hidden'));requestAnimationFrame(()=>{if(isDay){const on=box.querySelector('.on');if(on)box.scrollLeft=on.offsetLeft-box.clientWidth/2+on.offsetWidth/2}});
  });
  const company=sheet.querySelector('#acCompany');
  if(company&&!sheet.querySelector('.lg-cardart')){
    const name=sheet.querySelector('#acName'),limit=sheet.querySelector('#acLimit .val'),body=sheet.querySelector('.sheet-body');
    const art=document.createElement('div');art.className='lg-cardart';art.setAttribute('aria-hidden','true');
    const paint=()=>{const n=name?.value.trim()||'カード名',c=company.value.trim()||'カード会社';let h=0;for(const ch of c+n)h=(h*31+ch.charCodeAt(0))%360;art.style.setProperty('--h',h);art.innerHTML=`<span class="lg-cardart-chip"></span><span class="lg-cardart-co">${esc(c)}</span><strong>${esc(n)}</strong><span class="lg-cardart-limit"><small>利用限度額</small>${esc(limit?.textContent||'¥0')}</span>`};
    paint();body?.prepend(art);company.addEventListener('input',paint);name?.addEventListener('input',paint);
    if(limit)new MutationObserver(paint).observe(limit,{childList:true,characterData:true,subtree:true});
  }
  if(sheet.querySelector('.form-card'))sheet.classList.add('lg-form');
  lgScan(sheet);
}

/* ---------- 監視して自動で適用 ---------- */
(()=>{
  let raf=0;const run=()=>{raf=0;try{lgScan(document);const sh=document.getElementById('sheet');if(sh?.classList.contains('show'))lgEnhanceSheet(sh)}catch(e){console.error('liquid v16',e)}};
  const mo=new MutationObserver(()=>{if(!raf)raf=requestAnimationFrame(run)});
  mo.observe(document.getElementById('app')||document.body,{childList:true,subtree:true});
  for(const id of ['sheet','pushLayer']){const el=document.getElementById(id);if(el)mo.observe(el,{childList:true,subtree:true,attributes:true,attributeFilter:['class']})}
  run();
  if(/[?&]lgdebug\b/.test(location.search))globalThis.__lg={openHomeSettings,openAcfSetup,openAcfSettings,openAcfDetail,openAcfIndexDetail,openLargeExpenseList,openAddCard,switchTab,pushView,renderAll,data:()=>data,openMenu,closeSheet,closeMenu,popView};
})();
