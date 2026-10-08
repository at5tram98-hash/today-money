


function openCategoryEdit(index,after){
  const existing=index>=0?data.categories[index]:null,icons=['fork','tram','bus','bag','cart','tshirt','ticket','game','repeat','book','bolt','house','heart','gift','phone','coffee','medical','ellipsis'];
  let selected=normalizeCategoryIcon(existing?.icon,existing?.id);
  openSheet(`<div class="sheet-nav"><button class="nav-text" id="ceCancel">キャンセル</button><div class="sheet-title">カテゴリ編集</div><button class="nav-text bold" id="ceSave">保存</button></div><div class="sheet-body"><div class="form-group-title">カテゴリ</div><div class="form-card"><div class="form-section"><div class="form-label">名前</div><input class="field" id="ceName" value="${esc(existing?.name||'')}"></div><div class="form-section"><div class="form-label">カラー</div><input class="field" id="ceColor" type="color" value="${esc(existing?.color||'#007AFF')}"></div></div><div class="form-group-title">アイコン</div><div class="icon-picker">${icons.map(x=>`<button class="icon-choice ${x===selected?'on':''}" data-sym="${x}">${icon(x)}</button>`).join('')}</div>${existing&&data.categories.length>1?'<button class="secondary danger" id="ceDelete" style="margin-top:16px">カテゴリを削除</button>':''}</div>`,'full',()=>{
    document.querySelectorAll('[data-sym]').forEach(b=>b.onclick=()=>{
      selected=b.dataset.sym;
      document.querySelectorAll('[data-sym]').forEach(x=>x.classList.toggle('on',x===b))
    });
    document.getElementById('ceCancel').onclick=requestSheetClose;
    document.getElementById('ceSave').onclick=()=>{
      const name=document.getElementById('ceName').value.trim();
      if(!name)return showAlert('名前を入力してください','カテゴリ名は必須です。');
      const categoryId=existing?.id||'',obj={id:categoryId||uid('cat'),name,icon:selected,color:document.getElementById('ceColor').value};
      try{
        safeCommit(()=>{
          const current=categoryId?data.categories.find(x=>x.id===categoryId):null;
          if(categoryId&&!current)throw new Error('カテゴリが見つかりません');
          const old=current?.name;
          if(current)Object.assign(current,obj);
          else data.categories.push(obj);
          if(old&&old!==name){
            data.transactions.forEach(t=>{
              if(t.category===old)t.category=name
            });
            for(const g of Object.values(data.dailyGoals)){
              if(g.categories?.[old]!=null){
                g.categories[name]=g.categories[old];
                delete g.categories[old]
              }
            }for(const g of Object.values(data.monthlyGoals)){
              if(g.categories?.[old]!=null){
                g.categories[name]=g.categories[old];
                delete g.categories[old]
              }
            }for(const f of data.fixedPayments)if(f.category===old)f.category=name;
            for(const mi of data.mailImports)if(mi.category===old)mi.category=name;
            for(const [k,v] of Object.entries(data.merchantRules))if(v===old)data.merchantRules[k]=name
          }
        },{label:'category save'})
      }catch(e){
        return
      }closeSheet();
      after?.();
      renderAll()
    };
    if(document.getElementById('ceDelete'))document.getElementById('ceDelete').onclick=async()=>{
      if(await showAlert('カテゴリを削除しますか？','このカテゴリの既存取引は「その他」に移動します。',{destructive:true,okText:'削除'})){
        try{
          safeCommit(()=>{
            const removedId=existing.id,i=data.categories.findIndex(c=>c.id===removedId);
            if(i<0)throw new Error('カテゴリが見つかりません');
            const old=data.categories[i].name;
            data.categories.splice(i,1);
            const fallback=data.categories.find(c=>c.name==='その他')?.name||data.categories[0]?.name||'その他';
            data.transactions.forEach(t=>{
              if(t.category===old)t.category=fallback
            });
            for(const g of Object.values(data.dailyGoals||{})){
              if(g.categories?.[old]!=null){
                g.categories[fallback]=(Number(g.categories[fallback])||0)+(Number(g.categories[old])||0);
                delete g.categories[old]
              }
            }for(const g of Object.values(data.monthlyGoals||{})){
              if(g.categories?.[old]!=null){
                g.categories[fallback]=(Number(g.categories[fallback])||0)+(Number(g.categories[old])||0);
                delete g.categories[old]
              }
            }for(const f of data.fixedPayments||[])if(f.category===old)f.category=fallback;
            for(const mi of data.mailImports||[])if(mi.category===old)mi.category=fallback;
            for(const [k,v] of Object.entries(data.merchantRules||{}))if(v===old)data.merchantRules[k]=fallback;
            if(data.acfSettings)data.acfSettings.creditAllowedCategoryIds=(data.acfSettings.creditAllowedCategoryIds||[]).filter(id=>String(id)!==String(removedId))
          },{label:'category delete'})
        }catch(e){
          return
        }closeSheet();
        after?.();
        renderAll()
      }
    }
  })
}
async function resetAllData({keepSeed=true}={}){
  if(mm3PendingAsyncCommit)throw new Error('保存中です。完了後にもう一度お試しください');
  const fresh=normalizeData({meta:{legacyMigrated:true,seedVersion:keepSeed?0:SEED_VERSION}});
  fresh.meta.legacyMigrated=true;fresh.meta.seedVersion=keepSeed?0:SEED_VERSION;
  if(keepSeed)applyFirstRunSeed(fresh);
  mm3PendingAsyncCommit=true;
  try{
    await saveAsync({snapshot:fresh});
    data=mm3StateGuardMode?mm3GuardData(fresh):fresh;
    if(mm3Db){try{localStorage.removeItem(APP_KEY);localStorage.removeItem(MM3_STORAGE_REV_KEY);localStorage.removeItem(MM3_STORAGE_SIG_KEY);mm3LocalMirrorAllowed=true}catch(e){console.warn('old local backup cleanup failed',e)}}
    try{await mm3ClearRecovery()}catch(e){console.error('recovery deletion failed',e);showToast('データは削除しましたが、復旧用コピーを削除できませんでした',{tone:'error'})}
    try{localStorage.removeItem(LEGACY_KEY)}catch(e){}
    const token=gmailAccessToken;
    gmailAccessToken='';gmailTokenExpiresAt=0;
    for(const key of [GMAIL_TOKEN_KEY,GMAIL_TOKEN_EXP_KEY])try{sessionStorage.removeItem(key)}catch(e){}
    if(token&&window.google?.accounts?.oauth2)try{google.accounts.oauth2.revoke(token,()=>{})}catch(e){}
    trackingDate=ymd();currentMonth=payViewMonth=assetBillingMonth=ym();monthPlanEditMode=false
  }finally{mm3PendingAsyncCommit=false}
}
async function openDataSettings(){const recoveryCount=(await mm3RecoveryList()).length;pushView('データ管理',`<div class="group"><button class="row press" id="pdfExport">${settingsIconHtml('upload','var(--red)')}<div class="row-main"><div class="row-title">PDFで書き出す</div><div class="row-sub">PDFを生成して共有</div></div><span class="chev">›</span></button><button class="row press" id="backupExport">${settingsIconHtml('upload','var(--green)')}<div class="row-main"><div class="row-title">バックアップ作成</div><div class="row-sub">JSONで全データを保存</div></div><span class="chev">›</span></button><button class="row press" id="backupImport">${settingsIconHtml('download','var(--blue)')}<div class="row-main"><div class="row-title">バックアップを復元</div><div class="row-sub">復元前の現在データは自動保護</div></div><span class="chev">›</span></button>${recoveryCount?`<button class="row press" id="recoveryExport">${settingsIconHtml('download','var(--orange)')}<div class="row-main"><div class="row-title">復旧用データを書き出す</div><div class="row-sub">端末内に ${recoveryCount}件の保護コピーがあります</div></div><span class="chev">›</span></button>`:''}</div><div class="group"><button class="row press" id="deleteAll">${settingsIconHtml('trash','var(--red)')}<div class="row-main"><div class="row-title red">全データ削除</div><div class="row-sub">取引・設定・Gmail認証・復旧コピーを削除</div></div></button></div><input type="file" id="importFile" accept="application/json,.json" class="hidden">`,root=>{root.querySelector('#pdfExport').onclick=exportPdf;root.querySelector('#backupExport').onclick=exportBackup;root.querySelector('#backupImport').onclick=()=>root.querySelector('#importFile').click();root.querySelector('#recoveryExport')?.addEventListener('click',exportLatestRecovery);root.querySelector('#importFile').onchange=importBackup;root.querySelector('#deleteAll').onclick=async()=>{if(!await showAlert('すべてのデータを削除しますか？','Gmail認証と復旧用コピーを含む端末内データを削除します。',{destructive:true,okText:'続ける'}))return;const keep=await showAlert('初期登録データを残しますか？','「初期データを残す」ではGU・無印良品・銀行・カード等を再作成します。「完全に空にする」では空の状態にします。',{okText:'初期データを残す',cancelText:'完全に空にする'});try{await resetAllData({keepSeed:keep})}catch(e){console.error(e);showAlert('削除できませんでした','保存処理に失敗したため、元のデータを保持しています。');return}while(pushStack.length){const x=pushStack.pop();document.getElementById(x.id)?.remove()}renderAll()}})}
async function exportPdf(){try{const blob=await buildPdfReport(ym()),file=new File([blob],`MyMoney2-${ym()}.pdf`,{type:'application/pdf'});if(navigator.canShare?.({files:[file]})){await navigator.share({title:`My Money 2.0 ${monthLabel(ym())} 家計レポート`,files:[file]});return}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}catch(e){console.error(e);showAlert('PDFを作成できませんでした','ブラウザの共有機能またはファイル保存を利用できませんでした。')}}
async function canvasJpegBytes(canvas){const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('JPEG変換失敗')),'image/jpeg',.9));return new Uint8Array(await blob.arrayBuffer())}
function pdfAscii(str){return new TextEncoder().encode(str)}

