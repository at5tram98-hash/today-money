import SwiftUI
import TodayMoneyCore

/// 口座とカード（Web 版 openAccountsSettings：銀行口座・クレジットカード・デビットカードの追加と編集）
struct AccountsView: View {
    @Environment(AppModel.self) private var model
    @State private var sheet: Sheet?
    enum Sheet: Identifiable { case bank(String?), card(String?), debit(String?)
        var id: String { switch self { case .bank(let i): return "b\(i ?? "")"; case .card(let i): return "c\(i ?? "")"; case .debit(let i): return "d\(i ?? "")" } }
    }
    var body: some View {
        let doc = model.doc
        List {
            Section {
                ForEach(doc.banks) { b in
                    Button { sheet = .bank(b.id) } label: {
                        LabeledContent {
                            Text(b.balance.yen).monospacedDigit()
                        } label: {
                            Label { Text(b.name).foregroundStyle(.primary); if !b.label.isEmpty { Text(b.label) } } icon: { Image(systemName: "building.columns.fill").foregroundStyle(.blue) }
                        }
                    }
                }
                .onMove { from, to in model.commit("口座の並べ替え") { var l = $0.banks; l.move(fromOffsets: from, toOffset: to); $0.banks = l } }
                .tint(.primary)
                Button { sheet = .bank(nil) } label: { Label("銀行口座を追加", systemImage: "plus") }
            } header: { Text("銀行口座") }
            Section {
                ForEach(doc.cards) { c in
                    Button { sheet = .card(c.id) } label: {
                        LabeledContent {
                            Text([c.closingDay?.label, c.dueDay.map { "\($0)日払い" }].compactMap { $0 }.joined(separator: "・")).font(.caption)
                        } label: {
                            Label { Text(c.name).foregroundStyle(.primary); Text("引落 \(doc.bank(c.bankId)?.name ?? "未設定")") } icon: { Image(systemName: "creditcard.fill").foregroundStyle(.purple) }
                        }
                    }
                }
                .onMove { from, to in model.commit("カードの並べ替え") { var l = $0.cards; l.move(fromOffsets: from, toOffset: to); $0.cards = l } }
                .tint(.primary)
                Button { sheet = .card(nil) } label: { Label("クレジットカードを追加", systemImage: "plus") }
            } header: { Text("クレジットカード") }
            Section {
                ForEach(doc.debitCards) { d in
                    Button { sheet = .debit(d.id) } label: {
                        Label { Text(d.name).foregroundStyle(.primary); Text("紐づく口座 \(doc.bank(d.bankId)?.name ?? "未設定")") } icon: { Image(systemName: "creditcard.and.123").foregroundStyle(.teal) }
                    }
                }
                .tint(.primary)
                Button { sheet = .debit(nil) } label: { Label("デビットカードを追加", systemImage: "plus") }
            } header: { Text("デビットカード") }
        }
        .navigationTitle("口座とカード")
        .toolbar { EditButton() }
        .sheet(item: $sheet) { s in
            NavigationStack {
                switch s {
                case .bank(let id): BankEditor(bankId: id)
                case .card(let id): CardEditor(cardId: id)
                case .debit(let id): DebitEditor(debitId: id)
                }
            }
        }
    }
}

