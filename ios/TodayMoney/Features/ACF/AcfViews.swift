import SwiftUI
import Charts
import TodayMoneyCore

// ACF（資金見通し）の画面。計算は TodayMoneyCore の acfForecast（Web 版 buildCashFlowForecast と照合済み）。

/// ACF の予測を裏で計算して渡す（重い計算で画面を止めない）
struct AcfLoader<Content: View>: View {
    @Environment(AppModel.self) private var model
    var lightweight = false
    var settings: AcfSettings? = nil
    @ViewBuilder var content: (AcfForecast) -> Content
    @State private var forecast: AcfForecast?
    @State private var key = ""

    var body: some View {
        Group {
            if let forecast { content(forecast) }
            else { HStack(spacing: 8) { ProgressView(); Text("ACFを計算しています…").foregroundStyle(.secondary) }.frame(maxWidth: .infinity, minHeight: 80) }
        }
        .task(id: "\(model.revision)|\(model.today)|\(lightweight)|\(settings.map { "\($0.json)" } ?? "")") {
            let doc = model.doc, today = model.today, light = lightweight, s = settings
            let f = await Task.detached(priority: .userInitiated) { doc.acfForecast(today: today, settings: s, lightweight: light) }.value
            forecast = f
        }
    }
}

extension AcfIndex {
    var color: Color { tone == "deficit" ? .red : tone == "tight" ? .orange : .green }
}
func acfStatusColor(_ s: String) -> Color { s == "不足" ? .red : s == "危険" ? .orange : s == "注意" ? .yellow : .green }

/// 「使えるお金」と「予定の支払い」の2本の棒（Web 版 acfCompareBarsHtml）
struct AcfCompareBars: View {
    var x: AcfIndex
    var large = false
    var body: some View {
        let mx = max(1, x.have, x.need)
        VStack(alignment: .leading, spacing: 8) {
            bar("使えるお金", x.have, mx, .green, large ? "残高 \(x.balance.yen)・入金予定 \(x.income.yen)" : nil)
            bar("予定の支払い", x.need, mx, .orange, large ? "支払い \(x.out.yen)・最低残高 \(x.reserve.yen)" : nil)
        }
    }
    private func bar(_ label: String, _ v: Double, _ mx: Double, _ c: Color, _ sub: String?) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack { Text(label).font(.footnote).foregroundStyle(.secondary); Spacer(); Text(v.yen).font(.footnote.weight(.semibold)).monospacedDigit() }
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(.quaternary)
                    Capsule().fill(c.gradient).frame(width: max(6, g.size.width * v / mx))
                }
            }.frame(height: large ? 12 : 8)
            if let sub { Text(sub).font(.caption).foregroundStyle(.secondary) }
        }
        .accessibilityElement(children: .combine)
    }
}

/// ホームの ACF カード（Web 版 homeAcfCardHtml：ACF指標）
struct AcfHomeCard: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let s = model.doc.acfStoredSettings
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Label("ACF", systemImage: "chart.line.uptrend.xyaxis").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.acf)
                if s.c100Mode { Text("C100").font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 2).background(.purple.opacity(0.18), in: Capsule()).foregroundStyle(.purple) }
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            if !s.initialized {
                Text("未設定").font(.title2.weight(.bold))
                Text("最低残したい金額を決めると、ACF指標を計算します").font(.footnote).foregroundStyle(.secondary)
            } else {
                AcfLoader(lightweight: true) { f in
                    let x = model.doc.acfIndex(f, today: model.today)
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(x.text).font(.system(size: 34, weight: .bold, design: .rounded)).foregroundStyle(x.color).monospacedDigit()
                            Text(x.label).font(.subheadline.weight(.semibold)).foregroundStyle(x.color)
                            Spacer()
                            Text("\(Format.shortDay(x.end)) まで").font(.footnote).foregroundStyle(.secondary)
                        }
                        AcfCompareBars(x: x)
                        HStack {
                            Text(x.surplus >= 0 ? "余る見込み" : "足りない見込み").font(.footnote)
                            Text("\(x.surplus >= 0 ? "＋" : "−")\(abs(x.surplus).yen)").font(.footnote.weight(.bold)).foregroundStyle(x.surplus >= 0 ? .green : .red)
                        }
                        if x.value < 1 { Text("給料日までの支払いと最低残高に \(abs(x.surplus).yen) 足りません").font(.footnote).foregroundStyle(.red) }
                    }
                }
            }
        }
        .cardStyle()
    }
}

