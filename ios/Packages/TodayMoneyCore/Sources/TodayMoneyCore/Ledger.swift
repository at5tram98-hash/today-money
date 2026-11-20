import Foundation

/// 台帳の計算（Web 版 src/js/03-ledger.js と 19-payments-and-atf.js の支払い部分）。
/// 関数名・順序・端数の扱いは Web 版と同じにしてある（照合テスト LedgerCompatTests）。
public extension MoneyDocument {

    // MARK: 配列

    var cards: [Card] { get { records("cards") } set { setRecords("cards", newValue) } }
    var debitCards: [DebitCard] { get { records("debitCards") } set { setRecords("debitCards", newValue) } }
    var fixedPayments: [FixedPayment] { get { records("fixedPayments") } set { setRecords("fixedPayments", newValue) } }
    var largeExpensePlans: [LargeExpensePlan] { get { records("largeExpensePlans") } set { setRecords("largeExpensePlans", newValue) } }
    var categories: [Category] {
        get { let c: [Category] = records("categories"); return c.isEmpty ? DefaultCategories.all : c }
        set { setRecords("categories", newValue) }
    }

    func card(_ id: String) -> Card? { cards.first { $0.id == id } }
    func debit(_ id: String) -> DebitCard? { debitCards.first { $0.id == id } }
    func bank(_ id: String) -> Bank? { banks.first { $0.id == id } }

    /// Web 版 catByName：名前が一致しなければ最後のカテゴリ（その他）
    func category(named n: String) -> Category {
        let cs = categories
        return cs.first { $0.name == n } ?? cs.last ?? DefaultCategories.all[8]
    }

    // MARK: 支出

    /// Web 版 spentDate（日の手直しがあればそれ）
    func spent(on date: String) -> Double {
        if let v = root["dailyCorrections"]?[date], !v.isNull { return num(v) }
        return transactions(on: date).reduce(0) { $0 + $1.amount }
    }
    func incomes(inMonth month: String) -> [Income] { incomes.filter { $0.date.hasPrefix(month) } }
    func categorySpent(month: String, category: String) -> Double {
        transactions(inMonth: month).filter { $0.category == category }.reduce(0) { $0 + $1.amount }
    }

    // MARK: 口座

    /// Web 版 paymentBankId
    func paymentBankId(method: String, id: String) -> String {
        if method == "bank" { return id }
        if method == "debit" { return debit(id)?.bankId ?? bank(id)?.id ?? "" }
        return ""
    }
    func transactionBankId(_ t: Transaction) -> String {
        t.linkedBankId.isEmpty ? paymentBankId(method: t.paymentMethod, id: t.paymentId) : t.linkedBankId
    }

    // MARK: カードの締め・引落

    /// Web 版 billingCycleForCard：請求月 targetMonth に入る利用期間
    func billingCycle(_ card: Card?, month targetMonth: String) -> (start: String, end: String) {
        let last = Dates.daysInMonth(targetMonth)
        guard let card, let closing = card.closingDay, case .day(let raw) = closing else {
            return ("\(targetMonth)-01", "\(targetMonth)-\(pad2(last))")
        }
        let requested = min(max(raw == 0 ? last : raw, 1), 31)
        let close = min(requested, last)
        let prev = Dates.addMonths(targetMonth, -1)
        let prevClose = min(requested, Dates.daysInMonth(prev))
        return (Dates.addDays("\(prev)-\(pad2(prevClose))", 1), "\(targetMonth)-\(pad2(close))")
    }