/// 口座・カードを消してよいか（Web 版 financialReferences：使われていたら消さない）
func financialReferences(_ doc: MoneyDocument, type: String, id: String) -> [String] {
    var out: [String] = []
    let txs = doc.transactions
    switch type {
    case "bank":
        let n = txs.filter { ($0.paymentMethod == "bank" && $0.paymentId == id) || $0.linkedBankId == id }.count
        if n > 0 { out.append("この口座を使う支出 \(n)件") }
        for c in doc.cards where c.bankId == id { out.append("引落口座にしているカード「\(c.name)」") }
        for d in doc.debitCards where d.bankId == id { out.append("紐づくデビットカード「\(d.name)」") }
        for f in doc.fixedPayments where f.paymentMethod == "bank" && f.paymentId == id { out.append("固定支払い「\(f.name)」") }
        for e in doc.employers where e.bankId == id { out.append("給与の振込先にしている勤務先「\(e.name)」") }
        if doc.incomes.contains(where: { $0.bankId == id }) { out.append("この口座への入金の記録") }
    case "card":
        let n = txs.filter { $0.paymentMethod == "card" && $0.paymentId == id }.count
        if n > 0 { out.append("このカードの支出 \(n)件") }
        for f in doc.fixedPayments where f.paymentMethod == "card" && f.paymentId == id { out.append("固定支払い「\(f.name)」") }
        for p in doc.largeExpensePlans where doc.largeExpenseParts(p).contains(where: { $0.paymentMethod == "card" && $0.paymentId == id }) { out.append("大型支出「\(p.name)」") }
    case "debit":
        let n = txs.filter { $0.paymentMethod == "debit" && $0.paymentId == id }.count
        if n > 0 { out.append("このデビットカードの支出 \(n)件") }
        for f in doc.fixedPayments where f.paymentMethod == "debit" && f.paymentId == id { out.append("固定支払い「\(f.name)」") }
    default: break
    }
    return out
}

/// 銀行口座の登録・編集（Web 版 openAddBank）
struct BankEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var bankId: String?
    @State private var b = Bank(id: "", name: "")
    @State private var original = 0.0
    @State private var loaded = false
    @State private var confirmDelete = false
    @State private var blocked: [String] = []

    var body: some View {
        Form {
            Section("口座") {
                TextField("銀行名（例：三井住友銀行）", text: $b.name)
                TextField("口座名（普通口座など）", text: $b.label)
                AmountField(title: "現在残高", value: $b.balance)
            }
            Section {
                AmountField(title: "残高アラート", value: $b.threshold)
            } header: { Text("アラート") } footer: {
                Text("残高がこの金額を下回るとお知らせします。残高を保存した時点を基準日時として記録し、それより前の取引で残高を二重に変えません。")
            }
            if bankId != nil { Section { Button("この口座を削除", role: .destructive) { tryDelete() } } }
        }
        .navigationTitle(bankId == nil ? "銀行口座登録" : "銀行口座を編集")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold().disabled(b.name.trimmingCharacters(in: .whitespaces).isEmpty || b.balance < 0) }
        }
        .deleteGuard(blocked: $blocked, confirm: $confirmDelete, title: "この口座を削除しますか？") {
            model.commit("口座の削除") { $0.banks = $0.banks.filter { $0.id != bankId } }
            model.toast = "口座を削除しました"; dismiss()
        }
        .onAppear {
            guard !loaded else { return }; loaded = true
            if let id = bankId, let x = model.doc.bank(id) { b = x; original = x.balance }
        }
    }
    private func tryDelete() {
        blocked = financialReferences(model.doc, type: "bank", id: bankId ?? "")
        if blocked.isEmpty { confirmDelete = true }
    }
    private func save() {
        var x = b; x.name = x.name.trimmingCharacters(in: .whitespaces); x.label = x.label.trimmingCharacters(in: .whitespaces)
        let changed = x.balance != original
        model.change(bankId == nil ? "口座の登録" : "口座の編集") { doc, now, today in
            var list = doc.banks
            if let i = list.firstIndex(where: { $0.id == x.id && !x.id.isEmpty }) {
                let bal = x.balance
                x.balance = list[i].balance; x.updatedAt = ISODate.now(now); list[i] = x; doc.banks = list
                if changed { doc.reconcileBankBalance(x.id, balance: bal, memo: "口座編集", now: now, today: today) }
            } else {
                x.id = MoneyDocument.uid("bank", now: now); x.balanceAsOf = ISODate.now(now); x.updatedAt = x.balanceAsOf
                list.append(x); doc.banks = list
                doc.bankSnapshot(x.id, memo: "口座登録", now: now, today: today)
            }
        }
        model.toast = "口座を保存しました"; dismiss()
    }
}

