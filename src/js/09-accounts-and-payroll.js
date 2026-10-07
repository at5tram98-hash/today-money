function financialEntityById(type,id){return type==='bank'?bankById(id):type==='card'?cardById(id):type==='debit'?debitById(id):null}
function requireFinancialEntity(type,id){const entity=financialEntityById(type,id);if(!entity)throw new Error('参照先が見つかりません。画面を開き直してください。');return entity}
function validateFinancialPayment(method,id){return !['bank','card','debit'].includes(method)||!!financialEntityById(method,id)}
function requireFinancialPayment(method,id){if(!validateFinancialPayment(method,id))throw new Error('支払い方法の参照先が存在しません。選び直してください。')}
function mailEntityLocked(mi){return !!(mi.userResolved||mi.paymentManuallySelected||mi.categorySource==='manual'||mi.transactionId||mi.bankApplied||mi.bankReconciled||mi.statementImportId||mi.linkedTransactionIdCandidate||mi.status==='imported'||data.transactions.some(t=>t.mailImportId===mi.id))}
function relinkMailEntities(){
  requireStateCommit('relinkMailEntities');
  let changed=0;
  for(const mi of data.mailImports||[]){
    // Never migrate a manual choice, a ledger entry, or a deliberately ignored mail.
    if(mailEntityLocked(mi)||mi.status==='ignored'||mi.excludedByUser)continue;
    const current=financialEntityById(mi.paymentMethod,mi.paymentId);
    if(current){if(mi.paymentMethod==='debit'&&mi.linkedBankId!==current.bankId){mi.linkedBankId=current.bankId||'';changed++}continue}
    const found=matchFinancialEntity(mi.sourceName,mi.type),selected=data.gmailSettings?.sourceIds||[];
    const permitted=found.id&&(!selected.length||selected.includes(found.id));
    const nextId=permitted?found.id:'',nextBank=permitted?(found.linkedBankId||''):'';
    if(mi.paymentId!==nextId||mi.linkedBankId!==nextBank||mi.paymentMethod!==found.method){Object.assign(mi,{paymentMethod:found.method,paymentId:nextId,linkedBankId:nextBank});changed++}
  }
  return changed;
}
function financialReferenceEntries(){
  const out=[],add=(type,id,label,active=true)=>{if(id)out.push({type,id,label,active})},pay=(x,label,active)=>{if(!x)return;add(x.paymentMethod,x.paymentId,label,active);add('bank',x.linkedBankId,label+'・紐づく口座',active)},live=x=>!['cancelled','completed','paid','received','archived'].includes(x.status)&&x.active!==false;
  for(const c of data.cards||[])add('bank',c.bankId,`カード「${c.name}」の引落口座`);
  for(const d of data.debitCards||[])add('bank',d.bankId,`デビット「${d.name}」の口座`);
  for(const e of data.employers||[])add('bank',e.bankId,`勤務先「${e.name}」の振込先`);
  for(const f of data.fixedPayments||[])pay(f,`固定支払い「${f.name}」`,live(f));
  for(const p of data.transferPlans||[]){add('bank',p.fromBankId,`振替計画 ${p.date}・振替元`,p.status==='planned');add('bank',p.toBankId,`振替計画 ${p.date}・振替先`,p.status==='planned')}
  for(const p of data.largeExpensePlans||[]){for(const part of largeExpenseParts(p))pay(part,`大型支出「${p.name}」`,live(p))}
  for(const g of data.eventGoals||[])for(const i of g.items||[])pay(i,`イベント目標「${g.name}」・${i.name}`,live(g)&&live(i));
  for(const s of data.savedScenarios||[]){pay(s,`保存した比較案「${s.name}」`,true);add('bank',s.bankId,`比較案「${s.name}」の口座`)}
  for(const t of data.transactions||[])pay(t,`取引履歴「${t.merchant}」`,!t.bankApplied&&!t.bankReconciled&&(t.paymentMethod==='bank'||t.paymentMethod==='debit'));
  for(const x of data.incomes||[])add('bank',x.bankId,`入金記録「${x.sourceName}」`,!x.bankApplied&&!x.bankReconciled&&x.toType==='bank');
  for(const x of data.tempIncomes||[])add('bank',x.bankId,`臨時収入「${x.sourceName}」`,!x.receivedConfirmed&&x.toType==='bank');
  for(const x of data.reimbursements||[])add('bank',x.bankId,'割り勘の受取記録',x.status!=='received');
  for(const x of data.salaryAllocations||[])add('bank',x.bankId,'給与の配分',x.status==='active');
  for(const mi of data.mailImports||[])if(mi.paymentId)pay(mi,`Gmail「${mi.subject||mi.sourceName||mi.id}」`,mi.status==='pending');
  for(const id of data.gmailSettings?.sourceIds||[]){const type=bankById(id)?'bank':cardById(id)?'card':debitById(id)?'debit':'source';add(type,id,'Gmail自動認識の対象設定')}
  add('card',data.acfSettings?.preferredCardId,'ACFの優先カード');
  for(const [key,a] of Object.entries(data.cardAdjustments||{})){add('card',key.slice(key.indexOf('|')+1),'カード請求記録 '+key,a?.status!=='paid');add('bank',a?.bankIdAtPayment,'カード支払時の口座（取消に使用）',false)}
  for(const x of data.statementReconciliations||[])add('card',x.cardId,'カード請求の照合記録',x.status!=='matched');
  for(const x of data.cardStatementImports||[])add('card',x.cardId,'カード明細の取込記録',x.status!=='confirmed');
  return out;
}
function financialReferences(type,id){return [...new Set(financialReferenceEntries().filter(r=>r.type===type&&r.id===id).map(r=>(r.active?'設定・予定：':'履歴保持：')+r.label))]}

