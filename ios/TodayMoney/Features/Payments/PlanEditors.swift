import Charts
import SwiftUI
import TodayMoneyCore

/// 固定支払いの一覧（Web 版 mm3OpenFixedList / openFixedPaymentList）
struct FixedPaymentsView: View {
    @Environment(AppModel.self) private var model
    var month: String
    @State private var editing: String?
    @State private var adding = false

    var body: some View {
        let doc = model.doc
        let scheduled = doc.fixedScheduled(month: month)
        let year = (0..<12).map { i -> (month: String, total: Double) in
            let m = Dates.addMonths(month, i)
            return (m, doc.fixedScheduled(month: m).reduce(0) { $0 + $1.f.amount * Double($1.dates.count) })
        }
        let monthTotal = scheduled.reduce(0) { $0 + $1.f.amount * Double($1.dates.count) }
        let yearTotal = year.reduce(0) { $0 + $1.total }
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(Format.monthLabel(month))の固定支払い").font(.subheadline).foregroundStyle(.secondary)
                    MoneyText(value: monthTotal, size: 34, weight: .heavy)
                    Text("今後12か月で \(yearTotal.yen)・月平均 \((yearTotal / 12).rounded().yen)").font(.footnote).foregroundStyle(.secondary)
                }
                .padding(.vertical, 4)
                Chart(year, id: \.month) { r in
                    BarMark(x: .value("月", r.month), y: .value("金額", r.total), width: .ratio(0.6))
                        .cornerRadius(4)
                        .foregroundStyle(r.month == month ? Color.indigo : Color.indigo.opacity(0.3))
                }
                .chartXAxis { AxisMarks { v in AxisValueLabel { if let m = v.as(String.self) { Text("\(Dates.parts(m + "-01").m)") } } } }
                .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
                .frame(height: 120).growFromBottom()
                .accessibilityLabel("今後12か月の固定支払い")
            }
            Section("この月の支払日") {
                if scheduled.isEmpty { Text("この月の固定支払いはありません").foregroundStyle(.secondary) }
                ForEach(scheduled, id: \.f.id) { row in
                    ForEach(row.dates, id: \.self) { d in
                        let done = doc.fixedRecorded(row.f, date: d)
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(row.f.name.isEmpty ? "固定支払い" : row.f.name)
                                Text("\(Format.dayLabel(d))・\(doc.paymentLabel(method: row.f.paymentMethod, id: row.f.paymentId))\(done ? "・記録済み" : "")")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(row.f.amount.yen).monospacedDigit().foregroundStyle(done ? .secondary : .primary)
                        }
                        .swipeActions {
                            if !done {
                                Button("記録") { model.change("固定支払いの記録") { doc, now, today in doc.recordFixedPayment(row.f.id, date: d, now: now, today: today) }; model.done("支出として記録しました") }.tint(.green)
                                Button("今回は払わない") {
                                    model.commit("固定支払いを1回とばす") { doc in
                                        var list = doc.fixedPayments
                                        if let i = list.firstIndex(where: { $0.id == row.f.id }) { list[i].skippedDates.append(d); doc.fixedPayments = list }
                                    }
                                }.tint(.orange)
                            }
                        }
                    }
                }
            }
            Section("登録済み（\(doc.fixedPayments.count)件）") {
                ForEach(doc.fixedPayments) { f in
                    Button { editing = f.id } label: {
                        LabeledContent {
                            Text(f.amount.yen).monospacedDigit()
                        } label: {
                            Text(f.name.isEmpty ? "固定支払い" : f.name).foregroundStyle(.primary)
                            Text("\(f.frequencyLabel)\(f.frequency == "yearly" ? " \(f.annualMonth)月" : "") \(f.day)日・\(doc.paymentLabel(method: f.paymentMethod, id: f.paymentId))")
                                .font(.caption).foregroundStyle(.secondary)
                            if let next = year.lazy.flatMap({ y in doc.fixedDueDates(f, month: y.month) }).first(where: { $0 >= model.today && !f.skippedDates.contains($0) }) {
                                Text("次回 \(Format.dayLabel(next))・\(daysUntilText(next, today: model.today))").font(.caption2).foregroundStyle(.indigo)
                            }
                        }
                    }
                    .tint(.primary)
                    .swipeActions(edge: .trailing) {
                        Button(role: .destructive) {
                            let id = f.id
                            model.commit("固定支払いの削除") { $0.fixedPayments = $0.fixedPayments.filter { $0.id != id } }
                            model.done("固定支払いを削除しました")
                        } label: { Label("削除", systemImage: "trash") }
                        Button { editing = f.id } label: { Label("編集", systemImage: "pencil") }.tint(.blue)
                    }
                }
            }
        }
        .navigationTitle("固定支払い")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("固定支払いを追加") } }
        .sheet(isPresented: $adding) { NavigationStack { FixedPaymentEditor(fixedId: nil, defaultMonth: month) } }
        .sheet(item: Binding(get: { editing.map(IdBox.init) }, set: { editing = $0?.id })) { b in NavigationStack { FixedPaymentEditor(fixedId: b.id) } }
    }
}

