import XCTest
@testable import TodayMoneyCore

/// カード詳細の数字が Web 版と同じか（ios/tools/card-fixtures.js → Fixtures/card-compat.json）
final class CardDashboardCompatTests: XCTestCase {
    func testCardDashboard() throws {
        let url = Bundle.module.url(forResource: "card-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        let d = try MoneyDocument(json: fx["document"]!), today = str(fx["today"])
        for (id, c) in fx["cards"]!.objectValue! {
            XCTAssertEqual(d.cardUnpaidEstimate(id, today: today), num(c["unpaid"]), id)
            for (m, w) in c["months"]!.objectValue! {
                let items = d.statements(id, paymentMonth: m)
                let bm = (items.first { $0.status != .paid } ?? items.first)?.billingMonth ?? d.billingMonth(d.card(id), forPaymentMonth: m)
                XCTAssertEqual(bm, str(w["billingMonth"]), "\(id) \(m)")
                XCTAssertEqual(d.cardMonthHistory(id, center: m).map { "\($0.month)|\($0.amount)|\($0.status.rawValue)|\($0.count)" },
                               w["history"]!.arrayValue!.map { "\(str($0["month"]))|\(num($0["amount"]))|\(str($0["status"]))|\(Int(num($0["count"])))" }, "\(id) \(m)")
                XCTAssertEqual(d.cardBankHandling(id, billingMonth: bm).label, str(w["handling"]), "\(id) \(m)")
                XCTAssertEqual(d.cardDeltaAtEdit(id, billingMonth: bm), num(w["deltaAtEdit"]), "\(id) \(m)")
                let end = d.cardExposureEnd(paymentMonth: m, today: today)
                XCTAssertEqual(end, str(w["exposureEnd"]), "\(id) \(m)")
                let ex = d.projectedCardExposure(id, end: end, today: today)
                XCTAssertEqual(ex.minAvailable, num(w["minAvailable"]), "\(id) \(m)")
                XCTAssertEqual(ex.max, num(w["max"]), "\(id) \(m)")
            }
        }
    }
}
