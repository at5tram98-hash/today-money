/* ======================================================================
   UI-20260917 · Presentation/accessibility lifecycle
   No data migration, storage keys, amount formulas or import rules change.
   ====================================================================== */
(() => {
  const $=id=>document.getElementById(id);
  
  // Exact 304 §⑦-E control entries; role tags do not certify user actions.
  const phase8Contracts=new Map([["todaySearch",["HOME-001","P1","navigation","検索アイコン"]],["todayNotice",["HOME-002","P1","navigation","通知アイコン"]],["todayMenu",["HOME-003","P1","navigation","その他メニュー"]],["quickExpense",["HOME-004","P0","primary","クイック支出入力"]],["quickBank",["HOME-005","P1","secondary","クイック銀行口座入力"]],["quickIncome",["HOME-006","P1","secondary","クイック臨時収入入力"]],["todayRepeat",["HOME-007","P1","secondary","最近の支出を再利用"]],["todayOneLine",["HOME-008","P1","secondary","一行入力"]],["todayCrossSearch",["HOME-009","P1","navigation","横断検索"]],["todayAnalysis",["HOME-010","P1","navigation","詳細分析"]],["todayTransactions",["HOME-011","P1","navigation","実績済支払い取引一覧"]],["todayMail",["HOME-012","P1","secondary","メール取引"]],["goalStart",["GOAL-013","P1","primary","目標設定開始"]],["goalCancel",["GOAL-014","P1","secondary","今はしない"]],["goalNext",["GOAL-015","P1","navigation","次へ・安全確認へ"]],["goalBack",["GOAL-016","P1","navigation","戻る"]],["goalAmountEdit",["GOAL-017","P1","secondary","計画金額"]],["goalResetAmount",["GOAL-018","P1","secondary","おすすめ額に戻す"]],["goalResetCategories",["GOAL-019","P1","secondary","おすすめ配分に戻す"]],["goalAutoBalance",["GOAL-020","P1","secondary","自動調整"]],["goalSafeAuto",["GOAL-021","P1","secondary","ACFに合わせて最適化"]],["safeCancel",["GOAL-022","P1","navigation","閉じる（安全予算）"]],["safeApply",["GOAL-023","P1","secondary","この配分を使う"]],["gdpCancel",["GOAL-024","P1","navigation","閉じる（日別計画）"]],["gdpApply",["GOAL-025","P1","primary","適用（日別計画）"]],["gdpMinus",["GOAL-026","P1","secondary","−"]],["gdpPlus",["GOAL-027","P1","secondary","＋"]],["gdpCalc",["GOAL-028","P1","secondary","電卓で入力"]],["gdpMode",["GOAL-029","P1","secondary","月間総額を維持・増減"]],["gdpLock",["GOAL-030","P1","secondary","日別金額の固定"]],["goalSeeCalendar",["GOAL-031","P1","secondary","月カレンダーで日別計画を見る"]],["goalDone",["GOAL-032","P1","primary","完了"]],["goalErrorBack",["GOAL-033","P1","navigation","確認画面へ戻る"]],["goalApproval",["GOAL-034","P0","primary","最終承認スライド"]],["txSearch",["TX-035","P0","navigation","取引検索"]],["txCatFilter",["TX-036","P0","secondary","カテゴリ絞り込み"]],["teCancel",["TX-037","P0","navigation","キャンセル（取引編集）"]],["teSave",["TX-038","P0","navigation","保存（取引編集）"]],["txEdit",["TX-039","P0","navigation","取引を編集"]],["txDelete",["TX-040","P0","danger","この取引を削除"]],["monthName",["MONTH-041","P0","navigation","表示月"]],["monthSearch",["MONTH-042","P1","navigation","検索アイコン"]],["monthMenu",["MONTH-043","P1","navigation","その他メニュー"]],["monthHero",["MONTH-044","P1","secondary","今月使った金額"]],["monthPlanEdit",["MONTH-045","P1","navigation","月間計画を編集"]],["monthAnalysis",["MONTH-046","P1","navigation","詳細分析"]],["monthReasonAnalysis",["MONTH-047","P1","secondary","理由が分かる分析"]],["monthCloseReview",["MONTH-048","P1","secondary","月締めレビュー"]],["monthTransactions",["MONTH-049","P1","navigation","今月の取引一覧"]],["monthMail",["MONTH-050","P1","secondary","メール取引"]],["monthTrend",["MONTH-051","P1","secondary","月次比較・トレンド分析"]],["dayGoalDetail",["MONTH-052","P1","secondary","当日の目標"]],["inspectExpense",["MONTH-053","P1","primary","支出を追加"]],["inspectPlan",["MONTH-054","P1","secondary","計画を変更"]],["inspectWhatIf",["MONTH-055","P1","secondary","もし使ったら？"]],["inspectLarge",["MONTH-056","P1","primary","大型支出を追加"]],["dpClose",["MONTH-057","P1","navigation","閉じる"]],["dpChange",["MONTH-058","P1","secondary","金額を変更"]],["dpReset",["MONTH-059","P1","secondary","月間おすすめに戻す"]],["dpFix",["MONTH-060","P1","secondary","当日目標として固定"]],["dqmClose",["MONTH-061","P1","navigation","閉じる"]],["dqmExpense",["MONTH-062","P1","primary","支出を追加"]],["dqmIncome",["MONTH-063","P1","primary","臨時収入を追加"]],["dqmPlan",["MONTH-064","P1","secondary","日別計画を調整"]],["mpClose",["MONTH-065","P1","navigation","閉じる"]],["msClose",["LARGE-066","P0","navigation","閉じる（計画一覧）"]],["msGoal",["LARGE-067","P0","secondary","月間目標"]],["msResetPlan",["LARGE-068","P0","secondary","月間計画をリセット"]],["largePlanAdd",["LARGE-069","P0","primary","計画を追加"]],["leCancel",["LARGE-070","P0","navigation","キャンセル"]],["leSave",["LARGE-071","P0","primary","保存"]],["leSplitToggle",["LARGE-072","P0","secondary","分割先"]],["leSplitAdd",["LARGE-073","P0","primary","分割先を追加"]],["leEditDetail",["LARGE-074","P0","navigation","編集"]],["leComplete",["LARGE-075","P0","primary","実際の支出として登録して完了"]],["leDelete",["LARGE-076","P0","danger","削除"]],["goalLargeAdd",["LARGE-077","P0","primary","大型支出を追加（計画）"]],["goalBackToCalendar",["LARGE-078","P0","secondary","日別計画を調整"]],["salaryAddNav",["PAY-079","P1","primary","追加アイコン"]],["salaryMenu",["PAY-080","P1","navigation","その他メニュー"]],["mm3SalaryMonth",["PAY-081","P1","navigation","表示月"]],["mm3SalaryVizMenu",["PAY-082","P1","selection","分析グラフの表示切替"]],["mm3SalaryEmployerManage",["PAY-083","P1","secondary","分析"]],["salaryAddClose",["PAY-084","P1","navigation","閉じる"]],["salaryAddRecord",["PAY-085","P1","primary","給与記録を追加"]],["salaryAddTemp",["PAY-086","P1","primary","臨時収入を追加"]],["salaryAddEmployer",["PAY-087","P1","primary","勤務先を追加"]],["paymentsMenu",["PAYMENTS-088","P0","navigation","その他メニュー"]],["mm3PaymentMonth",["PAYMENTS-089","P0","navigation","表示月"]],["mm3AtfOpen",["PAYMENTS-090","P0","navigation","ATFを開く"]],["mm3PaymentHistoryTop",["PAYMENTS-091","P0","navigation","予定一覧"]],["mm3PaymentQuickBilling",["PAYMENTS-092","P0","primary","請求額を更新"]],["mm3AtfNextEvent",["PAYMENTS-093","P0","secondary","次の重要な資金イベントを見る"]],["atfApply",["PAYMENTS-094","P0","secondary","この条件で再計算"]],["mm3AtfClose",["PAYMENTS-095","P0","navigation","閉じる"]],["paymentsAddClose",["PAYMENTS-096","P0","navigation","閉じる"]],["paymentAddCard",["PAYMENTS-097","P0","primary","クレジットカードを追加"]],["paymentAddDebit",["PAYMENTS-098","P0","primary","デビットカードを追加"]],["paymentAddFixed",["PAYMENTS-099","P0","primary","固定支払いを追加"]],["paymentAddLarge",["PAYMENTS-100","P0","primary","大型支出を追加"]],["assetMenuSimple",["ASSETS-101","P1","navigation","その他メニュー"]],["mm3AssetMode",["ASSETS-102","P1","navigation","グラフ表示モード"]],["mm3AssetSort",["ASSETS-103","P1","secondary","並び替え"]],["mm3AssetHistoryTop",["ASSETS-104","P1","navigation","残高履歴"]],["profileSettings",["SET-105","P1","secondary","名前とプロフィール写真"]],["prCancel",["SET-106","P1","navigation","キャンセル"]],["prSave",["SET-107","P1","primary","保存"]],["prChooseImage",["SET-108","P1","secondary","写真を変更"]],["prClear",["SET-109","P0","danger","写真を削除"]],["catAdd",["SET-110","P1","primary","新しいカテゴリを追加"]],["fbVolume",["SET-111","P1","secondary","音量"]],["notiLevel",["SET-112","P1","navigation","通知レベル"]],["passSwitch",["SET-113","P1","secondary","パスコードの有効化"]],["changePass",["SET-114","P1","secondary","パスコードを変更"]],["psCancel",["SET-115","P1","navigation","キャンセル"]],["calcCancel",["CALC-116","P1","navigation","キャンセル"]],["calcDone",["CALC-117","P1","secondary","この金額を使う"]],["calcTools",["CALC-118","P1","navigation","補助計算表示"]],["calcToolCancel",["CALC-119","P1","navigation","戻る"]],["calcToolApply",["CALC-120","P1","secondary","計算結果を使う"]],["monthPickerCancel",["PICKER-125","P1","navigation","キャンセル"]],["monthPickerToday",["PICKER-126","P1","secondary","今月"]],["monthPickerApply",["PICKER-128","P1","navigation","この月を表示"]],["dayCloseJournal",["DAYCLOSE-129","P0","secondary","日締めジャーナル"]],["dayCloseDone",["DAYCLOSE-130","P0","primary","完了"]],["dayCloseCancel",["DAYCLOSE-131","P0","primary","日締めの承認を取り消す"]],["dayCloseModify",["DAYCLOSE-132","P0","secondary","日締め内容の修正"]],["dayCloseAddIncome",["DAYCLOSE-133","P0","primary","収入を追加"]],["dayReviewAdd",["DAYCLOSE-134","P0","primary","支出を追加"]],["dayReviewCorrection",["DAYCLOSE-135","P0","secondary","実質金額を確認"]],["dayReviewMail",["DAYCLOSE-136","P0","secondary","メール取引センター"]],["dayCloseAddBank",["DAYCLOSE-137","P0","primary","銀行口座を追加"]],["dayCloseMissing",["DAYCLOSE-138","P0","navigation","未確認の項目に戻る"]],["dayCloseBack",["DAYCLOSE-139","P0","navigation","戻る"]],["dayCloseNext",["DAYCLOSE-140","P0","navigation","次へ"]],["dayReviewConfirmed",["DAYCLOSE-141","P0","secondary","照合確認チェック"]],["dayReviewClose",["DAYCLOSE-142","P0","primary","日締めを承認"]],["dayCancelJournal",["DAYCLOSE-143","P0","secondary","日締めジャーナル"]],["dayCancelBack",["DAYCLOSE-144","P0","navigation","戻る"]],["dayCancelNext",["DAYCLOSE-145","P0","navigation","次へ"]],["journalReview",["DAYCLOSE-146","P0","secondary","この日を確認し直す"]],["qbCancel",["BANK-147","P0","navigation","キャンセル（口座残高）"]],["qbSave",["BANK-148","P0","primary","保存（口座残高）"]],["tiCancel",["BANK-149","P0","navigation","キャンセル（臨時収入）"]],["tiSave",["BANK-150","P0","primary","保存（臨時収入）"]],["abCancel",["BANK-151","P0","navigation","キャンセル（銀行口座）"]],["abSave",["BANK-152","P0","primary","保存（銀行口座）"]],["abDelete",["BANK-153","P0","danger","この口座を削除"]],["acCancel",["BANK-154","P0","navigation","キャンセル（カード）"]],["acSave",["BANK-155","P0","primary","保存（カード）"]],["acDelete",["BANK-156","P0","danger","このカードを削除"]],["adCancel",["BANK-157","P0","navigation","キャンセル（デビット）"]],["adSave",["BANK-158","P0","primary","保存（デビット）"]],["adDelete",["BANK-159","P0","danger","このデビットカードを削除"]],["ecCancel",["BANK-160","P0","navigation","キャンセル（勤務先新規）"]],["ecSave",["BANK-161","P0","primary","保存（勤務先新規）"]],["ecCloseRow",["BANK-162","P0","secondary","締め日"]],["ecPayRow",["BANK-163","P0","secondary","給料日"]],["saCancel",["BANK-164","P0","primary","キャンセル（給与追加）"]],["saSave",["BANK-165","P0","primary","保存（給与追加）"]],["saNewEmployer",["BANK-166","P0","primary","新しい勤務先を追加"]],["fpCancel",["BANK-167","P0","navigation","キャンセル（固定支払）"]],["fpSave",["BANK-168","P0","primary","保存（固定支払）"]],["fpDelete",["BANK-169","P0","danger","この固定支払いを削除"]],["dcClose",["BANK-170","P0","navigation","閉じる（日別補正）"]],["dcEdit",["BANK-171","P0","secondary","実質金額を修正"]],["dcReset",["BANK-172","P0","secondary","自動集計に戻す"]],["eeCancel",["SALARYEDIT-173","P0","navigation","キャンセル（雇用主）"]],["eeSave",["SALARYEDIT-174","P0","primary","保存（雇用主）"]],["eeCloseRow",["SALARYEDIT-175","P0","secondary","締め日"]],["eePayRow",["SALARYEDIT-176","P0","secondary","給料日"]],["srCancel",["SALARYEDIT-177","P0","primary","キャンセル（給与記録）"]],["srSave",["SALARYEDIT-178","P0","primary","保存（給与記録）"]],["srDelete",["SALARYEDIT-179","P0","danger","この給与記録を削除"]],["tempConfirm",["SALARYEDIT-180","P0","primary","臨時収入の入金を確定"]],["tempDelete",["SALARYEDIT-181","P0","danger","削除（臨時収入）"]],["tempEditNav",["SALARYEDIT-182","P0","navigation","編集（臨時収入）"]],["prepTransfer",["SALARYEDIT-183","P0","secondary","振替計画を作成"]],["prepTimeline",["SALARYEDIT-184","P0","secondary","この口座の60日推移"]],["proBankUpdate",["SALARYEDIT-185","P0","primary","残高を更新"]],["proBankPrep",["SALARYEDIT-186","P0","secondary","引落準備"]],["proBankHistory",["SALARYEDIT-187","P0","navigation","履歴"]],["bankEditNav",["SALARYEDIT-188","P0","navigation","編集（銀行口座）"]],["qcbCancel",["SALARYEDIT-189","P0","navigation","キャンセル（請求）"]],["qcbSave",["SALARYEDIT-190","P0","primary","保存（請求）"]],["cardPrevPay",["SALARYEDIT-191","P0","secondary","前の支払月"]],["cardNextPay",["SALARYEDIT-192","P0","secondary","次の支払月"]],["cardBillingMonth",["SALARYEDIT-193","P0","secondary","支払月を選ぶ"]],["cardBillingFix",["SALARYEDIT-194","P0","primary","選択請求を更新"]],["cardPaidToggle",["SALARYEDIT-195","P0","selection","入金・支払状態を切替"]],["cardReconcile",["SALARYEDIT-196","P0","selection","選択請求を照合"]],["cbmClose",["SALARYEDIT-197","P0","navigation","閉じる（請求月）"]],["cpClose",["SALARYEDIT-198","P0","navigation","キャンセル（残高反映）"]],["cpApply",["SALARYEDIT-199","P0","secondary","口座残高にも反映する"]],["cpReconciled",["SALARYEDIT-200","P0","secondary","現在残高に反映済み"]],["cardEditNav",["SALARYEDIT-201","P0","navigation","編集（カード）"]],["debitEditNav",["SALARYEDIT-202","P0","navigation","編集（デビット）"]],["ceCancel",["BACKUP-203","P0","navigation","キャンセル（カテゴリ）"]],["ceSave",["BACKUP-204","P0","primary","保存（カテゴリ）"]],["ceDelete",["BACKUP-205","P0","danger","カテゴリを削除"]],["pdfExport",["BACKUP-206","P0","secondary","PDFで書き出す"]],["backupExport",["BACKUP-207","P0","secondary","バックアップ作成"]],["backupImport",["BACKUP-208","P0","secondary","バックアップを復元"]],["recoveryExport",["BACKUP-209","P0","secondary","復旧用データを書き出す"]],["deleteAll",["BACKUP-210","P0","danger","全データ削除"]],["stmtImportNew",["STATEMENT-211","P0","primary","明細を取り込む"]],["stmtClose",["STATEMENT-212","P0","navigation","閉じる（明細）"]],["stmtOpenExisting",["STATEMENT-213","P0","secondary","取り込み済みの明細を見る"]],["stmtStartReview",["STATEMENT-214","P0","secondary","分類を確認する"]],["stmtConfirmedRows",["STATEMENT-215","P0","secondary","明細を見る"]],["stmtUnlock",["STATEMENT-216","P0","navigation","確定を解除して編集"]],["stmtReviewSave",["STATEMENT-217","P0","primary","保存可能件を取引へ保存"]],["stmtReviewFinal",["STATEMENT-218","P0","secondary","請求金額を最終確認"]],["stmtRowClose",["STATEMENT-219","P0","navigation","閉じる（明細行）"]],["stmtRowSave",["STATEMENT-220","P0","primary","保存（明細行）"]],["stmtRowExclude",["STATEMENT-221","P0","selection","除外切替"]],["stmtFinalize",["STATEMENT-222","P0","primary","請求金額を最終確定"]],["stmtBackReview",["STATEMENT-223","P0","navigation","明細へ戻る"]],["mailSyncOverview",["STATEMENT-224","P0","secondary","メール同期状況"]],["mailHistoryOverview",["STATEMENT-225","P0","secondary","すべてのメール取引を見る"]],["mailPreviewLater",["STATEMENT-226","P0","secondary","あとで"]],["mailPreviewReview",["STATEMENT-227","P0","navigation","センターを開く"]],["mailEditLink",["STATEMENT-228","P0","secondary","既存取引に紐づける"]],["mailEditApply",["STATEMENT-229","P0","secondary","取引に反映"]],["mailEditIgnore",["STATEMENT-230","P0","secondary","このメールを対象外にする"]],["mm3MailHistoryTx",["STATEMENT-231","P0","secondary","反映済みの家計取引を見る"]],["eventGoalAdd",["EVENT-232","P1","primary","旅行・プレゼント目標を追加"]],["goalItemCancel",["EVENT-233","P1","navigation","キャンセル（費目）"]],["goalItemSave",["EVENT-234","P1","primary","保存（費目）"]],["eventGoalCancel",["EVENT-235","P1","navigation","キャンセル（目標）"]],["eventGoalSave",["EVENT-236","P1","primary","保存（目標）"]],["eventGoalAddItem",["EVENT-237","P0","primary","費目を追加"]],["reimbCancel",["EVENT-238","P1","navigation","キャンセル（回収）"]],["reimbSave",["EVENT-239","P1","primary","保存（回収）"]],["eventGoalEdit",["EVENT-240","P1","navigation","編集"]],["eventGoalReimburse",["EVENT-241","P1","secondary","割り勘の受取を確認"]],["eventGoalDelete",["EVENT-242","P0","danger","目標を削除"]],["monthReviewConfirm",["EVENT-243","P1","primary","確認完了"]],["pro4Parse",["EVENT-244","P1","secondary","内容を読み取る"]],["pro4SaveAll",["EVENT-245","P1","primary","確認した件を保存"]],["pro4NormalForm",["EVENT-246","P1","secondary","通常の入力画面で確認する"]],["pro4SaveSearch",["EVENT-247","P1","primary","検索条件を保存"]],["acfSetupCancel",["ACF-248","P0","navigation","閉じる"]],["acfSetupUseCard",["ACF-249","P0","secondary","カード利用を有効化"]],["acfSetupStart",["ACF-250","P0","primary","設定して開始"]],["acfProtected",["ACF-255","P0","secondary","確保しておく金額"]],["acfSimulator",["ACF-256","P0","secondary","購入前シミュレーション"]],["acfApplyGoal",["ACF-257","P0","secondary","ACFの安全予算を日別計画へ反映"]],["acfOpenSettings",["ACF-258","P0","secondary","ACF設定"]],["acfReserve",["ACF-259","P0","secondary","最低確保額"]],["acfFallback",["ACF-260","P0","secondary","カード併用"]],["acfDetailsToggle",["ACF-261","P0","navigation","詳細設定"]],["acfDailyLimit",["ACF-262","P0","secondary","カード1日上限"]],["acfCreditPlaces",["ACF-263","P0","secondary","カードを使っていい場所"]],["acfWeights",["ACF-264","P0","secondary","重み付け"]],["acfRequired",["ACF-265","P0","secondary","必須利用"]],["acfRiskNoti",["ACF-266","P0","navigation","リスク通知"]],["acfSettingsSave",["ACF-267","P0","primary","保存"]],["acfToday",["ACF-268","P0","secondary","ACF（今日）"]],["acfMonth",["ACF-269","P0","secondary","ACF（今月）"]],["monthIncomeOpen",["SIM-270","P1","navigation","給与・臨時収入の詳細を見る"]],["simCancel",["SIM-271","P1","navigation","閉じる"]],["simRun",["SIM-272","P1","secondary","再計算"]],["creditAllCategories",["SIM-273","P1","secondary","全カテゴリ"]],["tagAdd",["PRO-274","P1","secondary","新しいタグ"]],["tagCancel",["PRO-275","P1","navigation","キャンセル"]],["tagSave",["PRO-276","P1","primary","保存"]],["tagDelete",["PRO-277","P0","danger","このタグを削除"]],["tagAssign",["PRO-278","P1","navigation","項目を追加・編集"]],["tagRename",["PRO-279","P1","navigation","タグ名・色を編集"]],["taClose",["PRO-280","P1","primary","完了"]],["timelineTransfer",["PRO-281","P1","secondary","この口座の引落準備・振替計画"]],["allocPickClose",["PRO-282","P1","navigation","閉じる"]],["allocCancel",["PRO-283","P1","navigation","キャンセル"]],["allocSave",["PRO-284","P1","primary","保存"]],["allocLivingRest",["PRO-285","P1","secondary","残りを生活費へ入れる"]],["allocRelease",["PRO-286","P0","secondary","この振り分けを解除"]],["transferCancel",["PRO-287","P1","navigation","キャンセル"]],["transferSave",["PRO-288","P1","primary","保存"]],["transferAdd",["PRO-289","P1","secondary","新しい振替計画"]],["reconAmount",["PRO-290","P1","primary","請求額を更新"]],["reconSave",["PRO-291","P1","primary","照合状態を保存"]],["rebalanceApply",["PRO-292","P1","primary","この内容を適用"]],["gsCancel",["GMAIL-293","P0","navigation","閉じる"]],["gsSave",["GMAIL-294","P0","primary","保存"]],["gsAuto",["GMAIL-295","P0","secondary","自動同期"]],["gsSync",["GMAIL-296","P0","secondary","今すぐ同期"]],["gsDisconnect",["GMAIL-297","P0","secondary","Gmail接続を解除"]],["gsConnect",["GMAIL-298","P0","secondary","Googleアカウントに接続"]],["qrClose",["REPEAT-299","P1","navigation","閉じる"]],["qeCancel",["REPEAT-300","P1","navigation","キャンセル"]],["qeSave",["REPEAT-301","P1","primary","保存"]],["ieCancel",["INCOME-302","P0","navigation","キャンセル"]],["ieSave",["INCOME-303","P0","primary","保存"]],["financialUpdateMonth",["UPDATE-304","P1","navigation","表示月"]]]);
  const phase8DynamicContracts=[["[data-calc-tool=discount]","CALC-121","P1","selection","割引"],["[data-calc-tool=add]","CALC-122","P1","selection","割合を加算"],["[data-calc-tool=split]","CALC-123","P1","selection","割り勘"],["[data-k]","CALC-124","P1","selection","数字・演算キー"],["month-${key}-${v}","PICKER-127","P1","selection","月ホイールの選択肢"],["[data-view=table]","ACF-251","P0","selection","表"],["[data-view=calendar]","ACF-252","P0","selection","カレンダー"],["[data-v=all]","ACF-253","P0","selection","すべての日"],["[data-v=important]","ACF-254","P0","selection","重要日のみ"]];
  function enhancePhase8Controls(root){
    if(!root?.querySelectorAll)return;
    const nodes=[...(root.matches?.('[id]')?[root]:[]),...root.querySelectorAll('[id]')];
    const tag=(el,spec)=>{
      const [auditId,priority,role,label]=spec;
      el.dataset.uiInventory=auditId;el.dataset.uiPriority=priority;el.dataset.uiRole=role;
      if(el.matches('button,[role="button"]')&&!el.getAttribute('aria-label')&&!el.getAttribute('title')&&!el.textContent?.trim())el.setAttribute('aria-label',label.replace(/アイコン$/,''));
    };
    for(const el of nodes){const spec=phase8Contracts.get(el.id);if(spec)tag(el,spec)}
    for(const [selector,id,priority,role,label] of phase8DynamicContracts){
      if(selector.includes('$')){
        const prefix=selector.split('$')[0];
        for(const el of nodes)if(el.id?.startsWith(prefix))tag(el,[id,priority,role,label]);
      }else{try{for(const el of root.querySelectorAll(selector))tag(el,[id,priority,role,label])}catch{}}
    }
    // The 304-item source catalog is not the entire UI: list rows, date cells,
    // generated search filters, accounts and modal controls are dynamic.
    // Include them in visual standards but never mark them as audited 304 IDs.
    const dynamicNodes=[...(root.matches?.('button,[role="button"]')?[root]:[]),...root.querySelectorAll('button,[role="button"]')];
    for(const el of dynamicNodes){
      if(el.dataset.uiInventory)continue;
      let role='secondary';
      if(el.matches('.tab,.back-btn,.date-nav-btn,.money-ticker-card,.day-cell,.acf-calendar-day,.cat-card,.row.press,.menu-item,.financial-event-card,.today-spend-tap,.day-closing-card,.mm3-action-row'))role='navigation';
      if(el.matches('.pro4-search-chip,.seg button,.native-home-mode button,.mm3-salary-range button,.mm3-assets-range button'))role='selection';
      if(el.matches('.native-quick-action,.financial-update-access'))role='primary';
      if(el.matches('.destructive,.danger,[data-destructive=true]'))role='danger';
      el.dataset.uiExtra='dynamic';
      el.dataset.uiRole=role;
    }
  }
  const amountSelector='.hero-value,.ring-amount,.goal-side-value,.summary-value,.account-balance,.row-value,.money-ticker-value,.mm3-salary-primary-value,.mm3-payment-primary-value,.mm3-assets-primary-value,.mm3-salary-metric strong,.mm3-atf-metric strong,.mm3-assets-metric strong,.mm3-salary-watch-value strong,.mm3-assets-watch-value strong,.mm3-payment-watch-value strong,.calc-number';
  const fitted=new WeakSet(),fitQueue=new Set();let fitFrame=0;
  function fitAmounts(){
    fitFrame=0;
    for(const el of fitQueue){
      if(!el.isConnected||!el.getClientRects().length||el.childElementCount)continue;
      if(!/[¥￥円\d]/.test(el.textContent))continue;
      el.style.removeProperty('font-size');
      const base=parseFloat(getComputedStyle(el).fontSize),available=el.clientWidth;
      if(available>0&&el.scrollWidth>available+1){const size=Math.max(12,Math.floor(base*available/el.scrollWidth));el.style.fontSize=size+'px';el.title=el.textContent.trim()}
    }
    fitQueue.clear();
  }
  function enqueueFit(el){fitQueue.add(el);if(!fitFrame)fitFrame=requestAnimationFrame(fitAmounts)}
  const resizer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>entries.forEach(x=>enqueueFit(x.target))):null;
  function enhance(root){
    if(!root?.querySelectorAll)return;enhancePhase8Controls(root);if(root.matches?.(amountSelector))enqueueFit(root);
    root.querySelectorAll('input,select,textarea').forEach(el=>{
      if(!el.getAttribute('aria-label')&&!el.getAttribute('aria-labelledby')&&!el.labels?.length){
        const row=el.closest('.form-section,.form-row,.pro4-parse-row,.goal-category-row');
        const label=row?.querySelector('.form-label,label,.row-title');
        const name=label?.textContent.trim()||el.placeholder;
        if(name)el.setAttribute('aria-label',name);
      }
      if(el.type==='number'&&!el.inputMode)el.inputMode=el.step&&el.step!=='1'?'decimal':'numeric';
      if(!el.enterKeyHint&&el.tagName!=='TEXTAREA')el.enterKeyHint=el.type==='search'?'search':'done';
    });
    root.querySelectorAll('button.switch').forEach(el=>{
      el.setAttribute('role','switch');el.setAttribute('aria-checked',String(el.classList.contains('on')));
      if(!el.getAttribute('aria-label')){const name=el.closest('.row,.form-section')?.querySelector('.row-title,.form-label')?.textContent.trim();if(name)el.setAttribute('aria-label',name)}
    });
    root.querySelectorAll('.date-nav-btn').forEach(el=>{if(!el.getAttribute('aria-label'))el.setAttribute('aria-label',/prev/i.test(el.id)?'前へ':'次へ')});
    root.querySelectorAll('.large-title,.month-name-btn').forEach(el=>{if(el.tagName!=='BUTTON'){el.setAttribute('role','heading');el.setAttribute('aria-level','1')}});
    root.querySelectorAll(amountSelector).forEach(el=>{if(!fitted.has(el)){fitted.add(el);resizer?.observe(el)}enqueueFit(el)});
    // A disclosure is artwork, not a font-dependent text character.
    root.querySelectorAll('.chev,.mm3-action-chev,.goal-plan-action>span:last-child').forEach(el=>{
      if(/^[›»]$/.test(el.textContent.trim())&&!el.querySelector('svg'))el.innerHTML=icon('chevronRight');
    });
    root.querySelectorAll('.acf-link').forEach(el=>{
      if(el.childElementCount||!/[›»]\s*$/.test(el.textContent))return;
      const label=document.createElement('span');label.textContent=el.textContent.replace(/\s*[›»]\s*$/,'');
      el.replaceChildren(label);el.insertAdjacentHTML('beforeend',icon('chevronRight'));
    });
    root.querySelectorAll('button svg').forEach(el=>{if(!el.hasAttribute('aria-label')){el.setAttribute('aria-hidden','true');el.setAttribute('focusable','false')}});
  }
  function addShortcut(content,after,label,action){
    if(!after||content.querySelector('.native-quick-action'))return;
    const button=document.createElement('button');button.type='button';button.className='native-quick-action';button.innerHTML=icon('plus')+`<span>${label}</span>`;button.onclick=()=>action();after.after(button);
  }
  function decorate(tab){
    const root=$(`screen-${tab}`);if(!root)return;
    const top=root.querySelector('.topbar'),content=root.querySelector('.scroll');
    // Keep nodes and their existing handlers; moving them cannot register twice.
    if(tab==='today'||tab==='month'){
      const modes=document.createElement('div');modes.className='native-home-mode';modes.setAttribute('role','group');modes.setAttribute('aria-label','ホームの表示');
      for(const [mode,label] of [['today','今日'],['month','今月']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-pressed',String(tab===mode));b.onclick=()=>{if(activeTab!==mode)switchTab(mode)};modes.appendChild(b)}
      content.querySelector('.native-home-mode')?.remove();content.prepend(modes);
      if(tab==='today'){
        const quick=content.querySelector('.quick-grid'),hero=content.querySelector('.today-goal-hero');if(quick&&hero)hero.before(quick);
        for(const [id,label] of [['quickExpense','支出を入力'],['quickBank','残高を更新'],['quickIncome','臨時収入']]){const span=$(id)?.querySelector('span');if(span)span.textContent=label}
      }else addShortcut(content,content.querySelector('#monthHero'),'今日の支出を入力',()=>openQuickExpense(ymd()));
    }else if(tab==='pay')addShortcut(content,content.querySelector('.mm3-salary-primary'),'給与を登録',openSalaryAdd);
    else if(tab==='payments')addShortcut(content,content.querySelector('.mm3-payment-primary'),'請求額を更新',()=>openQuickCardBilling(paymentHomeMonth()));
    else if(tab==='assets')addShortcut(content,content.querySelector('.mm3-assets-primary'),'残高を更新',openQuickBank);
    if(!content.dataset.nativeScrollBound){content.dataset.nativeScrollBound='true';content.addEventListener('scroll',()=>top.classList.toggle('native-scrolled',content.scrollTop>4),{passive:true})}
    top.classList.toggle('native-scrolled',content.scrollTop>4);
    enhance(root);syncTabState();
  }
  const renders={today:renderToday,month:renderMonth,pay:renderPay,payments:renderPayments,assets:renderAssets,settings:renderSettings};
  renderToday=function(...args){const r=renders.today.apply(this,args);decorate('today');return r};
  renderMonth=function(...args){const r=renders.month.apply(this,args);decorate('month');return r};
  renderPay=function(...args){const r=renders.pay.apply(this,args);decorate('pay');return r};
  renderPayments=function(...args){const r=renders.payments.apply(this,args);decorate('payments');return r};
  renderAssets=function(...args){const r=renders.assets.apply(this,args);decorate('assets');return r};
  renderSettings=function(...args){const r=renders.settings.apply(this,args);decorate('settings');return r};
  function syncTabState(){
    $('tabbar').setAttribute('aria-label','メインナビゲーション');
    document.querySelectorAll('.tab').forEach(b=>{const on=b.dataset.tab===activeTab||(b.dataset.tab==='home'&&['today','month'].includes(activeTab));b.classList.toggle('active',on);if(on)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  }
  const dialogs=[$('sheet'),$('calculator'),$('alertWrap')];
  for(const el of dialogs){el.setAttribute('role',el.id==='alertWrap'?'alertdialog':'dialog');el.setAttribute('aria-modal','true');el.tabIndex=-1}
  $('calculator').setAttribute('aria-labelledby','calcTitle');$('alertWrap').setAttribute('aria-labelledby','alertTitle');$('alertWrap').setAttribute('aria-describedby','alertMessage');
  const visible=el=>el?.classList.contains('show');
  function activeScope(){
    if(visible($('lockScreen')))return $('lockScreen');
    if(visible($('alertWrap')))return $('alertWrap');
    if(visible($('calculator')))return $('calculator');
    if(visible($('menuLayer')))return $('menuLayer');
    if(visible($('sheet')))return $('sheet');
    const view=pushStack.at(-1);return (view&&$(view.id))||null;
  }
  const returns=new WeakMap();let previousScope=null,scheduled=false;const added=new Set();
  // Calculator opening blurs the current control before the layer observer runs.
  // Retain that control here so cancel can restore its exact parent context.
  const calculatorOpen=openCalculator;
  openCalculator=function(...args){
    const calculator=$('calculator'),origin=document.activeElement;
    if(!visible(calculator)&&origin instanceof HTMLElement&&origin!==document.body)returns.set(calculator,origin);
    return calculatorOpen.apply(this,args);
  };

  function syncLayers(){
    const scope=activeScope();
    $('app').inert=!!scope;
    document.querySelectorAll('.push-view').forEach(el=>{el.inert=el!==scope});
    for(const el of dialogs){const shown=visible(el);el.inert=!shown||(!!scope&&scope!==el);el.setAttribute('aria-hidden',String(!shown))}
    $('menuLayer').inert=!visible($('menuLayer'));
    $('sheet').setAttribute('aria-label',$('sheet').querySelector('.sheet-title')?.textContent.trim()||'入力');
    // The backdrop must always act on the topmost presentation.
    $('dim').onclick=()=>visible($('calculator'))?closeCalc():requestSheetClose();
    if(scope!==previousScope){
      const old=previousScope;previousScope=scope;
      if(scope&&!scope.contains(document.activeElement)){
        if(!returns.has(scope))returns.set(scope,document.activeElement);
        const returnTo=old&&returns.get(old);
        if(returnTo?.isConnected&&scope.contains(returnTo))returnTo.focus({preventScroll:true});
        else{const title=scope.querySelector('.sheet-title,.push-title,#calcTitle,#alertTitle')||scope.querySelector('button')||scope;title.tabIndex=title.matches('button')?title.tabIndex:-1;title.focus({preventScroll:true})}
      }else if(!scope&&old){const el=returns.get(old);if(el?.isConnected&&!el.closest('[inert]'))el.focus({preventScroll:true})}
      if(old&&!old.classList.contains('show')&&!old.classList.contains('open'))returns.delete(old);
    }
  }
  function flush(){scheduled=false;for(const node of added){if(node.isConnected)enhance(node)}added.clear();syncLayers();syncTabState()}
  const observer=new MutationObserver(records=>{
    for(const r of records){if(r.type==='childList'){if(r.target.matches?.(amountSelector))enqueueFit(r.target);for(const n of r.removedNodes){if(n.nodeType!==1||n.isConnected)continue;const removed=[...(n.matches(amountSelector)?[n]:[]),...n.querySelectorAll(amountSelector)];removed.forEach(el=>{resizer?.unobserve(el);fitted.delete(el);fitQueue.delete(el)})}for(const n of r.addedNodes)if(n.nodeType===1)added.add(n);if(r.target.matches?.('.sheet-body,.push-body,.sheet'))added.add(r.target)}else if(r.target.matches?.('button.switch'))enhance(r.target.parentElement)}
    if(!scheduled){scheduled=true;queueMicrotask(flush)}
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
  document.addEventListener('click',e=>{if(e.target.closest?.('#sheet button.switch'))markSheetDirty()});
  document.addEventListener('keydown',e=>{
    const scope=activeScope();if(!scope)return;
    if(e.key==='Escape'){
      if(scope.id==='lockScreen')return;
      e.preventDefault();e.stopImmediatePropagation();
      if(scope.id==='alertWrap')$('alertActions').querySelector('button')?.click();
      else if(scope.id==='calculator')closeCalc();else if(scope.id==='sheet')requestSheetClose();else if(scope.id==='menuLayer')closeMenu();else requestPushBack();return;
    }
    if(e.key==='Tab'){
      const selector='button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]';
      const list=[...scope.querySelectorAll(selector)].filter(el=>{
        if(el.tabIndex<0||el.closest('[inert],[hidden],[aria-hidden="true"]')||!el.getClientRects().length||getComputedStyle(el).visibility!=='visible')return false;
        const closed=el.closest('details:not([open])');
        return !closed||closed.querySelector(':scope > summary')?.contains(el);
      });
      if(!list.length){e.preventDefault();scope.focus();return}
      const focused=document.activeElement;
      const atTitle=focused===scope||focused.matches('.sheet-title,.push-title,#calcTitle,#alertTitle');
      const boundary=e.shiftKey?list[0]:list.at(-1);
      // Native stops such as scrollable regions can sit between listed controls.
      if(!scope.contains(focused)||atTitle||focused===boundary){
        e.preventDefault();
        (e.shiftKey?list.at(-1):list[0]).focus();
      }
    }
  },true);
  // Track the visible viewport only while editing, preserving pinch zoom.
  let viewportFrame=0;
  function updateViewport(){viewportFrame=0;const vv=window.visualViewport;if(!vv)return;const editing=document.activeElement?.matches('input,textarea,[contenteditable=true]'),inset=Math.max(0,innerHeight-vv.height-vv.offsetTop),keyboard=editing&&vv.scale<=1.05&&inset>100;document.documentElement.classList.toggle('native-keyboard',!!keyboard);document.documentElement.style.setProperty('--native-keyboard-inset',keyboard?inset+'px':'0px');document.documentElement.style.setProperty('--native-viewport-height',vv.height+'px');if(keyboard)document.activeElement.scrollIntoView({block:'nearest',behavior:'auto'})}
  const viewportChanged=()=>{if(!viewportFrame)viewportFrame=requestAnimationFrame(updateViewport)};
  window.visualViewport?.addEventListener('resize',viewportChanged);window.visualViewport?.addEventListener('scroll',viewportChanged);document.addEventListener('focusin',viewportChanged);document.addEventListener('focusout',viewportChanged);
  window.addEventListener('resize',()=>{document.querySelectorAll(amountSelector).forEach(enqueueFit)},{passive:true});
  enhance(document);syncLayers();
})();
/* End UI-20260917 accessibility lifecycle. */

