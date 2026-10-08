import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createECDH, randomBytes } from "node:crypto";

// Opt-in owner check. It creates only temporary synthetic notification devices,
// disables every reminder, sends no Push, and revokes each device in finally.
const config = JSON.parse(readFileSync("push-config.json", "utf8"));
const secrets = Object.fromEntries(
  readFileSync("worker/.dev.vars", "utf8")
    .trim()
    .split("\n")
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
assert.ok(
  config.apiBase && config.vapidPublicKey,
  "Production config is missing",
);
assert.ok(secrets.PAIRING_SECRET, "Owner verification secret is missing");
const origin = new URL(
  JSON.parse(readFileSync("worker/wrangler.jsonc", "utf8")).vars.APP_URL,
).origin;
const receiver = createECDH("prime256v1");
receiver.generateKeys();
const subscription = {
  endpoint:
    "https://web.push.apple.com/today-money-verify-" +
    randomBytes(16).toString("hex"),
  keys: {
    p256dh: receiver.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
  },
};
const preferences = {
  dayClose: false,
  atf: false,
  mail: false,
  spending: false,
  showAmount: false,
  closeTime: "21:00",
};
const summary = {
  date: new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()),
  closed: true,
  pendingCount: 0,
  risk: null,
};
const send = (path, token = "", body = {}, requestOrigin = origin) =>
  fetch(config.apiBase + path, {
    method: "POST",
    headers: {
      Origin: requestOrigin,
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
let pendingToken, deviceToken;
try {
  const response = await fetch(config.apiBase + "/health", {
      signal: AbortSignal.timeout(15000),
    }),
    health = await response.json();
  assert.equal(response.status, 200);
  assert.equal(health.apiVersion, 2);
  assert.equal(health.vapidPublicKey, config.vapidPublicKey);
  assert.equal((await send("/v1/status", "invalid")).status, 401);
  assert.equal(
    (
      await send(
        "/v1/enroll",
        "",
        { subscription, summary, preferences },
        "https://untrusted.example",
      )
    ).status,
    403,
  );
  console.log(
    "PASS production HTTPS, D1 health, public key, origin and token checks",
  );
  const pending = await send("/v1/enroll", "", {
    subscription,
    summary,
    preferences,
  });
  assert.equal(pending.status, 200);
  const enrollment = await pending.json();
  pendingToken = enrollment.token;
  assert.ok(typeof pendingToken === "string", "Pending token missing");
  assert.equal((await send("/v1/status", pendingToken)).status, 401);
  assert.equal((await send("/v1/enroll/cancel", pendingToken)).status, 200);
  pendingToken = null;
  console.log(
    "PASS production pending enrollment cannot activate without receiver proof and can be cancelled",
  );
  const paired = await send("/v1/pair", secrets.PAIRING_SECRET, {
    subscription,
    summary,
    preferences,
  });
  assert.equal(paired.status, 200);
  deviceToken = (await paired.json()).token;
  assert.ok(typeof deviceToken === "string", "Device token missing");
  const before = await send("/v1/status", deviceToken);
  assert.equal(before.status, 200);
  assert.equal((await before.json()).confirmed, true);
  const revision = Date.now();
  assert.equal(
    (await send("/v1/sync", deviceToken, { revision, summary, preferences }))
      .status,
    200,
  );
  assert.equal(
    (
      await send("/v1/subscription", deviceToken, {
        subscription: {
          ...subscription,
          endpoint: subscription.endpoint + "-renewed",
        },
      })
    ).status,
    200,
  );
  assert.equal((await send("/v1/status", deviceToken)).status, 200);
  assert.equal((await send("/v1/delete", deviceToken)).status, 200);
  assert.equal((await send("/v1/status", deviceToken)).status, 401);
  deviceToken = null;
  console.log(
    "PASS production authenticated sync, subscription renewal, deletion and token revocation",
  );
} finally {
  if (pendingToken)
    await send("/v1/enroll/cancel", pendingToken).catch(() => {});
  if (deviceToken) await send("/v1/delete", deviceToken).catch(() => {});
}
