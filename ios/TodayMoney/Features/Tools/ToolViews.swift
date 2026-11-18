import SwiftUI
import Charts
import TodayMoneyCore

// MARK: - 一行入力（Web 版 openSmartInputSearch の入力）

struct QuickLineView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    @State private var drafts: [QuickDraft] = []
    @FocusState private var focused: Bool
    var body: some View {
        let doc = model.doc
        Form {
            Section {
                TextEditor(text: $text).frame(minHeight: 110).focused($focused)
                    .overlay(alignment: .topLeading) { if text.isEmpty { Text("例：昨日 マック 780円 PayPayカード\n今日 JR 230円").foregroundStyle(.tertiary).padding(.top, 8).padding(.leading, 4).allowsHitTesting(false) } }
                Button { drafts = doc.parseQuickLines(text, base: model.today); focused = false } label: { Label("内容を読み取る", systemImage: "text.viewfinder") }.disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            } footer: { Text("1行でも複数行でも入力できます。日付（今日・昨日・11/3）・金額（780円）・店名・カード名を読み取ります。読み取った内容を確認してから保存します。") }
            if !drafts.isEmpty {
                Section { LabeledContent("保存予定 \(drafts.count)件", value: drafts.reduce(0) { $0 + $1.amount }.yen).font(.headline) }
                ForEach($drafts) { $d in
                    Section {
                        YMDPicker(title: "日付", value: $d.date).onChange(of: d.date) { _, _ in d.duplicateIds = doc.duplicateIds(date: d.date, amount: d.amount, merchant: d.merchant); d.allowDuplicate = false }
                        TextField("支出先", text: $d.merchant)
                        AmountField(title: "金額", value: $d.amount)
                        Picker("カテゴリ", selection: $d.category) { ForEach(doc.categories) { Text($0.name).tag($0.name) } }
                        Picker("支払い方法", selection: Binding(get: { "\(d.paymentMethod)|\(d.paymentId)" }, set: { v in let p = v.split(separator: "|", omittingEmptySubsequences: false).map(String.init); d.paymentMethod = p[0]; d.paymentId = p.count > 1 ? p[1] : ""; d.paymentAmbiguous = d.paymentMethod.isEmpty })) {
                            if d.paymentMethod.isEmpty { Text("選んでください").tag("|") }
                            ForEach(PaymentChoice.all(doc)) { Text($0.label).tag($0.key) }
                        }
                        ForEach(d.notes, id: \.self) { Label($0, systemImage: "exclamationmark.circle").font(.footnote).foregroundStyle(.orange) }
                        if !d.duplicateIds.isEmpty { Toggle("既存記録とは別の取引として保存する", isOn: $d.allowDuplicate) }
                    } header: { Text(d.raw) }
                }
                Section {
                    Button("確認した \(drafts.count) 件を保存") {
                        let ds = drafts
                        model.change("一行入力") { m, now, today in m.saveQuickDrafts(ds, now: now, today: today) }
                        model.done("\(ds.count)件・\(ds.reduce(0) { $0 + $1.amount }.yen)を保存しました"); dismiss()
                    }.bold().disabled(!drafts.allSatisfy(\.valid))
                } footer: { if !drafts.allSatisfy(\.valid) { Text("金額、支払い方法、重複候補を確認してください。") } }
            }
        }
        .navigationTitle("一行入力")
        .onAppear { focused = true }
    }
}

// MARK: - 横断検索（Web 版 pro4SearchItems）

struct GlobalSearchView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""
    @State private var type = "all"
    var body: some View {
        let doc = model.doc
        let rows = doc.searchItems(query, type: type, today: model.today)
        List {
            Section {
                Picker("種類", selection: $type) { Text("すべて").tag("all"); Text("支出").tag("transaction"); Text("給与").tag("salary"); Text("口座").tag("account"); Text("カード").tag("card"); Text("目標").tag("goal") }
                    .pickerStyle(.segmented)
            }
            Section("\(rows.count)件") {
                ForEach(rows) { r in
                    NavigationLink { destination(r) } label: {
                        LabeledContent { Text(r.value).monospacedDigit() } label: { Text(r.title); Text(r.sub).font(.caption) }
                    }
                }
            }
        }
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "取引・給与・口座・請求・目標を検索")
        .navigationTitle("検索")
    }
    @ViewBuilder private func destination(_ r: SearchItem) -> some View {
        switch r.type {
        case "transaction": if let t = model.doc.transactions.first(where: { $0.id == r.refId }) { TransactionEditor(draft: t, isNew: false) }
        case "salary": SalaryRecordEditor(recordId: r.refId)
        case "account": BankDetailView(bankId: r.refId)
        case "card": CardDetailView(cardId: r.refId, paymentMonth: model.thisMonth)
        default: EventGoalDetailView(goalId: r.refId)
        }
    }
}

