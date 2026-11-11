# 第11版 進捗と再開用の記録

最終更新: 2026-11-11 04:15 UTC ／ ブランチ `claude/approve-all-permissions-3i1w3q` ／ HEAD `04f59be`

集計は `node scripts/v11/progress.mjs <仕様書パッケージのフォルダ>` で再生成できます。監査記録は同じ部品・同じ遷移の重複を含むため、件数は重複をまとめた後の数です。

## 進捗

| 対象 | 全件数 | 実装済み | 検証済み | 進捗率（検証済み） |
|---|---|---|---|---|
| ボタン・操作 | 304 | 304 | 302 | 99.3% |
| 画面（81シナリオ／75画面） | 81 | 81 | 81 | 100% |
| 追加UI（852候補→重複除去796） | 796 | 796 | 796 | 100% |
| 画面遷移（943記録→重複除去464） | 464 | 464 | 464 | 100% |
| アニメーション（645記録→重複除去389） | 389 | 389 | 389 | 100% |
| ジェスチャー（実際の対象） | 17 | 17 | 17 | 100% |

- 「実装済み」= 現行ソースに該当の画面・操作・動きがある。「検証済み」= 自動テストで実際に操作し、保存データ・戻り・44pt・読み上げ名・はみ出しを確認した。
- 物理的なiPhone（Safari）とVoiceOverでの確認は含まない。自動検証はChromiumによるiPhone 15 Pro相当（393×852）と幅320の再現。

## 検証の根拠

| 検証 | 内容 | 結果 |
|---|---|---|
| `tests/crawl.mjs` | 全タブと直接の入口94画面から操作を押して巡回（393-light 752状態、320-dark 752状態） | 44pt未満・読み上げ名なし・はみ出し・重なり・11px未満の文字・表示/取消での会計データ書き込み・二重保存・エラー：すべて0件 |
| `tests/scenarios.mjs` | 仕様書の81画面シナリオ | 81/81 合格（`scenarios-81.csv`） |
| `tests/amount-fields.mjs` | 金額欄→電卓→777入力→取消（46種×タップ/Enter×2条件） | 164/164 合格（`amount-fields.csv`） |
| `tests/p0-flows.mjs` | 巡回で届きにくいP0の流れ（メール反映・割り勘回収・給与振り分け・予算立て直し・月間計画リセット・目標の日別調整・一行入力・ACF反映・日締めの内訳・明細取込〜確定） | 10/10 合格（`p0-flows.csv`） |
| `tests/remaining-ops.mjs` | 巡回で届かなかった操作を、正しい入口と状態を用意して1件ずつ（入口がメニューへ移った操作は移った先で） | 24/25 合格（`remaining-ops.csv`） |
| `tests/v11-browser.mjs` | 第11版で変更した操作、ジェスチャー、月ホイール、グラフのなぞり | 320/393 × ライト/ダーク と Reduce Motion |
| `npm test` / `npm run test:browser` | 既存の単体・ブラウザテスト | — |

## 完了したID（302）

