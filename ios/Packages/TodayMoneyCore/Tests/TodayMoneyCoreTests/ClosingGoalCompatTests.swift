import XCTest
@testable import TodayMoneyCore

/// 日締めと目標計画が Web 版と同じか（ios/tools/closing-goal-fixtures.js → Fixtures/closing-goal-compat.json）
final class ClosingGoalCompatTests: XCTestCase {
    static let fx: JSONValue = {
        let url = Bundle.module.url(forResource: "closing-goal-compat", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONValue.parse(try! Data(contentsOf: url))
    }()
    var fx: JSONValue { Self.fx }
    var today: String { str(fx["today"]) }
    var doc: MoneyDocument { try! MoneyDocument(json: fx["document"]!) }

    func intMap(_ v: JSONValue?) -> [Int: Double] {
        Dictionary(uniqueKeysWithValues: (v?.objectValue ?? [:]).compactMap { k, x in Int(k).map { ($0, num(x)) } })
    }

    func testDayClosingSignaturesMatchWeb() {
        let d = doc
        XCTAssertEqual(d.dayClosingBankSignature, str(fx["bankSignature"]))
        for c in fx["closing"]!.arrayValue! {
            let date = str(c["date"])
            let items = d.dayClosingItems(date, today: today)
            for g in DayClosingGroup.allCases {
                let want = c["items"]![g.rawValue]!.arrayValue!
                XCTAssertEqual(items[g].map(\.key), want.map { str($0["key"]) }, "\(date) \(g) keys")
                XCTAssertEqual(items[g].map(\.fingerprint), want.map { str($0["fingerprint"]) }, "\(date) \(g) fingerprints")
                XCTAssertEqual(items[g].map(\.pending), want.map { $0["pending"]!.boolValue! }, "\(date) \(g) pending")
            }
            XCTAssertEqual(d.dayClosingSignature(date, today: today), str(c["signature"]), "\(date) signature")
            XCTAssertEqual(d.dayClosingApprovalSignature(date, today: today), str(c["approval"]), "\(date) approval")
            XCTAssertEqual(d.dayClosingStatus(date, today: today).rawValue, str(c["status"]), "\(date) status")
        }
    }

    func testWebApprovalStaysApprovedOnIOS() throws {
        // Web 版で承認した記録を入れると、iOS でも「承認済」になる
        var d = doc
        let y = Dates.addDays(today, -1)
        var all = d["dayClosings"]?.objectValue ?? [:]; all[y] = fx["closedRecord"]!; d["dayClosings"] = .object(all)
        XCTAssertEqual(d.dayClosingStatus(y, today: today), .closed)
        // iOS で承認しても、Web 版と同じ署名
        var e = doc
        var review = DayClosingReview(date: y)
        let items = e.dayClosingItems(y, today: today)
        for g in DayClosingGroup.allCases { if items[g].isEmpty { review.emptyGroups.insert(g) }; for x in items[g] { review.checks[x.key] = x.fingerprint } }
        let late = ISO8601DateFormatter().date(from: "\(today)T23:00:00+09:00")!
        try e.recordDayClosing(y, review: review, now: late, today: today)
        XCTAssertEqual(str(e["dayClosings"]?[y]?["signature"]), str(fx["closedRecord"]!["signature"]))
        XCTAssertEqual(str(e["dayClosings"]?[y]?["bankSignature"]), str(fx["closedRecord"]!["bankSignature"]))
        XCTAssertEqual(e.dayClosingStatus(y, today: today), .closed)
        try e.cancelDayClosing(y, reason: DayClosing.cancelReasons[0], now: late, today: today)
        XCTAssertEqual(e.dayClosingStatus(y, today: today), .cancelled)
        // 確認待ちのメールがある日は、すべてチェックしても承認できない（Web 版と同じ）
        var h = doc; let d2 = Dates.addDays(today, -2); var r2 = DayClosingReview(date: d2)
        let i2 = h.dayClosingItems(d2, today: today)
        XCTAssertTrue(i2.mail.contains { $0.pending })
        for g in DayClosingGroup.allCases { if i2[g].isEmpty { r2.emptyGroups.insert(g) }; for x in i2[g] { r2.checks[x.key] = x.fingerprint } }
        XCTAssertThrowsError(try h.recordDayClosing(d2, review: r2, now: late, today: today))
        // 18:00 前は承認できない
        var f = doc
        let early = ISO8601DateFormatter().date(from: "\(today)T10:00:00+09:00")!
        XCTAssertThrowsError(try f.recordDayClosing(today, review: DayClosingReview(date: today), now: early, today: today))
    }

    func testGoalPlannerMatchesWeb() throws {
        let d = doc, g = fx["goal"]!, m0 = String(today.prefix(7)), next = Dates.addMonths(m0, 1)
        for (key, type, k) in [("recDaily", GoalPlan.Kind.daily, today), ("recMonthly", .monthly, m0), ("recNext", .monthly, next)] {
            let r = d.goalRecommendation(type, k), w = g[key]!
            XCTAssertEqual([r.base, r.low, r.high, r.current], [num(w["base"]), num(w["low"]), num(w["high"]), num(w["current"])], key)
            XCTAssertEqual(r.dataCount, Int(num(w["dataCount"])), key)
            XCTAssertEqual(r.categories, (w["categories"]!.objectValue!).mapValues { num($0) }, "\(key) categories")
        }
        XCTAssertEqual(d.buildMonthlyDailyPlan(m0, total: 60000, existing: [1: 2000], today: today), intMap(g["plan0"]!["plan"]), "plan0")
        XCTAssertEqual(d.buildMonthlyDailyPlan(next, total: 45000, existing: [:], today: today), intMap(g["planNext"]!["plan"]), "planNext")
        var p = d.createGoalPlan(.monthly, m0, today: today)
        XCTAssertEqual(p.total, num(g["created"]!["total"]))
        XCTAssertEqual(p.categories, g["created"]!["categories"]!.objectValue!.mapValues { num($0) })
        XCTAssertEqual(p.dailyPlan, intMap(g["created"]!["dailyPlan"]), "created dailyPlan")
        XCTAssertEqual(p.dailyLocks.sorted(), g["created"]!["locks"]!.arrayValue!.map { str($0) }.sorted())
        p.total = 72000; p.dailyPlanNeedsRebuild = true
        d.goalEnsureDaily(&p, today: today)
        XCTAssertEqual(p.dailyPlan, intMap(g["rebuilt"]), "rebuilt")
        XCTAssertEqual(d.goalTarget(p, today: today), num(g["target"]))
        XCTAssertEqual(d.goalRebalance(p, date: str(g["rebalanceDate"]), value: 5000, today: today), intMap(g["rebalance"]), "rebalance")
        let pn = d.createGoalPlan(.monthly, next, today: today)
        XCTAssertEqual(pn.total, num(g["createdNext"]!["total"])); XCTAssertEqual(pn.dailyPlan, intMap(g["createdNext"]!["dailyPlan"]), "createdNext")
        let pd = d.createGoalPlan(.daily, today, today: today)
        XCTAssertEqual(pd.total, num(g["createdDaily"]!["total"])); XCTAssertEqual(pd.categories, g["createdDaily"]!["categories"]!.objectValue!.mapValues { num($0) })
        var e = d
        try e.commitGoalPlan(p, today: today)
        let wm = g["committed"]!["monthlyGoals"]!
        XCTAssertEqual(num(e["monthlyGoals"]?[m0]?["total"]), num(wm["total"]))
        XCTAssertEqual(intMap(e["monthlyGoals"]?[m0]?["daily"]), intMap(wm["daily"]), "committed daily")
        let wd = g["committed"]!["dailyGoals"]!.objectValue!
        let gd = e["dailyGoals"]!.objectValue!
        XCTAssertEqual(Set(gd.keys), Set(wd.keys), "dailyGoals keys")
        for (k, v) in wd { XCTAssertEqual(num(gd[k]?["total"]), num(v["total"]), k); XCTAssertEqual(str(gd[k]?["origin"]), str(v["origin"]), "\(k) origin") }
    }
}
