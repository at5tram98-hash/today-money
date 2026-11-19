import SwiftUI
import TodayMoneyCore

/// 金額をまとめて更新（Web 版 openFinancialUpdates）。
/// Web 版は1件ずつ編集画面を開くが、こちらは一覧の中でそのまま打ち、最後に一度だけ保存する。
/// キーボードの上の「次へ」で次の欄へ進めるので、明細を見ながら続けて入力できる。
struct FinancialUpdatesView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// salary / cards / banks
    @State var kind: String
    @State private var month = Dates.ym()
    @State private var drafts: [String: Double] = [:]
    @State private var detail: Sheet?
    @State private var confirmLeave = false
    @FocusState private var focus: String?

    enum Sheet: Identifiable {
        case bank(String), card(String, String), salary(String)
        var id: String { switch self { case .bank(let a): return "b\(a)"; case .card(let a, let b): return "c\(a)\(b)"; case .salary(let a): return "s\(a)" } }
    }

    struct Row: Identifiable {
        var id: String
        var title: String
        var sub: String
        var current: Double
        var tint: Color
        var symbol: String
        var sheet: Sheet
    }

    var body: some View {
        let rows = rows()
        let changed = rows.filter { r in drafts[r.id].map { $0 != r.current } ?? false }
        let delta = changed.reduce(0) { $0 + (drafts[$1.id]! - $1.current) }
        List {
            Section {
                Picker("種類", selection: $kind) {
                    Text("銀行残高").tag("banks"); Text("カード請求").tag("cards"); Text("給与").tag("salary")
                }
                .pickerStyle(.segmented)
                .disabled(!changed.isEmpty)
                if kind != "banks" { MonthSwitcher(month: $month, thisMonth: model.thisMonth).disabled(!changed.isEmpty) }
            } footer: {
                Text(changed.isEmpty ? note : "保存するまで種類と月は切り替えられません。")
            }
            Section {
                if rows.isEmpty { Text("この条件の登録はありません。").foregroundStyle(.secondary) }
                ForEach(rows) { r in rowView(r) }
            } header: {
                HStack {
                    Text(kind == "banks" ? "口座" : kind == "cards" ? "\(Format.monthLabel(month))支払いの請求" : "\(Format.monthLabel(month))の給与")
                    Spacer()
                    Text("合計 \(rows.reduce(0) { $0 + (drafts[$1.id] ?? $1.current) }.yen)").monospacedDigit()
                }
            }
        }
        .navigationTitle("金額を更新")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(!changed.isEmpty)
        .toolbar {
            if !changed.isEmpty {
                ToolbarItem(placement: .cancellationAction) { Button("取り消す") { drafts = [:]; focus = nil } }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") { save(rows) }.bold().disabled(changed.isEmpty)
            }
            ToolbarItemGroup(placement: .keyboard) {
                Button { move(-1, rows) } label: { Image(systemName: "chevron.up") }.disabled(index(rows) == 0)
                Button { move(1, rows) } label: { Image(systemName: "chevron.down") }.disabled(index(rows).map { $0 >= rows.count - 1 } ?? true)
                Spacer()
                if let i = index(rows), i < rows.count - 1 { Button("次へ") { move(1, rows) } } else { Button("完了") { focus = nil }.bold() }
            }
        }
        .safeAreaInset(edge: .bottom) {
            if !changed.isEmpty && focus == nil {
                Button { save(rows) } label: {
                    VStack(spacing: 2) {
                        Text("\(changed.count)件を保存").font(.headline)
                        Text("合計の変化 \(signedYen(delta))").font(.caption).opacity(0.85)
                    }
                    .frame(maxWidth: .infinity).padding(.vertical, 6)
                }
                .buttonStyle(.borderedProminent)
                .padding(.horizontal, 16).padding(.bottom, 8)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(.snappy, value: changed.count)
        .sheet(item: $detail) { s in
            NavigationStack {
                switch s {
                case .bank(let id): BankEditor(bankId: id)
                case .card(let id, let bm): CardBillingEditor(cardId: id, billingMonth: bm, paymentMonth: month)
                case .salary(let id): SalaryRecordEditor(recordId: id)
                }
            }
        }
    }

    private var note: String {
        kind == "salary" ? "入金済みの給与は実際の受取額を、予定の給与は予定額を更新します。"
            : kind == "cards" ? "金額を打つと「確定」として保存します。支払日や支払い状態は右の「…」から変えられます。"
            : "いまの口座残高を打ちます。打った後に記録した取引だけが、この残高から増減します。"
    }

    @ViewBuilder private func rowView(_ r: Row) -> some View {
        let draft = drafts[r.id]
        let diff = (draft ?? r.current) - r.current
        HStack(spacing: 12) {
            Image(systemName: r.symbol).font(.footnote.weight(.semibold)).foregroundStyle(.white)
                .frame(width: 30, height: 30).background(r.tint, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(r.title).lineLimit(1)
                Text(r.sub).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                if diff != 0 {
                    Text("いま \(r.current.yen) → \(signedYen(diff))").font(.caption2.weight(.semibold))
                        .foregroundStyle(diff > 0 ? Color.orange : Color.green).monospacedDigit()
                        .transition(.opacity)
                }
            }
            .layoutPriority(1)
            Spacer(minLength: 8)
            HStack(spacing: 2) {
                Text("¥").foregroundStyle(.secondary)
                AmountInput(value: Binding(get: { drafts[r.id] ?? r.current }, set: { drafts[r.id] = $0 }), font: .title3.weight(.semibold))
                    .multilineTextAlignment(.trailing)
                    .focused($focus, equals: r.id)
                    .frame(width: 118)
            }
            .padding(.horizontal, 10).padding(.vertical, 6)
            .background(focus == r.id ? Color.accentColor.opacity(0.12) : Color(.tertiarySystemFill), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(focus == r.id ? Color.accentColor : .clear, lineWidth: 1.5))
            .contentShape(Rectangle())
            .onTapGesture { focus = r.id }
            Menu {
                Button { detail = r.sheet } label: { Label(kind == "cards" ? "支払日・状態も変える" : "詳しく編集", systemImage: "slider.horizontal.3") }
                if draft != nil { Button { drafts[r.id] = nil } label: { Label("この行を元に戻す", systemImage: "arrow.uturn.backward") } }
            } label: { Image(systemName: "ellipsis.circle").foregroundStyle(.secondary) }
            .accessibilityLabel("\(r.title)のその他の操作")
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .contain)
    }

    private func index(_ rows: [Row]) -> Int? { rows.firstIndex { $0.id == focus } }
    private func move(_ d: Int, _ rows: [Row]) {
        guard let i = index(rows) else { focus = rows.first?.id; return }
        let n = i + d
        if rows.indices.contains(n) { focus = rows[n].id; Feedback.selection() } else { focus = nil }
    }

    private func rows() -> [Row] {
        let doc = model.doc, today = model.today
        switch kind {
        case "banks":
            return doc.banks.map { b in
                Row(id: "b|\(b.id)", title: b.name, sub: b.balanceAsOf.isEmpty ? "残高未確認" : "確認 \(Format.dateTime(b.balanceAsOf))",
                    current: b.balance, tint: .blue, symbol: "building.columns.fill", sheet: .bank(b.id))
            }
        case "cards":
            return doc.cards.flatMap { c -> [Row] in
                let s = doc.statements(c.id, paymentMonth: month)
                let items = s.isEmpty ? [doc.statement(c.id, paymentMonth: month)].compactMap { $0 } : s
                return items.map { st in
                    Row(id: "c|\(c.id)|\(st.billingMonth)", title: c.name,
                        sub: "\(Dates.parts(st.billingMonth + "-01").m)月利用分・\(st.paymentDate.isEmpty ? "" : Format.shortDay(st.paymentDate) + "引落・")\(st.status.label)",
                        current: st.amount, tint: .purple, symbol: "creditcard.fill", sheet: .card(c.id, st.billingMonth))
                }
            }
        default:
            return doc.salaryRecords(payableIn: month).map { r in
                Row(id: "s|\(r.id)", title: doc.employer(r.employerId)?.name ?? "勤務先",
                    sub: "\(Format.shortDay(doc.effectiveDate(r)))・\(doc.status(r, today: today).rawValue)\(r.status == "入金済" ? "・受取額" : "・予定額")",
                    current: doc.expectedOrReceived(r, today: today), tint: .green, symbol: "yensign.circle.fill", sheet: .salary(r.id))
            }
        }
    }

    private func save(_ rows: [Row]) {
        focus = nil
        let edits = rows.compactMap { r -> (String, Double)? in drafts[r.id].flatMap { $0 != r.current ? (r.id, $0) : nil } }
        guard !edits.isEmpty else { return }
        let pm = month
        let ok = model.change("金額をまとめて更新（\(edits.count)件）") { doc, now, today in
            for (id, v) in edits {
                let p = id.split(separator: "|").map(String.init)
                switch p[0] {
                case "b":
                    doc.reconcileBankBalance(p[1], balance: v, memo: "まとめて更新", now: now, today: today)
                case "c":
                    guard let c = doc.card(p[1]) else { continue }
                    let st = doc.statementItem(c, billingMonth: p[2], paymentMonth: pm)
                    let status: StatementStatus = st.status == .paid ? .paid : .confirmed
                    doc.setCardStatement(p[1], billingMonth: p[2], amount: v, paymentDate: st.paymentDate, status: status,
                                         memo: "まとめて更新", balanceMode: "keep", now: now, today: today)
                default:
                    var list = doc.salaryRecords
                    guard let i = list.firstIndex(where: { $0.id == p[1] }) else { continue }
                    if list[i].status == "入金済" { list[i].receivedAmount = v }
                    else { list[i].gross = v; list[i].source = "manual"; list[i].manualAt = ISODate.now(now) }
                    doc.salaryRecords = list
                }
            }
        }
        if ok { drafts = [:]; model.done("\(edits.count)件の金額を更新しました") }
    }
}
