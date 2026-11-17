import SwiftUI
import UniformTypeIdentifiers
import UserNotifications
import TodayMoneyCore

/// その他（Web 版 settings.js の並び：プロフィール・登録・お金・通知・アプリ・データ）
struct MoreScreen: View {
    @Environment(AppModel.self) private var model
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage("lockEnabled") private var lockEnabled = false

    var body: some View {
        let doc = model.doc
        NavigationStack {
            List {
                Section {
                    NavigationLink { ProfileView() } label: {
                        HStack(spacing: 14) {
                            Image(systemName: "person.crop.circle.fill").font(.system(size: 46)).foregroundStyle(.gray)
                            VStack(alignment: .leading) {
                                Text(profileName.isEmpty ? "プロフィール" : profileName).font(.title3.weight(.semibold))
                                Text("名前").font(.footnote).foregroundStyle(.secondary)
                            }
                        }.padding(.vertical, 4)
                    }
                }
                Section {
                    row("口座とカード", "building.columns.fill", .blue, "\(doc.banks.count + doc.cards.count + doc.debitCards.count)件") { AccountsView() }
                    row("給与・勤務先", "briefcase.fill", .cyan, "\(doc.employers.count)件") { EmployersView() }
                } header: { Text("登録") } footer: { Text("口座・カード・勤務先の追加と編集はここで行います。") }
                Section("お金") {
                    row("カテゴリ", "square.grid.2x2.fill", .orange, "\(doc.categories.count)件") { CategoriesView() }
                    row("初期データ・現在値", "building.columns.fill", .indigo, "") { InitialValuesView() }
                    row("ACF", "chart.line.uptrend.xyaxis", .teal, doc.acfStoredSettings.initialized ? "最低 \(doc.acfStoredSettings.reserveFloor.yen)" : "未設定") { AcfSettingsView() }
                    row("給与の記録", "yensign.circle.fill", .green, "") { SalaryMonthView(month: model.thisMonth) }
                }
                Section("通知") {
                    row("通知設定", "bell.badge.fill", .red, "") { NotificationSettingsView() }
                    row("システムのお知らせ", "exclamationmark.bubble.fill", .orange, "\((doc["notices"]?.arrayValue ?? []).count)件") { NoticesView() }
                }
                Section("アプリ") {
                    Picker(selection: $appearance) {
                        Text("システム").tag("system"); Text("ライト").tag("light"); Text("ダーク").tag("dark")
                    } label: { Label("外観", systemImage: "circle.lefthalf.filled") }
                    Toggle(isOn: $lockEnabled) { Label("Face ID でロック", systemImage: "faceid") }
                    row("一般", "gearshape.fill", .gray, "") { GeneralSettingsView() }
                }
                Section("データ") {
                    row("データとバックアップ", "externaldrive.fill", .gray, "") { DataSettingsView() }
                }
                Section {
                    LabeledContent("版", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                }
            }
            .entryButton()
            .navigationTitle("その他")
        }
    }

    private var profileName: String { str(model.doc["profile"]?["name"]) }

    private func row<D: View>(_ title: String, _ sym: String, _ color: Color, _ value: String, @ViewBuilder dest: @escaping () -> D) -> some View {
        NavigationLink(destination: dest) {
            LabeledContent {
                Text(value)
            } label: {
                Label {
                    Text(title)
                } icon: {
                    Image(systemName: sym).font(.footnote.weight(.semibold)).foregroundStyle(.white)
                        .frame(width: 28, height: 28).background(color, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                }
            }
        }
    }
}

/// プロフィール（名前）
struct ProfileView: View {
    @Environment(AppModel.self) private var model
    @State private var name = ""
    var body: some View {
        Form {
            Section("名前") { TextField("名前", text: $name) }
        }
        .navigationTitle("プロフィール")
        .onAppear { name = str(model.doc["profile"]?["name"]) }
        .onDisappear {
            let n = name.trimmingCharacters(in: .whitespaces)
            guard n != str(model.doc["profile"]?["name"]) else { return }
            model.commit("プロフィールの変更") { d in
                var p = d["profile"]?.objectValue ?? [:]; p["name"] = .string(n); d["profile"] = .object(p)
            }
        }
    }
}

/// カテゴリの一覧・編集（Web 版 openCategoryEdit）
struct CategoriesView: View {
    @Environment(AppModel.self) private var model
    @State private var editing: String?
    @State private var adding = false
    var body: some View {
        let doc = model.doc
        List {
            ForEach(doc.categories) { c in
                Button { editing = c.id } label: {
                    HStack { CategoryIcon(category: c); Text(c.name).foregroundStyle(.primary); Spacer(); Text(doc.categorySpent(month: model.thisMonth, category: c.name).yen).foregroundStyle(.secondary).monospacedDigit() }
                }
            }
            .onMove { from, to in model.commit("カテゴリの並べ替え") { var l = $0.categories; l.move(fromOffsets: from, toOffset: to); $0.categories = l } }
        }
        .navigationTitle("カテゴリ")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { Button { adding = true } label: { Image(systemName: "plus") }.accessibilityLabel("カテゴリを追加") }
            ToolbarItem(placement: .topBarTrailing) { EditButton() }
        }
        .sheet(isPresented: $adding) { NavigationStack { CategoryEditor(categoryId: nil) } }
        .sheet(item: Binding(get: { editing.map(IdBox.init) }, set: { editing = $0?.id })) { b in NavigationStack { CategoryEditor(categoryId: b.id) } }
    }
}

struct CategoryEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var categoryId: String?
    @State private var c = TodayMoneyCore.Category(id: "", name: "", icon: "ellipsis", color: "#007AFF")
    @State private var loaded = false
    @State private var confirmDelete = false
    var body: some View {
        Form {
            Section("カテゴリ") {
                HStack { CategoryIcon(category: c, size: 40); TextField("名前", text: $c.name) }
            }
            Section("カラー") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                    ForEach(CategoryStyle.colors, id: \.self) { hex in
                        Circle().fill(Color(hex: hex)).frame(width: 34, height: 34)
                            .overlay(Circle().strokeBorder(.primary, lineWidth: c.color.uppercased() == hex ? 3 : 0))
                            .onTapGesture { c.color = hex }
                            .accessibilityLabel(hex).accessibilityAddTraits(c.color.uppercased() == hex ? .isSelected : [])
                    }
                }.padding(.vertical, 4)
            }
            Section("アイコン") {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 6), spacing: 12) {
                    ForEach(CategoryStyle.choices, id: \.0) { sym, label in
                        Image(systemName: CategoryStyle.symbol(sym)).font(.title3).frame(width: 40, height: 40)
                            .background(c.icon == sym ? Color.accentColor.opacity(0.2) : .clear, in: RoundedRectangle(cornerRadius: 10))
                            .onTapGesture { c.icon = sym }
                            .accessibilityLabel(label).accessibilityAddTraits(c.icon == sym ? .isSelected : [])
                    }
                }.padding(.vertical, 4)
            }
            if categoryId != nil && model.doc.categories.count > 1 {
                Section { Button("カテゴリを削除", role: .destructive) { confirmDelete = true } }
            }
        }
        .navigationTitle(categoryId == nil ? "カテゴリを追加" : "カテゴリ編集").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("キャンセル") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold().disabled(c.name.trimmingCharacters(in: .whitespaces).isEmpty) }
        }
        .confirmationDialog("このカテゴリを削除しますか？", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("削除", role: .destructive) {
                let old = c.name
                model.commit("カテゴリの削除") { d in
                    let rest = d.categories.filter { $0.id != categoryId }
                    let fallback = rest.last?.name ?? "その他"
                    d.categories = rest
                    d.transactions = d.transactions.map { var t = $0; if t.category == old { t.category = fallback }; return t }
                }
                dismiss()
            }
        } message: { Text("このカテゴリの支出は「\(model.doc.categories.filter { $0.id != categoryId }.last?.name ?? "その他")」に移ります。") }
        .onAppear {
            guard !loaded else { return }; loaded = true
            if let id = categoryId, let x = model.doc.categories.first(where: { $0.id == id }) { c = x }
        }
    }
    private func save() {
        var x = c; x.name = x.name.trimmingCharacters(in: .whitespaces)
        let oldName = model.doc.categories.first { $0.id == categoryId }?.name
        model.change("カテゴリの保存") { d, now, _ in
            var list = d.categories
            if let i = list.firstIndex(where: { $0.id == x.id && !x.id.isEmpty }) { list[i] = x } else { x.id = MoneyDocument.uid("cat", now: now); list.append(x) }
            d.categories = list
            // 名前を変えたら、そのカテゴリの支出も新しい名前にする（Web 版と同じ）
            if let oldName, oldName != x.name { d.transactions = d.transactions.map { var t = $0; if t.category == oldName { t.category = x.name }; return t } }
        }
        dismiss()
    }
}

