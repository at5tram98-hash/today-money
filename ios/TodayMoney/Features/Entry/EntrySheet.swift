import SwiftUI
import TodayMoneyCore

/// 新規入力の種類（Web 版 ENTRY_MODES）
enum EntryMode: String, CaseIterable, Identifiable {
    case expense, income, bank, salary, card
    var id: String { rawValue }
    var label: String {
        switch self { case .expense: return "支出"; case .income: return "臨時収入"; case .bank: return "残高"; case .salary: return "給与"; case .card: return "カード請求" }
    }
    var symbol: String {
        switch self { case .expense: return "cart.fill"; case .income: return "yensign.circle.fill"; case .bank: return "building.columns.fill"; case .salary: return "briefcase.fill"; case .card: return "creditcard.fill" }
    }
    var color: Color {
        switch self { case .expense: return .orange; case .income: return .green; case .bank: return .blue; case .salary: return .mint; case .card: return .purple }
    }
}

/// 「＋」の新規入力：電卓で金額を入れ、種類ごとに保存する（Web 版 openEntryCalc / entrySave）
struct EntrySheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State var mode: EntryMode
    @State private var expr = ""
    @State private var typed = false
    @State private var date = Dates.ymd()
    @State private var category = ""
    @State private var payMethod = "other"
    @State private var payId = ""
    @State private var merchant = ""
    @State private var toType = "cash"
    @State private var bankId = ""
    @State private var employerId = ""
    @State private var cardId = ""
    @State private var alert: String?
    @State private var next: NextStep?
    @State private var confirmDiscard = false
    @State private var plan: PlanKind?
    @State private var assist: String?
    enum PlanKind: String, Identifiable { case fixed, large; var id: String { rawValue } }

    enum NextStep: Identifiable, Hashable { case salary(String, Double), card(String, Double), detail(Transaction), tempDetail, oneLine
        var id: String { switch self { case .salary: return "s"; case .card: return "c"; case .detail: return "d"; case .tempDetail: return "t"; case .oneLine: return "ol" } }
        static func == (a: NextStep, b: NextStep) -> Bool { a.id == b.id }
        func hash(into h: inout Hasher) { h.combine(id) }
    }

    var amount: Double { Calc.eval(expr) }

    var body: some View {
        NavigationStack { main }
            .interactiveDismissDisabled(typed && amount > 0)
            .onAppear(perform: setup)
            .onChange(of: mode) { old, new in modeChanged(old, new) }
            .selectionFeedback(trigger: mode)
    }

    private func modeChanged(_ old: EntryMode, _ new: EntryMode) {
        if new == .bank, !typed, let b = model.doc.bank(bankId) { expr = String(Int(b.balance.rounded())) }
        else if old == .bank, !typed { expr = "" }
        if new != .expense && old == .expense && !typed { merchant = "" }
    }

    private var main: some View {
        layout
            .navigationTitle("新規入力")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { toolbar }
            .confirmationDialog("入力した金額を破棄しますか？", isPresented: $confirmDiscard, titleVisibility: .visible) {
                Button("破棄", role: .destructive) { dismiss() }
            }
            .alert(alert ?? "", isPresented: Binding(get: { alert != nil }, set: { if !$0 { alert = nil } })) { Button("OK") {} }
            .navigationDestination(item: $next) { step in destination(step) }
    }

    @ViewBuilder private func destination(_ step: NextStep) -> some View {
        switch step {
        case .salary(let emp, let gross): SalaryRecordEditor(recordId: nil, newEmployerId: emp, newGross: gross, onDone: { dismiss() })
        case .card(let card, let amount): CardBillingEditor(cardId: card, billingMonth: nil, prefillAmount: amount, onDone: { dismiss() })
        case .detail(let t): TransactionEditor(draft: t, isNew: true, onDone: { dismiss() })
        case .tempDetail: TempIncomeEditor(tempId: nil, prefillAmount: amount, prefillDate: date, onDone: { dismiss() })
        case .oneLine: QuickLineView()
        }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button("閉じる") { if typed && amount > 0 { confirmDiscard = true } else { dismiss() } }
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Section("予定を追加") {
                    Button { plan = .fixed } label: { Label("固定支払いを追加", systemImage: "repeat") }
                    Button { plan = .large } label: { Label("大型支出を計画", systemImage: "cart") }
                }
            } label: { Label("予定", systemImage: "calendar") }
        }
        ToolbarItem(placement: .confirmationAction) {
            Button("保存") { save() }.fontWeight(.semibold)
        }
    }

    private var layout: some View {
            VStack(spacing: 12) {
                Picker("入力の種類", selection: $mode) {
                    ForEach(EntryMode.allCases) { m in Label(m.label, systemImage: m.symbol).tag(m) }
                }
                .pickerStyle(.segmented)
                .padding(.horizontal)
                display
                context
                Spacer(minLength: 0)
                HStack(spacing: 8) {
                    ForEach([("discount", "割引", "tag"), ("add", "％を加算", "percent"), ("split", "割り勘", "person.2")], id: \.0) { k, l, sym in
                        Button { assist = k } label: { Label(l, systemImage: sym).font(.footnote.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 7).background(mode.color.opacity(0.12), in: Capsule()).foregroundStyle(mode.color) }
                            .buttonStyle(.plain).disabled(amount <= 0)
                    }
                }.padding(.horizontal)
                Keypad(expr: $expr, typed: $typed, tint: mode.color)
                    .padding(.horizontal)
                    .padding(.bottom, 8)
            }
            .sheet(item: Binding(get: { assist.map(IdBox.init) }, set: { assist = $0?.id })) { k in
                NavigationStack { CalcAssistSheet(base: amount, kind: k.id) { v in expr = String(Int(v)); typed = true } }.presentationDetents([.medium])
            }
            .sheet(item: $plan) { p in
                NavigationStack { if p == .fixed { FixedPaymentEditor(fixedId: nil) } else { LargeExpenseEditor(planId: nil) } }
            }
    }

    private var display: some View {
        let isExpr = expr.contains { "+-×÷".contains($0) }
        return VStack(alignment: .trailing, spacing: 4) {
            Text(isExpr ? expr : " ").font(.callout.monospacedDigit()).foregroundStyle(.secondary).lineLimit(1)
            HStack(alignment: .firstTextBaseline) {
                Text(mode.label).font(.subheadline.weight(.semibold)).foregroundStyle(mode.color)
                Spacer()
                MoneyText(value: amount, size: 52, weight: .bold)
            }
            Text(hint).font(.footnote).foregroundStyle(.secondary)
        }
        .padding(.horizontal, 20)
        .contentShape(Rectangle())
        .gesture(DragGesture(minimumDistance: 30).onEnded { v in
            guard abs(v.translation.width) > 50, abs(v.translation.width) > abs(v.translation.height) * 1.5 else { return }
            let all = EntryMode.allCases, i = all.firstIndex(of: mode)!
            mode = all[(i + (v.translation.width < 0 ? 1 : -1) + all.count) % all.count]
        })
        .accessibilityElement(children: .combine)
    }

    private var hint: String {
        switch mode {
        case .bank: if let b = model.doc.bank(bankId) { return "現在の残高 \(b.balance.yen)・入力した金額に置き換えます" }; return "口座の残高"
        case .salary: return "保存すると給与の記録を開きます（総支給額）"
        case .card: return "保存すると請求の記録を開きます"
        case .income: return "給与以外の入金"
        case .expense: return "使った金額"
        }
    }

    @ViewBuilder private var context: some View {
        let doc = model.doc
        switch mode {
        case .expense:
            VStack(spacing: 8) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(doc.categories) { c in
                            Chip(on: c.name == category) { category = c.name } label: {
                                Circle().fill(Color(hex: c.color)).frame(width: 8, height: 8); Text(c.name)
                            }
                        }
                        Divider().frame(height: 22)
                        Chip(on: false) { next = .detail(draftTransaction()) } label: { Image(systemName: "list.bullet"); Text("詳細入力") }
                        Chip(on: false) { next = .oneLine } label: { Image(systemName: "text.line.first.and.arrowtriangle.forward"); Text("一行入力") }
                        ForEach(Array(recentTemplates.enumerated()), id: \.offset) { _, r in
                            Chip(on: false) {
                                expr = String(Int(r.amount)); category = r.category; payMethod = r.paymentMethod; payId = r.paymentId; merchant = r.merchant; typed = true
                            } label: { Text("\(r.merchant) \(r.amount.yen)") }
                        }
                    }
                    .padding(.horizontal)
                }
                HStack(spacing: 8) {
                    DateChip(date: $date, today: model.today)
                    Menu {
                        ForEach(PaymentChoice.all(doc)) { c in
                            Button { payMethod = c.method; payId = c.id } label: { Label(c.label, systemImage: c.key == "\(payMethod)|\(payId)" ? "checkmark" : c.symbol) }
                        }
                    } label: {
                        Label(PaymentChoice.all(doc).first { $0.key == "\(payMethod)|\(payId)" }?.label ?? "現金・その他", systemImage: "creditcard")
                            .lineLimit(1).font(.subheadline).padding(.horizontal, 10).padding(.vertical, 7)
                            .background(.quaternary.opacity(0.6), in: Capsule())
                    }
                    TextField("店名・メモ", text: $merchant)
                        .font(.subheadline).padding(.horizontal, 10).padding(.vertical, 7)
                        .background(.quaternary.opacity(0.6), in: Capsule())
                }
                .padding(.horizontal)
            }
        case .income:
            VStack(spacing: 8) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        Chip(on: toType == "cash") { toType = "cash" } label: { Text("手持ち・未入金") }
                        ForEach(doc.banks) { b in
                            Chip(on: toType == "bank" && bankId == b.id) { toType = "bank"; bankId = b.id } label: { Image(systemName: "building.columns"); Text(b.name) }
                        }
                        Divider().frame(height: 22)
                        Chip(on: false) { next = .tempDetail } label: { Image(systemName: "list.bullet"); Text("詳細入力") }
                    }
                    .padding(.horizontal)
                }
                HStack(spacing: 8) {
                    DateChip(date: $date, today: model.today)
                    TextField("収入源（例：単発バイト・返金）", text: $merchant)
                        .font(.subheadline).padding(.horizontal, 10).padding(.vertical, 7)
                        .background(.quaternary.opacity(0.6), in: Capsule())
                }
                .padding(.horizontal)
            }
        case .bank:
            if doc.banks.isEmpty { empty("銀行口座がありません。「その他」→「口座とカード」で追加できます。") } else {
                chips(doc.banks.map { ($0.id, $0.name, "building.columns") }, selected: bankId) { id in
                    bankId = id
                    if !typed, let b = model.doc.bank(id) { expr = String(Int(b.balance.rounded())) }
                }
            }
        case .salary:
            if doc.employers.isEmpty { empty("勤務先がありません。「その他」→「給与・勤務先」で追加できます。") } else {
                VStack(alignment: .leading, spacing: 8) {
                    chips(doc.employers.map { ($0.id, $0.name, "briefcase") }, selected: employerId) { employerId = $0 }
                }
            }
        case .card:
            if doc.cards.isEmpty { empty("クレジットカードがありません。「その他」→「口座とカード」で追加できます。") } else {
                chips(doc.cards.map { ($0.id, $0.name, "creditcard") }, selected: cardId) { cardId = $0 }
            }
        }
    }

    private func chips(_ items: [(String, String, String)], selected: String, pick: @escaping (String) -> Void) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(items, id: \.0) { id, name, sym in
                    Chip(on: id == selected) { pick(id) } label: { Image(systemName: sym); Text(name) }
                }
            }
            .padding(.horizontal)
        }
    }
    private func empty(_ text: String) -> some View {
        Text(text).font(.footnote).foregroundStyle(.secondary).padding(.horizontal)
    }

    /// 最近の支出（同じ店・金額をすぐ入れられる。Web 版 recentExpenseTemplates）
    private var recentTemplates: [Transaction] {
        var seen = Set<String>(), out: [Transaction] = []
        for t in model.doc.transactions.sorted(by: { ($0.createdAt.isEmpty ? $0.date : $0.createdAt) > ($1.createdAt.isEmpty ? $1.date : $1.createdAt) })
        where t.amount > 0 && !t.merchant.isEmpty && t.source != "fixed" {
            let k = "\(t.merchant)|\(t.amount)"
            if seen.insert(k).inserted { out.append(t) }
            if out.count == 4 { break }
        }
        return out
    }

    private func setup() {
        let doc = model.doc
        date = model.today
        let recent = doc.transactions.filter { $0.source == "manual" || $0.source.isEmpty }.max { ($0.createdAt, $0.date) < ($1.createdAt, $1.date) }
        category = recent?.category ?? doc.categories.first?.name ?? "その他"
        if let r = recent { payMethod = r.paymentMethod.isEmpty ? "other" : r.paymentMethod; payId = r.paymentId }
        bankId = doc.banks.first?.id ?? ""
        employerId = doc.employers.first?.id ?? ""
        cardId = doc.cards.first?.id ?? ""
        if mode == .bank, let b = doc.bank(bankId) { expr = String(Int(b.balance.rounded())) }
    }

    private func draftTransaction() -> Transaction {
        var t = Transaction(id: "")
        t.date = date; t.amount = amount; t.category = category; t.merchant = merchant.trimmingCharacters(in: .whitespaces)
        t.paymentMethod = payMethod; t.paymentId = payId
        return t
    }

    private func save() {
        let a = amount
        if [.expense, .income, .salary, .card].contains(mode) && a <= 0 { alert = "金額を入力してください"; return }
        switch mode {
        case .expense:
            let m = merchant.trimmingCharacters(in: .whitespaces)
            model.change("支出の記録") { d, now, today in
                d.recordExpense(date: date, amount: a, category: category, merchant: m.isEmpty ? category : m, paymentMethod: payMethod, paymentId: payId, now: now, today: today)
            }
            model.done("\(category) \(a.yen) を記録しました")
            dismiss()
        case .income:
            if toType == "bank" && model.doc.bank(bankId) == nil { alert = "入金先の口座を選んでください"; return }
            let src = merchant.trimmingCharacters(in: .whitespaces)
            model.change("臨時収入の記録") { d, now, today in
                d.recordTempIncome(date: date, amount: a, sourceName: src.isEmpty ? "臨時収入" : src, toType: toType, bankId: bankId, now: now, today: today)
            }
            model.done("臨時収入 \(a.yen) を記録しました")
            dismiss()
        case .bank:
            guard let b = model.doc.bank(bankId) else { alert = "「その他」→「口座とカード」で口座を追加してください。"; return }
            model.change("残高の更新") { d, now, today in d.reconcileBankBalance(b.id, balance: a, memo: "残高の更新", now: now, today: today) }
            model.done("\(b.name)の残高を \(a.yen) にしました")
            dismiss()
        case .salary:
            guard !model.doc.employers.isEmpty else { alert = "「その他」→「給与・勤務先」で勤務先を追加してください。"; return }
            next = .salary(employerId, a)
        case .card:
            guard !model.doc.cards.isEmpty else { alert = "「その他」→「口座とカード」でカードを追加してください。"; return }
            next = .card(cardId, a)
        }
    }
}

