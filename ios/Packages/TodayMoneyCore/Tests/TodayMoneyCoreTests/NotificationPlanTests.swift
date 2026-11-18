import XCTest
@testable import TodayMoneyCore

/// 端末で予約する通知（Web 版 worker/index.js の文面・休止時間と同じ規則）
final class NotificationPlanTests: XCTestCase {
    func doc() throws -> (MoneyDocument, String, Date) {
        let url = Bundle.module.url(forResource: "report-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        return (try MoneyDocument(json: fx["document"]!), str(fx["today"]), Date(timeIntervalSince1970: num(fx["now"]) / 1000))
    }

    func testPlan() throws {
        var (d, today, now) = try doc()
        var p = PushPreferences(); p.spending = true; p.showAmount = true
        d["pushPreferences"] = p.json
        let plan = d.notificationPlan(today: today, nowTime: "10:00", now: now)
        XCTAssertFalse(plan.isEmpty)
        XCTAssertTrue(plan.allSatisfy { $0.time >= "07:00" && $0.time < "23:00" }, "23:00〜7:00 は通知しない")
        XCTAssertTrue(plan.allSatisfy { $0.date > today || $0.time > "10:00" }, "過ぎた時刻は予約しない")
        XCTAssertEqual(Set(plan.map(\.id)).count, plan.count, "同じ通知を二重に予約しない")
        XCTAssertLessThanOrEqual(plan.count, 60)
        // 日締め：今日から7日間の 21:00
        let close = plan.filter { $0.id.hasPrefix("close:") }
        XCTAssertEqual(close.count, 7)
        XCTAssertEqual(close.first?.date, today)
        XCTAssertEqual(close.first?.body, "日締めがまだです。登録した支出と入力漏れを確認しましょう。")
        // 登録支出：12:00 と 18:00、金額を表示する設定
        let spend = plan.filter { $0.id.hasPrefix("spend:") }
        XCTAssertEqual(spend.map(\.time), ["12:00", "18:00"])
        XCTAssertTrue(spend[0].body.hasPrefix(Format.yen(d.spentDay(today))))
        // ACF の警告は次の 9:00（今は 10:00 なので明日）
        for a in plan where a.id.hasPrefix("atf:") { XCTAssertEqual(a.date, Dates.addDays(today, 1)); XCTAssertEqual(a.time, "09:00"); XCTAssertEqual(a.target, "acf") }

        // 金額を出さない設定では、支出の金額を本文に入れない
        p.showAmount = false; d["pushPreferences"] = p.json
        let hidden = d.notificationPlan(today: today, nowTime: "10:00", now: now)
        XCTAssertFalse(hidden.contains { $0.body.contains("¥") })

        // 夜遅くの時刻・オフ・iPhone だけの通知を切る
        p.closeTime = "23:30"; p.spending = false; d["pushPreferences"] = p.json
        let late = d.notificationPlan(today: today, nowTime: "10:00", payments: false, salary: false, now: now)
        XCTAssertFalse(late.contains { $0.id.hasPrefix("close:") || $0.id.hasPrefix("spend:") || $0.id.hasPrefix("pay:") || $0.id.hasPrefix("salary:") })

        // 古い形・壊れた値は既定に戻す
        XCTAssertEqual(PushPreferences(.object(["closeTime": .string("9pm"), "spendTimes": .array([.string("x")])])).closeTime, "21:00")
        XCTAssertEqual(PushPreferences(nil), PushPreferences())
    }

    func testMailPending() throws {
        var (d, today, now) = try doc()
        let m = try MoneyDocument(json: MailCompatTests.fx["runs"]!.arrayValue![0]["document"]!)
        var withMail = m
        _ = withMail.applySyncedMessages(MailCompatTests.fx["messages"]!.arrayValue!)
        d["mailImports"] = withMail["mailImports"]
        let n = d.pendingMailIds.count
        XCTAssertGreaterThan(n, 0)
        let mail = d.notificationPlan(today: today, nowTime: "08:00", now: now).filter { $0.id.hasPrefix("mail:") }
        XCTAssertEqual(mail.map(\.date), [today], "まだ 9:00 前なら今日の 9:00")
        XCTAssertEqual(mail.first?.body, "未確認が\(n)件あります。取込結果を確認してください。")
    }
}
