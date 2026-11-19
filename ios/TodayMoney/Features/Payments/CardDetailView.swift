import Charts
import SwiftUI
import TodayMoneyCore

/// カードの券面の色（Web 版 CARD_ARTS / cardArtGradient：名前と id から毎回同じ色を選ぶ）
enum CardArt {
    private static let arts: [[Color]] = [
        [Color(hex: "#5E5CE6"), Color(hex: "#3A2FB8"), Color(hex: "#1C1B4D")],
        [Color(hex: "#FF375F"), Color(hex: "#C2185B"), Color(hex: "#4A0D2E")],
        [Color(hex: "#30B0C7"), Color(hex: "#0A6E8A"), Color(hex: "#08304A")],
        [Color(hex: "#3C3C43"), Color(hex: "#1C1C1E"), Color(hex: "#000000")],
        [Color(hex: "#FF9F0A"), Color(hex: "#E0561B"), Color(hex: "#5A1D07")],
        [Color(hex: "#34C759"), Color(hex: "#0F7A4A"), Color(hex: "#06331F")],
    ]
    static func colors(_ c: Card) -> [Color] {
        var h: UInt32 = 0
        for u in (c.name + c.id).utf16 { h = h &* 31 &+ UInt32(u) }
        return arts[Int(h % UInt32(arts.count))]
    }
    static func gradient(_ c: Card) -> LinearGradient {
        LinearGradient(colors: colors(c), startPoint: .topLeading, endPoint: .bottomTrailing)
    }
}

/// カードの詳細（Web 版 cardDetailHtml：券面・6か月の請求・未払い残高・利用可能額・内訳・照合・カテゴリ・明細）
struct CardDetailView: View {
    @Environment(AppModel.self) private var model
    var cardId: String
    @State var paymentMonth: String
    @State private var selectedBM: String?
    @State private var editing = false
    @State private var editBilling = false
    @State private var confirmPaid = false
    @State private var confirmUnpaid = false
    @State private var applyBank = false
    @State private var scrubMonth: String?
    @State private var reconcile = false

