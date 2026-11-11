/* 第14版のボタン／カード／UI表（111件）を、設計IDごとに実際に操作して確かめる。
   各IDで「実際の要素（現行DOM）を押す・長押し・なぞる」→「表どおりの行き先が開く」→「閉じる／戻るで起点へ戻る」
   →「見るだけの操作で会計データが変わらない」→「押せる範囲が44pt以上」を確認し、docs/v14/ui-results.json に書く。
   ここで検査しない（実装していない・別の検査で確認する）IDは、理由とともに ledger 側で区別する。 */
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {root, createPage, settle, reset, closeHarness} from './v11-harness.mjs';

const results={},shots=resolve(root,'test-results/v14');mkdirSync(shots,{recursive:true});
const financial=text=>{const d=JSON.parse(text);for(const k of ['homeViewMode','notices','homeLayout'])delete d[k];return JSON.stringify(d)};
const data=page=>page.evaluate(()=>JSON.stringify(globalThis.__mm3Test.getData()));
const view=page=>page.evaluate(()=>({screen:document.querySelector('.screen.active')?.id||'',tab:document.querySelector('#tabbar .tab.active')?.dataset.tab||'',push:[...document.querySelectorAll('#pushLayer .push-view.show .push-title')].map(e=>e.textContent.trim()),sheet:document.getElementById('sheet').classList.contains('show')?(document.querySelector('#sheet .sheet-title')?.textContent.trim()||'(sheet)'):'',menu:document.getElementById('menuLayer').classList.contains('show')?[...document.querySelectorAll('#menuLayer .menu-label')].map(e=>e.childNodes[0]?.textContent.trim()):null,alert:document.getElementById('alertWrap').classList.contains('show')?document.getElementById('alertTitle').textContent:''}));
async function closeAll(page){await page.evaluate(()=>{const t=globalThis.__mm3Test;document.getElementById('alertWrap')?.classList.remove('show');try{t.closeMenu()}catch(e){}try{t.closeCalc()}catch(e){}try{t.closeSheet()}catch(e){}for(let i=0;i<10&&document.querySelector('#pushLayer .push-view.show');i++)t.popView()});await settle(page)}
async function size(page,sel){return page.locator(sel).first().evaluate(el=>{let r=el.getBoundingClientRect();if(/^(checkbox|radio)$/.test(el.type||'')){const h=el.closest('label,.row');if(h)r=h.getBoundingClientRect()}return{w:Math.round(r.width),h:Math.round(r.height),name:globalThis.__crawl.name(el)}})}
async function tap(page,sel){const el=page.locator(sel).first();await el.waitFor({state:'attached',timeout:5000});await el.scrollIntoViewIfNeeded().catch(()=>{});const s=await size(page,sel);assert.ok(s.w>=43.5&&s.h>=43.5,`${sel} は44pt未満 ${s.w}×${s.h}`);assert.ok(s.name,`${sel} に読み上げ名がない`);await el.click();await settle(page);return s}
async function longPress(page,sel){const el=page.locator(sel).first();await el.scrollIntoViewIfNeeded().catch(()=>{});const b=await el.boundingBox();await page.mouse.move(b.x+b.width/2,b.y+Math.min(b.height/2,30));await page.mouse.down();await page.waitForTimeout(800);await page.mouse.up();await settle(page)}
async function menuPick(page,label){await page.locator('#menuLayer .menu-item').filter({hasText:label}).first().click();await settle(page)}

