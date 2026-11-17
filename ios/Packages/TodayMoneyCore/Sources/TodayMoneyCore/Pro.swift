import Foundation

// Pro の機能（Web 版 15-pro-features.js・16-analysis-and-goals.js）
// 理由が分かる分析・給与分析・月締めレビュー・お金のタイムライン（口座ごと）・予算の立て直し・
// 旅行／プレゼント目標（割り勘・立替・回収）・給料日の振り分け・振替計画。照合テスト ProCompatTests。

// MARK: - 旅行・プレゼント目標

public struct EventGoalItem: Equatable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var budget: Double
    public var plannedDate: String
    public var category: String
    public var paymentMethod: String
    public var paymentId: String
    public var linkedBankId: String
    /// planned / paid / cancelled
    public var status: String
    public var transactionId: String
    public var largePlanId: String
    var raw: [String: JSONValue]
    public init(json: JSONValue) {
        let o = json.objectValue ?? [:]
        raw = o
        id = str(o["id"]); name = str(o["name"]); budget = num(o["budget"]); plannedDate = str(o["plannedDate"]); category = str(o["category"])
        paymentMethod = str(o["paymentMethod"]).isEmpty ? "other" : str(o["paymentMethod"]); paymentId = str(o["paymentId"]); linkedBankId = str(o["linkedBankId"])
        status = str(o["status"]).isEmpty ? "planned" : str(o["status"]); transactionId = str(o["transactionId"]); largePlanId = str(o["largePlanId"])
    }
    public init(id: String) { self.init(json: .object(["id": .string(id)])) }
    var json: JSONValue {
        var o = raw
        for (k, v) in ["id": JSONValue.string(id), "name": .string(name), "budget": .number(budget), "plannedDate": .string(plannedDate), "category": .string(category),
                       "paymentMethod": .string(paymentMethod), "paymentId": .string(paymentId), "linkedBankId": .string(linkedBankId), "status": .string(status)] { o[k] = v }
        if !transactionId.isEmpty { o["transactionId"] = .string(transactionId) }
        if !largePlanId.isEmpty { o["largePlanId"] = .string(largePlanId) }
        return .object(o)
    }
}

public struct EventGoal: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var name: String
    /// travel / gift / event / other
    public var type: String
    public var deadline: String
    /// self（全額）/ equal（等分）/ amount（金額指定）
    public var splitMode: String
    public var participants: Int
    public var ownShareAmount: Double
    /// active / completed / cancelled
    public var status: String
    public var items: [EventGoalItem]
    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); name = str(json["name"]); type = str(json["type"]).isEmpty ? "travel" : str(json["type"]); deadline = str(json["deadline"])
        splitMode = str(json["splitMode"]).isEmpty ? "self" : str(json["splitMode"]); participants = Int(num(json["participants"]))
        ownShareAmount = num(json["ownShareAmount"]); status = str(json["status"]).isEmpty ? "active" : str(json["status"])
        items = (json["items"]?.arrayValue ?? []).map(EventGoalItem.init(json:))
    }
    public init(id: String) { self.init(json: .object(["id": .string(id)])) }
    public var known: [String: JSONValue] {
        ["id": .string(id), "name": .string(name), "type": .string(type), "deadline": .string(deadline), "splitMode": .string(splitMode),
         "participants": .number(Double(participants)), "ownShareAmount": .number(ownShareAmount), "status": .string(status), "items": .array(items.map(\.json))]
    }
    public var typeLabel: String { ["travel": "旅行", "gift": "プレゼント", "event": "イベント"][type] ?? "目標" }
}

public struct EventGoalSummary: Equatable, Sendable {
    public var total = 0.0, ownShare = 0.0, otherShare = 0.0, paid = 0.0, received = 0.0, unrecovered = 0.0, remaining = 0.0, advance = 0.0, weekly = 0.0
}

public extension MoneyDocument {
    var eventGoals: [EventGoal] { get { records("eventGoals") } set { setRecords("eventGoals", newValue) } }

    /// Web 版 eventGoalSummary
    func eventGoalSummary(_ g: EventGoal, today: String) -> EventGoalSummary {
        var s = EventGoalSummary()
        s.total = g.items.filter { $0.status != "cancelled" }.reduce(0) { $0 + $1.budget }
        let people = Double(max(1, g.participants == 0 ? 2 : g.participants))
        switch g.splitMode {
        case "equal": s.ownShare = min(s.total, (s.total / people).rounded(.toNearestOrAwayFromZero))
        case "amount": s.ownShare = min(max(g.ownShareAmount, 0), s.total)
        default: s.ownShare = s.total
        }
        s.otherShare = max(0, s.total - s.ownShare)
        s.paid = g.items.filter { $0.status == "paid" }.reduce(0) { $0 + $1.budget }
        var received = 0.0
        for x in root["reimbursements"]?.arrayValue ?? [] where str(x["goalId"]) == g.id && str(x["status"]) == "received" { received += num(x["amount"]) }
        s.received = received
        s.unrecovered = max(0, s.otherShare - s.received)
        s.remaining = max(0, s.total - s.paid)
        s.advance = max(0, s.paid - s.ownShare)
        let days = max(0, Dates.daysBetween(today, g.deadline.isEmpty ? today : g.deadline))
        let weeks = max(1, Int(ceil(Double(days) / 7)))
        s.weekly = ceil(max(0, s.ownShare - min(s.ownShare, s.paid)) / Double(weeks) / 100) * 100
        return s
    }

