/* Settings overview and profile editing share one presentation component. */
function settingsRowHtml({id,symbol,color,title,detail='',value=''}){
  return `<button type="button" class="settings-list-row" id="${id}">
    ${settingsIconHtml(symbol,color)}
    <span class="settings-row-copy"><span class="settings-row-title">${esc(title)}</span>${detail?`<span class="settings-row-detail">${esc(detail)}</span>`:''}</span>
    ${value?`<span class="settings-row-value">${esc(value)}</span>`:''}
    <span class="settings-chevron" aria-hidden="true">${icon('chevronRight')}</span>
  </button>`;
}
function settingsGroupHtml(title,rows,footer=''){
  return `<section class="settings-section" aria-label="${esc(title)}"><h2 class="settings-section-title">${esc(title)}</h2><div class="settings-list">${rows.map(settingsRowHtml).join('')}</div>${footer?`<p class="settings-section-footer">${esc(footer)}</p>`:''}</section>`;
}
function renderSettings(){
  const level={many:'多め',minimal:'最小限',recommended:'おすすめ'}[data.notificationSettings.level]||'おすすめ';
  const appearance={system:'システム',dark:'ダーク',light:'ライト'}[data.appearance]||'システム';
  const groups=[
    ['連携',[{id:'gmailSettings',symbol:'mail',color:'#EA4335',title:'Gmail連携',detail:gmailStatusLabel()}]],
    ['お金',[
      {id:'categorySettings',symbol:'grid',color:'var(--orange)',title:'カテゴリ',value:`${data.categories.length}件`},
      {id:'initialValuesSettings',symbol:'bank',color:'var(--blue)',title:'初期データ・現在値',detail:'銀行残高・カード現在請求額'},
      {id:'acfSettingsRow',symbol:'chart',color:'var(--teal)',title:'生活費の見通し',detail:'安全残高・カード支払い・利用ルール'}
    ]],
    ['整理',[
      {id:'favoriteSettings',symbol:'star',color:'var(--orange)',title:'お気に入り',value:`${favoriteOrder().length}件`},
      {id:'tagSettings',symbol:'tag',color:'var(--blue)',title:'タグ',value:`${data.tags.length}件`}
    ]],
    ['通知',[{id:'notificationSettings',symbol:'bell',color:'var(--red)',title:'通知設定',value:level}],'今日のお知らせを残し、昨日以前のお知らせは日本時間で自動削除します。'],
    ['アプリ',[
      {id:'appearanceSettings',symbol:'appearance',color:'#5856D6',title:'外観',value:appearance},
      {id:'feedbackSettingsRow',symbol:'wave',color:'var(--blue)',title:'操作フィードバック',detail:'操作音・触覚・アニメーション'},
      {id:'securitySettings',symbol:'lock',color:'#8E8E93',title:'セキュリティ',value:data.security.enabled?'パスコード ON':'パスコード OFF'},
      {id:'helpSettings',symbol:'help',color:'var(--teal)',title:'ヘルプ・お問い合わせ'}
    ]],
    ['データ',[{id:'dataSettings',symbol:'upload',color:'var(--green)',title:'データ管理',detail:'PDF・バックアップ・削除'}]]
  ];
  document.getElementById('settingsTop').innerHTML=topbar('設定','');
  document.getElementById('settingsContent').innerHTML=`
    <button type="button" class="settings-profile-card" id="profileSettings">
      ${profileAvatarHtml('settings-profile-avatar')}
      <span class="settings-profile-copy"><span class="settings-profile-name">${esc(data.profile.name||'プロフィール')}</span><span class="settings-profile-caption">名前とプロフィール写真</span></span>
      <span class="settings-chevron" aria-hidden="true">${icon('chevronRight')}</span>
    </button>${groups.map(group=>settingsGroupHtml(...group)).join('')}`;
  bindSettings();
}
function bindSettings(){
  const actions={
    profileSettings:openProfileEdit,gmailSettings:openGmailSettings,
    categorySettings:openCategorySettings,initialValuesSettings:openInitialValues,
    acfSettingsRow:openAcfSettings,favoriteSettings:openFavoritesEditor,tagSettings:openTagsManager,
    notificationSettings:openNotificationSettings,appearanceSettings:openAppearanceSettings,
    feedbackSettingsRow:openFeedbackSettings,securitySettings:openSecuritySettings,
    helpSettings:openHelp,dataSettings:openDataSettings
  };
  const root=document.getElementById('settingsContent');
  for(const [id,action] of Object.entries(actions))root.querySelector('#'+id).onclick=action;
}
function openProfileEdit(){
  const draft={...data.profile};
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="prCancel">キャンセル</button><div class="sheet-title">プロフィール</div><button type="button" class="nav-text bold" id="prSave">保存</button></div>
    <div class="sheet-body profile-editor">
      <div class="profile-photo-section"><div id="profilePreview">${profileAvatarHtml('profile-editor-avatar',draft)}</div><button type="button" class="profile-photo-action" id="prChooseImage">写真を変更</button><input id="prImage" type="file" accept="image/*" aria-label="プロフィール写真" hidden></div>
      <div class="form-group-title">名前</div><div class="form-card"><div class="form-section"><label class="visually-hidden" for="prName">名前</label><input class="field profile-name-field" id="prName" autocomplete="name" placeholder="名前を入力" value="${esc(draft.name||'')}"></div></div>
      <div class="form-helper">写真は端末内のアプリデータとして縮小保存します。</div>
      <button type="button" class="profile-photo-action danger" id="prClear" ${draft.icon?'':'hidden'}>写真を削除</button>
    </div>`,'full',root=>{
      const save=root.querySelector('#prSave'),file=root.querySelector('#prImage'),clear=root.querySelector('#prClear');
      let revision=0;
      const draw=()=>{root.querySelector('#profilePreview').innerHTML=profileAvatarHtml('profile-editor-avatar',draft);clear.hidden=!draft.icon};
      root.querySelector('#prCancel').onclick=requestSheetClose;
      root.querySelector('#prChooseImage').onclick=()=>file.click();
      clear.onclick=()=>{revision++;draft.icon='';file.value='';save.disabled=false;markSheetDirty();draw()};
      file.onchange=async()=>{
        const selected=file.files[0];if(!selected)return;
        const current=++revision;save.disabled=true;
        try{
          const image=await resizeImage(selected);
          if(current!==revision)return;
          draft.icon=image;markSheetDirty();draw();
        }catch(e){if(current===revision)showToast('写真を読み込めませんでした。別の画像を選んでください。',{tone:'error'})}
        finally{if(current===revision)save.disabled=false}
      };
      save.onclick=()=>{
        const name=root.querySelector('#prName').value.trim();
        return runSaveAction(save,()=>{data.profile={...data.profile,name,icon:draft.icon||''}},{label:'profile save',success:'プロフィールを更新しました',close:closeSheet});
      };
      return()=>{revision++};
    });
}
function resizeImage(file){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('画像ファイルを読み込めません'));
    reader.onload=()=>{
      const image=new Image();image.onerror=()=>reject(new Error('画像を表示できません'));
      image.onload=()=>{
        try{
          const canvas=document.createElement('canvas'),scale=Math.min(160/image.width,160/image.height,1);
          canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
          const context=canvas.getContext('2d');if(!context)throw new Error('画像を変換できません');
          context.drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.78));
        }catch(e){reject(e)}
      };
      image.src=reader.result;
    };
    reader.readAsDataURL(file);
  });
}
function settingsDetailView(title,html,bind){
  const current=pushStack.at(-1),same=current?.title===title;
  const previous=same?document.getElementById(current.id):null,scroll=previous?.querySelector('.push-body')?.scrollTop||0,focused=previous?.contains(document.activeElement)?document.activeElement.id:'';
  const root=same?replaceTopPush(title,html,bind):pushView(title,html,bind);
  if(same){root.querySelector('.push-body').scrollTop=scroll;if(focused)root.querySelector('#'+focused)?.focus({preventScroll:true})}
  return root;
}
function settingsToggleHtml(id,title,detail,on){
  return `<div class="row"><div class="row-main"><div class="row-title">${esc(title)}</div>${detail?`<div class="row-sub">${esc(detail)}</div>`:''}</div><button type="button" class="switch ${on?'on':''}" id="${id}" role="switch" aria-checked="${!!on}" aria-label="${esc(title)}"></button></div>`;
}
function openCategorySettings(){
  const draw=()=>settingsDetailView('カテゴリ管理',`<div class="settings-detail-intro"><h2>カテゴリ</h2><p>名前やアイコンを編集し、表示順を揃えます。</p></div><div class="group">${data.categories.map((category,index)=>`<div class="row"><button type="button" class="settings-category-open" data-ci="${index}">${categoryIconHtml(category,'settings-icon')}<span class="row-main"><span class="row-title">${esc(category.name)}</span></span><span class="chev" aria-hidden="true">›</span></button><div class="settings-category-order"><button type="button" class="pill" data-up="${index}" aria-label="${esc(category.name)}を上へ" ${index===0?'disabled':''}>↑</button><button type="button" class="pill" data-down="${index}" aria-label="${esc(category.name)}を下へ" ${index===data.categories.length-1?'disabled':''}>↓</button></div></div>`).join('')}</div><button type="button" class="primary" id="catAdd">新しいカテゴリを追加</button>`,root=>{
    for(const [attribute,offset] of [['up',-1],['down',1]])root.querySelectorAll(`[data-${attribute}]`).forEach(button=>button.onclick=()=>{
      const index=Number(button.dataset[attribute]),next=index+offset;if(!data.categories[next])return;
      try{safeCommit(()=>{[data.categories[index],data.categories[next]]=[data.categories[next],data.categories[index]]},{label:'category reorder'})}catch(error){return}draw();
    });
    root.querySelectorAll('[data-ci]').forEach(button=>button.onclick=()=>openCategoryEdit(Number(button.dataset.ci),draw));
    root.querySelector('#catAdd').onclick=()=>openCategoryEdit(-1,draw);
  });draw();
}
function openAppearanceSettings(){
  const options=[['system','システムに合わせる','端末の設定に合わせて自動で切り替えます'],['light','ライト','明るい背景で表示します'],['dark','ダーク','暗い背景で表示します']];
  const draw=()=>settingsDetailView('外観設定',`<div class="settings-detail-intro"><h2>外観</h2><p>読みやすい画面の明るさを選びましょう。</p></div><div class="group" role="group" aria-label="外観">${options.map(([value,label,detail])=>`<button type="button" class="row press settings-choice" data-app="${value}" aria-pressed="${data.appearance===value}"><span class="row-main"><span class="row-title">${label}</span><span class="row-sub">${detail}</span></span><span class="settings-choice-mark ${data.appearance===value?'selected':''}" aria-hidden="true">${icon('check')}</span></button>`).join('')}</div>`,root=>{
    root.querySelectorAll('[data-app]').forEach(button=>button.onclick=()=>{
      try{safeCommit(()=>{data.appearance=button.dataset.app},{label:'appearance'})}catch(error){return}
      applyAppearance();renderSettings();draw();
    });
  });draw();
}
function openFeedbackSettings(){
  let draft=feedbackSettings();
  const draw=()=>settingsDetailView('操作フィードバック',`<div class="settings-detail-intro"><h2>操作フィードバック</h2><p>音・触覚・動きを、自分に合う使い心地に。</p></div><div class="group">${settingsToggleHtml('fbSound','操作音','保存・承認・同期などの重要操作で再生',draft.sound)}${settingsToggleHtml('fbHaptic','触覚','対応する端末で軽い振動を返します',draft.haptic)}${settingsToggleHtml('fbMotion','アニメーション','画面の移動や承認の動きを表示',draft.motion)}</div><div class="section-head">音量</div><div class="card card-pad"><div class="feedback-volume"><input type="range" id="fbVolume" min="0" max="100" step="5" value="${Math.round(draft.volume*100)}" aria-label="操作音の音量"><output id="fbVolumeLabel" for="fbVolume">${Math.round(draft.volume*100)}%</output></div></div><p class="settings-section-footer">変更は自動保存されます。端末の「視差効果を減らす」設定を優先します。</p>`,root=>{
    const persist=()=>{
      try{safeCommit(()=>{data.feedbackSettings={...draft}},{label:'feedback settings'})}catch(error){draft=feedbackSettings();draw();return false}
      applyAppearance();renderSettings();return true;
    };
    for(const [id,key] of [['fbSound','sound'],['fbHaptic','haptic'],['fbMotion','motion']])root.querySelector('#'+id).onclick=event=>{
      draft[key]=!draft[key];const button=event.currentTarget;button.classList.toggle('on',draft[key]);button.setAttribute('aria-checked',String(draft[key]));
      if(persist()&&draft[key]&&key!=='motion')feedback.selection();
    };
    const range=root.querySelector('#fbVolume');
    range.oninput=event=>{draft.volume=clamp(Number(event.target.value)/100,0,1);root.querySelector('#fbVolumeLabel').textContent=`${Math.round(draft.volume*100)}%`};
    range.onchange=()=>{if(persist()&&draft.sound)feedback.selection()};
  });draw();
}
function openHelp(){
  const questions=[['メール取引が分類されません','カテゴリー不明一覧で一度分類すると、同じ加盟店を次回から学習します。'],['アップデート後のGmail連携','同じ公開URLでClient ID設定を維持します。アクセストークンの期限が切れた場合は再接続してください。'],['日締めはいつ使えますか？','対象日の18:00以降（日本時間）に照合・承認・修正・取消ができます。ジャーナルはいつでも閲覧できます。'],['間違えて日締めを承認しました','承認済の画面で「日締めの承認を取り消す」を選び、3段階の確認を進めます。取引と残高は変わりません。'],['PDFを保存するには','データ管理のPDF出力から、対応環境では端末の共有画面を使って保存できます。']];
  pushView('ヘルプ・お問い合わせ',`<div class="settings-detail-intro"><h2>ヘルプ</h2><p>使い方と、よくある質問。</p></div><div class="settings-help-list">${questions.map(([title,answer])=>`<details><summary>${esc(title)}<span aria-hidden="true">${icon('chevronRight')}</span></summary><p>${esc(answer)}</p></details>`).join('')}</div><p class="settings-section-footer">My Money 3.0 · Data v${DATA_VERSION}</p>`);
}

function openNotificationSettings(){const labels={goal:'目標達成/超過通知',salary:'給料日前日通知',payment:'支払日前日通知',unknown:'カテゴリー不明取引の通知',balance:'残高低下アラート'};const draw=()=>{const level=data.notificationSettings.level||'recommended',html=`<div class="form-group-title">アプリを開いている間の通知</div><div class="seg" id="notiLevel"><button data-level="recommended" class="${level==='recommended'?'on':''}">おすすめ</button><button data-level="many" class="${level==='many'?'on':''}">多め</button><button data-level="minimal" class="${level==='minimal'?'on':''}">最小限</button></div><div class="form-helper" style="margin-top:8px">今日のお知らせを残し、昨日以前のお知らせは日本時間で自動削除します。この設定はアプリ内のお知らせを調整します。Web Pushは下の項目で設定できます。</div><div class="form-group-title">アプリ内のお知らせ</div><div class="group">${Object.entries(labels).map(([k,l])=>`<div class="row"><div class="row-main"><div class="row-title">${l}</div></div><button class="switch ${data.notificationSettings[k]?'on':''}" data-noti="${k}"></button></div>`).join('')}</div>${pushSettingsHtml()}`;settingsDetailView('通知設定',html,bind);function bind(root){root.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{try{safeCommit(()=>{data.notificationSettings.level=b.dataset.level},{label:'notification level'})}catch(e){return}draw()});root.querySelectorAll('[data-noti]').forEach(b=>b.onclick=()=>{const k=b.dataset.noti;try{safeCommit(()=>{data.notificationSettings[k]=!data.notificationSettings[k]},{label:'notification setting'})}catch(e){return}draw()});bindPushSettings(root,draw)}};draw()}

/* Security uses the existing passcode and durable commit flow. */
function openSecuritySettings(){const draw=()=>{const relock=data.security.relock||'immediate',html=`<div class="group"><div class="row"><div class="row-main"><div class="row-title">パスコード</div><div class="row-sub">4桁コードで保護</div></div><button type="button" class="switch ${data.security.enabled?'on':''}" id="passSwitch"></button></div>${data.security.enabled?'<button type="button" class="row press" id="changePass"><div class="row-main"><div class="row-title">パスコードを変更</div></div><span class="chev">›</span></button>':''}</div>${data.security.enabled?`<div class="section-head">再ロック</div><div class="group">${[['immediate','すぐ'],['1m','1分後'],['5m','5分後'],['never','しない']].map(([v,l])=>`<button type="button" class="row press" data-relock="${v}"><div class="row-main"><div class="row-title">${l}</div></div>${relock===v?`<span class="blue">${icon('check')}</span>`:''}</button>`).join('')}</div>`:''}`;settingsDetailView('セキュリティ',html,bind);function bind(root){root.querySelector('#passSwitch').onclick=()=>{if(!data.security.enabled)openSetPasscode(()=>{data.security.enabled=true},draw);else showAlert('パスコードを解除しますか？','次回からロック画面を表示しません。',{okText:'解除',destructive:true}).then(ok=>{if(ok){try{safeCommit(()=>{data.security.enabled=false;data.security.passcode=''},{label:'disable passcode'})}catch(e){return}draw()}})};root.querySelector('#changePass')?.addEventListener('click',()=>openSetPasscode(null,draw));root.querySelectorAll('[data-relock]').forEach(b=>b.onclick=()=>{try{safeCommit(()=>{data.security.relock=b.dataset.relock},{label:'relock setting'})}catch(e){return}draw()})}};draw()}
function openSetPasscode(onConfirmed,done){let entered='',first='',step=1,error='';const render=()=>{const box=`<div class="sheet-nav"><button type="button" class="nav-text" id="psCancel">キャンセル</button><div class="sheet-title">${step===1?'新しいパスコード':'もう一度入力'}</div><span style="width:60px"></span></div><div class="sheet-body" style="display:flex;flex-direction:column;align-items:center"><div class="goal-state-copy">${step===1?'4桁のパスコードを入力':'確認のため同じコードを入力'}</div>${error?`<div class="form-error" style="margin-top:10px">${error}</div>`:''}<div class="lock-dots" id="psDots">${[0,1,2,3].map(()=>'<span class="lock-dot"></span>').join('')}</div><div class="lock-pad">${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k=>k===''?'<span></span>':`<button type="button" class="lock-key" data-pk="${k}">${k}</button>`).join('')}</div></div>`;openSheet(box,'full',root=>{const dots=()=>root.querySelectorAll('#psDots .lock-dot').forEach((d,i)=>d.classList.toggle('on',i<entered.length));root.querySelector('#psCancel').onclick=requestSheetClose;root.querySelectorAll('[data-pk]').forEach(b=>b.onclick=()=>{const k=b.dataset.pk;if(k==='⌫')entered=entered.slice(0,-1);else if(entered.length<4)entered+=k;dots();if(entered.length===4){if(step===1){first=entered;entered='';step=2;error='';render()}else if(entered===first){try{safeCommit(()=>{data.security.passcode=entered;onConfirmed?.()},{label:'passcode change'})}catch(e){return}closeSheet();done?.()}else{entered='';first='';step=1;error='パスコードが一致しません。もう一度設定してください。';render()}}})})};render()}
