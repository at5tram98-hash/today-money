import XCTest
@testable import TodayMoneyCore

/// Web 版の実際の関数で計算した結果（tests/ios-fixtures.mjs が作る Fixtures/web-compat.json）と同じになるか確かめる
final class WebCompatTests: XCTestCase {
    static let fx: JSONValue = {
        let url = Bundle.module.url(forResource: "web-compat", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONValue.parse(try! Data(contentsOf: url))
    }()
    var fx: JSONValue { Self.fx }
    var today: String { fx["today"]!.stringValue! }
    var now: Date { ShiftSync.parseISO(fx["now"]!.stringValue!)! }
    func doc(_ v: JSONValue?) throws -> MoneyDocument { try MoneyDocument(json: v!) }

    func testDates() {
        for c in fx["dates"]!["addMonths"]!.arrayValue! { XCTAssertEqual(Dates.addMonths(c["s"]!.stringValue!, Int(c["n"]!.intValue!)), c["out"]!.stringValue!) }
        for c in fx["dates"]!["addDays"]!.arrayValue! { XCTAssertEqual(Dates.addDays(c["s"]!.stringValue!, Int(c["n"]!.intValue!)), c["out"]!.stringValue!) }
        for c in fx["dates"]!["daysInMonth"]!.arrayValue! { XCTAssertEqual(Dates.daysInMonth(c["m"]!.stringValue!), Int(c["out"]!.intValue!)) }
        for c in fx["dates"]!["yen"]!.arrayValue! { XCTAssertEqual(Format.yen(c["n"]!.doubleValue!), c["out"]!.stringValue!) }
        for c in fx["dates"]!["monthLabel"]!.arrayValue! { XCTAssertEqual(Format.monthLabel(c["s"]!.stringValue!), c["out"]!.stringValue!) }
        for c in fx["dates"]!["dayLabel"]!.arrayValue! { XCTAssertEqual(Format.dayLabel(c["s"]!.stringValue!), c["out"]!.stringValue!) }
    }

    func testPayroll() throws {
        let d = try doc(fx["document"])
        for c in fx["payroll"]!["payDate"]!.arrayValue! {
            let e = d.employer(c["employerId"]!.stringValue!)!
            XCTAssertEqual(Payroll.payDate(e, workMonth: c["workMonth"]!.stringValue!), c["out"]!.stringValue!, "\(e.name) \(c["workMonth"]!)")
        }
        for c in fx["payroll"]!["workMonth"]!.arrayValue! {
            let e = d.employer(c["employerId"]!.stringValue!)!
            XCTAssertEqual(Payroll.workMonth(e, date: c["date"]!.stringValue!), c["out"]!.stringValue!, "\(e.name) \(c["date"]!)")
        }
    }

    func testParse() {
        for c in fx["parse"]!.arrayValue! {
            let got = Shifts.parse(c["text"]!.stringValue!, today: today)
            let want = c["out"]!.arrayValue!.map { Shift(date: str($0["date"]), start: str($0["start"]), end: str($0["end"]), title: str($0["title"])) }
            XCTAssertEqual(got, want, c["text"]!.stringValue!)
        }
    }

    func testDuration() {
        for c in fx["duration"]!.arrayValue! {
            let rules = c["rules"]!.arrayValue!.map { BreakRule(from: Int(num($0["from"])), to: optNum($0["to"]).map { Int($0) }, minutes: Int(num($0["minutes"]))) }
            let got = Shifts.duration(start: str(c["start"]), end: str(c["end"]), autoBreak: c["autoBreak"]!.boolValue!, rules: rules)
            let o = c["out"]!
            XCTAssertEqual(got, ShiftDuration(total: Int(num(o["total"])), brk: Int(num(o["brk"])), work: Int(num(o["work"])), night: Int(num(o["night"]))), "\(str(c["start"]))-\(str(c["end"])) \(rules)")
        }
    }

    func testEstimate() throws {
        let d = try doc(fx["document"])
        for c in fx["estimate"]!.arrayValue! {
            let got = Shifts.estimate(Shifts.parse(str(c["text"]), today: today), in: d, settings: d.shiftSettings)
            let want = c["out"]!.arrayValue!
            XCTAssertEqual(got.count, want.count)
            for (g, w) in zip(got, want) {
                XCTAssertEqual(g.employerId, str(w["employerId"])); XCTAssertEqual(g.month, str(w["month"]))
                XCTAssertEqual(g.gross, num(w["gross"]), "\(g.key) gross"); XCTAssertEqual(g.transport, num(w["transport"]), "\(g.key) transport")
                XCTAssertEqual(g.transportUncapped, optNum(w["transportUncapped"])); XCTAssertEqual(g.minutes, Int(num(w["minutes"])))
                XCTAssertEqual(g.night, Int(num(w["night"]))); XCTAssertEqual(g.items.count, Int(num(w["count"]))); XCTAssertEqual(g.payDate, str(w["payDate"]))
            }
        }
    }

    func testSync() throws {
        for sc in fx["sync"]!.arrayValue! {
            var d = try doc(sc["document"])
            for (text, want) in zip(sc["steps"]!.arrayValue!, sc["results"]!.arrayValue!) {
                let r = ShiftSync.apply(Shifts.parse(text.stringValue!, today: today), to: &d, now: now)
                let name = str(sc["name"])
                XCTAssertEqual(r.count, Int(num(want["count"])), name); XCTAssertEqual(r.total, num(want["total"]), name)
                XCTAssertEqual(r.unmatched, want["unmatched"]!.arrayValue!.map { str($0) }, name)
                XCTAssertEqual(r.states.map { "\($0.key)=\($0.state.rawValue)" }, want["states"]!.arrayValue!.map { str($0) }, name)
                let salary = d.salaryRecords.map { "\($0.employerId)|\($0.month)|\($0.date)|\(Int($0.gross))|\(Int($0.transport))|\($0.status)|\($0.source)" }.sorted()
                let wantSalary = want["salary"]!.arrayValue!.map { "\(str($0["employerId"]))|\(str($0["month"]))|\(str($0["date"]))|\(Int(num($0["gross"])))|\(Int(num($0["transport"])))|\(str($0["status"]))|\(str($0["source"]))" }.sorted()
                XCTAssertEqual(salary, wantSalary, name)
                let plans = d.shiftPlans.map { "\($0.employerId)|\($0.date)|\($0.start)|\($0.end)|\(Int($0.pay))" }.sorted()
                let wantPlans = want["plans"]!.arrayValue!.map { "\(str($0["employerId"]))|\(str($0["date"]))|\(str($0["start"]))|\(str($0["end"]))|\(Int(num($0["pay"])))" }.sorted()
                XCTAssertEqual(plans, wantPlans, name)
            }
        }
    }

    func testSalarySummary() throws {
        let d = try doc(fx["summary"]!["document"])
        for m in fx["summary"]!["months"]!.arrayValue! {
            let month = str(m["month"]), s = d.salarySummary(month, today: today)
            XCTAssertEqual(s.received, num(m["received"]), "\(month) received"); XCTAssertEqual(s.overdue, num(m["overdue"]), "\(month) overdue")
            XCTAssertEqual(s.planned, num(m["planned"]), "\(month) planned"); XCTAssertEqual(s.total, num(m["total"]), "\(month) total")
            XCTAssertEqual(s.tempTotal, num(m["tempTotal"]), "\(month) temp")
            XCTAssertEqual(s.records.map(\.id), m["records"]!.arrayValue!.map { str($0) }, month)
            XCTAssertEqual(d.salaryRecords(payableIn: month).map(\.id).sorted(), m["payable"]!.arrayValue!.map { str($0) }, month)
        }
    }

    func testSpending() throws {
        let d = try doc(fx["document"])
        for m in fx["spending"]!["months"]!.arrayValue! { XCTAssertEqual(d.spentMonth(str(m["month"])), num(m["out"]), str(m["month"])) }
        XCTAssertEqual(d.totalBankBalance, num(fx["spending"]!["totalBankBalance"]))
    }

    /// Web 版のデータを読み込んで書き出しても、知らない項目を含めて何も失わない
    func testRoundTripKeepsUnknownFields() throws {
        var d = try doc(fx["document"])
        let before = d.root
        var e = d.employers; e[0].hourly = 1400; d.employers = e
        XCTAssertEqual(d.employers[0].hourly, 1400)
        for (k, v) in before where k != "employers" { XCTAssertEqual(d.root[k], v, k) }
        let rawBefore = before["employers"]!.arrayValue![0].objectValue!, rawAfter = d.root["employers"]!.arrayValue![0].objectValue!
        for (k, v) in rawBefore where k != "hourly" { XCTAssertEqual(rawAfter[k], v, "employer.\(k)") }
        let exported = d.exportJSON()
        XCTAssertEqual(exported["backupMeta"]?["app"]?.stringValue, "My Money 2.0")
        XCTAssertEqual(try MoneyDocument(json: try JSONValue.parse(exported.canonical)).employers[0].hourly, 1400)
    }
}