/// 初期データ・現在値（Web 版 openInitialValues：銀行残高と今月支払うカード請求）
struct InitialValuesView: View {
    @Environment(AppModel.self) private var model
    @State private var bank: String?
    @State private var card: String?
    var body: some View {
        let doc = model.doc, pm = model.thisMonth
        List {
            Section("銀行残高") {
                ForEach(doc.banks) { b in
                    Button { bank = b.id } label: { LabeledContent { Text(b.balance.yen).monospacedDigit() } label: { Text(b.name).foregroundStyle(.primary); Text("現在残高") } }
                }
            }
            Section {
                ForEach(doc.cards) { c in
                    let items = doc.statements(c.id, paymentMonth: pm)
                    let total = items.reduce(0) { $0 + $1.amount }
                    Button { card = c.id } label: {
                        LabeledContent { Text(total.yen).monospacedDigit() } label: {
                            Text(c.name).foregroundStyle(.primary)
                            Text("\(items.first.map { $0.paymentDate.isEmpty ? "支払日未設定" : Format.dayLabel($0.paymentDate) } ?? "支払日未設定")・\(items.first?.status.label ?? "見込み")\(items.count > 1 ? "・\(items.count)件" : "")")
                        }
                    }
                }
            } header: { Text("今月支払うカード請求") } footer: { Text("\(Format.monthLabel(pm))に実際に引き落とされる請求額の合計です。") }
        }
        .navigationTitle("初期データ・現在値")
        .sheet(item: Binding(get: { bank.map(IdBox.init) }, set: { bank = $0?.id })) { b in NavigationStack { BankEditor(bankId: b.id) } }
        .sheet(item: Binding(get: { card.map(IdBox.init) }, set: { card = $0?.id })) { b in NavigationStack { CardBillingEditor(cardId: b.id, billingMonth: nil, paymentMonth: pm) } }
    }
}

