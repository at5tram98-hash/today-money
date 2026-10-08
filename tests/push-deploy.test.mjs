import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { privateSettings, deployPush } from "../worker/deploy.mjs";

test("deployment reuses private keys and refuses to overwrite them", () => {
  const root = mkdtempSync(resolve(tmpdir(), "money-push-keys-"));
  try {
    const path = resolve(root, ".dev.vars"),
      first = privateSettings(path),
      second = privateSettings(path);
    assert.deepEqual(second, first);
    assert.ok(first.VAPID_PRIVATE_KEY);
    assert.ok(first.PAIRING_SECRET.length === 64);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("authenticated redeployment retains the database, public key and URL without uploading secrets", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "money-push-deploy-")),
    calls = [];
  try {
    mkdirSync(resolve(root, "worker"));
    writeFileSync(
      resolve(root, "worker/wrangler.jsonc"),
      JSON.stringify({
        name: "today-money-push",
        d1_databases: [
          {
            binding: "DB",
            database_name: "today-money-push",
            database_id: "existing-db",
          },
        ],
      }),
    );
    writeFileSync(
      resolve(root, "push-config.json"),
      JSON.stringify({
        apiBase: "https://money.owner.workers.dev",
        vapidPublicKey: "same-key",
      }),
    );
    const run = async (args) => {
      calls.push(args);
      if (args[0] === "whoami") return "Authenticated";
      if (args[0] === "d1" && args[1] === "list")
        return JSON.stringify([
          { uuid: "existing-db", name: "today-money-push" },
        ]);
      if (args[0] === "secret")
        return JSON.stringify([
          { name: "VAPID_PUBLIC_KEY" },
          { name: "VAPID_PRIVATE_KEY" },
        ]);
      return "https://money.owner.workers.dev";
    };
    const result = await deployPush({
      root,
      run,
      fetcher: async () =>
        Response.json({ ok: true, apiVersion: 2, vapidPublicKey: "same-key" }),
    });
    assert.equal(result.publicConfigChanged, false);
    assert.equal(result.databaseId, "existing-db");
    assert.equal(
      calls.some((args) => args[0] === "secret" && args[1] === "bulk"),
      false,
    );
    assert.equal(
      calls.some((args) => args[0] === "d1" && args[1] === "create"),
      false,
    );
    assert.equal(existsSync(resolve(root, "worker/.dev.vars")), false);
    await assert.rejects(
      () =>
        deployPush({
          root,
          run,
          fetcher: async () =>
            Response.json({
              ok: true,
              apiVersion: 2,
              vapidPublicKey: "changed-key",
            }),
        }),
      /公開鍵/,
    );
    assert.equal(
      JSON.parse(readFileSync(resolve(root, "push-config.json")))
        .vapidPublicKey,
      "same-key",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("unauthenticated provisioning stops before creating or changing resources", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "money-push-auth-")),
    calls = [];
  try {
    mkdirSync(resolve(root, "worker"));
    writeFileSync(resolve(root, "worker/wrangler.jsonc"), "{}");
    writeFileSync(resolve(root, "push-config.json"), "{}");
    await assert.rejects(
      () =>
        deployPush({
          root,
          run: async (args) => {
            calls.push(args);
            return "You are not authenticated";
          },
        }),
      /所有者/,
    );
    assert.deepEqual(calls, [["whoami"]]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("published production configuration can be redeployed without changing connection identities", async () => {
  const root = mkdtempSync(resolve(tmpdir(), "money-push-production-config-"));
  try {
    mkdirSync(resolve(root, "worker"));
    const configText = readFileSync(new URL("../worker/wrangler.jsonc", import.meta.url), "utf8");
    const publicText = readFileSync(new URL("../push-config.json", import.meta.url), "utf8");
    const config = JSON.parse(configText);
    const published = JSON.parse(publicText);
    writeFileSync(resolve(root, "worker/wrangler.jsonc"), configText);
    writeFileSync(resolve(root, "push-config.json"), publicText);
    const binding = config.d1_databases.find(item => item.binding === "DB");
    assert.ok(binding && published.apiBase && published.vapidPublicKey);
    const result = await deployPush({
      root,
      run: async args => {
        if (args[0] === "whoami") return "Authenticated";
        if (args[0] === "d1" && args[1] === "list") return JSON.stringify([{name:binding.database_name,uuid:binding.database_id}]);
        if (args[0] === "secret" && args[1] === "list") return JSON.stringify([{name:"VAPID_PUBLIC_KEY"},{name:"VAPID_PRIVATE_KEY"}]);
        assert.ok(!(args[0] === "secret" && args[1] === "bulk"));
        assert.ok(!(args[0] === "d1" && args[1] === "create"));
        return published.apiBase;
      },
      fetcher: async () => Response.json({ok:true,apiVersion:2,vapidPublicKey:published.vapidPublicKey}),
    });
    assert.equal(result.publicConfigChanged, false);
    assert.equal(result.databaseId, binding.database_id);
    assert.equal(readFileSync(resolve(root, "push-config.json"), "utf8"), publicText);
    assert.deepEqual(JSON.parse(readFileSync(resolve(root, "worker/wrangler.jsonc"), "utf8")), config);
    assert.equal(existsSync(resolve(root, "worker/.dev.vars")), false);
  } finally {
    rmSync(root, {recursive:true,force:true});
  }
});
