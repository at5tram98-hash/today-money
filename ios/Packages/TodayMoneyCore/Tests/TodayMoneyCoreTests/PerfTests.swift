import XCTest
@testable import TodayMoneyCore

final class PerfTests: XCTestCase {
    func testTimings() throws {
        let url = Bundle.module.url(forResource: "ledger-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        let d = try MoneyDocument(json: fx["document"]!), today = str(fx["today"]), m = String(today.prefix(7))
        func t(_ name: String, _ f: () -> Void) { let s = Date(); f(); print("TIME \(name): \(Int(Date().timeIntervalSince(s) * 1000))ms") }
        t("summary") { _ = d.paymentSummary(month: m, today: today) }
        t("events90") { _ = d.financialEvents(from: today, days: 90, today: today) }
        t("series") { for c in d.cards { _ = d.paymentCardSeries(c.id, month: m) } }
        t("salary") { _ = d.salarySummary(m, today: today) }
        t("parse") { _ = try? MoneyDocument(data: d.exportJSON().data) }
    }
}
