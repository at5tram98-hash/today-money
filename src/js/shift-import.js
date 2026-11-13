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
function parseShiftText(text){
  const raw=String(text||'').trim();if(!raw)return[];
  try{const j=JSON.parse(raw);if(Array.isArray(j))return j.map(x=>({date:String(x.date||'').slice(0,10),start:String(x.start||'').slice(0,5),end:String(x.end||'').slice(0,5),title:String(x.title||'').trim()})).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date)&&/^\d{1,2}:\d{2}$/.test(x.start)&&/^\d{1,2}:\d{2}$/.test(x.end))}catch(e){}
  const out=[];
  for(let line of raw.normalize('NFKC').split(/\r?\n|;/)){
    line=line.trim();if(!line)continue;
    let m,date='';
    if((m=line.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?/))){date=shiftNormDate(m[1],m[2],m[3]);line=line.replace(m[0],' ')}
    else if((m=line.match(/(\d{1,2})[/月](\d{1,2})日?/))){date=shiftNormDate(0,m[1],m[2]);line=line.replace(m[0],' ')}
    const t=line.match(/(\d{1,2}):(\d{2})\s*(?:[-〜~ー–—]|から|to)\s*(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*)?(\d{1,2}):(\d{2})/);
    if(!date||!t)continue;
    const start=`${shiftPad(t[1])}:${t[2]}`,end=`${shiftPad(t[6])}:${t[7]}`;
    const title=line.replace(t[0],' ').replace(/[|｜,、]/g,' ').replace(/\s+/g,' ').trim();
    out.push({date,start,end,title});
  }
  const seen=new Set();return out.filter(x=>{const k=`${x.date}|${x.start}|${x.end}|${x.title}`;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
}
function shiftMinutes(s){const [h,m]=s.split(':').map(Number);return h*60+m}
/* 勤務時間（分）と深夜（22〜翌5時）の分。終了が開始より前なら日をまたぐ */
function shiftDuration(start,end,autoBreak=true){
  let a=shiftMinutes(start),b=shiftMinutes(end);if(b<=a)b+=1440;const total=b-a;
  let night=0;for(let t=a;t<b;t++){const h=Math.floor((t%1440)/60);if(h>=22||h<5)night++}
  const brk=autoBreak?(total>480?60:total>360?45:0):0;
  /* 休憩は深夜でない時間から先に引く */
  const day=Math.max(0,total-night-brk),nightPaid=Math.max(0,night-Math.max(0,brk-(total-night)));
  return{total,brk,work:day+nightPaid,night:nightPaid};
}
function shiftEmployerFor(title,s=shiftSettings()){
  if(s.titleMap[title]&&employerById(s.titleMap[title]))return s.titleMap[title];
  const t=normalizeMerchantKey(title);const hit=data.employers.find(e=>{const n=normalizeMerchantKey(e.name);return n&&t&&(t.includes(n)||n.includes(t))});
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
    const d=shiftDuration(x.start,x.end,s.autoBreak),hourly=Math.max(0,Number(e.hourly)||0),pay=Math.round(hourly*d.work/60+hourly*(Number(s.nightRate)||0)/100*d.night/60);
    const month=shiftWorkMonth(e,x.date),k=`${empId}|${month}`;
    if(!groups.has(k))groups.set(k,{employerId:empId,employer:e,month,shifts:[],minutes:0,night:0,gross:0,transport:0});
    const g=groups.get(k);g.shifts.push({...x,employerId:empId,...d,pay});g.minutes+=d.work;g.night+=d.night;g.gross+=pay;
  }
  for(const g of groups.values()){const t=Math.max(0,Number(g.employer.transport)||0);g.transport=g.employer.transportUnit==='per_shift'?t*g.shifts.length:t;g.payDate=employerPayDate(g.employer,g.month)}
  return [...groups.values()].sort((a,b)=>a.month.localeCompare(b.month)||a.employer.name.localeCompare(b.employer.name));
}
function shiftHoursLabel(min){const h=Math.floor(min/60),m=min%60;return m?`${h}時間${m}分`:`${h}時間`}
/* 保存: シフトの記録と、給与（予定）の作成・更新 */
function saveShiftImport(groups,s){
  const results=[];
  safeCommit(()=>{
    data.shiftSettings={...shiftSettings(),...s};
    if(!Array.isArray(data.shiftPlans))data.shiftPlans=[];
    for(const g of groups){
      const dates=new Set(g.shifts.map(x=>x.date));
      data.shiftPlans=data.shiftPlans.filter(p=>!(p.employerId===g.employerId&&dates.has(p.date)));
      for(const x of g.shifts)data.shiftPlans.push({id:uid('shift'),employerId:g.employerId,date:x.date,start:x.start,end:x.end,title:x.title,workMinutes:x.work,nightMinutes:x.night,pay:x.pay,source:'calendar',importedAt:new Date().toISOString()});
      const rec=data.salaryRecords.find(r=>r.employerId===g.employerId&&r.month===g.month);
      if(rec&&rec.status&&rec.status!=='予定'){results.push({g,state:'kept'});continue}
      if(rec){Object.assign(rec,{gross:g.gross,transport:g.transport,date:g.payDate,source:'shift',shiftCount:g.shifts.length,updatedAt:new Date().toISOString()});results.push({g,state:'updated'})}
      else{data.salaryRecords.push({id:uid('salary'),employerId:g.employerId,month:g.month,date:g.payDate,gross:g.gross,transport:g.transport,status:'予定',source:'shift',shiftCount:g.shifts.length,createdAt:new Date().toISOString()});results.push({g,state:'created'})}
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
    <h2 class="shift-head">計算のしかた</h2><div class="group"><div class="row"><div class="row-main"><div class="row-title">休憩を自動で引く</div><div class="row-sub">6時間超は45分・8時間超は60分</div></div><button type="button" class="switch${s.autoBreak?' on':''}" id="shiftAutoBreak" role="switch" aria-checked="${s.autoBreak}" aria-label="休憩を自動で引く"></button></div><div class="row"><div class="row-main"><div class="row-title">深夜割増（22時〜5時）</div><div class="row-sub">時給の${s.nightRate}%を上乗せ</div></div><button type="button" class="switch${s.nightRate>0?' on':''}" id="shiftNight" role="switch" aria-checked="${s.nightRate>0}" aria-label="深夜割増"></button></div></div>
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
  settingsDetailView('シフトから給料を見込む',`
    <div class="shift-hero small"><span class="shift-hero-icon" aria-hidden="true">${icon('calendar')}</span><div class="shift-hero-kicker">シフトボード → カレンダー → このアプリ</div><div class="shift-hero-sub">シフトボードがiPhoneのカレンダーに書き出したシフトから、時給・深夜割増・交通費で来月の給料を計算します。</div></div>
    <div class="group"><button type="button" class="row press" id="shiftFromClipboard"><span class="reg-icon" style="--c:var(--accent)" aria-hidden="true">${icon('download')}</span><div class="row-main"><div class="row-title">クリップボードから取り込む</div><div class="row-sub">ショートカットを実行してから押す</div></div><span class="chev">${icon('chevronRight')}</span></button></div>
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
    });
}
/* URLに ?shifts=… が付いていたら、読み込み後に取り込みの確認を開く（URLからは消す） */
function maybeOpenShiftImportFromUrl(){
  try{
    const u=new URL(location.href),t=u.searchParams.get('shifts');if(!t)return;
    u.searchParams.delete('shifts');history.replaceState(null,'',u.pathname+(u.search?u.search:'')+u.hash);
    setTimeout(()=>openShiftImport(t),400);
  }catch(e){}
}
