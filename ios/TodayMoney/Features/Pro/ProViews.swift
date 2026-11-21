import SwiftUI
import Charts
import TodayMoneyCore

/// Pro の入口（Web 版の今月のメニュー：お金のタイムライン・予算を立て直す・旅行／プレゼント目標・理由が分かる分析・月締めレビュー）
struct ProMenuSection: View {
    var month: String
    var body: some View {
        Section("分析と計画") {
            NavigationLink { ReasonAnalysisView(kind: "expense", month: month) } label: { Label("理由が分かる分析", systemImage: "chart.bar.xaxis") }
            NavigationLink { ReasonAnalysisView(kind: "salary", month: month) } label: { Label("給与分析", systemImage: "yensign.circle") }
            NavigationLink { BudgetRebalanceView(month: month) } label: { Label("予算を立て直す", systemImage: "target") }
            NavigationLink { EventGoalsView() } label: { Label("旅行・プレゼント目標", systemImage: "gift") }
            NavigationLink { MonthReviewView(month: month) } label: { Label("月締めレビュー", systemImage: "checkmark.seal") }
            NavigationLink { TransferPlansView() } label: { Label("振替計画", systemImage: "arrow.left.arrow.right") }
            NavigationLink { SalaryAllocationListView() } label: { Label("給料日の振り分け", systemImage: "square.split.2x2") }
        }
    }
}

// MARK: - 理由が分かる分析・給与分析

struct ReasonAnalysisView: View {
    @Environment(AppModel.self) private var model
    var kind: String
    @State var month: String
    @State private var dimension = "category"
    @State private var compare = "elapsed"
    var body: some View {
        let doc = model.doc, today = model.today
        let rows = kind == "salary" ? doc.salaryAnalysisRows(month: month, today: today) : doc.expenseDimensionRows(month: month, dimension: dimension, compare: compare, today: today)
        let total = rows.reduce(0) { $0 + $1.value }, prev = rows.reduce(0) { $0 + $1.prev }
        let mx = max(1, rows.map(\.value).max() ?? 1)
        List {
            Section {
                MonthSwitcher(month: $month, thisMonth: model.thisMonth)
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(Format.monthLabel(month))・\(kind == "salary" ? "給与" : "支出")").font(.subheadline).foregroundStyle(.secondary)
                    MoneyText(value: total, size: 40, weight: .heavy)
                    Text("前月\(kind == "expense" && compare == "elapsed" ? "同期間" : "") \(prev > 0 ? prev.yen : "比較できる記録なし")\(prev > 0 ? "・差 \(signedYen(total - prev))" : "")")
                        .font(.footnote).foregroundStyle(.secondary)
                }
                if kind == "expense" {
                    Picker("比べ方", selection: $compare) { Text("同じ経過日数").tag("elapsed"); Text("月全体").tag("full") }.pickerStyle(.segmented)
                    Picker("分け方", selection: $dimension) { Text("カテゴリ").tag("category"); Text("店舗").tag("merchant"); Text("曜日").tag("weekday"); Text("支払方法").tag("payment") }.pickerStyle(.segmented)
                }
            }
            if kind == "expense" {
                Section("増減の理由") { Text(doc.expenseInsight(month: month, compare: compare, today: today)) }
            }
            Section {
                if rows.isEmpty { Text("比較できる記録がありません。").foregroundStyle(.secondary) }
                ForEach(rows) { r in
                    NavigationLink {
                        if kind == "expense" { FilteredTransactionsView(month: month, dimension: dimension, key: r.key) }
                        else if let e = doc.employers.first(where: { $0.name == r.key }) { EmployerTermsView(employerId: e.id) }
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(r.key); Spacer(); Text(r.value.yen).bold().monospacedDigit() }
                            GeometryReader { g in Capsule().fill(Color.accentColor.gradient).frame(width: max(4, g.size.width * min(1, r.value / mx))) }.frame(height: 6)
                            Text("前月 \(r.prev != 0 ? r.prev.yen : "—")\(r.prev != 0 ? "・差 \(signedYen(r.delta))" : "")").font(.caption).foregroundStyle(r.delta > 0 ? .red : .secondary)
                        }.padding(.vertical, 2)
                    }
                }
            } footer: { if kind == "expense" { Text("項目をタップすると、同じ月・同じ条件の明細へ進みます。") } }
        }
        .navigationTitle(kind == "salary" ? "給与分析" : "理由が分かる分析")
    }
}

