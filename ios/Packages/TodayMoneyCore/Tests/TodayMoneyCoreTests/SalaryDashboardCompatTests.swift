import XCTest
@testable import TodayMoneyCore

/// 給与画面の数字が Web 版と同じか（ios/tools/salary-fixtures.js → Fixtures/salary-compat.json）
final class SalaryDashboardCompatTests: XCTestCase {
    func testSalaryDashboard() throws {
        let url = Bundle.module.url(forResource: "salary-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        let d = try MoneyDocument(json: fx["document"]!), today = str(fx["today"])
        for (m, w) in fx["months"]!.objectValue! {
            let s = d.salarySummary(m, today: today)
            XCTAssertEqual([s.total, s.received, s.planned, s.overdue], [num(w["total"]), num(w["received"]), num(w["planned"]), num(w["overdue"])], m)
            let delta = d.salaryMonthDelta(m, today: today)
            XCTAssertEqual(delta.prev, num(w["delta"]?["prev"]), m)
            XCTAssertEqual(delta.diff, num(w["delta"]?["diff"]), m)
            if let p = w["delta"]?["pct"], !p.isNull { XCTAssertEqual(delta.pct!, num(p), accuracy: 1e-9) } else { XCTAssertNil(delta.pct) }
            XCTAssertEqual(d.salaryComposition(m, today: today).map { "\($0.id)|\($0.amount)|\($0.pct)" },
                           w["composition"]!.arrayValue!.map { "\(str($0["id"]))|\(num($0["amount"]))|\(Int(num($0["pct"])))" }, m)
            let rows = d.salaryEmployerRows(m, today: today)
            for (r, x) in zip(rows, w["rows"]!.arrayValue!) {
                XCTAssertEqual(r.employer.id, str(x["id"]))
                XCTAssertEqual(r.amount, num(x["amount"]), "\(m) \(r.employer.name)")
                XCTAssertEqual(r.status, str(x["status"]), "\(m) \(r.employer.name)")
                XCTAssertEqual(r.date, str(x["date"]), "\(m) \(r.employer.name)")
                XCTAssertEqual(r.series, x["series"]!.arrayValue!.map { num($0) }, "\(m) \(r.employer.name)")
            }
            for (range, list) in w["trend"]!.objectValue! {
                XCTAssertEqual(d.salaryTrend(m, range: range, today: today).map { "\($0.date.prefix(7))|\($0.value)" },
                               list.arrayValue!.map { "\(str($0["month"]))|\(num($0["value"]))" }, "\(m) \(range)")
            }
        }
    }
}
