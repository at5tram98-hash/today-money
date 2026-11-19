import SwiftUI
import TodayMoneyCore

/// 取引の一覧（Web 版 openTransactionList：月・検索・カテゴリで絞り込み）
struct TransactionListView: View {
    @Environment(AppModel.self) private var model
    var title: String = "すべての取引"
    var month: String? = nil
    var date: String? = nil
    var initialCategory = ""
    /// この取引だけを出す（カードの利用期間など）
    var onlyIds: Set<String>? = nil
    @State private var query = ""
    @State private var category = ""
    @State private var loaded = false

    var body: some View {
        let doc = model.doc
        let base = doc.transactions.filter { t in
            (onlyIds == nil || onlyIds!.contains(t.id)) && (month == nil || t.date.hasPrefix(month!)) && (date == nil || t.date == date!) && (category.isEmpty || t.category == category)
        }
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        let list = base.filter { q.isEmpty || "\($0.merchant) \($0.category) \($0.memo) \(Int($0.amount))".lowercased().contains(q) }
            .sorted { ($0.date, $0.createdAt) > ($1.date, $1.createdAt) }
        let groups = Dictionary(grouping: list, by: \.date).sorted { $0.key > $1.key }
        List {
            Section {
                LabeledContent("合計（\(list.count)件）", value: list.reduce(0) { $0 + $1.amount }.yen).font(.headline)
            }
            if list.isEmpty { Text(q.isEmpty ? "取引はありません" : "見つかりませんでした").foregroundStyle(.secondary) }
            ForEach(groups, id: \.key) { day, items in
                Section {
                    ForEach(items) { t in NavigationLink { TransactionEditor(draft: t, isNew: false) } label: { TransactionRow(t: t) }.transactionActions(t) }
                } header: {
                    HStack { Text(Format.dayLabel(day)); Spacer(); Text(items.reduce(0) { $0 + $1.amount }.yen).monospacedDigit() }
                }
            }
        }
        .searchable(text: $query, prompt: "店名・カテゴリ・メモ・金額")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("カテゴリ", selection: $category) {
                        Text("すべて").tag("")
                        ForEach(doc.categories) { Text($0.name).tag($0.name) }
                    }
                } label: { Image(systemName: category.isEmpty ? "line.3.horizontal.decrease.circle" : "line.3.horizontal.decrease.circle.fill") }
                .accessibilityLabel("カテゴリで絞り込む")
            }
        }
        .navigationTitle(title)
        .onAppear { if !loaded { category = initialCategory; loaded = true } }
    }
}

/// 支出の詳細入力・編集（Web 版 openQuickExpense と取引の編集）
struct TransactionEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State var draft: Transaction
    var isNew: Bool
    var onDone: (() -> Void)? = nil
    @State private var confirmDelete = false
    @State private var refund = false

    var body: some View {
        let doc = model.doc
        Form {
            Section("支出") {
                TextField("支出先（例：マクドナルド）", text: $draft.merchant)
                    .onChange(of: draft.merchant) { _, v in if isNew { learn(v) } }
                Picker("カテゴリ", selection: $draft.category) { ForEach(doc.categories) { c in Label(c.name, systemImage: CategoryStyle.symbol(c.icon)).tag(c.name) } }
                PaymentPicker(method: $draft.paymentMethod, paymentId: $draft.paymentId)
                AmountField(title: refund ? "返金額" : "支出額", value: Binding(get: { abs(draft.amount) }, set: { draft.amount = $0 }))
                YMDPicker(title: "日付", value: $draft.date)
                if !isNew { Toggle("返金（マイナスの支出）", isOn: $refund) }
            }
            Section("メモ") { TextField("任意", text: $draft.memo, axis: .vertical) }
            if !isNew {
                Section {
                    if draft.bankApplied { Label("口座残高に反映済み", systemImage: "checkmark.circle").foregroundStyle(.secondary) }
                    else if draft.bankReconciled { Label("口座の残高に含まれている扱い", systemImage: "checkmark.circle").foregroundStyle(.secondary) }
                    if draft.source == "fixed" { Label("固定支払いから自動で記録", systemImage: "repeat").foregroundStyle(.secondary) }
                    if draft.source == "large_plan" { Label("大型支出の計画から記録", systemImage: "cart").foregroundStyle(.secondary) }
                    if !draft.createdAt.isEmpty, let ms = ISODate.ms(draft.createdAt) {
                        LabeledContent("記録した日時", value: Date(timeIntervalSince1970: ms / 1000).formatted(date: .abbreviated, time: .shortened))
                    }
                }
                Section { Button("この取引を削除", role: .destructive) { confirmDelete = true } }
            } else {
                Section { Text("\(Format.dayLabel(draft.date))の実績として保存します。口座・デビット払いは残高から差し引きます（未来の日付はその日になってから）。").font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle(isNew ? "支出を入力" : "取引の詳細")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold().disabled(draft.amount == 0) } }
        .confirmationDialog("この取引を削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("削除", role: .destructive) {
                let id = draft.id
                model.change("支出の削除") { d, now, today in d.deleteTransaction(id, now: now, today: today) }
                model.done("削除しました"); finish()
            }
        } message: { Text(draft.bankApplied ? "口座残高に反映した分は元に戻します。" : "削除する前の状態は復元ポイントに残ります。") }
        .onAppear { refund = draft.amount < 0 }
    }

    /// 同じ店の前回のカテゴリ・支払い方法を使う（Web 版 merchant.oninput）
    private func learn(_ v: String) {
        let key = MoneyDocument.merchantKey(v)
        guard !key.isEmpty, let m = model.doc.transactions.sorted(by: { $0.createdAt > $1.createdAt }).first(where: { MoneyDocument.merchantKey($0.merchant) == key }) else { return }
        draft.category = m.category; draft.paymentMethod = m.paymentMethod; draft.paymentId = m.paymentId
    }
    private func save() {
        var t = draft
        t.merchant = t.merchant.trimmingCharacters(in: .whitespaces)
        t.amount = refund ? -abs(t.amount) : abs(t.amount)
        if isNew {
            model.change("支出の記録") { d, now, today in
                d.recordExpense(date: t.date, amount: t.amount, category: t.category, merchant: t.merchant.isEmpty ? "支出" : t.merchant,
                                paymentMethod: t.paymentMethod, paymentId: t.paymentId, memo: t.memo, now: now, today: today)
            }
            model.done("支出を保存しました")
        } else {
            model.change("取引の編集") { d, now, today in d.updateTransaction(t, now: now, today: today) }
            model.done("取引を更新しました")
        }
        finish()
    }
    private func finish() { if let onDone { onDone() } else { dismiss() } }
}

