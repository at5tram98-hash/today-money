import Charts
import SwiftUI
import TodayMoneyCore


/// 給与（Web 版 renderPay：月の受取見込み・前月比・勤務先別の構成／給与推移・入金済み／これから／未確認・次の入金・勤務先・給与管理・分析）
struct SalaryMonthView: View {
    @Environment(AppModel.self) private var model
    @State var month: String
    @AppStorage("salaryChart") private var chart = "share"
    @AppStorage("salaryRange") private var trendRange = "3M"
    @State private var showImport = false
    @State private var adding = false
    @State private var scrub: ValuePoint?

    var body: some View {
        let doc = model.doc, today = model.today
        let s = doc.salarySummary(month, today: today)
        let delta = doc.salaryMonthDelta(month, today: today)
        let share = doc.salaryComposition(month, today: today)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                MonthSwitcher(month: $month, thisMonth: model.thisMonth)
                hero(s, delta: delta)
                NavigationLink { FinancialUpdatesView(kind: "salary") } label: {
                    Label("金額を更新", systemImage: "pencil").font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 12)
                        .background(Color.accentColor.opacity(0.14), in: Capsule()).foregroundStyle(Color.accentColor)
                }
                .buttonStyle(CardPressStyle())
                if s.records.contains(where: { str($0.raw["amountBasis"]) == "net" }) {
                    Text("登録済みの給与予定は控除後の金額です。交通費は別に足していません。").font(.footnote).foregroundStyle(.secondary)
                }
                composition(share: share, s: s, doc: doc, today: today)
                HStack(spacing: 8) {
                    StatTile(title: "入金済み", value: s.received.yen, tint: s.received > 0 ? .green : .primary)
                    StatTile(title: "これから", value: s.planned.yen, tint: s.planned > 0 ? .blue : .primary)
                    StatTile(title: "未確認", value: s.overdue.yen, tint: s.overdue > 0 ? .orange : .primary)
                }
                next(doc: doc, today: today)
                employers(doc: doc, today: today, share: share)
                manage(s)
            }
            .padding(16)
            .padding(.bottom, 90)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("給与")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("給与を追加")
                Menu {
                    Button { showImport = true } label: { Label("シフトを貼り付けて取り込む", systemImage: "doc.on.clipboard") }
                    NavigationLink { EmployersView() } label: { Label("勤務先と給与の条件", systemImage: "briefcase") }
                    Button { model.entryMode = .income } label: { Label("臨時収入を記録", systemImage: "plus.circle") }
                    if month != model.thisMonth { Button { month = model.thisMonth } label: { Label("今月に戻る", systemImage: "arrow.uturn.backward") } }
                } label: { Image(systemName: "ellipsis.circle") }
                .accessibilityLabel("メニュー")
            }
        }
        .sheet(isPresented: $showImport) { ShiftImportView() }
        .sheet(isPresented: $adding) { NavigationStack { SalaryRecordEditor(recordId: nil) } }
    }

    // MARK: 受取見込みと前月比

    private func hero(_ s: SalaryMonthSummary, delta: (prev: Double, diff: Double, pct: Double?)) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(month == model.thisMonth ? "今月の受取見込み" : "\(Format.monthLabel(month))の受取見込み").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
            MoneyText(value: s.total, size: 44, weight: .heavy)
            if let p = delta.pct {
                HStack(spacing: 8) {
                    Label(signedYen(delta.diff), systemImage: delta.diff >= 0 ? "arrow.up.right" : "arrow.down.right")
                    Text(String(format: "%+.1f%%", p))
                    Text("前月比").foregroundStyle(.secondary)
                }
                .font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(delta.diff >= 0 ? .green : .red)
            } else {
                Text("前月と比べられる給与がありません").font(.footnote).foregroundStyle(.secondary)
            }
            if s.total > 0 {
                let parts: [(Double, Color)] = [(s.received, .green), (s.planned, .blue), (s.overdue, .orange)]
                GeometryReader { g in
                    HStack(spacing: 2) {
                        ForEach(Array(parts.enumerated()), id: \.offset) { _, p in
                            if p.0 > 0 { Capsule().fill(p.1.gradient).frame(width: max(4, (g.size.width - 4) * p.0 / s.total)) }
                        }
                    }
                }
                .frame(height: 8)
                .accessibilityLabel("入金済み \(s.received.yen)、これから \(s.planned.yen)、未確認 \(s.overdue.yen)")
            }
        }
        .cardSurface()
    }

    // MARK: 勤務先別の構成・給与推移

    private func composition(share: [SalaryShare], s: SalaryMonthSummary, doc: MoneyDocument, today: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(chart == "trend" ? "給与推移" : "\(month == model.thisMonth ? "今月" : "この月")の給与構成").font(.title3.bold())
                Spacer()
                Menu {
                    Picker("表示", selection: $chart) {
                        Label("勤務先別", systemImage: "chart.pie").tag("share")
                        Label("給与推移", systemImage: "chart.xyaxis.line").tag("trend")
                    }
                } label: {
                    HStack(spacing: 4) { Text(chart == "trend" ? "給与推移" : "勤務先別"); Image(systemName: "chevron.down").font(.caption2.weight(.bold)) }
                        .font(.subheadline.weight(.semibold)).padding(.horizontal, 12).padding(.vertical, 7)
                        .background(Color(.tertiarySystemFill), in: Capsule())
                }
            }
            Text(chart == "trend" ? "月ごとの受取額を比べます。グラフをなぞると、その月の金額が出ます。" : "受取見込みを100%として、勤務先ごとの割合を表示します。")
                .font(.footnote).foregroundStyle(.secondary)
            if chart == "trend" {
                let pts = doc.salaryTrend(month, range: trendRange, today: today)
                if pts.count == 1 {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(Format.monthLabel(month)).font(.caption).foregroundStyle(.secondary)
                        MoneyText(value: pts[0].value, size: 28)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    salaryBars(pts)
                }
                Picker("期間", selection: $trendRange) {
                    ForEach([("1M", "1M"), ("3M", "3M"), ("6M", "6M"), ("1Y", "1Y"), ("ALL", "全期間")], id: \.0) { Text($0.1).tag($0.0) }
                }
                .pickerStyle(.segmented)
            } else if share.isEmpty {
                ContentUnavailableView { Label("この月の給与はまだありません", systemImage: "yensign.circle") } description: { Text("右上の＋から給与を追加できます。") }
            } else {
                HStack(spacing: 18) {
                    DonutChart(parts: share.map { (name: $0.name, value: $0.amount) }) {
                        VStack(spacing: 0) {
                            Text(month == model.thisMonth ? "今月" : String(Format.monthLabel(month).split(separator: "年").last ?? "")).font(.caption2).foregroundStyle(.secondary)
                            Text("100%").font(.headline.weight(.bold))
                        }
                    }
                    .frame(width: 120, height: 120)
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(share.enumerated()), id: \.element.id) { i, x in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Circle().fill(ChartPalette.color(i)).frame(width: 9, height: 9)
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(x.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                                    Text(x.amount.yen).font(.caption).foregroundStyle(.secondary).monospacedDigit()
                                }
                                Spacer(minLength: 4)
                                Text("\(x.pct)%").font(.subheadline.weight(.bold)).monospacedDigit()
                            }
                        }
                    }
                }
            }
        }
        .cardSurface()
    }

    private func salaryBars(_ pts: [ValuePoint]) -> some View {
        let cur = month + "-01"
        let avg = pts.map(\.value).reduce(0, +) / Double(max(1, pts.count))
        return VStack(alignment: .leading, spacing: 6) {
            if let s = scrub {
                Text("\(Format.monthLabel(String(s.date.prefix(7))))  \(s.value.yen)").font(.subheadline.weight(.semibold)).monospacedDigit()
            } else {
                Text("平均 \(avg.yen)／月").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary).monospacedDigit()
            }
            Chart {
                ForEach(pts) { p in
                    BarMark(x: .value("月", String(p.date.prefix(7))), y: .value("給与", p.value))
                        .foregroundStyle(p.date == cur || scrub?.date == p.date ? Color.green.gradient : Color.green.opacity(0.35).gradient)
                        .cornerRadius(5)
                }
                RuleMark(y: .value("平均", avg)).foregroundStyle(.secondary.opacity(0.6)).lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }
            .chartXAxis {
                AxisMarks { v in AxisValueLabel { if let m = v.as(String.self) { Text("\(Int(m.suffix(2)) ?? 0)月") } } }
            }
            .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
            .chartOverlay { proxy in
                GeometryReader { g in
                    Rectangle().fill(.clear).contentShape(Rectangle())
                        .gesture(DragGesture(minimumDistance: 0)
                            .onChanged { v in
                                let x = v.location.x - g[proxy.plotFrame!].origin.x
                                if let m: String = proxy.value(atX: x), let p = pts.first(where: { $0.date.hasPrefix(m) }), p != scrub { scrub = p; Feedback.selection() }
                            }
                            .onEnded { _ in scrub = nil })
                }
            }
            .frame(height: 170)
        }
    }

    // MARK: 次の入金

    @ViewBuilder private func next(doc: MoneyDocument, today: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("次の入金").font(.title3.bold())
            if let n = doc.nextSalaryEvent(month, today: today) {
                let days = Dates.daysBetween(today, n.date)
                HStack(spacing: 14) {
                    Image(systemName: "yensign").font(.headline.weight(.bold)).foregroundStyle(.white)
                        .frame(width: 40, height: 40).background(Color.green.gradient, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(n.name).font(.body.weight(.semibold))
                        Text(Format.dayLabel(n.date)).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("+\(n.amount.yen)").font(.body.weight(.bold)).monospacedDigit().foregroundStyle(.green)
                        Text(days == 0 ? "今日" : days > 0 ? "あと\(days)日" : "予定日を過ぎています").font(.caption.weight(.semibold)).foregroundStyle(days < 0 ? .orange : .secondary)
                    }
                }
                .cardSurface()
            } else {
                Text("この月の、これからの入金予定はありません（受け取り済み、または未登録）。").font(.footnote).foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading).cardSurface()
            }
        }
    }

    // MARK: 勤務先

    private func employers(doc: MoneyDocument, today: String, share: [SalaryShare]) -> some View {
        let colorIndex = Dictionary(uniqueKeysWithValues: share.enumerated().map { ($0.element.id, $0.offset) })
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("勤務先").font(.title3.bold())
                Spacer()
                NavigationLink { ReasonAnalysisView(kind: "salary", month: month) } label: { Text("分析 ›").font(.subheadline.weight(.semibold)) }
            }
            VStack(spacing: 0) {
                let rows = doc.salaryEmployerRows(month, today: today)
                if rows.isEmpty { Text("勤務先がありません。").font(.footnote).foregroundStyle(.secondary).padding() }
                ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                    if i > 0 { Divider().padding(.leading, 16) }
                    let color = colorIndex[r.employer.id].map(ChartPalette.color) ?? .gray
                    NavigationLink { EmployerTermsView(employerId: r.employer.id) } label: {
                        // 上段：名前・推移・金額、下段：日付と状態・時給と交通費（横に詰めない）
                        VStack(alignment: .leading, spacing: 6) {
                            HStack(spacing: 12) {
                                Text(r.employer.name).font(.body.weight(.semibold)).foregroundStyle(.primary).lineLimit(2)
                                Spacer(minLength: 6)
                                Sparkline(points: r.series.enumerated().map { ValuePoint(date: String($0.offset), value: $0.element) }, tint: color)
                                    .frame(width: 56, height: 24)
                                VStack(alignment: .trailing, spacing: 1) {
                                    Text(r.records.isEmpty ? "—" : r.amount.yen).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(.primary).fixedSize()
                                    Text(r.records.isEmpty ? "—" : "\(r.pct)%").font(.caption.weight(.semibold)).foregroundStyle(color)
                                }
                                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
                            }
                            Text(r.records.isEmpty ? "この月の給与は未登録" : (r.date.isEmpty ? r.status : "\(Format.dayLabel(r.date))・\(r.status)"))
                                .font(.caption).foregroundStyle(r.status.contains("未確認") ? .orange : .secondary)
                            Text("時給 \(r.employer.hourly.yen)・交通費 \(r.employer.transport.yen)\(r.employer.transportUnit == "per_shift" ? "／勤務" : "")")
                                .font(.caption2).foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 12)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(CardPressStyle())
                    .accessibilityElement(children: .combine)
                }
            }
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    // MARK: 給与管理・分析

    private func manage(_ s: SalaryMonthSummary) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("給与管理").font(.title3.bold()).padding(.top, 6)
            LinkGroup {
                LinkRow(title: "給与記録", sub: "\(s.records.count)件・記録の確認、編集、入金状態", symbol: "list.bullet.rectangle.fill", tint: .blue) { SalaryRecordsView(month: month) }
                LinkRow(title: "給料日の振り分け", sub: "受け取った給与を用途別に分ける", symbol: "arrow.up.arrow.down", tint: .cyan) { SalaryAllocationListView() }
                LinkRow(title: "臨時収入", sub: "\(s.temps.count)件・\(s.tempTotal.yen)", symbol: "plus", tint: .orange) { TempIncomeHistoryView() }
            }
            Text("分析").font(.title3.bold()).padding(.top, 6)
            LinkGroup {
                LinkRow(title: "給与分析", sub: "勤務先別・入金月別を比べる", symbol: "chart.bar.fill", tint: .indigo) { ReasonAnalysisView(kind: "salary", month: month) }
                LinkRow(title: "勤務先と給与の条件", sub: "時給・交通費・締め日・給料日", symbol: "briefcase.fill", tint: .green) { EmployersView() }
            }
        }
    }
}

