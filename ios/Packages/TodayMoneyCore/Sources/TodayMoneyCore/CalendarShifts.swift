import Foundation

// iPhone のカレンダーからシフトを取り込む。
// Web 版は「シフトボード → iPhone のカレンダー → ショートカット → 受け渡しサーバー → applyShiftsAuto」
// または「Google カレンダー → fetchCalendarShifts」で取り込んでいる。iOS 版はカレンダー（EventKit）を直接読み、
// Web 版と同じ applyShiftsAuto の規則（ShiftSync.apply）で給与の予定を作る。

/// カレンダーの予定1件（EventKit から読んだもの。テストでも作れるよう素の値だけ持つ）
public struct CalendarEvent: Equatable, Sendable {
    public var title: String
    public var start: Date
    public var end: Date
    public var isAllDay: Bool
    public var calendarId: String
    public init(title: String, start: Date, end: Date, isAllDay: Bool = false, calendarId: String = "") {
        self.title = title; self.start = start; self.end = end; self.isAllDay = isAllDay; self.calendarId = calendarId
    }
}

/// 取り込みの設定（data.shiftSettings.iosCalendar。Web 版の Google カレンダーの設定 shiftSettings.calendar とは別に持つ）
public struct CalendarShiftSettings: Equatable, Sendable {
    public var enabled = false
    /// 読むカレンダー（空ならすべて）
    public var calendarIds: [String] = []
    public var calendarNames: [String] = []
    /// 予定名にこの語を含むものだけ（空ならすべて。勤務先に当てはまらない予定は取り込まない）
    public var keyword = ""
    public var lastSyncAt = ""
    public var lastDay = ""
    public var lastCount = 0
    public var lastTotal = 0.0
    public var lastError = ""
    public var lastUnmatched: [String] = []
    public init() {}

    init(json: JSONValue?) {
        guard let o = json?.objectValue else { return }
        enabled = o["enabled"]?.boolValue ?? false
        calendarIds = (o["calendarIds"]?.arrayValue ?? []).compactMap(\.stringValue)
        calendarNames = (o["calendarNames"]?.arrayValue ?? []).compactMap(\.stringValue)
        keyword = str(o["keyword"]); lastSyncAt = str(o["lastSyncAt"]); lastDay = str(o["lastDay"])
        lastCount = Int(num(o["lastCount"])); lastTotal = num(o["lastTotal"]); lastError = str(o["lastError"])
        lastUnmatched = (o["lastUnmatched"]?.arrayValue ?? []).compactMap(\.stringValue)
    }
    var json: JSONValue {
        .object(["enabled": .bool(enabled), "calendarIds": .array(calendarIds.map { .string($0) }), "calendarNames": .array(calendarNames.map { .string($0) }),
                 "keyword": .string(keyword), "lastSyncAt": .string(lastSyncAt), "lastDay": .string(lastDay), "lastCount": .number(Double(lastCount)),
                 "lastTotal": .number(lastTotal), "lastError": .string(lastError), "lastUnmatched": .array(lastUnmatched.map { .string($0) })])
    }
}

public enum CalendarShifts {
    /// 読む期間：今日から来月末まで（Web 版 fetchCalendarShifts と同じ）
    public static func range(today: String) -> (start: Date, end: Date) {
        let start = Dates.date(today)
        let end = Dates.date(Dates.addMonths(String(today.prefix(7)), 2) + "-01")
        return (start, end)
    }

    /// 予定 → シフト（終日の予定は除く。キーワードがあれば予定名に含むものだけ。開始時刻の順）
    public static func shifts(from events: [CalendarEvent], keyword: String = "", today: String) -> [Shift] {
        let (from, to) = range(today: today)
        let kw = keyword.trimmingCharacters(in: .whitespaces)
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = Dates.calendar.timeZone; f.dateFormat = "HH:mm"
        return events
            .filter { !$0.isAllDay && $0.end > $0.start && $0.start >= from && $0.start < to && (kw.isEmpty || $0.title.contains(kw)) }
            .sorted { $0.start < $1.start }
            .map { e in
                var end = f.string(from: e.end)
                // 日をまたいで24時ちょうどに終わる予定は 24:00（Web 版の読み取りと同じ表記）
                if end == "00:00" && Dates.ymd(e.end) != Dates.ymd(e.start) { end = "24:00" }
                return Shift(date: Dates.ymd(e.start), start: f.string(from: e.start), end: end, title: e.title.trimmingCharacters(in: .whitespaces))
            }
    }
}

public extension MoneyDocument {
    var calendarShiftSettings: CalendarShiftSettings {
        get { CalendarShiftSettings(json: root["shiftSettings"]?["iosCalendar"]) }
        set {
            var s = root["shiftSettings"]?.objectValue ?? [:]
            s["iosCalendar"] = newValue.json
            self["shiftSettings"] = .object(s)
        }
    }

    /// カレンダーの予定から給与の予定を作り直す（Web 版 applyShiftsAuto：勤務先に当てはまる予定だけ・手入力7日間・入金済みは変えない）
    @discardableResult
    mutating func syncCalendarShifts(_ events: [CalendarEvent], now: Date = Date(), today: String) -> ShiftSync.Result {
        var cs = calendarShiftSettings
        let shifts = CalendarShifts.shifts(from: events, keyword: cs.keyword, today: today)
        var result = ShiftSync.Result(count: 0, total: 0, states: [], unmatched: [])
        if !shifts.isEmpty { result = ShiftSync.apply(shifts, to: &self, replace: true, replaceFrom: today, now: now) }
        cs = calendarShiftSettings
        cs.lastSyncAt = ISODate.now(now); cs.lastDay = today; cs.lastCount = result.count; cs.lastTotal = result.total
        cs.lastError = ""; cs.lastUnmatched = result.unmatched
        calendarShiftSettings = cs
        return result
    }
}
