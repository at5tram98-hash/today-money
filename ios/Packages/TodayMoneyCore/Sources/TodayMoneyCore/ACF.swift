import Foundation

// ACF（資金見通し）。Web 版 04-acf-context.js / 05-acf-engine.js / 17-acf-refinements.js / 26-liquid-v16.js（ACF指標）/ salary-v18.js（期間）を
// 同じ順序・同じ端数処理で移したもの。照合テスト AcfCompatTests で Web 版の結果と比べる。

// MARK: - 設定

public struct AcfSettings: Equatable, Sendable {
    public var reserveFloor: Double
    public var useWeekdayWeights: Bool
    public var includeRequiredLargeExpenses: Bool
    public var riskNotifications: Bool
    public var creditFallbackEnabled: Bool
    public var creditDailyLimit: Double
    public var creditAggressiveness: Double
    public var creditAllowAllCategories: Bool
    public var creditAllowedCategoryIds: [String]
    public var creditAllowedMerchants: [String]
    public var creditBlockedMerchants: [String]
    public var preferredCardId: String
    public var c100Mode: Bool
    public var initialized: Bool
    public var indexEndDay: Int
    public var indexEndDate: String

    /// 保存する値（JSON に書き戻す項目）
    public var json: [String: JSONValue] {
        ["reserveFloor": .number(reserveFloor), "useWeekdayWeights": .bool(useWeekdayWeights),
         "includeRequiredLargeExpenses": .bool(includeRequiredLargeExpenses), "riskNotifications": .bool(riskNotifications),
         "creditFallbackEnabled": .bool(creditFallbackEnabled), "creditDailyLimit": .number(creditDailyLimit),
         "creditAggressiveness": .number(creditAggressiveness), "creditAllowAllCategories": .bool(creditAllowAllCategories),
         "creditAllowedCategoryIds": .array(creditAllowedCategoryIds.map { .string($0) }),
         "creditAllowedMerchants": .array(creditAllowedMerchants.map { .string($0) }),
         "creditBlockedMerchants": .array(creditBlockedMerchants.map { .string($0) }),
         "preferredCardId": .string(preferredCardId), "c100Mode": .bool(c100Mode), "initialized": .bool(initialized),
         "indexEndDay": .number(Double(indexEndDay)), "indexEndDate": .string(indexEndDate), "horizon": .string("two_months")]
    }
}

func uniqStrings(_ v: JSONValue?, dropEmpty: Bool) -> [String] {
    var seen = Set<String>(), out: [String] = []
    for x in v?.arrayValue ?? [] {
        let s = str(x)
        if dropEmpty && s.isEmpty { continue }
        if seen.insert(s).inserted { out.append(s) }
    }
    return out
}

public extension MoneyDocument {
    /// Web 版 acfStoredSettings（保存されている設定。C100 の試算値を含まない）
    var acfStoredSettings: AcfSettings {
        let x = root["acfSettings"]?.objectValue ?? [:]
        func b(_ k: String, _ d: Bool) -> Bool { x[k]?.boolValue ?? d }
        let rf = x["reserveFloor"].map { num($0) } ?? 15000
        var limit = (x["creditDailyLimit"].flatMap { $0.isNull ? nil : $0 }).map { num($0) } ?? 1000
        limit = max(0, limit.rounded())
        if limit >= 99_999_999 { limit = 1000 }
        let aggr = (x["creditAggressiveness"].flatMap { $0.isNull ? nil : $0 }).map { num($0) } ?? 100
        let day = Int(num(x["indexEndDay"]).rounded())
        return AcfSettings(
            reserveFloor: max(0, rf, activeSalaryAllocationReserve()),
            useWeekdayWeights: b("useWeekdayWeights", true), includeRequiredLargeExpenses: b("includeRequiredLargeExpenses", true),
            riskNotifications: b("riskNotifications", true),
            creditFallbackEnabled: x["creditFallbackEnabled"]?.boolValue != false,
            creditDailyLimit: limit, creditAggressiveness: min(max(aggr, 0), 100),
            creditAllowAllCategories: x["creditAllowAllCategories"]?.boolValue != false,
            creditAllowedCategoryIds: uniqStrings(x["creditAllowedCategoryIds"], dropEmpty: false),
            creditAllowedMerchants: uniqStrings(x["creditAllowedMerchants"], dropEmpty: true),
            creditBlockedMerchants: uniqStrings(x["creditBlockedMerchants"], dropEmpty: true),
            preferredCardId: str(x["preferredCardId"]), c100Mode: x["c100Mode"]?.boolValue == true,
            initialized: x["initialized"]?.boolValue == true,
            indexEndDay: (1...31).contains(day) ? day : 28, indexEndDate: str(x["indexEndDate"]))
    }
    /// Web 版 acfDefaultSettings（計算に使う設定。C100 モードなら、すべてカードで払う前提にする）
    var acfSettings: AcfSettings {
        var s = acfStoredSettings
        if s.c100Mode {
            s.creditFallbackEnabled = true; s.creditAggressiveness = 100; s.creditAllowAllCategories = true
            s.creditBlockedMerchants = []; s.creditDailyLimit = max(s.creditDailyLimit, 99_999_999)
        }
        return s
    }

    /// 給与の振り分けで確保した額（Web 版 activeSalaryAllocationReserve）
    func activeSalaryAllocationReserve(date: String = Dates.ymd()) -> Double {
        let recs = salaryRecords
        return (root["salaryAllocations"]?.arrayValue ?? []).reduce(0) { acc, x in
            guard str(x["status"]) == "active" else { return acc }
            let until = str(x["validUntil"]); if !until.isEmpty && until < date { return acc }
            guard let r = recs.first(where: { $0.id == str(x["salaryRecordId"]) }), r.status == "入金済" else { return acc }
            return acc + max(0, num(x["buckets"]?["reserve"]))
        }
    }

    // MARK: 目標・支出（ACF が読むもの）

    /// Web 版 dayGoalForMonth
    func dayGoalForMonth(_ month: String, day: Int) -> Double {
        let ds = "\(month)-\(pad2(day))"
        let dg = num(root["dailyGoals"]?[ds]?["total"])
        if dg > 0 { return dg }
        let v = num(root["monthlyGoals"]?[month]?["daily"]?[String(day)])
        return v > 0 ? v : 0
    }
    func hasDailySpendData(_ date: String) -> Bool {
        !transactions(on: date).isEmpty || (root["dailyCorrections"]?[date].map { !$0.isNull } ?? false)
    }
    /// 曜日ごとの支出の重み（Web 版 weekdaySpendingWeights）
    func weekdaySpendingWeights(month: String, weeks: Int = 8) -> [Double] {
        var values = Array(repeating: [Double](), count: 7)
        let anchor = "\(month)-01"
        for i in 1...(weeks * 7) {
            let ds = Dates.addDays(anchor, -i)
            if hasDailySpendData(ds) { values[Dates.weekday(ds)].append(spent(on: ds)) }
        }
        let count = values.reduce(0) { $0 + $1.count }
        if count < 4 { return Array(repeating: 1, count: 7) }
        return values.map { $0.isEmpty ? 1 : max(1, $0.reduce(0, +) / Double($0.count)) }
    }
    func dailyCardUsage(_ date: String) -> Double {
        transactions(on: date).filter { $0.paymentMethod == "card" && $0.amount > 0 }.reduce(0) { $0 + max(0, $1.amount) }
    }

    // MARK: カードを使える場所

    func acfMerchantRuleMatches(_ list: [String], _ merchant: String) -> Bool {
        let key = Self.merchantKey(merchant)
        return !key.isEmpty && list.contains { Self.merchantKey($0) == key }
    }
    /// Web 版 isCreditAllowedForExpense
    func isCreditAllowed(category: String, merchant: String, settings: AcfSettings) -> Bool {
        if acfMerchantRuleMatches(settings.creditBlockedMerchants, merchant) { return false }
        if acfMerchantRuleMatches(settings.creditAllowedMerchants, merchant) { return true }
        if settings.creditAllowAllCategories { return true }
        guard let id = categories.first(where: { $0.name == category })?.id, !id.isEmpty else { return false }
        return settings.creditAllowedCategoryIds.contains(id)
    }
    func acfHasAnyCreditUsePlace(_ s: AcfSettings) -> Bool {
        s.creditAllowAllCategories || !s.creditAllowedCategoryIds.isEmpty || !s.creditAllowedMerchants.isEmpty
    }
    func acfAllowedCategorySummary(_ s: AcfSettings) -> String {
        if s.creditAllowAllCategories { return "すべてのカテゴリ" }
        let names = categories.filter { s.creditAllowedCategoryIds.contains($0.id) }.map(\.name)
        if names.isEmpty { return s.creditAllowedMerchants.isEmpty ? "なし" : "登録したお店のみ" }
        return names.count <= 3 ? names.joined(separator: "・") : "\(names.prefix(3).joined(separator: "・"))＋ほか\(names.count - 3)件"
    }
    /// Web 版 acfPlannedCreditEligibleAmount
    func acfPlannedCreditEligibleAmount(date: String, requested r: Double, settings s: AcfSettings, today: String) -> Double {
        let requested = max(0, floor(r))
        if requested == 0 || !s.creditFallbackEnabled { return 0 }
        if s.creditAllowAllCategories { return requested }
        let allowed = Set(categories.filter { s.creditAllowedCategoryIds.contains($0.id) }.map(\.name))
        if allowed.isEmpty { return 0 }
        let dailyCats = (root["dailyGoals"]?[date]?["categories"]?.objectValue ?? [:]).filter { num($0.value) > 0 }
        if !dailyCats.isEmpty {
            var eligible = 0.0
            for (name, v) in dailyCats where allowed.contains(name) {
                let spentCat = date == today ? max(0, categorySpent(day: date, category: name)) : 0
                eligible += max(0, max(0, num(v)) - spentCat)
            }
            return min(requested, floor(eligible))
        }
        let month = String(date.prefix(7))
        let mg = root["monthlyGoals"]?[month]
        let monthTotal = max(0, num(mg?["total"]))
        let allowedTotal = (mg?["categories"]?.objectValue ?? [:]).filter { allowed.contains($0.key) && num($0.value) > 0 }.reduce(0) { $0 + num($1.value) }
        if monthTotal > 0 && allowedTotal > 0 { return min(requested, floor(requested * min(1, allowedTotal / monthTotal))) }
        return 0
    }
    func categorySpent(day: String, category: String) -> Double {
        transactions(on: day).filter { $0.category == category }.reduce(0) { $0 + $1.amount }
    }

