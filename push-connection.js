/* Shared by the page and the Service Worker. No ledger or Gmail data is stored here. */
(() => {
  const DATABASE = "myMoney3_push_v1",
    STORE = "connection";
  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function transact(mode, operation) {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode),
        request = operation(tx.objectStore(STORE));
      let result;
      request.onsuccess = () => {
        result = request.result;
      };
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("通知の接続を保存できません"));
      };
    });
  }
  const read = () => transact("readonly", (store) => store.get("device"));
  const write = (value) =>
    transact("readwrite", (store) => store.put(value, "device"));
  const clear = () => transact("readwrite", (store) => store.delete("device"));
  function bytes(value) {
    const raw = atob(
      value.replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - (value.length % 4)) % 4),
    );
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  function sameKey(buffer, key) {
    if (!buffer) return true;
    const a = new Uint8Array(buffer),
      b = bytes(key);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  async function request(connection, path, body = {}) {
    const url = new URL(connection.apiBase);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("通知サーバーの接続先が不正です");
    const response = await fetch(connection.apiBase + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + (connection.token || ""),
      },
      credentials: "omit",
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const error = new Error(
        response.status === 401
          ? "通知の端末認証が失効しています。再接続してください"
          : `通知の接続に失敗しました（${response.status}）`,
      );
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  async function reconcile(
    registration,
    connection,
    { replacement = null, force = false } = {},
  ) {
    let subscription =
      replacement || (await registration.pushManager.getSubscription());
    if (
      subscription &&
      !sameKey(
        subscription.options?.applicationServerKey,
        connection.vapidPublicKey,
      )
    )
      throw new Error(
        "通知の公開鍵が変更されています。配信基盤の鍵を確認してください",
      );
    if (
      subscription?.expirationTime &&
      subscription.expirationTime <= Date.now()
    ) {
      await subscription.unsubscribe();
      subscription = null;
    }
    if (!subscription)
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes(connection.vapidPublicKey),
      });
    if (force || subscription.endpoint !== connection.endpoint) {
      await request(connection, "/v1/subscription", {
        subscription: subscription.toJSON(),
      });
      connection = { ...connection, endpoint: subscription.endpoint };
      await write(connection);
    }
    return { connection, subscription };
  }
  globalThis.MoneyPushConnection = Object.freeze({
    read,
    write,
    clear,
    bytes,
    sameKey,
    request,
    reconcile,
  });
})();