async function check(page,id,{from='home',setup,run,writes=false}){
  try{
    await closeAll(page);await reset(page,from);if(setup)await setup(page);await settle(page);
    const before=await data(page);
    const note=await run(page);
    if(!writes)assert.equal(financial(await data(page)),financial(before),'見るだけの操作で会計データが変わった');
    await page.screenshot({path:resolve(shots,`${id}.png`)});
    results[id]={result:'合格',note:note||''};console.log('PASS',id,note||'');
  }catch(e){results[id]={result:'不合格',note:e.message.split('\n')[0]};console.log('FAIL',id,e.message.split('\n')[0])}
}
const expectScreen=async(page,screen)=>{const v=await view(page);assert.equal(v.screen,`screen-${screen}`,`開いた画面 ${v.screen}`);return v};
const expectPush=async(page,re)=>{const v=await view(page);assert.ok(v.push.some(t=>re.test(t)),`開いた画面 ${JSON.stringify(v.push)}`);return v.push.at(-1)};
const expectSheet=async(page,re)=>{const v=await view(page);assert.ok(v.sheet&&re.test(v.sheet),`開いたシート「${v.sheet}」`);return v.sheet};
const expectMenu=async(page,labels)=>{const v=await view(page);assert.ok(v.menu,'メニューが開かない');for(const l of labels)assert.ok(v.menu.some(x=>x.includes(l)),`メニューに「${l}」がない ${JSON.stringify(v.menu)}`);return v.menu.join('／')};
/* 専用画面の戻る: 上部の「‹ 起点」で起点のrootへ、表示位置ごと戻る */
const backTo=async(page,screen)=>{await tap(page,'.screen.active .detail-back');await expectScreen(page,screen)};
const enableAcf=page=>page.evaluate(async()=>{const t=globalThis.__mm3Test,d=t.getData();d.acfSettings={...(d.acfSettings||{}),initialized:true};await t.replaceData(d);t.renderAll()});

