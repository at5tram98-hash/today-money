import AppIntents
import SwiftUI
import TodayMoneyCore
import WidgetKit

// MARK: - データ（アプリが書き出した要約を読む）

struct MoneyEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
    let isPlaceholder: Bool
    var day: String { Dates.ymd(date) }
}

struct MoneyProvider: TimelineProvider {
    func placeholder(in context: Context) -> MoneyEntry { MoneyEntry(date: .now, snapshot: .placeholder, isPlaceholder: true) }
    func getSnapshot(in context: Context, completion: @escaping (MoneyEntry) -> Void) {
        completion(MoneyEntry(date: .now, snapshot: SharedStore.readSnapshot() ?? .placeholder, isPlaceholder: SharedStore.readSnapshot() == nil))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<MoneyEntry>) -> Void) {
        let snap = SharedStore.readSnapshot()
        let s = snap ?? .placeholder
        // 今と、日付が変わる時（今日の目標・使った額が切り替わる）
        let midnight = Calendar.current.startOfDay(for: Date().addingTimeInterval(86_400))
        let entries = [MoneyEntry(date: .now, snapshot: s, isPlaceholder: snap == nil), MoneyEntry(date: midnight, snapshot: s, isPlaceholder: snap == nil)]
        completion(Timeline(entries: entries, policy: .after(Date().addingTimeInterval(3600))))
    }
}

private let blue = Color(red: 0.16, green: 0.49, blue: 0.96)
private func yen(_ v: Double) -> String { Format.yen(v) }

// MARK: - 今日あと使える額

struct TodayWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "today", provider: MoneyProvider()) { e in
            TodayWidgetView(entry: e).containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName("今日あと使える額")
        .description("今日の目標までの残りと、使った額。")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular, .accessoryInline])
    }
}

struct WidgetBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        LinearGradient(colors: scheme == .dark ? [Color(white: 0.13), Color(white: 0.07)] : [.white, Color(red: 0.93, green: 0.96, blue: 1)],
                       startPoint: .top, endPoint: .bottom)
    }
}

struct TodayWidgetView: View {
    let entry: MoneyEntry
    @Environment(\.widgetFamily) private var family
    @Environment(\.widgetRenderingMode) private var mode

    var body: some View {
        let d = entry.snapshot.day(entry.day), left = entry.snapshot.remaining(entry.day)
        let over = (left ?? 0) < 0
        let ratio = d.goal > 0 ? min(1, d.spent / d.goal) : 0
        switch family {
        case .accessoryInline:
            Text(left.map { $0 >= 0 ? "今日あと \(yen($0))" : "目標超え \(yen(-$0))" } ?? "今日 \(yen(d.spent))")
        case .accessoryCircular:
            Gauge(value: d.goal > 0 ? 1 - ratio : 0) {
                Image(systemName: "yensign")
            } currentValueLabel: {
                Text(short(left ?? d.spent)).font(.system(.body, design: .rounded).weight(.semibold)).minimumScaleFactor(0.5)
            }
            .gaugeStyle(.accessoryCircular)
            .widgetURL(URL(string: "mymoney://entry/expense"))
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text(left == nil ? "今日の支出" : over ? "目標オーバー" : "今日あと使える").font(.caption2.weight(.semibold)).widgetAccentable()
                Text(yen(left.map { abs($0) } ?? d.spent)).font(.system(.title3, design: .rounded).weight(.bold)).monospacedDigit()
                if d.goal > 0 { ProgressView(value: ratio).tint(over ? .red : .orange) }
            }
            .widgetURL(URL(string: "mymoney://home"))
        case .systemMedium:
            HStack(spacing: 14) {
                todayBlock(d: d, left: left, over: over, ratio: ratio)
                Divider()
                VStack(alignment: .leading, spacing: 6) {
                    if let v = entry.snapshot.acfValue {
                        Label { Text("ACF \(String(format: v >= 10 ? "%.1f" : "%.2f", v)) \(entry.snapshot.acfLabel ?? "")") } icon: { Image(systemName: "chart.line.uptrend.xyaxis") }
                            .font(.caption.weight(.semibold)).foregroundStyle(v < 1 ? .red : v < 1.2 ? .orange : .green)
                    }
                    if let p = entry.snapshot.upcoming(from: entry.day).first {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("次の支払い \(Format.shortDay(p.date))").font(.caption2).foregroundStyle(.secondary)
                            Text(p.title).font(.caption.weight(.semibold)).lineLimit(1)
                            Text(yen(p.amount)).font(.caption).monospacedDigit()
                        }
                    }
                    Spacer(minLength: 0)
                    Link(destination: URL(string: "mymoney://entry/expense")!) {
                        Label("支出を入力", systemImage: "plus").font(.caption.weight(.semibold))
                            .padding(.horizontal, 10).padding(.vertical, 6).frame(maxWidth: .infinity)
                            .background(blue.opacity(mode == .fullColor ? 0.14 : 0.25), in: Capsule()).foregroundStyle(blue)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .widgetURL(URL(string: "mymoney://home"))
        default:
            todayBlock(d: d, left: left, over: over, ratio: ratio)
                .widgetURL(URL(string: "mymoney://entry/expense"))
        }
    }

    private func todayBlock(d: WidgetSnapshot.Day, left: Double?, over: Bool, ratio: Double) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Image(systemName: "yensign.circle.fill").foregroundStyle(blue)
                Text("今日").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                if entry.snapshot.dayClosed && entry.day == Dates.ymd(entry.snapshot.updatedAt) { Image(systemName: "checkmark.seal.fill").font(.caption).foregroundStyle(.green) }
            }
            Spacer(minLength: 0)
            Text(left == nil ? "使った額" : over ? "目標オーバー" : "あと使える額").font(.caption2.weight(.semibold)).foregroundStyle(over ? .red : .orange)
            Text(yen(left.map { abs($0) } ?? d.spent)).font(.system(size: 28, weight: .bold, design: .rounded)).monospacedDigit()
                .minimumScaleFactor(0.5).lineLimit(1).foregroundStyle(over ? .red : .primary).contentTransition(.numericText())
            if d.goal > 0 {
                ProgressView(value: ratio).tint(over ? .red : .orange)
                Text("目標 \(yen(d.goal))・使った \(yen(d.spent))").font(.caption2).foregroundStyle(.secondary).lineLimit(1).minimumScaleFactor(0.7)
            } else {
                Text("目標は未設定").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
    }