/// その月の給与記録（Web 版 給与記録：記録の確認・編集・入金状態）
struct SalaryRecordsView: View {
    @Environment(AppModel.self) private var model
    @State var month: String
    var body: some View {
        let doc = model.doc, today = model.today
        let s = doc.salarySummary(month, today: today)
        List {
            Section { MonthSwitcher(month: $month, thisMonth: model.thisMonth) }
            Section {
                if s.records.isEmpty { Text("この月の給与はまだありません").foregroundStyle(.secondary) }
                ForEach(s.records) { r in
                    NavigationLink { SalaryRecordEditor(recordId: r.id) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(doc.employer(r.employerId)?.name ?? "勤務先")・\(Format.monthLabel(r.month))勤務分").font(.body.weight(.semibold))
                                HStack(spacing: 6) {
                                    StatusPill(status: doc.status(r, today: today))
                                    Text(Format.dayLabel(doc.effectiveDate(r))).font(.caption).foregroundStyle(.secondary)
                                }
                                if r.source == "shift" { Text("シフト\(r.shiftCount)回から計算").font(.caption2).foregroundStyle(.secondary) }
                            }
                            Spacer()
                            Text(doc.expectedOrReceived(r, today: today).yen).monospacedDigit().font(.body.weight(.semibold))
                        }
                    }
                }
            } header: { Text("給与（\(s.records.count)件）") }
            if !s.temps.isEmpty {
                Section("臨時収入") {
                    ForEach(s.temps) { t in
                        LabeledContent {
                            Text(t.amount.yen).monospacedDigit()
                        } label: {
                            Text(t.sourceName.isEmpty ? "臨時収入" : t.sourceName)
                            StatusPill(status: doc.status(t, today: today))
                        }
                    }
                }
            }
            if doc.salaryRecords.contains(where: { $0.source == "shift" }) {
                Section { Text("シフトから計算した給与は、総支給額に交通費を含みます。手で直した金額は7日間、自動の計算で上書きしません。").font(.footnote).foregroundStyle(.secondary) }
            }
        }
        .navigationTitle("給与記録")
    }
}