struct FilteredTransactionsView: View {
    @Environment(AppModel.self) private var model
    var month: String, dimension: String, key: String
    var body: some View {
        let list = model.doc.filteredTransactions(month: month, dimension: dimension, key: key)
        List {
            Section { LabeledContent("\(Format.monthLabel(month))・\(list.count)件", value: list.reduce(0) { $0 + $1.amount }.yen).font(.headline) }
            ForEach(list) { t in NavigationLink { TransactionEditor(draft: t, isNew: false) } label: { TransactionRow(t: t, showDate: true) }.transactionActions(t) }
        }
        .navigationTitle("\(key)の明細")
    }
}

// MARK: - 月締めレビュー

struct MonthReviewView: View {
    @Environment(AppModel.self) private var model
    @State var month: String
    var body: some View {
        let doc = model.doc
        let issues = doc.monthReviewIssues(month, today: model.today)
        let saved = doc["monthReviews"]?[month]
        let unchanged = saved != nil && str(saved?["checksum"]) == doc.monthReviewChecksum(month)
        List {
            Section {
                MonthSwitcher(month: $month, thisMonth: model.thisMonth)
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(unchanged ? "確認済み" : "確認が必要です").bold()
                        Text(saved.map { "前回 \(dateText(str($0["reviewedAt"]))) に確認\(unchanged ? "・その後の変更なし" : "・その後に記録が変更されています")" } ?? "この月はまだ締めレビューをしていません。")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text(unchanged ? "確認済み" : "要確認").font(.caption.bold()).padding(.horizontal, 8).padding(.vertical, 3)
                        .background((unchanged ? Color.green : .orange).opacity(0.18), in: Capsule()).foregroundStyle(unchanged ? .green : .orange)
                }
                LabeledContent("\(Format.monthLabel(month))・確認項目", value: "\(issues.count)件").font(.headline)
            } footer: { Text("過去月を編集禁止にはしません。確認後にデータが変わると自動的に「要確認」へ戻ります。") }
            Section("確認する項目") {
                if issues.isEmpty { Text("大きな未確認項目は見つかりませんでした").foregroundStyle(.secondary) }
                ForEach(issues) { i in
                    NavigationLink { destination(i) } label: {
                        Label { VStack(alignment: .leading) { Text(i.title); Text(i.sub).font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: "exclamationmark.circle.fill").foregroundStyle(.orange) }
                    }
                }
            }
            Section {
                Button(unchanged ? "確認済みとして更新" : "この内容を確認済みにする") {
                    model.commit("月締めレビュー") { $0.recordMonthReview(month, issueCount: issues.count) }
                    model.done("月締めレビューを記録しました")
                }.bold()
            } footer: { Text("月締めはレビュー状態の記録です。過去月の編集は引き続き可能です。") }
        }
        .navigationTitle("月締めレビュー")
    }
    @ViewBuilder private func destination(_ i: MonthReviewIssue) -> some View {
        switch i.type {
        case "salary": SalaryRecordEditor(recordId: i.refId)
        case "card": CardDetailView(cardId: i.refId, paymentMonth: month)
        case "goal": EventGoalDetailView(goalId: i.refId)
        case "bank": BankEditor(bankId: i.refId)
        case "budget": ReasonAnalysisView(kind: "expense", month: month)
        default: ContentUnavailableView("Gmail の取り込みは Web 版で確認してください", systemImage: "envelope")
        }
    }
}

// MARK: - お金のタイムライン


// MARK: - 予算を立て直す

