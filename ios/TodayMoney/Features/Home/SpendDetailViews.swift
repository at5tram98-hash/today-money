import Charts
import SwiftUI
import TodayMoneyCore

/// 1日の支出の詳しい画面（ホームの「今日」を押した先）。
/// 目標との差・同じ曜日／直近30日の平均との比較・14日の推移・カテゴリ・明細・日締め。
struct DaySpendingView: View {
    @Environment(AppModel.self) private var model
    @State var date: String
    @State private var scrub: String?

    var body: some View {
        let doc = model.doc, x = doc.dayInsight(date)
        List {
            Section {
                HStack {
                    Button { date = Dates.addDays(date, -1) } label: { Image(systemName: "chevron.left") }.accessibilityLabel("前の日")
                    Spacer()
                    Text(date == model.today ? "今日・\(Format.dayLabel(date))" : Format.dayLabel(date)).font(.headline)
                    Spacer()
                    Button { date = Dates.addDays(date, 1) } label: { Image(systemName: "chevron.right") }.accessibilityLabel("次の日")
                        .disabled(date >= model.today)
                }
                .buttonStyle(.borderless)
                hero(x)
            }
            Section("くらべる") {
                HStack(alignment: .top, spacing: 8) {
                    compareTile("同じ曜日の平均", x.weekdayAverage, spent: x.spent, sub: "前の8週")
                    compareTile("1日平均", x.recentAverage, spent: x.spent, sub: "前の30日")
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            Section {
                fourteenDays(x)
            } header: { Text("14日間") } footer: { Text("棒を押すと、その日に切り替わります。") }
            if !x.categories.isEmpty {
                Section("カテゴリ別") {
                    ForEach(x.categories) { c in
                        let cat = doc.category(named: c.name), cap = x.categoryGoals[c.name]
                        NavigationLink { CategoryDetailView(name: c.name, month: String(date.prefix(7))) } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    CategoryIcon(category: cat, size: 26)
                                    Text(c.name)
                                    Text("\(c.count)件").font(.caption).foregroundStyle(.secondary)
                                    Spacer()
                                    Text(c.amount.yen).monospacedDigit()
                                }
                                if let cap {
                                    ProgressView(value: min(1, c.amount / cap)).tint(c.amount > cap ? .red : Color(hex: cat.color))
                                    Text(c.amount > cap ? "枠 \(cap.yen) を \((c.amount - cap).yen) 超過" : "枠 \(cap.yen)・あと \((cap - c.amount).yen)")
                                        .font(.caption2).foregroundStyle(c.amount > cap ? .red : .secondary)
                                }
                            }
                        }
                    }
                }
            }
            Section("明細（\(doc.transactions(on: date).count)件）") {
                let txs = doc.transactions(on: date).sorted { $0.createdAt > $1.createdAt }
                if txs.isEmpty { Text("この日の支出はありません").foregroundStyle(.secondary) }
                ForEach(txs) { t in
                    NavigationLink { TransactionEditor(draft: t, isNew: false) } label: { TransactionRow(t: t) }.transactionActions(t)
                }
            }
            Section {
                NavigationLink { DayClosingView(date: date) } label: { Label("この日を日締めする", systemImage: "moon.stars") }
                NavigationLink { MonthSpendingView(month: String(date.prefix(7))) } label: { Label("\(Format.monthLabel(String(date.prefix(7))))の詳細分析", systemImage: "chart.bar.xaxis") }
            }
        }
        .navigationTitle("1日の支出")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { model.entryMode = .expense } label: { Image(systemName: "plus") }.accessibilityLabel("支出を入力")
            }
        }
    }

    private func hero(_ x: DayInsight) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if x.goal > 0 {
                let over = x.spent > x.goal
                Text(over ? "目標を超えた額" : "あと使える額").font(.subheadline).foregroundStyle(.secondary)
                MoneyText(value: over ? x.spent - x.goal : x.goal - x.spent, size: 40, weight: .heavy).foregroundStyle(over ? .red : .primary)
                ProgressView(value: min(1, x.spent / x.goal)).tint(over ? .red : .orange)
                Text("使った額 \(x.spent.yen)・目標 \(x.goal.yen)").font(.footnote).foregroundStyle(.secondary)
            } else {
                Text("使った額").font(.subheadline).foregroundStyle(.secondary)
                MoneyText(value: x.spent, size: 40, weight: .heavy)
                Text("この日の目標は未設定です").font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    private func compareTile(_ title: String, _ avg: Double?, spent: Double, sub: String) -> some View {
        guard let avg else { return StatTile(title: title, value: "—", sub: "\(sub)・記録なし") }
        let d = spent - avg
        let note = abs(d) < 1 ? "平均どおり" : d > 0 ? "\(d.yen) 多い" : "\((-d).yen) 少ない"
        return StatTile(title: title, value: avg.rounded().yen, sub: "\(sub)・\(note)", tint: abs(d) < 1 ? .primary : d > 0 ? .red : .green)
    }

    private func fourteenDays(_ x: DayInsight) -> some View {
        let shown = x.last14.first { $0.date == scrub }
        let avg = x.last14.reduce(0) { $0 + $1.value } / 14
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(shown.map { Format.dayLabel($0.date) } ?? "14日間の平均").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text((shown?.value ?? avg).rounded().yen).font(.headline).monospacedDigit()
            }
            Chart {
                ForEach(x.last14) { p in
                    BarMark(x: .value("日", p.date), y: .value("支出", p.value), width: .ratio(0.7))
                        .cornerRadius(3)
                        .foregroundStyle(p.date == x.date ? Color.orange : x.goal > 0 && p.value > doc.dailyGoal(p.date) && doc.dailyGoal(p.date) > 0 ? Color.red.opacity(0.55) : Color.orange.opacity(0.3))
                }
                RuleMark(y: .value("平均", avg)).foregroundStyle(.secondary).lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                if let s = scrub { RuleMark(x: .value("日", s)).foregroundStyle(.secondary.opacity(0.4)) }
            }
            .chartXAxis {
                AxisMarks(values: x.last14.enumerated().filter { $0.offset % 4 == 0 }.map(\.element.date)) { v in
                    AxisValueLabel { if let d = v.as(String.self) { Text(Format.shortDay(d)) } }
                }
            }
            .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
            .chartXSelection(value: $scrub)
            .chartOverlay { proxy in
                GeometryReader { _ in
                    Rectangle().fill(.clear).contentShape(Rectangle()).onTapGesture { p in
                        if let d: String = proxy.value(atX: p.x), d <= model.today { date = d; Feedback.selection() }
                    }
                }
            }
            .onChange(of: scrub) { _, s in if s != nil { Feedback.selection() } }
            .frame(height: 150)
            .accessibilityLabel("14日間の支出。平均 \(avg.rounded().yen)")
        }
        .padding(.vertical, 4)
    }
    private var doc: MoneyDocument { model.doc }
}