/// 臨時収入の詳細入力・編集（Web 版 openTempIncome）
struct TempIncomeEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var tempId: String?
    var prefillAmount: Double = 0
    var prefillDate: String = ""
    var onDone: (() -> Void)? = nil
    @State private var amount = 0.0
    @State private var date = Dates.ymd()
    @State private var source = ""
    @State private var toType = "cash"
    @State private var bankId = ""
    @State private var memo = ""
    @State private var received = false
    @State private var loaded = false
    @State private var confirmDelete = false

    var body: some View {
        let doc = model.doc
        Form {
            Section("臨時収入") {
                TextField("収入源（例：単発バイト・返金）", text: $source)
                AmountField(title: "金額", value: $amount)
                YMDPicker(title: "入金日", value: $date)
                Picker("入金先", selection: Binding(get: { toType == "bank" ? bankId : "" }, set: { v in toType = v.isEmpty ? "cash" : "bank"; bankId = v })) {
                    Text("手持ち・未入金").tag("")
                    ForEach(doc.banks) { Text($0.name).tag($0.id) }
                }
                .disabled(tempId != nil)
            }
            Section("メモ") { TextField("任意", text: $memo, axis: .vertical) }
            if let tempId {
                Section {
                    Toggle("受け取った", isOn: $received)
                } footer: { Text(toType == "bank" ? "受け取ると、入金先の口座残高に足します。" : "手持ちの収入として記録します。") }
                Section { Button("この臨時収入を削除", role: .destructive) { confirmDelete = true } }
                    .confirmationDialog("この臨時収入を削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
                        Button("削除", role: .destructive) {
                            model.change("臨時収入の削除") { d, now, today in d.deleteTempIncome(tempId, now: now, today: today) }
                            finish()
                        }
                    }
            }
        }
        .navigationTitle(tempId == nil ? "臨時収入" : "臨時収入を編集")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold().disabled(amount <= 0) } }
        .onAppear {
            guard !loaded else { return }; loaded = true
            amount = prefillAmount; if !prefillDate.isEmpty { date = prefillDate }
            bankId = doc.banks.first?.id ?? ""
            if let id = tempId, let t = doc.tempIncomes.first(where: { $0.id == id }) {
                amount = t.amount; date = t.date; source = t.sourceName; received = doc.status(t, today: model.today) == .received
                memo = str(t.raw["memo"]); let tt = str(t.raw["toType"]); toType = tt.isEmpty ? "cash" : tt
                let b = str(t.raw["bankId"]); if !b.isEmpty { bankId = b }
            }
        }
    }
    private func save() {
        let (a, d, s, ty, b, m, r) = (amount, date, source.trimmingCharacters(in: .whitespaces), toType, bankId, memo, received)
        if let id = tempId {
            model.change("臨時収入の編集") { doc, now, today in
                var temps = doc.tempIncomes
                if let i = temps.firstIndex(where: { $0.id == id }) {
                    temps[i].amount = a; temps[i].date = d; temps[i].sourceName = s.isEmpty ? "臨時収入" : s
                    var raw = temps[i].json.objectValue ?? [:]; raw["memo"] = .string(m)
                    temps[i] = TempIncome(json: .object(raw)); doc.tempIncomes = temps
                    var incs = doc.incomes
                    if let j = incs.firstIndex(where: { $0.tempIncomeId == id }), !incs[j].bankApplied { incs[j].amount = a; incs[j].date = d; incs[j].sourceName = temps[i].sourceName; doc.incomes = incs }
                }
                doc.confirmTempIncome(id, received: r, now: now, today: today)
            }
            model.done("臨時収入を更新しました")
        } else {
            model.change("臨時収入の記録") { doc, now, today in
                doc.recordTempIncome(date: d, amount: a, sourceName: s.isEmpty ? "臨時収入" : s, toType: ty, bankId: b, memo: m, now: now, today: today)
            }
            model.done("臨時収入 \(a.yen) を記録しました")
        }
        finish()
    }
    private func finish() { if let onDone { onDone() } else { dismiss() } }
}
