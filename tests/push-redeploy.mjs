import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { createECDH, randomBytes } from "node:crypto";

// Two owner-run phases verify a real server redeployment without sending Push.
const config = JSON.parse(readFileSync("push-config.json", "utf8"));
const origin = new URL(
  JSON.parse(readFileSync("worker/wrangler.jsonc", "utf8")).vars.APP_URL,
).origin;
const path = "test-results/push-redeploy-device.json";
const send = (route, token, body = {}) =>
  fetch(config.apiBase + route, {
    method: "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
const checkHealth = async () => {
  const response = await fetch(config.apiBase + "/health", {
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.vapidPublicKey, config.vapidPublicKey);
  assert.equal(health.ok, true);
};
if (process.argv[2] === "prepare") {
  assert.equal(
    existsSync(path),
    false,
    "An unfinished redeployment check already exists",
  );
  await checkHealth();
  const owner = Object.fromEntries(
    readFileSync("worker/.dev.vars", "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
  const key = createECDH("prime256v1");
  key.generateKeys();
  const subscription = {
    endpoint:
      "https://web.push.apple.com/today-money-redeploy-" +
      randomBytes(16).toString("hex"),
    keys: {
      p256dh: key.getPublicKey().toString("base64url"),
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
  let token;
  try {
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const response = await send("/v1/pair", owner.PAIRING_SECRET, {
      subscription,
      summary: { date, closed: true, pendingCount: 0, risk: null },
      preferences,
    });
    assert.equal(response.status, 200);
    const device = await response.json();
    token = device.token;
    assert.equal((await send("/v1/status", token)).status, 200);
    mkdirSync("test-results", { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ ...config, ...device, endpoint: subscription.endpoint }),
      { mode: 0o600, flag: "wx" },
    );
    console.log(
      "PASS temporary notification registration prepared for a real redeployment; all reminders are disabled",
    );
  } catch (error) {
    if (token) await send("/v1/delete", token).catch(() => {});
    throw error;
  }
} else if (process.argv[2] === "verify") {
  const device = JSON.parse(readFileSync(path, "utf8"));
  assert.ok(
    device.apiBase === config.apiBase &&
      device.vapidPublicKey === config.vapidPublicKey,
    "Server or key changed; no token was transmitted",
  );
  try {
    await checkHealth();
    const response = await send("/v1/status", device.token);
    assert.equal(response.status, 200);
    const status = await response.json();
    assert.equal(status.confirmed, true);
    assert.equal(status.enabled, true);
    console.log(
      "PASS real server redeployment retains the public key, device authentication and active registration",
    );
  } finally {
    const response = await send("/v1/delete", device.token);
    assert.equal(response.status, 200);
    assert.equal((await send("/v1/status", device.token)).status, 401);
    unlinkSync(path);
    console.log(
      "PASS redeployment test registration revoked and private fixture removed",
    );
  }
} else
  throw new Error("Use prepare before deploying, then verify after deploying");
