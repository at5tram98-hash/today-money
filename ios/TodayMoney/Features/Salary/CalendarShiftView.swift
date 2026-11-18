import SwiftUI
import EventKit
import TodayMoneyCore

/// カレンダーからシフトを取り込む（Web 版の「Googleカレンダーから自動で取り込む」「iPhoneのカレンダー（ショートカット経由）」の代わり）
struct CalendarShiftView: View {
    @Environment(AppModel.self) private var model
    @State private var status = CalendarShiftService.status
    @State private var calendars: [CalendarShiftService.CalendarInfo] = []
    @State private var syncing = false
    @State private var preview: [Shift] = []
    @State private var keyword = ""

    var body: some View {
        let cs = model.doc.calendarShiftSettings
        Form {
            Section {
                Toggle("自動で取り込む（1日1回）", isOn: Binding(get: { cs.enabled }, set: { on in
                    update { $0.enabled = on }
                    if on { Task { await ask(); if CalendarShiftService.canRead { await syncNow() } } }
                }))
                Button { Task { await syncNow() } } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("今すぐ取り込む")
                            Text("前回: \(cs.lastSyncAt.isEmpty ? "まだ取り込んでいません" : "\(dateText(cs.lastSyncAt))・\(cs.lastCount)件・\(cs.lastTotal.yen)")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if syncing { ProgressView() }
                    }
                }
                .disabled(syncing)
                if !cs.lastError.isEmpty {
                    Label(cs.lastError, systemImage: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.orange)
                }
            } header: { Text("iPhoneのカレンダーから取り込む") } footer: {
                Text("アプリを開いた時に、今日から来月末までの予定を読み取り、勤務先の名前・別名に当てはまる予定をシフトとして給料の見込みを作ります。終日の予定・勤務先に当てはまらない予定は取り込みません。手で直した給与は7日間、入金済みの給与はそのままにします。カレンダーを変更することはありません。")
            }

            if status != .fullAccess {
                Section {
                    Button("カレンダーへのアクセスを許可") { Task { await ask() } }
                    if status == .denied || status == .restricted || status == .writeOnly {
                        Text("許可されていません。設定アプリ › アプリ › My Money › カレンダー で「フルアクセス」にしてください。").font(.footnote).foregroundStyle(.secondary)
                        Button("設定アプリを開く") { if let u = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(u) } }
                    }
                }
            } else {
                Section {
                    Button { update { $0.calendarIds = []; $0.calendarNames = [] } } label: {
                        HStack { Text("すべてのカレンダー").foregroundStyle(.primary); Spacer(); if cs.calendarIds.isEmpty { Image(systemName: "checkmark") } }
                    }
                    ForEach(calendars) { c in
                        Button { toggle(c) } label: {
                            HStack {
                                Circle().fill(Color(cgColor: c.color ?? CGColor(gray: 0.5, alpha: 1))).frame(width: 10, height: 10)
                                VStack(alignment: .leading) { Text(c.title).foregroundStyle(.primary); Text(c.source).font(.caption).foregroundStyle(.secondary) }
                                Spacer()
                                if cs.calendarIds.contains(c.id) { Image(systemName: "checkmark") }
                            }
                        }
                    }
                } header: { Text("読むカレンダー") } footer: { Text("シフトボードのシフトが入っているカレンダーを選ぶと、ほかの予定を読みません。") }
                Section {
                    TextField("例：シフト（空なら勤務先の名前で判断）", text: $keyword)
                        .onSubmit { update { $0.keyword = keyword.trimmingCharacters(in: .whitespaces) } }
                } header: { Text("予定名のキーワード") } footer: { Text("予定名にこの語を含むものだけを読みます。") }
                Section("来月末までのシフト（\(preview.count)件）") {
                    if preview.isEmpty { Text("見つかりませんでした").foregroundStyle(.secondary) }
                    ForEach(Array(preview.prefix(40).enumerated()), id: \.offset) { _, s in
                        let emp = Shifts.employerId(for: s.title, in: model.doc, settings: model.doc.shiftSettings)
                        LabeledContent {
                            Text(model.doc.employer(emp)?.name ?? "対象外").foregroundStyle(emp.isEmpty ? .orange : .secondary)
                        } label: {
                            Text("\(Format.dayLabel(s.date)) \(s.start)〜\(s.end)")
                            Text(s.title).font(.caption)
                        }
                    }
                }
            }
            if !cs.lastUnmatched.isEmpty {
                Section {
                    ForEach(cs.lastUnmatched, id: \.self) { Text($0) }
                    NavigationLink { EmployersView() } label: { Text("勤務先の別名に追加する") }
                } header: { Text("勤務先に当てはまらなかった予定") } footer: { Text("シフトなら、勤務先の「予定名（別名）」に追加すると次から取り込みます。") }
            }
        }
        .navigationTitle("カレンダーからシフト")
        .onAppear { refresh(); keyword = cs.keyword }
        .onChange(of: model.revision) { _, _ in loadPreview() }
    }

    private func update(_ f: (inout CalendarShiftSettings) -> Void) {
        model.commit("カレンダーの取り込み設定") { d in var s = d.calendarShiftSettings; f(&s); d.calendarShiftSettings = s }
        loadPreview()
    }
    private func toggle(_ c: CalendarShiftService.CalendarInfo) {
        update { s in
            if let i = s.calendarIds.firstIndex(of: c.id) { s.calendarIds.remove(at: i); s.calendarNames.removeAll { $0 == c.title } }
            else { s.calendarIds.append(c.id); s.calendarNames.append(c.title) }
        }
    }
    private func ask() async { _ = await CalendarShiftService.requestAccess(); refresh() }
    private func refresh() {
        status = CalendarShiftService.status
        if status == .fullAccess { calendars = CalendarShiftService.calendars() }
        loadPreview()
    }
    private func loadPreview() {
        guard CalendarShiftService.canRead else { preview = []; return }
        let cs = model.doc.calendarShiftSettings
        preview = CalendarShifts.shifts(from: CalendarShiftService.events(calendarIds: cs.calendarIds, today: model.today), keyword: cs.keyword, today: model.today)
    }
    private func syncNow() async {
        update { $0.keyword = keyword.trimmingCharacters(in: .whitespaces) }
        syncing = true
        await model.syncCalendarShifts(auto: false)
        syncing = false
        refresh()
    }
}