async function buildPdfReport(month){
  const tx=[...txForMonth(month)].sort((a,b)=>a.date.localeCompare(b.date)),income=sum(incomesForMonth(month),x=>x.amount),rawSpent=rawSpentMonth(month),spent=spentMonth(month),correction=spent-rawSpent,goal=monthlyGoal(month).total,acf=month===ym()&&data.acfSettings.initialized?buildCashFlowForecast():null,large=sum(data.largeExpensePlans.filter(p=>String(p.date||'').slice(0,7)===month&&p.status==='planned'),p=>p.amount),rowsPerPage=24,pages=Math.max(1,Math.ceil(tx.length/rowsPerPage)),images=[];
  for(let pi=0;pi<pages;pi++){
    const c=document.createElement('canvas');
    c.width=1240;
    c.height=1754;
    const x=c.getContext('2d');
    x.fillStyle='#fff';
    x.fillRect(0,0,c.width,c.height);
    x.fillStyle='#111';
    x.font='700 54px -apple-system, BlinkMacSystemFont, sans-serif';
    x.fillText('My Money 2.0',70,95);
    x.font='600 34px -apple-system, BlinkMacSystemFont, sans-serif';
    x.fillText(`${monthLabel(month)} 家計レポート`,70,150);
    x.font='500 27px -apple-system, BlinkMacSystemFont, sans-serif';
    x.fillText(`記録上 ${yen(rawSpent)}　修正差額 ${correction>=0?'+':''}${yen(correction)}　実質 ${yen(spent)}`,70,210);
    x.fillText(`収入 ${yen(income)}　目標 ${goal?yen(goal):'未設定'}　大型支出予定 ${yen(large)}`,70,245);
    if(acf)x.fillText(`ACF 月末予測 ${yen(acf.monthEndForecast)}　安全残高 ${yen(acf.reserveFloor)}`,70,280);
    x.fillStyle='#777';
    x.font='400 20px -apple-system, BlinkMacSystemFont, sans-serif';
    x.fillText(`ページ ${pi+1}/${pages}　出力 ${new Date().toLocaleString('ja-JP')}`,70,acf?315:280);
    x.strokeStyle='#ddd';
    x.beginPath();
    x.moveTo(70,acf?345:310);
    x.lineTo(1170,acf?345:310);
    x.stroke();
    x.fillStyle='#333';
    x.font='600 22px -apple-system, BlinkMacSystemFont, sans-serif';
    const hy=acf?390:355;
    x.fillText('日付',70,hy);
    x.fillText('利用先',220,hy);
    x.fillText('カテゴリ',760,hy);
    x.fillText('金額',1010,hy);
    const subset=tx.slice(pi*rowsPerPage,(pi+1)*rowsPerPage);
    x.font='400 21px -apple-system, BlinkMacSystemFont, sans-serif';
    subset.forEach((t,i)=>{
      const yy=(acf?445:410)+i*54;
      x.fillStyle=i%2?'#fafafa':'#fff';
      x.fillRect(60,yy-33,1120,48);
      x.fillStyle='#222';
      x.fillText(t.date.slice(5),70,yy);
      let merchant=String(t.merchant||'').slice(0,28);
      x.fillText(merchant,220,yy);
      x.fillText(String(t.category||'').slice(0,12),760,yy);
      x.textAlign='right';
      x.fillText(yen(t.amount),1160,yy);
      x.textAlign='left'
    });
    images.push({bytes:await canvasJpegBytes(c),w:c.width,h:c.height})
  }const parts=[],offsets=[0];
  const push=v=>{
    const b=v instanceof Uint8Array?v:pdfAscii(v);
    parts.push(b);
    return b.length
  };
  let pos=0;
  const pushTrack=v=>{
    const n=push(v);
    pos+=n
  };
  pushTrack('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const objCount=2+pages*3;
  const obj=(num,chunks)=>{
    offsets[num]=pos;
    pushTrack(`${num} 0 obj\n`);
    for(const c of chunks)pushTrack(c);
    pushTrack('\nendobj\n')
  };
  obj(1,[`<< /Type /Catalog /Pages 2 0 R >>`]);
  const kids=Array.from({length:pages},(_,i)=>`${3+i*3} 0 R`).join(' ');
  obj(2,[`<< /Type /Pages /Count ${pages} /Kids [${kids}] >>`]);
  for(let i=0;i<pages;i++){
    const pageObj=3+i*3,contentObj=4+i*3,imageObj=5+i*3,img=images[i],content=`q\n595 0 0 842 0 0 cm\n/Im${i} Do\nQ`;
    obj(pageObj,[`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${i} ${imageObj} 0 R >> >> /Contents ${contentObj} 0 R >>`]);
    obj(contentObj,[`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    offsets[imageObj]=pos;
    pushTrack(`${imageObj} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.w} /Height ${img.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.bytes.length} >>\nstream\n`);
    pushTrack(img.bytes);
    pushTrack('\nendstream\nendobj\n')
  }const xref=pos;
  pushTrack(`xref\n0 ${objCount+1}\n0000000000 65535 f \n`);
  for(let i=1;i<=objCount;i++)pushTrack(`${String(offsets[i]||0).padStart(10,'0')} 00000 n \n`);
  pushTrack(`trailer\n<< /Size ${objCount+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts,{type:'application/pdf'})
}

async function exportBackup(){const payload={...clone(data),version:DATA_VERSION,backupMeta:{app:'My Money 2.0',exportedAt:new Date().toISOString(),format:'single-html-json'}};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),file=new File([blob],`MyMoney2-backup-${ymd()}.json`,{type:'application/json'});try{if(navigator.canShare?.({files:[file]})){await navigator.share({title:'My Money 2.0 バックアップ',files:[file]});return}}catch(e){}const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
async function exportLatestRecovery(){
  const newest=(await mm3RecoveryList())[0];
  if(!newest)return showAlert('復旧用データはありません','読み込み失敗や復元前に保護したデータは現在ありません。');
  try{
    const raw=(newest.raw??localStorage.getItem(newest.id))||'',blob=new Blob([raw],{type:'application/json'}),a=document.createElement('a');
    a.href=URL.createObjectURL(blob);a.download=`MyMoney2-recovery-${ymd()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)
  }catch(e){showAlert('書き出せませんでした','ブラウザの保存機能を利用できませんでした。')}
}
async function importBackup(e){
  const f=e.target.files[0];if(!f)return;
  let obj;
  try{obj=JSON.parse(await f.text())}catch(err){console.error(err);e.target.value='';return showAlert('復元できませんでした','JSONとして読み取れないファイルです。現在のデータは変更していません。')}
  const check=validateBackupPayload(obj);
  if(!check.ok){e.target.value='';return showAlert('復元できませんでした',`My Money 2.0バックアップとして形式を確認できません。\n${check.errors.join('\n')}`)}
  const counts=`取引 ${(obj.transactions||[]).length}件・給与 ${(obj.salaryRecords||[]).length}件・銀行 ${(obj.banks||[]).length}件・カード ${(obj.cards||[]).length}件`;
  const warn=check.warnings.length?`\n\n確認事項:\n${check.warnings.slice(0,5).map(x=>'・'+x).join('\n')}`:'';
  if(!await showAlert('バックアップを復元しますか？',`バージョン v${obj.version} / ${counts}\n現在のデータは復旧用コピーを作成してから置き換えます。${warn}`,{okText:'復元'})){e.target.value='';return}
  if(mm3PendingAsyncCommit){e.target.value='';return showAlert('保存中です','前の保存が完了してから再度お試しください')}
  mm3PendingAsyncCommit=true;
  try{
    const next=prepareLoadedData(obj,{applySeed:false,allowLegacy:false});
    await writeRecoverySnapshotAsync('before_import',data);
    await saveAsync({snapshot:next});
    data=mm3StateGuardMode?mm3GuardData(next):next;
  }catch(err){console.error(err);showAlert('復元できませんでした','保存に失敗しました。現在のデータは保持しています。');return}
  finally{mm3PendingAsyncCommit=false;e.target.value=''}
  try{while(pushStack.length){const x=pushStack.pop();document.getElementById(x.id)?.remove()}renderAll();feedback.success();showToast('バックアップを復元しました')}
  catch(err){console.error('backup restored; UI refresh failed',err);showToast('復元しました。画面を再読み込みしてください',{tone:'error'})}
}
