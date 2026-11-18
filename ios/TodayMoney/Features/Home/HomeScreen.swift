import SwiftUI
import Charts
import TodayMoneyCore

/// ホーム（Web 版 home-v14：支出（今日／今月）・総資産・今月の給与・資金見通し・次の支払い・ハイライト・最近の動き・今月の比較・大型支出）
struct HomeScreen: View {
    @Environment(AppModel.self) private var model
    @AppStorage("homePeriod") private var period = "today"
    @State private var date = Dates.ymd()
    @State private var goalSheet = false
    @State private var searching = false
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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { searching = true } label: { Image(systemName: "magnifyingglass") }.accessibilityLabel("検索")
                }
            }
            .navigationDestination(isPresented: $searching) { GlobalSearchView() }
            .navigationDestination(item: Binding(get: { model.route }, set: { model.route = $0 })) { r in
                switch r {
                case .acf: AcfDetailView()
                case .acfIndex: AcfIndexView()
                case .acfSettings: AcfSettingsView()
                case .cashflow: CashFlowView()
                case .dayClose: DayClosingView(date: model.today)
                case .goalMonth: GoalPlannerView(type: .monthly, key: model.thisMonth)
                case .goalDay: GoalPlannerView(type: .daily, key: model.today)
                case .shifts: CalendarShiftView()
                case .analysis: ReasonAnalysisView(kind: "expense", month: model.thisMonth)
                case .timeline: MoneyTimelineView()
                case .goals: EventGoalsView()
                case .review: MonthReviewView(month: model.thisMonth)
                case .mail: MailCenterView()
                }
            }
            .sheet(isPresented: $goalSheet) { NavigationStack { GoalPlannerView(type: period == "today" ? .daily : .monthly, key: period == "today" ? date : String(date.prefix(7))) } }
            .onChange(of: model.today) { _, t in date = t }
            .onChange(of: model.searchRequested) { _, v in if v { model.searchRequested = false; path = NavigationPath(); searching = true } }
            .onChange(of: model.route) { _, r in if r != nil && !path.isEmpty { let keep = r; path = NavigationPath(); model.route = nil; DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { model.route = keep } } }
        }
    }

    // MARK: 支出（いちばん上。期間の切り替えと目標のボタンを持つ）

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
                if isToday { TransactionListView(title: Format.dayLabel(date), date: date) } else { MonthSpendingView(month: m) }
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
            // ボタンの段
            HStack(spacing: 10) {
                PillButton(title: goal > 0 ? "目標を変更" : "目標をつくる", systemImage: "target", tint: .orange) { goalSheet = true }
                PillButton(title: "支出を入力", systemImage: "plus", tint: .accentColor) { model.entryMode = .expense }
            }
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
        TapCard(title: "ACF", systemImage: "chart.line.uptrend.xyaxis", tint: Theme.acf) {
            if s.initialized { AcfIndexView() } else { AcfSettingsView() }
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
                CardHeader(title: "次の支払い", systemImage: "calendar", tint: .purple, trailing: AnyView(Text("支払いタブへ").font(.footnote).foregroundStyle(.secondary)))
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
                                Text(e.title).font(.subheadline).lineLimit(1)
                                Text("\(daysUntilText(e.date, today: today))・\(e.detail)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
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
        let diff = doc.spentMonth(month) - doc.spentMonth(Dates.addMonths(month, -1))
        VStack(alignment: .leading, spacing: 2) {
            Text(signedYen(diff).replacingOccurrences(of: "-", with: "−")).font(.title3.bold()).foregroundStyle(diff <= 0 ? .green : .red).monospacedDigit()
            Text("先月より").font(.caption).foregroundStyle(.secondary)
        }
    }
    @ViewBuilder private func largeContent(_ doc: MoneyDocument) -> some View {
        let planned = doc.largeExpensePlans.filter { $0.status == "planned" }.sorted { $0.date < $1.date }
        VStack(alignment: .leading, spacing: 2) {
            Text("\(planned.count)件").font(.title3.bold())
            Text(planned.first.map { "次は \(Format.shortDay($0.date))" } ?? "予定なし").font(.caption).foregroundStyle(.secondary)
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
        let prev = Dates.addMonths(month, -1)
        let elapsed = max(1, Dates.parts(model.today).d)
        let avg = doc.spentMonth(month) / Double(elapsed), prevAvg = doc.spentMonth(prev) / Double(Dates.daysInMonth(prev))
        let salary = doc.salarySummary(month, today: model.today).total, spent = doc.spentMonth(month)
        InfoBlock(title: "1日の平均", systemImage: "sparkles", tint: .pink) {
            Text(avg <= prevAvg ? "今月の1日あたりの支出は先月より少なめです。" : "今月の1日あたりの支出は先月より多めです。").font(.subheadline)
            bar(Format.monthLabel(month), avg, max(avg, prevAvg), .pink)
            bar(Format.monthLabel(prev), prevAvg, max(avg, prevAvg), .gray)
        }
        InfoBlock(title: "収入と支出", systemImage: "arrow.up.arrow.down", tint: .green) {
            Text("今月の給与見込みから支出を引くと \((salary - spent).yen) 残ります。").font(.subheadline)
            bar("給与見込み", salary, max(salary, spent), .green)
            bar("支出", spent, max(salary, spent), .orange)
        }
    }
    private func bar(_ label: String, _ v: Double, _ maxV: Double, _ c: Color) -> some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 84, alignment: .leading)
            GeometryReader { g in Capsule().fill(c.gradient).frame(width: max(4, g.size.width * (maxV > 0 ? v / maxV : 0))) }.frame(height: 10)
            Text(v.yen).font(.caption.weight(.semibold)).monospacedDigit().frame(width: 76, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
    }
}