    /// 費目を大型支出の計画とつなぐ（Web 版 syncEventGoalPlans）
    mutating func syncEventGoalPlans(_ goalId: String, now: Date = Date()) {
        var goals = eventGoals
        guard let gi = goals.firstIndex(where: { $0.id == goalId }) else { return }
        var g = goals[gi]
        var plans = largeExpensePlans
        var keep = Set<String>()
        let iso = ISODate.now(now)
        for ii in g.items.indices {
            let item = g.items[ii]
            let pi = plans.firstIndex { str($0.raw["goalId"]) == g.id && str($0.raw["goalItemId"]) == item.id }
            if item.status == "cancelled" {
                if let pi, plans[pi].status != "completed" { plans.remove(at: pi) }
                continue
            }
            if item.status == "paid" {
                if let pi {
                    plans[pi].status = "completed"
                    if !item.transactionId.isEmpty { plans[pi].linkedTransactionId = item.transactionId }
                    var raw = plans[pi].json.objectValue ?? [:]; raw["updatedAt"] = .string(iso); plans[pi] = LargeExpensePlan(json: .object(raw))
                    g.items[ii].largePlanId = plans[pi].id
                }
                continue
            }
            let id = pi.map { plans[$0].id } ?? MoneyDocument.uid("large", now: now)
            let linked = !item.linkedBankId.isEmpty ? item.linkedBankId : item.paymentMethod == "bank" ? item.paymentId : item.paymentMethod == "debit" ? paymentBankId(method: "debit", id: item.paymentId) : ""
            var raw = pi.map { plans[$0].raw.objectValue ?? [:] } ?? [:]
            for (k, v) in ["id": JSONValue.string(id), "name": .string("\(g.name)・\(item.name)"), "date": .string(item.plannedDate.isEmpty ? g.deadline : item.plannedDate),
                           "amount": .number(item.budget), "category": .string(item.category.isEmpty ? "その他" : item.category), "priority": .string("required"),
                           "paymentMethod": .string(item.paymentMethod), "paymentId": .string(item.paymentId), "linkedBankId": .string(linked), "status": .string("planned"),
                           "memo": .string("目標「\(g.name)」の費目"), "splits": .array([]), "goalId": .string(g.id), "goalItemId": .string(item.id), "updatedAt": .string(iso)] { raw[k] = v }
            if raw["createdAt"] == nil { raw["createdAt"] = .string(iso) }
            let p = LargeExpensePlan(json: .object(raw))
            if let pi { plans[pi] = p } else { plans.append(p) }
            g.items[ii].largePlanId = id
            keep.insert(id)
        }
        plans = plans.filter { str($0.raw["goalId"]) != g.id || $0.status == "completed" || keep.contains($0.id) }
        largeExpensePlans = plans
        goals[gi] = g
        eventGoals = goals
    }

    /// 目標を保存する（追加・編集）
    mutating func saveEventGoal(_ goal: EventGoal, now: Date = Date()) {
        var goals = eventGoals
        var g = goal
        var raw = g.json.objectValue ?? [:]; raw["updatedAt"] = .string(ISODate.now(now)); if raw["createdAt"] == nil { raw["createdAt"] = .string(ISODate.now(now)) }
        g = EventGoal(json: .object(raw))
        if let i = goals.firstIndex(where: { $0.id == g.id }) { goals[i] = g } else { goals.append(g) }
        eventGoals = goals
        syncEventGoalPlans(g.id, now: now)
    }

    /// 費目を支出として記録する（Web 版 completeGoalItem）
    mutating func completeGoalItem(_ goalId: String, itemId: String, now: Date = Date(), today: String) {
        var goals = eventGoals
        guard let gi = goals.firstIndex(where: { $0.id == goalId }), let ii = goals[gi].items.firstIndex(where: { $0.id == itemId }),
              goals[gi].items[ii].status != "paid", goals[gi].items[ii].status != "cancelled" else { return }
        let g = goals[gi], i = g.items[ii]
        let tx = recordExpense(date: i.plannedDate, amount: i.budget, category: i.category, merchant: "\(g.name)・\(i.name)", paymentMethod: i.paymentMethod,
                               paymentId: i.paymentId, memo: "目標「\(g.name)」", source: "event_goal", linkedBankId: i.linkedBankId, now: now, today: today)
        goals = eventGoals
        goals[gi].items[ii].status = "paid"; goals[gi].items[ii].transactionId = tx?.id ?? ""
        eventGoals = goals
        var plans = largeExpensePlans
        if let pi = plans.firstIndex(where: { $0.id == i.largePlanId || (str($0.raw["goalId"]) == g.id && str($0.raw["goalItemId"]) == i.id) }) {
            plans[pi].status = "completed"; plans[pi].linkedTransactionId = tx?.id ?? ""
            largeExpensePlans = plans
        }
    }

