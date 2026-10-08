# Web Push 配信基盤

GitHub Pagesは画面を配信し、閉じたアプリへの通知はCloudflare WorkersのCronとD1から送ります。現在の公開設定は未接続です。認証と本番配備が完了するまで通知は開始しません。

## 初回接続

所有者のCloudflare認証を完了してから、次を実行します。

```sh
npm ci
npx wrangler login
npm run push:deploy
```

`push:deploy`が認証、既存DBの確認、D1作成または再利用、スキーマ適用、Worker配備、初回の秘密鍵登録、DB疎通と公開鍵の一致を検証します。生成された`push-config.json`と`worker/wrangler.jsonc`をGitHubへ公開します。`worker/.dev.vars`は公開しません。秘密鍵はCloudflare Secretsで保持し、ローカルの初回生成ファイルも上書きしません。

端末では「設定→通知設定」で情報同期への同意と「通知を許可して接続」を操作します。iPhoneは追加済みのホーム画面アプリから実行します。接続コードの入力は不要です。初回の暗号化された確認通知をService Workerが受信して応答した端末だけを有効化します。通知許可は利用者本人の操作が必要です。

## アップデート後も維持する設定

- PagesのURL、`sw.js`のURLとscope、公開鍵、Worker名、DB IDを維持します。通常のビルド・Pages公開で通知購読を消す処理はありません。
- `push:deploy`は既存のD1・Secret・公開URLを再利用します。既存DBの不一致や鍵の不足・変更では停止し、別DBや新しい鍵へ自動で切り替えません。スキーマは追加のみで購読・配信履歴を維持します。
- Worker変更の自動配備は`.github/workflows/push.yml`に統合しています。所有者の認証後、GitHub Actions Secret `CLOUDFLARE_API_TOKEN`、変数`CLOUDFLARE_ACCOUNT_ID`を登録し、最後に変数`CLOUDFLARE_PUSH_ENABLED=true`で有効化します。現段階は未設定で、自動配備ジョブは実行されません。トークンは対象アカウントのWorkers編集・D1編集など必要な範囲に制限します。
- 再読み込み、画面復帰、オンライン復帰時に端末認証と購読を照合します。購読変更イベントでは、アプリを開いていなくても既存トークンで配信先を更新します。失敗時は再接続状態を保存し、次の起動で再試行します。
- 購読が消えた・期限切れ・配信先が404/410になった場合は、許可が残っていれば同じ公開鍵で再購読します。端末認証と通知履歴を維持します。OSが新しいユーザー操作を求める場合は「接続を確認・復旧」から進めます。失効した認証は接続準備をリセットして再登録できます。
- 通知認証は`myMoney3_pushDevice_v1`（localStorage）と`myMoney3_push_v1`（IndexedDB）に保存します。金融バックアップに秘密トークンを入れません。ページとService Workerは`src/js/push-connection.js`の共通実装を使います。ルートの同名ファイルはビルドで生成します。

## データと配信

- 端末別256ビット秘密トークンで認証し、集計・通知設定・購読鍵・配信先をD1に保存します。許可するPush配信先はApple・Chrome・Firefoxのサービスのみ。CORSは既存Pagesのオリジンに制限します。
- 登録待ちは10分で失効します。登録は送信元IPのハッシュごとに1分5件、登録済みと待機中を合わせて最大20端末です。確認通知は3回まで。停止・取消は該当トークンだけを無効化します。
- 金額同期は初期オフ。原明細、店舗名、口座残高、Gmail認証情報は送信しません。閉じたアプリの代わりにGmailを取り込む機能は追加していません。
- 日締めは初期21時。状況通知は12時・18時に各1回（初期オフ）。日本時間23時〜7時は休止します。
- ATF・承認待ち・金額通知は最後の同期が24時間以内の場合だけ。状況通知は当日の登録支出と更新時刻を表示します。未同期の新着メールは検出できません。
- 日締めリマインドはアプリを長く閉じても継続します。古い状態では未締めと断定せず、最終同期から時間が経過したことを示して確認を促します。締め状態が未同期の場合には通知されることがあります。
- 通知キーの一意制約で重複を防ぎ、429/5xx/通信失敗は5分後に最大3回試します。送信中に実行が停止した場合は重複を避けるため再送しません。404/410は配信を休止し、復旧用認証を残します。配信履歴は8日で削除します。
- 停止操作は端末のサーバー登録と配信履歴を削除し、端末の購読・接続保存も削除します。全端末の取消には所有者がD1のdevices・enrollments・deliveriesを削除します。通常アップデートでの鍵交換は行いません。

OS・通信・Cloudflare Cronの反映によって配信は遅れる場合があります。端末の通知許可取消、ブラウザデータ削除、アプリ削除、配信サービス側の失効後に必要な本人操作までは自動化できません。

## 検証

```sh
npm test
npm run test:browser
npm run test:worker
```

テストは登録確認の暗号化・復号、D1、認証・取消、重複・失効・復旧、実Service Worker更新後の保存維持を含みます。通知サービスのネットワークは検証用応答を使います。本番CronとiPhoneのOS通知到達は、所有者認証・本番接続・端末許可が済んでから確認します。

公式資料: [WebKit Web Push](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)、[Cloudflare Secretsの維持](https://developers.cloudflare.com/workers/configuration/secrets/)、[Cloudflare Cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/)、[購読変更](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/pushsubscriptionchange_event)、[web-push](https://github.com/web-push-libs/web-push)。