    func acfCardIsConfigured(_ c: Card) -> Bool { c.limit > 0 && c.closingDay != nil && c.dueDay != nil }
    func acfConfiguredCards(_ s: AcfSettings) -> [Card] {
        cards.filter(acfCardIsConfigured).sorted { a, b in
            let ap = a.id == s.preferredCardId ? 1 : 0, bp = b.id == s.preferredCardId ? 1 : 0
            if ap != bp { return ap > bp }
            return a.name.compare(b.name, locale: Locale(identifier: "ja")) == .orderedAscending
        }
    }

    // MARK: 期間

    func acfVisibleEnd(_ start: String) -> String {
        let m = Dates.addMonths(String(start.prefix(7)), 2)
        return "\(m)-\(pad2(Dates.daysInMonth(m)))"
    }
    /// Web 版 acfHorizonEnd：表示する翌々月末より後に来るカードの支払日まで見る
    func acfHorizonEnd(start: String, settings s: AcfSettings) -> String {
        let visibleEnd = acfVisibleEnd(start), startMonth = String(start.prefix(7))
        var lastDue = visibleEnd
        func consider(_ d: String?) { if let d, d > lastDue { lastDue = d } }
        for c in cards {
            let lastBM = cardBillingMonth(c, purchase: visibleEnd)
            for i in -2...5 {
                let bm = Dates.addMonths(startMonth, i)
                if !lastBM.isEmpty && bm > lastBM { break }
                if cardBillingAmount(c.id, billingMonth: bm) > 0 { consider(effectiveCardPaymentDate(c, billingMonth: bm)) }
            }
            if s.creditFallbackEnabled && s.creditAggressiveness > 0 && c.closingDay != nil { consider(effectiveCardPaymentDate(c, billingMonth: lastBM)) }
        }
        for f in fixedPayments where f.paymentMethod == "card" && !f.paymentId.isEmpty {
            guard let c = card(f.paymentId) else { continue }
            for d in dateRange(start, visibleEnd, 100) where fixedDue(f, on: d) && !f.skippedDates.contains(d) && !fixedRecorded(f, date: d) {
                consider(effectiveCardPaymentDate(c, billingMonth: cardBillingMonth(c, purchase: d)))
            }
        }
        for p in largeExpensePlans where p.status == "planned" && p.priority == "required" && s.includeRequiredLargeExpenses && p.date >= start && p.date <= visibleEnd {
            for (part, _) in largeExpensePendingParts(p) where part.paymentMethod == "card" {
                guard let c = card(part.paymentId) else { continue }
                let bm = cardBillingMonth(c, purchase: p.date)
                let count = max(1, min(6, p.atfInstallments[part.paymentId] ?? 1))
                for k in 0..<count { consider(effectiveCardPaymentDate(c, billingMonth: Dates.addMonths(bm, k)) ?? nextCardDueDate(c, from: p.date)) }
            }
        }
        return lastDue
    }

    func dateRange(_ start: String, _ end: String, _ maxDays: Int = 370) -> [String] {
        var out: [String] = [], d = start, i = 0
        let cap = max(1, min(370, maxDays))
        while d <= end && i < cap { out.append(d); d = Dates.addDays(d, 1); i += 1 }
        return out
    }
}

// MARK: - 計算の土台（必須の入出金だけの日別の残高）

public struct AcfEvent: Equatable, Sendable { public var label: String; public var amount: Double; public var type: String }

public struct AcfRow: Equatable, Sendable, Identifiable {
    public var id: String { date }
    public var date: String
    public var openingBalance = 0.0
    public var income = 0.0, mandatoryOutflow = 0.0, cardPayment = 0.0, largeExpense = 0.0, largeExpenseCash = 0.0, fixedPayment = 0.0
    public var events: [AcfEvent] = []
    public var salary = false, card = false, large = false
    public var mandatoryBalance = 0.0
    public var maxSpendCash = 0.0
    public var minMandatoryFromHere = 0.0
    // 計画（生活費）の配分
    public var flexibleCash = 0.0, flexibleCredit = 0.0, flexibleTotal = 0.0, requestedFlexible = 0.0, flexibleShortage = 0.0, flexibleCardDue = 0.0
    public var forecastBalance = 0.0, reserveFloor = 0.0, headroom = 0.0
    public var status = "safe"
    public var cardParts: [AcfCardPart] = []
    public var freeCashBefore = 0.0, cardDailyRemaining = 0.0
    public var paymentMode = "—"
    public var totalCardPayment = 0.0
    public var important = false
    // 予測
    public var safeCashBudgetRemaining = 0.0, safeCreditBudgetRemaining = 0.0, safeBudgetRemaining = 0.0
    public var safeCashBudget = 0.0, safeCreditBudget = 0.0, safeTotalBudget = 0.0
    public var maxSpendCredit = 0.0, maxSpendCombined = 0.0, combinedBoundarySafe = false, freeCash = 0.0
    public var availableCash = 0.0, cashHeadroom = 0.0, cashShortage = 0.0, reserveShortage = 0.0
    /// その他の必須支出（カード引落以外）
    public var otherMandatory: Double { max(0, mandatoryOutflow - cardPayment) }
}

public struct AcfCardPart: Equatable, Sendable { public var cardId: String; public var amount: Double; public var due: String; public var billingMonth: String }

/// カードの1回の請求（請求月ごと）の控え
struct AcfCardKey {
    var cardId: String
    var billingMonth: String
    var due: String?
    var paid: Bool
    var adjusted: Bool
    var billingAmount: Double
    var txs: [(date: String, amount: Double)]
    var extras: [(amount: Double, purchaseDate: String)]
    /// 利用日の順の累積（日付のない利用は最初から数える）
    var txDates: [String] = [], txCum: [Double] = [], txUndated = 0.0
    var exDates: [String] = [], exCum: [Double] = [], exUndated = 0.0
    mutating func prepare() {
        txUndated = txs.filter { $0.date.isEmpty }.reduce(0) { $0 + $1.amount }
        var acc = 0.0
        let t = txs.filter { !$0.date.isEmpty }.sorted { $0.date < $1.date }
        txDates = t.map(\.date); txCum = t.map { acc += $0.amount; return acc }
        exUndated = extras.filter { $0.purchaseDate.isEmpty }.reduce(0) { $0 + max(0, $1.amount) }
        acc = 0
        let e = extras.filter { !$0.purchaseDate.isEmpty }.sorted { $0.purchaseDate < $1.purchaseDate }
        exDates = e.map(\.purchaseDate); exCum = e.map { acc += max(0, $0.amount); return acc }
    }
    static func upTo(_ dates: [String], _ cum: [Double], _ d: String) -> Double {
        var lo = 0, hi = dates.count
        while lo < hi { let m = (lo + hi) / 2; if dates[m] <= d { lo = m + 1 } else { hi = m } }
        return lo == 0 ? 0 : cum[lo - 1]
    }
    func used(at date: String) -> Double {
        var actual = 0.0
        if !paid { actual = adjusted ? max(0, billingAmount) : max(0, txUndated + Self.upTo(txDates, txCum, date)) }
        return actual + exUndated + Self.upTo(exDates, exCum, date)
    }
}