struct IdBox: Identifiable { var id: String }

/// 固定支払いの登録・編集（Web 版 openFixedPayment）
struct FixedPaymentEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var fixedId: String?
    var defaultMonth: String? = nil
    @State private var f = FixedPayment(id: "")
    @State private var loaded = false
    @State private var confirmDelete = false

    var body: some View {
        let doc = model.doc
        Form {
            Section("支払い") {
                TextField("名前（例：家賃・サブスク）", text: $f.name)
                AmountField(title: "金額", value: $f.amount)
                Picker("カテゴリ", selection: $f.category) { ForEach(doc.categories) { Text($0.name).tag($0.name) } }
            }
            Section("スケジュール") {
                Picker("支払頻度", selection: $f.frequency) { Text("毎月").tag("monthly"); Text("隔月").tag("bimonthly"); Text("毎年").tag("yearly") }
                    .pickerStyle(.segmented)
                if f.frequency == "yearly" {
                    Picker("対象月", selection: $f.annualMonth) { ForEach(1...12, id: \.self) { Text("\($0)月").tag($0) } }
                }
                Picker("支払日", selection: $f.day) { ForEach(1...31, id: \.self) { Text("\($0)日").tag($0) } }
                Picker("開始月", selection: $f.startMonth) {
                    ForEach(-24...12, id: \.self) { i in let m = Dates.addMonths(model.thisMonth, i); Text(Format.monthLabel(m)).tag(m) }
                }
            }
            Section {
                PaymentPicker(method: $f.paymentMethod, paymentId: $f.paymentId)
            } header: { Text("支払い方法") } footer: {
                Text("カード払いは、そのカードの請求に「予定」として加わります。支払日が来ると支出として自動で記録します。")
            }
            if fixedId != nil {
                Section { Button("この固定支払いを削除", role: .destructive) { confirmDelete = true } }
            }
        }
        .navigationTitle(fixedId == nil ? "固定支払い登録" : "固定支払いを編集")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold().disabled(f.name.trimmingCharacters(in: .whitespaces).isEmpty || f.amount <= 0) }
        }
        .confirmationDialog("この固定支払いを削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("削除", role: .destructive) {
                model.commit("固定支払いの削除") { $0.fixedPayments = $0.fixedPayments.filter { $0.id != fixedId } }
                model.done("固定支払いを削除しました"); dismiss()
            }
        } message: { Text("記録済みの支出は残ります。") }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            if let id = fixedId, let x = doc.fixedPayments.first(where: { $0.id == id }) { f = x }
            else {
                f = FixedPayment(id: "")
                f.startMonth = defaultMonth ?? model.thisMonth; f.day = 1; f.category = doc.categories.first?.name ?? "その他"
            }
            if f.annualMonth == 0 { f.annualMonth = Int(f.startMonth.dropFirst(5).prefix(2)) ?? 1 }
            if f.day == 0 { f.day = 1 }
        }
    }

    private func save() {
        var x = f
        x.name = x.name.trimmingCharacters(in: .whitespaces)
        if x.frequency != "yearly" { x.annualMonth = Int(x.startMonth.dropFirst(5).prefix(2)) ?? x.annualMonth }
        model.change(fixedId == nil ? "固定支払いの登録" : "固定支払いの編集") { doc, now, today in
            var list = doc.fixedPayments
            if let i = list.firstIndex(where: { $0.id == x.id && !x.id.isEmpty }) { list[i] = x }
            else { x.id = MoneyDocument.uid("fixed", now: now); list.append(x) }
            doc.fixedPayments = list
            doc.processScheduled(now: now, today: today)
        }
        model.done("固定支払いを保存しました")
        dismiss()
    }
}

