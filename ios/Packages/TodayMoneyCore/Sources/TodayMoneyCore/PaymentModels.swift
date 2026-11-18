import Foundation

// MARK: - カード・デビット・固定支払い・大型支出・カテゴリ（Web 版 data.cards など）

/// クレジットカード（Web 版 `data.cards`）
public struct Card: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var company: String
    public var name: String
    /// 締め日：nil（未設定）／ "月末" ／ 1〜31 の日
    public var closingDay: CardClosing?
    /// 引落日（nil は未設定）
    public var dueDay: Int?
    public var limit: Double
    public var availableSnapshot: Double?
    public var bankId: String

    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); company = str(json["company"]); name = str(json["name"])
        closingDay = CardClosing(json["closingDay"])
        dueDay = optNum(json["dueDay"]).map { Int($0) }
        limit = num(json["limit"]); availableSnapshot = optNum(json["availableSnapshot"])
        bankId = str(json["bankId"])
    }
    public init(id: String, name: String) {
        self.init(json: .object([:])); self.id = id; self.name = name; self.company = name
    }
    public var known: [String: JSONValue] {
        var o: [String: JSONValue] = ["id": .string(id), "company": .string(company), "name": .string(name),
                                      "closingDay": closingDay?.json ?? .null, "dueDay": dueDay.map { .number(Double($0)) } ?? .null,
                                      "limit": .number(limit), "bankId": .string(bankId)]
        o["availableSnapshot"] = availableSnapshot.map { .number($0) } ?? .null
        return o
    }
}

public enum CardClosing: Equatable, Sendable, Hashable {
    case monthEnd
    case day(Int)
    init?(_ v: JSONValue?) {
        guard let v, !v.isNull else { return nil }
        if case .string(let s) = v {
            if s == "月末" { self = .monthEnd; return }
            if s.isEmpty { return nil }
        }
        self = .day(Int(num(v)))
    }
    var json: JSONValue {
        switch self { case .monthEnd: return .string("月末"); case .day(let d): return .number(Double(d)) }
    }
    public var label: String {
        switch self { case .monthEnd: return "月末締め"; case .day(let d): return "\(d)日締め" }
    }
}

/// デビットカード（Web 版 `data.debitCards`）
public struct DebitCard: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var name: String
    public var bankId: String
    public init(json: JSONValue) {
        raw = json; id = str(json["id"]); name = str(json["name"]); bankId = str(json["bankId"])
    }
    public init(id: String, name: String, bankId: String) {
        self.init(json: .object([:])); self.id = id; self.name = name; self.bankId = bankId
    }
    public var known: [String: JSONValue] { ["id": .string(id), "name": .string(name), "bankId": .string(bankId)] }
}

/// 固定支払い（Web 版 `data.fixedPayments`）
public struct FixedPayment: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var name: String
    public var amount: Double
    public var day: Int
    /// "monthly" / "bimonthly" / "yearly"
    public var frequency: String
    public var startMonth: String
    public var annualMonth: Int
    public var paymentMethod: String
    public var paymentId: String
    public var category: String
    public var skippedDates: [String]
    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); name = str(json["name"]); amount = num(json["amount"]); day = Int(num(json["day"]))
        frequency = str(json["frequency"]).isEmpty ? "monthly" : str(json["frequency"])
        startMonth = str(json["startMonth"]); annualMonth = Int(num(json["annualMonth"]))
        paymentMethod = str(json["paymentMethod"]).isEmpty ? "other" : str(json["paymentMethod"])
        paymentId = str(json["paymentId"]); category = str(json["category"])
        skippedDates = (json["skippedDates"]?.arrayValue ?? []).compactMap(\.stringValue)
    }
    public init(id: String) { self.init(json: .object([:])); self.id = id }
    public var known: [String: JSONValue] {
        var o: [String: JSONValue] = ["id": .string(id), "name": .string(name), "amount": .number(amount), "day": .number(Double(day)),
                                      "frequency": .string(frequency), "startMonth": .string(startMonth),
                                      "paymentMethod": .string(paymentMethod), "paymentId": .string(paymentId),
                                      "skippedDates": .array(skippedDates.map { .string($0) })]
        if annualMonth > 0 { o["annualMonth"] = .number(Double(annualMonth)) }
        if !category.isEmpty { o["category"] = .string(category) }
        return o
    }
    public var frequencyLabel: String {
        switch frequency { case "yearly": return "毎年"; case "bimonthly": return "2か月ごと"; default: return "毎月" }
    }
}

