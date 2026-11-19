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
            else { AcfCalculatingInline() }
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
                            Text(x.text).moneyFont(34, weight: .bold).foregroundStyle(x.color).monospacedDigit()
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
                Section {
                    if let p = preview {
                        AcfLoader(lightweight: true, settings: p) { f in
                            HStack {
                                tile("今日使える", f.safeTotalBudget); tile("カード", f.safeCreditBudget); tile("現金", f.safeCashBudget)
                            }
                        }
                    }
                } header: { Label("リアルタイム試算", systemImage: "waveform.path.ecg") } footer: { Text("下の設定を変えると、保存する前にここで結果が変わります。") }
                Section {
                    AmountField(title: "最低残したい金額", value: binding.reserveFloor)
                } header: { Label("守るお金", systemImage: "lock.shield") } footer: { Text("どの日もこの金額を下回らないように、今日使える額を計算します。") }
                Section {
                    Toggle("カードを利用", isOn: binding.creditFallbackEnabled)
                    VStack(alignment: .leading) {
                        HStack { Text("カードで支払う割合"); Spacer(); Text(binding.wrappedValue.creditFallbackEnabled ? "\(Int(binding.wrappedValue.creditAggressiveness))%" : "OFF").bold().monospacedDigit() }
                        Slider(value: binding.creditAggressiveness, in: 0...100, step: 1).disabled(!binding.wrappedValue.creditFallbackEnabled)
                        Text("100%なら、カードで支払える生活費は安全な範囲で原則100%カードになります。").font(.caption).foregroundStyle(.secondary)
                    }
                    AmountField(title: "カード1日上限", value: binding.creditDailyLimit)
                    Picker("優先して使うカード", selection: binding.preferredCardId) {
                        Text("自動").tag("")
                        ForEach(model.doc.cards) { Text($0.name).tag($0.id) }
                    }
                    NavigationLink { CreditUsageRulesView(s: binding) } label: {
                        LabeledContent("カードを使っていい場所", value: model.doc.acfAllowedCategorySummary(binding.wrappedValue))
                    }
                } header: { Label("カードの使い方", systemImage: "creditcard") } footer: { Text("日別表は翌々月末まで表示し、その後に来るカードの支払日も確かめます。") }
                Section {
                    Toggle("曜日傾向を利用", isOn: binding.useWeekdayWeights)
                    Toggle("必須の大型支出を含める", isOn: binding.includeRequiredLargeExpenses)
                    Toggle("予測リスク通知", isOn: binding.riskNotifications)
                } header: { Label("予測", systemImage: "chart.line.uptrend.xyaxis") } footer: { Text("曜日傾向：よく使う曜日に多めに配分します。予測リスク通知：不足しそうな日をお知らせします。") }
                Section {
                    NavigationLink { AcfIndexPeriodView() } label: {
                        LabeledContent("ACF指標の期間", value: binding.wrappedValue.indexEndDay >= 31 ? "毎月 月末まで" : "毎月\(binding.wrappedValue.indexEndDay)日まで")
                    }
                } header: { Label("ACF指標", systemImage: "gauge.with.dots.needle.67percent") }
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
        // 期間は「ACF指標の期間」の画面で別に保存しているので、いまの値を使う
        let cur = model.doc.acfStoredSettings
        x.indexEndDay = cur.indexEndDay; x.indexEndDate = cur.indexEndDate; x.c100Mode = cur.c100Mode
        model.commit("ACF設定") { $0.saveAcfSettings(x) }
        model.done("ACF設定を保存しました")
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