/// 大型支出の一覧（Web 版 mm3OpenLargeList）
struct LargeExpensesView: View {
    @Environment(AppModel.self) private var model
    @State private var adding = false
    var body: some View {
        let doc = model.doc, today = model.today
        let plans = doc.largeExpensePlans.sorted { $0.date < $1.date }
        let planned = plans.filter { $0.status == "planned" }, others = plans.filter { $0.status != "planned" }
        List {
            Section {
                LabeledContent("予定の合計", value: planned.reduce(0) { $0 + $1.amount }.yen).font(.headline)
                LabeledContent("うち必須", value: planned.filter { $0.priority == "required" }.reduce(0) { $0 + $1.amount }.yen)
            }
            Section("予定（\(planned.count)件）") {
                if planned.isEmpty { Text("予定はありません").foregroundStyle(.secondary) }
                ForEach(planned) { p in
                    NavigationLink { LargeExpenseDetailView(planId: p.id) } label: { row(p, doc: doc, today: today) }
                        .swipeActions(edge: .leading) {
                            Button { complete(p) } label: { Label("支払った", systemImage: "checkmark.circle") }.tint(.green)
                        }
                        .swipeActions(edge: .trailing) {
                            Button(role: .destructive) { remove(p) } label: { Label("削除", systemImage: "trash") }
                        }
                        .contextMenu {
                            Button { complete(p) } label: { Label("支払った（支出として記録）", systemImage: "checkmark.circle") }
                            Button(role: .destructive) { remove(p) } label: { Label("削除", systemImage: "trash") }
                        }
                }
            }
            if !others.isEmpty {
                Section("完了・延期・中止") {
                    ForEach(others) { p in
                        NavigationLink { LargeExpenseDetailView(planId: p.id) } label: { row(p, doc: doc, today: today) }
                            .swipeActions(edge: .leading) {
                                if p.status != "completed" {
                                    Button {
                                        let id = p.id
                                        model.commit("大型支出を予定に戻す") { d in
                                            var l = d.largeExpensePlans
                                            if let i = l.firstIndex(where: { $0.id == id }) { l[i].status = "planned"; d.largeExpensePlans = l }
                                        }
                                        model.done("予定に戻しました")
                                    } label: { Label("予定に戻す", systemImage: "arrow.uturn.backward") }.tint(.orange)
                                }
                            }
                    }
                }
            }
        }
        .navigationTitle("大型支出")
        .toolbar { ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("大型支出を追加") } }
        .sheet(isPresented: $adding) { NavigationStack { LargeExpenseEditor(planId: nil) } }
    }
    private func complete(_ p: LargeExpensePlan) {
        let id = p.id
        model.change("大型支出の完了") { doc, now, today in doc.completeLargeExpense(id, now: now, today: today) }
        model.done("\(p.name.isEmpty ? "大型支出" : p.name) を支出として記録しました")
    }
    private func remove(_ p: LargeExpensePlan) {
        let id = p.id
        model.commit("大型支出の削除") { $0.largeExpensePlans = $0.largeExpensePlans.filter { $0.id != id } }
        model.done("計画を削除しました")
    }
    private func row(_ p: LargeExpensePlan, doc: MoneyDocument, today: String) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(p.name.isEmpty ? "大型支出" : p.name)
                Text("\(Format.dayLabel(p.date))・\(p.priority == "required" ? "必須" : "検討中")・\(p.statusLabel)・\(doc.largeExpensePaymentLabel(p))")
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(p.amount.yen).monospacedDigit().foregroundStyle(p.status == "planned" ? .primary : .secondary)
        }
    }
}