public struct AcfContext: @unchecked Sendable {
    public var settings: AcfSettings
    public var start: String
    public var end: String
    public var budgetEnd: String
    public var dates: [String]
    public var baseRows: [AcfRow]
    public var reserve: Double
    public var openingBalance: Double
    var configuredCards: [Card]
    var cardKeys: [String: [AcfCardKey]]   // cardId → 請求
    var dailyCard: [String: Double]
    var planEligible: (String, Double) -> Double
    var indexOf: [String: Int]
    /// S[j] = 0..j の (入金 − 必須の支出) の合計（未来の最低残高を速く求めるため）
    var prefix: [Double] = []
    /// prefix の区間最小（sparse table）
    var sparse: [[Double]] = []
    /// その日付以上の最初の行（from の位置）
    func firstIndex(atOrAfter d: String) -> Int {
        var lo = 0, hi = dates.count
        while lo < hi { let m = (lo + hi) / 2; if dates[m] < d { lo = m + 1 } else { hi = m } }
        return lo
    }
    mutating func buildIndex() {
        var acc = 0.0
        prefix = baseRows.map { acc += $0.income - $0.mandatoryOutflow; return acc }
        sparse = [prefix]
        var k = 1
        while (1 << k) <= prefix.count {
            let prev = sparse[k - 1], half = 1 << (k - 1)
            sparse.append((0...(prefix.count - (1 << k))).map { min(prev[$0], prev[$0 + half]) })
            k += 1
        }
    }
    func rangeMin(_ a: Int, _ b: Int) -> Double {
        let len = b - a + 1
        var k = 0; while (1 << (k + 1)) <= len { k += 1 }
        return min(sparse[k][a], sparse[k][b - (1 << k) + 1])
    }
}

public extension MoneyDocument {
    /// Web 版 buildAcfBaseContext
    func acfBaseContext(start: String, settings s: AcfSettings, today: String, horizonEnd: String? = nil) -> AcfContext {
        let end = horizonEnd ?? acfHorizonEnd(start: start, settings: s)
        let dates = dateRange(start, end, 370)
        var events: [String: AcfRow] = Dictionary(uniqueKeysWithValues: dates.map { ($0, AcfRow(date: $0)) })
        func add(_ date: String, income: Double = 0, out: Double = 0, card cp: Double = 0, large: Double = 0, largeCash: Double = 0, fixed: Double = 0,
                 label: String = "", amount: Double = 0, type: String = "info", salary: Bool = false, isCard: Bool = false, isLarge: Bool = false) {
            guard var e = events[date] else { return }
            e.income += income; e.mandatoryOutflow += out; e.cardPayment += cp; e.largeExpense += large; e.largeExpenseCash += largeCash; e.fixedPayment += fixed
            if !label.isEmpty { e.events.append(AcfEvent(label: label, amount: amount, type: type)) }
            if salary { e.salary = true }; if isCard { e.card = true }; if isLarge { e.large = true }
            events[date] = e
        }
        let incs = incomes
        for r in salaryRecords where !r.date.isEmpty && r.date >= start && r.date <= end {
            let inc = incs.first { $0.salaryRecordId == r.id }
            let received = r.status == "入金済" || inc?.bankApplied == true || inc?.bankReconciled == true
            if !received { add(r.date, income: r.gross, label: "\(employer(r.employerId)?.name ?? "給与") 給与", amount: r.gross, type: "income", salary: true) }
        }
        for t in tempIncomes where !t.date.isEmpty && t.date >= start && t.date <= end {
            if let inc = linkedIncome(for: t), inc.bankApplied || inc.bankReconciled { continue }
            add(t.date, income: t.amount, label: t.sourceName.isEmpty ? "臨時収入" : t.sourceName, amount: t.amount, type: "income")
        }
        for x in incs where !x.date.isEmpty && x.date >= start && x.date <= end && x.salaryRecordId.isEmpty && x.tempIncomeId.isEmpty && !x.bankApplied && !x.bankReconciled {
            add(x.date, income: x.amount, label: x.sourceName.isEmpty ? "予定収入" : x.sourceName, amount: x.amount, type: "income")
        }
        let txs = transactions
        for t in txs where !t.date.isEmpty && t.date > start && t.date <= end && t.paymentMethod != "card" && !t.bankApplied && !t.bankReconciled {
            add(t.date, out: t.amount, label: t.merchant.isEmpty ? "予定支出" : t.merchant, amount: -t.amount, type: "outflow")
        }
        let fixedDone = Set(txs.filter { $0.source == "fixed" }.map { "\($0.fixedId)|\($0.date)" })
        for f in fixedPayments where f.paymentMethod != "card" {
            for d in dates where fixedDue(f, on: d) && !f.skippedDates.contains(d) && !fixedDone.contains("\(f.id)|\(d)") {
                add(d, out: f.amount, fixed: f.amount, label: f.name.isEmpty ? "固定支払い" : f.name, amount: -f.amount, type: "fixed")
            }
        }
        var extras: [String: [(amount: Double, purchaseDate: String)]] = [:]
        func addExtra(_ cardId: String, _ bm: String, _ amount: Double, _ purchase: String) {
            guard !cardId.isEmpty, amount != 0 else { return }
            extras["\(cardId)|\(bm)", default: []].append((amount, purchase))
        }
        for f in fixedPayments where f.paymentMethod == "card" && !f.paymentId.isEmpty {
            for d in dates where fixedDue(f, on: d) && !f.skippedDates.contains(d) && !fixedDone.contains("\(f.id)|\(d)") {
                addExtra(f.paymentId, cardBillingMonth(card(f.paymentId), purchase: d), f.amount, d)
            }
        }
        for p in largeExpensePlans {
            let include = p.priority == "required" && s.includeRequiredLargeExpenses
            guard p.status == "planned", include, !p.date.isEmpty, p.date >= start, p.date <= end else { continue }
            for (part, _) in largeExpensePendingParts(p) {
                let amount = atfPartAmount(part, plan: p)
                if amount <= 0 { continue }
                let isCard = part.paymentMethod == "card"
                add(p.date, large: amount, label: isCard ? "\(p.name.isEmpty ? "大型支出" : p.name)（カード利用 \(Format.yen(amount))）" : (p.name.isEmpty ? "大型支出" : p.name),
                    amount: isCard ? 0 : -amount, type: "large", isLarge: true)
                if isCard {
                    guard let c = card(part.paymentId) else { continue }
                    let bm = cardBillingMonth(c, purchase: p.date)
                    let count = max(1, min(6, p.atfInstallments[part.paymentId] ?? 1))
                    let fee = max(0, p.id == "large_seed_birthday" ? atfBirthdayFee : p.atfFee)
                    let a = Int(amount)
                    for i in 0..<count {
                        let share = Double(a / count + (i < a % count ? 1 : 0)) + (i == 0 && (p.id != "large_seed_birthday" || part.paymentId == "card_seed_smbc") ? fee : 0)
                        addExtra(part.paymentId, Dates.addMonths(bm, i), share, p.date)
                    }
                } else {
                    add(p.date, out: amount, largeCash: amount)
                }
            }
        }
        // カードの請求（すでにある請求＋予定）
        let startMonth = String(start.prefix(7)), endMonth = String(end.prefix(7))
        let sp = Dates.parts(startMonth + "-01"), ep = Dates.parts(endMonth + "-01")
        let span = (ep.y - sp.y) * 12 + (ep.m - sp.m)
        var cardKeys: [String: [AcfCardKey]] = [:]
        for c in cards {
            for i in -2...(span + 2) {
                let bm = Dates.addMonths(startMonth, i)
                let ex = extras["\(c.id)|\(bm)"] ?? []
                let extra = ex.reduce(0) { $0 + $1.amount }
                let base = cardBillingAmount(c.id, billingMonth: bm)
                let adj = cardAdjustment(c.id, billingMonth: bm)
                let paid = statementStatus(c.id, billingMonth: bm) == .paid
                let due = effectiveCardPaymentDate(c, billingMonth: bm)
                cardKeys[c.id, default: []].append(AcfCardKey(cardId: c.id, billingMonth: bm, due: due, paid: paid, adjusted: adj != nil, billingAmount: base,
                                                              txs: cardTransactions(c.id, billingMonth: bm).map { ($0.date, $0.amount) }, extras: ex))
                let amount = (paid ? 0 : base) + extra
                if amount <= 0 { continue }
                let rawDue = (adj?.paymentDateOverride).flatMap { $0.isEmpty ? nil : $0 } ?? cardPaymentDate(c, billingMonth: bm)
                guard let d = rawDue else {
                    if extra > 0 { add(end, out: amount, card: amount, label: "\(c.name) 支払い（支払日未設定）", amount: -amount, type: "card", isCard: true) }
                    continue
                }
                if d < start || d > end { continue }
                add(d, out: amount, card: amount, label: "\(c.name) 支払い", amount: -amount, type: "card", isCard: true)
            }
        }
        let reserve = max(0, s.reserveFloor)
        var rows: [AcfRow] = [], bal = totalBankBalance
        for d in dates {
            var e = events[d]!
            e.openingBalance = bal
            bal += e.income - e.mandatoryOutflow
            e.mandatoryBalance = bal
            rows.append(e)
        }
        var minFuture = Double.infinity
        for i in rows.indices.reversed() {
            minFuture = min(minFuture, rows[i].mandatoryBalance)
            rows[i].maxSpendCash = max(0, floor(minFuture - reserve))
            rows[i].minMandatoryFromHere = minFuture
        }
        var dailyCard: [String: Double] = [:]
        for t in txs where t.paymentMethod == "card" && t.amount > 0 { dailyCard[t.date, default: 0] += t.amount }
        let visible = acfVisibleEnd(start)
        let doc = self
        var ctx = AcfContext(settings: s, start: start, end: end, budgetEnd: end < visible ? end : visible, dates: dates, baseRows: rows, reserve: reserve,
                          openingBalance: rows.first?.openingBalance ?? totalBankBalance, configuredCards: acfConfiguredCards(s), cardKeys: cardKeys,
                          dailyCard: dailyCard,
                          planEligible: { date, req in doc.acfPlannedCreditEligibleAmount(date: date, requested: req, settings: s, today: today) },
                          indexOf: Dictionary(uniqueKeysWithValues: dates.enumerated().map { ($1, $0) }))
        ctx.buildIndex()
        return ctx
    }
}

