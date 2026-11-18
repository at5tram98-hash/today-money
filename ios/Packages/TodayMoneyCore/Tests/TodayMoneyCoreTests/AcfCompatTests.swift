import XCTest
@testable import TodayMoneyCore

/// ACF の予測が Web 版と同じか（ios/tools/acf-fixtures.js が Web 版の buildCashFlowForecast で作った Fixtures/acf-compat.json と比べる）
final class AcfCompatTests: XCTestCase {
    func testForecastMatchesWeb() throws {
        let url = Bundle.module.url(forResource: "acf-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        let today = str(fx["today"]), now = Date(timeIntervalSince1970: (ISODate.ms(str(fx["now"])) ?? 0) / 1000)
        for c in fx["cases"]!.arrayValue! {
            let name = str(c["name"])
            var doc = try MoneyDocument(json: c["document"]!)
            // Web 版 {...acfDefaultSettings(), ...options.settings} と同じく、保存された設定に上書きする
            let merged = (doc["acfSettings"] ?? .object([:])).merging(c["settings"]!)
            doc["acfSettings"] = merged
            let f = doc.acfForecast(today: today, now: now)
            let w = c["forecast"]!
            for (k, v) in [("safeTotalBudget", f.safeTotalBudget), ("safeCashBudget", f.safeCashBudget), ("safeCreditBudget", f.safeCreditBudget),
                           ("maxSpendToday", f.maxSpendToday), ("maxSpendTodayCash", f.maxSpendTodayCash), ("maxSpendTodayCredit", f.maxSpendTodayCredit),
                           ("monthEndForecast", f.monthEndForecast), ("endForecast", f.endForecast), ("minForecastBalance", f.minForecastBalance),
                           ("minMandatoryBalance", f.minMandatoryBalance), ("protectedCashNow", f.protectedCashNow), ("freeCashNow", f.freeCashNow),
                           ("futureCardPayments", f.futureCardPayments), ("futureMandatoryPayments", f.futureMandatoryPayments),
                           ("safeCreditCapacity", f.safeCreditCapacity), ("planShortageTotal", f.planShortageTotal), ("todayShortage", f.todayShortage),
                           ("cashShortage", f.cashShortage), ("reserveShortage", f.reserveShortage), ("reserveFloor", f.reserveFloor)] {
                XCTAssertEqual(v, num(w[k]), accuracy: 0.001, "\(name) \(k)")
            }
            XCTAssertEqual([f.endDate, f.minForecastDate, f.minMandatoryDate, f.status, f.firstReserveBreachDate, f.creditFallbackStartDate],
                           [str(w["endDate"]), str(w["minForecastDate"]), str(w["minMandatoryDate"]), str(w["status"]), str(w["firstReserveBreachDate"]), str(w["creditFallbackStartDate"])], name)
            XCTAssertEqual(f.storedPlanUsed, w["storedPlanUsed"]!.boolValue!, name)
            XCTAssertEqual(f.planFeasible, w["planFeasible"]!.boolValue!, name)
            if let n = w["nextCardPayment"], !n.isNull {
                XCTAssertEqual(f.nextCardPayment?.date, str(n["date"]), name); XCTAssertEqual(f.nextCardPayment?.amount, num(n["amount"]), name)
            } else { XCTAssertNil(f.nextCardPayment, name) }
            XCTAssertEqual(f.risks.map(\.title), w["risks"]!.arrayValue!.map { str($0) }, "\(name) risks")
            XCTAssertEqual(f.confidence.score, Int(num(w["confidence"])), "\(name) confidence")
            let rows = w["rows"]!.arrayValue!
            XCTAssertEqual(f.rows.count, rows.count, "\(name) rows")
            for (g, r) in zip(f.rows, rows) {
                let ctx = "\(name) \(g.date)"
                XCTAssertEqual(g.date, str(r["date"]), ctx)
                for (k, v) in [("openingBalance", g.openingBalance), ("income", g.income), ("mandatoryOutflow", g.mandatoryOutflow), ("cardPayment", g.cardPayment),
                               ("mandatoryBalance", g.mandatoryBalance), ("flexibleCash", g.flexibleCash), ("flexibleCredit", g.flexibleCredit),
                               ("flexibleTotal", g.flexibleTotal), ("flexibleCardDue", g.flexibleCardDue), ("forecastBalance", g.forecastBalance),
                               ("maxSpendCash", g.maxSpendCash), ("maxSpendCredit", g.maxSpendCredit), ("maxSpendCombined", g.maxSpendCombined),
                               ("cashHeadroom", g.cashHeadroom)] {
                    XCTAssertEqual(v, num(r[k]), accuracy: 0.001, "\(ctx) \(k)")
                }
                XCTAssertEqual(g.important, r["important"]!.boolValue!, "\(ctx) important")
                XCTAssertEqual(g.paymentMode, str(r["paymentMode"]), "\(ctx) mode")
            }
            let x = doc.acfIndex(f, today: today), wi = c["index"]!
            if wi["value"]!.isNull { XCTAssertFalse(x.value.isFinite, name) } else { XCTAssertEqual(x.value, num(wi["value"]), accuracy: 1e-9, "\(name) index") }
            XCTAssertEqual([x.have, x.need, x.income, x.out], [num(wi["have"]), num(wi["need"]), num(wi["income"]), num(wi["out"])], "\(name) index parts")
            XCTAssertEqual(x.end, str(wi["end"]), "\(name) index end")
            XCTAssertEqual(x.events.count, Int(num(wi["events"])), "\(name) index events")
        }
    }
}
