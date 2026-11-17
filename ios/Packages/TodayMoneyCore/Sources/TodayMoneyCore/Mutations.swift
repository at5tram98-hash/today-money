import Foundation

/// データを変える操作（Web 版 08-transactions.js・03-ledger.js の setCardStatement など）。
/// 口座残高への反映は Web 版と同じ規則：残高を入力した時刻（balanceAsOf）より前の取引は、すでに残高に含まれているものとして二重に引かない。
public extension MoneyDocument {

    /// Web 版 uid（接頭辞_時刻36進_乱数6桁）
    static func uid(_ prefix: String, now: Date = Date()) -> String {
        let t = String(Int(now.timeIntervalSince1970 * 1000), radix: 36)
        let r = String((0..<6).map { _ in "0123456789abcdefghijklmnopqrstuvwxyz".randomElement()! })
        return "\(prefix)_\(t)_\(r)"
    }

    // MARK: 口座

    /// 残高の履歴（Web 版 bankSnapshot。最大 600 件）
    mutating func bankSnapshot(_ bankId: String, memo: String, now: Date = Date(), today: String) {
        guard let b = bank(bankId) else { return }
        var list = root["assetSnapshots"]?.arrayValue ?? []
        list.append(.object(["id": .string(Self.uid("snap", now: now)), "date": .string(today), "createdAt": .string(ISODate.now(now)),
                             "bankId": .string(b.id), "bankBalance": .number(b.balance), "bankTotal": .number(totalBankBalance), "memo": .string(memo)]))
        self["assetSnapshots"] = .array(Array(list.suffix(600)))
    }

    /// 残高を足し引きする（Web 版 updateBank）。下回った時のお知らせは返り値で知らせる
    @discardableResult
    mutating func updateBank(_ bankId: String, delta: Double, memo: String, now: Date = Date(), today: String) -> Bool {
        guard var list = Optional(banks), let i = list.firstIndex(where: { $0.id == bankId }) else { return false }
        list[i].balance += delta
        list[i].updatedAt = ISODate.now(now)
        banks = list
        bankSnapshot(bankId, memo: memo, now: now, today: today)
        let b = list[i]
        if b.threshold > 0 && b.balance < b.threshold && (root["notificationSettings"]?["balance"]?.boolValue ?? true) {
            addNotice(title: "残高低下アラート", body: "\(b.name)の残高が設定額を下回りました（\(Format.yen(b.balance))）", kind: "warning", now: now, today: today)
        }
        return true
    }

    /// 今の残高を入力する（Web 版 reconcileBankBalance）。これより前の取引は「残高に反映済み扱い」にする
    mutating func reconcileBankBalance(_ bankId: String, balance: Double, memo: String = "手動残高", now: Date = Date(), today: String) {
        guard var list = Optional(banks), let i = list.firstIndex(where: { $0.id == bankId }) else { return }
        let iso = ISODate.now(now)
        list[i].balance = max(0, balance); list[i].updatedAt = iso; list[i].balanceAsOf = iso
        banks = list
        reconcileHistory(bankId, asOf: iso, today: today)
        bankSnapshot(bankId, memo: memo, now: now, today: today)
    }

