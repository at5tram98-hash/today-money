import EventKit
import Foundation
import TodayMoneyCore

/// iPhone のカレンダー（EventKit）を読む。読み取りだけで、カレンダーを変更しない
@MainActor
enum CalendarShiftService {
    static let store = EKEventStore()

    static var status: EKAuthorizationStatus { EKEventStore.authorizationStatus(for: .event) }
    static var canRead: Bool { status == .fullAccess }

    /// 読み取りの許可を求める（はじめての時だけ OS の確認が出る）
    static func requestAccess() async -> Bool {
        if canRead { return true }
        return (try? await store.requestFullAccessToEvents()) ?? false
    }

    struct CalendarInfo: Identifiable, Hashable { var id: String; var title: String; var source: String; var color: CGColor? }

    static func calendars() -> [CalendarInfo] {
        store.calendars(for: .event).sorted { ($0.source.title, $0.title) < ($1.source.title, $1.title) }
            .map { CalendarInfo(id: $0.calendarIdentifier, title: $0.title, source: $0.source.title, color: $0.cgColor) }
    }

    /// 今日から来月末までの予定（Web 版 fetchCalendarShifts と同じ期間）
    static func events(calendarIds: [String], today: String) -> [CalendarEvent] {
        let (start, end) = CalendarShifts.range(today: today)
        let all = store.calendars(for: .event)
        let cals = calendarIds.isEmpty ? all : all.filter { calendarIds.contains($0.calendarIdentifier) }
        guard !cals.isEmpty else { return [] }
        let pred = store.predicateForEvents(withStart: start, end: end, calendars: cals)
        return store.events(matching: pred).map {
            CalendarEvent(title: $0.title ?? "", start: $0.startDate, end: $0.endDate, isAllDay: $0.isAllDay, calendarId: $0.calendar.calendarIdentifier)
        }
    }
}

extension AppModel {
    /// カレンダーからシフトを取り込む。auto（起動時・画面に戻った時）は1日1回だけ、許可がなければ何もしない
    @discardableResult
    func syncCalendarShifts(auto: Bool) async -> ShiftSync.Result? {
        let cs = doc.calendarShiftSettings
        if auto && (!cs.enabled || cs.lastDay == today || !CalendarShiftService.canRead) { return nil }
        let granted = auto ? true : await CalendarShiftService.requestAccess()
        if !granted {
            change("シフトの取り込み（許可なし）") { d, _, _ in var s = d.calendarShiftSettings; s.lastError = "カレンダーを読む許可がありません。設定アプリ › アプリ › My Money › カレンダー で「フルアクセス」にしてください。"; d.calendarShiftSettings = s }
            return nil
        }
        let events = CalendarShiftService.events(calendarIds: cs.calendarIds, today: today)
        var result: ShiftSync.Result?
        change("カレンダーからシフトを取り込み") { d, now, today in result = d.syncCalendarShifts(events, now: now, today: today) }
        if let r = result {
            if r.count > 0 { toast = "カレンダーのシフト\(r.count)件から給料の見込みを更新しました（\(r.total.yen)）" }
            else if !auto { toast = "来月までのシフトは見つかりませんでした" }
        }
        return result
    }
}

#if DEBUG
extension CalendarShiftService {
    /// シミュレーターでの確認用（起動引数 -seedCalendarShifts）：「テストシフト」カレンダーに予定を作る。Release には入らない
    static func seedForTesting(today: String) {
        guard ProcessInfo.processInfo.arguments.contains("-seedCalendarShifts"), canRead else { return }
        let name = "テストシフト"
        let cal = store.calendars(for: .event).first { $0.title == name } ?? {
            let c = EKCalendar(for: .event, eventStore: store)
            c.title = name
            c.source = store.defaultCalendarForNewEvents?.source ?? store.sources.first { $0.sourceType == .local } ?? store.sources.first
            try? store.saveCalendar(c, commit: true)
            return c
        }()
        let (s, e) = CalendarShifts.range(today: today)
        for ev in store.events(matching: store.predicateForEvents(withStart: s, end: e, calendars: [cal])) { try? store.remove(ev, span: .thisEvent, commit: false) }
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = Dates.calendar.timeZone; f.dateFormat = "yyyy-MM-dd HH:mm"
        let items: [(Int, String, String, String)] = [(1, "10:00", "18:00", "GU"), (2, "17:00", "22:00", "無印良品"), (4, "10:00", "15:00", "GU"),
                                                       (6, "18:00", "23:30", "GU"), (9, "09:00", "17:00", "無印良品"), (12, "10:00", "18:00", "GU"),
                                                       (20, "10:00", "18:00", "GU"), (3, "09:00", "10:00", "歯医者")]
        for (d, a, b, t) in items {
            let day = Dates.addDays(today, d)
            let ev = EKEvent(eventStore: store)
            ev.calendar = cal; ev.title = t
            ev.startDate = f.date(from: "\(day) \(a)"); ev.endDate = f.date(from: "\(day) \(b)")
            try? store.save(ev, span: .thisEvent, commit: false)
        }
        try? store.commit()
    }
}
#endif
