import Foundation

/// カード詳細の数字（Web 版 12-salary-editors.js cardDetailHtml まわり）
public struct CardMonthRow: Equatable, Sendable, Identifiable {
    public var month: String
    public var amount: Double
    public var status: StatementStatus
    public var count: Int
    public var id: String { month }
}

public struct CardBankHandling: Equatable, Sendable {
    /// "none" / "apply" / "reconciled"
    public var mode: String
    public var label: String
}

public extension MoneyDocument {
    /// 支払月の請求のまとめ（Web 版 cardStatementsAggregate）
    func cardStatementsAggregate(_ cardId: String, paymentMonth: String) -> (amount: Double, status: StatementStatus, count: Int, next: CardStatement?) {
        let items = statements(cardId, paymentMonth: paymentMonth)
        let amount = items.reduce(0) { $0 + $1.amount }
        let status: StatementStatus = !items.isEmpty && items.allSatisfy { $0.status == .paid } ? .paid
            : items.contains { $0.status == .confirmed } ? .confirmed : .estimated
        let unpaid = items.filter { $0.status != .paid }
        let next = (unpaid.isEmpty ? items : unpaid).enumerated().sorted {
            let a = $0.element.paymentDate.isEmpty ? "9999" : $0.element.paymentDate, b = $1.element.paymentDate.isEmpty ? "9999" : $1.element.paymentDate
            return a != b ? a < b : $0.offset < $1.offset
        }.first?.element
        return (amount, status, items.count, next)
    }

    /// 支払月ごとの請求の推移（Web 版 cardMonthHistory：選んだ月までの count か月）
    func cardMonthHistory(_ cardId: String, center: String, count: Int = 6) -> [CardMonthRow] {
        (0..<count).map { i in
            let m = Dates.addMonths(center, i - (count - 1))
            let a = cardStatementsAggregate(cardId, paymentMonth: m)
            return CardMonthRow(month: m, amount: a.amount, status: a.status, count: a.count)
        }
    }

    /// まだ払っていない請求の合計（Web 版 cardUnpaidEstimate）
    func cardUnpaidEstimate(_ cardId: String, today: String) -> Double {
        guard let card = card(cardId) else { return 0 }
        let thisMonth = String(today.prefix(7))
        var months: [String] = []
        func add(_ m: String) { if !months.contains(m) { months.append(m) } }
        for i in -11...3 { add(billingMonth(card, forPaymentMonth: Dates.addMonths(thisMonth, i))) }
        for key in (root["cardAdjustments"]?.objectValue ?? [:]).keys.sorted() where key.hasSuffix("|" + cardId) { add(String(key.prefix(7))) }
        for t in transactions where t.paymentMethod == "card" && t.paymentId == cardId { add(cardBillingMonth(card, purchase: t.date)) }
        var total = 0.0
        for bm in months {
            if cardAdjustment(cardId, billingMonth: bm)?.status == "paid" { continue }
            total += cardBillingAmount(cardId, billingMonth: bm)
        }
        return max(0, total)
    }

    /// 確定時の修正差額（Web 版 cardAdjustmentInfo().deltaAtEdit）
    func cardDeltaAtEdit(_ cardId: String, billingMonth: String) -> Double {
        guard let a = cardAdjustment(cardId, billingMonth: billingMonth) else { return 0 }
        if str(a.raw["mode"]) == "confirmed_total" { return num(a.raw["deltaAtEdit"]) }
        return a.confirmedTotal - a.baseAtEdit
    }

    /// 支払済みにした時に口座残高へどう反映したか（Web 版 cardStatementBankHandling）
    func cardBankHandling(_ cardId: String, billingMonth: String) -> CardBankHandling {
        let a = cardAdjustment(cardId, billingMonth: billingMonth)
        let bankId = (a?.bankIdAtPayment).flatMap { $0.isEmpty ? nil : $0 } ?? card(cardId)?.bankId ?? ""
        let b = bank(bankId)
        guard a?.status == "paid" else { return CardBankHandling(mode: "none", label: "未払い") }
        if a?.bankApplied == true { return CardBankHandling(mode: "apply", label: b.map { "\($0.name)の残高へ反映済み" } ?? "口座残高へ反映済み") }
        if a?.bankReconciled == true { return CardBankHandling(mode: "reconciled", label: b.map { "\($0.name)の現在残高に反映済み扱い" } ?? "現在残高に反映済み扱い") }
        return CardBankHandling(mode: "none", label: b != nil ? "口座残高は未反映" : "引落口座未設定・残高未反映")
    }

    /// 利用可能額の見通しの期限（Web 版：今月以降は支払月の月末、過去は今日）
    func cardExposureEnd(paymentMonth: String, today: String) -> String {
        paymentMonth >= String(today.prefix(7)) ? "\(paymentMonth)-\(Dates.pad(Dates.daysInMonth(paymentMonth)))" : today
    }
}