/// 大型支出の支払い方法の1つ（分割して複数の方法で払う時は複数）
public struct LargeExpensePart: Equatable, Sendable, Hashable {
    public var paymentMethod: String
    public var paymentId: String
    public var linkedBankId: String
    public var amount: Double
    public init(paymentMethod: String, paymentId: String, linkedBankId: String = "", amount: Double) {
        self.paymentMethod = paymentMethod; self.paymentId = paymentId; self.linkedBankId = linkedBankId; self.amount = amount
    }
    var json: JSONValue {
        .object(["paymentMethod": .string(paymentMethod), "paymentId": .string(paymentId), "linkedBankId": .string(linkedBankId), "amount": .number(amount)])
    }
}

/// 大型支出の計画（Web 版 `data.largeExpensePlans`）
public struct LargeExpensePlan: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var name: String
    public var date: String
    public var amount: Double
    /// "required"（必須）/ "optional"（任意）
    public var priority: String
    /// "planned" / "completed" / "postponed" / "cancelled"
    public var status: String
    public var paymentMethod: String
    public var paymentId: String
    public var linkedBankId: String
    public var splits: [LargeExpensePart]
    public var category: String
    public var memo: String
    public var linkedTransactionIds: [String]
    public var linkedTransactionId: String
    public var atfInstallments: [String: Int]
    public var atfFee: Double

    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); name = str(json["name"]); date = str(json["date"]); amount = num(json["amount"])
        priority = str(json["priority"]).isEmpty ? "optional" : str(json["priority"])
        status = str(json["status"]).isEmpty ? "planned" : str(json["status"])
        paymentMethod = str(json["paymentMethod"]).isEmpty ? "other" : str(json["paymentMethod"])
        paymentId = str(json["paymentId"]); linkedBankId = str(json["linkedBankId"])
        splits = (json["splits"]?.arrayValue ?? []).map {
            LargeExpensePart(paymentMethod: str($0["paymentMethod"]), paymentId: str($0["paymentId"]), linkedBankId: str($0["linkedBankId"]), amount: num($0["amount"]))
        }
        category = str(json["category"]); memo = str(json["memo"])
        linkedTransactionIds = (json["linkedTransactionIds"]?.arrayValue ?? []).compactMap(\.stringValue)
        linkedTransactionId = str(json["linkedTransactionId"])
        atfInstallments = (json["atfInstallments"]?.objectValue ?? [:]).mapValues { Int(num($0)) }
        atfFee = num(json["atfFee"])
    }
    public init(id: String) { self.init(json: .object([:])); self.id = id }
    public var known: [String: JSONValue] {
        var o: [String: JSONValue] = ["id": .string(id), "name": .string(name), "date": .string(date), "amount": .number(amount),
                                      "priority": .string(priority), "status": .string(status), "paymentMethod": .string(paymentMethod),
                                      "paymentId": .string(paymentId), "linkedBankId": .string(linkedBankId),
                                      "splits": .array(splits.map(\.json)), "category": .string(category), "memo": .string(memo)]
        if !linkedTransactionIds.isEmpty { o["linkedTransactionIds"] = .array(linkedTransactionIds.map { .string($0) }) }
        if !linkedTransactionId.isEmpty { o["linkedTransactionId"] = .string(linkedTransactionId) }
        return o
    }
    public var priorityLabel: String { priority == "required" ? "必須" : "任意" }
    public var statusLabel: String {
        switch status { case "completed": return "支払済み"; case "postponed": return "延期"; case "cancelled": return "中止"; default: return "予定" }
    }
}

/// 支出のカテゴリ（Web 版 `data.categories`）
public struct Category: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var name: String
    public var icon: String
    public var color: String
    public init(json: JSONValue) {
        raw = json; id = str(json["id"]); name = str(json["name"]); icon = str(json["icon"]); color = str(json["color"])
    }
    public init(id: String, name: String, icon: String = "dots", color: String = "#8E8E93") {
        self.init(json: .object([:])); self.id = id; self.name = name; self.icon = icon; self.color = color
    }
    public var known: [String: JSONValue] { ["id": .string(id), "name": .string(name), "icon": .string(icon), "color": .string(color)] }
}

