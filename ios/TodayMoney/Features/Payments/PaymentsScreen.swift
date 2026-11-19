import SwiftUI
import Charts
import TodayMoneyCore

/// 支払いタブ（Web 版 renderPayments：これから支払う額・次の引落・カード・詳細）
struct PaymentsScreen: View {
    @Environment(AppModel.self) private var model
    @State private var adding: AddKind?

    enum AddKind: String, Identifiable { case card, debit, fixed, large; var id: String { rawValue } }

    var body: some View {
        @Bindable var model = model
        let doc = model.doc, today = model.today, month = model.paymentMonth
        let s = doc.paymentSummary(month: month, today: today)
        let prev = doc.paymentSummary(month: Dates.addMonths(month, -1), today: today)
        let next = doc.paymentNextCard(s, today: today)
        NavigationStack {
            List {
                if doc.acfStoredSettings.initialized && month == model.thisMonth {
                    PaymentRiskBanner()
                }
                Section {
                    MonthSwitcher(month: $model.paymentMonth, thisMonth: model.thisMonth)
                    VStack(alignment: .leading, spacing: 6) {
                        Text("これから支払う額").font(.subheadline).foregroundStyle(.secondary)
                        MoneyText(value: s.remaining, size: 40, weight: .heavy)
                        if prev.remaining > 0 {
                            let diff = s.remaining - prev.remaining
                            HStack(spacing: 8) {
                                Text(signedYen(diff)); Text(String(format: "%@%.1f%%", diff >= 0 ? "+" : "", diff / prev.remaining * 100)); Text("前月比").foregroundStyle(.secondary)
                            }
                            .font(.footnote.weight(.semibold)).foregroundStyle(diff <= 0 ? .green : .red)
                        } else {
                            Text("前月比較なし").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                    HStack {
                        tile("支払予定の合計", s.total)
                        Divider()
                        tile("支払済み", s.paid)
                    }
                }
                Section {
                    Button { model.openAcf(.overview) } label: {
                        HStack { AcfPaymentsPreview(); Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary) }
                    }
                    .tint(.primary)
                    Button { model.openAcf(.events) } label: { Label("予定の入出金と残高", systemImage: "list.bullet.rectangle") }
                    Button { model.openAcf(.table) } label: { Label("日別資金表", systemImage: "tablecells") }
                } header: { Text("支払い後の資金見通し・ACFセンター") } footer: {
                    Text("給与・振込・カード引落を日別に試算。ACFセンターで、日別資金表・予定・口座ごとの見通し・購入前の試算をまとめて確認できます。")
                }

                Section("次の引落") {
                    if let n = next {
                        NavigationLink { CardDetailView(cardId: n.cardId, paymentMonth: month) } label: {
                            StatementRow(st: n, today: today, showDays: true)
                        }
                    } else {
                        Text("この月の引落予定はありません").foregroundStyle(.secondary)
                    }
                }

                Section {
                    if doc.cards.isEmpty { Text("カードはまだありません").foregroundStyle(.secondary) }
                    ForEach(doc.cards) { c in
                        let items = s.statements.filter { $0.cardId == c.id }
                        NavigationLink { CardDetailView(cardId: c.id, paymentMonth: month) } label: {
                            CardWatchRow(card: c, items: items, series: doc.paymentCardSeries(c.id, month: month))
                        }
                    }
                    NavigationLink { FinancialUpdatesView(kind: "cards") } label: {
                        Label("請求額をまとめて更新", systemImage: "square.and.pencil")
                    }
                    .disabled(doc.cards.isEmpty)
                } header: { Text("カード") }

                Section("詳細") {
                    NavigationLink { FixedPaymentsView(month: month) } label: {
                        detailRow("固定支払い", "repeat", .indigo, value: s.fixedTotal, sub: "\(s.fixedRows.count)件・カード払いはカードの請求に含みます")
                    }
                    NavigationLink { LargeExpensesView() } label: {
                        detailRow("大型支出", "cart.fill", .pink, value: s.largeTotal, sub: "\(s.large.count)件・必須で現金・口座払いの分")
                    }
                    NavigationLink { DebitUsageView(month: month) } label: {
                        detailRow("デビット・口座払い", "creditcard.and.123", .teal, value: s.otherTotal, sub: "カード以外の支出")
                    }
                    NavigationLink { TransactionListView(title: "\(Format.monthLabel(month))の支払い", month: month) } label: {
                        Label("この月の取引をすべて見る", systemImage: "list.bullet")
                    }
                }
            }
            .entryButton()
            .navigationTitle("支払い")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button { adding = .card } label: { Label("クレジットカードを追加", systemImage: "creditcard") }
                        Button { adding = .debit } label: { Label("デビットカードを追加", systemImage: "creditcard.and.123") }
                        Button { adding = .fixed } label: { Label("固定支払いを追加", systemImage: "repeat") }
                        Button { adding = .large } label: { Label("大型支出を追加", systemImage: "cart") }
                    } label: { Image(systemName: "plus") }
                    .accessibilityLabel("追加")
                }
            }
            .sheet(item: $adding) { kind in
                NavigationStack {
                    switch kind {
                    case .card: CardEditor(cardId: nil)
                    case .debit: DebitEditor(debitId: nil)
                    case .fixed: FixedPaymentEditor(fixedId: nil, defaultMonth: month)
                    case .large: LargeExpenseEditor(planId: nil)
                    }
                }
            }
        }
    }

    private func tile(_ title: String, _ v: Double) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(v.yen).font(.subheadline.weight(.semibold)).monospacedDigit()
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
    private func detailRow(_ title: String, _ sym: String, _ color: Color, value: Double, sub: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: sym).foregroundStyle(.white).frame(width: 30, height: 30).background(color, in: RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                Text(sub).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(value.yen).monospacedDigit()
        }
    }
}