    func cardTransactions(_ cardId: String, billingMonth: String) -> [Transaction] {
        let cycle = billingCycle(card(cardId), month: billingMonth)
        return transactions.filter { $0.paymentMethod == "card" && $0.paymentId == cardId && $0.date >= cycle.start && $0.date <= cycle.end }
    }
    func cardBaseUsage(_ cardId: String, billingMonth: String) -> Double {
        cardTransactions(cardId, billingMonth: billingMonth).reduce(0) { $0 + $1.amount }
    }
    func cardAdjustment(_ cardId: String, billingMonth: String) -> CardAdjustment? {
        CardAdjustment(root["cardAdjustments"]?["\(billingMonth)|\(cardId)"])
    }
    func cardUsage(_ cardId: String, billingMonth: String) -> Double {
        cardAdjustment(cardId, billingMonth: billingMonth)?.confirmedTotal ?? cardBaseUsage(cardId, billingMonth: billingMonth)
    }
    /// 請求額を確定した後に増えた利用（Web 版 cardNewUsageAfterConfirmation）
    func cardNewUsageAfterConfirmation(_ cardId: String, billingMonth: String) -> Double {
        guard let a = cardAdjustment(cardId, billingMonth: billingMonth) else { return 0 }
        let ids = Set(a.confirmedTransactionIds)
        let through = Dates.isYMD(a.confirmedThroughDate) ? a.confirmedThroughDate : ""
        let confirmedAt = ISODate.ms(a.confirmedAt.isEmpty ? a.updatedAt : a.confirmedAt)
        return cardTransactions(cardId, billingMonth: billingMonth).filter { t in
            if ids.contains(t.id) { return false }
            if !through.isEmpty && t.date <= through { return false }
            if !ids.isEmpty { return true }
            guard let c = confirmedAt, let created = ISODate.ms(t.createdAt.isEmpty ? t.updatedAt : t.createdAt) else { return false }
            return created > c
        }.reduce(0) { $0 + $1.amount }
    }
    /// Web 版 acfCardBillingAmount
    func cardBillingAmount(_ cardId: String, billingMonth: String) -> Double {
        max(0, cardUsage(cardId, billingMonth: billingMonth) + cardNewUsageAfterConfirmation(cardId, billingMonth: billingMonth))
    }

    /// 利用日 → 請求月（Web 版 cardBillingMonthForPurchase）
    func cardBillingMonth(_ card: Card?, purchase date: String) -> String {
        let month = String(date.prefix(7)), day = Dates.parts(date).d
        guard let card, let closing = card.closingDay, case .day(let raw) = closing else { return month }
        let last = Dates.daysInMonth(month)
        let close = min(min(max(raw == 0 ? last : raw, 1), 31), last)
        return day <= close ? month : Dates.addMonths(month, 1)
    }

    /// 請求月 → 引落日（Web 版 cardPaymentDateForBillingMonth）
    func cardPaymentDate(_ card: Card?, billingMonth: String) -> String? {
        guard let card, let dueRaw = card.dueDay else { return nil }
        let due = min(max(dueRaw == 0 ? 1 : dueRaw, 1), 31)
        var payMonth = billingMonth
        switch card.closingDay {
        case .monthEnd?: payMonth = Dates.addMonths(billingMonth, 1)
        case .day(let raw)?:
            let last = Dates.daysInMonth(billingMonth)
            let close = min(min(max(raw == 0 ? last : raw, 1), 31), last)
            if due <= close { payMonth = Dates.addMonths(billingMonth, 1) }
        case nil: break
        }
        return "\(payMonth)-\(pad2(min(due, Dates.daysInMonth(payMonth))))"
    }
    /// 手直しの引落日があればそれ（Web 版 acfEffectiveCardPaymentDate）
    func effectiveCardPaymentDate(_ card: Card?, billingMonth: String) -> String? {
        guard let card else { return nil }
        if let o = cardAdjustment(card.id, billingMonth: billingMonth)?.paymentDateOverride, !o.isEmpty { return o }
        return cardPaymentDate(card, billingMonth: billingMonth)
    }
    func statementStatus(_ cardId: String, billingMonth: String) -> StatementStatus {
        guard let a = cardAdjustment(cardId, billingMonth: billingMonth) else { return .estimated }
        return StatementStatus(rawValue: a.status) ?? .confirmed
    }
    func billingMonth(_ card: Card?, forPaymentMonth paymentMonth: String) -> String {
        guard let card else { return paymentMonth }
        for i in -2...1 {
            let bm = Dates.addMonths(paymentMonth, i)
            if let due = cardPaymentDate(card, billingMonth: bm), due.hasPrefix(paymentMonth) { return bm }
        }
        return paymentMonth
    }

    /// 支払日 → 請求月（Web 版 billingMonthForPaymentDate）
    func billingMonthForPaymentDate(_ card: Card?, date: String) -> String {
        let paymentMonth = date.count >= 7 ? String(date.prefix(7)) : Dates.ym()
        guard let card else { return paymentMonth }
        var exact: [String] = []
        for key in (root["cardAdjustments"]?.objectValue ?? [:]).keys {
            let p = key.split(separator: "|", maxSplits: 1).map(String.init)
            if p.count == 2, p[1] == card.id, cardAdjustment(card.id, billingMonth: p[0])?.paymentDateOverride == date { exact.append(p[0]) }
        }
        if let first = exact.sorted().first { return first }
        for i in -2...1 {
            let bm = Dates.addMonths(paymentMonth, i)
            if cardPaymentDate(card, billingMonth: bm) == date { return bm }
        }
        return billingMonth(card, forPaymentMonth: paymentMonth)
    }

