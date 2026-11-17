import Foundation

// 日締め（Web 版 src/js/day-closing.js）。
// 承認の記録（data.dayClosings[日付]）は Web 版と同じ形・同じ署名の文字列で保存するので、
// Web 版で承認した日を iOS で見ても（その逆も）「承認済」のまま。照合テスト DayClosingCompatTests。

/// JSON.stringify と同じ順序で書き出すための値（キーの順序を保つ）
indirect enum OJ {
    case obj([(String, OJ)])
    case arr([OJ])
    case raw(JSONValue)     // 文字列・数値・真偽・null（JSON.stringify と同じ表記）
    case skip               // JavaScript の undefined（キーごと書かない）

    var text: String {
        switch self {
        case .obj(let kv):
            return "{" + kv.filter { if case .skip = $0.1 { return false }; return true }.map { "\(JSONValue.string($0.0).canonical):\($0.1.text)" }.joined(separator: ",") + "}"
        case .arr(let a): return "[" + a.map { if case .skip = $0 { return "null" }; return $0.text }.joined(separator: ",") + "]"
        case .raw(let v): return v.canonical
        case .skip: return "null"
        }
    }
    static func s(_ v: String) -> OJ { .raw(.string(v)) }
    static func n(_ v: Double) -> OJ { .raw(.number(v)) }
    static func b(_ v: Bool) -> OJ { .raw(.bool(v)) }
    /// 記録の項目そのまま（無ければ undefined）
    static func f(_ r: JSONValue, _ k: String) -> OJ { r[k].map { .raw($0) } ?? .skip }
    /// `x||''`
    static func orEmpty(_ r: JSONValue, _ k: String) -> OJ {
        guard let v = r[k] else { return s("") }
        return jsTruthy(v) ? .raw(v) : s("")
    }
    /// `!!x`
    static func bang(_ r: JSONValue, _ k: String) -> OJ { b(r[k].map(jsTruthy) ?? false) }
}

func jsTruthy(_ v: JSONValue) -> Bool {
    switch v {
    case .null: return false
    case .bool(let b): return b
    case .number(let n): return n != 0 && !n.isNaN
    case .string(let s): return !s.isEmpty
    default: return true
    }
}

/// localeCompare と同じ並べ方（日本語の環境）
func jsLocaleLess(_ a: String, _ b: String) -> Bool {
    a.compare(b, options: [], range: nil, locale: Locale(identifier: "ja")) == .orderedAscending
}

public enum DayClosingGroup: String, CaseIterable, Sendable { case income, mail, ordinary, banks
    public var title: String {
        switch self { case .income: return "収入の照合"; case .mail: return "メール取引の照合"; case .ordinary: return "普通取引の照合"; case .banks: return "銀行残高の照合" }
    }
}

/// 照合する1件
public struct DayClosingItem: Sendable, Identifiable {
    public var group: DayClosingGroup
    public var key: String
    public var fingerprint: String
    public var pending: Bool
    public var title: String
    public var subtitle: String
    public var amount: Double
    public var transactionId: String?
    public var recordId: String
    public var id: String { key }
}

public struct DayClosingItems: Sendable {
    public var income: [DayClosingItem] = []
    public var mail: [DayClosingItem] = []
    public var ordinary: [DayClosingItem] = []
    public var banks: [DayClosingItem] = []
    public subscript(g: DayClosingGroup) -> [DayClosingItem] {
        switch g { case .income: return income; case .mail: return mail; case .ordinary: return ordinary; case .banks: return banks }
    }
    public var all: [DayClosingItem] { income + mail + ordinary + banks }
}

/// 照合の途中経過（チェックした項目）
public struct DayClosingReview: Sendable, Equatable {
    public var date: String
    public var checks: [String: String] = [:]
    public var emptyGroups: Set<DayClosingGroup> = []
    public init(date: String) { self.date = date }
}

public enum DayClosingStatus: String, Sendable { case open, closed, changed, cancelled
    public var label: String { switch self { case .closed: return "承認済"; case .changed: return "再確認が必要"; case .cancelled: return "取消済"; case .open: return "" } }
}

