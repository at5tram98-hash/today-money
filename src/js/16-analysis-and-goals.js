/* === Part 4 / Pro 7-9 core === */
function pro4Hash(value){let h=2166136261,s=typeof value==='string'?value:JSON.stringify(value);for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function pro4MerchantKey(v){return String(v||'').normalize('NFKC').toLowerCase().replace(/[\s　・._\-／/]+/g,'')}
function pro4DateFromText(text,base=ymd()){const s=String(text||'');if(/一昨日/.test(s))return addDays(base,-2);if(/昨日/.test(s))return addDays(base,-1);if(/今日/.test(s))return base;let m=s.match(/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2})/);if(m){const d=`${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;if(ymd(parseYmd(d))===d)return d}m=s.match(/(?:^|\s)(\d{1,2})[\/-](\d{1,2})(?:\s|$)/);if(m){const y=Number(base.slice(0,4)),d=`${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;if(ymd(parseYmd(d))===d)return d}m=s.match(/(\d{1,2})月(\d{1,2})日/);if(m){const y=Number(base.slice(0,4)),d=`${y}-${pad(Number(m[1]))}-${pad(Number(m[2]))}`;if(ymd(parseYmd(d))===d)return d}return base}
function pro4AmountFromText(text){const s=String(text||'');let ms=[...s.matchAll(/[¥￥]\s*([0-9][0-9,]*)|([0-9][0-9,]*)\s*円/g)],v=ms.length?Number(String(ms.at(-1)[1]||ms.at(-1)[2]).replace(/,/g,'')):0;if(v>0)return v;const nums=[...s.matchAll(/(?:^|\s)([0-9][0-9,]*)(?=\s|$)/g)].map(m=>Number(m[1].replace(/,/g,''))).filter(x=>x>0&&x<100000000);return nums.at(-1)||0}
function pro4CategoryGuess(text,merchant){const raw=String(text||''),rule=data.quickInputRules?.[pro4MerchantKey(merchant)],legacy=data.merchantRules?.[pro4MerchantKey(merchant)];if(rule?.category&&data.categories.some(c=>c.name===rule.category))return rule.category;if(legacy&&data.categories.some(c=>c.name===legacy))return legacy;const direct=data.categories.find(c=>raw.includes(c.name));if(direct)return direct.name;const table=[['食費',/マック|マクド|コンビニ|ローソン|セブン|ファミマ|カフェ|スタバ|飲食|ごはん|ランチ|夕食|昼食/],['交通費',/JR|地下鉄|バス|電車|タクシー|ICOCA|Suica|運賃|乗車/],['衣服費',/GU|ユニクロ|服|衣類|しまむら/],['日用品',/ドラッグ|薬局|日用品|無印/],['娯楽費',/映画|カラオケ|ゲーム|遊園地|ナガシマ|チケット/],['教育費',/大学|教科書|参考書|授業|資格|TOEIC|MOS|簿記/]];for(const [cat,re] of table)if(re.test(raw)&&data.categories.some(c=>c.name===cat))return cat;return data.categories.find(c=>c.name==='その他')?.name||data.categories.at(-1)?.name||'その他'}
function pro4PaymentGuess(text,merchant){const raw=String(text||''),matches=[],push=(method,id,label)=>{if(!matches.some(x=>x.method===method&&x.id===id))matches.push({method,id,label})};for(const c of data.cards)if(raw.toLowerCase().includes(String(c.name||c.company).toLowerCase()))push('card',c.id,c.name);for(const b of data.banks)if(raw.toLowerCase().includes(String(b.name).toLowerCase()))push('bank',b.id,b.name);for(const d of data.debitCards)if(raw.toLowerCase().includes(String(d.name).toLowerCase()))push('debit',d.id,d.name);if(/現金/.test(raw))return{paymentMethod:'other',paymentId:'',ambiguous:false,candidates:[]};if(/PayPayカード/.test(raw)){const c=data.cards.find(x=>/paypay/i.test(x.name||x.company));if(c)return{paymentMethod:'card',paymentId:c.id,ambiguous:false,candidates:[]}}if(/PayPay銀行/.test(raw)){const b=data.banks.find(x=>/paypay/i.test(x.name));if(b)return{paymentMethod:'bank',paymentId:b.id,ambiguous:false,candidates:[]}}if(/\bPayPay\b|ペイペイ/i.test(raw)){const c=data.cards.find(x=>/paypay/i.test(x.name||x.company)),b=data.banks.find(x=>/paypay/i.test(x.name));if(c)push('card',c.id,c.name);if(b)push('bank',b.id,b.name);if(matches.length>1)return{paymentMethod:'',paymentId:'',ambiguous:true,candidates:matches}}if(matches.length===1)return{paymentMethod:matches[0].method,paymentId:matches[0].id,ambiguous:false,candidates:[]};if(matches.length>1)return{paymentMethod:'',paymentId:'',ambiguous:true,candidates:matches};if(/カード/.test(raw)){if(data.cards.length===1)return{paymentMethod:'card',paymentId:data.cards[0].id,ambiguous:false,candidates:[]};if(data.cards.length>1)return{paymentMethod:'',paymentId:'',ambiguous:true,candidates:data.cards.map(c=>({method:'card',id:c.id,label:c.name}))}}const rule=data.quickInputRules?.[pro4MerchantKey(merchant)];if(rule?.paymentMethod)return{paymentMethod:rule.paymentMethod,paymentId:rule.paymentId||'',ambiguous:false,candidates:[]};const last=[...data.transactions].sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||''))).find(t=>pro4MerchantKey(t.merchant)===pro4MerchantKey(merchant));if(last)return{paymentMethod:last.paymentMethod||'other',paymentId:last.paymentId||'',ambiguous:false,candidates:[]};return{paymentMethod:'other',paymentId:'',ambiguous:false,candidates:[]}}
function pro4MerchantFromText(text){let s=String(text||'').trim();s=s.replace(/一昨日|昨日|今日/g,' ').replace(/20\d{2}[\/-]\d{1,2}[\/-]\d{1,2}/g,' ').replace(/\d{1,2}[\/-]\d{1,2}/g,' ').replace(/\d{1,2}月\d{1,2}日/g,' ').replace(/[¥￥]?\s*[0-9][0-9,]*\s*円/g,' ');for(const c of data.categories)s=s.replaceAll(c.name,' ');for(const x of [...data.cards,...data.banks,...data.debitCards].sort((a,b)=>String(b.name||b.company||'').length-String(a.name||a.company||'').length)){const n=String(x.name||x.company||'');if(n)s=s.replaceAll(n,' ')}s=s.replace(/PayPayカード|PayPay銀行|PayPay|ペイペイ|現金|クレジットカード|カード|デビット/g,' ');return s.replace(/[、,]/g,' ').replace(/\s+/g,' ').trim()||'支出'}
function parseQuickExpenseLine(text,base=ymd()){const raw=String(text||'').trim(),date=pro4DateFromText(raw,base),amount=pro4AmountFromText(raw),merchant=pro4MerchantFromText(raw),category=pro4CategoryGuess(raw,merchant),p=pro4PaymentGuess(raw,merchant),notes=[];if(data.employers.some(e=>pro4MerchantKey(e.name)===pro4MerchantKey(merchant)))notes.push(`${merchant} は勤務先名にも一致します。ここでは支出先として登録します。`);const duplicateIds=data.transactions.filter(t=>t.date===date&&Math.abs(Number(t.amount)-amount)<1&&pro4MerchantKey(t.merchant)===pro4MerchantKey(merchant)).map(t=>t.id);if(!amount)notes.push('金額を確認してください。');if(p.ambiguous)notes.push('支払い方法に複数候補があります。選択してください。');if(duplicateIds.length)notes.push(`同じ日・金額・支出先の既存記録が ${duplicateIds.length} 件あります。`);return{id:uid('draft'),raw,date,amount,merchant,category,paymentMethod:p.paymentMethod,paymentId:p.paymentId,paymentCandidates:p.candidates||[],paymentAmbiguous:p.ambiguous,notes,duplicateIds,allowDuplicate:false}}
function parseQuickExpenseLines(text,base=ymd()){return String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(x=>parseQuickExpenseLine(x,base))}
function pro4PaymentSelect(d){const unresolved=d.paymentAmbiguous&&!d.paymentMethod?'<option value="|" selected>確認が必要</option>':'';return unresolved+paymentOptions(d.paymentMethod||'other',d.paymentId||'')}
function pro4DraftValid(d){return d.amount>0&&d.merchant.trim()&&!!d.date&&!!d.paymentMethod&&(!d.duplicateIds.length||d.allowDuplicate)}
function pro4SearchItems(query,type='all'){const q=String(query||'').trim().toLowerCase(),hit=s=>!q||String(s||'').toLowerCase().includes(q),rows=[];if(type==='all'||type==='transaction')for(const t of data.transactions)if(hit(`${t.merchant} ${t.category} ${t.memo} ${paymentLabel(t)} ${t.date}`))rows.push({type:'transaction',id:t.id,title:t.merchant,sub:`${t.date}・${t.category}・${paymentLabel(t)}`,value:yen(t.amount),date:t.date});if(type==='all'||type==='salary')for(const r of data.salaryRecords){const e=employerById(r.employerId),txt=`${e?.name||''} ${r.month} ${r.date} ${salaryRecordDisplayStatus(r)}`;if(hit(txt))rows.push({type:'salary',id:r.id,title:e?.name||'給与',sub:`${monthLabel(r.month)}勤務分・${salaryRecordDisplayStatus(r)}`,value:yen(salaryRecordExpectedOrReceivedAmount(r)),date:r.date})}if(type==='all'||type==='account')for(const b of data.banks)if(hit(`${b.name} ${b.label||''}`))rows.push({type:'account',id:b.id,title:b.name,sub:b.label||'銀行口座',value:yen(b.balance),date:''});if(type==='all'||type==='card')for(const c of data.cards)if(hit(`${c.name} ${c.company||''}`))rows.push({type:'card',id:c.id,title:c.name,sub:'クレジットカード',value:typeof cardUsageLabel==='function'?cardUsageLabel(c):'',date:''});if(type==='all'||type==='goal')for(const g of data.eventGoals)if(hit(`${g.name} ${g.type} ${g.items.map(i=>i.name).join(' ')}`)){const sm=eventGoalSummary(g);rows.push({type:'goal',id:g.id,title:g.name,sub:`期限 ${g.deadline}・自分の負担 ${yen(sm.ownShare)}`,value:yen(sm.total),date:g.deadline})}return rows.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,100)}
function pro4OpenSearchResult(r){if(r.type==='transaction')openTransactionDetail(r.id);else if(r.type==='salary')openSalaryRecordEdit(r.id);else if(r.type==='account')openBankDetail(r.id);else if(r.type==='card')openCardDetail(r.id,assetBillingMonth);else if(r.type==='goal')openEventGoalDetail(r.id)}
function openSmartInputSearch(initialMode='input'){
  let mode=initialMode==='search'?'search':'input',drafts=[],query='',searchType='all';
  pushView('入力と検索','',root=>{
    const body=root.querySelector('.push-body');
    const draw=()=>{
      body.innerHTML=`<div class="seg pro4-mode" id="pro4Mode"><button data-v="input" class="${mode==='input'?'on':''}">入力</button><button data-v="search" class="${mode==='search'?'on':''}">検索</button></div>${mode==='input'?inputHtml():searchHtml()}`;
      body.querySelectorAll('#pro4Mode button').forEach(b=>b.onclick=()=>{
        mode=b.dataset.v;
        feedback.selection();
        draw()
      });
      mode==='input'?bindInput():bindSearch()
    };
    const inputHtml=()=>`<div class="pro4-editor"><textarea id="pro4Lines" placeholder="例：昨日 マック 780円 PayPayカード\n今日 JR 230円">${esc(drafts.map(d=>d.raw).join('\n'))}</textarea></div><button type="button" class="secondary" id="pro4Parse">内容を読み取る</button><div id="pro4Preview">${drafts.length?draftsHtml():`<div class="empty">1行でも複数行でも入力できます。解析した内容を確認してから保存します。</div>`}</div>`;
    const draftsHtml=()=>`<div class="pro4-parse-head"><strong>保存予定 ${drafts.length}件</strong><span>合計 ${yen(sum(drafts,d=>d.amount))}</span></div>${drafts.map((d,i)=>`<div class="pro4-parse-card ${pro4DraftValid(d)?'':'warn'}" data-draft-card="${i}"><div class="pro4-parse-row"><label>日付</label><input class="field" type="date" data-draft-date="${i}" value="${d.date}"></div><div class="pro4-parse-row"><label>支出先</label><input class="field" data-draft-merchant="${i}" value="${esc(d.merchant)}"></div><div class="pro4-parse-row"><label>金額</label><button class="pro4-amount-edit" data-draft-amount="${i}">${yen(d.amount)}</button></div><div class="pro4-parse-row"><label>カテゴリ</label><select class="field field-select" data-draft-cat="${i}">${data.categories.map(c=>`<option ${c.name===d.category?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="pro4-parse-row"><label>支払い方法</label><select class="field field-select" data-draft-pay="${i}">${pro4PaymentSelect(d)}</select></div>${d.notes.length?`<div class="pro4-note ${d.paymentAmbiguous||d.duplicateIds.length?'warning':''}">${d.notes.map(esc).join('<br>')}</div>`:''}${d.duplicateIds.length?`<button class="pro4-dup-toggle ${d.allowDuplicate?'on':''}" data-draft-dup="${i}"><i></i><span>既存記録とは別の取引として保存する</span></button>`:''}</div>`).join('')}<button type="button" class="primary" id="pro4SaveAll" ${drafts.every(pro4DraftValid)?'':'disabled'}>確認した ${drafts.length} 件を保存</button>${drafts.length===1?'<button type="button" class="secondary" id="pro4NormalForm" style="margin-top:9px">通常の入力画面で確認する</button>':''}`;
    const bindInput=()=>{
      const ta=body.querySelector('#pro4Lines');
      body.querySelector('#pro4Parse').onclick=()=>{
        drafts=parseQuickExpenseLines(ta.value,trackingDate);
        if(!drafts.length)return showAlert('入力がありません','支出を1行以上入力してください。');
        draw()
      };
      body.querySelectorAll('[data-draft-date]').forEach(el=>el.onchange=()=>{
        const d=drafts[Number(el.dataset.draftDate)];
        d.date=el.value;
        d.duplicateIds=data.transactions.filter(t=>t.date===d.date&&Math.abs(Number(t.amount)-d.amount)<1&&pro4MerchantKey(t.merchant)===pro4MerchantKey(d.merchant)).map(t=>t.id);
        d.allowDuplicate=false;
        draw()
      });
      body.querySelectorAll('[data-draft-merchant]').forEach(el=>el.onchange=()=>{
        drafts[Number(el.dataset.draftMerchant)].merchant=el.value.trim()||'支出';
        draw()
      });
      body.querySelectorAll('[data-draft-cat]').forEach(el=>el.onchange=()=>{
        drafts[Number(el.dataset.draftCat)].category=el.value;
        draw()
      });
      body.querySelectorAll('[data-draft-pay]').forEach(el=>el.onchange=()=>{
        const d=drafts[Number(el.dataset.draftPay)],[m,p]=el.value.split('|');
        d.paymentMethod=m;
        d.paymentId=p;
        d.paymentAmbiguous=!m;
        draw()
      });
      body.querySelectorAll('[data-draft-amount]').forEach(el=>el.onclick=()=>{
        const i=Number(el.dataset.draftAmount),d=drafts[i];
        openCalculator('支出額',d.amount,v=>{
          d.amount=v;
          d.duplicateIds=data.transactions.filter(t=>t.date===d.date&&Math.abs(Number(t.amount)-v)<1&&pro4MerchantKey(t.merchant)===pro4MerchantKey(d.merchant)).map(t=>t.id);
          d.allowDuplicate=false;
          draw()
        })
      });
      body.querySelectorAll('[data-draft-dup]').forEach(el=>el.onclick=()=>{
        const d=drafts[Number(el.dataset.draftDup)];
        d.allowDuplicate=!d.allowDuplicate;
        draw()
      });
      body.querySelector('#pro4NormalForm')?.addEventListener('click',()=>{
        const d=drafts[0];
        popView();
        setTimeout(()=>openQuickExpense(d.date,{amount:d.amount,merchant:d.merchant,category:d.category,paymentMethod:d.paymentMethod||'other',paymentId:d.paymentId||'',memo:d.raw}),260)
      });
      body.querySelector('#pro4SaveAll')?.addEventListener('click',()=>{
        if(!drafts.every(pro4DraftValid))return showAlert('確認が必要な項目があります','金額、支払い方法、重複候補を確認してください。');
        try{
          safeCommit(()=>{
            for(const d of drafts){
              recordExpense({date:d.date,amount:d.amount,category:d.category,merchant:d.merchant,paymentMethod:d.paymentMethod,paymentId:d.paymentId,memo:d.raw,source:'quick_line',saveNow:false});
              data.quickInputRules[pro4MerchantKey(d.merchant)]={category:d.category,paymentMethod:d.paymentMethod,paymentId:d.paymentId,updatedAt:new Date().toISOString()}
            }
          },{render:true,label:'one line input'});
          feedback.success();
          showToast(`${drafts.length}件・${yen(sum(drafts,d=>d.amount))}を保存しました`);
          popView()
        }catch(e){
          }
      })
    };
    const searchHtml=()=>{
      const rows=pro4SearchItems(query,searchType),groups={transaction:'支出',salary:'給与',account:'口座',card:'カード',goal:'旅行・プレゼント'};
      return `<div class="pro4-searchbar">${icon('search')}<input id="pro4SearchQuery" placeholder="取引・給与・口座・請求・目標を検索" value="${esc(query)}"></div><div class="pro4-search-filters">${[['all','すべて'],['transaction','支出'],['salary','給与'],['account','口座'],['card','カード'],['goal','目標']].map(([v,l])=>`<button class="pro4-search-chip ${searchType===v?'on':''}" data-search-type="${v}">${l}</button>`).join('')}</div><div style="display:flex;justify-content:space-between;align-items:center;margin:0 2px 9px"><span class="row-sub pro4-result-count">${rows.length}件</span><button class="nav-text" id="pro4SaveSearch">検索条件を保存</button></div>${rows.length?Object.entries(groups).map(([type,label])=>{
        const list=rows.filter(r=>r.type===type);
        return list.length?`<div class="pro4-result-section"><div class="pro4-result-type">${label}</div><div class="group">${list.map(r=>`<button class="row press" data-pro4-result="${type}|${r.id}"><div class="row-main"><div class="row-title">${esc(r.title)}</div><div class="row-sub">${esc(r.sub)}</div></div><div class="row-value">${esc(r.value)}</div><span class="chev">›</span></button>`).join('')}</div></div>`:''
      }).join(''):'<div class="empty">該当する記録はありません。</div>'}${data.savedSearches.length?`<div class="section-head">保存した検索</div><div class="group">${data.savedSearches.map(x=>`<button class="row press" data-load-search="${x.id}"><div class="row-main"><div class="row-title">${esc(x.name)}</div><div class="row-sub">${esc(x.query||'条件のみ')}・${esc(x.type)}</div></div><span class="chev">›</span></button>`).join('')}</div>`:''}`
    };
    const bindSearch=()=>{
      const inp=body.querySelector('#pro4SearchQuery');
      inp.oninput=()=>{
        query=inp.value;
        clearTimeout(inp.__timer);
        inp.__timer=setTimeout(draw,180)
      };
      body.querySelectorAll('[data-search-type]').forEach(b=>b.onclick=()=>{
        searchType=b.dataset.searchType;
        draw()
      });
      body.querySelectorAll('[data-pro4-result]').forEach(b=>b.onclick=()=>{
        const [type,id]=b.dataset.pro4Result.split('|'),r=pro4SearchItems(query,type).find(x=>x.id===id);
        if(r)pro4OpenSearchResult(r)
      });
      body.querySelector('#pro4SaveSearch').onclick=()=>{
        if(!query&&searchType==='all')return showAlert('検索条件がありません','検索語または種類を指定してください。');
        try{
          safeCommit(()=>{
            data.savedSearches.push({id:uid('search'),name:query||`${searchType}の検索`,query,type:searchType,createdAt:new Date().toISOString()});
            data.savedSearches=data.savedSearches.slice(-10)
          },{render:false,label:'save search'});
          feedback.success();
          showToast('検索条件を保存しました');
          draw()
        }catch(e){
          }
      };
      body.querySelectorAll('[data-load-search]').forEach(b=>b.onclick=()=>{
        const x=data.savedSearches.find(v=>v.id===b.dataset.loadSearch);
        if(x){
          query=x.query;
          searchType=x.type||'all';
          draw()
        }
      })
    };
    draw()
  })
}

function eventGoalSummary(g){const total=sum(g.items.filter(i=>i.status!=='cancelled'),i=>i.budget),ownShare=g.splitMode==='equal'?Math.min(total,Math.round(total/Math.max(1,g.participants||2))):g.splitMode==='amount'?clamp(Number(g.ownShareAmount)||0,0,total):total,otherShare=Math.max(0,total-ownShare),paid=sum(g.items.filter(i=>i.status==='paid'),i=>i.budget),received=sum(data.reimbursements.filter(r=>r.goalId===g.id&&r.status==='received'),r=>r.amount),unrecovered=Math.max(0,otherShare-received),remaining=Math.max(0,total-paid),advance=Math.max(0,paid-ownShare),days=Math.max(0,Math.ceil((parseYmd(g.deadline)-parseYmd(ymd()))/86400000)),weeks=Math.max(1,Math.ceil(days/7)),weekly=Math.ceil(Math.max(0,ownShare-Math.min(ownShare,paid))/weeks/100)*100;return{total,ownShare,otherShare,paid,received,unrecovered,remaining,advance,weekly}}
function syncEventGoalPlans(goalId){requireStateCommit('syncEventGoalPlans');const g=data.eventGoals.find(x=>x.id===goalId);if(!g)throw new Error('目標が見つかりません');const keep=new Set();for(const item of g.items){let p=data.largeExpensePlans.find(x=>x.goalId===g.id&&x.goalItemId===item.id);if(item.status==='cancelled'){if(p&&p.status!=='completed')data.largeExpensePlans=data.largeExpensePlans.filter(x=>x.id!==p.id);continue}if(item.status==='paid'){if(p){p.status='completed';p.linkedTransactionId=item.transactionId||p.linkedTransactionId||'';p.updatedAt=new Date().toISOString();item.largePlanId=p.id}continue}const obj={id:p?.id||uid('large'),name:`${g.name}・${item.name}`,date:item.plannedDate||g.deadline,amount:item.budget,category:item.category||'その他',priority:'required',paymentMethod:item.paymentMethod||'other',paymentId:item.paymentId||'',linkedBankId:item.linkedBankId||(item.paymentMethod==='bank'?item.paymentId:'')||(item.paymentMethod==='debit'?paymentBankId('debit',item.paymentId):''),status:'planned',memo:`目標「${g.name}」の費目`,splits:[],goalId:g.id,goalItemId:item.id,createdAt:p?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};if(p)Object.assign(p,obj);else data.largeExpensePlans.push(obj);item.largePlanId=obj.id;keep.add(obj.id)}data.largeExpensePlans=data.largeExpensePlans.filter(p=>p.goalId!==g.id||p.status==='completed'||keep.has(p.id))}
function eventGoalMonthBannerHtml(month){const goals=data.eventGoals.filter(g=>g.status!=='cancelled'&&(String(g.deadline).slice(0,7)===month||g.items.some(i=>String(i.plannedDate).slice(0,7)===month))),total=sum(goals,g=>eventGoalSummary(g).ownShare);return `<button class="pro4-goal-banner" id="monthEventGoals"><div class="settings-icon" style="background:var(--purple)">${icon('gift')}</div><div class="row-main"><strong>旅行・プレゼントの目標</strong><span>${goals.length?`${goals.length}件・自分の負担予定 ${yen(total)}`:'割り勘・立替・回収までまとめて管理'}</span></div><span class="chev">›</span></button>`}
function openEventGoals(month=currentMonth){const render=()=>{const list=data.eventGoals.filter(g=>g.status!=='cancelled').sort((a,b)=>a.deadline.localeCompare(b.deadline)),html=`<button class="primary" id="eventGoalAdd" style="margin-bottom:13px">旅行・プレゼント目標を追加</button>${list.length?list.map(g=>{const s=eventGoalSummary(g);return `<button class="pro4-goal-card" data-event-goal="${g.id}" style="width:100%;border:0;text-align:left;color:inherit"><div class="pro4-goal-title"><div><strong>${esc(g.name)}</strong><div class="row-sub">期限 ${dayLabel(g.deadline)}・${g.items.length}費目</div></div><span class="status-chip ${s.unrecovered?'warning':'good'}">${s.unrecovered?'未回収あり':g.status==='completed'?'完了':'計画中'}</span></div><div class="pro4-goal-metrics"><div><span>総費用</span><strong>${yen(s.total)}</strong></div><div><span>自分の最終負担</span><strong>${yen(s.ownShare)}</strong></div><div><span>支払済み</span><strong>${yen(s.paid)}</strong></div><div><span>未回収</span><strong>${yen(s.unrecovered)}</strong></div></div></button>`}).join(''):'<div class="empty">旅行・プレゼントの目標はありません。</div>'}`,bind=root=>{root.querySelector('#eventGoalAdd').onclick=()=>openEventGoalEditor(null,{after:render});root.querySelectorAll('[data-event-goal]').forEach(b=>b.onclick=()=>openEventGoalDetail(b.dataset.eventGoal))};if(pushStack.at(-1)?.title==='旅行・プレゼント')replaceTopPush('旅行・プレゼント',html,bind);else pushView('旅行・プレゼント',html,bind)};render()}
function openGoalItemEditor(item,deadline,onSave){let draft=clone(item||{id:uid('goalitem'),name:'',budget:0,plannedDate:deadline||ymd(),category:data.categories[0]?.name||'その他',paymentMethod:'other',paymentId:'',status:'planned'}),amount=Number(draft.budget)||0;openSheet(`<div class="sheet-nav"><button class="nav-text" id="goalItemCancel">キャンセル</button><div class="sheet-title">費目</div><button class="nav-text bold" id="goalItemSave">保存</button></div><div class="sheet-body"><div class="form-card"><div class="form-section"><div class="form-label">費目名</div><input class="field" id="goalItemName" value="${esc(draft.name)}" placeholder="例：ホテル"></div><div class="form-section">${moneyButton('goalItemAmount','予算',amount)}</div><div class="form-section"><div class="form-label">支払予定日</div><input class="field" id="goalItemDate" type="date" value="${draft.plannedDate}"></div><div class="form-section"><div class="form-label">カテゴリ</div><select class="field field-select" id="goalItemCat">${data.categories.map(c=>`<option ${c.name===draft.category?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="form-section"><div class="form-label">支払い方法</div><select class="field field-select" id="goalItemPay">${paymentOptions(draft.paymentMethod,draft.paymentId)}</select></div></div></div>`,'full',root=>{const a=root.querySelector('#goalItemAmount');a.onclick=()=>openCalculator('費目予算',amount,v=>{amount=v;a.querySelector('.val').textContent=yen(v)});root.querySelector('#goalItemCancel').onclick=requestSheetClose;root.querySelector('#goalItemSave').onclick=()=>{const name=root.querySelector('#goalItemName').value.trim(),date=root.querySelector('#goalItemDate').value,[pm,pid]=root.querySelector('#goalItemPay').value.split('|');if(!name||amount<=0||!date)return showAlert('入力内容を確認してください','費目名・金額・日付を入力してください。');onSave({...draft,name,budget:amount,plannedDate:date,category:root.querySelector('#goalItemCat').value,paymentMethod:pm,paymentId:pid,linkedBankId:pm==='bank'?pid:(pm==='debit'?paymentBankId(pm,pid):''),status:draft.status||'planned'});closeSheet()}})}
function openEventGoalEditor(existing,{after=null}={}){
  let draft=clone(existing||{id:uid('goal'),name:'',type:'travel',deadline:addDays(ymd(),30),splitMode:'self',participants:2,ownShareAmount:0,status:'active',items:[],createdAt:new Date().toISOString()}),itemHost=null;
  openSheet(`<div class="sheet-nav"><button class="nav-text" id="eventGoalCancel">キャンセル</button><div class="sheet-title">${existing?'目標を編集':'目標を追加'}</div><button class="nav-text bold" id="eventGoalSave">保存</button></div><div class="sheet-body"><div class="form-group-title">目標</div><div class="form-card"><div class="form-section"><div class="form-label">名前</div><input class="field" id="eventGoalName" value="${esc(draft.name)}" placeholder="例：名古屋旅行・誕生日"></div><div class="form-section"><div class="form-label">期限</div><input class="field" id="eventGoalDeadline" type="date" value="${draft.deadline}"></div><div class="form-section"><div class="form-label">種類</div><select class="field field-select" id="eventGoalType"><option value="travel" ${draft.type==='travel'?'selected':''}>旅行</option><option value="gift" ${draft.type==='gift'?'selected':''}>プレゼント</option><option value="event" ${draft.type==='event'?'selected':''}>イベント</option><option value="other" ${draft.type==='other'?'selected':''}>その他</option></select></div></div><div class="form-group-title">自分の負担</div><div class="seg" id="eventGoalSplit"><button data-v="self" class="${draft.splitMode==='self'?'on':''}">全額</button><button data-v="equal" class="${draft.splitMode==='equal'?'on':''}">等分</button><button data-v="amount" class="${draft.splitMode==='amount'?'on':''}">金額指定</button></div><div class="form-card" style="margin-top:9px"><div class="form-section" id="eventParticipantsWrap"><div class="form-label">人数</div><input class="field" id="eventParticipants" type="number" min="1" max="20" value="${draft.participants||2}"></div><div class="form-section" id="eventOwnShareWrap">${moneyButton('eventOwnShare','自分の負担額',draft.ownShareAmount||0)}</div></div><div class="form-group-title">費目</div><div id="eventGoalItems"></div><button type="button" class="secondary" id="eventGoalAddItem">費目を追加</button><div class="form-helper">費目は大型支出計画と関連IDでつなぎます。割り勘の相手負担分を、受取前の現金・預金へ足すことはありません。</div></div>`,'full',root=>{
    itemHost=root.querySelector('#eventGoalItems');
    const ownBtn=root.querySelector('#eventOwnShare'),drawItems=()=>{
      itemHost.innerHTML=draft.items.length?`<div class="group">${draft.items.map((i,idx)=>`<div class="pro4-goal-item"><div><strong>${esc(i.name)}</strong><span>${i.plannedDate}・${esc(paymentLabel(i))}</span><div class="pro4-item-actions"><button data-item-edit="${idx}">編集</button><button data-item-delete="${idx}">削除</button></div></div><div class="pro4-goal-item-amount">${yen(i.budget)}</div></div>`).join('')}</div>`:'<div class="empty" style="margin-bottom:9px">宿泊・交通・食事・プレゼントなどを追加してください。</div>';
      itemHost.querySelectorAll('[data-item-edit]').forEach(b=>b.onclick=()=>openGoalItemEditor(draft.items[Number(b.dataset.itemEdit)],root.querySelector('#eventGoalDeadline').value,x=>{
        draft.items[Number(b.dataset.itemEdit)]=x;
        markSheetDirty();
        drawItems()
      }));
      itemHost.querySelectorAll('[data-item-delete]').forEach(b=>b.onclick=()=>{
        draft.items.splice(Number(b.dataset.itemDelete),1);
        markSheetDirty();
        drawItems()
      })
    };
    const syncSplit=()=>{
      root.querySelector('#eventParticipantsWrap').classList.toggle('hidden',draft.splitMode!=='equal');
      root.querySelector('#eventOwnShareWrap').classList.toggle('hidden',draft.splitMode!=='amount')
    };
    root.querySelectorAll('#eventGoalSplit button').forEach(b=>b.onclick=()=>{
      draft.splitMode=b.dataset.v;
      root.querySelectorAll('#eventGoalSplit button').forEach(x=>x.classList.toggle('on',x===b));
      markSheetDirty();
      syncSplit()
    });
    ownBtn.onclick=()=>openCalculator('自分の負担額',draft.ownShareAmount||0,v=>{
      draft.ownShareAmount=v;
      ownBtn.querySelector('.val').textContent=yen(v);
      markSheetDirty()
    });
    root.querySelector('#eventGoalAddItem').onclick=()=>openGoalItemEditor(null,root.querySelector('#eventGoalDeadline').value,x=>{
      draft.items.push(x);
      markSheetDirty();
      drawItems()
    });
    root.querySelector('#eventGoalCancel').onclick=requestSheetClose;
    root.querySelector('#eventGoalSave').onclick=()=>{
      draft.name=root.querySelector('#eventGoalName').value.trim();
      draft.deadline=root.querySelector('#eventGoalDeadline').value;
      draft.type=root.querySelector('#eventGoalType').value;
      draft.participants=Math.max(1,Number(root.querySelector('#eventParticipants').value)||2);
      draft.updatedAt=new Date().toISOString();
      if(!draft.name||!draft.deadline||!draft.items.length||!eventGoalSummary(draft).total)return showAlert('入力内容を確認してください','目標名・期限・1つ以上の費目を入力してください。');
      if(draft.splitMode==='amount'&&draft.ownShareAmount>eventGoalSummary(draft).total)return showAlert('負担額が総費用を超えています','自分の負担額を総費用以下にしてください。');
      try{
        safeCommit(()=>{
          const i=data.eventGoals.findIndex(g=>g.id===draft.id);
          if(i>=0)data.eventGoals[i]=clone(draft);
          else data.eventGoals.push(clone(draft));
          syncEventGoalPlans(draft.id)
        },{render:true,label:'event goal'});
        feedback.success();
        showToast('目標を保存しました');
        closeSheet();
        after?.()
      }catch(e){
        }
    };
    drawItems();
    syncSplit()
  })
}
function completeGoalItem(goalId,itemId,btn=null){return runSaveAction(btn,()=>{const g=data.eventGoals.find(x=>x.id===goalId),i=g?.items.find(x=>x.id===itemId);if(!g||!i||i.status==='paid'||i.status==='cancelled')throw new Error('対象の費目は支払済み、取消済み、または見つかりません');requireFinancialPayment(i.paymentMethod,i.paymentId);const tx=recordExpense({date:i.plannedDate,amount:i.budget,category:i.category,merchant:`${g.name}・${i.name}`,paymentMethod:i.paymentMethod,paymentId:i.paymentId,linkedBankId:i.linkedBankId||'',memo:`目標「${g.name}」`,source:'event_goal',saveNow:false});i.status='paid';i.transactionId=tx?.id||'';const p=data.largeExpensePlans.find(x=>x.id===i.largePlanId||x.goalId===g.id&&x.goalItemId===i.id);if(p){p.status='completed';p.linkedTransactionId=i.transactionId;p.updatedAt=new Date().toISOString()}g.updatedAt=new Date().toISOString()},{label:'goal item paid',afterCommit:refreshFinancialViews,success:'実際の支出として記録しました'})}
function confirmGoalReimbursement(goalId){const g=data.eventGoals.find(x=>x.id===goalId);if(!g)return;const sm=eventGoalSummary(g);if(sm.unrecovered<=0)return showAlert('未回収はありません','現在、受け取る予定の残額はありません。');let amount=sm.unrecovered,toType='cash',bankId=data.banks[0]?.id||'';openSheet(`<div class="sheet-nav"><button class="nav-text" id="reimbCancel">キャンセル</button><div class="sheet-title">割り勘の受取を確認</div><button class="nav-text bold" id="reimbSave">保存</button></div><div class="sheet-body"><div class="hero"><div class="hero-kicker">未回収</div><div class="hero-value">${yen(sm.unrecovered)}</div><div class="hero-sub">受け取った事実を確認した金額だけ残高へ反映します。</div></div><div class="form-card"><div class="form-section">${moneyButton('reimbAmount','今回受け取った額',amount)}</div><div class="form-section"><div class="seg" id="reimbType"><button data-v="cash" class="on">現金・その他</button><button data-v="bank">銀行口座</button></div></div><div class="form-section hidden" id="reimbBankWrap"><select class="field field-select" id="reimbBank">${data.banks.map(b=>`<option value="${b.id}">${esc(b.name)}</option>`).join('')}</select></div></div></div>`,'half',root=>{const a=root.querySelector('#reimbAmount');a.onclick=()=>openCalculator('受取額',amount,v=>{amount=v;markSheetDirty();a.querySelector('.val').textContent=yen(v)});root.querySelectorAll('#reimbType button').forEach(b=>b.onclick=()=>{toType=b.dataset.v;markSheetDirty();root.querySelectorAll('#reimbType button').forEach(x=>x.classList.toggle('on',x===b));root.querySelector('#reimbBankWrap').classList.toggle('hidden',toType!=='bank')});root.querySelector('#reimbCancel').onclick=requestSheetClose;root.querySelector('#reimbSave').onclick=()=>{bankId=root.querySelector('#reimbBank')?.value||'';runSaveAction(root.querySelector('#reimbSave'),()=>{const current=data.eventGoals.find(x=>x.id===goalId);if(!current)throw new Error('目標が見つかりません');if(!(amount>0)||amount>eventGoalSummary(current).unrecovered)throw new Error('未回収額以下の受取額を入力してください');if(toType==='bank')requireFinancialEntity('bank',bankId);const inc=recordIncome({date:ymd(),amount,sourceName:`${current.name} 割り勘回収`,toType,bankId:toType==='bank'?bankId:'',memo:'旅行・プレゼント目標の回収',kind:'reimbursement',applyNow:toType==='bank',saveNow:false});data.reimbursements.push({id:uid('reimb'),goalId:current.id,amount,date:ymd(),toType,bankId:toType==='bank'?bankId:'',incomeId:inc?.id||'',status:'received',createdAt:new Date().toISOString()});current.updatedAt=new Date().toISOString()},{label:'goal reimbursement',afterCommit:refreshFinancialViews,close:closeSheet,success:'受取を記録しました'})}})}
function openEventGoalDetail(id,targetRoot=null){const g=data.eventGoals.find(x=>x.id===id);if(!g)return;const sm=eventGoalSummary(g),paidPct=sm.total?Math.round(sm.paid/sm.total*100):0;presentFinancialView(targetRoot,'目標の詳細',`<div class="hero"><div class="hero-kicker">${esc(g.type==='travel'?'旅行':g.type==='gift'?'プレゼント':g.type==='event'?'イベント':'目標')}・期限 ${dayLabel(g.deadline)}</div><div class="hero-value">${yen(sm.ownShare)}</div><div class="hero-sub">自分の最終負担 / 総費用 ${yen(sm.total)}</div><div class="month-progress"><div class="month-progress-fill" style="width:${clamp(paidPct,0,100)}%"></div></div></div><div class="pro4-goal-metrics"><div><span>総費用</span><strong>${yen(sm.total)}</strong></div><div><span>自分の最終負担</span><strong>${yen(sm.ownShare)}</strong></div><div><span>立替済み</span><strong>${yen(sm.advance)}</strong></div><div><span>相手からの未回収</span><strong class="${sm.unrecovered?'orange':''}">${yen(sm.unrecovered)}</strong></div><div><span>支払済み / 残り</span><strong>${yen(sm.paid)} / ${yen(sm.remaining)}</strong></div><div><span>期限まで週あたり目安</span><strong>${yen(sm.weekly)}</strong></div></div>${sm.unrecovered?'<div class="goal-warning">相手の負担分は、実際に受け取るまで現金・預金へ加算していません。</div>':''}<div class="section-head">費目</div><div class="group">${g.items.map(i=>`<div class="pro4-goal-item"><div><strong>${esc(i.name)}</strong><span>${i.plannedDate}・${esc(paymentLabel(i))}・${i.status==='paid'?'支払済み':'予定'}</span>${i.status!=='paid'&&i.status!=='cancelled'?`<div class="pro4-item-actions"><button data-goal-pay="${i.id}">支出として記録</button></div>`:''}</div><div class="pro4-goal-item-amount">${yen(i.budget)}</div></div>`).join('')}</div><button class="secondary" id="eventGoalEdit">編集</button>${sm.unrecovered>0?'<button class="secondary" id="eventGoalReimburse" style="margin-top:9px">割り勘の受取を確認</button>':''}<button class="secondary danger" id="eventGoalDelete" style="margin-top:9px">目標を削除</button>`,root=>{root.dataset.eventGoalId=id;root.querySelector('#eventGoalEdit').onclick=()=>openEventGoalEditor(data.eventGoals.find(x=>x.id===id),{after:refreshFinancialViews});root.querySelector('#eventGoalReimburse')?.addEventListener('click',()=>confirmGoalReimbursement(g.id));root.querySelectorAll('[data-goal-pay]').forEach(b=>b.onclick=async()=>{const i=g.items.find(x=>x.id===b.dataset.goalPay);if(await showAlert('実際の支出として登録しますか？',`${i.name} ${yen(i.budget)} を実績にします。カードの場合は将来の請求へ反映されます。`,{okText:'登録'})){await completeGoalItem(id,i.id,b)}});root.querySelector('#eventGoalDelete').onclick=async()=>{if(!await showAlert('目標を削除しますか？','この目標から作った未完了の大型支出計画も削除します。実績の取引は削除しません。',{destructive:true,okText:'削除'}))return;try{safeCommit(()=>{const current=data.eventGoals.find(x=>x.id===id);if(!current)throw new Error('目標が見つかりません');current.status='cancelled';data.largeExpensePlans=data.largeExpensePlans.filter(p=>p.goalId!==id||p.status==='completed')},{render:true,label:'delete event goal'});feedback.delete();popView();showToast('目標を削除しました')}catch(e){}}})}

function pro4ExpenseDimensionRows(month,dimension,compareMode='elapsed'){const curTx=txForMonth(month),prevMonth=addMonths(month,-1),elapsed=month===ym()?Number(ymd().slice(8,10)):daysInMonth(month),prevTx=txForMonth(prevMonth).filter(t=>compareMode==='full'||Number(t.date.slice(8,10))<=Math.min(elapsed,daysInMonth(prevMonth))),key=t=>dimension==='merchant'?(t.merchant||'不明'):dimension==='weekday'?'日月火水木金土'[parseYmd(t.date).getDay()]+'曜日':dimension==='payment'?paymentLabel(t):(t.category||'その他'),map=list=>{const m=new Map;for(const t of list)m.set(key(t),(m.get(key(t))||0)+(Number(t.amount)||0));return m},a=map(curTx),b=map(prevTx),keys=[...new Set([...a.keys(),...b.keys()])];return keys.map(k=>({key:k,value:a.get(k)||0,prev:b.get(k)||0,delta:(a.get(k)||0)-(b.get(k)||0)})).filter(x=>x.value||x.prev).sort((x,y)=>y.value-x.value)}
function pro4SalaryRows(month){const recs=salaryRecordsPayableInMonth(month),prev=salaryRecordsPayableInMonth(addMonths(month,-1)),make=list=>{const m=new Map;for(const r of list){const e=employerById(r.employerId),k=e?.name||'勤務先';m.set(k,(m.get(k)||0)+salaryRecordExpectedOrReceivedAmount(r))}return m},a=make(recs),b=make(prev);return [...new Set([...a.keys(),...b.keys()])].map(k=>({key:k,value:a.get(k)||0,prev:b.get(k)||0,delta:(a.get(k)||0)-(b.get(k)||0)})).sort((x,y)=>y.value-x.value)}
function openFilteredTransactions({month,dimension,key}){let list=txForMonth(month);if(dimension==='category')list=list.filter(t=>t.category===key);else if(dimension==='merchant')list=list.filter(t=>t.merchant===key);else if(dimension==='weekday')list=list.filter(t=>'日月火水木金土'[parseYmd(t.date).getDay()]+'曜日'===key);else if(dimension==='payment')list=list.filter(t=>paymentLabel(t)===key);pushView(`${key}の明細`,`<div class="hero"><div class="hero-kicker">${monthLabel(month)}</div><div class="hero-value">${yen(sum(list,t=>t.amount))}</div><div class="hero-sub">${list.length}件</div></div><div class="group">${list.length?list.sort((a,b)=>b.date.localeCompare(a.date)).map(t=>`<button class="row press" data-pro4-tx="${t.id}"><div class="row-main"><div class="row-title">${esc(t.merchant)}</div><div class="row-sub">${t.date}・${esc(t.category)}・${esc(paymentLabel(t))}</div></div><div class="row-value">${yen(t.amount)}</div><span class="chev">›</span></button>`).join(''):'<div class="empty">明細はありません。</div>'}</div>`,root=>root.querySelectorAll('[data-pro4-tx]').forEach(b=>b.onclick=()=>openTransactionDetail(b.dataset.pro4Tx)))}
function pro4ExpenseInsight(month,mode){const rows=pro4ExpenseDimensionRows(month,'category',mode),top=rows.filter(x=>x.delta>0).sort((a,b)=>b.delta-a.delta)[0];if(!top)return'前月と比較できる増加要因はまだありません。';const tx=txForMonth(month).filter(t=>t.category===top.key).sort((a,b)=>b.amount-a.amount),merchant=tx[0]?.merchant;return `${top.key}が前月${mode==='elapsed'?'同期間':''}より ${yen(top.delta)} 増えています。${merchant?`このカテゴリでは「${merchant}」の支出が大きくなっています。`:''}`}
function openReasonAnalysis({kind='expense',month=currentMonth}={}){let dimension=kind==='salary'?'employer':'category',compare='elapsed';pushView(kind==='salary'?'給与分析':'理由が分かる分析','',root=>{const draw=()=>{const body=root.querySelector('.push-body'),rows=kind==='salary'?pro4SalaryRows(month):pro4ExpenseDimensionRows(month,dimension,compare),total=sum(rows,x=>x.value),prev=sum(rows,x=>x.prev),max=Math.max(1,...rows.map(x=>x.value)),cmp=prev?total-prev:null;body.innerHTML=`<div class="hero"><div class="hero-kicker">${monthLabel(month)}・${kind==='salary'?'給与':'支出'}</div><div class="hero-value">${yen(total)}</div><div class="hero-sub">前月${kind==='expense'&&compare==='elapsed'?'同期間':''} ${prev?yen(prev):'比較できる記録なし'}${cmp==null?'':`・差 ${cmp>=0?'+':''}${yen(cmp)}`}</div></div>${kind==='expense'?`<div class="seg" id="analysisCompare" style="margin-bottom:9px"><button data-cmp="elapsed" class="${compare==='elapsed'?'on':''}">同じ経過日数</button><button data-cmp="full" class="${compare==='full'?'on':''}">月全体</button></div><div class="pro4-analysis-tabs">${[['category','カテゴリ'],['merchant','店舗'],['weekday','曜日'],['payment','支払方法']].map(([v,l])=>`<button class="pro4-search-chip ${dimension===v?'on':''}" data-dim="${v}">${l}</button>`).join('')}</div><div class="pro4-insight"><strong>増減の理由</strong><span>${esc(pro4ExpenseInsight(month,compare))}</span></div>`:''}<div class="group">${rows.length?rows.map(x=>`<button class="pro4-analysis-row" data-analysis-key="${esc(x.key)}"><div class="pro4-analysis-row-head"><span>${esc(x.key)}</span><strong>${yen(x.value)}</strong></div><div class="pro4-analysis-bar"><i style="width:${clamp(x.value/max*100,1,100)}%"></i></div><div class="pro4-analysis-sub">前月 ${x.prev?yen(x.prev):'—'}${x.prev?`・差 ${x.delta>=0?'+':''}${yen(x.delta)}`:''}</div></button>`).join(''):'<div class="empty">比較できる記録がありません。</div>'}</div>${kind==='expense'?'<div class="hero-sub" style="margin-top:10px">項目をタップすると、同じ月・同じ条件の明細へ進みます。編集後に戻るとこの分析も最新データで再計算します。</div>':''}`;body.querySelectorAll('[data-cmp]').forEach(b=>b.onclick=()=>{compare=b.dataset.cmp;draw()});body.querySelectorAll('[data-dim]').forEach(b=>b.onclick=()=>{dimension=b.dataset.dim;draw()});body.querySelectorAll('[data-analysis-key]').forEach(b=>b.onclick=()=>{if(kind==='expense')openFilteredTransactions({month,dimension,key:b.dataset.analysisKey});else{const emp=data.employers.find(e=>e.name===b.dataset.analysisKey);if(emp)openEmployerDetail(emp.id)}})};draw()})}
function monthReviewChecksum(month){const payload={transactions:data.transactions.filter(t=>String(t.date).slice(0,7)===month).map(t=>[t.id,t.date,t.amount,t.category,t.paymentMethod,t.paymentId,t.merchant]),salary:data.salaryRecords.filter(r=>String(salaryRecordEffectiveDate(r)).slice(0,7)===month).map(r=>[r.id,r.gross,r.transport,r.receivedAmount,r.status,r.date,r.actualReceivedDate]),cards:data.cardAdjustments,recon:data.statementReconciliations.filter(r=>{const c=cardById(r.cardId);return r.billingMonth===month||(c&&billingMonthForPaymentMonth(c,month)===r.billingMonth)}),reimbursements:data.reimbursements.filter(r=>String(r.date).slice(0,7)===month||data.eventGoals.find(g=>g.id===r.goalId&&String(g.deadline).slice(0,7)===month)),banks:data.banks.map(b=>[b.id,b.balance,b.balanceAsOf,b.updatedAt]),goal:data.monthlyGoals[month]||{},mail:data.mailImports.filter(x=>String(x.date).slice(0,7)===month&&x.status==='pending').map(x=>x.id)};return pro4Hash(payload)}
function monthReviewIssues(month){const issues=[],today=ymd();for(const r of salaryRecordsPayableInMonth(month)){const st=salaryRecordDisplayStatus(r);if(st.includes('未確認'))issues.push({type:'salary',id:r.id,title:'入金日を過ぎた給与',sub:`${employerById(r.employerId)?.name||'給与'}・${yen(salaryRecordExpectedOrReceivedAmount(r))}`})}for(const c of data.cards){for(const st of cardStatementsForPaymentMonth(c.id,month)){if(!st||!Number(st.amount))continue;const rec=statementRecon(c.id,st.billingMonth),linked=rec?sum(data.transactions.filter(t=>rec.linkedTransactionIds.includes(t.id)),t=>statementReconAmountForTransaction(t,c.id,month,st.billingMonth)):0;if(!rec||Math.abs((Number(rec.confirmedAmount)||Number(st.amount))-linked)>=1)issues.push({type:'card',id:c.id,billingMonth:st.billingMonth,title:'カード請求の照合が未完了',sub:`${c.name}・${monthLabel(st.billingMonth)}対象・${yen(st.amount)}`})}}for(const g of data.eventGoals.filter(g=>g.status!=='cancelled'&&String(g.deadline).slice(0,7)<=month)){const sm=eventGoalSummary(g);if(sm.unrecovered>0)issues.push({type:'goal',id:g.id,title:'割り勘の未回収',sub:`${g.name}・${yen(sm.unrecovered)}`})}for(const b of data.banks){const asof=b.balanceAsOf||b.updatedAt||'',ms=Date.parse(asof);if(!asof||!Number.isFinite(ms)||Date.now()-ms>31*86400000)issues.push({type:'bank',id:b.id,title:'残高の確認が古い口座',sub:`${b.name}・${asof?new Date(ms).toLocaleDateString('ja-JP'):'確認日時なし'}`})}const pending=data.mailImports.filter(x=>String(x.date).slice(0,7)===month&&x.status==='pending').length;if(pending)issues.push({type:'mail',id:'',title:'未確認のGmail取引',sub:`${pending}件`});const goal=monthlyGoal(month),spent=spentMonth(month);if(goal.total&&Math.abs(spent-goal.total)>0)issues.push({type:'budget',id:'',title:'月間予算との差異',sub:`目標 ${yen(goal.total)} / 実績 ${yen(spent)} / 差 ${spent-goal.total>=0?'+':''}${yen(spent-goal.total)}`});return issues}
function pro4OpenReviewIssue(i,month=currentMonth){if(i.type==='salary')openSalaryRecordEdit(i.id);else if(i.type==='card')openStatementReconciliation(i.id,month,i.billingMonth||'');else if(i.type==='goal')openEventGoalDetail(i.id);else if(i.type==='bank')openBankDetail(i.id);else if(i.type==='mail')openUnknownMail();else if(i.type==='budget')openReasonAnalysis({kind:'expense',month})}
function openMonthCloseReview(month=currentMonth){pushView('月締めレビュー','',root=>{const draw=()=>{const body=root.querySelector('.push-body'),issues=monthReviewIssues(month),checksum=monthReviewChecksum(month),saved=data.monthReviews[month],unchanged=!!saved&&saved.checksum===checksum;body.innerHTML=`<div class="pro4-review-state"><div><strong>${unchanged?'確認済み':'確認が必要です'}</strong><span>${saved?`前回 ${new Date(saved.reviewedAt).toLocaleString('ja-JP')} に確認${unchanged?'・その後の変更なし':'・その後に記録が変更されています'}`:'この月はまだ締めレビューをしていません。'}</span></div><span class="status-chip ${unchanged?'good':'warning'}">${unchanged?'確認済み':'要確認'}</span></div><div class="hero"><div class="hero-kicker">${monthLabel(month)}・確認項目</div><div class="hero-value">${issues.length}件</div><div class="hero-sub">過去月を編集禁止にはしません。確認後にデータが変わると自動的に「要確認」へ戻ります。</div></div><div class="section-head">確認する項目</div><div class="group">${issues.length?issues.map((i,n)=>`<button class="pro4-review-issue" data-review-issue="${n}"><div class="pro4-review-icon">!</div><div><strong>${esc(i.title)}</strong><span>${esc(i.sub)}</span></div><span class="chev">›</span></button>`).join(''):'<div class="row"><div class="row-main"><div class="row-title">大きな未確認項目は見つかりませんでした</div><div class="row-sub">登録済みデータの範囲で確認しています。</div></div></div>'}</div><button class="primary" id="monthReviewConfirm">${unchanged?'確認済みとして更新':'この内容を確認済みにする'}</button><div class="hero-sub" style="margin-top:9px">月締めはレビュー状態の記録です。過去月の編集は引き続き可能です。</div>`;body.querySelectorAll('[data-review-issue]').forEach(b=>b.onclick=()=>pro4OpenReviewIssue(issues[Number(b.dataset.reviewIssue)],month));body.querySelector('#monthReviewConfirm').onclick=()=>{try{safeCommit(()=>data.monthReviews[month]={reviewedAt:new Date().toISOString(),checksum:monthReviewChecksum(month),issueCount:issues.length},{render:false,label:'month review'});feedback.success();showToast('月締めレビューを記録しました');draw()}catch(e){}}};draw()})}



/* === end Part 4 / Pro 7-9 core === */

/* === Final 5/5 integrity helpers === */

/* === end Final 5/5 integrity helpers === */



function renderAll(){try{processScheduled()}catch(e){mm3AllowInternalStateWrite(()=>{data.meta={...(data.meta||{}),storageWriteError:true}});console.error('scheduled processing failed',e)}try{pruneDayClosingJournal();pruneExpiredSystemNotices();generateSystemNotices();for(const view of pushStack)document.getElementById(view.id)?.__refreshNotices?.()}catch(e){mm3AllowInternalStateWrite(()=>{data.meta={...(data.meta||{}),storageWriteError:true}});console.error('notice generation failed',e)}for(const view of pushStack){const root=document.getElementById(view.id);root?.__refreshDayClosing?.();root?.__refreshFinancialUpdates?.()}applyAppearance();if(activeTab==='today')renderToday();else if(activeTab==='month')renderMonth();else if(activeTab==='pay')renderPay();else if(activeTab==='payments')renderPayments();else if(activeTab==='assets')renderAssets();else renderSettings();updateHomeTabButton();if(data.meta?.storageWriteError&&!storageErrorToastShown){storageErrorToastShown=true;setTimeout(()=>showToast('端末へ保存できません。空き容量やSafariのストレージ設定を確認してください。',{tone:'error',duration:7000}),0)}}
updateHomeTabButton();
/* === end IA patch === */