struct BudgetRebalanceView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var month: String
    @State private var mode = "even"
    @State private var selected: [String] = []
    @State private var forecast: AcfForecast?
    @State private var lastId: String?
    var body: some View {
        let doc = model.doc
        if num(doc["monthlyGoals"]?[month]?["total"]) <= 0 {
            ContentUnavailableView { Label("月間目標が未設定です", systemImage: "target") } description: { Text("先に月間目標を設定してください。") } actions: {
                NavigationLink("月間目標をつくる") { GoalPlannerView(type: .monthly, key: month) }
            }
        } else {
            let p = doc.rebalancePlan(month: month, mode: mode, selected: selected, today: model.today)
            let raw = doc["monthlyGoals"]?[month]?["daily"]
            let changes = p.editable.compactMap { ds -> (String, Double, Double)? in
                let d = Dates.parts(ds).d
                let old = num(raw?[String(d)]) != 0 ? num(raw?[String(d)]) : num(doc["dailyGoals"]?[ds]?["total"])
                let nv = p.plan[d] ?? 0
                return abs(nv - old) > 0.5 ? (ds, old, nv) : nil
            }
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(Format.monthLabel(month))・残り予算").font(.subheadline).foregroundStyle(.secondary)
                        MoneyText(value: p.remaining, size: 40, weight: .heavy)
                        Text("使用済み \(p.past.yen) / 月間目標 \(p.target.yen)").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Section("配り方") {
                    Picker("配り方", selection: $mode) {
                        Text("残りの日へ均等に配る").tag("even"); Text("曜日の使い方に合わせる").tag("weighted"); Text("選んだ日だけ調整する").tag("selected")
                    }.pickerStyle(.inline).labelsHidden()
                    if mode == "selected" {
                        LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7)) {
                            ForEach(p.editable, id: \.self) { ds in
                                let on = selected.contains(ds)
                                Button("\(Dates.parts(ds).d)") { if on { selected.removeAll { $0 == ds } } else { selected.append(ds) } }
                                    .buttonStyle(.bordered).tint(on ? .accentColor : .secondary)
                            }
                        }
                    }
                }
                Section {
                    LabeledContent("変更する日", value: "\(changes.count)日")
                    LabeledContent("1日平均", value: (p.chosen.isEmpty ? 0 : p.chosen.reduce(0) { $0 + (p.plan[Dates.parts($1).d] ?? 0) } / Double(p.chosen.count)).yen)
                    if let f = forecast {
                        LabeledContent("最低予測残高") { Text(f.minForecastBalance.yen).foregroundStyle(f.minForecastBalance < f.reserveFloor ? .red : .primary) }
                        if f.planShortageTotal > 0 || f.minForecastBalance < f.reserveFloor {
                            Label("配分だけでは資金不足を解消できない見込みです。安全ラインを下回る日が残っています。", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange).font(.footnote)
                        }
                    }
                }
                Section("変更プレビュー") {
                    if changes.isEmpty { Text("変更はありません").foregroundStyle(.secondary) }
                    ForEach(changes.prefix(40), id: \.0) { ds, old, nv in
                        LabeledContent(Format.dayLabel(ds)) { Text("\(old.yen) → \(nv.yen)").foregroundStyle(nv > old ? .green : .red).monospacedDigit() }
                    }
                }
                Section {
                    Button("この内容で立て直す") {
                        var id = ""
                        model.change("予算の立て直し") { d, now, today in id = d.applyRebalance(month: month, plan: p.plan, now: now, today: today) }
                        lastId = id; model.done("残り予算を立て直しました")
                    }.bold().disabled(changes.isEmpty)
                    if let lastId {
                        Button("立て直しを取り消す", role: .destructive) {
                            model.change("立て直しの取り消し") { d, _, _ in try d.undoRebalance(lastId) }
                            self.lastId = nil
                        }
                    }
                }
            }
            .navigationTitle("予算の立て直し")
            .task(id: "\(mode)|\(selected)|\(model.revision)") {
                let doc = model.doc, today = model.today
                let map = Dictionary(uniqueKeysWithValues: p.plan.map { ("\(month)-\($0.key < 10 ? "0" : "")\($0.key)", $0.value) })
                let end = "\(month)-\(Dates.daysInMonth(month))"
                forecast = await Task.detached { doc.acfForecast(today: today, plan: map, planIncludesSpent: true, horizonEnd: end) }.value
            }
        }
    }
}

// MARK: - 旅行・プレゼント目標