// MARK: - 生活費の配分とシミュレーション

struct AcfBucket { var card: Card; var billingMonth: String; var due: String; var key: String; var available: Double }

extension AcfContext {
    /// Web 版 acfCardExposureAtDate：その日の時点で、まだ引き落とされていないカードの利用額
    func exposure(_ card: Card, at date: String, extra: [String: Double]) -> Double {
        var used = 0.0
        let keys = cardKeys[card.id] ?? []
        for k in keys {
            if let due = k.due, due < date { continue }
            used += k.used(at: date)
        }
        for (key, v) in extra where key.hasPrefix(card.id + "|") {
            let bm = String(key.dropFirst(card.id.count + 1))
            if let due = keys.first(where: { $0.billingMonth == bm })?.due, due < date { continue }
            used += max(0, v)
        }
        return max(0, used)
    }
    /// Web 版 acfEligibleCardBuckets
    func buckets(_ date: String, extra: [String: Double], billing: (Card, String) -> (String, String?)) -> [AcfBucket] {
        let s = settings
        guard s.creditFallbackEnabled, s.creditAggressiveness > 0, s.creditAllowAllCategories || !s.creditAllowedCategoryIds.isEmpty || !s.creditAllowedMerchants.isEmpty else { return [] }
        var rows: [AcfBucket] = []
        for c in configuredCards {
            let (bm, dueOpt) = billing(c, date)
            guard let due = dueOpt, due >= date, due <= end else { continue }
            let used = exposure(c, at: date, extra: extra)
            let available = max(0, floor(c.limit - used))
            if available > 0 { rows.append(AcfBucket(card: c, billingMonth: bm, due: due, key: "\(c.id)|\(bm)", available: available)) }
        }
        return rows.enumerated().sorted { x, y in
            let a = x.element, b = y.element
            let ap = a.card.id == s.preferredCardId ? 1 : 0, bp = b.card.id == s.preferredCardId ? 1 : 0
            if ap != bp { return ap > bp }
            if a.due != b.due { return a.due > b.due }
            if a.available != b.available { return a.available > b.available }
            return x.offset < y.offset
        }.map(\.element)
    }

    /// Web 版 acfProjectedMinBalance：この日以降（from 以降）の残高の最低値。
    /// 1日ずつ足す代わりに、累積和の区間最小で同じ値を求める（カードの引落は区切りごとに差し引く）
    func projectedMin(_ index: Int, _ balanceAfter: Double, _ creditDue: [String: Double], from: String) -> Double {
        var m = dates[index] >= from ? balanceAfter : Double.infinity
        let n = baseRows.count
        let lo = max(index + 1, firstIndex(atOrAfter: from))
        if lo < n {
            let dues = creditDue.compactMap { (d, v) -> (Int, Double)? in guard let i = indexOf[d], i > index else { return nil }; return (i, v) }.sorted { $0.0 < $1.0 }
            let base = balanceAfter - prefix[index]
            var c = 0.0, segStart = index + 1, k = 0
            // 引落日ごとに区切る：区間 [segStart, 次の引落日−1] は同じ引落額 c
            while segStart < n {
                while k < dues.count && dues[k].0 <= segStart { c += dues[k].1; k += 1 }
                let segEnd = k < dues.count ? dues[k].0 - 1 : n - 1
                let a2 = max(segStart, lo)
                if a2 <= segEnd { m = min(m, base + rangeMin(a2, segEnd) - c) }
                segStart = segEnd + 1
            }
        }
        return m.isFinite ? m : balanceAfter
    }
}

struct AcfAllocation {
    var requested = 0.0, total = 0.0, cash = 0.0, credit = 0.0, shortage = 0.0
    var parts: [AcfCardPart] = []
    var freeCashBefore = 0.0, dailyRemaining = 0.0
    var mode = "—"
}

public struct AcfSimulation: Sendable {
    public var feasible: Bool
    public var rows: [AcfRow]
    public var minBalance: Double
    public var totalShortage: Double
}

func acfPaymentModeLabel(_ cash: Double, _ credit: Double, _ shortage: Double) -> String {
    if shortage > 0 { return "不足" }
    if cash > 0 && credit > 0 { return "カード＋現金" }
    if credit > 0 { return "カード" }
    if cash > 0 { return "現金" }
    return "—"
}

/// 計算の本体（ドキュメントを読まない。カードの請求月は事前に作った表から引く）
struct AcfEngine {
    var ctx: AcfContext
    var billing: [String: (String, String?)]   // "cardId|date" → (請求月, 引落日)

    init(ctx: AcfContext, doc: MoneyDocument) {
        self.ctx = ctx
        var b: [String: (String, String?)] = [:]
        for c in ctx.configuredCards {
            for d in ctx.dates {
                let bm = doc.cardBillingMonth(c, purchase: d)
                b["\(c.id)|\(d)"] = (bm, doc.effectiveCardPaymentDate(c, billingMonth: bm))
            }
        }
        billing = b
        // 「その他の引落日」：extraUsage の請求月の引落日（Web 版 acfEffectiveCardPaymentDate）
        for c in ctx.configuredCards {
            var keys = self.ctx.cardKeys[c.id] ?? []
            var have = Set(keys.map(\.billingMonth))
            for d in ctx.dates {
                let bm = b["\(c.id)|\(d)"]!.0
                if have.insert(bm).inserted {
                    keys.append(AcfCardKey(cardId: c.id, billingMonth: bm, due: doc.effectiveCardPaymentDate(c, billingMonth: bm), paid: false, adjusted: false,
                                           billingAmount: 0, txs: [], extras: []))
                }
            }
            for i in keys.indices { keys[i].prepare() }
            self.ctx.cardKeys[c.id] = keys
        }
    }

    func bill(_ c: Card, _ date: String) -> (String, String?) { billing["\(c.id)|\(date)"] ?? ("", nil) }

    /// Web 版 acfAllocateFlexiblePlan
    func allocate(_ plan: [String: Double]) -> (alloc: [String: AcfAllocation], creditDue: [String: Double]) {
        let s = ctx.settings
        var extra: [String: Double] = [:], creditDue: [String: Double] = [:], out: [String: AcfAllocation] = [:]
        var running = ctx.openingBalance
        let ratio = s.creditFallbackEnabled ? min(max(s.creditAggressiveness, 0), 100) / 100 : 0
        let anyPlace = s.creditAllowAllCategories || !s.creditAllowedCategoryIds.isEmpty || !s.creditAllowedMerchants.isEmpty
        for (i, date) in ctx.dates.enumerated() {
            let base = ctx.baseRows[i]
            let requested = max(0, floor(plan[date] ?? 0))
            let existingDue = creditDue[date] ?? 0
            let preSpend = running + base.income - base.mandatoryOutflow - existingDue
            let freeCashBefore = max(0, floor(ctx.projectedMin(i, preSpend, creditDue, from: date) - ctx.reserve))
            let dailyRemaining = max(0, floor(s.creditDailyLimit) - (ctx.dailyCard[date] ?? 0))
            if requested == 0 || date > ctx.budgetEnd {
                out[date] = AcfAllocation(requested: requested, freeCashBefore: freeCashBefore, dailyRemaining: dailyRemaining)
                running = preSpend; continue
            }
            let eligible = ctx.planEligible(date, requested)
            let targetCard = ratio > 0 && anyPlace ? min(eligible, floor(requested * ratio)) : 0
            let cardCap = min(targetCard, dailyRemaining)
            let cashOnly = min(requested, freeCashBefore)
            let bridgeNeeded = max(0, requested - freeCashBefore)
            let postSafeCash = preSpend - cashOnly
            var credit = 0.0, bridgeAllocated = 0.0, parts: [AcfCardPart] = []
            if cardCap > 0 && s.creditFallbackEnabled {
                for bucket in ctx.buckets(date, extra: extra, billing: bill) {
                    if credit >= cardCap { break }
                    var room = min(cardCap - credit, bucket.available)
                    if room <= 0 { continue }
                    var use = 0.0
                    let bridgeRemaining = max(0, bridgeNeeded - bridgeAllocated)
                    if bridgeRemaining > 0 {
                        let safeAtDue = max(0, floor(ctx.projectedMin(i, postSafeCash, creditDue, from: bucket.due) - ctx.reserve))
                        let bridgeUse = floor(min(room, bridgeRemaining, safeAtDue))
                        if bridgeUse > 0 { use += bridgeUse; room -= bridgeUse; bridgeAllocated += bridgeUse }
                    }
                    if room > 0 && bridgeAllocated >= bridgeNeeded { use += floor(room) }
                    if use <= 0 { continue }
                    extra[bucket.key, default: 0] += use
                    creditDue[bucket.due, default: 0] += use
                    credit += use
                    parts.append(AcfCardPart(cardId: bucket.card.id, amount: use, due: bucket.due, billingMonth: bucket.billingMonth))
                }
            }
            let cash = min(max(0, requested - credit), freeCashBefore)
            let total = cash + credit, shortage = max(0, requested - total)
            let newDueToday = max(0, (creditDue[date] ?? 0) - existingDue)
            running = preSpend - cash - newDueToday
            out[date] = AcfAllocation(requested: requested, total: total, cash: cash, credit: credit, shortage: shortage, parts: parts,
                                      freeCashBefore: freeCashBefore, dailyRemaining: dailyRemaining, mode: acfPaymentModeLabel(cash, credit, shortage))
        }
        return (out, creditDue)
    }