// MARK: - 実質支出の手直し（Web 版 openDailyCorrectionDetail・月の手直し）

struct CorrectionView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    /// YYYY-MM-DD なら日、YYYY-MM なら月
    var key: String
    @State private var value = 0.0
    var body: some View {
        let isDay = key.count == 10, doc = model.doc
        let raw = isDay ? doc.transactions(on: key).reduce(0) { $0 + $1.amount } : doc.transactions(inMonth: key).reduce(0) { $0 + $1.amount }
        let actual = isDay ? doc.spent(on: key) : doc.spentMonth(key)
        let field = isDay ? "dailyCorrections" : "monthlyCorrections"
        let corrected = doc[field]?[key].map { !$0.isNull } ?? false
        Form {
            Section {
                LabeledContent("自動集計", value: raw.yen)
                LabeledContent("実質金額", value: actual.yen)
                LabeledContent("修正差額") { Text(signedYen(actual - raw)).foregroundStyle(actual > raw ? .red : actual < raw ? .green : .primary) }
            } footer: { Text("立替や返金などで、記録の合計と実際に使った額が違う時に直します。取引の記録は変えません。") }
            Section {
                AmountField(title: "実質使った金額", value: $value)
                Button("この金額にする") { let v = value; model.commit("実質金額の修正") { d in var m = d[field]?.objectValue ?? [:]; m[key] = .number(v); d[field] = .object(m) }; dismiss() }.bold()
                if corrected { Button("自動集計に戻す", role: .destructive) { model.commit("実質金額を戻す") { d in var m = d[field]?.objectValue ?? [:]; m.removeValue(forKey: key); d[field] = .object(m) }; dismiss() } }
            }
        }
        .navigationTitle(isDay ? "実質使った金額" : "\(Format.monthLabel(key))の実質支出").navigationBarTitleDisplayMode(.inline)
        .onAppear { value = actual }
    }
}

// MARK: - 臨時収入の履歴（Web 版 openTempIncomeHistory）

struct TempIncomeHistoryView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let doc = model.doc
        let list = doc.tempIncomes.sorted { $0.date > $1.date }
        List {
            if list.isEmpty { Text("臨時収入はありません。").foregroundStyle(.secondary) }
            ForEach(list) { t in
                NavigationLink { TempIncomeEditor(tempId: t.id) } label: {
                    LabeledContent {
                        VStack(alignment: .trailing) { Text("+\(t.amount.yen)").foregroundStyle(.green).monospacedDigit(); Text(doc.status(t, today: model.today).rawValue).font(.caption2).foregroundStyle(.secondary) }
                    } label: {
                        Text(t.sourceName.isEmpty ? "臨時収入" : t.sourceName)
                        Text("\(t.date)・\(str(t.raw["toType"]) == "bank" ? (doc.bank(str(t.raw["bankId"]))?.name ?? "銀行口座") : "未入金・手持ち")").font(.caption)
                    }
                }
            }
        }
        .navigationTitle("臨時収入")
    }
}

// MARK: - 口座の詳細（Web 版 openBankDetail：残高・推移・この口座の取引・60日の見通し）