function assertFinancialDeletion(type,id){requireFinancialEntity(type,id);const refs=financialReferences(type,id);if(refs.length)throw new Error('先に参照先を変更してください。\n'+refs.join('\n'))}
async function deleteFinancialEntity(type,id,btn){
  if(btn?.disabled)return false;
  const refs=financialReferences(type,id);
  if(refs.length){await showAlert('この項目は削除できません',`先に設定・予定の支払い方法を変更してください。履歴参照は請求計算・取消処理のため保持します。\n\n${refs.map(x=>'・'+x).join('\n')}`);return false}
  if(!await showAlert('削除しますか？','この操作は取り消せません。',{destructive:true,okText:'削除'}))return false;
  return runSaveAction(btn,()=>{assertFinancialDeletion(type,id);const key={bank:'banks',card:'cards',debit:'debitCards'}[type];data[key]=data[key].filter(x=>x.id!==id);relinkMailEntities()},{label:type+' delete',afterCommit:()=>removeFinancialDetail(type,id),close:closeSheet,success:'削除しました'});
}
function financialPushRoots(){return pushStack.map(x=>document.getElementById(x.id)).filter(Boolean)}
function updateFinancialTitle(root,title){const t=root.querySelector('.push-title');if(t)t.textContent=title;const entry=pushStack.find(x=>x.id===root.id);if(entry)entry.title=title}
function presentFinancialView(target,title,html,binder,right=''){
  if(!target||target.nodeType!==1)return pushView(title,html,binder,right);
  const body=target.querySelector('.push-body'),scroll=body.scrollTop;body.innerHTML=html;updateFinancialTitle(target,title);binder?.(target);body.scrollTop=scroll;return target;
}
function refreshFinancialViews(){
  for(const root of financialPushRoots()){
    if(root.dataset.bankId&&bankById(root.dataset.bankId))refreshBankDetail(root.dataset.bankId,root.dataset.bankPeriod,root);
    else if(root.dataset.cardId&&cardById(root.dataset.cardId))refreshCardDetail(root.dataset.cardId,root.dataset.cardMonth,root);
    else if(root.dataset.debitId&&debitById(root.dataset.debitId))refreshDebitDetail(root.dataset.debitId);
    else if(root.dataset.transferPlans==='true')openTransferPlans(root);
    else if(root.dataset.withdrawalBankId&&bankById(root.dataset.withdrawalBankId))openBankWithdrawalPrep(root.dataset.withdrawalBankId,root);
    else if(root.dataset.largeExpenseId)openLargeExpenseDetail(root.dataset.largeExpenseId,root);
    else if(root.dataset.eventGoalId&&data.eventGoals.some(g=>g.id===root.dataset.eventGoalId))openEventGoalDetail(root.dataset.eventGoalId,root);
    else if(root.dataset.paymentList==='fixed')mm3OpenFixedList({month:root.dataset.paymentListMonth},root);
    else if(root.dataset.paymentList==='debit')mm3OpenDebitList(root.dataset.paymentListMonth,root);
    else if(root.dataset.paymentList==='large')mm3OpenLargeList({month:root.dataset.paymentListMonth},root);
  }
}
function removeFinancialDetail(type,id){const key=type+'Id';for(let i=pushStack.length-1;i>=0;i--){const root=document.getElementById(pushStack[i].id);if(root?.dataset[key]!==id)continue;while(pushStack.length>i)popView();break}refreshFinancialViews()}
function refreshTransferPlansView(){refreshFinancialViews()}


function openQuickBank(preselectedBankId=''){if(!data.banks.length)return showAlert('銀行口座がありません','先に銀行口座を登録してください');const selectedId=typeof preselectedBankId==='string'&&preselectedBankId?preselectedBankId:data.banks[0].id;if(!bankById(selectedId))return showAlert('口座が見つかりません','一覧を開き直してください。');let amount=Number(bankById(selectedId).balance)||0;openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="qbCancel">キャンセル</button><div class="sheet-title">クイック銀行口座入力</div><button type="button" class="nav-text bold" id="qbSave">保存</button></div><div class="sheet-body"><div class="form-group-title">口座</div><div class="form-card"><div class="form-section"><div class="form-label">銀行口座</div><select class="field field-select" id="qbBank">${data.banks.map(b=>`<option value="${b.id}" ${b.id===selectedId?'selected':''}>${esc(b.name)}${b.label?'・'+esc(b.label):''}</option>`).join('')}</select></div><div class="form-section">${moneyButton('qbAmount','銀行残高',amount)}</div></div><div class="form-group-title">メモ</div><div class="form-card"><div class="form-section"><input class="field" id="qbMemo" placeholder="残高確認・調整など"></div></div></div>`,'half',root=>{const a=root.querySelector('#qbAmount'),sel=root.querySelector('#qbBank'),set=v=>{amount=Number(v)||0;markSheetDirty();a.querySelector('.val').textContent=yen(amount)};sel.onchange=()=>set(bankById(sel.value)?.balance||0);a.onclick=()=>openCalculator('銀行残高',amount,set);root.querySelector('#qbCancel').onclick=requestSheetClose;root.querySelector('#qbSave').onclick=()=>{if(amount<0)return showAlert('金額を確認してください','残高は0円以上で入力してください。');const id=sel.value,memo=root.querySelector('#qbMemo').value.trim()||'クイック残高入力';if(!bankById(id))return showAlert('口座が見つかりません','口座を選び直してください。');runSaveAction(root.querySelector('#qbSave'),()=>{requireFinancialEntity('bank',id);reconcileBankBalance(id,amount,memo)},{label:'quick bank',afterCommit:refreshFinancialViews,close:closeSheet})}})}
function openTempIncome(date=trackingDate){let amount=0,toType='cash',bankId=data.banks[0]?.id||'';openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="tiCancel">キャンセル</button><div class="sheet-title">クイック臨時収入入力</div><button type="button" class="nav-text bold" id="tiSave">保存</button></div><div class="sheet-body"><div class="form-group-title">収入</div><div class="form-card"><div class="form-section"><div class="form-label">収入源</div><input class="field" id="tiSource" placeholder="例：単発バイト、返金"></div><div class="form-section">${moneyButton('tiAmount','金額',0)}</div></div><div class="form-group-title">入金先</div><div class="form-card"><div class="form-section"><div class="seg" id="tiSeg"><button type="button" class="on" data-v="cash">未入金・手持ち</button><button type="button" data-v="bank">銀行口座</button></div></div><div class="form-section hidden" id="tiBankWrap"><div class="form-label">銀行口座</div><select class="field field-select" id="tiBank">${data.banks.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div></div><div class="form-group-title">メモ</div><div class="form-card"><div class="form-section"><input class="field" id="tiMemo" placeholder="任意"></div></div></div>`,'half',root=>{root.querySelectorAll('#tiSeg button').forEach(b=>b.onclick=()=>{toType=b.dataset.v;root.querySelectorAll('#tiSeg button').forEach(x=>x.classList.toggle('on',x===b));root.querySelector('#tiBankWrap').classList.toggle('hidden',toType!=='bank')});const a=root.querySelector('#tiAmount');a.onclick=()=>openCalculator('収入額',amount,v=>{amount=v;a.querySelector('.val').textContent=yen(v)});root.querySelector('#tiCancel').onclick=requestSheetClose;root.querySelector('#tiSave').onclick=()=>{const src=root.querySelector('#tiSource').value.trim()||'臨時収入';bankId=root.querySelector('#tiBank')?.value||'';if(!amount)return showAlert('金額を入力してください','収入額を入力してください。');if(toType==='bank'&&!bankId)return showAlert('銀行口座がありません','銀行口座を登録してください。');try{safeCommit(()=>{const temp={id:uid('tmp'),date,amount,sourceName:src,toType,bankId,memo:root.querySelector('#tiMemo').value.trim(),incomeId:'',receivedConfirmed:false};const inc=recordIncome({date,amount,sourceName:src,toType,bankId,memo:temp.memo,kind:'temporary',tempIncomeId:temp.id,applyNow:false,saveNow:false});temp.incomeId=inc?.id||'';data.tempIncomes.push(temp)},{label:'temporary income add'})}catch(e){return}closeSheet();renderAll()}})}


