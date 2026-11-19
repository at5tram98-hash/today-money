# iOS 版の状況（2026-11-18・作り込み）

## ビルドと確認

- Mac（Xcode 27.2）でビルド成功。iPhone 17 Pro シミュレーター（iOS 26.5）で起動し、ホーム・支払い・その他・口座とカード・＋の新規入力（支出の保存）を確認。
- 初期データでの数値が Web 版と一致：総資産 ¥99,330、今月の給与 ¥83,110、次の給料日 11/25 無印良品 ¥34,300、今月の支払予定 ¥81,667、30日間の最低残高 ¥88,330。
- 実機（iPhone）ではまだ確認していない。Debug ビルドのシミュレーターでは起動に2〜3秒かかる。

## テスト（`cd ios/Packages/TodayMoneyCore && swift test`）→ 45件すべて成功

| テスト | 内容 |
|---|---|
| WebCompatTests（9件） | 日付・給料日・シフトの読み取り・勤務時間・給与の見込み・自動取り込み・給与のまとめ・支出・未知の項目を保つ |
| LedgerCompatTests（5件） | カードの締め・引落日・請求月、確定後の利用、支払月ごとの請求、予定（固定支払い・大型支出）を含むカードの請求、支払いのまとめ、次の引落、固定支払いの日、予定の入出金 |
| MutationCompatTests（2件） | 残高の入力→口座払い（今日・昨日・明日）→デビット→カードの支払済み（残高から引く・金額修正・未払いに戻す）→削除の各段階の残高と反映状態、臨時収入 |
| AcfCompatTests（1件・9通り） | ACF：初期データ／カードのあるデータ／カード利用OFF／比率50%・1日上限／曜日傾向なし・優先カード／カテゴリ限定／目標あり／最低残高が高い／C100。今日使える目安・最大額・月末予測・最低残高・状態・注意点・信頼度・日別の全行（現金余力・計画支出・カードの配分）・ACF指標 |
| ClosingGoalCompatTests（3件） | 日締め：8日分の照合項目・指紋・署名・状態が Web 版と同じ／Web 版の承認記録が iOS で承認済になる／確認待ちメール・18:00前は承認できない。目標：おすすめ（日・今月・来月）・日別配分・計画の作成・総額変更後の作り直し・1日の変更・保存結果 |
| ProCompatTests（6件） | 理由が分かる分析（2か月×4つの分け方×2つの比べ方）・増減の理由・給与分析・月締めの確認項目・口座ごとの60日見通し・予算の立て直し3通り・旅行目標のまとめ・目標から作る大型支出計画・給料日の振り分けのおすすめ・振替と立て直しの取り消し |
| QuickInputCompatTests（4件） | 一行入力の読み取り・電卓の補助・横断検索・タグとお気に入り |
| StatementCompatTests（4件） | PayPay カードの CSV・三井住友カードの PDF（行）の読み取り、カテゴリと重複の判定、取込 → 確定 → 取り消しの流れ |
| MailCompatTests（2件） | Gmail のメール11通の解析（取得元の設定2通り）・確認の要否、同期 → 確認 → 反映 → 再同期の流れ |
| AssetsCompatTests（1件） | 資産：預金合計の履歴・期間ごとの点・口座ごとの履歴と増減・30日の増減・割合・並べ替え・口座詳細（入金／出金・自由に使える額・動き） |
| SalaryDashboardCompatTests（1件） | 給与：月の内訳・前月比・勤務先別の割合（合計100%の丸め）・勤務先の行（状態・日付・6か月）・給与推移（1M〜全期間） |
| HighlightCompatTests（1件） | ハイライトの文と棒 |
| MonthAnalysisCompatTests（1件） | 月間詳細分析：計画と実績・3か月・前月比・前年同月比・カテゴリ・TOP5・急増 |
| NotificationPlanTests（2件） | 予約する通知：休止時間・過ぎた時刻・二重予約なし・日締め7日分・支出の状況・金額の非表示・メールの承認待ち・壊れた設定値 |
| WidgetSnapshotTests（1件） | ウィジェット・Siri に渡す要約（7日分の目標と使った額・残り・今月・総資産・ACF・支払いの並び・書き出して読み戻し） |
| ReportCompatTests（1件） | PDF の家計レポートの数字（明細の並び・収入・手直し・目標・大型支出・ACF 月末予測・ページ数） |
| PerfTests | 計算の時間の目安 |

照合データは Web 版の実際の関数で作る。Node が無い Mac でも作れるように：