/// ACF指標の詳細（Web 版 openAcfIndexDetail）
struct AcfIndexView: View {
    @Environment(AppModel.self) private var model
    @State private var period = false
    var body: some View {
        List {
            AcfLoader(lightweight: true) { f in
                let x = model.doc.acfIndex(f, today: model.today)
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("ACF指標").font(.subheadline).foregroundStyle(.secondary)
                        HStack(alignment: .firstTextBaseline) {
                            Text(x.text).font(.system(size: 52, weight: .heavy, design: .rounded)).foregroundStyle(x.color)
                            Text(x.label).font(.headline).foregroundStyle(x.color)
                        }
                        Text(x.sentence).font(.subheadline)
                        Button { period = true } label: {
                            HStack {
                                Text("\(Format.dayLabel(x.start))〜\(Format.dayLabel(x.end))\(x.custom ? "（指定した日まで）" : "（カードの支払いが終わる毎月\(model.doc.acfStoredSettings.indexEndDay >= 31 ? "月末" : "\(model.doc.acfStoredSettings.indexEndDay)日")まで）")")
                                    .font(.footnote).multilineTextAlignment(.leading)
                                Spacer(); Text("変更").font(.footnote.weight(.semibold))
                            }
                        }
                        AcfCompareBars(x: x, large: true)
                        HStack {
                            Text(x.surplus >= 0 ? "余る見込み" : "足りない見込み")
                            Spacer()
                            Text("\(x.surplus >= 0 ? "＋" : "−")\(abs(x.surplus).yen)").bold().foregroundStyle(x.surplus >= 0 ? .green : .red)
                        }
                    }.padding(.vertical, 4)
                } footer: { Text("1.0で収支がちょうどです。1.0以上なら黒字、1.0未満なら赤字の見込みです（日々の生活費は含みません）。") }
                Section("対象期間の入出金") {
                    if x.events.isEmpty { Text("予定された入出金はありません").foregroundStyle(.secondary) }
                    ForEach(x.events.prefix(12)) { e in
                        HStack {
                            Circle().fill(e.income ? Color.green : Color.orange).frame(width: 8, height: 8)
                            VStack(alignment: .leading) { Text(e.label); Text(Format.dayLabel(e.date)).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Text("\(e.income ? "＋" : "−")\(e.amount.yen)").monospacedDigit().foregroundStyle(e.income ? .green : .primary)
                        }
                    }
                }
            }
            Section {
                NavigationLink { AcfDetailView() } label: { VStack(alignment: .leading) { Text("ACFの日別資金表"); Text("今日使える目安・カード配分・注意点").font(.caption).foregroundStyle(.secondary) } }
                NavigationLink { AcfSettingsView() } label: { VStack(alignment: .leading) { Text("ACF設定"); Text("最低残高・カード比率").font(.caption).foregroundStyle(.secondary) } }
            }
        }
        .navigationTitle("ACF指標")
        .sheet(isPresented: $period) { NavigationStack { AcfIndexPeriodView() }.presentationDetents([.medium]) }
    }
}

/// ACF指標の期間（Web 版 openAcfIndexPeriod）
struct AcfIndexPeriodView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var day = 28
    @State private var custom = false
    @State private var date = Dates.ymd()
    var body: some View {
        Form {
            Section {
                Picker("カードの支払いが終わる日", selection: $day) { ForEach(1...31, id: \.self) { Text($0 >= 31 ? "月末" : "\($0)日").tag($0) } }
            } header: { Text("毎月の終わりの日") } footer: { Text("初期値は28日（カードの引き落としが28日までに終わるため）") }
            Section {
                Toggle("日付を指定する", isOn: $custom)
                if custom { DatePicker("終わりの日", selection: Binding(get: { Dates.date(date) }, set: { date = Dates.ymd($0) }), in: Dates.date(model.today)..., displayedComponents: .date) }
            } header: { Text("今回だけ日付を指定") } footer: { Text("指定した日を過ぎると、毎月の日に戻ります") }
        }
        .navigationTitle("ACF指標の期間").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("保存") {
                var s = model.doc.acfStoredSettings
                s.indexEndDay = day; s.indexEndDate = custom ? date : ""
                model.commit("ACF指標の期間") { $0.saveAcfSettings(s) }
                dismiss()
            }.bold() }
        }
        .onAppear {
            let s = model.doc.acfStoredSettings
            day = s.indexEndDay
            let e = model.doc.acfIndexEndDate(start: model.today)
            custom = e.custom; date = e.end
        }
    }
}

