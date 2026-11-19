import Foundation

/// iOS だけの詳しい画面（1日の支出・今月の比較・カテゴリ詳細）の数字。
/// Web 版には同じ画面がないので、Web 版と同じ取引・目標のデータから計算する。
public struct NamedAmount: Equatable, Sendable, Identifiable {
    public var name: String
    public var amount: Double
    public var count: Int
    public var id: String { name }
    public init(name: String, amount: Double, count: Int = 0) { self.name = name; self.amount = amount; self.count = count }
}

public struct DayInsight: Equatable, Sendable {
    public var date: String
    public var spent: Double
    public var goal: Double
    /// 同じ曜日（前の8週）の平均。記録のある週だけ
    public var weekdayAverage: Double?
    /// 前の30日の1日平均（記録のある日がなければ nil）
    public var recentAverage: Double?
    /// この日までの14日
    public var last14: [ValuePoint]
    public var categories: [NamedAmount]
    /// 日の目標のカテゴリ別の枠
    public var categoryGoals: [String: Double]
}

public struct MonthPace: Equatable, Sendable {
    public var month: String, prev: String
    /// 1日目からの累計（今月は今日まで）
    public var current: [ValuePoint]
    public var previous: [ValuePoint]
    /// 比べる日（今月なら今日の日、過去の月なら月末）
    public var day: Int
    public var currentToDay: Double, previousToDay: Double
    public var currentTotal: Double, previousTotal: Double
    /// カテゴリごとの今月と、先月の同じ日まで
    public var categories: [(name: String, current: Double, previous: Double)]
    public static func == (a: MonthPace, b: MonthPace) -> Bool {
        a.month == b.month && a.current == b.current && a.previous == b.previous && a.day == b.day
            && a.categories.map { "\($0.name)|\($0.current)|\($0.previous)" } == b.categories.map { "\($0.name)|\($0.current)|\($0.previous)" }
    }
}

public struct CategoryInsight: Equatable, Sendable {
    public var name: String
    public var month: String
    public var amount: Double
    public var count: Int
    /// 月の目標のこのカテゴリの枠（なければ 0）
    public var budget: Double
    /// 月の支出の中の割合（%）
    public var share: Double
    /// 6か月（古い順、最後が month）
    public var series: [ValuePoint]
    /// 前の5か月のうち支出のあった月の平均（なければ 0）
    public var sixMonthAverage: Double
    public var merchants: [NamedAmount]
}

public extension MoneyDocument {
    /// 1日の支出の詳しい数字
    func dayInsight(_ date: String) -> DayInsight {
        let txs = transactions(on: date)
        var weekday: [Double] = []
        for w in 1...8 {
            let d = Dates.addDays(date, -7 * w)
            let t = transactions(on: d)
            if !t.isEmpty { weekday.append(t.reduce(0) { $0 + $1.amount }) }
        }
        var recentTotal = 0.0, recordedDays = 0
        for i in 1...30 {
            let t = transactions(on: Dates.addDays(date, -i))
            if !t.isEmpty { recordedDays += 1 }
            recentTotal += t.reduce(0) { $0 + $1.amount }
        }
        let last14 = (0..<14).map { i -> ValuePoint in let d = Dates.addDays(date, i - 13); return ValuePoint(date: d, value: spentDay(d)) }
        let goals = (root["dailyGoals"]?[date]?["categories"]?.objectValue ?? [:]).mapValues { num($0) }.filter { $0.value > 0 }
        return DayInsight(date: date, spent: spentDay(date), goal: dailyGoal(date),
                          weekdayAverage: weekday.isEmpty ? nil : weekday.reduce(0, +) / Double(weekday.count),
                          recentAverage: recordedDays == 0 ? nil : recentTotal / 30,
                          last14: last14, categories: categoryTotals(txs), categoryGoals: goals)
    }

