import Charts
import SwiftUI
import TodayMoneyCore

// MARK: - 概要（ACF指標・今日使える目安・残高の予測・生活費の目安・注意点・信頼度・計算内訳）

struct AcfOverviewTab: View {
    @Environment(AppModel.self) private var model
    var f: AcfForecast

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                AcfIndexCard(f: f).acfReveal(0)
                AcfTodayCard(f: f).acfReveal(1)
                if f.cashShortage > 0 || f.reserveShortage > 0 { AcfShortageBanner(f: f).acfReveal(2) }
                AcfBalanceCard(f: f).acfReveal(3)
                AcfLivingBudgetCard(f: f).acfReveal(4)
                AcfRiskCarousel(f: f).acfReveal(5)
                AcfConfidenceCard(f: f).acfReveal(6)
                AcfBreakdownCard(f: f).acfReveal(7)
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
        }
        .scrollIndicators(.hidden)
    }
}

/// 見出しつきの枠
struct AcfCard<Content: View>: View {
    var title: String
    var symbol: String
    var tint: Color = .teal
    var trailing: String? = nil
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: symbol).font(.footnote.weight(.bold)).foregroundStyle(tint)
                    .frame(width: 28, height: 28).background(tint.opacity(0.16), in: Circle())
                Text(title).font(.subheadline.weight(.bold)).foregroundStyle(.primary)
                Spacer()
                if let trailing { Text(trailing).font(.caption).foregroundStyle(.secondary) }
            }
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .acfSurface(tint)
    }
}

/// ACFセンターのカードの面：背景より一段明るい面・細い縁・やわらかい影・上に見出しの色をうっすら
struct AcfSurface: ViewModifier {
    var tint: Color?
    var radius: CGFloat = 22
    @Environment(\.colorScheme) private var scheme
    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: radius, style: .continuous)
        content
            .background {
                ZStack {
                    shape.fill(Color.acfCard)
                    if let tint {
                        shape.fill(LinearGradient(colors: [tint.opacity(scheme == .dark ? 0.16 : 0.09), .clear], startPoint: .top, endPoint: .init(x: 0.5, y: 0.45)))
                    }
                }
            }
            .overlay(shape.strokeBorder(Color.primary.opacity(scheme == .dark ? 0.12 : 0.06), lineWidth: 1))
            .shadow(color: .black.opacity(scheme == .dark ? 0 : 0.07), radius: 12, y: 4)
    }
}
extension Color {
    /// ACFセンターのカードの色（ダークでは背景の黒より明るい灰色）
    static let acfCard = Color(UIColor { $0.userInterfaceStyle == .dark ? UIColor(white: 0.13, alpha: 1) : .white })
}
extension View {
    func acfSurface(_ tint: Color? = nil, radius: CGFloat = 22) -> some View { modifier(AcfSurface(tint: tint, radius: radius)) }
}

// MARK: ACF指標（輪のゲージ）

