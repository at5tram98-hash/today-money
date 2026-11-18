import XCTest
@testable import TodayMoneyCore

/// ウィジェット・Siri に渡す要約
final class WidgetSnapshotTests: XCTestCase {
    func testSnapshot() throws {
        let url = Bundle.module.url(forResource: "report-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        var d = try MoneyDocument(json: fx["document"]!)
        let now = Date(timeIntervalSince1970: num(fx["now"]) / 1000), today = Dates.ymd(now)
        var goals = d["dailyGoals"]?.objectValue ?? [:]
        goals[today] = .object(["total": .number(1500)])
        d["dailyGoals"] = .object(goals)
        let s = d.widgetSnapshot(now: now)
        XCTAssertEqual(s.days.count, 7)
        XCTAssertEqual(s.day(today).goal, 1500)
        XCTAssertEqual(s.day(today).spent, d.spent(on: today))
        XCTAssertEqual(s.remaining(today), 1500 - d.spent(on: today))
        XCTAssertNil(s.remaining(Dates.addDays(today, 30)), "目標の無い日は残りを出さない")
        XCTAssertEqual(s.monthSpent, d.spentMonth(String(today.prefix(7))))
        XCTAssertEqual(s.totalAssets, d.totalBankBalance)
        XCTAssertNotNil(s.acfValue, "ACF を使っている時は指標を入れる")
        XCTAssertTrue(s.payments.allSatisfy { $0.amount > 0 && $0.date >= today })
        XCTAssertEqual(s.payments.map(\.date), s.payments.map(\.date).sorted())
        // 書き出して読み戻しても同じ
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
        var back = try dec.decode(WidgetSnapshot.self, from: enc.encode(s))
        back.updatedAt = s.updatedAt
        XCTAssertEqual(back, s)
    }
}