struct EventGoalsView: View {
    @Environment(AppModel.self) private var model
    @State private var adding = false
    var body: some View {
        let doc = model.doc
        let list = doc.eventGoals.filter { $0.status != "cancelled" }.sorted { $0.deadline < $1.deadline }
        List {
            Section { Button { adding = true } label: { Label("旅行・プレゼント目標を追加", systemImage: "plus") } } footer: { Text("割り勘・立替・回収までまとめて管理します。") }
            if list.isEmpty { Text("旅行・プレゼントの目標はありません。").foregroundStyle(.secondary) }
            ForEach(list) { g in
                let s = doc.eventGoalSummary(g, today: model.today)
                NavigationLink { EventGoalDetailView(goalId: g.id) } label: {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            VStack(alignment: .leading) { Text(g.name).bold(); Text("期限 \(Format.dayLabel(g.deadline))・\(g.items.count)費目").font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Text(s.unrecovered > 0 ? "未回収あり" : g.status == "completed" ? "完了" : "計画中").font(.caption.bold()).foregroundStyle(s.unrecovered > 0 ? .orange : .green)
                        }
                        Grid(alignment: .leading) {
                            GridRow { metric("総費用", s.total); metric("自分の最終負担", s.ownShare) }
                            GridRow { metric("支払済み", s.paid); metric("未回収", s.unrecovered) }
                        }
                    }.padding(.vertical, 4)
                }
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    if g.status != "completed" {
                        Button { setGoal(g.id, "completed") } label: { Label("完了", systemImage: "checkmark.seal.fill") }.tint(.green)
                    }
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) { setGoal(g.id, "cancelled") } label: { Label("中止", systemImage: "xmark.circle") }
                }
            }
        }
        .navigationTitle("旅行・プレゼント")
        .sheet(isPresented: $adding) { NavigationStack { EventGoalEditor(goal: nil) } }
    }
    private func setGoal(_ id: String, _ status: String) {
        model.commit(status == "completed" ? "目標を完了" : "目標を中止") { d in
            var l = d.eventGoals
            guard let i = l.firstIndex(where: { $0.id == id }) else { return }
            l[i].status = status; d.eventGoals = l
        }
        model.done(status == "completed" ? "完了にしました" : "中止にしました")
    }
    private func metric(_ t: String, _ v: Double) -> some View {
        VStack(alignment: .leading) { Text(t).font(.caption2).foregroundStyle(.secondary); Text(v.yen).font(.subheadline.bold()).monospacedDigit() }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct EventGoalDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var goalId: String
    @State private var editing = false
    @State private var payItem: EventGoalItem?
    @State private var reimburse = false
    @State private var confirmDelete = false
    var body: some View {
        if let g = model.doc.eventGoals.first(where: { $0.id == goalId }) {
            let s = model.doc.eventGoalSummary(g, today: model.today)
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(g.typeLabel)・期限 \(Format.dayLabel(g.deadline))").font(.subheadline).foregroundStyle(.secondary)
                        MoneyText(value: s.ownShare, size: 40, weight: .heavy)
                        Text("自分の最終負担 / 総費用 \(s.total.yen)").font(.footnote).foregroundStyle(.secondary)
                        ProgressView(value: s.total > 0 ? min(1, s.paid / s.total) : 0)
                    }
                    LabeledContent("立替済み", value: s.advance.yen)
                    LabeledContent("相手からの未回収") { Text(s.unrecovered.yen).foregroundStyle(s.unrecovered > 0 ? .orange : .primary) }
                    LabeledContent("支払済み / 残り", value: "\(s.paid.yen) / \(s.remaining.yen)")
                    LabeledContent("期限まで週あたり目安", value: s.weekly.yen)
                } footer: { if s.unrecovered > 0 { Text("相手の負担分は、実際に受け取るまで現金・預金へ加算していません。") } }
                Section("費目") {
                    ForEach(g.items) { i in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(i.name)
                                Text("\(Format.shortDay(i.plannedDate))・\(model.doc.paymentLabel(method: i.paymentMethod, id: i.paymentId))・\(i.status == "paid" ? "支払済み" : i.status == "cancelled" ? "取消" : "予定")").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            VStack(alignment: .trailing) {
                                Text(i.budget.yen).monospacedDigit()
                                if i.status == "planned" { Button("支出として記録") { payItem = i }.font(.caption).buttonStyle(.borderless) }
                            }
                        }
                    }
                }
                Section {
                    Button("編集") { editing = true }
                    if s.unrecovered > 0 { Button("割り勘の受取を確認") { reimburse = true } }
                    Button("目標を削除", role: .destructive) { confirmDelete = true }
                }
            }
            .navigationTitle("目標の詳細")
            .sheet(isPresented: $editing) { NavigationStack { EventGoalEditor(goal: g) } }
            .sheet(isPresented: $reimburse) { NavigationStack { ReimbursementView(goalId: g.id, max: s.unrecovered) }.presentationDetents([.medium]) }
            .confirmationDialog("実際の支出として登録しますか？", isPresented: Binding(get: { payItem != nil }, set: { if !$0 { payItem = nil } }), titleVisibility: .visible) {
                Button("登録") { if let i = payItem { model.change("目標の費目を支出に") { d, now, today in d.completeGoalItem(g.id, itemId: i.id, now: now, today: today) }; model.done("実際の支出として記録しました") } }
            } message: { Text(payItem.map { "\($0.name) \($0.budget.yen) を実績にします。カードの場合は将来の請求へ反映されます。" } ?? "") }
            .confirmationDialog("目標を削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("削除", role: .destructive) { model.commit("目標の削除") { $0.deleteEventGoal(g.id) }; model.done("目標を削除しました"); dismiss() }
            } message: { Text("この目標から作った未完了の大型支出計画も削除します。実績の取引は削除しません。") }
        } else { ContentUnavailableView("目標が見つかりません", systemImage: "gift") }
    }
}