/// Web 版の初期カテゴリ（CATEGORY_DEFAULTS）
public enum DefaultCategories {
    public static let all: [Category] = [
        Category(id: "food", name: "食費", icon: "fork", color: "#34C759"),
        Category(id: "transport", name: "交通費", icon: "tram", color: "#007AFF"),
        Category(id: "daily", name: "日用品", icon: "bag", color: "#30B0C7"),
        Category(id: "clothes", name: "衣服費", icon: "tshirt", color: "#AF52DE"),
        Category(id: "fun", name: "娯楽費", icon: "ticket", color: "#FF9500"),
        Category(id: "subscription", name: "サブスク", icon: "repeat", color: "#5856D6"),
        Category(id: "education", name: "教育費", icon: "book", color: "#64D2FF"),
        Category(id: "utilities", name: "光熱費", icon: "bolt", color: "#FFCC00"),
        Category(id: "other", name: "その他", icon: "ellipsis", color: "#8E8E93"),
    ]
}

/// カードの請求額の手直し・確定・支払済み（Web 版 `data.cardAdjustments["YYYY-MM|cardId"]`）
public struct CardAdjustment: Equatable, Sendable {
    public var raw: [String: JSONValue]
    public var confirmedTotal: Double
    public var baseAtEdit: Double
    /// "estimated" / "confirmed" / "paid"
    public var status: String
    public var paymentDateOverride: String
    public var confirmedTransactionIds: [String]
    public var confirmedThroughDate: String
    public var confirmedAt: String
    public var updatedAt: String
    public var bankApplied: Bool
    public var bankReconciled: Bool
    public var bankEffectAt: String
    public var bankIdAtPayment: String
    public var paidAmount: Double?
    public var paidAt: String
    public var memo: String

    /// Web 版 `cardAdjustmentInfo`（古い形 delta / correctedTotal も確定額に読み替える）
    init?(_ v: JSONValue?) {
        guard let o = v?.objectValue else { return nil }
        raw = o
        let base = num(o["baseAtEdit"])
        if str(o["mode"]) == "confirmed_total" {
            confirmedTotal = num(o["confirmedTotal"])
        } else if let c = o["correctedTotal"], !c.isNull {
            confirmedTotal = num(c)
        } else {
            confirmedTotal = base + num(o["delta"])
        }
        baseAtEdit = base
        let s = str(o["status"])
        status = ["estimated", "confirmed", "paid"].contains(s) ? s : "confirmed"
        paymentDateOverride = str(o["paymentDateOverride"])
        confirmedTransactionIds = (o["confirmedTransactionIds"]?.arrayValue ?? []).compactMap(\.stringValue)
        confirmedThroughDate = str(o["confirmedThroughDate"])
        confirmedAt = str(o["confirmedAt"]); updatedAt = str(o["updatedAt"])
        bankApplied = o["bankApplied"]?.boolValue ?? false
        bankReconciled = o["bankReconciled"]?.boolValue ?? false
        bankEffectAt = str(o["bankEffectAt"]); bankIdAtPayment = str(o["bankIdAtPayment"])
        paidAmount = optNum(o["paidAmount"]); paidAt = str(o["paidAt"]); memo = str(o["memo"])
    }

    var json: JSONValue {
        var o = raw
        o["mode"] = .string("confirmed_total")
        o["confirmedTotal"] = .number(confirmedTotal)
        o["baseAtEdit"] = .number(baseAtEdit)
        o["deltaAtEdit"] = .number(confirmedTotal - baseAtEdit)
        o["status"] = .string(status)
        o["paymentDateOverride"] = .string(paymentDateOverride)
        o["confirmedTransactionIds"] = .array(confirmedTransactionIds.map { .string($0) })
        o["confirmedThroughDate"] = .string(confirmedThroughDate)
        o["confirmedAt"] = .string(confirmedAt); o["updatedAt"] = .string(updatedAt)
        o["bankApplied"] = .bool(bankApplied); o["bankReconciled"] = .bool(bankReconciled)
        o["bankEffectAt"] = .string(bankEffectAt); o["bankIdAtPayment"] = .string(bankIdAtPayment)
        o["paidAmount"] = .number(paidAmount ?? 0); o["paidAt"] = .string(paidAt); o["memo"] = .string(memo)
        return .object(o)
    }
}

public enum StatementStatus: String, Sendable {
    case estimated, confirmed, paid
    public var label: String {
        switch self { case .paid: return "支払済み"; case .confirmed: return "確定"; case .estimated: return "見込み" }
    }
}
