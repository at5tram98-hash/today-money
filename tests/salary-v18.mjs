/* 第18版: シフト→給与の自動計算・手入力優先・ACF指標の期間・新しい画面の表示（幅393ライト/320ダーク） */
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createPage,closeHarness,settle,root} from './v11-harness.mjs';

const results={};let failed=0;
async function check(id,title,fn,{page}){try{const note=await fn(page);results[id]={ok:true,title,note};console.log('PASS',id,title,note||'')}catch(e){failed++;results[id]={ok:false,title,error:String(e?.message||e)};console.log('FAIL',id,title,e?.message||e)}}
/* 開いている一番上の画面の崩れ: 横はみ出し・文字の切れ・重なり */
const layout=page=>page.evaluate(()=>{
  const top=document.querySelector('#sheet.show')||[...document.querySelectorAll('#pushLayer .push-view.show')].at(-1)||document.querySelector('.screen.active');
  const bad=[];const W=innerWidth;
  for(const el of top.querySelectorAll('*')){const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;
    if(r.right>W+1&&!el.closest('.relay-code,[style*="overflow"]'))bad.push('はみ出し '+el.className+' '+Math.round(r.right));
    if(el.children.length===0&&el.textContent.trim()&&cs.overflow!=='visible'&&cs.textOverflow!=='ellipsis'&&el.scrollWidth>el.clientWidth+1&&!el.matches('input,select,textarea,.nav-icon-label,.sr-only'))bad.push('文字切れ '+el.className+'「'+el.textContent.trim().slice(0,12)+'」')}
  return {bad:bad.slice(0,8),text:top.textContent};
});