struct EventGoalEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var goal: EventGoal?
    @State private var g = EventGoal(id: "")
    @State private var loaded = false
    @State private var editItem: EventGoalItem?
    @State private var alert: String?
    var body: some View {
        let total = g.items.filter { $0.status != "cancelled" }.reduce(0) { $0 + $1.budget }
        Form {
            Section("目標") {
                TextField("名前（例：名古屋旅行・誕生日）", text: $g.name)
                YMDPicker(title: "期限", value: $g.deadline)
                Picker("種類", selection: $g.type) { Text("旅行").tag("travel"); Text("プレゼント").tag("gift"); Text("イベント").tag("event"); Text("その他").tag("other") }
            }
            Section("自分の負担") {
                Picker("負担", selection: $g.splitMode) { Text("全額").tag("self"); Text("等分").tag("equal"); Text("金額指定").tag("amount") }.pickerStyle(.segmented)
                if g.splitMode == "equal" { Stepper("人数 \(g.participants)人", value: $g.participants, in: 1...20) }
                if g.splitMode == "amount" { AmountField(title: "自分の負担額", value: $g.ownShareAmount) }
            }
            Section {
                ForEach(g.items) { i in
                    Button { editItem = i } label: {
                        LabeledContent { Text(i.budget.yen).monospacedDigit() } label: {
                            Text(i.name).foregroundStyle(.primary); Text("\(Format.shortDay(i.plannedDate))・\(model.doc.paymentLabel(method: i.paymentMethod, id: i.paymentId))").font(.caption)
                        }
                    }
                }
                .onDelete { g.items.remove(atOffsets: $0) }
                Button { var i = EventGoalItem(id: MoneyDocument.uid("goalitem")); i.plannedDate = g.deadline; i.category = model.doc.categories.first?.name ?? "その他"; editItem = i } label: { Label("費目を追加", systemImage: "plus") }
                LabeledContent("総費用", value: total.yen)
            } header: { Text("費目") } footer: { Text("費目は大型支出計画とつなぎます。割り勘の相手負担分を、受取前の現金・預金へ足すことはありません。") }
        }
        .navigationTitle(goal == nil ? "目標を追加" : "目標を編集").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("保存") { save(total) }.bold() }
        }
        .alert(alert ?? "", isPresented: Binding(get: { alert != nil }, set: { if !$0 { alert = nil } })) { Button("OK") {} }
        .sheet(item: $editItem) { i in NavigationStack { GoalItemEditor(item: i) { x in if let k = g.items.firstIndex(where: { $0.id == x.id }) { g.items[k] = x } else { g.items.append(x) } } } }
        .onAppear {
            guard !loaded else { return }; loaded = true
            if let goal { g = goal } else { g = EventGoal(id: MoneyDocument.uid("goal")); g.deadline = Dates.addDays(model.today, 30); g.participants = 2 }
            if g.participants == 0 { g.participants = 2 }
        }
    }
    private func save(_ total: Double) {
        g.name = g.name.trimmingCharacters(in: .whitespaces)
        if g.name.isEmpty || g.deadline.isEmpty || g.items.isEmpty || total <= 0 { alert = "目標名・期限・1つ以上の費目を入力してください。"; return }
        if g.splitMode == "amount" && g.ownShareAmount > total { alert = "自分の負担額を総費用以下にしてください。"; return }
        let x = g
        model.change("旅行・プレゼント目標") { d, now, _ in d.saveEventGoal(x, now: now) }
        model.done("目標を保存しました"); dismiss()
    }
}