struct BankDetailView: View {
    @Environment(AppModel.self) private var model
    var bankId: String
    @State private var editing = false
    var body: some View {
        let doc = model.doc
        if let b = doc.bank(bankId) {
            let snaps = (doc["assetSnapshots"]?.arrayValue ?? []).filter { str($0["bankId"]) == bankId }.suffix(60).compactMap { s -> (Date, Double)? in
                guard let ms = ISODate.ms(str(s["createdAt"])) else { return nil }; return (Date(timeIntervalSince1970: ms / 1000), num(s["bankBalance"]))
            }
            let txs = doc.transactions.filter { doc.transactionBankId($0) == bankId }.sorted { $0.date > $1.date }.prefix(30)
            let f = doc.bankForecast(bankId, days: 60, today: model.today)
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(b.label.isEmpty ? "銀行口座" : b.label).font(.subheadline).foregroundStyle(.secondary)
                        MoneyText(value: b.balance, size: 40, weight: .heavy)
                        Text(ISODate.ms(b.balanceAsOf).map { "残高確認 \(Date(timeIntervalSince1970: $0 / 1000).formatted(date: .abbreviated, time: .shortened))" } ?? "残高の確認日時なし").font(.footnote).foregroundStyle(.secondary)
                        if b.threshold > 0 { Text("残高アラート \(b.threshold.yen)").font(.footnote).foregroundStyle(b.balance < b.threshold ? .red : .secondary) }
                    }
                    if snaps.count > 1 {
                        Chart(snaps, id: \.0) { d, v in LineMark(x: .value("日時", d), y: .value("残高", v)).interpolationMethod(.stepEnd) }.frame(height: 130)
                    }
                    Button { editing = true } label: { Label("残高を更新", systemImage: "square.and.pencil") }
                }
                if let f {
                    Section("60日の見通し") {
                        LabeledContent("最低予測残高") { Text("\(f.minBalance.yen)（\(Format.shortDay(f.minDate))）").foregroundStyle(f.minBalance < 0 ? .red : .primary) }
                        LabeledContent("60日後", value: f.endBalance.yen)
                        NavigationLink { MoneyTimelineView() } label: { Text("お金のタイムラインで見る") }
                    }
                }
                Section("この口座の取引") {
                    if txs.isEmpty { Text("取引はありません").foregroundStyle(.secondary) }
                    ForEach(Array(txs)) { t in NavigationLink { TransactionEditor(draft: t, isNew: false) } label: { TransactionRow(t: t, showDate: true) }.transactionActions(t) }
                }
                TagSection(ref: "bank:\(bankId)")
            }
            .navigationTitle(b.name)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { FavoriteButton(key: "bank:\(bankId)") } }
            .sheet(isPresented: $editing) { NavigationStack { BankEditor(bankId: bankId) } }
        } else { ContentUnavailableView("口座が見つかりません", systemImage: "building.columns") }
    }
}

// MARK: - 金額をまとめて更新（Web 版 openFinancialUpdates：給与・カード請求・銀行残高）