    private mutating func reconcileHistory(_ bankId: String, asOf iso: String, today: String) {
        guard let asOfMs = ISODate.ms(iso) else { return }
        let asOfDate = Dates.ymd(Date(timeIntervalSince1970: asOfMs / 1000))
        func before(_ date: String, _ created: String, _ effect: String) -> Bool {
            let ev = Self.eventTime(date: date, createdAt: created, eventAt: effect)
            return (!date.isEmpty && date < asOfDate) || (date == asOfDate && ev <= asOfMs)
        }
        var txs = transactions
        for i in txs.indices where transactionBankId(txs[i]) == bankId && before(txs[i].date, txs[i].createdAt, txs[i].bankEffectAt) {
            txs[i].bankApplied = false; txs[i].bankReconciled = true
            if txs[i].bankEffectAt.isEmpty { txs[i].bankEffectAt = iso }
        }
        transactions = txs
        var incs = incomes
        for i in incs.indices where incs[i].toType == "bank" && incs[i].bankId == bankId && before(incs[i].date, incs[i].createdAt, incs[i].bankEffectAt) {
            incs[i].bankApplied = false; incs[i].bankReconciled = true
            if incs[i].bankEffectAt.isEmpty { incs[i].bankEffectAt = iso }
        }
        incomes = incs
        var adjs = root["cardAdjustments"]?.objectValue ?? [:]
        for (key, v) in adjs {
            guard var a = CardAdjustment(v), a.status == "paid", a.bankApplied else { continue }
            let p = key.split(separator: "|", maxSplits: 1).map(String.init); guard p.count == 2 else { continue }
            let c = card(p[1]), linked = a.bankIdAtPayment.isEmpty ? (c?.bankId ?? "") : a.bankIdAtPayment
            guard linked == bankId else { continue }
            let payDate = a.paymentDateOverride.isEmpty ? (cardPaymentDate(c, billingMonth: p[0]) ?? "") : a.paymentDateOverride
            let effectMs = ISODate.ms(a.bankEffectAt)
            if (!payDate.isEmpty && payDate < asOfDate) || (payDate == asOfDate && (effectMs == nil || effectMs! <= asOfMs)) {
                a.bankApplied = false; a.bankReconciled = true
                if a.bankEffectAt.isEmpty { a.bankEffectAt = iso }
                adjs[key] = a.json
            }
        }
        if root["cardAdjustments"] != nil { self["cardAdjustments"] = .object(adjs) }
    }

    static func eventTime(date: String, createdAt: String, eventAt: String = "") -> Double {
        if let n = ISODate.ms(eventAt) { return n }
        if let n = ISODate.ms(createdAt) { return n }
        if !date.isEmpty, let n = ISODate.ms("\(date)T23:59:59") { return n }
        return Date().timeIntervalSince1970 * 1000
    }

    /// 残高を入力した時より前の出来事か（Web 版 bankEffectWithinBaseline、respectBalanceAsOf=true）
    func withinBaseline(_ bankId: String, date: String, createdAt: String, eventAt: String = "") -> Bool {
        guard let b = bank(bankId), let asOfMs = ISODate.ms(b.balanceAsOf) else { return false }
        let asOfDate = Dates.ymd(Date(timeIntervalSince1970: asOfMs / 1000))
        if !date.isEmpty {
            if date < asOfDate { return true }
            if date > asOfDate { return false }
        }
        return Self.eventTime(date: date, createdAt: createdAt, eventAt: eventAt) <= asOfMs
    }

    // MARK: 支出

    /// 支出を記録する（Web 版 recordExpense）。口座・デビットなら残高から引く（未来の日付は引かない）
    @discardableResult
    mutating func recordExpense(date: String, amount: Double, category: String, merchant: String, paymentMethod: String, paymentId: String,
                                memo: String = "", source: String = "manual", fixedId: String = "", largePlanId: String = "", largePlanPartIndex: Int? = nil,
                                linkedBankId: String = "", eventAt: String = "", now: Date = Date(), today: String) -> Transaction? {
        let amount = abs(amount)
        guard amount > 0 else { return nil }
        var t = Transaction(id: Self.uid("tx", now: now))
        t.date = date; t.amount = amount; t.category = category; t.merchant = merchant
        t.paymentMethod = paymentMethod; t.paymentId = paymentId; t.memo = memo; t.source = source
        t.fixedId = fixedId; t.largePlanId = largePlanId; t.largePlanPartIndex = largePlanPartIndex
        t.linkedBankId = linkedBankId.isEmpty ? (paymentMethod == "debit" ? paymentBankId(method: paymentMethod, id: paymentId) : "") : linkedBankId
        t.createdAt = ISODate.now(now)
        if paymentMethod == "bank" || paymentMethod == "debit" { applyBankEffect(&t, eventAt: eventAt, now: now, today: today) }
        var list = transactions; list.append(t); transactions = list
        return t
    }

    mutating func applyBankEffect(_ t: inout Transaction, eventAt: String = "", now: Date, today: String) {
        let bankId = transactionBankId(t)
        guard !bankId.isEmpty, bank(bankId) != nil else { t.bankApplied = false; t.bankReconciled = false; return }
        if withinBaseline(bankId, date: t.date, createdAt: t.createdAt, eventAt: eventAt) {
            t.bankApplied = false; t.bankReconciled = true
            if t.linkedBankId.isEmpty { t.linkedBankId = bankId }
            return
        }
        if !t.date.isEmpty && t.date > today { t.bankApplied = false; return }
        updateBank(bankId, delta: -t.amount, memo: t.merchant.isEmpty ? "取引" : t.merchant, now: now, today: today)
        t.bankApplied = true; t.bankReconciled = false; t.bankEffectAt = ISODate.now(now)
        if t.linkedBankId.isEmpty { t.linkedBankId = bankId }
    }

