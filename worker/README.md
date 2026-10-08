# Web Push 配信基盤

GitHub Pagesは画面を配信します。閉じたアプリへの通知はCloudflare WorkersのCronとD1で送ります。現段階の公開設定は未接続であり、配信は開始しません。

## 本番接続

1. `npm ci`、`npx wrangler login`で所有者のCloudflareアカウントへ接続する。
2. `npx wrangler d1 create today-money-push`でD1を作り、返されたIDを`worker/wrangler.jsonc`の`database_id`へ設定する。
3. `npx wrangler d1 execute today-money-push --remote --config worker/wrangler.jsonc --file worker/schema.sql`でスキーマを作る。
4. `node worker/generate-secrets.mjs`でVAPID鍵と256ビット接続コードを生成する。既存ファイルは上書きしない。
5. `.dev.vars`から`VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`PAIRING_SECRET`を各々`npx wrangler secret put 名前 --config worker/wrangler.jsonc`へ入力する。秘密値をGitHubへ保存しない。
6. `npx wrangler deploy --config worker/wrangler.jsonc`で公開し、`/health`を確認する。
7. `push-config.json`の`apiBase`に公開されたHTTPS URL、`vapidPublicKey`に公開鍵を設定してPagesを再公開する。
8. アプリの「設定→通知設定」で接続コードを入力し、同期へ同意して通知を許可する。iPhoneはホーム画面に追加したアプリから操作する。

アカウントの認証、端末のホーム画面追加、通知許可は所有者・端末利用者の操作が必要。これらを自動で承諾することはできない。Cron設定の反映には時間がかかる場合がある。OS・通信により配信時刻は遅れる。

## データと運用

- 端末別の秘密トークンで認証。集計、通知設定、暗号化用購読鍵と配信先をD1に保存する。CORSはPagesの所有者ドメインのみ。最大20端末。
- 金額同期は初期オフ。原明細、店舗名、口座残高、Gmail認証情報は送らない。Gmailを閉じたアプリの代わりにサーバーで取り込む仕組みは追加していない。
- 日締めは21時初期値。状況通知は12時・18時に各1回。日本時間23時〜7時は休止する。
- ATFと承認待ちは最後に同期した情報が24時間以内の場合だけ。状況通知には更新時刻を表示し、当日以外の金額は送らない。未同期の新着メールは検出できない。
- 日締めリマインドは最終同期から7日以内。締め済み状態が未同期なら通知される場合がある。
- 通知キーをD1で一意に確保し重複送信を防ぐ。429/5xx/通信失敗は5分後に最大3回試す。送信中に実行が停止した場合は重複を避けるため再送しない（送達保証ではない）。404/410購読は削除。
- 停止操作は該当端末のサーバー購読・配信履歴を削除する。配信履歴は8日で削除。端末認証は金融バックアップと別の保存領域に置く。
- 全端末を取り消す場合は所有者がD1のdevicesとdeliveriesを削除し、接続コードを変更する。配信エラーが続く場合はVAPID設定・購読失効を確認する。

公式資料: [WebKit Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)、[Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[Node crypto互換](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/)、[web-push](https://github.com/web-push-libs/web-push)。
