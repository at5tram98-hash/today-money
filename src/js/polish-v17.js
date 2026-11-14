/* 第17版 仕上げ: ACF指標の作り直し・iOSの動き（引っぱって更新・大見出しの伸び・カードの登場・数字のカウントアップ・棒の伸び） */

/* ---------- ACF指標: 「使えるお金」と「予定の支払い」を2本の棒で比べる（割り算の記号は出さない） ---------- */
function acfCompareBarsHtml(x,{large=false}={}){
  const max=Math.max(1,x.have,x.need),w=v=>Math.max(3,Math.round(v/max*100));
  const row=(cls,label,val,sub)=>`<span class="acfb-row ${cls}"><span class="acfb-head"><span class="acfb-label">${label}</span><b class="acfb-amount">${yen(val)}</b></span><span class="acfb-track"><i style="--w:${w(val)}%"></i></span>${large&&sub?`<small class="acfb-sub">${sub}</small>`:''}</span>`;
  return `<span class="acfb${large?' large':''}">${row('have','使えるお金',x.have,`残高 ${yen(x.balance)}・入金予定 ${yen(x.income)}`)}${row('need','予定の支払い',x.need,`支払い ${yen(x.out)}・最低残高 ${yen(x.reserve)}`)}</span>`;
}
function acfIndexSentence(x){const v=x.value;if(!Number.isFinite(v))return'予定の支払いはありません';if(v>=1)return`使えるお金は、予定の支払いの${acfIndexText(v)}倍あります`;return`予定の支払いに対して、使えるお金が${Math.round((1-v)*100)}%足りません`}
function homeAcfCardHtml(){
  let body,note='';
  if(!data.acfSettings.initialized)body=`<span class="home-card-left"><span class="home-card-value small">未設定</span><span class="home-card-caption">最低残したい金額を決めると、ACF指標を計算します</span></span>`;
  else{
    let f=null;try{f=buildCashFlowForecast()}catch(e){console.error('ACF index failed',e)}
    if(!f)body=`<span class="home-card-left"><span class="home-card-value small">計算できません</span></span>`;
    else{const x=acfIndexFor(f),tone=acfIndexTone(x.value),until=acfIndexUntilText(x);
      body=`<span class="acfc"><span class="acfc-top"><span class="acfc-value ${tone}">${acfIndexText(x.value)}</span><span class="acfc-state ${tone}">${acfIndexLabel(x.value)}</span><span class="acfc-until">${until}</span></span>${acfCompareBarsHtml(x)}<span class="acfc-foot ${x.surplus>=0?'plus':'minus'}">${x.surplus>=0?'余る見込み':'足りない見込み'} <b>${x.surplus>=0?'＋':'−'}${yen(Math.abs(x.surplus))}</b></span></span>`;
      if(x.value<1)note=`<p class="home-card-note">給料日までの支払いと最低残高に ${yen(Math.abs(x.surplus))} 足りません</p>`}
  }
  return `<section class="home-card-wrap" data-home-section="acf"><h2 class="home-card-title">ACF</h2><div class="home-card"><button type="button" class="home-card-body" id="homeAcfCard" aria-label="ACF指標の詳細を開く">${body}</button><p class="home-card-readout" hidden aria-live="polite"></p>${note}</div></section>`;
}
function openAcfIndexDetail(){
  let f;try{f=buildCashFlowForecast()}catch(e){return openAcfDetail()}
  const x=acfIndexFor(f),tone=acfIndexTone(x.value),ev=x.events.slice(0,12);
  pushView('ACF指標',`<div class="acfd-hero ${tone}"><div class="acfd-kicker">ACF指標</div><div class="acfd-line"><span class="acfd-big">${acfIndexText(x.value)}</span><span class="acfc-state ${tone}">${acfIndexLabel(x.value)}</span></div><p class="acfd-sentence">${esc(acfIndexSentence(x))}</p><button type="button" class="acfd-period" id="acfIdxPeriod" aria-label="期間の終わりを変更"><span>${dayLabel(x.start)}〜${dayLabel(x.end)}${acfIndexPeriodNote(x)}</span><span class="acfd-period-edit">変更</span></button>${acfCompareBarsHtml(x,{large:true})}<div class="acfd-result ${x.surplus>=0?'plus':'minus'}"><span>${x.surplus>=0?'余る見込み':'足りない見込み'}</span><b>${x.surplus>=0?'＋':'−'}${yen(Math.abs(x.surplus))}</b></div></div>
    <p class="hs-help acfd-help">1.0で収支がちょうどです。1.0以上なら黒字、1.0未満なら赤字の見込みです（日々の生活費は含みません）。</p>
    <h2 class="section-head">対象期間の入出金</h2><div class="group">${ev.length?ev.map(e=>`<div class="row"><span class="acfd-dot ${e.dir>0?'in':'out'}" aria-hidden="true"></span><div class="row-main"><div class="row-title">${esc(e.label)}</div><div class="row-sub">${dayLabel(e.date)}</div></div><div class="row-value ${e.dir>0?'green':''}">${e.dir>0?'＋':'−'}${yen(e.amount)}</div></div>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">予定された入出金はありません</div></div></div>'}</div>
    <div class="group"><button type="button" class="row press" id="acfIdxDetail"><div class="row-main"><div class="row-title">ACFの日別資金表</div><div class="row-sub">今日使える目安・カード配分・注意点</div></div><span class="chev">${icon('chevronRight')}</span></button><button type="button" class="row press" id="acfIdxSettings"><div class="row-main"><div class="row-title">ACF設定</div><div class="row-sub">最低残高・カード比率</div></div><span class="chev">${icon('chevronRight')}</span></button></div>`,root=>{
    root.querySelector('#acfIdxDetail').onclick=()=>openAcfDetail();
    root.querySelector('#acfIdxSettings').onclick=()=>openAcfSettings();
    root.querySelector('#acfIdxPeriod').onclick=()=>openAcfIndexPeriod(()=>{popView();openAcfIndexDetail()});
  });
}

/* ---------- 起動時: ホームのカードを順に登場させ、大きな金額をカウントアップ（1回だけ） ---------- */
let polishIntroDone=false;
function polishIntro(){
  if(polishIntroDone)return;const content=document.getElementById('todayContent');if(!content||!content.querySelector('.home-card-wrap'))return;polishIntroDone=true;
  if(mm3MotionReduced())return;
  content.querySelectorAll('.home-card-wrap').forEach((w,i)=>w.animate([{opacity:0,transform:'translateY(14px) scale(.985)'},{opacity:1,transform:'none'}],{duration:300,delay:40+i*45,easing:'cubic-bezier(.2,.9,.3,1)',fill:'backwards'}));
  content.querySelectorAll('.home-card-value').forEach(el=>{const t=el.textContent,m=t.match(/^([−-]?¥)([\d,]+)$/);if(!m)return;const target=Number(m[2].replace(/,/g,''));if(!target||target>1e9)return;const t0=performance.now(),d=300;const step=now=>{const p=Math.min(1,(now-t0)/d),e=1-Math.pow(1-p,3);el.textContent=m[1]+Math.round(target*e).toLocaleString('en-US');if(p<1)requestAnimationFrame(step);else el.textContent=t};requestAnimationFrame(step)});
}
new MutationObserver(()=>{if(!polishIntroDone&&!document.getElementById('mm3StorageBoot'))setTimeout(polishIntro,30)}).observe(document.documentElement,{childList:true,subtree:true});

/* ---------- 棒グラフ: 初めて表示された時に下から伸びる ---------- */
(function installBarGrow(){
  if(typeof IntersectionObserver!=='function')return;
  const seen=new WeakSet(),io=new IntersectionObserver(es=>{for(const e of es){if(!e.isIntersecting)continue;io.unobserve(e.target);if(mm3MotionReduced())continue;const bars=e.target.querySelectorAll('.sc-bar, .pro-bar, .acfb-track > i, .hl-bar, .home-card-right rect, .home-card-right .bar');bars.forEach((b,i)=>b.animate([{transform:b.classList.contains('acfb-track')||b.closest('.acfb-track')||b.classList.contains('hl-bar')?'scaleX(0)':'scaleY(0)'},{transform:'none'}],{duration:320,delay:Math.min(i*18,180),easing:'cubic-bezier(.2,.9,.3,1)',fill:'backwards'}))}},{threshold:.2});
  const scan=()=>document.querySelectorAll('.sc-plot, .pro-bar-chart, .acfb, .hl-bars, .home-card-right').forEach(el=>{if(!seen.has(el)){seen.add(el);io.observe(el)}});
  new MutationObserver(()=>{clearTimeout(scan.t);scan.t=setTimeout(scan,60)}).observe(document.documentElement,{childList:true,subtree:true});
})();

/* ---------- 大見出しの伸び（上へ引っぱると少し大きくなる）と、ホームの「引っぱって更新」 ---------- */
(function installPull(){
  let g=null;const TH=72;
  const indicator=()=>{let el=document.getElementById('pullRefresh');if(!el){el=document.createElement('div');el.id='pullRefresh';el.setAttribute('aria-hidden','true');el.innerHTML=busyAnimationHtml('small');document.getElementById('screen-today')?.appendChild(el)}return el};
  document.addEventListener('touchstart',e=>{const sc=e.target.closest?.('.screen.active > .scroll');if(!sc||sc.scrollTop>0||document.querySelector('#sheet.show,#pushLayer .push-view.show'))return;g={sc,y:e.touches[0].clientY,d:0,home:sc.closest('#screen-today')}},{passive:true});
  document.addEventListener('touchmove',e=>{if(!g)return;const d=Math.max(0,e.touches[0].clientY-g.y);g.d=d;if(g.sc.scrollTop>0){g.d=0;return}const title=g.sc.closest('.screen')?.querySelector('.topbar .large-title');if(title&&!mm3MotionReduced()){title.style.transition='none';title.style.transformOrigin='0 50%';title.style.transform=`scale(${1+Math.min(d,140)/1400})`}if(g.home){const el=indicator(),p=Math.min(1,d/TH);el.style.opacity=String(p);el.style.transform=`translate(-50%,${Math.min(d,TH)*.6}px) rotate(${p*270}deg)`;el.classList.toggle('ready',p>=1)}},{passive:true});
  const end=()=>{if(!g)return;const cur=g;g=null;const title=cur.sc.closest('.screen')?.querySelector('.topbar .large-title');if(title){title.style.transition='transform .32s cubic-bezier(.3,1.3,.5,1)';title.style.transform=''}
    if(cur.home){const el=indicator();if(cur.d>=TH){el.classList.add('spinning');feedback?.selection?.();setTimeout(()=>{try{acfForecastCache=null}catch(e){}try{renderAll()}catch(e){}try{maybeAutoSyncGmail(true)}catch(e){}try{if(shiftRelay().enabled)syncShiftRelay({silent:true,force:true})}catch(e){}try{const c=shiftCal();if(c.enabled&&c.calendarId&&calTokenValid())syncShiftCalendar({silent:true})}catch(e){}el.classList.remove('spinning','ready');el.style.opacity='0';el.style.transform='';showToast('最新の状態にしました')},650)}else{el.style.transition='opacity .2s, transform .25s';el.style.opacity='0';el.style.transform='translate(-50%,0)';setTimeout(()=>{el.style.transition=''},260)}}};
  document.addEventListener('touchend',end,{passive:true});document.addEventListener('touchcancel',end,{passive:true});
})();

/* ---------- push画面の奥の画面が少し左へずれて暗くなる（iOSの視差） ---------- */
(function installPushParallax(){
  const layer=document.getElementById('pushLayer');if(!layer)return;
  const apply=()=>{const views=[...layer.querySelectorAll('.push-view.show')];views.forEach((v,i)=>v.classList.toggle('push-under',i<views.length-1));document.documentElement.classList.toggle('mm3-push-open',views.length>0)};
  new MutationObserver(apply).observe(layer,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
})();
