import Foundation

/// Web 版の `Number(x)||0` と同じ読み方（文字列の数字も読む。読めなければ 0）
@inlinable func num(_ v: JSONValue?) -> Double {
    switch v {
    case .number(let n)?: return n.isFinite ? n : 0
    case .string(let s)?: return Double(s.trimmingCharacters(in: .whitespaces)) ?? 0
    case .bool(let b)?: return b ? 1 : 0
    default: return 0
    }
}
/// Web 版の `String(x||'')`
@inlinable func str(_ v: JSONValue?) -> String {
    switch v {
    case .string(let s)?: return s
    case .number(let n)?: return JSONValue.formatNumber(n)
    case .bool(let b)?: return b ? "true" : "false"
    default: return ""
    }
}
@inlinable func optNum(_ v: JSONValue?) -> Double? {
    guard let v, !v.isNull else { return nil }
    if case .string(let s) = v, s.isEmpty { return nil }
    return num(v)
}

/// 記録の共通の形：読み込んだ JSON（`raw`）をそのまま持ち、iOS が知っている項目だけを上書きして書き戻す。
/// iOS がまだ知らない項目（Web 版の新しい項目）も消えない。
public protocol JSONRecord: Identifiable, Equatable, Sendable {
    var raw: JSONValue { get }
    init(json: JSONValue)
    /// iOS が知っている項目（書き戻す時に raw に上書きする）
    var known: [String: JSONValue] { get }
}
public extension JSONRecord {
    /// 書き戻す JSON：変わった項目だけを raw に上書きする（変えていない項目は、null や文字列の数字なども元の形のまま）
    var json: JSONValue {
        // 新しく作った記録（raw が空）は、知っている項目をすべて書く
        if raw.objectValue?.isEmpty ?? true { return .object(known) }
        let base = Self(json: raw).known
        var changed: [String: JSONValue] = [:]
        for (k, v) in known where base[k] != v { changed[k] = v }
        return raw.merging(.object(changed))
    }
}

// MARK: - 勤務先

public struct BreakRule: Equatable, Sendable, Hashable {
    /// 勤務時間（分）がこの範囲 [from, to) の時に休憩 minutes 分
    public var from: Int
    public var to: Int?
    public var minutes: Int
    public init(from: Int, to: Int?, minutes: Int) { self.from = from; self.to = to; self.minutes = minutes }
    var json: JSONValue { .object(["from": .number(Double(from)), "to": to.map { .number(Double($0)) } ?? .null, "minutes": .number(Double(minutes))]) }
}

public struct Employer: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var name: String
    public var hourly: Double
    /// 交通費（per_shift なら1勤務＝往復の額、それ以外は月額）
    public var transport: Double
    public var transportUnit: String
    /// 交通費の月の上限（0 = なし）
    public var transportCap: Double
    /// "month_end"（月末締め）または "day"（closingDay 日締め）
    public var closingType: String
    public var closingDay: Int
    /// 給料日: payMonthOffset か月後の payDay 日（payType が "month_end" なら月末）
    public var payType: String
    public var payDay: Int
    public var payMonthOffset: Int
    public var breakRules: [BreakRule]
    public var aliases: [String]
    public var bankId: String

    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); name = str(json["name"])
        hourly = num(json["hourly"]); transport = num(json["transport"])
        transportUnit = str(json["transportUnit"]); transportCap = num(json["transportCap"])
        closingType = str(json["closingType"]).isEmpty ? "month_end" : str(json["closingType"])
        closingDay = Int(num(json["closingDay"])); payType = str(json["payType"])
        payDay = Int(num(json["payDay"])); payMonthOffset = Int(num(json["payMonthOffset"]))
        breakRules = (json["breakRules"]?.arrayValue ?? []).map {
            BreakRule(from: Int(num($0["from"])), to: optNum($0["to"]).map { Int($0) }, minutes: Int(num($0["minutes"])))
        }
        aliases = (json["aliases"]?.arrayValue ?? []).compactMap(\.stringValue)
        bankId = str(json["bankId"])
    }
    public var known: [String: JSONValue] {
        ["id": .string(id), "name": .string(name), "hourly": .number(hourly), "transport": .number(transport),
         "transportUnit": .string(transportUnit), "transportCap": .number(transportCap),
         "closingType": .string(closingType), "closingDay": .number(Double(closingDay)),
         "payType": .string(payType), "payDay": .number(Double(payDay)), "payMonthOffset": .number(Double(payMonthOffset)),
         "breakRules": .array(breakRules.map(\.json)), "aliases": .array(aliases.map { .string($0) }), "bankId": .string(bankId)]
    }
}

// MARK: - 給与の記録