    /// 今月と先月を同じ日で比べる
    func monthPace(_ month: String, today: String) -> MonthPace {
        let prev = Dates.addMonths(month, -1)
        let thisMonth = String(today.prefix(7))
        let lastDay = month == thisMonth ? Dates.parts(today).d : month < thisMonth ? Dates.daysInMonth(month) : 0
        func cumulative(_ m: String, through: Int) -> [ValuePoint] {
            var sum = 0.0, out: [ValuePoint] = []
            guard through > 0 else { return [] }
            for d in 1...through {
                let ds = "\(m)-\(Dates.pad(d))"
                sum += spentDay(ds)
                out.append(ValuePoint(date: ds, value: sum))
            }
            return out
        }
        let cur = cumulative(month, through: lastDay)
        let prevAll = cumulative(prev, through: Dates.daysInMonth(prev))
        let cmpDay = min(lastDay, Dates.daysInMonth(prev))
        var cats: [(name: String, current: Double, previous: Double)] = []
        let prevCut = cmpDay > 0 ? "\(prev)-\(Dates.pad(cmpDay))" : ""
        let prevTxs = transactions(inMonth: prev).filter { $0.date <= prevCut }
        for c in categories {
            let a = categorySpent(month: month, category: c.name)
            let b = prevTxs.filter { $0.category == c.name }.reduce(0.0) { $0 + $1.amount }
            if a != 0 || b != 0 { cats.append((c.name, a, b)) }
        }
        cats.sort { abs($0.current - $0.previous) > abs($1.current - $1.previous) }
        let prevToDay: Double = cmpDay > 0 ? prevAll[cmpDay - 1].value : 0
        let curTotal = transactions(inMonth: month).reduce(0.0) { $0 + $1.amount }
        let prevTotal = transactions(inMonth: prev).reduce(0.0) { $0 + $1.amount }
        return MonthPace(month: month, prev: prev, current: cur, previous: prevAll, day: lastDay,
                         currentToDay: cur.last?.value ?? 0, previousToDay: prevToDay,
                         currentTotal: curTotal, previousTotal: prevTotal,
                         categories: cats)
    }

    /// カテゴリの詳しい数字
    func categoryInsight(_ name: String, month: String) -> CategoryInsight {
        let txs = transactions(inMonth: month).filter { $0.category == name }
        let amount = txs.reduce(0) { $0 + $1.amount }
        let monthTotal = transactions(inMonth: month).reduce(0) { $0 + $1.amount }
        let series = (0..<6).map { i -> ValuePoint in
            let m = Dates.addMonths(month, i - 5)
            return ValuePoint(date: m, value: categorySpent(month: m, category: name))
        }
        var by: [String: (Double, Int, Int)] = [:]
        for (i, t) in txs.enumerated() {
            let k = t.merchant.trimmingCharacters(in: .whitespaces).isEmpty ? "（店名なし）" : t.merchant
            let o = by[k] ?? (0, 0, i)
            by[k] = (o.0 + t.amount, o.1 + 1, o.2)
        }
        let merchants = by.sorted { $0.value.0 != $1.value.0 ? $0.value.0 > $1.value.0 : $0.value.2 < $1.value.2 }
            .map { NamedAmount(name: $0.key, amount: $0.value.0, count: $0.value.1) }
        return CategoryInsight(name: name, month: month, amount: amount, count: txs.count,
                               budget: num(root["monthlyGoals"]?[month]?["categories"]?[name]),
                               share: monthTotal > 0 ? amount / monthTotal * 100 : 0,
                               series: series, sixMonthAverage: { let past = series.dropLast().filter { $0.value > 0 }; return past.isEmpty ? 0 : past.reduce(0) { $0 + $1.value } / Double(past.count) }(),
                               merchants: merchants)
    }

    /// カテゴリごとの合計（カテゴリの並び順、0 は除く）
    func categoryTotals(_ txs: [Transaction]) -> [NamedAmount] {
        var order = categories.map(\.name)
        for t in txs where !order.contains(t.category) { order.append(t.category) }
        return order.map { n in
            let l = txs.filter { $0.category == n }
            return NamedAmount(name: n, amount: l.reduce(0) { $0 + $1.amount }, count: l.count)
        }.filter { $0.amount != 0 }.sorted { $0.amount > $1.amount }
    }
}
