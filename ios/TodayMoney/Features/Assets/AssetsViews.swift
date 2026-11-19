import Charts
import SwiftUI
import TodayMoneyCore

/// 資産（Web 版 renderAssets：現金・預金・30日の変化・口座の割合・資産推移（実績／ACF予測）・口座一覧・残高履歴・資金計画）
struct AssetsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("assetRange") private var rangeRaw = AssetRange.m1.rawValue
    @AppStorage("assetMode") private var mode = "actual"
    @AppStorage("assetSort") private var sort = "balance-desc"
    @State private var forecast: [ValuePoint]?
    @State private var loadingForecast = false
    @State private var scrub: ValuePoint?
    @State private var editing: String?
    @State private var adding = false

    private var range: AssetRange { AssetRange(rawValue: rangeRaw) ?? .m1 }

    var body: some View {
        let doc = model.doc, today = model.today
        let delta = doc.assetCurrentDelta(today: today)
        let parts = doc.bankParts
        let actual = doc.assetActualPoints(range, today: today)
        let points = mode == "forecast" ? (forecast ?? []) : actual
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    hero(doc, delta: delta, parts: parts) { withAnimation { proxy.scrollTo("accounts", anchor: .top) } }
                    trend(points: points, doc: doc)
                    metrics(doc, delta: delta)
                    accounts(doc, today: today).id("accounts")
                    links(doc)
                }
                .padding(16)
                .padding(.bottom, 90)
            }
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("資産")
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("口座を追加")
                Menu {
                    Button { model.entryMode = .bank } label: { Label("銀行残高をクイック更新", systemImage: "building.columns") }
                    NavigationLink { AssetHistoryView() } label: { Label("残高履歴", systemImage: "clock.arrow.circlepath") }
                    Button { model.openAcf(.overview) } label: { Label("ACFセンター", systemImage: "chart.line.uptrend.xyaxis") }
                    NavigationLink { NoticesView() } label: { Label("お知らせ", systemImage: "bell") }
                } label: { Image(systemName: "ellipsis.circle") }
                .accessibilityLabel("メニュー")
            }
        }
        .sheet(isPresented: $adding) { NavigationStack { BankEditor(bankId: nil) } }
        .sheet(item: Binding(get: { editing.map(IdBox.init) }, set: { editing = $0?.id })) { b in NavigationStack { BankEditor(bankId: b.id) } }
        .task(id: "\(mode)|\(rangeRaw)|\(model.revision)") { await loadForecast() }
    }

    // MARK: いちばん上（現金・預金・30日の変化・割合）

    private func hero(_ doc: MoneyDocument, delta: AssetDelta, parts: [(name: String, value: Double)], showAccounts: @escaping () -> Void) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("現金・預金").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
            MoneyText(value: doc.totalBankBalance, size: 44, weight: .heavy)
            if delta.known {
                HStack(spacing: 8) {
                    Label(signedYen(delta.delta), systemImage: delta.delta >= 0 ? "arrow.up.right" : "arrow.down.right")
                    if let p = delta.pct { Text(String(format: "%+.1f%%", p)) }
                    Text("直近30日").foregroundStyle(.secondary)
                }
                .font(.subheadline.weight(.semibold)).monospacedDigit()
                .foregroundStyle(delta.delta >= 0 ? .green : .red)
            } else {
                Text("30日の比較は、残高の履歴が増えると表示されます").font(.footnote).foregroundStyle(.secondary)
            }
            Divider()
            if parts.isEmpty {
                Text("口座の割合は、残高のある口座ができると表示します").font(.footnote).foregroundStyle(.secondary)
            } else {
                Button(action: showAccounts) {
                    HStack(spacing: 16) {
                        DonutChart(parts: parts) {
                            VStack(spacing: 0) {
                                Text("\(parts.count)").font(.headline)
                                Text("口座").font(.caption2).foregroundStyle(.secondary)
                            }
                        }
                        .frame(width: 92, height: 92)
                        let total = max(1, parts.reduce(0) { $0 + $1.value })
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(Array(parts.prefix(4).enumerated()), id: \.offset) { i, p in
                                HStack(spacing: 6) {
                                    Circle().fill(ChartPalette.color(i)).frame(width: 8, height: 8)
                                    Text(p.name).font(.footnote).lineLimit(1)
                                    Spacer(minLength: 4)
                                    Text("\(Int((p.value / total * 100).rounded()))%").font(.footnote.weight(.semibold)).monospacedDigit()
                                }
                            }
                            if parts.count > 4 { Text("ほか\(parts.count - 4)口座").font(.caption).foregroundStyle(.secondary) }
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(CardPressStyle())
                .accessibilityHint("口座の一覧へ移動")
            }
        }
        .cardSurface()
    }

    // MARK: 資産推移

    private func trend(points: [ValuePoint], doc: MoneyDocument) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("資産推移").font(.title3.bold())
                Spacer()
                Menu {
                    Picker("表示", selection: $mode) {
                        Label("実績", systemImage: "chart.xyaxis.line").tag("actual")
                        Label("ACF予測", systemImage: "wand.and.stars").tag("forecast")
                    }
                } label: {
                    HStack(spacing: 4) { Text(mode == "forecast" ? "ACF予測" : "実績"); Image(systemName: "chevron.down").font(.caption2.weight(.bold)) }
                        .font(.subheadline.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
            }
            Text(mode == "forecast" ? "登録済みの給与・カード・固定支払い・大型支出から計算した、これからの預金残高です。" : "記録した残高の履歴だけを使います。グラフをなぞると、その日の残高を確認できます。")
                .font(.footnote).foregroundStyle(.secondary)
            if mode == "forecast" && loadingForecast && forecast == nil {
                ProgressView("資産予測を計算しています…").frame(maxWidth: .infinity, minHeight: 200)
            } else {
                RangeStats(points: points)
                ValueLineChart(points: points, tint: mode == "forecast" ? .orange : .blue, dashed: mode == "forecast",
                               floor: mode == "forecast" ? doc.acfStoredSettings.reserveFloor : nil, height: 210,
                               emptyText: mode == "forecast" ? "ACF の予測に必要な予定がまだありません。" : "この期間の残高履歴が足りません。残高を更新すると推移が増えます。",
                               selected: $scrub)
            }
            Picker("期間", selection: $rangeRaw) {
                ForEach(AssetRange.allCases.filter { mode == "actual" || $0 != .all }) { Text($0.label).tag($0.rawValue) }
            }
            .pickerStyle(.segmented)
            .onChange(of: mode) { _, m in if m == "forecast" && range == .all { rangeRaw = AssetRange.y1.rawValue } }
        }
        .cardSurface()
    }

    private func loadForecast() async {
        guard mode == "forecast" else { return }
        loadingForecast = true
        let doc = model.doc, today = model.today, r = range
        let pts = await Task.detached(priority: .userInitiated) { doc.assetForecastPoints(r, today: today) }.value
        forecast = pts
        loadingForecast = false
    }

    // MARK: 今日・30日変化・ACF月末予測

    private func metrics(_ doc: MoneyDocument, delta: AssetDelta) -> some View {
        HStack(spacing: 8) {
            StatTile(title: "今日", value: doc.totalBankBalance.yen)
            StatTile(title: "30日変化", value: delta.known ? signedYen(delta.delta) : "比較不可", tint: delta.known ? (delta.delta >= 0 ? .green : .red) : .secondary)
            AcfMonthEndTile()
        }
    }

    // MARK: 口座

    private func accounts(_ doc: MoneyDocument, today: String) -> some View {
        let order = Dictionary(uniqueKeysWithValues: doc.bankParts.enumerated().map { ($0.element.name, $0.offset) })
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("口座").font(.title3.bold())
                Spacer()
                Menu {
                    Picker("並べ方", selection: $sort) {
                        Text("残高が多い順").tag("balance-desc")
                        Text("残高が少ない順").tag("balance-asc")
                        Text("更新が新しい順").tag("updated")
                        Text("名前順").tag("name")
                    }
                } label: {
                    HStack(spacing: 4) { Text(sortLabel); Image(systemName: "chevron.down").font(.caption2.weight(.bold)) }
                        .font(.subheadline.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
            }
            VStack(spacing: 0) {
                if doc.banks.isEmpty {
                    ContentUnavailableView { Label("銀行口座がありません", systemImage: "building.columns") } description: { Text("右上の＋から追加できます。") }
                }
                ForEach(Array(doc.sortedBanks(sort).enumerated()), id: \.element.id) { i, b in
                    if i > 0 { Divider().padding(.leading, 16) }
                    let color = order[b.name.isEmpty ? "口座" : b.name].map(ChartPalette.color) ?? .gray
                    NavigationLink { BankDetailView(bankId: b.id) } label: { bankRow(b, color: color, doc: doc, today: today) }
                        .buttonStyle(CardPressStyle())
                        .contextMenu {
                            Button { editing = b.id } label: { Label("残高・口座情報を編集", systemImage: "square.and.pencil") }
                            NavigationLink { TransferPlansView() } label: { Label("振替計画", systemImage: "arrow.left.arrow.right") }
                        }
                }
            }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            NavigationLink { FinancialUpdatesView(kind: "banks") } label: {
                Label("金額を更新", systemImage: "pencil").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(Color.accentColor.opacity(0.14), in: Capsule()).foregroundStyle(Color.accentColor)
            }
            .buttonStyle(CardPressStyle())
        }
    }

    private var sortLabel: String { ["balance-desc": "残高順 ↓", "balance-asc": "残高順 ↑", "updated": "更新順", "name": "名前順"][sort] ?? "残高順 ↓" }

    private func bankRow(_ b: Bank, color: Color, doc: MoneyDocument, today: String) -> some View {
        let series = Array(doc.bankSnapshotSeries(b.id, days: 31, today: today).suffix(12))
        let d = doc.bankDelta(b.id, days: 31, today: today)
        let low = b.threshold > 0 && b.balance < b.threshold
        return HStack(spacing: 12) {
            Circle().fill(color).frame(width: 10, height: 10)
            VStack(alignment: .leading, spacing: 3) {
                Text(b.name).font(.body.weight(.semibold)).foregroundStyle(.primary).lineLimit(2)
                Text(b.balanceAsOf.isEmpty ? (b.label.isEmpty ? "残高未確認" : b.label) : "確認 \(Format.dateTime(b.balanceAsOf))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: 6)
            Sparkline(points: series, tint: (d ?? 0) >= 0 ? .green : .red).frame(width: 64, height: 30)
            VStack(alignment: .trailing, spacing: 3) {
                Text(b.balance.yen).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(low ? .red : .primary)
                Text(d.map(signedYen) ?? "比較不可").font(.caption.weight(.semibold)).monospacedDigit()
                    .foregroundStyle(d == nil ? Color.secondary : (d! >= 0 ? Color.green : Color.red))
            }
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    // MARK: 口座・資金計画へのリンク

    private func links(_ doc: MoneyDocument) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("口座").font(.title3.bold()).padding(.top, 6)
            LinkGroup {
                LinkRow(title: "銀行残高を更新", sub: "最新の残高を記録", symbol: "building.columns.fill", tint: .blue) { model.entryMode = .bank }
                LinkRow(title: "残高履歴", sub: "過去の残高更新を確認", symbol: "clock.fill", tint: .cyan) { AssetHistoryView() }
            }
            Text("資金計画").font(.title3.bold()).padding(.top, 6)
            LinkGroup {
                LinkRow(title: "口座ごとの見通し・引落準備", sub: "30 / 60 / 90日の資金推移と振替計画", symbol: "chart.bar.fill", tint: .indigo, action: { model.openAcf(.accounts) })
                LinkRow(title: "ACFセンター", sub: "安全に使える額と残高の見通し", symbol: "chart.line.uptrend.xyaxis", tint: .orange, action: { model.openAcf(.overview) })
            }
        }
    }
}

/// ACF の月末予測（計算は裏で）
struct AcfMonthEndTile: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        if model.doc.acfStoredSettings.initialized {
            AcfLoader(lightweight: true) { f in StatTile(title: "ACF月末予測", value: f.monthEndForecast.yen, tint: f.monthEndForecast < 0 ? .red : .primary) }
        } else {
            StatTile(title: "ACF月末予測", value: "未設定", tint: .secondary)
        }
    }
}