- HOME（12）: HOME-001 HOME-002 HOME-003 HOME-004 HOME-005 HOME-006 HOME-007 HOME-008 HOME-009 HOME-010 HOME-011 HOME-012
- GOAL（22）: GOAL-013 GOAL-014 GOAL-015 GOAL-016 GOAL-017 GOAL-018 GOAL-019 GOAL-020 GOAL-021 GOAL-022 GOAL-023 GOAL-024 GOAL-025 GOAL-026 GOAL-027 GOAL-028 GOAL-029 GOAL-030 GOAL-031 GOAL-032 GOAL-033 GOAL-034
- TX（6）: TX-035 TX-036 TX-037 TX-038 TX-039 TX-040
- MONTH（25）: MONTH-041 MONTH-042 MONTH-043 MONTH-044 MONTH-045 MONTH-046 MONTH-047 MONTH-048 MONTH-049 MONTH-050 MONTH-051 MONTH-052 MONTH-053 MONTH-054 MONTH-055 MONTH-056 MONTH-057 MONTH-058 MONTH-059 MONTH-060 MONTH-061 MONTH-062 MONTH-063 MONTH-064 MONTH-065
- LARGE（13）: LARGE-066 LARGE-067 LARGE-068 LARGE-069 LARGE-070 LARGE-071 LARGE-072 LARGE-073 LARGE-074 LARGE-075 LARGE-076 LARGE-077 LARGE-078
- PAY（9）: PAY-079 PAY-080 PAY-081 PAY-082 PAY-083 PAY-084 PAY-085 PAY-086 PAY-087
- PAYMENTS（13）: PAYMENTS-088 PAYMENTS-089 PAYMENTS-090 PAYMENTS-091 PAYMENTS-092 PAYMENTS-093 PAYMENTS-094 PAYMENTS-095 PAYMENTS-096 PAYMENTS-097 PAYMENTS-098 PAYMENTS-099 PAYMENTS-100
- ASSETS（4）: ASSETS-101 ASSETS-102 ASSETS-103 ASSETS-104
- SET（11）: SET-105 SET-106 SET-107 SET-108 SET-109 SET-110 SET-111 SET-112 SET-113 SET-114 SET-115
- CALC（9）: CALC-116 CALC-117 CALC-118 CALC-119 CALC-120 CALC-121 CALC-122 CALC-123 CALC-124
- PICKER（4）: PICKER-125 PICKER-126 PICKER-127 PICKER-128
- DAYCLOSE（18）: DAYCLOSE-129 DAYCLOSE-130 DAYCLOSE-131 DAYCLOSE-132 DAYCLOSE-133 DAYCLOSE-134 DAYCLOSE-135 DAYCLOSE-136 DAYCLOSE-137 DAYCLOSE-138 DAYCLOSE-139 DAYCLOSE-140 DAYCLOSE-141 DAYCLOSE-142 DAYCLOSE-143 DAYCLOSE-144 DAYCLOSE-145 DAYCLOSE-146
- BANK（26）: BANK-147 BANK-148 BANK-149 BANK-150 BANK-151 BANK-152 BANK-153 BANK-154 BANK-155 BANK-156 BANK-157 BANK-158 BANK-159 BANK-160 BANK-161 BANK-162 BANK-163 BANK-164 BANK-165 BANK-166 BANK-167 BANK-168 BANK-169 BANK-170 BANK-171 BANK-172
- SALARYEDIT（30）: SALARYEDIT-173 SALARYEDIT-174 SALARYEDIT-175 SALARYEDIT-176 SALARYEDIT-177 SALARYEDIT-178 SALARYEDIT-179 SALARYEDIT-180 SALARYEDIT-181 SALARYEDIT-182 SALARYEDIT-183 SALARYEDIT-184 SALARYEDIT-185 SALARYEDIT-186 SALARYEDIT-187 SALARYEDIT-188 SALARYEDIT-189 SALARYEDIT-190 SALARYEDIT-191 SALARYEDIT-192 SALARYEDIT-193 SALARYEDIT-194 SALARYEDIT-195 SALARYEDIT-196 SALARYEDIT-197 SALARYEDIT-198 SALARYEDIT-199 SALARYEDIT-200 SALARYEDIT-201 SALARYEDIT-202
- BACKUP（8）: BACKUP-203 BACKUP-204 BACKUP-205 BACKUP-206 BACKUP-207 BACKUP-208 BACKUP-209 BACKUP-210
- STATEMENT（21）: STATEMENT-211 STATEMENT-212 STATEMENT-213 STATEMENT-214 STATEMENT-215 STATEMENT-216 STATEMENT-217 STATEMENT-218 STATEMENT-219 STATEMENT-220 STATEMENT-221 STATEMENT-222 STATEMENT-223 STATEMENT-224 STATEMENT-225 STATEMENT-226 STATEMENT-227 STATEMENT-228 STATEMENT-229 STATEMENT-230 STATEMENT-231
- EVENT（16）: EVENT-232 EVENT-233 EVENT-234 EVENT-235 EVENT-236 EVENT-237 EVENT-238 EVENT-239 EVENT-240 EVENT-241 EVENT-242 EVENT-243 EVENT-244 EVENT-245 EVENT-246 EVENT-247
- ACF（22）: ACF-248 ACF-249 ACF-250 ACF-251 ACF-252 ACF-253 ACF-254 ACF-255 ACF-256 ACF-257 ACF-258 ACF-259 ACF-260 ACF-261 ACF-262 ACF-263 ACF-264 ACF-265 ACF-266 ACF-267 ACF-268 ACF-269
- SIM（4）: SIM-270 SIM-271 SIM-272 SIM-273
- PRO（19）: PRO-274 PRO-275 PRO-276 PRO-277 PRO-278 PRO-279 PRO-280 PRO-281 PRO-282 PRO-283 PRO-284 PRO-285 PRO-286 PRO-287 PRO-288 PRO-289 PRO-290 PRO-291 PRO-292
- GMAIL（4）: GMAIL-293 GMAIL-294 GMAIL-295 GMAIL-298
- REPEAT（3）: REPEAT-299 REPEAT-300 REPEAT-301
- INCOME（2）: INCOME-302 INCOME-303
- UPDATE（1）: UPDATE-304

