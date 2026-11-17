import SwiftUI
import TodayMoneyCore

/// 給与タブ
struct SalaryScreen: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        NavigationStack { SalaryMonthView(month: model.thisMonth) }
    }
}

/// 1か月の給与（Web 版の給与画面と同じ数え方：予定の入金日の月にまとめる）
struct SalaryMonthView: View {
    @Environment(AppModel.self) private var model
    @State var month: String
    @State private var showImport = false

    var body: some View {
        let doc = model.doc, today = model.today
        let s = doc.salarySummary(month, today: today)
        let prev = doc.salarySummary(Dates.addMonths(month, -1), today: today).total
        List {
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(month == model.thisMonth ? "今月の受取見込み" : "この月の受取見込み").font(.subheadline).foregroundStyle(.secondary)
                    MoneyText(value: s.total, size: 40, weight: .heavy)
                    if prev > 0 {
                        let diff = s.total - prev
                        Text("前月比 \(diff >= 0 ? "+" : "")\(diff.yen)")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(diff >= 0 ? .green : .red)
                    }
                }
                .padding(.vertical, 4)
                HStack {
                    tile("入金済み", s.received, .green)
                    Divider()
                    tile("これから", s.planned, .blue)
                    Divider()
                    tile("未確認", s.overdue, .orange)
                }
            }
            if let next = doc.nextSalaryEvent(month, today: today) {
                Section("次の入金") {
                    LabeledContent {
                        VStack(alignment: .trailing) {
                            Text("+\(next.amount.yen)").foregroundStyle(.green).monospacedDigit()
                            let days = Dates.daysBetween(today, next.date)
                            Text(days == 0 ? "今日" : days > 0 ? "あと\(days)日" : "予定日超過").font(.caption).foregroundStyle(.secondary)
                        }
                    } label: {
                        Text(next.name)
                        Text(Format.dayLabel(next.date)).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            Section("勤務先") {
                ForEach(doc.employers) { e in
                    let recs = s.records.filter { $0.employerId == e.id }
                    let amount = recs.reduce(0) { $0 + doc.expectedOrReceived($1, today: today) }
                    NavigationLink { EmployerTermsView(employerId: e.id) } label: {
                        LabeledContent {
                            Text(amount.yen).monospacedDigit()
                        } label: {
                            Text(e.name)
                            if let r = recs.first {
                                Text("\(Format.dayLabel(doc.effectiveDate(r)))・\(doc.status(r, today: today).rawValue)").font(.caption).foregroundStyle(.secondary)
                            } else {
                                Text("この月の給与は未登録").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            Section("給与記録") {
                if s.records.isEmpty { Text("この月の給与はまだありません").foregroundStyle(.secondary) }
                ForEach(s.records) { r in
                    NavigationLink { SalaryRecordEditor(recordId: r.id) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(doc.employer(r.employerId)?.name ?? "勤務先")・\(Format.monthLabel(r.month))勤務分")
                                HStack(spacing: 6) {
                                    StatusPill(status: doc.status(r, today: today))
                                    if r.source == "shift" { Text("シフト\(r.shiftCount)回から計算").font(.caption).foregroundStyle(.secondary) }
                                }
                            }
                            Spacer()
                            Text(doc.expectedOrReceived(r, today: today).yen).monospacedDigit()
                        }
                    }
                }
                ForEach(s.temps) { t in
                    LabeledContent {
                        Text(t.amount.yen).monospacedDigit()
                    } label: {
                        Text(t.sourceName.isEmpty ? "臨時収入" : t.sourceName)
                        StatusPill(status: doc.status(t, today: today))
                    }
                }
            }
            if let note = shiftNote(doc) {
                Section { Text(note).font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle(Format.monthLabel(month))
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { withAnimation { month = Dates.addMonths(month, -1) } } label: { Image(systemName: "chevron.left") }
                    .accessibilityLabel("前の月")
                Button { withAnimation { month = Dates.addMonths(month, 1) } } label: { Image(systemName: "chevron.right") }
                    .accessibilityLabel("次の月")
                Menu {
                    Button { showImport = true } label: { Label("シフトを取り込む", systemImage: "calendar.badge.plus") }
                    NavigationLink { EmployersView() } label: { Label("勤務先と給与の条件", systemImage: "briefcase") }
                    if month != model.thisMonth { Button { month = model.thisMonth } label: { Label("今月に戻る", systemImage: "arrow.uturn.backward") } }
                } label: { Image(systemName: "ellipsis.circle") }
            }
        }
        .sheet(isPresented: $showImport) { ShiftImportView() }
    }

    private func tile(_ title: String, _ value: Double, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).font(.caption).foregroundStyle(.secondary)
            Text(value.yen).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(value > 0 ? color : .primary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func shiftNote(_ doc: MoneyDocument) -> String? {
        doc.salaryRecords.contains { $0.source == "shift" } ? "シフトから計算した給与は、総支給額に交通費を含みます。手で直した金額は7日間、自動の計算で上書きしません。" : nil
    }
}

/// 給与の記録を直す（金額・入金の状態）
struct SalaryRecordEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var recordId: String
    @State private var gross = 0.0
    @State private var transport = 0.0
    @State private var paid = false
    @State private var receivedAmount = 0.0
    @State private var receivedDate = Date()
    @State private var loaded = false

    var body: some View {
        let doc = model.doc
        if let r = doc.salaryRecords.first(where: { $0.id == recordId }) {
            let linked = doc.linkedIncome(for: r)
            Form {
                Section {
                    LabeledContent("勤務先", value: doc.employer(r.employerId)?.name ?? "—")
                    LabeledContent("勤務対象月", value: Format.monthLabel(r.month))
                    LabeledContent("予定の入金日", value: Format.dayLabel(r.date))
                }
                Section {
                    AmountField(title: r.amountBasis == "net" ? "受取予定額（控除後）" : "総支給額", value: $gross)
                    AmountField(title: "うち交通費", value: $transport)
                } footer: {
                    if r.source == "shift" { Text("シフト\(r.shiftCount)回から自動で計算しました。金額を直すと、7日間は手入力が優先されます。") }
                    else if let until = ShiftSync.manualLockUntil(r), until > .now { Text("手入力の金額です。\(until.formatted(date: .abbreviated, time: .omitted))までは、シフトの自動計算で上書きしません。") }
                }
                Section {
                    Toggle("入金済み", isOn: $paid).disabled(linked != nil)
                    if paid {
                        AmountField(title: "実際の受取額", value: $receivedAmount)
                        DatePicker("実際の入金日", selection: $receivedDate, in: ...Date(), displayedComponents: .date)
                    }
                } header: { Text("入金状態") } footer: {
                    if linked != nil { Text("この給与は Web 版で入金の記録（口座への反映）とつながっています。入金状態は Web 版で変更してください。") }
                }
            }
            .navigationTitle("給与を編集")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("保存") { save(r) }.bold()
                }
            }
            .onAppear { if !loaded { load(r) } }
        } else {
            ContentUnavailableView("給与記録が見つかりません", systemImage: "questionmark.folder", description: Text("別の操作で削除された可能性があります。"))
        }
    }

    private func load(_ r: SalaryRecord) {
        loaded = true
        gross = r.gross; transport = r.transport; paid = r.status == "入金済"
        receivedAmount = r.receivedAmount ?? r.gross
        let initial = !r.actualReceivedDate.isEmpty ? r.actualReceivedDate : (r.date <= model.today ? r.date : model.today)
        receivedDate = Dates.date(initial)
    }

    private func save(_ r: SalaryRecord) {
        let receivedYMD = Dates.ymd(receivedDate)
        model.commit("給与の編集") { doc in
            var list = doc.salaryRecords
            guard let i = list.firstIndex(where: { $0.id == recordId }) else { return }
            var x = list[i]
            if x.gross != gross || x.transport != transport {
                x.gross = gross; x.transport = transport; x.source = "manual"
                x.manualAt = ISO8601DateFormatter().string(from: .now)
            }
            if doc.linkedIncome(for: x) == nil {
                if paid {
                    x.status = "入金済"; x.receivedAmount = receivedAmount; x.actualReceivedDate = receivedYMD
                } else {
                    x.status = "予定"; x.receivedAmount = nil; x.actualReceivedDate = ""
                    var raw = x.json.objectValue ?? [:]
                    raw.removeValue(forKey: "receivedAmount"); raw.removeValue(forKey: "actualReceivedDate")
                    x = SalaryRecord(json: .object(raw))
                }
            }
            list[i] = x
            doc.salaryRecords = list
        }
        model.toast = paid ? "入金を確認して給与を更新しました" : "給与を更新しました"
        dismiss()
    }
}

#Preview {
    SalaryScreen().environment(AppModel.preview())
}