/// 一般（起動時の画面・週の始まり）
struct GeneralSettingsView: View {
    @AppStorage("startTab") private var startTab = "home"
    @AppStorage("weekStart") private var weekStart = 0
    @AppStorage("homePeriod") private var period = "today"
    var body: some View {
        Form {
            Picker("起動時に開く画面", selection: $startTab) { Text("ホーム").tag("home"); Text("支払い").tag("payments") }
            Picker("ホームの支出の表示", selection: $period) { Text("今日").tag("today"); Text("今月").tag("month") }
            Picker("週の始まり", selection: $weekStart) { Text("日曜日").tag(0); Text("月曜日").tag(1) }
        }
        .navigationTitle("一般")
    }
}

/// システムのお知らせ（今日の分を残し、昨日以前は自動で消す：Web 版 retainedSystemNotices）
struct NoticesView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let list = (model.doc["notices"]?.arrayValue ?? []).filter { str($0["date"]).isEmpty || str($0["date"]) >= model.today || str($0["source"]) != "system" }
        List {
            if list.isEmpty { Text("今日のお知らせはありません").foregroundStyle(.secondary) }
            ForEach(Array(list.enumerated()), id: \.offset) { _, n in
                VStack(alignment: .leading, spacing: 4) {
                    Label(str(n["title"]), systemImage: str(n["type"]) == "warning" ? "exclamationmark.triangle.fill" : "bell.fill")
                        .foregroundStyle(str(n["type"]) == "warning" ? .orange : .primary)
                    Text(str(n["body"])).font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .navigationTitle("システムのお知らせ")
    }
}

/// 通知（Web 版の Web Push の代わりに、端末のローカル通知を使う）
struct NotificationSettingsView: View {
    @Environment(AppModel.self) private var model
    @AppStorage("notifyDayClose") private var dayClose = true
    @AppStorage("notifyCloseTime") private var closeTime = 21 * 60
    @AppStorage("notifyPayments") private var payments = true
    @AppStorage("notifySalary") private var salary = true
    @State private var status: UNAuthorizationStatus = .notDetermined
    var body: some View {
        Form {
            Section {
                switch status {
                case .authorized, .provisional, .ephemeral: Label("通知は許可されています", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                case .denied: Label("通知が許可されていません（設定アプリで変更できます）", systemImage: "xmark.circle.fill").foregroundStyle(.red)
                default: Button("通知を許可する") { Task { _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]); await refresh() } }
                }
            }
            Section("おすすめ") {
                Toggle("毎日の記録のリマインド", isOn: $dayClose)
                if dayClose {
                    DatePicker("時刻", selection: Binding(get: { Calendar.current.date(bySettingHour: closeTime / 60, minute: closeTime % 60, second: 0, of: .now)! },
                                                         set: { let c = Calendar.current.dateComponents([.hour, .minute], from: $0); closeTime = (c.hour ?? 21) * 60 + (c.minute ?? 0) }),
                               displayedComponents: .hourAndMinute)
                }
                Toggle("カード引落・固定支払いの前日", isOn: $payments)
                Toggle("給料日", isOn: $salary)
            }
        }
        .navigationTitle("通知設定")
        .task { await refresh() }
        .onDisappear { Notifications.reschedule(doc: model.doc, today: model.today) }
    }
    private func refresh() async { status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus }
}

