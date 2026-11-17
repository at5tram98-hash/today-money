import SwiftUI
import TodayMoneyCore

/// ホームの日締めカード（Web 版 dayClosingCardHtml）
struct DayClosingCard: View {
    @Environment(AppModel.self) private var model
    var date: String
    var body: some View {
        let status = model.doc.dayClosingStatus(date, today: model.today)
        let copy = !DayClosing.available(date) ? "18:00以降に照合・承認できます" : [
            .open: "収入・取引・残高を順番に照合します", .closed: "承認済 · 日締めジャーナルに保存しています",
            .changed: "再確認が必要 · 承認後に記録が変わりました", .cancelled: "取消済 · 再照合して承認できます",
        ][status] ?? ""
        HStack(spacing: 12) {
            Image(systemName: status == .closed ? "checkmark.seal.fill" : status == .changed ? "exclamationmark.triangle.fill" : "moon.stars.fill")
                .font(.title3).foregroundStyle(status == .closed ? .green : status == .changed ? .orange : .indigo)
                .frame(width: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text("日締め").font(.headline)
                Text(copy).font(.footnote).foregroundStyle(.secondary)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .cardStyle()
    }
}

/// 日締め（Web 版 openDayClosing：日締め → 収入 → メール取引 → 普通取引 → 銀行残高 → 承認 → 承認されました）
struct DayClosingView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var date: String
    @State private var step = 0
    @State private var review: DayClosingReview
    @State private var confirmed = false
    @State private var editing = false
    @State private var cancelSheet = false
    @State private var confirmModify = false
    @State private var editTx: Transaction?
    @State private var editIncome: String?
    @State private var editBank: String?
    @State private var addExpense = false
    @State private var addIncome = false
    @State private var error: String?

    init(date: String) { self.date = date; _review = State(initialValue: DayClosingReview(date: date)) }

    var body: some View {
        let doc = model.doc, today = model.today
        let status = doc.dayClosingStatus(date, today: today)
        let record = doc["dayClosings"]?[date]
        let approvedView = (status == .closed || status == .cancelled || status == .changed) && !str(record?["closedAt"]).isEmpty && !editing && step != 6
        Group {
            if !DayClosing.inRange(date, today: today) {
                ContentUnavailableView("日締めは今日を含む直近7日間が対象です", systemImage: "calendar.badge.exclamationmark")
            } else if !DayClosing.available(date) {
                List {
                    Section {
                        VStack(spacing: 10) {
                            Image(systemName: "moon.stars.fill").font(.largeTitle).foregroundStyle(.indigo)
                            Text("18:00から日締め").font(.title2.bold())
                            Text(DayClosing.timeMessage).foregroundStyle(.secondary)
                        }.frame(maxWidth: .infinity).padding(.vertical, 12)
                    } footer: { Text("日本時間の18:00から照合・承認・修正・取消ができます。日締めジャーナルはいつでも確認できます。") }
                    Section { NavigationLink { DayClosingJournalView() } label: { Label("日締めジャーナル", systemImage: "book.closed") } }
                }
            } else if approvedView, let record {
                approved(record, status: status)
            } else {
                steps(doc, today: today, status: status)
            }
        }
        .navigationTitle("日締め")
        .navigationBarTitleDisplayMode(.inline)
        .alert(error ?? "", isPresented: Binding(get: { error != nil }, set: { if !$0 { error = nil } })) { Button("OK") {} }
        .sheet(item: $editTx) { t in NavigationStack { TransactionEditor(draft: t, isNew: false) } }
        .sheet(item: Binding(get: { editIncome.map(IdBox.init) }, set: { editIncome = $0?.id })) { b in NavigationStack { IncomeEditor(incomeId: b.id) } }
        .sheet(item: Binding(get: { editBank.map(IdBox.init) }, set: { editBank = $0?.id })) { b in NavigationStack { BankEditor(bankId: b.id) } }
        .sheet(isPresented: $addExpense) { NavigationStack { TransactionEditor(draft: newTx(), isNew: true) } }
        .sheet(isPresented: $addIncome) { NavigationStack { TempIncomeEditor(tempId: nil, prefillDate: date) } }
        .sheet(isPresented: $cancelSheet) { NavigationStack { DayClosingCancelView(date: date) } }
    }

    private func newTx() -> Transaction { var t = Transaction(id: ""); t.date = date; t.category = model.doc.categories.first?.name ?? "その他"; t.paymentMethod = "other"; return t }

    // MARK: 承認済み

    @ViewBuilder private func approved(_ record: JSONValue, status: DayClosingStatus) -> some View {
        let cancelled = status == .cancelled
        List {
            Section {
                VStack(spacing: 8) {
                    Text(Format.dayLabel(date)).foregroundStyle(.secondary)
                    Image(systemName: cancelled ? "arrow.uturn.backward.circle.fill" : "checkmark.seal.fill").font(.system(size: 44)).foregroundStyle(cancelled ? .orange : .green)
                    Text(cancelled ? "取消済" : "承認済").font(.title2.bold())
                    Text(cancelled ? "承認を取り消しました。再照合して承認できます。" : "この日の日締めは承認されています。").font(.subheadline).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity).padding(.vertical, 8)
            }
            DayClosingSummary(snapshot: record["snapshot"] ?? .null)
            if cancelled {
                Section { Text("取消 \(dateText(str(record["cancelledAt"])))\n\(str(record["cancellationReason"]))\n承認時点の記録は保管しています。").font(.footnote).foregroundStyle(.orange) }
            }
            if status == .changed {
                Section { Label("承認後に記録が変わっています。「修正」から再照合してください。", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange) }
            }
            Section {
                NavigationLink { DayClosingJournalView() } label: { Label("日締めジャーナル", systemImage: "book.closed") }
                if !cancelled { Button("日締めの承認を取り消す", role: .destructive) { cancelSheet = true } }
            } footer: { Text("承認 \(dateText(str(record["closedAt"])))\n表示している金額は承認時点の記録です。修正して再承認するまで、保存済みの承認記録を保持します。") }
        }
        .safeAreaInset(edge: .bottom) {
            HStack {
                Button { confirmModify = true } label: { Text(cancelled ? "再照合" : "修正").frame(maxWidth: .infinity) }.buttonStyle(.bordered).controlSize(.large)
                Button { dismiss() } label: { Text("完了").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).controlSize(.large)
            }.padding()
        }
        .confirmationDialog("日締めを修正しますか？", isPresented: $confirmModify, titleVisibility: .visible) {
            Button("修正を始める") { editing = true; review = DayClosingReview(date: date); confirmed = false; step = 0 }
        } message: { Text("収入・取引・銀行残高をもう一度照合します。再承認するまで保存済みの承認記録は変更しません。") }
    }

    // MARK: 照合のステップ

    @ViewBuilder private func steps(_ doc: MoneyDocument, today: String, status: DayClosingStatus) -> some View {
        let items = doc.dayClosingItems(date, today: today)
        let snapshot = doc.dayClosingSnapshot(date, today: today)
        let groups = DayClosingGroup.allCases
        let complete: (DayClosingGroup) -> Bool = { doc.dayClosingGroupComplete(items, $0, review) }
        let firstIncomplete = groups.firstIndex { !complete($0) }.map { $0 + 1 }
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text(Format.dayLabel(date)).font(.subheadline).foregroundStyle(.secondary)
                    HStack(spacing: 4) {
                        ForEach(0..<7, id: \.self) { i in
                            Capsule().fill(i < step ? Color.green : i == step ? Color.accentColor : Color.secondary.opacity(0.25)).frame(height: 5)
                        }
                    }
                    Text("ステップ \(step + 1) / 7").font(.caption).foregroundStyle(.secondary)
                    Text(DayClosing.steps[step]).font(.title2.bold())
                }
            }
            switch step {
            case 0:
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("一日の記録を、ひとつずつ。").font(.headline)
                        Text("収入、メール取引、普通取引、銀行残高を照合して、一日を締めましょう。").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                DayClosingSummary(snapshot: snapshot)
                if status == .changed { Section { Label("承認後に記録が変わりました。もう一度照合してください。", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange) } }
                Section {
                    NavigationLink { DayClosingJournalView() } label: { Label("日締めジャーナル", systemImage: "book.closed") }
                } footer: { Text("直近7日間の承認記録を保存します。締めたあとも取引を編集できます。") }
            case 1...4:
                groupSection(groups[step - 1], items: items, snapshot: snapshot)
            case 5:
                Section { Text("収入・支出・照合した銀行残高を最終確認して承認します。").font(.subheadline) }
                DayClosingSummary(snapshot: snapshot)
                Section("銀行残高") {
                    ForEach(doc.banks) { b in LabeledContent(b.name, value: b.balance.yen) }
                }
                if let m = firstIncomplete {
                    Section {
                        Button { step = m } label: { Label("未照合または変更された項目があります。未確認の項目に戻る", systemImage: "exclamationmark.triangle.fill") }.tint(.orange)
                    }
                }
                Section {
                    Button { confirmed.toggle() } label: {
                        HStack {
                            Image(systemName: confirmed ? "checkmark.circle.fill" : "circle").font(.title2).foregroundStyle(confirmed ? .green : .secondary)
                            Text("照合結果を確認し、この内容で承認します").foregroundStyle(.primary)
                            Spacer()
                        }.contentShape(Rectangle())
                    }
                    .buttonStyle(.plain).disabled(firstIncomplete != nil)
                    .accessibilityAddTraits(confirmed ? .isSelected : [])
                } footer: { Text("承認は照合の記録です。取引や残高の金額は変更しません。銀行残高は確認時点の値です。") }
            default:
                Section {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.seal.fill").font(.system(size: 44)).foregroundStyle(.green)
                        Text("承認されました").font(.title2.bold())
                        Text("\(Format.dayLabel(date))の日締めを保存しました。").foregroundStyle(.secondary)
                    }.frame(maxWidth: .infinity).padding(.vertical, 8)
                }
                DayClosingSummary(snapshot: doc["dayClosings"]?[date]?["snapshot"] ?? snapshot)
                Section { NavigationLink { DayClosingJournalView() } label: { Label("日締めジャーナルを見る", systemImage: "book.closed") } }
                    footer: { Text("日締めジャーナルに7日間保存します。取引を変更した場合は再確認が必要です。") }
            }
        }
        .simultaneousGesture(DragGesture(minimumDistance: 40).onEnded { v in
            guard step < 5, abs(v.translation.width) > 80, abs(v.translation.width) > abs(v.translation.height) * 2 else { return }
            if v.translation.width < 0 { advance(items) } else if step > 0 { withAnimation { step -= 1 } }
        })
        .safeAreaInset(edge: .bottom) {
            HStack {
                if step > 0 && step < 6 { Button { withAnimation { step -= 1 } } label: { Text("戻る").frame(maxWidth: .infinity) }.buttonStyle(.bordered).controlSize(.large) }
                if step < 5 {
                    Button { advance(items) } label: { Text(step == 0 ? "照合を始める" : "次へ").frame(maxWidth: .infinity) }
                        .buttonStyle(.borderedProminent).controlSize(.large)
                        .disabled(step > 0 && !complete(groups[step - 1]))
                } else if step == 5 {
                    Button { approve() } label: { Text("承認する").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).tint(.green).controlSize(.large).disabled(!confirmed || firstIncomplete != nil)
                } else {
                    Button { dismiss() } label: { Text("完了").frame(maxWidth: .infinity) }.buttonStyle(.borderedProminent).controlSize(.large)
                }
            }
            .padding()
            .background(.bar)
        }
        .sensoryFeedback(.selection, trigger: review)
        .onChange(of: model.revision) { _, _ in
            // 編集で内容が変わった項目のチェックは外す（Web 版と同じ）
            let live = Dictionary(uniqueKeysWithValues: model.doc.dayClosingItems(date, today: model.today).all.map { ($0.key, $0.fingerprint) })
            review.checks = review.checks.filter { live[$0.key] == $0.value }
            let now = model.doc.dayClosingItems(date, today: model.today)
            review.emptyGroups = review.emptyGroups.filter { now[$0].isEmpty }
            confirmed = false
        }
    }

    private func advance(_ items: DayClosingItems) {
        if step == 0 || model.doc.dayClosingGroupComplete(items, DayClosingGroup.allCases[step - 1], review) { withAnimation { step += 1 } }
        else { model.toast = "このステップの照合を確認してから進んでください" }
    }

    private func approve() {
        let r = review
        model.change("日締めの承認") { d, now, today in try d.recordDayClosing(date, review: r, now: now, today: today) }
        if model.doc.dayClosingStatus(date, today: model.today) == .closed { editing = false; withAnimation { step = 6 } }
    }

    @ViewBuilder private func groupSection(_ g: DayClosingGroup, items: DayClosingItems, snapshot: JSONValue) -> some View {
        let list = items[g]
        let notes: [DayClosingGroup: String] = [
            .income: "この日の登録収入を確認します。入金予定と実際の入金を区別し、必要なら編集してください。",
            .mail: "メールの内容と登録取引を照合します。確認待ちは Web 版の取込画面で承認・照合・対象外の処理をしてください。",
            .ordinary: "手入力・固定支払い・明細取込など、メール以外の取引を確認します。返金はマイナスで表示します。",
            .banks: "銀行アプリや通帳の残高と、登録残高を照合してください。確認時点の残高を保存します。",
        ]
        Section {
            Text(notes[g]!).font(.subheadline)
            LabeledContent(g == .banks ? "現在の銀行残高合計" : "\(g == .income ? "登録収入" : g == .mail ? "メールの登録取引" : "普通取引") · \(list.count)件",
                           value: (g == .banks ? num(snapshot["bankTotal"]) : g == .income ? num(snapshot["incomeTotal"]) : list.reduce(0) { $0 + $1.amount }).yen)
                .font(.headline)
        }
        Section {
            if list.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text(g == .banks ? "登録された銀行口座はありません" : g == .income ? "収入の記録はありません" : g == .mail ? "この日のメール取引はありません" : "普通取引の記録はありません").bold()
                    Text(g == .banks ? "口座を追加するか、口座がないことを確認してください。" : "入力漏れがないことを確認して次へ進みましょう。").font(.footnote).foregroundStyle(.secondary)
                }
                let on = review.emptyGroups.contains(g)
                Button {
                    if on { review.emptyGroups.remove(g) } else { review.emptyGroups.insert(g) }
                } label: {
                    HStack {
                        Image(systemName: on ? "checkmark.circle.fill" : "circle").font(.title2).foregroundStyle(on ? .green : .secondary)
                        Text(g == .banks ? "銀行口座がないことを確認しました" : "記録がないことを確認しました").foregroundStyle(.primary)
                        Spacer()
                    }.contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
            ForEach(list) { item in
                let checked = review.checks[item.key] == item.fingerprint
                HStack(spacing: 12) {
                    Button {
                        if checked { review.checks.removeValue(forKey: item.key) } else { review.checks[item.key] = item.fingerprint }
                    } label: {
                        Image(systemName: checked ? "checkmark.circle.fill" : "circle").font(.title2).foregroundStyle(checked ? .green : item.pending ? Color.secondary.opacity(0.4) : .secondary)
                    }
                    .buttonStyle(.plain).disabled(item.pending)
                    .accessibilityLabel("\(item.title)を照合")
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.title).lineLimit(1)
                        Text(item.subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        if item.pending { Text("承認または対象外の確認が必要です").font(.caption).foregroundStyle(.orange) }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 4) {
                        Text(item.amount.yen).monospacedDigit().foregroundStyle(g == .income ? .green : .primary)
                        Button(g == .banks ? "残高を修正" : item.pending ? "確認する" : "編集") { edit(item) }.font(.caption).buttonStyle(.borderless)
                    }
                }
            }
        } footer: {
            if g == .banks { Text("\(date == model.today ? "" : "過去の日付を締める場合も、")銀行残高は確認時点の値です。過去の一日の最終残高を推定しません。") }
        }
        Section {
            switch g {
            case .income: Button { addIncome = true } label: { Label("収入を追加", systemImage: "plus") }
            case .ordinary: Button { addExpense = true } label: { Label("支出を追加", systemImage: "plus") }
            case .banks: if list.isEmpty { NavigationLink { AccountsView() } label: { Label("銀行口座を追加", systemImage: "plus") } }
            case .mail: EmptyView()
            }
            if !list.isEmpty && list.contains(where: { !$0.pending }) {
                Button("すべて照合済みにする") { for x in list where !x.pending { review.checks[x.key] = x.fingerprint } }
            }
        }
    }

    private func edit(_ item: DayClosingItem) {
        switch item.group {
        case .banks: editBank = item.recordId
        case .income: editIncome = item.recordId
        default:
            if let id = item.transactionId, let t = model.doc.transactions.first(where: { $0.id == id }) { editTx = t }
            else { error = "このメール取引の確認は Web 版のメール取引センターで行ってください。" }
        }
    }
}