for(const [width,appearance] of [[393,'light'],[320,'dark']]){
  const {page,context,errors}=await createPage('app',{width,appearance});
  const cfg=`${width}-${appearance}`;
  /* 受け渡しサーバーの代わり（ショートカットが送った内容を返す） */
  let relayText='',relayAt=0,relayHits=0;
  await context.route('**/v1/shifts',route=>{relayHits++;route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify({text:relayText,updatedAt:relayAt})})});

  await check(`S-1 ${cfg}`,'初期値: GU 時給1300・交通費往復840・休憩(4〜7時間30分/7時間以上60分)、無印良品 時給1250・往復980・上限10000・休憩(7時間以上60分)',async p=>{
    const r=await p.evaluate(async()=>{const t=globalThis.__mm3Test,d=t.getData();d.meta={...d.meta,employerTermsV18:false};await t.replaceData(d);return t.getData().employers.map(e=>({name:e.name,hourly:e.hourly,transport:e.transport,unit:e.transportUnit,cap:e.transportCap,rules:e.breakRules,aliases:e.aliases}))});
    const gu=r.find(e=>e.name==='GU'),mu=r.find(e=>e.name==='無印良品');
    assert.ok(gu&&mu,'GUと無印良品がある');
    assert.deepEqual([gu.hourly,gu.transport,gu.unit,gu.cap],[1300,840,'per_shift',0]);assert.deepEqual(gu.rules,[{from:240,to:420,minutes:30},{from:420,to:null,minutes:60}]);
    assert.deepEqual([mu.hourly,mu.transport,mu.unit,mu.cap],[1250,980,'per_shift',10000]);assert.deepEqual(mu.rules,[{from:420,to:null,minutes:60}]);
    return `勤務先 ${r.length}件`},{page});

  await check(`S-2 ${cfg}`,'休憩ルールと交通費の上限で計算する',async p=>{
    const r=await p.evaluate(()=>{const t=globalThis.__mm3Test.shiftV18,gu=[{from:240,to:420,minutes:30},{from:420,to:null,minutes:60}],mu=[{from:420,to:null,minutes:60}];
      return{gu8:t.dur('10:00','18:00',gu),gu5:t.dur('10:00','15:00',gu),gu3:t.dur('10:00','13:00',gu),gu7:t.dur('10:00','17:00',gu),mu6:t.dur('10:00','16:00',mu),mu7:t.dur('10:00','17:00',mu)}});
    assert.equal(r.gu8.brk,60);assert.equal(r.gu8.work,420);assert.equal(r.gu5.brk,30);assert.equal(r.gu3.brk,0);assert.equal(r.gu7.brk,60);assert.equal(r.mu6.brk,0);assert.equal(r.mu7.brk,60);
    return 'GU 8時間→休憩60分・5時間→30分・3時間→0分、無印 6時間→0分・7時間→60分'},{page});

  await check(`S-3 ${cfg}`,'ショートカットから届いたシフトで給与（予定）を作る（時給＋交通費・上限）',async p=>{
    relayText=['2026-10-01 10:00-18:00 GU','2026-10-02 10:00-15:00 ジーユー',...Array.from({length:12},(_,i)=>`2026-10-${String(11+i).padStart(2,'0')} 10:00-16:00 無印良品`),'2026-10-20 09:00-10:00 歯医者'].join('\n');relayAt=1000;
    const r=await p.evaluate(async()=>{const t=globalThis.__mm3Test;t.shiftV18.setRelay({enabled:true});const out=await t.shiftV18.sync({silent:true,force:true});const d=t.getData(),emp=n=>d.employers.find(e=>e.name===n).id;
      const gu=d.salaryRecords.find(x=>x.employerId===emp('GU')&&x.month==='2026-10'),mu=d.salaryRecords.find(x=>x.employerId===emp('無印良品')&&x.month==='2026-11');return{count:out?.count,unmatched:out?.unmatched,gu,mu,relay:t.shiftV18.relay()}});
    assert.equal(r.count,14,'勤務先に当たる14件だけ使う');assert.deepEqual(r.unmatched,['歯医者']);
    /* GU: 8時間(休憩60)=7h×1300=9100、5時間(休憩30)=4.5h×1300=5850 → 14950・交通費840×2=1680。総支給額は交通費込み（交通費は内訳） */
    assert.equal(r.gu.gross,16630);assert.equal(r.gu.transport,1680);assert.equal(r.gu.source,'shift');
    /* 無印: 11日以降は11月勤務分（10日締め）。6時間×1250=7500×12=90000・交通費980×12=11760→上限10000 */
    assert.equal(r.mu.gross,100000);assert.equal(r.mu.transport,10000);
    assert.equal(r.relay.lastCount,14);assert.deepEqual(r.relay.unmatched,['歯医者']);
    return `GU ¥${r.gu.gross}（交通費¥${r.gu.transport}込み）・無印 ¥${r.mu.gross}（交通費¥${r.mu.transport}込み・上限）`},{page});

  await check(`S-4 ${cfg}`,'手入力した給与は7日間自動で上書きしない。8日たつと自動に戻る',async p=>{
    const r=await p.evaluate(async()=>{const t=globalThis.__mm3Test,emp=n=>t.getData().employers.find(e=>e.name===n).id,gid=emp('GU');
      await t.safeCommitAsync(()=>{},{});let d=t.getData();const rec=d.salaryRecords.find(x=>x.employerId===gid&&x.month==='2026-10');rec.gross=20000;rec.manualAt=new Date().toISOString();rec.source='manual';await t.replaceData(d);
      const a=await t.shiftV18.sync({silent:true,force:true});const kept=t.getData().salaryRecords.find(x=>x.employerId===gid&&x.month==='2026-10').gross;
      d=t.getData();d.salaryRecords.find(x=>x.employerId===gid&&x.month==='2026-10').manualAt=new Date(Date.now()-8*864e5).toISOString();await t.replaceData(d);
      await t.shiftV18.sync({silent:true,force:true});const after=t.getData().salaryRecords.find(x=>x.employerId===gid&&x.month==='2026-10');
      return{state:a.results.find(x=>x.g.employerId===gid)?.state,kept,after:after.gross,manualAt:after.manualAt||''}});
    assert.equal(r.state,'manual');assert.equal(r.kept,20000);assert.equal(r.after,16630);assert.equal(r.manualAt,'');
    return '手入力¥20,000は維持 → 8日後に¥16,630へ'},{page});

  await check(`S-5 ${cfg}`,'1日1回: 同じ日・同じ内容なら受け取り直さない。新しいシフトが届けば反映する',async p=>{
    const before=relayHits;await p.evaluate(()=>globalThis.__mm3Test.shiftV18.sync({silent:true}));const second=relayHits-before;
    const r=await p.evaluate(()=>{const t=globalThis.__mm3Test,r=t.shiftV18.relay();return{day:r.lastApplyDay,checkAt:r.lastCheckAt}});
    assert.equal(second,0,'3時間以内の2回目は取りに行かない');assert.equal(r.day,'2026-10-07');
    relayText='2026-10-01 10:00-18:00 GU\n2026-10-03 10:00-18:00 GU';relayAt=2000;
    const {g,toast}=await p.evaluate(async()=>{const t=globalThis.__mm3Test;document.getElementById('toastLayer')?.replaceChildren();await t.shiftV18.sync({silent:true,force:true});const d=t.getData(),gid=d.employers.find(e=>e.name==='GU').id;return{g:d.salaryRecords.find(x=>x.employerId===gid&&x.month==='2026-10').gross,toast:document.getElementById('toastLayer')?.textContent||''}});
    assert.ok(!/シフト/.test(toast),'自動の取り込みではお知らせを出さない');
    assert.equal(g,19880,'消えたシフト（10/2）は外れ、10/3が入る（18200＋交通費1680）');
    return '2回目は通信なし・更新後 GU ¥19,880'},{page});

  await check(`S-6 ${cfg}`,'ACF指標の期間は毎月28日まで（月末を過ぎたら翌月28日）。日付の指定もできる',async p=>{
    const r=await p.evaluate(async()=>{const t=globalThis.__mm3Test,e=t.shiftV18.acfEnd;const a=e('2026-10-07'),b=e('2026-10-29'),c=e('2026-10-28');let d=t.getData();d.acfSettings={...d.acfSettings,indexEndDay:31};await t.replaceData(d);const f=e('2027-02-03');d=t.getData();d.acfSettings={...d.acfSettings,indexEndDay:28,indexEndDate:'2026-10-20'};await t.replaceData(d);const g=e('2026-10-07'),h=e('2026-10-21');d=t.getData();d.acfSettings={...d.acfSettings,indexEndDate:''};await t.replaceData(d);return{a,b,c,f,g,h}});
    assert.deepEqual(r,{a:'2026-10-28',b:'2026-11-28',c:'2026-10-28',f:'2027-02-28',g:'2026-10-20',h:'2026-10-28'});
    return '10/7→10/28・10/29→11/28・月末指定で2月→2/28・指定10/20'},{page});

  await check(`S-7 ${cfg}`,'ACF指標の詳細とホームのカードが「m/d まで」になり、期間を変更できる',async p=>{
    const r=await p.evaluate(async()=>{const t=globalThis.__mm3Test,d=t.getData();d.acfSettings={...d.acfSettings,initialized:true};await t.replaceData(d);t.switchTab('today');t.renderAll();await new Promise(r=>setTimeout(r,200));
      const until=document.querySelector('.acfc-until')?.textContent||'';t.call('openAcfIndexDetail',[]);await new Promise(r=>setTimeout(r,400));const btn=document.getElementById('acfIdxPeriod');const period=btn?.textContent||'';btn?.click();await new Promise(r=>setTimeout(r,400));const sheet=document.querySelector('#sheet.show .sheet-title')?.textContent||'';return{until,period,sheet}});
    assert.equal(r.until,'10/28 まで');assert.match(r.period,/10\/28|10月28日/);assert.match(r.period,/毎月28日/);assert.equal(r.sheet,'ACF指標の期間');
    const lay=await layout(p);assert.deepEqual(lay.bad,[]);
    await p.evaluate(()=>{const s=document.getElementById('aipDay');s.value='25';s.dispatchEvent(new Event('change'));document.getElementById('aipSave').click()});await settle(p);
    const end=await p.evaluate(()=>globalThis.__mm3Test.getData().acfSettings.indexEndDay);assert.equal(end,25);
    await p.evaluate(async()=>{const t=globalThis.__mm3Test,d=t.getData();d.acfSettings={...d.acfSettings,indexEndDay:28};await t.replaceData(d)});
    return `${r.until}・${r.period.trim().slice(0,30)}`},{page});

  for(const [id,label,open] of [['S-8','給与・勤務先',p=>p.evaluate(()=>globalThis.__mm3Test.shiftV18.openSettings())],['S-9','GUの給与条件',p=>p.evaluate(()=>{const t=globalThis.__mm3Test;t.shiftV18.openTerms(t.getData().employers.find(e=>e.name==='GU').id)})],['S-10','ショートカットの設定',p=>p.evaluate(()=>globalThis.__mm3Test.shiftV18.openGuide())],['S-11','休憩ルールの追加',p=>p.evaluate(()=>globalThis.__mm3Test.shiftV18.openRule())]]){
    await check(`${id} ${cfg}`,`${label}の画面が崩れずに表示される`,async p=>{
      await p.evaluate(()=>{const t=globalThis.__mm3Test;t.closeSheet();while(document.querySelector('#pushLayer .push-view.show'))if(t.popView()===false)break});await settle(p);
      await open(p);await settle(p);await p.waitForTimeout(300);
      const lay=await layout(p);assert.deepEqual(lay.bad,[]);assert.ok(lay.text.length>20);
      if(id==='S-8'){assert.match(lay.text,/毎日自動で取り込む/);assert.match(lay.text,/時給 ¥1,300/);assert.match(lay.text,/上限 ¥10,000/)}
      if(id==='S-9'){assert.match(lay.text,/4時間以上7時間未満 → 休憩30分/);assert.match(lay.text,/¥9,940/,'計算の例 9100+840')}
      if(id==='S-10'){assert.match(lay.text,/v1\/shifts/);assert.ok(!/Bearer [A-Za-z0-9_-]{40}/.test(lay.text),'鍵の全体は表示しない')}
      await p.screenshot({path:resolve(root,`docs/design/v18-${id}-${cfg}.png`)});
      return label},{page});
  }

  await check(`S-12 ${cfg}`,'給与画面の自動取り込みは目立たない小さな一行だけで、押すと給与・勤務先が開く。自動の時はお知らせを出さない',async p=>{
    await p.evaluate(()=>{const t=globalThis.__mm3Test;t.closeSheet();while(document.querySelector('#pushLayer .push-view.show'))if(t.popView()===false)break;t.switchTab('pay');t.renderAll()});await settle(p);
    const r=await p.evaluate(async()=>{const s=document.getElementById('salarySyncStrip');if(!s)return{};const text=s.textContent;s.click();await new Promise(r=>setTimeout(r,450));return{text,title:[...document.querySelectorAll('#pushLayer .push-view.show')].at(-1)?.querySelector('.push-title,.nav-title,h1')?.textContent||document.querySelector('#pushLayer .push-view.show:last-child')?.textContent.slice(0,40)}});
    assert.match(r.text||'',/シフトから計算・.*更新/);assert.match(r.title||'',/給与・勤務先/);
    return r.text.replace(/\s+/g,' ').trim().slice(0,40)},{page});

  await check(`S-14 ${cfg}`,'同じ日に2回働いても交通費は1日分。終日の予定（00:00-00:00）は勤務にしない。午前/午後の表記も読める',async p=>{
    relayText='2026-10-04 10:00-14:00 GU\n2026-10-04 17:00-21:00 GU\n2026-10-05 00:00-00:00 GU\n2026-10-06 午前10:00-午後2:00 GU';relayAt=3000;
    const r=await p.evaluate(async()=>{const t=globalThis.__mm3Test;await t.shiftV18.sync({silent:true,force:true});const d=t.getData(),gid=d.employers.find(e=>e.name==='GU').id,rec=d.salaryRecords.find(x=>x.employerId===gid&&x.month==='2026-10');return{gross:rec.gross,transport:rec.transport,n:rec.shiftCount}});
    /* 前に届いた10/1・10/3（各7h=9100）は残る。10/4: 4時間×2（各30分休憩）=7h=9100、10/6: 3.5h=4550。交通費は4日分 840×4（10/4は1日分） */
    assert.equal(r.n,5);assert.equal(r.transport,3360);assert.equal(r.gross,9100*3+4550+3360);
    return `5回・4日 → ¥${r.gross}（交通費¥${r.transport}）`},{page});

  await check(`S-15 ${cfg}`,'シフトボードで消した月の給与予定は残らない',async p=>{
    relayText='2026-10-08 10:00-18:00 GU\n2026-11-03 10:00-18:00 GU';relayAt=4000;
    const a=await p.evaluate(async()=>{const t=globalThis.__mm3Test;await t.shiftV18.sync({silent:true,force:true});const d=t.getData(),gid=d.employers.find(e=>e.name==='GU').id;return d.salaryRecords.filter(x=>x.employerId===gid&&x.month==='2026-11').length});
    relayText='2026-10-08 10:00-18:00 GU';relayAt=5000;
    const b=await p.evaluate(async()=>{const t=globalThis.__mm3Test;await t.shiftV18.sync({silent:true,force:true});const d=t.getData(),gid=d.employers.find(e=>e.name==='GU').id;return d.salaryRecords.filter(x=>x.employerId===gid&&x.month==='2026-11'&&x.source==='shift').length});
    assert.equal(a,1);assert.equal(b,0);return '11月のシフトを消す → 11月の給与予定も消える'},{page});

  await check(`S-16 ${cfg}`,'給与画面で月を切り替えても、左上の戻るボタンが消えない',async p=>{
    const r=await p.evaluate(async()=>{const t=globalThis.__mm3Test;t.ev("detailOrigin='today';activeTab='pay';renderAll()");await new Promise(r=>setTimeout(r,50));const before=!!document.querySelector('#screen-pay .detail-back');await t.ev("changeSalaryMonth('2026-12')");await new Promise(r=>setTimeout(r,500));const after=!!document.querySelector('#screen-pay .detail-back');t.ev("payViewMonth=ym();activeTab='today';renderAll()");return{before,after}});
    assert.deepEqual(r,{before:true,after:true});return '切り替え後も ‹ ホーム'},{page});

  await check(`S-17 ${cfg}`,'以前のシフトの給与予定（交通費が総支給額に入っていない）は一度だけ直す',async p=>{
    const r=await p.evaluate(()=>{const t=globalThis.__mm3Test,f=t.ev('prepareLoadedData'),d=t.getData();d.meta={...d.meta,shiftGrossV19:false};d.salaryRecords=[{id:'x1',employerId:d.employers[0].id,month:'2026-12',date:'2027-01-10',gross:9100,transport:840,status:'予定',source:'shift'},{id:'x2',employerId:d.employers[0].id,month:'2027-01',date:'2027-02-10',gross:5000,transport:840,status:'予定',source:'manual'}];const once=f(d),twice=f(once);return{a:once.salaryRecords.map(x=>x.gross),b:twice.salaryRecords.map(x=>x.gross)}});
    assert.deepEqual(r.a,[9940,5000]);assert.deepEqual(r.b,[9940,5000]);return 'シフト分だけ ¥9,100→¥9,940（2回目は変えない）'},{page});

  await check(`S-13 ${cfg}`,'エラーが出ていない',async()=>{assert.deepEqual(errors.filter(e=>!/favicon|ERR_|Failed to load resource/.test(e)),[]);return '0件'},{page});
  await context.close();
}
writeFileSync(resolve(root,'docs/design/salary-v18-results.json'),JSON.stringify(results,null,1));
await closeHarness();
console.log(`${Object.keys(results).length-failed}/${Object.keys(results).length} salary checks passed`);
if(failed)process.exitCode=1;
