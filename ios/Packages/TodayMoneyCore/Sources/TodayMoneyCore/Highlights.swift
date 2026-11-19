import Foundation

/// ホームのハイライト（Web 版 homeHighlights：比べて分かる短い文と2本の棒）
public struct Highlight: Equatable, Sendable, Identifiable {
    public struct Bar: Equatable, Sendable { public var label: String; public var value: Double; public var unit: String = "" }
    /// pace / average / category / balance
    public var key: String
    public var label: String
    public var text: String
    public var bars: [Bar]
    /// いちばん多いカテゴリの名前（category の時）
    public var category: String = ""
    /// 良い方向か（文の色に使う。iOS だけ）
    public var good: Bool
    public var id: String { key }
}

public extension MoneyDocument {
    func highlights(today: String) -> [Highlight] {
        let m = String(today.prefix(7)), pm = Dates.addMonths(m, -1)
        let day = Dates.parts(today).d, pdays = Dates.daysInMonth(pm), upto = min(day, pdays)
        func until(_ mk: String, _ n: Int) -> Double { n < 1 ? 0 : (1...n).reduce(0) { $0 + spent(on: "\(mk)-\(pad2($1))") } }
        let cur = until(m, day), prev = until(pm, upto)
        var out: [Highlight] = []
        if cur != 0 || prev != 0 {
            out.append(Highlight(key: "pace", label: "支出のペース",
                                 text: cur <= prev ? "今月は先月の同じ時期より \(Format.yen(prev - cur)) 少ないペースです。" : "今月は先月の同じ時期より \(Format.yen(cur - prev)) 多いペースです。",
                                 bars: [.init(label: Format.monthLabel(m), value: cur), .init(label: Format.monthLabel(pm), value: prev)], good: cur <= prev))
        }
        let avgCur = day > 0 ? (cur / Double(day)).rounded(.toNearestOrAwayFromZero) : 0
        let avgPrev = pdays > 0 ? (spentMonth(pm) / Double(pdays)).rounded(.toNearestOrAwayFromZero) : 0
        if avgCur != 0 || avgPrev != 0 {
            out.append(Highlight(key: "average", label: "1日の平均",
                                 text: avgCur <= avgPrev ? "今月の1日あたりの支出は先月より少なめです。" : "今月の1日あたりの支出は先月より多めです。",
                                 bars: [.init(label: Format.monthLabel(m), value: avgCur, unit: "/日"), .init(label: Format.monthLabel(pm), value: avgPrev, unit: "/日")], good: avgCur <= avgPrev))
        }
        let monthTotal = spentMonth(m)
        let monthTx = transactions(inMonth: m)
        var cats: [(i: Int, c: Category, v: Double)] = []
        for (i, c) in categories.enumerated() {
            let v = monthTx.filter { $0.category == c.name }.reduce(0) { $0 + $1.amount }
            if v > 0 { cats.append((i, c, v)) }
        }
        cats.sort { $0.v != $1.v ? $0.v > $1.v : $0.i < $1.i }
        if let top = cats.first {
            let pct = Int((top.v / max(1, monthTotal) * 100).rounded(.toNearestOrAwayFromZero))
            out.append(Highlight(key: "category", label: "いちばん多いカテゴリ", text: "今月は「\(top.c.name)」が支出の \(pct)% です。",
                                 bars: cats.prefix(2).map { .init(label: $0.c.name, value: $0.v) }, category: top.c.name, good: true))
        }
        let salary = salarySummary(m, today: today).total
        if salary != 0 {
            out.append(Highlight(key: "balance", label: "収入と支出",
                                 text: salary >= monthTotal ? "今月の給与見込みから支出を引くと \(Format.yen(salary - monthTotal)) 残ります。" : "今月の支出が給与見込みを \(Format.yen(monthTotal - salary)) 上回っています。",
                                 bars: [.init(label: "給与見込み", value: salary), .init(label: "支出", value: monthTotal)], good: salary >= monthTotal))
        }
        return out
    }
}