public struct SalaryRecord: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var employerId: String
    /// 勤務対象月 YYYY-MM
    public var month: String
    /// 予定の入金日 YYYY-MM-DD
    public var date: String
    /// 総支給額（交通費を含む。交通費は内訳）。amountBasis が "net" なら控除後の受取予定額
    public var gross: Double
    public var transport: Double
    /// "予定" / "入金済"
    public var status: String
    /// "shift"（シフトから計算）/ "manual"（手入力）/ ""
    public var source: String
    public var amountBasis: String
    public var receivedAmount: Double?
    public var actualReceivedDate: String
    /// 手入力した時刻（ISO8601）。7日間はシフトの自動計算で上書きしない
    public var manualAt: String
    public var shiftCount: Int
    public var shiftMinutes: Int

    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); employerId = str(json["employerId"]); month = str(json["month"]); date = str(json["date"])
        gross = num(json["gross"]); transport = num(json["transport"])
        status = str(json["status"]).isEmpty ? "予定" : str(json["status"])
        source = str(json["source"]); amountBasis = str(json["amountBasis"])
        receivedAmount = optNum(json["receivedAmount"]); actualReceivedDate = str(json["actualReceivedDate"])
        manualAt = str(json["manualAt"]); shiftCount = Int(num(json["shiftCount"])); shiftMinutes = Int(num(json["shiftMinutes"]))
    }
    public init(id: String, employerId: String, month: String, date: String, gross: Double, transport: Double, status: String = "予定", source: String = "") {
        self.init(json: .object([:]))
        self.id = id; self.employerId = employerId; self.month = month; self.date = date
        self.gross = gross; self.transport = transport; self.status = status; self.source = source
    }
    public var known: [String: JSONValue] {
        var o: [String: JSONValue] = ["id": .string(id), "employerId": .string(employerId), "month": .string(month), "date": .string(date),
                                      "gross": .number(gross), "transport": .number(transport), "status": .string(status)]
        if !source.isEmpty { o["source"] = .string(source) }
        if !amountBasis.isEmpty { o["amountBasis"] = .string(amountBasis) }
        if let receivedAmount { o["receivedAmount"] = .number(receivedAmount) }
        if !actualReceivedDate.isEmpty { o["actualReceivedDate"] = .string(actualReceivedDate) }
        if !manualAt.isEmpty { o["manualAt"] = .string(manualAt) }
        if source == "shift" { o["shiftCount"] = .number(Double(shiftCount)); o["shiftMinutes"] = .number(Double(shiftMinutes)) }
        return o
    }
}

// MARK: - 支出・口座・収入

public struct Transaction: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var date: String
    public var amount: Double
    public var category: String
    public var merchant: String
    public var paymentMethod: String
    public var paymentId: String
    public var memo: String
    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); date = str(json["date"]); amount = num(json["amount"]); category = str(json["category"])
        merchant = str(json["merchant"]); paymentMethod = str(json["paymentMethod"]); paymentId = str(json["paymentId"]); memo = str(json["memo"])
    }
    public var known: [String: JSONValue] {
        ["id": .string(id), "date": .string(date), "amount": .number(amount), "category": .string(category), "merchant": .string(merchant),
         "paymentMethod": .string(paymentMethod), "paymentId": .string(paymentId), "memo": .string(memo)]
    }
}

public struct Bank: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var name: String
    public var balance: Double
    public var threshold: Double
    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); name = str(json["name"]); balance = num(json["balance"]); threshold = num(json["threshold"])
    }
    public var known: [String: JSONValue] {
        ["id": .string(id), "name": .string(name), "balance": .number(balance), "threshold": .number(threshold)]
    }
}

public struct Income: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var date: String
    public var amount: Double
    public var salaryRecordId: String
    public var tempIncomeId: String
    public var bankApplied: Bool
    public var bankReconciled: Bool
    public var receivedConfirmed: Bool
    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); date = str(json["date"]); amount = num(json["amount"]); salaryRecordId = str(json["salaryRecordId"]); tempIncomeId = str(json["tempIncomeId"])
        bankApplied = json["bankApplied"]?.boolValue ?? false; bankReconciled = json["bankReconciled"]?.boolValue ?? false
        receivedConfirmed = json["receivedConfirmed"]?.boolValue ?? false
    }
    public var known: [String: JSONValue] {
        ["id": .string(id), "date": .string(date), "amount": .number(amount), "salaryRecordId": .string(salaryRecordId),
         "bankApplied": .bool(bankApplied), "bankReconciled": .bool(bankReconciled)]
    }
}

public struct TempIncome: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var date: String
    public var amount: Double
    public var sourceName: String
    public var incomeId: String
    public var receivedConfirmed: Bool
    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); date = str(json["date"]); amount = num(json["amount"]); incomeId = str(json["incomeId"])
        sourceName = str(json["sourceName"]).isEmpty ? str(json["source"]) : str(json["sourceName"])
        receivedConfirmed = json["receivedConfirmed"]?.boolValue ?? false
    }
    public var known: [String: JSONValue] {
        ["id": .string(id), "date": .string(date), "amount": .number(amount), "sourceName": .string(sourceName), "receivedConfirmed": .bool(receivedConfirmed)]
    }
}

/// シフト1回分（Web 版 `data.shiftPlans`）
public struct ShiftPlan: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var employerId: String
    public var date: String
    public var start: String
    public var end: String
    public var title: String
    public var workMinutes: Int
    public var nightMinutes: Int
    public var pay: Double
    public var source: String
    public var importedAt: String
    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); employerId = str(json["employerId"]); date = str(json["date"]); start = str(json["start"]); end = str(json["end"])
        title = str(json["title"]); workMinutes = Int(num(json["workMinutes"])); nightMinutes = Int(num(json["nightMinutes"]))
        pay = num(json["pay"]); source = str(json["source"]); importedAt = str(json["importedAt"])
    }
    public var known: [String: JSONValue] {
        ["id": .string(id), "employerId": .string(employerId), "date": .string(date), "start": .string(start), "end": .string(end),
         "title": .string(title), "workMinutes": .number(Double(workMinutes)), "nightMinutes": .number(Double(nightMinutes)),
         "pay": .number(pay), "source": .string(source), "importedAt": .string(importedAt)]
    }
}
