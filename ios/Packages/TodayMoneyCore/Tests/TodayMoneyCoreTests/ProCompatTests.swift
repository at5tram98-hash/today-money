import XCTest
@testable import TodayMoneyCore

/// Pro の計算が Web 版と同じか（ios/tools/pro-fixtures.js → Fixtures/pro-compat.json）
final class ProCompatTests: XCTestCase {
    static let fx: JSONValue = {
        let url = Bundle.module.url(forResource: "pro-compat", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONValue.parse(try! Data(contentsOf: url))
    }()
    var fx: JSONValue { Self.fx }
    var today: String { str(fx["today"]) }
    var doc: MoneyDocument { try! MoneyDocument(json: fx["document"]!) }
    func rows(_ v: JSONValue?) -> [[String]] { (v?.arrayValue ?? []).map { [str($0["key"]), JSONValue.formatNumber(num($0["value"])), JSONValue.formatNumber(num($0["prev"])), JSONValue.formatNumber(num($0["delta"]))] } }
    func mine(_ r: [AnalysisRow]) -> [[String]] { r.map { [$0.key, JSONValue.formatNumber($0.value), JSONValue.formatNumber($0.prev), JSONValue.formatNumber($0.delta)] } }

    func testAnalysis() {
        let d = doc
        for c in fx["dims"]!.arrayValue! {
            XCTAssertEqual(mine(d.expenseDimensionRows(month: str(c["month"]), dimension: str(c["dim"]), compare: str(c["mode"]), today: today)), rows(c["rows"]), "\(str(c["month"])) \(str(c["dim"])) \(str(c["mode"]))")
        }
        for c in fx["insight"]!.arrayValue! { XCTAssertEqual(d.expenseInsight(month: String(today.prefix(7)), compare: str(c["mode"]), today: today), str(c["text"])) }
        for c in fx["salary"]!.arrayValue! { XCTAssertEqual(mine(d.salaryAnalysisRows(month: str(c["month"]), today: today)), rows(c["rows"]), str(c["month"])) }
    }

    func testMonthReview() {
        let d = doc
        for c in fx["issues"]!.arrayValue! {
            let got = d.monthReviewIssues(str(c["month"]), today: today).map { [$0.type, $0.title, $0.sub] }
            let want = c["issues"]!.arrayValue!.map { [str($0["type"]), str($0["title"]), str($0["sub"])] }
            // 口座の確認日の表記（ロケールの日付）だけは比べない
            XCTAssertEqual(got.map { $0[0] == "bank" ? [$0[0], $0[1]] : $0 }, want.map { $0[0] == "bank" ? [$0[0], $0[1]] : $0 }, str(c["month"]))
        }
    }

    func testBankForecast() {
        let d = doc
        for c in fx["banks"]!.arrayValue! {
            let f = d.bankForecast(str(c["bankId"]), days: 60, today: today)!
            XCTAssertEqual([f.minBalance, f.endBalance], [num(c["min"]), num(c["end"])], str(c["bankId"]))
            XCTAssertEqual(f.minDate, str(c["minDate"]))
            let got = f.rows.filter { !$0.events.isEmpty }
            let want = c["rows"]!.arrayValue!
            XCTAssertEqual(got.map(\.date), want.map { str($0["date"]) }, str(c["bankId"]))
            for (g, w) in zip(got, want) {
                XCTAssertEqual([g.income, g.outflow, g.forecastBalance], [num(w["income"]), num(w["outflow"]), num(w["bal"])], g.date)
                XCTAssertEqual(g.events.map(\.label), w["labels"]!.arrayValue!.map { str($0) }, g.date)
            }
        }
    }

    func testRebalance() {
        let d = doc, m0 = String(today.prefix(7))
        for c in fx["rebalance"]!.arrayValue! {
            let p = d.rebalancePlan(month: m0, mode: str(c["mode"]), selected: c["selected"]!.arrayValue!.map { str($0) }, today: today)
            let want = Dictionary(uniqueKeysWithValues: c["plan"]!.objectValue!.map { (Int($0.key)!, num($0.value)) })
            XCTAssertEqual(p.plan, want, str(c["mode"]))
            XCTAssertEqual([p.remaining, p.past], [num(c["remaining"]), num(c["past"])])
            XCTAssertEqual(p.chosen, c["chosen"]!.arrayValue!.map { str($0) })
            XCTAssertEqual(p.locked.sorted(), c["locked"]!.arrayValue!.map { str($0) }.sorted())
        }
    }

    func testEventGoalsAndAllocation() {
        let d = doc
        for c in fx["goals"]!.arrayValue! {
            let g = d.eventGoals.first { $0.id == str(c["id"]) }!
            let s = d.eventGoalSummary(g, today: today), w = c["summary"]!
            XCTAssertEqual([s.total, s.ownShare, s.otherShare, s.paid, s.received, s.unrecovered, s.remaining, s.advance, s.weekly],
                           ["total", "ownShare", "otherShare", "paid", "received", "unrecovered", "remaining", "advance", "weekly"].map { num(w[$0]) }, g.id)
        }
        // iOS で同じ目標を保存し直すと、Web 版と同じ大型支出の計画になる
        var e = doc
        e.largeExpensePlans = e.largeExpensePlans.filter { str($0.raw["goalId"]).isEmpty }
        for g in e.eventGoals { e.syncEventGoalPlans(g.id) }
        let got = e.largeExpensePlans.filter { !str($0.raw["goalId"]).isEmpty }.map { [str($0.raw["goalItemId"]), $0.name, $0.date, JSONValue.formatNumber($0.amount), $0.status, $0.linkedBankId] }.sorted { $0[0] < $1[0] }
        let want = fx["goalPlans"]!.arrayValue!.map { [str($0["goalItemId"]), str($0["name"]), str($0["date"]), JSONValue.formatNumber(num($0["amount"])), str($0["status"]), str($0["linkedBankId"])] }
            .filter { $0[4] != "completed" }.sorted { $0[0] < $1[0] }
        XCTAssertEqual(got.filter { $0[4] != "completed" }, want)
        let r = d.salaryRecords.first { $0.id == "sal_paid" }!
        let a = d.salaryAllocationRecommendation(r, today: today), w = fx["allocation"]!
        XCTAssertEqual([a.buckets.payments, a.buckets.goals, a.buckets.reserve, a.buckets.living], [num(w["payments"]), num(w["goals"]), num(w["reserve"]), num(w["living"])])
        XCTAssertEqual([a.start, a.end, a.nextIncome], [str(w["start"]), str(w["end"]), str(w["nextIncome"])])
    }

    func testTransferAndRebalanceRoundTrip() throws {
        var d = doc
        let b0 = d.banks[0].id, b1 = d.banks[1].id, before = d.totalBankBalance
        try d.addTransferPlan(from: b0, to: b1, amount: 1000, date: today)
        let id = d.transferPlans.last!.id
        try d.executeTransferPlan(id, today: today)
        XCTAssertEqual(d.totalBankBalance, before, "振替は総残高を変えない")
        try d.undoTransferPlan(id, today: today)
        XCTAssertEqual(d.bank(b0)!.balance, doc.bank(b0)!.balance)
        let m0 = String(today.prefix(7))
        let beforeDaily = d["monthlyGoals"]?[m0]?["daily"]
        let hid = d.applyRebalance(month: m0, plan: d.rebalancePlan(month: m0, mode: "even", today: today).plan, today: today)
        try d.undoRebalance(hid)
        XCTAssertEqual(d["monthlyGoals"]?[m0]?["daily"]?.canonical, beforeDaily?.canonical)
    }
}
