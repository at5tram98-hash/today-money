import test from 'node:test';
import assert from 'node:assert/strict';
import {createECDH,randomBytes,createPublicKey,verify} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import webpush from 'web-push';
import ece from 'http_ece';
import {handleRequest,dueNotices,runScheduled,sendPush,normalizePreferences,normalizeSummary,validateSubscription} from '../worker/index.js';

const keys=webpush.generateVAPIDKeys(),ecdh=createECDH('prime256v1');ecdh.generateKeys();
const auth=randomBytes(16).toString('base64url');
const subscription={endpoint:'https://web.push.apple.com/test-device',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth}};
function fixture(){
  const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
  const prepare=query=>({bind(...args){return statement(query,args)},...statement(query,[])});
  function statement(query,args){return {bind(...next){return statement(query,next)},async run(){return{meta:{changes:Number(sql.prepare(query).run(...args).changes)}}},async first(){return sql.prepare(query).get(...args)||null},async all(){return{results:sql.prepare(query).all(...args)}}}}
  return {env:{DB:{prepare,batch:async list=>Promise.all(list.map(x=>x.run()))},APP_URL:'https://at5tram98-hash.github.io/today-money/',VAPID_SUBJECT:'https://at5tram98-hash.github.io/today-money/',VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,PAIRING_SECRET:randomBytes(32).toString('hex')},sql};
}
const summary={date:'2026-10-07',closed:false,changed:false,spending:1001,pendingCount:2,risk:{date:'2026-10-10',label:'資金不足'}};
const request=(path,token,body={},origin='https://at5tram98-hash.github.io')=>new Request('https://money.workers.dev'+path,{method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});

