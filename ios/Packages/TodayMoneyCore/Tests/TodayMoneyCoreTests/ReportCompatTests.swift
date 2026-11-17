import XCTest
@testable import TodayMoneyCore

/// PDF 家計レポートの数字が Web 版 buildPdfReport と同じか（ios/tools/report-fixtures.js → Fixtures/report-compat.json）
final class ReportCompatTests: XCTestCase {
    func testMonthReport() throws {
        let url = Bundle.module.url(forResource: "report-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        let d = try MoneyDocument(json: fx["document"]!)
        let today = str(fx["today"]), now = Date(timeIntervalSince1970: num(fx["now"]) / 1000)
        let want = fx["reports"]!.arrayValue!
        XCTAssertFalse(want.isEmpty)
        for w in want {
            let m = str(w["month"])
            let r = d.monthReport(m, today: today, now: now)
            XCTAssertEqual(r.transactions.map(\.id), w["ids"]!.arrayValue!.map { str($0) }, m)
            XCTAssertEqual(r.income, num(w["income"]), m)
            XCTAssertEqual(r.rawSpent, num(w["rawSpent"]), m)
            XCTAssertEqual(r.spent, num(w["spent"]), m)
            XCTAssertEqual(r.correction, num(w["correction"]), m)
            XCTAssertEqual(r.goal, num(w["goal"]), m)
            XCTAssertEqual(r.largePlanned, num(w["large"]), m)
            XCTAssertEqual(r.pageCount, Int(num(w["pages"])), m)
            XCTAssertEqual(r.acfMonthEnd, w["acfMonthEnd"]!.isNull ? nil : num(w["acfMonthEnd"]), m)
            XCTAssertEqual(r.acfReserveFloor, w["acfReserveFloor"]!.isNull ? nil : num(w["acfReserveFloor"]), m)
            XCTAssertEqual(r.rows(page: r.pageCount - 1).count, r.transactions.isEmpty ? 0 : (r.transactions.count - 1) % 24 + 1)
        }
    }
}
