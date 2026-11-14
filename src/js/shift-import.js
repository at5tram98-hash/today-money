/* シフトボード連携（カレンダー経由）: シフトから来月の給料見込みを作る
   シフトボードはiPhoneのカレンダーにシフトを書き出せる。iOSのショートカットで「来月のシフトの予定」を
   テキストにしてクリップボードへコピー（またはこのアプリのURLに付けて開く）→ このアプリで取り込む。
   1行 = 1シフト: 「2026-12-01 10:00-18:00 GU」（日付は 2026/12/1・12月1日 でも可、時刻の区切りは - 〜 ~ でも可）
   計算: 時給×勤務時間（休憩を自動で引く・22〜5時は25%増し）＋交通費（1回ごと／月額）
   保存: シフトを data.shiftPlans に残し、勤務先・勤務月ごとの給与を「予定」として作る／更新する（入金済みの給与は変えない） */

const SHIFT_DEFAULTS={autoBreak:true,nightRate:25,titleMap:{}};
function shiftSettings(){return{...SHIFT_DEFAULTS,...(data.shiftSettings||{}),titleMap:{...(data.shiftSettings?.titleMap||{})}}}
function shiftPad(n){return String(n).padStart(2,'0')}
function shiftNormDate(y,m,d){y=Number(y);m=Number(m);d=Number(d);if(!m||!d||m>12||d>31)return'';if(!y){const now=parseYmd(ymd());y=now.getFullYear();if(m<now.getMonth()+1-6)y++}return`${y}-${shiftPad(m)}-${shiftPad(d)}`}
/* 「午後6:00」「6:00 PM」を 18:00 にそろえる（iPhoneが12時間表示の時） */
function shiftNormAmPm(line){
  const to24=(ap,h,m)=>{h=Number(h)%12;if(/午後|pm/i.test(ap))h+=12;return `${String(h).padStart(2,'0')}:${m}`};
  return line.replace(/(午前|午後|AM|PM|am|pm)\s*(\d{1,2}):(\d{2})/g,(_,ap,h,m)=>to24(ap,h,m)).replace(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)\b/g,(_,h,m,ap)=>to24(ap,h,m));
}
function parseShiftText(text){
  const raw=String(text||'').trim();if(!raw)return[];
  try{const j=JSON.parse(raw);if(Array.isArray(j))return j.map(x=>({date:String(x.date||'').slice(0,10),start:String(x.start||'').slice(0,5),end:String(x.end||'').slice(0,5),title:String(x.title||'').trim()})).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&/^\d{1,2}:\d{2}$/.test(x.start)&&/^\d{1,2}:\d{2}$/.test(x.end))}catch(e){}
  const out=[];
  for(let line of raw.normalize('NFKC').split(/\r?\n|;/)){
    line=line.trim();if(!line)continue;
    line=shiftNormAmPm(line);
    let m,date='';
    if((m=line.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/))){date=shiftNormDate(m[1],m[2],m[3]);line=line.replace(m[0],' ')}
    else if((m=line.match(/(\d{1,2})[/月](\d{1,2})日?/))){date=shiftNormDate(0,m[1],m[2]);line=line.replace(m[0],' ')}
    const t=line.match(/(\d{1,2}):(\d{2})\s*(?:[-〜~ー–—]|から|to)\s*(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*)?(\d{1,2}):(\d{2})/);
    if(!date||!t)continue;
    const start=`${shiftPad(t[1])}:${t[2]}`,end=`${shiftPad(t[6])}:${t[7]}`;
    /* 終日の予定（休み・希望休など 00:00-00:00）や長さ0の予定は勤務にしない */
    if(start===end)continue;
    const title=line.replace(t[0],' ').replace(/[|｜,、]/g,' ').replace(/\s+/g,' ').trim();
    out.push({date,start,end,title});
  }
  const seen=new Set();return out.filter(x=>{const k=`${x.date}|${x.start}|${x.end}|${x.title}`;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
}
function shiftMinutes(s){const [h,m]=s.split(':').map(Number);return h*60+m}
/* 勤務時間（分）と深夜（22〜翌5時）の分。終了が開始より前なら日をまたぐ */
/* 休憩: 勤務先に休憩ルール（例: 4時間以上7時間未満は30分、7時間以上は60分）があればそれを使う */
function shiftBreakMinutes(total,autoBreak=true,rules=null){
  if(Array.isArray(rules)&&rules.length){let best=0;for(const r of rules){const from=Math.max(0,Number(r.from)||0),to=r.to==null||r.to===''?Infinity:Number(r.to);if(total>=from&&total<to)best=Math.max(best,Math.max(0,Number(r.minutes)||0))}return Math.min(best,total)}
  return autoBreak?(total>480?60:total>360?45:0):0;
}
function shiftDuration(start,end,autoBreak=true,rules=null){
  let a=shiftMinutes(start),b=shiftMinutes(end);if(b<=a)b+=1440;const total=b-a;
  let night=0;for(let t=a;t<b;t++){const h=Math.floor((t%1440)/60);if(h>=22||h<5)night++}
  const brk=shiftBreakMinutes(total,autoBreak,rules);
  /* 休憩は深夜でない時間から先に引く */
  const day=Math.max(0,total-night-brk),nightPaid=Math.max(0,night-Math.max(0,brk-(total-night)));
  return{total,brk,work:day+nightPaid,night:nightPaid};
}
function shiftEmployerFor(title,s=shiftSettings()){
  if(s.titleMap[title]&&employerById(s.titleMap[title]))return s.titleMap[title];
  const t=normalizeMerchantKey(title);const hit=data.employers.find(e=>[e.name,...(Array.isArray(e.aliases)?e.aliases:[])].some(x=>{const n=normalizeMerchantKey(x);return n&&t&&(t.includes(n)||n.includes(t))}));
  return hit?.id||data.employers[0]?.id||'';
}
function shiftWorkMonth(e,date){
  if(!e||e.closingType!=='day')return date.slice(0,7);
  const c=clamp(Number(e.closingDay)||15,1,31);return Number(date.slice(8,10))>c?addMonths(date.slice(0,7),1):date.slice(0,7);
}
/* 勤務先・勤務月ごとの見込み */
function shiftEstimate(shifts,s=shiftSettings()){
  const groups=new Map();
  for(const x of shifts){
    const empId=x.employerId||shiftEmployerFor(x.title,s),e=employerById(empId);if(!e)continue;
    const d=shiftDuration(x.start,x.end,s.autoBreak,e.breakRules),hourly=Math.max(0,Number(e.hourly)||0),pay=Math.round(hourly*d.work/60+hourly*(Number(s.nightRate)||0)/100*d.night/60);
    const month=shiftWorkMonth(e,x.date),k=`${empId}|${month}`;
    if(!groups.has(k))groups.set(k,{employerId:empId,employer:e,month,shifts:[],minutes:0,night:0,gross:0,transport:0});
    const g=groups.get(k);g.shifts.push({...x,employerId:empId,...d,pay});g.minutes+=d.work;g.night+=d.night;g.gross+=pay;
  }
  for(const g of groups.values()){const t=Math.max(0,Number(g.employer.transport)||0),cap=Math.max(0,Number(g.employer.transportCap)||0);g.days=new Set(g.shifts.map(x=>x.date)).size;g.transport=g.employer.transportUnit==='per_shift'?t*g.days:t;if(cap>0&&g.transport>cap){g.transportUncapped=g.transport;g.transport=cap}g.payDate=employerPayDate(g.employer,g.month)}
  return [...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)||a.employer.name.localeCompare(b.employer.name));
}
function shiftHoursLabel(min){const h=Math.floor(min/60),m=min%60;return m?`${h}時間${m}分`:`${h}時間`}
/* 保存: シフトの記録と、給与（予定）の作成・更新 */
const SALARY_MANUAL_LOCK_MS=7*864e5;
function salaryManualLockUntil(r){const t=Date.parse(r?.manualAt||'');return Number.isFinite(t)?t+SALARY_MANUAL_LOCK_MS:0}
function saveShiftImport(groups,s,{auto=false,replaceFrom='',extra=null}={}){
  const results=[];
  safeCommit(()=>{
    data.shiftSettings={...shiftSettings(),...s};
    if(!Array.isArray(data.shiftPlans))data.shiftPlans=[];
    /* カレンダーから送られた期間は、その期間のシフトを入れ替える（消えたシフトを残さない） */
    if(replaceFrom)data.shiftPlans=data.shiftPlans.filter(p=>!(p.source==='calendar'&&p.date>=replaceFrom));
    extra?.();
    for(const g of groups){
      const dates=new Set(g.shifts.map(x=>x.date));
      data.shiftPlans=data.shiftPlans.filter(p=>!(p.employerId===g.employerId&&dates.has(p.date)));
      for(const x of g.shifts)data.shiftPlans.push({id:uid('shift'),employerId:g.employerId,date:x.date,start:x.start,end:x.end,title:x.title,workMinutes:x.work,nightMinutes:x.night,pay:x.pay,source:'calendar',importedAt:new Date().toISOString()});
      const rec=data.salaryRecords.find(r=>r.employerId===g.employerId&&r.month===g.month);
      if(rec&&rec.status&&rec.status!=='予定'){results.push({g,state:'kept'});continue}
      /* 手入力した給与は、自動取得では7日間上書きしない */
      if(rec&&auto&&salaryManualLockUntil(rec)>Date.now()){results.push({g,state:'manual'});continue}
      if(rec){Object.assign(rec,{gross:g.gross+g.transport,transport:g.transport,date:g.payDate,source:'shift',shiftCount:g.shifts.length,shiftMinutes:g.minutes,updatedAt:new Date().toISOString()});delete rec.manualAt;results.push({g,state:'updated'})}
      else{data.salaryRecords.push({id:uid('salary'),employerId:g.employerId,month:g.month,date:g.payDate,gross:g.gross+g.transport,transport:g.transport,status:'予定',source:'shift',shiftCount:g.shifts.length,shiftMinutes:g.minutes,createdAt:new Date().toISOString()});results.push({g,state:'created'})}
    }
  },{render:true,label:'shift import'});
  return results;
}
/* 取り込みの確認シート */
function openShiftImport(text){
  const shifts=parseShiftText(text);
  if(!shifts.length)return showAlert('シフトが見つかりません','「2026-12-01 10:00-18:00 GU」のように、1行に日付・時刻・勤務先を書いてください。ショートカットの作り方は「その他→勤務先→シフトから給料を見込む」にあります。');
  if(!data.employers.length)return showAlert('勤務先がありません','先に「その他→勤務先」で勤務先（時給・交通費）を登録してください。');
  const s=shiftSettings(),titles=[...new Set(shifts.map(x=>x.title||'（名前なし）'))];
  for(const t of titles)if(!s.titleMap[t])s.titleMap[t]=shiftEmployerFor(t===('（名前なし）')?'':t,s);
  const html=()=>{
    const list=shifts.map(x=>({...x,employerId:s.titleMap[x.title||'（名前なし）']})),groups=shiftEstimate(list,s),total=groups.reduce((a,g)=>a+g.gross+g.transport,0),noWage=groups.filter(g=>!(Number(g.employer.hourly)>0));
    return `<div class="shift-hero"><span class="shift-hero-icon" aria-hidden="true">${icon('briefcase')}</span><div class="shift-hero-kicker">${shifts.length}件のシフトから</div><div class="shift-hero-value">${yen(total)}</div><div class="shift-hero-sub">${groups.map(g=>`${esc(g.employer.name)}・${monthLabel(g.month)}勤務分（${Number(g.payDate.slice(5,7))}/${Number(g.payDate.slice(8,10))}入金予定）`).join('<br>')}</div></div>
    ${noWage.length?`<div class="shift-warn" role="alert">${icon('warning')}<span>${noWage.map(g=>esc(g.employer.name)).join('・')}の時給が未設定です。「その他→勤務先」で時給を入れると金額が出ます。</span></div>`:''}
    <h2 class="shift-head">勤務先の割り当て</h2><div class="group">${titles.map(t=>`<div class="row shift-map"><div class="row-main"><div class="row-title">${esc(t)}</div><div class="row-sub">${shifts.filter(x=>(x.title||'（名前なし）')===t).length}件</div></div><div class="shift-emp-chips">${data.employers.map(e=>`<button type="button" class="shift-chip${s.titleMap[t]===e.id?' on':''}" data-shift-title="${esc(t)}" data-shift-emp="${esc(e.id)}" aria-pressed="${s.titleMap[t]===e.id}">${esc(e.name)}</button>`).join('')}</div></div>`).join('')}</div>
    <h2 class="shift-head">計算のしかた</h2><div class="group"><div class="row"><div class="row-main"><div class="row-title">休憩を自動で引く</div><div class="row-sub">勤務先の休憩ルールで引きます（ルールがない勤務先は6時間超45分・8時間超60分）</div></div><button type="button" class="switch${s.autoBreak?' on':''}" id="shiftAutoBreak" role="switch" aria-checked="${s.autoBreak}" aria-label="休憩を自動で引く"></button></div><div class="row"><div class="row-main"><div class="row-title">深夜割増（22時〜5時）</div><div class="row-sub">時給の${s.nightRate}%を上乗せ</div></div><button type="button" class="switch${s.nightRate>0?' on':''}" id="shiftNight" role="switch" aria-checked="${s.nightRate>0}" aria-label="深夜割増"></button></div></div>
    ${groups.map(g=>`<h2 class="shift-head">${esc(g.employer.name)}・${monthLabel(g.month)}勤務分</h2><div class="group"><div class="row"><div class="row-main"><div class="row-title">${g.shifts.length}回・${shiftHoursLabel(g.minutes)}${g.night?`（深夜 ${shiftHoursLabel(g.night)}）`:''}</div><div class="row-sub">時給 ${yen(Number(g.employer.hourly)||0)}・交通費 ${yen(g.transport)}</div></div><div class="row-value">${yen(g.gross+g.transport)}</div></div>${g.shifts.map(x=>`<div class="row shift-row"><div class="row-main"><div class="row-title">${esc(dayLabel(x.date))} ${x.start}〜${x.end}</div><div class="row-sub">${shiftHoursLabel(x.work)}${x.brk?`・休憩${x.brk}分`:''}${x.night?`・深夜${shiftHoursLabel(x.night)}`:''}</div></div><div class="row-value">${yen(x.pay)}</div></div>`).join('')}</div>`).join('')}
    <p class="settings-section-footer">保存すると、勤務先・勤務月ごとの給与を「予定」として作ります（同じ月の予定は更新、入金済みの給与は変えません）。</p>`;
  };
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="shiftCancel">キャンセル</button><div class="sheet-title">シフトの取り込み</div><button type="button" class="nav-text bold" id="shiftSave">保存</button></div><div class="sheet-body shift-import" id="shiftBody">${html()}</div>`,'full',root=>{
    root.closest('#sheet')?.classList.add('glass-sheet');markSheetDirty(true);
    const body=root.querySelector('#shiftBody');
    const bind=()=>{
      body.querySelectorAll('[data-shift-emp]').forEach(b=>b.onclick=()=>{s.titleMap[b.dataset.shiftTitle]=b.dataset.shiftEmp;feedback?.selection?.();redraw()});
      body.querySelector('#shiftAutoBreak').onclick=()=>{s.autoBreak=!s.autoBreak;redraw()};
      body.querySelector('#shiftNight').onclick=()=>{s.nightRate=s.nightRate>0?0:25;redraw()};
    };
    const redraw=()=>{const y=body.scrollTop;body.innerHTML=html();body.scrollTop=y;bind()};
    bind();
    root.querySelector('#shiftCancel').onclick=requestSheetClose;
    let saving=false;
    root.querySelector('#shiftSave').onclick=()=>{
      if(saving)return;saving=true;
      const list=shifts.map(x=>({...x,employerId:s.titleMap[x.title||'（名前なし）']})),groups=shiftEstimate(list,s);
      let results;try{results=saveShiftImport(groups,{autoBreak:s.autoBreak,nightRate:s.nightRate,titleMap:s.titleMap})}catch(e){saving=false;return}
      markSheetDirty(false);closeSheet();feedback?.success?.();
      const kept=results.filter(r=>r.state==='kept');
      showToast(`給与の見込みを${results.length-kept.length}件保存しました${kept.length?`（入金済み${kept.length}件はそのまま）`:''}`);
      try{refreshSalaryOpenView()}catch(e){}
    };
  });
}
/* 取り込みの入口（その他→勤務先）: ショートカットの作り方・クリップボード・貼り付け */
const SHIFT_APP_URL='https://at5tram98-hash.github.io/today-money/';
function openShiftGuide(){
  const last=(data.shiftPlans||[]).slice(-1)[0];
  const draw=()=>settingsDetailView('シフトから給料を見込む',`
    <div class="shift-hero small"><span class="shift-hero-icon" aria-hidden="true">${icon('calendar')}</span><div class="shift-hero-kicker">シフトボード → カレンダー → このアプリ</div><div class="shift-hero-sub">シフトボードがカレンダーに書き出したシフトから、時給・深夜割増・交通費で来月の給料を計算します。</div></div>
    ${shiftCalendarSectionHtml()}
    <h2 class="reg-head">手動で取り込む</h2><div class="group"><button type="button" class="row press" id="shiftFromClipboard"><span class="reg-icon" style="--c:var(--accent)" aria-hidden="true">${icon('download')}</span><div class="row-main"><div class="row-title">クリップボードから取り込む</div><div class="row-sub">ショートカットを実行してから押す</div></div><span class="chev">${icon('chevronRight')}</span></button></div>
    <h2 class="reg-head">貼り付けて取り込む</h2><div class="group shift-paste"><textarea class="field" id="shiftPaste" rows="4" placeholder="2026-12-01 10:00-18:00 GU&#10;2026-12-03 17:00-22:30 GU" aria-label="シフトを貼り付け"></textarea><button type="button" class="row press reg-add" id="shiftPasteImport"><span class="reg-add-icon" aria-hidden="true">${icon('check')}</span><div class="row-main"><div class="row-title">この内容で取り込む</div></div></button></div>
    <h2 class="reg-head">ショートカットの作り方（1回だけ）</h2>
    <ol class="shift-steps">
      <li>「ショートカット」アプリで＋を押し、新しいショートカットを作る</li>
      <li>「カレンダーの予定を検索」を追加し、<b>カレンダー</b>を「シフトボード」、<b>開始日</b>を「来月」に（並び順は開始日）</li>
      <li>「各項目を繰り返す」を追加し、中に「テキスト」を置いて<br><code>［開始日］ ［開始日の時刻］-［終了日の時刻］ ［タイトル］</code><br>とする（開始日は「yyyy-MM-dd」、時刻は「HH:mm」の形式）</li>
      <li>繰り返しのあとに「テキストを結合」（区切りは改行）</li>
      <li>「クリップボードにコピー」を追加する</li>
      <li>このアプリを開き、ここの「クリップボードから取り込む」を押す</li>
    </ol>
    <p class="settings-section-footer">Safariで使っている場合は、最後を「URLを開く」にして <code>${SHIFT_APP_URL}?shifts=［結合したテキスト（URLエンコード）］</code> を開いても取り込めます。ホーム画面に追加したアプリはSafariと記録が別なので、クリップボードを使ってください。</p>
    ${last?`<p class="settings-section-footer">前回の取り込み: ${esc(dayLabel(last.importedAt.slice(0,10)))}・保存したシフト ${(data.shiftPlans||[]).length}件</p>`:''}`,root=>{
      root.querySelector('#shiftFromClipboard').onclick=async()=>{let text='';try{text=await navigator.clipboard.readText()}catch(e){return showAlert('クリップボードを読めませんでした','「貼り付けて取り込む」の欄に貼り付けてください。')}openShiftImport(text)};
      root.querySelector('#shiftPasteImport').onclick=()=>openShiftImport(root.querySelector('#shiftPaste').value);
      bindShiftCalendarSection(root,draw);
    });
  draw();
}
/* URLに ?shifts=… が付いていたら、読み込み後に取り込みの確認を開く（URLからは消す） */
function maybeOpenShiftImportFromUrl(){
  try{
    const u=new URL(location.href),t=u.searchParams.get('shifts');if(!t)return;
    u.searchParams.delete('shifts');history.replaceState(null,'',u.pathname+(u.search?u.search:'')+u.hash);
    setTimeout(()=>openShiftImport(t),400);
  }catch(e){}
}

/* ---------- Googleカレンダーから自動で取り込む（1日1回） ----------
   シフトボードのシフトがGoogleカレンダーにあれば、アプリを開いた時に1日1回だけ自動で読み取り、
   給与の見込み（予定）を更新する。読み取りだけの許可（calendar.readonly）を使い、カレンダーは変更しない。
   Googleの許可は1時間ほどで切れるため、切れていたら「Googleで更新」を1回押してもらう。 */
const CAL_SCOPE='https://www.googleapis.com/auth/calendar.readonly',CAL_TOKEN_KEY='mm3CalToken',CAL_EXP_KEY='mm3CalTokenExp';
let calAccessToken='',calTokenExpiresAt=0,calSyncing=false,calPromptedDay='';
try{calAccessToken=sessionStorage.getItem(CAL_TOKEN_KEY)||'';calTokenExpiresAt=Number(sessionStorage.getItem(CAL_EXP_KEY))||0}catch(e){}
function shiftCal(){return{enabled:false,calendarId:'',calendarName:'',keyword:'',lastSyncAt:'',lastDay:'',lastCount:0,lastTotal:0,lastError:'',...(data.shiftSettings?.calendar||{})}}
function setShiftCal(patch,label='shift calendar'){try{safeCommit(()=>{data.shiftSettings={...shiftSettings(),calendar:{...shiftCal(),...patch}}},{render:false,label,invalidateAcf:false})}catch(e){}}
function calTokenValid(){return !!calAccessToken&&Date.now()<calTokenExpiresAt-60000}
function calRequestToken(consent=false){return new Promise((resolve,reject)=>{const id=String(data.gmailSettings?.clientId||'').trim();if(!id)return reject(new Error('先に「その他→Gmail連携」でGoogleのクライアントIDを設定してください。'));if(!window.google?.accounts?.oauth2)return reject(new Error('Google認証ライブラリを読み込めませんでした。通信状態を確認してください。'));const tc=google.accounts.oauth2.initTokenClient({client_id:id,scope:CAL_SCOPE,include_granted_scopes:true,callback:r=>{if(r?.error)return reject(new Error(r.error_description||r.error));calAccessToken=r.access_token||'';calTokenExpiresAt=Date.now()+(Number(r.expires_in)||3600)*1000;try{sessionStorage.setItem(CAL_TOKEN_KEY,calAccessToken);sessionStorage.setItem(CAL_EXP_KEY,String(calTokenExpiresAt))}catch(e){}resolve(r)}});tc.requestAccessToken({prompt:consent?'consent':''})})}
async function calFetch(url){
  let last=null;
  for(let n=0;n<3;n++){
    if(n)await new Promise(r=>setTimeout(r,1000*2**(n-1)));
    const ctl=typeof AbortController==='function'?new AbortController():null,timer=ctl?setTimeout(()=>ctl.abort(),20000):0;let r;
    try{r=await fetch(url,{headers:{Authorization:`Bearer ${calAccessToken}`},signal:ctl?.signal})}catch(e){clearTimeout(timer);last=new Error('通信できませんでした');continue}
    clearTimeout(timer);
    if(r.status===401){calAccessToken='';calTokenExpiresAt=0;try{sessionStorage.removeItem(CAL_TOKEN_KEY)}catch(e){}throw new Error('Googleの許可が切れました。「Googleで更新」を押してください。')}
    if(r.status===403){let m='';try{m=(await r.json())?.error?.message||''}catch(e){}throw new Error(/disabled|has not been used/i.test(m)?'Google Calendar APIが有効になっていません。Google Cloudで有効にしてください。':(m||'カレンダーを読む許可がありません'))}
    if(r.status===429||r.status>=500){last=new Error(`Googleが一時的に応答していません (${r.status})`);continue}
    if(!r.ok){let m='';try{m=(await r.json())?.error?.message||''}catch(e){}throw new Error(m||`Google Calendar APIエラー (${r.status})`)}
    return r.json();
  }
  throw last||new Error('カレンダーを読めませんでした');
}
async function listGoogleCalendars(){const j=await calFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&maxResults=100');return(j.items||[]).map(c=>({id:c.id,name:c.summaryOverride||c.summary||c.id,primary:!!c.primary}))}
/* 今日から来月末までの予定 → シフトの行（終日の予定は除く） */
async function fetchCalendarShifts(cal){
  const now=parseYmd(ymd()),start=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=new Date(now.getFullYear(),now.getMonth()+2,1);
  const u=new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.calendarId)}/events`);
  u.searchParams.set('timeMin',start.toISOString());u.searchParams.set('timeMax',end.toISOString());u.searchParams.set('singleEvents','true');u.searchParams.set('orderBy','startTime');u.searchParams.set('maxResults','250');
  const j=await calFetch(u.toString()),kw=String(cal.keyword||'').trim();
  const hm=d=>`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  return(j.items||[]).filter(e=>e.status!=='cancelled'&&e.start?.dateTime&&e.end?.dateTime&&(!kw||String(e.summary||'').includes(kw))).map(e=>{const a=new Date(e.start.dateTime),b=new Date(e.end.dateTime);return{date:ymd(a),start:hm(a),end:hm(b),title:String(e.summary||'').trim()}});
}
async function syncShiftCalendar({silent=false}={}){
  const cal=shiftCal();if(calSyncing||!cal.calendarId)return null;
  if(!calTokenValid()){if(silent)return null;await calRequestToken(false)}
  calSyncing=true;
  try{
    const shifts=await fetchCalendarShifts(cal),s=shiftSettings();
    if(!shifts.length){setShiftCal({lastSyncAt:new Date().toISOString(),lastDay:ymd(),lastCount:0,lastTotal:0,lastError:''});if(!silent)showToast('来月までのシフトは見つかりませんでした');return{count:0,total:0}}
    const groups=shiftEstimate(shifts.map(x=>({...x,employerId:shiftEmployerFor(x.title,s)})),s),results=saveShiftImport(groups,{},{auto:true}),total=groups.reduce((a,g)=>a+g.gross+g.transport,0);
    setShiftCal({lastSyncAt:new Date().toISOString(),lastDay:ymd(),lastCount:shifts.length,lastTotal:total,lastError:''});
    showToast(`カレンダーのシフト${shifts.length}件から給料の見込みを更新しました（${yen(total)}）`);
    try{refreshSalaryOpenView()}catch(e){}
    return{count:shifts.length,total,results};
  }catch(e){setShiftCal({lastError:String(e?.message||e)});if(!silent)showAlert('シフトを取り込めませんでした',e.message);return null}
  finally{calSyncing=false}
}
/* アプリを開いた時・戻った時: 1日1回だけ自動で取り込む。許可が切れていれば「Googleで更新」を1回だけ案内する */
function maybeAutoSyncShifts(){
  const cal=shiftCal();if(!cal.enabled||!cal.calendarId||cal.lastDay===ymd()||calSyncing)return;
  if(calTokenValid()){syncShiftCalendar({silent:true});return}
  if(calPromptedDay===ymd())return;calPromptedDay=ymd();
  showToast('今日のシフトをまだ取り込んでいません',{actionLabel:'Googleで更新',action:()=>syncShiftCalendar({silent:false})});
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(()=>{try{maybeAutoSyncShifts()}catch(e){}},1200)});
/* 設定の部品（シフトから給料を見込む画面の上部） */
function shiftCalendarSectionHtml(){
  const cal=shiftCal(),connected=calTokenValid(),last=cal.lastSyncAt?`${homeTimeLabel?homeTimeLabel(cal.lastSyncAt):cal.lastSyncAt.slice(0,16)}・${cal.lastCount}件・${yen(cal.lastTotal)}`:'まだ取り込んでいません';
  return `<h2 class="reg-head">Googleカレンダーから自動で取り込む</h2><div class="group">
    <div class="row"><div class="row-main"><div class="row-title">自動で取り込む（1日1回）</div><div class="row-sub">アプリを開いた時に、今日から来月末までのシフトを読み取ります</div></div><button type="button" class="switch${cal.enabled?' on':''}" id="shiftCalAuto" role="switch" aria-checked="${cal.enabled}" aria-label="Googleカレンダーから自動で取り込む"></button></div>
    <button type="button" class="row press" id="shiftCalPick"><div class="row-main"><div class="row-title">カレンダー</div><div class="row-sub">${cal.calendarId?esc(cal.calendarName||cal.calendarId):'シフトボードのシフトが入っているGoogleカレンダーを選ぶ'}</div></div><span class="chev">${icon('chevronRight')}</span></button>
    <button type="button" class="row press" id="shiftCalSyncNow"><div class="row-main"><div class="row-title">${connected?'今すぐ取り込む':'Googleで更新'}</div><div class="row-sub">前回: ${esc(last)}</div></div><span class="chev">${icon('chevronRight')}</span></button>
    ${cal.lastError?`<div class="row shift-cal-error" role="alert"><div class="row-main"><div class="row-title">取り込めませんでした</div><div class="row-sub">${esc(cal.lastError)}</div></div></div>`:''}
  </div><p class="settings-section-footer">はじめに一度だけ: Gmail連携と同じGoogle Cloudのプロジェクトで「Google Calendar API」を有効にし、OAuth同意画面に「…/auth/calendar.readonly」（読み取りのみ）を追加してください。カレンダーを変更することはありません。Googleの許可は1時間ほどで切れるため、切れている日は「Googleで更新」を1回押すと取り込みます。</p>`;
}
function bindShiftCalendarSection(root,redraw){
  root.querySelector('#shiftCalAuto')?.addEventListener('click',e=>{const b=e.currentTarget,on=!shiftCal().enabled;b.classList.toggle('on',on);b.setAttribute('aria-checked',String(on));setTimeout(()=>{setShiftCal({enabled:on});if(on&&!shiftCal().calendarId)pickShiftCalendar(redraw);else redraw()},mm3MotionReduced()?0:280)});
  root.querySelector('#shiftCalPick')?.addEventListener('click',()=>pickShiftCalendar(redraw));
  root.querySelector('#shiftCalSyncNow')?.addEventListener('click',async()=>{if(!shiftCal().calendarId)return pickShiftCalendar(redraw);await syncShiftCalendar({silent:false});redraw()});
}
async function pickShiftCalendar(redraw){
  let cals;try{if(!calTokenValid())await calRequestToken(true);cals=await listGoogleCalendars()}catch(e){setShiftCal({lastError:String(e.message)});redraw?.();return showAlert('Googleカレンダーを開けませんでした',e.message)}
  if(!cals.length)return showAlert('カレンダーがありません','Googleアカウントのカレンダーが見つかりませんでした。');
  const cur=shiftCal().calendarId,guess=cals.find(c=>/シフト|shift/i.test(c.name));
  openOptionSheet('シフトのカレンダー',cals.map(c=>[c.id,`${c.name}${c.primary?'（メイン）':''}${!cur&&guess?.id===c.id?'（おすすめ）':''}`]),cur||guess?.id||'',v=>{const c=cals.find(x=>x.id===v);setShiftCal({calendarId:v,calendarName:c?.name||v,enabled:true,lastError:''});redraw?.();syncShiftCalendar({silent:false}).then(()=>redraw?.())});
}