public enum DayClosing {
    public static let steps = ["日締め", "収入の照合", "メール取引の照合", "普通取引の照合", "銀行残高の照合", "承認", "承認されました"]
    public static let timeMessage = "この日の日締めは18:00以降に可能です"
    public static let cancelReasons = ["誤って承認した", "照合が終わっていない", "承認内容を見直したい"]

    /// 今日を含む直近7日間か
    public static func inRange(_ date: String, today: String) -> Bool {
        Dates.isYMD(date) && date <= today && date >= Dates.addDays(today, -6)
    }
    /// その日の18:00（日本時間）を過ぎたか
    public static func available(_ date: String, now: Date = Date()) -> Bool {
        guard Dates.isYMD(date), let t = ISO8601DateFormatter().date(from: "\(date)T18:00:00+09:00") else { return false }
        return now >= t
    }
}

public extension MoneyDocument {
    private func txFields(_ t: Transaction) -> OJ {
        let r = t.raw
        return .obj([("id", .f(r, "id")), ("date", .f(r, "date")), ("amount", .f(r, "amount")), ("category", .f(r, "category")), ("merchant", .f(r, "merchant")),
                     ("paymentMethod", .f(r, "paymentMethod")), ("paymentId", .f(r, "paymentId")), ("linkedBankId", .orEmpty(r, "linkedBankId")),
                     ("memo", .orEmpty(r, "memo")), ("bankApplied", .bang(r, "bankApplied")), ("bankReconciled", .bang(r, "bankReconciled"))])
    }

    /// その日のメール取引（Web 版 dayClosingMailForDate）
    private func mailFor(_ date: String, today: String) -> [JSONValue] {
        let txs = transactions
        return (root["mailImports"]?.arrayValue ?? []).filter { mi in
            let tx = txs.first { $0.id == str(mi["transactionId"]) && !str(mi["transactionId"]).isEmpty }
            let d = str(mi["date"])
            if d == date || tx?.date == date { return true }
            if d.isEmpty && str(mi["status"]) == "pending" {
                if date == today { return true }
                let rec = str(mi["receivedAt"]).isEmpty ? str(mi["createdAt"]) : str(mi["receivedAt"])
                if let ms = ISODate.ms(rec) { return Dates.ymd(Date(timeIntervalSince1970: ms / 1000)) == date }
            }
            return false
        }
    }

