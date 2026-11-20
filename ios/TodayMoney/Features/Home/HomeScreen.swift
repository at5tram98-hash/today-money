import SwiftUI
import Charts
import TodayMoneyCore

/// ホーム（Web 版 home-v14：支出（今日／今月）・総資産・今月の給与・資金見通し・次の支払い・ハイライト・最近の動き・今月の比較・大型支出）
struct HomeScreen: View {
    @Environment(AppModel.self) private var model
    @AppStorage("homePeriod") private var period = "today"
    @State private var date = Dates.ymd()
    @State private var goalTarget: GoalTarget?
    enum GoalTarget: String, Identifiable { case day, month; var id: String { rawValue } }
    @State private var searching = false
    /// ナビゲーションバーのメニューから開く画面
    @State private var tool: HomeTool?
    /// 画面の行き先（リンクで開いた時に、いったん最初の画面に戻してから開く）
    @State private var path = NavigationPath()

    var body: some View {
        let doc = model.doc, today = model.today, month = model.thisMonth
        NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 14) {
                    spendCard(doc, today: today)
                    HomeSectionTitle(title: "お金の状態")
                    assetsCard(doc)
                    salaryCard(doc, today: today, month: month)
                    acfCard(doc)
                    HomeSectionTitle(title: "これからの支払い")
                    paymentsCard(doc, today: today)
                    if DayClosing.inRange(date, today: today) { dayCloseCard(doc, today: today) }
                    HomeSectionTitle(title: "記録")
                    recentCard(doc, today: today)
                    HStack(spacing: 12) {
                        smallCard("今月の比較", "arrow.left.arrow.right", .indigo) { MonthCompareView(month: month) } content: { compareContent(doc, month: month) }
                        smallCard("大型支出", "cart.fill", .pink) { LargeExpensesView() } content: { largeContent(doc) }
                    }
                    .fixedSize(horizontal: false, vertical: true)
                    smallCard("旅行・プレゼントの目標", "gift.fill", .purple) { EventGoalsView() } content: { goalsContent(doc, today: today) }
                    HomeSectionTitle(title: "ハイライト")
                    highlights(doc, month: month)
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 110)
            }
            .background(Color(.systemGroupedBackground))
            .entryButton()
            .navigationTitle("ホーム")
            .toolbar { homeToolbar(doc, today: today) }
            .navigationDestination(item: $tool) { t in t.view(month: month) }
            .navigationDestination(isPresented: $searching) { GlobalSearchView() }
            .navigationDestination(item: Binding(get: { model.route }, set: { model.route = $0 })) { r in
                switch r {
                case .acf, .acfIndex: AcfCenterLauncher(tab: .overview)
                case .acfSettings: AcfSettingsView()
                case .cashflow, .timeline: AcfCenterLauncher(tab: .events)
                case .dayClose: DayClosingView(date: model.today)
                case .goalMonth: GoalPlannerView(type: .monthly, key: model.thisMonth)
                case .goalDay: GoalPlannerView(type: .daily, key: model.today)
                case .analysis: ReasonAnalysisView(kind: "expense", month: model.thisMonth)
                case .goals: EventGoalsView()
                case .review: MonthReviewView(month: model.thisMonth)
                case .mail: MailCenterView()
                }
            }
            .sheet(item: $goalTarget) { g in NavigationStack { GoalPlannerView(type: g == .day ? .daily : .monthly, key: g == .day ? date : String(date.prefix(7))) } }
            .onChange(of: model.today) { _, t in date = t }
            .onChange(of: model.searchRequested) { _, v in if v { model.searchRequested = false; path = NavigationPath(); searching = true } }
            .onChange(of: model.route) { _, r in if r != nil && !path.isEmpty { let keep = r; path = NavigationPath(); model.route = nil; DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { model.route = keep } } }
        }
    }

    // MARK: ナビゲーションバー（左：記録・整理・分析のメニュー、右：目標・ACFセンター・検索）

    @ToolbarContentBuilder private func homeToolbar(_ doc: MoneyDocument, today: String) -> some ToolbarContent {
        ToolbarItem(placement: .topBarLeading) {
            Menu {
                Section("記録") {
                    Button { tool = .quickLine } label: { Label("一行入力", systemImage: "text.line.first.and.arrowtriangle.forward") }
                    Button { tool = .bulkUpdate } label: { Label("金額をまとめて更新", systemImage: "square.and.pencil") }
                    Button { tool = .tempIncome } label: { Label("臨時収入", systemImage: "yensign.circle") }
                    Button { tool = .mail } label: { Label(doc.pendingMailIds.isEmpty ? "メール取引センター" : "メール取引センター（\(doc.pendingMailIds.count)）", systemImage: "envelope") }
                }
                Section("整理") {
                    Button { tool = .transactions } label: { Label("すべての取引", systemImage: "list.bullet") }
                    Button { tool = .favorites } label: { Label("お気に入り", systemImage: "star") }
                    Button { tool = .tags } label: { Label("タグ", systemImage: "tag") }
                }
                Section("分析と計画") {
                    Button { tool = .reasonExpense } label: { Label("理由が分かる分析", systemImage: "chart.bar.xaxis") }
                    Button { tool = .reasonSalary } label: { Label("給与分析", systemImage: "yensign.circle") }
                    Button { tool = .rebalance } label: { Label("予算を立て直す", systemImage: "target") }
                    Button { tool = .eventGoals } label: { Label("旅行・プレゼント目標", systemImage: "gift") }
                    Button { tool = .review } label: { Label("月締めレビュー", systemImage: "checkmark.seal") }
                    Button { tool = .allocation } label: { Label("給料日の振り分け", systemImage: "square.split.2x2") }
                }
            } label: { Image(systemName: "square.grid.2x2") }
            .accessibilityLabel("記録・整理・分析のメニュー")
        }
        ToolbarItemGroup(placement: .topBarTrailing) {
            Menu {
                Button { goalTarget = .day } label: { Label(doc.dailyGoal(date) > 0 ? "\(date == today ? "今日" : Format.shortDay(date))の目標を変更" : "\(date == today ? "今日" : Format.shortDay(date))の目標をつくる", systemImage: "sun.max") }
                Button { goalTarget = .month } label: { Label(doc.monthlyGoalTotal(String(date.prefix(7))) > 0 ? "今月の目標を変更" : "今月の目標をつくる", systemImage: "calendar") }
            } label: { Image(systemName: "target") }
            .accessibilityLabel("目標")
            let unread = NoticesView.visible(doc, today: today).filter { $0["read"]?.boolValue != true }.count
            Button { tool = .notices } label: {
                Image(systemName: unread > 0 ? "bell.badge" : "bell")
                    .symbolRenderingMode(unread > 0 ? .palette : .monochrome)
                    .foregroundStyle(unread > 0 ? Color.red : Color.primary, Color.primary)
                    .symbolEffect(.bounce, value: unread)
            }
            .accessibilityLabel(unread > 0 ? "システムのお知らせ（未読 \(unread)件）" : "システムのお知らせ")
            Button { searching = true } label: { Image(systemName: "magnifyingglass") }.accessibilityLabel("検索")
        }
    }

    // MARK: 支出（いちばん上。期間の切り替えを持つ。目標と入力はナビゲーションバー・＋から）

    @ViewBuilder private func spendCard(_ doc: MoneyDocument, today: String) -> some View {
        let isToday = period == "today"
        let m = String(date.prefix(7))
        let spent = isToday ? doc.spent(on: date) : doc.spentMonth(m)
        let goal = isToday ? doc.dailyGoal(date) : doc.monthlyGoalTotal(m)
        VStack(alignment: .leading, spacing: 14) {
            // 操作の段（ここは押せる部品だけ）
            HStack {
                Picker("期間", selection: $period) { Text("今日").tag("today"); Text("今月").tag("month") }
                    .pickerStyle(.segmented).frame(width: 140)
                Spacer()
                if isToday {
                    Menu {
                        Button("今日") { date = today }
                        ForEach(1..<8, id: \.self) { i in let d = Dates.addDays(today, -i); Button(Format.dayLabel(d)) { date = d } }
                    } label: {
                        HStack(spacing: 4) { Image(systemName: "calendar"); Text(date == today ? "今日" : Format.shortDay(date)); Image(systemName: "chevron.down").font(.caption2.weight(.bold)) }
                            .font(.subheadline.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 7)
                            .background(Color.accentColor.opacity(0.14), in: Capsule()).foregroundStyle(Color.accentColor)
                    }
                    .accessibilityLabel("日付を選ぶ（\(Format.dayLabel(date))）")
                }
            }
            // 数字の段（押すと明細へ）
            NavigationLink {
                if isToday { DaySpendingView(date: date) } else { MonthSpendingView(month: m) }
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        let when = isToday ? (date == today ? "今日" : Format.dayLabel(date)) : Format.monthLabel(m)
                        Text(goal > 0 && spent <= goal ? "\(when)あと使える額" : "\(when)の支出")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(Theme.spending)
                        Spacer()
                        Image(systemName: "chevron.right").font(.subheadline.weight(.bold)).foregroundStyle(.tertiary)
                    }
                    if goal > 0 {
                        Text((spent > goal ? spent : goal - spent).yen).moneyFont(40, weight: .bold).monospacedDigit()
                            .foregroundStyle(spent > goal ? .red : .primary).contentTransition(.numericText())
                        Text(spent > goal ? "目標を \((spent - goal).yen) 超えています（使った額 \(spent.yen)）" : "目標 \(goal.yen)・使った額 \(spent.yen)")
                            .font(.footnote).foregroundStyle(spent > goal ? .red : .secondary)
                        ProgressView(value: min(1, spent / max(goal, 1))).tint(spent > goal ? .red : Theme.spending)
                    } else {
                        Text(spent.yen).moneyFont(40, weight: .bold).monospacedDigit()
                        Text(spent > 0 ? "使った額・目標は未設定" : "まだ使っていません・目標は未設定").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(CardPressStyle())
            .accessibilityHint("明細を見る")
        }
        .cardSurface()
    }

    // MARK: お金の状態

    private func assetsCard(_ doc: MoneyDocument) -> some View {
        let banks = doc.banks.filter { $0.balance > 0 }
        return TapCard(title: "総資産", systemImage: "building.columns.fill", tint: Theme.assets) { AssetsView() } content: {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    MoneyText(value: doc.totalBankBalance)
                    let upd = doc.banks.compactMap { ISODate.ms($0.updatedAt) }.max()
                    Text(upd.map { "更新 " + Date(timeIntervalSince1970: $0 / 1000).formatted(.dateTime.month(.defaultDigits).day().hour().minute()) } ?? "口座 \(doc.banks.count)件の合計")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Spacer()
                if banks.count > 1 {
                    Chart(banks) { b in SectorMark(angle: .value("残高", b.balance), innerRadius: .ratio(0.62), angularInset: 1.5).foregroundStyle(by: .value("口座", b.name)) }
                        .chartLegend(.hidden).frame(width: 56, height: 56).accessibilityHidden(true)
                }
            }
        }
    }

    private func salaryCard(_ doc: MoneyDocument, today: String, month: String) -> some View {
        let s = doc.salarySummary(month, today: today)
        let next = doc.nextSalaryEvent(month, today: today)
        return TapCard(title: "今月の給与", systemImage: "briefcase.fill", tint: Theme.salary) { SalaryMonthView(month: month) } content: {
            VStack(alignment: .leading, spacing: 4) {
                MoneyText(value: s.total)
                Text(next.map { "次の給料日 \(Format.shortDay($0.date))・\($0.name) \($0.amount.yen)" } ?? "今月の受取見込み")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder private func acfCard(_ doc: MoneyDocument) -> some View {
        let s = doc.acfStoredSettings
        ActionCard(title: "ACFセンター", systemImage: "chart.line.uptrend.xyaxis", tint: Theme.acf, accessibilityHint: "ACFセンターを開く") {
            model.openAcf(.overview)
        } content: {
            if !s.initialized {
                VStack(alignment: .leading, spacing: 4) {
                    Text("未設定").font(.title2.bold())
                    Text("押して、最低残したい金額を決めると、ACF指標を計算します").font(.footnote).foregroundStyle(.secondary)
                }
            } else {
                AcfLoader(lightweight: true) { f in
                    let x = model.doc.acfIndex(f, today: model.today)
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(x.text).moneyFont(34, weight: .bold).foregroundStyle(x.color).monospacedDigit()
                            Text(x.label).font(.subheadline.weight(.semibold)).foregroundStyle(x.color)
                            if s.c100Mode { Text("C100").font(.caption2.weight(.bold)).padding(.horizontal, 6).padding(.vertical, 2).background(.purple.opacity(0.18), in: Capsule()).foregroundStyle(.purple) }
                            Spacer()
                            Text("\(Format.shortDay(x.end)) まで").font(.footnote).foregroundStyle(.secondary)
                        }
                        AcfCompareBars(x: x)
                        Text("\(x.surplus >= 0 ? "余る見込み ＋" : "足りない見込み −")\(abs(x.surplus).yen)").font(.footnote.weight(.semibold)).foregroundStyle(x.surplus >= 0 ? .green : .red)
                    }
                }
            }
        }
    }

    // MARK: これからの支払い

    private func paymentsCard(_ doc: MoneyDocument, today: String) -> some View {
        let events = doc.financialEvents(from: today, days: 30, today: today).filter { $0.amount < 0 }
        let total = events.reduce(0) { $0 - $1.amount }
        return Button { model.tab = .payments } label: {
            VStack(alignment: .leading, spacing: 12) {
                CardHeader(title: "次の支払い", systemImage: "calendar", tint: .purple, showsChevron: true, trailing: AnyView(Text("支払いタブへ").font(.footnote).foregroundStyle(.secondary)))
                HStack(alignment: .firstTextBaseline) {
                    Text(total.yen).moneyFont(30, weight: .bold).monospacedDigit()
                    Text("30日以内・\(events.count)件").font(.footnote).foregroundStyle(.secondary)
                }
                if events.isEmpty { Text("30日以内の支払い予定はありません").font(.footnote).foregroundStyle(.secondary) }
                VStack(spacing: 0) {
                    ForEach(Array(events.prefix(4).enumerated()), id: \.offset) { i, e in
                        if i > 0 { Divider().padding(.leading, 46) }
                        HStack(spacing: 12) {
                            VStack(spacing: 0) {
                                Text("\(Dates.parts(e.date).d)").font(.headline).monospacedDigit()
                                Text("\(Dates.parts(e.date).m)月").font(.caption2).foregroundStyle(.secondary)
                            }.frame(width: 34)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title).font(.subheadline).lineLimit(2)
                                Text("\(daysUntilText(e.date, today: today))・\(e.detail)").font(.caption).foregroundStyle(.secondary).lineLimit(2)
                            }
                            Spacer()
                            Text((-e.amount).yen).font(.subheadline.weight(.semibold)).monospacedDigit()
                        }
                        .padding(.vertical, 8)
                    }
                }
            }
            .cardSurface()
        }
        .buttonStyle(CardPressStyle())
        .accessibilityHint("支払いタブを開く")
    }

    private func dayCloseCard(_ doc: MoneyDocument, today: String) -> some View {
        let status = doc.dayClosingStatus(date, today: today)
        let available = DayClosing.available(date)
        let copy = !available ? "18:00以降に照合・承認できます" : [
            .open: "収入・取引・残高を順番に照合します", .closed: "承認済・日締めジャーナルに保存しています",
            .changed: "再確認が必要・承認後に記録が変わりました", .cancelled: "取消済・再照合して承認できます",
        ][status] ?? ""
        let tint: Color = status == .closed ? .green : status == .changed ? .orange : .indigo
        return TapCard(title: "日締め", systemImage: status == .closed ? "checkmark.seal.fill" : "moon.stars.fill", tint: tint) { DayClosingView(date: date) } content: {
            HStack {
                Text(copy).font(.subheadline).foregroundStyle(.secondary)
                Spacer()
                if available && status != .closed { Text("始める").font(.subheadline.weight(.semibold)).foregroundStyle(tint) }
            }
        }
    }

    // MARK: 記録

    @ViewBuilder private func recentCard(_ doc: MoneyDocument, today: String) -> some View {
        let recent = Array(doc.transactions.sorted { ($0.date, $0.createdAt) > ($1.date, $1.createdAt) }.prefix(4))
        let isToday = period == "today"
        let txs = isToday ? doc.transactions(on: date) : doc.transactions(inMonth: String(date.prefix(7)))
        let cats = doc.categories.map { c in (c, txs.filter { $0.category == c.name }.reduce(0) { $0 + $1.amount }) }.filter { $0.1 > 0 }
        VStack(alignment: .leading, spacing: 12) {
            CardHeader(title: "最近の動き", systemImage: "clock.arrow.circlepath", tint: .blue, showsChevron: false)
            if !cats.isEmpty {
                Chart(cats, id: \.0.id) { c, v in BarMark(x: .value("額", v)).foregroundStyle(Color(hex: c.color)) }
                    .chartXAxis(.hidden).frame(height: 12).clipShape(Capsule()).accessibilityHidden(true)
                HStack(spacing: 10) {
                    ForEach(cats.prefix(4), id: \.0.id) { c, v in
                        HStack(spacing: 4) { Circle().fill(Color(hex: c.color)).frame(width: 7, height: 7); Text("\(c.name) \(v.yen)").font(.caption).foregroundStyle(.secondary) }
                    }
                }
            }
            if recent.isEmpty { Text("まだ記録がありません").font(.footnote).foregroundStyle(.secondary) }
            VStack(spacing: 0) {
                ForEach(Array(recent.enumerated()), id: \.offset) { i, t in
                    if i > 0 { Divider().padding(.leading, 42) }
                    NavigationLink { TransactionEditor(draft: t, isNew: false) } label: {
                        HStack { TransactionRow(t: t, showDate: true); Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary) }
                            .padding(.vertical, 8).contentShape(Rectangle())
                    }
                    .buttonStyle(CardPressStyle())
                }
            }
            PillLink(title: "すべての取引", systemImage: "list.bullet") { TransactionListView() }
        }
        .cardSurface()
    }

    private func smallCard<D: View, C: View>(_ title: String, _ icon: String, _ tint: Color, @ViewBuilder destination: @escaping () -> D, @ViewBuilder content: () -> C) -> some View {
        TapCard(title: title, systemImage: icon, tint: tint, destination: destination) { content() }
    }
    @ViewBuilder private func compareContent(_ doc: MoneyDocument, month: String) -> some View {
        let p = doc.monthPace(month, today: model.today), diff = p.currentToDay - p.previousToDay
        VStack(alignment: .leading, spacing: 2) {
            Text(signedYen(diff).replacingOccurrences(of: "-", with: "−")).font(.title3.bold()).foregroundStyle(diff <= 0 ? .green : .red).monospacedDigit()
            Text("先月の同じ日より").font(.caption).foregroundStyle(.secondary)
        }
    }
    @ViewBuilder private func largeContent(_ doc: MoneyDocument) -> some View {
        let planned = doc.largeExpensePlans.filter { $0.status == "planned" }.sorted { $0.date < $1.date }
        let overdue = planned.filter { !$0.date.isEmpty && $0.date < model.today }.count
        let next = planned.first { $0.date >= model.today }
        VStack(alignment: .leading, spacing: 2) {
            Text("\(planned.count)件").font(.title3.bold())
            Text(overdue > 0 ? "予定日を過ぎた\(overdue)件" : next.map { "次は \(Format.shortDay($0.date))" } ?? "予定なし")
                .font(.caption).foregroundStyle(overdue > 0 ? .orange : .secondary)
        }
    }
    @ViewBuilder private func goalsContent(_ doc: MoneyDocument, today: String) -> some View {
        let goals = doc.eventGoals.filter { $0.status != "cancelled" }
        let own = goals.reduce(0) { $0 + doc.eventGoalSummary($1, today: today).ownShare }
        Text(goals.isEmpty ? "割り勘・立替・回収までまとめて管理" : "\(goals.count)件・自分の負担予定 \(own.yen)")
            .font(goals.isEmpty ? .footnote : .headline).foregroundStyle(goals.isEmpty ? .secondary : .primary)
    }

    // MARK: ハイライト（押せない情報：枠なし・›なし）

    @ViewBuilder private func highlights(_ doc: MoneyDocument, month: String) -> some View {
        let list = doc.highlights(today: model.today)
        if list.isEmpty {
            Text("支出や給与を記録すると、先月との比べ方がここに出ます。").font(.footnote).foregroundStyle(.secondary).frame(maxWidth: .infinity, alignment: .leading).cardSurface()
        }
        ForEach(list) { h in
            NavigationLink { highlightDestination(h, month: month) } label: { HighlightCard(h: h) }
                .buttonStyle(CardPressStyle())
        }
    }

    @ViewBuilder private func highlightDestination(_ h: Highlight, month: String) -> some View {
        switch h.key {
        case "category": CategoryDetailView(name: h.category, month: month)
        case "balance": SalaryMonthView(month: month)
        default: MonthSpendingView(month: month)
        }
    }
}

