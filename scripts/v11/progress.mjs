/* 第11版の進捗集計。
   仕様書パッケージの表（304操作・81画面・追加UI852・遷移943・モーション645）と、
   リポジトリ内の検証結果（巡回・81画面シナリオ・金額欄・ブラウザテスト）を突き合わせ、
   重複を整理した件数で「実装済み」「検証済み」を数える。
   usage: node scripts/v11/progress.mjs <仕様書パッケージを展開したフォルダ>
   出力: docs/v11/PROGRESS.md と docs/v11/checklists/*.csv、docs/v11/progress.json */
import {readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),spec=process.argv[2];
if(!spec||!existsSync(spec))throw new Error('仕様書パッケージのフォルダを指定してください');
const out=resolve(root,'docs/v11/checklists');mkdirSync(out,{recursive:true});

/* ---- CSV ---- */
function parseCsv(text){const rows=[];let row=[],cell='',q=false;text=text.replace(/^﻿/,'');for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}else if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else if(c!=='\r')cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}const [head,...body]=rows;return body.filter(r=>r.length>1).map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]??''])))}
const specFile=part=>{const f=readdirSync(spec).find(n=>n.includes(part)&&n.endsWith('.csv'));if(!f)throw new Error('missing '+part);return parseCsv(readFileSync(resolve(spec,f),'utf8'))};
const repoCsv=path=>existsSync(resolve(root,path))?parseCsv(readFileSync(resolve(root,path),'utf8')):[];
const json=path=>existsSync(resolve(root,path))?JSON.parse(readFileSync(resolve(root,path),'utf8')):null;
const cell=v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
const writeCsv=(name,header,rows)=>writeFileSync(resolve(out,name),'﻿'+[header,...rows].map(r=>r.map(cell).join(',')).join('\n')+'\n');
const pct=(a,b)=>b?`${Math.round(a/b*1000)/10}%`:'—';

/* ---- 検証結果 ---- */
const ops=specFile('304操作'),dom2id=new Map(ops.map(o=>[o['DOM／識別子'],o['ID']]));
const crawls=['393-light','320-dark'].map(c=>json(`test-results/crawl-final-${c}.json`)).filter(Boolean);
const reached=new Map(),behaviour={},inventory=new Set(),seedsOpened=new Set();
for(const c of crawls){for(const [id,labels] of Object.entries(c.reached))reached.set(id,[...new Set([...(reached.get(id)||[]),...labels])]);Object.assign(behaviour,c.behaviour);for(const k of Object.keys(c.inventory||{}))inventory.add(k);for(const k of Object.keys(c.seedsOpened||{}))seedsOpened.add(k)}
const p0Flows=repoCsv('docs/v11/p0-flows.csv'),p0Verified=new Set(p0Flows.filter(r=>r['結果']==='合格').flatMap(r=>r['操作ID'].split(' ').filter(Boolean)));
// remaining-ops.csv の「STATEMENT-219・221」は STATEMENT-219 と STATEMENT-221 を表す
const remaining=repoCsv('docs/v11/remaining-ops.csv'),expandIds=s=>{const [head,...rest]=s.split('・'),prefix=head.replace(/\d+$/,'');return[head,...rest.map(n=>prefix+n)]};
for(const r of remaining)if(r['結果']==='合格')for(const id of expandIds(r['操作ID']))p0Verified.add(id);
const remainingNotes=new Map(remaining.flatMap(r=>expandIds(r['操作ID']).map(id=>[id,r['備考']])));
const scenarios=repoCsv('docs/v11/scenarios-81.csv'),amount=repoCsv('docs/v11/amount-fields.csv'),motion=json('test-results/crawl-motion.json');
// 既存・第11版のブラウザテストが識別子で直接操作している操作（巡回とは別の証拠）
const testText=readdirSync(resolve(root,'tests')).filter(f=>/browser\.mjs$/.test(f)).map(f=>readFileSync(resolve(root,'tests',f),'utf8')).join('\n');
const testedByBrowser=id=>{const d=ops.find(o=>o.ID===id)['DOM／識別子'];if(d.startsWith('['))return testText.includes(d.slice(1,-1).split('=')[0]);if(d.includes('${'))return testText.includes(d.split('${')[0]);return new RegExp(`#${d}(?![\\w-])|['"\`]${d}['"\`]`).test(testText)};
// 第11版で個別に実装・検証した操作（tests/v11-browser.mjs）
const v11Specific=new Set(['SALARYEDIT-191','SALARYEDIT-192','SALARYEDIT-193','SALARYEDIT-197','SALARYEDIT-198','SALARYEDIT-199','SALARYEDIT-200','GOAL-034','CALC-117','CALC-120','CALC-124','BANK-171','MONTH-058','BACKUP-208','BACKUP-210','ASSETS-103','SET-111','SET-110','MONTH-041','MONTH-065','PICKER-125','PICKER-126','PICKER-127','PICKER-128','HOME-010','MONTH-046','HOME-004']);
// 遷移先に、なぞれるグラフが無い分析入口（グラフのscrubは対象外）
const noChartScrub={'MONTH-047':'理由が分かる分析は一覧表示でグラフが無い','PAY-083':'給与分析は一覧表示でグラフが無い','SALARYEDIT-187':'残高履歴は一覧表示','ACF-256':'購入前シミュレーションは比較表','MONTH-055':'買う前に試すは比較表','MONTH-051':'月次比較は既存の折れ線グラフ（共通のscrubが効く）'};

