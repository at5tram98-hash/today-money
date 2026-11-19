import Foundation

/// 給与画面の数字（Web 版 18-salary-dashboard.js・22-ui-actions.js）
public struct SalaryShare: Equatable, Sendable, Identifiable {
    /// 勤務先の id、または "temp"（臨時収入）
    public var id: String
    public var name: String
    public var amount: Double
    /// 合計がちょうど100になる割合（Web 版 mm3SalaryComposition の丸め）
    public var pct: Int
    public var isTemp: Bool { id == "temp" }
}

public struct SalaryEmployerRow: Equatable, Sendable, Identifiable {
    public var employer: Employer
    public var records: [SalaryRecord]
    public var amount: Double
    public var status: String
    public var date: String
    public var pct: Int
    /// 直近6か月の支払い（Web 版 mm3SalaryEmployerSeries）
    public var series: [Double]
    public var id: String { employer.id }
}

public extension MoneyDocument {
    /// 前月との差（Web 版 mm3SalaryMonthDelta）
    func salaryMonthDelta(_ month: String, today: String) -> (prev: Double, diff: Double, pct: Double?) {
        let total = salarySummary(month, today: today).total
        let prev = salarySummary(Dates.addMonths(month, -1), today: today).total
        return (prev, total - prev, prev > 0 ? (total - prev) / prev * 100 : nil)
    }

    /// 勤務先別の構成（Web 版 mm3SalaryComposition）
    func salaryComposition(_ month: String, today: String) -> [SalaryShare] {
        let s = salarySummary(month, today: today)
        var items = employers.map { e -> SalaryShare in
            let amount = s.records.filter { $0.employerId == e.id }.reduce(0) { $0 + expectedOrReceived($1, today: today) }
            return SalaryShare(id: e.id, name: e.name, amount: amount, pct: 0)
        }.filter { $0.amount > 0 }
        if s.tempTotal > 0 { items.append(SalaryShare(id: "temp", name: "臨時収入", amount: s.tempTotal, pct: 0)) }
        let total = items.reduce(0) { $0 + $1.amount }
        guard total > 0 else { return items }
        let raw = items.map { $0.amount / total * 100 }
        for i in items.indices { items[i].pct = Int(raw[i].rounded(.down)) }
        let remain = 100 - items.reduce(0) { $0 + $1.pct }
        let order = items.indices.sorted { a, b in
            let ra = raw[a] - Double(items[a].pct), rb = raw[b] - Double(items[b].pct)
            return ra != rb ? ra > rb : a < b
        }
        for i in order.prefix(max(0, remain)) { items[i].pct += 1 }
        return items
    }

    /// 勤務先の給与の状態（Web 版 salaryGroupDisplayStatus）
    func salaryGroupStatus(_ records: [SalaryRecord], today: String) -> String {
        guard !records.isEmpty else { return "未登録" }
        let st = records.map { status($0, today: today) }
        if st.allSatisfy({ $0 == .received }) { return SalaryStatus.received.rawValue }
        if st.contains(.overdue) { return SalaryStatus.overdue.rawValue }
        if st.contains(.received) { return "一部入金済み" }
        return SalaryStatus.planned.rawValue
    }

    /// 勤務先ごとの行（Web 版 mm3SalaryWatchlistHtml）
    func salaryEmployerRows(_ month: String, today: String) -> [SalaryEmployerRow] {
        let s = salarySummary(month, today: today)
        let pct = Dictionary(uniqueKeysWithValues: salaryComposition(month, today: today).filter { !$0.isTemp }.map { ($0.id, $0.pct) })
        return employers.map { e in
            let recs = s.records.filter { $0.employerId == e.id }
            let amount = recs.reduce(0) { $0 + expectedOrReceived($1, today: today) }
            let next = recs.first { status($0, today: today) != .received } ?? recs.first
            let date = next.map { r in let d = effectiveDate(r); return d.isEmpty ? r.date : d } ?? ""
            let series = (0..<6).map { i -> Double in
                let m = Dates.addMonths(month, i - 5)
                return salaryRecords(payableIn: m).filter { $0.employerId == e.id }.reduce(0) { $0 + expectedOrReceived($1, today: today) }
            }
            return SalaryEmployerRow(employer: e, records: recs, amount: amount, status: salaryGroupStatus(recs, today: today), date: date, pct: pct[e.id] ?? 0, series: series)
        }
    }

    /// 給与推移の月（Web 版 mm3SalaryRangeMonths：1M/3M/6M/1Y/ALL）
    func salaryRangeMonths(_ end: String, range: String) -> [String] {
        var count = ["1M": 1, "3M": 3, "6M": 6, "1Y": 12][range] ?? 3
        if range == "ALL" {
            let months = (salaryRecords.map { String(effectiveDate($0).prefix(7)) } + tempIncomes.map { String($0.date.prefix(7)) }).filter { !$0.isEmpty }.sorted()
            if let first = months.first {
                let e = Dates.parts(end + "-01"), s = Dates.parts(first + "-01")
                count = max(1, (e.y - s.y) * 12 + (e.m - s.m) + 1)
            }
        }
        return (0..<count).map { Dates.addMonths(end, $0 - count + 1) }
    }

    func salaryTrend(_ end: String, range: String, today: String) -> [ValuePoint] {
        salaryRangeMonths(end, range: range).map { ValuePoint(date: $0 + "-01", value: salarySummary($0, today: today).total) }
    }
}
