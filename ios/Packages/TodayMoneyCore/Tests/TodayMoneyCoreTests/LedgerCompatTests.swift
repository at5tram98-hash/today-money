import XCTest
@testable import TodayMoneyCore

/// 支払いの計算が Web 版と同じか（ios/tools/ledger-fixtures.js が Web 版の関数で作った Fixtures/ledger-compat.json と比べる）
final class LedgerCompatTests: XCTestCase {
    static let fx: JSONValue = {
        let url = Bundle.module.url(forResource: "ledger-compat", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONValue.parse(try! Data(contentsOf: url))
    }()
    var fx: JSONValue { Self.fx }
    var today: String { str(fx["today"]) }
    lazy var doc: MoneyDocument = try! MoneyDocument(json: fx["document"]!)

    func list(_ k: String) -> [JSONValue] { fx[k]!.arrayValue! }

    func checkStatement(_ got: CardStatement, _ w: JSONValue, _ ctx: String, items: Bool = false) {
        XCTAssertEqual(got.cardId, str(w["cardId"]), ctx)
        XCTAssertEqual(got.billingMonth, str(w["billingMonth"]), ctx)
        XCTAssertEqual(got.paymentDate, str(w["paymentDate"]), ctx)
        XCTAssertEqual(got.amount, num(w["amount"]), ctx)
        XCTAssertEqual(got.status.rawValue, str(w["status"]), ctx)
        if items {
            XCTAssertEqual(got.plannedAmount, num(w["plannedAmount"]), ctx)
            XCTAssertEqual(got.outstandingAmount, num(w["outstandingAmount"]), ctx)
            XCTAssertEqual(got.settledBaseAmount, num(w["settledBaseAmount"]), ctx)
        }
    }

    func testCycleAndDates() {
        for c in list("cycle") {
            let card = doc.card(str(c["cardId"]))
            let got = doc.billingCycle(card, month: str(c["month"]))
            XCTAssertEqual(got.start, str(c["out"]!["start"]), "\(str(c["cardId"])) \(str(c["month"]))")
            XCTAssertEqual(got.end, str(c["out"]!["end"]), "\(str(c["cardId"])) \(str(c["month"]))")
        }
        for c in list("purchase") {
            XCTAssertEqual(doc.cardBillingMonth(doc.card(str(c["cardId"])), purchase: str(c["date"])), str(c["out"]), "\(str(c["cardId"])) \(str(c["date"]))")
        }
        for c in list("payDate") {
            let got = doc.cardPaymentDate(doc.card(str(c["cardId"])), billingMonth: str(c["month"]))
            XCTAssertEqual(got, c["out"]!.isNull ? nil : str(c["out"]), "\(str(c["cardId"])) \(str(c["month"]))")
        }
        for c in list("nextDue") {
            let got = doc.nextCardDueDate(doc.card(str(c["cardId"])), from: today)
            XCTAssertEqual(got, c["out"]!.isNull ? nil : str(c["out"]), str(c["cardId"]))
        }
    }

    func testUsage() {
        for c in list("usage") {
            let id = str(c["cardId"]), m = str(c["month"]), ctx = "\(id) \(m)"
            XCTAssertEqual(doc.cardBaseUsage(id, billingMonth: m), num(c["base"]), ctx)
            XCTAssertEqual(doc.cardBillingAmount(id, billingMonth: m), num(c["amount"]), ctx)
            XCTAssertEqual(doc.cardNewUsageAfterConfirmation(id, billingMonth: m), num(c["newUse"]), ctx)
            XCTAssertEqual(doc.statementStatus(id, billingMonth: m).rawValue, str(c["status"]), ctx)
        }
    }

    func testStatements() {
        for c in list("statements") {
            let got = doc.statements(str(c["cardId"]), paymentMonth: str(c["month"])), want = c["out"]!.arrayValue!
            let ctx = "\(str(c["cardId"])) \(str(c["month"]))"
            XCTAssertEqual(got.count, want.count, ctx)
            for (g, w) in zip(got, want) { checkStatement(g, w, ctx) }
        }
        for c in list("inMonth") {
            let m = str(c["month"])
            for (key, paid) in [("out", false), ("all", true)] {
                let got = doc.cardPaymentStatements(inMonth: m, includePaid: paid), want = c[key]!.arrayValue!
                XCTAssertEqual(got.count, want.count, "\(m) \(key)")
                for (g, w) in zip(got, want) { checkStatement(g, w, "\(m) \(key)") }
            }
        }
    }

    func testPaymentItemsAndSummary() {
        for c in list("items") {
            let m = str(c["month"]), got = doc.paymentCardItems(month: m), want = c["out"]!.arrayValue!
            XCTAssertEqual(got.count, want.count, m)
            for (g, w) in zip(got, want) { checkStatement(g, w, "items \(m)", items: true) }
        }
        for c in list("summary") {
            let m = str(c["month"]), s = doc.paymentSummary(month: m, today: today)
            for (k, v) in [("cardTotal", s.cardTotal), ("cardPaid", s.cardPaid), ("plannedCardTotal", s.plannedCardTotal), ("fixedTotal", s.fixedTotal),
                           ("fixedPaid", s.fixedPaid), ("largeTotal", s.largeTotal), ("largePaid", s.largePaid), ("otherTotal", s.otherTotal),
                           ("otherPaid", s.otherPaid), ("total", s.total), ("paid", s.paid), ("remaining", s.remaining)] {
                XCTAssertEqual(v, num(c[k]), "summary \(m) \(k)")
            }
            let next = doc.paymentNextCard(s, today: today)
            if c["next"]!.isNull { XCTAssertNil(next, "next \(m)") } else if let next { checkStatement(next, c["next"]!, "next \(m)", items: true) } else { XCTFail("next \(m) missing") }
        }
        for c in list("series") {
            XCTAssertEqual(doc.paymentCardSeries(str(c["cardId"]), month: String(today.prefix(7))), c["out"]!.arrayValue!.map { num($0) }, str(c["cardId"]))
        }
    }

    func testFixedAndEvents() {
        for c in list("fixed") {
            let f = doc.fixedPayments.first { $0.id == str(c["fixedId"]) }!
            XCTAssertEqual(doc.fixedDueDates(f, month: str(c["month"])), c["out"]!.arrayValue!.map { str($0) }, "\(f.id) \(str(c["month"]))")
        }
        let got = doc.financialEvents(from: today, days: 90, today: today), want = list("events")
        XCTAssertEqual(got.count, want.count)
        for (g, w) in zip(got, want) {
            XCTAssertEqual([g.date, g.type.rawValue, g.title, g.detail], [str(w["date"]), str(w["type"]), str(w["title"]), str(w["detail"])])
            XCTAssertEqual(g.amount, num(w["amount"]), g.title)
        }
        for c in list("spentDate") { XCTAssertEqual(doc.spent(on: str(c["date"])), num(c["out"]), str(c["date"])) }
    }
}
