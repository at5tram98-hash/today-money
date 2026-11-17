import XCTest
@testable import TodayMoneyCore

/// Gmail のメール解析が Web 版と同じか（ios/tools/mail-fixtures.js → Fixtures/mail-compat.json）
final class MailCompatTests: XCTestCase {
    static let fx: JSONValue = {
        let url = Bundle.module.url(forResource: "mail-compat", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONValue.parse(try! Data(contentsOf: url))
    }()
    var fx: JSONValue { Self.fx }
    var today: String { str(fx["today"]) }
    var messages: [JSONValue] { fx["messages"]!.arrayValue! }

    func testParse() throws {
        for run in fx["runs"]!.arrayValue! {
            let d = try MoneyDocument(json: run["document"]!)
            for (m, want) in zip(messages, run["parsed"]!.arrayValue!) {
                let got = d.parseFinancialMessage(m)
                if want.isNull { XCTAssertNil(got, str(m["id"])); continue }
                guard let got else { XCTFail("nil \(str(m["id"]))"); continue }
                for (k, v) in want.objectValue! where !["id", "createdAt"].contains(k) {
                    XCTAssertEqual(got[k]?.canonical, v.canonical, "\(str(m["id"])) \(k) sources=\(d.gmailSourceIds)")
                }
            }
        }
        for c in fx["confidence"]!.arrayValue! {
            let got = MoneyDocument.mailConfidence(c["mi"]!)
            XCTAssertEqual([got.label, got.ready ? "1" : "0"], [str(c["c"]?["label"]), c["c"]?["ready"]?.boolValue == true ? "1" : "0"])
        }
    }

    /// 同期 → 確認 → 反映 → 再同期 の流れ
    func testSyncReviewApply() throws {
        var d = try MoneyDocument(json: fx["runs"]!.arrayValue![0]["document"]!)
        let before = d.transactions.count
        let r = d.applySyncedMessages(messages)
        XCTAssertEqual(r.added, 10, "金融メールでない1通は記録しない")
        XCTAssertEqual(Set(r.reviewIds).count, 7, "対象外・情報のみ以外は確認待ち")
        XCTAssertEqual(d.mailImports.filter { str($0["status"]) == "pending" }.count, 7)
        XCTAssertEqual(d.transactions.count, before, "確認するまで家計に反映しない")
        XCTAssertEqual(d.mailIdsToFetch(messages.map { str($0["id"]) }), ["m7"], "記録したメールは取り直さない（金融メールでないものは Web 版と同じく毎回読む）")
        // 準備できたもの（なぞの店・Amazon はカテゴリ不明）のうち、支払い方法が分かるものを反映
        let ready = r.reviewIds.filter { MoneyDocument.mailConfidence(d.mailImport($0)!).ready }
        XCTAssertEqual(ready.count, 5)
        let refundId = str(d.mailImports.first { str($0["emailId"]) == "m6" }!["id"])
        XCTAssertThrowsError(try d.applyMailItems([refundId], today: today), "口座が分からない返金はそのままでは反映できない")
        let n = try d.applyMailItems(ready.filter { $0 != refundId }, today: today)
        XCTAssertEqual(n, 4)
        XCTAssertEqual(d.transactions.count, before + 4)
        try d.resolveMail(refundId, merchant: "ユニクロ", amount: 3000, date: str(d.mailImport(refundId)!["date"]), category: "衣服費", paymentMethod: "other", paymentId: "",
                          direction: "refund", memo: "", link: false, today: today)
        let refund = d.mailImport(refundId)!
        XCTAssertEqual(d.transactions.first { $0.id == str(refund["transactionId"]) }?.amount, -3000)
        XCTAssertEqual(str(d.transactions.first { $0.id == str(refund["transactionId"]) }?.raw["mailImportId"]), refundId)
        // カテゴリ不明を手で直して反映 → 店名を学習
        let unknown = d.mailImports.first { str($0["emailId"]) == "m9" }!
        try d.resolveMail(str(unknown["id"]), merchant: "なぞの店", amount: 5000, date: str(unknown["date"]), category: "娯楽費", paymentMethod: "other", paymentId: "",
                          direction: "expense", memo: "", link: false, today: today)
        XCTAssertEqual(d.categoryForMerchant("なぞの店"), "娯楽費")
        // 対象外
        let amazon = d.mailImports.first { str($0["emailId"]) == "m11" }!
        try d.ignoreMail(str(amazon["id"]))
        XCTAssertTrue(d.pendingMailIds.isEmpty)
        // 同じメールをもう一度同期しても、反映済みは変わらない
        let again = d.applySyncedMessages(messages)
        XCTAssertEqual(again.added, 0)
        XCTAssertEqual(d.transactions.count, before + 6)
        // 同じ取引をもう一度入力しようとすると重複候補になる
        let seven = d.mailImports.first { str($0["emailId"]) == "m1" }!
        XCTAssertEqual(d.mailHistoryStatus(seven).key, "imported")
    }
}
