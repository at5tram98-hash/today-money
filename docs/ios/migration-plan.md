# iOS ネイティブ版 移行計画

## 1. 方針

- **WebView・Capacitor は使わない。** 画面はすべて SwiftUI。保存は SwiftData（My Time の iOS 版と同じ）。
- **Web 版を失わない。** Web 版のコードと公開（`main` → GitHub Pages）はそのまま。iOS 版は `ios/` に置き、Web 版の配信物には含めない。
- **データの正本は「Web 版と同じ JSON」。** iOS 版はデータ全体を Web 版のバックアップと同じ JSON のまま保存し、iOS が知らない項目も消さない。各記録は読み込んだ JSON（`raw`）を持ち、変わった項目だけを上書きして書き戻す。
- **ロジックは UI から分ける。** 計算（日付・給料日・シフト・休憩・交通費・自動取り込み・月の給与のまとめ・支出）は `TodayMoneyCore`（Swift Package）にまとめる。
- **Web 版と同じ結果になることをテストで確かめる。** `tests/ios-fixtures.mjs` が Web 版の実際の関数で照合データを作り、`swift test` で同じ結果か比べる。

## 2. 構成

| 層 | Web 版 | iOS 版 |
|---|---|---|
| 画面 | 1枚の HTML ＋ JS（src/js） | SwiftUI（ios/TodayMoney/Features） |
| 状態 | グローバルの `data` と `renderAll()` | `AppModel`（@Observable）。変更はすべて `commit` を通す |
| 保存 | IndexedDB／localStorage（JSON 1件） | SwiftData：`StoredDocument`（JSON 1件）＋`StoredSnapshot`（変更前の状態・20件） |
| 計算 | src/js の関数 | TodayMoneyCore（Dates / Payroll / Shifts / ShiftSync / Salary） |
| 共有 | バックアップ .json | 同じ .json を読み込み・書き出し |

## 3. 段階

| 段階 | 内容 | 状態 |
|---|---|---|
| 0 | Web 版の調査・機能の対応表 | 完了（[feature-map.md](feature-map.md)） |
| 1 | 共通ロジック TodayMoneyCore と Web 版との照合テスト | 完了（Linux で `swift test` 9件成功） |
| 2 | Xcode プロジェクト、SwiftData 保存、ホーム・給与・勤務先・シフトの取り込み・データのやり取り | コードを作成。**Mac でのビルド・シミュレーター確認は未実施** |
| 3 | 支払い（カード請求・固定支払い・大型支出）・＋の入力・支出の画面 | 未着手 |
| 4 | ACF（資金見通し・安全残高）の計算を TodayMoneyCore へ移し、照合テスト | 未着手 |
| 5 | iPhone のカレンダー（EventKit）からシフトを直接読む（受け渡しサーバー不要に）・ローカル通知 | 未着手 |
| 6 | 日締め・Gmail 取り込み・検索・分析・Face ID | 未着手（Gmail は Google ログインが必要なため、着手前に確認） |
| 7 | 配布方法の決定（Personal Team のままか、Apple Developer Program か） | ユーザーの判断待ち |

## 4. UI の考え方（Apple 純正アプリらしさ）

- 標準の `TabView`・`NavigationStack`・`List`・`Form`・シート・`Menu`・`confirmationDialog`・`fileImporter` を使い、独自の部品は最小にする。
- ホームはヘルスケアの概要のようなカード、給与は「株価」アプリのような月の一覧（Web 版の第14〜18版の考え方を引き継ぐ）。
- アイコンは SF Symbols。金額は丸みのある等幅の数字。ダークモード・Dynamic Type・VoiceOver に対応。