    /// 照合する項目（Web 版 dayClosingReviewItems）
    func dayClosingItems(_ date: String, today: String) -> DayClosingItems {
        var out = DayClosingItems()
        for x in incomes where x.date == date {
            let r = x.raw
            let detail = OJ.obj([("id", .f(r, "id")), ("date", .f(r, "date")), ("amount", .f(r, "amount")), ("sourceName", .f(r, "sourceName")), ("toType", .f(r, "toType")),
                                 ("bankId", .f(r, "bankId")), ("memo", .orEmpty(r, "memo")), ("receivedConfirmed", .bang(r, "receivedConfirmed")),
                                 ("bankApplied", .bang(r, "bankApplied")), ("bankReconciled", .bang(r, "bankReconciled"))])
            out.income.append(DayClosingItem(group: .income, key: "income:\(x.id)", fingerprint: detail.text, pending: false,
                                             title: x.sourceName.isEmpty ? "収入" : x.sourceName,
                                             subtitle: x.toType == "bank" ? (bank(x.bankId)?.name ?? "口座未設定") : "現金・その他", amount: x.amount, transactionId: nil, recordId: x.id))
        }
        let dayTx = transactions(on: date)
        let mails = mailFor(date, today: today)
        for mi in mails {
            let id = str(mi["id"])
            let tx = dayTx.first { $0.id == str(mi["transactionId"]) || $0.raw["mailImportId"].map(str) == id && !id.isEmpty }
            let detail = OJ.obj([("id", .f(mi, "id")), ("date", .orEmpty(mi, "date")), ("status", .f(mi, "status")), ("amount", .f(mi, "amount")),
                                 ("merchant", .f(mi, "merchant")), ("category", .f(mi, "category")), ("paymentMethod", .f(mi, "paymentMethod")),
                                 ("paymentId", .f(mi, "paymentId")), ("transactionId", .orEmpty(mi, "transactionId")),
                                 ("direction", mi["direction"].map { jsTruthy($0) ? OJ.raw($0) : .s("expense") } ?? .s("expense")),
                                 ("tx", tx.map(txFields) ?? .raw(.null))])
            let st = str(mi["status"])
            out.mail.append(DayClosingItem(group: .mail, key: "mail:\(id)", fingerprint: detail.text, pending: st == "pending",
                                           title: tx?.merchant ?? (str(mi["merchant"]).isEmpty ? (str(mi["subject"]).isEmpty ? "メール取引" : str(mi["subject"])) : str(mi["merchant"])),
                                           subtitle: tx.map { "\($0.category) · \(paymentLabel(method: $0.paymentMethod, id: $0.paymentId))" }
                                               ?? (st == "ignored" ? "対象外として確認済み" : st == "info" ? "情報のみ · 家計への反映なし" : "まだ家計に反映されていません"),
                                           amount: tx?.amount ?? num(mi["amount"]), transactionId: tx?.id, recordId: id))
        }
        let mailTxIds = Set(out.mail.compactMap(\.transactionId))
        let mailImportTx = Set(mails.isEmpty ? [] : (root["mailImports"]?.arrayValue ?? []).map { str($0["transactionId"]) })
        let allMailTx = Set((root["mailImports"]?.arrayValue ?? []).map { str($0["transactionId"]) }).union(mailImportTx)
        for t in dayTx where !mailTxIds.contains(t.id) {
            let isMail = t.source == "gmail" || !str(t.raw["mailImportId"]).isEmpty || allMailTx.contains(t.id)
            let item = DayClosingItem(group: isMail ? .mail : .ordinary, key: "\(isMail ? "mail" : "ordinary"):tx:\(t.id)", fingerprint: txFields(t).text, pending: false,
                                      title: t.merchant.isEmpty ? t.category : t.merchant, subtitle: "\(t.category) · \(paymentLabel(method: t.paymentMethod, id: t.paymentId))",
                                      amount: t.amount, transactionId: t.id, recordId: t.id)
            if isMail { out.mail.append(item) } else { out.ordinary.append(item) }
        }
        for b in banks {
            let r = b.raw
            let detail = OJ.obj([("id", .f(r, "id")), ("name", .f(r, "name")), ("label", .orEmpty(r, "label")), ("balance", .n(num(r["balance"]))), ("balanceAsOf", .orEmpty(r, "balanceAsOf"))])
            out.banks.append(DayClosingItem(group: .banks, key: "banks:\(b.id)", fingerprint: detail.text, pending: false, title: b.name,
                                            subtitle: b.label.isEmpty ? "銀行口座" : b.label, amount: b.balance, transactionId: nil, recordId: b.id))
        }
        return out
    }