/// 大型支出の計画（Web 版 openLargeExpenseEditor：名称・日付・金額・カテゴリ・必須/検討中・支払い方法・分割）
struct LargeExpenseEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var planId: String?
    @State private var p = LargeExpensePlan(id: "")
    @State private var split = false
    @State private var loaded = false
    @State private var confirmDelete = false
    @State private var confirmComplete = false

    var body: some View {
        let doc = model.doc
        let splitTotal = p.splits.reduce(0) { $0 + $1.amount }
        Form {
            Section("計画") {
                TextField("名称（例：パソコン・旅行）", text: $p.name)
                YMDPicker(title: "日付", value: $p.date)
                AmountField(title: "金額", value: $p.amount)
                Picker("カテゴリ", selection: $p.category) { ForEach(doc.categories) { Text($0.name).tag($0.name) } }
                Picker("優先度", selection: $p.priority) { Text("必須").tag("required"); Text("検討中").tag("optional") }.pickerStyle(.segmented)
            }
            Section {
                Toggle("複数の方法で分けて払う", isOn: $split.animation())
                if split {
                    ForEach(p.splits.indices, id: \.self) { i in
                        VStack {
                            PaymentPicker(title: "分割 \(i + 1) の支払い方法", method: $p.splits[i].paymentMethod, paymentId: $p.splits[i].paymentId)
                            AmountField(title: "金額", value: $p.splits[i].amount)
                        }
                    }
                    .onDelete { p.splits.remove(atOffsets: $0) }
                    Button { p.splits.append(LargeExpensePart(paymentMethod: "other", paymentId: "", amount: max(0, p.amount - splitTotal))) } label: { Label("支払い方法を追加", systemImage: "plus") }
                } else {
                    PaymentPicker(method: $p.paymentMethod, paymentId: $p.paymentId)
                }
            } header: { Text("支払い方法") } footer: {
                if split && splitTotal != p.amount { Text("分割の合計 \(splitTotal.yen) が金額 \(p.amount.yen) と合っていません。").foregroundStyle(.red) }
                else { Text("必須の計画は、支払い予定と資金見通しに入ります。カード払いはそのカードの請求に「予定」として加わります。") }
            }
            Section("メモ") { TextField("任意", text: $p.memo, axis: .vertical) }
            if planId != nil {
                Section("状態") {
                    Picker("状態", selection: $p.status) { Text("予定").tag("planned"); Text("延期").tag("postponed"); Text("中止").tag("cancelled"); if p.status == "completed" { Text("支払済み").tag("completed") } }
                    if p.status == "planned" { Button { confirmComplete = true } label: { Label("支払った（支出として記録）", systemImage: "checkmark.circle") } }
                }
                Section { Button("この計画を削除", role: .destructive) { confirmDelete = true } }
            }
        }
        .navigationTitle(planId == nil ? "大型支出を計画" : "大型支出計画")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if planId == nil { ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } } }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") { save() }.bold().disabled(p.name.trimmingCharacters(in: .whitespaces).isEmpty || p.amount <= 0 || (split && splitTotal != p.amount))
            }
        }
        .confirmationDialog("支出として記録しますか？", isPresented: $confirmComplete, titleVisibility: .visible) {
            Button("記録する") {
                save(close: false)
                let id = p.id
                model.change("大型支出の完了") { doc, now, today in doc.completeLargeExpense(id, now: now, today: today) }
                model.done("支出として登録しました"); dismiss()
            }
        } message: { Text("\(Format.dayLabel(p.date))の支出として、支払い方法ごとに記録します。") }
        .confirmationDialog("この計画を削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("削除", role: .destructive) {
                model.commit("大型支出の削除") { $0.largeExpensePlans = $0.largeExpensePlans.filter { $0.id != planId } }
                model.done("計画を削除しました"); dismiss()
            }
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            if let id = planId, let x = doc.largeExpensePlans.first(where: { $0.id == id }) { p = x; split = !x.splits.isEmpty }
            else { p.date = Dates.addDays(model.today, 14); p.priority = "required"; p.category = doc.categories.last?.name ?? "その他" }
        }
        .onChange(of: split) { _, on in if on && p.splits.isEmpty { p.splits = [LargeExpensePart(paymentMethod: p.paymentMethod, paymentId: p.paymentId, amount: p.amount)] } }
    }

    private func save(close: Bool = true) {
        var x = p
        x.name = x.name.trimmingCharacters(in: .whitespaces)
        if !split { x.splits = [] } else if let first = x.splits.first { x.paymentMethod = first.paymentMethod; x.paymentId = first.paymentId }
        model.change(planId == nil ? "大型支出の計画" : "大型支出の編集") { doc, now, _ in
            var list = doc.largeExpensePlans
            if let i = list.firstIndex(where: { $0.id == x.id && !x.id.isEmpty }) { list[i] = x }
            else {
                x.id = MoneyDocument.uid("large", now: now)
                var raw = x.json.objectValue ?? [:]; raw["createdAt"] = .string(ISODate.now(now)); raw["tagIds"] = .array([])
                x = LargeExpensePlan(json: .object(raw)); list.append(x)
            }
            doc.largeExpensePlans = list
        }
        p = x
        if close { model.done("大型支出を保存しました"); dismiss() }
    }
}

