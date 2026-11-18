import XCTest
@testable import TodayMoneyCore

/// カード明細の読み取りが Web 版と同じか（ios/tools/statement-fixtures.js → Fixtures/statement-compat.json）
final class StatementCompatTests: XCTestCase {
    static let fx: JSONValue = {
        let url = Bundle.module.url(forResource: "statement-compat", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONValue.parse(try! Data(contentsOf: url))
    }()
    var fx: JSONValue { Self.fx }
    var today: String { str(fx["today"]) }
    var doc: MoneyDocument { try! MoneyDocument(json: fx["document"]!) }

    /// Web 版の行が持つ項目だけを比べる（id は毎回変わるので除く）
    func check(_ got: ParsedStatement, _ want: JSONValue, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertEqual([got.provider, got.paymentDate, got.paymentMonth, got.officialTotalSource], ["provider", "paymentDate", "paymentMonth", "officialTotalSource"].map { str(want[$0]) }, file: file, line: line)
        XCTAssertEqual([got.officialTotal, got.calculatedTotal], [num(want["officialTotal"]), num(want["calculatedTotal"])], file: file, line: line)
        let rows = want["rows"]!.arrayValue!
        XCTAssertEqual(got.rows.count, rows.count, file: file, line: line)
        for (g, w) in zip(got.rows, rows) {
            let gj = g.json
            for (k, v) in w.objectValue! where k != "id" {
                XCTAssertEqual(gj[k]?.canonical, v.canonical, "\(w["merchant"]?.stringValue ?? "") \(k)", file: file, line: line)
            }
        }
    }

    func testPayPayCsv() throws {
        check(try doc.parsePayPayStatementCsv(str(fx["csv"]), today: today), fx["paypay"]!)
        let errs = fx["paypayErrors"]!.arrayValue!.map { str($0) }
        for (text, want) in zip(["", "a,b\n1,2"], errs) {
            XCTAssertThrowsError(try doc.parsePayPayStatementCsv(text, today: today)) { XCTAssertEqual(($0 as? StatementError)?.message, want) }
        }
    }

    func testSmbcPdfLines() throws {
        let lines = fx["smbcLines"]!.arrayValue!.map { str($0) }
        check(try doc.parseSmbcStatement(lines: lines, text: lines.joined(separator: "\n"), today: today), fx["smbc"]!)
    }

    func testCategoryAndKeys() {
        let d = doc
        for c in fx["categories"]!.arrayValue! {
            XCTAssertEqual(d.categoryForMerchant(str(c["m"]), context: str(c["c"])), c["cat"]?.stringValue, str(c["m"]))
        }
        for k in fx["keys"]!.arrayValue! { XCTAssertEqual(MoneyDocument.merchantKey(str(k["v"])), str(k["key"])) }
    }

    /// 取り込み → 保存 → 最終確定 → 解除 が帳簿と請求に正しく反映される
    func testImportPersistFinalizeUnlock() throws {
        var d = doc
        let card = d.cards[0].id
        var parsed = try d.parsePayPayStatementCsv(str(fx["csv"]), today: today)
        let before = d.transactions.count
        let id = try d.addStatementImport(parsed, cardId: card, fileName: "a.csv", fileHash: "h1")
        XCTAssertThrowsError(try d.finalizeStatement(id, today: today), "要確認があると確定できない")
        // 要確認の行は分類して保存、1行は除外
        let imp = d.statementImport(id)!
        for r in imp.rows where r.needsReview {
            try d.saveStatementRow(id, rowId: r.id, merchant: r.merchant, date: r.transactionDate, category: "その他", amount: abs(r.currentPaymentAmount),
                                   direction: r.direction, installmentText: r.installmentText, memo: r.memo, linkedTransactionId: "")
        }
        let excluded = imp.rows[0].id
        try d.updateStatementRow(id, rowId: excluded) { $0.included = false }
        let res = try d.persistStatementRows(id, today: today)
        XCTAssertEqual(res.saved, imp.rows.count - 1)
        XCTAssertEqual(d.transactions.count, before + imp.rows.count - 1)
        // 分割は元の利用金額、返金は負の金額
        let saved = d.statementImport(id)!
        let inst = saved.rows.first { $0.installmentTotal > 1 }!
        XCTAssertEqual(d.transactions.first { $0.id == inst.linkedTransactionId }?.amount, 60000)
        let refund = saved.rows.first { $0.direction == "refund" }!
        XCTAssertEqual(d.transactions.first { $0.id == refund.linkedTransactionId }?.amount, -2990)
        // 2回保存しても増えない
        try d.persistStatementRows(id, today: today)
        XCTAssertEqual(d.transactions.count, before + imp.rows.count - 1)
        // 除外を戻して確定 → 請求額は公式額で確定・照合は一致
        try d.updateStatementRow(id, rowId: excluded) { $0.included = true }
        try d.finalizeStatement(id, today: today)
        let fin = d.statementImport(id)!
        XCTAssertEqual(fin.status, "confirmed")
        let bm = d.statementBillingMonth(fin)
        XCTAssertEqual(d.cardAdjustment(card, billingMonth: bm)?.confirmedTotal, fin.officialTotal)
        XCTAssertEqual(d.cardAdjustment(card, billingMonth: bm)?.status, "confirmed")
        XCTAssertEqual(str(d.statementRecon(card, billingMonth: bm)?["status"]), "matched")
        XCTAssertEqual(d.statementReconTransactions(cardId: card, billingMonth: bm, paymentMonth: fin.paymentMonth).filter { str($0.raw["statementImportId"]) == id }.count, fin.rows.count)
        // 解除
        try d.unlockStatement(id, today: today)
        XCTAssertEqual(d.statementImport(id)!.status, "reviewing")
        XCTAssertEqual(d.cardAdjustment(card, billingMonth: bm)?.status, "estimated")
        XCTAssertEqual(str(d.statementRecon(card, billingMonth: bm)?["status"]), "review")
        // 同じ明細を後から取り込むと重複候補が付く
        parsed.rows = parsed.rows.map { var r = $0; r.id = MoneyDocument.uid("stmtrow"); return r }
        let id2 = try d.addStatementImport(parsed, cardId: card, fileName: "b.csv", fileHash: "h2")
        XCTAssertTrue(d.statementImport(id2)!.rows.contains { !$0.duplicateCandidateId.isEmpty })
        // 書き戻した JSON をもう一度読んでも同じ
        let again = try MoneyDocument(json: .object(d.root))
        XCTAssertEqual(again.cardStatementImports.map { $0.json.canonical }, d.cardStatementImports.map { $0.json.canonical })
    }
}