/// ACF（Web 版 _openAcfDetailImmediate）
struct AcfDetailView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("acfFundsView") private var viewMode = "table"
    @State private var importantOnly = false
    @State private var month = ""
    @State private var selected: AcfRow?
    @State private var simulator = false

    var body: some View {
        List {
            AcfLoader { f in content(f) }
        }
        .navigationTitle("ACF")
        .sheet(item: $selected) { r in NavigationStack { AcfDayView(row: r) }.presentationDetents([.medium, .large]) }
        .sheet(isPresented: $simulator) { NavigationStack { AcfSimulatorView() } }
    }

    @ViewBuilder private func content(_ f: AcfForecast) -> some View {
        let ratio = f.settings.creditFallbackEnabled ? Int(f.settings.creditAggressiveness.rounded()) : 0
        Section {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("ACF").font(.subheadline).foregroundStyle(.secondary)
                    MoneyText(value: f.safeTotalBudget, size: 44, weight: .heavy)
                    Text("今日使える目安").font(.footnote).foregroundStyle(.secondary)
                }
                Spacer()
                Text(f.status).font(.subheadline.weight(.bold)).padding(.horizontal, 10).padding(.vertical, 4)
                    .background(acfStatusColor(f.status).opacity(0.18), in: Capsule()).foregroundStyle(acfStatusColor(f.status))
            }
            HStack {
                tile("カードで支払う目安", f.safeCreditBudget.yen)
                tile("現金で支払う目安", f.safeCashBudget.yen)
                tile("カード比率", "\(ratio)%")
            }
        } footer: { Text("設定比率は支払い方法の希望です。カードの限度額・1日上限・禁止カテゴリ・将来の引落残高をACFが確認し、安全な範囲に制限します。") }

        Section {
            Toggle(isOn: Binding(get: { model.doc.acfStoredSettings.c100Mode }, set: { on in
                var s = model.doc.acfStoredSettings; s.c100Mode = on
                model.commit("C100モード") { $0.saveAcfSettings(s) }
                model.toast = on ? "C100モード：カード100%で試算しています" : "C100モードを終了しました"
            })) {
                VStack(alignment: .leading) {
                    Text("C100モード")
                    Text(f.settings.c100Mode ? "現金を使わず、すべてカードで払う前提で計算中" : "今日から現金を使わず、すべてカードで払ったら").font(.caption).foregroundStyle(.secondary)
                }
            }
        }

        if f.cashShortage > 0 || f.reserveShortage > 0 {
            Section {
                let critical = f.cashShortage > 0
                let d = critical ? (f.minimumCashShortageDate.isEmpty ? f.minForecastDate : f.minimumCashShortageDate) : (f.firstReserveBreachDate.isEmpty ? f.minForecastDate : f.firstReserveBreachDate)
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(critical ? "資金不足" : "安全残高不足").bold()
                        Text(critical ? "\(Format.dayLabel(d))に予測残高が −\(f.cashShortage.yen) まで不足する見込みです。「今日使える額」が0円でも、不足額は隠さず表示します。"
                             : "\(Format.dayLabel(d))に最低残したい金額を下回る見込みです。安全余力 −\(f.reserveShortage.yen)。").font(.footnote)
                    }
                } icon: { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(critical ? .red : .orange) }
            }
        }

        let visibleEnd = model.doc.acfVisibleEnd(f.startDate)
        let months = Array(NSOrderedSet(array: f.rows.filter { $0.date <= visibleEnd }.map { String($0.date.prefix(7)) })) as? [String] ?? []
        let m = months.contains(month) ? month : (months.first ?? model.thisMonth)
        let rows = f.rows.filter { $0.date.hasPrefix(m) && (!importantOnly || $0.important) }
        Section {
            Picker("表示", selection: $viewMode) { Label("表", systemImage: "list.bullet").tag("table"); Label("カレンダー", systemImage: "calendar").tag("calendar") }.pickerStyle(.segmented)
            Picker("表示月", selection: Binding(get: { m }, set: { month = $0 })) { ForEach(months, id: \.self) { Text(Format.monthLabel($0)).tag($0) } }
            Picker("日", selection: $importantOnly) { Text("すべての日").tag(false); Text("重要日のみ").tag(true) }.pickerStyle(.segmented)
            if viewMode == "calendar" {
                AcfCalendar(month: m, rows: rows, today: model.today) { selected = $0 }
            } else {
                AcfTable(rows: rows, today: model.today, firstDeficit: f.firstNegativeDate) { selected = $0 }
                    .listRowInsets(EdgeInsets(top: 4, leading: 0, bottom: 4, trailing: 0))
            }
        } header: { Text("日別資金表") } footer: {
            Text("\(Format.dayLabel(f.startDate))〜\(Format.dayLabel(visibleEnd))を月ごとに表示。カード利用後の請求は\(Format.dayLabel(f.endDate))まで確認します。現金余力は、必須の入出金後に将来残せる最低残高と安全残高の差です。「計画支出（現金）」は実際の引落しではなく、ACFが想定した生活費を使う場合の金額です。カードで使う目安は利用日の現金からは引かず、後日の請求に反映します。")
        }

        Section("残高予測") {
            Chart(f.rows) { r in
                LineMark(x: .value("日", Dates.date(r.date)), y: .value("計画後の残高", r.forecastBalance)).foregroundStyle(.teal).interpolationMethod(.stepEnd)
                if f.reserveFloor > 0 { RuleMark(y: .value("最低残高", f.reserveFloor)).foregroundStyle(.orange).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3])) }
                RuleMark(y: .value("0", 0)).foregroundStyle(.secondary.opacity(0.4))
            }
            .frame(height: 190)
            .accessibilityLabel("残高予測のグラフ。最低 \(f.minForecastBalance.yen)")
            let trend = f.rows.filter { $0.date <= "\(f.startDate.prefix(7))-31" }.prefix(14)
            if trend.count > 1 {
                Text("日別の生活費目安").font(.subheadline.weight(.semibold))
                Chart(Array(trend)) { r in
                    BarMark(x: .value("日", Dates.date(r.date), unit: .day), y: .value("カード", r.safeCreditBudget)).foregroundStyle(by: .value("支払い", "カード"))
                    BarMark(x: .value("日", Dates.date(r.date), unit: .day), y: .value("現金", r.safeCashBudget)).foregroundStyle(by: .value("支払い", "現金"))
                }
                .chartForegroundStyleScale(["カード": Color.purple, "現金": Color.teal])
                .frame(height: 140)
            }
        }

        Section("次の重要な資金イベント") {
            let monthEnd = "\(f.startDate.prefix(7))-\(Dates.daysInMonth(String(f.startDate.prefix(7))))"
            let items = f.rows.filter { $0.date == f.startDate || !$0.events.isEmpty || $0.flexibleCardDue > 0 || $0.date == monthEnd || $0.headroom < 0 }.prefix(20)
            ForEach(Array(items)) { r in
                let delta = r.income - r.mandatoryOutflow - r.flexibleCardDue
                Button { selected = r } label: {
                    HStack(alignment: .top) {
                        Text(Format.shortDay(r.date)).font(.subheadline.monospacedDigit()).frame(width: 44, alignment: .leading)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(r.events.map(\.label).joined(separator: "・").nonEmpty ?? (r.flexibleCardDue > 0 ? "カード支払いの引落" : r.date == f.startDate ? "現在" : "月末")).lineLimit(2)
                            Text("終了予測 \(r.forecastBalance.yen)\(r.headroom < 0 ? "・安全ラインを下回る見込み" : "")").font(.caption).foregroundStyle(r.headroom < 0 ? .red : .secondary)
                        }
                        Spacer()
                        Text(delta != 0 ? signedYen(delta) : r.forecastBalance.yen).monospacedDigit().foregroundStyle(delta > 0 ? .green : delta < 0 ? .red : .primary)
                    }
                }
                .tint(.primary)
            }
        }

        Section("計算内訳") {
            LabeledContent("現在預金", value: f.currentDeposits.yen)
            LabeledContent("確保しておく金額", value: f.protectedCashNow.yen)
            LabeledContent("最低残したい金額", value: f.reserveFloor.yen)
            LabeledContent("月末予測", value: f.monthEndForecast.yen)
            LabeledContent("今後のカード引落", value: f.mandatoryBreakdown.card.yen)
            LabeledContent("固定支払い（カード以外）", value: f.mandatoryBreakdown.fixed.yen)
            LabeledContent("必須の大型支出（カード以外）", value: f.mandatoryBreakdown.large.yen)
            if let n = f.nextCardPayment { LabeledContent("次のカード引落", value: "\(Format.dayLabel(n.date)) \(n.amount.yen)") }
            LabeledContent("今日の最大（現金＋カード）", value: f.maxSpendToday.yen)
        }

        Section("もし使ったら？") {
            Button { simulator = true } label: { VStack(alignment: .leading) { Text("購入前シミュレーション"); Text("保存前に現在と使用後のお金の流れを比較").font(.caption).foregroundStyle(.secondary) } }
            if num(model.doc["monthlyGoals"]?[model.thisMonth]?["total"]) > 0 {
                Button("ACFの安全予算を日別計画へ反映") {
                    var n: Int?
                    model.commit("ACFの安全予算を日別計画へ") { d in n = d.applyAcfSafeBudgetToMonthlyPlan(month: model.thisMonth, forecast: f, today: model.today) }
                    model.toast = (n ?? 0) > 0 ? "\(n!)日分の日別計画へ反映しました" : "今日以降の安全予算がすべて0円のため、反映する金額はありません"
                }
            }
        }

        Section {
            VStack(alignment: .leading, spacing: 6) {
                HStack { Text("予測の信頼度 \(f.confidence.label)").bold(); Spacer(); Text("\(f.confidence.score)%").bold() }
                ProgressView(value: Double(f.confidence.score), total: 100).tint(f.confidence.score >= 85 ? .green : f.confidence.score >= 65 ? .orange : .red)
                Text("登録情報の鮮度と完全性から算出").font(.caption).foregroundStyle(.secondary)
            }
            ForEach(f.confidence.reasons, id: \.text) { r in
                NavigationLink { AcfActionDestination(action: r.action) } label: { Text(r.text).font(.subheadline) }
            }
            if f.confidence.reasons.isEmpty { Text("大きな未確認項目はありません。").foregroundStyle(.secondary) }
        } header: { Text("予測の信頼度") }

        Section("注意点") {
            if f.risks.isEmpty { Label("大きな注意点はありません", systemImage: "checkmark.circle").foregroundStyle(.green) }
            ForEach(f.risks) { r in
                NavigationLink { AcfActionDestination(action: r.action, date: r.date) } label: {
                    Label {
                        VStack(alignment: .leading, spacing: 2) { Text(r.title).font(.subheadline.weight(.semibold)); Text(r.detail).font(.caption).foregroundStyle(.secondary) }
                    } icon: {
                        Image(systemName: r.severity == "critical" ? "exclamationmark.octagon.fill" : r.severity == "warning" ? "exclamationmark.triangle.fill" : "eye.fill")
                            .foregroundStyle(r.severity == "critical" ? .red : r.severity == "warning" ? .orange : .blue)
                    }
                }
            }
        }

        Section { NavigationLink { AcfSettingsView() } label: { VStack(alignment: .leading) { Text("ACF設定"); Text("最低残高・カード比率・詳細条件").font(.caption).foregroundStyle(.secondary) } } }
    }

    private func tile(_ t: String, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 2) { Text(t).font(.caption2).foregroundStyle(.secondary); Text(v).font(.subheadline.weight(.semibold)).monospacedDigit() }
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension String { var nonEmpty: String? { isEmpty ? nil : self } }

