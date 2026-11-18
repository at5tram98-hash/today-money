import SwiftUI
import TodayMoneyCore
import UIKit

/// 月の家計レポートを PDF にする（Web 版 buildPdfReport と同じ並び：見出し・集計・24件ずつの明細）。
/// Web 版は画像を貼った PDF だが、こちらは文字のまま書くので検索・コピーができる。
enum PdfReport {
    /// Web 版の描画座標（1240×1754）を A4（595×842pt）に縮めて使う
    private static let canvas = CGSize(width: 1240, height: 1754)
    private static let page = CGRect(x: 0, y: 0, width: 595.28, height: 841.89)

    static func make(_ r: MonthReport, now: Date = Date()) -> Data {
        let scale = page.width / canvas.width
        let stamp = now.formatted(.dateTime.year().month(.twoDigits).day(.twoDigits).hour().minute().second().locale(Locale(identifier: "ja_JP")))
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = [kCGPDFContextTitle as String: "My Money \(Format.monthLabel(r.month)) 家計レポート",
                               kCGPDFContextCreator as String: "My Money"]
        return UIGraphicsPDFRenderer(bounds: page, format: format).pdfData { ctx in
            for pi in 0..<r.pageCount {
                ctx.beginPage()
                let g = ctx.cgContext
                g.scaleBy(x: scale, y: scale)
                UIColor.white.setFill(); g.fill(CGRect(origin: .zero, size: canvas))
                let acf = r.acfMonthEnd != nil
                text("My Money", 70, 95, 54, .bold)
                text("\(Format.monthLabel(r.month)) 家計レポート", 70, 150, 34, .semibold)
                let sign = r.correction >= 0 ? "+" : ""
                text("記録上 \(Format.yen(r.rawSpent))　修正差額 \(sign)\(Format.yen(r.correction))　実質 \(Format.yen(r.spent))", 70, 210, 27, .medium)
                text("収入 \(Format.yen(r.income))　目標 \(r.goal != 0 ? Format.yen(r.goal) : "未設定")　大型支出予定 \(Format.yen(r.largePlanned))", 70, 245, 27, .medium)
                if let end = r.acfMonthEnd { text("ACF 月末予測 \(Format.yen(end))　安全残高 \(Format.yen(r.acfReserveFloor ?? 0))", 70, 280, 27, .medium) }
                text("ページ \(pi + 1)/\(r.pageCount)　出力 \(stamp)", 70, acf ? 315 : 280, 20, .regular, UIColor(white: 0.47, alpha: 1))
                let lineY: CGFloat = acf ? 345 : 310
                g.setStrokeColor(UIColor(white: 0.87, alpha: 1).cgColor); g.setLineWidth(1)
                g.move(to: CGPoint(x: 70, y: lineY)); g.addLine(to: CGPoint(x: 1170, y: lineY)); g.strokePath()
                let hy: CGFloat = acf ? 390 : 355
                for (t, x) in [("日付", 70.0), ("利用先", 220.0), ("カテゴリ", 760.0), ("金額", 1010.0)] { text(t, x, hy, 22, .semibold, UIColor(white: 0.2, alpha: 1)) }
                for (i, t) in r.rows(page: pi).enumerated() {
                    let yy = (acf ? 445 : 410) + CGFloat(i) * 54
                    (i % 2 == 1 ? UIColor(white: 0.98, alpha: 1) : .white).setFill()
                    g.fill(CGRect(x: 60, y: yy - 33, width: 1120, height: 48))
                    let ink = UIColor(white: 0.13, alpha: 1)
                    text(String(t.date.dropFirst(5)), 70, yy, 21, .regular, ink)
                    text(String(t.merchant.prefix(28)), 220, yy, 21, .regular, ink, maxWidth: 520)
                    text(String(t.category.prefix(12)), 760, yy, 21, .regular, ink, maxWidth: 230)
                    text(Format.yen(t.amount), 1160, yy, 21, .regular, ink, alignRight: true)
                }
            }
        }
    }

    /// Web 版 fillText と同じく y はベースライン
    private static func text(_ s: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ weight: UIFont.Weight,
                             _ color: UIColor = UIColor(white: 0.07, alpha: 1), maxWidth: CGFloat? = nil, alignRight: Bool = false) {
        let font = UIFont.systemFont(ofSize: size, weight: weight)
        let attrs: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
        let str = NSAttributedString(string: s, attributes: attrs)
        let w = min(str.size().width, maxWidth ?? .greatestFiniteMagnitude)
        let left = alignRight ? x - w : x
        str.draw(with: CGRect(x: left, y: y - font.ascender, width: w + 1, height: font.lineHeight),
                 options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine], context: nil)
    }

    /// 共有用に一時フォルダへ書く（Web 版と同じファイル名）
    static func file(for month: String, doc: MoneyDocument, today: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("MyMoney2-\(month).pdf")
        try make(doc.monthReport(month, today: today)).write(to: url, options: .atomic)
        return url
    }
}

/// 共有シート
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ vc: UIActivityViewController, context: Context) {}
}

/// データ管理の「PDFで書き出す」：月を選んで PDF を作り、共有シートで保存・送信する
struct PdfExportView: View {
    @Environment(AppModel.self) private var model
    @State private var month = Dates.ym()
    @State private var shared: IdBox?
    @State private var busy = false

    var body: some View {
        let r = model.doc.monthReport(month, today: model.today)
        List {
            Section {
                HStack {
                    Button { month = Dates.addMonths(month, -1) } label: { Image(systemName: "chevron.left") }.buttonStyle(.bordered)
                    Spacer()
                    Text(Format.monthLabel(month)).font(.headline)
                    Spacer()
                    Button { month = Dates.addMonths(month, 1) } label: { Image(systemName: "chevron.right") }.buttonStyle(.bordered)
                        .disabled(month >= model.thisMonth)
                }
            }
            Section("載せる内容") {
                LabeledContent("支出（記録上）", value: Format.yen(r.rawSpent))
                if r.correction != 0 { LabeledContent("修正差額", value: (r.correction > 0 ? "+" : "") + Format.yen(r.correction)) }
                LabeledContent("支出（実質）", value: Format.yen(r.spent))
                LabeledContent("収入", value: Format.yen(r.income))
                LabeledContent("目標", value: r.goal != 0 ? Format.yen(r.goal) : "未設定")
                LabeledContent("大型支出予定", value: Format.yen(r.largePlanned))
                if let end = r.acfMonthEnd { LabeledContent("ACF 月末予測", value: Format.yen(end)) }
                LabeledContent("明細", value: "\(r.transactions.count)件・\(r.pageCount)ページ")
            }
            Section {
                Button {
                    busy = true
                    defer { busy = false }
                    do { shared = IdBox(id: try PdfReport.file(for: month, doc: model.doc, today: model.today).path) }
                    catch { model.errorMessage = "PDFを作成できませんでした。（\(error.localizedDescription)）"; Feedback.play(.error) }
                } label: {
                    Label(busy ? "作成中…" : "PDFを作って共有", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent).disabled(busy)
            } footer: { Text("共有画面から「ファイルに保存」やメール・AirDrop で送れます。PDF は端末の中で作り、どこにも送信しません。") }
        }
        .navigationTitle("PDFで書き出す")
        .sheet(item: $shared) { box in ShareSheet(items: [URL(fileURLWithPath: box.id)]).presentationDetents([.medium, .large]) }
    }
}