/// ローカル通知の予定を作り直す
enum Notifications {
    static func reschedule(doc: MoneyDocument, today: String) {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        let d = UserDefaults.standard
        func add(_ id: String, _ title: String, _ body: String, _ comps: DateComponents, repeats: Bool = false) {
            let c = UNMutableNotificationContent(); c.title = title; c.body = body; c.sound = .default
            center.add(UNNotificationRequest(identifier: id, content: c, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: repeats)))
        }
        if d.object(forKey: "notifyDayClose") as? Bool ?? true {
            let t = d.object(forKey: "notifyCloseTime") as? Int ?? 21 * 60
            add("dayClose", "今日の支出を記録しましょう", "使った金額を入れると、明日の見通しが正確になります。", DateComponents(hour: t / 60, minute: t % 60), repeats: true)
        }
        let events = doc.financialEvents(from: today, days: 30, today: today)
        for (i, e) in events.enumerated() {
            let p = Dates.parts(Dates.addDays(e.date, e.type == .income ? 0 : -1))
            let comps = DateComponents(year: p.y, month: p.m, day: p.d, hour: e.type == .income ? 9 : 19)
            if e.type == .income, d.object(forKey: "notifySalary") as? Bool ?? true {
                add("ev\(i)", "今日は給料日です", "\(e.title) \(e.amount.yen) の入金予定です。", comps)
            } else if e.type != .income, d.object(forKey: "notifyPayments") as? Bool ?? true {
                add("ev\(i)", "明日は\(e.title)", "\((-e.amount).yen) の支払い予定です。口座残高を確認しましょう。", comps)
            }
        }
    }
}

/// データとバックアップ（Web 版 openDataSettings：書き出し・読み込み・復元・全削除）
struct DataSettingsView: View {
    @Environment(AppModel.self) private var model
    @State private var importing = false
    @State private var exporting = false
    @State private var pending: Data?
    @State private var confirmImport = false
    @State private var confirmWipe = false
    @State private var wipeText = ""

