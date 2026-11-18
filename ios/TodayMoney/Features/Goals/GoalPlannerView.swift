import SwiftUI
import TodayMoneyCore

/// 目標の計画づくり（Web 版 openGoalPlanner）
/// 当日目標：金額 → カテゴリ → 確認。月間目標：おすすめ → 大型支出 → 日常予算 → カテゴリ → 日別計画 → ACF → 確認
struct GoalPlannerView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var type: GoalPlan.Kind
    var key: String
    @State private var plan: GoalPlan?
    @State private var step = 0
    @State private var success = false
    @State private var errorText: String?
    @State private var processing = false
    @State private var baseline: AcfForecast?
    @State private var planForecast: AcfForecast?
    @State private var dayEdit: String?
    @State private var lens = "plan"
    @State private var amountEdit = false
    @State private var catEdit: String?
    @State private var largeEdit: LargeExpensePlan?

    var stepCount: Int { type == .monthly ? 7 : 3 }
    var labels: [String] { type == .monthly ? ["おすすめ", "大型支出", "日常予算", "カテゴリ", "日別計画", "ACF", "確認"] : ["金額", "カテゴリ", "確認"] }

    var body: some View {
        Group {
            if let p = Binding($plan) {
                if success { successView(p.wrappedValue) }
                else if processing { VStack(spacing: 16) { ProgressView(); Text("計画を保存しています…") }.frame(maxWidth: .infinity, maxHeight: .infinity) }
                else if let e = errorText { errorView(e) }
                else if step == 0 { intro(p.wrappedValue) }
                else { stepView(p) }
            } else { ProgressView() }
        }
        .navigationTitle(type == .daily ? "当日目標" : "月間目標")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { if plan == nil { plan = model.doc.createGoalPlan(type, key, today: model.today) } }
        .task(id: baselineKey) { await loadForecasts() }
    }

    private var baselineKey: String {
        guard let p = plan, type == .monthly, step >= 5 else { return "none" }
        return "\(step)|\(p.dailyPlan.sorted { $0.key < $1.key }.map { "\($0.key):\(Int($0.value))" }.joined(separator: ","))|\(p.largeExpenses.map(\.id).joined())|\(model.revision)"
    }
    private func loadForecasts() async {
        guard let p = plan, type == .monthly, step >= 5 else { return }
        let doc = model.doc, today = model.today
        let (b, f) = await Task.detached(priority: .userInitiated) {
            // 下書きの大型支出を入れた通常の予測（Web 版 goalPlannerBaselineForecast）と、日別計画どおりに使った場合の予測
            var d2 = doc; d2.largeExpensePlans = doc.goalDraftLargePlans(p)
            return (d2.acfForecast(today: today, lightweight: true), doc.goalPlanForecast(p, today: today))
        }.value
        baseline = b; planForecast = f
    }

    // MARK: はじめに

    private func intro(_ p: GoalPlan) -> some View {
        let existing = type == .daily ? model.doc.dailyGoal(key) : model.doc.monthlyGoalTotal(key)
        return List {
            Section {
                VStack(alignment: .leading, spacing: 10) {
                    Image(systemName: "target").font(.largeTitle).foregroundStyle(.orange)
                    Text(type == .daily ? "今日の使い方を\n計画しましょう" : "今月のお金の使い方を\n計画しましょう").font(.title2.bold())
                    Text(type == .daily ? "スライダーや電卓で今日の全体予算を選び、カテゴリごとの使い方を決めましょう。" : "過去3ヶ月の傾向やカテゴリ別支出から、今月の目標を組み立てます。")
                        .font(.subheadline).foregroundStyle(.secondary)
                }.padding(.vertical, 6)
            }
            Section {
                LabeledContent(type == .daily ? "過去の同じ曜日" : "過去3ヶ月平均", value: p.recommendation.base.yen)
                LabeledContent(type == .daily ? "今日すでに使った金額" : "今月すでに使用", value: p.recommendation.current.yen)
                if existing > 0 { LabeledContent("現在の目標", value: existing.yen) }
            } footer: { Text(p.recommendation.explanation + (p.recommendation.sparse ? "・まだ記録が少ないため参考値です" : "")) }
            Section {
                Button(existing > 0 ? "目標を見直す" : "計画をはじめる") { withAnimation { step = 1 } }.bold().frame(maxWidth: .infinity)
                Button("今はしない") { dismiss() }.frame(maxWidth: .infinity)
            }
        }
    }

    // MARK: ステップ

    @ViewBuilder private func stepView(_ p: Binding<GoalPlan>) -> some View {
        let name = type == .monthly ? ["", "recommend", "large", "amount", "category", "daily", "acf", "review"][step] : ["", "amount", "category", "review"][step]
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    ProgressView(value: Double(step), total: Double(stepCount)).tint(.orange)
                    HStack { Text(labels[step - 1]).font(.subheadline.weight(.semibold)); Spacer(); Text("\(step) / \(stepCount)").font(.caption).foregroundStyle(.secondary) }
                }
            }
            switch name {
            case "recommend": recommendStep(p)
            case "large": largeStep(p)
            case "amount": amountStep(p)
            case "category": categoryStep(p)
            case "daily": dailyStep(p)
            case "acf": acfStep(p.wrappedValue)
            default: reviewStep(p.wrappedValue)
            }
        }
        .safeAreaInset(edge: .bottom) {
            HStack {
                if step > 1 || type == .daily { Button { withAnimation { step -= 1 } } label: { Text("戻る").frame(maxWidth: .infinity) }.buttonStyle(.bordered).controlSize(.large) }
                if step < stepCount {
                    Button { next(p) } label: { Text(name == "daily" ? "安全確認へ" : "次へ").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).controlSize(.large)
                        .disabled(name == "daily" && abs(gap(p.wrappedValue)) > 0.5)
                } else {
                    Button { approve(p.wrappedValue) } label: { Text("承認する").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).tint(.green).controlSize(.large)
                }
            }
            .padding().background(.bar)
        }
        .sheet(isPresented: $amountEdit) {
            NavigationStack { AmountSheet(title: type == .daily ? "今日の目標" : "月間日常予算", value: p.wrappedValue.total) { v in
                p.wrappedValue.total = v; p.wrappedValue.dailyPlanNeedsRebuild = true
            } }.presentationDetents([.medium])
        }
        .sheet(item: Binding(get: { catEdit.map(IdBox.init) }, set: { catEdit = $0?.id })) { c in
            NavigationStack { AmountSheet(title: c.id, value: p.wrappedValue.categories[c.id] ?? 0) { p.wrappedValue.categories[c.id] = $0 } }.presentationDetents([.medium])
        }
        .sheet(item: Binding(get: { dayEdit.map(IdBox.init) }, set: { dayEdit = $0?.id })) { d in
            NavigationStack { GoalDaySheet(plan: p, date: d.id, safe: baseline?.rows.first { $0.date == d.id }?.safeTotalBudget) }.presentationDetents([.medium, .large])
        }
        .sheet(item: $largeEdit) { x in
            NavigationStack { GoalLargeSheet(plan: p, item: x) }
        }
    }

    private func next(_ p: Binding<GoalPlan>) {
        if type == .monthly && step == 4 { model.doc.goalEnsureDaily(&p.wrappedValue, force: p.wrappedValue.dailyPlanNeedsRebuild, today: model.today) }
        withAnimation { step += 1 }
    }
    private func gap(_ p: GoalPlan) -> Double { model.doc.goalTarget(p, today: model.today) - model.doc.goalAllocated(p, p.dailyPlan, today: model.today) }

    @ViewBuilder private func recommendStep(_ p: Binding<GoalPlan>) -> some View {
        let r = p.wrappedValue.recommendation
        Section {
            Text("\(r.explanation)を基準に3つの案を用意しました。").font(.subheadline)
            HStack {
                ForEach([("節約", r.low), ("おすすめ", r.base), ("ゆとり", r.high)], id: \.0) { label, v in
                    Button { p.wrappedValue.total = v; p.wrappedValue.dailyPlanNeedsRebuild = true } label: {
                        VStack(spacing: 4) { Text(label).font(.caption); Text(v.yen).font(.headline).monospacedDigit() }
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .background(p.wrappedValue.total == v ? Color.orange.opacity(0.2) : Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                            .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(p.wrappedValue.total == v ? Color.orange : .clear, lineWidth: 1.5))
                    }.buttonStyle(.plain)
                }
            }
            if p.wrappedValue.total < r.current { Label("選択した目標は、すでに使った金額 \(r.current.yen) を下回っています。", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange) }
        } header: { Text("\(type == .daily ? "今日" : "今月")のプランを選ぶ") } footer: { Text(r.sparse ? "まだ記録が少ないため参考値です。" : "記録済みの実質支出修正も推薦値へ反映しています。") }
    }

    @ViewBuilder private func largeStep(_ p: Binding<GoalPlan>) -> some View {
        let list = p.wrappedValue.largeExpenses
        Section {
            Text("日常予算より先に確保したい支出を確認します。検討中は通常の安全予算には含めません。").font(.subheadline)
            LabeledContent("必須の合計", value: list.filter { $0.priority == "required" && $0.status == "planned" }.reduce(0) { $0 + $1.amount }.yen)
        } header: { Text("大型支出・必須支出") }
        Section {
            if list.isEmpty { Text("この月の大型支出はありません").foregroundStyle(.secondary) }
            ForEach(list) { x in
                Button { largeEdit = x } label: {
                    HStack {
                        Circle().fill(x.priority == "required" ? Color.pink : Color.secondary).frame(width: 8, height: 8)
                        VStack(alignment: .leading) { Text(x.name).foregroundStyle(.primary); Text("\(Format.dayLabel(x.date))・\(x.priority == "required" ? "必須" : "検討中")・\(x.statusLabel)").font(.caption).foregroundStyle(.secondary) }
                        Spacer(); Text(x.amount.yen).monospacedDigit()
                    }
                }
            }
            .onDelete { p.wrappedValue.largeExpenses.remove(atOffsets: $0) }
            Button { var x = LargeExpensePlan(id: MoneyDocument.uid("large")); x.date = "\(key)-\(pad(min(28, Dates.parts(model.today).d + 7)))"; x.priority = "required"; x.category = model.doc.categories.last?.name ?? "その他"; largeEdit = x } label: { Label("大型支出を追加", systemImage: "plus") }
        } footer: { Text("ここでの変更は、計画を承認した時に保存します。") }
    }
    private func pad(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }

    @ViewBuilder private func amountStep(_ p: Binding<GoalPlan>) -> some View {
        let r = p.wrappedValue.recommendation, unit: Double = type == .daily ? 100 : 1000
        let mx = ceil(max(unit * 10, r.high * 1.7, r.current * 1.35, p.wrappedValue.total * 1.3) / unit) * unit
        Section {
            Button { amountEdit = true } label: { MoneyText(value: p.wrappedValue.total, size: 44, weight: .heavy).frame(maxWidth: .infinity) }.buttonStyle(.plain)
                .accessibilityLabel("予算を電卓で入力")
            Slider(value: Binding(get: { min(p.wrappedValue.total, mx) }, set: { p.wrappedValue.total = $0; p.wrappedValue.dailyPlanNeedsRebuild = true }), in: 0...mx, step: unit)
            LabeledContent("残り使える金額") { Text((p.wrappedValue.total - r.current).yen).foregroundStyle(p.wrappedValue.total < r.current ? .red : .primary) }
            LabeledContent("すでに使用", value: r.current.yen)
            Button("おすすめ額 \(r.base.yen) に戻す") { p.wrappedValue.total = r.base; p.wrappedValue.dailyPlanNeedsRebuild = true }
            if p.wrappedValue.total < r.current { Label("現在の支出 \(r.current.yen) を下回っています。必要なら目標を引き上げてください。", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange) }
        } header: { Text(type == .daily ? "今日の全体予算" : "総額を調整") } footer: { Text("金額をタップすると電卓で直接入力できます。") }
    }

    @ViewBuilder private func categoryStep(_ p: Binding<GoalPlan>) -> some View {
        let total = p.wrappedValue.total, sum = p.wrappedValue.categories.values.reduce(0, +), un = total - sum
        Section {
            LabeledContent("未割当金額") { Text(un.yen).bold().foregroundStyle(un < 0 ? .red : .primary) }
            if un < 0 { Label("カテゴリ合計が総目標を超えています。承認前に調整してください。", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange) }
        } header: { Text("カテゴリ配分") } footer: { Text("過去の支出構成から自動配分しています。0円のカテゴリがあっても構いません。") }
        Section {
            ForEach(model.doc.categories) { c in
                Button { catEdit = c.name } label: {
                    HStack { CategoryIcon(category: c, size: 26); Text(c.name).foregroundStyle(.primary); Spacer(); Text((p.wrappedValue.categories[c.name] ?? 0).yen).monospacedDigit().foregroundStyle(.primary) }
                }
            }
            Button("おすすめ配分に戻す") {
                p.wrappedValue.categories = model.doc.scaleGoalCategories(model.doc.goalCategoryHistory(type, key), total: total, unit: type == .daily ? 100 : 500)
            }
        }
    }

    @ViewBuilder private func dailyStep(_ p: Binding<GoalPlan>) -> some View {
        let doc = model.doc, today = model.today, pl = p.wrappedValue
        let target = doc.goalTarget(pl, today: today), allocated = doc.goalAllocated(pl, pl.dailyPlan, today: today), g = target - allocated
        let start = doc.goalEditableStart(key, today: today)
        let warn = pl.dailyPlan.filter { d, v in
            let ds = "\(key)-\(pad(d))"
            return d >= start && (baseline?.rows.first { $0.date == ds }.map { v > $0.safeTotalBudget } ?? false)
        }.count
        Section {
            HStack {
                tile("現在の計画", pl.total.yen); tile("おすすめ", pl.recommendation.base.yen)
                tile("ACF推奨", baseline.map { doc.goalAcfRecommendedTotal(pl, baseline: $0, today: today).yen } ?? "…")
            }
            Picker("表示", selection: $lens) { Text("計画").tag("plan"); Text("ACF").tag("acf"); Text("予定").tag("event") }.pickerStyle(.segmented)
            GoalCalendar(plan: pl, lens: lens, baseline: baseline, start: start, today: today, markers: doc.financialEvents(from: "\(key)-01", days: Dates.daysInMonth(key), today: today)) { dayEdit = $0 }
            HStack {
                tile("配分済み", allocated.yen); tile(g >= 0 ? "未配分" : "超過", abs(g).yen, g < 0 ? .red : .primary)
                tile("固定日", "\(pl.dailyLocks.filter { $0.hasPrefix(key) && Dates.parts($0).d >= start }.count)日"); tile("ACF注意日", "\(warn)日", warn > 0 ? .orange : .primary)
            }
            if abs(g) > 0.5 {
                HStack {
                    Label(g > 0 ? "\(g.yen) 未配分" : "\(abs(g).yen) 超過", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    Spacer()
                    Button("自動調整") { p.wrappedValue.dailyPlan = doc.goalNormalize(pl, pl.dailyPlan, exclude: pl.dailyLocks, today: today) }
                }
            }
            Button("ACFに合わせて最適化") { if let b = baseline { p.wrappedValue.dailyPlan = doc.goalSafeAuto(pl, baseline: b, today: today) } }.disabled(baseline == nil)
        } header: { Text("日別計画") } footer: { Text("月間予算を日ごとに配分します。日付をタップすると金額を変えられます（他の日で合計を合わせます）。ACF表示では「計画 / 安全に使える」を比べられます。") }
    }

    @ViewBuilder private func acfStep(_ p: GoalPlan) -> some View {
        Section {
            if let f = planForecast {
                let unsafe = f.minForecastBalance < f.reserveFloor || !f.planFeasible
                Label(unsafe ? "この計画では、最低残したい金額を下回る日があります" : "この計画は安全な範囲です", systemImage: unsafe ? "exclamationmark.triangle.fill" : "checkmark.shield.fill")
                    .foregroundStyle(unsafe ? .orange : .green).font(.headline)
                LabeledContent("最低予測残高", value: f.minForecastBalance.yen)
                LabeledContent("最低になる日", value: Format.dayLabel(f.minForecastDate))
                LabeledContent("最低残したい金額", value: f.reserveFloor.yen)
                LabeledContent("月末予測", value: f.monthEndForecast.yen)
                if f.planShortageTotal > 0 { LabeledContent("計画の不足", value: f.planShortageTotal.yen).foregroundStyle(.red) }
                if let tight = f.rows.filter({ $0.date.hasPrefix(key) }).min(by: { $0.headroom < $1.headroom }) {
                    LabeledContent("いちばん余裕が少ない日", value: "\(Format.shortDay(tight.date))・余力 \(tight.headroom.yen)")
                }
                if let c = f.rows.first(where: { $0.flexibleCredit > 0 }) { Text("\(Format.dayLabel(c.date))から、カード払いも使う配分になります。").font(.footnote).foregroundStyle(.secondary) }
                ForEach(f.risks.prefix(4)) { r in Label(r.title, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.orange) }
            } else { HStack { ProgressView(); Text("ACFを計算しています…") } }
        } header: { Text("この計画の安全確認") } footer: { Text("登録済みの給与・カード引落・固定支払い・大型支出まで日付順に確認します。") }
    }

    @ViewBuilder private func reviewStep(_ p: GoalPlan) -> some View {
        let used = type == .daily ? model.doc.spent(on: key) : model.doc.spentMonth(key)
        let cats = model.doc.categories.map { ($0.name, max(0, p.categories[$0.name] ?? 0)) }.filter { $0.1 > 0 }
        let un = p.total - cats.reduce(0) { $0 + $1.1 }
        Section {
            VStack(alignment: .leading, spacing: 6) {
                Text(type == .daily ? "今日の目標" : "月間日常予算").foregroundStyle(.secondary)
                MoneyText(value: p.total, size: 40, weight: .heavy)
                HStack { tile("使用済み", used.yen); tile("残り", (p.total - used).yen, p.total < used ? .red : .primary) }
            }
        } header: { Text("確認") } footer: { Text("内容を確認して承認してください。承認するまで既存の計画は変更されません。") }
        if type == .monthly && !p.largeExpenses.filter({ $0.status == "planned" }).isEmpty {
            Section("大型支出") {
                ForEach(p.largeExpenses.filter { $0.status == "planned" }) { x in LabeledContent("\(x.name)（\(x.priority == "required" ? "必須" : "検討中")）", value: x.amount.yen) }
            }
        }
        Section("カテゴリ") {
            if cats.isEmpty { Text("カテゴリ配分なし").foregroundStyle(.secondary) }
            ForEach(cats, id: \.0) { LabeledContent($0.0, value: $0.1.yen) }
            LabeledContent("未割当") { Text(un.yen).foregroundStyle(un < 0 ? .red : .primary) }
        }
    }

    private func tile(_ t: String, _ v: String, _ c: Color = .primary) -> some View {
        VStack(alignment: .leading, spacing: 2) { Text(t).font(.caption2).foregroundStyle(.secondary); Text(v).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(c) }
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func approve(_ p: GoalPlan) {
        processing = true
        Task {
            try? await Task.sleep(for: .milliseconds(600))
            var failure: String?
            model.change(type == .daily ? "当日目標" : "月間目標") { d, now, today in
                do { try d.commitGoalPlan(p, now: now, today: today) } catch { failure = error.localizedDescription; throw error }
            }
            model.errorMessage = nil
            processing = false
            if let failure { errorText = failure } else { success = true }
        }
    }

    private func successView(_ p: GoalPlan) -> some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "checkmark.circle.fill").font(.system(size: 64)).foregroundStyle(.green)
            Text("計画を保存しました").font(.title2.bold())
            Text("\(type == .daily ? Format.dayLabel(key) : Format.monthLabel(key))の目標 \(p.total.yen)").foregroundStyle(.secondary)
            Spacer()
            Button("完了") { dismiss() }.buttonStyle(.borderedProminent).controlSize(.large)
        }
        .padding().successFeedback(trigger: success)
    }
    private func errorView(_ e: String) -> some View {
        VStack(spacing: 14) {
            Spacer()
            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 54)).foregroundStyle(.orange)
            Text("保存できませんでした").font(.title2.bold())
            Text(e).multilineTextAlignment(.center)
            Spacer()
            Button("戻って直す") { errorText = nil; step = stepCount }.buttonStyle(.borderedProminent)
        }.padding()
    }
}