    private mutating func reverseBankEffect(_ t: inout Transaction, now: Date, today: String) {
        guard t.bankApplied else { return }
        let bankId = transactionBankId(t)
        guard let b = bank(bankId) else { t.bankApplied = false; return }
        if let asOf = ISODate.ms(b.balanceAsOf), let eff = ISODate.ms(t.bankEffectAt), eff <= asOf {
            t.bankApplied = false; t.bankReconciled = true; return
        }
        updateBank(bankId, delta: t.amount, memo: "\(t.merchant.isEmpty ? "取引" : t.merchant)・取消", now: now, today: today)
        t.bankApplied = false; t.bankReconciled = false
    }

    /// 支出を直す（Web 版 取引の編集：口座への反映を一度戻してからやり直す）
    mutating func updateTransaction(_ edited: Transaction, now: Date = Date(), today: String) {
        var list = transactions
        guard let i = list.firstIndex(where: { $0.id == edited.id }) else { return }
        var old = list[i]
        reverseBankEffect(&old, now: now, today: today)
        var t = edited
        t.bankApplied = old.bankApplied; t.bankReconciled = old.bankReconciled
        t.updatedAt = ISODate.now(now)
        if t.paymentMethod == "debit" { t.linkedBankId = paymentBankId(method: "debit", id: t.paymentId) } else if t.paymentMethod != old.paymentMethod || t.paymentId != old.paymentId { t.linkedBankId = "" }
        if !t.bankReconciled && (t.paymentMethod == "bank" || t.paymentMethod == "debit") { applyBankEffect(&t, now: now, today: today) }
        list = transactions
        if let j = list.firstIndex(where: { $0.id == t.id }) { list[j] = t }
        transactions = list
    }

    /// 支出を消す（口座へ反映していたら戻す。Web 版 deleteTransaction）
    mutating func deleteTransaction(_ id: String, now: Date = Date(), today: String) {
        guard var t = transactions.first(where: { $0.id == id }) else { return }
        reverseBankEffect(&t, now: now, today: today)
        transactions = transactions.filter { $0.id != id }
    }

    // MARK: 収入

    /// 臨時収入を記録する（Web 版 新規入力の「臨時収入」：tempIncomes と incomes を対で作る）
    @discardableResult
    mutating func recordTempIncome(date: String, amount: Double, sourceName: String, toType: String, bankId: String, memo: String = "",
                                   now: Date = Date(), today: String) -> TempIncome? {
        let amount = abs(amount)
        guard amount > 0 else { return nil }
        let tempId = Self.uid("tmp", now: now)
        var inc = Income(id: Self.uid("inc", now: now))
        inc.date = date; inc.amount = amount; inc.sourceName = sourceName; inc.toType = toType
        inc.bankId = toType == "bank" ? bankId : ""; inc.memo = memo; inc.kind = "temporary"; inc.tempIncomeId = tempId
        inc.createdAt = ISODate.now(now)
        var incs = incomes; incs.append(inc); incomes = incs
        var temp = TempIncome(json: .object([:]))
        temp.id = tempId; temp.date = date; temp.amount = amount; temp.sourceName = sourceName; temp.incomeId = inc.id
        var raw = temp.json.objectValue ?? [:]
        raw["toType"] = .string(toType); raw["bankId"] = .string(inc.bankId); raw["memo"] = .string(memo); raw["receivedConfirmed"] = .bool(false)
        var temps = root["tempIncomes"]?.arrayValue ?? []
        temps.append(.object(raw)); self["tempIncomes"] = .array(temps)
        return TempIncome(json: .object(raw))
    }