    /// 割り勘の受取を記録する（Web 版 confirmGoalReimbursement）
    mutating func recordReimbursement(_ goalId: String, amount: Double, toType: String, bankId: String, now: Date = Date(), today: String) throws {
        guard let g = eventGoals.first(where: { $0.id == goalId }) else { throw GoalError.message("目標が見つかりません") }
        guard amount > 0, amount <= eventGoalSummary(g, today: today).unrecovered else { throw GoalError.message("未回収額以下の受取額を入力してください") }
        let inc = recordTempIncomeLike(date: today, amount: amount, sourceName: "\(g.name) 割り勘回収", toType: toType, bankId: bankId, memo: "旅行・プレゼント目標の回収", now: now, today: today)
        var list = root["reimbursements"]?.arrayValue ?? []
        list.append(.object(["id": .string(Self.uid("reimb", now: now)), "goalId": .string(g.id), "amount": .number(amount), "date": .string(today), "toType": .string(toType),
                             "bankId": .string(toType == "bank" ? bankId : ""), "incomeId": .string(inc), "status": .string("received"), "createdAt": .string(ISODate.now(now))]))
        self["reimbursements"] = .array(list)
    }

    /// 収入を1件記録する（Web 版 recordIncome、口座なら残高にすぐ反映）
    private mutating func recordTempIncomeLike(date: String, amount: Double, sourceName: String, toType: String, bankId: String, memo: String, now: Date, today: String) -> String {
        var inc = Income(id: Self.uid("inc", now: now))
        inc.date = date; inc.amount = amount; inc.sourceName = sourceName; inc.toType = toType; inc.bankId = toType == "bank" ? bankId : ""
        inc.memo = memo; inc.kind = "reimbursement"; inc.createdAt = ISODate.now(now)
        if toType == "bank", bank(bankId) != nil {
            if withinBaseline(bankId, date: date, createdAt: inc.createdAt) { inc.bankReconciled = true }
            else if date <= today { updateBank(bankId, delta: amount, memo: sourceName, now: now, today: today); inc.bankApplied = true; inc.bankEffectAt = ISODate.now(now) }
        }
        incomes = incomes + [inc]
        return inc.id
    }

    /// 目標を削除する（未完了の大型支出計画も消す。実績の取引は残す）
    mutating func deleteEventGoal(_ goalId: String) {
        var goals = eventGoals
        guard let i = goals.firstIndex(where: { $0.id == goalId }) else { return }
        goals[i].status = "cancelled"
        eventGoals = goals
        largeExpensePlans = largeExpensePlans.filter { str($0.raw["goalId"]) != goalId || $0.status == "completed" }
    }
}

// MARK: - 理由が分かる分析・給与分析

/// 順に並んだ見出しと今月・前月の値から行を作り、今月の大きい順に並べる（同じ値は最初に出た順）
func analysisRows(_ order: [String], _ a: [String: Double], _ b: [String: Double], dropZero: Bool) -> [AnalysisRow] {
    var rows: [(Int, AnalysisRow)] = []
    for (i, k) in order.enumerated() {
        let v: Double = a[k] ?? 0, p: Double = b[k] ?? 0
        if dropZero && v == 0 && p == 0 { continue }
        rows.append((i, AnalysisRow(key: k, value: v, prev: p, delta: v - p)))
    }
    rows.sort { x, y in x.1.value != y.1.value ? x.1.value > y.1.value : x.0 < y.0 }
    return rows.map { $0.1 }
}

public struct AnalysisRow: Equatable, Sendable, Identifiable {
    public var key: String
    public var value: Double
    public var prev: Double
    public var delta: Double
    public var id: String { key }
}

public extension MoneyDocument {
    /// 取引の支払い方法の名前（Web 版 paymentLabel(t)）
    func txPaymentLabel(_ t: Transaction) -> String {
        switch t.paymentMethod {
        case "card": return card(t.paymentId)?.name ?? (t.paymentId.isEmpty ? "クレジットカード" : "削除済みクレジットカード")
        case "debit": return debit(t.paymentId)?.name ?? (t.paymentId.isEmpty ? "デビットカード" : "削除済みデビットカード")
        case "bank": return bank(t.paymentId)?.name ?? (t.paymentId.isEmpty ? "銀行口座" : "削除済み銀行口座")
        default: return t.source == "gmail" ? "Gmail" : "現金・その他"
        }
    }
    /// 分析の分け方ごとの見出し
    func analysisKey(_ t: Transaction, dimension: String) -> String {
        switch dimension {
        case "merchant": return t.merchant.isEmpty ? "不明" : t.merchant
        case "weekday": return "\(Array("日月火水木金土")[Dates.weekday(t.date)])曜日"
        case "payment": return txPaymentLabel(t)
        default: return t.category.isEmpty ? "その他" : t.category
        }
    }
    /// Web 版 pro4ExpenseDimensionRows（compare: elapsed＝同じ経過日数 / full＝月全体）
    func expenseDimensionRows(month: String, dimension: String, compare: String, today: String) -> [AnalysisRow] {
        let prevMonth = Dates.addMonths(month, -1)
        let elapsed = month == String(today.prefix(7)) ? Dates.parts(today).d : Dates.daysInMonth(month)
        let cur = transactions(inMonth: month)
        let prev = transactions(inMonth: prevMonth).filter { compare == "full" || Dates.parts($0.date).d <= min(elapsed, Dates.daysInMonth(prevMonth)) }
        var order: [String] = []
        func tally(_ list: [Transaction]) -> [String: Double] {
            var m: [String: Double] = [:]
            for t in list { let k = analysisKey(t, dimension: dimension); if m[k] == nil && !order.contains(k) { order.append(k) }; m[k, default: 0] += t.amount }
            return m
        }
        let a = tally(cur), b = tally(prev)
        return analysisRows(order, a, b, dropZero: true)
    }
    /// Web 版 pro4SalaryRows（勤務先ごと・予定の入金日の月）
    func salaryAnalysisRows(month: String, today: String) -> [AnalysisRow] {
        var order: [String] = []
        func tally(_ list: [SalaryRecord]) -> [String: Double] {
            var m: [String: Double] = [:]
            for r in list { let k = employer(r.employerId)?.name ?? "勤務先"; if m[k] == nil && !order.contains(k) { order.append(k) }; m[k, default: 0] += expectedOrReceived(r, today: today) }
            return m
        }
        let a = tally(salaryRecords(payableIn: month)), b = tally(salaryRecords(payableIn: Dates.addMonths(month, -1)))
        return analysisRows(order, a, b, dropZero: false)
    }
    /// 増減の理由（Web 版 pro4ExpenseInsight）
    func expenseInsight(month: String, compare: String, today: String) -> String {
        let rows = expenseDimensionRows(month: month, dimension: "category", compare: compare, today: today)
        var top: AnalysisRow?
        for r in rows where r.delta > 0 { if top == nil || r.delta > top!.delta { top = r } }
        guard let top else { return "前月と比較できる増加要因はまだありません。" }
        var biggest: Transaction?
        for t in transactions(inMonth: month) where t.category == top.key { if biggest == nil || t.amount > biggest!.amount { biggest = t } }
        let merchant = biggest?.merchant ?? ""
        return "\(top.key)が前月\(compare == "elapsed" ? "同期間" : "")より \(Format.yen(top.delta)) 増えています。\(merchant.isEmpty ? "" : "このカテゴリでは「\(merchant)」の支出が大きくなっています。")"
    }
    /// 分析の明細（Web 版 openFilteredTransactions）
    func filteredTransactions(month: String, dimension: String, key: String) -> [Transaction] {
        transactions(inMonth: month).filter { analysisKey($0, dimension: dimension) == key }.sorted { $0.date > $1.date }
    }
}