// MARK: - 一覧のリンク（アイコン・題名・説明・›）

struct LinkGroup<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(spacing: 0) { _VariadicView.Tree(DividedLayout()) { content } }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct DividedLayout: _VariadicView_MultiViewRoot {
    func body(children: _VariadicView.Children) -> some View {
        let last = children.last?.id
        ForEach(children) { c in
            c
            if c.id != last { Divider().padding(.leading, 60) }
        }
    }
}

struct LinkRow<Destination: View>: View {
    var title: String
    var sub: String
    var symbol: String
    var tint: Color
    var destination: (() -> Destination)?
    var action: (() -> Void)?

    init(title: String, sub: String, symbol: String, tint: Color, @ViewBuilder destination: @escaping () -> Destination) {
        self.title = title; self.sub = sub; self.symbol = symbol; self.tint = tint; self.destination = destination; self.action = nil
    }

    var body: some View {
        if let destination {
            NavigationLink(destination: destination) { label }.buttonStyle(CardPressStyle())
        } else if let action {
            Button(action: action) { label }.buttonStyle(CardPressStyle())
        }
    }

    private var label: some View {
        HStack(spacing: 14) {
            Image(systemName: symbol).font(.body.weight(.semibold)).foregroundStyle(.white)
                .frame(width: 32, height: 32).background(tint.gradient, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.semibold)).foregroundStyle(.primary)
                Text(sub).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 14).padding(.vertical, 12)
        .contentShape(Rectangle())
    }
}