    /// Web 版 acfSimulateFlexiblePlan
    func simulate(_ plan: [String: Double]) -> AcfSimulation {
        let (alloc, creditDue) = allocate(plan)
        var rows: [AcfRow] = [], balance = ctx.openingBalance, minBalance = Double.infinity, totalShortage = 0.0
        for base in ctx.baseRows {
            let a = alloc[base.date] ?? AcfAllocation()
            let extraDue = creditDue[base.date] ?? 0
            let opening = balance
            balance += base.income - base.mandatoryOutflow - extraDue - a.cash
            let headroom = balance - ctx.reserve
            if balance < minBalance { minBalance = balance }
            totalShortage += a.shortage
            var r = base
            r.openingBalance = opening
            r.flexibleCash = a.cash; r.flexibleCredit = a.credit; r.flexibleTotal = a.total; r.requestedFlexible = a.requested
            r.flexibleShortage = a.shortage; r.flexibleCardDue = extraDue; r.forecastBalance = balance; r.reserveFloor = ctx.reserve
            r.headroom = headroom; r.status = headroom < 0 ? "short" : headroom < 5000 ? "watch" : "safe"
            r.cardParts = a.parts; r.freeCashBefore = a.freeCashBefore; r.cardDailyRemaining = a.dailyRemaining; r.paymentMode = a.mode
            r.totalCardPayment = base.cardPayment + extraDue
            r.important = base.date == ctx.start || base.date == ctx.budgetEnd || base.income > 0 || base.mandatoryOutflow > 0 || base.largeExpense > 0
                || extraDue > 0 || headroom < 0 || a.credit > 0 || a.shortage > 0
            rows.append(r)
        }
        return AcfSimulation(feasible: minBalance >= ctx.reserve && totalShortage <= 0, rows: rows, minBalance: minBalance, totalShortage: totalShortage)
    }

    /// Web 版 acfWeightedPlanForScale
    func weightedPlan(_ weights: [Double], _ scale: Double) -> [String: Double] {
        var plan: [String: Double] = [:]
        for d in ctx.dates where d <= ctx.budgetEnd {
            plan[d] = max(0, floor(weights[Dates.weekday(d)] * scale / 100) * 100)
        }
        return plan
    }

    /// Web 版 acfBuildOptimizedFlexiblePlan：安全に使える一律の生活費（曜日の重みつき）を二分探索で探す
    func optimized(weights: [Double]) -> AcfSimulation {
        if ctx.baseRows.contains(where: { $0.mandatoryBalance < ctx.reserve }) { return simulate([:]) }
        var lo = 0.0, hi = 1000.0
        while hi < 2_000_000 && simulate(weightedPlan(weights, hi)).feasible { hi *= 2 }
        for _ in 0..<24 {
            let mid = (lo + hi) / 2
            if simulate(weightedPlan(weights, mid)).feasible { lo = mid } else { hi = mid }
        }
        return simulate(weightedPlan(weights, lo))
    }

    /// Web 版 simulateCombinedSpendCore：その日に安全に使える最大額（現金＋カード）
    func combinedSpend(_ date: String) -> (maxTotal: Double, cash: Double, credit: Double, plusOneSafe: Bool) {
        guard date <= ctx.budgetEnd, let base = ctx.baseRows.first(where: { $0.date == date }) else { return (0, 0, 0, false) }
        let cashCeiling = max(0, base.maxSpendCash)
        let cardCeiling = ctx.configuredCards.reduce(0) { $0 + $1.limit }
        let dailyLimit = max(0, ctx.settings.creditDailyLimit)
        var lo = 0.0, hi = max(1, floor(cashCeiling + min(cardCeiling, dailyLimit) + 1))
        func feasible(_ a: Double) -> Bool { simulate([date: a]).feasible }
        while hi < 100_000_000 && feasible(hi) { hi *= 2 }
        var i = 0
        while i < 28 && lo + 1 < hi {
            let mid = floor((lo + hi) / 2)
            if feasible(mid) { lo = mid } else { hi = mid }
            i += 1
        }
        let row = simulate([date: lo]).rows.first { $0.date == date }
        return (lo, row?.flexibleCash ?? 0, row?.flexibleCredit ?? 0, feasible(lo + 1))
    }
}

// MARK: - 予測

public struct AcfRisk: Equatable, Sendable, Identifiable {
    public var id: String { "\(severity)|\(title)|\(date)" }
    public var severity: String   // critical / warning / watch
    public var title: String
    public var detail: String
    public var date: String = ""
    public var action: String = ""   // day / goal / card:<id> / mail / acf / bank:<id> / salary
}

public struct AcfConfidence: Equatable, Sendable {
    public var score: Int
    public var label: String
    public var reasons: [(text: String, action: String)]
    public static func == (a: AcfConfidence, b: AcfConfidence) -> Bool { a.score == b.score && a.reasons.map(\.text) == b.reasons.map(\.text) }
}

public struct AcfForecast: Sendable {
    public var startDate: String, endDate: String, budgetEnd: String
    public var reserveFloor: Double
    public var settings: AcfSettings
    public var rows: [AcfRow]
    public var currentDeposits: Double, protectedCashNow: Double, freeCashNow: Double
    public var futureCardPayments: Double, futureMandatoryPayments: Double, safeCreditCapacity: Double
    public var safeTotalBudget: Double, safeCashBudget: Double, safeCreditBudget: Double, remainingToday: Double
    public var maxSpendToday: Double, maxSpendTodayCash: Double, maxSpendTodayCredit: Double
    public var monthEndForecast: Double, endForecast: Double
    public var minForecastBalance: Double, minForecastDate: String
    public var minMandatoryBalance: Double, minMandatoryDate: String
    public var explicitPlan: Bool, storedPlanUsed: Bool, planFeasible: Bool
    public var planShortageTotal: Double, planShortageDate: String
    public var desiredBudgetToday: Double, todayShortage: Double
    public var todayMode: String
    public var mandatoryBreakdown: (card: Double, fixed: Double, large: Double, other: Double)
    public var nextCardPayment: (date: String, amount: Double)?
    public var cardAllowedSummary: String
    public var creditFallbackStartDate: String
    public var cashDaysRemaining: Int?
    public var status: String
    public var cashShortage = 0.0, reserveShortage = 0.0
    public var minimumCashShortageDate = "", firstNegativeDate = "", firstReserveBreachDate = ""
    public var risks: [AcfRisk] = []
    public var confidence = AcfConfidence(score: 100, label: "高", reasons: [])
}

public extension MoneyDocument {
    /// ACF の予測（Web 版 buildCashFlowForecast）。lightweight は日ごとの最大額の探索を省く（ホーム・設定の試算用）
    func acfForecast(today: String, settings custom: AcfSettings? = nil, lightweight: Bool = false, now: Date = Date()) -> AcfForecast {
        let key = "acf|\(today)|\(lightweight)|\(custom.map { "\($0.json)" } ?? "")"
        return memo(key) { computeAcfForecast(today: today, settings: custom ?? acfSettings, lightweight: lightweight, now: now) }
    }

    /// 計画を指定した予測（Web 版 buildCashFlowForecast の flexibleBudgetPlan / planIncludesSpent / horizonEnd / largeExpensePlans）
    func acfForecast(today: String, plan: [String: Double], planIncludesSpent: Bool = false, horizonEnd: String? = nil,
                     largeExpensePlans plans: [LargeExpensePlan]? = nil, lightweight: Bool = true, now: Date = Date()) -> AcfForecast {
        var doc = self
        if let plans { doc.largeExpensePlans = plans }
        return doc.computeAcfForecast(today: today, settings: doc.acfSettings, lightweight: lightweight, now: now,
                                      explicit: plan, planIncludesSpent: planIncludesSpent, horizonEnd: horizonEnd)
    }