/// ハイライトの1枚（ヘルスケアのハイライトのように：色のついた見出し・短い文・2本の棒）
struct HighlightCard: View {
    let h: Highlight
    private var tint: Color { ["pace": .orange, "average": .blue, "category": .purple, "balance": .green][h.key] ?? .accentColor }
    private var symbol: String { ["pace": "cart.fill", "average": "chart.bar.fill", "category": "square.grid.2x2.fill", "balance": "wallet.bifold.fill"][h.key] ?? "sparkles" }

    var body: some View {
        let maxV = max(1, h.bars.map { abs($0.value) }.max() ?? 1)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Image(systemName: symbol)
                Text(h.label)
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
            .font(.subheadline.weight(.semibold)).foregroundStyle(tint)
            Text(h.text).font(.title3.weight(.semibold)).foregroundStyle(.primary).fixedSize(horizontal: false, vertical: true)
            Divider()
            VStack(alignment: .leading, spacing: 10) {
                ForEach(Array(h.bars.enumerated()), id: \.offset) { i, b in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack(alignment: .firstTextBaseline, spacing: 2) {
                            Text(b.value.yen).font(.title2.weight(.bold)).monospacedDigit().foregroundStyle(i == 0 ? .primary : .secondary)
                            if !b.unit.isEmpty { Text(b.unit).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary) }
                        }
                        GeometryReader { g in
                            let w = max(64, g.size.width * abs(b.value) / maxV)
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 6, style: .continuous)
                                    .fill(i == 0 ? AnyShapeStyle(tint.gradient) : AnyShapeStyle(Color(.systemGray4)))
                                    .frame(width: w)
                                Text(b.label).font(.caption.weight(.semibold)).foregroundStyle(i == 0 ? .white : .primary).lineLimit(1)
                                    .padding(.horizontal, 8).frame(width: w, alignment: .leading)
                            }
                        }
                        .frame(height: 26)
                    }
                }
            }
        }
        .cardSurface()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(h.label)。\(h.text)。" + h.bars.map { "\($0.label) \($0.value.yen)\($0.unit)" }.joined(separator: "、"))
        .accessibilityHint("詳しく見る")
    }
}