extension LinkRow where Destination == EmptyView {
    init(title: String, sub: String, symbol: String, tint: Color, action: @escaping () -> Void) {
        self.title = title; self.sub = sub; self.symbol = symbol; self.tint = tint; self.destination = nil; self.action = action
    }
}

// MARK: - 口座の詳細（Web 版 openBankDetail：期間・推移・入金／出金・自由に使える額・引落準備・履歴）

struct BankDetailView: View {
    @Environment(AppModel.self) private var model
    var bankId: String
    @State private var period: BankPeriod = .m1
    @State private var editing = false
    @State private var scrub: ValuePoint?

    var body: some View {
        let doc = model.doc, today = model.today
        if let m = doc.bankDetail(bankId, period: period, today: today) {
            let b = m.bank
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(b.label.isEmpty ? "銀行口座" : b.label).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                        if let s = scrub {
                            Text(s.value.yen).moneyFont(40, weight: .heavy).monospacedDigit()
                            Text("\(Format.dayLabel(s.date))の残高").font(.subheadline).foregroundStyle(.secondary)
                        } else {
                            MoneyText(value: b.balance, size: 40, weight: .heavy)
                            Text(m.delta.map { "\(signedYen($0))・\(period.label)" } ?? "比較できる残高履歴がありません")
                                .font(.subheadline.weight(.semibold)).monospacedDigit()
                                .foregroundStyle(m.delta == nil ? Color.secondary : (m.delta! >= 0 ? Color.green : Color.red))
                        }
                        Text(b.balanceAsOf.isEmpty ? "残高の確認日時なし" : "現在残高の確認 \(Format.dateTime(b.balanceAsOf))").font(.caption).foregroundStyle(.secondary)
                        if b.threshold > 0 {
                            Label("残高アラート \(b.threshold.yen)\(b.balance < b.threshold ? "（下回っています）" : "")", systemImage: "bell")
                                .font(.caption).foregroundStyle(b.balance < b.threshold ? .red : .secondary)
                        }
                        Picker("期間", selection: $period) { ForEach(BankPeriod.allCases) { Text($0.label).tag($0) } }
                            .pickerStyle(.segmented).padding(.top, 6)
                        ValueLineChart(points: m.points, tint: .blue, height: 200, selected: $scrub)
                    }
                    .cardSurface()

                    HStack(spacing: 8) {
                        StatTile(title: "期間中の入金", value: m.periodIn.yen, tint: .green)
                        StatTile(title: "期間中の出金", value: m.periodOut.yen, tint: .orange)
                        StatTile(title: "自由に使える額", value: m.free.yen, sub: m.reserved > 0 ? "残したい \(m.reserved.yen) を除く" : nil)
                    }

                    HStack(spacing: 10) {
                        PillButton(title: "残高を更新", systemImage: "square.and.pencil", tint: .accentColor) { editing = true }
                        NavigationLink { TransferPlansView() } label: {
                            Label("振替計画", systemImage: "arrow.left.arrow.right").font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 14).padding(.vertical, 8).background(Color.teal.opacity(0.14), in: Capsule()).foregroundStyle(.teal)
                        }
                        .buttonStyle(CardPressStyle())
                    }