/// 注意点・信頼度の行から開く画面（Web 版 openAcfAction）
struct AcfActionDestination: View {
    var action: String
    var date: String = ""
    @Environment(AppModel.self) private var model
    var body: some View {
        if action.hasPrefix("card:") { CardEditor(cardId: String(action.dropFirst(5))) }
        else if action.hasPrefix("bank:") { BankEditor(bankId: String(action.dropFirst(5))) }
        else if action == "salary" { SalaryMonthView(month: model.thisMonth) }
        else if action == "goal" { GoalPlannerView(type: .daily, key: date.isEmpty ? model.today : date) }
        else if action == "acf" { AcfSettingsView() }
        else if action == "day" { AcfLoader { f in if let r = f.rows.first(where: { $0.date == date }) { AcfDayView(row: r) } else { Text("この日の予測はありません") } } }
        else { ContentUnavailableView("Gmail の取り込みは Web 版で確認してください", systemImage: "envelope") }
    }
}

/// 日別資金表（Web 版 acfTableHtml：横にスクロールする表）
struct AcfTable: View {
    var rows: [AcfRow]
    var today: String
    var firstDeficit: String
    var select: (AcfRow) -> Void
    static let fields: [(String, KeyPath<AcfRow, Double>, String)] = [
        ("開始残高", \.openingBalance, "signed"), ("入金予定", \.income, "plus"), ("カード引落", \.totalCardPayment, "minus"),
        ("その他必須支出", \.otherMandatory, "minus"), ("現金余力", \.cashHeadroom, "signed"), ("計画支出（現金）", \.flexibleCash, "minus"),
        ("現金で使う目安", \.safeCashBudgetRemaining, "available"), ("カードで使う目安", \.safeCreditBudgetRemaining, "available"),
        ("今日使える合計", \.safeBudgetRemaining, "available"), ("計画後の残高", \.forecastBalance, "signed"), ("安全余力", \.headroom, "signed"),
    ]
    static func text(_ v: Double, _ kind: String) -> String {
        let n = v.rounded()
        switch kind {
        case "plus": return n > 0 ? "+\(n.yen)" : n.yen
        case "minus": return abs(n) > 0 ? "−\(abs(n).yen)" : 0.0.yen
        case "available": return max(0, n).yen
        default: return n < 0 ? "−\(abs(n).yen)" : n.yen
        }
    }
    var body: some View {
        if rows.isEmpty { Text("この月に表示する日がありません。").foregroundStyle(.secondary).padding() }
        else {
            ScrollView(.horizontal, showsIndicators: true) {
                Grid(alignment: .trailing, horizontalSpacing: 14, verticalSpacing: 8) {
                    GridRow {
                        Text("項目").font(.caption.weight(.semibold)).gridColumnAlignment(.leading)
                        ForEach(rows) { r in
                            Button { select(r) } label: {
                                VStack(spacing: 1) {
                                    HStack(spacing: 2) {
                                        Text(Format.shortDay(r.date)).font(.caption.weight(.semibold))
                                        if r.date == firstDeficit { Text("!").font(.caption.weight(.heavy)).foregroundStyle(.red) }
                                    }
                                    HStack(spacing: 2) {
                                        if r.salary { Text("¥").foregroundStyle(.green) }
                                        if r.card || r.cardPayment > 0 || r.flexibleCardDue > 0 { Circle().fill(.purple).frame(width: 5, height: 5) }
                                        if r.large { Circle().fill(.pink).frame(width: 5, height: 5) }
                                        Text(String(Array("日月火水木金土")[Dates.weekday(r.date)]))
                                    }.font(.caption2).foregroundStyle(.secondary)
                                }
                                .padding(.horizontal, 4).padding(.vertical, 2)
                                .background(r.date == today ? Color.accentColor.opacity(0.15) : r.forecastBalance < 0 ? Color.red.opacity(0.12) : .clear, in: RoundedRectangle(cornerRadius: 6))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(Format.dayLabel(r.date))の資金詳細")
                        }
                    }
                    Divider()
                    ForEach(Self.fields, id: \.0) { label, key, kind in
                        GridRow {
                            Text(label).font(.caption).foregroundStyle(.secondary).gridColumnAlignment(.leading).fixedSize()
                            ForEach(rows) { r in
                                let v = r[keyPath: key]
                                Text(Self.text(v, kind)).font(.caption.monospacedDigit())
                                    .foregroundStyle(kind == "signed" && v < 0 ? .red : .primary)
                                    .fixedSize()
                            }
                        }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 6)
            }
        }
    }
}

/// 資金カレンダー（Web 版 acfCalendarHtml：各日の計画後の残高）
struct AcfCalendar: View {
    var month: String
    var rows: [AcfRow]
    var today: String
    var select: (AcfRow) -> Void
    var body: some View {
        let byDate = Dictionary(uniqueKeysWithValues: rows.map { ($0.date, $0) })
        let first = Dates.weekday("\(month)-01"), days = Dates.daysInMonth(month)
        let cells = Int(ceil(Double(first + days) / 7)) * 7
        VStack(spacing: 6) {
            HStack { ForEach(Array("日月火水木金土"), id: \.self) { Text(String($0)).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity) } }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7), spacing: 4) {
                ForEach(0..<cells, id: \.self) { i in
                    let day = i - first + 1
                    if day < 1 || day > days { Color.clear.frame(height: 50) }
                    else {
                        let date = "\(month)-\(day < 10 ? "0" : "")\(day)"
                        if let r = byDate[date] {
                            Button { select(r) } label: {
                                VStack(spacing: 2) {
                                    Text("\(day)").font(.caption.weight(date == today ? .bold : .regular))
                                    Text(Self.short(r.forecastBalance)).font(.system(size: 9).monospacedDigit()).foregroundStyle(r.forecastBalance < 0 ? .red : r.headroom < 0 ? .orange : .secondary)
                                    HStack(spacing: 2) {
                                        if r.salary { Circle().fill(.green).frame(width: 4, height: 4) }
                                        if r.card || r.cardPayment > 0 || r.flexibleCardDue > 0 { Circle().fill(.purple).frame(width: 4, height: 4) }
                                        if r.large { Circle().fill(.pink).frame(width: 4, height: 4) }
                                    }.frame(height: 4)
                                }
                                .frame(maxWidth: .infinity, minHeight: 50)
                                .background(r.forecastBalance < 0 ? Color.red.opacity(0.12) : r.headroom < 0 ? Color.orange.opacity(0.12) : Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
                                .overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(date == today ? Color.accentColor : .clear, lineWidth: 1.5))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(Format.dayLabel(date))、計画後の残高 \(r.forecastBalance.yen)")
                        } else {
                            VStack { Text("\(day)").font(.caption).foregroundStyle(.tertiary); Text("—").font(.caption2).foregroundStyle(.tertiary) }.frame(maxWidth: .infinity, minHeight: 50)
                        }
                    }
                }
            }
            HStack(spacing: 12) {
                Label("給与", systemImage: "circle.fill").foregroundStyle(.green)
                Label("カード引落", systemImage: "circle.fill").foregroundStyle(.purple)
                Label("大型支出", systemImage: "circle.fill").foregroundStyle(.pink)
            }.font(.caption2).labelStyle(.titleAndIcon)
            Text("各日の数値は計画後の残高です。日付を選ぶと、表と同じ内訳を表示します。").font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
    static func short(_ v: Double) -> String {
        let a = abs(v.rounded()), sign = v < 0 ? "−" : ""
        return a >= 10000 ? "\(sign)\(String(format: "%.1f", a / 10000))万" : "\(sign)\(Int(a).formatted())"
    }
}

/// 1日の資金状態（Web 版 ACF資金状態・ACF_DAY_FIELDS）
struct AcfDayView: View {
    var row: AcfRow
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        List {
            Section("ACF資金状態") {
                ForEach(AcfTable.fields, id: \.0) { label, key, kind in
                    let v = row[keyPath: key]
                    LabeledContent(label) { Text(AcfTable.text(v, kind)).monospacedDigit().foregroundStyle(kind == "signed" && v < 0 ? .red : .primary) }
                }
                LabeledContent("支払い方法", value: row.paymentMode)
            }
            if !row.events.isEmpty {
                Section("この日の入出金") {
                    ForEach(Array(row.events.enumerated()), id: \.offset) { _, e in
                        LabeledContent(e.label) { Text(e.amount == 0 ? "—" : signedYen(e.amount)).monospacedDigit().foregroundStyle(e.amount > 0 ? .green : .primary) }
                    }
                }
            }
            if !row.cardParts.isEmpty {
                Section("カードで使う目安の内訳") {
                    ForEach(Array(row.cardParts.enumerated()), id: \.offset) { _, p in
                        LabeledContent("\(Format.monthLabel(p.billingMonth))請求・\(Format.shortDay(p.due))引落") { Text(p.amount.yen).monospacedDigit() }
                    }
                }
            }
        }
        .navigationTitle(Format.dayLabel(row.date)).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("閉じる") { dismiss() } } }
    }
}

