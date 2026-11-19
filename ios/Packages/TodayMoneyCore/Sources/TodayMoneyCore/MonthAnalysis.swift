import Foundation

/// 月間詳細分析（Web 版 openMonthAnalysis・planVsActualForMonth）
public struct MonthAnalysis: Equatable, Sendable {
    public struct CategoryRow: Equatable, Sendable, Identifiable { public var name: String; public var value: Double; public var prev: Double; public var color: String; public var id: String { name } }
    /// 計画・実績・今日までの想定・差（想定が無ければ差は0）
    public var plan: Double, actual: Double, expected: Double, variance: Double
    /// 過去3か月（2か月前・先月・この月）
    public var months: [ValuePoint]
    /// 前月比・前年同月比（%・四捨五入。比べられない時は nil）
    public var change: Int?, yoy: Int?
    public var categories: [CategoryRow]
    public var top: [Transaction]
    /// 前月の1.4倍以上に増えたカテゴリ
    public var surging: [CategoryRow]
}

public extension MoneyDocument {
    func monthAnalysis(_ month: String, today: String) -> MonthAnalysis {
        let thisMonth = String(today.prefix(7))
        let limit = month < thisMonth ? Dates.daysInMonth(month) : month > thisMonth ? 0 : Dates.parts(today).d
        let expected = limit > 0 ? (1...limit).reduce(0) { $0 + dayGoalForMonth(month, day: $1) } : 0
        let actual = spentMonth(month)
        let prevMonth = Dates.addMonths(month, -1)
        let prev = spentMonth(prevMonth), yearAgo = spentMonth(Dates.addMonths(month, -12))
        func pct(_ a: Double, _ b: Double) -> Int { Int(((a - b) / b * 100).rounded(.toNearestOrAwayFromZero)) }
        let txs = transactions(inMonth: month), prevTxs = transactions(inMonth: prevMonth)
        let cats = categories.enumerated().map { i, c in
            (i, MonthAnalysis.CategoryRow(name: c.name, value: txs.filter { $0.category == c.name }.reduce(0) { $0 + $1.amount },
                                          prev: prevTxs.filter { $0.category == c.name }.reduce(0) { $0 + $1.amount }, color: c.color))
        }
        let sorted = cats.sorted { $0.1.value != $1.1.value ? $0.1.value > $1.1.value : $0.0 < $1.0 }.map(\.1)
        let top = txs.enumerated().sorted { abs($0.element.amount) != abs($1.element.amount) ? abs($0.element.amount) > abs($1.element.amount) : $0.offset < $1.offset }.prefix(5).map(\.element)
        let surging = cats.map(\.1).filter { $0.prev != 0 && $0.value / $0.prev >= 1.4 }
        return MonthAnalysis(plan: monthlyGoalTotal(month), actual: actual, expected: expected, variance: expected != 0 ? actual - expected : 0,
                             months: [-2, -1, 0].map { let m = Dates.addMonths(month, $0); return ValuePoint(date: m + "-01", value: spentMonth(m)) },
                             change: prev != 0 ? pct(actual, prev) : (prev == 0 ? 0 : nil), yoy: yearAgo != 0 ? pct(actual, yearAgo) : nil,
                             categories: sorted, top: Array(top), surging: surging)
    }
}