/// 選択できる小さなカプセル
struct Chip<L: View>: View {
    var on: Bool
    var action: () -> Void
    @ViewBuilder var label: L
    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) { label }
                .font(.subheadline.weight(on ? .semibold : .regular))
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(on ? AnyShapeStyle(Color.accentColor.opacity(0.18)) : AnyShapeStyle(.quaternary.opacity(0.6)), in: Capsule())
                .overlay(Capsule().strokeBorder(on ? Color.accentColor : .clear, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// 日付のカプセル（今日なら「今日」）
struct DateChip: View {
    @Binding var date: String
    var today: String
    @State private var picking = false
    var body: some View {
        Button { picking = true } label: {
            Label(date == today ? "今日" : Format.shortDay(date), systemImage: "calendar")
                .font(.subheadline).padding(.horizontal, 10).padding(.vertical, 7)
                .background(.quaternary.opacity(0.6), in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("日付 \(Format.dayLabel(date))")
        .popover(isPresented: $picking) {
            DatePicker("日付", selection: Binding(get: { Dates.date(date) }, set: { date = Dates.ymd($0); picking = false }), displayedComponents: .date)
                .datePickerStyle(.graphical).environment(\.locale, Locale(identifier: "ja_JP"))
                .padding().presentationCompactAdaptation(.popover)
        }
    }
}

/// 電卓のキー（Web 版と同じ配置：C ⌫ ÷ × / 7 8 9 − / 4 5 6 + / 1 2 3 = / 0 00）
struct Keypad: View {
    @Binding var expr: String
    @Binding var typed: Bool
    var tint: Color
    private let rows: [[String]] = [["C", "⌫", "÷", "×"], ["7", "8", "9", "−"], ["4", "5", "6", "+"], ["1", "2", "3", "="], ["0", "00"]]
    var body: some View {
        Grid(horizontalSpacing: 8, verticalSpacing: 8) {
            ForEach(rows.indices, id: \.self) { r in
                GridRow {
                    ForEach(rows[r], id: \.self) { k in
                        key(k).gridCellColumns(k == "0" ? 2 : 1)
                    }
                }
            }
        }
    }
    private func key(_ k: String) -> some View {
        let op = ["÷", "×", "−", "+"].contains(k), eq = k == "=", fn = ["C", "⌫"].contains(k)
        return Button { press(k) } label: {
            Group { if k == "⌫" { Image(systemName: "delete.left") } else { Text(k) } }
                .font(.title2.weight(op || eq ? .semibold : .regular))
                .frame(maxWidth: .infinity, minHeight: 52)
                .foregroundStyle(eq ? .white : op ? tint : .primary)
                .background(eq ? AnyShapeStyle(tint) : fn || op ? AnyShapeStyle(.quaternary) : AnyShapeStyle(.quaternary.opacity(0.5)), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(["C": "すべて消す", "⌫": "1文字消す", "÷": "割る", "×": "掛ける", "−": "引く", "+": "足す", "=": "計算する"][k] ?? k)
        .selectionFeedback(trigger: expr)
    }
    private func press(_ k: String) {
        switch k {
        case "C": expr = ""
        case "⌫": if !expr.isEmpty { expr.removeLast() }
        case "=": expr = String(Int(Calc.eval(expr)))
        case "+", "−", "×", "÷":
            let op = k == "−" ? "-" : k
            guard !expr.isEmpty else { return }
            if let l = expr.last, "+-×÷".contains(l) { expr.removeLast() }
            expr += op
        default:
            let next = (expr == "0" ? "" : expr) + k
            let last = next.split(whereSeparator: { "+-×÷".contains($0) }).last ?? ""
            if last.count > 9 { return }
            var n = next
            while n.count > 1, n.hasPrefix("0"), let s = n.dropFirst().first, s.isNumber { n.removeFirst() }
            expr = n
        }
        typed = true
    }
}

/// 電卓の式を計算する（Web 版 entryEval：× ÷ を先に、結果は 0 以上の整数）
enum Calc {
    static func eval(_ s: String) -> Double {
        var e = s
        while let l = e.last, "+-×÷".contains(l) { e.removeLast() }
        guard !e.isEmpty else { return 0 }
        var nums: [Double] = [], ops: [Character] = [], cur = ""
        for ch in e {
            if "+-×÷".contains(ch) { nums.append(Double(cur) ?? 0); ops.append(ch); cur = "" } else { cur.append(ch) }
        }
        nums.append(Double(cur) ?? 0)
        var terms: [Double] = [nums[0]], addOps: [Character] = []
        for (i, op) in ops.enumerated() {
            let n = nums[i + 1]
            switch op {
            case "×": terms[terms.count - 1] *= n
            case "÷": if n != 0 { terms[terms.count - 1] /= n }
            default: terms.append(n); addOps.append(op)
            }
        }
        var total = terms[0]
        for (i, op) in addOps.enumerated() { total = op == "+" ? total + terms[i + 1] : total - terms[i + 1] }
        return max(0, total.rounded())
    }
}