struct GoalItemEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State var item: EventGoalItem
    var onSave: (EventGoalItem) -> Void
    var body: some View {
        Form {
            TextField("費目名（例：ホテル）", text: $item.name)
            AmountField(title: "予算", value: $item.budget)
            YMDPicker(title: "支払予定日", value: $item.plannedDate)
            Picker("カテゴリ", selection: $item.category) { ForEach(model.doc.categories) { Text($0.name).tag($0.name) } }
            PaymentPicker(method: $item.paymentMethod, paymentId: $item.paymentId)
        }
        .navigationTitle("費目").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    var x = item; x.name = x.name.trimmingCharacters(in: .whitespaces)
                    x.linkedBankId = x.paymentMethod == "bank" ? x.paymentId : x.paymentMethod == "debit" ? model.doc.paymentBankId(method: "debit", id: x.paymentId) : ""
                    onSave(x); dismiss()
                }.bold().disabled(item.name.trimmingCharacters(in: .whitespaces).isEmpty || item.budget <= 0)
            }
        }
    }
}

struct ReimbursementView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var goalId: String
    var max: Double
    @State private var amount = 0.0
    @State private var bankId = ""
    var body: some View {
        Form {
            Section {
                LabeledContent("未回収", value: max.yen).font(.headline)
                AmountField(title: "今回受け取った額", value: $amount)
                Picker("受け取り先", selection: $bankId) { Text("現金・その他").tag(""); ForEach(model.doc.banks) { Text($0.name).tag($0.id) } }
            } footer: { Text("受け取った事実を確認した金額だけ残高へ反映します。") }
        }
        .navigationTitle("割り勘の受取を確認").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    let (a, b) = (amount, bankId)
                    model.change("割り勘の受取") { d, now, today in try d.recordReimbursement(goalId, amount: a, toType: b.isEmpty ? "cash" : "bank", bankId: b, now: now, today: today) }
                    model.done("受取を記録しました"); dismiss()
                }.bold().disabled(amount <= 0 || amount > max)
            }
        }
        .onAppear { amount = max }
    }
}

// MARK: - 振替計画