// MARK: - 月締めレビュー

public struct MonthReviewIssue: Equatable, Sendable, Identifiable {
    public var type: String   // salary / card / goal / bank / mail / budget
    public var refId: String
    public var title: String
    public var sub: String
    public var billingMonth = ""
    public var id: String { "\(type)|\(refId)|\(title)|\(billingMonth)" }
}

public extension MoneyDocument {
    /// 確認が必要な項目（Web 版 monthReviewIssues）
    func monthReviewIssues(_ month: String, today: String, now: Date = Date()) -> [MonthReviewIssue] {
        var out: [MonthReviewIssue] = []
        for r in salaryRecords(payableIn: month) where status(r, today: today) == .overdue {
            out.append(MonthReviewIssue(type: "salary", refId: r.id, title: "入金日を過ぎた給与", sub: "\(employer(r.employerId)?.name ?? "給与")・\(Format.yen(expectedOrReceived(r, today: today)))"))
        }
        let recons = root["statementReconciliations"]?.arrayValue ?? []
        let txs = transactions
        for c in cards {
            for st in statements(c.id, paymentMonth: month) where st.amount != 0 {
                let rec = recons.first { str($0["cardId"]) == c.id && str($0["billingMonth"]) == st.billingMonth }
                let ids = Set((rec?["linkedTransactionIds"]?.arrayValue ?? []).compactMap(\.stringValue))
                let linked = txs.filter { ids.contains($0.id) }.reduce(0) { $0 + $1.amount }
                let confirmed = num(rec?["confirmedAmount"]) != 0 ? num(rec?["confirmedAmount"]) : st.amount
                if rec == nil || abs(confirmed - linked) >= 1 {
                    out.append(MonthReviewIssue(type: "card", refId: c.id, title: "カード請求の照合が未完了", sub: "\(c.name)・\(Format.monthLabel(st.billingMonth))対象・\(Format.yen(st.amount))", billingMonth: st.billingMonth))
                }
            }
        }
        for g in eventGoals where g.status != "cancelled" && String(g.deadline.prefix(7)) <= month {
            let s = eventGoalSummary(g, today: today)
            if s.unrecovered > 0 { out.append(MonthReviewIssue(type: "goal", refId: g.id, title: "割り勘の未回収", sub: "\(g.name)・\(Format.yen(s.unrecovered))")) }
        }
        for b in banks {
            let asof = b.balanceAsOf.isEmpty ? b.updatedAt : b.balanceAsOf
            let ms = ISODate.ms(asof)
            if asof.isEmpty || ms == nil || now.timeIntervalSince1970 * 1000 - ms! > 31 * 86_400_000 {
                out.append(MonthReviewIssue(type: "bank", refId: b.id, title: "残高の確認が古い口座",
                                            sub: "\(b.name)・\(ms.map { Date(timeIntervalSince1970: $0 / 1000).formatted(.dateTime.year().month(.defaultDigits).day()) } ?? "確認日時なし")"))
            }
        }
        let pending = (root["mailImports"]?.arrayValue ?? []).filter { str($0["date"]).hasPrefix(month) && str($0["status"]) == "pending" }.count
        if pending > 0 { out.append(MonthReviewIssue(type: "mail", refId: "", title: "未確認のGmail取引", sub: "\(pending)件")) }
        let goal = monthlyGoalTotal(month), spent = spentMonth(month)
        if goal > 0 && abs(spent - goal) > 0 {
            out.append(MonthReviewIssue(type: "budget", refId: "", title: "月間予算との差異", sub: "目標 \(Format.yen(goal)) / 実績 \(Format.yen(spent)) / 差 \(spent - goal >= 0 ? "+" : "")\(Format.yen(spent - goal))"))
        }
        return out
    }