/// カードの請求1件の行
struct StatementRow: View {
    var st: CardStatement
    var today: String
    var showDays = false
    var body: some View {
        HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text("\(Dates.parts(st.paymentDate).d)").font(.title3.weight(.bold)).monospacedDigit()
                Text("\(Dates.parts(st.paymentDate).m)月").font(.caption2).foregroundStyle(.secondary)
            }
            .frame(width: 40)
            VStack(alignment: .leading, spacing: 2) {
                Text("\(st.cardName)支払").lineLimit(1)
                Text([showDays ? daysUntilText(st.paymentDate, today: today) : nil, "\(Format.monthLabel(st.billingMonth))対象", st.plannedAmount > 0 ? "予定含む" : nil, st.status.label]
                    .compactMap { $0 }.joined(separator: "・"))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
            Spacer()
            Text((st.outstandingAmount > 0 ? st.outstandingAmount : st.amount).yen).font(.body.weight(.semibold)).monospacedDigit()
        }
        .accessibilityElement(children: .combine)
    }
}

/// カードの行（券面の色・今月の請求・推移の小さな線）
struct CardWatchRow: View {
    var card: Card
    var items: [CardStatement]
    var series: [Double]
    var body: some View {
        let total = items.reduce(0) { $0 + $1.amount }
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 5, style: .continuous).fill(CardArt.gradient(card))
                .frame(width: 40, height: 27)
                .overlay(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 1.5).fill(Color(hex: "#E8C565")).frame(width: 8, height: 6).padding(5)
                }
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(card.name).lineLimit(1).minimumScaleFactor(0.85)
                Text(items.first.map { "\(Format.shortDay($0.paymentDate))引落・\(items.contains { $0.plannedAmount > 0 } ? "予定込み" : $0.status.label)" } ?? "この月の請求なし")
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            .layoutPriority(1)
            Spacer(minLength: 4)
            VStack(alignment: .trailing, spacing: 2) {
                Text(total.yen).monospacedDigit()
                if series.contains(where: { $0 > 0 }) {
                    Sparkline(points: series.enumerated().map { ValuePoint(date: "\($0.offset)", value: $0.element) }, tint: CardArt.colors(card)[0])
                        .frame(width: 52, height: 16)
                }
            }
        }
    }
}