    func statementItem(_ card: Card, billingMonth: String, paymentMonth: String) -> CardStatement {
        let adj = cardAdjustment(card.id, billingMonth: billingMonth)
        let date = (adj?.paymentDateOverride).flatMap { $0.isEmpty ? nil : $0 } ?? cardPaymentDate(card, billingMonth: billingMonth) ?? ""
        return CardStatement(cardId: card.id, cardName: card.name, billingMonth: billingMonth, paymentMonth: paymentMonth, paymentDate: date,
                             amount: cardBillingAmount(card.id, billingMonth: billingMonth), status: statementStatus(card.id, billingMonth: billingMonth),
                             base: cardBaseUsage(card.id, billingMonth: billingMonth), hasAdjustment: adj != nil,
                             newUse: cardNewUsageAfterConfirmation(card.id, billingMonth: billingMonth))
    }

    /// 支払月に引き落とされる請求（Web 版 cardStatementsForPaymentMonth）
    func statements(_ cardId: String, paymentMonth: String) -> [CardStatement] {
        guard let card = card(cardId) else { return [] }
        var candidates: [String] = [billingMonth(card, forPaymentMonth: paymentMonth)]
        for i in -12...2 { candidates.append(Dates.addMonths(paymentMonth, i)) }
        for key in (root["cardAdjustments"]?.objectValue ?? [:]).keys {
            let p = key.split(separator: "|", maxSplits: 1).map(String.init)
            if p.count == 2, p[1] == cardId { candidates.append(p[0]) }
        }
        var seen = Set<String>(), out: [CardStatement] = []
        for bm in candidates where seen.insert(bm).inserted {
            let item = statementItem(card, billingMonth: bm, paymentMonth: paymentMonth)
            if item.paymentDate.isEmpty || !item.paymentDate.hasPrefix(paymentMonth) { continue }
            out.append(item)
        }
        return out.sorted { ($0.paymentDate, $0.billingMonth) < ($1.paymentDate, $1.billingMonth) }
    }
    func statement(_ cardId: String, paymentMonth: String) -> CardStatement? {
        guard let card = card(cardId) else { return nil }
        let items = statements(cardId, paymentMonth: paymentMonth)
        if let p = items.first(where: { $0.amount > 0 }) { return p }
        if let f = items.first { return f }
        return statementItem(card, billingMonth: billingMonth(card, forPaymentMonth: paymentMonth), paymentMonth: paymentMonth)
    }
    /// Web 版 cardPaymentStatementsInMonth
    func cardPaymentStatements(inMonth paymentMonth: String, includePaid: Bool = false) -> [CardStatement] {
        var out: [CardStatement] = []
        for c in cards {
            let exact = statements(c.id, paymentMonth: paymentMonth)
            let items = exact.isEmpty ? [statement(c.id, paymentMonth: paymentMonth)].compactMap { $0 } : exact
            for st in items where st.amount > 0 && (includePaid || st.status != .paid) { out.append(st) }
        }
        return out.sorted(by: CardStatement.byDateName)
    }

    /// 次の引落日（Web 版 nextCardDueDate）
    func nextCardDueDate(_ card: Card?, from: String) -> String? {
        guard let card else { return nil }
        var best = ""
        for key in (root["cardAdjustments"]?.objectValue ?? [:]).keys {
            let p = key.split(separator: "|", maxSplits: 1).map(String.init)
            guard p.count == 2, p[1] == card.id, let d = effectiveCardPaymentDate(card, billingMonth: p[0]) else { continue }
            if d >= from && (best.isEmpty || d < best) { best = d }
        }
        if card.dueDay != nil {
            let base = String(from.prefix(7))
            for i in -1...3 {
                if let d = effectiveCardPaymentDate(card, billingMonth: Dates.addMonths(base, i)), d >= from, best.isEmpty || d < best { best = d }
            }
        }
        return best.isEmpty ? nil : best
    }

    // MARK: 固定支払い

