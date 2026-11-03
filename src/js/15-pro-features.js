(function installInformationArchitecture(){
 let changed=false;
 if(!['today','month'].includes(data.homeViewMode)){data.homeViewMode='today';changed=true}
 if(!Array.isArray(data.sidebarFavorites)){data.sidebarFavorites=[];changed=true}
 if(!Array.isArray(data.sidebarFavoriteOrder)){data.sidebarFavoriteOrder=[...data.sidebarFavorites];changed=true}
 if(!Array.isArray(data.tags)){data.tags=[];changed=true}
 if(!data.favoriteTagMap||typeof data.favoriteTagMap!=='object'||Array.isArray(data.favoriteTagMap)){data.favoriteTagMap={};changed=true}
 if(!['recommended','many','minimal'].includes(data.notificationSettings?.level)){data.notificationSettings={...(data.notificationSettings||{}),level:'recommended'};changed=true}
 for(const list of [data.banks,data.cards,data.debitCards,data.employers,data.fixedPayments,data.largeExpensePlans])for(const x of list){if(!Array.isArray(x.tagIds)){x.tagIds=[];changed=true}}
 tabScrollPositions.payments=Number(tabScrollPositions.payments)||0;
 // Boot persists the final normalized state once, after all startup migrations.
})();


const starSvg=()=>'<svg viewBox="0 0 24 24"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2 7.5 14 3 9.6l6.2-.9z"/></svg>';

function paymentHomeMonth(){return assetBillingMonth||ym()}
function favoriteOrder(){const selected=new Set(data.sidebarFavorites||[]),ordered=(data.sidebarFavoriteOrder||[]).filter(k=>selected.has(k));for(const k of selected)if(!ordered.includes(k))ordered.push(k);return ordered.slice(0,8)}
function isFavorite(key){return (data.sidebarFavorites||[]).includes(key)}
function saveFavoriteOrder(order){try{safeCommit(()=>{data.sidebarFavoriteOrder=[...order];data.sidebarFavorites=[...order]},{label:'favorite order'});return true}catch(e){return false}}
function toggleFavorite(key){if(!key)return false;const list=[...(data.sidebarFavorites||[])],i=list.indexOf(key);if(i>=0)list.splice(i,1);else{if(list.length>=8){showToast('お気に入りは8件までです');return false}list.push(key)}try{safeCommit(()=>{data.sidebarFavorites=list;data.sidebarFavoriteOrder=[...(data.sidebarFavoriteOrder||[]).filter(x=>list.includes(x)),...list.filter(x=>!(data.sidebarFavoriteOrder||[]).includes(x))]},{label:'favorite toggle'});return true}catch(e){return false}}
function shortcutInfo(key){
 const staticMap={
  acf:{label:'ACF',icon:'chart',open:()=>openAcf()},quickExpense:{label:'クイック支出入力',icon:'plus',open:()=>openQuickExpense(ymd())},quickBank:{label:'銀行残高更新',icon:'bank',open:()=>openQuickBank()},cardBilling:{label:'カード請求額更新',icon:'card',open:()=>{switchTab('payments');setTimeout(()=>openQuickCardBilling(paymentHomeMonth()),50)}},planner:{label:'月間Planner',icon:'target',open:()=>{try{safeCommit(()=>{data.homeViewMode='month'},{label:'planner shortcut'})}catch(e){return}switchTab('month');setTimeout(()=>openMonthlyGoalPlanner(currentMonth),50)}},salary:{label:'給与',icon:'briefcase',open:()=>switchTab('pay')},fixed:{label:'固定支払い',icon:'repeat',open:()=>{switchTab('payments');setTimeout(()=>scrollPaymentSection('fixed'),60)}},large:{label:'大型支出',icon:'ticket',open:()=>{switchTab('payments');setTimeout(()=>scrollPaymentSection('large'),60)}},gmail:{label:'Gmail取引',icon:'mail',open:()=>openMailOverview()},transactions:{label:'取引一覧',icon:'list',open:()=>openTransactionList({month:paymentHomeMonth(),title:`${monthLabel(paymentHomeMonth())}の支払い`})},assetTrend:{label:'資産推移',icon:'chart',open:()=>{switchTab('assets');setTimeout(()=>document.getElementById('assetTrendSection')?.scrollIntoView({behavior:'smooth'}),60)}}
 };
 if(staticMap[key])return{key,...staticMap[key]};
 let m=String(key||'').match(/^(bank|card|debit|employer):(.+)$/);if(!m)return null;const [_,type,id]=m;
 if(type==='bank'){const x=bankById(id);return x?{key,label:x.name,icon:'bank',open:()=>openBankDetail(id)}:null}
 if(type==='card'){const x=cardById(id);return x?{key,label:x.name,icon:'card',open:()=>openCardDetail(id,paymentHomeMonth())}:null}
 if(type==='debit'){const x=debitById(id);return x?{key,label:x.name,icon:'wallet',open:()=>openDebitDetail(id)}:null}
 if(type==='employer'){const x=employerById(id);return x?{key,label:x.name,icon:'briefcase',open:()=>openEmployerDetail(id)}:null}
 return null
}
function favoriteKeyForView(title){if(title==='ACF')return'acf';if(['メール取引履歴','メール取引の詳細','メール取引を確認'].includes(title))return'';if(title==='メール取引'||title==='メール取引センター')return'gmail';if(title==='大型支出計画')return'large';if(title==='取引一覧'||title==='取引詳細')return'transactions';const b=data.banks.find(x=>x.name===title);if(b)return`bank:${b.id}`;const c=data.cards.find(x=>x.name===title);if(c)return`card:${c.id}`;const d=data.debitCards.find(x=>x.name===title);if(d)return`debit:${d.id}`;const e=data.employers.find(x=>x.name===title);if(e)return`employer:${e.id}`;return''}
function openFavorite(key){const info=shortcutInfo(key);if(!info){showToast('このお気に入りは現在利用できません');return}if(pushStack.at(-1)?.title==='お気に入り')popView();setTimeout(()=>info.open(),40)}

function tagById(id){return (data.tags||[]).find(t=>t.id===id)}
function taggableItems(){const items=[];for(const key of favoriteOrder()){const f=shortcutInfo(key);if(f)items.push({ref:`favorite:${key}`,label:f.label,kind:'お気に入り',icon:f.icon})}for(const b of data.banks)items.push({ref:`bank:${b.id}`,label:b.name,kind:'銀行',icon:'bank'});for(const c of data.cards)items.push({ref:`card:${c.id}`,label:c.name,kind:'カード',icon:'card'});for(const e of data.employers)items.push({ref:`employer:${e.id}`,label:e.name,kind:'勤務先',icon:'briefcase'});for(const f of data.fixedPayments)items.push({ref:`fixed:${f.id}`,label:f.name,kind:'固定支払い',icon:'repeat'});for(const p of data.largeExpensePlans)items.push({ref:`large:${p.id}`,label:p.name,kind:'大型支出',icon:'ticket'});return items}
function tagsForRef(ref){const raw=String(ref),i=raw.indexOf(':'),type=i<0?raw:raw.slice(0,i),id=i<0?'':raw.slice(i+1);if(type==='favorite')return Array.isArray(data.favoriteTagMap[id])?data.favoriteTagMap[id]:[];const map={bank:data.banks,card:data.cards,employer:data.employers,fixed:data.fixedPayments,large:data.largeExpensePlans};const x=(map[type]||[]).find(v=>v.id===id);return Array.isArray(x?.tagIds)?x.tagIds:[]}
function setTagsForRef(ref,ids){const raw=String(ref),i=raw.indexOf(':'),type=i<0?raw:raw.slice(0,i),id=i<0?'':raw.slice(i+1);ids=[...new Set(ids)];if(type==='favorite'){data.favoriteTagMap[id]=ids;return}const map={bank:data.banks,card:data.cards,employer:data.employers,fixed:data.fixedPayments,large:data.largeExpensePlans};const x=(map[type]||[]).find(v=>v.id===id);if(x)x.tagIds=ids}
function toggleTagForRef(ref,tagId){try{safeCommit(()=>{const set=new Set(tagsForRef(ref));set.has(tagId)?set.delete(tagId):set.add(tagId);setTagsForRef(ref,[...set])},{label:'tag toggle'});return true}catch(e){return false}}
function openTaggableRef(ref){const raw=String(ref),i=raw.indexOf(':'),type=i<0?raw:raw.slice(0,i),id=i<0?'':raw.slice(i+1);if(type==='favorite')return openFavorite(id);if(type==='bank')return openBankDetail(id);if(type==='card')return openCardDetail(id,paymentHomeMonth());if(type==='employer')return openEmployerDetail(id);if(type==='fixed'){const x=data.fixedPayments.find(v=>v.id===id);if(x)return openFixedPayment(x)}if(type==='large')return openLargeExpenseDetail(id)}