/// 月の日別計画のカレンダー（計画 / ACF / 予定）
struct GoalCalendar: View {
    var plan: GoalPlan
    var lens: String
    var baseline: AcfForecast?
    var start: Int
    var today: String
    var markers: [FinancialEvent]
    var select: (String) -> Void
    var body: some View {
        let month = plan.key, first = Dates.weekday("\(month)-01"), days = Dates.daysInMonth(month)
        let cells = Int(ceil(Double(first + days) / 7)) * 7
        VStack(spacing: 4) {
            HStack { ForEach(Array("日月火水木金土"), id: \.self) { Text(String($0)).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity) } }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 7), spacing: 3) {
                ForEach(0..<cells, id: \.self) { i in
                    let day = i - first + 1
                    if day < 1 || day > days { Color.clear.frame(height: 52) } else { cell(day) }
                }
            }
        }
    }
    @ViewBuilder private func cell(_ day: Int) -> some View {
        let ds = "\(plan.key)-\(day < 10 ? "0" : "")\(day)"
        let v = plan.dailyPlan[day] ?? 0, editable = day >= start
        let safe = baseline?.rows.first { $0.date == ds }?.safeTotalBudget
        let over = safe.map { editable && v > $0 } ?? false
        let ev = markers.filter { $0.date == ds }
        let locked = plan.dailyLocks.contains(ds)
        Button { if editable { select(ds) } } label: {
            VStack(spacing: 1) {
                HStack(spacing: 1) {
                    Text("\(day)").font(.caption2.weight(ds == today ? .bold : .regular))
                    if locked { Image(systemName: "lock.fill").font(.system(size: 7)) }
                }
                switch lens {
                case "acf":
                    Text(short(v)).font(.system(size: 9).monospacedDigit())
                    Text(safe.map(short) ?? "—").font(.system(size: 9).monospacedDigit()).foregroundStyle(.teal)
                case "event":
                    HStack(spacing: 2) { ForEach(Array(ev.prefix(3).enumerated()), id: \.offset) { _, e in Circle().fill(e.type == .income ? Color.green : e.type == .card ? .purple : .pink).frame(width: 5, height: 5) } }.frame(height: 10)
                    Text(ev.isEmpty ? "" : short(abs(ev.reduce(0) { $0 + $1.amount }))).font(.system(size: 9)).foregroundStyle(.secondary)
                default:
                    Text(editable || v > 0 ? short(v) : "").font(.system(size: 10).monospacedDigit())
                }
            }
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(!editable ? Color.secondary.opacity(0.05) : over ? Color.orange.opacity(0.18) : Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(ds == today ? Color.accentColor : .clear, lineWidth: 1.2))
            .foregroundStyle(editable ? .primary : .secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(Format.dayLabel(ds))、計画 \(v.yen)\(safe.map { "、安全に使える \($0.yen)" } ?? "")")
    }
    private func short(_ v: Double) -> String { v >= 10000 ? String(format: "%.1f万", v / 10000) : Int(v).formatted() }
}

/// 1日の計画を変える（Web 版 openGoalPlannerDaySheet：金額・他の日で合わせる・同じ曜日／平日／週末に適用・固定）
struct GoalDaySheet: View {
    @Binding var plan: GoalPlan
    var date: String
    var safe: Double?
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var value = 0.0
    @State private var maintain = true
    var body: some View {
        let day = Dates.parts(date).d
        Form {
            Section {
                AmountField(title: "この日の計画", value: $value)
                if let safe { LabeledContent("ACFの安全に使える額", value: safe.yen).foregroundStyle(value > safe ? .orange : .secondary) }
                LabeledContent("今の計画", value: (plan.dailyPlan[day] ?? 0).yen)
                Toggle("月の合計を保つ（他の日で調整）", isOn: $maintain)
            }
            Section {
                Toggle("この日を固定する", isOn: Binding(get: { plan.dailyLocks.contains(date) }, set: { if $0 { plan.dailyLocks.insert(date) } else { plan.dailyLocks.remove(date) } }))
            } footer: { Text("固定した日は、自動の配分で金額を変えません。") }
            Section("同じ金額を入れる") {
                Button("同じ曜日に適用") { applyScope("weekday") }
                Button("平日に適用") { applyScope("weekdays") }
                Button("週末に適用") { applyScope("weekend") }
            }
        }
        .navigationTitle(Format.dayLabel(date)).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("決定") { commit(); dismiss() }.bold() }
        }
        .onAppear { value = plan.dailyPlan[day] ?? 0 }
    }
    private func commit() {
        plan.dailyPlan = model.doc.goalRebalance(plan, date: date, value: value, maintain: maintain, today: model.today)
        plan.dailyPlanNeedsRebuild = false
    }
    private func applyScope(_ s: String) {
        commit()
        plan.dailyPlan = model.doc.goalApplyScope(plan, date: date, scope: s, today: model.today)
        dismiss()
    }
}