    /// Web 版 fixedDueOn
    func fixedDue(_ f: FixedPayment, on date: String) -> Bool {
        let month = String(date.prefix(7)), day = Dates.parts(date).d
        let start = f.startMonth.isEmpty ? month : f.startMonth
        if month < start { return false }
        let (y, m, _) = Dates.parts(month + "-01")
        let due = min(max(1, f.day == 0 ? 1 : f.day), Dates.daysInMonth(month))
        if day != due { return false }
        if f.frequency == "yearly" {
            let startM = Int(start.dropFirst(5).prefix(2)) ?? 0
            return m == (f.annualMonth != 0 ? f.annualMonth : (startM != 0 ? startM : 1))
        }
        if f.frequency == "bimonthly" {
            let s = Dates.parts(start + "-01")
            let diff = (y - s.y) * 12 + (m - s.m)
            return diff >= 0 && diff % 2 == 0
        }
        return true
    }
    func fixedDueDates(_ f: FixedPayment, month: String) -> [String] {
        (1...Dates.daysInMonth(month)).map { "\(month)-\(pad2($0))" }.filter { fixedDue(f, on: $0) }
    }
    /// 月の固定支払い（飛ばした日を除く）（Web 版 fixedScheduledInMonth）
    func fixedScheduled(month: String) -> [(f: FixedPayment, dates: [String])] {
        fixedPayments.map { f in (f, fixedDueDates(f, month: month).filter { !f.skippedDates.contains($0) }) }.filter { !$0.1.isEmpty }
    }
    func fixedRecorded(_ f: FixedPayment, date: String) -> Bool {
        transactions.contains { $0.source == "fixed" && $0.fixedId == f.id && $0.date == date }
    }

    // MARK: 大型支出

    func largeExpenseParts(_ p: LargeExpensePlan) -> [LargeExpensePart] {
        let s = p.splits.filter { $0.amount > 0 }
        return s.isEmpty ? [LargeExpensePart(paymentMethod: p.paymentMethod, paymentId: p.paymentId, linkedBankId: p.linkedBankId, amount: p.amount)] : s
    }
    func largeExpensePartTransaction(_ p: LargeExpensePlan, part: LargeExpensePart, index: Int) -> Transaction? {
        let txs = transactions
        if index < p.linkedTransactionIds.count, let t = txs.first(where: { $0.id == p.linkedTransactionIds[index] }) { return t }
        if index == 0, !p.linkedTransactionId.isEmpty, let t = txs.first(where: { $0.id == p.linkedTransactionId }) { return t }
        if let t = txs.first(where: { $0.largePlanId == p.id && ($0.largePlanPartIndex == nil || $0.largePlanPartIndex == index) }) { return t }
        let key = Self.merchantKey(p.name)
        guard !key.isEmpty else { return nil }
        return txs.first { $0.date == p.date && abs(abs($0.amount) - abs(part.amount)) < 1 && $0.paymentMethod == part.paymentMethod
            && $0.paymentId == part.paymentId && Self.merchantKey($0.merchant) == key }
    }
    /// まだ記録していない支払い方法（Web 版 largeExpensePendingParts）
    func largeExpensePendingParts(_ p: LargeExpensePlan) -> [(part: LargeExpensePart, index: Int)] {
        largeExpenseParts(p).enumerated().filter { largeExpensePartTransaction(p, part: $0.element, index: $0.offset) == nil }.map { ($0.element, $0.offset) }
    }
    func largeExpensePaymentLabel(_ p: LargeExpensePlan) -> String {
        let parts = largeExpenseParts(p)
        if parts.count > 1 { return "分割払い（\(parts.count)件）" }
        return paymentLabel(method: p.paymentMethod, id: p.paymentId)
    }
    func paymentLabel(method: String, id: String) -> String {
        switch method {
        case "card": return card(id)?.name ?? "クレジットカード"
        case "debit": return debit(id)?.name ?? "デビットカード"
        case "bank": return bank(id)?.name ?? "銀行口座"
        default: return "現金・その他"
        }
    }
    /// Web 版 normalizeMerchantKey
    static func merchantKey(_ v: String) -> String {
        let drop = Set(" \u{3000}・･ー-_/\\()（）[]【】")
        return String(v.lowercased().filter { !drop.contains($0) && !$0.isWhitespace })
    }

    // MARK: ATF / ACF の設定（Web 版 mm3AtfOptions のうち支払いで使う部分）