func dateText(_ iso: String) -> String {
    guard let ms = ISODate.ms(iso) else { return "" }
    return Date(timeIntervalSince1970: ms / 1000).formatted(date: .abbreviated, time: .shortened)
}

/// 日締めの合計（Web 版 dayClosingSummaryHtml）
struct DayClosingSummary: View {
    var snapshot: JSONValue
    var body: some View {
        let total = num(snapshot["total"]), raw = num(snapshot["rawTotal"]), income = num(snapshot["incomeTotal"])
        let net = snapshot["net"].map { num($0) } ?? (income - total)
        Section {
            Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 10) {
                GridRow { tile("登録収入", income.yen, .green); tile("実質支出", total.yen, .primary) }
                GridRow { tile("収支", net.yen, net < 0 ? .red : .green); tile("銀行残高合計", num(snapshot["bankTotal"]).yen, .primary) }
            }
            if raw != total { Text("取引合計 \(raw.yen) → 実質支出 \(total.yen)\n既存の金額修正を反映しています。").font(.footnote).foregroundStyle(.secondary) }
        }
    }
    private func tile(_ t: String, _ v: String, _ c: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) { Text(t).font(.caption).foregroundStyle(.secondary); Text(v).font(.headline).monospacedDigit().foregroundStyle(c) }
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 日締めジャーナル（Web 版 openDayClosingJournal：直近7日間の承認記録）
struct DayClosingJournalView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let list = model.doc.dayClosingJournal(today: model.today)
        List {
            if list.isEmpty { Text("まだ承認した日はありません").foregroundStyle(.secondary) }
            ForEach(list, id: \.date) { item in
                NavigationLink { DayClosingJournalDetail(date: item.date, record: item.record) } label: {
                    let status = model.doc.dayClosingStatus(item.date, today: model.today)
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Format.dayLabel(item.date))
                            Text("承認 \(dateText(str(item.record["closedAt"])))").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text(status.label).font(.caption.weight(.semibold)).padding(.horizontal, 8).padding(.vertical, 3)
                            .background((status == .closed ? Color.green : .orange).opacity(0.15), in: Capsule())
                            .foregroundStyle(status == .closed ? .green : .orange)
                    }
                }
            }
        }
        .navigationTitle("日締めジャーナル")
    }
}

