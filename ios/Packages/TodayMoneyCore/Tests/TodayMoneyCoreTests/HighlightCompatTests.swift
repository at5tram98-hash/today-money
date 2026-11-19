import XCTest
@testable import TodayMoneyCore

/// ホームのハイライトが Web 版と同じか（ios/tools/highlight-fixtures.js → Fixtures/highlight-compat.json）
final class HighlightCompatTests: XCTestCase {
    func testHighlights() throws {
        let url = Bundle.module.url(forResource: "highlight-compat", withExtension: "json", subdirectory: "Fixtures")!
        let fx = try JSONValue.parse(try Data(contentsOf: url))
        let d = try MoneyDocument(json: fx["document"]!)
        let got = d.highlights(today: str(fx["today"]))
        let want = fx["list"]!.arrayValue!
        XCTAssertEqual(got.map(\.key), want.map { str($0["key"]) })
        for (g, w) in zip(got, want) {
            XCTAssertEqual(g.label, str(w["label"]))
            XCTAssertEqual(g.text, str(w["text"]))
            XCTAssertEqual(g.bars.map { "\($0.label)|\($0.value)|\($0.unit)" }, w["bars"]!.arrayValue!.map { "\(str($0["label"]))|\(num($0["value"]))|\(str($0["unit"]))" })
        }
    }
}