    var atfBirthdayReduction: Double { max(0, min(15000, (num(root["atfSettings"]?["birthdayReduction"])).rounded())) }
    var atfBirthdayFee: Double { num(root["atfSettings"]?["birthdayFee"]) }

    /// Web 版 mm3AtfBirthdayAmount（初期データの誕生日の大型支出だけの調整）
    func atfPartAmount(_ part: LargeExpensePart, plan: LargeExpensePlan) -> Double {
        let raw = max(0, part.amount)
        return plan.id == "large_seed_birthday" && part.paymentId == "card_seed_merpay" ? max(0, raw - atfBirthdayReduction) : raw
    }

    // MARK: 支払い（Web 版 19-payments-and-atf.js）

    /// まだ記録していない固定支払い・必須の大型支出をカードの請求に足す（Web 版 acfPlannedCardExtrasForPaymentMonth）
    func plannedCardExtras(paymentMonth: String) -> [CardStatement] {
        var order: [String] = [], map: [String: CardStatement] = [:]
        func add(_ cardId: String, _ bm: String, _ due: String?, _ amount: Double, _ label: String) {
            let amount = max(0, amount)
            guard let due, !bm.isEmpty, due.hasPrefix(paymentMonth), amount > 0, let c = card(cardId) else { return }
            let key = "\(cardId)|\(bm)|\(due)"
            if map[key] == nil {
                order.append(key)
                map[key] = CardStatement(cardId: cardId, cardName: c.name, billingMonth: bm, paymentMonth: paymentMonth, paymentDate: due,
                                         amount: 0, status: .estimated, base: 0, hasAdjustment: false, newUse: 0, planned: true)
            }
            map[key]!.amount += amount
            if !label.isEmpty { map[key]!.plannedLabels.append(label) }
        }
        let scanStart = Dates.addMonths(paymentMonth, -12)
        for f in fixedPayments where f.paymentMethod == "card" && !f.paymentId.isEmpty {
            guard let c = card(f.paymentId) else { continue }
            var m = scanStart
            while m <= paymentMonth {
                for date in fixedDueDates(f, month: m) where !f.skippedDates.contains(date) && !fixedRecorded(f, date: date) {
                    let bm = cardBillingMonth(c, purchase: date)
                    add(c.id, bm, effectiveCardPaymentDate(c, billingMonth: bm), f.amount, f.name.isEmpty ? "固定支払い" : f.name)
                }
                m = Dates.addMonths(m, 1)
            }
        }
        for p in largeExpensePlans where p.status == "planned" && p.priority == "required" && !p.date.isEmpty {
            for (part, _) in largeExpensePendingParts(p) where part.paymentMethod == "card" && !part.paymentId.isEmpty && part.amount > 0 {
                guard let c = card(part.paymentId) else { continue }
                let bm = cardBillingMonth(c, purchase: p.date)
                let amount = atfPartAmount(part, plan: p)
                let count = max(1, min(6, p.atfInstallments[part.paymentId] ?? 1))
                for i in 0..<count {
                    let bill = Dates.addMonths(bm, i)
                    let due = effectiveCardPaymentDate(c, billingMonth: bill) ?? nextCardDueDate(c, from: p.date)
                    let a = Int(amount)
                    var share = Double(a / count + (i < a % count ? 1 : 0))
                    if i == 0 && (p.id != "large_seed_birthday" || part.paymentId == "card_seed_smbc") {
                        share += max(0, p.id == "large_seed_birthday" ? atfBirthdayFee : p.atfFee)
                    }
                    add(c.id, bill, due, share, p.name.isEmpty ? "大型支出" : p.name)
                }
            }
        }
        return order.compactMap { map[$0] }.sorted(by: CardStatement.byDateName)
    }

    /// カードの請求（予定を含む）（Web 版 mm3PaymentCardItems）
    func paymentCardItems(month: String) -> [CardStatement] { memo("items|\(month)") { computePaymentCardItems(month: month) } }

