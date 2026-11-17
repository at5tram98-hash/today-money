import XCTest
@testable import TodayMoneyCore

/// 記録の操作（支出・残高・カードの支払済み）が Web 版と同じ結果になるか（Fixtures/mutation-compat.json は Web 版で同じ手順を実行した結果）
final class MutationCompatTests: XCTestCase {
    func testSequenceMatchesWeb() throws {
        let url = Bundle.module.url(forResource: "mutation-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        let today = str(fx["today"]), m0 = String(today.prefix(7))
        var d = try MoneyDocument(json: fx["document"]!)
        let b0 = d.banks[0].id, deb = d.debitCards[0].id
        // Web 版と同じく、操作は少しずつ後の時刻に行う
        var clock = Date()
        func now() -> Date { clock = clock.addingTimeInterval(1); return clock }

        var steps: [(String, MoneyDocument)] = []
        d.reconcileBankBalance(b0, balance: 50000, memo: "残高の更新", now: now(), today: today); steps.append(("reconcile", d))
        d.recordExpense(date: today, amount: 1200, category: "食費", merchant: "今日の口座払い", paymentMethod: "bank", paymentId: b0, now: now(), today: today); steps.append(("expense today", d))
        d.recordExpense(date: Dates.addDays(today, -1), amount: 500, category: "食費", merchant: "昨日の口座払い", paymentMethod: "bank", paymentId: b0, now: now(), today: today); steps.append(("expense yesterday", d))
        d.recordExpense(date: Dates.addDays(today, 1), amount: 700, category: "食費", merchant: "明日のデビット", paymentMethod: "debit", paymentId: deb, now: now(), today: today); steps.append(("expense tomorrow", d))
        d.recordExpense(date: today, amount: 300, category: "食費", merchant: "今日のデビット", paymentMethod: "debit", paymentId: deb, now: now(), today: today); steps.append(("debit today", d))
        d.setCardStatement("card_seed_smbc", billingMonth: Dates.addMonths(m0, -1), amount: 20000, status: .paid, balanceMode: "apply", now: now(), today: today); steps.append(("card paid apply", d))
        d.setCardStatement("card_seed_smbc", billingMonth: Dates.addMonths(m0, -1), amount: 21000, status: .paid, balanceMode: "keep", now: now(), today: today); steps.append(("card paid change", d))
        d.markCardStatementPaid("card_seed_smbc", billingMonth: Dates.addMonths(m0, -1), paid: false, now: now(), today: today); steps.append(("card unpaid", d))
        d.setCardStatement("card_seed_paypay", billingMonth: m0, amount: 5000, status: .confirmed, now: now(), today: today); steps.append(("card confirm", d))
        let id = d.transactions.first { $0.merchant == "今日の口座払い" }!.id
        d.deleteTransaction(id, now: now(), today: today); steps.append(("delete", d))

        let want = fx["steps"]!.arrayValue!
        XCTAssertEqual(steps.count, want.count)
        for ((name, got), w) in zip(steps, want) {
            XCTAssertEqual(name, str(w["name"]))
            XCTAssertEqual(got.banks.map(\.balance), w["banks"]!.arrayValue!.map { num($0["balance"]) }, "\(name) banks")
            let wt = w["tx"]!.arrayValue!
            XCTAssertEqual(got.transactions.count, wt.count, "\(name) tx")
            for (t, x) in zip(got.transactions, wt) {
                XCTAssertEqual([t.merchant, t.linkedBankId], [str(x["merchant"]), str(x["linkedBankId"])], name)
                XCTAssertEqual([t.bankApplied, t.bankReconciled], [x["bankApplied"]!.boolValue!, x["bankReconciled"]!.boolValue!], "\(name) \(t.merchant)")
            }
            for (k, x) in w["adj"]!.objectValue! {
                let p = k.split(separator: "|").map(String.init)
                let a = got.cardAdjustment(p[1], billingMonth: p[0])
                XCTAssertNotNil(a, "\(name) \(k)")
                XCTAssertEqual(a?.confirmedTotal, num(x["confirmedTotal"]), "\(name) \(k)")
                XCTAssertEqual(a?.status, str(x["status"]), "\(name) \(k)")
                XCTAssertEqual(a?.bankApplied, x["bankApplied"]!.boolValue!, "\(name) \(k) applied")
                XCTAssertEqual(a?.bankReconciled, x["bankReconciled"]!.boolValue!, "\(name) \(k) reconciled")
                XCTAssertEqual(a?.bankIdAtPayment, str(x["bankIdAtPayment"]), "\(name) \(k) bank")
            }
        }
    }

    func testTempIncome() throws {
        var d = MoneyDocument(root: ["banks": .array([Bank(id: "b", name: "口座").json]), "incomes": .array([]), "tempIncomes": .array([])])
        let today = "2026-11-17"
        let t = d.recordTempIncome(date: today, amount: 5000, sourceName: "単発バイト", toType: "bank", bankId: "b", today: today)!
        XCTAssertEqual(d.banks[0].balance, 0, "記録しただけでは残高は変えない（Web 版 applyNow:false）")
        d.confirmTempIncome(t.id, received: true, today: today)
        XCTAssertEqual(d.banks[0].balance, 5000)
        d.confirmTempIncome(t.id, received: false, today: today)
        XCTAssertEqual(d.banks[0].balance, 0)
        d.deleteTempIncome(t.id, today: today)
        XCTAssertTrue(d.tempIncomes.isEmpty && d.incomes.isEmpty)
    }
}