    /// レビュー後に記録が変わったかを見分ける値（Web 版 monthReviewChecksum と同じ対象。iOS は並びを固定した JSON で作る）
    func monthReviewChecksum(_ month: String) -> String {
        let txs = transactions(inMonth: month).map { JSONValue.array([.string($0.id), .string($0.date), .number($0.amount), .string($0.category), .string($0.paymentMethod), .string($0.paymentId), .string($0.merchant)]) }
        let sal = salaryRecords.filter { effectiveDate($0).hasPrefix(month) }.map { r in JSONValue.array([.string(r.id), .number(r.gross), .number(r.transport), r.receivedAmount.map { .number($0) } ?? .null, .string(r.status), .string(r.date), .string(r.actualReceivedDate)]) }
        let payload = JSONValue.object(["transactions": .array(txs), "salary": .array(sal), "cards": root["cardAdjustments"] ?? .null,
                                        "banks": .array(banks.map { .array([.string($0.id), .number($0.balance), .string($0.balanceAsOf), .string($0.updatedAt)]) }),
                                        "goal": root["monthlyGoals"]?[month] ?? .object([:]), "reimbursements": root["reimbursements"] ?? .null])
        var h: UInt32 = 2166136261
        for u in payload.canonical.utf16 { h ^= UInt32(u); h = h &* 16777619 }
        return "ios-" + String(h, radix: 16)
    }
    mutating func recordMonthReview(_ month: String, issueCount: Int, now: Date = Date()) {
        var all = root["monthReviews"]?.objectValue ?? [:]
        all[month] = .object(["reviewedAt": .string(ISODate.now(now)), "checksum": .string(monthReviewChecksum(month)), "issueCount": .number(Double(issueCount))])
        self["monthReviews"] = .object(all)
    }
}

// MARK: - お金のタイムライン（口座ごと）

public struct BankForecastRow: Equatable, Sendable, Identifiable {
    public var date: String
    public var income = 0.0, outflow = 0.0, transfer = 0.0
    public var events: [AcfEvent] = []
    public var openingBalance = 0.0, forecastBalance = 0.0
    public var id: String { date }
}
public struct BankForecast: Sendable {
    public var bankId: String
    public var rows: [BankForecastRow]
    public var minBalance: Double, minDate: String, endBalance: Double
    public var shortage: Double { max(0, -minBalance) }
}

public struct TransferPlan: JSONRecord {
    public var raw: JSONValue
    public var id: String, fromBankId: String, toBankId: String, date: String, status: String, executedAt: String
    public var amount: Double
    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]); fromBankId = str(json["fromBankId"]); toBankId = str(json["toBankId"]); date = str(json["date"])
        status = str(json["status"]).isEmpty ? "planned" : str(json["status"]); executedAt = str(json["executedAt"]); amount = num(json["amount"])
    }
    public var known: [String: JSONValue] {
        var o: [String: JSONValue] = ["id": .string(id), "fromBankId": .string(fromBankId), "toBankId": .string(toBankId), "amount": .number(amount), "date": .string(date), "status": .string(status)]
        if !executedAt.isEmpty { o["executedAt"] = .string(executedAt) }
        return o
    }
}

public extension MoneyDocument {
    var transferPlans: [TransferPlan] { get { records("transferPlans") } set { setRecords("transferPlans", newValue) } }