function openAddBank(existing=null){const entityId=typeof existing==='string'?existing:existing?.id||'';existing=entityId?financialEntityById('bank',entityId):null;if(entityId&&!existing)return showAlert('項目が見つかりません','一覧を開き直してください。');let balance=Number(existing?.balance)||0,threshold=Number(existing?.threshold)||0;openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="abCancel">キャンセル</button><div class="sheet-title">${existing?'銀行口座を編集':'銀行口座登録'}</div><button type="button" class="nav-text bold" id="abSave">保存</button></div><div class="sheet-body"><div class="form-group-title">口座</div><div class="form-card"><div class="form-section"><div class="form-label">銀行名</div><input class="field" id="abName" value="${esc(existing?.name||'')}" placeholder="例：三井住友銀行"></div><div class="form-section"><div class="form-label">口座名</div><input class="field" id="abLabel" value="${esc(existing?.label||'')}" placeholder="普通口座など"></div><div class="form-section">${moneyButton('abBalance','現在残高',balance)}</div></div><div class="form-group-title">アラート</div><div class="form-card"><div class="form-section">${moneyButton('abThreshold','残高アラート',threshold)}</div></div><div class="form-helper">残高を保存した時点を基準日時として記録し、それ以前のGmail履歴で現在残高を再変動させません。</div>${existing?'<button type="button" class="secondary danger" id="abDelete">この口座を削除</button>':''}</div>`,'full',root=>{const bb=root.querySelector('#abBalance'),tt=root.querySelector('#abThreshold');bb.onclick=()=>openCalculator('銀行残高',balance,v=>{balance=v;bb.querySelector('.val').textContent=yen(v);markSheetDirty()});tt.onclick=()=>openCalculator('残高アラート',threshold,v=>{threshold=v;tt.querySelector('.val').textContent=yen(v);markSheetDirty()});root.querySelector('#abCancel').onclick=requestSheetClose;root.querySelector('#abSave').onclick=()=>{const name=root.querySelector('#abName').value.trim();if(!name)return showAlert('銀行名を入力してください','銀行名は必須です。');if(!Number.isFinite(balance)||balance<0)return showAlert('金額を確認してください','残高は0円以上にしてください。');runSaveAction(root.querySelector('#abSave'),()=>{let saved;const current=entityId?requireFinancialEntity('bank',entityId):null;if(current){const balanceChanged=Number(current.balance)!==Number(balance);Object.assign(current,{name,label:root.querySelector('#abLabel').value.trim(),threshold});if(balanceChanged)reconcileBankBalance(entityId,balance,'口座編集');else current.updatedAt=new Date().toISOString();saved=current}else{const now=new Date().toISOString();saved={id:uid('bank'),name,label:root.querySelector('#abLabel').value.trim(),balance,threshold,updatedAt:now,balanceAsOf:now};data.banks.push(saved);bankSnapshot(saved,'口座登録')}relinkMailEntities();},{label:'bank save',busy:true,afterCommit:refreshFinancialViews,close:closeSheet})};root.querySelector('#abDelete')?.addEventListener('click',()=>deleteFinancialEntity('bank',entityId,root.querySelector('#abDelete')))})}
function openAddCard(existing=null){
  const entityId=typeof existing==='string'?existing:existing?.id||'';
  existing=entityId?financialEntityById('card',entityId):null;
  if(entityId&&!existing)return showAlert('項目が見つかりません','一覧を開き直してください。');
  let limit=Number(existing?.limit)||0,initialAmount=0,initialDate=ymd(),closingType=existing?.closingDay==null?'unset':String(existing.closingDay)==='月末'?'month_end':'day',closingDay=closingType==='day'?clamp(Number(existing?.closingDay)||15,1,31):15,dueDay=existing?.dueDay==null?'':String(existing.dueDay);
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="acCancel">キャンセル</button><div class="sheet-title">${existing?'クレジットカードを編集':'クレジットカード登録'}</div><button type="button" class="nav-text bold" id="acSave">保存</button></div><div class="sheet-body"><div class="form-group-title">カード</div><div class="form-card"><div class="form-section"><div class="form-label">カード会社</div><input class="field" id="acCompany" value="${esc(existing?.company||'')}" placeholder="例：三井住友カード"></div><div class="form-section"><div class="form-label">カード名</div><input class="field" id="acName" value="${esc(existing?.name||'')}"></div><div class="form-section">${moneyButton('acLimit','利用限度額',limit)}</div></div>${existing?'':`<div class="form-group-title">現在の請求を初期登録</div><div class="form-card"><div class="form-section">${moneyButton('acInitialAmount','現在の請求額',initialAmount)}</div><div class="form-section"><div class="form-label">この請求の支払日</div><input class="field" id="acInitialDate" type="date" value="${initialDate}"></div></div><div class="form-helper">0円なら請求額は登録しません。あとから「カード請求額を更新」で過去月も変更できます。</div>`}<div class="form-group-title">締め・支払い</div><div class="form-card"><div class="form-section"><div class="form-label">締め日</div><div class="seg" id="acCloseSeg"><button type="button" data-v="unset" class="${closingType==='unset'?'on':''}">未設定</button><button type="button" data-v="month_end" class="${closingType==='month_end'?'on':''}">月末</button><button type="button" data-v="day" class="${closingType==='day'?'on':''}">指定日</button></div><select class="field field-select ${closingType==='day'?'':'hidden'}" id="acCloseDay" style="margin-top:7px">${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${closingDay===i+1?'selected':''}>${i+1}日</option>`).join('')}</select></div><div class="form-section"><div class="form-label">支払日</div><select class="field field-select" id="acDue"><option value="">未設定</option>${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${dueDay===String(i+1)?'selected':''}>${i+1}日</option>`).join('')}</select></div></div><div class="form-group-title">引き落とし</div><div class="form-card"><div class="form-section"><div class="form-label">引き落とし口座</div><select class="field field-select" id="acBank"><option value="">未設定</option>${data.banks.map(b=>`<option value="${b.id}" ${existing?.bankId===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div></div>${existing?'<button type="button" class="secondary danger" id="acDelete">このカードを削除</button>':''}</div>`,'full',root=>{
    const l=root.querySelector('#acLimit'),saveBtn=root.querySelector('#acSave'),initBtn=root.querySelector('#acInitialAmount');
    l.onclick=()=>openCalculator('利用限度額',limit,v=>{
      limit=v;
      l.querySelector('.val').textContent=yen(v);
      markSheetDirty()
    });
    if(initBtn)initBtn.onclick=()=>openCalculator('現在の請求額',initialAmount,v=>{
      initialAmount=v;
      initBtn.querySelector('.val').textContent=yen(v);
      markSheetDirty()
    });
    root.querySelectorAll('#acCloseSeg button').forEach(b=>b.onclick=()=>{
      closingType=b.dataset.v;
      markSheetDirty();
      root.querySelectorAll('#acCloseSeg button').forEach(x=>x.classList.toggle('on',x===b));
      root.querySelector('#acCloseDay').classList.toggle('hidden',closingType!=='day')
    });
    root.querySelector('#acCancel').onclick=requestSheetClose;
    saveBtn.onclick=()=>{
      const company=root.querySelector('#acCompany').value.trim()||root.querySelector('#acName').value.trim(),name=root.querySelector('#acName').value.trim()||company;
      if(!name)return showAlert('カード名を入力してください','カード会社またはカード名を入力してください。');
      const dueRaw=root.querySelector('#acDue').value,obj={company,name,closingDay:closingType==='unset'?null:closingType==='month_end'?'月末':Number(root.querySelector('#acCloseDay').value),dueDay:dueRaw?Number(dueRaw):null,limit,bankId:root.querySelector('#acBank').value};
      runSaveAction(saveBtn,()=>{
        if(obj.bankId)requireFinancialEntity('bank',obj.bankId);
        let card=entityId?requireFinancialEntity('card',entityId):null;
        if(card)Object.assign(card,obj);
        else{
          card={id:uid('card'),...obj,createdAt:new Date().toISOString()};
          data.cards.push(card)
        }if(!existing&&initialAmount>0){
          initialDate=root.querySelector('#acInitialDate').value||ymd();
          const bm=billingMonthForPaymentDate(card,initialDate);
          setCardStatement(card.id,bm,initialAmount,{paymentDate:initialDate,status:'confirmed',memo:'カード登録時の初期請求額'})
        }relinkMailEntities()
      },{render:true,label:'card save',busy:true,success:entityId?'カードを更新しました':'カードを登録しました',afterCommit:refreshFinancialViews,close:closeSheet})
    };
    root.querySelector('#acDelete')?.addEventListener('click',()=>deleteFinancialEntity('card',entityId,root.querySelector('#acDelete')))
  })
}
function openAddDebit(existing=null){const entityId=typeof existing==='string'?existing:existing?.id||'';existing=entityId?financialEntityById('debit',entityId):null;if(entityId&&!existing)return showAlert('項目が見つかりません','一覧を開き直してください。');openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="adCancel">キャンセル</button><div class="sheet-title">${existing?'デビットカードを編集':'デビットカード登録'}</div><button type="button" class="nav-text bold" id="adSave">保存</button></div><div class="sheet-body"><div class="form-group-title">デビットカード</div><div class="form-card"><div class="form-section"><div class="form-label">カード名</div><input class="field" id="adName" value="${esc(existing?.name||'')}" placeholder="例：Oliveデビットカード"></div><div class="form-section"><div class="form-label">紐づく銀行口座</div><select class="field field-select" id="adBank"><option value="">未設定</option>${data.banks.map(b=>`<option value="${b.id}" ${existing?.bankId===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div></div>${existing?'<button type="button" class="secondary danger" id="adDelete">このデビットカードを削除</button>':''}</div>`,'full',root=>{root.querySelector('#adCancel').onclick=requestSheetClose;root.querySelector('#adSave').onclick=()=>{const name=root.querySelector('#adName').value.trim(),bankId=root.querySelector('#adBank').value;if(!name)return showAlert('カード名を入力してください','デビットカード名は必須です。');if(!bankId)return showAlert('銀行口座を選択してください','デビットカードに紐づく銀行口座を選択してください。');runSaveAction(root.querySelector('#adSave'),()=>{requireFinancialEntity('bank',bankId);const current=entityId?requireFinancialEntity('debit',entityId):null;if(current)Object.assign(current,{name,bankId});else data.debitCards.push({id:uid('debit'),name,bankId,createdAt:new Date().toISOString()});relinkMailEntities()},{label:'debit save',busy:true,afterCommit:refreshFinancialViews,close:closeSheet})};root.querySelector('#adDelete')?.addEventListener('click',()=>deleteFinancialEntity('debit',entityId,root.querySelector('#adDelete')))})}

function payrollRuleText(kind,state){const offset=Number(state.monthOffset)||0,month=offset===1?'翌月':'当月',day=state.type==='month_end'?'月末':`${state.day||1}日`;return kind==='closing'?`${month} ${day}`:`${month} ${day}`}function employerClosingLabel(e){const month=Number(e?.closingMonthOffset)===1?'翌月':'当月',day=e?.closingType==='day'?`${Number(e?.closingDay)||1}日`:'月末';return `${month}${day}締め`}function employerPayLabel(e){const month=Number(e?.payMonthOffset)===1?'翌月':'当月',day=e?.payType==='month_end'?'月末':`${Number(e?.payDay)||1}日`;return `${month}${day}払い`}
function inferSalaryWorkMonthForPayMonth(employer,paymentMonth){if(!employer)return paymentMonth;for(let i=-4;i<=4;i++){const candidate=addMonths(paymentMonth,i),payDate=employerPayDate(employer,candidate);if(String(payDate||'').slice(0,7)===paymentMonth)return candidate}return addMonths(paymentMonth,-(Number(employer.payMonthOffset)||0))}
function payrollRulePanel(prefix,state){return `<div class="pay-rule-panel hidden" id="${prefix}Panel"><div class="seg" id="${prefix}Month"><button type="button" data-v="0" class="${Number(state.monthOffset)===0?'on':''}">当月</button><button type="button" data-v="1" class="${Number(state.monthOffset)===1?'on':''}">翌月</button></div><div class="seg" id="${prefix}Type"><button type="button" data-v="month_end" class="${state.type==='month_end'?'on':''}">月末</button><button type="button" data-v="day" class="${state.type==='day'?'on':''}">指定日</button></div><select class="field field-select ${state.type==='day'?'':'hidden'}" id="${prefix}Day">${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${Number(state.day||1)===i+1?'selected':''}>${i+1}日</option>`).join('')}</select><div class="pay-rule-example" id="${prefix}Example"></div></div>`}
function payrollRuleExample(prefix,state){const kind=String(prefix).toLowerCase().includes('close')?'closing':'pay',base=ym(),target=addMonths(base,Number(state.monthOffset)||0),[y,m]=target.split('-').map(Number),last=new Date(y,m,0).getDate(),day=state.type==='month_end'?last:Math.min(Math.max(1,Number(state.day)||1),last),date=`${target}-${pad(day)}`;if(kind==='closing'){const prev=addMonths(target,-1),prevLast=new Date(Number(prev.slice(0,4)),Number(prev.slice(5,7)),0).getDate(),start=state.type==='month_end'?`${target}-01`:addDays(`${prev}-${pad(Math.min(Math.max(1,Number(state.day)||1),prevLast))}`,1);return `勤務対象期間の例：${start.replaceAll('-','/')}〜${date.replaceAll('-','/')} → ${date.replaceAll('-','/')}締め`}return `入金日の例：${monthLabel(base)}勤務分 → ${date.replaceAll('-','/')}入金`}
function bindPayrollRule(root,prefix,state,valueEl){const panel=root.querySelector(`#${prefix}Panel`),row=root.querySelector(`#${prefix}Row`),monthButtons=[...root.querySelectorAll(`#${prefix}Month [data-v]`)],typeButtons=[...root.querySelectorAll(`#${prefix}Type [data-v]`)],day=root.querySelector(`#${prefix}Day`),example=root.querySelector(`#${prefix}Example`);const render=()=>{const kind=String(prefix).toLowerCase().includes('close')?'closing':'pay';if(valueEl)valueEl.textContent=payrollRuleText(kind,state).replace(' ','');monthButtons.forEach(b=>b.classList.toggle('on',Number(b.dataset.v)===Number(state.monthOffset)));typeButtons.forEach(b=>b.classList.toggle('on',b.dataset.v===state.type));if(day){day.classList.toggle('hidden',state.type!=='day');day.value=String(Math.min(31,Math.max(1,Number(state.day)||1)))}if(example)example.textContent=payrollRuleExample(prefix,state);row?.setAttribute('aria-expanded',String(!panel?.classList.contains('hidden')))};const dirty=()=>{markSheetDirty();render()};row?.addEventListener('click',()=>{panel?.classList.toggle('hidden');render()});monthButtons.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();state.monthOffset=Number(b.dataset.v)||0;dirty()}));typeButtons.forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();state.type=b.dataset.v==='day'?'day':'month_end';dirty()}));day?.addEventListener('change',()=>{state.day=Math.min(31,Math.max(1,Number(day.value)||1));dirty()});render()}