extension View {
    func cardStyle() -> some View { cardSurface() }
}

/// 今月の支出（カテゴリ別・日別・取引）（Web 版 renderMonth）
struct MonthSpendingView: View {
    @Environment(AppModel.self) private var model
    @State var month: String
    var body: some View {
        let doc = model.doc
        let txs = doc.transactions(inMonth: month)
        let goal = doc.monthlyGoalTotal(month), spent = doc.spentMonth(month)
        let daily = (1...Dates.daysInMonth(month)).map { d -> (Int, Double) in (d, doc.spent(on: "\(month)-\(d < 10 ? "0" : "")\(d)")) }
        List {
            Section {
                MonthSwitcher(month: $month, thisMonth: model.thisMonth)
                VStack(alignment: .leading, spacing: 4) {
                    Text("この月に使った金額").font(.subheadline).foregroundStyle(.secondary)
                    MoneyText(value: spent, size: 40, weight: .heavy)
                    if goal > 0 { ProgressView(value: min(1, spent / goal)).tint(spent > goal ? .red : .orange); Text("目標 \(goal.yen)・\(Int(spent / goal * 100))%").font(.footnote).foregroundStyle(.secondary) }
                    LabeledContent("先月", value: doc.spentMonth(Dates.addMonths(month, -1)).yen).font(.footnote)
                }
                Chart(daily, id: \.0) { d, v in BarMark(x: .value("日", d), y: .value("額", v)).foregroundStyle(.orange) }
                    .frame(height: 120)
            }
            Section("カテゴリ別") {
                ForEach(doc.categories) { c in
                    let v = txs.filter { $0.category == c.name }.reduce(0) { $0 + $1.amount }
                    if v != 0 {
                        HStack { CategoryIcon(category: c, size: 26); Text(c.name); Spacer(); Text(v.yen).monospacedDigit() }
                    }
                }
            }
            Section {
                NavigationLink { TransactionListView(title: "\(Format.monthLabel(month))の取引", month: month) } label: { Text("取引をすべて見る（\(txs.count)件）") }
                NavigationLink { MonthCalendarView(month: month) } label: { Label("カレンダーで見る", systemImage: "calendar") }
                NavigationLink { CorrectionView(key: month) } label: { Label("実質支出を確認・修正", systemImage: "slider.horizontal.3") }
            }
            ProMenuSection(month: month)
        }
        .navigationTitle("今月の支出")
    }
}

/// 今月と先月の比較（カテゴリごと）
struct MonthCompareView: View {
    @Environment(AppModel.self) private var model
    var month: String
    var body: some View {
        let doc = model.doc, prev = Dates.addMonths(month, -1)
        List {
            Section {
                LabeledContent(Format.monthLabel(month), value: doc.spentMonth(month).yen)
                LabeledContent(Format.monthLabel(prev), value: doc.spentMonth(prev).yen)
            }
            Section("カテゴリ別の差") {
                ForEach(doc.categories) { c in
                    let a = doc.categorySpent(month: month, category: c.name), b = doc.categorySpent(month: prev, category: c.name)
                    if a != 0 || b != 0 {
                        HStack {
                            CategoryIcon(category: c, size: 26); Text(c.name); Spacer()
                            VStack(alignment: .trailing) {
                                Text(a.yen).monospacedDigit()
                                Text(signedYen(a - b)).font(.caption).foregroundStyle(a - b <= 0 ? .green : .red)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("今月の比較")
    }
}

/// 口座の残高（総資産）
struct AssetsView: View {
    @Environment(AppModel.self) private var model
    @State private var editing: String?
    var body: some View {
        let doc = model.doc
        let snaps = (doc["assetSnapshots"]?.arrayValue ?? []).suffix(120).compactMap { s -> (Date, Double)? in
            guard let ms = ISODate.ms(str(s["createdAt"])) else { return nil }; return (Date(timeIntervalSince1970: ms / 1000), num(s["bankTotal"]))
        }
        List {
            Section {
                MoneyText(value: doc.totalBankBalance, size: 40, weight: .heavy)
                if snaps.count > 1 {
                    Chart(snaps, id: \.0) { d, v in LineMark(x: .value("日時", d), y: .value("合計", v)).interpolationMethod(.stepEnd) }
                        .frame(height: 140)
                }
            }
            Section("口座") {
                ForEach(doc.banks) { b in
                    NavigationLink { BankDetailView(bankId: b.id) } label: {
                        LabeledContent {
                            Text(b.balance.yen).monospacedDigit().foregroundStyle(b.threshold > 0 && b.balance < b.threshold ? .red : .primary)
                        } label: {
                            Text(b.name).foregroundStyle(.primary)
                            if let ms = ISODate.ms(b.balanceAsOf) { Text("残高入力 \(Date(timeIntervalSince1970: ms / 1000).formatted(date: .abbreviated, time: .shortened))").font(.caption) }
                        }
                    }
                }
            }
            Section { NavigationLink { AccountsView() } label: { Label("口座とカードを管理", systemImage: "building.columns") } }
        }
        .navigationTitle("総資産")
        .sheet(item: Binding(get: { editing.map(IdBox.init) }, set: { editing = $0?.id })) { b in NavigationStack { BankEditor(bankId: b.id) } }
    }
}

#Preview {
    HomeScreen().environment(AppModel.preview())
}