/// カードの請求額を更新する（Web 版 openQuickCardBilling）
struct CardBillingEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var cardId: String?
    var billingMonth: String?
    var paymentMonth: String? = nil
    var prefillAmount: Double = 0
    var onDone: (() -> Void)? = nil
    @State private var card = ""
    @State private var bm = ""
    @State private var amount = 0.0
    @State private var date = ""
    @State private var status: StatementStatus = .confirmed
    @State private var balanceMode = "reconciled"
    @State private var loaded = false

    var body: some View {
        let doc = model.doc, pm = paymentMonth ?? model.thisMonth
        let choices: [CardStatement] = {
            guard let c = doc.card(card) else { return [] }
            let s = doc.statements(card, paymentMonth: pm)
            return s.isEmpty ? [doc.statementItem(c, billingMonth: doc.billingMonth(c, forPaymentMonth: pm), paymentMonth: pm)] : s
        }()
        let existingPaid = doc.cardAdjustment(card, billingMonth: bm)?.status == "paid"
        let bank = doc.bank(doc.card(card)?.bankId ?? "")
        Form {
            Section("請求") {
                Picker("カード", selection: $card) { ForEach(doc.cards) { Text($0.name).tag($0.id) } }
                if choices.count > 1 {
                    Picker("対象請求", selection: $bm) {
                        ForEach(choices) { x in Text("\(Format.monthLabel(x.billingMonth))対象・\(x.amount.yen)").tag(x.billingMonth) }
                    }
                }
                YMDPicker(title: "実際の支払日", value: $date)
                AmountField(title: "請求額", value: $amount)
            }
            Section {
                Picker("状態", selection: $status) {
                    Text("見込み").tag(StatementStatus.estimated); Text("確定").tag(StatementStatus.confirmed); Text("支払済み").tag(StatementStatus.paid)
                }
                .pickerStyle(.segmented)
                if status == .paid && bank != nil && !existingPaid {
                    Picker("口座残高", selection: $balanceMode) {
                        Text("反映済み扱い").tag("reconciled"); Text("残高から引く").tag("apply")
                    }
                }
            } header: { Text("状態") } footer: {
                Text(status != .paid ? "\(Format.monthLabel(String(date.prefix(7))))支払い・対象利用 \(Format.monthLabel(bm))・\(status.label)"
                     : bank == nil ? "引落口座が未設定です。支払済み状態は保存できますが、銀行残高は変更しません。"
                     : existingPaid ? "すでに支払済みです。金額を修正しても残高への反映は二重に行いません。"
                     : balanceMode == "apply" ? "\(bank!.name)の現在残高から請求額を1回だけ差し引きます。" : "\(bank!.name)の現在残高にはすでにこの支払いが含まれているものとして扱います。")
            }
        }
        .navigationTitle("カード請求額を更新")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if onDone == nil { ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } } }
            ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold().disabled(card.isEmpty || bm.isEmpty) }
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            card = cardId ?? doc.cards.first?.id ?? ""
            pick(choices: choices, preferred: billingMonth)
            if prefillAmount > 0 { amount = prefillAmount }
        }
        .onChange(of: card) { _, _ in if loaded { bm = ""; recompute() } }
        .onChange(of: bm) { _, _ in if loaded { load() } }
    }

    private func recompute() {
        let doc = model.doc, pm = paymentMonth ?? model.thisMonth
        guard let c = doc.card(card) else { return }
        let s = doc.statements(card, paymentMonth: pm)
        pick(choices: s.isEmpty ? [doc.statementItem(c, billingMonth: doc.billingMonth(c, forPaymentMonth: pm), paymentMonth: pm)] : s, preferred: nil)
    }
    private func pick(choices: [CardStatement], preferred: String?) {
        if let p = preferred, choices.contains(where: { $0.billingMonth == p }) || !p.isEmpty { bm = p }
        else { bm = choices.first { $0.amount > 0 }?.billingMonth ?? choices.first?.billingMonth ?? "" }
        load()
    }
    private func load() {
        let doc = model.doc
        guard let c = doc.card(card), !bm.isEmpty else { return }
        let st = doc.statementItem(c, billingMonth: bm, paymentMonth: paymentMonth ?? model.thisMonth)
        amount = st.amount
        date = st.paymentDate.isEmpty ? "\(paymentMonth ?? model.thisMonth)-01" : st.paymentDate
        status = st.hasAdjustment ? st.status : .confirmed
        let a = doc.cardAdjustment(card, billingMonth: bm)
        balanceMode = a?.bankApplied == true ? "apply" : "reconciled"
    }
    private func save() {
        let (c, b, a, d, s, mode) = (card, bm, amount, date, status, balanceMode)
        model.change("カード請求額の更新") { doc, now, today in
            doc.setCardStatement(c, billingMonth: b, amount: a, paymentDate: d, status: s, memo: "クイック請求額入力", balanceMode: s == .paid ? mode : "keep", now: now, today: today)
        }
        model.done("カード請求額を保存しました")
        if let onDone { onDone() } else { dismiss() }
    }
}

