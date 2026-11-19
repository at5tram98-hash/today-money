import XCTest
@testable import TodayMoneyCore

/// 月間詳細分析が Web 版と同じか（ios/tools/analysis-fixtures.js → Fixtures/analysis-compat.json）
final class MonthAnalysisCompatTests: XCTestCase {
    func testMonthAnalysis() throws {
        let url = Bundle.module.url(forResource: "analysis-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        let d = try MoneyDocument(json: fx["document"]!), today = str(fx["today"])
        for (m, w) in fx["months"]!.objectValue! {
            let a = d.monthAnalysis(m, today: today)
            let p = w["pva"]!
            XCTAssertEqual([a.plan, a.actual, a.expected, a.variance], [num(p["plan"]), num(p["actual"]), num(p["expected"]), num(p["variance"])], m)
            XCTAssertEqual(a.months.map(\.value), w["months"]!.arrayValue!.map { num($0) }, m)
            XCTAssertEqual(a.change, Int(num(w["change"])), m)
            XCTAssertEqual(a.yoy, w["yoy"]!.isNull ? nil : Int(num(w["yoy"])), m)
            XCTAssertEqual(a.categories.map { "\($0.name)|\(JSONValue.formatNumber($0.value))" }, w["cats"]!.arrayValue!.map { str($0) }, m)
            XCTAssertEqual(a.top.map(\.id), w["top"]!.arrayValue!.map { str($0) }, m)
            XCTAssertEqual(a.surging.map(\.name), w["surging"]!.arrayValue!.map { str($0) }, m)
        }
    }
}