```sh
python3 ios/tools/fixture-server.py 8766   # Web 版に検査用の入口を差し込んで配信
# http://localhost:8766/ を開き、コンソールで ios/tools/ledger-fixtures.js を実行 → Fixtures/ledger-compat.json
# 同じく ios/tools/acf-fixtures.js → Fixtures/acf-compat.json
# 同じく ios/tools/pro-fixtures.js → Fixtures/pro-compat.json
# 同じく ios/tools/closing-goal-fixtures.js → Fixtures/closing-goal-compat.json
# 同じく quick-fixtures.js / statement-fixtures.js / mail-fixtures.js / report-fixtures.js
```

MutationCompatTests は照合データを作った時刻から時計を進める（実行した日に関係なく同じ結果になる）。

## まだの機能

[feature-map.md](feature-map.md) の機能はすべて移した（Web 版の旧い ATF 試算だけは ACF に置き換え）。

まだ確かめていないこと：実機での動作、本物の Google アカウントでの Gmail 接続（シミュレーターでは画面と「クライアントIDが無い時のお知らせ」まで確認）。

## ACF の速さ

ACF の計算（1日ごとに安全に使える最大額を二分探索する）は重いため、未来の最低残高を累積和の区間最小で、カードの利用額を利用日の累積で求めるようにした（結果は同じ）。Release ビルドで1回あたり約40ms。画面では裏で計算し、計算中は「ACFを計算しています…」を出す。

## ディープリンク

`mymoney://analysis`（理由が分かる分析）・`mymoney://timeline`・`mymoney://goals`（旅行・プレゼント）・`mymoney://review`（月締め）・`mymoney://day-close`（日締め）・`mymoney://goal-month`（月間目標）・`mymoney://goal-day`（当日目標）・`mymoney://acf`（ACF）・`mymoney://acf-index`（ACF指標）・`mymoney://acf-settings`・`mymoney://cashflow`・`mymoney://payments`・`mymoney://entry/expense`（新規入力）。ショートカットからも開ける。

## カレンダーからシフト

2026-11-19 に廃止し、iOS 版から完全に削除した（画面・自動取り込み・カレンダーの許可・保存していた iPhone 用の設定 `shiftSettings.iosCalendar`）。シフトは貼り付けでの取り込みを使う。

## Gmail 取り込みの準備（最初の1回だけ）

Web 版の Client ID（種類「ウェブ」）は iOS では使えないので、同じ Google Cloud プロジェクトに iOS 用を1つ作る。

1. Google Cloud Console › API とサービス › 認証情報 › 認証情報を作成 › OAuth クライアント ID › 種類「iOS」。バンドル ID は `com.example.mymoney.fujiiyuuki`。
2. Gmail API が有効になっていること、OAuth 同意画面のテストユーザーに自分のアドレスが入っていることを確かめる（Web 版と共通）。
3. アプリの その他 › メール取引センター › Gmail自動取得の設定 に、作った ID（`….apps.googleusercontent.com`）を貼って保存 →「Gmail に接続」。

ID は `gmailSettings.iosClientId` に保存する（Web 版の `clientId` は変えない）。権限は読み取り専用（gmail.readonly）。更新トークンはこの iPhone のキーチェーンにだけ置き、バックアップの JSON には入らない。「接続を切る」でトークンを取り消す。

## PDF・操作フィードバック

- その他 › データとバックアップ ›「PDFで書き出す」：月を選び、共有シートから「ファイルに保存」・メール・AirDrop。PDF は端末の中で作る。
- その他 › 操作フィードバック：操作音（音量）・触覚・アニメーション。Web 版と同じ設定を使うので、どちらで変えても同じになる。

## アプリ名とビルド

- ビルドしてできるアプリは `MyMoney.app`（ホーム画面の名前は「My Money」のまま）。名前に空白があると Siri・ショートカットがアプリの言い方（AppShortcutsProvider）を見つけられないため。
- iPhone には Release で入れる（起動が速い）：`xcodebuild -scheme TodayMoney -configuration Release -destination 'id=<端末>' -allowProvisioningUpdates build` → `xcrun devicectl device install app --device <端末> build/.../Release-iphoneos/MyMoney.app`
- ウィジェットとアプリは App Group（`group.<バンドルID>`）でデータの要約を共有する。無料の Apple アカウントでも使える。

## Siri・ショートカットの確認

- シミュレーターでは、署名が ad-hoc のためショートカットアプリからの実行が「アプリのショートカットを実行できません」になる（linkd がアプリを確認できない）。実機では開発用の署名なので動く想定。
- 中身の確認は Debug ビルドの起動引数 `-runIntents` で行った（支出の記録 → 今日の残り → 次の支払い → 元に戻す。すべて期待どおり）。

## 画面の確認用（Debug ビルドだけ）

起動引数 `-loadDocument <バックアップの .json>` で、そのデータに置き換えて起動する（前の状態は復元ポイントに残る）。半年分の残高・給与・支出があるデータで画面を確かめるのに使う。
