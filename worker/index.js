import webpush from 'web-push';

const MAX_BODY=16384,DAY_MS=86400000;
const json=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
const daytime=value=>typeof value==='string'&&/^(0[7-9]|1\d|2[0-2]):[0-5]\d$/.test(value);
export function normalizePreferences(raw={}){
  return {dayClose:raw.dayClose!==false,closeTime:daytime(raw.closeTime)?raw.closeTime:'21:00',atf:raw.atf!==false,mail:raw.mail!==false,spending:raw.spending===true,showAmount:raw.showAmount===true,spendTimes:['12:00','18:00']};
}
export function normalizeSummary(raw={},prefs={}){
  if(!validDate(raw.date))throw new Error('invalid date');
  if(!Number.isInteger(raw.pendingCount)||raw.pendingCount<0||raw.pendingCount>100000)throw new Error('invalid count');
  const spending=prefs.showAmount&&Number.isInteger(raw.spending)&&Math.abs(raw.spending)<=999999999?raw.spending:null;
  return {date:raw.date,closed:raw.closed===true,changed:raw.changed===true,spending,pendingCount:raw.pendingCount,risk:raw.risk&&validDate(raw.risk.date)?{date:raw.risk.date,label:String(raw.risk.label||'資金見通しの警告').slice(0,64)}:null};
}
export function validateSubscription(raw){
  const url=new URL(raw?.endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!['web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com'].includes(url.hostname))throw new Error('unsupported push endpoint');
  const keys=raw?.keys||{},bytes=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]+={0,2}$/.test(value))throw new Error('invalid subscription key');return Buffer.from(value,'base64url')};
  if(bytes(keys.p256dh).length!==65||bytes(keys.p256dh)[0]!==4||bytes(keys.auth).length!==16)throw new Error('invalid subscription key');
  if(url.href.length>4096)throw new Error('endpoint too long');
  return {endpoint:url.href,keys:{p256dh:keys.p256dh,auth:keys.auth}};
}
function tokyoClock(now){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)),get=key=>parts.find(x=>x.type===key).value;
  return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
}
export function dueNotices(device,now=Date.now()){
  const clock=tokyoClock(now),prefs=normalizePreferences(JSON.parse(device.preferences)),summary=JSON.parse(device.summary),fresh=now-device.synced_at<=DAY_MS,notices=[];
  if(clock.time<'07:00'||clock.time>='23:00'||device.synced_at>now)return notices;
  if(prefs.dayClose&&clock.time>=prefs.closeTime&&now-device.synced_at<=7*DAY_MS&&!(summary.date===clock.date&&summary.closed))notices.push({key:`close:${clock.date}`,title:'一日の支出を確認しましょう',body:summary.date===clock.date&&summary.changed?'締めた後に登録内容が変わりました。もう一度確認できます。':'日締めがまだです。登録した支出と入力漏れを確認しましょう。',target:'day-close'});
  if(!fresh)return notices;
  if(prefs.atf&&summary.risk&&summary.risk.date>=clock.date)notices.push({key:`atf:${clock.date}:${summary.risk.date}`,title:'ATFの資金見通しを確認',body:`${summary.risk.date}：${summary.risk.label}。最後に同期した登録内容に基づく警告です。`,target:'atf'});
  if(prefs.mail&&summary.pendingCount>0)notices.push({key:`mail:${clock.date}`,title:'メール取込の承認待ち',body:`未確認が${summary.pendingCount}件あります。最後に同期した取込結果を確認してください。`,target:'mail'});
  if(prefs.spending&&summary.date===clock.date){for(const time of prefs.spendTimes){
    // Never send missed status notices hours late or invent today's zero total.
    if(clock.time>=time&&clock.time<`${String(Number(time.slice(0,2))+1).padStart(2,'0')}:00`){const updated=tokyoClock(device.synced_at).time;notices.push({key:`spend:${clock.date}:${time}`,title:'今日の登録支出',body:prefs.showAmount&&summary.spending!=null?`${summary.spending.toLocaleString('ja-JP')}円（${updated}更新）。登録漏れがないか確認しましょう。`:`${updated}までの登録内容を確認しましょう。金額はアプリ内で確認できます。`,target:'today'})}
  }}
  return notices;
}
export async function sendPush(env,subscription,payload,fetcher=fetch){
  const details=webpush.generateRequestDetails(validateSubscription(subscription),JSON.stringify(payload),{vapidDetails:{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY},TTL:1800,urgency:'normal',contentEncoding:'aes128gcm'});
  return fetcher(details.endpoint,{method:details.method,headers:details.headers,body:details.body,redirect:'manual',signal:AbortSignal.timeout(10000)});
}
async function deliver(env,device,notice,now,fetcher){
  const claim=await env.DB.prepare("INSERT INTO deliveries(device_id,notice_key,status,claimed_at,attempts) VALUES(?,?,'sending',?,1) ON CONFLICT(device_id,notice_key) DO UPDATE SET status='sending',claimed_at=excluded.claimed_at,attempts=deliveries.attempts+1 WHERE deliveries.status='retry' AND deliveries.claimed_at<? AND deliveries.attempts<3").bind(device.id,notice.key,now,now-300000).run();
  if(!claim.meta.changes)return;
  try{
    const response=await sendPush(env,JSON.parse(device.subscription),{...notice,tag:notice.key},fetcher);
    if(response.status===404||response.status===410){await env.DB.batch([env.DB.prepare('DELETE FROM devices WHERE id=?').bind(device.id),env.DB.prepare('DELETE FROM deliveries WHERE device_id=?').bind(device.id)]);return}
    if(!response.ok){await env.DB.prepare('UPDATE deliveries SET status=? WHERE device_id=? AND notice_key=?').bind(response.status===429||response.status>=500?'retry':'failed',device.id,notice.key).run();return}
    await env.DB.prepare("UPDATE deliveries SET status='sent',sent_at=? WHERE device_id=? AND notice_key=?").bind(now,device.id,notice.key).run();
  }catch{await env.DB.prepare("UPDATE deliveries SET status='retry' WHERE device_id=? AND notice_key=?").bind(device.id,notice.key).run()}
}
export async function runScheduled(env,now=Date.now(),fetcher=fetch){
  const {results}=await env.DB.prepare('SELECT * FROM devices WHERE enabled=1').all();
  for(const device of results)for(const notice of dueNotices(device,now))await deliver(env,device,notice,now,fetcher);
  await env.DB.prepare('DELETE FROM deliveries WHERE claimed_at<?').bind(now-8*DAY_MS).run();
}
async function readBody(request){
  const reader=request.body?.getReader();if(!reader)return {};let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BODY){await reader.cancel();throw new Error('body too large')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleRequest(request,env,fetcher=fetch){
  const origin=new URL(env.APP_URL).origin,headers={'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type,Authorization','Access-Control-Allow-Methods':'POST,GET,OPTIONS'};
  if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)return json({error:'origin denied'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const path=new URL(request.url).pathname;
  if(path==='/health'&&request.method==='GET')return json({ok:true},200,headers);
  if(request.method!=='POST')return json({error:'method not allowed'},405,headers);
  if(!env.PAIRING_SECRET||!env.VAPID_PRIVATE_KEY||!env.VAPID_PUBLIC_KEY)return json({error:'not configured'},503,headers);
  const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  if(!token||token.length>256)return json({error:'unauthorized'},401,headers);
  try{
    if(path==='/v1/pair'){
      // High entropy setup secret; unsuccessful authentication never writes to D1.
      if(await sha(token)!==await sha(env.PAIRING_SECRET))return json({error:'unauthorized'},401,headers);
      const body=await readBody(request),subscription=validateSubscription(body.subscription),prefs=normalizePreferences(body.preferences),summary=normalizeSummary(body.summary,prefs),endpoint=subscription.endpoint;
      const existing=await env.DB.prepare('SELECT id FROM devices WHERE endpoint=?').bind(endpoint).first(),count=await env.DB.prepare('SELECT COUNT(*) AS count FROM devices').first();
      if(!existing&&count.count>=20)return json({error:'device limit'},409,headers);
      const id=existing?.id||crypto.randomUUID(),deviceToken=randomToken();
      await env.DB.prepare('INSERT INTO devices(id,token_hash,endpoint,subscription,summary,preferences,revision,synced_at) VALUES(?,?,?,?,?,?,0,?) ON CONFLICT(endpoint) DO UPDATE SET token_hash=excluded.token_hash,subscription=excluded.subscription,summary=excluded.summary,preferences=excluded.preferences,revision=0,synced_at=excluded.synced_at').bind(id,await sha(deviceToken),endpoint,JSON.stringify(subscription),JSON.stringify(summary),JSON.stringify(prefs),Date.now()).run();
      return json({token:deviceToken},200,headers);
    }
    const device=await env.DB.prepare('SELECT * FROM devices WHERE token_hash=?').bind(await sha(token)).first();if(!device)return json({error:'unauthorized'},401,headers);
    if(path==='/v1/delete'){await env.DB.batch([env.DB.prepare('DELETE FROM devices WHERE id=?').bind(device.id),env.DB.prepare('DELETE FROM deliveries WHERE device_id=?').bind(device.id)]);return json({ok:true},200,headers)}
    if(path==='/v1/sync'){
      const body=await readBody(request),prefs=normalizePreferences(body.preferences),summary=normalizeSummary(body.summary,prefs);
      if(!Number.isSafeInteger(body.revision)||body.revision<1)return json({error:'invalid revision'},400,headers);
      await env.DB.prepare('UPDATE devices SET summary=?,preferences=?,revision=?,synced_at=? WHERE id=? AND revision<?').bind(JSON.stringify(summary),JSON.stringify(prefs),body.revision,Date.now(),device.id,body.revision).run();return json({ok:true},200,headers);
    }
    if(path==='/v1/test'){
      const now=Date.now(),claim=await env.DB.prepare('UPDATE devices SET last_test_at=? WHERE id=? AND last_test_at<?').bind(now,device.id,now-60000).run();if(!claim.meta.changes)return json({error:'wait one minute'},429,headers);
      const response=await sendPush(env,JSON.parse(device.subscription),{title:'My Money テスト通知',body:'通知が届きました。日締めや資金見通しを確認できます。',target:'today',tag:'test'},fetcher);
      return json({ok:response.ok},response.ok?200:502,headers);
    }
    return json({error:'not found'},404,headers);
  }catch{return json({error:'invalid request or delivery failed'},400,headers)}
}
export default {fetch:(request,env)=>handleRequest(request,env),scheduled:async(controller,env,ctx)=>{ctx.waitUntil(runScheduled(env,controller.scheduledTime))}};