test('subscription rejects arbitrary destinations and malformed encryption keys',()=>{
  assert.equal(validateSubscription(subscription).endpoint,subscription.endpoint);
  for(const endpoint of ['http://web.push.apple.com/test','https://evil.example/test','https://web.push.apple.com.evil.example/test','https://user:pass@web.push.apple.com/test'])assert.throws(()=>validateSubscription({...subscription,endpoint}));
  assert.throws(()=>validateSubscription({...subscription,keys:{...subscription.keys,auth:'bad'}}));
});
test('privacy defaults strip amounts and unknown fields from stored summaries',()=>{
  const prefs=normalizePreferences({});const clean=normalizeSummary({...summary,gmailToken:'secret',transactions:[{amount:999}]},prefs);
  assert.equal(clean.spending,null);assert.equal('gmailToken' in clean,false);assert.equal('transactions' in clean,false);
  assert.equal(normalizeSummary(summary,normalizePreferences({showAmount:true})).spending,1001);
  assert.throws(()=>normalizeSummary({...summary,date:'2026-02-31'},prefs));
});
test('API enrollment requires a setup secret; each device token is isolated and revocable',async()=>{
  const {env,sql}=fixture();
  assert.equal((await handleRequest(request('/v1/pair','wrong',{subscription,summary}),env)).status,401);
  assert.equal((await handleRequest(request('/v1/pair',env.PAIRING_SECRET,{subscription,summary},'https://evil.example'),env)).status,403);
  const response=await handleRequest(request('/v1/pair',env.PAIRING_SECRET,{subscription,summary}),env),{token}=await response.json();assert.equal(response.status,200);assert.match(token,/^[a-f0-9]{64}$/);
  assert.equal(sql.prepare('SELECT summary FROM devices').get().summary.includes('"spending":null'),true);
  assert.equal((await handleRequest(request('/v1/sync','other',{revision:1,summary}),env)).status,401);
  await handleRequest(request('/v1/sync',token,{revision:2,summary:{...summary,pendingCount:3}}),env);
  await handleRequest(request('/v1/sync',token,{revision:1,summary:{...summary,pendingCount:99}}),env);
  assert.equal(JSON.parse(sql.prepare('SELECT summary FROM devices').get().summary).pendingCount,3);
  assert.equal((await handleRequest(request('/v1/delete',token),env)).status,200);assert.equal(sql.prepare('SELECT count(*) AS n FROM devices').get().n,0);
  assert.equal((await handleRequest(request('/v1/sync',token,{revision:3,summary}),env)).status,401);sql.close();
});
test('Web Push encrypts a readable payload for only the subscription and signs valid VAPID',async()=>{
  const {env,sql}=fixture();const payload={title:'日締め',body:'確認してください',target:'day-close'};let details;
  await sendPush(env,subscription,payload,async(url,options)=>{details={url,...options};return new Response(null,{status:201})});
  assert.deepEqual(JSON.parse(ece.decrypt(details.body,{version:'aes128gcm',privateKey:ecdh,authSecret:auth}).toString()),payload);
  const authorization=details.headers.Authorization||details.headers.authorization,jwt=authorization.match(/t=([^,]+)/)[1],parts=jwt.split('.');
  const claims=JSON.parse(Buffer.from(parts[1],'base64url'));assert.equal(claims.aud,'https://web.push.apple.com');assert.ok(claims.exp>Date.now()/1000&&claims.exp<=Date.now()/1000+86400);
  const publicBytes=Buffer.from(keys.publicKey,'base64url'),publicKey=createPublicKey({key:{kty:'EC',crv:'P-256',x:publicBytes.subarray(1,33).toString('base64url'),y:publicBytes.subarray(33).toString('base64url')},format:'jwk'});
  assert.equal(verify('sha256',Buffer.from(parts[0]+'.'+parts[1]),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')),true);sql.close();
});
test('scheduler follows Tokyo time, quiet hours, day status and freshness',()=>{
  const at=iso=>new Date(iso).getTime(),device={preferences:JSON.stringify({dayClose:true,spending:true,showAmount:true}),summary:JSON.stringify(summary),synced_at:at('2026-10-07T08:00:00Z')};
  assert.equal(dueNotices(device,at('2026-10-07T12:00:00Z')).filter(n=>n.target==='day-close').length,1);
  device.summary=JSON.stringify({...summary,closed:true});assert.equal(dueNotices(device,at('2026-10-07T12:00:00Z')).some(n=>n.target==='day-close'),false);
  assert.equal(dueNotices(device,at('2026-10-07T14:00:00Z')).length,0);
  device.summary=JSON.stringify(summary);device.synced_at=at('2026-10-07T02:59:00Z');assert.ok(dueNotices(device,at('2026-10-07T03:00:00Z')).find(n=>n.target==='today').body.includes('1001'.replace('1001','1,001')));
  assert.equal(dueNotices(device,at('2026-10-08T12:00:00Z')).some(n=>n.target==='today'||n.target==='atf'||n.target==='mail'),false);
});
test('scheduler deduplicates calls, removes gone subscriptions and bounds retries',async()=>{
  const {env,sql}=fixture(),now=new Date('2026-10-07T12:00:00Z').getTime();
  sql.prepare('INSERT INTO devices VALUES(?,?,?,?,?,?,0,?,0,1)').run('d','hash',subscription.endpoint,JSON.stringify(subscription),JSON.stringify({...summary,pendingCount:0,risk:null}),JSON.stringify({dayClose:true}),now);
  let sends=0;const deliver=async()=>{sends++;return new Response(null,{status:201})};await runScheduled(env,now,deliver);await runScheduled(env,now+60000,deliver);assert.equal(sends,1);
  sql.exec('DELETE FROM deliveries');await runScheduled(env,now,async()=>new Response(null,{status:503}));await runScheduled(env,now+60000,deliver);assert.equal(sends,1);await runScheduled(env,now+360000,deliver);assert.equal(sends,2);
  sql.exec('DELETE FROM deliveries');await runScheduled(env,now,async()=>new Response(null,{status:410}));assert.equal(sql.prepare('SELECT enabled FROM devices').get().enabled,0);sql.close();
});

test('automatic enrollment activates only after the device receives an encrypted proof',async()=>{
  const {env,sql}=fixture();let proof;
  const deliver=async(url,options)=>{proof=JSON.parse(ece.decrypt(options.body,{version:'aes128gcm',privateKey:ecdh,authSecret:auth}).toString());return new Response(null,{status:201})};
  const response=await handleRequest(request('/v1/enroll','',{subscription,summary}),env,deliver);assert.equal(response.status,200);const {token,id}=await response.json();
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM devices').get().n,0);
  assert.equal((await handleRequest(request('/v1/enroll/confirm','',{id,challenge:'0'.repeat(64)}),env)).status,401);
  assert.equal((await handleRequest(request('/v1/enroll/send',token),env,deliver)).status,200);assert.equal(proof.kind,'connection-proof');
  assert.equal((await handleRequest(request('/v1/enroll/confirm','',{id:proof.id,challenge:proof.challenge}),env)).status,200);
  assert.equal((await handleRequest(request('/v1/status',token),env)).status,200);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM enrollments').get().n,0);
  const fresh={...subscription,endpoint:'https://web.push.apple.com/renewed'};
  assert.equal((await handleRequest(request('/v1/subscription',token,{subscription:fresh}),env)).status,200);
  assert.equal(sql.prepare('SELECT endpoint FROM devices').get().endpoint,fresh.endpoint);sql.close();
});
test('registration limits, expiry and wrong origins cannot enable another device',async()=>{
  const {env,sql}=fixture();
  assert.equal((await handleRequest(request('/v1/enroll','',{subscription,summary},'https://other.example'),env)).status,403);
  let token;for(let i=0;i<5;i++){const response=await handleRequest(request('/v1/enroll','',{subscription,summary}),env);assert.equal(response.status,200);token=(await response.json()).token}
  assert.equal((await handleRequest(request('/v1/enroll','',{subscription,summary}),env)).status,429);
  sql.exec('UPDATE enrollments SET expires_at=0');assert.equal((await handleRequest(request('/v1/enroll/send',token),env)).status,401);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM devices').get().n,0);sql.close();
});
test('code redeployment and subscription recovery preserve device tokens and schedule history',async()=>{
  const {env,sql}=fixture(),now=Date.now();const paired=await handleRequest(request('/v1/pair',env.PAIRING_SECRET,{subscription,summary}),env),{token}=await paired.json();
  const device=sql.prepare('SELECT * FROM devices').get();sql.prepare("INSERT INTO deliveries(device_id,notice_key,status,claimed_at,attempts) VALUES(?,?,'sent',?,1)").run(device.id,'kept',now);
  sql.exec('UPDATE devices SET enabled=0');const result=await handleRequest(request('/v1/subscription',token,{subscription:{...subscription,endpoint:'https://web.push.apple.com/recovered'}}),{...env});assert.equal(result.status,200);
  assert.equal(sql.prepare('SELECT enabled FROM devices').get().enabled,1);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM deliveries').get().n,1);assert.equal((await handleRequest(request('/v1/status',token),{...env})).status,200);sql.close();
});

test('cancelling enrollment revokes a completed registration as well as an unconfirmed one',async()=>{
  const {env,sql}=fixture();let proof;const deliver=async(url,options)=>{proof=JSON.parse(ece.decrypt(options.body,{version:'aes128gcm',privateKey:ecdh,authSecret:auth}));return new Response(null,{status:201})};const response=await handleRequest(request('/v1/enroll','',{subscription,summary}),env),{token}=await response.json();await handleRequest(request('/v1/enroll/send',token),env,deliver);await handleRequest(request('/v1/enroll/confirm','',{id:proof.id,challenge:proof.challenge}),env);assert.equal((await handleRequest(request('/v1/enroll/cancel',token),env)).status,200);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM devices').get().n,0);assert.equal((await handleRequest(request('/v1/status',token),env)).status,401);sql.close();
});