struct DayClosingJournalDetail: View {
    var date: String
    var record: JSONValue
    var body: some View {
        let snap = record["snapshot"] ?? .null
        List {
            DayClosingSummary(snapshot: snap)
            Section("取引（\(snap["transactions"]?.arrayValue?.count ?? 0)件）") {
                ForEach(Array((snap["transactions"]?.arrayValue ?? []).enumerated()), id: \.offset) { _, t in
                    LabeledContent { Text(num(t["amount"]).yen).monospacedDigit() } label: { Text(str(t["merchant"])); Text(str(t["category"])).font(.caption) }
                }
            }
            if let incs = snap["incomes"]?.arrayValue, !incs.isEmpty {
                Section("収入") { ForEach(Array(incs.enumerated()), id: \.offset) { _, x in LabeledContent(str(x["sourceName"]), value: num(x["amount"]).yen) } }
            }
            Section("銀行残高（確認時点）") {
                ForEach(Array((snap["banks"]?.arrayValue ?? []).enumerated()), id: \.offset) { _, b in LabeledContent(str(b["name"]), value: num(b["balance"]).yen) }
            }
            if !str(record["cancelledAt"]).isEmpty { Section { Text("取消 \(dateText(str(record["cancelledAt"])))・\(str(record["cancellationReason"]))").foregroundStyle(.orange) } }
        }
        .navigationTitle(Format.dayLabel(date))
    }
}

