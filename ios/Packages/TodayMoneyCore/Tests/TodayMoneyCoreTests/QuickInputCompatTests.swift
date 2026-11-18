import XCTest
@testable import TodayMoneyCore

/// 一行入力・電卓の補助・横断検索が Web 版と同じか（ios/tools/quick-fixtures.js → Fixtures/quick-compat.json）
final class QuickInputCompatTests: XCTestCase {
    static let fx: JSONValue = {
        let url = Bundle.module.url(forResource: "quick-compat", withExtension: "json", subdirectory: "Fixtures")!
        return try! JSONValue.parse(try! Data(contentsOf: url))
    }()
    var fx: JSONValue { Self.fx }
    var today: String { str(fx["today"]) }
    var doc: MoneyDocument { try! MoneyDocument(json: fx["document"]!) }

    func testParseLines() {
        let d = doc
        for c in fx["lines"]!.arrayValue! {
            let x = d.parseQuickLine(str(c["line"]), base: today), l = str(c["line"])
            XCTAssertEqual([x.date, x.merchant, x.category, x.paymentMethod, x.paymentId], [str(c["date"]), str(c["merchant"]), str(c["category"]), str(c["paymentMethod"]), str(c["paymentId"])], l)
            XCTAssertEqual(x.amount, num(c["amount"]), l)
            XCTAssertEqual(x.paymentAmbiguous, c["ambiguous"]!.boolValue!, l)
            XCTAssertEqual(x.paymentCandidates.map { "\($0.method)|\($0.id)" }, c["candidates"]!.arrayValue!.map { str($0) }, l)
            XCTAssertEqual(x.notes, c["notes"]!.arrayValue!.map { str($0) }, l)
            XCTAssertEqual(x.duplicateIds.count, Int(num(c["dups"])), l)
        }
    }
    func testCalcAssist() {
        for c in fx["calc"]!.arrayValue! {
            let r = CalcAssist.result(base: num(c["base"]), kind: str(c["kind"]), value: num(c["value"]))
            if c["amount"]!.isNull { XCTAssertNil(r, "\(c)") } else {
                XCTAssertEqual(r?.amount, num(c["amount"]), "\(c)"); XCTAssertEqual(r?.copy, str(c["copy"]), "\(c)")
            }
        }
    }
    func testSearch() {
        let d = doc
        for c in fx["search"]!.arrayValue! {
            XCTAssertEqual(d.searchItems(str(c["q"]), type: str(c["t"]), today: today).map { "\($0.type)|\($0.refId)" }, c["ids"]!.arrayValue!.map { str($0) }, "\(str(c["q"])) \(str(c["t"]))")
        }
    }
    func testTagsAndFavorites() {
        var d = doc
        d.tags = [Tag(id: "t1", name: "旅行", color: "#FF0000")]
        let ref = "bank:\(d.banks[0].id)"
        d.setTags(ref, ["t1", "t1"])
        XCTAssertEqual(d.tagsFor(ref), ["t1"])
        d.setFavorites(["acf", "bank:\(d.banks[0].id)"])
        d.setTags("favorite:acf", ["t1"])
        XCTAssertEqual(d.taggableItems.filter { d.tagsFor($0.ref).contains("t1") }.count, 2)
        d.deleteTag("t1")
        XCTAssertTrue(d.tagsFor(ref).isEmpty && d.tags.isEmpty)
    }
}