/// 計画の中の大型支出（承認するまで保存しない）
struct GoalLargeSheet: View {
    @Binding var plan: GoalPlan
    @State var item: LargeExpensePlan
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        Form {
            TextField("名称", text: $item.name)
            YMDPicker(title: "日付", value: $item.date)
            AmountField(title: "金額", value: $item.amount)
            Picker("優先度", selection: $item.priority) { Text("必須").tag("required"); Text("検討中").tag("optional") }.pickerStyle(.segmented)
            PaymentPicker(method: $item.paymentMethod, paymentId: $item.paymentId)
            Picker("カテゴリ", selection: $item.category) { ForEach(model.doc.categories) { Text($0.name).tag($0.name) } }
        }
        .navigationTitle("大型支出").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("決定") {
                    if let i = plan.largeExpenses.firstIndex(where: { $0.id == item.id }) { plan.largeExpenses[i] = item } else { plan.largeExpenses.append(item) }
                    dismiss()
                }.bold().disabled(item.name.isEmpty || item.amount <= 0)
            }
        }
    }
}

/// 金額を入れるシート（電卓のキー）
struct AmountSheet: View {
    var title: String
    var value: Double
    var apply: (Double) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var expr = ""
    @State private var typed = false
    var body: some View {
        VStack(spacing: 12) {
            MoneyText(value: typed ? Calc.eval(expr) : value, size: 44, weight: .bold).frame(maxWidth: .infinity, alignment: .trailing).padding(.horizontal)
            Keypad(expr: $expr, typed: $typed, tint: .orange).padding(.horizontal)
        }
        .navigationTitle(title).navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("この金額を使う") { apply(typed ? Calc.eval(expr) : value); dismiss() }.bold() }
        }
    }
}