struct FinancialUpdatesView: View {
    @Environment(AppModel.self) private var model
    /// salary / cards / banks
    @State var kind: String
    @State private var month = Dates.ym()
    @State private var sheet: Sheet?
    enum Sheet: Identifiable { case bank(String), card(String, String), salary(String)
        var id: String { switch self { case .bank(let a): return "b\(a)"; case .card(let a, let b): return "c\(a)\(b)"; case .salary(let a): return "s\(a)" } }
    }
    var body: some View {
        let doc = model.doc
        List {
            Section {
                Picker("種類", selection: $kind) { Text("銀行残高").tag("banks"); Text("カード請求").tag("cards"); Text("給与").tag("salary") }.pickerStyle(.segmented)
                if kind != "banks" { MonthSwitcher(month: $month, thisMonth: model.thisMonth) }
            } footer: {
                Text(kind == "salary" ? "入金済みの給与は実際の受取額を、予定の給与は予定額を更新します。" : kind == "cards" ? "対象請求ごとに金額を更新します。支払い状態と口座への反映方法も確認できます。" : "最新の口座残高を確認して更新します。")
            }
            Section {
                switch kind {
                case "banks":
                    ForEach(doc.banks) { b in row(b.name, b.balanceAsOf.isEmpty ? "残高未確認" : "確認 \(dateText(b.balanceAsOf))", b.balance) { sheet = .bank(b.id) } }
                case "cards":
                    ForEach(doc.cards) { c in
                        let s = doc.statements(c.id, paymentMonth: month)
                        let items = s.isEmpty ? [doc.statement(c.id, paymentMonth: month)].compactMap { $0 } : s
                        ForEach(items) { st in row(c.name, "\(Format.monthLabel(st.billingMonth))対象・\(st.paymentDate.isEmpty ? "" : Format.dayLabel(st.paymentDate) + "・")\(st.status.label)", st.amount) { sheet = .card(c.id, st.billingMonth) } }
                    }
                default:
                    ForEach(doc.salaryRecords(payableIn: month)) { r in row(doc.employer(r.employerId)?.name ?? "勤務先", "\(Format.dayLabel(doc.effectiveDate(r)))・\(doc.status(r, today: model.today).rawValue)", doc.expectedOrReceived(r, today: model.today)) { sheet = .salary(r.id) } }
                }
            }
        }
        .navigationTitle("金額を更新")
        .sheet(item: $sheet) { s in
            NavigationStack {
                switch s {
                case .bank(let id): BankEditor(bankId: id)
                case .card(let id, let bm): CardBillingEditor(cardId: id, billingMonth: bm, paymentMonth: month)
                case .salary(let id): SalaryRecordEditor(recordId: id)
                }
            }
        }
    }
    private func row(_ title: String, _ sub: String, _ amount: Double, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 2) { Text(title).foregroundStyle(.primary); Text(sub).font(.caption).foregroundStyle(.secondary) }
                Spacer()
                Text(amount.yen).monospacedDigit().foregroundStyle(.primary)
                Image(systemName: "square.and.pencil").foregroundStyle(Color.accentColor)
            }
        }
    }
}

// MARK: - 月のカレンダー（Web 版 renderMonth のカレンダーと openFinancialDayInspector）

struct MonthCalendarView: View {
    @Environment(AppModel.self) private var model
    @State var month: String
    @State private var selected: String?
    var body: some View {
        let doc = model.doc
        let first = Dates.weekday("\(month)-01"), days = Dates.daysInMonth(month)
        let cells = Int(ceil(Double(first + days) / 7)) * 7
        let events = doc.financialEvents(from: "\(month)-01", days: days - 1, today: "\(month)-01")
        List {
            Section {
                MonthSwitcher(month: $month, thisMonth: model.thisMonth)
                HStack { ForEach(Array("日月火水木金土"), id: \.self) { Text(String($0)).font(.caption2).foregroundStyle(.secondary).frame(maxWidth: .infinity) } }
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 3), count: 7), spacing: 3) {
                    ForEach(0..<cells, id: \.self) { i in
                        let d = i - first + 1
                        if d < 1 || d > days { Color.clear.frame(height: 54) } else {
                            let ds = "\(month)-\(d < 10 ? "0" : "")\(d)"
                            let s = doc.spent(on: ds), g = doc.dayGoalForMonth(month, day: d)
                            let ev = events.filter { $0.date == ds }
                            Button { selected = ds } label: {
                                VStack(spacing: 2) {
                                    Text("\(d)").font(.caption.weight(ds == model.today ? .bold : .regular))
                                    Text(s > 0 ? short(s) : " ").font(.system(size: 9).monospacedDigit()).foregroundStyle(g > 0 && s > g ? .red : .primary)
                                    HStack(spacing: 2) { ForEach(Array(ev.prefix(3).enumerated()), id: \.offset) { _, e in Circle().fill(e.type == .income ? Color.green : e.type == .card ? .purple : .pink).frame(width: 4, height: 4) } }.frame(height: 4)
                                }
                                .frame(maxWidth: .infinity, minHeight: 54)
                                .background(ds == model.today ? Color.accentColor.opacity(0.15) : Color.secondary.opacity(0.06), in: RoundedRectangle(cornerRadius: 8))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("\(Format.dayLabel(ds))、支出 \(s.yen)")
                        }
                    }
                }
                HStack(spacing: 12) { Label("給与", systemImage: "circle.fill").foregroundStyle(.green); Label("カード引落", systemImage: "circle.fill").foregroundStyle(.purple); Label("支払い", systemImage: "circle.fill").foregroundStyle(.pink) }
                    .font(.caption2).labelStyle(.titleAndIcon)
            }
        }
        .navigationTitle("カレンダー")
        .sheet(item: Binding(get: { selected.map(IdBox.init) }, set: { selected = $0?.id })) { b in NavigationStack { DayInspectorView(date: b.id) }.presentationDetents([.medium, .large]) }
    }
    private func short(_ v: Double) -> String { v >= 10000 ? String(format: "%.1f万", v / 10000) : Int(v).formatted() }
}

