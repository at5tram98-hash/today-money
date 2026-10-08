import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import webpush from 'web-push';
import {createECDH,randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import ece from 'http_ece';
const vapid=webpush.generateVAPIDKeys(),receiver=createECDH('prime256v1');receiver.generateKeys();const auth=randomBytes(16).toString('base64url');
const mf=new Miniflare(convertV4MiniflareOptions({modules:true,scriptPath:'test-results/worker-build/index.js',compatibilityDate:'2026-10-07',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],bindings:{APP_URL:'https://at5tram98-hash.github.io/today-money/',VAPID_SUBJECT:'https://at5tram98-hash.github.io/today-money/',VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,PAIRING_SECRET:randomBytes(32).toString('hex')},outboundService:async request=>{const body=Buffer.from(await request.arrayBuffer());assert.equal(JSON.parse(ece.decrypt(body,{privateKey:receiver,authSecret:auth})).target,'today');return new Response(null,{status:201})}}));
try{
  const db=await mf.getD1Database('DB');for(const statement of readFileSync('worker/schema.sql','utf8').split(';').filter(x=>x.trim()))await db.prepare(statement).run();
  const env=await mf.getBindings();
  const send=(path,token,body={})=>mf.dispatchFetch('https://money.workers.dev'+path,{method:'POST',headers:{Origin:'https://at5tram98-hash.github.io',Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await send('/v1/pair',env.PAIRING_SECRET,{subscription:{endpoint:'https://web.push.apple.com/runtime-device',keys:{p256dh:receiver.getPublicKey().toString('base64url'),auth}},summary:{date:'2026-10-07',closed:false,pendingCount:0},preferences:{}});
  assert.equal(response.status,200);const {token}=await response.json();const delivery=await send('/v1/test',token);assert.equal(delivery.status,200,await delivery.text());assert.equal((await send('/v1/delete',token)).status,200);
  console.log('PASS actual Workers runtime: D1 enrollment, Web Push encryption, test delivery, device deletion');
}finally{await mf.dispose()}