    /// 臨時収入を受け取った（口座なら残高に足す）
    mutating func confirmTempIncome(_ tempId: String, received: Bool, now: Date = Date(), today: String) {
        var temps = tempIncomes
        guard let i = temps.firstIndex(where: { $0.id == tempId }) else { return }
        temps[i].receivedConfirmed = received
        tempIncomes = temps
        var incs = incomes
        guard let j = incs.firstIndex(where: { $0.id == temps[i].incomeId || $0.tempIncomeId == tempId }) else { return }
        var x = incs[j]
        if received {
            x.receivedConfirmed = true
            if x.toType == "bank", !x.bankId.isEmpty, !x.bankApplied, !x.bankReconciled {
                if withinBaseline(x.bankId, date: x.date, createdAt: x.createdAt) { x.bankReconciled = true }
                else if x.date <= today { updateBank(x.bankId, delta: x.amount, memo: x.sourceName.isEmpty ? "収入" : x.sourceName, now: now, today: today); x.bankApplied = true; x.bankEffectAt = ISODate.now(now) }
            }
        } else {
            x.receivedConfirmed = false
            if x.bankApplied, let b = bank(x.bankId) {
                if let asOf = ISODate.ms(b.balanceAsOf), let eff = ISODate.ms(x.bankEffectAt), eff <= asOf { x.bankReconciled = true }
                else { updateBank(x.bankId, delta: -x.amount, memo: "\(x.sourceName.isEmpty ? "収入" : x.sourceName)・取消", now: now, today: today); x.bankReconciled = false }
                x.bankApplied = false
            }
        }
        incs = incomes; if let j2 = incs.firstIndex(where: { $0.id == x.id }) { incs[j2] = x }; incomes = incs
    }

    mutating func deleteTempIncome(_ tempId: String, now: Date = Date(), today: String) {
        confirmTempIncome(tempId, received: false, now: now, today: today)
        let t = tempIncomes.first { $0.id == tempId }
        incomes = incomes.filter { $0.tempIncomeId != tempId && $0.id != (t?.incomeId ?? "-") }
        tempIncomes = tempIncomes.filter { $0.id != tempId }
    }

    // MARK: カードの請求

    /// 請求額を確定・修正・支払済みにする（Web 版 setCardStatement）
    /// - balanceMode: "keep"（そのまま）/ "apply"（口座から引く）/ "reconciled"（残高に反映済み扱い）/ "none"
    mutating func setCardStatement(_ cardId: String, billingMonth: String, amount: Double, paymentDate: String = "", status: StatementStatus = .confirmed,
                                   memo: String = "手動請求額", balanceMode: String = "keep", now: Date = Date(), today: String) {
        guard let card = card(cardId) else { return }
        let key = "\(billingMonth)|\(cardId)"
        let base = cardBaseUsage(cardId, billingMonth: billingMonth)
        let prev = cardAdjustment(cardId, billingMonth: billingMonth)
        let oldDisplayed = cardBillingAmount(cardId, billingMonth: billingMonth)
        let cycleIds = cardTransactions(cardId, billingMonth: billingMonth).map(\.id)
        let nextAmount = max(0, amount), iso = ISODate.now(now)
        let payDate = Dates.isYMD(paymentDate) ? paymentDate : ""
        let wasPaid = prev?.status == "paid", willPaid = status == .paid
        let oldPaidAmount = max(0, prev?.paidAmount ?? oldDisplayed)
        var a = prev ?? CardAdjustment(.object([:]))!
        var bankApplied = prev?.bankApplied ?? false, bankReconciled = prev?.bankReconciled ?? false
        var bankEffectAt = prev?.bankEffectAt ?? "", bankIdAtPayment = (prev?.bankIdAtPayment).flatMap { $0.isEmpty ? nil : $0 } ?? card.bankId
        var paidAmount = willPaid ? nextAmount : 0
        if wasPaid && !willPaid {
            if bankApplied, let b = bank(bankIdAtPayment) {
                if let asOf = ISODate.ms(b.balanceAsOf), let eff = ISODate.ms(bankEffectAt), eff <= asOf {} else {
                    updateBank(bankIdAtPayment, delta: max(0, prev?.paidAmount ?? prev?.confirmedTotal ?? 0), memo: "\(card.name)支払い・取消", now: now, today: today)
                }
            }
            bankApplied = false; bankReconciled = false; bankEffectAt = ""; bankIdAtPayment = ""; paidAmount = 0
        } else if wasPaid && willPaid {
            if bankApplied && nextAmount != oldPaidAmount && !bankIdAtPayment.isEmpty {
                let b = bank(bankIdAtPayment)
                if let asOf = ISODate.ms(b?.balanceAsOf ?? ""), let eff = ISODate.ms(bankEffectAt), eff <= asOf { bankApplied = false; bankReconciled = true }
                else { updateBank(bankIdAtPayment, delta: -(nextAmount - oldPaidAmount), memo: "\(card.name)支払額修正", now: now, today: today) }
            }
            if balanceMode == "reconciled" && bankApplied { bankReconciled = false }
            else if balanceMode == "none" && !bankApplied { bankReconciled = false }
        } else if !wasPaid && willPaid {
            bankIdAtPayment = card.bankId
            if balanceMode == "apply" && !bankIdAtPayment.isEmpty {
                let d = payDate.isEmpty ? (cardPaymentDate(card, billingMonth: billingMonth) ?? "") : payDate
                if !d.isEmpty && withinBaseline(bankIdAtPayment, date: d, createdAt: iso, eventAt: "\(d)T23:59:59") {
                    bankApplied = false; bankReconciled = true
                } else {
                    updateBank(bankIdAtPayment, delta: -nextAmount, memo: "\(card.name)支払い", now: now, today: today)
                    bankApplied = true; bankReconciled = false; bankEffectAt = iso
                }
            } else if balanceMode == "reconciled" {
                bankApplied = false; bankReconciled = true; bankEffectAt = iso
            } else { bankApplied = false; bankReconciled = false; bankEffectAt = "" }
        }
        a.confirmedTotal = nextAmount; a.baseAtEdit = base
        if status != .estimated {
            a.confirmedTransactionIds = cycleIds
            if a.confirmedAt.isEmpty { a.confirmedAt = iso }
            a.confirmedThroughDate = billingCycle(card, month: billingMonth).end
        }
        a.updatedAt = iso; a.memo = memo; a.status = status.rawValue; a.paymentDateOverride = payDate
        a.paidAt = willPaid ? (a.paidAt.isEmpty ? iso : a.paidAt) : ""
        a.paidAmount = paidAmount; a.bankApplied = bankApplied; a.bankReconciled = bankReconciled
        a.bankEffectAt = bankEffectAt; a.bankIdAtPayment = bankIdAtPayment
        var all = root["cardAdjustments"]?.objectValue ?? [:]
        all[key] = a.json
        self["cardAdjustments"] = .object(all)
    }

