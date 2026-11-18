import Foundation

/// アプリのデータ全体（Web 版の `data`、バックアップの JSON と同じ形）。
///
/// - 読み込んだ JSON をそのまま `root` に持つ。iOS が触らない項目（Gmail・ACF の設定・通知など）はそのまま残る。
/// - 記録の配列は型つきで読み書きできる。書き戻す時は各記録の未知の項目も残す。
/// - Web 版の「バックアップを書き出す」で作った .json をそのまま読み込め、iOS から書き出した .json は Web 版で復元できる。
public struct MoneyDocument: Equatable, Sendable {
    public private(set) var root: [String: JSONValue] { didSet { cache = RecordCache() } }
    /// 読み込んだ記録の配列（JSON から毎回作り直さないための控え。root が変わると捨てる）
    private var cache = RecordCache()

    public static func == (a: MoneyDocument, b: MoneyDocument) -> Bool { a.root == b.root }

    public init(root: [String: JSONValue] = [:]) { self.root = root }

    public init(json: JSONValue) throws {
        guard case .object(let o) = json else { throw DocumentError.notObject }
        root = o
    }
    public init(data: Data) throws { try self.init(json: try JSONValue.parse(data)) }

    /// Web 版のバックアップと同じ形（backupMeta つき）で書き出す
    public func exportJSON(exportedAt: Date = Date()) -> JSONValue {
        var o = root
        let iso = ISO8601DateFormatter(); iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        o["backupMeta"] = .object(["app": .string("My Money 2.0"), "exportedAt": .string(iso.string(from: exportedAt)), "format": .string("single-html-json"), "client": .string("ios")])
        return .object(o)
    }

    /// 計算結果の控え（同じデータなら計算し直さない）
    public func memo<T>(_ key: String, _ make: () -> T) -> T {
        if let hit = cache.get("memo|" + key) as? T { return hit }
        let v = make(); cache.set("memo|" + key, v); return v
    }

    public subscript(key: String) -> JSONValue? {
        get { root[key] }
        set { root[key] = newValue }
    }

    // MARK: 記録の配列

    public func records<R: JSONRecord>(_ key: String, as _: R.Type = R.self) -> [R] {
        let ck = "\(key)|\(R.self)"
        if let hit = cache.get(ck) as? [R] { return hit }
        let list = (root[key]?.arrayValue ?? []).filter { $0.objectValue != nil }.map(R.init(json:))
        cache.set(ck, list)
        return list
    }
    public mutating func setRecords<R: JSONRecord>(_ key: String, _ list: [R]) {
        root[key] = .array(list.map(\.json))
    }

    public var employers: [Employer] { get { records("employers") } set { setRecords("employers", newValue) } }
    public var salaryRecords: [SalaryRecord] { get { records("salaryRecords") } set { setRecords("salaryRecords", newValue) } }
    public var transactions: [Transaction] { get { records("transactions") } set { setRecords("transactions", newValue) } }
    public var banks: [Bank] { get { records("banks") } set { setRecords("banks", newValue) } }
    public var incomes: [Income] { get { records("incomes") } set { setRecords("incomes", newValue) } }
    public var tempIncomes: [TempIncome] { get { records("tempIncomes") } set { setRecords("tempIncomes", newValue) } }
    public var shiftPlans: [ShiftPlan] { get { records("shiftPlans") } set { setRecords("shiftPlans", newValue) } }

    public func employer(_ id: String) -> Employer? { employers.first { $0.id == id } }

    /// 月の支出の手直し（Web 版 monthlyCorrections）
    public func monthlyCorrection(_ month: String) -> Double? {
        guard let v = root["monthlyCorrections"]?[month], !v.isNull else { return nil }
        return num(v)
    }
    /// 1日の目標（Web 版 dailyGoals[date].total）
    public func dailyGoal(_ date: String) -> Double { num(root["dailyGoals"]?[date]?["total"]) }
    /// 月の目標（Web 版 monthlyGoals[month].total）
    public func monthlyGoalTotal(_ month: String) -> Double { num(root["monthlyGoals"]?[month]?["total"]) }

    /// 給与の受け渡し・シフトの設定（Web 版 shiftSettings）
    public var shiftSettings: ShiftSettings {
        get { ShiftSettings(json: root["shiftSettings"] ?? .object([:])) }
        set { root["shiftSettings"] = (root["shiftSettings"] ?? .object([:])).merging(.object(newValue.known)) }
    }
    public var meta: [String: JSONValue] {
        get { root["meta"]?.objectValue ?? [:] }
        set { root["meta"] = .object(newValue) }
    }
}

public enum DocumentError: Error, Equatable, CustomStringConvertible {
    case notObject
    public var description: String {
        switch self {
        case .notObject: return "今日のお金のデータではありません（JSON の一番外側がオブジェクトではありません）"
        }
    }
}

/// Web 版 `shiftSettings()` と同じ既定値
public struct ShiftSettings: Equatable, Sendable {
    public var autoBreak: Bool
    /// 深夜（22〜翌5時）の割増率（%）
    public var nightRate: Double
    /// 予定名 → 勤務先 ID の割り当て
    public var titleMap: [String: String]
    public init(autoBreak: Bool = true, nightRate: Double = 25, titleMap: [String: String] = [:]) {
        self.autoBreak = autoBreak; self.nightRate = nightRate; self.titleMap = titleMap
    }
    public init(json: JSONValue) {
        autoBreak = json["autoBreak"]?.boolValue ?? true
        nightRate = json["nightRate"].map { num($0) } ?? 25
        titleMap = (json["titleMap"]?.objectValue ?? [:]).compactMapValues(\.stringValue)
    }
    var known: [String: JSONValue] {
        ["autoBreak": .bool(autoBreak), "nightRate": .number(nightRate), "titleMap": .object(titleMap.mapValues { .string($0) })]
    }
}

/// 記録の配列の控え（参照型なので、値のコピーどうしで共有される。root を変えた側は新しい控えに替わる）
final class RecordCache: @unchecked Sendable {
    private var store: [String: Any] = [:]
    private let lock = NSLock()
    func get(_ k: String) -> Any? { lock.lock(); defer { lock.unlock() }; return store[k] }
    func set(_ k: String, _ v: Any) { lock.lock(); store[k] = v; lock.unlock() }
}