/// ACF設定（Web 版 openAcfSettings：最低残高・カード利用・比率・リアルタイム試算・詳細設定）
struct AcfSettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var s: AcfSettings?
    @State private var preview: AcfSettings?
    @State private var debounce: Task<Void, Never>?

    var body: some View {
        Form {
            if let binding = Binding($s) {
                Section("基本設定") {
                    AmountField(title: "最低残したい金額", value: binding.reserveFloor)
                    Toggle("カードを利用", isOn: binding.creditFallbackEnabled)
                    VStack(alignment: .leading) {
                        HStack { Text("カードで支払う割合"); Spacer(); Text(binding.wrappedValue.creditFallbackEnabled ? "\(Int(binding.wrappedValue.creditAggressiveness))%" : "OFF").bold().monospacedDigit() }
                        Slider(value: binding.creditAggressiveness, in: 0...100, step: 1).disabled(!binding.wrappedValue.creditFallbackEnabled)
                        Text("100%なら、カードで支払える生活費は安全な範囲で原則100%カードになります。").font(.caption).foregroundStyle(.secondary)
                    }
                }
                Section("リアルタイム試算") {
                    if let p = preview {
                        AcfLoader(lightweight: true, settings: p) { f in
                            HStack {
                                tile("今日使える", f.safeTotalBudget); tile("カード", f.safeCreditBudget); tile("現金", f.safeCashBudget)
                            }
                        }
                    }
                }
                Section {
                    AmountField(title: "カード1日上限", value: binding.creditDailyLimit)
                    Picker("優先して使うカード", selection: binding.preferredCardId) {
                        Text("自動").tag("")
                        ForEach(model.doc.cards) { Text($0.name).tag($0.id) }
                    }
                    NavigationLink { CreditUsageRulesView(s: binding) } label: {
                        LabeledContent("カードを使っていい場所", value: model.doc.acfAllowedCategorySummary(binding.wrappedValue))
                    }
                } header: { Text("カード詳細") } footer: { Text("日別表は翌々月末まで表示し、その後に到来するカード支払日も確認します。") }
                Section("予測") {
                    Toggle("曜日傾向を利用", isOn: binding.useWeekdayWeights)
                    Toggle("必須の大型支出を含める", isOn: binding.includeRequiredLargeExpenses)
                    Toggle("予測リスク通知", isOn: binding.riskNotifications)
                }
            }
        }
        .navigationTitle("ACF設定")
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold() } }
        .onAppear { if s == nil { s = model.doc.acfStoredSettings; preview = calcSettings(s!) } }
        .onChange(of: s) { _, new in
            debounce?.cancel()
            debounce = Task { try? await Task.sleep(for: .milliseconds(250)); if !Task.isCancelled, let new { preview = calcSettings(new) } }
        }
    }
    /// 試算に使う設定（C100 モード中はカード100%の前提）
    private func calcSettings(_ x: AcfSettings) -> AcfSettings {
        var c = x
        if c.c100Mode { c.creditFallbackEnabled = true; c.creditAggressiveness = 100; c.creditAllowAllCategories = true; c.creditBlockedMerchants = []; c.creditDailyLimit = max(c.creditDailyLimit, 99_999_999) }
        return c
    }
    private func tile(_ t: String, _ v: Double) -> some View {
        VStack(alignment: .leading) { Text(t).font(.caption).foregroundStyle(.secondary); Text(v.yen).font(.headline).monospacedDigit() }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func save() {
        guard var x = s else { return }
        x.initialized = true
        model.commit("ACF設定") { $0.saveAcfSettings(x) }
        model.toast = "ACF設定を保存しました"
        dismiss()
    }
}