    /// 支払済みにする・戻す（Web 版 markCardStatementPaid）
    mutating func markCardStatementPaid(_ cardId: String, billingMonth: String, paid: Bool, balanceMode: String = "keep", now: Date = Date(), today: String) {
        let a = cardAdjustment(cardId, billingMonth: billingMonth)
        let amount = cardBillingAmount(cardId, billingMonth: billingMonth)
        let date = (a?.paymentDateOverride).flatMap { $0.isEmpty ? nil : $0 } ?? cardPaymentDate(card(cardId), billingMonth: billingMonth) ?? today
        setCardStatement(cardId, billingMonth: billingMonth, amount: amount, paymentDate: date, status: paid ? .paid : .confirmed,
                         memo: a?.memo.isEmpty == false ? a!.memo : "支払い状況を更新", balanceMode: balanceMode, now: now, today: today)
    }

    // MARK: お知らせ

    mutating func addNotice(title: String, body: String, kind: String = "info", now: Date = Date(), today: String) {
        var list = root["notices"]?.arrayValue ?? []
        list.insert(.object(["id": .string(Self.uid("notice", now: now)), "title": .string(title), "body": .string(body), "type": .string(kind),
                             "date": .string(today), "createdAt": .string(ISODate.now(now)), "read": .bool(false), "source": .string("system")]), at: 0)
        self["notices"] = .array(Array(list.prefix(200)))
    }
}

extension CardAdjustment {
    /// 空の手直し（新しく確定する時の出発点）
    init?(_ empty: JSONValue) {
        guard case .object(let o) = empty else { return nil }
        raw = o; confirmedTotal = 0; baseAtEdit = 0; status = "confirmed"; paymentDateOverride = ""; confirmedTransactionIds = []
        confirmedThroughDate = ""; confirmedAt = ""; updatedAt = ""; bankApplied = false; bankReconciled = false; bankEffectAt = ""
        bankIdAtPayment = ""; paidAmount = nil; paidAt = ""; memo = ""
    }
}

// MARK: - 大型支出・固定支払いを支出として記録する