    /// 記録の署名（Web 版 dayClosingSignature）：承認後に記録が変わったかを見分ける
    func dayClosingSignature(_ date: String, today: String) -> String {
        let items = dayClosingItems(date, today: today)
        func stable(_ list: [DayClosingItem]) -> OJ {
            .arr(list.sorted { jsLocaleLess($0.key, $1.key) }.map { .obj([("key", .s($0.key)), ("fingerprint", .s($0.fingerprint))]) })
        }
        let txs = transactions(on: date).sorted { jsLocaleLess($0.id, $1.id) }.map(txFields)
        let corr: OJ = root["dailyCorrections"]?[date].map { .raw($0) } ?? .raw(.null)
        let goal = root["dailyGoals"]?[date]
        let cats = (goal?["categories"]?.objectValue ?? [:]).sorted { jsLocaleLess($0.key, $1.key) }.map { OJ.arr([.s($0.key), .raw($0.value)]) }
        return OJ.obj([("transactions", .arr(txs)), ("incomes", stable(items.income)), ("mail", stable(items.mail)), ("correction", corr),
                       ("goal", .n(num(goal?["total"]))), ("categories", .arr(cats))]).text
    }
    /// 口座の署名（Web 版 dayClosingBankSignature）
    var dayClosingBankSignature: String {
        OJ.arr(banks.sorted { jsLocaleLess($0.id, $1.id) }.map { b in
            let r = b.raw
            return .obj([("id", .f(r, "id")), ("name", .f(r, "name")), ("label", .orEmpty(r, "label")), ("balance", .n(num(r["balance"]))), ("balanceAsOf", .orEmpty(r, "balanceAsOf"))])
        }).text
    }
    func dayClosingApprovalSignature(_ date: String, today: String) -> String {
        "{\"ledger\":\(JSONValue.string(dayClosingSignature(date, today: today)).canonical),\"banks\":\(JSONValue.string(dayClosingBankSignature).canonical)}"
    }

    /// 承認の状態（Web 版 dayClosingStatus）
    func dayClosingStatus(_ date: String, today: String) -> DayClosingStatus {
        guard let rec = root["dayClosings"]?[date], rec.objectValue != nil else { return .open }
        if str(rec["status"]) == "cancelled" { return .cancelled }
        if str(rec["status"]) != "closed" { return .open }
        if str(rec["signature"]) != dayClosingSignature(date, today: today) { return .changed }
        let bs = str(rec["bankSignature"])
        return date == today && !bs.isEmpty && bs != dayClosingBankSignature ? .changed : .closed
    }

    func dayClosingGroupComplete(_ items: DayClosingItems, _ g: DayClosingGroup, _ review: DayClosingReview) -> Bool {
        let list = items[g]
        return list.isEmpty ? review.emptyGroups.contains(g) : list.allSatisfy { !$0.pending && review.checks[$0.key] == $0.fingerprint }
    }

    /// 承認時点の記録（Web 版 dayClosingSnapshot）
    func dayClosingSnapshot(_ date: String, today: String, now: Date = Date()) -> JSONValue {
        let items = dayClosingItems(date, today: today)
        let txs = transactions(on: date)
        var cats: [String: JSONValue] = [:]
        for t in txs { cats[t.category] = .number(num(cats[t.category]) + t.amount) }
        let incs = incomes.filter { $0.date == date }
        let incomeTotal = incs.reduce(0) { $0 + $1.amount }
        let total = spent(on: date), raw = txs.reduce(0) { $0 + $1.amount }
        let bankList: [JSONValue] = banks.map { .object(["id": .string($0.id), "name": .string($0.name), "label": .string($0.label), "balance": .number($0.balance), "balanceAsOf": .string($0.balanceAsOf)]) }
        return .object([
            "total": .number(total), "rawTotal": .number(raw), "count": .number(Double(txs.count)), "incomeTotal": .number(incomeTotal),
            "incomeCount": .number(Double(items.income.count)), "net": .number(incomeTotal - total), "goal": .number(dailyGoal(date)),
            "categoryTotals": .object(cats), "pendingCount": .number(Double(items.mail.filter(\.pending).count)), "banks": .array(bankList),
            "bankTotal": .number(totalBankBalance), "bankCheckedAt": .string(ISODate.now(now)),
            "incomes": .array(incs.map { .object(["id": .string($0.id), "sourceName": .string($0.sourceName), "amount": .number($0.amount), "toType": .string($0.toType), "bankId": .string($0.bankId), "memo": .string($0.memo)]) }),
            "transactions": .array(txs.map { (try? JSONValue.parse(txFields($0).text)) ?? .null }),
            "mail": .array(items.mail.map { .object(["key": .string($0.key), "id": .string($0.recordId), "merchant": .string($0.title), "amount": .number($0.amount), "transactionId": .string($0.transactionId ?? "")]) }),
            "reviewedCounts": .object(Dictionary(uniqueKeysWithValues: DayClosingGroup.allCases.map { ($0.rawValue, JSONValue.number(Double(items[$0].count))) })),
        ])
    }

