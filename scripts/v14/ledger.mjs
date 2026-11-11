/* 第14版の完了報告台帳をつくる（docs/v14/）。
   - ui-111.csv: 設計ID／現行HTML ID・セレクタ／ソースと関数／変更前／変更後（スクリーンショット）／操作・遷移テスト／副作用テスト／コミット／完了状態
   - transitions-85.csv: 遷移IDごとに、使っている設計IDの検査結果
   - legacy-304.csv: 旧304操作の新しい入口と、到達・動作の検証
   - PROGRESS.md: 件数と未完了の一覧
   設計IDはUI仕様の追跡用IDであり、現行DOMに同名の要素があるとは限らない（下の対応表で実DOMを明記する）。 */
import {readFileSync, writeFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execSync} from 'node:child_process';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),v14=resolve(root,'docs/v14');
const parseCsv=text=>{const rows=[];let row=[],cell='',q=false;text=text.replace(/^﻿/,'');for(let i=0;i<text.length;i++){const c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}else if(c==='"')q=true;else if(c===','){row.push(cell);cell=''}else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=''}else if(c!=='\r')cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}const [h,...rest]=rows;return rest.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])))};
const csv=p=>parseCsv(readFileSync(p,'utf8'));
const cell=v=>{const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s};
const write=(name,header,rows)=>writeFileSync(resolve(v14,name),'﻿'+[header,...rows].map(r=>r.map(cell).join(',')).join('\n')+'\n');
const sha=()=>{try{return execSync('git rev-parse --short HEAD',{cwd:root}).toString().trim()}catch(e){return ''}};
const ui=csv(resolve(v14,'spec/01_ボタンとカードのUI変更表.csv')),tr=csv(resolve(v14,'spec/02_画面遷移変更表.csv')),legacy=csv(resolve(v14,'spec/03_旧304操作の機能移設表.csv'));
const results=existsSync(resolve(v14,'ui-results.json'))?JSON.parse(readFileSync(resolve(v14,'ui-results.json'),'utf8')):{};
const v11ops=new Map(csv(resolve(root,'docs/v11/checklists/operations-304.csv')).map(r=>[r.ID,r]));

