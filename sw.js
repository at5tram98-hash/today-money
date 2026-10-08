/* No financial data or app assets are cached by this worker. */
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let payload={};try{payload=event.data?.json()||{}}catch{}
  const target=['day-close','mail','atf','today'].includes(payload.target)?payload.target:'today';
  event.waitUntil(self.registration.showNotification(String(payload.title||'My Money').slice(0,80),{body:String(payload.body||'登録内容を確認してください').slice(0,250),tag:String(payload.tag||'money-update').slice(0,80),icon:'./icons/app-192.png',badge:'./icons/badge.svg',data:{target}}));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=['day-close','mail','atf','today'].includes(event.notification.data?.target)?event.notification.data.target:'today';
  event.waitUntil((async()=>{
    const base=new URL(self.registration.scope),windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    const client=windows.find(w=>{const url=new URL(w.url);return url.origin===base.origin&&url.pathname.startsWith(base.pathname)});
    if(client){await client.focus();client.postMessage({type:'money-notification',target});return}
    base.searchParams.set('notice',target);await self.clients.openWindow(base.href);
  })());
});