## 未完了のID（2）— 実装はあり、自動での個別検証が未了

- GMAIL（2）: GMAIL-296 GMAIL-297

阻害要因:
- GMAIL: Googleアカウントへの接続が前提（外部認証のため自動検証できない）


## 未検証の遷移（0）とアニメーション（0）、未照合の追加UI（0）

- 遷移: `checklists/transitions-943.csv` の「検証済み=×」。上の未完了IDの操作を入口とするもの。
- アニメーション: `checklists/motions-645.csv`。push 220ms・sheet 260ms・menu 160ms・状態変化150〜220ms は `src/css/tokens.css` の値に統一済み。「×」は計測した画面の中に指示外の時間が残っているもの。
- 追加UI: `checklists/extra-ui-852.csv` の「未照合」。観測時のテスト用データ（テスト口座1 等）を含む行と、巡回が届いていない画面の要素。

## ジェスチャー

`checklists/gestures.csv` を参照。実装対象17種はすべて実装・検証済み。仕様で「任意」「補助可能」とされた一覧行の長押しメニュー・三点ボタン行の長押し・−／＋の長押し連続変更は採用していない（仕様H章2: 全操作へ無差別にジェスチャーを足さない）。

## 最近のコミット

- 04f59be 2026-11-11 公開サイトでの確認結果（最新の配信）を記録
- 8f7b535 2026-11-11 今日の「支出を記録」を仕様どおり高さ52pxに（HOME-004）
- 46c341c 2026-11-11 巡回結果を反映して進捗を更新
- c7e19bf 2026-11-11 追加UIの照合を観測画面まで広げ、進捗を更新
- 18739a0 2026-11-11 今日画面・ナビゲーションのアイコン・その他メニューを第11版の仕様どおりに修正
- 040b60d 2026-11-10 Record the live-site check of the edition 11 completion build
- e67b491 2026-11-10 Record the final verification results and resume notes for edition 11
- 1388ac4 2026-11-10 Finish edition 11 interactions and verify every screen, transition, motion and gesture
- 42da12c 2026-11-10 Record the live-site check of the published build
- 53520e7 2026-11-10 Merge main (wallet icon update) and keep the icon links in the page template
- 49949d2 2026-11-10 Rebuild stylesheets by component, verify every screen by crawling, and finish edition 11 alternatives
- bdbaa2f 2026-11-10 Apply edition 11 confirmed interactions for billing, balance, approval, calculator, restore and deletion

## 次に着手する作業

1. 未完了ID（GMAIL-296 GMAIL-297）を確認する。Googleアカウントを接続した端末で、手動で「今すぐ同期」と「接続を解除」を確かめる（自動検証では外部認証を通せない）。
2. 追加UIの未照合0件（巡回で同じ要素を確認できない0件、観測時のテスト用データの行0件）を画面ごとに照合し、304操作の別名か新しいIDかを決める。
3. 物理的なiPhone（Safari・ホーム画面に追加したPWA）で、VoiceOver・文字拡大・Reduce Motionを人の手で確認する。
4. 仕様で任意とされたジェスチャー（一覧行の長押しメニュー等）を採用するかを決める。採用する場合も、見えるボタンの代替を必ず残す。
