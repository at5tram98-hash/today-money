import Charts
import SwiftUI
import TodayMoneyCore

/// 口座・カテゴリの色（ドーナツと一覧で同じ色を使う）
enum ChartPalette {
    static let colors: [Color] = [.blue, .green, .orange, .purple, .pink, .teal, .indigo, .yellow, .mint, .red]
    static func color(_ i: Int) -> Color { colors[i % colors.count] }
}

/// 金額を短く（Web 版 compactMoney：12.3k・1.2M）
func compactYen(_ v: Double) -> String {
    let a = abs(v), sign = v < 0 ? "−" : ""
    if a >= 100_000_000 { return "\(sign)\(String(format: "%.1f", a / 100_000_000))億" }
    if a >= 10_000 { return "\(sign)\(String(format: a >= 1_000_000 ? "%.0f" : "%.1f", a / 10_000))万" }
    return "\(sign)\(Int(a.rounded()))"
}

/// なぞると日付と金額が出る折れ線グラフ（Web 版 financeLineChartHtml / mm3AssetChartHtml）
struct ValueLineChart: View {
    var points: [ValuePoint]
    var tint: Color = .blue
    var dashed = false
    /// 守りたい金額（ACF の最低残高など）。線で示す
    var floor: Double? = nil
    var height: CGFloat = 200
    var emptyText = "残高を2回以上記録すると、推移を表示します。"
    /// なぞっている点（外に読み上げを出したい時）
    @Binding var selected: ValuePoint?

    init(points: [ValuePoint], tint: Color = .blue, dashed: Bool = false, floor: Double? = nil, height: CGFloat = 200,
         emptyText: String = "残高を2回以上記録すると、推移を表示します。", selected: Binding<ValuePoint?> = .constant(nil)) {
        self.points = points; self.tint = tint; self.dashed = dashed; self.floor = floor; self.height = height; self.emptyText = emptyText; _selected = selected
    }

    @State private var scrubDate: Date?

    private func date(_ s: String) -> Date { Dates.date(s) }

    var body: some View {
        if points.count < 2 {
            VStack(spacing: 8) {
                Image(systemName: "chart.xyaxis.line").font(.title2).foregroundStyle(.tertiary)
                Text(emptyText).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity, minHeight: height * 0.6)
        } else {
            let vals = points.map(\.value) + (floor.map { [$0] } ?? [])
            let lo = vals.min()!, hi = vals.max()!, pad = max(1, (hi - lo) * 0.12)
            let current = scrubDate.flatMap { d in points.min { abs(date($0.date).timeIntervalSince(d)) < abs(date($1.date).timeIntervalSince(d)) } }
            Chart {
                ForEach(points) { p in
                    AreaMark(x: .value("日付", date(p.date)), yStart: .value("下限", lo - pad), yEnd: .value("残高", p.value))
                        .foregroundStyle(LinearGradient(colors: [tint.opacity(0.28), tint.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.monotone)
                    LineMark(x: .value("日付", date(p.date)), y: .value("残高", p.value))
                        .foregroundStyle(tint)
                        .lineStyle(StrokeStyle(lineWidth: 2.2, lineCap: .round, dash: dashed ? [5, 4] : []))
                        .interpolationMethod(.monotone)
                }
                if let f = floor {
                    RuleMark(y: .value("最低残高", f))
                        .foregroundStyle(.red.opacity(0.6))
                        .lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                        .annotation(position: .top, alignment: .leading) { Text("残したい \(compactYen(f))").font(.caption2).foregroundStyle(.red) }
                }
                if let c = current {
                    RuleMark(x: .value("選択", date(c.date))).foregroundStyle(.secondary.opacity(0.5))
                    PointMark(x: .value("選択", date(c.date)), y: .value("残高", c.value))
                        .foregroundStyle(tint).symbolSize(70)
                        .annotation(position: .top, spacing: 6, overflowResolution: .init(x: .fit(to: .chart), y: .disabled)) {
                            VStack(spacing: 1) {
                                Text(Format.dayLabel(c.date)).font(.caption2).foregroundStyle(.secondary)
                                Text(c.value.yen).font(.caption.weight(.bold)).monospacedDigit()
                            }
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 8))
                        }
                }
            }
            .chartYScale(domain: (lo - pad)...(hi + pad))
            .chartXAxis {
                AxisMarks(values: .automatic(desiredCount: 4)) { v in
                    AxisGridLine().foregroundStyle(.clear)
                    AxisValueLabel { if let d = v.as(Date.self) { Text(d.formatted(.dateTime.month(.defaultDigits).day())) } }
                }
            }
            .chartYAxis {
                AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in
                    AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [2, 3]))
                    AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } }
                }
            }
            .chartXSelection(value: $scrubDate)
            .onChange(of: current) { _, c in selected = c; if c != nil { Feedback.selection() } }
            .frame(height: height)
            .revealFromLeading()
            .accessibilityLabel("推移のグラフ。\(Format.dayLabel(points.first!.date))の\(points.first!.value.yen)から\(Format.dayLabel(points.last!.date))の\(points.last!.value.yen)")
        }
    }
}