/// 給与の記録を直す（金額・入金の状態）
struct SalaryRecordEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var recordId: String?
    /// 新しく追加する時の勤務先・金額（＋の「給与」から）
    var newEmployerId: String = ""
    var newGross: Double = 0
    var onDone: (() -> Void)? = nil
    @State private var gross = 0.0
    @State private var employerId = ""
    @State private var workMonth = Dates.ym()
    @State private var payDate = Dates.ymd()
    @State private var transport = 0.0
    @State private var paid = false
    @State private var receivedAmount = 0.0
    @State private var receivedDate = Date()
    @State private var loaded = false
    @State private var confirmDelete = false

    var body: some View {
        let doc = model.doc
        if recordId == nil {
            newForm(doc)
        } else if let r = doc.salaryRecords.first(where: { $0.id == recordId }) {
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
            .safeAreaInset(edge: .bottom) {
                Button("この給与を削除", role: .destructive) { confirmDelete = true }.padding(.bottom, 8)
            }
            .confirmationDialog("この給与の記録を削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("削除", role: .destructive) {
                    model.commit("給与の削除") { $0.salaryRecords = $0.salaryRecords.filter { $0.id != r.id } }
                    model.done("給与を削除しました"); dismiss()
                }
            } message: { Text("削除する前の状態は復元ポイントに残ります。") }
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

    /// 給与を追加する（Web 版 openSalaryAdd：勤務先・勤務対象月・入金予定日・総支給額）
    @ViewBuilder private func newForm(_ doc: MoneyDocument) -> some View {
        Form {
            Section {
                Picker("勤務先", selection: $employerId) {
                    ForEach(doc.employers) { e in Text(e.name).tag(e.id) }
                }
                Picker("勤務対象月", selection: $workMonth) {
                    ForEach(-6...3, id: \.self) { i in let m = Dates.addMonths(model.thisMonth, i); Text(Format.monthLabel(m)).tag(m) }
                }
                YMDPicker(title: "入金予定日", value: $payDate)
            } footer: {
                if let e = doc.employer(employerId) { Text("\(e.name)の給料日：\(Format.dayLabel(Payroll.payDate(e, workMonth: workMonth)))") }
            }
            Section {
                AmountField(title: "総支給額", value: $gross)
                AmountField(title: "うち交通費", value: $transport)
            }
            Section {
                Toggle("入金済み", isOn: $paid)
                if paid {
                    AmountField(title: "実際の受取額", value: $receivedAmount)
                    DatePicker("実際の入金日", selection: $receivedDate, in: ...Date(), displayedComponents: .date)
                }
            }
        }
        .navigationTitle("給与を追加")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("保存") { add() }.bold().disabled(gross <= 0 || employerId.isEmpty) } }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            employerId = newEmployerId.isEmpty ? (doc.employers.first?.id ?? "") : newEmployerId
            gross = newGross; receivedAmount = newGross
            if let e = doc.employer(employerId) {
                // 今月に入金される勤務月を選ぶ（Web 版 inferSalaryWorkMonthForPayMonth）
                let m = (-3...0).map { Dates.addMonths(model.thisMonth, $0) }.first { Payroll.payDate(e, workMonth: $0).hasPrefix(model.thisMonth) } ?? Dates.addMonths(model.thisMonth, -1)
                workMonth = m; payDate = Payroll.payDate(e, workMonth: m)
            }
        }
        .onChange(of: workMonth) { _, m in if let e = model.doc.employer(employerId) { payDate = Payroll.payDate(e, workMonth: m) } }
        .onChange(of: employerId) { _, id in if let e = model.doc.employer(id) { payDate = Payroll.payDate(e, workMonth: workMonth) } }
    }

    private func add() {
        let receivedYMD = Dates.ymd(receivedDate)
        model.change("給与の追加") { doc, now, _ in
            var r = SalaryRecord(id: MoneyDocument.uid("salary", now: now), employerId: employerId, month: workMonth, date: payDate,
                                 gross: gross, transport: transport, status: paid ? "入金済" : "予定", source: "manual")
            r.manualAt = ISODate.now(now)
            if paid { r.receivedAmount = receivedAmount; r.actualReceivedDate = receivedYMD }
            doc.salaryRecords = doc.salaryRecords + [r]
        }
        model.done("給与を追加しました")
        if let onDone { onDone() } else { dismiss() }
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
        if let onDone { onDone() } else { dismiss() }
    }
}

#Preview {
    NavigationStack { SalaryMonthView(month: Dates.ym()) }.environment(AppModel.preview())
}