struct AcfIndexCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.acfOpenIndexPeriod) private var openPeriod
    var f: AcfForecast
    @State private var shown = 0.0
    @State private var eventsOpen = false

    var body: some View {
        let x = model.doc.acfIndex(f, today: model.today)
        let target = x.value.isFinite ? min(2, max(0, x.value)) / 2 : 1
        AcfCard(title: "ACF指標", symbol: "gauge.with.dots.needle.67percent", tint: x.color, trailing: "\(Format.shortDay(x.start))〜\(Format.shortDay(x.end))") {
            HStack(alignment: .center, spacing: 18) {
                ZStack {
                    Circle().trim(from: 0, to: 0.75).stroke(Color(.tertiarySystemFill), style: StrokeStyle(lineWidth: 14, lineCap: .round))
                        .rotationEffect(.degrees(135))
                    Circle().trim(from: 0, to: 0.75 * shown)
                        .stroke(AngularGradient(colors: [.red, .orange, .yellow, .green, .green], center: .center, startAngle: .degrees(0), endAngle: .degrees(270)),
                                style: StrokeStyle(lineWidth: 14, lineCap: .round))
                        .rotationEffect(.degrees(135))
                    // 1.0（ちょうど）の目印
                    Capsule().fill(Color.primary.opacity(0.55)).frame(width: 3, height: 20)
                        .offset(y: -52).rotationEffect(.degrees(0))
                    VStack(spacing: 0) {
                        Text(x.text).font(.system(size: 34, weight: .heavy, design: .rounded)).monospacedDigit().foregroundStyle(x.color)
                            .contentTransition(.numericText(value: x.value.isFinite ? x.value : 99))
                        Text(x.label).font(.caption.weight(.bold)).foregroundStyle(x.color)
                    }
                }
                .frame(width: 118, height: 118)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("ACF指標 \(x.text)、\(x.label)")
                VStack(alignment: .leading, spacing: 10) {
                    Text(x.sentence).font(.subheadline.weight(.semibold)).fixedSize(horizontal: false, vertical: true)
                    AcfCompareBars(x: x)
                    HStack(spacing: 4) {
                        Text(x.surplus >= 0 ? "余る見込み" : "足りない見込み").font(.footnote)
                        Text("\(x.surplus >= 0 ? "＋" : "−")\(abs(x.surplus).yen)").font(.footnote.weight(.bold)).foregroundStyle(x.surplus >= 0 ? .green : .red)
                    }
                }
            }
            Button(action: openPeriod) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Image(systemName: "calendar")
                    Text(x.custom ? "\(Format.shortDay(x.end))まで（指定）" : "毎月\(model.doc.acfStoredSettings.indexEndDay >= 31 ? "月末" : "\(model.doc.acfStoredSettings.indexEndDay)日")まで")
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 8)
                    Text("期間を変更").fontWeight(.semibold).fixedSize()
                }
                .font(.footnote)
            }
            DisclosureGroup(isExpanded: $eventsOpen) {
                VStack(spacing: 8) {
                    if x.events.isEmpty { Text("予定された入出金はありません").font(.footnote).foregroundStyle(.secondary) }
                    ForEach(x.events.prefix(12)) { e in
                        HStack {
                            Circle().fill(e.income ? Color.green : Color.orange).frame(width: 8, height: 8)
                            Text(e.label).font(.subheadline).lineLimit(2)
                            Spacer()
                            Text(Format.shortDay(e.date)).font(.caption).foregroundStyle(.secondary)
                            Text("\(e.income ? "＋" : "−")\(e.amount.yen)").font(.subheadline).monospacedDigit().foregroundStyle(e.income ? .green : .primary)
                        }
                    }
                }
                .padding(.top, 6)
            } label: {
                Text("対象期間の入出金（\(x.events.count)件）").font(.footnote.weight(.semibold))
            }
            Text("1.0で収支がちょうど。1.0以上なら黒字、1.0未満なら赤字の見込みです（日々の生活費は含みません）。").font(.caption2).foregroundStyle(.secondary)
        }
        .onAppear { withAnimation(.spring(response: 1.0, dampingFraction: 0.8).delay(0.1)) { shown = target } }
        .onChange(of: target) { _, t in withAnimation(.spring(response: 0.8, dampingFraction: 0.8)) { shown = t } }
    }
}

// MARK: 今日使える目安・C100

struct AcfTodayCard: View {
    @Environment(AppModel.self) private var model
    var f: AcfForecast
    var body: some View {
        let ratio = f.settings.creditFallbackEnabled ? Int(f.settings.creditAggressiveness.rounded()) : 0
        let total = max(1, f.safeCreditBudget + f.safeCashBudget)
        AcfCard(title: "今日使える目安", symbol: "yensign.circle.fill", tint: .teal) {
            HStack(alignment: .firstTextBaseline) {
                Text(f.safeTotalBudget.yen).font(.system(size: 40, weight: .heavy, design: .rounded)).monospacedDigit()
                    .contentTransition(.numericText(value: f.safeTotalBudget))
                Spacer()
                Text(f.status).font(.subheadline.weight(.bold)).padding(.horizontal, 10).padding(.vertical, 4)
                    .background(acfStatusColor(f.status).opacity(0.18), in: Capsule()).foregroundStyle(acfStatusColor(f.status))
            }
            GeometryReader { g in
                HStack(spacing: 3) {
                    Capsule().fill(Color.purple.gradient).frame(width: max(4, g.size.width * f.safeCreditBudget / total))
                    Capsule().fill(Color.teal.gradient)
                }
            }
            .frame(height: 10)
            .accessibilityHidden(true)
            HStack(alignment: .top, spacing: 8) {
                StatTile(title: "カードで支払う目安", value: f.safeCreditBudget.yen, tint: .purple)
                StatTile(title: "現金で支払う目安", value: f.safeCashBudget.yen, tint: .teal)
                StatTile(title: "カード比率", value: "\(ratio)%")
            }
            .fixedSize(horizontal: false, vertical: true)
            Toggle(isOn: Binding(get: { model.doc.acfStoredSettings.c100Mode }, set: { on in
                var s = model.doc.acfStoredSettings; s.c100Mode = on
                model.commit("C100モード") { $0.saveAcfSettings(s) }
                model.toast = on ? "C100モード：カード100%で試算しています" : "C100モードを終了しました"
            })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("C100モード").font(.subheadline.weight(.semibold))
                    Text(f.settings.c100Mode ? "現金を使わず、すべてカードで払う前提で計算中" : "今日から現金を使わず、すべてカードで払ったら").font(.caption).foregroundStyle(.secondary)
                }
            }
            .tint(.purple)
            if num(model.doc["monthlyGoals"]?[model.thisMonth]?["total"]) > 0 {
                Button {
                    var n: Int?
                    model.commit("ACFの安全予算を日別計画へ") { d in n = d.applyAcfSafeBudgetToMonthlyPlan(month: model.thisMonth, forecast: f, today: model.today) }
                    model.toast = (n ?? 0) > 0 ? "\(n!)日分の日別計画へ反映しました" : "今日以降の安全予算がすべて0円のため、反映する金額はありません"
                } label: { Label("ACFの安全予算を日別計画へ反映", systemImage: "calendar.badge.plus").font(.subheadline.weight(.semibold)) }
                .buttonStyle(.bordered).tint(.teal)
            }
            Text("比率は支払い方法の希望です。限度額・1日上限・禁止カテゴリ・将来の引落残高をACFが確かめ、安全な範囲に制限します。").font(.caption2).foregroundStyle(.secondary)
        }
    }
}

