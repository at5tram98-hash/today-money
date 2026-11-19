import XCTest
@testable import TodayMoneyCore

/// 資産画面の数字が Web 版と同じか（ios/tools/assets-fixtures.js → Fixtures/assets-compat.json）
final class AssetsCompatTests: XCTestCase {
    func pts(_ v: JSONValue?) -> [ValuePoint] { (v?.arrayValue ?? []).map { ValuePoint(date: str($0["date"]), value: num($0["value"])) } }

    func testAssets() throws {
        let url = Bundle.module.url(forResource: "assets-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        let d = try MoneyDocument(json: fx["document"]!), today = str(fx["today"])
        XCTAssertEqual(d.assetHistoryPoints(today: today), pts(fx["all"]))
        for r in AssetRange.allCases { XCTAssertEqual(d.assetActualPoints(r, today: today), pts(fx["ranges"]?[r.rawValue]), r.rawValue) }
        for b in d.banks {
            for n in [7, 31, 93, 186, 365, 366] {
                XCTAssertEqual(d.bankSnapshotSeries(b.id, days: n, today: today), pts(fx["series"]?[b.id]?[String(n)]), "\(b.name) \(n)")
                let w = fx["deltas"]?[b.id]?[String(n)]
                XCTAssertEqual(d.bankDelta(b.id, days: n, today: today), w?["known"]?.boolValue == true ? num(w?["delta"]) : nil)
            }
            for p in BankPeriod.allCases {
                let w = fx["details"]![b.id]![p.rawValue]!, m = d.bankDetail(b.id, period: p, today: today)!
                XCTAssertEqual(m.points, pts(w["points"]))
                XCTAssertEqual(m.delta, w["delta"]!.isNull ? nil : num(w["delta"]))
                XCTAssertEqual([m.periodIn, m.periodOut, m.reserved, m.free], [num(w["periodIn"]), num(w["periodOut"]), num(w["reserved"]), num(w["free"])], "\(b.name) \(p)")
                XCTAssertEqual(m.related.map { "\($0.date)|\($0.label)|\($0.amount)" }, w["related"]!.arrayValue!.map { "\(str($0.arrayValue![0]))|\(str($0.arrayValue![1]))|\(num($0.arrayValue![2]))" })
            }
        }
        let c = d.assetCurrentDelta(today: today)
        XCTAssertEqual(c.known, fx["current"]?["known"]?.boolValue == true)
        XCTAssertEqual(c.delta, num(fx["current"]?["delta"]))
        if let p = fx["current"]?["pct"], !p.isNull { XCTAssertEqual(c.pct!, num(p), accuracy: 1e-9) } else { XCTAssertNil(c.pct) }
        XCTAssertEqual(d.bankParts.map(\.name), fx["parts"]!.arrayValue!.map { str($0["label"]) })
        for (m, ids) in fx["sorts"]!.objectValue! { XCTAssertEqual(d.sortedBanks(m).map(\.id), ids.arrayValue!.map { str($0) }, m) }
    }
}