    private func short(_ v: Double) -> String {
        let a = abs(v)
        let s = a >= 10_000 ? String(format: "%.1f万", a / 10_000) : String(Int(a.rounded()))
        return v < 0 ? "-" + s : s
    }
}

// MARK: - 支払いの予定

struct PaymentsWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "payments", provider: MoneyProvider()) { e in
            PaymentsWidgetView(entry: e).containerBackground(for: .widget) { WidgetBackground() }
        }
        .configurationDisplayName("これからの支払い")
        .description("カードの引落・固定支払いの予定と、今月の支出。")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}

struct PaymentsWidgetView: View {
    let entry: MoneyEntry
    @Environment(\.widgetFamily) private var family
    var body: some View {
        let s = entry.snapshot
        let list = Array(s.upcoming(from: entry.day).prefix(family == .systemLarge ? 6 : 3))
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("これからの支払い", systemImage: "calendar").font(.caption.weight(.bold)).foregroundStyle(.purple)
                Spacer()
                Text("合計 \(yen(list.reduce(0) { $0 + $1.amount }))").font(.caption.weight(.semibold)).monospacedDigit()
            }
            if list.isEmpty { Text("45日以内の支払い予定はありません").font(.footnote).foregroundStyle(.secondary) }
            ForEach(Array(list.enumerated()), id: \.offset) { _, p in
                HStack(spacing: 10) {
                    VStack(spacing: 0) {
                        Text("\(Dates.parts(p.date).d)").font(.system(.subheadline, design: .rounded).weight(.bold))
                        Text("\(Dates.parts(p.date).m)月").font(.system(size: 9)).foregroundStyle(.secondary)
                    }
                    .frame(width: 30)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(p.title).font(.footnote.weight(.semibold)).lineLimit(1)
                        Text(daysText(p.date)).font(.caption2).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(yen(p.amount)).font(.footnote.weight(.semibold)).monospacedDigit()
                }
            }
            if family == .systemLarge {
                Divider()
                HStack {
                    VStack(alignment: .leading) {
                        Text("今月の支出").font(.caption2).foregroundStyle(.secondary)
                        Text(yen(s.monthSpent)).font(.headline).monospacedDigit()
                    }
                    Spacer()
                    if s.monthGoal > 0 {
                        Gauge(value: min(1, s.monthSpent / s.monthGoal)) { Text("目標") }.gaugeStyle(.accessoryCircularCapacity).tint(s.monthSpent > s.monthGoal ? .red : .orange)
                    }
                    VStack(alignment: .trailing) {
                        Text("総資産").font(.caption2).foregroundStyle(.secondary)
                        Text(yen(s.totalAssets)).font(.headline).monospacedDigit()
                    }
                }
            }
            Spacer(minLength: 0)
        }
        .redacted(reason: entry.isPlaceholder ? .placeholder : [])
        .widgetURL(URL(string: "mymoney://payments"))
    }
    private func daysText(_ date: String) -> String {
        let n = Dates.daysBetween(entry.day, date)
        return n == 0 ? "今日" : n == 1 ? "明日" : "\(n)日後"
    }
}

// MARK: - コントロールセンター・ロック画面のボタン（iOS 18）

@available(iOS 18.0, *)
struct EntryControl: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "entry-control") {
            ControlWidgetButton(action: OpenURLIntent(URL(string: "mymoney://entry/expense")!)) {
                Label("支出を入力", systemImage: "yensign.circle.fill")
            }
        }
        .displayName("支出を入力")
        .description("My Money の支出の入力を開きます。")
    }
}

@main
struct MoneyWidgetBundle: WidgetBundle {
    var body: some Widget {
        TodayWidget()
        PaymentsWidget()
        if #available(iOS 18.0, *) { EntryControl() }
    }
}