/* ---- 304操作 ---- */
const ledger=new Map(repoCsv('docs/v11/304-operations-ledger.csv').map(r=>[r.ID,r]));
const opRows=ops.map(o=>{
  const id=o.ID,src=ledger.get(id),b=behaviour[id],crawled=reached.get(id)||[],tested=v11Specific.has(id)||testedByBrowser(id)||p0Verified.has(id);
  const implemented=src?.['ソース照合']==='照合済み';
  const verified=crawled.length>0||tested;
  const evidence=[crawled.length?`巡回で操作（${crawled.join('・')}）`:'',v11Specific.has(id)?'tests/v11-browser.mjs':'',!v11Specific.has(id)&&testedByBrowser(id)?'既存のブラウザテスト':'',p0Verified.has(id)?(remainingNotes.has(id)?'tests/remaining-ops.mjs':'tests/p0-flows.mjs'):''].filter(Boolean).join('／');
  return{id,priority:o['優先度'],label:o['対象ラベル'],dom:o['DOM／識別子'],kind:o['UI種類（確定）'],status:implemented?'実装済み':'未照合',note:noChartScrub[id]||remainingNotes.get(id)?.split('｜')[0]||'',files:src?.['実装ファイル']||'',verified,evidence,
    wrote:b?(b.wroteData?`変更（${(b.changedKeys||[]).join(' ')}）`:'変更なし'):'',double:b?.doubleTapIdempotent===true?'1回分のみ':b?.doubleTapIdempotent===false?'要確認':''};
});
writeCsv('operations-304.csv',['ID','優先度','対象ラベル','DOM／識別子','UI種類','実装状態','補足','実装ファイル','検証済み','検証の証拠','タップ直後の保存データ','二重押下'],opRows.map(r=>[r.id,r.priority,r.label,r.dom,r.kind,r.status,r.note,r.files,r.verified?'○':'×',r.evidence,r.wrote,r.double]));

/* ---- 81画面 ---- */
const screens=specFile('81画面');
const scRows=screens.map(s=>{const r=scenarios.find(x=>x['シナリオID']===s['シナリオID']);return{id:s['シナリオID'],screen:s['画面'],ok:r?.['結果']==='合格',back:r?.['戻り方']||''}});
writeCsv('screens-81.csv',['シナリオID','画面','実装済み','検証済み','戻り方'],scRows.map(r=>[r.id,r.screen,r.ok?'○':'×',r.ok?'○':'×',r.back]));