                    if let f = doc.bankForecast(bankId, days: 60, today: today) {
                        VStack(alignment: .leading, spacing: 10) {
                            CardHeader(title: "引落準備（60日）", systemImage: "calendar.badge.exclamationmark", tint: f.minBalance < 0 ? .red : .teal)
                            HStack(alignment: .firstTextBaseline) {
                                Text(f.minBalance.yen).moneyFont(28).foregroundStyle(f.minBalance < 0 ? .red : .primary)
                                Text("最低予測残高・\(Format.dayLabel(f.minDate))").font(.footnote).foregroundStyle(.secondary)
                            }
                            if let short = f.rows.first(where: { $0.forecastBalance < 0 }) {
                                Label("\(Format.dayLabel(short.date))に \(abs(short.forecastBalance).yen) 足りなくなる見込みです。振替計画で別の口座から移せます。", systemImage: "exclamationmark.triangle.fill")
                                    .font(.footnote).foregroundStyle(.red)
                            } else {
                                Text("登録済みの予定では、60日以内に不足は見つかりませんでした。").font(.footnote).foregroundStyle(.secondary)
                            }
                            ValueLineChart(points: f.rows.map { ValuePoint(date: $0.date, value: $0.forecastBalance) }, tint: .teal, dashed: true, floor: 0, height: 140)
                            let upcoming = f.rows.flatMap { r in r.events.map { (r.date, $0) } }.prefix(6)
                            if !upcoming.isEmpty {
                                VStack(spacing: 6) {
                                    ForEach(Array(upcoming.enumerated()), id: \.offset) { _, e in
                                        HStack {
                                            Text(Format.shortDay(e.0)).font(.caption.monospacedDigit()).foregroundStyle(.secondary).frame(width: 44, alignment: .leading)
                                            Text(e.1.label).font(.footnote).lineLimit(2)
                                            Spacer()
                                            Text(signedYen(e.1.amount)).font(.footnote.weight(.semibold)).monospacedDigit().foregroundStyle(e.1.amount >= 0 ? .green : .primary)
                                        }
                                    }
                                }
                            }
                        }
                        .cardSurface()
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text("この口座の動き").font(.title3.bold())
                        if m.related.isEmpty {
                            Text("この口座で払った支出・入金はまだありません。").font(.footnote).foregroundStyle(.secondary).padding(.vertical, 8)
                        }
                        VStack(spacing: 0) {
                            ForEach(Array(m.related.prefix(40).enumerated()), id: \.element.id) { i, a in
                                if i > 0 { Divider().padding(.leading, 16) }
                                activityRow(a, doc: doc)
                            }
                        }
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
                .padding(16)
                .padding(.bottom, 90)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle(b.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItemGroup(placement: .topBarTrailing) {
                    FavoriteButton(key: "bank:\(bankId)")
                    Button("編集") { editing = true }
                }
            }
            .sheet(isPresented: $editing) { NavigationStack { BankEditor(bankId: bankId) } }
        } else {
            ContentUnavailableView("口座が見つかりません", systemImage: "building.columns")
        }
    }

    @ViewBuilder private func activityRow(_ a: BankActivity, doc: MoneyDocument) -> some View {
        let row = HStack(spacing: 12) {
            Image(systemName: a.amount >= 0 ? "arrow.down.circle.fill" : "arrow.up.circle.fill")
                .font(.title3).foregroundStyle(a.amount >= 0 ? .green : .orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(a.label.isEmpty ? a.sub : a.label).font(.subheadline).lineLimit(2)
                Text("\(Format.shortDay(a.date))・\(a.sub)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(signedYen(a.amount)).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(a.amount >= 0 ? .green : .primary)
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .contentShape(Rectangle())
        if a.amount < 0, let t = doc.transactions.first(where: { $0.id == a.refId }) {
            NavigationLink { TransactionEditor(draft: t, isNew: false) } label: { row }.buttonStyle(CardPressStyle()).transactionActions(t)
        } else {
            row
        }
    }
}

// MARK: - 残高履歴（Web 版 mm3OpenAssetHistory）

struct AssetHistoryView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let list = model.doc.assetHistoryList(limit: 120)
        List {
            if list.isEmpty { ContentUnavailableView("残高履歴はまだありません", systemImage: "clock", description: Text("銀行残高を更新すると、ここに残ります。")) }
            ForEach(Array(list.enumerated()), id: \.offset) { _, s in
                LabeledContent {
                    Text(s.value.yen).monospacedDigit()
                } label: {
                    Text(s.bankName)
                    Text("\(s.date.isEmpty ? "" : Format.dayLabel(s.date))・\(s.memo)").font(.caption)
                }
            }
        }
        .navigationTitle("残高履歴")
    }
}
