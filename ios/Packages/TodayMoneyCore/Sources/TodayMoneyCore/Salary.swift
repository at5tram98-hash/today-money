import Foundation

/// 給与・入金の計算（Web 版 03-ledger.js・18-salary-dashboard.js・09-accounts-and-payroll.js と同じ規則）
public enum Payroll {
    /// 勤務先の給料日（Web 版 `employerPayDate`）：勤務対象月の payMonthOffset か月後の payDay 日（payType が月末なら月末）
    public static func payDate(_ e: Employer, workMonth: String) -> String {
        let target = Dates.addMonths(workMonth, e.payMonthOffset)
        let last = Dates.daysInMonth(target)
        let day = e.payType == "month_end" ? last : min(last, max(1, e.payDay == 0 ? 1 : e.payDay))
        return "\(target)-\(Dates.pad(day))"
    }

    /// そのシフトの日が何月の勤務分か（Web 版 `shiftWorkMonth`）。日締めなら締め日の翌日から翌月分
    public static func workMonth(_ e: Employer?, date: String) -> String {
        let month = String(date.prefix(7))
        guard let e, e.closingType == "day" else { return month }
        let c = min(31, max(1, e.closingDay == 0 ? 15 : e.closingDay))
        return Dates.parts(date).d > c ? Dates.addMonths(month, 1) : month
    }
}

public enum SalaryStatus: String, Sendable {
    case received = "入金済み"
    case overdue = "入金日を過ぎた未確認"
    case planned = "入金予定"
}

/// 1か月の給与のまとめ（Web 版 `mm3SalaryMonthSummary`）
public struct SalaryMonthSummary: Equatable, Sendable {
    public var month: String
    public var records: [SalaryRecord]
    public var temps: [TempIncome]
    public var received: Double
    public var overdue: Double
    public var planned: Double
    public var total: Double { received + overdue + planned }
    public var tempTotal: Double
}

public extension MoneyDocument {
    func linkedIncome(for r: SalaryRecord) -> Income? { incomes.first { $0.salaryRecordId == r.id } }
    func linkedIncome(for t: TempIncome) -> Income? {
        let list = incomes
        return list.first { !t.incomeId.isEmpty && $0.id == t.incomeId } ?? list.first { $0.tempIncomeId == t.id }
    }

    /// 入金済みなら実際の入金日、それ以外は予定の入金日（Web 版 `salaryRecordEffectiveDate`）
    func effectiveDate(_ r: SalaryRecord) -> String {
        guard r.status == "入金済" else { return r.date }
        if !r.actualReceivedDate.isEmpty { return r.actualReceivedDate }
        if let d = linkedIncome(for: r)?.date, !d.isEmpty { return d }
        return r.date
    }

    func status(_ r: SalaryRecord, today: String = Dates.ymd()) -> SalaryStatus {
        if r.status == "入金済" { return .received }
        if !r.date.isEmpty && r.date < today { return .overdue }
        return .planned
    }
    func status(_ t: TempIncome, today: String = Dates.ymd()) -> SalaryStatus {
        if let inc = linkedIncome(for: t), inc.bankApplied || inc.bankReconciled || inc.receivedConfirmed { return .received }
        if t.receivedConfirmed { return .received }
        if !t.date.isEmpty && t.date < today { return .overdue }
        return .planned
    }

    /// 実際に受け取った額（Web 版 `salaryRecordCashAmount`）
    func cashAmount(_ r: SalaryRecord) -> Double {
        if let x = r.receivedAmount, x > 0 { return x }
        if r.status == "入金済", let a = linkedIncome(for: r)?.amount, a > 0 { return a }
        return max(0, r.gross)
    }
    func expectedOrReceived(_ r: SalaryRecord, today: String = Dates.ymd()) -> Double {
        status(r, today: today) == .received ? cashAmount(r) : max(0, r.gross)
    }

    /// その月に表示する給与（予定の入金日の月。入金済みにして実際の入金日が別の月になっても動かない）
    func salaryRecords(payableIn month: String) -> [SalaryRecord] {
        salaryRecords.filter { String((($0.date.isEmpty ? effectiveDate($0) : $0.date)).prefix(7)) == month }
    }
    func salaryMonthRows(_ month: String) -> [SalaryRecord] {
        salaryRecords(payableIn: month).sorted { effectiveDate($0) < effectiveDate($1) }
    }

    func salarySummary(_ month: String, today: String = Dates.ymd()) -> SalaryMonthSummary {
        let records = salaryMonthRows(month)
        let temps = tempIncomes.filter { $0.date.hasPrefix(month) }
        var received = 0.0, overdue = 0.0, planned = 0.0
        for r in records {
            switch status(r, today: today) {
            case .received: received += cashAmount(r)
            case .overdue: overdue += max(0, r.gross)
            case .planned: planned += max(0, r.gross)
            }
        }
        for t in temps {
            let a = max(0, t.amount)
            switch status(t, today: today) {
            case .received: received += a
            case .overdue: overdue += a
            case .planned: planned += a
            }
        }
        return SalaryMonthSummary(month: month, records: records, temps: temps, received: received, overdue: overdue, planned: planned,
                                  tempTotal: temps.reduce(0) { $0 + max(0, $1.amount) })
    }

    /// 次の入金（その月の、まだ受け取っていない給与・臨時収入のうち一番近いもの）
    func nextSalaryEvent(_ month: String, today: String = Dates.ymd()) -> (date: String, name: String, amount: Double)? {
        let s = salarySummary(month, today: today)
        var c: [(String, String, Double)] = []
        for r in s.records {
            let d = effectiveDate(r)
            if !d.isEmpty, status(r, today: today) != .received, month > String(today.prefix(7)) || d >= today {
                c.append((d, employer(r.employerId)?.name ?? "給与", max(0, r.gross)))
            }
        }
        for t in s.temps where !t.date.isEmpty && status(t, today: today) != .received && (month > String(today.prefix(7)) || t.date >= today) {
            c.append((t.date, t.sourceName.isEmpty ? "臨時収入" : t.sourceName, max(0, t.amount)))
        }
        return c.sorted { $0.0 < $1.0 }.first.map { (date: $0.0, name: $0.1, amount: $0.2) }
    }
}

// MARK: - 支出・資産

public extension MoneyDocument {
    func transactions(on date: String) -> [Transaction] { transactions.filter { $0.date == date } }
    func transactions(inMonth month: String) -> [Transaction] { transactions.filter { $0.date.hasPrefix(month) } }

    /// 月の支出（手直しがあればその値。Web 版 `spentMonth`）
    func spentMonth(_ month: String) -> Double {
        if let c = monthlyCorrection(month) { return c }
        return transactions(inMonth: month).reduce(0) { $0 + $1.amount }
    }
    func spentDay(_ date: String) -> Double { transactions(on: date).reduce(0) { $0 + $1.amount } }

    /// 口座残高の合計（Web 版 `totalBankBalance`）
    var totalBankBalance: Double { banks.reduce(0) { $0 + $1.balance } }
}