struct TransferPlansView: View {
    @Environment(AppModel.self) private var model
    @State private var adding = false
    @State private var target: (TransferPlan, Bool)?
    var body: some View {
        let doc = model.doc
        let plans = doc.transferPlans.sorted { $0.date > $1.date }
        List {
            Section { Button { adding = true } label: { Label("新しい振替計画", systemImage: "plus") }.disabled(doc.banks.count < 2) }
                footer: { Text(doc.banks.count < 2 ? "振替計画には2つ以上の銀行口座が必要です。" : "この画面は銀行へ送金しません。「実行済みにする」を選んだときだけアプリ内の2口座残高を同額で増減します。") }
            Section("計画・履歴") {
                if plans.isEmpty { Text("振替計画はありません。").foregroundStyle(.secondary) }
                ForEach(plans) { p in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack { Text(doc.bank(p.fromBankId)?.name ?? "不明"); Image(systemName: "arrow.right"); Text(doc.bank(p.toBankId)?.name ?? "不明"); Spacer(); Text(p.amount.yen).bold() }
                        Text("\(Format.dayLabel(p.date))・\(p.status == "planned" ? "予定" : p.status == "executed" ? "実行済み" : "取消済み")").font(.caption).foregroundStyle(.secondary)
                        if p.status == "planned" { Button("実行済みにする") { target = (p, true) }.buttonStyle(.bordered) }
                        if p.status == "executed" { Button("実行を取り消す") { target = (p, false) }.buttonStyle(.bordered) }
                    }
                    .swipeActions(edge: .leading, allowsFullSwipe: true) {
                        if p.status == "planned" { Button { target = (p, true) } label: { Label("実行済み", systemImage: "checkmark.circle.fill") }.tint(.green) }
                    }
                    .swipeActions(edge: .trailing) {
                        if p.status == "planned" {
                            Button(role: .destructive) {
                                let id = p.id
                                model.commit("振替計画の削除") { $0.transferPlans = $0.transferPlans.filter { $0.id != id } }
                                model.done("振替計画を削除しました")
                            } label: { Label("削除", systemImage: "trash") }
                        }
                    }
                }
            }
        }
        .navigationTitle("振替計画")
        .sheet(isPresented: $adding) { NavigationStack { TransferPlanEditor(toBankId: "", suggested: 0, date: model.today) } }
        .confirmationDialog(target.map { $0.1 ? "振替を実行済みにしますか？" : "振替実行を取り消しますか？" } ?? "", isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }), titleVisibility: .visible) {
            Button(target?.1 == true ? "実行済みにする" : "取り消す") {
                guard let (p, run) = target else { return }
                model.change(run ? "振替の実行" : "振替の取り消し") { d, now, today in
                    if run { try d.executeTransferPlan(p.id, now: now, today: today) } else { try d.undoTransferPlan(p.id, now: now, today: today) }
                }
            }
        } message: { Text(target.map { "\(model.doc.bank($0.0.fromBankId)?.name ?? "") → \(model.doc.bank($0.0.toBankId)?.name ?? "") \($0.0.amount.yen)\n実際の銀行送金は行いません。アプリ内残高だけを更新します。" } ?? "") }
    }
}

struct TransferPlanEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var toBankId: String
    var suggested: Double
    var date: String
    @State private var from = ""
    @State private var to = ""
    @State private var amount = 0.0
    @State private var day = ""
    @State private var loaded = false
    var body: some View {
        let doc = model.doc
        let preview = TransferPlan(json: .object(["id": .string("preview"), "fromBankId": .string(from), "toBankId": .string(to), "amount": .number(amount), "date": .string(day), "status": .string("planned")]))
        let src = doc.bankForecast(from, days: 60, today: model.today, extraPlan: preview), dst = doc.bankForecast(to, days: 60, today: model.today, extraPlan: preview)
        Form {
            Section("振替元と振替先") {
                Picker("振替元", selection: $from) { ForEach(doc.banks) { Text("\($0.name)・\($0.balance.yen)").tag($0.id) } }
                Picker("振替先", selection: $to) { ForEach(doc.banks) { Text("\($0.name)・\($0.balance.yen)").tag($0.id) } }
                AmountField(title: "金額", value: $amount)
                YMDPicker(title: "予定日", value: $day)
            }
            Section {
                if from == to { Text("振替元と振替先は別の口座を選んでください。").foregroundStyle(.orange) }
                else {
                    LabeledContent("振替元の最低残高") { Text((src?.minBalance ?? 0).yen).foregroundStyle((src?.minBalance ?? 0) < 0 ? .red : .primary) }
                    LabeledContent("振替先の最低残高") { Text((dst?.minBalance ?? 0).yen).foregroundStyle((dst?.minBalance ?? 0) < 0 ? .red : .primary) }
                    LabeledContent("総残高への影響", value: 0.0.yen)
                    if (src?.minBalance ?? 0) < 0 { Text("この振替は振替元を不足させる見込みです。金額または予定日を見直してください。").foregroundStyle(.orange).font(.footnote) }
                }
            }
        }
        .navigationTitle("振替計画").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    let (f, t, a, d) = (from, to, amount, day)
                    model.change("振替計画") { doc, now, _ in try doc.addTransferPlan(from: f, to: t, amount: a, date: d, now: now) }
                    model.done("振替計画を保存しました"); dismiss()
                }.bold().disabled(from == to || amount <= 0)
            }
        }
        .onAppear {
            guard !loaded else { return }; loaded = true
            to = toBankId.isEmpty ? (doc.banks.first?.id ?? "") : toBankId
            from = doc.banks.first { $0.id != to }?.id ?? ""
            amount = suggested; day = date
        }
    }
}