/// カードを使っていい場所（Web 版 openCreditUsageRules：カテゴリ・お店ごとの許可と禁止）
struct CreditUsageRulesView: View {
    @Binding var s: AcfSettings
    @Environment(AppModel.self) private var model
    @State private var newAllowed = ""
    @State private var newBlocked = ""
    var body: some View {
        Form {
            Section {
                Toggle("すべてのカテゴリで利用可", isOn: $s.creditAllowAllCategories)
                if !s.creditAllowAllCategories {
                    ForEach(model.doc.categories) { c in
                        Toggle(isOn: Binding(get: { s.creditAllowedCategoryIds.contains(c.id) }, set: { on in
                            if on { if !s.creditAllowedCategoryIds.contains(c.id) { s.creditAllowedCategoryIds.append(c.id) } } else { s.creditAllowedCategoryIds.removeAll { $0 == c.id } }
                        })) { HStack { CategoryIcon(category: c, size: 24); Text(c.name) } }
                    }
                }
            } header: { Text("カテゴリ") } footer: { Text("OFFのときだけカテゴリごとに指定します") }
            Section("いつもカードで払うお店") {
                ForEach(s.creditAllowedMerchants, id: \.self) { Text($0) }.onDelete { s.creditAllowedMerchants.remove(atOffsets: $0) }
                HStack { TextField("お店の名前", text: $newAllowed); Button("追加") { add(&s.creditAllowedMerchants, &newAllowed) }.disabled(newAllowed.trimmingCharacters(in: .whitespaces).isEmpty) }
            }
            Section("カードで払わないお店") {
                ForEach(s.creditBlockedMerchants, id: \.self) { Text($0) }.onDelete { s.creditBlockedMerchants.remove(atOffsets: $0) }
                HStack { TextField("お店の名前", text: $newBlocked); Button("追加") { add(&s.creditBlockedMerchants, &newBlocked) }.disabled(newBlocked.trimmingCharacters(in: .whitespaces).isEmpty) }
            }
        }
        .navigationTitle("カードを使っていい場所")
    }
    private func add(_ list: inout [String], _ text: inout String) {
        let t = text.trimmingCharacters(in: .whitespaces)
        if !t.isEmpty && !list.contains(t) { list.append(t) }
        text = ""
    }
}