    private func computeAcfForecast(today: String, settings s: AcfSettings, lightweight: Bool, now: Date,
                                    explicit: [String: Double]? = nil, planIncludesSpent: Bool = false, horizonEnd: String? = nil) -> AcfForecast {
        let ctx = acfBaseContext(start: today, settings: s, today: today, horizonEnd: horizonEnd)
        let engine = AcfEngine(ctx: ctx, doc: self)
        let weights = s.useWeekdayWeights ? weekdaySpendingWeights(month: String(ctx.start.prefix(7)), weeks: 8) : Array(repeating: 1, count: 7)
        if let explicit {
            var plan: [String: Double] = [:]
            for d in ctx.dates where d <= ctx.budgetEnd {
                var v = max(0, explicit[d] ?? 0)
                if planIncludesSpent && d == ctx.start { v = max(0, v - spent(on: d)) }
                plan[d] = v
            }
            return finishForecast(ctx: ctx, engine: engine, sim: engine.simulate(plan), storedUsed: false, explicit: true, settings: s, lightweight: lightweight, today: today, now: now)
        }
        let opt = engine.optimized(weights: weights)
        // 保存した目標（日・月）があれば、それを優先して配分する（Web 版 acfPlanWithStoredGoals）
        var basePlan: [String: Double] = [:], fixedPlan: [String: Double] = [:], stored = Set<String>()
        for r in opt.rows where r.date <= ctx.budgetEnd { basePlan[r.date] = max(0, floor(r.flexibleTotal)) }
        for d in ctx.dates where d <= ctx.budgetEnd {
            let raw = dayGoalForMonth(String(d.prefix(7)), day: Dates.parts(d).d)
            guard raw > 0 else { continue }
            stored.insert(d)
            fixedPlan[d] = d == ctx.start ? max(0, floor(raw - spent(on: d))) : max(0, floor(raw))
        }
        func makePlan(_ scale: Double) -> [String: Double] {
            var plan: [String: Double] = [:]
            for d in ctx.dates where d <= ctx.budgetEnd {
                if stored.contains(d) { plan[d] = fixedPlan[d] }
                else { plan[d] = max(0, floor(max(0, basePlan[d] ?? 0) * max(0, min(1, scale)) / 100) * 100) }
            }
            return plan
        }
        var sim: AcfSimulation, storedUsed = false
        if stored.isEmpty { sim = opt } else {
            storedUsed = true
            let full = engine.simulate(makePlan(1))
            if full.feasible { sim = full } else {
                let fixedOnly = engine.simulate(makePlan(0))
                if !fixedOnly.feasible { sim = fixedOnly } else {
                    var lo = 0.0, hi = 1.0, best = fixedOnly
                    for _ in 0..<22 {
                        let mid = (lo + hi) / 2, t = engine.simulate(makePlan(mid))
                        if t.feasible { lo = mid; best = t } else { hi = mid }
                    }
                    sim = best
                }
            }
        }
        return finishForecast(ctx: ctx, engine: engine, sim: sim, storedUsed: storedUsed, explicit: false, settings: s, lightweight: lightweight, today: today, now: now)
    }

    private func finishForecast(ctx: AcfContext, engine: AcfEngine, sim: AcfSimulation, storedUsed: Bool, explicit: Bool, settings s: AcfSettings,
                                lightweight: Bool, today: String, now: Date) -> AcfForecast {
        // 日ごとの最大額（重い：lightweight では省く）
        var maximums: [(maxTotal: Double, cash: Double, credit: Double, plusOneSafe: Bool)] = []
        if lightweight {
            maximums = sim.rows.map { ($0.flexibleTotal, $0.flexibleCash, $0.flexibleCredit, false) }
        } else {
            let todo = sim.rows.filter { $0.date <= ctx.budgetEnd }.map(\.date)
            var results = [String: (Double, Double, Double, Bool)]()
            let lock = NSLock()
            DispatchQueue.concurrentPerform(iterations: todo.count) { i in
                let r = engine.combinedSpend(todo[i])
                lock.lock(); results[todo[i]] = (r.maxTotal, r.cash, r.credit, r.plusOneSafe); lock.unlock()
            }
            maximums = sim.rows.map { row in
                if let r = results[row.date] { return (r.0, r.1, r.2, r.3) }
                return (row.flexibleTotal, row.flexibleCash, row.flexibleCredit, false)
            }
        }
        let combined = lightweight ? (maximums.first.map { ($0.maxTotal, $0.cash, $0.credit) } ?? (0, 0, 0))
            : { let c = engine.combinedSpend(ctx.start); return (c.maxTotal, c.cash, c.credit) }()

        // Web 版 buildForecastPure
        var rows = sim.rows
        for i in rows.indices {
            let m = maximums[i]
            rows[i].safeCashBudgetRemaining = rows[i].flexibleCash; rows[i].safeCreditBudgetRemaining = rows[i].flexibleCredit
            rows[i].safeBudgetRemaining = rows[i].flexibleTotal; rows[i].safeCashBudget = rows[i].flexibleCash
            rows[i].safeCreditBudget = rows[i].flexibleCredit; rows[i].safeTotalBudget = rows[i].flexibleTotal
            rows[i].maxSpendCash = m.cash; rows[i].maxSpendCredit = m.credit; rows[i].maxSpendCombined = m.maxTotal
            rows[i].combinedBoundarySafe = !m.plusOneSafe; rows[i].freeCash = max(0, rows[i].freeCashBefore)
        }
        let deposits = totalBankBalance
        let first = rows.first ?? AcfRow(date: ctx.start)
        let todayGoal = { () -> Double in let g = dailyGoal(ctx.start); return g > 0 ? g : dayGoalForMonth(String(ctx.start.prefix(7)), day: Dates.parts(ctx.start).d) }()
        let desiredToday = todayGoal > 0 ? max(0, todayGoal - spent(on: ctx.start)) : 0
        let monthEnd = "\(ctx.start.prefix(7))-\(pad2(Dates.daysInMonth(String(ctx.start.prefix(7)))))"
        let monthRow = rows.first { $0.date == monthEnd } ?? rows.last { $0.date <= monthEnd } ?? rows.last
        var minRow: AcfRow?; for r in rows where minRow == nil || r.forecastBalance < minRow!.forecastBalance { minRow = r }
        var minMand: AcfRow?; for r in ctx.baseRows where minMand == nil || r.mandatoryBalance < minMand!.mandatoryBalance { minMand = r }
        let firstShort = rows.first { $0.flexibleShortage > 0 }
        let freeCashNow = max(0, floor(ctx.baseRows.first?.maxSpendCash ?? 0))
        let futureCard = ctx.baseRows.reduce(0) { $0 + $1.cardPayment }
        let futureMand = ctx.baseRows.reduce(0) { $0 + $1.mandatoryOutflow }
        let fixedM = ctx.baseRows.reduce(0) { $0 + $1.fixedPayment }, largeM = ctx.baseRows.reduce(0) { $0 + $1.largeExpenseCash }
        var mode = first.paymentMode
        if mode.isEmpty { mode = first.safeCashBudget > 0 && first.safeCreditBudget > 0 ? "カード＋現金" : first.flexibleShortage > 0 ? "不足" : first.safeCreditBudget > 0 ? "カード" : first.safeCashBudget > 0 ? "現金" : "—" }
        let next = rows.first { $0.cardPayment + $0.flexibleCardDue > 0 }
        let creditIdx = rows.firstIndex { $0.flexibleCredit > 0 }
        var f = AcfForecast(
            startDate: ctx.start, endDate: ctx.end, budgetEnd: ctx.budgetEnd, reserveFloor: ctx.reserve, settings: s, rows: rows,
            currentDeposits: deposits, protectedCashNow: max(0, deposits - freeCashNow), freeCashNow: freeCashNow,
            futureCardPayments: futureCard, futureMandatoryPayments: futureMand, safeCreditCapacity: combined.2,
            safeTotalBudget: first.safeTotalBudget, safeCashBudget: first.safeCashBudget, safeCreditBudget: first.safeCreditBudget,
            remainingToday: first.safeBudgetRemaining, maxSpendToday: combined.0, maxSpendTodayCash: combined.1, maxSpendTodayCredit: combined.2,
            monthEndForecast: monthRow?.forecastBalance ?? deposits, endForecast: rows.last?.forecastBalance ?? deposits,
            minForecastBalance: minRow?.forecastBalance ?? deposits, minForecastDate: minRow?.date ?? ctx.start,
            minMandatoryBalance: minMand?.mandatoryBalance ?? deposits, minMandatoryDate: minMand?.date ?? ctx.start,
            explicitPlan: explicit, storedPlanUsed: storedUsed, planFeasible: sim.feasible,
            planShortageTotal: max(0, sim.totalShortage), planShortageDate: firstShort?.date ?? "",
            desiredBudgetToday: desiredToday, todayShortage: max(0, desiredToday - first.safeTotalBudget), todayMode: mode,
            mandatoryBreakdown: (futureCard, fixedM, largeM, max(0, futureMand - futureCard - fixedM - largeM)),
            nextCardPayment: next.map { ($0.date, $0.cardPayment + $0.flexibleCardDue) },
            cardAllowedSummary: acfAllowedCategorySummary(s),
            creditFallbackStartDate: rows.first { $0.flexibleCredit > 0 }?.date ?? "",
            cashDaysRemaining: creditIdx.map { max(0, $0) }, status: "安全")
        decorate(&f)
        f.risks = risks(f, today: today)
        f.confidence = confidence(now: now, today: today, creditFallback: acfSettings.creditFallbackEnabled)
        return f
    }