function openFavoritesEditor(){const catalog=['acf','quickExpense','quickBank','cardBilling','planner','salary','fixed','large','gmail','transactions','assetTrend'];const draw=()=>{const selected=favoriteOrder(),available=catalog.map(shortcutInfo).filter(Boolean);const html=`<div class="form-group-title">お気に入り・最大8件</div>${selected.length?`<div class="group" id="favSortList">${selected.map(k=>{const f=shortcutInfo(k);return f?`<div class="row fav-editor-row" data-fav-row="${esc(k)}"><button type="button" class="favorite-open" data-fav-open="${esc(k)}"><span class="shortcut-symbol">${icon(f.icon)}</span><span class="row-main"><span class="row-title">${esc(f.label)}</span></span></button><button type="button" class="fav-grip" data-fav-grip="${esc(k)}" aria-label="${esc(f.label)}を並び替え">≡</button><button type="button" class="mini-action danger" data-fav-remove="${esc(k)}">削除</button></div>`:''}).join('')}</div>`:'<div class="empty">お気に入りはまだありません。</div>'}<div class="section-head">追加できるショートカット</div><div class="group">${available.map(f=>`<button type="button" class="row press" data-fav-toggle="${f.key}"><span class="shortcut-symbol">${icon(f.icon)}</span><div class="row-main"><div class="row-title">${esc(f.label)}</div></div><span class="blue">${isFavorite(f.key)?'追加済み':'追加'}</span></button>`).join('')}</div>`;if(pushStack.length&&pushStack[pushStack.length-1]?.title==='お気に入り')replaceTopPush('お気に入り',html,bind);else pushView('お気に入り',html,bind);function bind(root){root.querySelectorAll('[data-fav-open]').forEach(b=>b.onclick=()=>openFavorite(b.dataset.favOpen));root.querySelectorAll('[data-fav-toggle]').forEach(b=>b.onclick=()=>{toggleFavorite(b.dataset.favToggle);draw()});root.querySelectorAll('[data-fav-remove]').forEach(b=>b.onclick=()=>{toggleFavorite(b.dataset.favRemove);draw()});bindFavoriteDrag(root,draw)}};draw()}
function bindFavoriteDrag(root,redraw){root.querySelectorAll('[data-fav-grip]').forEach(grip=>{let key='',target='';const down=e=>{key=grip.dataset.favGrip;target=key;grip.setPointerCapture?.(e.pointerId);grip.closest('[data-fav-row]')?.classList.add('dragging');e.preventDefault()},move=e=>{if(!key)return;const row=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-fav-row]');if(row)target=row.dataset.favRow},up=()=>{if(!key)return;const order=favoriteOrder(),from=order.indexOf(key),to=order.indexOf(target);if(from>=0&&to>=0&&from!==to){order.splice(from,1);order.splice(to,0,key);saveFavoriteOrder(order)}key='';target='';redraw()};grip.addEventListener('pointerdown',down);grip.addEventListener('pointermove',move);grip.addEventListener('pointerup',up);grip.addEventListener('pointercancel',up)})}

function openTagsManager(){const draw=()=>{const html=`<div class="group">${data.tags.length?data.tags.map(t=>`<button type="button" class="row press" data-tag-edit="${t.id}"><span class="tag-dot" style="background:${esc(t.color)}"></span><div class="row-main"><div class="row-title">${esc(t.name)}</div><div class="row-sub">${taggableItems().filter(x=>tagsForRef(x.ref).includes(t.id)).length}項目</div></div><span class="chev">›</span></button>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">タグはまだありません</div><div class="row-sub">旅行・バイト・固定費など、自分の整理方法で作れます。</div></div></div>'}</div><button type="button" class="primary" id="tagAdd">新しいタグ</button>`;if(pushStack.length&&pushStack[pushStack.length-1]?.title==='タグ')replaceTopPush('タグ',html,bind);else pushView('タグ',html,bind);function bind(root){root.querySelectorAll('[data-tag-edit]').forEach(b=>b.onclick=()=>openTagItems(b.dataset.tagEdit));root.querySelector('#tagAdd').onclick=()=>openTagEdit(null,draw)}};draw()}
function openTagEdit(existing=null,after=null){let color=existing?.color||'#007AFF';openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="tagCancel">キャンセル</button><div class="sheet-title">${existing?'タグを編集':'新しいタグ'}</div><button type="button" class="nav-text bold" id="tagSave">保存</button></div><div class="sheet-body"><div class="form-card"><div class="form-section"><div class="form-label">名前</div><input class="field" id="tagName" value="${esc(existing?.name||'')}" placeholder="例：旅行"></div><div class="form-section"><div class="form-label">カラー</div><input class="field" id="tagColor" type="color" value="${esc(color)}"></div></div>${existing?'<button type="button" class="secondary danger" id="tagDelete">このタグを削除</button>':''}</div>`,'half',root=>{root.querySelector('#tagCancel').onclick=requestSheetClose;root.querySelector('#tagSave').onclick=()=>{const name=root.querySelector('#tagName').value.trim(),color=root.querySelector('#tagColor').value;if(!name)return showAlert('タグ名を入力してください','名前は必須です。');const btn=root.querySelector('#tagSave');runSaveAction(btn,()=>{if(existing)Object.assign(existing,{name,color});else data.tags.push({id:uid('tag'),name,color})},{render:false,label:'tag save',success:'タグを保存しました',close:()=>{closeSheet();after?.();renderAll()}})};root.querySelector('#tagDelete')?.addEventListener('click',async()=>{if(!await showAlert('タグを削除しますか？','タグだけを削除し、元のカードや銀行などは削除しません。',{destructive:true,okText:'削除'}))return;const btn=root.querySelector('#tagDelete');runSaveAction(btn,()=>{data.tags=data.tags.filter(t=>t.id!==existing.id);for(const item of taggableItems()){const ids=tagsForRef(item.ref).filter(id=>id!==existing.id);setTagsForRef(item.ref,ids)}},{render:false,label:'tag delete',success:'タグを削除しました',close:()=>{closeSheet();popView();renderAll()}})})})}
function openTagItems(id){const tag=tagById(id);if(!tag)return;const draw=()=>{const items=taggableItems().filter(x=>tagsForRef(x.ref).includes(id)),html=`<div class="hero simple-hero"><div class="tag-chip-row"><span class="tag-dot" style="background:${esc(tag.color)}"></span><div><div class="hero-kicker">タグ</div><div class="row-title" style="font-size:22px">${esc(tag.name)}</div></div></div></div>${items.length?`<div class="group">${items.map(x=>`<button type="button" class="row press" data-tag-open="${esc(x.ref)}"><span class="shortcut-symbol">${icon(x.icon)}</span><div class="row-main"><div class="row-title">${esc(x.label)}</div><div class="row-sub">${esc(x.kind)}</div></div><span class="chev">›</span></button>`).join('')}</div>`:'<div class="empty">このタグの項目はまだありません。</div>'}<button type="button" class="primary" id="tagAssign">項目を追加・編集</button><button type="button" class="secondary" id="tagRename" style="margin-top:9px">タグ名・色を編集</button>`;if(pushStack.length&&pushStack[pushStack.length-1]?.title===tag.name)replaceTopPush(tag.name,html,bind);else pushView(tag.name,html,bind);function bind(root){root.querySelectorAll('[data-tag-open]').forEach(b=>b.onclick=()=>openTaggableRef(b.dataset.tagOpen));root.querySelector('#tagAssign').onclick=()=>openTagAssignment(id,draw);root.querySelector('#tagRename').onclick=()=>openTagEdit(tag,draw)}};draw()}
function openTagAssignment(tagId,after){const tag=tagById(tagId);if(!tag)return;const items=taggableItems();openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="taClose">完了</button><div class="sheet-title">${esc(tag.name)}</div><span style="min-width:64px"></span></div><div class="sheet-body"><div class="form-helper">お気に入り・カード・銀行・勤務先・固定支払い・大型支出にタグを付けられます。</div><div class="group">${items.map(x=>`<button type="button" class="row press" data-ta-ref="${esc(x.ref)}"><span class="shortcut-symbol">${icon(x.icon)}</span><div class="row-main"><div class="row-title">${esc(x.label)}</div><div class="row-sub">${esc(x.kind)}</div></div><span class="shortcut-check">${tagsForRef(x.ref).includes(tagId)?icon('check'):''}</span></button>`).join('')}</div></div>`,'full',root=>{root.querySelector('#taClose').onclick=()=>{closeSheet();after?.();renderAll()};root.querySelectorAll('[data-ta-ref]').forEach(b=>b.onclick=()=>{toggleTagForRef(b.dataset.taRef,tagId);b.querySelector('.shortcut-check').innerHTML=tagsForRef(b.dataset.taRef).includes(tagId)?icon('check'):''})})}

const __basePushView=pushView;
pushView=function(title,html,binder,right='',backOverride=null){const tabLabels={today:'今日',month:'今月',pay:'給与',payments:'支払い',assets:'資産',settings:'設定'};if(!backOverride&&!pushStack.length)backOverride=tabLabels[activeTab]||'戻る';const v=__basePushView(title,html,binder,right,backOverride),key=favoriteKeyForView(title);if(key){const area=v.querySelector('.push-right'),btn=document.createElement('button');btn.type='button';btn.className='favorite-nav-btn '+(isFavorite(key)?'on':'');btn.setAttribute('aria-label',isFavorite(key)?'お気に入りから削除':'お気に入りに追加');btn.innerHTML=starSvg();btn.onclick=()=>{toggleFavorite(key);btn.classList.toggle('on',isFavorite(key));btn.setAttribute('aria-label',isFavorite(key)?'お気に入りから削除':'お気に入りに追加');feedback.selection()};area.appendChild(btn)}return v};

const __baseRenderToday=renderToday,__baseRenderMonth=renderMonth;
function removeRenderedSection(container,label){const heads=[...container.querySelectorAll('.section-head')],h=heads.find(x=>x.textContent.trim()===label);if(!h)return;const next=h.nextElementSibling;h.remove();next?.remove()}

renderToday=function(){__baseRenderToday();const content=document.getElementById('todayContent');removeRenderedSection(content,'本日の収入');removeRenderedSection(content,'メール取引');const evt=nextFinancialEvent();if(evt?.type==='income'){const card=content.querySelector('#nextMoneyEvent');if(card){card.classList.add('home-marker-only');const val=card.querySelector('.financial-event-value');if(val)val.textContent='入金日'}}updateHomeTabButton()};
renderMonth=function(){__baseRenderMonth();const content=document.getElementById('monthContent');removeRenderedSection(content,'今月の収入');removeRenderedSection(content,'大型支出計画');removeRenderedSection(content,'メール取引');updateHomeTabButton()};

function salaryMonthRows(month){return salaryRecordsPayableInMonth(month).sort((a,b)=>String(salaryRecordEffectiveDate(a)||a.date||'').localeCompare(String(salaryRecordEffectiveDate(b)||b.date||'')))}



function fixedScheduledInMonth(month){return data.fixedPayments.map(f=>({f,dates:fixedDueDatesInMonth(f,month).filter(d=>!(f.skippedDates||[]).includes(d))})).filter(x=>x.dates.length)}
function scrollPaymentSection(id){document.getElementById(`paymentsSection-${id}`)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})}










function updateHomeTabButton(){const b=document.getElementById('homeTab');if(b)b.querySelector('.tab-label').textContent='今日'}



/* === Part 3 / Pro 1-6 core === */
function pro3DateRange(start,days){return Array.from({length:Math.max(1,days)},(_,i)=>addDays(start,i))}
function pro3BankForecast(bankId,days=60,{extraPlan=null}={}){const bank=bankById(bankId);if(!bank)return null;const start=ymd(),end=addDays(start,days-1),dates=pro3DateRange(start,days),map=new Map(dates.map(d=>[d,{date:d,income:0,outflow:0,transfer:0,events:[]} ]));const add=(date,delta,label,type='other')=>{const r=map.get(date);if(!r)return;if(delta>=0)r.income+=delta;else r.outflow+=-delta;if(type==='transfer')r.transfer+=delta;r.events.push({label,amount:delta,type})};
 for(const r of data.salaryRecords){if(r.status==='入金済'||r.date<start||r.date>end)continue;const e=employerById(r.employerId);if(e?.bankId===bankId)add(r.date,Math.max(0,Number(r.gross)||0),`${e.name} 給与`,'salary')}
 for(const f of data.fixedPayments){if(f.paymentMethod==='card')continue;const bid=paymentBankId(f.paymentMethod,f.paymentId);if(bid!==bankId)continue;for(const d of dates){if(!fixedDueOn(f,d)||(f.skippedDates||[]).includes(d))continue;if(data.transactions.some(t=>t.source==='fixed'&&t.fixedId===f.id&&t.date===d))continue;add(d,-Math.max(0,Number(f.amount)||0),f.name||'固定支払い','fixed')}}
 for(const e of getCardPaymentEvents(start,end)){const c=cardById(e.cardId);if(c?.bankId===bankId&&e.status!=='paid')add(e.date,-Math.max(0,Number(e.amount)||0),`${e.cardName} 引落`,'card')}
 for(const p of data.largeExpensePlans){if(p.status!=='planned'||p.priority!=='required'||p.date<start||p.date>end)continue;for(const part of largeExpensePendingParts(p)){if(part.paymentMethod==='card')continue;const bid=part.linkedBankId||paymentBankId(part.paymentMethod,part.paymentId);if(bid===bankId)add(p.date,-Math.max(0,Number(part.amount)||0),p.name||'大型支出','large')}}
 const plans=[...(data.transferPlans||[])];if(extraPlan)plans.push(extraPlan);for(const p of plans){if(p.status!=='planned'||p.date<start||p.date>end)continue;if(p.fromBankId===bankId)add(p.date,-p.amount,`振替 → ${bankById(p.toBankId)?.name||'別口座'}`,'transfer');if(p.toBankId===bankId)add(p.date,p.amount,`振替 ← ${bankById(p.fromBankId)?.name||'別口座'}`,'transfer')}
 let bal=Number(bank.balance)||0,min=bal,minDate=start;const rows=dates.map(d=>{const r=map.get(d),opening=bal;bal+=r.income-r.outflow;if(bal<min){min=bal;minDate=d}return {...r,openingBalance:opening,forecastBalance:bal}});return{bank,start,end,rows,minBalance:min,minDate,endBalance:bal,shortage:Math.max(0,-min)}}
function pro3AllForecast(days=30){const f=buildCashFlowForecast({horizonEnd:addDays(ymd(),days-1)});return{scope:'all',label:'全口座',rows:f.rows.map(r=>({date:r.date,openingBalance:r.openingBalance,forecastBalance:r.forecastBalance,income:r.income,outflow:(r.mandatoryOutflow||0)+(r.flexibleCardDue||0)+(r.flexibleCash||0),events:r.events||[]})),minBalance:f.minForecastBalance,minDate:f.minForecastDate,endBalance:f.endForecast,reserveFloor:f.reserveFloor,source:f}}
function pro3ForecastChartHtml(points,floor=0){if(points.length<2)return '<div class="pro-chart-empty">予測できる期間がありません。</div>';const w=350,h=210,l=4,r=47,t=14,b=25,vals=points.map(x=>Number(x.value)||0).concat([Number(floor)||0]),lo0=Math.min(...vals),hi0=Math.max(...vals),padv=Math.max(1,(hi0-lo0)*.12),lo=lo0-padv,hi=hi0+padv,range=hi-lo||1,pw=w-l-r,ph=h-t-b,xy=points.map((p,i)=>({x:l+i*pw/Math.max(1,points.length-1),y:t+(hi-p.value)/range*ph,...p})),line=xy.map((p,i)=>(i?'L':'M')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' '),area=`${line} L${xy.at(-1).x.toFixed(1)},${t+ph} L${xy[0].x.toFixed(1)},${t+ph} Z`,fy=t+(hi-floor)/range*ph,ticks=[0,.33,.66,1].map(q=>hi-q*range),grid=[0,.33,.66,1].map(q=>t+q*ph);return `<div class="pro3-fchart" data-pro3-chart><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="残高予測グラフ">${grid.map(y=>`<line class="pro3-fgrid" x1="${l}" x2="${l+pw}" y1="${y}" y2="${y}"/>`).join('')}<path class="pro3-ffill" d="${area}"/><path class="pro3-fline" d="${line}"/>${floor>0?`<line class="pro3-ffloor" x1="${l}" x2="${l+pw}" y1="${fy}" y2="${fy}"/>`:''}${xy.map((p,i)=>`<circle class="${i===0?'pro3-factual':'pro3-fpoint'}" data-pro3-point="${i}" cx="${p.x}" cy="${p.y}" r="${i===0?'4':'2.7'}"/>`).join('')}<text class="pro3-faxis" x="${l}" y="${h-4}">${esc(points[0].date.slice(5))}</text><text class="pro3-faxis" text-anchor="end" x="${l+pw}" y="${h-4}">${esc(points.at(-1).date.slice(5))}</text>${ticks.map((v,i)=>`<text class="pro3-faxis" x="${l+pw+4}" y="${grid[i]+3}">${esc(compactMoney(v))}</text>`).join('')}</svg><div class="pro3-freadout" data-pro3-readout><span>期間末の予測残高</span><strong>${yen(points.at(-1).value)}</strong></div></div>`}
function bindPro3ForecastChart(root,points){const box=root.querySelector('[data-pro3-chart]'),svg=box?.querySelector('svg'),read=box?.querySelector('[data-pro3-readout]'),dots=box?[...box.querySelectorAll('[data-pro3-point]')]:[];if(!svg||points.length<2)return;let active=false;const choose=e=>{const rect=svg.getBoundingClientRect(),x=clamp(e.clientX-rect.left,0,rect.width),idx=Math.round(x/Math.max(1,rect.width)*(points.length-1)),p=points[idx],dot=dots[idx];if(!p||!dot)return;dots.forEach((d,i)=>d.setAttribute('r',i===idx?'4.4':i===0?'4':'2.7'));read.innerHTML=`<span>${esc(dayLabel(p.date))}・予測残高</span><strong>${yen(p.value)}</strong>`};svg.addEventListener('pointerdown',e=>{active=true;svg.setPointerCapture?.(e.pointerId);choose(e)});svg.addEventListener('pointermove',e=>{if(!active)return;if(Math.abs(e.movementY||0)>Math.abs(e.movementX||0)*1.4){active=false;return}choose(e);e.preventDefault()});['pointerup','pointercancel'].forEach(n=>svg.addEventListener(n,()=>active=false))}
function openMoneyTimeline(days=30,scope='all'){pushView('お金のタイムライン','',root=>{const draw=()=>{const body=root.querySelector('.push-body'),all=scope==='all',f=all?pro3AllForecast(days):pro3BankForecast(scope,days),rows=f?.rows||[],floor=all?(f.reserveFloor||0):Math.max(0,Number(f?.bank?.threshold)||0),min=Number(f?.minBalance)||0,minDate=f?.minDate||ymd(),end=Number(f?.endBalance)||0,points=rows.map((r,i)=>({date:r.date,value:i===0?Number(r.openingBalance??r.forecastBalance):r.forecastBalance})),important=rows.filter((r,i)=>i===0||i===rows.length-1||r.income>0||r.outflow>0||r.events?.length||r.forecastBalance<floor);body.innerHTML=`<div class="pro3-toolbar">${[30,60,90].map(d=>`<button type="button" class="pro3-chip ${days===d?'on':''}" data-timeline-days="${d}">${d}日</button>`).join('')}<select class="pro3-select" id="timelineScope"><option value="all">全口座合計</option>${data.banks.map(b=>`<option value="${b.id}" ${scope===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></div><div class="pro3-forecast-card"><div class="pro3-forecast-head"><div><div class="hero-kicker">${all?'全口座の生活資金':esc(f.bank.name)}</div><div class="pro3-forecast-value ${min<floor?'red':''}">${yen(min)}</div><div class="pro3-forecast-note">${dayLabel(minDate)}の最低予測残高${floor?`・確保ライン ${yen(floor)}`:''}</div></div><span class="status-chip ${min<floor?'warning':'good'}">${min<floor?'不足見込み':'範囲内'}</span></div><div class="pro3-legend"><span><i></i>現在値</span><span><i class="forecast"></i>予測</span>${floor?'<span><i class="floor"></i>確保ライン</span>':''}</div>${pro3ForecastChartHtml(points,floor)}</div><div class="pro3-recon-summary"><div><span>現在</span><strong>${yen(points[0]?.value??0)}</strong></div><div><span>${days}日後</span><strong>${yen(end)}</strong></div><div><span>最低残高</span><strong class="${min<floor?'red':''}">${yen(min)}</strong></div></div><div class="section-head">重要な日</div><div class="pro3-event-list">${important.length?important.slice(0,50).map(r=>{const delta=(Number(r.income)||0)-(Number(r.outflow)||0),txt=(r.events||[]).map(e=>e.label).join('・')||(r.date===ymd()?'現在':'予測');return `<button type="button" class="row press" data-timeline-day="${r.date}"><div class="row-main"><div class="row-title">${esc(txt)}</div><div class="row-sub">${dayLabel(r.date)}・終了 ${yen(r.forecastBalance)}</div></div><div class="row-value ${delta>0?'green':delta<0?'red':''}">${delta?`${delta>0?'+':'−'}${yen(Math.abs(delta))}`:yen(r.forecastBalance)}</div><span class="chev">›</span></button>`}).join(''):'<div class="row"><div class="row-main"><div class="row-title">この期間の予定はありません</div></div></div>'}</div>${!all?`<button type="button" class="secondary" id="timelineTransfer" style="margin-top:12px">この口座の引落準備・振替計画</button>`:''}<div class="hero-sub" style="margin-top:10px">現在の登録残高を起点にした端末内の試算です。未確認請求・未登録の入出金は含まれません。</div>`;bindPro3ForecastChart(body,points);body.querySelectorAll('[data-timeline-days]').forEach(b=>b.onclick=()=>{days=Number(b.dataset.timelineDays);draw()});body.querySelector('#timelineScope').onchange=e=>{scope=e.target.value;draw()};body.querySelectorAll('[data-timeline-day]').forEach(b=>b.onclick=()=>{if(scope==='all')openFinancialDayInspector(b.dataset.timelineDay);else openBankForecastDay(scope,b.dataset.timelineDay,days)});body.querySelector('#timelineTransfer')?.addEventListener('click',()=>openBankWithdrawalPrep(scope))};draw()})}
function openBankForecastDay(bankId,date,days=60){const f=pro3BankForecast(bankId,days),r=f?.rows.find(x=>x.date===date);if(!r)return;pushView('口座の資金詳細',`<div class="hero"><div class="hero-kicker">${dayLabel(date)}</div><div class="hero-value">${yen(r.forecastBalance)}</div><div class="hero-sub">${esc(f.bank.name)}・終了予測残高</div></div><div class="group"><div class="row"><div class="row-main"><div class="row-title">開始残高</div></div><div class="row-value">${yen(r.openingBalance)}</div></div><div class="row"><div class="row-main"><div class="row-title">入金予定</div></div><div class="row-value green">+${yen(r.income)}</div></div><div class="row"><div class="row-main"><div class="row-title">支払い・振替</div></div><div class="row-value red">−${yen(r.outflow)}</div></div></div><div class="section-head">根拠</div><div class="group">${r.events.length?r.events.map(e=>`<div class="row"><div class="row-main"><div class="row-title">${esc(e.label)}</div></div><div class="row-value ${e.amount>=0?'green':'red'}">${e.amount>=0?'+':'−'}${yen(Math.abs(e.amount))}</div></div>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">この日の登録予定はありません</div></div></div>'}</div>`,null)}

function activeSalaryAllocationReserve(date=ymd()){return sum((data.salaryAllocations||[]).filter(x=>{if(x.status!=='active'||(x.validUntil&&x.validUntil<date))return false;const r=data.salaryRecords.find(r=>r.id===x.salaryRecordId);return !!r&&r.status==='入金済'}),x=>Math.max(0,Number(x.buckets?.reserve)||0))}
function salaryAllocationForRecord(id){return (data.salaryAllocations||[]).find(x=>x.salaryRecordId===id&&x.status==='active')||null}
function salaryAllocationRecommendation(record){const amount=salaryRecordCashAmount(record),start=record.actualReceivedDate||record.date||ymd(),future=data.salaryRecords.filter(x=>x.id!==record.id&&salaryRecordEffectiveDate(x)>start).sort((a,b)=>salaryRecordEffectiveDate(a).localeCompare(salaryRecordEffectiveDate(b))),end=future[0]?salaryRecordEffectiveDate(future[0]):addDays(start,30),forecast=buildCashFlowForecast({startDate:start,horizonEnd:end,flexibleBudgetPlan:{}}),payments=Math.min(amount,sum(forecast.rows,r=>Number(r.mandatoryOutflow)||0)),optional=sum(data.largeExpensePlans.filter(p=>p.status==='planned'&&p.priority==='optional'&&p.date>=start&&p.date<=end),p=>p.amount),goals=Math.min(Math.max(0,amount-payments),optional),reserve=Math.min(Math.max(0,amount-payments-goals),Math.max(0,Number(data.acfSettings.reserveFloor)||0)),living=Math.max(0,amount-payments-goals-reserve);return{amount,start,end,payments,goals,reserve,living,nextIncome:future[0]?salaryRecordEffectiveDate(future[0]):''}}
function openSalaryAllocationPicker(){const paid=data.salaryRecords.filter(r=>salaryRecordDisplayStatus(r)==='入金済み').sort((a,b)=>String(salaryRecordEffectiveDate(b)).localeCompare(String(salaryRecordEffectiveDate(a))));if(!paid.length)return showAlert('振り分けできる給与がありません','先に給与の「入金済み」を確認してください。');if(paid.length===1)return openSalaryAllocation(paid[0].id);openSheet(`<div class="sheet-nav"><button class="nav-text" id="allocPickClose">閉じる</button><div class="sheet-title">給与を選ぶ</div><span style="min-width:64px"></span></div><div class="sheet-body"><div class="group">${paid.map(r=>`<button type="button" class="row press" data-alloc-pick="${r.id}"><div class="row-main"><div class="row-title">${esc(employerById(r.employerId)?.name||'給与')}</div><div class="row-sub">${dayLabel(salaryRecordEffectiveDate(r))}・${salaryAllocationForRecord(r.id)?'振り分け済み':'未振り分け'}</div></div><div class="row-value">${yen(salaryRecordCashAmount(r))}</div><span class="chev">›</span></button>`).join('')}</div></div>`,'half',root=>{root.querySelector('#allocPickClose').onclick=requestSheetClose;root.querySelectorAll('[data-alloc-pick]').forEach(b=>b.onclick=()=>{closeSheet();setTimeout(()=>openSalaryAllocation(b.dataset.allocPick),280)})})}
function openSalaryAllocation(recordId){
  const r=data.salaryRecords.find(x=>x.id===recordId);
  if(!r||salaryRecordDisplayStatus(r)!=='入金済み')return showAlert('入金確認が必要です','実際に受け取った給与だけ振り分けできます。');
  const current=salaryAllocationForRecord(recordId),rec=salaryAllocationRecommendation(r),amount=salaryRecordCashAmount(r);
  let buckets=current?{...current.buckets}:{payments:rec.payments,living:rec.living,goals:rec.goals,reserve:rec.reserve};
  openSheet(`<div class="sheet-nav"><button type="button" class="nav-text" id="allocCancel">キャンセル</button><div class="sheet-title">給料日の振り分け</div><button type="button" class="nav-text bold" id="allocSave">保存</button></div><div class="sheet-body"><div class="pro3-allocation"><div class="hero-kicker">${esc(employerById(r.employerId)?.name||'給与')}・受取額</div><div class="pro3-allocation-total">${yen(amount)}</div><div class="hero-sub">${dayLabel(salaryRecordEffectiveDate(r))}${rec.nextIncome?` → 次の入金 ${dayLabel(rec.nextIncome)}`:''}</div><div class="pro3-allocation-grid">${[['payments','カード・固定支払い'],['living','生活費'],['goals','旅行・プレゼント'],['reserve','残しておく額']].map(([k,l])=>`<button type="button" class="pro3-allocation-btn" data-alloc="${k}"><span>${l}</span><strong data-alloc-value="${k}">${yen(buckets[k])}</strong></button>`).join('')}</div><div class="pro3-allocation-ranges">${[['payments','支払い'],['living','生活費'],['goals','目標'],['reserve','残す']].map(([k,l])=>`<label><span>${l}</span><input type="range" min="0" max="${amount}" step="100" data-alloc-range="${k}" value="${buckets[k]}"></label>`).join('')}</div><div class="pro3-allocation-sum" id="allocSum"><span>配分合計 / 未配分</span><strong></strong></div></div><div class="card card-pad"><div class="row-title">この振り分けは残高を動かしません</div><div class="hero-sub">同じ給与残高を「何に使うか」で分ける計画です。カード・固定支払いは登録済み予定から、旅行・プレゼントは任意の大型支出計画から候補額を作っています。</div></div><button type="button" class="secondary" id="allocLivingRest">残りを生活費へ入れる</button>${current?'<button type="button" class="secondary danger" id="allocRelease" style="margin-top:9px">この振り分けを解除</button>':''}</div>`,'full',root=>{
    const sumEl=root.querySelector('#allocSum'),draw=()=>{
      const total=sum(Object.values(buckets)),left=amount-total;
      root.querySelectorAll('[data-alloc-value]').forEach(el=>el.textContent=yen(buckets[el.dataset.allocValue]||0));
      root.querySelectorAll('[data-alloc-range]').forEach(el=>el.value=String(buckets[el.dataset.allocRange]||0));
      sumEl.classList.toggle('over',left<0);
      sumEl.querySelector('strong').textContent=`${yen(total)} / ${left===0?'一致':left>0?`未配分 ${yen(left)}`:`超過 ${yen(-left)}`}`
    };
    root.querySelectorAll('[data-alloc]').forEach(b=>b.onclick=()=>{
      const k=b.dataset.alloc;
      openCalculator(b.querySelector('span').textContent,buckets[k]||0,v=>{
        buckets[k]=v;
        markSheetDirty();
        draw()
      })
    });
    root.querySelectorAll('[data-alloc-range]').forEach(el=>el.oninput=()=>{
      buckets[el.dataset.allocRange]=Number(el.value)||0;
      markSheetDirty();
      feedback.sliderTick();
      draw()
    });
    root.querySelector('#allocLivingRest').onclick=()=>{
      const other=(buckets.payments||0)+(buckets.goals||0)+(buckets.reserve||0);
      buckets.living=Math.max(0,amount-other);
      markSheetDirty();
      feedback.selection();
      draw()
    };
    root.querySelector('#allocCancel').onclick=requestSheetClose;
    root.querySelector('#allocSave').onclick=()=>{
      const total=sum(Object.values(buckets));
      if(Math.abs(total-amount)>.5)return showAlert('配分額が一致していません',total<amount?`${yen(amount-total)} が未配分です。`:`${yen(total-amount)} 超過しています。`);
      try{
        safeCommit(()=>{
          let a=salaryAllocationForRecord(recordId);
          if(a){
            a.receivedAmount=amount;
            a.buckets={...buckets};
            a.validUntil=rec.end;
            a.updatedAt=new Date().toISOString()
          }else data.salaryAllocations.push({id:uid('alloc'),salaryRecordId:recordId,receivedAmount:amount,buckets:{...buckets},status:'active',validUntil:rec.end,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})
        },{render:true,label:'salary allocation'});
        feedback.success();
        showToast('給与の振り分けを保存しました');
        closeSheet()
      }catch(e){
        }
    };
    root.querySelector('#allocRelease')?.addEventListener('click',async()=>{
      if(!await showAlert('振り分けを解除しますか？','給与や銀行残高は変更せず、用途分けだけを解除します。',{okText:'解除'}))return;
      try{
        safeCommit(()=>{
          const a=salaryAllocationForRecord(recordId);
          if(a){
            a.status='released';
            a.updatedAt=new Date().toISOString()
          }
        },{render:true,label:'allocation release'});
        feedback.delete();
        showToast('振り分けを解除しました');
        closeSheet()
      }catch(e){
        }
    });
    draw()
  })
}

function transferPlanSafeToUndo(p){if(!p?.executedAt)return true;const later=(data.assetSnapshots||[]).some(s=>[p.fromBankId,p.toBankId].includes(s.bankId)&&String(s.createdAt||'')>p.executedAt&&!String(s.memo||'').includes(p.id));return !later}
function openTransferPlanEditor(toBankId='',suggested=0,date=ymd()){
  if(data.banks.length<2)return showAlert('銀行口座が足りません','振替計画には2つ以上の銀行口座が必要です');
  let toId=toBankId||data.banks[0]?.id||'',fromId=data.banks.find(b=>b.id!==toId)?.id||'',amount=Math.max(0,Number(suggested)||0),planDate=date;
  openSheet(`<div class="sheet-nav"><button class="nav-text" id="transferCancel">キャンセル</button><div class="sheet-title">振替計画</div><button class="nav-text bold" id="transferSave">保存</button></div><div class="sheet-body"><div class="form-group-title">振替元と振替先</div><div class="form-card"><div class="form-section"><div class="form-label">振替元</div><select class="field field-select" id="transferFrom">${data.banks.map(b=>`<option value="${b.id}" ${b.id===fromId?'selected':''}>${esc(b.name)}・${yen(b.balance)}</option>`).join('')}</select></div><div class="form-section"><div class="form-label">振替先</div><select class="field field-select" id="transferTo">${data.banks.map(b=>`<option value="${b.id}" ${b.id===toId?'selected':''}>${esc(b.name)}・${yen(b.balance)}</option>`).join('')}</select></div><div class="form-section">${moneyButton('transferAmount','金額',amount)}</div><div class="form-section"><div class="form-label">予定日</div><input class="field" id="transferDate" type="date" value="${esc(planDate)}"></div></div><div id="transferCheck"></div><div class="form-helper">この画面は銀行へ送金しません。「実行済みにする」を選んだときだけアプリ内の2口座残高を同額で増減します。</div></div>`,'full',root=>{
    const amt=root.querySelector('#transferAmount'),check=root.querySelector('#transferCheck'),redraw=()=>{
      fromId=root.querySelector('#transferFrom').value;
      toId=root.querySelector('#transferTo').value;
      planDate=root.querySelector('#transferDate').value||ymd();
      const source=pro3BankForecast(fromId,60,{extraPlan:{id:'preview',fromBankId:fromId,toBankId:toId,amount,date:planDate,status:'planned'}}),target=pro3BankForecast(toId,60,{extraPlan:{id:'preview',fromBankId:fromId,toBankId:toId,amount,date:planDate,status:'planned'}});
      check.innerHTML=fromId===toId?'<div class="goal-warning">振替元と振替先は別の口座を選んでください。</div>':`<div class="pro3-recon-summary"><div><span>振替元の最低残高</span><strong class="${source?.minBalance<0?'red':''}">${yen(source?.minBalance||0)}</strong></div><div><span>振替先の最低残高</span><strong class="${target?.minBalance<0?'red':''}">${yen(target?.minBalance||0)}</strong></div><div><span>総残高への影響</span><strong>¥0</strong></div></div>${source?.minBalance<0?'<div class="goal-warning">この振替は振替元を不足させる見込みです。金額または予定日を見直してください。</div>':''}`
    };
    amt.onclick=()=>openCalculator('振替金額',amount,v=>{
      amount=v;
      amt.querySelector('.val').textContent=yen(v);
      markSheetDirty();
      redraw()
    });
    root.querySelector('#transferFrom').onchange=redraw;
    root.querySelector('#transferTo').onchange=redraw;
    root.querySelector('#transferDate').onchange=redraw;
    root.querySelector('#transferCancel').onclick=requestSheetClose;
    root.querySelector('#transferSave').onclick=()=>{
      redraw();
      if(!bankById(fromId)||!bankById(toId))return showAlert('口座を確認してください','登録済みの振替元・振替先を選択してください。');
      if(fromId===toId)return showAlert('口座を確認してください','振替元と振替先は別の口座にしてください。');
      if(!(amount>0))return showAlert('金額を入力してください','振替金額は1円以上で入力してください。');
      const preview=pro3BankForecast(fromId,60,{extraPlan:{id:'preview',fromBankId:fromId,toBankId:toId,amount,date:planDate,status:'planned'}});
      if(preview?.minBalance<0)return showAlert('振替元が不足する見込みです',`${dayLabel(preview.minDate)}に ${yen(Math.abs(preview.minBalance))} 不足する見込みです。`);
      runSaveAction(root.querySelector('#transferSave'),()=>{
        requireFinancialEntity('bank',fromId);
        requireFinancialEntity('bank',toId);
        if(fromId===toId||!(amount>0))throw new Error('振替条件が不正です');
        data.transferPlans.push({id:uid('transfer'),fromBankId:fromId,toBankId:toId,amount,date:planDate,status:'planned',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()})
      },{label:'transfer plan',afterCommit:refreshTransferPlansView,close:closeSheet,success:'振替計画を保存しました'})
    };
    redraw()
  })
}
function executeTransferPlan(id){const p=data.transferPlans.find(x=>x.id===id);if(!p||p.status!=='planned')return;const from=bankById(p.fromBankId),to=bankById(p.toBankId);if(!from||!to)return;if(Number(from.balance)<p.amount)return showAlert('振替元の残高が不足しています',`${from.name}の現在残高は${yen(from.balance)}です。`);showAlert('振替を実行済みにしますか？',`${from.name} → ${to.name} ${yen(p.amount)}\n実際の銀行送金は行いません。アプリ内残高だけを更新します。`,{okText:'実行済みにする'}).then(ok=>{if(!ok)return;try{safeCommit(()=>{const p=data.transferPlans.find(x=>x.id===id);if(!p)throw new Error('振替計画がありません');const from=requireFinancialEntity('bank',p.fromBankId),to=requireFinancialEntity('bank',p.toBankId);if(from.id===to.id||!(p.amount>0)||Number(from.balance)<p.amount)throw new Error('振替条件が変わりました');if(p.status!=='planned')throw new Error('already executed');const at=new Date().toISOString();from.balance-=p.amount;to.balance+=p.amount;from.updatedAt=at;to.updatedAt=at;p.status='executed';p.executedAt=at;p.updatedAt=at;bankSnapshot(from,`振替 ${p.id} → ${to.name}`);bankSnapshot(to,`振替 ${p.id} ← ${from.name}`)},{render:true,label:'transfer execute'});feedback.success();showToast('振替を実行済みにしました');refreshTransferPlansView()}catch(e){console.error('transfer action failed',e)}})}
function undoTransferPlan(id){const p=data.transferPlans.find(x=>x.id===id);if(!p||p.status!=='executed')return;if(!transferPlanSafeToUndo(p))return showAlert('自動で戻せません','実行後に口座残高が更新されています。二重調整を防ぐため、残高を確認して手動で修正してください。');showAlert('振替実行を取り消しますか？','アプリ内の2口座残高を同額だけ戻します。',{okText:'取り消す'}).then(ok=>{if(!ok)return;try{safeCommit(()=>{const p=data.transferPlans.find(x=>x.id===id);if(!p||p.status!=='executed'||!transferPlanSafeToUndo(p))throw new Error('振替は取消できません');const from=requireFinancialEntity('bank',p.fromBankId),to=requireFinancialEntity('bank',p.toBankId);from.balance+=p.amount;to.balance-=p.amount;p.status='cancelled';p.updatedAt=new Date().toISOString();bankSnapshot(from,`振替取消 ${p.id}`);bankSnapshot(to,`振替取消 ${p.id}`)},{render:true,label:'transfer undo'});feedback.delete();showToast('振替実行を取り消しました');refreshTransferPlansView()}catch(e){console.error('transfer action failed',e)}})}
function openTransferPlans(targetRoot=null){const plans=[...(data.transferPlans||[])].sort((a,b)=>String(b.date).localeCompare(String(a.date)));presentFinancialView(targetRoot,'振替計画',`<div class="pro-action-row"><button type="button" class="pro-action-btn" id="transferAdd">新しい振替計画</button></div><div class="section-head">計画・履歴</div>${plans.length?plans.map(p=>`<div class="pro3-transfer-card"><div class="pro3-transfer-route"><span>${esc(bankById(p.fromBankId)?.name||'不明')}</span><span class="arrow">→</span><span>${esc(bankById(p.toBankId)?.name||'不明')}</span></div><div class="pro3-transfer-meta"><span>${dayLabel(p.date)}・${p.status==='planned'?'予定':p.status==='executed'?'実行済み':'取消済み'}</span><strong>${yen(p.amount)}</strong></div>${p.status==='planned'?`<button class="secondary" data-transfer-exec="${p.id}" style="margin-top:9px">実行済みにする</button>`:''}${p.status==='executed'?`<button class="secondary" data-transfer-undo="${p.id}" style="margin-top:9px">実行を取り消す</button>`:''}</div>`).join(''):'<div class="empty">振替計画はありません。</div>'}`,root=>{root.dataset.transferPlans='true';root.querySelector('#transferAdd').onclick=()=>openTransferPlanEditor();root.querySelectorAll('[data-transfer-exec]').forEach(b=>b.onclick=()=>executeTransferPlan(b.dataset.transferExec));root.querySelectorAll('[data-transfer-undo]').forEach(b=>b.onclick=()=>undoTransferPlan(b.dataset.transferUndo))})}

function statementRecon(cardId,billingMonth){return (data.statementReconciliations||[]).find(x=>x.cardId===cardId&&x.billingMonth===billingMonth)||null}
function statementImportForReconciliation(cardId,paymentMonth,billingMonth=''){const adj=billingMonth?cardAdjustmentInfo(cardId,billingMonth):null,linkedId=adj?.statementImportId;if(linkedId){const hit=(data.cardStatementImports||[]).find(x=>x.id===linkedId);if(hit)return hit}let list=(data.cardStatementImports||[]).filter(x=>x.cardId===cardId&&x.paymentMonth===paymentMonth);if(billingMonth){const card=cardById(cardId);const exact=list.filter(x=>billingMonthForPaymentDate(card,x.paymentDate||`${x.paymentMonth}-01`)===billingMonth);if(exact.length)list=exact}list.sort((a,b)=>(b.status==='confirmed')-(a.status==='confirmed')||String(b.confirmedAt||b.importedAt||'').localeCompare(String(a.confirmedAt||a.importedAt||'')));return list[0]||null}
function statementReconContribution(row){const base=Math.abs(Number(row?.currentPaymentAmount)||0)*(row?.direction==='refund'?-1:1);return base+(Number(row?.adjustment)||0)}
function statementReconAmountForTransaction(t,cardId,paymentMonth,billingMonth=''){const imp=statementImportForReconciliation(cardId,paymentMonth,billingMonth);if(!imp)return Number(t?.amount)||0;const rows=(imp.rows||[]).filter(r=>r.included!==false&&r.linkedTransactionId===t.id);return rows.length?sum(rows,r=>statementReconContribution(r)):(Number(t?.amount)||0)}
function statementReconTransactions(cardId,billingMonth,paymentMonth){const base=cardTransactionsForBillingCycle(cardId,billingMonth),ids=new Set(base.map(t=>t.id)),imp=statementImportForReconciliation(cardId,paymentMonth,billingMonth);if(imp)for(const r of imp.rows||[]){if(r.included===false||!r.linkedTransactionId||ids.has(r.linkedTransactionId))continue;const t=data.transactions.find(x=>x.id===r.linkedTransactionId);if(t){base.push(t);ids.add(t.id)}}return base.sort((a,b)=>String(a.date).localeCompare(String(b.date)))}
function openStatementReconciliation(cardId,paymentMonth=assetBillingMonth,billingMonthOverride=''){
  const card=cardById(cardId);
  if(!card)return;
  const statements=cardStatementsForPaymentMonth(cardId,paymentMonth),st=(billingMonthOverride?statements.find(x=>x.billingMonth===billingMonthOverride):null)||statements.find(x=>x.status!=='paid')||statements[0]||cardStatementForPaymentMonth(cardId,paymentMonth),billingMonth=st?.billingMonth||billingMonthForPaymentMonth(card,paymentMonth),txs=statementReconTransactions(cardId,billingMonth,paymentMonth),existing=statementRecon(cardId,billingMonth);
  let confirmed=st?.amount==null?acfCardBillingAmount(cardId,billingMonth):Math.max(0,Number(st.amount)||0);
  const selected=new Set(existing?.linkedTransactionIds?.length?existing.linkedTransactionIds:txs.map(x=>x.id));
  pushView('請求照合センター','',root=>{
    const draw=()=>{
      const body=root.querySelector('.push-body'),linked=txs.filter(t=>selected.has(t.id)),linkedTotal=sum(linked,t=>statementReconAmountForTransaction(t,cardId,paymentMonth,billingMonth)),diff=confirmed-linkedTotal,status=Math.abs(diff)<1?'一致':diff>0?'明細不足':'明細が請求超過';
      body.innerHTML=`<div class="hero"><div class="hero-kicker">${esc(card.name)}・${monthLabel(paymentMonth)}支払い</div><div class="hero-value">${yen(confirmed)}</div><div class="hero-sub">${monthLabel(billingMonth)}対象・${st?.paymentDate?dayLabel(st.paymentDate):'支払日未設定'}・対象利用期間 ${esc(billingCycleForCard(card,billingMonth).label)}</div></div><div class="pro3-recon-summary"><div><span>確認した請求額</span><strong>${yen(confirmed)}</strong></div><div><span>紐づけ明細</span><strong>${yen(linkedTotal)}</strong></div><div><span>差額</span><strong class="${diff?'red':''}">${diff>0?'+':''}${yen(diff)}</strong></div></div>${diff?`<div class="goal-warning">${status}：${yen(Math.abs(diff))}。自動で明細を削除・統合しません。</div>`:'<div class="card card-pad"><div class="row-title">請求額と紐づけ明細が一致しています</div></div>'}<div class="pro-action-row"><button type="button" class="pro-action-btn" id="reconAmount">請求額を更新</button><button type="button" class="pro-action-btn" id="reconSave">照合状態を保存</button></div><div class="section-head">この請求に含める明細</div><div class="group">${txs.length?txs.map(t=>{
        const reconAmount=statementReconAmountForTransaction(t,cardId,paymentMonth,billingMonth),usesStatement=Math.abs(reconAmount-(Number(t.amount)||0))>=1;
        return `<div class="pro3-check-row"><button type="button" class="pro3-check ${selected.has(t.id)?'on':''}" data-recon-tx="${t.id}" aria-label="この請求に含める"></button><div class="pro3-check-main"><strong>${esc(t.merchant)}</strong><span>${t.date}・${esc(t.category)}${t.mailImportId?'・Gmail取込':''}${usesStatement?'・今月支払額':''}</span></div><div class="pro3-check-amount">${yen(reconAmount)}</div></div>`
      }).join(''):'<div class="row"><div class="row-main"><div class="row-title">対象期間の明細はありません</div></div></div>'}</div>`;
      body.querySelectorAll('[data-recon-tx]').forEach(b=>b.onclick=()=>{
        selected.has(b.dataset.reconTx)?selected.delete(b.dataset.reconTx):selected.add(b.dataset.reconTx);
        feedback.selection();
        draw()
      });
      body.querySelector('#reconAmount').onclick=()=>openCalculator('確認した請求額',confirmed,v=>{
        try{
          const cur=cardAdjustmentInfo(cardId,billingMonth),stStatus=cur?.status||'confirmed',pd=cur?.paymentDateOverride||acfEffectiveCardPaymentDate(card,billingMonth)||'';
          safeCommit(()=>setCardStatement(cardId,billingMonth,v,{paymentDate:pd,status:stStatus,memo:'請求照合センターで更新',balanceMode:'keep'}),{render:true,label:'recon amount'});
          confirmed=v;
          feedback.success();
          showToast('確認した請求額を更新しました');
          draw()
        }catch(e){
          }
      });
      body.querySelector('#reconSave').onclick=()=>{
        try{
          safeCommit(()=>{
            let r=statementRecon(cardId,billingMonth);
            const obj={cardId,billingMonth,confirmedAmount:confirmed,linkedTransactionIds:[...selected],status:Math.abs(diff)<1?'matched':'review',updatedAt:new Date().toISOString()};
            if(r)Object.assign(r,obj);
            else data.statementReconciliations.push({id:uid('recon'),...obj,createdAt:new Date().toISOString()})
          },{render:true,label:'statement reconciliation'});
          feedback.success();
          showToast(diff?'照合状態を保存しました（差額あり）':'請求照合を保存しました')
        }catch(e){
          }
      }
    };
    draw()
  })
}

function pro3RebalancePlan(month,mode,selectedDates=[]){const raw=data.monthlyGoals[month]||{},today=ymd(),start=month===ym()?Number(today.slice(8,10)):1,days=daysInMonth(month),target=Math.max(0,Number(raw.total)||0),past=month===ym()?spentMonth(month):0,remaining=Math.max(0,target-past),locked=new Set(),editable=[];for(let d=start;d<=days;d++){const ds=`${month}-${pad(d)}`,g=data.dailyGoals[ds];if(g?.origin==='daily')locked.add(ds);else editable.push(ds)}const chosen=mode==='selected'?editable.filter(ds=>selectedDates.includes(ds)):editable,base={...(raw.daily||{})},lockedFuture=sum([...locked],ds=>Math.max(spentDate(ds),Number(base[Number(ds.slice(8,10))])||Number(data.dailyGoals[ds]?.total)||0)),available=Math.max(0,remaining-lockedFuture);let weights={};if(mode==='weighted')weights=weekdaySpendingWeights(month,8).weights;const denom=sum(chosen,ds=>mode==='weighted'?(weights[parseYmd(ds).getDay()]||1):1)||1;let used=0;chosen.forEach((ds,i)=>{const day=Number(ds.slice(8,10)),floor=ds===today?spentDate(ds):0,w=mode==='weighted'?(weights[parseYmd(ds).getDay()]||1):1,v=i===chosen.length-1?Math.max(0,available-used):Math.max(0,Math.floor((available*w/denom)/100)*100);base[day]=Math.max(floor,v);used+=base[day]});for(const ds of editable){if(mode==='selected'&&!selectedDates.includes(ds))base[Number(ds.slice(8,10))]=Math.max(spentDate(ds),Number(base[Number(ds.slice(8,10))])||0)}return{plan:base,target,past,remaining,locked,editable,chosen}}
function applyRebalance(month,plan){const beforeDaily=clone(data.monthlyGoals[month]?.daily||{}),beforeGoals={};for(let d=1;d<=daysInMonth(month);d++){const ds=`${month}-${pad(d)}`;if(data.dailyGoals[ds])beforeGoals[ds]=clone(data.dailyGoals[ds])}const afterDaily=clone(plan);safeCommit(()=>{const m={...(data.monthlyGoals[month]||{}),daily:{...plan}};data.monthlyGoals[month]=m;const start=month===ym()?Number(ymd().slice(8,10)):1;for(let d=start;d<=daysInMonth(month);d++){const ds=`${month}-${pad(d)}`,existing=data.dailyGoals[ds];if(existing?.origin==='daily')continue;const v=Math.max(0,Number(plan[d])||0);if(v>0)data.dailyGoals[ds]={total:v,categories:existing?.categories||{},origin:'monthly'};else if(existing?.origin==='monthly')delete data.dailyGoals[ds]}data.budgetRebalanceHistory.push({id:uid('rebalance'),month,beforeDaily,beforeGoals,afterDaily,createdAt:new Date().toISOString()});data.budgetRebalanceHistory=data.budgetRebalanceHistory.slice(-20)},{render:true,label:'budget rebalance'});const hist=data.budgetRebalanceHistory.at(-1);showToast('残り予算を立て直しました',{actionLabel:'取り消す',action:()=>undoRebalance(hist.id)})}
function undoRebalance(id){const h=data.budgetRebalanceHistory.find(x=>x.id===id);if(!h)return;const current=data.monthlyGoals[h.month]?.daily||{},same=JSON.stringify(current)===JSON.stringify(h.afterDaily||{});if(!same)return showAlert('自動で取り消せません','立て直し後に日別計画が変更されています。後の編集を消さないため、自動取り消しを停止しました。');try{safeCommit(()=>{const m={...(data.monthlyGoals[h.month]||{}),daily:clone(h.beforeDaily||{})};data.monthlyGoals[h.month]=m;for(let d=1;d<=daysInMonth(h.month);d++){const ds=`${h.month}-${pad(d)}`;if(h.beforeGoals?.[ds])data.dailyGoals[ds]=clone(h.beforeGoals[ds]);else if(data.dailyGoals[ds]?.origin==='monthly')delete data.dailyGoals[ds]}data.budgetRebalanceHistory=data.budgetRebalanceHistory.filter(x=>x.id!==id)},{render:true,label:'rebalance undo'});feedback.delete();showToast('立て直しを取り消しました')}catch(e){}}
function openBudgetRebalance(month=ym()){const raw=data.monthlyGoals[month];if(!raw?.total)return showAlert('月間目標が未設定です','先に月間目標を設定してください。');let mode='even',selected=[],preview=null;pushView('予算の立て直し','',root=>{const draw=()=>{preview=pro3RebalancePlan(month,mode,selected);const forecast=buildCashFlowForecast({flexibleBudgetPlan:Object.fromEntries(Object.entries(preview.plan).map(([d,v])=>[`${month}-${pad(d)}`,v])),planIncludesSpent:true,horizonEnd:monthEndDate(month)}),body=root.querySelector('.push-body'),today=ymd(),changes=preview.editable.map(ds=>{const d=Number(ds.slice(8,10)),old=Number(raw.daily?.[d])||Number(data.dailyGoals[ds]?.total)||0,nv=Number(preview.plan[d])||0;return{date:ds,old,nv,delta:nv-old}}).filter(x=>Math.abs(x.delta)>.5);body.innerHTML=`<div class="hero"><div class="hero-kicker">${monthLabel(month)}・残り予算</div><div class="hero-value">${yen(preview.remaining)}</div><div class="hero-sub">使用済み ${yen(preview.past)} / 月間目標 ${yen(preview.target)}</div></div><div class="section-head">配り方</div>${[['even','残りの日へ均等に配る','未来の編集可能な日に均等配分します。'],['weighted','曜日の使い方に合わせる','過去の曜日別支出傾向を重みに使います。'],['selected','選んだ日だけ調整する','選んだ未来日のみ再配分します。']].map(([v,t,sub])=>`<button class="pro3-rebalance-option ${mode===v?'on':''}" data-rebalance-mode="${v}"><strong>${t}</strong><span>${sub}</span></button>`).join('')}${mode==='selected'?`<div class="pro3-day-picks">${preview.editable.slice(0,31).map(ds=>`<button class="pro3-day-pick ${selected.includes(ds)?'on':''}" data-pick-day="${ds}">${Number(ds.slice(8,10))}日</button>`).join('')}</div>`:''}<div class="pro3-recon-summary"><div><span>変更する日</span><strong>${changes.length}日</strong></div><div><span>1日平均</span><strong>${yen(preview.chosen.length?sum(preview.chosen,ds=>preview.plan[Number(ds.slice(8,10))])/preview.chosen.length:0)}</strong></div><div><span>最低予測残高</span><strong class="${forecast.minForecastBalance<forecast.reserveFloor?'red':''}">${yen(forecast.minForecastBalance)}</strong></div></div>${forecast.planShortageTotal>0||forecast.minForecastBalance<forecast.reserveFloor?'<div class="goal-warning">配分だけでは資金不足を解消できない見込みです。安全ラインを下回る日が残っています。</div>':''}<div class="section-head">変更プレビュー</div><div class="pro3-preview-list">${changes.length?changes.slice(0,40).map(x=>`<div class="pro3-preview-row"><span>${dayLabel(x.date)}</span><strong class="${x.delta>0?'green':x.delta<0?'red':''}">${yen(x.old)} → ${yen(x.nv)}</strong></div>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">変更はありません</div></div></div>'}</div><button type="button" class="primary" id="rebalanceApply" style="margin-top:13px" ${mode==='selected'&&!selected.length?'disabled':''}>この内容を適用</button><div class="hero-sub" style="margin-top:9px">過去の実績と「当日目標として固定」した日は変更しません。今日を変更する場合も、実績額より低い目標にはしません。</div>`;body.querySelectorAll('[data-rebalance-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.rebalanceMode;if(mode!=='selected')selected=[];feedback.selection();draw()});body.querySelectorAll('[data-pick-day]').forEach(b=>b.onclick=()=>{const ds=b.dataset.pickDay;selected=selected.includes(ds)?selected.filter(x=>x!==ds):[...selected,ds];feedback.selection();draw()});body.querySelector('#rebalanceApply').onclick=()=>{applyRebalance(month,preview.plan);feedback.success();popView()}};draw()})}


/* === end Part 3 / Pro 1-6 core === */