struct AcfShortageBanner: View {
    @Environment(\.acfOpenDay) private var openDay
    var f: AcfForecast
    var body: some View {
        let critical = f.cashShortage > 0
        let d = critical ? (f.minimumCashShortageDate.isEmpty ? f.minForecastDate : f.minimumCashShortageDate) : (f.firstReserveBreachDate.isEmpty ? f.minForecastDate : f.firstReserveBreachDate)
        Button { if let r = f.rows.first(where: { $0.date == d }) { openDay(r) } } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "exclamationmark.triangle.fill").font(.title2).foregroundStyle(critical ? .red : .orange)
                    .symbolEffect(.pulse, options: .repeating)
                VStack(alignment: .leading, spacing: 3) {
                    Text(critical ? "資金不足" : "安全残高不足").font(.headline)
                    Text(critical ? "\(Format.dayLabel(d))に予測残高が −\(f.cashShortage.yen) まで不足する見込みです。「今日使える額」が0円でも、不足額は隠さず表示します。"
                         : "\(Format.dayLabel(d))に最低残したい金額を下回る見込みです。安全余力 −\(f.reserveShortage.yen)。")
                        .font(.footnote).multilineTextAlignment(.leading)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.footnote.weight(.bold)).foregroundStyle(.tertiary)
            }
            .padding(16)
            .background((critical ? Color.red : Color.orange).opacity(0.12), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

// MARK: 残高の予測（なぞると日付・残高・その日の入出金）

struct AcfBalanceCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.acfOpenDay) private var openDay
    var f: AcfForecast
    @State private var range = 60
    @State private var showMandatory = true
    @State private var scrub: Date?

    var body: some View {
        let rows = range == 0 ? f.rows : Array(f.rows.prefix(range))
        let current = scrub.flatMap { d in rows.min { abs(Dates.date($0.date).timeIntervalSince(d)) < abs(Dates.date($1.date).timeIntervalSince(d)) } }
        let minRow = rows.min { $0.forecastBalance < $1.forecastBalance }
        AcfCard(title: "残高の予測", symbol: "chart.xyaxis.line", tint: .teal) {
            Picker("期間", selection: $range) { Text("30日").tag(30); Text("60日").tag(60); Text("90日").tag(90); Text("全期間").tag(0) }
                .pickerStyle(.segmented)
            readout(current ?? rows.first)
            Chart {
                ForEach(rows) { r in
                    AreaMark(x: .value("日", Dates.date(r.date)), yStart: .value("下", min(0, minRow?.forecastBalance ?? 0)), yEnd: .value("計画後の残高", r.forecastBalance))
                        .foregroundStyle(LinearGradient(colors: [.teal.opacity(0.3), .teal.opacity(0.02)], startPoint: .top, endPoint: .bottom))
                        .interpolationMethod(.stepEnd)
                    LineMark(x: .value("日", Dates.date(r.date)), y: .value("計画後の残高", r.forecastBalance), series: .value("系列", "計画後"))
                        .foregroundStyle(.teal).lineStyle(StrokeStyle(lineWidth: 2.4)).interpolationMethod(.stepEnd)
                    if showMandatory {
                        LineMark(x: .value("日", Dates.date(r.date)), y: .value("予定だけの残高", r.mandatoryBalance), series: .value("系列", "予定だけ"))
                            .foregroundStyle(Color.secondary).lineStyle(StrokeStyle(lineWidth: 1.4, dash: [4, 3])).interpolationMethod(.stepEnd)
                    }
                    if r.salary {
                        PointMark(x: .value("日", Dates.date(r.date)), y: .value("計画後の残高", r.forecastBalance)).symbolSize(28).foregroundStyle(.green)
                    }
                }
                if f.reserveFloor > 0 {
                    RuleMark(y: .value("最低残高", f.reserveFloor)).foregroundStyle(.orange).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3]))
                        .annotation(position: .top, alignment: .leading) { Text("残したい \(compactYen(f.reserveFloor))").font(.caption2).foregroundStyle(.orange) }
                }
                RuleMark(y: .value("0", 0)).foregroundStyle(Color.red.opacity(0.35))
                if let c = current {
                    RuleMark(x: .value("選択", Dates.date(c.date))).foregroundStyle(Color.primary.opacity(0.25))
                    PointMark(x: .value("選択", Dates.date(c.date)), y: .value("計画後の残高", c.forecastBalance)).symbolSize(90).foregroundStyle(.teal)
                }
            }
            .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { v in AxisGridLine().foregroundStyle(.clear); AxisValueLabel { if let d = v.as(Date.self) { Text(d.formatted(.dateTime.month(.defaultDigits).day())) } } } }
            .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { v in AxisGridLine(stroke: StrokeStyle(lineWidth: 0.5, dash: [2, 3])); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
            .chartXSelection(value: $scrub)
            .onChange(of: current?.date) { _, d in if d != nil { Feedback.selection() } }
            .frame(height: 220).revealFromLeading(delay: 0.2)
            .animation(.snappy, value: range)
            .accessibilityLabel("残高の予測。最低 \(f.minForecastBalance.yen)")
            HStack(spacing: 14) {
                legend(.teal, "計画後の残高", dashed: false)
                Button { withAnimation(.snappy) { showMandatory.toggle() } } label: { legend(.secondary, "予定だけ", dashed: true).opacity(showMandatory ? 1 : 0.4) }
                    .buttonStyle(.plain)
                legend(.green, "給料日", dot: true)
            }
            HStack(alignment: .top, spacing: 8) {
                StatTile(title: "最低予測残高", value: f.minForecastBalance.yen, sub: f.minForecastDate.isEmpty ? nil : Format.shortDay(f.minForecastDate), tint: f.minForecastBalance < f.reserveFloor ? .red : .primary)
                StatTile(title: "月末予測", value: f.monthEndForecast.yen, tint: f.monthEndForecast < 0 ? .red : .primary)
                StatTile(title: range == 0 ? "期間の終わり" : "\(range)日後", value: (rows.last?.forecastBalance ?? 0).yen)
            }
            .fixedSize(horizontal: false, vertical: true)
            Text("「予定だけ」は給与・カード引落・固定支払い・必須の大型支出だけを足し引きした残高（日々の生活費を含まない）。実線はACFが想定した生活費も使った場合です。").font(.caption2).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func readout(_ r: AcfRow?) -> some View {
        if let r {
            Button { openDay(r) } label: {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(scrub == nil ? "今日・\(Format.dayLabel(r.date))" : Format.dayLabel(r.date)).font(.caption).foregroundStyle(.secondary)
                        Text(r.forecastBalance.yen).font(.title2.weight(.bold)).monospacedDigit().foregroundStyle(r.forecastBalance < 0 ? .red : .primary)
                            .contentTransition(.numericText(value: r.forecastBalance))
                        Text(r.events.isEmpty ? "予定だけ \(r.mandatoryBalance.yen)" : r.events.prefix(2).map { "\($0.label) \($0.amount == 0 ? "" : signedYen($0.amount))" }.joined(separator: "・"))
                            .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                    }
                    Spacer()
                    Label("内訳", systemImage: "chevron.right").labelStyle(.titleOnly).font(.caption.weight(.semibold))
                }
            }
            .buttonStyle(.plain)
            .animation(.snappy(duration: 0.15), value: r.date)
        }
    }

    private func legend(_ c: Color, _ t: String, dashed: Bool = false, dot: Bool = false) -> some View {
        HStack(spacing: 4) {
            if dot { Circle().fill(c).frame(width: 7, height: 7) }
            else { Capsule().fill(c).frame(width: 14, height: dashed ? 1.5 : 3).overlay(dashed ? Rectangle().fill(Color.acfCard).frame(width: 3) : nil) }
            Text(t).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

// MARK: 日別の生活費の目安（カード・現金）

struct AcfLivingBudgetCard: View {
    @Environment(\.acfOpenDay) private var openDay
    var f: AcfForecast
    @State private var scrub: String?
    var body: some View {
        let rows = Array(f.rows.prefix(21))
        let sel = rows.first { $0.date == scrub }
        if rows.count > 1 {
            AcfCard(title: "日別の生活費の目安（3週間）", symbol: "chart.bar.fill", tint: .purple) {
                HStack {
                    Text(sel.map { Format.dayLabel($0.date) } ?? "なぞると日ごとの目安").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    if let s = sel {
                        Text("カード \(s.safeCreditBudget.yen)").font(.caption.weight(.semibold)).foregroundStyle(.purple)
                        Text("現金 \(s.safeCashBudget.yen)").font(.caption.weight(.semibold)).foregroundStyle(.teal)
                    }
                }
                .monospacedDigit()
                Chart(rows) { r in
                    BarMark(x: .value("日", r.date), y: .value("カード", r.safeCreditBudget)).foregroundStyle(by: .value("支払い", "カード"))
                        .opacity(scrub == nil || scrub == r.date ? 1 : 0.35)
                    BarMark(x: .value("日", r.date), y: .value("現金", r.safeCashBudget)).foregroundStyle(by: .value("支払い", "現金"))
                        .opacity(scrub == nil || scrub == r.date ? 1 : 0.35)
                }
                .chartForegroundStyleScale(["カード": Color.purple, "現金": Color.teal])
                .chartXAxis { AxisMarks(values: rows.enumerated().filter { $0.offset % 7 == 3 }.map(\.element.date)) { v in AxisValueLabel { if let d = v.as(String.self) { Text(Format.shortDay(d)) } } } }
                .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
                .chartLegend(position: .top, alignment: .trailing)
                .chartXSelection(value: $scrub)
                .onChange(of: scrub) { _, s in if s != nil { Feedback.selection() } }
                .frame(height: 150).growFromBottom(delay: 0.3)
            }
        }
    }
}

// MARK: 注意点（横にめくるカード）

struct AcfRiskCarousel: View {
    var f: AcfForecast
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("注意点", systemImage: "exclamationmark.bubble.fill").font(.subheadline.weight(.semibold)).foregroundStyle(.orange)
                Spacer()
                if !f.risks.isEmpty { Text("\(f.risks.count)件・横にめくれます").font(.caption).foregroundStyle(.secondary) }
            }
            .padding(.horizontal, 4)
            if f.risks.isEmpty {
                Label("大きな注意点はありません", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    .padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    .acfSurface(radius: 22)
            } else {
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 12) {
                        ForEach(f.risks) { r in
                            NavigationLink(value: AcfCenterDest.action(r.action, r.date)) {
                                VStack(alignment: .leading, spacing: 8) {
                                    HStack {
                                        Image(systemName: r.severity == "critical" ? "exclamationmark.octagon.fill" : r.severity == "warning" ? "exclamationmark.triangle.fill" : "eye.fill")
                                            .font(.title3).foregroundStyle(color(r))
                                        Spacer()
                                        if !r.date.isEmpty { Text(Format.shortDay(r.date)).font(.caption.weight(.semibold)).foregroundStyle(.secondary) }
                                    }
                                    Text(r.title).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(2).multilineTextAlignment(.leading)
                                    Text(r.detail).font(.caption).foregroundStyle(.secondary).lineLimit(3).multilineTextAlignment(.leading)
                                    Spacer(minLength: 0)
                                    Text("確認する").font(.caption.weight(.semibold)).foregroundStyle(color(r))
                                }
                                .padding(14)
                                .frame(width: 250, height: 150, alignment: .topLeading)
                                .acfSurface(radius: 20)
                                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(color(r).opacity(0.35)))
                            }
                            .buttonStyle(.plain)
                            .scrollTransition(.interactive, axis: .horizontal) { c, p in c.scaleEffect(p.isIdentity ? 1 : 0.94).opacity(p.isIdentity ? 1 : 0.7) }
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollIndicators(.hidden)
                .contentMargins(.horizontal, 2, for: .scrollContent)
            }
        }
    }
    private func color(_ r: AcfRisk) -> Color { r.severity == "critical" ? .red : r.severity == "warning" ? .orange : .blue }
}