    /// Web 版 acfDecorateSignedForecast（不足額を隠さない・状態）
    private func decorate(_ f: inout AcfForecast) {
        let reserve = max(0, f.reserveFloor)
        var futureMin = Double.infinity
        for i in f.rows.indices.reversed() {
            futureMin = min(futureMin, f.rows[i].mandatoryBalance)
            f.rows[i].availableCash = max(0, f.rows[i].freeCash)
            f.rows[i].cashHeadroom = floor(futureMin - reserve)
            f.rows[i].cashShortage = max(0, -f.rows[i].forecastBalance)
            f.rows[i].reserveShortage = max(0, reserve - f.rows[i].forecastBalance)
        }
        let minB = f.minForecastBalance
        f.cashShortage = max(0, -minB)
        f.minimumCashShortageDate = f.cashShortage > 0 ? f.minForecastDate : ""
        f.reserveShortage = max(0, reserve - minB)
        f.firstNegativeDate = f.rows.first { $0.forecastBalance < 0 }?.date ?? ""
        f.firstReserveBreachDate = f.rows.first { $0.forecastBalance < reserve }?.date ?? ""
        if f.cashShortage > 0 || f.minMandatoryBalance < 0 { f.status = "不足" }
        else if f.minMandatoryBalance < reserve || minB < reserve { f.status = "危険" }
        else if f.planShortageTotal > 0 || minB < reserve + 5000 { f.status = "注意" }
        else { f.status = "安全" }
    }

    /// Web 版 getForecastRisk（getForecastRiskCore と不足の注意）
    private func risks(_ f: AcfForecast, today: String) -> [AcfRisk] {
        var extra: [AcfRisk] = [], base: [AcfRisk] = []
        if f.cashShortage > 0 {
            let d = f.minimumCashShortageDate.isEmpty ? (f.minForecastDate.isEmpty ? f.startDate : f.minForecastDate) : f.minimumCashShortageDate
            extra.append(AcfRisk(severity: "critical", title: "\(Format.dayLabel(d))に資金不足となる見込みです", detail: "最低予測残高 \(Format.yen(f.minForecastBalance))・不足 \(Format.yen(f.cashShortage))", date: d, action: "day"))
        } else if f.reserveShortage > 0 {
            let d = f.firstReserveBreachDate.isEmpty ? (f.minForecastDate.isEmpty ? f.startDate : f.minForecastDate) : f.firstReserveBreachDate
            extra.append(AcfRisk(severity: "warning", title: "\(Format.dayLabel(d))に最低残したい金額を下回る見込みです", detail: "安全余力 \(Format.yen(f.minForecastBalance - f.reserveFloor))", date: d, action: "day"))
        }
        if f.minMandatoryBalance < f.reserveFloor {
            base.append(AcfRisk(severity: f.minMandatoryBalance < 0 ? "critical" : "warning", title: "\(Format.dayLabel(f.minMandatoryDate))に安全ラインを下回る見込みです",
                                detail: "不足見込み \(Format.yen(f.reserveFloor - f.minMandatoryBalance))", date: f.minMandatoryDate, action: "day"))
        }
        if f.planShortageTotal > 0 {
            let d = f.planShortageDate.isEmpty ? f.startDate : f.planShortageDate
            base.append(AcfRisk(severity: "warning", title: "\(Format.dayLabel(d))以降の計画に不足があります", detail: "安全に使える額に対して合計 \(Format.yen(f.planShortageTotal)) 不足しています。", date: d, action: "goal"))
        } else if f.explicitPlan && f.minForecastBalance < f.reserveFloor {
            base.append(AcfRisk(severity: "warning", title: "\(Format.dayLabel(f.minForecastDate))に計画が安全ラインを超えます", detail: "日別計画を \(Format.yen(f.reserveFloor - f.minForecastBalance)) 以上見直す必要があります。", date: f.minForecastDate, action: "goal"))
        }
        if f.settings.creditFallbackEnabled {
            for c in cards {
                var missing: [String] = []
                if !(c.limit > 0) { missing.append("利用限度額") }
                if c.closingDay == nil { missing.append("締め日") }
                if c.dueDay == nil { missing.append("支払日") }
                if !missing.isEmpty { base.append(AcfRisk(severity: "warning", title: "\(c.name)のカード支払い設定が未完成です", detail: "\(missing.joined(separator: "・"))を設定すると日常のカード支払いに利用できます。", action: "card:\(c.id)")) }
            }
        }
        let mails = root["mailImports"]?.arrayValue ?? []
        let unknown = mails.filter { str($0["status"]) == "pending" && !(num($0["amount"]) > 0) }.count
        if unknown > 0 { base.append(AcfRisk(severity: "warning", title: "金額不明のGmail取引があります", detail: "\(unknown)件の金額確認が必要です。", action: "mail")) }
        for c in cards {
            let ex = projectedCardExposure(c.id, end: f.endDate.isEmpty ? Dates.addDays(today, 60) : f.endDate, today: today)
            if c.limit > 0 && ex.max / c.limit >= 0.8 {
                base.append(AcfRisk(severity: "watch", title: "\(c.name)の利用可能額が20%未満になる見込みです", detail: "予定込み最大利用 \(Format.yen(ex.max)) / 枠 \(Format.yen(c.limit))", action: "card:\(c.id)"))
            }
        }
        if f.desiredBudgetToday > 0 && f.todayShortage > 0 {
            base.append(AcfRisk(severity: "watch", title: "今日の計画額をすべて安全に使う余裕がありません", detail: "不足 \(Format.yen(f.todayShortage))・安全に使える目安 \(Format.yen(f.safeTotalBudget))", action: "goal"))
        }
        if f.safeTotalBudget < 500 && f.safeCreditCapacity <= 0 && f.minMandatoryBalance >= f.reserveFloor {
            base.append(AcfRisk(severity: "watch", title: "現在の登録内容では追加支出の余裕がほとんどありません", detail: "現在の登録内容では追加支出の余裕がありません。", action: "acf"))
        }
        var seen = Set<String>()
        return (extra + base).filter { seen.insert("\($0.severity)|\($0.title)|\($0.date)").inserted }
    }

    /// Web 版 getForecastConfidence（登録情報の鮮度と完全性）
    func confidence(now: Date, today: String, creditFallback: Bool) -> AcfConfidence {
        var score = 100.0, reasons: [(String, String)] = []
        let nowMs = now.timeIntervalSince1970 * 1000
        for b in banks {
            guard let t = ISODate.ms(b.balanceAsOf) else { score -= 10; reasons.append(("\(b.name)の残高基準日時が未確認", "bank:\(b.id)")); continue }
            let days = (nowMs - t) / 86_400_000
            if days > 7 { score -= 8; reasons.append(("\(b.name)の残高確認が7日以上前", "bank:\(b.id)")) }
            else if days > 3 { score -= 4; reasons.append(("\(b.name)の残高確認が3日以上前", "bank:\(b.id)")) }
        }
        let mails = (root["mailImports"]?.arrayValue ?? []).filter { str($0["status"]) == "pending" }
        let amountUnknown = mails.filter { !(num($0["amount"]) > 0) }.count, categoryOnly = mails.count - amountUnknown
        if amountUnknown > 0 { score -= Double(min(24, amountUnknown * 10)); reasons.append(("金額不明Gmail \(amountUnknown)件", "mail")) }
        if categoryOnly > 0 { score -= Double(min(8, categoryOnly * 2)); reasons.append(("カテゴリ未確認Gmail \(categoryOnly)件", "mail")) }
        if creditFallback {
            for c in cards {
                var missing: [String] = []
                if !(c.limit > 0) { missing.append("利用限度額") }
                if c.closingDay == nil { missing.append("締め日") }
                if c.dueDay == nil { missing.append("支払日") }
                if !missing.isEmpty { score -= 6; reasons.append(("\(c.name)の\(missing.joined(separator: "・"))が未設定", "card:\(c.id)")) }
            }
        }
        for st in cardPaymentStatements(inMonth: String(today.prefix(7)), includePaid: true) where st.status == .estimated {
            score -= 7; reasons.append(("\(st.cardName)の今月請求額が見込み", "card:\(st.cardId)"))
        }
        for r in salaryRecords where r.status != "入金済" && !Dates.isYMD(r.date) { score -= 5; reasons.append(("給与予定日の確認が必要", "salary")) }
        let s = Int(min(100, max(25, score.rounded())))
        var unique: [(text: String, action: String)] = []
        for r in reasons where !unique.contains(where: { $0.text == r.0 }) { unique.append((r.0, r.1)) }
        return AcfConfidence(score: s, label: s >= 85 ? "高" : s >= 65 ? "中" : "低", reasons: Array(unique.prefix(6)))
    }