extension View {
    func cardStyle() -> some View { cardSurface() }
}

/// 月の支出・月間詳細分析（Web 版 renderMonth・openMonthAnalysis：使った額・目標・日別・計画と実績・3か月推移・カテゴリの割合・高額支出 TOP5・急に増えたカテゴリ）
struct MonthSpendingView: View {
    @Environment(AppModel.self) private var model
    @State var month: String
    @State private var pickedDay: Int?

    var body: some View {
        let doc = model.doc, today = model.today
        let a = doc.monthAnalysis(month, today: today)
        let txs = doc.transactions(inMonth: month)
        let goal = a.plan, spent = a.actual
        let days = Dates.daysInMonth(month)
        let daily = (1...days).map { d -> (day: Int, value: Double, goal: Double) in (d, doc.spent(on: "\(month)-\(pad(d))"), doc.dayGoalForMonth(month, day: d)) }
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                MonthSwitcher(month: $month, thisMonth: model.thisMonth)

                // 使った額と目標
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(Format.monthLabel(month))に使った金額").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                    MoneyText(value: spent, size: 44, weight: .heavy)
                    if let c = a.change, a.months[1].value > 0 {
                        Label("先月より \(signedYen(spent - a.months[1].value))（\(c >= 0 ? "+" : "")\(c)%）", systemImage: c > 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(.subheadline.weight(.semibold)).foregroundStyle(c > 0 ? .red : .green)
                    }
                    if goal > 0 {
                        ProgressView(value: min(1, spent / goal)).tint(spent > goal ? .red : .orange)
                        Text(spent > goal ? "目標 \(goal.yen) を \((spent - goal).yen) 超えています" : "目標 \(goal.yen)・あと \((goal - spent).yen)")
                            .font(.footnote).foregroundStyle(spent > goal ? .red : .secondary)
                    }
                    // 日別（目標の線つき・なぞると日付と金額）
                    VStack(alignment: .leading, spacing: 4) {
                        if let d = pickedDay, let row = daily.first(where: { $0.day == d }) {
                            Text("\(Format.dayLabel("\(month)-\(pad(d))"))  \(row.value.yen)\(row.goal > 0 ? "（目標 \(row.goal.yen)）" : "")").font(.footnote.weight(.semibold)).monospacedDigit()
                        } else {
                            Text("日別の支出・なぞると金額が出ます").font(.footnote).foregroundStyle(.secondary)
                        }
                        Chart {
                            ForEach(daily, id: \.day) { r in
                                BarMark(x: .value("日", r.day), y: .value("支出", r.value))
                                    .foregroundStyle(r.goal > 0 && r.value > r.goal ? Color.red.gradient : (pickedDay == r.day ? Color.orange.gradient : Color.orange.opacity(0.65).gradient))
                                    .cornerRadius(2)
                                if r.goal > 0 {
                                    LineMark(x: .value("日", r.day), y: .value("目標", r.goal)).foregroundStyle(.secondary).lineStyle(StrokeStyle(lineWidth: 1, dash: [2, 3]))
                                }
                            }
                        }
                        .chartXScale(domain: 0.5...(Double(days) + 0.5))
                        .chartXAxis { AxisMarks(values: [1, 10, 20, days]) { v in AxisValueLabel { if let n = v.as(Int.self) { Text("\(n)日") } } } }
                        .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
                        .chartXSelection(value: Binding(get: { pickedDay }, set: { v in if v != pickedDay { pickedDay = v; if v != nil { Feedback.selection() } } }))
                        .frame(height: 150)
                    }
                    .padding(.top, 4)
                }
                .cardSurface()

                // 計画と実績
                VStack(alignment: .leading, spacing: 10) {
                    CardHeader(title: "計画と実績", systemImage: "target", tint: .orange)
                    HStack(spacing: 8) {
                        StatTile(title: "計画", value: a.plan > 0 ? a.plan.yen : "未設定", tint: a.plan > 0 ? .primary : .secondary)
                        StatTile(title: "実績", value: a.actual.yen)
                    }
                    HStack(spacing: 8) {
                        StatTile(title: "今日までの想定", value: a.expected > 0 ? a.expected.yen : "—")
                        StatTile(title: "差", value: a.expected > 0 ? signedYen(a.variance) : "—", tint: a.variance > 0 ? .red : a.variance < 0 ? .green : .primary)
                    }
                    if a.expected > 0 {
                        Text(a.variance > 0 ? "日別の計画より \(a.variance.yen) 多く使っています。" : "日別の計画の範囲に収まっています。").font(.footnote).foregroundStyle(a.variance > 0 ? .red : .secondary)
                    } else if a.plan == 0 {
                        NavigationLink { GoalPlannerView(type: .monthly, key: month) } label: { Label("月間目標をつくる", systemImage: "plus.circle").font(.subheadline.weight(.semibold)) }
                    }
                }
                .cardSurface()

                // 過去3か月
                VStack(alignment: .leading, spacing: 10) {
                    CardHeader(title: "過去3か月の支出", systemImage: "chart.bar.fill", tint: .blue)
                    Text("前月比 \(a.change.map { "\($0 >= 0 ? "+" : "")\($0)%" } ?? "—")・前年同月比 \(a.yoy.map { "\($0 >= 0 ? "+" : "")\($0)%" } ?? "—")")
                        .font(.footnote).foregroundStyle(.secondary)
                    Chart(a.months) { p in
                        BarMark(x: .value("月", "\(Dates.parts(p.date).m)月"), y: .value("支出", p.value))
                            .foregroundStyle(p.date.hasPrefix(month) ? Color.blue.gradient : Color.blue.opacity(0.35).gradient).cornerRadius(6)
                            .annotation(position: .top) { Text(compactYen(p.value)).font(.caption2.weight(.semibold)).foregroundStyle(.secondary) }
                    }
                    .chartYAxis(.hidden)
                    .frame(height: 140)
                }
                .cardSurface()

                // カテゴリ
                categoryCard(a, txs: txs)

                topFive(a, doc: doc)

                surgingCard(a)

                LinkGroup {
                    LinkRow(title: "取引をすべて見る", sub: "\(txs.count)件・検索とカテゴリで絞り込み", symbol: "list.bullet", tint: .blue) { TransactionListView(title: "\(Format.monthLabel(month))の取引", month: month) }
                    LinkRow(title: "カレンダーで見る", sub: "日ごとの支出と目標", symbol: "calendar", tint: .red) { MonthCalendarView(month: month) }
                    LinkRow(title: "月次比較", sub: "カテゴリごとの増減", symbol: "arrow.left.arrow.right", tint: .indigo) { MonthCompareView(month: month) }
                    LinkRow(title: "理由が分かる分析", sub: "カテゴリ・店舗・曜日・支払い方法", symbol: "magnifyingglass", tint: .purple) { ReasonAnalysisView(kind: "expense", month: month) }
                    LinkRow(title: "実質支出を確認・修正", sub: "記録と実際の差を直す", symbol: "slider.horizontal.3", tint: .gray) { CorrectionView(key: month) }
                }
            }
            .padding(16)
            .padding(.bottom, 90)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("月間詳細分析")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func pad(_ d: Int) -> String { d < 10 ? "0\(d)" : "\(d)" }

