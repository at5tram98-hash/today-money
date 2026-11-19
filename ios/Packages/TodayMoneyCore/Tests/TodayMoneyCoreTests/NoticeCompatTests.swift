import XCTest
@testable import TodayMoneyCore

/// アプリ内のお知らせが Web 版と同じか（ios/tools/notice-fixtures.js → Fixtures/notice-compat.json）
final class NoticeCompatTests: XCTestCase {
    func testSystemNotices() throws {
        let url = Bundle.module.url(forResource: "notice-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        var d = try MoneyDocument(json: fx["document"]!)
        let today = str(fx["today"]), yesterday = str(fx["yesterday"])
        d.generateSystemNotices(today: today)
        d.checkGoalNotice(yesterday, today: today)
        let got = (d["notices"]?.arrayValue ?? []).map { "\(str($0["title"]))|\(str($0["message"]))|\(str($0["type"]))|\(str($0["key"]))" }
        let want = fx["notices"]!.arrayValue!.map { "\(str($0["title"]))|\(str($0["message"]))|\(str($0["type"]))|\(str($0["key"]))" }
        XCTAssertEqual(got, want)
        // 同じ日にもう一度作っても増えない
        d.generateSystemNotices(today: today); d.checkGoalNotice(yesterday, today: today)
        XCTAssertEqual(d["notices"]?.arrayValue?.count, want.count)
        // 翌日になると昨日のお知らせは消える
        d.pruneExpiredSystemNotices(today: Dates.addDays(today, 1))
        XCTAssertEqual(d["notices"]?.arrayValue?.count, 0)
        // 日本時間の朝（UTC では前日）でも今日として扱う
        XCTAssertEqual(MoneyDocument.noticeDay("2026-11-18T23:30:00.000Z"), "2026-11-19")
        XCTAssertEqual(MoneyDocument.noticeDay("2026-11-19"), "2026-11-19")
    }
}
