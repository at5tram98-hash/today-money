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
                    spendCard(doc, today: today, month: month)
                    NavigationLink { AssetsView() } label: { assetsCard(doc) }
                    NavigationLink { SalaryMonthView(month: month) } label: { salaryCard(doc, today: today, month: month) }
                    NavigationLink {
                        if doc.acfStoredSettings.initialized { AcfIndexView() } else { AcfSettingsView() }
                    } label: { AcfHomeCard() }
                    paymentsCard(doc, today: today)
                    highlightsCard(doc, month: month)
                    recentCard(doc, today: today)
                    if DayClosing.inRange(date, today: today) {
                        NavigationLink { DayClosingView(date: date) } label: { DayClosingCard(date: date) }
                    }
                    NavigationLink { MonthCompareView(month: month) } label: { compareCard(doc, month: month) }
                    NavigationLink { LargeExpensesView() } label: { largeCard(doc, today: today) }
                    NavigationLink { EventGoalsView() } label: { goalsCard(doc, today: today) }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16)
                .padding(.bottom, 100)
            }
            .background(Color(.systemGroupedBackground))
            .entryButton()
            .navigationTitle("ホーム")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { searching = true } label: { Image(systemName: "magnifyingglass") }.accessibilityLabel("検索")
                }
            }
            .navigationDestination(isPresented: $searching) { TransactionListView(title: "検索") }
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
                }
            }
            .sheet(isPresented: $goalSheet) { NavigationStack { GoalPlannerView(type: period == "today" ? .daily : .monthly, key: period == "today" ? date : String(date.prefix(7))) } }
            .onChange(of: model.today) { _, t in date = t }
            .onChange(of: model.route) { _, r in if r != nil && !path.isEmpty { let keep = r; path = NavigationPath(); model.route = nil; DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { model.route = keep } } }
        }
    }

    // MARK: 支出

    @ViewBuilder private func spendCard(_ doc: MoneyDocument, today: String, month: String) -> some View {
        let isToday = period == "today"
        let spent = isToday ? doc.spent(on: date) : doc.spentMonth(String(date.prefix(7)))
        let goal = isToday ? doc.dailyGoal(date) : doc.monthlyGoalTotal(String(date.prefix(7)))
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("支出", systemImage: "flame.fill").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.spending)
                Spacer()
                Picker("期間", selection: $period) { Text("今日").tag("today"); Text("今月").tag("month") }
                    .pickerStyle(.segmented).frame(width: 130)
            }
            Menu {
                Button("今日") { date = today }
                ForEach(1..<8, id: \.self) { i in let d = Dates.addDays(today, -i); Button(Format.dayLabel(d)) { date = d } }
            } label: {
                HStack(spacing: 4) {
                    Text(isToday ? "\(date == today ? "今日・" : "")\(Format.dayLabel(date))" : Format.monthLabel(String(date.prefix(7))))
                    Image(systemName: "chevron.down").font(.caption2.weight(.bold))
                }.font(.footnote).foregroundStyle(.secondary)
            }
            NavigationLink {
                if isToday { TransactionListView(title: Format.dayLabel(date), date: date) } else { MonthSpendingView(month: String(date.prefix(7))) }
            } label: {
                VStack(alignment: .leading, spacing: 6) {
                    if goal > 0 {
                        MoneyText(value: max(0, goal - spent))
                        Text(spent > goal ? "目標を \((spent - goal).yen) 超えています" : "あと使える額（目標 \(goal.yen)・使った額 \(spent.yen)）")
                            .font(.footnote).foregroundStyle(spent > goal ? .red : .secondary)
                        ProgressView(value: min(1, spent / max(goal, 1))).tint(spent > goal ? .red : Theme.spending)
                    } else {
                        Text(spent > 0 ? spent.yen : "目標未設定").font(.system(size: 30, weight: .bold, design: .rounded)).monospacedDigit()
                        Text(spent > 0 ? (isToday ? "この日に使った額" : "今月使った額") : "まだ使っていません").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            Divider()
            Button { goalSheet = true } label: {
                HStack { Text(goal > 0 ? "目標を変更" : "目標をつくる"); Spacer(); Image(systemName: "chevron.right").font(.footnote) }
                    .foregroundStyle(Color.accentColor)
            }
        }
        .cardStyle()
    }

    private func assetsCard(_ doc: MoneyDocument) -> some View {
        let banks = doc.banks.filter { $0.balance > 0 }
        return SummaryCard(title: "総資産", systemImage: "building.columns.fill", tint: Theme.assets) {
            HStack(alignment: .center) {
                VStack(alignment: .leading, spacing: 4) {
                    MoneyText(value: doc.totalBankBalance)
                    let upd = doc.banks.compactMap { ISODate.ms($0.updatedAt) }.max()
                    Text(upd.map { "更新 " + Date(timeIntervalSince1970: $0 / 1000).formatted(.dateTime.month(.defaultDigits).day().hour().minute()) } ?? "口座 \(doc.banks.count)件の合計")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                Spacer()
                if !banks.isEmpty {
                    Chart(banks) { b in SectorMark(angle: .value("残高", b.balance), innerRadius: .ratio(0.62), angularInset: 1.5).foregroundStyle(by: .value("口座", b.name)) }
                        .chartLegend(.hidden).frame(width: 64, height: 64).accessibilityHidden(true)
                }
            }
        }
    }

    private func salaryCard(_ doc: MoneyDocument, today: String, month: String) -> some View {
        let s = doc.salarySummary(month, today: today)
        let next = doc.nextSalaryEvent(month, today: today)
        let hist = (0..<6).map { i -> (String, Double) in let m = Dates.addMonths(month, i - 5); return (m, doc.salarySummary(m, today: today).total) }
        return SummaryCard(title: "今月の給与", systemImage: "briefcase.fill", tint: Theme.salary) {
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 4) {
                    MoneyText(value: s.total)
                    Text("今月の受取見込み").font(.footnote).foregroundStyle(.secondary)
                }
                Spacer()
                Chart(hist, id: \.0) { m, v in BarMark(x: .value("月", m), y: .value("額", v)).foregroundStyle(m == month ? Theme.salary : Theme.salary.opacity(0.35)) }
                    .chartXAxis(.hidden).chartYAxis(.hidden).frame(width: 90, height: 44).accessibilityHidden(true)
            }
            if let next {
                Divider()
                LabeledContent("次の給料日", value: "\(Format.shortDay(next.date))・\(next.name) \(next.amount.yen)").font(.subheadline)
            }
        }
    }

    private func cashCard(_ doc: MoneyDocument, today: String) -> some View {
        let cf = CashFlowModel(doc: doc, today: today, days: 30)
        return SummaryCard(title: "資金見通し", systemImage: "chart.line.uptrend.xyaxis", tint: Theme.acf) {
            if let short = cf.firstShort {
                Text("\(Format.dayLabel(short.date))に不足の見込み").font(.headline).foregroundStyle(.red)
            } else {
                Text("30日間、残高は足ります").font(.headline)
            }
            Text("30日間の最低残高 \((cf.minDay?.balance ?? 0).yen)\(cf.reserveFloor > 0 ? "・最低残したい額 \(cf.reserveFloor.yen)" : "")")
                .font(.footnote).foregroundStyle(.secondary)
        }
    }

    @ViewBuilder private func paymentsCard(_ doc: MoneyDocument, today: String) -> some View {
        let events = doc.financialEvents(from: today, days: 30, today: today).filter { $0.amount < 0 }
        let total = events.reduce(0) { $0 - $1.amount }
        VStack(alignment: .leading, spacing: 10) {
            Button { model.tab = .payments } label: {
                HStack {
                    Label("次の支払い", systemImage: "calendar").font(.subheadline.weight(.semibold)).foregroundStyle(.purple)
                    Spacer()
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
                }
            }
            HStack(alignment: .firstTextBaseline) {
                Text("30日以内").font(.footnote).foregroundStyle(.secondary)
                Spacer()
                Text(total.yen).font(.title3.weight(.bold)).monospacedDigit()
                Text("\(events.count)件").font(.footnote).foregroundStyle(.secondary)
            }
            if events.isEmpty { Text("30日以内の支払い予定はありません").font(.footnote).foregroundStyle(.secondary) }
            ForEach(events.prefix(4)) { e in
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
                    Text((-e.amount).yen).font(.subheadline).monospacedDigit()
                }
            }
            Button("すべての支払いを見る") { model.tab = .payments }.font(.subheadline)
        }
        .cardStyle()
    }

    @ViewBuilder private func highlightsCard(_ doc: MoneyDocument, month: String) -> some View {
        let prev = Dates.addMonths(month, -1)
        let elapsed = max(1, Dates.parts(model.today).d)
        let avg = doc.spentMonth(month) / Double(elapsed), prevAvg = doc.spentMonth(prev) / Double(Dates.daysInMonth(prev))
        let salary = doc.salarySummary(month, today: model.today).total, spent = doc.spentMonth(month)
        VStack(alignment: .leading, spacing: 12) {
            Label("ハイライト", systemImage: "sparkles").font(.subheadline.weight(.semibold)).foregroundStyle(.pink)
            VStack(alignment: .leading, spacing: 6) {
                Text("1日の平均").font(.headline)
                Text(avg <= prevAvg ? "今月の1日あたりの支出は先月より少なめです。" : "今月の1日あたりの支出は先月より多めです。").font(.footnote).foregroundStyle(.secondary)
                bar(Format.monthLabel(month), avg, max(avg, prevAvg), .pink)
                bar(Format.monthLabel(prev), prevAvg, max(avg, prevAvg), .gray)
            }
            Divider()
            VStack(alignment: .leading, spacing: 6) {
                Text("収入と支出").font(.headline)
                Text("今月の給与見込みから支出を引くと \((salary - spent).yen) 残ります。").font(.footnote).foregroundStyle(.secondary)
                bar("給与見込み", salary, max(salary, spent), .green)
                bar("支出", spent, max(salary, spent), .orange)
            }
        }
        .cardStyle()
    }
    private func bar(_ label: String, _ v: Double, _ maxV: Double, _ c: Color) -> some View {
        HStack {
            Text(label).font(.caption).foregroundStyle(.secondary).frame(width: 84, alignment: .leading)
            GeometryReader { g in
                Capsule().fill(c.gradient).frame(width: max(4, g.size.width * (maxV > 0 ? v / maxV : 0)))
            }.frame(height: 10)
            Text(v.yen).font(.caption.weight(.semibold)).monospacedDigit().frame(width: 76, alignment: .trailing)
        }
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private func recentCard(_ doc: MoneyDocument, today: String) -> some View {
        let recent = doc.transactions.sorted { ($0.date, $0.createdAt) > ($1.date, $1.createdAt) }.prefix(4)
        let isToday = period == "today"
        let txs = isToday ? doc.transactions(on: date) : doc.transactions(inMonth: String(date.prefix(7)))
        let cats = doc.categories.map { c in (c, txs.filter { $0.category == c.name }.reduce(0) { $0 + $1.amount }) }.filter { $0.1 > 0 }
        VStack(alignment: .leading, spacing: 10) {
            Label("最近の動き", systemImage: "clock.arrow.circlepath").font(.subheadline.weight(.semibold)).foregroundStyle(.blue)
            Text("カテゴリ別支出").font(.headline)
            if cats.isEmpty { Text(isToday ? "この日の支出はまだありません" : "今月の支出はまだありません").font(.footnote).foregroundStyle(.secondary) }
            else {
                Chart(cats, id: \.0.id) { c, v in BarMark(x: .value("額", v)).foregroundStyle(Color(hex: c.color)) }
                    .chartXAxis(.hidden).frame(height: 14).clipShape(Capsule())
                ForEach(cats, id: \.0.id) { c, v in
                    HStack { Circle().fill(Color(hex: c.color)).frame(width: 8, height: 8); Text(c.name).font(.footnote); Spacer(); Text(v.yen).font(.footnote).monospacedDigit() }
                }
            }
            Divider()
            ForEach(Array(recent)) { t in
                NavigationLink { TransactionEditor(draft: t, isNew: false) } label: { TransactionRow(t: t, showDate: true) }
            }
            NavigationLink { TransactionListView() } label: { HStack { Text("すべての取引"); Spacer(); Image(systemName: "chevron.right").font(.footnote) }.foregroundStyle(Color.accentColor) }
        }
        .cardStyle()
    }

    private func compareCard(_ doc: MoneyDocument, month: String) -> some View {
        let diff = doc.spentMonth(month) - doc.spentMonth(Dates.addMonths(month, -1))
        return SummaryCard(title: "今月の比較", systemImage: "arrow.left.arrow.right", tint: .indigo) {
            Text("先月より \(signedYen(diff).replacingOccurrences(of: "-", with: "−"))").font(.headline).foregroundStyle(diff <= 0 ? .green : .red)
        }
    }

    private func goalsCard(_ doc: MoneyDocument, today: String) -> some View {
        let goals = doc.eventGoals.filter { $0.status != "cancelled" }
        let own = goals.reduce(0) { $0 + doc.eventGoalSummary($1, today: today).ownShare }
        return SummaryCard(title: "旅行・プレゼントの目標", systemImage: "gift.fill", tint: .purple) {
            Text(goals.isEmpty ? "割り勘・立替・回収までまとめて管理" : "\(goals.count)件・自分の負担予定 \(own.yen)").font(goals.isEmpty ? .footnote : .headline).foregroundStyle(goals.isEmpty ? .secondary : .primary)
        }
    }

    private func largeCard(_ doc: MoneyDocument, today: String) -> some View {
        let planned = doc.largeExpensePlans.filter { $0.status == "planned" }.sorted { $0.date < $1.date }
        return SummaryCard(title: "大型支出の計画", systemImage: "cart.fill", tint: .pink) {
            Text("\(planned.count)件").font(.headline)
            if let n = planned.first { Text("次は \(Format.shortDay(n.date))・\(n.name) \(n.amount.yen)").font(.footnote).foregroundStyle(.secondary) }
        }
    }
}

extension View {
    func cardStyle() -> some View {
        padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.background.secondary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
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
            Section { NavigationLink { TransactionListView(title: "\(Format.monthLabel(month))の取引", month: month) } label: { Text("取引をすべて見る（\(txs.count)件）") } }
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
                    Button { editing = b.id } label: {
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