    @ViewBuilder private func topFive(_ a: MonthAnalysis, doc: MoneyDocument) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("高額支出 TOP5").font(.title3.bold())
            VStack(spacing: 0) {
                if a.top.isEmpty { Text("支出がありません。").font(.footnote).foregroundStyle(.secondary).padding() }
                ForEach(Array(a.top.enumerated()), id: \.element.id) { i, t in
                    if i > 0 { Divider().padding(.leading, 56) }
                    NavigationLink { TransactionEditor(draft: t, isNew: false) } label: {
                        HStack(spacing: 12) {
                            rank(i, t, doc: doc)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.merchant.isEmpty ? t.category : t.merchant).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(2)
                                Text("\(t.category)・\(Format.shortDay(t.date))").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(t.amount.yen).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(.primary)
                            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10).contentShape(Rectangle())
                    }
                    .buttonStyle(CardPressStyle())
                    .transactionActions(t)
                }
            }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }

    }

    private func rank(_ i: Int, _ t: Transaction, doc: MoneyDocument) -> some View {
        let color = Color(hex: doc.category(named: t.category).color)
        return Text("\(i + 1)").font(.headline.monospacedDigit()).foregroundStyle(.white)
            .frame(width: 28, height: 28).background(color.gradient, in: Circle())
    }

    @ViewBuilder private func surgingCard(_ a: MonthAnalysis) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("急に増えたカテゴリ").font(.title3.bold())
            VStack(spacing: 0) {
                if a.surging.isEmpty {
                    Label("先月より大きく増えたカテゴリはありません", systemImage: "checkmark.circle.fill").font(.subheadline).foregroundStyle(.green).padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                ForEach(Array(a.surging.enumerated()), id: \.element.id) { i, c in
                    if i > 0 { Divider().padding(.leading, 56) }
                    NavigationLink { TransactionListView(title: "\(c.name)・\(Format.monthLabel(month))", month: month, initialCategory: c.name) } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "exclamationmark").font(.subheadline.weight(.bold)).foregroundStyle(.white).frame(width: 28, height: 28).background(Color.orange.gradient, in: Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(c.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                                Text("先月より \(Int(((c.value - c.prev) / c.prev * 100).rounded()))% 増加（先月 \(c.prev.yen)）").font(.caption).foregroundStyle(.orange)
                            }
                            Spacer()
                            Text(c.value.yen).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(.primary)
                            Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 10).contentShape(Rectangle())
                    }
                    .buttonStyle(CardPressStyle())
                }
            }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }

    }


    private func categoryCard(_ a: MonthAnalysis, txs: [Transaction]) -> some View {
        let rows = a.categories.filter { $0.value > 0 }
        let total = max(1, rows.reduce(0) { $0 + $1.value })
        return VStack(alignment: .leading, spacing: 12) {
            CardHeader(title: "カテゴリ別", systemImage: "chart.pie.fill", tint: .purple)
            if rows.isEmpty {
                Text("この月の支出はまだありません。").font(.footnote).foregroundStyle(.secondary)
            } else {
                HStack(spacing: 16) {
                    Chart(rows) { r in
                        SectorMark(angle: .value("金額", r.value), innerRadius: .ratio(0.62), angularInset: 1.5).cornerRadius(3)
                            .foregroundStyle(Color(hex: r.color))
                    }
                    .chartBackground { _ in VStack(spacing: 0) { Text("\(rows.count)").font(.headline); Text("カテゴリ").font(.caption2).foregroundStyle(.secondary) } }
                    .frame(width: 110, height: 110)
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(rows.prefix(5)) { r in
                            HStack(spacing: 6) {
                                Circle().fill(Color(hex: r.color)).frame(width: 8, height: 8)
                                Text(r.name).font(.footnote).lineLimit(2)
                                Spacer(minLength: 4)
                                Text("\(Int((r.value / total * 100).rounded()))%").font(.footnote.weight(.semibold)).monospacedDigit()
                            }
                        }
                    }
                }
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                        if i > 0 { Divider() }
                        NavigationLink { TransactionListView(title: "\(r.name)・\(Format.monthLabel(month))", month: month, initialCategory: r.name) } label: {
                            HStack(spacing: 10) {
                                CategoryIcon(category: model.doc.category(named: r.name), size: 26)
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(r.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                                        Spacer()
                                        Text(r.value.yen).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(.primary)
                                    }
                                    GeometryReader { g in
                                        Capsule().fill(Color(hex: r.color).gradient).frame(width: max(4, g.size.width * r.value / (rows.first?.value ?? 1)))
                                    }
                                    .frame(height: 5)
                                    if r.prev > 0 {
                                        Text("先月 \(r.prev.yen)・\(signedYen(r.value - r.prev))").font(.caption2).foregroundStyle(r.value > r.prev ? .red : .green)
                                    }
                                }
                                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
                            }
                            .padding(.vertical, 8).contentShape(Rectangle())
                        }
                        .buttonStyle(CardPressStyle())
                    }
                }
            }
        }
        .cardSurface()
    }
}

