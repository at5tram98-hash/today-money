import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

function runtime(connection) {
  const handlers = {},
    calls = [],
    shown = [],
    writes = [];
  const transport = {
    read: async () => connection,
    request: async (c, path, body) => {
      calls.push({ apiBase: c.apiBase, path, body });
      return { ok: true };
    },
    write: async (c) => writes.push(c),
    reconcile: async (reg, c, options) => {
      calls.push(options);
      return { connection: c };
    },
  };
  const self = {
    addEventListener: (type, handler) => (handlers[type] = handler),
    registration: {
      scope: "https://example.com/today-money/",
      showNotification: async (title, options) =>
        shown.push({ title, options }),
    },
    clients: {
      matchAll: async () => [],
      openWindow: async (url) => calls.push({ url }),
    },
  };
  vm.runInNewContext(
    readFileSync(new URL("../sw.js", import.meta.url), "utf8"),
    { self, MoneyPushConnection: transport, importScripts: () => {}, URL },
  );
  const trigger = async (type, values) => {
    let result;
    handlers[type]({ ...values, waitUntil: (p) => (result = p) });
    await result;
  };
  return { calls, shown, writes, transport, trigger };
}
test("a registration proof is acknowledged only for the pending enrollment on this device", async () => {
  const r = runtime({
      apiBase: "https://trusted.workers.dev",
      enrolling: true,
      enrollmentId: "own-id",
    }),
    payload = {
      kind: "connection-proof",
      id: "other-id",
      challenge: "proof",
      apiBase: "https://evil.example",
      target: "https://evil.example",
    };
  await r.trigger("push", { data: { json: () => payload } });
  assert.equal(r.calls.length, 0);
  assert.equal(r.shown[0].options.data.target, "today");
  await r.trigger("push", {
    data: { json: () => ({ ...payload, id: "own-id" }) },
  });
  assert.equal(r.calls[0].apiBase, "https://trusted.workers.dev");
  assert.equal(r.calls[0].path, "/v1/enroll/confirm");
});
test("subscription changes use the stored token and retain a retry marker when offline", async () => {
  const r = runtime({ token: "device-token", endpoint: "old" });
  r.transport.reconcile = async () => {
    throw new Error("offline");
  };
  await r.trigger("pushsubscriptionchange", {
    newSubscription: { endpoint: "new" },
  });
  assert.equal(r.writes[0].token, "device-token");
  assert.equal(r.writes[0].reconnectNeeded, true);
});
test("invalid Push data still shows a visible notification and clicks stay in the application scope", async () => {
  const r = runtime(null);
  await r.trigger("push", {
    data: {
      json: () => {
        throw new Error("invalid JSON");
      },
    },
  });
  assert.equal(r.shown.length, 1);
  await r.trigger("notificationclick", {
    notification: { close() {}, data: { target: "https://evil.example" } },
  });
  assert.equal(r.calls[0].url, "https://example.com/today-money/?notice=today");
});

function pageRuntime(apiBase = "https://trusted.workers.dev") {
  const device = {
    apiBase: "https://trusted.workers.dev",
    vapidPublicKey: "test-public-key",
    token: "test-device-token",
    endpoint: "https://web.push.apple.com/test",
  };
  const storage = new Map([["myMoney3_pushDevice_v1", JSON.stringify(device)]]),
    requests = [],
    handlers = {};
  let saved = device;
  const context = vm.createContext({
    URL,
    AbortSignal,
    Uint8Array,
    atob,
    fetch: async (url, options) => {
      requests.push({ url, options });
      return new Response("{}", { status: 401 });
    },
    window: {
      isSecureContext: true,
      PushManager: {},
      Notification: {},
      addEventListener() {},
    },
    navigator: { serviceWorker: { ready: Promise.resolve({}) } },
    Notification: { permission: "granted" },
    document: { addEventListener() {} },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    showToast() {},
  });
  vm.runInContext(
    readFileSync(
      new URL("../src/js/push-connection.js", import.meta.url),
      "utf8",
    ),
    context,
  );
  context.MoneyPushConnection = {
    ...context.MoneyPushConnection,
    read: async () => saved,
    write: async (value) => {
      saved = value;
    },
    clear: async () => {
      saved = undefined;
    },
  };
  vm.runInContext(
    readFileSync(new URL("../src/js/web-push.js", import.meta.url), "utf8"),
    context,
  );
  vm.runInContext(
    `pushConfiguration = ${JSON.stringify({ apiBase, vapidPublicKey: device.vapidPublicKey })}`,
    context,
  );
  const root = {
    querySelectorAll: () => [],
    querySelector: (selector) =>
      selector === "#pushCloseTime"
        ? {}
        : selector === "#pushReconnect"
          ? {
              addEventListener: (type, handler) => {
                handlers[type] = handler;
              },
            }
          : null,
  };
  context.bindPushSettings(root, () => {});
  return { context, storage, requests, handlers, saved: () => saved };
}
test("expired page authentication can be reset and enrolled again without a permission prompt", async () => {
  const r = pageRuntime();
  assert.equal(await r.context.reconcilePushConnection(), false);
  assert.equal(
    JSON.parse(r.storage.get("myMoney3_pushDevice_v1")).invalidAuth,
    true,
  );
  assert.equal(r.requests.length, 1);
  await r.handlers.click();
  assert.equal(r.storage.has("myMoney3_pushDevice_v1"), false);
  assert.equal(r.saved(), undefined);
  assert.equal(r.requests.length, 1);
});
test("a changed public server configuration never receives the existing device token", async () => {
  const r = pageRuntime("https://other.workers.dev");
  assert.equal(await r.context.reconcilePushConnection(), false);
  assert.equal(r.requests.length, 0);
  assert.ok(r.storage.has("myMoney3_pushDevice_v1"));
  assert.equal(r.saved().apiBase, "https://trusted.workers.dev");
});
