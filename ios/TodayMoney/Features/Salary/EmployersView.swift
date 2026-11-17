import SwiftUI
import TodayMoneyCore

/// 勤務先の一覧
struct EmployersView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        List {
            ForEach(model.doc.employers) { e in
                NavigationLink { EmployerTermsView(employerId: e.id) } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(e.name)
                        Text(termsText(e)).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle("勤務先と給与の条件")
    }
    private func termsText(_ e: Employer) -> String {
        var parts = ["時給 \(e.hourly.yen)", "交通費 \(e.transport.yen)\(e.transportUnit == "per_shift" ? "／勤務" : "／月")"]
        if e.transportCap > 0 { parts.append("上限 \(e.transportCap.yen)") }
        parts.append("給料日 \(Format.shortDay(Payroll.payDate(e, workMonth: Dates.ym())))")
        return parts.joined(separator: "・")
    }
}

/// 勤務先の給与の条件（時給・交通費・上限・休憩ルール・予定名）
struct EmployerTermsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var employerId: String
    @State private var e: Employer?
    @State private var aliasesText = ""
    @State private var newRule = BreakRule(from: 360, to: nil, minutes: 45)
    @State private var showRule = false

    var body: some View {
        Group {
            if let binding = Binding($e) {
                Form {
                    Section {
                        AmountField(title: "時給", value: binding.hourly)
                        Picker("交通費の払い方", selection: binding.transportUnit) {
                            Text("1勤務ごと（往復）").tag("per_shift")
                            Text("毎月決まった額").tag("monthly")
                        }
                        AmountField(title: binding.wrappedValue.transportUnit == "per_shift" ? "交通費（往復）" : "交通費（月額）", value: binding.transport)
                        AmountField(title: "交通費の月の上限（0 = なし）", value: binding.transportCap)
                    } header: { Text("給与の条件") } footer: { example(binding.wrappedValue) }
                    Section {
                        ForEach(binding.wrappedValue.breakRules, id: \.self) { r in
                            Text(ruleText(r))
                        }
                        .onDelete { binding.wrappedValue.breakRules.remove(atOffsets: $0) }
                        Button { showRule = true } label: { Label("休憩ルールを追加", systemImage: "plus") }
                    } header: { Text("休憩") } footer: {
                        Text(binding.wrappedValue.breakRules.isEmpty ? "ルールがない時は、8時間を超えると60分・6時間を超えると45分の休憩を引きます。" : "勤務時間がその範囲の時に、休憩を引いて計算します。")
                    }
                    Section {
                        TextField("例: ジーユー, GU 新宿店", text: $aliasesText)
                    } header: { Text("シフトの予定名（別名）") } footer: {
                        Text("シフトボードの予定名にこの言葉が入っていれば、この勤務先のシフトとして計算します。読点（、）かカンマで区切ります。")
                    }
                    Section("給料日") {
                        LabeledContent("締め日", value: binding.wrappedValue.closingType == "day" ? "毎月\(binding.wrappedValue.closingDay)日" : "月末")
                        LabeledContent("今月勤務分の給料日", value: Format.dayLabel(Payroll.payDate(binding.wrappedValue, workMonth: Dates.ym())))
                    }
                }
                .navigationTitle(binding.wrappedValue.name)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold() }
                }
                .sheet(isPresented: $showRule) { ruleSheet(binding) }
            } else {
                ContentUnavailableView("勤務先が見つかりません", systemImage: "briefcase")
            }
        }
        .onAppear {
            if e == nil, let found = model.doc.employer(employerId) { e = found; aliasesText = found.aliases.joined(separator: "、") }
        }
    }

    private func ruleText(_ r: BreakRule) -> String {
        let h = { (m: Int) in m % 60 == 0 ? "\(m / 60)時間" : "\(m / 60)時間\(m % 60)分" }
        return "\(h(r.from))以上\(r.to.map { "\(h($0))未満" } ?? "")：\(r.minutes)分"
    }

    @ViewBuilder private func example(_ e: Employer) -> some View {
        let d = Shifts.duration(start: "10:00", end: "18:00", rules: e.breakRules)
        let pay = (e.hourly * Double(d.work) / 60).rounded()
        Text("例：10:00〜18:00 → 休憩\(d.brk)分・\(Double(d.work) / 60, specifier: "%.1f")時間 × \(e.hourly.yen) = \(pay.yen)\(e.transportUnit == "per_shift" ? "＋交通費 \(e.transport.yen)" : "")")
    }

    private func ruleSheet(_ binding: Binding<Employer>) -> some View {
        NavigationStack {
            Form {
                Stepper("勤務時間 \(newRule.from / 60)時間以上", value: $newRule.from, in: 0...720, step: 30)
                Toggle("上限を決める", isOn: Binding(get: { newRule.to != nil }, set: { newRule.to = $0 ? max(newRule.from + 60, 420) : nil }))
                if let to = newRule.to {
                    Stepper("\(to / 60)時間\(to % 60 == 0 ? "" : "\(to % 60)分")未満", value: Binding(get: { to }, set: { newRule.to = $0 }), in: (newRule.from + 30)...1440, step: 30)
                }
                Stepper("休憩 \(newRule.minutes)分", value: $newRule.minutes, in: 0...120, step: 15)
            }
            .navigationTitle("休憩ルールの追加")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { showRule = false } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("追加") { binding.wrappedValue.breakRules.append(newRule); binding.wrappedValue.breakRules.sort { $0.from < $1.from }; showRule = false }.bold()
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func save() {
        guard var edited = e else { return }
        edited.aliases = aliasesText.split(whereSeparator: { ",、，".contains($0) }).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        model.commit("勤務先の条件") { doc in
            var list = doc.employers
            if let i = list.firstIndex(where: { $0.id == employerId }) { list[i] = edited; doc.employers = list }
        }
        model.toast = "\(edited.name)の条件を保存しました"
        dismiss()
    }
}

/// シフトの取り込み（シフトボード → カレンダー → ショートカットでコピーした文字を貼り付ける）
struct ShiftImportView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var text = ""

    var body: some View {
        let doc = model.doc
        let shifts = Shifts.parse(text, today: model.today)
        let groups = Shifts.estimate(shifts, in: doc, settings: doc.shiftSettings)
        NavigationStack {
            Form {
                Section {
                    TextEditor(text: $text)
                        .frame(minHeight: 140)
                        .font(.system(.body, design: .monospaced))
                    Button { if let s = UIPasteboard.general.string { text = s } } label: { Label("貼り付け", systemImage: "doc.on.clipboard") }
                } header: { Text("シフト（1行に1回）") } footer: {
                    Text("例：2026-12-01 10:00-18:00 GU。日付は 12/1・12月1日、時刻の区切りは 〜 でも読めます。")
                }
                if !groups.isEmpty {
                    ForEach(groups, id: \.key) { g in
                        Section("\(doc.employer(g.employerId)?.name ?? "")・\(Format.monthLabel(g.month))勤務分") {
                            LabeledContent("勤務", value: "\(g.items.count)回・\(g.minutes / 60)時間\(g.minutes % 60 == 0 ? "" : "\(g.minutes % 60)分")")
                            LabeledContent("給与", value: g.gross.yen)
                            LabeledContent("交通費", value: g.transport.yen + (g.transportUncapped != nil ? "（上限）" : ""))
                            LabeledContent("合計（\(Format.shortDay(g.payDate))入金予定）", value: (g.gross + g.transport).yen).bold()
                        }
                    }
                } else if !text.isEmpty {
                    Section { Text("シフトが見つかりません。「2026-12-01 10:00-18:00 GU」のように書いてください。").foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("シフトの取り込み")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("反映") {
                        var result: ShiftSync.Result?
                        model.commit("シフトの取り込み") { result = ShiftSync.apply(shifts, to: &$0, replace: false) }
                        if let r = result { model.toast = "シフト\(r.count)件から給料の見込みを更新しました" }
                        dismiss()
                    }
                    .bold()
                    .disabled(groups.isEmpty)
                }
            }
        }
    }
}
