/* 第18版: シフトボード（iPhoneのカレンダー）から給与を自動で計算する
   流れ: シフトボード → iPhoneのカレンダー → iOSショートカット（毎日の自動実行）→ 受け渡しサーバー → このアプリ
   ・アプリを開いた時に1日1回（新しいシフトが届いていればその都度）受け取り、時給×勤務時間（勤務先の休憩ルールで休憩を引く・
     深夜割増）＋交通費（1回ごと・月の上限あり）で、勤務先・勤務月ごとの給与（予定）を作り直す
   ・給与を手で入力・修正した月は、7日間は自動で上書きしない（手入力が優先）
   ・入金済みの給与は変えない */

/* ---------- ACF指標の期間: カードの支払いが終わる日（毎月28日）まで ---------- */
function acfIndexEndDay(){const d=Math.round(Number(data.acfSettings?.indexEndDay));return d>=1&&d<=31?d:28}
function acfIndexEndKind(start=ymd()){const o=String(data.acfSettings?.indexEndDate||'');return /^\d{4}-\d{2}-\d{2}$/.test(o)&&o>=start?'custom':'monthly'}
function acfIndexEndDate(start=ymd()){
  if(acfIndexEndKind(start)==='custom')return data.acfSettings.indexEndDate;
  const day=acfIndexEndDay(),d=parseYmd(start),at=(y,m)=>{const last=new Date(y,m+1,0).getDate();return ymd(new Date(y,m,Math.min(day,last)))};
  let end=at(d.getFullYear(),d.getMonth());if(end<start)end=at(d.getFullYear(),d.getMonth()+1);return end;
}
function acfIndexDayText(){const d=acfIndexEndDay();return d>=31?'月末':`${d}日`}
function acfIndexUntilText(x){return `${Number(x.end.slice(5,7))}/${Number(x.end.slice(8,10))} まで`}
function acfIndexPeriodNote(x){return x.endKind==='custom'?'（指定した日まで）':`（カードの支払いが終わる毎月${acfIndexDayText()}まで）`}
function openAcfIndexPeriod(after){
  const s=data.acfSettings||{},start=ymd();let day=acfIndexEndDay(),custom=acfIndexEndKind(start)==='custom'?s.indexEndDate:'';
  const days=Array.from({length:31},(_,i)=>i+1);
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="aipCancel">キャンセル</button><div class="sheet-title">ACF指標の期間</div><button type="button" class="nav-text bold" id="aipSave">保存</button></div><div class="sheet-body aip">
    <p class="aip-lead">今日から、ここで決めた日までの支払いと入金でACF指標を計算します。</p>
    <div class="form-group-title">毎月の終わりの日</div><div class="form-card"><label class="row aip-row"><div class="row-main"><div class="row-title">カードの支払いが終わる日</div><div class="row-sub">初期値は28日（カードの引き落としが28日までに終わるため）</div></div><select class="field aip-select" id="aipDay" aria-label="毎月の終わりの日">${days.map(d=>`<option value="${d}"${d===day?' selected':''}>${d>=31?'月末':`${d}日`}</option>`).join('')}</select></label></div>
    <div class="form-group-title">今回だけ日付を指定</div><div class="form-card"><div class="row"><div class="row-main"><div class="row-title">日付を指定する</div><div class="row-sub">指定した日を過ぎると、毎月の日に戻ります</div></div><button type="button" class="switch${custom?' on':''}" id="aipCustom" role="switch" aria-checked="${!!custom}" aria-label="日付を指定する"></button></div><div class="row aip-date-row${custom?'':' hidden'}" id="aipDateRow"><div class="row-main"><div class="row-title">終わりの日</div></div><input class="field aip-date" type="date" id="aipDate" min="${start}" value="${esc(custom||acfIndexEndDate(start))}" aria-label="終わりの日"></div></div>
    <p class="settings-section-footer" id="aipPreview"></p></div>`,'half',root=>{
    const daySel=root.querySelector('#aipDay'),sw=root.querySelector('#aipCustom'),row=root.querySelector('#aipDateRow'),date=root.querySelector('#aipDate'),prev=root.querySelector('#aipPreview');
    const preview=()=>{const save={...data.acfSettings};data.acfSettings={...save,indexEndDay:Number(daySel.value),indexEndDate:sw.classList.contains('on')?date.value:''};let e='';try{e=acfIndexEndDate(start)}finally{data.acfSettings=save}prev.textContent=`今回の期間: ${dayLabel(start)}〜${dayLabel(e)}`};
    daySel.onchange=()=>{markSheetDirty(true);preview()};date.onchange=()=>{markSheetDirty(true);preview()};
    sw.onclick=()=>{const on=!sw.classList.contains('on');sw.classList.toggle('on',on);sw.setAttribute('aria-checked',String(on));row.classList.toggle('hidden',!on);markSheetDirty(true);preview()};
    root.querySelector('#aipCancel').onclick=requestSheetClose;
    root.querySelector('#aipSave').onclick=()=>{
      const on=sw.classList.contains('on'),d=date.value;
      if(on&&!(/^\d{4}-\d{2}-\d{2}$/.test(d)&&d>=start))return showAlert('日付を確認してください','今日以降の日付を選んでください。');
      try{safeCommit(()=>{data.acfSettings={...data.acfSettings,indexEndDay:Number(daySel.value)||28,indexEndDate:on?d:''}},{render:true,label:'acf index period'})}catch(e){return}
      try{acfForecastCache=null}catch(e){}
      markSheetDirty(false);closeSheet();feedback?.success?.();showToast(`ACF指標を ${dayLabel(acfIndexEndDate(start))} までで計算します`);after?.();
    };
    preview();
  });
}

/* ---------- 受け渡しサーバー（iPhoneのショートカット → アプリ） ---------- */
const SHIFT_RELAY_RECHECK_MS=3*3600e3;
let shiftRelayBusy=false;
function shiftRelay(){return{enabled:false,key:'',lastCheckAt:0,lastUpdatedAt:0,lastApplyDay:'',lastAppliedAt:'',lastCount:0,lastTotal:0,lastManual:0,lastError:'',unmatched:[],...(data.shiftSettings?.relay||{})}}
function setShiftRelay(patch){try{safeCommit(()=>{data.shiftSettings={...shiftSettings(),relay:{...shiftRelay(),...patch}}},{render:false,label:'shift relay',invalidateAcf:false})}catch(e){}}
function shiftRelayNewKey(){const b=new Uint8Array(32);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function shiftRelayKey(){let k=shiftRelay().key;if(!/^[A-Za-z0-9_-]{43,128}$/.test(k)){k=shiftRelayNewKey();setShiftRelay({key:k})}return k}
async function shiftRelayBase(){
  if(pushConfiguration?.apiBase)return pushConfiguration.apiBase;
  try{const r=await fetch('./push-config.json',{cache:'no-store'});if(r.ok){const j=await r.json();if(/^https:\/\//.test(j.apiBase||''))return String(j.apiBase).replace(/\/$/,'')}}catch(e){}
  return 'https://today-money-push.at5tram98.workers.dev';
}
async function shiftRelayFetch(){
  const base=await shiftRelayBase(),ctl=typeof AbortController==='function'?new AbortController():null,timer=ctl?setTimeout(()=>ctl.abort(),15000):0;
  let r;try{r=await fetch(base+'/v1/shifts',{headers:{Authorization:'Bearer '+shiftRelayKey()},cache:'no-store',signal:ctl?.signal})}catch(e){throw new Error('受け渡しサーバーに接続できませんでした。通信状態を確認してください。')}finally{clearTimeout(timer)}
  if(r.status===404||r.status===405)throw new Error('受け渡しサーバーがまだ準備できていません（サーバーの更新待ち）。');
  if(!r.ok)throw new Error(`受け渡しサーバーのエラー（${r.status}）`);
  return r.json();
}
/* 勤務先の割り当て（自動）: 割り当て表 → 名前・別名 → 勤務先が1つだけならそれ。どれにも当たらない予定は使わない */
function shiftEmployerStrict(title,s=shiftSettings()){
  if(s.titleMap[title]&&employerById(s.titleMap[title]))return s.titleMap[title];
  const t=normalizeMerchantKey(title);if(t){const hit=data.employers.find(e=>[e.name,...(e.aliases||[])].some(x=>{const n=normalizeMerchantKey(x);return n&&(t.includes(n)||n.includes(t))}));if(hit)return hit.id}
  return data.employers.length===1?data.employers[0].id:'';
}
/* 送られてきたシフト＋その前に保存済みのシフト（同じ給与月の過去分）で、給与（予定）を作り直す */
function applyShiftsAuto(shifts,{replace=true}={}){
  const s=shiftSettings(),mapped=[],unmatched=new Set();
  for(const x of shifts){const id=x.employerId&&employerById(x.employerId)?x.employerId:shiftEmployerStrict(x.title,s);if(id)mapped.push({...x,employerId:id});else unmatched.add(x.title||'（名前なし）')}
  if(!mapped.length)return{count:0,total:0,results:[],unmatched:[...unmatched]};
  const from=mapped.reduce((m,x)=>x.date<m?x.date:m,mapped[0].date),keepFrom=addMonths(from.slice(0,7),-2)+'-01';
  const before=(data.shiftPlans||[]).filter(p=>p.date<from&&p.date>=keepFrom&&employerById(p.employerId)).map(p=>({date:p.date,start:p.start,end:p.end,title:p.title,employerId:p.employerId}));
  const months=new Set(mapped.map(x=>`${x.employerId}|${shiftWorkMonth(employerById(x.employerId),x.date)}`));
  const groups=shiftEstimate([...before,...mapped],s).filter(g=>months.has(`${g.employerId}|${g.month}`));
  const results=saveShiftImport(groups,{},{auto:true,replaceFrom:replace?from:''});
  const used=results.filter(r=>r.state==='created'||r.state==='updated');
  return{count:mapped.length,total:used.reduce((a,r)=>a+r.g.gross+r.g.transport,0),results,unmatched:[...unmatched]};
}
async function syncShiftRelay({silent=true,force=false}={}){
  const r=shiftRelay();if(shiftRelayBusy||!r.enabled)return null;
  if(!force&&r.lastApplyDay===ymd()&&Date.now()-Number(r.lastCheckAt||0)<SHIFT_RELAY_RECHECK_MS)return null;
  shiftRelayBusy=true;
  try{
    const j=await shiftRelayFetch(),updatedAt=Number(j.updatedAt)||0,text=String(j.text||'');
    if(!text.trim()){setShiftRelay({lastCheckAt:Date.now(),lastError:'まだショートカットからシフトが届いていません'});if(!silent)showAlert('まだシフトが届いていません','iPhoneの「ショートカット」で「シフトを送る」を1回実行してから、もう一度お試しください。');return null}
    if(!force&&updatedAt===Number(r.lastUpdatedAt)&&r.lastApplyDay===ymd()){setShiftRelay({lastCheckAt:Date.now(),lastError:''});return null}
    const shifts=parseShiftText(text);
    if(!shifts.length){setShiftRelay({lastCheckAt:Date.now(),lastUpdatedAt:updatedAt,lastError:'届いた内容からシフトを読み取れませんでした（日付と時刻の形式を確認してください）'});if(!silent)showAlert('シフトを読み取れませんでした','ショートカットの「テキスト」が「2026-12-01 10:00-18:00 GU」の形になっているか確認してください。');return null}
    const out=applyShiftsAuto(shifts),manual=out.results.filter(x=>x.state==='manual').length;
    setShiftRelay({lastCheckAt:Date.now(),lastUpdatedAt:updatedAt,lastApplyDay:ymd(),lastAppliedAt:new Date().toISOString(),lastCount:out.count,lastTotal:out.total,lastManual:manual,lastError:out.count?'':'シフトの予定名がどの勤務先にも当てはまりません',unmatched:out.unmatched.slice(0,8)});
    if(out.count&&!silent)showToast(`シフト${out.count}件から給料の見込みを更新しました${manual?`（手入力の${manual}件はそのまま）`:''}`);
    try{refreshSalaryOpenView()}catch(e){}try{refreshSalarySettings()}catch(e){}
    return out;
  }catch(e){setShiftRelay({lastCheckAt:Date.now(),lastError:String(e?.message||e)});if(!silent)showAlert('シフトを受け取れませんでした',String(e?.message||e));return null}
  finally{shiftRelayBusy=false}
}
/* 保存済みのシフトから計算し直す（時給・休憩ルールを変えた時） */
function recalcSalaryFromSavedShifts(){
  const from=addMonths(ym(),-1)+'-01',plans=(data.shiftPlans||[]).filter(p=>p.date>=from&&employerById(p.employerId));
  if(!plans.length)return null;
  return applyShiftsAuto(plans.map(p=>({date:p.date,start:p.start,end:p.end,title:p.title||'',employerId:p.employerId})),{replace:false});
}
/* 起動時・アプリに戻った時: iPhoneのカレンダー（ショートカット経由）→ Googleカレンダーの順に1日1回 */
function maybeAutoSyncShifts(){
  try{if(shiftRelay().enabled)syncShiftRelay({silent:true})}catch(e){}
  const cal=shiftCal();if(!cal.enabled||!cal.calendarId||cal.lastDay===ymd()||calSyncing)return;
  if(calTokenValid()){syncShiftCalendar({silent:true});return}
  if(calPromptedDay===ymd())return;calPromptedDay=ymd();
  showToast('今日のシフトをまだ取り込んでいません',{actionLabel:'Googleで更新',action:()=>syncShiftCalendar({silent:false})});
}

/* ---------- 給与画面の上の「シフトから自動計算」 ---------- */
function salaryManualLocked(){return(data.salaryRecords||[]).filter(r=>r.status!=='入金済'&&salaryManualLockUntil(r)>Date.now())}
function salaryLockDaysLeft(r){return Math.max(1,Math.ceil((salaryManualLockUntil(r)-Date.now())/864e5))}
function salarySyncStripHtml(){
  const r=shiftRelay();if(!r.enabled)return '';
  const locked=salaryManualLocked().length,text=r.lastAppliedAt?`シフトから計算・${homeTimeLabel(r.lastAppliedAt)}更新${locked?`・手入力${locked}件`:''}`:'シフトの受け取り待ち';
  return `<button type="button" class="sal-sync-note" id="salarySyncStrip" aria-label="給与・勤務先の設定を開く">${esc(text)}</button>`;
}

/* ---------- その他 → 給与・勤務先 ---------- */
function employerTermsText(e){
  const parts=[`時給 ${yen(Number(e.hourly)||0)}`];
  if(Number(e.transport)>0)parts.push(`交通費 ${e.transportUnit==='per_shift'?'往復':'月'} ${yen(e.transport)}${Number(e.transportCap)>0?`（上限 ${yen(e.transportCap)}）`:''}`);
  parts.push(e.breakRules?.length?`休憩ルール ${e.breakRules.length}件`:'休憩ルールなし');
  return parts.join('・');
}
function breakRuleText(r){const h=m=>{const x=m/60;return Number.isInteger(x)?`${x}時間`:`${Math.floor(x)}時間${m%60}分`};return `${h(r.from)}以上${r.to!=null?`${h(r.to)}未満`:''} → 休憩${r.minutes}分`}
function salaryUpcomingShiftPay(){
  const today=ymd(),list=(data.salaryRecords||[]).filter(r=>r.status!=='入金済'&&r.date>=today&&(r.source==='shift'||r.source==='manual')).sort((a,b)=>a.date.localeCompare(b.date));
  const first=list[0];if(!first)return null;const same=list.filter(r=>r.date===first.date);
  return{date:first.date,total:same.reduce((s,r)=>s+(Number(r.gross)||0)+(Number(r.transport)||0),0),records:same};
}
function salarySettingsHtml(){
  const r=shiftRelay(),s=shiftSettings(),next=salaryUpcomingShiftPay(),locked=salaryManualLocked();
  return `<div class="salx-hero"><span class="salx-hero-icon" aria-hidden="true">${icon('briefcase')}</span><div class="salx-kicker">${next?`次の給料日 ${Number(next.date.slice(5,7))}/${Number(next.date.slice(8,10))}`:'次の給料'}</div><div class="salx-value">${next?yen(next.total):'—'}</div><div class="salx-sub">${next?esc(next.records.map(x=>`${employerById(x.employerId)?.name||'勤務先'} ${yen((Number(x.gross)||0)+(Number(x.transport)||0))}${x.source==='manual'?'（手入力）':''}`).join('・')):'シフトを取り込むと、時給と交通費から計算します'}</div></div>
  <h2 class="reg-head">勤務先と給与の条件</h2><div class="group">${data.employers.map(e=>`<button type="button" class="row press reg-row" data-terms="${esc(e.id)}"><span class="reg-icon" style="--c:var(--teal)" aria-hidden="true">${icon('briefcase')}</span><div class="row-main"><div class="row-title">${esc(e.name)}</div><div class="row-sub">${esc(employerTermsText(e))}</div></div><span class="chev">${icon('chevronRight')}</span></button>`).join('')}${regAddHtml('regAddEmployer','勤務先を追加')}</div>
  <h2 class="reg-head">計算のしかた</h2><div class="group"><div class="row"><div class="row-main"><div class="row-title">深夜割増（22時〜5時）</div><div class="row-sub">時給の25%を上乗せ</div></div><button type="button" class="switch${s.nightRate>0?' on':''}" id="salNight" role="switch" aria-checked="${s.nightRate>0}" aria-label="深夜割増"></button></div></div>
  <h2 class="reg-head">シフトの自動取り込み</h2><div class="group">
    <div class="row"><div class="row-main"><div class="row-title">毎日自動で取り込む</div><div class="row-sub">シフトボードがiPhoneのカレンダーに書き出したシフトを、1日1回受け取ります</div></div><button type="button" class="switch${r.enabled?' on':''}" id="relayAuto" role="switch" aria-checked="${r.enabled}" aria-label="毎日自動で取り込む"></button></div>
    <button type="button" class="row press" id="relayGuide"><span class="reg-icon" style="--c:var(--purple)" aria-hidden="true">${icon('repeat')}</span><div class="row-main"><div class="row-title">ショートカットを設定</div><div class="row-sub">最初に1回だけ（約3分）</div></div><span class="chev">${icon('chevronRight')}</span></button>
    <button type="button" class="row press" id="relayNow"><span class="reg-icon" style="--c:var(--accent)" aria-hidden="true">${icon('download')}</span><div class="row-main"><div class="row-title">今すぐ取り込む</div><div class="row-sub">${r.lastAppliedAt?`前回 ${esc(homeTimeLabel(r.lastAppliedAt))}・${r.lastCount}件・${yen(r.lastTotal)}`:'まだ取り込んでいません'}</div></div><span class="chev">${icon('chevronRight')}</span></button>
    ${r.lastError?`<div class="row shift-cal-error" role="alert"><div class="row-main"><div class="row-title">確認が必要です</div><div class="row-sub">${esc(r.lastError)}</div></div></div>`:''}
  </div>
  ${(r.unmatched||[]).length?`<h2 class="reg-head">勤務先が分からない予定</h2><div class="group">${r.unmatched.map(t=>`<div class="row shift-map"><div class="row-main"><div class="row-title">${esc(t)}</div><div class="row-sub">どの勤務先のシフトですか？</div></div><div class="shift-emp-chips">${data.employers.map(e=>`<button type="button" class="shift-chip" data-map-title="${esc(t)}" data-map-emp="${esc(e.id)}">${esc(e.name)}</button>`).join('')}</div></div>`).join('')}</div>`:''}
  <p class="settings-section-footer">給与を手で入力・修正すると、その月の給与は<b>7日間</b>自動で上書きしません（手入力が優先）。入金済みの給与は変えません。</p>
  ${locked.length?`<h2 class="reg-head">手入力を優先している給与</h2><div class="group">${locked.map(x=>`<div class="row"><div class="row-main"><div class="row-title">${esc(employerById(x.employerId)?.name||'勤務先')}・${monthLabel(x.month)}勤務分 ${yen((Number(x.gross)||0)+(Number(x.transport)||0))}</div><div class="row-sub">あと${salaryLockDaysLeft(x)}日は自動で上書きしません</div></div><button type="button" class="pill-btn" data-unlock="${esc(x.id)}">自動に戻す</button></div>`).join('')}</div>`:''}
  <h2 class="reg-head">ほかの取り込み方法</h2><div class="group"><button type="button" class="row press reg-row" id="regShiftImport"><span class="reg-icon" style="--c:var(--orange)" aria-hidden="true">${icon('calendar')}</span><div class="row-main"><div class="row-title">Googleカレンダー・貼り付けで取り込む</div><div class="row-sub">シフトを手動で取り込む時に使います</div></div><span class="chev">${icon('chevronRight')}</span></button></div>`;
}
function refreshSalarySettings(){const top=pushStack.at(-1);if(top?.title==='給与・勤務先')openEmployersSettings()}
function openEmployersSettings(){
  const draw=()=>settingsDetailView('給与・勤務先',salarySettingsHtml(),root=>{
    root.__refreshRegistrations=draw;
    root.querySelector('#relayAuto').onclick=e=>{const b=e.currentTarget,on=!shiftRelay().enabled;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));feedback?.selection?.();setTimeout(()=>{setShiftRelay({enabled:on,key:shiftRelayKey()});if(on&&!shiftRelay().lastAppliedAt)openShiftRelayGuide();else{draw();if(on)syncShiftRelay({silent:false,force:true}).then(draw)}},mm3MotionReduced()?0:280)};
    root.querySelector('#relayGuide').onclick=()=>openShiftRelayGuide();
    root.querySelector('#relayNow').onclick=async e=>{if(!shiftRelay().enabled)setShiftRelay({enabled:true,key:shiftRelayKey()});const b=e.currentTarget;b.classList.add('loading');b.setAttribute('aria-busy','true');await syncShiftRelay({silent:false,force:true});draw()};
    root.querySelectorAll('[data-map-title]').forEach(b=>b.onclick=()=>{const t=b.dataset.mapTitle;try{safeCommit(()=>{const s=shiftSettings();s.titleMap[t]=b.dataset.mapEmp;data.shiftSettings={...s,relay:{...shiftRelay(),unmatched:shiftRelay().unmatched.filter(x=>x!==t)}}},{render:false,label:'shift title map',invalidateAcf:false})}catch(_){}feedback?.selection?.();syncShiftRelay({silent:true,force:true}).then(draw);draw()});
    root.querySelectorAll('[data-unlock]').forEach(b=>b.onclick=()=>{try{safeCommit(()=>{const x=data.salaryRecords.find(r=>r.id===b.dataset.unlock);if(x){delete x.manualAt;x.source='shift'}},{render:true,label:'salary unlock'})}catch(_){}feedback?.selection?.();const done=()=>{try{recalcSalaryFromSavedShifts()}catch(_){}draw();showToast('自動の計算に戻しました')};if(shiftRelay().enabled)syncShiftRelay({silent:true,force:true}).then(done);else done()});
    root.querySelectorAll('[data-terms]').forEach(b=>b.onclick=()=>openEmployerPayTerms(b.dataset.terms));
    root.querySelector('#regAddEmployer').onclick=()=>openEmployerCreate(()=>{renderAll();draw()});
    root.querySelector('#regShiftImport').onclick=()=>openShiftGuide();
    root.querySelector('#salNight').onclick=e=>{const b=e.currentTarget,on=!(shiftSettings().nightRate>0);b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));setTimeout(()=>{try{safeCommit(()=>{data.shiftSettings={...shiftSettings(),nightRate:on?25:0}},{render:false,label:'night rate',invalidateAcf:false})}catch(_){}try{recalcSalaryFromSavedShifts()}catch(_){}draw()},mm3MotionReduced()?0:280)};
  });
  draw();
}

/* ---------- 勤務先ごとの給与条件（時給・交通費・上限・休憩ルール・カレンダーの予定名） ---------- */
function employerTermsExample(e){
  const d=shiftDuration('10:00','18:00',true,e.breakRules),pay=Math.round((Number(e.hourly)||0)*d.work/60),t=Number(e.transport)>0&&e.transportUnit==='per_shift'?Number(e.transport):0;
  return `<div class="salx-example"><div class="salx-example-head">計算の例: 10:00〜18:00（8時間）</div><div class="salx-example-line"><span>休憩 ${d.brk}分 → 働いた時間 ${shiftHoursLabel(d.work)}</span><b>${yen(pay)}</b></div>${t?`<div class="salx-example-line"><span>交通費（往復）</span><b>${yen(t)}</b></div>`:''}<div class="salx-example-line total"><span>この日の給料</span><b>${yen(pay+t)}</b></div></div>`;
}
function openEmployerPayTerms(id){
  const title=()=>`${employerById(id)?.name||'勤務先'}の給与`;
  const save=(mut,msg)=>{try{safeCommit(()=>{const e=employerById(id);if(e)mut(e)},{render:true,label:'employer terms'})}catch(_){return}feedback?.selection?.();let n=null;try{n=recalcSalaryFromSavedShifts()}catch(_){}if(msg)showToast(n&&n.count?`${msg}・保存済みのシフトで計算し直しました`:msg);draw();try{refreshSalarySettings()}catch(_){}};
  const draw=()=>{const e=employerById(id);if(!e)return;settingsDetailView(title(),`${employerTermsExample(e)}
    <h2 class="reg-head">給与</h2><div class="group">
      <button type="button" class="row press" id="ptHourly"><div class="row-main"><div class="row-title">時給</div></div><div class="row-value">${yen(Number(e.hourly)||0)}</div><span class="chev">${icon('chevronRight')}</span></button>
      <button type="button" class="row press" id="ptTransport"><div class="row-main"><div class="row-title">交通費</div><div class="row-sub">${e.transportUnit==='per_shift'?'出勤1回あたり（往復）':'毎月の定額'}</div></div><div class="row-value">${yen(Number(e.transport)||0)}</div><span class="chev">${icon('chevronRight')}</span></button>
      <div class="row"><div class="row-main"><div class="row-title">出勤1回ごとに払われる</div><div class="row-sub">オフにすると毎月の定額として計算します</div></div><button type="button" class="switch${e.transportUnit==='per_shift'?' on':''}" id="ptPerShift" role="switch" aria-checked="${e.transportUnit==='per_shift'}" aria-label="交通費は出勤1回ごと"></button></div>
      <button type="button" class="row press" id="ptCap"><div class="row-main"><div class="row-title">交通費の上限（1か月）</div></div><div class="row-value">${Number(e.transportCap)>0?yen(e.transportCap):'なし'}</div><span class="chev">${icon('chevronRight')}</span></button>
    </div>
    <h2 class="reg-head">休憩ルール</h2><div class="group">${(e.breakRules||[]).map((r,i)=>`<div class="row"><span class="reg-icon" style="--c:var(--orange)" aria-hidden="true">${icon('clock')}</span><div class="row-main"><div class="row-title">${esc(breakRuleText(r))}</div></div><button type="button" class="icon-btn pt-del" data-del-rule="${i}" aria-label="${esc(breakRuleText(r))}を削除">${icon('trash')}</button></div>`).join('')}${regAddHtml('ptAddRule','休憩ルールを追加')}</div>
    <p class="settings-section-footer">シフトの開始〜終了の長さがこの範囲のときに、休憩を引いて計算します。ルールがない場合は、6時間超で45分・8時間超で60分を引きます。</p>
    <h2 class="reg-head">カレンダーの予定名</h2><div class="group"><div class="row pt-alias-row"><div class="row-main"><div class="row-title">この名前の予定を${esc(e.name)}のシフトにする</div><input class="field pt-alias" id="ptAliases" value="${esc((e.aliases||[]).join('、'))}" placeholder="例: ジーユー、GU 渋谷店" aria-label="カレンダーの予定名（読点で区切る）" enterkeyhint="done"></div></div></div>
    <p class="settings-section-footer">「${esc(e.name)}」を含む予定は自動で${esc(e.name)}になります。シフトボードの予定名が違う時は、ここに読点（、）で区切って追加してください。</p>
    <h2 class="reg-head">支給日</h2><div class="group"><button type="button" class="row press" id="ptSchedule"><div class="row-main"><div class="row-title">締め日・給料日・振込口座</div><div class="row-sub">${e.closingType==='day'?`${e.closingDay}日締め`:'月末締め'}・${e.payMonthOffset?'翌月':'当月'}${e.payType==='day'?`${e.payDay}日`:'末日'}払い</div></div><span class="chev">${icon('chevronRight')}</span></button></div>`,root=>{
      const e2=()=>employerById(id);
      root.querySelector('#ptHourly').onclick=()=>openCalculator('時給',Number(e2().hourly)||0,v=>save(x=>{x.hourly=Math.max(0,Math.round(v))},'時給を変更しました'));
      root.querySelector('#ptTransport').onclick=()=>openCalculator('交通費',Number(e2().transport)||0,v=>save(x=>{x.transport=Math.max(0,Math.round(v))},'交通費を変更しました'));
      root.querySelector('#ptCap').onclick=()=>openCalculator('交通費の上限（0でなし）',Number(e2().transportCap)||0,v=>save(x=>{x.transportCap=Math.max(0,Math.round(v))},'交通費の上限を変更しました'));
      root.querySelector('#ptPerShift').onclick=ev=>{const b=ev.currentTarget,on=e2().transportUnit!=='per_shift';b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));setTimeout(()=>save(x=>{x.transportUnit=on?'per_shift':'monthly'},'交通費の数え方を変更しました'),mm3MotionReduced()?0:280)};
      root.querySelectorAll('[data-del-rule]').forEach(b=>b.onclick=async()=>{const i=Number(b.dataset.delRule);if(!await showAlert('この休憩ルールを削除しますか？',breakRuleText(e2().breakRules[i]),{destructive:true,okText:'削除'}))return;save(x=>{x.breakRules=(x.breakRules||[]).filter((_,k)=>k!==i)},'休憩ルールを削除しました')});
      root.querySelector('#ptAddRule').onclick=()=>openBreakRuleSheet(r=>save(x=>{x.breakRules=[...(x.breakRules||[]),r].sort((a,b)=>a.from-b.from)},'休憩ルールを追加しました'));
      const al=root.querySelector('#ptAliases');al.onchange=()=>{const list=[...new Set(al.value.normalize('NFKC').split(/[、,，\n]/).map(x=>x.trim()).filter(Boolean))].slice(0,12);save(x=>{x.aliases=list},'予定名を保存しました')};al.onkeydown=ev=>{if(ev.key==='Enter'){ev.preventDefault();al.blur()}};
      root.querySelector('#ptSchedule').onclick=()=>openEmployerEdit(e2());
    })};
  draw();
}
function openBreakRuleSheet(onAdd){
  const hours=Array.from({length:25},(_,i)=>i*30).filter(m=>m<=720),opt=(m,sel)=>`<option value="${m}"${m===sel?' selected':''}>${m%60?`${Math.floor(m/60)}時間${m%60}分`:`${m/60}時間`}</option>`;
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="brCancel">キャンセル</button><div class="sheet-title">休憩ルール</div><button type="button" class="nav-text bold" id="brSave">追加</button></div><div class="sheet-body"><div class="form-card">
    <label class="row"><div class="row-main"><div class="row-title">勤務が</div></div><select class="field br-sel" id="brFrom" aria-label="何時間以上">${hours.filter(m=>m>0).map(m=>opt(m,240)).join('')}</select><span class="br-unit">以上</span></label>
    <label class="row"><div class="row-main"><div class="row-title">上限</div></div><select class="field br-sel" id="brTo" aria-label="何時間未満"><option value="">なし</option>${hours.filter(m=>m>0).map(m=>opt(m,-1)).join('')}</select><span class="br-unit">未満</span></label>
    <label class="row"><div class="row-main"><div class="row-title">休憩</div></div><select class="field br-sel" id="brMin" aria-label="休憩の分">${[15,30,45,60,75,90,120].map(m=>`<option value="${m}"${m===30?' selected':''}>${m}分</option>`).join('')}</select></label>
  </div><p class="settings-section-footer" id="brPreview"></p></div>`,'half',root=>{
    const f=root.querySelector('#brFrom'),t=root.querySelector('#brTo'),m=root.querySelector('#brMin'),p=root.querySelector('#brPreview');
    const rule=()=>({from:Number(f.value),to:t.value===''?null:Number(t.value),minutes:Number(m.value)});
    const upd=()=>{p.textContent=breakRuleText(rule())};[f,t,m].forEach(x=>x.onchange=()=>{markSheetDirty(true);upd()});upd();
    root.querySelector('#brCancel').onclick=requestSheetClose;
    root.querySelector('#brSave').onclick=()=>{const r=rule();if(r.to!=null&&r.to<=r.from)return showAlert('時間を確認してください','「未満」は「以上」より長くしてください。');markSheetDirty(false);closeSheet();onAdd(r)};
  });
}