    var body: some View {
        let doc = model.doc, today = model.today
        if let c = doc.card(cardId) {
            let items: [CardStatement] = {
                let s = doc.statements(cardId, paymentMonth: paymentMonth)
                return s.isEmpty ? [doc.statement(cardId, paymentMonth: paymentMonth)].compactMap { $0 } : s
            }()
            let st = items.first { $0.billingMonth == selectedBM } ?? items.first { $0.status != .paid } ?? items.first
            let bm = st?.billingMonth ?? doc.billingMonth(c, forPaymentMonth: paymentMonth)
            let list = doc.cardTransactions(cardId, billingMonth: bm).sorted { $0.date != $1.date ? $0.date > $1.date : $0.createdAt > $1.createdAt }
            let total = items.reduce(0) { $0 + $1.amount }
            List {
                Section {
                    MonthSwitcher(month: $paymentMonth, thisMonth: model.thisMonth)
                        .onChange(of: paymentMonth) { selectedBM = nil }
                }
                Section {
                    hero(c, items: items, st: st, bm: bm, total: total)
                        .listRowInsets(EdgeInsets(top: 4, leading: 12, bottom: 12, trailing: 12))
                        .listRowBackground(Color.clear)
                }
                Section {
                    historyChart(doc.cardMonthHistory(cardId, center: paymentMonth))
                } header: { Text("支払月ごとの請求（6か月）") } footer: { Text("棒を押すと、その支払月に切り替わります。") }

                if items.count > 1 {
                    Section("この月の請求") {
                        ForEach(items) { x in
                            Button { selectedBM = x.billingMonth; Feedback.selection() } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("\(Format.monthLabel(x.billingMonth))対象").foregroundStyle(.primary)
                                        Text("\(x.paymentDate.isEmpty ? "支払日未設定" : Format.dayLabel(x.paymentDate))・\(x.status.label)").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text(x.amount.yen).monospacedDigit().foregroundStyle(x.billingMonth == bm ? Color.accentColor : .primary)
                                    if x.billingMonth == bm { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
                                }
                            }
                        }
                    }
                }
                Section { metrics(c, today: today) }
                Section { actions(c, st: st, bm: bm) }
                breakdown(c, st: st, bm: bm)
                StatementImportSection(cardId: cardId, paymentMonth: paymentMonth, billingMonth: bm)
                categories(list)
                Section("利用明細（\(list.count)件）") {
                    if list.isEmpty { Text("この期間の利用はありません").foregroundStyle(.secondary) }
                    ForEach(list) { t in
                        NavigationLink { TransactionEditor(draft: t, isNew: false) } label: { TransactionRow(t: t, showDate: true) }.transactionActions(t)
                    }
                }
            }
            .navigationTitle(c.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("編集") { editing = true } } }
            .navigationDestination(isPresented: $reconcile) { StatementReconciliationView(cardId: cardId, paymentMonth: paymentMonth, billingMonth: bm) }
            .sheet(isPresented: $editing) { NavigationStack { CardEditor(cardId: cardId) } }
            .sheet(isPresented: $editBilling) { NavigationStack { CardBillingEditor(cardId: cardId, billingMonth: bm, paymentMonth: paymentMonth) } }
            .sheet(isPresented: $confirmPaid) { paidSheet(c, st: st, bm: bm) }
            .alert("未払いに戻しますか？", isPresented: $confirmUnpaid) {
                Button("キャンセル", role: .cancel) {}
                Button("未払いに戻す", role: .destructive) {
                    model.change("カードの支払いを未払いに戻す") { d, now, today in d.markCardStatementPaid(cardId, billingMonth: bm, paid: false, now: now, today: today) }
                    model.done("未払いに戻しました")
                }
            } message: { Text("この請求だけを未払いへ戻します。アプリが口座残高へ反映した支払いだけ、1回だけ戻します。") }
        } else {
            ContentUnavailableView("カードが見つかりません", systemImage: "creditcard")
        }
    }

    // MARK: 券面

    private func hero(_ c: Card, items: [CardStatement], st: CardStatement?, bm: String, total: Double) -> some View {
        let cycle = model.doc.billingCycle(c, month: bm)
        let allPaid = !items.isEmpty && items.allSatisfy { $0.status == .paid }
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text("CREDIT CARD").font(.caption2.weight(.semibold)).tracking(1.2).opacity(0.75)
                Spacer()
                RoundedRectangle(cornerRadius: 4).fill(LinearGradient(colors: [Color(hex: "#F5D77A"), Color(hex: "#B8923A")], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .frame(width: 34, height: 25)
                    .accessibilityHidden(true)
            }
            Text(c.name).font(.title3.weight(.bold)).lineLimit(1)
            if !c.company.isEmpty && c.company != c.name { Text(c.company).font(.caption).opacity(0.75) }
            Spacer(minLength: 6)
            Text("\(Format.monthLabel(paymentMonth))支払い").font(.caption).opacity(0.8)
            Text(total.yen).font(.system(size: 36, weight: .heavy, design: .rounded)).monospacedDigit().contentTransition(.numericText())
            HStack(spacing: 6) {
                if allPaid { Image(systemName: "checkmark.seal.fill") }
                Text(items.count > 1 ? "\(items.count)件の請求" : "\(st?.status.label ?? "見込み")\(st.map { $0.paymentDate.isEmpty ? "" : "・\(Format.dayLabel($0.paymentDate))" } ?? "")")
            }
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(.white.opacity(allPaid ? 0.28 : 0.16), in: Capsule())
            Text("対象利用期間 \(Format.shortDay(cycle.start))〜\(Format.shortDay(cycle.end))").font(.caption2).opacity(0.8)
        }
        .foregroundStyle(.white)
        .padding(18)
        .frame(maxWidth: .infinity, minHeight: 200, alignment: .leading)
        .background(CardArt.gradient(c), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(.white.opacity(0.15)))
        .shadow(color: CardArt.colors(c)[1].opacity(0.35), radius: 14, y: 8)
        .accessibilityElement(children: .combine)
    }

    // MARK: 6か月の請求

    private func historyChart(_ rows: [CardMonthRow]) -> some View {
        let shown = rows.first { $0.month == scrubMonth } ?? rows.first { $0.month == paymentMonth }
        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(shown.map { "\(Format.monthLabel($0.month))支払い" } ?? "").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Text((shown?.amount ?? 0).yen).font(.headline).monospacedDigit()
                if let s = shown, s.count > 0 { Text(s.status.label).font(.caption2).foregroundStyle(s.status == .paid ? .green : .secondary) }
            }
            Chart(rows) { r in
                BarMark(x: .value("月", r.month), y: .value("請求", r.amount), width: .ratio(0.62))
                    .cornerRadius(5)
                    .foregroundStyle(r.month == paymentMonth ? AnyShapeStyle(Color.accentColor) : r.status == .paid ? AnyShapeStyle(Color.green.opacity(0.45)) : AnyShapeStyle(Color.secondary.opacity(0.35)))
                    .annotation(position: .top) {
                        Text(r.amount > 0 ? compactYen(r.amount) : "—").font(.system(size: 9)).foregroundStyle(.secondary)
                    }
                if r.month == scrubMonth { RuleMark(x: .value("月", r.month)).foregroundStyle(.secondary.opacity(0.4)) }
            }
            .chartXAxis { AxisMarks { v in AxisValueLabel { if let m = v.as(String.self) { Text("\(Dates.parts(m + "-01").m)月") } } } }
            .chartYAxis(.hidden)
            .chartXSelection(value: $scrubMonth)
            .chartOverlay { proxy in
                GeometryReader { _ in
                    Rectangle().fill(.clear).contentShape(Rectangle())
                        .onTapGesture { p in
                            if let m: String = proxy.value(atX: p.x) { paymentMonth = m; selectedBM = nil; Feedback.selection() }
                        }
                }
            }
            .onChange(of: scrubMonth) { _, m in if m != nil { Feedback.selection() } }
            .frame(height: 150)
            .accessibilityLabel(rows.map { "\(Format.monthLabel($0.month)) \($0.amount.yen)" }.joined(separator: "、"))
        }
        .padding(.vertical, 4)
    }

    // MARK: 未払い残高・限度額・利用可能額

    private func metrics(_ c: Card, today: String) -> some View {
        let doc = model.doc
        let unpaid = doc.cardUnpaidEstimate(cardId, today: today)
        let ex = doc.projectedCardExposure(cardId, end: doc.cardExposureEnd(paymentMonth: paymentMonth, today: today), today: today)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                StatTile(title: "未払い残高", value: unpaid.yen)
                StatTile(title: "利用限度額", value: c.limit > 0 ? c.limit.yen : "未設定")
                StatTile(title: "利用可能額", value: c.limit > 0 ? ex.minAvailable.yen : "未確認", sub: c.limit > 0 ? "予定込みの最小" : nil,
                         tint: c.limit > 0 && ex.minAvailable < c.limit * 0.1 ? .red : .primary)
            }
            .fixedSize(horizontal: false, vertical: true)
            if c.limit > 0 {
                let used = min(1, ex.max / c.limit), now = min(1, ex.current / c.limit)
                VStack(alignment: .leading, spacing: 4) {
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Color(.tertiarySystemFill))
                            Capsule().fill((used > 0.9 ? Color.red : Color.orange).opacity(0.45)).frame(width: g.size.width * used)
                            Capsule().fill(used > 0.9 ? Color.red : Color.accentColor).frame(width: g.size.width * now)
                        }
                    }
                    .frame(height: 8)
                    HStack {
                        Text("いまの利用 \(ex.current.yen)")
                        Spacer()
                        Text("最大 \(ex.max.yen)（\(Int((used * 100).rounded()))%）")
                    }
                    .font(.caption2).foregroundStyle(.secondary).monospacedDigit()
                }
                .accessibilityElement(children: .combine)
                if let a = c.availableSnapshot { LabeledContent("利用可能額（最後に入力）", value: a.yen).font(.footnote) }
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: 操作

    private func actions(_ c: Card, st: CardStatement?, bm: String) -> some View {
        HStack(spacing: 8) {
            actionButton("請求額を更新", "square.and.pencil") { editBilling = true }
            if st?.status == .paid {
                actionButton("未払いに戻す", "arrow.uturn.backward") { confirmUnpaid = true }
            } else {
                actionButton("支払いを確認", "checkmark.circle") { applyBank = false; confirmPaid = true }
                    .disabled((st?.amount ?? 0) <= 0)
            }
            actionButton("明細と照合", "checklist") { reconcile = true }
        }
        .listRowInsets(EdgeInsets(top: 8, leading: 10, bottom: 8, trailing: 10))
    }
    private func actionButton(_ title: String, _ sym: String, _ run: @escaping () -> Void) -> some View {
        Button(action: run) { actionLabel(title, sym) }.buttonStyle(.plain)
    }
    private func actionLabel(_ title: String, _ sym: String) -> some View {
        VStack(spacing: 5) {
            Image(systemName: sym).font(.title3)
            Text(title).font(.caption.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .foregroundStyle(Color.accentColor)
        .frame(maxWidth: .infinity, minHeight: 58)
        .background(Color.accentColor.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .contentShape(Rectangle())
    }

    // MARK: 内訳

    @ViewBuilder private func breakdown(_ c: Card, st: CardStatement?, bm: String) -> some View {
        let doc = model.doc
        let base = doc.cardBaseUsage(cardId, billingMonth: bm), delta = doc.cardDeltaAtEdit(cardId, billingMonth: bm)
        let newUse = st?.newUse ?? 0
        Section {
            LabeledContent("記録上の利用", value: base.yen)
            LabeledContent("確認時の修正差額") {
                Text(delta == 0 ? Double(0).yen : signedYen(delta)).foregroundStyle(delta > 0 ? .red : delta < 0 ? .green : .secondary)
            }
            if newUse != 0 { LabeledContent("確定後の新しい利用", value: newUse.yen) }
            if let a = doc.cardAdjustment(cardId, billingMonth: bm) { LabeledContent("確定した請求額", value: a.confirmedTotal.yen) }
            LabeledContent("引落日", value: st.map { $0.paymentDate.isEmpty ? "未設定" : Format.dayLabel($0.paymentDate) } ?? "未設定")
            LabeledContent("引落口座", value: doc.bank(c.bankId)?.name ?? "未設定")
            LabeledContent("口座残高への反映", value: doc.cardBankHandling(cardId, billingMonth: bm).label)
        } header: { Text("選択請求の内訳（\(Format.monthLabel(bm))対象）") }
    }

    // MARK: カテゴリ

    @ViewBuilder private func categories(_ list: [Transaction]) -> some View {
        let doc = model.doc
        let total = list.reduce(0) { $0 + $1.amount }
        let cats = doc.categories.map { cat in (cat: cat, value: list.filter { $0.category == cat.name }.reduce(0) { $0 + $1.amount }) }
            .filter { $0.value > 0 }.sorted { $0.value > $1.value }
        if !cats.isEmpty {
            Section("カテゴリ別") {
                HStack(spacing: 16) {
                    Chart(cats, id: \.cat.id) { x in
                        SectorMark(angle: .value("金額", x.value), innerRadius: .ratio(0.62), angularInset: 1.5)
                            .cornerRadius(3).foregroundStyle(Color(hex: x.cat.color))
                    }
                    .frame(width: 110, height: 110)
                    .chartBackground { _ in
                        VStack(spacing: 0) {
                            Text("合計").font(.caption2).foregroundStyle(.secondary)
                            Text(compactYen(total)).font(.subheadline.weight(.bold)).monospacedDigit()
                        }
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(cats.prefix(5), id: \.cat.id) { x in
                            HStack(spacing: 6) {
                                Circle().fill(Color(hex: x.cat.color)).frame(width: 8, height: 8)
                                Text(x.cat.name).font(.caption).lineLimit(1)
                                Spacer()
                                Text("\(Int((x.value / max(1, total) * 100).rounded()))%").font(.caption).foregroundStyle(.secondary).monospacedDigit()
                            }
                        }
                    }
                }
                .padding(.vertical, 4)
                .accessibilityElement(children: .combine)
                ForEach(cats, id: \.cat.id) { x in
                    NavigationLink {
                        TransactionListView(title: "\(x.cat.name)（\(model.doc.card(cardId)?.name ?? "カード")）", initialCategory: x.cat.name, onlyIds: Set(list.map(\.id)))
                    } label: {
                        LabeledContent(x.cat.name) { Text(x.value.yen).monospacedDigit() }
                    }
                }
            }
        }
    }

    // MARK: 支払いの確認

    private func paidSheet(_ c: Card, st: CardStatement?, bm: String) -> some View {
        let bank = model.doc.bank(c.bankId)
        let amount = st?.amount ?? 0
        return NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(c.name)・\(st.map { Format.dayLabel($0.paymentDate) } ?? "")").foregroundStyle(.secondary)
                        MoneyText(value: amount)
                        Text("\(Format.monthLabel(bm))対象の請求だけを支払済みにします。").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Section {
                    Toggle("口座残高にも反映する", isOn: $applyBank).disabled(bank == nil)
                    if let b = bank {
                        LabeledContent("反映前の口座残高", value: b.balance.yen)
                        LabeledContent("反映後の口座残高", value: applyBank ? (b.balance - amount).yen : "変更なし")
                    }
                } footer: {
                    Text(bank == nil ? "引落口座が未設定なので、残高を自動で変える操作は使えません。" : "スイッチを切り替えただけでは口座残高は変わりません。下のボタンで確定します。")
                }
                Section {
                    Button {
                        let mode = bank == nil ? "none" : applyBank ? "apply" : "reconciled"
                        model.change("カードの支払済み") { d, now, today in d.markCardStatementPaid(cardId, billingMonth: bm, paid: true, balanceMode: mode, now: now, today: today) }
                        model.done("支払済みにしました"); confirmPaid = false
                    } label: {
                        Text(applyBank ? "口座残高へ反映して支払済みにする" : "現在残高に反映済みとして確定").bold().frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
            }
            .navigationTitle("支払いを確認").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { confirmPaid = false } } }
        }
        .presentationDetents([.medium, .large])
    }
}
