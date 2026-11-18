import Foundation

/// ウィジェット・ロック画面・Siri の答えに使う、今のお金の要約（アプリが保存のたびに書き出す）。
/// ウィジェットはアプリのデータ全体を読まず、これだけを読む。
public struct WidgetSnapshot: Codable, Equatable, Sendable {
    public struct Day: Codable, Equatable, Sendable { public var date: String; public var goal: Double; public var spent: Double }
    public struct Payment: Codable, Equatable, Sendable { public var date: String; public var title: String; public var amount: Double }

    public var updatedAt: Date
    /// 今日から7日分の目標と使った額（日付が変わってもウィジェットが正しい日を出せるように）
    public var days: [Day]
    public var month: String
    public var monthSpent: Double, monthGoal: Double
    public var totalAssets: Double
    /// ACF 指標（未設定なら nil）
    public var acfValue: Double?, acfLabel: String?, acfEnd: String?, acfSurplus: Double?
    public var payments: [Payment]
    public var pendingMail: Int
    public var dayClosed: Bool

    public init(updatedAt: Date, days: [Day], month: String, monthSpent: Double, monthGoal: Double, totalAssets: Double,
                acfValue: Double? = nil, acfLabel: String? = nil, acfEnd: String? = nil, acfSurplus: Double? = nil,
                payments: [Payment], pendingMail: Int, dayClosed: Bool) {
        self.updatedAt = updatedAt; self.days = days; self.month = month; self.monthSpent = monthSpent; self.monthGoal = monthGoal
        self.totalAssets = totalAssets; self.acfValue = acfValue; self.acfLabel = acfLabel; self.acfEnd = acfEnd; self.acfSurplus = acfSurplus
        self.payments = payments; self.pendingMail = pendingMail; self.dayClosed = dayClosed
    }

    /// その日の目標と使った額（書き出した後に日付が変わった時は、使った額 0 から）
    public func day(_ date: String) -> Day { days.first { $0.date == date } ?? Day(date: date, goal: 0, spent: 0) }
    /// 今日あと使える額（目標が無ければ nil、超えたらマイナス）
    public func remaining(_ date: String) -> Double? { let d = day(date); return d.goal > 0 ? d.goal - d.spent : nil }
    public func upcoming(from date: String) -> [Payment] { payments.filter { $0.date >= date } }

    public static let placeholder = WidgetSnapshot(updatedAt: Date(), days: [Day(date: Dates.ymd(), goal: 1500, spent: 620)], month: Dates.ym(),
                                                   monthSpent: 32400, monthGoal: 45000, totalAssets: 128000, acfValue: 1.42, acfLabel: "黒字", acfEnd: Dates.addDays(Dates.ymd(), 10), acfSurplus: 21000,
                                                   payments: [Payment(date: Dates.addDays(Dates.ymd(), 3), title: "カード支払", amount: 11000), Payment(date: Dates.addDays(Dates.ymd(), 8), title: "家賃", amount: 42000)],
                                                   pendingMail: 0, dayClosed: false)
}

public extension MoneyDocument {
    func widgetSnapshot(now: Date = Date()) -> WidgetSnapshot {
        let today = Dates.ymd(now), month = String(today.prefix(7))
        let days = (0..<7).map { i -> WidgetSnapshot.Day in
            let d = Dates.addDays(today, i)
            return .init(date: d, goal: dailyGoal(d), spent: spent(on: d))
        }
        var acfValue: Double?, acfLabel: String?, acfEnd: String?, acfSurplus: Double?
        if acfStoredSettings.initialized {
            let x = acfIndex(acfForecast(today: today, lightweight: true, now: now), today: today)
            acfValue = x.value.isFinite ? x.value : 99; acfLabel = x.label; acfEnd = x.end; acfSurplus = x.surplus
        }
        let pays = financialEvents(from: today, days: 45, today: today).filter { $0.amount < 0 }.prefix(6)
            .map { WidgetSnapshot.Payment(date: $0.date, title: $0.title, amount: -$0.amount) }
        return WidgetSnapshot(updatedAt: now, days: days, month: month, monthSpent: spentMonth(month), monthGoal: monthlyGoalTotal(month),
                              totalAssets: totalBankBalance, acfValue: acfValue, acfLabel: acfLabel, acfEnd: acfEnd, acfSurplus: acfSurplus,
                              payments: Array(pays), pendingMail: pendingMailIds.count, dayClosed: dayClosingStatus(today, today: today) == .closed)
    }
}

/// アプリとウィジェットで共有する場所（App Group）
public enum SharedStore {
    public static let snapshotFile = "widget-snapshot.json"
    /// Info.plist の MyMoneyAppGroup（group.<バンドル ID>）
    public static var groupId: String? { Bundle.main.object(forInfoDictionaryKey: "MyMoneyAppGroup") as? String }
    public static var directory: URL? {
        guard let id = groupId, !id.isEmpty else { return nil }
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id)
    }
    public static func readSnapshot() -> WidgetSnapshot? {
        guard let dir = directory, let data = try? Data(contentsOf: dir.appendingPathComponent(snapshotFile)) else { return nil }
        let dec = JSONDecoder(); dec.dateDecodingStrategy = .iso8601
        return try? dec.decode(WidgetSnapshot.self, from: data)
    }
    public static func write(_ s: WidgetSnapshot) throws {
        guard let dir = directory else { return }
        let enc = JSONEncoder(); enc.dateEncodingStrategy = .iso8601
        try enc.encode(s).write(to: dir.appendingPathComponent(snapshotFile), options: .atomic)
    }
}