// MARK: - 給料日の振り分け

struct SalaryAllocationListView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let doc = model.doc
        let paid = doc.salaryRecords.filter { doc.status($0, today: model.today) == .received }.sorted { doc.effectiveDate($0) > doc.effectiveDate($1) }
        List {
            if paid.isEmpty { Text("振り分けできる給与がありません。先に給与の「入金済み」を確認してください。").foregroundStyle(.secondary) }
            ForEach(paid) { r in
                NavigationLink { SalaryAllocationView(recordId: r.id) } label: {
                    LabeledContent {
                        Text(doc.cashAmount(r).yen).monospacedDigit()
                    } label: {
                        Text("\(doc.employer(r.employerId)?.name ?? "給与")・\(Format.dayLabel(doc.effectiveDate(r)))")
                        Text(doc.salaryAllocation(for: r.id) != nil ? "振り分け済み" : "未設定").font(.caption)
                    }
                }
            }
        }
        .navigationTitle("給料日の振り分け")
    }
}

struct SalaryAllocationView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var recordId: String
    @State private var b = SalaryAllocationBuckets()
    @State private var end = ""
    @State private var next = ""
    @State private var loaded = false
    var body: some View {
        let doc = model.doc
        if let r = doc.salaryRecords.first(where: { $0.id == recordId }) {
            let amount = doc.cashAmount(r), left = amount - b.total
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(doc.employer(r.employerId)?.name ?? "給与")・受取額").font(.subheadline).foregroundStyle(.secondary)
                        MoneyText(value: amount, size: 36, weight: .heavy)
                        Text("\(Format.dayLabel(doc.effectiveDate(r)))\(next.isEmpty ? "" : " → 次の入金 \(Format.dayLabel(next))")").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Section {
                    AmountField(title: "カード・固定支払い", value: $b.payments)
                    AmountField(title: "生活費", value: $b.living)
                    AmountField(title: "旅行・プレゼント", value: $b.goals)
                    AmountField(title: "残しておく額", value: $b.reserve)
                    LabeledContent("配分合計 / 未配分") { Text("\(b.total.yen) / \(left == 0 ? "一致" : left > 0 ? "未配分 \(left.yen)" : "超過 \((-left).yen)")").foregroundStyle(left < 0 ? .red : .primary) }
                    Button("残りを生活費へ入れる") { b.living = max(0, amount - b.payments - b.goals - b.reserve) }
                } footer: { Text("この振り分けは残高を動かしません。同じ給与を「何に使うか」で分ける計画です。残しておく額は、ACFの最低残したい金額に加わります。") }
                if doc.salaryAllocation(for: recordId) != nil {
                    Section { Button("この振り分けを解除", role: .destructive) { model.commit("振り分けの解除") { $0.releaseSalaryAllocation(recordId) }; model.done("振り分けを解除しました"); dismiss() } }
                }
            }
            .navigationTitle("給料日の振り分け").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("保存") {
                let (x, e) = (b, end)
                model.change("給与の振り分け") { d, now, _ in d.saveSalaryAllocation(recordId, buckets: x, validUntil: e, now: now) }
                model.done("給与の振り分けを保存しました"); dismiss()
            }.bold().disabled(abs(left) > 0.5) } }
            .onAppear {
                guard !loaded else { return }; loaded = true
                let rec = doc.salaryAllocationRecommendation(r, today: model.today)
                end = rec.end; next = rec.nextIncome
                if let a = doc.salaryAllocation(for: recordId)?["buckets"] {
                    b = SalaryAllocationBuckets(payments: num(a["payments"]), living: num(a["living"]), goals: num(a["goals"]), reserve: num(a["reserve"]))
                } else { b = rec.buckets }
            }
        } else { ContentUnavailableView("給与が見つかりません", systemImage: "yensign") }
    }
}