function openEmployerCreate(after,preset=null,onCancel=null){let hourly=Number(preset?.hourly)||0,transport=Number(preset?.transport)||0,closing={type:preset?.closingType||'month_end',day:Number(preset?.closingDay)||15,monthOffset:Number(preset?.closingMonthOffset)||0},pay={type:preset?.payType||'day',day:Number(preset?.payDay)||25,monthOffset:Number(preset?.payMonthOffset)||0};openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="ecCancel">キャンセル</button><div class="sheet-title">勤務先登録</div><button type="button" class="nav-text bold" id="ecSave">保存</button></div><div class="sheet-body"><div class="form-group-title">勤務先</div><div class="form-card"><div class="form-section"><div class="form-label">会社名</div><input class="field" id="ecName" value="${esc(preset?.name||'')}" placeholder="例：GU"></div></div><div class="form-group-title">給与条件</div><div class="form-card"><div class="form-section">${moneyButton('ecHourly','時給',hourly)}</div><div class="form-section">${moneyButton('ecTransport','交通費（円）',transport)}</div><button type="button" class="row press" id="ecCloseRow"><div class="row-main"><div class="row-title">締め日</div></div><div class="row-value" id="ecCloseValue"></div><span class="chev">›</span></button>${payrollRulePanel('ecClose',closing)}<button type="button" class="row press" id="ecPayRow"><div class="row-main"><div class="row-title">給料日</div></div><div class="row-value" id="ecPayValue"></div><span class="chev">›</span></button>${payrollRulePanel('ecPay',pay)}</div><div class="form-group-title">振込</div><div class="form-card"><div class="form-section"><div class="form-label">振込先口座</div><select class="field field-select" id="ecBank"><option value="">振込先未設定（入金確認が必要）</option>${data.banks.map(b=>`<option value="${b.id}" ${preset?.bankId===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div></div></div>`,'full',root=>{const h=root.querySelector('#ecHourly'),tr=root.querySelector('#ecTransport'),saveBtn=root.querySelector('#ecSave');h.onclick=()=>openCalculator('時給',hourly,v=>{hourly=v;h.querySelector('.val').textContent=yen(v)});tr.onclick=()=>openCalculator('交通費',transport,v=>{transport=v;tr.querySelector('.val').textContent=yen(v)});bindPayrollRule(root,'ecClose',closing,root.querySelector('#ecCloseValue'));bindPayrollRule(root,'ecPay',pay,root.querySelector('#ecPayValue'));root.querySelector('#ecCancel').onclick=async()=>{const wasOpen=document.getElementById('sheet').classList.contains('show');await requestSheetClose();if(wasOpen&&!document.getElementById('sheet').classList.contains('show')&&onCancel)setTimeout(()=>onCancel(),320)};saveBtn.onclick=()=>{const name=root.querySelector('#ecName').value.trim();if(!name)return showAlert('会社名を入力してください','勤務先名は必須です。');let created=null;runSaveAction(saveBtn,()=>{created={id:uid('emp'),name,hourly,transport,closingType:closing.type,closingDay:closing.type==='day'?closing.day:null,closingMonthOffset:closing.monthOffset,payType:pay.type,payDay:pay.type==='day'?pay.day:null,payMonthOffset:pay.monthOffset,bankId:root.querySelector('#ecBank').value};data.employers.push(created)},{render:true,label:'employer create',busy:true,success:'勤務先を登録しました',close:()=>{closeSheet();setTimeout(()=>after?.(created?.id),330)}})}})}
function openSalaryAdd(existing=null,presetEmployerId='',draft=null){
  const existingId=existing?.id||'';
  let gross=Number(draft?.gross??existing?.gross)||0,transport=Number(draft?.transport??existing?.transport)||0,selectedId=presetEmployerId||draft?.selectedId||existing?.employerId||data.employers[0]?.id||'',workMonth=draft?.workMonth||existing?.month||'';
  const selected=()=>employerById(selectedId);
  if(!workMonth)workMonth=inferSalaryWorkMonthForPayMonth(selected(),payViewMonth);
  if(selected()&&!existing&&transport===0)transport=Number(selected().transport)||0;
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="saCancel">キャンセル</button><div class="sheet-title">給与記録を追加</div><button type="button" class="nav-text bold" id="saSave">保存</button></div><div class="sheet-body"><div class="form-group-title">勤務先</div><div class="form-card"><div class="form-section"><div class="form-label">勤務先</div><select class="field field-select" id="saEmp">${data.employers.length?data.employers.map(e=>`<option value="${e.id}" ${selectedId===e.id?'selected':''}>${esc(e.name)}</option>`).join(''):'<option value="">勤務先未登録</option>'}</select></div><div class="form-section"><div class="form-label">勤務対象月</div><input class="field" id="saWorkMonth" type="month" value="${esc(workMonth)}"></div><div class="form-section"><div class="inline-value-row"><div class="form-label">入金予定日</div><strong id="saPayDate">—</strong></div></div></div><button type="button" class="form-link" id="saNewEmployer"><span>新しい勤務先を追加</span><span class="chev">›</span></button><div class="form-group-title">給与</div><div class="form-card"><div class="form-section">${moneyButton('saGross','総支給額',gross)}</div><div class="form-section">${moneyButton('saTransport','交通費',transport)}</div></div><div class="form-group-title">給与条件</div><div class="form-card"><div class="row"><div class="row-main"><div class="row-title">時給</div></div><div class="row-value" id="saHourlyVal"></div></div><div class="row"><div class="row-main"><div class="row-title">締め日</div></div><div class="row-value" id="saClosingVal"></div></div><div class="row"><div class="row-main"><div class="row-title">給料日</div></div><div class="row-value" id="saPayVal"></div></div></div><div class="form-group-title">振込</div><div class="form-card"><div class="row"><div class="row-main"><div class="row-title">振込先口座</div></div><div class="row-value" id="saBankVal"></div></div></div></div>`,'full',root=>{
    const empSel=root.querySelector('#saEmp'),workEl=root.querySelector('#saWorkMonth'),g=root.querySelector('#saGross'),tr=root.querySelector('#saTransport'),saveBtn=root.querySelector('#saSave');
    const refresh=({infer=false}={})=>{
      const e=selected();
      if(infer&&!existingId){
        workMonth=inferSalaryWorkMonthForPayMonth(e,payViewMonth);
        workEl.value=workMonth
      }const payDate=e&&workMonth?employerPayDate(e,workMonth):'';
      root.querySelector('#saPayDate').textContent=payDate||'—';
      root.querySelector('#saHourlyVal').textContent=e?yen(e.hourly):'—';
      root.querySelector('#saClosingVal').textContent=e?employerClosingLabel(e):'—';
      root.querySelector('#saPayVal').textContent=e?employerPayLabel(e):'—';
      root.querySelector('#saBankVal').textContent=bankById(e?.bankId)?.name||'未設定（入金確認が必要）';
      return payDate
    };
    empSel.onchange=()=>{
      selectedId=empSel.value;
      const e=selected();
      transport=Number(e?.transport)||0;
      tr.querySelector('.val').textContent=yen(transport);
      refresh({infer:true})
    };
    workEl.onchange=()=>{
      workMonth=workEl.value;
      refresh()
    };
    g.onclick=()=>openCalculator('給与',gross,v=>{
      gross=v;
      g.querySelector('.val').textContent=yen(v);
      markSheetDirty()
    });
    tr.onclick=()=>openCalculator('交通費',transport,v=>{
      transport=v;
      tr.querySelector('.val').textContent=yen(v);
      markSheetDirty()
    });
    root.querySelector('#saNewEmployer').onclick=()=>{
      const body=root.querySelector('.sheet-body'),savedDraft={gross,transport,selectedId,workMonth:workEl.value||workMonth,scrollTop:body?.scrollTop||0};
      closeSheet();
      setTimeout(()=>openEmployerCreate(id=>{
        openSalaryAdd(existing,id,{...savedDraft,selectedId:id});
        setTimeout(()=>{
          const b=document.querySelector('#sheet .sheet-body');
          if(b)b.scrollTop=savedDraft.scrollTop
        },0)
      },null,()=>{
        openSalaryAdd(existing,savedDraft.selectedId,savedDraft);
        setTimeout(()=>{
          const b=document.querySelector('#sheet .sheet-body');
          if(b)b.scrollTop=savedDraft.scrollTop
        },0)
      }),320)
    };
    root.querySelector('#saCancel').onclick=requestSheetClose;
    saveBtn.onclick=async()=>{
      const e=selected();
      workMonth=workEl.value;
      if(!e)return showAlert('勤務先を登録してください','先に勤務先を追加してください。');
      if(!/^\d{4}-\d{2}$/.test(workMonth))return showAlert('勤務対象月を確認してください','勤務対象月を選択してください。');
      if(!gross)return showAlert('金額を入力してください','総支給額を入力してください。');
      const duplicate=data.salaryRecords.find(r=>r.employerId===e.id&&r.month===workMonth&&r.id!==existingId);
      if(duplicate){
        if(await showAlert('この勤務月の給与は登録済みです','同じ勤務先・勤務対象月の給与がすでにあります。既存の給与を編集しますか？',{okText:'既存を編集',cancelText:'戻る'})){
          closeSheet();
          openSalaryRecordEdit(duplicate.id)
        }return
      }const date=employerPayDate(e,workMonth),obj={employerId:e.id,month:workMonth,date,gross,transport,status:(existingId?data.salaryRecords.find(x=>x.id===existingId)?.status:existing?.status)||'予定'};
      return runSaveAction(saveBtn,()=>{
        if(existingId){
          const target=data.salaryRecords.find(x=>x.id===existingId);
          if(!target)throw new Error('給与記録が見つかりません');
          Object.assign(target,obj)
        }else data.salaryRecords.push({id:uid('salary'),...obj,createdAt:new Date().toISOString()})
      },{render:false,label:'salary add',busy:true,success:`${monthLabel(workMonth)}勤務分を保存しました・入金予定 ${Number(date.slice(5,7))}/${Number(date.slice(8,10))}`,afterCommit:()=>{
        payViewMonth=date.slice(0,7);
        closeSheet();
        renderAll();
        refreshSalaryOpenView()
      }})
    };
    refresh()
  })
}
function openFixedPayment(existing=null,{defaultMonth=payViewMonth}={}){
  const entityId=typeof existing==='string'?existing:existing?.id||'';
  existing=entityId?data.fixedPayments.find(x=>x.id===entityId):null;
  if(entityId&&!existing)return showAlert('項目が見つかりません','一覧を開き直してください。');
  let amount=Number(existing?.amount)||0,frequency=existing?.frequency||'monthly',annualMonth=Number(existing?.annualMonth)||Number(String(existing?.startMonth||defaultMonth).slice(5,7))||1;
  openSheet(`<div class="sheet-nav"><button class="nav-text" id="fpCancel">キャンセル</button><div class="sheet-title">固定支払い登録</div><button class="nav-text bold" id="fpSave">保存</button></div><div class="sheet-body"><div class="form-group-title">支払い</div><div class="form-card"><div class="form-section"><div class="form-label">名前</div><input class="field" id="fpName" value="${esc(existing?.name||'')}"></div><div class="form-section">${moneyButton('fpAmount','金額',amount)}</div><div class="form-section"><div class="form-label">カテゴリ</div><select class="field field-select" id="fpCat">${data.categories.map(c=>`<option ${existing?.category===c.name?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div></div><div class="form-group-title">スケジュール</div><div class="form-card"><div class="form-section"><div class="form-label">支払頻度</div><div class="seg" id="fpFreqSeg"><button data-v="monthly" class="${frequency==='monthly'?'on':''}">毎月</button><button data-v="bimonthly" class="${frequency==='bimonthly'?'on':''}">隔月</button><button data-v="yearly" class="${frequency==='yearly'?'on':''}">毎年</button></div></div><div class="form-section ${frequency==='yearly'?'':'hidden'}" id="fpAnnualWrap"><div class="form-label">対象月</div><select class="field field-select" id="fpAnnualMonth">${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${annualMonth===i+1?'selected':''}>${i+1}月</option>`).join('')}</select></div><div class="form-section"><div class="form-label">支払日</div><select class="field field-select" id="fpDay">${Array.from({length:31},(_,i)=>`<option value="${i+1}" ${(Number(existing?.day)||1)===i+1?'selected':''}>${i+1}日</option>`).join('')}</select></div><div class="form-section"><div class="form-label">開始月</div><input class="field" id="fpStart" type="month" value="${esc(existing?.startMonth||defaultMonth)}"></div></div><div class="form-group-title">支払い方法</div><div class="form-card"><div class="form-section"><select class="field field-select" id="fpPay">${paymentOptions(existing?.paymentMethod,existing?.paymentId)}</select></div></div>${existing?'<button class="secondary danger" id="fpDelete">この固定支払いを削除</button>':''}</div>`,'full',()=>{
    const a=document.getElementById('fpAmount');
    a.onclick=()=>openCalculator('支払い金額',amount,v=>{
      amount=v;
      a.querySelector('.val').textContent=yen(v);
      markSheetDirty()
    });
    document.querySelectorAll('#fpFreqSeg button').forEach(b=>b.onclick=()=>{
      frequency=b.dataset.v;
      markSheetDirty();
      document.querySelectorAll('#fpFreqSeg button').forEach(x=>x.classList.toggle('on',x===b));
      document.getElementById('fpAnnualWrap').classList.toggle('hidden',frequency!=='yearly')
    });
    document.getElementById('fpCancel').onclick=requestSheetClose;
    document.getElementById('fpSave').onclick=()=>{
      const name=document.getElementById('fpName').value.trim();
      if(!name||!amount)return showAlert('入力を確認してください','支払い名と金額は必須です。');
      const [pm,pid]=document.getElementById('fpPay').value.split('|'),obj={name,category:document.getElementById('fpCat').value,amount,frequency,annualMonth:Number(document.getElementById('fpAnnualMonth').value)||annualMonth,day:Number(document.getElementById('fpDay').value)||1,paymentMethod:pm,paymentId:pid,skippedDates:existing?.skippedDates||[],startMonth:document.getElementById('fpStart').value||defaultMonth};
      if(!validateFinancialPayment(pm,pid))return showAlert('支払い方法を確認してください','登録済みの支払い先を選択してください。');
      runSaveAction(document.getElementById('fpSave'),()=>{
        requireFinancialPayment(pm,pid);
        if(entityId){
          const current=data.fixedPayments.find(x=>x.id===entityId);
          if(!current)throw new Error('固定支払いが見つかりません');
          Object.assign(current,{...obj,skippedDates:current.skippedDates||[]})
        }else data.fixedPayments.push({id:uid('fixed'),...obj})
      },{label:'fixed save',afterCommit:refreshFinancialViews,close:closeSheet})
    };
    if(existing)document.getElementById('fpDelete').onclick=async()=>{
      if(await showAlert('固定支払いを削除しますか？','今後の自動計上を停止します。',{destructive:true,okText:'削除'})){
        runSaveAction(document.getElementById('fpDelete'),()=>{
          if(!data.fixedPayments.some(x=>x.id===entityId))throw new Error('固定支払いが見つかりません');
          data.fixedPayments=data.fixedPayments.filter(x=>x.id!==entityId)
        },{label:'fixed delete',afterCommit:refreshFinancialViews,close:closeSheet})
      }
    }
  })
}
function processScheduled(){return safeCommit(()=>{const today=ymd();let changed=false;for(const t of data.transactions.filter(x=>x.date&&x.date<=today&&(x.paymentMethod==='bank'||x.paymentMethod==='debit')&&!x.bankApplied&&!x.bankReconciled)){if(applyBankEffectForTransaction(t,{respectBalanceAsOf:true,eventAt:t.createdAt||`${t.date}T00:00:00`}))changed=true}for(const x of data.incomes.filter(x=>x.date&&x.date<=today&&x.toType==='bank'&&x.bankId&&!x.bankApplied&&!x.bankReconciled)){if(applyBankEffectForIncome(x,{respectBalanceAsOf:true,eventAt:x.createdAt||`${x.date}T23:59:59`}))changed=true}const earliestFixed=data.fixedPayments.map(f=>String(f.startMonth||'')).filter(x=>/^[0-9]{4}-[0-9]{2}$/.test(x)).sort()[0]||today.slice(0,7),startMonth=data.meta.lastScheduleDate?String(data.meta.lastScheduleDate).slice(0,7):earliestFixed,endMonth=today.slice(0,7),[sy,sm]=startMonth.split('-').map(Number),[ey,em]=endMonth.split('-').map(Number),span=Math.max(0,(ey-sy)*12+(em-sm));for(let i=0;i<=span;i++){const month=addMonths(startMonth,i);for(const f of data.fixedPayments){for(const date of fixedDueDatesInMonth(f,month)){if(date>today||(f.skippedDates||[]).includes(date))continue;if(data.transactions.some(t=>t.source==='fixed'&&t.fixedId===f.id&&t.date===date))continue;recordExpense({date,amount:f.amount,category:f.category,merchant:f.name,paymentMethod:f.paymentMethod,paymentId:f.paymentId,source:'fixed',fixedId:f.id,respectBalanceAsOf:true,eventAt:`${date}T00:00:00`,saveNow:false});changed=true}}}if(data.meta.lastScheduleDate!==today){data.meta.lastScheduleDate=today;changed=true}if(changed)save()},{label:'scheduled payments',skipUnchanged:true})}
function generateSystemNotices(){
  const tomorrow=addDays(ymd(),1),tomMonth=tomorrow.slice(0,7);
  if(data.notificationSettings.salary){
    for(const employer of data.employers){
      const sourceMonth=addMonths(tomMonth,-(Number(employer.payMonthOffset)||0));
      if(employerPayDate(employer,sourceMonth)===tomorrow)addNotice('明日は給料日です',`${employer.name}の給料日が明日に設定されています。`);
    }
  }
  if(data.notificationSettings.payment){
    const tomorrowDay=parseYmd(tomorrow).getDate();
    for(const card of data.cards){
      if(card.dueDay!=null&&Number(card.dueDay)===tomorrowDay)addNotice('明日はカード支払日です',`${card.name}の支払日です。`);
    }
    for(const payment of data.fixedPayments){
      if(fixedDueOn(payment,tomorrow))addNotice('明日は固定支払い日です',`${payment.name} ${yen(payment.amount)}の支払い予定です。`);
    }
  }
  if(data.notificationSettings.unknown){
    const pending=data.mailImports.filter(x=>x.status==='pending').length;
    if(pending)addNotice('カテゴリー不明の取引',`${pending}件の取引に確認が必要です。`,'warning');
  }
  if(data.acfSettings.initialized&&data.acfSettings.riskNotifications){
    const forecast=buildCashFlowForecast(),risk=forecast.risks.find(r=>r.severity==='critical'||r.severity==='warning');
    if(risk)addNotice('ACF 安全ライン予測',risk.title+(risk.detail?'・'+risk.detail:''),'warning');
  }
  if((data.notificationSettings?.level||'recommended')==='recommended'){
    const today=ymd();
    for(const statement of cardPaymentStatementsInMonth(today.slice(0,7),{includePaid:false})){
      if(statement.paymentDate===today&&statement.status!=='paid')addNotice('カード引落日です',`${statement.cardName} ${yen(statement.amount)}の引落予定です。`,'warning');
    }
  }
}
function goalRate(spent,goal){return goal>0?Math.round(spent/goal*100):0}
function ringHtml(date,prefix='today'){const s=spentDate(date),g=dailyGoal(date).total,rate=goalRate(s,g),circ=2*Math.PI*60,p=clamp(rate,0,100),offset=circ*(1-p/100),y=addDays(date,-1),ys=spentDate(y),yg=dailyGoal(y).total,yr=goalRate(ys,yg),hasGoal=g>0;return `<div class="hero today-goal-hero"><button class="today-spend-tap" id="${prefix}Hero" type="button"><div class="daily-goal"><div class="ring"><svg viewBox="0 0 154 154"><circle class="track" cx="77" cy="77" r="60"></circle><circle class="progress ${rate>100?'over':''}" cx="77" cy="77" r="60" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"></circle></svg><div class="ring-center"><div class="ring-amount">${yen(s)}</div><div class="ring-caption">${date===ymd()?"今日":"この日"}使った金額</div></div></div><div><div class="goal-side-title">目標金額</div><div class="goal-side-value">${hasGoal?yen(g):'未設定'}</div><div class="goal-rate ${rate>100?'red':rate>=80?'orange':'green'}">${hasGoal?`${rate}%`:'—'}</div><div class="compare-mini">昨日 ${yen(ys)}<br>目標 ${yg?yen(yg):'未設定'} / ${yg?yr+'%':'—'}</div></div></div></button><button type="button" class="goal-plan-action" id="${prefix}GoalAction"><span>${hasGoal?'目標を見直す':'目標をつくる'}</span><span>›</span></button></div>`}
function categoryCards(date){const actual=spentDate(date),raw=rawSpentDate(date),correction=actual-raw,total=Math.max(1,Math.abs(actual)),g=dailyGoal(date),cards=data.categories.map(c=>{const v=dailyCategorySpent(date,c.name),goal=Number(g.categories[c.name])||0,pct=goal?clamp(Math.abs(v)/Math.max(1,goal)*100,0,100):clamp(Math.abs(v)/total*100,0,100);return `<button class="cat-card" data-cat="${esc(c.name)}"><div class="cat-top"><div class="cat-name">${categoryIconHtml(c)}<span>${esc(c.name)}</span></div><div class="cat-amount">${yen(v)}</div></div><div class="mini-bar"><div class="mini-fill" style="width:${pct}%;background:${c.color}"></div></div><div class="cat-share">${goal?`目標 ${yen(goal)}・${Math.round(v/Math.max(1,goal)*100)}%`:`構成比 ${Math.round(Math.abs(v)/total*100)}%`}</div></button>`});if(correction)cards.push(`<div class="cat-card"><div class="cat-top"><div class="cat-name"><span class="cat-icon" style="background:var(--fill2);color:var(--label2)">${icon('adjust')}</span><span>修正差額</span></div><div class="cat-amount ${correction>0?'red':'green'}">${correction>0?'+':''}${yen(correction)}</div></div><div class="cat-share">実質支出と記録上支出の差</div></div>`);return `<div class="category-grid">${cards.join('')}</div>`}function monthCategoryList(month){const actual=spentMonth(month),raw=rawSpentMonth(month),correction=actual-raw,total=Math.max(1,Math.abs(actual));const rows=data.categories.map(c=>{const v=monthCategorySpent(month,c.name),pct=Math.round(Math.abs(v)/total*100);return `<button type="button" class="row press" data-month-cat="${esc(c.name)}">${categoryIconHtml(c,'settings-icon')}<div class="row-main"><div class="row-title">${esc(c.name)}</div><div class="row-sub">構成比 ${pct}%</div></div><div class="row-value">${yen(v)}</div><span class="chev">›</span></button>`});if(correction)rows.push(`<div class="row"><div class="settings-icon" style="background:var(--fill2);color:var(--label2)">${icon('adjust')}</div><div class="row-main"><div class="row-title">修正差額</div><div class="row-sub">記録上 ${yen(raw)} → 実質 ${yen(actual)}</div></div><div class="row-value ${correction>0?'red':'green'}">${correction>0?'+':''}${yen(correction)}</div></div>`);return `<div class="group">${rows.join('')}</div>`}

function todayIncomeHtml(date){const list=incomesForDate(date);if(!list.length)return `<div class="group"><div class="row income-empty-row"><div class="row-main"><div class="row-title">記録はありません</div></div></div></div>`;return `<div class="group">${list.map(x=>`<div class="row">${settingsIconHtml('wallet','var(--green)')}<div class="row-main"><div class="row-title">${esc(x.sourceName)}</div><div class="row-sub">${x.kind==='salary'?'給与':'臨時収入'}・${x.toType==='bank'?esc(bankById(x.bankId)?.name||'銀行口座'):'未入金・手持ち'}</div></div><div class="row-value green">+${yen(x.amount)}</div></div>`).join('')}</div>`}
function openDailyCorrectionDetail(date=trackingDate){const raw=rawSpentDate(date),actual=spentDate(date),delta=actual-raw,corrected=data.dailyCorrections[date]!=null;openSheet(`<div class="sheet-nav"><button class="nav-text" id="dcClose">閉じる</button><div class="sheet-title">実質使った金額</div><span style="min-width:64px"></span></div><div class="sheet-body"><div class="group"><div class="row"><div class="row-main"><div class="row-title">自動集計</div></div><div class="row-value">${yen(raw)}</div></div><div class="row"><div class="row-main"><div class="row-title">実質金額</div></div><div class="row-value">${yen(actual)}</div></div><div class="row"><div class="row-main"><div class="row-title">修正差額</div></div><div class="row-value ${delta>0?'red':delta<0?'green':''}">${delta>0?'+':''}${yen(delta)}</div></div></div><button class="primary" id="dcEdit">実質金額を修正</button>${corrected?'<button class="secondary" id="dcReset" style="margin-top:9px">自動集計に戻す</button>':''}</div>`,'half',()=>{document.getElementById('dcClose').onclick=requestSheetClose;document.getElementById('dcEdit').onclick=()=>openCalculator('実質使った金額',actual,v=>{try{safeCommit(()=>{data.dailyCorrections[date]=v},{label:'daily correction edit'})}catch(e){return}closeSheet();renderAll()});document.getElementById('dcReset')?.addEventListener('click',()=>{try{safeCommit(()=>{delete data.dailyCorrections[date]},{label:'daily correction reset'})}catch(e){return}closeSheet();renderAll()})})}
let openMailOverview;