/// 承認の取消（Web 版 openDayClosingCancellation：理由・確認・「取消」の入力）
struct DayClosingCancelView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var date: String
    @State private var reason = DayClosing.cancelReasons[0]
    @State private var acknowledged = false
    @State private var text = ""
    var body: some View {
        Form {
            Section("理由") { Picker("理由", selection: $reason) { ForEach(DayClosing.cancelReasons, id: \.self) { Text($0).tag($0) } }.pickerStyle(.inline).labelsHidden() }
            Section {
                Toggle("承認時点の記録は保管され、取引や残高は変わらないことを確認しました", isOn: $acknowledged)
                TextField("確認のため「取消」と入力", text: $text)
            }
        }
        .navigationTitle("承認を取り消す").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) {
                Button("取り消す", role: .destructive) {
                    let r = reason
                    model.change("日締めの取消") { d, now, today in try d.cancelDayClosing(date, reason: r, now: now, today: today) }
                    model.toast = "日締めの承認を取り消しました"; dismiss()
                }.disabled(!acknowledged || text != "取消")
            }
        }
    }
}

/// 収入の編集（日締めの照合から）
struct IncomeEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var incomeId: String
    var body: some View {
        if let x = model.doc.incomes.first(where: { $0.id == incomeId }) {
            if !x.tempIncomeId.isEmpty { TempIncomeEditor(tempId: x.tempIncomeId) }
            else if !x.salaryRecordId.isEmpty { SalaryRecordEditor(recordId: x.salaryRecordId) }
            else {
                Form {
                    LabeledContent("収入源", value: x.sourceName); LabeledContent("金額", value: x.amount.yen); LabeledContent("日付", value: Format.dayLabel(x.date))
                    Text("この収入は Web 版で編集してください。").font(.footnote).foregroundStyle(.secondary)
                }
                .navigationTitle("収入")
            }
        } else { ContentUnavailableView("収入が見つかりません", systemImage: "questionmark") }
    }
}
