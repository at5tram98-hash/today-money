import Foundation

/// PDF の家計レポートに載せる数字（Web 版 buildPdfReport）
public struct MonthReport: Equatable {
    public var month: String
    /// 日付順の支出（同じ日は記録順）
    public var transactions: [Transaction]
    public var income: Double
    /// 記録上の支出・手直し後の支出・その差
    public var rawSpent: Double, spent: Double, correction: Double
    /// 月の目標（0 は未設定）
    public var goal: Double
    /// 予定のままの大型支出
    public var largePlanned: Double
    /// 今月で ACF を使い始めている時だけ：月末予測と安全残高
    public var acfMonthEnd: Double?, acfReserveFloor: Double?

    public static let rowsPerPage = 24
    public var pageCount: Int { max(1, (transactions.count + Self.rowsPerPage - 1) / Self.rowsPerPage) }
    public func rows(page: Int) -> ArraySlice<Transaction> {
        let start = page * Self.rowsPerPage
        return transactions[min(start, transactions.count)..<min(start + Self.rowsPerPage, transactions.count)]
    }
}

public extension MoneyDocument {
    func monthReport(_ month: String, today: String, now: Date = Date()) -> MonthReport {
        let tx = transactions(inMonth: month).enumerated().sorted { a, b in
            a.element.date != b.element.date ? a.element.date < b.element.date : a.offset < b.offset
        }.map(\.element)
        let raw = tx.reduce(0) { $0 + $1.amount }
        let spent = spentMonth(month)
        var r = MonthReport(month: month, transactions: tx,
                            income: incomes.filter { $0.date.hasPrefix(month) }.reduce(0) { $0 + $1.amount },
                            rawSpent: raw, spent: spent, correction: spent - raw,
                            goal: monthlyGoalTotal(month),
                            largePlanned: largeExpensePlans.filter { $0.date.hasPrefix(month) && $0.status == "planned" }.reduce(0) { $0 + $1.amount })
        if month == String(today.prefix(7)), acfSettings.initialized {
            let f = acfForecast(today: today, lightweight: true, now: now)
            r.acfMonthEnd = f.monthEndForecast
            r.acfReserveFloor = f.reserveFloor
        }
        return r
    }
}