    private func computePaymentCardItems(month: String) -> [CardStatement] {
        var order: [String] = [], map: [String: CardStatement] = [:]
        for var st in cardPaymentStatements(inMonth: month, includePaid: true) {
            st.outstandingAmount = st.status == .paid ? 0 : st.amount
            st.baseStatus = st.status
            if map[st.key] == nil { order.append(st.key) }
            map[st.key] = st
        }
        for ex in plannedCardExtras(paymentMonth: month) {
            // 同じカード・同じ請求月の請求を探す（支払日を手で直していると key が違うので、請求月で合わせる）
            let sameBill = order.first { k in map[k].map { $0.cardId == ex.cardId && $0.billingMonth == ex.billingMonth && !$0.planned } ?? false }
            // 請求額を「確定」「支払済み」にした請求は、入力した金額がすべて。予定（未記録の固定支払いなど）を足さない
            // （Web 版 mm3PaymentCardItems は足してしまい、入力した額と違う金額になる）
            if let k = sameBill, let b = map[k], b.baseStatus == .confirmed || b.baseStatus == .paid { continue }
            if let k = sameBill, k != ex.key, var old = map[k] {
                let baseAmount = old.amount
                old.amount = baseAmount + ex.amount
                old.outstandingAmount = baseAmount + ex.amount
                old.plannedAmount += ex.amount
                old.plannedLabels += ex.plannedLabels
                old.status = .estimated
                map[k] = old
                continue
            }
            if var old = map[ex.key] {
                let baseStatus = old.baseStatus, baseAmount = old.amount
                old.settledBaseAmount = baseStatus == .paid ? baseAmount : 0
                old.amount = baseAmount + ex.amount
                old.outstandingAmount = (baseStatus == .paid ? 0 : baseAmount) + ex.amount
                old.plannedAmount += ex.amount
                old.plannedLabels += ex.plannedLabels
                old.status = .estimated
                map[ex.key] = old
            } else {
                var n = ex
                n.plannedAmount = ex.amount; n.outstandingAmount = ex.amount; n.baseStatus = .estimated
                order.append(n.key); map[n.key] = n
            }
        }
        return order.compactMap { map[$0] }.sorted(by: CardStatement.byDateName)
    }

    /// 支払いタブの月のまとめ（Web 版 mm3PaymentSummary）
    func paymentSummary(month: String, today: String) -> PaymentSummary { memo("summary|\(month)|\(today)") { computePaymentSummary(month: month, today: today) } }

    private func computePaymentSummary(month: String, today: String) -> PaymentSummary {
        let statements = paymentCardItems(month: month)
        let cardTotal = statements.reduce(0) { $0 + $1.amount }
        let cardPaid = statements.reduce(0) { acc, x in
            acc + (x.settledBaseAmount != 0 ? x.settledBaseAmount : (x.status == .paid ? max(0, x.amount - x.plannedAmount) : 0))
        }
        let fixedRows = fixedScheduled(month: month)
        let fixedCash = fixedRows.filter { $0.f.paymentMethod != "card" }
        let fixedTotal = fixedCash.reduce(0) { $0 + $1.f.amount * Double($1.dates.count) }
        let txs = transactions
        let fixedPaid = fixedCash.reduce(0) { acc, x in
            let n = x.dates.filter { d in txs.contains { $0.source == "fixed" && $0.fixedId == x.f.id && $0.date == d && ($0.bankApplied || $0.bankReconciled || x.f.paymentMethod == "other") } }.count
            return acc + Double(n) * x.f.amount
        }
        let large = largeExpensePlans.filter { $0.date.hasPrefix(month) && $0.status != "cancelled" && $0.status != "postponed" }
        let committed = large.filter { $0.status == "completed" || $0.priority == "required" }
        func cashAmount(_ p: LargeExpensePlan) -> Double {
            let parts = p.status == "completed" ? largeExpenseParts(p) : largeExpensePendingParts(p).map(\.part)
            return parts.filter { $0.paymentMethod != "card" }.reduce(0) { $0 + $1.amount }
        }
        let largeTotal = committed.reduce(0) { $0 + cashAmount($1) }
        let largePaid = committed.filter { $0.status == "completed" }.reduce(0) { acc, p in
            acc + largeExpenseParts(p).filter { $0.paymentMethod != "card" }.reduce(0) { $0 + $1.amount }
        }
        let otherTx = transactions(inMonth: month).filter { $0.paymentMethod != "card" && $0.source != "fixed" && $0.source != "large_plan" }
        let otherTotal = otherTx.reduce(0) { $0 + $1.amount }
        let otherPaid = otherTx.filter { $0.date <= today && ($0.paymentMethod == "other" || $0.bankApplied || $0.bankReconciled) }.reduce(0) { $0 + $1.amount }
        let total = cardTotal + fixedTotal + largeTotal + otherTotal
        let paid = cardPaid + fixedPaid + largePaid + otherPaid
        return PaymentSummary(month: month, statements: statements, cardTotal: cardTotal, cardPaid: cardPaid,
                              plannedCardTotal: statements.reduce(0) { $0 + $1.plannedAmount },
                              fixedRows: fixedRows, fixedTotal: fixedTotal, fixedPaid: fixedPaid,
                              large: large, largeTotal: largeTotal, largePaid: largePaid,
                              otherTx: otherTx, otherTotal: otherTotal, otherPaid: otherPaid,
                              total: total, paid: paid, remaining: max(0, total - paid))
    }