/* 設計ID → [現行のDOM・セレクタ, ソースと関数, 状態（検査で決まるものは空）, 補足] */
const H='src/js/home-v14.js',N='src/js/07-navigation.js',S='src/js/settings.js';
const map={
 'N-001':['#homeTab（data-tab=home）',`${N} switchRoot/switchTab`],'N-002':['#paymentsTab（data-tab=payments）',`${N} switchRoot`],'N-003':['#settingsTab（data-tab=settings）',`${N} switchRoot`],
 'N-004':['nav#tabbar',`${N} installTabSlide・src/css/navigation.css`],'N-005':['.topbar.native-scrolled','src/js/24-accessibility.js decorate'],
 'N-006':['.busy-overlay（全面）','src/js/02-state-and-commits.js runWithBusy','未対応','重い計算（ATF・資産予測）では今も全面の待機表示を使う。データ領域だけのスケルトンと領域別の再試行は未実装'],
 'H-001':['#todayTop .large-title',`${H} homeHeaderHtml`],'H-002':['#todaySearch',`${H} bindHome→openSmartInputSearch`,'','検索画面は既存のpush遷移。虫眼鏡から検索欄への連続変形アニメーションは未実装'],
 'H-003':['#homeProfile',`${H} openProfilePanel`],'H-004':['.profile-panel-sub・.profile-btn.ring-*',`${H} profileState`,'','状態は「端末に保存済み／保存できません／Gmail同期中・連携中」。バックアップ作成日時は記録が無いため表示しない'],
 'H-005':['#ppEdit',`${H} openProfilePanel→openProfileEdit`],'H-006':['#ppBackup',`${H} openProfilePanel→openDataSettings`],'H-007':['#ppNotices・.profile-dot',`${H} openProfilePanel→openNotices`],
 'H-008':['#homeAlert',`${H} homeAlertHtml`],'H-009':['#homeAlertClose',`${H} bindHome`],'H-010':['#homePeriodToday・#homePeriodMonth',`${H} setHomePeriod・installPeriodDrag`],
 'H-011':['#homeDate',`${H} openDayCalendar・openDayWheel`,'','長押しの「日付ホイール」は月ホイール→日のカレンダーの2段階'],
 'H-020':['#homeSpendCard',`${H} homeSpendCardHtml`],'H-021':['#homeSpendCard .home-card-value',`${H} homeSpendCardHtml`],'H-022':['#homeSpendCard .mini-bars',`${H} miniBarsSvg・installMiniScrub`],'H-023':['#homeGoalStatus',`${H} homeSpendCardHtml`],
 'H-030':['#homeAssetsCard',`${H} homeAssetsCardHtml`],'H-031':['#homeAssetsCard .mini-donut',`${H} miniDonutSvg`],'H-032':['#homeAssetsCard .home-card-caption',`${H} homeTimeLabel`],
 'H-040':['#homeSalaryCard',`${H} homeSalaryCardHtml`],'H-041':['#homeSalaryCard .mini-bars',`${H} miniBarsSvg`],'H-042':['#homeNextPayday',`${H} homeNextPayday`],
 'H-050':['#homeAcfCard',`${H} homeAcfCardHtml`],'H-051':['#homeAcfCard .mini-spark',`${H} miniSparkSvg`],'H-060':['#homePaymentCard',`${H} homePaymentCardHtml・openPaymentEvent`],'H-061':['#homeAllPayments',`${H} bindHome→switchRoot`],
 'H-070':['.home-section-head',`${H} homeRowsHtml`],'H-071':['[data-home-cat]',`${H} categoryTableRowHtml`],'H-072':['#homeAllCategories',`${H} openHomeCategoryList`],'H-073':['[data-home-tx]',`${H} homeRowsHtml`],'H-074':['#homeAllTransactions','src/js/11-home-and-month.js openTransactionList'],
 'H-075':['#homeDayClose',`${H} homeRowsHtml→openDayClosingJournal`],'H-076':['#homeCompare',`${H} homeRowsHtml→openMonthAnalysis`],'H-077':['（ホームでは非表示）・ACF詳細 #acfViewMode','src/js/17-acf-refinements.js'],
 'H-078':['#homeMail',`${H} homeRowsHtml`],'H-079':['#homeLarge',`${H} openLargeExpenseList`],'H-080':['#homeGoals',`${H} homeRowsHtml→openEventGoals`],'H-081':['#homeLayoutEdit',`${H} openHomeLayoutEditor`,'','並び替えは上下ボタン（長押しドラッグは未実装）'],
 'Q-001':['#addHub',`${H} addHubItems・src/index.html`],'Q-002':['＋→「支出を記録」','src/js/08-transactions.js openQuickExpense',''],'Q-003':['＋→「臨時収入」','src/js/09-accounts-and-payroll.js openTempIncome'],'Q-004':['＋→「残高を更新」','src/js/09-accounts-and-payroll.js openQuickBank'],
 'Q-005':['＋→「給与を登録」','src/js/09-accounts-and-payroll.js openSalaryAdd'],'Q-006':['＋→「その他の入力」#ih*',`${H} openOtherInputs`],'Q-007':['#sheet .sheet-title・#qeCancel・#qeSave','src/js/08-transactions.js'],
 'Q-008':['#qeAmount→#calculator','src/js/calculator.js','別検査で確認','金額欄46種の電卓（npm run test:amount 164/164）。初期フォーカスは電卓を開く前の金額欄'],
 'Q-009':['#qeCat','src/js/08-transactions.js','別検査で確認','支出入力のカテゴリ選択（既存）。巡回で操作'],'Q-010':['#qePay','src/js/08-transactions.js','別検査で確認','支払い方法・口座の選択（既存）。巡回で操作'],
 'Q-011':['支出入力の日付','src/js/08-transactions.js','別検査で確認','既存の日付選択。確定まで保存しない（81画面シナリオ）'],
 'Q-012':['#qeMore（details）','src/js/08-transactions.js openQuickExpense'],
 'Q-013':['#qeSave','src/js/08-transactions.js'],'Q-014':['#qeCancel→破棄確認','src/js/07-navigation.js requestSheetClose'],'Q-015':['#todaySearch→#pro4Mode「検索」','src/js/16-analysis-and-goals.js openSmartInputSearch'],
 'Q-016':['検索の種類の切替','src/js/16-analysis-and-goals.js','一部','種類（すべて・取引など）の切替は既存。期間とカテゴリの2個のチップは未実装'],
 'Q-017':['検索結果の行','src/js/16-analysis-and-goals.js','別検査で確認','結果から各詳細へ（追加UIの照合で横断検索の結果行を確認）'],
 'P-001':['#payrootTop',`${H} renderPayRoot`],'P-002':['#payrootRisk・#payrootRiskClose',`${H} renderPayRoot`],'P-003':['#payrootSummary',`${H} renderPayRoot`],'P-004':['#payrootNextDebit',`${H} renderPayRoot`],'P-005':['[data-payroot-card]',`${H} renderPayRoot`],
 'P-006':['#payrootAllCards',`${H} bindPayRoot`],'P-007':['[data-payroot-fixed]',`${H} bindPayRoot・openFixedPaymentList`],'P-008':['[data-payroot-large]',`${H} renderPayRoot`,'別検査で確認','その月に計画中の大型支出がある時だけ表示（検査データの月には無いため、ホームの大型支出行 H-079 で同じ詳細を確認）'],
 'P-009':['#payrootAtf',`${H} bindPayRoot→mm3OpenAtfSheet`],'P-010':['支払いの管理メニュー・＋その他の入力 #ihCard','src/js/12-salary-editors.js openQuickCardBilling'],'P-011':['#payrootMonth・#payrootPrev・#payrootNext',`${H} bindPayRoot`],
 'P-012':['カード請求詳細の照合チェック','src/js/15-pro-features.js openStatementReconciliation','別検査で確認','既存（第11版 SALARYEDIT-195/196、検証済み）。支払いrootのカード行の長押し「照合する」から'],
 'P-013':['カード請求詳細「口座残高にも反映する」','src/js/12-salary-editors.js openCardPaidConfirmation','別検査で確認','既存（第11版 SALARYEDIT-199/200、検証済み）'],
 'P-014':['支払いの管理メニュー「カードを追加」「デビットカードを追加」',`${H} bindPayRoot`],'P-015':['#payrootMail',`${H} renderPayRoot`],
 'O-001':['#settingsTop・.other-tiles',`${S} renderSettings`],'O-002':['#tileSalary',`${S} bindSettings`],'O-003':['#tileAssets',`${S} bindSettings`],'O-004':['#tileAcf',`${S} bindSettings`],'O-005':['#dataSettings（タイル）',`${S} renderSettings`],
 'O-006':['#profileSettings',S],'O-007':['#categorySettings',S],'O-008':['#tagSettings',S],'O-009':['#favoriteSettings',S],'O-010':['#notificationSettings',S],'O-011':['#appearanceSettings',S],'O-012':['#feedbackSettingsRow',S],'O-013':['#securitySettings',S],'O-014':['#gmailSettings',S],'O-015':['#initialValuesSettings',S],'O-016':['#helpSettings',S],
 'O-017':['#pdfExport','src/js/13-settings-and-backup.js'],'O-018':['#backupExport','src/js/13-settings-and-backup.js'],'O-019':['#backupImport','src/js/13-settings-and-backup.js'],'O-020':['#deleteAll','src/js/13-settings-and-backup.js'],'O-021':['#systemNoticesRow',S],
 'D-001':['#screen-day（今日の支出）・#screen-month（今月の支出）','src/js/11-home-and-month.js renderDay/renderMonth'],
 'D-002':['今月の支出・詳細分析のグラフ','src/js/11-home-and-month.js openMonthAnalysis','一部','既存の分析グラフ（なぞりで値表示）を使用。日/週/月/6か月/年のセグメントは未実装'],
 'D-003':['#dayContent [data-cat]・#monthContent [data-month-cat]','src/js/09-accounts-and-payroll.js categoryCards'],
 'D-004':['#assetsShare','src/js/20-assets-dashboard.js renderAssets'],
 'D-005':['#screen-assets の口座一覧','src/js/20-assets-dashboard.js'],'D-006':['#screen-assets の資産推移','src/js/20-assets-dashboard.js','別検査で確認','既存（なぞりで日付と残高、第11版で検証済み）'],
 'D-007':['#screen-pay 上部','src/js/18-salary-dashboard.js renderPay','別検査で確認','既存の給与画面（受取見込み・前月比）。第11版で検証済み'],'D-008':['#screen-pay の勤務先別','src/js/18-salary-dashboard.js','別検査で確認','既存（第11版 PAY系で検証済み）'],
 'D-009':['#screen-pay の給与推移','src/js/18-salary-dashboard.js','別検査で確認','既存（勤務先別／給与推移の切替）'],'D-010':['ACF詳細','src/js/06-acf-views.js openAcfDetail','別検査で確認','既存（第11版 ACF系で検証済み）'],
 'D-011':['ACF詳細の日別資金表／カレンダー','src/js/17-acf-refinements.js・acf-calendar.js','別検査で確認','既存（表とカレンダーの切替、日付から当日の詳細）'],'D-012':['ACF設定','src/js/17-acf-refinements.js openAcfSettings','別検査で確認','既存（キャンセルなら予測不変）'],
 'D-013':['口座詳細','src/js/12-salary-editors.js openBankDetail'],'D-014':['#txEdit・#txDelete','src/js/11-home-and-month.js openTransactionDetail'],
 'D-015':['資産の口座の並び替え（手動）','src/js/20-assets-dashboard.js・21-gestures.js','別検査で確認','既存（ボタンと長押しドラッグ、第11版で検証済み）']
};
const commit=sha();
const uiRows=ui.map(r=>{const id=r['設計ID'],[dom,src,st,note]=map[id]||['','','未対応','対応表に未登録'],res=results[id];
  const status=st&&st!==''?st:res?(res.result==='合格'?'完了':'不合格'):'未確認';
  const done=status==='完了'||(status==='別検査で確認');
  return{id,name:r['ボタン・カード名'],dom,src,before:`旧: ${r['既存参照ID（実在保証なし）']}`,after:res?`test-results/v14/${id}.png`:'',test:res?`${res.result}：${res.note}`:'',side:res?(res.result==='合格'?(/保存|二重/.test(res.note)?'保存は1回だけ':'会計データ不変（操作前後で一致）'):''):'',commit:done?commit:'',status,note:note||'',transition:r['遷移ID'],priority:r['優先度']}});