    var body: some View {
        List {
            Section {
                Button { importing = true } label: { Label("バックアップを読み込む", systemImage: "square.and.arrow.down") }
                Button { exporting = true } label: { Label("バックアップを書き出す", systemImage: "square.and.arrow.up") }
                NavigationLink { SnapshotsView() } label: { Label("復元ポイント", systemImage: "clock.arrow.circlepath") }
            } header: { Text("バックアップ") } footer: {
                Text("Web 版の「その他 › データとバックアップ」で書き出した .json を読み込めます。iOS 版から書き出した .json は、Web 版でそのまま復元できます。読み込む前の状態は復元ポイントに残ります。")
            }
            Section("このアプリのデータ") {
                LabeledContent("口座・カード", value: "\(model.doc.banks.count + model.doc.cards.count + model.doc.debitCards.count)件")
                LabeledContent("勤務先", value: "\(model.doc.employers.count)件")
                LabeledContent("給与の記録", value: "\(model.doc.salaryRecords.count)件")
                LabeledContent("支出の記録", value: "\(model.doc.transactions.count)件")
                LabeledContent("固定支払い・大型支出", value: "\(model.doc.fixedPayments.count + model.doc.largeExpensePlans.count)件")
            }
            Section { Button("すべてのデータを削除", role: .destructive) { wipeText = ""; confirmWipe = true } }
        }
        .navigationTitle("データとバックアップ")
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
            switch result {
            case .success(let url):
                let ok = url.startAccessingSecurityScopedResource()
                defer { if ok { url.stopAccessingSecurityScopedResource() } }
                do { pending = try Data(contentsOf: url); confirmImport = true }
                catch { model.errorMessage = "ファイルを読めませんでした。（\(error.localizedDescription)）" }
            case .failure(let error): model.errorMessage = error.localizedDescription
            }
        }
        .fileExporter(isPresented: $exporting, document: BackupFile(data: model.exportBackup()), contentType: .json, defaultFilename: "MyMoney-\(model.today).json") { result in
            if case .success = result { model.toast = "バックアップを書き出しました" }
        }
        .confirmationDialog("今のデータを、このバックアップに置き換えますか？", isPresented: $confirmImport, titleVisibility: .visible) {
            Button("置き換える", role: .destructive) {
                guard let data = pending else { return }
                do { let n = try model.importBackup(data); model.toast = "読み込みました（勤務先\(n.employers)・給与\(n.salary)・支出\(n.transactions)件）" }
                catch { model.errorMessage = error.localizedDescription }
                pending = nil
            }
            Button("キャンセル", role: .cancel) { pending = nil }
        } message: { Text("今のデータは復元ポイントに残るので、あとで戻せます。") }
        .alert("すべてのデータを削除", isPresented: $confirmWipe) {
            TextField("「削除」と入力", text: $wipeText)
            Button("削除", role: .destructive) {
                guard wipeText == "削除" else { model.errorMessage = "「削除」と入力した時だけ削除します。"; return }
                model.commit("すべてのデータを削除") { $0 = AppModel.firstRunDocument() }
                model.toast = "初期状態に戻しました（直前の状態は復元ポイントに残っています）"
            }
            Button("キャンセル", role: .cancel) {}
        } message: { Text("確認のため「削除」と入力してください。直前の状態は復元ポイントに残ります。") }
    }
}

/// 書き出す .json
struct BackupFile: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

/// 復元ポイント（変更の直前の状態）
struct SnapshotsView: View {
    @Environment(AppModel.self) private var model
    @State private var target: StoredSnapshot?
    var body: some View {
        let list = model.snapshots
        List {
            if list.isEmpty { Text("まだありません。データを変えると、変える前の状態がここに残ります。").foregroundStyle(.secondary) }
            ForEach(list) { s in
                Button { target = s } label: { LabeledContent(s.reason, value: s.createdAt.formatted(date: .abbreviated, time: .shortened)) }
            }
        }
        .navigationTitle("復元ポイント")
        .confirmationDialog("この時点の状態に戻しますか？", isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }), titleVisibility: .visible) {
            Button("戻す", role: .destructive) { if let t = target { model.restore(t) }; target = nil }
        } message: { Text("今の状態も復元ポイントに残ります。") }
    }
}