    /// 次の引落（Web 版 mm3PaymentNextCard）
    func paymentNextCard(_ s: PaymentSummary, today: String) -> CardStatement? {
        let thisMonth = String(today.prefix(7))
        let isCurrent = s.month == thisMonth, future = s.month > thisMonth
        return s.statements.filter { $0.outstandingAmount > 0 && ($0.paymentDate.isEmpty || future || !isCurrent || $0.paymentDate >= today) }
            .sorted(by: CardStatement.byDateName).first
    }

    /// カードごとの月の請求（予定を含む）の推移（Web 版 mm3PaymentCardSeries）
    func paymentCardSeries(_ cardId: String, month: String, count: Int = 6) -> [Double] {
        (0..<count).map { i in paymentCardItems(month: Dates.addMonths(month, i - count + 1)).filter { $0.cardId == cardId }.reduce(0) { $0 + $1.amount } }
    }

    // MARK: 予定の入出金（Web 版 financialEventsFrom）

    func financialEvents(from: String, days: Int = 90, today: String) -> [FinancialEvent] {
        memo("events|\(from)|\(days)|\(today)") { computeFinancialEvents(from: from, days: days, today: today) }
    }

    private func computeFinancialEvents(from: String, days: Int, today: String) -> [FinancialEvent] {
        let end = Dates.addDays(from, days)
        var events: [FinancialEvent] = []
        for e in salaryPaymentEvents(start: from, end: end, today: today) {
            let m = Int(e.workMonth.dropFirst(5).prefix(2)) ?? 0
            events.append(FinancialEvent(date: e.date, type: .income, title: "\(e.employerName)給与", amount: e.amount, detail: "\(m == 0 ? "" : String(m))月勤務分"))
        }
        let startMonth = String(from.prefix(7)), endMonth = String(end.prefix(7))
        var pm = startMonth
        while pm <= endMonth {
            for st in paymentCardItems(month: pm) {
                let amount = st.outstandingAmount
                if amount <= 0 || st.paymentDate.isEmpty || st.paymentDate < from || st.paymentDate > end { continue }
                events.append(FinancialEvent(date: st.paymentDate, type: .card, title: "\(st.cardName)支払", amount: -amount,
                                             detail: "\(Format.monthLabel(st.billingMonth))対象\(st.plannedAmount != 0 ? "・予定含む" : "")", cardId: st.cardId))
            }
            pm = Dates.addMonths(pm, 1)
        }
        for f in fixedPayments where f.paymentMethod != "card" {
            var d = from, i = 0
            while d <= end && i < min(370, days + 2) {
                if fixedDue(f, on: d) && !f.skippedDates.contains(d) && !fixedRecorded(f, date: d) {
                    events.append(FinancialEvent(date: d, type: .fixed, title: f.name.isEmpty ? "固定支払い" : f.name, amount: -f.amount, detail: "固定支払い"))
                }
                d = Dates.addDays(d, 1); i += 1
            }
        }
        for p in largeExpensePlans where p.status == "planned" && p.priority == "required" && p.date >= from && p.date <= end {
            for (part, _) in largeExpensePendingParts(p) where part.paymentMethod != "card" {
                var one = p; one.splits = [part]; one.paymentMethod = part.paymentMethod; one.paymentId = part.paymentId
                events.append(FinancialEvent(date: p.date, type: .large, title: p.name.isEmpty ? "大型支出" : p.name, amount: -part.amount,
                                             detail: "必須・\(largeExpensePaymentLabel(one))"))
            }
        }
        return events.enumerated().sorted { a, b in
            (a.element.date, a.element.type.order, a.offset) < (b.element.date, b.element.type.order, b.offset)
        }.map(\.element)
    }