write('ui-111.csv',['設計ID','ボタン・カード名','優先度','現行HTML ID・セレクタ','ソースファイルと関数','変更前画面','変更後画面','操作・遷移テスト','副作用テスト','コミットSHA','完了状態','補足'],uiRows.map(r=>[r.id,r.name,r.priority,r.dom,r.src,r.before,r.after,r.test,r.side,r.commit,r.status,r.note]));

const byTransition=new Map();for(const r of uiRows)for(const t of String(r.transition).split(/[\/,、]/).map(s=>s.trim()).filter(s=>/^T-\d+/.test(s))){if(!byTransition.has(t))byTransition.set(t,[]);byTransition.get(t).push(r)}
const trRows=tr.map(t=>{const id=t['遷移ID'],users=byTransition.get(id)||[],tested=users.filter(u=>u.status==='完了'),other=users.filter(u=>u.status==='別検査で確認');
  const status=users.length&&tested.length===users.length?'検証済み':tested.length?'一部検証':other.length?'別検査で確認':users.length?'未確認':'該当なし';
  return[id,t['起点ボタン・画面'],t['遷移先'],users.map(u=>`${u.id}(${u.status})`).join(' '),status,id==='T-080'?'データ領域だけの再読込は未実装（N-006）':id==='T-004'?'検索はpush遷移。虫眼鏡の連続変形は未実装':id==='T-030'||id==='T-031'||id==='T-032'||id==='T-033'?'＋から開く入力は右下を起点に広がる（280ms、ページめくりの代替）':'']});