/// 今月の比較（同じ日までの累計で先月と比べる・カテゴリごとの増減）
struct MonthCompareView: View {
    @Environment(AppModel.self) private var model
    @State var month: String
    @State private var scrubDay: Int?

    var body: some View {
        let doc = model.doc, p = doc.monthPace(month, today: model.today)
        let diff = p.currentToDay - p.previousToDay
        List {
            Section {
                MonthSwitcher(month: $month, thisMonth: model.thisMonth)
                VStack(alignment: .leading, spacing: 6) {
                    Text(p.day > 0 ? "\(p.day)日までの支出・先月の同じ日まで" : "まだこの月の記録はありません").font(.subheadline).foregroundStyle(.secondary)
                    MoneyText(value: p.currentToDay, size: 38, weight: .heavy)
                    if p.previousToDay > 0 {
                        HStack(spacing: 6) {
                            Image(systemName: diff > 0 ? "arrow.up.right" : "arrow.down.right")
                            Text("\(signedYen(diff))（\(String(format: "%+.1f", diff / p.previousToDay * 100))%）")
                            Text("先月 \(p.previousToDay.yen)").foregroundStyle(.secondary)
                        }
                        .font(.footnote.weight(.semibold)).foregroundStyle(diff > 0 ? .red : .green)
                    }
                }
                .padding(.vertical, 4)
            }
            Section {
                paceChart(p)
            } header: { Text("累計の推移") } footer: { Text("実線が\(Format.monthLabel(month))、点線が\(Format.monthLabel(p.prev))。なぞると同じ日の累計を比べられます。") }
            Section {
                HStack(alignment: .top, spacing: 8) {
                    StatTile(title: "\(Format.monthLabel(month))の合計", value: p.currentTotal.yen)
                    StatTile(title: "\(Format.monthLabel(p.prev))の合計", value: p.previousTotal.yen)
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            Section(p.day > 0 && p.month == model.thisMonth ? "カテゴリごとの増減（先月の\(p.day)日までと比べて）" : "カテゴリごとの増減（\(Format.monthLabel(p.prev))と比べて）") {
                if p.categories.isEmpty { Text("比べる支出がありません").foregroundStyle(.secondary) }
                let maxDiff = p.categories.map { abs($0.current - $0.previous) }.max() ?? 1
                ForEach(p.categories, id: \.name) { c in
                    let d = c.current - c.previous, cat = doc.category(named: c.name)
                    NavigationLink { CategoryDetailView(name: c.name, month: month) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                CategoryIcon(category: cat, size: 26)
                                Text(c.name)
                                Spacer()
                                VStack(alignment: .trailing, spacing: 0) {
                                    Text(c.current.yen).monospacedDigit()
                                    Text(signedYen(d)).font(.caption).foregroundStyle(d > 0 ? .red : d < 0 ? .green : .secondary).monospacedDigit()
                                }
                            }
                            GeometryReader { g in
                                let half = g.size.width / 2, w = half * CGFloat(abs(d) / max(1, maxDiff))
                                ZStack(alignment: .leading) {
                                    Rectangle().fill(Color(.separator)).frame(width: 1).offset(x: half)
                                    Capsule().fill(d > 0 ? Color.red.opacity(0.6) : Color.green.opacity(0.6))
                                        .frame(width: max(2, w), height: 6)
                                        .offset(x: d > 0 ? half : half - w)
                                }
                            }
                            .frame(height: 8)
                            .accessibilityHidden(true)
                        }
                    }
                }
            }
            Section {
                NavigationLink { MonthSpendingView(month: month) } label: { Label("\(Format.monthLabel(month))の詳細分析", systemImage: "chart.bar.xaxis") }
            }
        }
        .navigationTitle("今月の比較")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func paceChart(_ p: MonthPace) -> some View {
        let cur = p.current.enumerated().map { (day: $0.offset + 1, value: $0.element.value) }
        let prev = p.previous.enumerated().map { (day: $0.offset + 1, value: $0.element.value) }
        let a = cur.first { $0.day == scrubDay }, b = prev.first { $0.day == scrubDay }
        return VStack(alignment: .leading, spacing: 8) {
            if let d = scrubDay {
                HStack {
                    Text("\(d)日まで").font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Text("今月 \(a.map { $0.value.yen } ?? "—")").font(.caption.weight(.semibold))
                    Text("先月 \(b.map { $0.value.yen } ?? "—")").font(.caption).foregroundStyle(.secondary)
                }
                .monospacedDigit()
            }
            Chart {
                ForEach(prev, id: \.day) { r in
                    LineMark(x: .value("日", r.day), y: .value("累計", r.value), series: .value("月", "先月"))
                        .foregroundStyle(.secondary).lineStyle(StrokeStyle(lineWidth: 1.6, dash: [4, 3]))
                }
                ForEach(cur, id: \.day) { r in
                    AreaMark(x: .value("日", r.day), y: .value("累計", r.value), series: .value("月", "今月"))
                        .foregroundStyle(LinearGradient(colors: [Color.indigo.opacity(0.25), .clear], startPoint: .top, endPoint: .bottom))
                    LineMark(x: .value("日", r.day), y: .value("累計", r.value), series: .value("月", "今月"))
                        .foregroundStyle(.indigo).lineStyle(StrokeStyle(lineWidth: 2.4))
                }
                if let d = scrubDay { RuleMark(x: .value("日", d)).foregroundStyle(.secondary.opacity(0.4)) }
            }
            .chartXScale(domain: 1...31)
            .chartXAxis { AxisMarks(values: [1, 10, 20, 31]) { v in AxisValueLabel { if let d = v.as(Int.self) { Text("\(d)日") } } } }
            .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
            .chartXSelection(value: $scrubDay)
            .onChange(of: scrubDay) { _, d in if d != nil { Feedback.selection() } }
            .frame(height: 190)
            .accessibilityLabel("今月の累計 \(p.currentToDay.yen)、先月の同じ日まで \(p.previousToDay.yen)")
        }
        .padding(.vertical, 4)
    }
}

/// カテゴリの詳しい画面（6か月の推移・月の目標の枠・お店ごと・明細・設定）
struct CategoryDetailView: View {
    @Environment(AppModel.self) private var model
    var name: String
    @State var month: String
    @State private var editing = false