    /// 給与の入金予定（Web 版 getSalaryPaymentEvents）
    func salaryPaymentEvents(start: String, end: String, today: String) -> [SalaryEvent] {
        salaryRecords.compactMap { r -> SalaryEvent? in
            let d = effectiveDate(r)
            guard !d.isEmpty, d >= start, d <= end else { return nil }
            let amount = expectedOrReceived(r, today: today)
            return SalaryEvent(date: d, recordId: r.id, employerId: r.employerId, employerName: employer(r.employerId)?.name ?? "給与", workMonth: r.month, amount: amount)
        }.enumerated().sorted { ($0.element.date, $0.offset) < ($1.element.date, $1.offset) }.map(\.element)
    }
}

func pad2(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }

/// カードの1回の請求
public struct CardStatement: Equatable, Sendable, Identifiable {
    public var cardId: String
    public var cardName: String
    public var billingMonth: String
    public var paymentMonth: String
    public var paymentDate: String
    public var amount: Double
    public var status: StatementStatus
    public var base: Double
    public var hasAdjustment: Bool
    public var newUse: Double
    public var planned: Bool = false
    public var plannedAmount: Double = 0
    public var plannedLabels: [String] = []
    public var outstandingAmount: Double = 0
    public var settledBaseAmount: Double = 0
    public var baseStatus: StatementStatus = .estimated

    public var key: String { "\(cardId)|\(billingMonth)|\(paymentDate)" }
    public var id: String { key }

    static func byDateName(_ a: CardStatement, _ b: CardStatement) -> Bool {
        let da = a.paymentDate.isEmpty ? "9999" : a.paymentDate, db = b.paymentDate.isEmpty ? "9999" : b.paymentDate
        if da != db { return da < db }
        let n = a.cardName.compare(b.cardName, locale: Locale(identifier: "ja"))
        if n != .orderedSame { return n == .orderedAscending }
        return a.billingMonth < b.billingMonth
    }
}

public struct PaymentSummary: Sendable {
    public var month: String
    public var statements: [CardStatement]
    public var cardTotal: Double
    public var cardPaid: Double
    public var plannedCardTotal: Double
    public var fixedRows: [(f: FixedPayment, dates: [String])]
    public var fixedTotal: Double
    public var fixedPaid: Double
    public var large: [LargeExpensePlan]
    public var largeTotal: Double
    public var largePaid: Double
    public var otherTx: [Transaction]
    public var otherTotal: Double
    public var otherPaid: Double
    public var total: Double
    public var paid: Double
    public var remaining: Double
}

public struct FinancialEvent: Equatable, Sendable, Identifiable {
    public enum Kind: String, Sendable { case income, card, fixed, large
        var order: Int { switch self { case .income: return 0; case .card: return 1; case .fixed: return 2; case .large: return 3 } }
    }
    public var date: String
    public var type: Kind
    public var title: String
    public var amount: Double
    public var detail: String
    public var cardId: String = ""
    public var id: String { "\(date)|\(type.rawValue)|\(title)|\(amount)" }
}

public struct SalaryEvent: Equatable, Sendable {
    public var date: String
    public var recordId: String
    public var employerId: String
    public var employerName: String
    public var workMonth: String
    public var amount: Double
}

/// ISO8601 の時刻（Web 版 Date.parse）
public enum ISODate {
    public static func ms(_ s: String) -> Double? {
        guard !s.isEmpty else { return nil }
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d.timeIntervalSince1970 * 1000 }
        f.formatOptions = [.withInternetDateTime]
        if let d = f.date(from: s) { return d.timeIntervalSince1970 * 1000 }
        // "2026-11-17T23:59:59"（時差なし）は端末の時刻として読む（Web 版と同じ）
        let l = DateFormatter(); l.locale = Locale(identifier: "en_US_POSIX"); l.timeZone = Dates.calendar.timeZone
        for fmt in ["yyyy-MM-dd'T'HH:mm:ss", "yyyy-MM-dd'T'HH:mm", "yyyy-MM-dd"] {
            l.dateFormat = fmt
            if let d = l.date(from: s) { return d.timeIntervalSince1970 * 1000 }
        }
        return nil
    }
    public static func now(_ date: Date = Date()) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        f.timeZone = TimeZone(identifier: "UTC")
        return f.string(from: date)
    }
}