write('transitions-85.csv',['遷移ID','起点','遷移先','使っている設計ID（状態）','検証状態','補足'],trRows);

/* 旧304: 旧画面（IDの接頭辞）→ 3タブからの新しい入口。旧台帳の識別子をそのまま新DOMと見なさず、入口の検査（v14-ui）と旧操作の検査（第11版の巡回・81画面・P0・残りの操作。第14版の入口で再実行）を合わせて証拠にする */
const entry={HOME:['ホーム→支出カード→今日の支出／ホーム右上・プロフィール・＋入力ハブ','H-020・H-002・H-007・Q-001'],MONTH:['ホーム→支出カード（今月）→今月の支出','H-010・H-020'],GOAL:['ホームの支出カード「目標」→目標計画','H-023'],PAY:['その他→給与（ホームの給与カードからも）','O-002・H-040'],PAYMENTS:['支払いroot→請求一覧','P-003・P-006'],ASSETS:['その他→資産（ホームの総資産カードからも）','O-003・H-030'],BANK:['資産→口座詳細／＋残高を更新','O-003・D-013・Q-004'],SALARYEDIT:['給与／請求一覧の編集シート','O-002・P-005'],ACF:['ホームの生活費の見通しカード→ACF詳細','H-050'],SIM:['ACF詳細→買う前に試す','H-050'],STATEMENT:['ホームの未確認の明細／支払いの明細照合センター','H-078・P-015'],PRO:['今月の支出・給与・資産の各メニュー','H-020・O-002・O-003'],DAYCLOSE:['ホームの日締め行→日締めジャーナル／今日の支出','H-075・H-020'],EVENT:['ホームの旅行・プレゼント行／＋その他の入力','H-080・Q-006'],LARGE:['ホームの大型支出行／支払いroot／＋その他の入力','H-079・P-008・Q-006'],SET:['その他（設定の一覧）','O-006〜O-016'],CALC:['＋入力の金額欄→電卓','Q-002・Q-008'],BACKUP:['その他→データとバックアップ','O-005・O-017〜O-020'],TX:['ホームの最近の取引／すべての取引','H-073・H-074'],GMAIL:['その他→Gmail連携','O-014'],PICKER:['各画面の月ホイール','H-011・P-011'],REPEAT:['＋→その他の入力→最近の支出を再利用','Q-006'],INCOME:['＋→臨時収入／給与','Q-003・O-002'],UPDATE:['ホームの今日／今月の切替','H-010']};
const relocation=JSON.parse(readFileSync(resolve(v14,'relocation.json'),'utf8'));
const legacyRows=legacy.map(r=>{const id=r['旧304操作ID'],pre=id.replace(/-\d+$/,''),[path,ids]=entry[pre]||['（未割当）',''],v11=v11ops.get(id)||{},dom=v11['DOM／識別子']||r['旧台帳DOM識別子'],moved=relocation.selectors['#'+dom];
  const entryOk=ids.split('・').every(x=>{const k=x.replace(/〜.*/,'');const u=uiRows.find(u=>u.id===k);return !u||u.status==='完了'||u.status==='別検査で確認'});
  const opOk=v11['検証済み']==='○';
  const status=opOk&&entryOk?'新しい入口から到達・動作を確認':!opOk?'未確認（外部認証が必要）':'入口が未確認';
  return[id,r['旧ボタン名'],dom,r['新しい移設先'],moved?moved.label:path,ids,v11['実装ファイル']||'',`${v11['検証の証拠']||''}${opOk?'・第14版の入口で81画面/P0/残りの操作/巡回を再実行':''}`,status]});