    /// 口座ごとの見通し（Web 版 pro3BankForecast）
    func bankForecast(_ bankId: String, days: Int = 60, today: String, extraPlan: TransferPlan? = nil) -> BankForecast? {
        guard let b = bank(bankId) else { return nil }
        let start = today, end = Dates.addDays(start, days - 1)
        let dates = (0..<max(1, days)).map { Dates.addDays(start, $0) }
        var rows = Dictionary(uniqueKeysWithValues: dates.map { ($0, BankForecastRow(date: $0)) })
        func add(_ date: String, _ delta: Double, _ label: String, _ type: String) {
            guard var r = rows[date] else { return }
            if delta >= 0 { r.income += delta } else { r.outflow += -delta }
            if type == "transfer" { r.transfer += delta }
            r.events.append(AcfEvent(label: label, amount: delta, type: type))
            rows[date] = r
        }
        for r in salaryRecords where r.status != "入金済" && r.date >= start && r.date <= end {
            if let e = employer(r.employerId), e.bankId == bankId { add(r.date, max(0, r.gross), "\(e.name) 給与", "salary") }
        }
        for f in fixedPayments where f.paymentMethod != "card" && paymentBankId(method: f.paymentMethod, id: f.paymentId) == bankId {
            for d in dates where fixedDue(f, on: d) && !f.skippedDates.contains(d) && !fixedRecorded(f, date: d) { add(d, -max(0, f.amount), f.name.isEmpty ? "固定支払い" : f.name, "fixed") }
        }
        // Web 版 getCardPaymentEvents（予定の加算を含まない請求）
        let sm = String(start.prefix(7)), em = String(end.prefix(7))
        var pm = sm
        while pm <= em {
            for st in cardPaymentStatements(inMonth: pm) where !st.paymentDate.isEmpty && st.paymentDate >= start && st.paymentDate <= end && st.status != .paid {
                if card(st.cardId)?.bankId == bankId { add(st.paymentDate, -max(0, st.amount), "\(st.cardName) 引落", "card") }
            }
            pm = Dates.addMonths(pm, 1)
        }
        for p in largeExpensePlans where p.status == "planned" && p.priority == "required" && p.date >= start && p.date <= end {
            for (part, _) in largeExpensePendingParts(p) where part.paymentMethod != "card" {
                let bid = part.linkedBankId.isEmpty ? paymentBankId(method: part.paymentMethod, id: part.paymentId) : part.linkedBankId
                if bid == bankId { add(p.date, -max(0, part.amount), p.name.isEmpty ? "大型支出" : p.name, "large") }
            }
        }
        for p in transferPlans + (extraPlan.map { [$0] } ?? []) where p.status == "planned" && p.date >= start && p.date <= end {
            if p.fromBankId == bankId { add(p.date, -p.amount, "振替 → \(bank(p.toBankId)?.name ?? "別口座")", "transfer") }
            if p.toBankId == bankId { add(p.date, p.amount, "振替 ← \(bank(p.fromBankId)?.name ?? "別口座")", "transfer") }
        }
        var bal = b.balance, mn = bal, minDate = start
        let out = dates.map { d -> BankForecastRow in
            var r = rows[d]!
            r.openingBalance = bal; bal += r.income - r.outflow; r.forecastBalance = bal
            if bal < mn { mn = bal; minDate = d }
            return r
        }
        return BankForecast(bankId: bankId, rows: out, minBalance: mn, minDate: minDate, endBalance: bal)
    }

    /// 振替計画を作る
    mutating func addTransferPlan(from: String, to: String, amount: Double, date: String, now: Date = Date()) throws {
        guard bank(from) != nil, bank(to) != nil, from != to, amount > 0 else { throw GoalError.message("振替条件が不正です") }
        let iso = ISODate.now(now)
        var raw = TransferPlan(json: .object([:])).known
        raw = ["id": .string(Self.uid("transfer", now: now)), "fromBankId": .string(from), "toBankId": .string(to), "amount": .number(amount), "date": .string(date),
               "status": .string("planned"), "createdAt": .string(iso), "updatedAt": .string(iso)]
        transferPlans = transferPlans + [TransferPlan(json: .object(raw))]
    }
    /// 実行済みにする（アプリ内の2口座の残高だけを同額で動かす。Web 版 executeTransferPlan）
    mutating func executeTransferPlan(_ id: String, now: Date = Date(), today: String) throws {
        var list = transferPlans
        guard let i = list.firstIndex(where: { $0.id == id }), list[i].status == "planned" else { throw GoalError.message("振替計画がありません") }
        let p = list[i]
        guard let from = bank(p.fromBankId), bank(p.toBankId) != nil, from.id != p.toBankId, p.amount > 0 else { throw GoalError.message("振替条件が変わりました") }
        guard from.balance >= p.amount else { throw GoalError.message("\(from.name)の現在残高は\(Format.yen(from.balance))です。") }
        let iso = ISODate.now(now)
        var bs = banks
        for j in bs.indices {
            if bs[j].id == p.fromBankId { bs[j].balance -= p.amount; bs[j].updatedAt = iso }
            if bs[j].id == p.toBankId { bs[j].balance += p.amount; bs[j].updatedAt = iso }
        }
        banks = bs
        list[i].status = "executed"; list[i].executedAt = iso
        var raw = list[i].json.objectValue ?? [:]; raw["updatedAt"] = .string(iso); list[i] = TransferPlan(json: .object(raw))
        transferPlans = list
        bankSnapshot(p.fromBankId, memo: "振替 \(p.id) → \(bank(p.toBankId)!.name)", now: now, today: today)
        bankSnapshot(p.toBankId, memo: "振替 \(p.id) ← \(from.name)", now: now, today: today)
    }
    /// 実行を取り消す（実行後に残高が更新された口座があれば戻さない。Web 版 undoTransferPlan）
    mutating func undoTransferPlan(_ id: String, now: Date = Date(), today: String) throws {
        var list = transferPlans
        guard let i = list.firstIndex(where: { $0.id == id }), list[i].status == "executed" else { throw GoalError.message("振替は取消できません") }
        let p = list[i]
        let later = (root["assetSnapshots"]?.arrayValue ?? []).contains { s in
            [p.fromBankId, p.toBankId].contains(str(s["bankId"])) && str(s["createdAt"]) > p.executedAt && !str(s["memo"]).contains(p.id)
        }
        if later { throw GoalError.message("実行後に口座残高が更新されています。二重調整を防ぐため、残高を確認して手動で修正してください。") }
        var bs = banks
        for j in bs.indices {
            if bs[j].id == p.fromBankId { bs[j].balance += p.amount }
            if bs[j].id == p.toBankId { bs[j].balance -= p.amount }
        }
        banks = bs
        list[i].status = "cancelled"
        transferPlans = list
        bankSnapshot(p.fromBankId, memo: "振替取消 \(p.id)", now: now, today: today)
        bankSnapshot(p.toBankId, memo: "振替取消 \(p.id)", now: now, today: today)
    }
}

// MARK: - 予算の立て直し

