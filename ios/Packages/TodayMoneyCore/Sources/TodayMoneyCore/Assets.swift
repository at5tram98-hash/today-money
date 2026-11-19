import Foundation

/// 資産画面の数字（Web 版 20-assets-dashboard.js・12-salary-editors.js の口座詳細）
public struct ValuePoint: Equatable, Sendable, Identifiable {
    public var date: String
    public var value: Double
    public var id: String { date }
    public init(date: String, value: Double) { self.date = date; self.value = value }
}

public enum AssetRange: String, CaseIterable, Sendable, Identifiable {
    case w1 = "1W", m1 = "1M", m3 = "3M", m6 = "6M", y1 = "1Y", all = "ALL"
    public var id: String { rawValue }
    public var label: String { self == .all ? "全期間" : rawValue }
    /// Web 版 mm3AssetRangeDays
    public var days: Int? { switch self { case .w1: return 7; case .m1: return 31; case .m3: return 93; case .m6: return 186; case .y1: return 366; case .all: return nil } }
}

/// 口座の比較期間（Web 版 bankPeriodDays：1w/1m/3m/6m/1y）
public enum BankPeriod: String, CaseIterable, Sendable, Identifiable {
    case w1 = "1w", m1 = "1m", m3 = "3m", m6 = "6m", y1 = "1y"
    public var id: String { rawValue }
    public var days: Int { switch self { case .w1: return 7; case .m1: return 31; case .m3: return 93; case .m6: return 186; case .y1: return 366 } }
    public var label: String { switch self { case .w1: return "1週間"; case .m1: return "1か月"; case .m3: return "3か月"; case .m6: return "6か月"; case .y1: return "1年" } }
}

public struct AssetDelta: Equatable, Sendable { public var known: Bool; public var delta: Double; public var pct: Double? }

public struct BankActivity: Equatable, Sendable, Identifiable {
    public var date: String, createdAt: String, label: String, sub: String, amount: Double
    /// 取引なら transactionId、収入なら incomeId
    public var refId: String
    public var id: String { "\(refId)|\(date)|\(createdAt)" }
}

public struct BankDetail: Equatable, Sendable {
    public var bank: Bank
    public var points: [ValuePoint]
    public var delta: Double?
    public var related: [BankActivity]
    public var periodIn: Double, periodOut: Double, reserved: Double, free: Double
}

public extension MoneyDocument {
    private var snapshotRecords: [JSONValue] { root["assetSnapshots"]?.arrayValue ?? [] }

    /// 口座ごとの残高の履歴（Web 版 bankSnapshotSeries。今日から days 日前より後）
    func bankSnapshotSeries(_ bankId: String, days: Int = 365, today: String) -> [ValuePoint] {
        let cutoff = Dates.addDays(today, -days)
        struct Row { var date: String; var value: Double; var key: String; var index: Int }
        var rows: [Row] = []
        for s in snapshotRecords where str(s["bankId"]) == bankId {
            guard let v = s["bankBalance"], !v.isNull else { continue }
            let c = str(s["createdAt"]), d = str(s["date"])
            let date = d.isEmpty ? String(c.prefix(10)) : d
            guard !date.isEmpty, date > cutoff else { continue }
            rows.append(Row(date: date, value: num(v), key: date + (c.isEmpty ? d : c), index: rows.count))
        }
        rows.sort { $0.key != $1.key ? $0.key < $1.key : $0.index < $1.index }
        return rows.map { ValuePoint(date: $0.date, value: $0.value) }
    }

    /// 期間の最初と最後の差（Web 版 bankDeltaInfo）
    func bankDelta(_ bankId: String, days: Int = 31, today: String) -> Double? {
        let p = bankSnapshotSeries(bankId, days: days, today: today)
        guard p.count >= 2 else { return nil }
        return p[p.count - 1].value - p[0].value
    }

