import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import webpush from "web-push";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export function privateSettings(path) {
  if (!existsSync(path)) {
    const keys = webpush.generateVAPIDKeys();
    writeFileSync(
      path,
      `VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}\nPAIRING_SECRET=${randomBytes(32).toString("hex")}\n`,
      { mode: 0o600, flag: "wx" },
    );
  }
  const settings = Object.fromEntries(
    readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), line.slice(i + 1)];
      }),
  );
  for (const name of [
    "VAPID_PUBLIC_KEY",
    "VAPID_PRIVATE_KEY",
    "PAIRING_SECRET",
  ])
    if (!settings[name]) throw new Error("通知用の秘密設定が不足しています");
  return settings;
}
async function wrangler(args, { input = "", root = projectRoot } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      process.execPath,
      [resolve(root, "node_modules/wrangler/bin/wrangler.js"), ...args],
      {
        cwd: root,
        env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "",
      error = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (error += chunk));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolvePromise(output)
        : reject(
            new Error(
              `Cloudflare処理に失敗しました（${args[0]}、終了コード${code}）。認証とアカウント設定を確認してください。`,
            ),
          ),
    );
    child.stdin.end(input);
  });
}
export async function deployPush({
  root = projectRoot,
  run = wrangler,
  fetcher = fetch,
} = {}) {
  const configPath = resolve(root, "worker/wrangler.jsonc"),
    publicPath = resolve(root, "push-config.json"),
    config = JSON.parse(readFileSync(configPath, "utf8")),
    published = JSON.parse(readFileSync(publicPath, "utf8"));
  const auth = await run(["whoami"], { root });
  if (/not authenticated/.test(auth))
    throw new Error(
      "Cloudflare所有者の認証が必要です。先にwrangler loginを完了してください。",
    );
  const binding = config.d1_databases.find((item) => item.binding === "DB");
  if (!binding || config.name !== "today-money-push")
    throw new Error("既存の配信基盤名とDBの設定を確認してください");
  let databases = JSON.parse(await run(["d1", "list", "--json"], { root })),
    database = databases.find((item) => item.name === binding.database_name);
  if (!database) {
    if (published.apiBase || !binding.database_id.startsWith("REPLACE_"))
      throw new Error(
        "既存の通知DBが見つかりません。別のDBへ切り替えずアカウントを確認してください",
      );
    await run(["d1", "create", binding.database_name, "--location", "apac"], {
      root,
    });
    databases = JSON.parse(await run(["d1", "list", "--json"], { root }));
    database = databases.find((item) => item.name === binding.database_name);
  }
  if (!database) throw new Error("通知DBを確認できませんでした");
  if (
    !binding.database_id.startsWith("REPLACE_") &&
    binding.database_id !== database.uuid
  )
    throw new Error(
      "通知DBが変更されています。既存の購読を維持するDBを確認してください",
    );
  binding.database_id = database.uuid;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
  await run(
    [
      "d1",
      "execute",
      binding.database_name,
      "--remote",
      "--config",
      "worker/wrangler.jsonc",
      "--file",
      "worker/schema.sql",
    ],
    { root },
  );
  const deployed = await run(["deploy", "--config", "worker/wrangler.jsonc"], {
      root,
    }),
    urls = [
      ...new Set(
        deployed.match(/https:\/\/[a-zA-Z0-9.-]+\.workers\.dev\b/g) || [],
      ),
    ],
    apiBase = published.apiBase || urls[0];
  if (!apiBase || (!published.apiBase && urls.length !== 1))
    throw new Error("配信基盤の公開URLを一意に確認できませんでした");
  const secrets = JSON.parse(
      await run(["secret", "list", "--config", "worker/wrangler.jsonc"], {
        root,
      }),
    ),
    hasKeys = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY"].every((name) =>
      secrets.some((item) => item.name === name),
    );
  if (!hasKeys) {
    if (
      published.apiBase ||
      published.vapidPublicKey ||
      secrets.some((item) => item.name.startsWith("VAPID_"))
    )
      throw new Error(
        "既存の通知鍵が不足しています。自動で鍵を作り直さず設定を確認してください",
      );
    const settings = privateSettings(resolve(root, "worker/.dev.vars"));
    await run(["secret", "bulk", "--config", "worker/wrangler.jsonc"], {
      root,
      input: JSON.stringify(settings),
    });
  }
  const response = await fetcher(apiBase + "/health", {
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("本番通知サーバーの疎通確認に失敗しました");
  const health = await response.json();
  if (!health.ok || health.apiVersion !== 2 || !health.vapidPublicKey)
    throw new Error("本番通知サーバーの接続設定を検証できませんでした");
  if (
    published.vapidPublicKey &&
    published.vapidPublicKey !== health.vapidPublicKey
  )
    throw new Error(
      "通知の公開鍵が変更されています。既存の購読を保護するためPages設定を更新しません",
    );
  writeFileSync(
    publicPath,
    JSON.stringify(
      { apiBase, vapidPublicKey: health.vapidPublicKey },
      null,
      2,
    ) + "\n",
  );
  return {
    apiBase,
    databaseId: database.uuid,
    publicConfigChanged:
      published.apiBase !== apiBase ||
      published.vapidPublicKey !== health.vapidPublicKey,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await deployPush();
    console.log(
      `通知サーバーの配備・D1疎通・公開鍵維持を確認しました: ${result.apiBase}`,
    );
    console.log(
      result.publicConfigChanged
        ? "push-config.jsonをPagesへ公開してください。秘密設定は公開しないでください。"
        : "既存の接続設定を維持しました。",
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
