import XCTest
@testable import TodayMoneyCore

/// カレンダーの予定 → シフト → 給与の予定
final class CalendarShiftsTests: XCTestCase {
    func at(_ ymd: String, _ hm: String) -> Date {
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = Dates.calendar.timeZone; f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: "\(ymd) \(hm)")!
    }
    var webDoc: MoneyDocument {
        let url = Bundle.module.url(forResource: "web-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try! JSONValue.parse(try! Data(contentsOf: url))
        return try! MoneyDocument(json: fx["document"]!)
    }

    func testEventsToShifts() {
        let today = "2026-11-14"
        let events = [
            CalendarEvent(title: " GU ", start: at("2026-11-15", "10:00"), end: at("2026-11-15", "18:00")),
            CalendarEvent(title: "無印良品", start: at("2026-11-16", "18:00"), end: at("2026-11-17", "00:00")),
            CalendarEvent(title: "GU", start: at("2026-11-20", "22:00"), end: at("2026-11-21", "05:00")),
            CalendarEvent(title: "休み", start: at("2026-11-18", "00:00"), end: at("2026-11-19", "00:00"), isAllDay: true),
            CalendarEvent(title: "GU", start: at("2026-11-13", "10:00"), end: at("2026-11-13", "12:00")),   // 昨日以前は読まない
            CalendarEvent(title: "GU", start: at("2027-01-01", "10:00"), end: at("2027-01-01", "12:00")),   // 再来月は読まない
            CalendarEvent(title: "GU", start: at("2026-12-31", "10:00"), end: at("2026-12-31", "12:00")),
        ]
        let got = CalendarShifts.shifts(from: events, today: today)
        XCTAssertEqual(got, [
            Shift(date: "2026-11-15", start: "10:00", end: "18:00", title: "GU"),
            Shift(date: "2026-11-16", start: "18:00", end: "24:00", title: "無印良品"),
            Shift(date: "2026-11-20", start: "22:00", end: "05:00", title: "GU"),
            Shift(date: "2026-12-31", start: "10:00", end: "12:00", title: "GU"),
        ])
        XCTAssertEqual(CalendarShifts.shifts(from: events, keyword: "無印", today: today).map(\.title), ["無印良品"])
    }

    func testSyncMatchesPasteImportRules() {
        let today = "2026-11-14", now = at(today, "09:00")
        let events = [
            CalendarEvent(title: "GU", start: at("2026-11-15", "10:00"), end: at("2026-11-15", "18:00")),
            CalendarEvent(title: "無印良品 新宿", start: at("2026-11-16", "17:00"), end: at("2026-11-16", "22:00")),
            CalendarEvent(title: "歯医者", start: at("2026-11-17", "09:00"), end: at("2026-11-17", "10:00")),
        ]
        var a = webDoc
        a["shiftSettings"] = (a["shiftSettings"] ?? .object([:])).merging(.object(["calendar": .object(["calendarId": .string("google-id")])]))
        let r = a.syncCalendarShifts(events, now: now, today: today)
        // Web 版の規則と同じ結果（ShiftSync.apply は Web 版の applyShiftsAuto と照合済み）
        var b = webDoc
        let rb = ShiftSync.apply(CalendarShifts.shifts(from: events, today: today), to: &b, now: now)
        XCTAssertEqual(r.count, rb.count); XCTAssertEqual(r.total, rb.total)
        XCTAssertEqual(a.salaryRecords.map { [$0.employerId, $0.month, $0.date, String($0.gross)] }, b.salaryRecords.map { [$0.employerId, $0.month, $0.date, String($0.gross)] })
        XCTAssertEqual(r.count, 2, "勤務先に当てはまらない予定（歯医者）は取り込まない")
        XCTAssertEqual(r.unmatched, ["歯医者"])
        XCTAssertTrue(a.shiftPlans.allSatisfy { $0.source == "calendar" })
        // 設定：Web 版の Google カレンダーの設定は残る。取り込みの記録が残る
        XCTAssertEqual(str(a["shiftSettings"]?["calendar"]?["calendarId"]), "google-id")
        XCTAssertEqual(a.calendarShiftSettings.lastDay, today)
        XCTAssertEqual(a.calendarShiftSettings.lastCount, 2)
        XCTAssertEqual(a.calendarShiftSettings.lastUnmatched, ["歯医者"])

        // シフトが消えたら、その月のシフトから作った給与予定も消える（Web 版と同じ）
        let gu = a.employers.first { $0.name == "GU" }!.id
        XCTAssertTrue(a.salaryRecords.contains { $0.employerId == gu && $0.source == "shift" && $0.month == "2026-11" })
        a.syncCalendarShifts([events[1]], now: now.addingTimeInterval(60), today: today)
        XCTAssertFalse(a.salaryRecords.contains { $0.employerId == gu && $0.source == "shift" && $0.month == "2026-11" })
    }

    func testNoEventsKeepsData() {
        var a = webDoc
        let before = a.salaryRecords
        let r = a.syncCalendarShifts([], today: "2026-11-14")
        XCTAssertEqual(r.count, 0)
        XCTAssertEqual(a.salaryRecords, before)
        XCTAssertEqual(a.calendarShiftSettings.lastDay, "2026-11-14")
    }
}