/// 小さな推移の線（Web 版 miniSparklineHtml）
struct Sparkline: View {
    var points: [ValuePoint]
    var tint: Color = .blue
    var body: some View {
        if points.count < 2 {
            Text("履歴不足").font(.caption2).foregroundStyle(.tertiary)
        } else {
            let vals = points.map(\.value), lo = vals.min()!, hi = vals.max()!
            Chart(Array(points.enumerated()), id: \.offset) { i, p in
                AreaMark(x: .value("i", i), yStart: .value("lo", lo), yEnd: .value("v", p.value))
                    .foregroundStyle(LinearGradient(colors: [tint.opacity(0.22), .clear], startPoint: .top, endPoint: .bottom))
                LineMark(x: .value("i", i), y: .value("v", p.value)).foregroundStyle(tint).lineStyle(StrokeStyle(lineWidth: 1.6))
            }
            .chartXAxis(.hidden).chartYAxis(.hidden)
            .chartYScale(domain: lo...(hi == lo ? lo + 1 : hi))
            .revealFromLeading(delay: 0.15)
            .accessibilityHidden(true)
        }
    }
}

/// 割合のドーナツ（中央に文字を出せる）
struct DonutChart<Center: View>: View {
    var parts: [(name: String, value: Double)]
    var center: Center
    @State private var p: CGFloat = 0
    init(parts: [(name: String, value: Double)], @ViewBuilder center: () -> Center) { self.parts = parts; self.center = center() }
    var body: some View {
        Chart(Array(parts.enumerated()), id: \.offset) { i, p in
            SectorMark(angle: .value("金額", p.value), innerRadius: .ratio(0.64), angularInset: 1.5)
                .cornerRadius(3)
                .foregroundStyle(ChartPalette.color(i))
        }
        .chartBackground { _ in center.opacity(p) }
        .scaleEffect(0.7 + 0.3 * p)
        .rotationEffect(.degrees(-120 * (1 - p)))
        .opacity(Double(p))
        .appearProgress($p, duration: 1.0)
        .accessibilityLabel(parts.map { "\($0.name) \($0.value.yen)" }.joined(separator: "、"))
    }
}

/// 小さな数字のタイル（期間の変化・最高・最低など）
struct StatTile: View {
    var title: String
    var value: String
    var sub: String? = nil
    var tint: Color = .primary
    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(tint).lineLimit(1).minimumScaleFactor(0.6)
                .contentTransition(.numericText())
                .animation(.snappy, value: value)
            if let sub { Text(sub).font(.caption2).foregroundStyle(tint == .primary ? .secondary : tint).monospacedDigit() }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .padding(10)
        .background(Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
    }
}

/// 期間の変化・最高・最低（Web 版の資産推移の3つの数字）
struct RangeStats: View {
    var points: [ValuePoint]
    var body: some View {
        if let f = points.first, let l = points.last, points.count > 1 {
            let d = l.value - f.value, pct = f.value != 0 ? d / abs(f.value) * 100 : nil
            HStack(alignment: .top, spacing: 8) {
                StatTile(title: "期間の変化", value: signedYen(d), sub: pct.map { String(format: "%+.1f%%", $0) }, tint: d >= 0 ? .green : .red)
                StatTile(title: "最高", value: (points.map(\.value).max() ?? 0).yen)
                StatTile(title: "最低", value: (points.map(\.value).min() ?? 0).yen)
            }
            .fixedSize(horizontal: false, vertical: true)
        }
    }
}

