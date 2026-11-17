# iOS 版の状況

## テスト（Linux、Swift 6.0.3）

`cd ios/Packages/TodayMoneyCore && swift test` → **9 件すべて成功**（Web 版の実際の関数で作った照合データと比較）

| テスト | 内容 |
|---|---|
| testDates | 月・日の足し算、月の日数、金額（−¥1,234）、「2026年11月」「11月14日（土）」 |
| testPayroll | 勤務先ごとの給料日（GU 月末締め翌月10日・無印良品 10日締め当月25日）・勤務月 |
| testParse | シフトの読み取り 14 通り（2026/11/15・11月15日・年なし・全角・午前／午後・AM/PM・終日・重複・JSON・区切り） |
| testDuration | 勤務時間・休憩ルール・深夜 36 通り |
| testEstimate | 勤務先・勤務月ごとの給与・交通費（1日1回・上限）・給料日 |
| testSync | 自動取り込み 6 場面（作成・入れ替え・消えた月・同じ日2回・手入力7日間・入金済みは変えない） |
| testSalarySummary | 月の給与のまとめ（入金済み・未確認・これから・臨時収入・予定の入金日の月） |
| testSpending | 月の支出・口座の合計 |
| testRoundTripKeepsUnknownFields | Web 版のデータを読み書きしても、iOS が知らない項目を失わない |

## まだ確認していないこと

- **Mac でのビルド・シミュレーター・実機での確認はまだです。** この作業環境には Mac がなく、SwiftUI の画面のコードはコンパイルしていません。Mac をつないで（Claude デスクトップアプリの 設定 › Claude Code › Remote Control でフォルダを共有）ビルドし、出たエラーを直すのが次の作業です。
- 画面のスクリーンショット・UI テストもまだです。

## 未対応（Web 版で使う）

[feature-map.md](feature-map.md) の ⬜／🟡 の項目。主なもの：支払い・＋の入力・ACF・日締め・Gmail・通知・検索・給与の追加／削除・勤務先の追加。