/// 大型支出の詳細（Web 版 openLargeExpenseDetail：概要・ACFへの影響・編集・完了・削除）
/// Web 版は「入れた場合」の数字だけだが、こちらは入れない場合と並べて差を出す。
struct LargeExpenseDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var planId: String
    @State private var editing = false
    @State private var confirmComplete = false
    @State private var confirmDelete = false
    @State private var impact: (with: AcfForecast, without: AcfForecast)?

    var body: some View {
        let doc = model.doc
        if let p = doc.largeExpensePlans.first(where: { $0.id == planId }) {
            let parts = doc.largeExpenseParts(p)
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Text(p.priority == "required" ? "必須" : "検討中")
                                .font(.caption.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3)
                                .background((p.priority == "required" ? Color.pink : Color.orange).opacity(0.15), in: Capsule())
                                .foregroundStyle(p.priority == "required" ? .pink : .orange)
                            Text(p.statusLabel).font(.caption).foregroundStyle(.secondary)
                        }
                        Text(p.name.isEmpty ? "大型支出" : p.name).font(.title3.weight(.semibold))
                        MoneyText(value: p.amount, size: 36, weight: .heavy)
                        Text(p.date.isEmpty ? "日付未定" : "\(Format.dayLabel(p.date))・\(daysUntilText(p.date, today: model.today))")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
                Section("内容") {
                    LabeledContent("カテゴリ", value: p.category.isEmpty ? "—" : p.category)
                    LabeledContent("支払い方法", value: doc.largeExpensePaymentLabel(p))
                    LabeledContent("メモ", value: p.memo.isEmpty ? "—" : p.memo)
                }
                if parts.count > 1 {
                    Section("支払いの内訳（\(parts.count)件）") {
                        ForEach(Array(parts.enumerated()), id: \.offset) { i, part in
                            let tx = doc.largeExpensePartTransaction(p, part: part, index: i)
                            LabeledContent {
                                Text(part.amount.yen).monospacedDigit()
                            } label: {
                                Text(doc.paymentLabel(method: part.paymentMethod, id: part.paymentId))
                                Text(tx == nil ? "未記録" : "記録済み").font(.caption).foregroundStyle(tx == nil ? Color.secondary : Color.green)
                            }
                        }
                    }
                }
                if p.status == "planned" && !p.date.isEmpty && p.date < model.today {
                    Section {
                        Label("予定日を過ぎています。支払ったら「実際の支出として登録して完了」、まだなら日付を変えてください。予定日を過ぎた計画は ACF の見通しに入りません。", systemImage: "calendar.badge.exclamationmark")
                            .font(.footnote).foregroundStyle(.orange)
                    }
                } else if p.status == "planned" {
                    Section {
                        if let impact {
                            impactView(impact.with, impact.without)
                        } else {
                            VStack(alignment: .leading, spacing: 10) {
                                ForEach(0..<3, id: \.self) { _ in HStack { SkeletonBar(width: 90); Spacer(); SkeletonBar(width: 70); SkeletonBar(width: 80) } }
                            }
                            .padding(.vertical, 4).shimmer()
                        }
                    } header: { Text("ACFへの影響") } footer: {
                        Text(p.priority == "required" ? "この計画を入れた場合と入れない場合の見通しです。" : "検討中の計画は通常ACFに含みません。必須にした場合の見通しと比べています。")
                    }
                }
                Section {
                    Button { editing = true } label: { Label("編集", systemImage: "pencil") }
                    if p.status == "planned" {
                        Button { confirmComplete = true } label: { Label("実際の支出として登録して完了", systemImage: "checkmark.circle") }
                    }
                    Button(role: .destructive) { confirmDelete = true } label: { Label("削除", systemImage: "trash") }
                }
            }
            .navigationTitle("大型支出計画")
            .navigationBarTitleDisplayMode(.inline)
            .task(id: "\(model.revision)|\(model.today)") { await computeImpact(p) }
            .sheet(isPresented: $editing) { NavigationStack { LargeExpenseEditor(planId: planId) } }
            .alert("実際の支出として登録しますか？", isPresented: $confirmComplete) {
                Button("キャンセル", role: .cancel) {}
                Button("登録") {
                    model.change("大型支出の完了") { doc, now, today in doc.completeLargeExpense(planId, now: now, today: today) }
                    model.done("\(p.name.isEmpty ? "大型支出" : p.name) を支出として記録しました")
                }
            } message: { Text("計画は完了になり、ACFで計画と取引を二重に数えません。") }
            .alert("大型支出計画を削除しますか？", isPresented: $confirmDelete) {
                Button("キャンセル", role: .cancel) {}
                Button("削除", role: .destructive) {
                    model.commit("大型支出の削除") { $0.largeExpensePlans = $0.largeExpensePlans.filter { $0.id != planId } }
                    model.done("計画を削除しました")
                    dismiss()
                }
            } message: { Text("実際の取引は削除しません。") }
        } else {
            ContentUnavailableView("計画が見つかりません", systemImage: "cart")
        }
    }

    private func computeImpact(_ p: LargeExpensePlan) async {
        guard p.status == "planned" else { return }
        let doc = model.doc, today = model.today
        let r = await Task.detached(priority: .userInitiated) { () -> (AcfForecast, AcfForecast) in
            var without = doc
            without.largeExpensePlans = doc.largeExpensePlans.filter { $0.id != p.id }
            var with = without
            var q = p; q.priority = "required"
            with.largeExpensePlans.append(q)
            return (with.acfForecast(today: today, lightweight: true), without.acfForecast(today: today, lightweight: true))
        }.value
        impact = (r.0, r.1)
    }

    @ViewBuilder private func impactView(_ w: AcfForecast, _ wo: AcfForecast) -> some View {
        Grid(alignment: .trailing, horizontalSpacing: 12, verticalSpacing: 8) {
            GridRow {
                Text("").gridColumnAlignment(.leading)
                Text("入れない").font(.caption).foregroundStyle(.secondary)
                Text("入れる").font(.caption.weight(.semibold))
            }
            Divider().gridCellUnsizedAxes(.horizontal)
            impactRow("月末予測", wo.monthEndForecast, w.monthEndForecast, warn: w.monthEndForecast < w.reserveFloor)
            impactRow("最小予測残高", wo.minMandatoryBalance, w.minMandatoryBalance, warn: w.minMandatoryBalance < w.reserveFloor)
            impactRow("今日使える額", wo.remainingToday, w.remainingToday, warn: w.remainingToday <= 0)
        }
        .monospacedDigit()
        .frame(maxWidth: .infinity)
        .padding(.vertical, 4)
        let drop = wo.remainingToday - w.remainingToday
        if w.minMandatoryBalance < w.reserveFloor {
            Label("入れると、守りたい残高 \(w.reserveFloor.yen) を下回る日があります（\(w.minMandatoryDate.isEmpty ? "—" : Format.dayLabel(w.minMandatoryDate))）。", systemImage: "exclamationmark.triangle.fill")
                .font(.footnote).foregroundStyle(.red)
        } else if drop > 0 {
            Label("今日使える額が \(drop.yen) 減ります。守りたい残高は下回りません。", systemImage: "checkmark.shield")
                .font(.footnote).foregroundStyle(.secondary)
        } else {
            Label("守りたい残高は下回りません。", systemImage: "checkmark.shield").font(.footnote).foregroundStyle(.green)
        }
    }
    private func impactRow(_ title: String, _ a: Double, _ b: Double, warn: Bool) -> some View {
        GridRow {
            Text(title).font(.subheadline)
            Text(a.yen).font(.subheadline).foregroundStyle(.secondary)
            VStack(alignment: .trailing, spacing: 0) {
                Text(b.yen).font(.subheadline.weight(.semibold)).foregroundStyle(warn ? .red : .primary)
                if b != a { Text(signedYen(b - a)).font(.caption2).foregroundStyle(b < a ? .red : .green) }
            }
        }
    }
}