    /// Web 版 acfProjectedCardExposureThrough：カードの利用額が期間中に最大いくらになるか
    func projectedCardExposure(_ cardId: String, end endDate: String, today start: String) -> (current: Double, max: Double, minAvailable: Double, availableNow: Double, limit: Double) {
        guard let card = card(cardId) else { return (0, 0, 0, 0, 0) }
        let limit = max(0, card.limit)
        var events: [(date: String, delta: Double, order: Int)] = [], exposure = 0.0
        var months: [String] = []
        for i in -12...4 { months.append(Dates.addMonths(String(start.prefix(7)), i)) }
        for key in (root["cardAdjustments"]?.objectValue ?? [:]).keys.sorted() {
            let p = key.split(separator: "|", maxSplits: 1).map(String.init)
            if p.count == 2, p[1] == cardId, !months.contains(p[0]) { months.append(p[0]) }
        }
        for bm in months {
            if statementStatus(cardId, billingMonth: bm) == .paid { continue }
            let amount = max(0, cardBillingAmount(cardId, billingMonth: bm))
            if amount == 0 { continue }
            let due = effectiveCardPaymentDate(card, billingMonth: bm)
            if let due, due < start { continue }
            exposure += amount
            if let due { events.append((due, -amount, 0)) }
        }
        func addPlanned(_ date: String, _ a: Double, _ due: String?) {
            let amount = max(0, a)
            guard amount > 0, !date.isEmpty, date <= endDate else { return }
            if date <= start { exposure += amount } else { events.append((date, amount, 1)) }
            if let due { events.append((due, -amount, 0)) }
        }
        for f in fixedPayments where f.paymentMethod == "card" && f.paymentId == cardId {
            for d in dateRange(start, endDate, 400) where fixedDue(f, on: d) && !f.skippedDates.contains(d) && !fixedRecorded(f, date: d) {
                addPlanned(d, f.amount, effectiveCardPaymentDate(card, billingMonth: cardBillingMonth(card, purchase: d)))
            }
        }
        for p in largeExpensePlans where p.status == "planned" && p.priority == "required" && !p.date.isEmpty && p.date <= endDate {
            for (part, _) in largeExpensePendingParts(p) where part.paymentMethod == "card" && part.paymentId == cardId {
                let bm = cardBillingMonth(card, purchase: p.date)
                addPlanned(p.date, part.amount, effectiveCardPaymentDate(card, billingMonth: bm) ?? nextCardDueDate(card, from: p.date))
            }
        }
        let current = exposure
        var mx = exposure
        for e in events.enumerated().sorted(by: { ($0.element.date, $0.element.order, $0.offset) < ($1.element.date, $1.element.order, $1.offset) }).map(\.element) where e.date >= start {
            exposure = max(0, exposure + e.delta); mx = max(mx, exposure)
        }
        return (current, mx, limit > 0 ? max(0, limit - mx) : 0, limit > 0 ? max(0, limit - current) : 0, limit)
    }

    // MARK: ACF指標（Web 版 acfIndexFor）

    /// 指標の期間の終わり（Web 版 acfIndexEndDate：カードの支払いが終わる毎月28日。今回だけの日付も指定できる）
    func acfIndexEndDate(start: String) -> (end: String, custom: Bool) {
        let s = acfStoredSettings
        if Dates.isYMD(s.indexEndDate) && s.indexEndDate >= start { return (s.indexEndDate, true) }
        func at(_ month: String) -> String { "\(month)-\(pad2(min(s.indexEndDay, Dates.daysInMonth(month))))" }
        var end = at(String(start.prefix(7)))
        if end < start { end = at(Dates.addMonths(String(start.prefix(7)), 1)) }
        return (end, false)
    }

    func acfIndex(_ f: AcfForecast, today: String) -> AcfIndex {
        let start = f.startDate
        let (end, custom) = acfIndexEndDate(start: start)
        let span = max(1, Dates.daysBetween(start, end) + 1)
        let fin = financialEvents(from: start, days: span, today: today).filter { $0.date >= start && $0.date <= end }
        let win = f.rows.filter { $0.date >= start && $0.date <= end }
        let rowIncome = win.reduce(0) { $0 + $1.income }
        let finIncome = fin.filter { $0.type == .income }.reduce(0) { $0 + abs($1.amount) }
        let income = max(rowIncome, finIncome)
        let payments = fin.filter { $0.type != .income }
        let out = max(payments.reduce(0) { $0 + abs($1.amount) }, win.reduce(0) { $0 + $1.mandatoryOutflow })
        let balance = f.currentDeposits, reserve = f.reserveFloor
        let have = balance + income, need = out + reserve
        let value = need > 0 ? have / need : (have > 0 ? Double.infinity : 1)
        var evs: [AcfIndex.Event] = fin.filter { $0.type == .income }.map { .init(label: $0.title, amount: abs($0.amount), date: $0.date, income: true) }
        if evs.isEmpty {
            for r in win {
                for e in r.events where e.amount > 0 && (e.type == "income" || e.type == "salary" || r.salary) && !e.label.contains("支払") && !e.label.contains("引落") {
                    evs.append(.init(label: e.label, amount: abs(e.amount), date: r.date, income: true))
                }
            }
        }
        evs += payments.map { .init(label: $0.title, amount: abs($0.amount), date: $0.date, income: false) }
        evs = evs.enumerated().sorted { ($0.element.date, $0.offset) < ($1.element.date, $1.offset) }.map(\.element)
        return AcfIndex(value: value, have: have, need: need, balance: balance, income: income, out: out, reserve: reserve, start: start, end: end, custom: custom, events: evs)
    }
}

public struct AcfIndex: Sendable {
    public struct Event: Sendable, Identifiable, Equatable {
        public var label: String; public var amount: Double; public var date: String; public var income: Bool
        public var id: String { "\(date)|\(label)|\(amount)|\(income)" }
    }
    public var value: Double, have: Double, need: Double, balance: Double, income: Double, out: Double, reserve: Double
    public var start: String, end: String, custom: Bool
    public var events: [Event]
    public var surplus: Double { have - need }
    public var text: String { !value.isFinite ? "∞" : value >= 10 ? String(format: "%.1f", value) : String(format: "%.2f", value) }
    public var tone: String { value < 1 ? "deficit" : value < 1.2 ? "tight" : "surplus" }
    public var label: String { value < 1 ? "赤字" : value < 1.2 ? "ぎりぎり黒字" : "黒字" }
    public var sentence: String {
        if !value.isFinite { return "予定の支払いはありません" }
        if value >= 1 { return "使えるお金は、予定の支払いの\(text)倍あります" }
        return "予定の支払いに対して、使えるお金が\(Int(((1 - value) * 100).rounded()))%足りません"
    }
}

// MARK: - ACF の変更

public extension MoneyDocument {
    /// 設定を保存する（保存されている他の項目は残す）
    mutating func saveAcfSettings(_ s: AcfSettings) {
        self["acfSettings"] = (root["acfSettings"] ?? .object([:])).merging(.object(s.json))
    }
    /// ACF の安全な1日の目安を、今月の日別計画へ反映する（Web 版 applyAcfSafeBudgetToMonthlyPlan）。戻り値は反映した日数
    mutating func applyAcfSafeBudgetToMonthlyPlan(month: String, forecast f: AcfForecast, today: String) -> Int? {
        guard var mg = root["monthlyGoals"]?[month]?.objectValue, num(mg["total"]) > 0 else { return nil }
        var daily = mg["daily"]?.objectValue ?? [:]
        var dg = root["dailyGoals"]?.objectValue ?? [:]
        var applied = 0
        for day in 1...Dates.daysInMonth(month) {
            let date = "\(month)-\(pad2(day))"
            let raw = dg[date]
            if str(raw?["origin"]) == "daily" { continue }
            if month == String(today.prefix(7)) && date < today { continue }
            let safe = max(0, (f.rows.first { $0.date == date }?.safeTotalBudget ?? 0).rounded())
            if safe > 0 {
                applied += 1
                daily[String(day)] = .number(safe)
                dg[date] = .object(["total": .number(safe), "categories": raw?["categories"] ?? .object([:]), "origin": .string("monthly")])
            } else {
                daily.removeValue(forKey: String(day))
                if str(raw?["origin"]) == "monthly" { dg.removeValue(forKey: date) }
            }
        }
        mg["daily"] = .object(daily)
        var all = root["monthlyGoals"]?.objectValue ?? [:]; all[month] = .object(mg)
        self["monthlyGoals"] = .object(all)
        self["dailyGoals"] = .object(dg)
        return applied
    }
}