/// 今月と先月の比較（カテゴリごと）
/// ホームのナビゲーションバーのメニューから開く画面（以前は「その他」に並んでいたもの）
enum HomeTool: String, Hashable, Identifiable {
    case notices, quickLine, bulkUpdate, tempIncome, mail, transactions, favorites, tags, reasonExpense, reasonSalary, rebalance, eventGoals, review, allocation
    var id: String { rawValue }
    @ViewBuilder func view(month: String) -> some View {
        switch self {
        case .notices: NoticesView()
        case .quickLine: QuickLineView()
        case .bulkUpdate: FinancialUpdatesView(kind: "banks")
        case .tempIncome: TempIncomeHistoryView()
        case .mail: MailCenterView()
        case .transactions: TransactionListView()
        case .favorites: FavoritesView()
        case .tags: TagsView()
        case .reasonExpense: ReasonAnalysisView(kind: "expense", month: month)
        case .reasonSalary: ReasonAnalysisView(kind: "salary", month: month)
        case .rebalance: BudgetRebalanceView(month: month)
        case .eventGoals: EventGoalsView()
        case .review: MonthReviewView(month: month)
        case .allocation: SalaryAllocationListView()
        }
    }
}

/// 口座の残高（総資産）
#Preview {
    HomeScreen().environment(AppModel.preview())
}