/// 1日の詳細（Web 版 openFinancialDayInspector）
struct DayInspectorView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var date: String
    @State private var correction = false
    var body: some View {
        let doc = model.doc
        let s = doc.spent(on: date), g = doc.dayGoalForMonth(String(date.prefix(7)), day: Dates.parts(date).d)
        let txs = doc.transactions(on: date)
        let ev = doc.financialEvents(from: date, days: 0, today: date).filter { $0.date == date }
        let origin = str(doc["dailyGoals"]?[date]?["origin"])
        List {
            Section {
                LabeledContent("使った金額", value: s.yen).font(.headline)
                LabeledContent("目標", value: g > 0 ? g.yen : "未設定")
                if g > 0 { LabeledContent("差") { Text(signedYen(s - g)).foregroundStyle(s > g ? .red : .green) } }
                LabeledContent("目標の決め方", value: origin == "daily" ? "当日目標として固定" : g > 0 ? "月間計画から設定" : "未設定")
                Button("実質金額を確認・修正") { correction = true }
            }
            if !ev.isEmpty {
                Section("この日の予定") { ForEach(ev) { e in LabeledContent(e.title) { Text(signedYen(e.amount)).foregroundStyle(e.amount > 0 ? .green : .primary) } } }
            }
            Section("取引（\(txs.count)件）") {
                if txs.isEmpty { Text("この日の支出はありません").foregroundStyle(.secondary) }
                ForEach(txs) { t in NavigationLink { TransactionEditor(draft: t, isNew: false) } label: { TransactionRow(t: t) }.transactionActions(t) }
            }
            Section {
                NavigationLink { GoalPlannerView(type: .daily, key: date) } label: { Label("この日の目標を決める", systemImage: "target") }
                if DayClosing.inRange(date, today: model.today) { NavigationLink { DayClosingView(date: date) } label: { Label("日締め", systemImage: "moon.stars") } }
            }
        }
        .navigationTitle(Format.dayLabel(date)).navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("閉じる") { dismiss() } } }
        .sheet(isPresented: $correction) { NavigationStack { CorrectionView(key: date) }.presentationDetents([.medium]) }
    }
}

// MARK: - お気に入り・タグ（Web 版 openFavoritesEditor・openTagsManager）

struct FavoriteButton: View {
    @Environment(AppModel.self) private var model
    var key: String
    var body: some View {
        let on = model.doc.favorites.contains(key)
        Button {
            var l = model.doc.favorites
            if on { l.removeAll { $0 == key } } else { guard l.count < 8 else { model.toast = "お気に入りは8件までです"; return }; l.append(key) }
            model.commit("お気に入り") { $0.setFavorites(l) }
        } label: { Image(systemName: on ? "star.fill" : "star") }
        .tint(on ? .yellow : .accentColor)
        .accessibilityLabel(on ? "お気に入りから外す" : "お気に入りに追加")
    }
}