    var body: some View {
        let doc = model.doc, c = doc.categoryInsight(name, month: month), cat = doc.category(named: name)
        let tint = Color(hex: cat.color)
        List {
            Section {
                MonthSwitcher(month: $month, thisMonth: model.thisMonth)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: 8) { CategoryIcon(category: cat, size: 28); Text(name).font(.headline) }
                    MoneyText(value: c.amount, size: 38, weight: .heavy)
                    Text("\(c.count)件・月の支出の \(String(format: "%.0f", c.share))%\(c.count > 0 ? "・1件平均 \((c.amount / Double(c.count)).rounded().yen)" : "")")
                        .font(.footnote).foregroundStyle(.secondary)
                    if c.budget > 0 {
                        ProgressView(value: min(1, c.amount / c.budget)).tint(c.amount > c.budget ? .red : tint)
                        Text(c.amount > c.budget ? "月の枠 \(c.budget.yen) を \((c.amount - c.budget).yen) 超えています" : "月の枠 \(c.budget.yen)・あと \((c.budget - c.amount).yen)")
                            .font(.caption).foregroundStyle(c.amount > c.budget ? .red : .secondary)
                    }
                }
                .padding(.vertical, 4)
            }
            Section {
                Chart(c.series) { p in
                    BarMark(x: .value("月", p.date), y: .value("支出", p.value), width: .ratio(0.6))
                        .cornerRadius(4)
                        .foregroundStyle(p.date == month ? tint : tint.opacity(0.3))
                        .annotation(position: .top) { Text(p.value > 0 ? compactYen(p.value) : "—").font(.system(size: 9)).foregroundStyle(.secondary) }
                }
                .chartXAxis { AxisMarks { v in AxisValueLabel { if let m = v.as(String.self) { Text("\(Dates.parts(m + "-01").m)月") } } } }
                .chartYAxis(.hidden)
                .frame(height: 140)
                if c.sixMonthAverage > 0 {
                    let d = c.amount - c.sixMonthAverage
                    LabeledContent("前の月の平均", value: c.sixMonthAverage.rounded().yen)
                    LabeledContent("平均との差") { Text(signedYen(d.rounded())).foregroundStyle(d > 0 ? .red : .green) }
                }
            } header: { Text("6か月の推移") }
            if !c.merchants.isEmpty {
                Section("お店ごと") {
                    ForEach(c.merchants.prefix(8)) { m in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(m.name).lineLimit(2)
                                Text("\(m.count)回").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(m.amount.yen).monospacedDigit()
                        }
                    }
                }
            }
            Section {
                NavigationLink { TransactionListView(title: "\(name)・\(Format.monthLabel(month))", month: month, initialCategory: name) } label: {
                    Label("\(Format.monthLabel(month))の明細（\(c.count)件）", systemImage: "list.bullet")
                }
                Button { editing = true } label: { Label("カテゴリを編集", systemImage: "pencil") }
            }
        }
        .navigationTitle(name)
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $editing) { NavigationStack { CategoryEditor(categoryId: cat.id) } }
    }
}
