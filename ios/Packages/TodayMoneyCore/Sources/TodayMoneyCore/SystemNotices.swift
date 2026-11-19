import Foundation

/// アプリ内のお知らせ（Web 版 generateSystemNotices・checkGoalNotice・pruneExpiredSystemNotices）
public extension MoneyDocument {
    /// アプリ内のお知らせの設定（Web 版 notificationSettings）
    struct NoticeSettings: Equatable, Sendable {
        public var level: String   // recommended / many / minimal
        public var goal, salary, payment, unknown, balance: Bool
    }
    var noticeSettings: NoticeSettings {
        get {
            let n = root["notificationSettings"]
            func b(_ k: String) -> Bool { n?[k]?.boolValue ?? true }
            let level = str(n?["level"])
            return NoticeSettings(level: level.isEmpty ? "recommended" : level, goal: b("goal"), salary: b("salary"), payment: b("payment"), unknown: b("unknown"), balance: b("balance"))
        }
        set {
            var o = root["notificationSettings"]?.objectValue ?? [:]
            o["level"] = .string(newValue.level)
            o["goal"] = .bool(newValue.goal); o["salary"] = .bool(newValue.salary); o["payment"] = .bool(newValue.payment)
            o["unknown"] = .bool(newValue.unknown); o["balance"] = .bool(newValue.balance)
            self["notificationSettings"] = .object(o)
        }
    }

    /// 昨日以前の「システム」のお知らせを消す（Web 版 retainedSystemNotices。日付の分からないものは残す）
    mutating func pruneExpiredSystemNotices(today: String) {
        guard let list = root["notices"]?.arrayValue else { return }
        let kept = list.filter { n in
            let src = str(n["source"])
            if !src.isEmpty && src != "system" { return true }
            var day = Self.noticeDay(str(n["date"]))
            if !Dates.isYMD(day) { day = Self.noticeDay(str(n["createdAt"])) }
            if !Dates.isYMD(day), let m = str(n["key"]).range(of: #"\|(\d{4}-\d{2}-\d{2})$"#, options: .regularExpression) { day = String(str(n["key"])[m].dropFirst()) }
            return !Dates.isYMD(day) || day >= today
        }
        if kept.count != list.count { self["notices"] = .array(kept) }
    }

    /// お知らせの日（Web 版 systemNoticeDay：時刻つきなら日本時間の日付）
    static func noticeDay(_ v: String) -> String {
        if Dates.isYMD(v) { return v }
        guard v.count > 10, let ms = ISODate.ms(v) else { return "" }
        var cal = Calendar(identifier: .gregorian); cal.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let c = cal.dateComponents([.year, .month, .day], from: Date(timeIntervalSince1970: ms / 1000))
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    /// 毎日のお知らせを作る（Web 版 generateSystemNotices）。acfRisk は ACF の予測の一番重い警告（計算は呼び出し側）
    mutating func generateSystemNotices(today: String, now: Date = Date(), acfRisk: AcfRisk? = nil) {
        let s = noticeSettings
        let tomorrow = Dates.addDays(today, 1), tomMonth = String(tomorrow.prefix(7))
        if s.salary {
            for e in employers where Payroll.payDate(e, workMonth: Dates.addMonths(tomMonth, -e.payMonthOffset)) == tomorrow {
                addNotice(title: "明日は給料日です", body: "\(e.name)の給料日が明日に設定されています。", now: now, today: today)
            }
        }
        if s.payment {
            let day = Dates.parts(tomorrow).d
            for c in cards where c.dueDay == day {
                addNotice(title: "明日はカード支払日です", body: "\(c.name)の支払日です。", now: now, today: today)
            }
            for f in fixedPayments where fixedDue(f, on: tomorrow) {
                addNotice(title: "明日は固定支払い日です", body: "\(f.name) \(Format.yen(f.amount))の支払い予定です。", now: now, today: today)
            }
        }
        if s.unknown {
            let pending = mailImports.filter { str($0["status"]) == "pending" }.count
            if pending > 0 { addNotice(title: "カテゴリー不明の取引", body: "\(pending)件の取引に確認が必要です。", kind: "warning", now: now, today: today) }
        }
        if acfStoredSettings.initialized && acfStoredSettings.riskNotifications, let r = acfRisk {
            addNotice(title: "ACF 安全ライン予測", body: r.title + (r.detail.isEmpty ? "" : "・" + r.detail), kind: "warning", now: now, today: today)
        }
        if s.level == "recommended" {
            for st in cardPaymentStatements(inMonth: String(today.prefix(7)), includePaid: false) where st.paymentDate == today && st.status != .paid {
                addNotice(title: "カード引落日です", body: "\(st.cardName) \(Format.yen(st.amount))の引落予定です。", kind: "warning", now: now, today: today)
            }
        }
    }

    /// 目標に届いた・超えた（Web 版 checkGoalNotice）
    mutating func checkGoalNotice(_ date: String, now: Date = Date(), today: String) {
        let g = dailyGoal(date), sp = spentDay(date)
        if g > 0 {
            if sp == g { addNotice(title: "当日目標に到達しました", body: "\(Format.dayLabel(date))の支出が目標金額 \(Format.yen(g)) に到達しました。", now: now, today: today) }
            else if sp > g { addNotice(title: "当日目標を超過しました", body: "\(Format.dayLabel(date))の支出が目標を\(Format.yen(sp - g))超えています。", kind: "warning", now: now, today: today) }
        }
        let month = String(date.prefix(7)), mg = monthlyGoalTotal(month), ms = spentMonth(month)
        if mg > 0 {
            if ms == mg { addNotice(title: "月間目標に到達しました", body: "\(Format.monthLabel(month))の支出が月間目標 \(Format.yen(mg)) に到達しました。", now: now, today: today) }
            else if ms > mg { addNotice(title: "月間目標を超過しました", body: "\(Format.monthLabel(month))の支出が月間目標を\(Format.yen(ms - mg))超えています。", kind: "warning", now: now, today: today) }
        }
    }
}