write('legacy-304.csv',['旧304操作ID','旧ボタン名','旧台帳DOM','指示書の移設先','実装した新しい入口','入口の設計ID','実装ファイル','検証証拠','状態'],legacyRows);

const count=(rows,fn)=>rows.filter(fn).length;
const st=k=>count(uiRows,r=>r.status===k);
const lines=[
'# 第14版 進捗（自動生成: `node scripts/v14/ledger.mjs`）','',
`生成時のコミット: ${commit}`,'',
'| 対象 | 全件数 | 完了（この版で実装・個別検査） | 別検査で確認（既存機能） | 一部 | 未対応 | 不合格・未確認 |','|---|---|---|---|---|---|---|',
`| ボタン／カード／UI | ${uiRows.length} | ${st('完了')} | ${st('別検査で確認')} | ${st('一部')} | ${st('未対応')} | ${st('不合格')+st('未確認')} |`,
`| 画面遷移 | ${trRows.length} | ${count(trRows,r=>r[4]==='検証済み')} | ${count(trRows,r=>r[4]==='別検査で確認')} | ${count(trRows,r=>r[4]==='一部検証')} | — | ${count(trRows,r=>['未確認','該当なし'].includes(r[4]))} |`,
`| 旧304操作の移設 | ${legacyRows.length} | ${count(legacyRows,r=>r[8]==='新しい入口から到達・動作を確認')} | — | — | — | ${count(legacyRows,r=>r[8]!=='新しい入口から到達・動作を確認')} |`,'',
'- 「完了」= `tests/v14-ui.mjs` で実際の要素を押し・長押し・なぞり、行き先・戻り・会計データ不変・44ptを確認した。結果は `ui-results.json`、画面は `test-results/v14/<ID>.png`。',
'- 「別検査で確認」= 第11版から続く既存の画面・機能。第14版の入口（`relocation.json`）からたどって81画面シナリオ・P0・残りの操作・金額欄・巡回で確認。',
'- 「一部」「未対応」は下の一覧。全面実装完了とは報告しない。','',
'## 一部・未対応・未確認','',
...uiRows.filter(r=>!['完了','別検査で確認'].includes(r.status)).map(r=>`- **${r.id} ${r.name}**（${r.status}）: ${r.note||r.test}`),
...legacyRows.filter(r=>r[8]!=='新しい入口から到達・動作を確認').map(r=>`- **${r[0]} ${r[1]}**（旧304）: ${r[8]}`),
''];
writeFileSync(resolve(v14,'PROGRESS.md'),lines.join('\n'));
console.log(lines.slice(4,9).join('\n'));