/// デビット・口座払いの利用（Web 版 mm3OpenDebitList）
struct DebitUsageView: View {
    @Environment(AppModel.self) private var model
    var month: String
    var body: some View {
        let doc = model.doc
        let list = doc.transactions(inMonth: month).filter { $0.paymentMethod != "card" && $0.source != "fixed" && $0.source != "large_plan" }.sorted { $0.date > $1.date }
        List {
            ForEach(doc.debitCards) { d in
                let u = doc.transactions(inMonth: month).filter { $0.paymentMethod == "debit" && $0.paymentId == d.id }.reduce(0) { $0 + $1.amount }
                LabeledContent {
                    Text(u.yen).monospacedDigit()
                } label: {
                    Text(d.name)
                    Text("紐づく口座 \(doc.bank(d.bankId)?.name ?? "未設定")").font(.caption).foregroundStyle(.secondary)
                }
            }
            Section("取引（\(list.count)件）") {
                if list.isEmpty { Text("この月の取引はありません").foregroundStyle(.secondary) }
                ForEach(list) { t in NavigationLink { TransactionEditor(draft: t, isNew: false) } label: { TransactionRow(t: t, showDate: true) }.transactionActions(t) }
            }
        }
        .navigationTitle("デビット・口座払い")
    }
}


/// 支払いタブの ACF のまとめ（Web 版 renderPayments の資金見通し：月末予測・最低残高・状態）
struct AcfPaymentsPreview: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        AcfLoader(lightweight: true) { f in
            VStack(alignment: .leading, spacing: 8) {
                Chart(f.rows.prefix(62)) { r in
                    AreaMark(x: .value("日", Dates.date(r.date)), y: .value("残高", r.forecastBalance)).foregroundStyle(.teal.opacity(0.15)).interpolationMethod(.stepEnd)
                    LineMark(x: .value("日", Dates.date(r.date)), y: .value("残高", r.forecastBalance)).foregroundStyle(.teal).interpolationMethod(.stepEnd)
                    if f.reserveFloor > 0 { RuleMark(y: .value("最低残高", f.reserveFloor)).foregroundStyle(.orange).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3])) }
                }
                .chartXAxis { AxisMarks(values: .stride(by: .day, count: 14)) { AxisValueLabel(format: .dateTime.month(.defaultDigits).day()) } }
                .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
                .frame(height: 120)
                .accessibilityLabel("残高予測のグラフ")
                let risk = f.risks.first { $0.action == "day" }
                Text(risk.map { $0.title } ?? "登録済みの期間内に不足日はありません").font(.footnote).foregroundStyle(risk == nil ? Color.secondary : Color.red)
                HStack {
                    metric("月末予測", f.monthEndForecast.yen, f.monthEndForecast < 0)
                    metric("最低残高", f.minForecastBalance.yen, f.minForecastBalance < 0)
                    metric("状態", f.status, f.status == "不足" || f.status == "危険")
                }
            }
            .padding(.vertical, 4)
        }
    }
    private func metric(_ t: String, _ v: String, _ warn: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(t).font(.caption).foregroundStyle(.secondary)
            Text(v).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(warn ? .red : .primary)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}


/// 支払いのいちばん上の警告（Web 版 renderPayRoot の「引落予定に対して残高が不足しています」。iOS は ACF の注意点から出す）
struct PaymentRiskBanner: View {
    @Environment(AppModel.self) private var model
    @AppStorage("dismissedPaymentRisk") private var dismissed = ""
    var body: some View {
        AcfLoader(lightweight: true) { f in
            if let r = f.risks.first(where: { ($0.severity == "critical" || $0.severity == "warning") && !$0.date.isEmpty && $0.date >= model.today }), dismissed != r.id {
                Section {
                    HStack(alignment: .top, spacing: 12) {
                        Button { model.openAcf(.overview) } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: "exclamationmark.triangle.fill").font(.title3).foregroundStyle(r.severity == "critical" ? .red : .orange)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(r.severity == "critical" ? "引落予定に対して残高が不足しています" : "残しておきたい金額を下回りそうです").font(.subheadline.weight(.bold))
                                    Text("\(Format.dayLabel(r.date))：\(r.detail.isEmpty ? r.title : r.detail)").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                        Button { withAnimation { dismissed = r.id } } label: { Image(systemName: "xmark.circle.fill").font(.title3).foregroundStyle(.tertiary) }
                            .buttonStyle(.plain).accessibilityLabel("この警告を閉じる（不足は解決しません）")
                    }
                }
                .listRowBackground((r.severity == "critical" ? Color.red : Color.orange).opacity(0.12))
            }
        }
    }
}