/// クレジットカードの登録・編集（Web 版 openAddCard：会社・名前・限度額・締め日・引落日・引落口座）
struct CardEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var cardId: String?
    @State private var c = Card(id: "", name: "")
    @State private var closingType = "month_end"
    @State private var closingDay = 15
    @State private var dueSet = true
    @State private var dueDay = 27
    @State private var initialAmount = 0.0
    @State private var initialDate = Dates.ymd()
    @State private var loaded = false
    @State private var confirmDelete = false
    @State private var blocked: [String] = []

    var body: some View {
        let doc = model.doc
        Form {
            Section("カード") {
                TextField("カード会社（例：三井住友カード）", text: $c.company)
                TextField("カード名", text: $c.name)
                AmountField(title: "利用限度額", value: $c.limit)
                AmountField(title: "利用可能額（今わかる値）", value: Binding(get: { c.availableSnapshot ?? 0 }, set: { c.availableSnapshot = $0 }))
            }
            Section {
                Picker("締め日", selection: $closingType) { Text("月末").tag("month_end"); Text("日付").tag("day"); Text("未設定").tag("unset") }.pickerStyle(.segmented)
                if closingType == "day" { Picker("締める日", selection: $closingDay) { ForEach(1...31, id: \.self) { Text("\($0)日").tag($0) } } }
                Toggle("引落日を設定", isOn: $dueSet)
                if dueSet { Picker("引落日", selection: $dueDay) { ForEach(1...31, id: \.self) { Text("\($0)日").tag($0) } } }
                Picker("引落口座", selection: $c.bankId) { Text("未設定").tag(""); ForEach(doc.banks) { Text($0.name).tag($0.id) } }
            } header: { Text("締め日と引落") } footer: {
                Text(example)
            }
            if cardId == nil {
                Section {
                    AmountField(title: "現在の請求額", value: $initialAmount)
                    YMDPicker(title: "この請求の支払日", value: $initialDate)
                } header: { Text("現在の請求を初期登録") } footer: { Text("まだ記録していない、次に引き落とされる請求額があれば入れてください（確定として登録します）。") }
            } else {
                Section { Button("このカードを削除", role: .destructive) { blocked = financialReferences(doc, type: "card", id: cardId ?? ""); if blocked.isEmpty { confirmDelete = true } } }
            }
        }
        .navigationTitle(cardId == nil ? "クレジットカード登録" : "クレジットカードを編集")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold().disabled(c.name.trimmingCharacters(in: .whitespaces).isEmpty) }
        }
        .deleteGuard(blocked: $blocked, confirm: $confirmDelete, title: "このカードを削除しますか？") {
            model.commit("カードの削除") { $0.cards = $0.cards.filter { $0.id != cardId } }
            model.toast = "カードを削除しました"; dismiss()
        }
        .onAppear {
            guard !loaded else { return }; loaded = true
            if let id = cardId, let x = doc.card(id) {
                c = x
                switch x.closingDay { case .monthEnd?: closingType = "month_end"; case .day(let d)?: closingType = "day"; closingDay = min(max(d, 1), 31); case nil: closingType = "unset" }
                dueSet = x.dueDay != nil; dueDay = x.dueDay ?? 27
            } else { c.bankId = doc.banks.first?.id ?? "" }
        }
    }

    private var draft: Card {
        var x = c
        x.closingDay = closingType == "month_end" ? .monthEnd : closingType == "day" ? .day(closingDay) : nil
        x.dueDay = dueSet ? dueDay : nil
        return x
    }
    private var example: String {
        let d = draft, doc = model.doc, m = model.thisMonth
        guard let due = doc.cardPaymentDate(d, billingMonth: m) else { return "引落日を設定すると、支払いの予定に入ります。" }
        let cyc = doc.billingCycle(d, month: m)
        return "例：\(Format.shortDay(cyc.start))〜\(Format.shortDay(cyc.end))の利用 → \(Format.dayLabel(due))に引落"
    }
    private func save() {
        var x = draft
        x.name = x.name.trimmingCharacters(in: .whitespaces)
        if x.company.trimmingCharacters(in: .whitespaces).isEmpty { x.company = x.name }
        let (amount, date) = (initialAmount, initialDate)
        model.change(cardId == nil ? "カードの登録" : "カードの編集") { doc, now, today in
            var list = doc.cards
            if let i = list.firstIndex(where: { $0.id == x.id && !x.id.isEmpty }) { list[i] = x; doc.cards = list }
            else {
                x.id = MoneyDocument.uid("card", now: now); list.append(x); doc.cards = list
                if amount > 0 {
                    // 支払日から請求月を逆算して、確定の請求として登録する（Web 版 openAddCard の初期請求）
                    let bm = doc.billingMonthForPaymentDate(x, date: date)
                    doc.setCardStatement(x.id, billingMonth: bm, amount: amount, paymentDate: date, status: .confirmed, memo: "初期登録", now: now, today: today)
                }
            }
        }
        model.toast = "カードを保存しました"; dismiss()
    }
}