/// お気に入りの一覧（ホームやその他から1回で開く）
struct FavoritesView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let doc = model.doc
        let fixed: [(String, String)] = [("acf", "ACF"), ("quickExpense", "クイック支出入力"), ("quickBank", "銀行残高更新"), ("cardBilling", "カード請求額更新"), ("planner", "月間Planner"),
                                         ("salary", "給与"), ("fixed", "固定支払い"), ("large", "大型支出"), ("transactions", "取引一覧"), ("assetTrend", "資産推移")]
        let all = fixed + doc.banks.map { ("bank:\($0.id)", $0.name) } + doc.cards.map { ("card:\($0.id)", $0.name) } + doc.employers.map { ("employer:\($0.id)", $0.name) }
        let favs = doc.favorites
        List {
            Section {
                if favs.isEmpty { Text("まだありません。下の一覧の ☆ で追加します（8件まで）。").foregroundStyle(.secondary) }
                ForEach(favs, id: \.self) { k in NavigationLink { FavoriteDestination(key: k) } label: { Label(doc.favoriteLabel(k) ?? k, systemImage: "star.fill") } }
                    .onMove { from, to in var l = favs; l.move(fromOffsets: from, toOffset: to); model.commit("お気に入りの並べ替え") { $0.setFavorites(l) } }
                    .onDelete { idx in var l = favs; l.remove(atOffsets: idx); model.commit("お気に入り") { $0.setFavorites(l) } }
            } header: { Text("お気に入り（\(favs.count)/8）") }
            Section("追加できるもの") {
                ForEach(all, id: \.0) { k, label in
                    HStack { Text(label); Spacer(); FavoriteButton(key: k).buttonStyle(.borderless) }
                }
            }
        }
        .navigationTitle("お気に入り")
        .toolbar { EditButton() }
    }
}

struct FavoriteDestination: View {
    @Environment(AppModel.self) private var model
    var key: String
    var body: some View {
        let p = key.split(separator: ":", maxSplits: 1).map(String.init)
        switch p.first ?? "" {
        case "acf": AcfDetailView()
        case "quickExpense": TransactionEditor(draft: { var t = Transaction(id: ""); t.date = model.today; t.category = model.doc.categories.first?.name ?? "その他"; t.paymentMethod = "other"; return t }(), isNew: true)
        case "quickBank", "assetTrend": AssetsView()
        case "cardBilling": CardBillingEditor(cardId: nil, billingMonth: nil, paymentMonth: model.thisMonth)
        case "planner": GoalPlannerView(type: .monthly, key: model.thisMonth)
        case "salary": SalaryMonthView(month: model.thisMonth)
        case "fixed": FixedPaymentsView(month: model.thisMonth)
        case "large": LargeExpensesView()
        case "transactions": TransactionListView(title: "\(Format.monthLabel(model.thisMonth))の取引", month: model.thisMonth)
        case "bank": BankDetailView(bankId: p.count > 1 ? p[1] : "")
        case "card": CardDetailView(cardId: p.count > 1 ? p[1] : "", paymentMonth: model.thisMonth)
        case "employer": EmployerTermsView(employerId: p.count > 1 ? p[1] : "")
        default: ContentUnavailableView("Gmail の取引は「その他 › Gmail 取り込み」で確認できます", systemImage: "envelope")
        }
    }
}

struct TagsView: View {
    @Environment(AppModel.self) private var model
    @State private var editing: Tag?
    var body: some View {
        let doc = model.doc
        List {
            Section { Button { editing = Tag(id: "", name: "", color: "#007AFF") } label: { Label("新しいタグ", systemImage: "plus") } }
            Section {
                if doc.tags.isEmpty { Text("タグはありません。旅行・家族など、口座・カード・固定支払いをまとめて見るのに使います。").foregroundStyle(.secondary) }
                ForEach(doc.tags) { t in
                    NavigationLink { TagItemsView(tagId: t.id) } label: {
                        HStack { Circle().fill(Color(hex: t.color)).frame(width: 12, height: 12); Text(t.name); Spacer(); Text("\(doc.taggableItems.filter { doc.tagsFor($0.ref).contains(t.id) }.count)件").foregroundStyle(.secondary) }
                    }
                }
            }
        }
        .navigationTitle("タグ")
        .sheet(item: $editing) { t in NavigationStack { TagEditor(tag: t) }.presentationDetents([.medium]) }
    }
}