    /// 7日より前の記録を消す（Web 版 retainedDayClosings）
    mutating func pruneDayClosings(today: String) {
        guard let all = root["dayClosings"]?.objectValue else { return }
        let oldest = Dates.addDays(today, -6)
        let kept = all.filter { Dates.isYMD($0.key) && $0.key >= oldest && $0.key <= today && $0.value.objectValue != nil }
        if kept.count != all.count { self["dayClosings"] = .object(kept) }
    }

    /// 承認する（Web 版 recordDayClosing）。照合が終わっていない・途中で記録が変わった時はエラー
    mutating func recordDayClosing(_ date: String, review: DayClosingReview, now: Date = Date(), today: String) throws {
        guard DayClosing.inRange(date, today: today) else { throw DayClosingError.range }
        guard DayClosing.available(date, now: now) else { throw DayClosingError.time }
        let items = dayClosingItems(date, today: today)
        guard review.date == date, DayClosingGroup.allCases.allSatisfy({ dayClosingGroupComplete(items, $0, review) }) else { throw DayClosingError.incomplete }
        let previous = root["dayClosings"]?[date]
        pruneDayClosings(today: today)
        var history = previous?["history"]?.arrayValue ?? []
        if let p = previous, !str(p["closedAt"]).isEmpty {
            var h: [String: JSONValue] = ["closedAt": p["closedAt"]!, "snapshot": p["snapshot"] ?? .null]
            if let c = p["cancelledAt"], !str(c).isEmpty { h["cancelledAt"] = c; h["cancellationReason"] = p["cancellationReason"] ?? .string("") }
            history.append(.object(h))
        }
        var all = root["dayClosings"]?.objectValue ?? [:]
        all[date] = .object(["schemaVersion": .number(2), "status": .string("closed"), "closedAt": .string(ISODate.now(now)),
                             "signature": .string(dayClosingSignature(date, today: today)), "bankSignature": .string(dayClosingBankSignature),
                             "snapshot": dayClosingSnapshot(date, today: today, now: now), "history": .array(Array(history.suffix(5)))])
        self["dayClosings"] = .object(all)
    }

    /// 承認を取り消す（Web 版 cancelDayClosing）。承認時の記録は残し、状態だけ変える
    mutating func cancelDayClosing(_ date: String, reason: String, now: Date = Date(), today: String) throws {
        guard DayClosing.inRange(date, today: today) else { throw DayClosingError.range }
        guard DayClosing.available(date, now: now) else { throw DayClosingError.time }
        guard var rec = root["dayClosings"]?[date]?.objectValue, str(rec["status"]) == "closed" else { throw DayClosingError.changed }
        guard DayClosing.cancelReasons.contains(reason) else { throw DayClosingError.reason }
        rec["status"] = .string("cancelled"); rec["cancelledAt"] = .string(ISODate.now(now)); rec["cancellationReason"] = .string(reason)
        var all = root["dayClosings"]?.objectValue ?? [:]; all[date] = .object(rec); self["dayClosings"] = .object(all)
    }

    /// 日締めジャーナル（新しい日から）
    func dayClosingJournal(today: String) -> [(date: String, record: JSONValue)] {
        let oldest = Dates.addDays(today, -6)
        return (root["dayClosings"]?.objectValue ?? [:]).filter { $0.key >= oldest && $0.key <= today && $0.value.objectValue != nil }
            .sorted { $0.key > $1.key }.map { ($0.key, $0.value) }
    }
}

public enum DayClosingError: LocalizedError {
    case range, time, incomplete, changed, reason
    public var errorDescription: String? {
        switch self {
        case .range: return "日締めは今日を含む直近7日間が対象です"
        case .time: return DayClosing.timeMessage
        case .incomplete: return "未照合の項目、または確認後に変更された項目があります"
        case .changed: return "承認記録が変わりました。最新の記録から確認し直してください"
        case .reason: return "取消理由と最終確認が必要です"
        }
    }
}
