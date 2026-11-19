import XCTest
@testable import TodayMoneyCore

/// 1日の支出・今月の比較・カテゴリ詳細（iOS だけの画面）の数字が、取引を素直に足した値と合うか
final class SpendInsightsTests: XCTestCase {
    func doc() throws -> (MoneyDocument, String) {
        let url = Bundle.module.url(forResource: "analysis-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        return (try MoneyDocument(json: fx["document"]!), str(fx["today"]))
    }
    func sum(_ d: MoneyDocument, _ f: (Transaction) -> Bool) -> Double { d.transactions.filter(f).reduce(0) { $0 + $1.amount } }

    func testDayInsight() throws {
        let (d, today) = try doc()
        let x = d.dayInsight(today)
        XCTAssertEqual(x.spent, sum(d) { $0.date == today })
        XCTAssertEqual(x.last14.count, 14)
        XCTAssertEqual(x.last14.last?.date, today)
        XCTAssertEqual(x.last14.first?.date, Dates.addDays(today, -13))
        for p in x.last14 { XCTAssertEqual(p.value, sum(d) { $0.date == p.date }) }
        XCTAssertEqual(x.categories.reduce(0) { $0 + $1.amount }, x.spent, accuracy: 0.001)
        let weeks = (1...8).map { Dates.addDays(today, -7 * $0) }.filter { w in d.transactions.contains { $0.date == w } }
        if weeks.isEmpty { XCTAssertNil(x.weekdayAverage) } else {
            XCTAssertEqual(x.weekdayAverage!, weeks.map { w in sum(d) { $0.date == w } }.reduce(0, +) / Double(weeks.count), accuracy: 0.001)
        }
        let from = Dates.addDays(today, -30)
        if let r = x.recentAverage { XCTAssertEqual(r, sum(d) { $0.date >= from && $0.date < today } / 30, accuracy: 0.001) }
    }

    func testMonthPace() throws {
        let (d, today) = try doc()
        let m = String(today.prefix(7)), prev = Dates.addMonths(m, -1)
        let p = d.monthPace(m, today: today)
        let day = Dates.parts(today).d
        XCTAssertEqual(p.day, day)
        XCTAssertEqual(p.current.count, day)
        XCTAssertEqual(p.previous.count, Dates.daysInMonth(prev))
        XCTAssertEqual(p.currentToDay, sum(d) { $0.date.hasPrefix(m) && $0.date <= today }, accuracy: 0.001)
        let cut = "\(prev)-\(Dates.pad(min(day, Dates.daysInMonth(prev))))"
        XCTAssertEqual(p.previousToDay, sum(d) { $0.date.hasPrefix(prev) && $0.date <= cut }, accuracy: 0.001)
        XCTAssertEqual(p.categories.reduce(0) { $0 + $1.previous }, sum(d) { $0.date.hasPrefix(prev) && $0.date <= cut && d.categories.map(\.name).contains($0.category) }, accuracy: 0.001)
        XCTAssertEqual(p.previous.last?.value ?? 0, sum(d) { $0.date.hasPrefix(prev) }, accuracy: 0.001)
        // 累計は減らない（返金がなければ）
        if !d.transactions.contains(where: { $0.amount < 0 }) { XCTAssertEqual(p.current.map(\.value), p.current.map(\.value).sorted()) }
        // 過去の月は月末まで
        XCTAssertEqual(d.monthPace(prev, today: today).day, Dates.daysInMonth(prev))
        // 先の月は空
        XCTAssertTrue(d.monthPace(Dates.addMonths(m, 1), today: today).current.isEmpty)
    }

    func testCategoryInsight() throws {
        let (d, today) = try doc()
        let m = String(today.prefix(7))
        let cat = d.categoryTotals(d.transactions(inMonth: m)).first!.name
        let c = d.categoryInsight(cat, month: m)
        XCTAssertEqual(c.amount, sum(d) { $0.date.hasPrefix(m) && $0.category == cat })
        XCTAssertEqual(c.count, d.transactions.filter { $0.date.hasPrefix(m) && $0.category == cat }.count)
        XCTAssertEqual(c.series.count, 6)
        XCTAssertEqual(c.series.last?.value, c.amount)
        XCTAssertEqual(c.merchants.reduce(0) { $0 + $1.amount }, c.amount, accuracy: 0.001)
        XCTAssertEqual(c.merchants.reduce(0) { $0 + $1.count }, c.count)
        XCTAssertEqual(c.merchants.map(\.amount), c.merchants.map(\.amount).sorted(by: >))
        XCTAssertEqual(c.share, c.amount / sum(d) { $0.date.hasPrefix(m) } * 100, accuracy: 0.001)
    }
}
