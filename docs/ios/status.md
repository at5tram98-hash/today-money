# iOS 版の状況（2026-11-17）

## ビルドと確認

- Mac（Xcode 27.2）でビルド成功。iPhone 17 Pro シミュレーター（iOS 26.5）で起動し、ホーム・支払い・その他・口座とカード・＋の新規入力（支出の保存）を確認。
- 初期データでの数値が Web 版と一致：総資産 ¥99,330、今月の給与 ¥83,110、次の給料日 11/25 無印良品 ¥34,300、今月の支払予定 ¥81,667、30日間の最低残高 ¥88,330。
- 実機（iPhone）ではまだ確認していない。Debug ビルドのシミュレーターでは起動に2〜3秒かかる。

## テスト（`cd ios/Packages/TodayMoneyCore && swift test`）→ 18件すべて成功

| テスト | 内容 |
|---|---|
| WebCompatTests（9件） | 日付・給料日・シフトの読み取り・勤務時間・給与の見込み・自動取り込み・給与のまとめ・支出・未知の項目を保つ |
| LedgerCompatTests（5件） | カードの締め・引落日・請求月、確定後の利用、支払月ごとの請求、予定（固定支払い・大型支出）を含むカードの請求、支払いのまとめ、次の引落、固定支払いの日、予定の入出金 |
| MutationCompatTests（2件） | 残高の入力→口座払い（今日・昨日・明日）→デビット→カードの支払済み（残高から引く・金額修正・未払いに戻す）→削除の各段階の残高と反映状態、臨時収入 |
| AcfCompatTests（1件・9通り） | ACF：初期データ／カードのあるデータ／カード利用OFF／比率50%・1日上限／曜日傾向なし・優先カード／カテゴリ限定／目標あり／最低残高が高い／C100。今日使える目安・最大額・月末予測・最低残高・状態・注意点・信頼度・日別の全行（現金余力・計画支出・カードの配分）・ACF指標 |
| PerfTests | 計算の時間の目安 |

照合データは Web 版の実際の関数で作る。Node が無い Mac でも作れるように：

```sh
python3 ios/tools/fixture-server.py 8766   # Web 版に検査用の入口を差し込んで配信
# http://localhost:8766/ を開き、コンソールで ios/tools/ledger-fixtures.js を実行 → Fixtures/ledger-compat.json
# 同じく ios/tools/acf-fixtures.js → Fixtures/acf-compat.json
```

## まだの機能

[feature-map.md](feature-map.md) の ⬜／🟡。主なもの：日締め、目標の計画づくり、iPhone のカレンダーからのシフト取り込み、Gmail 取り込み、Pro 分析・タグ・お気に入り・旅行の計画、PDF。

## ACF の速さ

ACF の計算（1日ごとに安全に使える最大額を二分探索する）は重いため、未来の最低残高を累積和の区間最小で、カードの利用額を利用日の累積で求めるようにした（結果は同じ）。Release ビルドで1回あたり約40ms。画面では裏で計算し、計算中は「ACFを計算しています…」を出す。

## ディープリンク

`mymoney://acf`（ACF）・`mymoney://acf-index`（ACF指標）・`mymoney://acf-settings`・`mymoney://cashflow`・`mymoney://payments`・`mymoney://entry/expense`（新規入力）。ショートカットからも開ける。