public struct RebalancePlan: Sendable {
    public var plan: [Int: Double]
    public var target: Double, past: Double, remaining: Double
    public var locked: Set<String>
    public var editable: [String]
    public var chosen: [String]
}

public extension MoneyDocument {
    /// 残りの予算を配り直す（Web 版 pro3RebalancePlan。mode: even / weighted / selected）
    func rebalancePlan(month: String, mode: String, selected: [String] = [], today: String) -> RebalancePlan {
        let raw = root["monthlyGoals"]?[month]
        let start = month == String(today.prefix(7)) ? Dates.parts(today).d : 1
        let days = Dates.daysInMonth(month)
        let target = max(0, num(raw?["total"]))
        let past = month == String(today.prefix(7)) ? spentMonth(month) : 0
        let remaining = max(0, target - past)
        var locked = Set<String>(), editable: [String] = []
        if start <= days {
            for d in start...days {
                let ds = "\(month)-\(pad2(d))"
                if str(root["dailyGoals"]?[ds]?["origin"]) == "daily" { locked.insert(ds) } else { editable.append(ds) }
            }
        }
        let chosen = mode == "selected" ? editable.filter { selected.contains($0) } : editable
        var base = Dictionary(uniqueKeysWithValues: (raw?["daily"]?.objectValue ?? [:]).compactMap { k, v in Int(k).map { ($0, num(v)) } })
        let lockedFuture = locked.reduce(0.0) { acc, ds in
            let d = Dates.parts(ds).d
            let b = base[d] ?? 0
            return acc + max(spent(on: ds), b != 0 ? b : num(root["dailyGoals"]?[ds]?["total"]))
        }
        let available = max(0, remaining - lockedFuture)
        let weights = mode == "weighted" ? weekdaySpendingWeights(month: month, weeks: 8) : Array(repeating: 1.0, count: 7)
        func w(_ ds: String) -> Double { let x = weights[Dates.weekday(ds)]; return x == 0 ? 1 : x }
        let denomRaw = chosen.reduce(0) { $0 + (mode == "weighted" ? w($1) : 1) }
        let denom = denomRaw == 0 ? 1 : denomRaw
        var used = 0.0
        for (i, ds) in chosen.enumerated() {
            let d = Dates.parts(ds).d
            let floorV = ds == today ? spent(on: ds) : 0
            let ww = mode == "weighted" ? w(ds) : 1
            let v = i == chosen.count - 1 ? max(0, available - used) : max(0, floor((available * ww / denom) / 100) * 100)
            base[d] = max(floorV, v)
            used += base[d]!
        }
        if mode == "selected" {
            for ds in editable where !selected.contains(ds) { let d = Dates.parts(ds).d; base[d] = max(spent(on: ds), base[d] ?? 0) }
        }
        return RebalancePlan(plan: base, target: target, past: past, remaining: remaining, locked: locked, editable: editable, chosen: chosen)
    }

    /// 立て直しを保存する（取り消せるように前の状態を残す。Web 版 applyRebalance）。戻り値は履歴の ID
    @discardableResult
    mutating func applyRebalance(month: String, plan: [Int: Double], now: Date = Date(), today: String) -> String {
        var mg = root["monthlyGoals"]?.objectValue ?? [:]
        var m = mg[month]?.objectValue ?? [:]
        let beforeDaily = m["daily"] ?? .object([:])
        var dg = root["dailyGoals"]?.objectValue ?? [:]
        var beforeGoals: [String: JSONValue] = [:]
        for d in 1...Dates.daysInMonth(month) { let ds = "\(month)-\(pad2(d))"; if let g = dg[ds] { beforeGoals[ds] = g } }
        let after = JSONValue.object(Dictionary(uniqueKeysWithValues: plan.map { (String($0.key), JSONValue.number($0.value)) }))
        m["daily"] = after; mg[month] = .object(m)
        let start = month == String(today.prefix(7)) ? Dates.parts(today).d : 1
        if start <= Dates.daysInMonth(month) {
            for d in start...Dates.daysInMonth(month) {
                let ds = "\(month)-\(pad2(d))", ex = dg[ds]
                if str(ex?["origin"]) == "daily" { continue }
                let v = max(0, plan[d] ?? 0)
                if v > 0 { dg[ds] = .object(["total": .number(v), "categories": ex?["categories"] ?? .object([:]), "origin": .string("monthly")]) }
                else if str(ex?["origin"]) == "monthly" { dg.removeValue(forKey: ds) }
            }
        }
        self["monthlyGoals"] = .object(mg); self["dailyGoals"] = .object(dg)
        let id = Self.uid("rebalance", now: now)
        var hist = root["budgetRebalanceHistory"]?.arrayValue ?? []
        hist.append(.object(["id": .string(id), "month": .string(month), "beforeDaily": beforeDaily, "beforeGoals": .object(beforeGoals), "afterDaily": after, "createdAt": .string(ISODate.now(now))]))
        self["budgetRebalanceHistory"] = .array(Array(hist.suffix(20)))
        return id
    }
    /// 立て直しを取り消す（その後に日別計画を変えていたら取り消さない）
    mutating func undoRebalance(_ id: String) throws {
        var hist = root["budgetRebalanceHistory"]?.arrayValue ?? []
        guard let h = hist.first(where: { str($0["id"]) == id }) else { return }
        let month = str(h["month"])
        let current = root["monthlyGoals"]?[month]?["daily"] ?? .object([:])
        guard current.canonical == (h["afterDaily"] ?? .object([:])).canonical else { throw GoalError.message("立て直し後に日別計画が変更されています。後の編集を消さないため、自動取り消しを停止しました。") }
        var mg = root["monthlyGoals"]?.objectValue ?? [:]
        var m = mg[month]?.objectValue ?? [:]; m["daily"] = h["beforeDaily"] ?? .object([:]); mg[month] = .object(m)
        var dg = root["dailyGoals"]?.objectValue ?? [:]
        for d in 1...Dates.daysInMonth(month) {
            let ds = "\(month)-\(pad2(d))"
            if let g = h["beforeGoals"]?[ds] { dg[ds] = g } else if str(dg[ds]?["origin"]) == "monthly" { dg.removeValue(forKey: ds) }
        }
        self["monthlyGoals"] = .object(mg); self["dailyGoals"] = .object(dg)
        hist.removeAll { str($0["id"]) == id }
        self["budgetRebalanceHistory"] = .array(hist)
    }
}