// MARK: 予測の信頼度

struct AcfConfidenceCard: View {
    var f: AcfForecast
    @State private var shown = 0.0
    var body: some View {
        let c = f.confidence, tint: Color = c.score >= 85 ? .green : c.score >= 65 ? .orange : .red
        AcfCard(title: "予測の信頼度", symbol: "checkmark.shield.fill", tint: tint) {
            HStack(spacing: 16) {
                ZStack {
                    Circle().stroke(Color(.tertiarySystemFill), lineWidth: 8)
                    Circle().trim(from: 0, to: shown).stroke(tint, style: StrokeStyle(lineWidth: 8, lineCap: .round)).rotationEffect(.degrees(-90))
                    Text("\(c.score)").font(.title3.weight(.bold)).monospacedDigit()
                }
                .frame(width: 62, height: 62)
                VStack(alignment: .leading, spacing: 2) {
                    Text("信頼度 \(c.label)").font(.headline)
                    Text("登録情報の新しさと、抜けがないかから計算").font(.caption).foregroundStyle(.secondary)
                }
            }
            if c.reasons.isEmpty { Text("大きな未確認項目はありません。").font(.footnote).foregroundStyle(.secondary) }
            ForEach(c.reasons, id: \.text) { r in
                NavigationLink(value: AcfCenterDest.action(r.action, "")) {
                    HStack {
                        Image(systemName: "arrow.up.forward.circle.fill").foregroundStyle(tint)
                        Text(r.text).font(.subheadline).foregroundStyle(.primary).multilineTextAlignment(.leading)
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .onAppear { withAnimation(.spring(response: 1.0, dampingFraction: 0.85).delay(0.15)) { shown = Double(c.score) / 100 } }
    }
}

// MARK: 計算内訳

struct AcfBreakdownCard: View {
    var f: AcfForecast
    @State private var open = false
    var body: some View {
        AcfCard(title: "計算内訳", symbol: "function", tint: .secondary) {
            let parts: [(String, Double, Color)] = [("カード引落", f.mandatoryBreakdown.card, .purple), ("固定支払い", f.mandatoryBreakdown.fixed, .indigo), ("大型支出", f.mandatoryBreakdown.large, .pink)]
            let sum = max(1, parts.reduce(0) { $0 + $1.1 })
            VStack(alignment: .leading, spacing: 6) {
                Text("これからの必須支払い \(parts.reduce(0) { $0 + $1.1 }.yen)").font(.subheadline.weight(.semibold))
                GeometryReader { g in
                    HStack(spacing: 2) { ForEach(parts, id: \.0) { p in if p.1 > 0 { Rectangle().fill(p.2.gradient).frame(width: g.size.width * p.1 / sum) } } }
                        .clipShape(Capsule())
                }
                .frame(height: 10)
                HStack(spacing: 12) { ForEach(parts, id: \.0) { p in HStack(spacing: 4) { Circle().fill(p.2).frame(width: 7, height: 7); Text("\(p.0) \(compactYen(p.1))").font(.caption2).foregroundStyle(.secondary) } } }
            }
            DisclosureGroup(isExpanded: $open) {
                VStack(spacing: 8) {
                    row("現在預金", f.currentDeposits)
                    row("確保しておく金額", f.protectedCashNow)
                    row("最低残したい金額", f.reserveFloor)
                    row("月末予測", f.monthEndForecast)
                    row("今後のカード引落", f.mandatoryBreakdown.card)
                    row("固定支払い（カード以外）", f.mandatoryBreakdown.fixed)
                    row("必須の大型支出（カード以外）", f.mandatoryBreakdown.large)
                    if let n = f.nextCardPayment { LabeledContent("次のカード引落", value: "\(Format.dayLabel(n.date)) \(n.amount.yen)").font(.subheadline) }
                    row("今日の最大（現金＋カード）", f.maxSpendToday)
                }
                .padding(.top, 6)
            } label: { Text("すべての数字").font(.footnote.weight(.semibold)) }
        }
    }
    private func row(_ t: String, _ v: Double) -> some View { LabeledContent(t) { Text(v.yen).monospacedDigit() }.font(.subheadline) }
}