/// 購入前シミュレーション（Web 版 openAcfSimulator：保存する前に、使った場合の見通しと比べる）
struct AcfSimulatorView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var amount = 0.0
    @State private var date = Dates.ymd()
    @State private var method = "other"
    @State private var payId = ""
    @State private var result: (before: AcfForecast, after: AcfForecast)?
    @State private var running = false

    var body: some View {
        Form {
            Section("買いたいもの") {
                TextField("名前（例：イヤホン）", text: $name)
                AmountField(title: "金額", value: $amount)
                YMDPicker(title: "日付", value: $date)
                PaymentPicker(method: $method, paymentId: $payId)
            }
            Section {
                Button { run() } label: { if running { ProgressView() } else { Text("比べる") } }.disabled(amount <= 0 || running)
            }
            if let r = result {
                Section("結果") {
                    compare("今日使える目安", r.before.safeTotalBudget, r.after.safeTotalBudget)
                    compare("月末予測", r.before.monthEndForecast, r.after.monthEndForecast)
                    compare("最低残高", r.before.minForecastBalance, r.after.minForecastBalance)
                    LabeledContent("状態", value: "\(r.before.status) → \(r.after.status)")
                    if r.after.minForecastBalance < r.after.reserveFloor {
                        Label("使うと、最低残したい金額を下回る日があります", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    } else {
                        Label("使っても、最低残したい金額は保てる見込みです", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    }
                }
            }
        }
        .navigationTitle("購入前シミュレーション").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() } } }
    }
    private func compare(_ t: String, _ a: Double, _ b: Double) -> some View {
        LabeledContent(t) {
            VStack(alignment: .trailing) {
                Text("\(a.yen) → \(b.yen)").monospacedDigit()
                Text(signedYen(b - a)).font(.caption).foregroundStyle(b - a < 0 ? .red : .green)
            }
        }
    }
    private func run() {
        running = true
        let doc = model.doc, today = model.today
        var plan = LargeExpensePlan(id: "scenario")
        plan.name = name.isEmpty ? "What-if" : name; plan.date = date; plan.amount = amount; plan.priority = "required"; plan.status = "planned"
        plan.paymentMethod = method; plan.paymentId = payId; plan.category = "その他"
        Task.detached(priority: .userInitiated) {
            var copy = doc
            copy.largeExpensePlans = copy.largeExpensePlans + [plan]
            var s = copy.acfSettings; s.includeRequiredLargeExpenses = true
            let before = doc.acfForecast(today: today, lightweight: true)
            let after = copy.acfForecast(today: today, settings: s, lightweight: true)
            await MainActor.run { result = (before, after); running = false }
        }
    }
}
