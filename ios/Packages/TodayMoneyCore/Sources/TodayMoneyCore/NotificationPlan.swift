import Foundation

/// 通知の設定（Web 版 pushPreferences。Web 版と同じ場所に保存するので、どちらで変えても同じ）
public struct PushPreferences: Equatable, Sendable {
    public var dayClose = true, closeTime = "21:00", atf = true, mail = true, spending = false
    public var spendTimes = ["12:00", "18:00"], showAmount = false

    public init() {}
    public init(_ v: JSONValue?) {
        dayClose = v?["dayClose"]?.boolValue != false
        let t = v?["closeTime"]?.stringValue ?? ""
        closeTime = t.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil ? t : "21:00"
        atf = v?["atf"]?.boolValue != false
        mail = v?["mail"]?.boolValue != false
        spending = v?["spending"]?.boolValue == true
        let times = (v?["spendTimes"]?.arrayValue ?? []).compactMap(\.stringValue).filter { $0.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression) != nil }
        if !times.isEmpty { spendTimes = times }
        showAmount = v?["showAmount"]?.boolValue == true
    }
    public var json: JSONValue {
        .object(["dayClose": .bool(dayClose), "closeTime": .string(closeTime), "atf": .bool(atf), "mail": .bool(mail),
                 "spending": .bool(spending), "spendTimes": .array(spendTimes.map { .string($0) }), "showAmount": .bool(showAmount)])
    }
}

/// 端末で予約する通知1件
public struct PlannedNotice: Equatable, Sendable {
    public var id: String
    public var date: String      // YYYY-MM-DD
    public var time: String      // HH:mm
    public var title: String
    public var body: String
    /// 開く画面（mymoney://<target>）
    public var target: String
}

public extension MoneyDocument {
    var pushPreferences: PushPreferences { PushPreferences(self["pushPreferences"]) }

    /// これから予約する通知（Web 版の通知サーバー worker/index.js と同じ文面・同じ休止時間 23:00〜7:00）。
    /// iOS は端末の中で予約するので、その時刻に使う数字は「今のデータで計算した見込み」になる。
    /// payments / salary は iOS だけの通知（引落・固定支払いの前日 19:00、給料日 9:00）。
    func notificationPlan(today: String, nowTime: String, payments: Bool = true, salary: Bool = true, now: Date = Date()) -> [PlannedNotice] {
        let p = pushPreferences
        var out: [PlannedNotice] = []
        func add(_ id: String, _ date: String, _ time: String, _ title: String, _ body: String, _ target: String) {
            guard time >= "07:00", time < "23:00", date > today || (date == today && time > nowTime) else { return }
            out.append(PlannedNotice(id: id, date: date, time: time, title: title, body: body, target: target))
        }
        // 次の 9:00（今日がもう過ぎていれば明日）
        let morning = nowTime < "09:00" ? today : Dates.addDays(today, 1)

        if p.dayClose {
            for i in 0..<7 {
                let day = Dates.addDays(today, i)
                let st = dayClosingStatus(day, today: today)
                if st == .closed { continue }
                add("close:\(day)", day, p.closeTime, "一日の支出を確認しましょう",
                    st == .changed ? "締めた後に登録内容が変わりました。もう一度確認できます。" : "日締めがまだです。登録した支出と入力漏れを確認しましょう。", "day-close")
            }
        }
        if p.atf, acfSettings.riskNotifications, acfSettings.initialized {
            let risks = acfForecast(today: today, lightweight: true, now: now).risks
                .filter { ($0.severity == "critical" || $0.severity == "warning") && !$0.date.isEmpty && $0.date >= morning }
                .sorted { $0.date != $1.date ? $0.date < $1.date : ($0.severity == "critical") && ($1.severity != "critical") }
            if let r = risks.first {
                add("atf:\(r.date)", morning, "09:00", "ACFの資金見通しを確認",
                    p.showAmount ? "\(r.title)。\(r.detail)" : "\(r.title)。今のデータでの見込みです。", "acf")
            }
        }
        if p.mail {
            let n = pendingMailIds.count
            if n > 0 { add("mail:\(morning)", morning, "09:00", "メール取込の承認待ち", "未確認が\(n)件あります。取込結果を確認してください。", "mail") }
        }
        if p.spending {
            let spent = spentDay(today)
            for t in p.spendTimes {
                add("spend:\(today):\(t)", today, t, "今日の登録支出",
                    p.showAmount ? "\(Format.yen(spent))（\(nowTime)時点）。登録漏れがないか確認しましょう。" : "今日の登録内容を確認しましょう。金額はアプリ内で確認できます。", "home")
            }
        }
        for e in financialEvents(from: today, days: 30, today: today) {
            if e.type == .income {
                guard salary else { continue }
                add("salary:\(e.id)", e.date, "09:00", "今日は給料日です", p.showAmount ? "\(e.title) \(Format.yen(e.amount)) の入金予定です。" : "\(e.title) の入金予定です。", "home")
            } else {
                guard payments else { continue }
                add("pay:\(e.id)", Dates.addDays(e.date, -1), "19:00", "明日は\(e.title)",
                    p.showAmount ? "\(Format.yen(-e.amount)) の支払い予定です。口座残高を確認しましょう。" : "支払い予定があります。口座残高を確認しましょう。", "payments")
            }
        }
        // iOS が予約できる通知は64件まで
        return Array(out.sorted { ($0.date, $0.time, $0.id) < ($1.date, $1.time, $1.id) }.prefix(60))
    }
}