public extension MoneyDocument {
    /// 大型支出を「支払った」にする：支払い方法ごとに支出を記録する（Web 版 completeLargeExpensePlan）
    mutating func completeLargeExpense(_ planId: String, now: Date = Date(), today: String) {
        guard let p = largeExpensePlans.first(where: { $0.id == planId }), p.status == "planned" else { return }
        let parts = largeExpenseParts(p)
        var ids: [String] = []
        for (i, part) in parts.enumerated() {
            var tx = largeExpensePartTransaction(p, part: part, index: i)
            if tx == nil {
                let memo = parts.count > 1 ? "\(p.memo)\(p.memo.isEmpty ? "" : "・")分割\(i + 1)/\(parts.count)" : p.memo
                tx = recordExpense(date: p.date, amount: part.amount, category: p.category, merchant: p.name, paymentMethod: part.paymentMethod,
                                   paymentId: part.paymentId, memo: memo, source: "large_plan", largePlanId: p.id, largePlanPartIndex: i,
                                   linkedBankId: part.linkedBankId, now: now, today: today)
            }
            if let tx { ids.append(tx.id) }
        }
        var list = largeExpensePlans
        if let i = list.firstIndex(where: { $0.id == planId }) {
            list[i].status = "completed"; list[i].linkedTransactionIds = ids; list[i].linkedTransactionId = ids.first ?? ""
            largeExpensePlans = list
        }
    }

    /// 固定支払いをその日の支出として記録する（Web 版 processScheduled の1件分）
    @discardableResult
    mutating func recordFixedPayment(_ fixedId: String, date: String, now: Date = Date(), today: String) -> Transaction? {
        guard let f = fixedPayments.first(where: { $0.id == fixedId }), !fixedRecorded(f, date: date) else { return nil }
        return recordExpense(date: date, amount: f.amount, category: f.category, merchant: f.name,
                             paymentMethod: f.paymentMethod, paymentId: f.paymentId, source: "fixed", fixedId: f.id, eventAt: "\(date)T00:00:00", now: now, today: today)
    }

    /// 起動時・日付が変わった時の処理（Web 版 processScheduled）：
    /// 日付が来た口座・デビットの支出と口座への入金を残高に反映し、支払日が来た固定支払いを支出として記録する
    mutating func processScheduled(now: Date = Date(), today: String) {
        var txs = transactions
        for i in txs.indices where !txs[i].date.isEmpty && txs[i].date <= today && (txs[i].paymentMethod == "bank" || txs[i].paymentMethod == "debit") && !txs[i].bankApplied && !txs[i].bankReconciled {
            var t = txs[i]
            applyBankEffect(&t, eventAt: t.createdAt.isEmpty ? "\(t.date)T00:00:00" : t.createdAt, now: now, today: today)
            txs = transactions; txs[i] = t; transactions = txs
        }
        var incs = incomes
        for i in incs.indices where !incs[i].date.isEmpty && incs[i].date <= today && incs[i].toType == "bank" && !incs[i].bankId.isEmpty && !incs[i].bankApplied && !incs[i].bankReconciled {
            var x = incs[i]
            if withinBaseline(x.bankId, date: x.date, createdAt: x.createdAt, eventAt: x.createdAt.isEmpty ? "\(x.date)T23:59:59" : x.createdAt) { x.bankReconciled = true }
            else if bank(x.bankId) != nil {
                updateBank(x.bankId, delta: x.amount, memo: x.sourceName.isEmpty ? "収入" : x.sourceName, now: now, today: today)
                x.bankApplied = true; x.bankEffectAt = ISODate.now(now)
            }
            incs = incomes; incs[i] = x; incomes = incs
        }
        let earliest = fixedPayments.map(\.startMonth).filter(Dates.isYM).sorted().first ?? String(today.prefix(7))
        let last = str(meta["lastScheduleDate"])
        var m = last.isEmpty ? earliest : String(last.prefix(7))
        let end = String(today.prefix(7))
        while m <= end {
            for f in fixedPayments {
                for d in fixedDueDates(f, month: m) where d <= today && !f.skippedDates.contains(d) { recordFixedPayment(f.id, date: d, now: now, today: today) }
            }
            m = Dates.addMonths(m, 1)
        }
        if last != today { var mm = meta; mm["lastScheduleDate"] = .string(today); meta = mm }
    }
}