    /// 直近30日の預金の増減（Web 版 mm3AssetCurrentDelta）
    func assetCurrentDelta(today: String) -> AssetDelta {
        let ds = banks.compactMap { bankDelta($0.id, days: 31, today: today) }
        guard !ds.isEmpty else { return AssetDelta(known: false, delta: 0, pct: nil) }
        let delta = ds.reduce(0, +), base = totalBankBalance - delta
        return AssetDelta(known: true, delta: delta, pct: base > 0 ? delta / base * 100 : nil)
    }

    /// 預金合計の履歴（Web 版 mm3AssetAllHistoryPoints：全口座の最新がそろった時点の合計＋今日の残高）
    func assetHistoryPoints(today: String) -> [ValuePoint] {
        let ids = banks.map(\.id), idSet = Set(ids)
        func day(_ s: JSONValue) -> String { let d = str(s["date"]).isEmpty ? str(s["createdAt"]) : str(s["date"]); return String(d.prefix(10)) }
        let events = snapshotRecords.filter { !(str($0["date"]).isEmpty && str($0["createdAt"]).isEmpty) }
            .enumerated().sorted { a, b in
                let ka = str(a.element["date"]).isEmpty ? str(a.element["createdAt"]) : str(a.element["date"])
                let kb = str(b.element["date"]).isEmpty ? str(b.element["createdAt"]) : str(b.element["date"])
                if ka != kb { return ka < kb }
                if str(a.element["createdAt"]) != str(b.element["createdAt"]) { return str(a.element["createdAt"]) < str(b.element["createdAt"]) }
                return a.offset < b.offset
            }.map(\.element)
        var latest: [String: Double] = [:], points: [ValuePoint] = []
        for s in events {
            let date = day(s)
            guard !date.isEmpty else { continue }
            let bid = str(s["bankId"])
            if !bid.isEmpty, idSet.contains(bid), let v = s["bankBalance"], !v.isNull { latest[bid] = num(v) }
            var value: Double?
            if let t = s["bankTotal"], !t.isNull { value = num(t) }
            else if !ids.isEmpty, ids.allSatisfy({ latest[$0] != nil }) { value = ids.reduce(0) { $0 + (latest[$1] ?? 0) } }
            guard let v = value else { continue }
            if let last = points.last, last.date == date { points[points.count - 1].value = v } else { points.append(ValuePoint(date: date, value: v)) }
        }
        let current = totalBankBalance
        if points.isEmpty || points[points.count - 1].date < today { points.append(ValuePoint(date: today, value: current)) }
        else if points[points.count - 1].date == today { points[points.count - 1].value = current }
        return points.enumerated().sorted { $0.element.date != $1.element.date ? $0.element.date < $1.element.date : $0.offset < $1.offset }.map(\.element)
    }

    /// 選んだ期間の実績（Web 版 mm3AssetActualPoints）
    func assetActualPoints(_ range: AssetRange, today: String) -> [ValuePoint] {
        let all = assetHistoryPoints(today: today)
        guard let days = range.days else { return all }
        let cutoff = Dates.addDays(today, -days + 1)
        return all.filter { $0.date >= cutoff }
    }

    /// 選んだ期間の ACF 予測残高（Web 版 mm3AssetForecastPoints）
    func assetForecastPoints(_ range: AssetRange, today: String, now: Date = Date()) -> [ValuePoint] {
        let days = range.days ?? 366, end = Dates.addDays(today, max(1, days) - 1)
        let f = acfForecast(today: today, plan: [:], horizonEnd: end, lightweight: true, now: now)
        return f.rows.filter { $0.date >= today && $0.date <= end }.map { ValuePoint(date: $0.date, value: $0.forecastBalance) }
    }

    /// 残高のある口座の割合（Web 版 homeBankParts）
    var bankParts: [(name: String, value: Double)] {
        banks.map { (name: $0.name.isEmpty ? "口座" : $0.name, value: max(0, $0.balance)) }.filter { $0.value > 0 }
    }