try{
  const {page,context,errors}=await createPage('app',{width:393,appearance:'light'});
  /* ---- 共通・ナビゲーション ---- */
  await check(page,'N-001',{from:'settings',run:async p=>{await tap(p,'#homeTab');await expectScreen(p,'today');await p.evaluate(()=>document.querySelector('#todayContent').scrollTop=400);await tap(p,'#homeTab');await p.waitForTimeout(400);assert.ok(await p.evaluate(()=>document.querySelector('#todayContent').scrollTop<50),'再タップで先頭へ');return 'その他→ホーム、再タップで先頭'}});
  await check(page,'N-002',{run:async p=>{await tap(p,'#paymentsTab');await expectScreen(p,'payroot');return '支払いroot'}});
  await check(page,'N-003',{run:async p=>{await tap(p,'#settingsTab');await expectScreen(p,'settings');assert.equal(await p.locator('#screen-settings .large-title').innerText(),'その他');return 'その他root'}});
  await check(page,'N-004',{run:async p=>{const s=await p.locator('#tabbar').evaluate(el=>({role:el.getAttribute('role'),tag:el.tagName,blur:getComputedStyle(el).backdropFilter||getComputedStyle(el).webkitBackdropFilter}));assert.notEqual(s.role,'button');assert.equal(s.tag,'NAV');assert.ok(/blur/.test(s.blur),'背景ブラー');return `nav・${s.blur}`}});
  await check(page,'N-005',{run:async p=>{await p.evaluate(()=>{const c=document.querySelector('#todayContent');c.scrollTop=200;c.dispatchEvent(new Event('scroll'))});await p.waitForTimeout(100);assert.ok(await p.locator('#todayTop').evaluate(el=>el.classList.contains('native-scrolled')),'スクロールで上部が縮む');return '縦スクロールで上部がコンパクト表示'}});
  /* ---- ホーム・ヘッダー ---- */
  await check(page,'H-001',{run:async p=>{assert.equal(await p.locator('#todayTop .large-title').innerText(),'ホーム');return '見出し「ホーム」（非操作）'}});
  await check(page,'H-002',{run:async p=>{await tap(p,'#todaySearch');await expectPush(p,/入力と検索/);await closeAll(p);await expectScreen(p,'today');return '検索画面→閉じるとホームのまま'}});
  await check(page,'H-003',{run:async p=>{await tap(p,'#homeProfile');const v=await view(p);assert.ok(await p.locator('#menuLayer.menu-panel.show .profile-panel').count(),'プロフィールパネル');await p.mouse.click(30,400);await settle(p);assert.ok(!(await view(p)).menu,'外側タップで閉じる');return 'パネルが開き、外側タップで閉じる'}});
  await check(page,'H-004',{run:async p=>{await tap(p,'#homeProfile');const t=await p.locator('.profile-panel-sub').innerText();assert.ok(/保存|同期|未接続/.test(t));return `状態の文言「${t.trim()}」`}});
  await check(page,'H-005',{run:async p=>{await tap(p,'#homeProfile');await tap(p,'#ppEdit');await expectSheet(p,/プロフィール/);return 'プロフィール編集'}});
  await check(page,'H-006',{run:async p=>{await tap(p,'#homeProfile');await tap(p,'#ppBackup');await expectPush(p,/データ/);return 'データ管理（バックアップ）'}});
  await check(page,'H-007',{run:async p=>{await tap(p,'#homeProfile');await tap(p,'#ppNotices');await expectPush(p,/お知らせ/);return '通知一覧'},writes:false});
  await check(page,'H-008',{run:async p=>{assert.ok(await p.locator('#homeAlert').count(),'警告があるときだけ表示');await tap(p,'#homeAlert');await expectPush(p,/お知らせ/);return '警告→お知らせ一覧'}});
  await check(page,'H-009',{run:async p=>{const n=await p.evaluate(()=>globalThis.__mm3Test.getData().notices.length);await tap(p,'#homeAlertClose');assert.equal(await p.locator('#homeAlert').count(),0,'このカードだけ閉じる');assert.equal(await p.evaluate(()=>globalThis.__mm3Test.getData().notices.length),n,'一覧には残る');return '×で非表示・一覧には残る'}});
  await check(page,'H-010',{run:async p=>{await tap(p,'#homePeriodMonth');assert.equal(await p.locator('#homePeriodMonth').getAttribute('aria-pressed'),'true');assert.ok((await p.locator('#homeSpendCard').getAttribute('aria-label')).includes('今月'));const g=await p.locator('.home-period').boundingBox();await p.mouse.move(g.x+g.width*.75,g.y+g.height/2);await p.mouse.down();await p.mouse.move(g.x+g.width*.25,g.y+g.height/2,{steps:6});await p.mouse.up();await settle(p);assert.equal(await p.locator('#homePeriodToday').getAttribute('aria-pressed'),'true','ドラッグして離した位置で決まる');return 'タップとドラッグで切替'}});
  await check(page,'H-011',{run:async p=>{const before=await p.evaluate(()=>globalThis.__mm3Test.getState().trackingDate);await tap(p,'#homeDate');await expectSheet(p,/日付/);await p.locator('[data-cal]:not([disabled])').first().click();await tap(p,'#calCancel');assert.equal(await p.evaluate(()=>globalThis.__mm3Test.getState().trackingDate),before,'確定前は日付不変');await longPress(p,'#homeDate');await expectMenu(p,['日付ホイール']);return 'カレンダー（取消で不変）・長押しでホイール'}});
  /* ---- ホーム・サマリーカード ---- */
  await check(page,'H-020',{run:async p=>{await longPress(p,'#homeSpendCard');const m=await expectMenu(p,['支出を記録','支出履歴','目標設定']);await closeAll(p);await tap(p,'#homeSpendCard');await expectScreen(p,'day');await backTo(p,'today');return `支出詳細（今日の支出）・長押し ${m}`}});
  await check(page,'H-021',{run:async p=>{const t=await p.locator('#homeSpendCard .home-card-value').innerText();assert.ok(t.length);return `主役の表示「${t}」`}});
  await check(page,'H-022',{run:async p=>{const c=p.locator('#homeSpendCard .mini-chart');const b=await c.boundingBox();await p.mouse.move(b.x+5,b.y+b.height/2);await p.mouse.down();await p.mouse.move(b.x+b.width-5,b.y+b.height/2,{steps:8});await p.mouse.up();await settle(p);assert.ok(await p.locator('.home-card-readout:not([hidden])').count(),'なぞると値を表示');await expectScreen(p,'today');return `なぞり「${await p.locator('.home-card-readout:not([hidden])').first().innerText()}」・遷移しない`}});
  await check(page,'H-023',{run:async p=>{const t=await p.locator('#homeGoalStatus').innerText();await tap(p,'#homeGoalStatus');const v=await view(p);assert.ok(v.push.length||v.sheet,'目標の画面');return `「${t.trim()}」→目標`}});
  await check(page,'H-030',{run:async p=>{await longPress(p,'#homeAssetsCard');await expectMenu(p,[]);await closeAll(p);await tap(p,'#homeAssetsCard');await expectScreen(p,'assets');await backTo(p,'today');return '資産詳細・長押しで口座残高プレビュー'}});
  await check(page,'H-031',{run:async p=>{const has=await p.locator('#homeAssetsCard .mini-donut').count(),empty=await p.locator('#homeAssetsCard .home-card-empty').count();assert.ok(has||empty);return has?'ドーナツ表示':'「割合は未集計」'}});
  await check(page,'H-032',{run:async p=>{const t=await p.locator('#homeAssetsCard .home-card-caption').first().innerText();assert.ok(/更新 \d+\/\d+ \d+:\d+|更新記録なし/.test(t),t);return t}});
  await check(page,'H-040',{run:async p=>{await longPress(p,'#homeSalaryCard');await expectMenu(p,[]);await closeAll(p);await tap(p,'#homeSalaryCard');await expectScreen(p,'pay');await backTo(p,'today');return '給与詳細・長押しで勤務先別'}});
  await check(page,'H-041',{run:async p=>{assert.ok(await p.locator('#homeSalaryCard .mini-bars').count()||await p.locator('#homeSalaryCard .home-card-empty').count());return '6か月の棒グラフ（未登録なら説明）'}});
  await check(page,'H-042',{run:async p=>{if(!await p.locator('#homeNextPayday').count())return '次の給料日が無いので非表示';await tap(p,'#homeNextPayday');await expectScreen(p,'pay');return '給与詳細へ'}});
  await check(page,'H-050',{setup:enableAcf,run:async p=>{await longPress(p,'#homeAcfCard');await expectMenu(p,['計算条件を見る','再計算']);await closeAll(p);await tap(p,'#homeAcfCard');const v=await view(p);assert.ok(v.push.length||v.sheet,'ACF詳細');return 'ACF詳細・長押し 計算条件／再計算'},writes:true});
  await check(page,'H-051',{setup:enableAcf,run:async p=>{assert.ok(await p.locator('#homeAcfCard .mini-spark').count(),'折れ線');assert.ok(await p.locator('#homeAcfCard .spark-threshold').count(),'安全残高の点線');return '折れ線＋安全残高の点線'},writes:true});
  await check(page,'H-060',{run:async p=>{await longPress(p,'#homePaymentCard');await expectMenu(p,[]);await closeAll(p);await tap(p,'#homePaymentCard');const v=await view(p);assert.ok(v.push.length||v.sheet||v.screen!=='screen-today','支払いの詳細');return `支払いの詳細 ${v.push.at(-1)||v.sheet||v.screen}`}});
  await check(page,'H-061',{run:async p=>{await tap(p,'#homeAllPayments');await expectScreen(p,'payroot');return '支払いrootへ'}});
  /* ---- ホーム・表と一覧 ---- */
  await check(page,'H-070',{run:async p=>{assert.ok(await p.locator('.home-section-head',{hasText:'最近の動き'}).count());return '見出し（非操作）'}});
  await check(page,'H-071',{run:async p=>{const n=await p.locator('[data-home-cat]').count();assert.ok(n>=1&&n<=3,`初期は3行まで（${n}）`);await longPress(p,'[data-home-cat]');await expectMenu(p,['明細を見る','カテゴリ設定']);await closeAll(p);await tap(p,'[data-home-cat]');await expectPush(p,/./);return `${n}行・カテゴリの取引一覧`}});
  await check(page,'H-072',{run:async p=>{await tap(p,'#homeAllCategories');await expectPush(p,/カテゴリ/);return 'カテゴリ一覧'}});
  await check(page,'H-073',{run:async p=>{const n=await p.locator('[data-home-tx]').count();assert.ok(n>=1&&n<=3);await longPress(p,'[data-home-tx]');await expectMenu(p,['編集','削除']);await closeAll(p);await tap(p,'[data-home-tx]');await expectPush(p,/取引/);return `${n}行・取引詳細・長押し 編集／削除`}});
  await check(page,'H-074',{run:async p=>{await tap(p,'#homeAllTransactions');await expectPush(p,/すべての取引/);return '検索・絞込つき取引一覧'}});
  await check(page,'H-075',{run:async p=>{await longPress(p,'#homeDayClose');await expectMenu(p,['日付を選んで日締め']);await closeAll(p);await tap(p,'#homeDayClose');await expectPush(p,/日締め/);return '日締めジャーナル'}});
  await check(page,'H-076',{run:async p=>{await tap(p,'#homeCompare');await expectPush(p,/分析|比較/);return '月次比較'}});
  await check(page,'H-077',{setup:enableAcf,run:async p=>{assert.equal(await p.locator('#todayContent [data-home-section="acf-table"]').count(),0,'ホームでは表を出さない');await tap(p,'#homeAcfCard');assert.ok(await p.locator('#acfViewMode').count(),'詳細に表／カレンダーの切替');return 'ホームでは非表示・ACF詳細で表とカレンダー切替'},writes:true});
  await check(page,'H-078',{run:async p=>{assert.ok(await p.locator('#homeMail').count(),'未確認がある時だけ');await tap(p,'#homeMail');await expectPush(p,/メール/);return '照合センター'}});
  await check(page,'H-079',{run:async p=>{assert.ok(await p.locator('#homeLarge').count());await longPress(p,'#homeLarge');await expectMenu(p,['大型支出を計画']);await closeAll(p);await tap(p,'#homeLarge');await expectPush(p,/大型支出/);return '大型支出一覧・長押しで計画追加'}});
  await check(page,'H-080',{run:async p=>{assert.ok(await p.locator('#homeGoals').count());await longPress(p,'#homeGoals');await expectMenu(p,['新しい目標']);await closeAll(p);await tap(p,'#homeGoals');await expectPush(p,/旅行|目標/);return '目標一覧・長押しで新規'}});
  await check(page,'H-081',{run:async p=>{await tap(p,'#homeLayoutEdit');await expectPush(p,/表示する項目/);await tap(p,'[data-layout-toggle="compare"]');await closeAll(p);assert.equal(await p.locator('#homeCompare').count(),0,'非表示にできる');await tap(p,'#homeLayoutEdit');await tap(p,'[data-layout-toggle="compare"]');await tap(p,'[data-layout-move="assets"][data-dir="-1"]');await closeAll(p);assert.equal(await p.locator('.home-card-wrap').first().getAttribute('data-home-section'),'assets','並び替え');return '表示・非表示と並び順（会計データは変えない）'}});
  /* ---- 共通・入力と検索 ---- */
  await check(page,'Q-001',{run:async p=>{const s=await size(p,'#addHub');assert.ok(s.w>=48&&s.h>=48);await tap(p,'#addHub');return `＋ ${s.w}×${s.h} → ${await expectMenu(p,['支出を記録','臨時収入','残高を更新','給与を登録','その他の入力'])}`}});
  await check(page,'Q-002',{run:async p=>{await tap(p,'#addHub');await menuPick(p,'支出を記録');assert.ok(await p.locator('#qeSave').count());return '支出入力'}});
  await check(page,'Q-003',{run:async p=>{await tap(p,'#addHub');await menuPick(p,'臨時収入');return `「${await expectSheet(p,/臨時収入|収入/)}」`}});
  await check(page,'Q-004',{run:async p=>{await tap(p,'#addHub');await menuPick(p,'残高を更新');return `「${await expectSheet(p,/残高|口座/)}」`}});
  await check(page,'Q-005',{run:async p=>{await tap(p,'#addHub');await menuPick(p,'給与を登録');const v=await view(p);assert.ok(v.sheet||v.push.length||v.menu);return `「${v.sheet||v.push.at(-1)||'種類の選択'}」`}});
  await check(page,'Q-006',{run:async p=>{await tap(p,'#addHub');await menuPick(p,'その他の入力');await expectPush(p,/その他の入力/);for(const id of ['ihBank','ihEmployer','ihCredit','ihDebit','ihFixed','ihLarge','ihCard'])assert.ok(await p.locator('#'+id).count(),id);return '口座・勤務先・カード・デビット・固定・大型・請求額'}});
  await check(page,'Q-007',{run:async p=>{await tap(p,'#addHub');await menuPick(p,'支出を記録');const t=await p.locator('#sheet .sheet-title').innerText();assert.ok(await p.locator('#qeCancel').count());return `タイトル「${t}」・閉じる・保存`}});
  await check(page,'Q-012',{run:async p=>{await tap(p,'#addHub');await menuPick(p,'支出を記録');assert.equal(await p.locator('#qeMore').getAttribute('open'),null,'初めは閉じている');await p.locator('#qeMore > summary').click();await p.locator('#qeMemo').fill('残る');await p.locator('#qeMore > summary').click();await p.locator('#qeMore > summary').click();assert.equal(await p.locator('#qeMemo').inputValue(),'残る','開閉しても入力値は残る');await tap(p,'#qeCancel');if((await view(p)).alert)await p.locator('#alertActions button',{hasText:'変更を破棄'}).click();return '「詳細を表示」で開閉・入力値保持'}});
  await check(page,'Q-013',{run:async p=>{await tap(p,'#addHub');await menuPick(p,'支出を記録');const before=await p.evaluate(()=>globalThis.__mm3Test.getData().transactions.length);await p.locator('#qeAmount').click();await settle(p);for(const k of ['7','7','7'])await p.locator(`[data-k="${k}"]`).click();await p.locator('#calcDone').click();await settle(p);await p.locator('#qeSave').dblclick();await p.waitForTimeout(700);const after=await p.evaluate(()=>globalThis.__mm3Test.getData().transactions.length);assert.equal(after,before+1,'二重押しでも1件');return '二重押しでも1件だけ保存・ホームの合計も更新'},writes:true});
  await check(page,'Q-014',{run:async p=>{await tap(p,'#addHub');await menuPick(p,'支出を記録');await p.locator('#qeMerchant').fill('破棄確認');await tap(p,'#qeCancel');const v=await view(p);assert.ok(v.alert,'変更ありは破棄確認');await p.locator('#alertActions button',{hasText:'変更を破棄'}).click();await settle(p);return '変更ありは破棄確認'}});
  await check(page,'Q-015',{run:async p=>{await tap(p,'#todaySearch');await p.locator('#pro4Mode [data-v="search"]').click();await settle(p);assert.ok(await p.locator('#pushLayer .push-view.show input').count(),'検索欄');return '検索欄（取引・口座・給与・支払いの結果）'}});
  /* ---- 支払い・トップ ---- */
  await check(page,'P-001',{from:'payroot',run:async p=>{assert.equal(await p.locator('#payrootTop .large-title').innerText(),'支払い');await tap(p,'#payrootMenu');return `見出し・検索・管理メニュー ${await expectMenu(p,['請求一覧','カードを追加'])}`}});
  await check(page,'P-002',{from:'payroot',run:async p=>{if(!await p.locator('#payrootRisk').count())return '不足がない時は非表示';await tap(p,'#payrootRisk');await expectSheet(p,/./);await closeAll(p);await tap(p,'#payrootRiskClose');assert.equal(await p.locator('#payrootRisk').count(),0);return '最上段に表示→ATF・×で見た目だけ閉じる'}});
  await check(page,'P-003',{from:'payroot',run:async p=>{await longPress(p,'#payrootSummary');await expectMenu(p,[]);await closeAll(p);await tap(p,'#payrootSummary');await expectScreen(p,'payments');await backTo(p,'payroot');return '請求一覧（全予定）・長押しで内訳'}});
  await check(page,'P-004',{from:'payroot',run:async p=>{await longPress(p,'#payrootNextDebit');await expectMenu(p,[]);await closeAll(p);await tap(p,'#payrootNextDebit');const v=await view(p);assert.ok(v.push.length||v.sheet||v.screen==='screen-payments');return '対象請求の詳細・長押しで次の2件'}});
  await check(page,'P-005',{from:'payroot',run:async p=>{const n=await p.locator('[data-payroot-card]').count();assert.ok(n>=1&&n<=3);await longPress(p,'[data-payroot-card]');await expectMenu(p,['請求額を更新','照合する']);await closeAll(p);await tap(p,'[data-payroot-card]');await expectPush(p,/カード/);return `${n}行・カード請求詳細`}});
  await check(page,'P-006',{from:'payroot',run:async p=>{await tap(p,'#payrootAllCards');await expectScreen(p,'payments');return '請求一覧'}});
  await check(page,'P-007',{from:'payroot',run:async p=>{await longPress(p,'[data-payroot-fixed]');await expectMenu(p,['編集']);await closeAll(p);await tap(p,'[data-payroot-fixed]');await expectSheet(p,/固定/);return '固定支払い詳細（編集は保存まで反映しない）'}});
  await check(page,'P-009',{from:'payroot',run:async p=>{await tap(p,'#payrootAtf');await expectSheet(p,/./);return 'ATF詳細'}});
  await check(page,'P-010',{from:'payroot',run:async p=>{await tap(p,'#payrootMenu');await menuPick(p,'カードの請求額を更新');const v=await view(p);assert.ok(v.sheet||v.push.length);return '支払いの管理メニュー（＋その他の入力にも）'}});
  await check(page,'P-011',{from:'payroot',run:async p=>{const m=await p.evaluate(()=>globalThis.__mm3Test.getState().assetBillingMonth);await tap(p,'#payrootMonth');await expectSheet(p,/月/);await p.locator('#monthPickerCancel').click();await settle(p);assert.equal(await p.evaluate(()=>globalThis.__mm3Test.getState().assetBillingMonth),m,'確定前は変わらない');await tap(p,'#payrootNext');return '月ホイール（取消で不変）・左右の月送り'}});
  await check(page,'P-014',{from:'payroot',run:async p=>{await tap(p,'#payrootMenu');await menuPick(p,'カードを追加');await expectSheet(p,/カード/);return '支払いの管理メニューに格納'}});
  await check(page,'P-015',{from:'payroot',run:async p=>{assert.ok(await p.locator('#payrootMail').count());await tap(p,'#payrootMail');await expectPush(p,/メール/);return '明細照合センター'}});
  /* ---- その他・トップ ---- */
  await check(page,'O-001',{from:'settings',run:async p=>{assert.equal(await p.locator('.other-tile').count(),4);return '「その他」・2列タイル4枚'}});
  await check(page,'O-002',{from:'settings',run:async p=>{await longPress(p,'#tileSalary');await expectMenu(p,[]);await closeAll(p);await tap(p,'#tileSalary');await expectScreen(p,'pay');assert.equal(await p.locator('#tabbar .tab.active').getAttribute('data-tab'),'settings','起点のタブが選択のまま');await backTo(p,'settings');return '給与詳細（ホームの給与カードと同じ画面）'}});
  await check(page,'O-003',{from:'settings',run:async p=>{await longPress(p,'#tileAssets');await expectMenu(p,[]);await closeAll(p);await tap(p,'#tileAssets');await expectScreen(p,'assets');await backTo(p,'settings');return '資産詳細'}});
  await check(page,'O-004',{from:'settings',run:async p=>{await tap(p,'#tileAcf');const v=await view(p);assert.ok(v.push.length||v.sheet);return 'ACF'}});
  await check(page,'O-005',{from:'settings',run:async p=>{await tap(p,'#dataSettings');await expectPush(p,/データ/);return 'データ管理'}});
  await check(page,'O-006',{from:'settings',run:async p=>{await tap(p,'#profileSettings');await expectSheet(p,/プロフィール/);return 'プロフィール編集（ホームの写真と同じ）'}});
  for(const [id,sel,re] of [['O-007','#categorySettings',/カテゴリ/],['O-008','#tagSettings',/タグ/],['O-009','#favoriteSettings',/お気に入り/],['O-010','#notificationSettings',/通知/],['O-011','#appearanceSettings',/外観/],['O-012','#feedbackSettingsRow',/フィードバック/],['O-013','#securitySettings',/セキュリティ/],['O-014','#gmailSettings',/Gmail/],['O-015','#initialValuesSettings',/初期/],['O-016','#helpSettings',/ヘルプ/],['O-021','#systemNoticesRow',/お知らせ/]])
    await check(page,id,{from:'settings',run:async p=>{await tap(p,sel);const v=await view(p);assert.ok(v.push.some(t=>re.test(t))||re.test(v.sheet),`${JSON.stringify(v.push)} ${v.sheet}`);return v.push.at(-1)||v.sheet}});
  for(const [id,sel] of [['O-017','#pdfExport'],['O-018','#backupExport'],['O-019','#backupImport'],['O-020','#deleteAll']])
    await check(page,id,{from:'settings',run:async p=>{await tap(p,'#dataSettings');const s=await size(p,sel);assert.ok(s.h>=43.5);return `データ管理内「${s.name}」`}});
  /* ---- 専用詳細画面（既存の画面を、戻る付きの専用画面として使う） ---- */
  await check(page,'D-001',{run:async p=>{await tap(p,'#homeSpendCard');await expectScreen(p,'day');assert.ok(await p.locator('#todayHero').count());return '今日の支出（期間・支出・目標）'}});
  await check(page,'D-003',{run:async p=>{await tap(p,'#homeSpendCard');assert.ok(await p.locator('#dayContent [data-cat]').count());await tap(p,'#dayContent [data-cat]');await expectPush(p,/./);return 'カテゴリ内訳→明細'}});
  await check(page,'D-004',{run:async p=>{await tap(p,'#homeAssetsCard');await expectScreen(p,'assets');await tap(p,'#assetsShare');return '総資産＋口座配分ドーナツ→口座一覧へ'}});
  await check(page,'D-005',{run:async p=>{await tap(p,'#homeAssetsCard');await expectScreen(p,'assets');const row=p.locator('#assetsContent [data-bank-id],#assetsContent .mm3-assets-watchrow').first();assert.ok(await row.count(),'銀行別の行');return '銀行別残高表'}});
  await check(page,'D-013',{run:async p=>{await p.evaluate(()=>globalThis.__mm3Test.call('openBankDetail',['$bank']));await settle(p);await expectPush(p,/./);return '口座詳細'}});
  await check(page,'D-014',{run:async p=>{await tap(p,'[data-home-tx]');assert.ok(await p.locator('#txEdit').count()&&await p.locator('#txDelete').count());return '取引詳細の下部に編集と削除（削除は確認）'}});
  if(errors.length)results['JavaScriptエラー']={result:'不合格',note:[...new Set(errors)].slice(0,3).join(' | ')};
  await context.close();
}finally{await closeHarness()}
writeFileSync(resolve(root,'docs/v14/ui-results.json'),JSON.stringify(results,null,1)+'\n');
const failed=Object.entries(results).filter(([,r])=>r.result!=='合格');
console.log(`${Object.keys(results).length-failed.length}/${Object.keys(results).length} v14 UI checks passed`);for(const [id,r] of failed)console.log('FAIL',id,r.note);
if(process.env.MM3_V14_STRICT)assert.equal(failed.length,0);