/* ---------- ショートカットの設定（最初に1回だけ） ---------- */
async function copyShiftText(text,label){try{await navigator.clipboard.writeText(text);feedback?.success?.();showToast(`${label}をコピーしました`)}catch(e){showAlert('コピーできませんでした','長押しして選択し、コピーしてください。')}}
async function openShiftRelayGuide(){
  const key=shiftRelayKey(),base=await shiftRelayBase(),url=`${base}/v1/shifts`,auth=`Bearer ${key}`;
  settingsDetailView('ショートカットの設定',`
    <div class="shift-hero small"><span class="shift-hero-icon" aria-hidden="true">${icon('repeat')}</span><div class="shift-hero-kicker">シフトボード → iPhoneのカレンダー → ショートカット → このアプリ</div><div class="shift-hero-sub">iPhoneの「ショートカット」が毎朝カレンダーのシフトを送り、このアプリが開いた時に受け取って給料を計算します。</div></div>
    <h2 class="reg-head">0. シフトボードの準備</h2><ol class="shift-steps"><li>シフトボードの「設定」→「カレンダー連携」をオンにし、書き出すカレンダー（例:「シフトボード」）を決める</li></ol>
    <h2 class="reg-head">1. ショートカットを作る</h2>
    <ol class="shift-steps" start="2">
      <li>「ショートカット」アプリで＋を押し、名前を「シフトを送る」にする</li>
      <li>「カレンダーの予定を検索」を追加。<b>カレンダー</b>が「シフトボードのカレンダー」、<b>開始日</b>が「次の60日間」（「すべての条件に一致」）、並び順は「開始日」、上限はオフ</li>
      <li>「各項目を繰り返す」を追加し、中に「テキスト」を置いて<br><code>［開始日］-［終了日］ ［タイトル］</code><br>とする。開始日の書式は「カスタム: yyyy-MM-dd HH:mm」、終了日は「カスタム: HH:mm」</li>
      <li>繰り返しのあとに「テキストを結合」（区切り: 改行）</li>
      <li>「URLの内容を取得」を追加し、下のURLを貼る。<b>方法</b>は POST、<b>ヘッダ</b>に「Authorization」＝下の鍵、<b>本文を要求</b>は JSON で、キー「text」の値に「結合されたテキスト」</li>
    </ol>
    <div class="group relay-copy"><button type="button" class="row press" id="copyUrl"><div class="row-main"><div class="row-title">URL</div><div class="row-sub relay-code">${esc(url)}</div></div><span class="pill-btn">コピー</span></button><button type="button" class="row press" id="copyAuth"><div class="row-main"><div class="row-title">Authorization（鍵）</div><div class="row-sub relay-code">Bearer ${esc(key.slice(0,6))}…${esc(key.slice(-4))}</div></div><span class="pill-btn">コピー</span></button></div>
    <p class="settings-section-footer">鍵はこの端末で作った合言葉です。人に見せないでください。鍵を変えると、ショートカットの鍵も入れ直す必要があります。</p>
    <h2 class="reg-head">2. 毎日自動で動かす</h2>
    <ol class="shift-steps" start="7"><li>ショートカットの「オートメーション」→＋→「時刻」→ 毎日 5:00（好きな時刻）</li><li>「すぐに実行」を選び、「シフトを送る」を選ぶ</li><li>一度「シフトを送る」を手で実行し、下の「受け取りを確認」を押す</li></ol>
    <p class="settings-section-footer">受け取ったシフトはこのアプリに残るので、働き終わった日の分も給料の計算に入ります。今月すでに働いた分は、最初に一度だけ「その他の取り込み方法」から貼り付けて入れてください。</p>
    <div class="group"><button type="button" class="row press reg-add" id="relayTest"><span class="reg-add-icon" aria-hidden="true">${icon('check')}</span><div class="row-main"><div class="row-title">受け取りを確認</div></div></button><button type="button" class="row press" id="relayRekey"><div class="row-main"><div class="row-title">鍵を作り直す</div><div class="row-sub">鍵が人に知られた時だけ</div></div><span class="chev">${icon('chevronRight')}</span></button></div>
    <p class="settings-section-footer">受け取ったシフトは、時給×働いた時間（休憩ルールで休憩を引く・深夜は25%増し）＋交通費（往復・月の上限あり）で計算し、勤務先・勤務月ごとの給与（予定）にします。シフトは受け渡しサーバーに最後の1回分だけ保管し、30日で消えます。</p>`,root=>{
      root.querySelector('#copyUrl').onclick=()=>copyShiftText(url,'URL');
      root.querySelector('#copyAuth').onclick=()=>copyShiftText(auth,'鍵');
      root.querySelector('#relayTest').onclick=async()=>{setShiftRelay({enabled:true});const out=await syncShiftRelay({silent:false,force:true});if(out&&out.count){feedback?.success?.();showAlert('受け取れました',`シフト${out.count}件から給料を計算しました（${yen(out.total)}）。これから毎日自動で更新します。`)}try{refreshSalarySettings()}catch(_){}};
      root.querySelector('#relayRekey').onclick=async()=>{if(!await showAlert('鍵を作り直しますか？','ショートカットの「Authorization」も新しい鍵に入れ直す必要があります。',{okText:'作り直す'}))return;setShiftRelay({key:shiftRelayNewKey(),lastUpdatedAt:0});openShiftRelayGuide()};
    });
}

/* 給与の編集画面: この給与がどこから来たか（シフトから自動・手入力） */
function salaryRecordSourceNoteHtml(r){
  if(r.status==='入金済')return '';
  if(salaryManualLockUntil(r)>Date.now())return `<p class="sal-src-note manual">${icon('pencil')}<span>手入力の金額です。あと${salaryLockDaysLeft(r)}日は、シフトの自動計算で上書きしません。</span></p>`;
  if(r.source==='shift')return `<p class="sal-src-note">${icon('calendar')}<span>シフト${Number(r.shiftCount)||0}回${r.shiftMinutes?`・${shiftHoursLabel(r.shiftMinutes)}`:''}から自動で計算しました。金額を直すと、7日間は手入力が優先されます。</span></p>`;
  return '';
}
