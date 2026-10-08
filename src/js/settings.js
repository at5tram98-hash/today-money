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

function openNotificationSettings(){const labels={goal:'目標達成/超過通知',salary:'給料日前日通知',payment:'支払日前日通知',unknown:'カテゴリー不明取引の通知',balance:'残高低下アラート'};const draw=()=>{const level=data.notificationSettings.level||'recommended',html=`<div class="form-group-title">アプリを開いている間の通知</div><div class="seg" id="notiLevel"><button data-level="recommended" class="${level==='recommended'?'on':''}">おすすめ</button><button data-level="many" class="${level==='many'?'on':''}">多め</button><button data-level="minimal" class="${level==='minimal'?'on':''}">最小限</button></div><div class="form-helper" style="margin-top:8px">今日のお知らせを残し、昨日以前のお知らせは日本時間で自動削除します。この選択は端末へ飛ばす通知量だけ調整します。</div><div class="form-group-title">アプリ内のお知らせ</div><div class="group">${Object.entries(labels).map(([k,l])=>`<div class="row"><div class="row-main"><div class="row-title">${l}</div></div><button class="switch ${data.notificationSettings[k]?'on':''}" data-noti="${k}"></button></div>`).join('')}</div>${pushSettingsHtml()}`;if(pushStack.length)replaceTopPush('通知設定',html,bind);else pushView('通知設定',html,bind);function bind(root){root.querySelectorAll('[data-level]').forEach(b=>b.onclick=()=>{try{safeCommit(()=>{data.notificationSettings.level=b.dataset.level},{label:'notification level'})}catch(e){return}draw()});root.querySelectorAll('[data-noti]').forEach(b=>b.onclick=()=>{const k=b.dataset.noti;try{safeCommit(()=>{data.notificationSettings[k]=!data.notificationSettings[k]},{label:'notification setting'})}catch(e){return}draw()});bindPushSettings(root,draw)}};draw()}