/// デビットカードの登録・編集（Web 版 openAddDebit）
struct DebitEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var debitId: String?
    @State private var d = DebitCard(id: "", name: "", bankId: "")
    @State private var loaded = false
    @State private var confirmDelete = false
    @State private var blocked: [String] = []
    var body: some View {
        Form {
            Section("デビットカード") {
                TextField("カード名（例：Oliveデビットカード）", text: $d.name)
                Picker("紐づく銀行口座", selection: $d.bankId) { Text("未設定").tag(""); ForEach(model.doc.banks) { Text($0.name).tag($0.id) } }
            }
            if debitId != nil { Section { Button("このデビットカードを削除", role: .destructive) { blocked = financialReferences(model.doc, type: "debit", id: debitId ?? ""); if blocked.isEmpty { confirmDelete = true } } } }
        }
        .navigationTitle(debitId == nil ? "デビットカード登録" : "デビットカードを編集")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold().disabled(d.name.trimmingCharacters(in: .whitespaces).isEmpty || d.bankId.isEmpty) }
        }
        .deleteGuard(blocked: $blocked, confirm: $confirmDelete, title: "このデビットカードを削除しますか？") {
            model.commit("デビットカードの削除") { $0.debitCards = $0.debitCards.filter { $0.id != debitId } }
            model.toast = "デビットカードを削除しました"; dismiss()
        }
        .onAppear {
            guard !loaded else { return }; loaded = true
            if let id = debitId, let x = model.doc.debit(id) { d = x } else { d.bankId = model.doc.banks.first?.id ?? "" }
        }
    }
    private func save() {
        var x = d; x.name = x.name.trimmingCharacters(in: .whitespaces)
        model.change(debitId == nil ? "デビットカードの登録" : "デビットカードの編集") { doc, now, _ in
            var list = doc.debitCards
            if let i = list.firstIndex(where: { $0.id == x.id && !x.id.isEmpty }) { list[i] = x }
            else { x.id = MoneyDocument.uid("debit", now: now); list.append(x) }
            doc.debitCards = list
        }
        model.toast = "デビットカードを保存しました"; dismiss()
    }
}

extension View {
    /// 削除の確認。使われている時は理由を出して消さない
    func deleteGuard(blocked: Binding<[String]>, confirm: Binding<Bool>, title: String, onDelete: @escaping () -> Void) -> some View {
        self
            .alert("削除できません", isPresented: Binding(get: { !blocked.wrappedValue.isEmpty }, set: { if !$0 { blocked.wrappedValue = [] } })) {
                Button("OK") {}
            } message: { Text("先に参照先を変更してください。\n" + blocked.wrappedValue.joined(separator: "\n")) }
            .confirmationDialog(title, isPresented: confirm, titleVisibility: .visible) {
                Button("削除", role: .destructive, action: onDelete)
            } message: { Text("削除する前の状態は復元ポイントに残ります。") }
    }
}
