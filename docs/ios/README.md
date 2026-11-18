# My Money iOS（SwiftUI ネイティブ版）

Web 版（GitHub Pages の PWA）と同じデータ・同じ計算で動く、SwiftUI で書いた iPhone アプリです。WebView やラッパーは使っていません（My Time の iOS 版と同じ作り方）。
Web 版はこれまでどおり使えます。iOS 版は `ios/` フォルダにあり、Web 版の公開には影響しません。

| 文書 | 内容 |
|---|---|
| [migration-plan.md](migration-plan.md) | 移行計画（構成・データ互換・段階） |
| [feature-map.md](feature-map.md) | Web 版 ↔ iOS 版の機能対応表 |
| [status.md](status.md) | ビルド・テスト結果、未対応・課題の一覧 |

## フォルダ構成

```
ios/
  TodayMoney.xcodeproj          Xcode プロジェクト（ターゲット TodayMoney、スキーム TodayMoney、アプリ名 My Money）
  Config/Base.xcconfig          署名・Bundle ID の共通設定（個人の値は Local.xcconfig）
  TodayMoney/
    App/TodayMoneyApp.swift     起動・SwiftData の保存先
    Data/                       SwiftData ストア（Web 版と同じ JSON をそのまま保存）・復元ポイント・画面共通の状態
    Design/                     色・金額の表示・カードなどの部品
    Features/                   ホーム・給与・勤務先・シフトの取り込み・その他
    Resources/first-run.json    初めて起動した時のデータ（Web 版の初期値と同じ）
  Packages/TodayMoneyCore/      UI を持たない共通ロジック（Swift Package。Linux でもテスト可能）
```

## iPhone に入れる手順（無料の Apple Account / Personal Team）

必要なもの：Mac、Xcode 16 以降、iOS 17 以降の iPhone、USB ケーブル。

1. Xcode を開き、**Settings › Accounts** で自分の Apple Account を追加する（無料で可）。My Time と同じ Personal Team が使えます。
2. `ios/Config/Local.xcconfig` を作り、次の2行を書く（このファイルは Git に入らない）。
   ```
   DEVELOPMENT_TEAM = あなたのTeam ID（10文字）
   MYMONEY_BUNDLE_ID = com.あなたの名前.mymoney
   ```
   （プロジェクトには My Time と同じ Team ID を入れてあります。Local.xcconfig を作らず、Signing & Capabilities で Team を選んでもよい。）
3. `ios/TodayMoney.xcodeproj` を開く。スキーム **TodayMoney** を選び、まずシミュレーター（iPhone 16 など）で ⌘R。
4. iPhone を USB でつなぎ、iPhone の **設定 › プライバシーとセキュリティ › デベロッパモード** をオンにする（再起動あり）。
5. 実行先を自分の iPhone にして ⌘R。初回は iPhone の **設定 › 一般 › VPN とデバイス管理** で自分の開発者 App を「信頼」する。
6. 無料の Personal Team ではプロビジョニングの期限が **7日** です。期限が切れたら Xcode からもう一度 ⌘R で入れ直す（データは残る）。

## Web 版とのデータのやり取り

- Web 版：**その他 › データ管理 › バックアップ** で `.json` を書き出し、AirDrop・ファイル App などで iPhone へ。
- iOS 版：**その他 › Web 版のバックアップを読み込む** で選ぶ。読み込む前の状態は「復元ポイント」に残る。
- 逆向き（iOS → Web）：iOS 版の **バックアップを書き出す** で作った `.json` を、Web 版のバックアップの復元で読み込む。
- データは Web 版と同じ1つの JSON です。iOS 版がまだ扱わない項目（Gmail・ACF・カードなど）も消さずにそのまま保ちます。

## テスト

```bash
# 照合データを Web 版の関数で作り直す（リポジトリのルートで。Web 版の計算を変えた時）
MM3_CHROMIUM_PATH=/opt/pw-browsers/chromium node tests/ios-fixtures.mjs

# 共通ロジック（Mac でも Linux でも）
cd ios/Packages/TodayMoneyCore && swift test
```