struct TagEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State var tag: Tag
    @State private var confirmDelete = false
    var body: some View {
        Form {
            TextField("名前（例：旅行）", text: $tag.name)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                ForEach(CategoryStyle.colors, id: \.self) { hex in
                    Circle().fill(Color(hex: hex)).frame(width: 32, height: 32).overlay(Circle().strokeBorder(.primary, lineWidth: tag.color.uppercased() == hex ? 3 : 0)).onTapGesture { tag.color = hex }
                        .accessibilityLabel(hex).accessibilityAddTraits(tag.color.uppercased() == hex ? .isSelected : [])
                }
            }.padding(.vertical, 4)
            if !tag.id.isEmpty { Button("このタグを削除", role: .destructive) { confirmDelete = true } }
        }
        .navigationTitle(tag.id.isEmpty ? "新しいタグ" : "タグを編集").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    var t = tag; t.name = t.name.trimmingCharacters(in: .whitespaces)
                    model.change("タグ") { d, now, _ in var l = d.tags; if let i = l.firstIndex(where: { $0.id == t.id && !t.id.isEmpty }) { l[i] = t } else { t.id = MoneyDocument.uid("tag", now: now); l.append(t) }; d.tags = l }
                    model.done("タグを保存しました"); dismiss()
                }.bold().disabled(tag.name.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .confirmationDialog("タグを削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("削除", role: .destructive) { let id = tag.id; model.commit("タグの削除") { $0.deleteTag(id) }; dismiss() }
        } message: { Text("タグだけを削除し、元のカードや銀行などは削除しません。") }
    }
}

struct TagItemsView: View {
    @Environment(AppModel.self) private var model
    var tagId: String
    @State private var edit = false
    var body: some View {
        let doc = model.doc
        if let tag = doc.tags.first(where: { $0.id == tagId }) {
            List {
                Section {
                    ForEach(doc.taggableItems) { x in
                        let on = doc.tagsFor(x.ref).contains(tagId)
                        Button {
                            let cur = doc.tagsFor(x.ref)
                            model.commit("タグの付け替え") { $0.setTags(x.ref, on ? cur.filter { $0 != tagId } : cur + [tagId]) }
                        } label: {
                            HStack { VStack(alignment: .leading) { Text(x.label).foregroundStyle(.primary); Text(x.kind).font(.caption).foregroundStyle(.secondary) }; Spacer(); Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Color(hex: tag.color) : .secondary) }
                        }
                    }
                } header: { Text("このタグを付ける項目") } footer: { Text("押すと付け外しできます。") }
            }
            .navigationTitle(tag.name)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("編集") { edit = true } } }
            .sheet(isPresented: $edit) { NavigationStack { TagEditor(tag: tag) }.presentationDetents([.medium]) }
        } else { ContentUnavailableView("タグが見つかりません", systemImage: "tag") }
    }
}

/// 詳細画面に置くタグの欄
struct TagSection: View {
    @Environment(AppModel.self) private var model
    var ref: String
    var body: some View {
        let doc = model.doc
        if !doc.tags.isEmpty {
            Section("タグ") {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(doc.tags) { t in
                            let on = doc.tagsFor(ref).contains(t.id)
                            Chip(on: on) {
                                let cur = doc.tagsFor(ref)
                                model.commit("タグ") { $0.setTags(ref, on ? cur.filter { $0 != t.id } : cur + [t.id]) }
                            } label: { Circle().fill(Color(hex: t.color)).frame(width: 8, height: 8); Text(t.name) }
                        }
                    }
                }
            }
        }
    }
}

// MARK: - 電卓の補助（割引・割合を加算・割り勘）

struct CalcAssistSheet: View {
    @Environment(\.dismiss) private var dismiss
    var base: Double
    var kind: String
    var apply: (Double) -> Void
    @State private var value = ""
    var body: some View {
        let r = CalcAssist.result(base: base, kind: kind, value: Double(value) ?? .nan)
        Form {
            Section {
                LabeledContent("元の金額", value: base.yen)
                TextField(kind == "split" ? "人数" : "割合（%）", text: $value).keyboardType(kind == "split" ? .numberPad : .decimalPad)
                if let r { LabeledContent("結果", value: r.amount.yen).font(.headline); Text(r.copy).font(.footnote).foregroundStyle(.secondary) }
                else { Text(kind == "split" ? "2〜100人で入力してください" : "0〜100%で入力してください").font(.footnote).foregroundStyle(.orange) }
            }
        }
        .navigationTitle(["discount": "割引後の金額", "add": "割合を加算", "split": "割り勘の金額"][kind] ?? "").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("この金額を使う") { if let r { apply(r.amount); dismiss() } }.bold().disabled(r == nil) }
        }
        .onAppear { value = kind == "split" ? "2" : "10" }
    }
}