// MARK: - 給料日の振り分け

public struct SalaryAllocationBuckets: Equatable, Sendable {
    public var payments = 0.0, living = 0.0, goals = 0.0, reserve = 0.0
    public var total: Double { payments + living + goals + reserve }
    public init(payments: Double = 0, living: Double = 0, goals: Double = 0, reserve: Double = 0) { self.payments = payments; self.living = living; self.goals = goals; self.reserve = reserve }
}

public extension MoneyDocument {
    func salaryAllocation(for recordId: String) -> JSONValue? {
        (root["salaryAllocations"]?.arrayValue ?? []).first { str($0["salaryRecordId"]) == recordId && str($0["status"]) == "active" }
    }
    /// おすすめの振り分け（Web 版 salaryAllocationRecommendation：次の入金までの支払い → 任意の大型支出 → 最低残高 → 生活費）
    func salaryAllocationRecommendation(_ r: SalaryRecord, today: String) -> (buckets: SalaryAllocationBuckets, start: String, end: String, nextIncome: String) {
        let amount = cashAmount(r)
        let start = !r.actualReceivedDate.isEmpty ? r.actualReceivedDate : (!r.date.isEmpty ? r.date : today)
        let future = salaryRecords.filter { $0.id != r.id && effectiveDate($0) > start }.sorted { effectiveDate($0) < effectiveDate($1) }
        let end = future.first.map { effectiveDate($0) } ?? Dates.addDays(start, 30)
        let f = acfForecastFrom(start: start, horizonEnd: end, today: today)
        let payments = min(amount, f.baseRows.reduce(0) { $0 + $1.mandatoryOutflow })
        let optional = largeExpensePlans.filter { $0.status == "planned" && $0.priority == "optional" && $0.date >= start && $0.date <= end }.reduce(0) { $0 + $1.amount }
        let goals = min(max(0, amount - payments), optional)
        let reserve = min(max(0, amount - payments - goals), max(0, num(root["acfSettings"]?["reserveFloor"])))
        let living = max(0, amount - payments - goals - reserve)
        return (SalaryAllocationBuckets(payments: payments, living: living, goals: goals, reserve: reserve), start, end, future.first.map { effectiveDate($0) } ?? "")
    }
    /// 指定した日からの必須の入出金（計画の生活費なし）
    func acfForecastFrom(start: String, horizonEnd: String, today: String) -> AcfContext {
        acfBaseContext(start: start, settings: acfSettings, today: today, horizonEnd: horizonEnd)
    }
    mutating func saveSalaryAllocation(_ recordId: String, buckets b: SalaryAllocationBuckets, validUntil: String, now: Date = Date()) {
        guard let r = salaryRecords.first(where: { $0.id == recordId }) else { return }
        let iso = ISODate.now(now)
        var list = root["salaryAllocations"]?.arrayValue ?? []
        let bj = JSONValue.object(["payments": .number(b.payments), "living": .number(b.living), "goals": .number(b.goals), "reserve": .number(b.reserve)])
        if let i = list.firstIndex(where: { str($0["salaryRecordId"]) == recordId && str($0["status"]) == "active" }) {
            var o = list[i].objectValue ?? [:]
            o["receivedAmount"] = .number(cashAmount(r)); o["buckets"] = bj; o["validUntil"] = .string(validUntil); o["updatedAt"] = .string(iso)
            list[i] = .object(o)
        } else {
            list.append(.object(["id": .string(Self.uid("alloc", now: now)), "salaryRecordId": .string(recordId), "receivedAmount": .number(cashAmount(r)), "buckets": bj,
                                 "status": .string("active"), "validUntil": .string(validUntil), "createdAt": .string(iso), "updatedAt": .string(iso)]))
        }
        self["salaryAllocations"] = .array(list)
    }
    mutating func releaseSalaryAllocation(_ recordId: String, now: Date = Date()) {
        var list = root["salaryAllocations"]?.arrayValue ?? []
        for i in list.indices where str(list[i]["salaryRecordId"]) == recordId && str(list[i]["status"]) == "active" {
            var o = list[i].objectValue ?? [:]; o["status"] = .string("released"); o["updatedAt"] = .string(ISODate.now(now)); list[i] = .object(o)
        }
        self["salaryAllocations"] = .array(list)
    }
}
