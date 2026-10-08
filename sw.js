/* No financial data or app assets are cached by this worker. */
importScripts("./push-connection.js");
self.addEventListener("install", (event) =>
  event.waitUntil(self.skipWaiting()),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {}
  const target = ["day-close", "mail", "atf", "today"].includes(payload.target)
    ? payload.target
    : "today";
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(
        String(payload.title || "My Money").slice(0, 80),
        {
          body: String(payload.body || "登録内容を確認してください").slice(
            0,
            250,
          ),
          tag: String(payload.tag || "money-update").slice(0, 80),
          icon: "./icons/app-192.png",
          badge: "./icons/badge.svg",
          data: { target },
        },
      );
      if (payload.kind === "connection-proof") {
        const connection = await MoneyPushConnection.read();
        if (connection?.enrolling && connection.enrollmentId === payload.id)
          await MoneyPushConnection.request(connection, "/v1/enroll/confirm", {
            id: payload.id,
            challenge: payload.challenge,
          });
      }
    })().catch(() => {}),
  );
});
self.addEventListener("pushsubscriptionchange", (event) =>
  event.waitUntil(
    (async () => {
      const connection = await MoneyPushConnection.read();
      if (!connection?.token || connection.enrolling) return;
      try {
        await MoneyPushConnection.reconcile(self.registration, connection, {
          replacement: event.newSubscription,
          force: true,
        });
      } catch {
        await MoneyPushConnection.write({
          ...connection,
          reconnectNeeded: true,
        });
      }
      const windows = await self.clients.matchAll({ type: "window" });
      windows.forEach((client) =>
        client.postMessage({ type: "money-push-refresh" }),
      );
    })().catch(() => {}),
  ),
);
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = ["day-close", "mail", "atf", "today"].includes(
    event.notification.data?.target,
  )
    ? event.notification.data.target
    : "today";
  event.waitUntil(
    (async () => {
      const base = new URL(self.registration.scope),
        windows = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
      const client = windows.find((w) => {
        const url = new URL(w.url);
        return (
          url.origin === base.origin && url.pathname.startsWith(base.pathname)
        );
      });
      if (client) {
        await client.focus();
        client.postMessage({ type: "money-notification", target });
        return;
      }
      base.searchParams.set("notice", target);
      await self.clients.openWindow(base.href);
    })(),
  );
});