    /// 口座の並べ方（Web 版 mm3AssetSortedBanks）
    func sortedBanks(_ mode: String) -> [Bank] {
        let list = banks.enumerated()
        let jp = Locale(identifier: "ja_JP")
        switch mode {
        case "balance-asc": return list.sorted { $0.element.balance != $1.element.balance ? $0.element.balance < $1.element.balance : $0.offset < $1.offset }.map(\.element)
        case "updated":
            return list.sorted { a, b in
                if a.element.balanceAsOf != b.element.balanceAsOf { return a.element.balanceAsOf > b.element.balanceAsOf }
                let c = a.element.name.compare(b.element.name, locale: jp)
                return c != .orderedSame ? c == .orderedAscending : a.offset < b.offset
            }.map(\.element)
        case "name":
            return list.sorted { a, b in let c = a.element.name.compare(b.element.name, locale: jp); return c != .orderedSame ? c == .orderedAscending : a.offset < b.offset }.map(\.element)
        default: return list.sorted { $0.element.balance != $1.element.balance ? $0.element.balance > $1.element.balance : $0.offset < $1.offset }.map(\.element)
        }
    }

    /// 口座の詳細（Web 版 bankDetailData）
    func bankDetail(_ bankId: String, period: BankPeriod, today: String) -> BankDetail? {
        guard let b = bank(bankId) else { return nil }
        let days = period.days
        let points = bankSnapshotSeries(bankId, days: days, today: today)
        let delta = points.count > 1 ? points[points.count - 1].value - points[0].value : nil
        let cutoff = Dates.addDays(today, -days)
        let out = transactions.filter { ($0.paymentMethod == "bank" && $0.paymentId == bankId) || ($0.paymentMethod == "debit" && $0.linkedBankId == bankId) }
            .map { BankActivity(date: $0.date, createdAt: $0.createdAt, label: $0.merchant, sub: $0.category, amount: -$0.amount, refId: $0.id) }
        let inc = incomes.filter { $0.toType == "bank" && $0.bankId == bankId }
            .map { BankActivity(date: $0.date, createdAt: str($0.raw["createdAt"]), label: $0.sourceName, sub: str($0.raw["kind"]) == "salary" ? "給与" : "収入", amount: $0.amount, refId: $0.id) }
        let related = (out + inc).enumerated().sorted { a, b in
            let ka = a.element.date + a.element.createdAt, kb = b.element.date + b.element.createdAt
            return ka != kb ? ka > kb : a.offset < b.offset
        }.map(\.element)
        let periodIn = inc.filter { $0.date > cutoff }.reduce(0) { $0 + $1.amount }
        let periodOut = abs(out.filter { $0.date > cutoff }.reduce(0) { $0 + $1.amount })
        let reserved = max(0, num(root["acfSettings"]?["reserveFloor"]))
        let free = max(0, b.balance - min(b.balance, reserved))
        return BankDetail(bank: b, points: points, delta: delta, related: related, periodIn: periodIn, periodOut: periodOut, reserved: reserved, free: free)
    }

    /// 残高履歴（Web 版 mm3OpenAssetHistory：新しい順に40件）
    func assetHistoryList(limit: Int = 40) -> [(bankName: String, date: String, memo: String, value: Double)] {
        snapshotRecords.enumerated().sorted { a, b in
            let ka = str(a.element["createdAt"]).isEmpty ? str(a.element["date"]) : str(a.element["createdAt"])
            let kb = str(b.element["createdAt"]).isEmpty ? str(b.element["date"]) : str(b.element["createdAt"])
            return ka != kb ? ka > kb : a.offset < b.offset
        }.prefix(limit).map { _, s in
            let v = s["bankBalance"].flatMap { $0.isNull ? nil : $0 } ?? s["bankTotal"]
            return (bank(str(s["bankId"]))?.name ?? "銀行残高", str(s["date"]), str(s["memo"]).isEmpty ? "残高更新" : str(s["memo"]), num(v))
        }
    }
}
