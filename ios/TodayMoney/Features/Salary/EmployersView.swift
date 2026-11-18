import SwiftUI
import TodayMoneyCore

/// 勤務先の一覧
struct EmployersView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        List {
            Section {
                NavigationLink { CalendarShiftView() } label: { Label("カレンダーからシフトを取り込む", systemImage: "calendar.badge.clock") }
            }
            Section { NavigationLink { EmployerTermsView(employerId: "") } label: { Label("勤務先を追加", systemImage: "plus") } }
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
    @State private var confirmDelete = false
    @State private var blocked = ""

    var body: some View {
        Group {
            if let binding = Binding($e) {
                Form {
                    Section("勤務先") {
                        TextField("会社名（例：GU）", text: binding.name)
                        Picker("給与の振込先", selection: binding.bankId) { Text("未設定").tag(""); ForEach(model.doc.banks) { Text($0.name).tag($0.id) } }
                    }
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
                    Section {
                        Picker("締め日", selection: binding.closingType) { Text("月末").tag("month_end"); Text("日付").tag("day") }.pickerStyle(.segmented)
                        if binding.wrappedValue.closingType == "day" {
                            Picker("締める日", selection: binding.closingDay) { ForEach(1...28, id: \.self) { Text("毎月\($0)日").tag($0) } }
                        }
                        Picker("給料日の月", selection: binding.payMonthOffset) { Text("当月").tag(0); Text("翌月").tag(1); Text("翌々月").tag(2) }
                        Picker("給料日", selection: binding.payType) { Text("日付").tag("day"); Text("月末").tag("month_end") }.pickerStyle(.segmented)
                        if binding.wrappedValue.payType != "month_end" {
                            Picker("支給日", selection: binding.payDay) { ForEach(1...31, id: \.self) { Text("\($0)日").tag($0) } }
                        }
                        LabeledContent("今月勤務分の給料日", value: Format.dayLabel(Payroll.payDate(binding.wrappedValue, workMonth: Dates.ym())))
                    } header: { Text("締め日と給料日") } footer: {
                        let m = Dates.ym(), e = binding.wrappedValue
                        Text("例：\(e.closingType == "day" ? "\(Format.shortDay(Dates.addMonths(m, -1) + "-" + String(format: "%02d", min(28, e.closingDay + 1))))〜\(Format.shortDay(m + "-" + String(format: "%02d", e.closingDay)))" : "\(Format.monthLabel(m))1日〜月末")の勤務 → \(Format.dayLabel(Payroll.payDate(e, workMonth: m)))に支給")
                    }
                    if !employerId.isEmpty {
                        Section { Button("この勤務先を削除", role: .destructive) { confirmDelete = true } }
                    }
                }
                .navigationTitle(employerId.isEmpty ? "勤務先登録" : binding.wrappedValue.name)
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold() }
                }
                .sheet(isPresented: $showRule) { ruleSheet(binding) }
                .confirmationDialog("この勤務先を削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
                    Button("削除", role: .destructive) {
                        if model.doc.salaryRecords.contains(where: { $0.employerId == employerId }) { blocked = "この勤務先の給与の記録があります。先に給与の記録を削除してください。"; return }
                        model.commit("勤務先の削除") { d in d.employers = d.employers.filter { $0.id != employerId }; d.shiftPlans = d.shiftPlans.filter { $0.employerId != employerId } }
                        dismiss()
                    }
                } message: { Text("この勤務先のシフトの記録も削除します。") }
                .alert("削除できません", isPresented: Binding(get: { !blocked.isEmpty }, set: { if !$0 { blocked = "" } })) { Button("OK") {} } message: { Text(blocked) }
            } else {
                ContentUnavailableView("勤務先が見つかりません", systemImage: "briefcase")
            }
        }
        .onAppear {
            if e == nil, let found = model.doc.employer(employerId) { e = found; aliasesText = found.aliases.joined(separator: "、") }
            else if e == nil && employerId.isEmpty {
                // Web 版 openEmployerCreate の初期値：月末締め・翌月25日払い・交通費は1勤務ごと
                var n = Employer(json: .object([:]))
                n.closingType = "month_end"; n.closingDay = 15; n.payType = "day"; n.payDay = 25; n.payMonthOffset = 1; n.transportUnit = "per_shift"
                e = n
            }
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
        edited.name = edited.name.trimmingCharacters(in: .whitespaces)
        guard !edited.name.isEmpty else { model.errorMessage = "会社名を入力してください。"; return }
        let isNew = employerId.isEmpty
        model.change(isNew ? "勤務先の登録" : "勤務先の条件") { doc, now, _ in
            var list = doc.employers
            if isNew {
                edited.id = MoneyDocument.uid("emp", now: now)
                var raw = edited.json.objectValue ?? [:]; raw["createdAt"] = .string(ISODate.now(now)); raw["tagIds"] = .array([])
                list.append(Employer(json: .object(raw)))
            } else if let i = list.firstIndex(where: { $0.id == employerId }) { list[i] = edited }
            doc.employers = list
        }
        model.done("\(edited.name)の条件を保存しました")
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
                        if let r = result { model.done("シフト\(r.count)件から給料の見込みを更新しました") }
                        dismiss()
                    }
                    .bold()
                    .disabled(groups.isEmpty)
                }
            }
        }
    }
}