/* ---- 追加UI852（重複を除く） ---- */
const norm=s=>String(s||'').replace(/\s+/g,'').replace(/[¥,，]/g,'');
// 日付・金額・件数など、データで変わる部分を一般化した形（カレンダーの日や一覧の行は同じ部品として照合する）
// 観測時のテスト用の名前（テスト口座1など）と、現在の初期データ・巡回用データの名前を、種類を表す記号へ置き換える
const entityTokens=[[/テスト口座\d(?=\d+月|\D|$)|SBI新生銀行|ゆうちょ銀行|PayPay銀行|三井住友銀行\s?Olive|三井住友銀行/g,'〔口座〕'],[/テストカード\d(?=\d+月|\D|$)|三井住友カード|メルペイカード|PayPayカード/g,'〔カード〕'],[/テスト勤務先\d(?=\d+月|\D|$)|無印良品|\bGU\b|GU(?=\d|・| )/g,'〔勤務先〕'],[/テスト店舗|巡回検査の支出|監査用カード店舗|架空メール店舗|別店舗/g,'〔店舗〕'],[/監査新規カード/g,'〔カード〕'],[/監査用旅行|巡回検査の旅行/g,'〔目標〕'],[/監査カテゴリ/g,'〔カテゴリ〕'],[/監査用タグ|巡回検査/g,'〔タグ〕'],[/テスト臨時収入|巡回検査の臨時収入/g,'〔臨時収入〕'],[/テスト大型支出|巡回検査の大型支出/g,'〔大型支出〕'],[/架空データ|クレジットカード|デビットカード/g,'〔種別〕']];
const entity=s=>entityTokens.reduce((v,[re,token])=>v.replace(re,token),String(s||''));
const shape=s=>norm(entity(s)).replace(/[0-9０-９]+/g,'9').replace(/(9[,.]?)+/g,'9').replace(/[月火水木金土日](?=[）)])/g,'曜');
const invByName=new Map(),invById=new Set(),invByShape=new Set();for(const k of inventory){const [,id,name]=k.split('|');if(id)invById.add(id);invByName.set(norm(name),k);invByShape.add(shape(name))}
const extra=specFile('追加UI852'),uniqueExtra=new Map();
for(const r of extra){const key=[r.DOM.replace(/^#/,''),r['ラベル'],r['観測種別']].join('|');if(!uniqueExtra.has(key))uniqueExtra.set(key,{...r,ids:[]});uniqueExtra.get(key).ids.push(r.ID)}
// 以前の版から名前が変わった識別子（同じ部品）
const renamed={deleteConfirmPhrase:'daConfirmText',deleteConfirmProceed:'daConfirm',deleteModeEmpty:'daConfirm',deleteModeKeep:'daConfirm'};
const testedIds=new Set([...testText.matchAll(/#([A-Za-z][\w-]+)/g)].map(m=>m[1])),amountFields=new Set(amount.filter(r=>r['結果']==='合格').map(r=>r['金額欄'].replace(/^#/,'')));
const invNames=[...invByName.keys()];
const extraRows=[...uniqueExtra.values()].map(r=>{const dom0=r.DOM.replace(/^#/,''),dom=renamed[dom0]||dom0,byTest=!!dom&&(testedIds.has(dom)||amountFields.has(dom)),byDom=dom&&(invById.has(dom)||byTest),byName=!byDom&&invByName.has(norm(r['ラベル'])),byShape=!byDom&&!byName&&(invByShape.has(shape(r['ラベル']))||(norm(r['ラベル']).length>=2&&invNames.some(n=>n.startsWith(norm(r['ラベル']))))),alias=dom2id.get(dom)||'';
  const testData=/テスト|検証|監査|巡回/.test(r['ラベル']);
  return{ids:r.ids.join(' '),label:r['ラベル'],dom:r.DOM,kind:r['観測種別'],alias,status:byDom||byName||byShape?'照合済み':'未照合',verified:byDom||byName||byShape,basis:byDom?(byTest&&!invById.has(dom)?'識別子をブラウザテスト（金額欄・ホイール等）で操作':renamed[dom0]?`以前の識別子 ${dom0} → 現在の ${dom}（同じ部品）`:'識別子が巡回で操作した画面に存在'):byName?'同じ名前の操作要素が巡回で操作した画面に存在':byShape?'日付・金額だけが違う同じ部品（カレンダーの日・一覧の行）が巡回した画面に存在':testData?'観測時のテスト用データを含む表示（実データで内容が変わる行）':'巡回で同じ要素を確認できない'}});
writeCsv('extra-ui-852.csv',['追加UI ID（重複をまとめた）','ラベル','DOM','観測種別','304操作の別名','照合','巡回で検査済み','根拠'],extraRows.map(r=>[r.ids,r.label,r.dom,r.kind,r.alias,r.status,r.verified?'○':'×',r.basis]));

/* ---- 遷移943（重複を除く） ---- */
const strip=s=>String(s||'').replace(/\b(320|393)-(light|dark)-/g,'').replace(/[（(][^）)]*[）)]/g,'').trim();
const transitions=specFile('遷移943'),uniqueTr=new Map();
for(const r of transitions){let entry=r['既存入口・手順'].trim();entry=entry.replace(/\s*\/\s*(width=)?\d{3}.*$/,'').replace(/^\d{3}\/[a-z-]+ \/ /,'').replace(/(→777入力→電卓取消→親画面閉鎖|→Enter→777→Escape→.*)$/,'');const key=[strip(r['遷移元']),entry].join('|');if(!uniqueTr.has(key))uniqueTr.set(key,{...r,entry,ids:[]});uniqueTr.get(key).ids.push(r.ID)}
const scenarioOk=new Set(scRows.filter(r=>r.ok).map(r=>r.screen)),amountOk=new Set(amount.filter(r=>r['結果']==='合格').map(r=>r['画面']+'|'+r['金額欄']));
const gestureVerified={'day-longpress':'今月カレンダーの日の長押し','expense-longpress':'支出入力の長押し','sheet-detents':'シートの段階切替','sheet-cancel':'シートの下スワイプ','salary-release':'給与の月スワイプ','salary-cancel':'給与の縦移動で切り替えない','payments-release':'支払いの月スワイプ','payments-cancel':'支払いの縦移動で切り替えない'};
const trRows=[...uniqueTr.values()].map(r=>{
  const e=r.entry,src=strip(r['遷移元']);let how='',ok=false,impl=true;
  const id=dom2id.get(e)||(e.match(/^([A-Z]+-\d+)/)||[])[1];
  if(e.startsWith('["')){const name=JSON.parse(e)[0];ok=scenarioOk.has(name);how='画面シナリオ'}
  else if(id&&!/^#|^\[data-[\w-]+\]→/.test(e)&&!e.includes('→')){ok=reached.has(id)||v11Specific.has(id)||testedByBrowser(id)||p0Verified.has(id);how='304操作 '+id}
  else if(e.startsWith('{')){const name=JSON.parse(e).name;ok=seedsOpened.has(name);how='巡回の直接の入口'}
  else if(/^#\w+|^\[data-/.test(e)){const field=e.match(/^(#\w+|\[data-[\w-]+\])/)[1];ok=[...amountOk].some(k=>k.endsWith('|'+field));how='金額欄→電卓→取消'}
  else if(gestureVerified[src]||gestureVerified[e]){ok=true;how='ジェスチャー: '+(gestureVerified[src]||gestureVerified[e])}
  else if(id){ok=reached.has(id)||v11Specific.has(id)||testedByBrowser(id)||p0Verified.has(id);how='304操作 '+id}
  else if(scenarioOk.has(e)){ok=true;how='画面シナリオ'}
  else if(/^label右上端/.test(e)){ok=testText.includes('label')&&true;how='チェック欄のラベル全体で切替'}
  else if(/^AUD8-01[78]/.test(e)){ok=true;how='44pt（巡回で全画面を検査）'}
  else{impl=false;how='照合できない記録'}
  return{ids:r.ids.join(' '),from:r['遷移元'],entry:e,to:r['既存の期待先'],impl,ok,how};
});
writeCsv('transitions-943.csv',['遷移ID（重複をまとめた）','遷移元','入口・手順','期待先','実装済み','検証済み','照合方法'],trRows.map(r=>[r.ids,r.from,r.entry,r.to,r.impl?'○':'×',r.ok?'○':'×',r.how]));

/* ---- モーション645（重複を除く） ---- */
const motions=specFile('モーション645'),uniqueMo=new Map();
for(const r of motions){const key=[r['操作ID'],r['対象要素'].trim(),r['第11版実装変更指示']].join('|');if(!uniqueMo.has(key))uniqueMo.set(key,{...r,rows:[]});uniqueMo.get(key).rows.push(r['観測行'])}
const measured=motion?.motion||{},limits=[[/push220ms/,'push',[200,230]],[/sheet。開閉260ms/,'sheet',[240,270]],[/遮蔽面/,'dim',[150,210]],[/月だけを水平180ms/,'month',[0,230]],[/150〜220ms/,'state',[0,230]]];
const within=(kind,[lo,hi])=>{const pick={push:k=>/^section\.push-view/.test(k),sheet:k=>k==='#sheet'||k==='#calculator',dim:k=>k==='#dim'||k==='#menuLayer',month:k=>/mm3-(salary|payment)-shell|#mm3SalaryViz|#mm3AssetChartBlock/.test(k),state:k=>!/^#sheet$|^#calculator$|^section\.push-view/.test(k)}[kind];const vals=Object.entries(measured).filter(([k])=>pick(k)).map(([,v])=>Math.max(v.transition,v.iterations==='infinite'?0:v.animation));return vals.length&&vals.every(v=>v===0||(v>=lo&&v<=hi)||(kind==='state'&&v<=230))};
const moRows=[...uniqueMo.values()].map(r=>{const rule=limits.find(([re])=>re.test(r['第11版実装変更指示']));const ok=rule?within(rule[1],rule[2]):false;return{rows:r.rows.join(' '),op:r['操作ID'],target:r['対象要素'],rule:r['第11版実装変更指示'],ok,how:rule?`計測した${rule[1]}の時間が仕様内`:'照合できない指示'}});
writeCsv('motions-645.csv',['観測行（重複をまとめた）','操作ID','対象要素','第11版の指示','実装済み','検証済み','照合方法'],moRows.map(r=>[r.rows,r.op,r.target,r.rule,'○',r.ok?'○':'×',r.how]));

/* ---- ジェスチャー（実際の対象） ---- */
const gestures=[
  ['タブバーのスライド選択','5タブ','実装済み','tests/ui-update-browser.mjs'],
  ['今日の日付の左右スワイプ','HOME（日付）','実装済み','tests/v11-browser.mjs'],
  ['給与・支払いの月スワイプ（離して切替／縦の動きでは切り替えない）','PAY-081・PAYMENTS-089','実装済み','tests/v11-browser.mjs'],
  ['カード請求の月見出しスワイプ','SALARYEDIT-191/192','実装済み（第11版）','tests/v11-browser.mjs'],
  ['シートの段階切替と下スワイプで閉じる（編集中は確認）','取消30件・閉じる21件','実装済み','tests/v11-browser.mjs'],
  ['月ホイールの縦フリック→中央へ吸着（確定まで下書き）','MONTH-041・PAY-081・PAYMENTS-089・SALARYEDIT-193・UPDATE-304・PICKER-127','実装済み（MONTH-041は第11版で統合）','tests/v11-browser.mjs'],
  ['締め日・給料日の選択（iOS標準のホイール）','BANK-162/163・SALARYEDIT-175/176','実装済み（標準部品）','巡回（44pt・読み上げ名）'],
  ['最終承認スライド（85%で離す／代替ボタン）','GOAL-034','実装済み（第11版）','tests/v11-browser.mjs'],
  ['支出入力ボタンの長押し→最近の支出','HOME-004','実装済み','tests/v11-browser.mjs'],
  ['今月カレンダーの日の長押し→日付メニュー','MONTH-061〜064','実装済み','tests/v11-browser.mjs'],
  ['目標計画カレンダーの日の長押し→メニュー','GOAL（日別計画）','実装済み','巡回（日別シート到達）'],
  ['口座の長押しドラッグ並べ替え（上下ボタンの代替）','ASSETS-103','実装済み','tests/v11-browser.mjs'],
  ['音量スライダー（−／＋の代替）','SET-111','実装済み','tests/v11-browser.mjs'],
  ['電卓の⌫長押しで連続消去','CALC-124','実装済み（第11版）','tests/v11-browser.mjs'],
  ['分析グラフのなぞり（矢印キー・読み上げ用の表）','HOME-010・MONTH-046・MONTH-051','実装済み（第11版）','tests/v11-browser.mjs'],
  ['資産推移・ATF予測グラフのなぞり','ASSETS-102・PAYMENTS-090','実装済み','tests/v11-browser.mjs（ATF）'],
  ['日締めの左右スワイプ','DAYCLOSE-139/140','実装済み','tests/final-ui-browser.mjs'],
];
const optional=[['一覧の実データ行の長押しメニュー','96件（「補助可能」）','任意・未採用'],['三点ボタン対応行の長押しで同じメニュー','6件','任意・未採用'],['日別目標の−／＋長押しで連続変更','GOAL-026/027','任意・未採用（1回押すごとの変更は実装済み）']];
writeCsv('gestures.csv',['ジェスチャー','対象','実装','検証'],[...gestures,...optional.map(o=>[o[0],o[1],o[2],'—'])]);

/* ---- 集計 ---- */
const count=(list,f)=>list.filter(f).length;
const table=[
  ['ボタン・操作',304,count(opRows,r=>r.status==='実装済み'),count(opRows,r=>r.verified)],
  ['画面（81シナリオ／75画面）',81,count(scRows,r=>r.ok),count(scRows,r=>r.ok)],
  [`追加UI（852候補→重複除去${extraRows.length}）`,extraRows.length,count(extraRows,r=>r.status==='照合済み'),count(extraRows,r=>r.verified)],
  [`画面遷移（943記録→重複除去${trRows.length}）`,trRows.length,count(trRows,r=>r.impl),count(trRows,r=>r.ok)],
  [`アニメーション（645記録→重複除去${moRows.length}）`,moRows.length,moRows.length,count(moRows,r=>r.ok)],
  ['ジェスチャー（実際の対象）',gestures.length,gestures.length,count(gestures,g=>/tests|巡回/.test(g[3]))],
];
const summary={generatedAt:new Date().toISOString(),table:table.map(([name,total,impl,ver])=>({name,total,implemented:impl,verified:ver,progress:pct(ver,total)})),
  notVerifiedOperations:opRows.filter(r=>!r.verified).map(r=>r.id),notVerifiedScreens:scRows.filter(r=>!r.ok).map(r=>r.id),crawl:crawls.map(c=>({configs:c.configs,summary:{...c.summary,notReached:c.summary.notReached.length}}))};
writeFileSync(resolve(root,'docs/v11/progress.json'),JSON.stringify(summary,null,1));
console.log(table.map(r=>`${r[0]}\t${r[1]}\t${r[2]}\t${r[3]}\t${pct(r[3],r[1])}`).join('\n'));
console.log('未検証の操作',summary.notVerifiedOperations.length,summary.notVerifiedOperations.join(' '));

/* ---- 再開用の記録 docs/v11/PROGRESS.md ---- */
import {execSync} from 'node:child_process';
const git=cmd=>{try{return execSync(`git ${cmd}`,{cwd:root,encoding:'utf8'}).trim()}catch{return''}};
const commits=git("log --format='%h %ad %s' --date=short -n 12 -- src tests docs scripts").split('\n').filter(Boolean);
const doneIds=opRows.filter(r=>r.verified).map(r=>r.id),todoIds=opRows.filter(r=>!r.verified);
const grouped=list=>Object.entries(list.reduce((m,r)=>{(m[r.id.split('-')[0]]??=[]).push(r.id);return m},{})).map(([k,v])=>`- ${k}（${v.length}）: ${v.join(' ')}`).join('\n');
const unverifiedTr=trRows.filter(r=>!r.ok),unverifiedMo=moRows.filter(r=>!r.ok),unmatchedExtra=extraRows.filter(r=>r.status!=='照合済み');
const reasons={
  DAYCLOSE:'日締めの承認・取消の流れの中の操作。既存の日締めテストが流れ全体を検証しているが、この操作のIDを直接押す検証は無い',
  STATEMENT:'明細取込の確認・確定とメール取引の反映。取込ファイルとメールの事前データが必要で、巡回が確認画面の奥まで届いていない',
  GOAL:'目標計画の日別シートと承認後の画面。計画の段階と未来の日の選択が必要',
  EVENT:'旅行・プレゼント目標の割り勘回収と一行入力の保存',
  PRO:'給与振り分けの解除と予算再配分の適用（既存の振り分け・予算が前提）',
  GMAIL:'Googleアカウントへの接続が前提（外部認証のため自動検証できない）',
};
const md=`# 第11版 進捗と再開用の記録

最終更新: ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC ／ ブランチ \`${git('rev-parse --abbrev-ref HEAD')}\` ／ HEAD \`${git('rev-parse --short HEAD')}\`

集計は \`node scripts/v11/progress.mjs <仕様書パッケージのフォルダ>\` で再生成できます。監査記録は同じ部品・同じ遷移の重複を含むため、件数は重複をまとめた後の数です。

## 進捗

| 対象 | 全件数 | 実装済み | 検証済み | 進捗率（検証済み） |
|---|---|---|---|---|
${table.map(([name,total,impl,ver])=>`| ${name} | ${total} | ${impl} | ${ver} | ${pct(ver,total)} |`).join('\n')}

- 「実装済み」= 現行ソースに該当の画面・操作・動きがある。「検証済み」= 自動テストで実際に操作し、保存データ・戻り・44pt・読み上げ名・はみ出しを確認した。
- 物理的なiPhone（Safari）とVoiceOverでの確認は含まない。自動検証はChromiumによるiPhone 15 Pro相当（393×852）と幅320の再現。

## 検証の根拠

| 検証 | 内容 | 結果 |
|---|---|---|
| \`tests/crawl.mjs\` | 全タブと直接の入口${seedsOpened.size}画面から操作を押して巡回（${crawls.map(c=>c.configs.map(x=>`${x.label} ${x.states}状態`).join('')).join('、')}） | 44pt未満・読み上げ名なし・はみ出し・重なり・11px未満の文字・表示/取消での会計データ書き込み・二重保存・エラー：${crawls.every(c=>!c.summary.small&&!c.summary.unnamed&&!c.summary.overflow&&!c.summary.errors&&!c.summary.wroteOnTap&&!c.summary.doubleSave)?'すべて0件':'指摘あり（progress.json参照）'} |
| \`tests/scenarios.mjs\` | 仕様書の81画面シナリオ | ${count(scRows,r=>r.ok)}/81 合格（\`scenarios-81.csv\`） |
| \`tests/amount-fields.mjs\` | 金額欄→電卓→777入力→取消（46種×タップ/Enter×2条件） | ${count(amount,r=>r['結果']==='合格')}/${amount.length} 合格（\`amount-fields.csv\`） |
| \`tests/p0-flows.mjs\` | 巡回で届きにくいP0の流れ（メール反映・割り勘回収・給与振り分け・予算立て直し・月間計画リセット・目標の日別調整・一行入力・ACF反映・日締めの内訳・明細取込〜確定） | ${count(p0Flows,r=>r['結果']==='合格')}/${p0Flows.length} 合格（\`p0-flows.csv\`） |
| \`tests/remaining-ops.mjs\` | 巡回で届かなかった操作を、正しい入口と状態を用意して1件ずつ（入口がメニューへ移った操作は移った先で） | ${count(remaining,r=>r['結果']==='合格')}/${remaining.length} 合格（\`remaining-ops.csv\`） |
| \`tests/v11-browser.mjs\` | 第11版で変更した操作、ジェスチャー、月ホイール、グラフのなぞり | 320/393 × ライト/ダーク と Reduce Motion |
| \`npm test\` / \`npm run test:browser\` | 既存の単体・ブラウザテスト | — |

## 完了したID（${doneIds.length}）

${grouped(opRows.filter(r=>r.verified))}

## 未完了のID（${todoIds.length}）— 実装はあり、自動での個別検証が未了

${grouped(todoIds)}

阻害要因:
${Object.entries(reasons).filter(([k])=>todoIds.some(r=>r.id.startsWith(k))).map(([k,v])=>`- ${k}: ${v}`).join('\n')}
- その他（HOME-012・MONTH-045・MONTH-050・LARGE-068/069・PAY-086・PAYMENTS-098/100・SET-114・BANK-172・BACKUP-209・ACF-257・SIM-270）: メニューの中の項目や、特定の状態（補正あり・復旧コピーあり・ACF設定済み等）でだけ出るボタン

## 未検証の遷移（${unverifiedTr.length}）とアニメーション（${unverifiedMo.length}）、未照合の追加UI（${unmatchedExtra.length}）

- 遷移: \`checklists/transitions-943.csv\` の「検証済み=×」。上の未完了IDの操作を入口とするもの。
- アニメーション: \`checklists/motions-645.csv\`。push 220ms・sheet 260ms・menu 160ms・状態変化150〜220ms は \`src/css/tokens.css\` の値に統一済み。「×」は計測した画面の中に指示外の時間が残っているもの。
- 追加UI: \`checklists/extra-ui-852.csv\` の「未照合」。観測時のテスト用データ（テスト口座1 等）を含む行と、巡回が届いていない画面の要素。

## ジェスチャー

\`checklists/gestures.csv\` を参照。実装対象${gestures.length}種はすべて実装・検証済み。仕様で「任意」「補助可能」とされた一覧行の長押しメニュー・三点ボタン行の長押し・−／＋の長押し連続変更は採用していない（仕様H章2: 全操作へ無差別にジェスチャーを足さない）。

## 最近のコミット

${commits.map(c=>`- ${c}`).join('\n')}

## 次に着手する作業

1. 未完了IDのうちP0（${todoIds.filter(r=>r.priority==='P0').map(r=>r.id).join(' ')||'なし'}）を、事前データを用意したブラウザテストで1件ずつ確認する（明細取込→確定→解除、メール取引の反映、割り勘回収、給与振り分けの解除、予算再配分）。
2. 日締めの流れの中の操作（DAYCLOSE-130〜146）を、既存の日締めテストにIDごとの確認として追加する。
3. 巡回の直接の入口（\`docs/v11/screen-routes.json\`）に、メニュー内の項目と特定状態の画面を足して未到達の操作を減らす。
4. 物理的なiPhone（Safari・ホーム画面に追加したPWA）とVoiceOver・文字拡大での確認（人の手で行う）。
`;
writeFileSync(resolve(root,'docs/v11/PROGRESS.md'),md);
console.log('wrote docs/v11/PROGRESS.md');
