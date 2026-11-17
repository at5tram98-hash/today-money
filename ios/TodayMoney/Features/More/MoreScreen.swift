import SwiftUI
import UniformTypeIdentifiers
import TodayMoneyCore

/// その他：Web 版とのデータのやり取り・復元ポイント・勤務先
struct MoreScreen: View {
    @Environment(AppModel.self) private var model
    @State private var importing = false
    @State private var exporting = false
    @State private var pending: Data?
    @State private var confirmImport = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    NavigationLink { EmployersView() } label: { Label("給与・勤務先", systemImage: "briefcase.fill") }
                }
                Section {
                    Button { importing = true } label: { Label("Web 版のバックアップを読み込む", systemImage: "square.and.arrow.down") }
                    Button { exporting = true } label: { Label("バックアップを書き出す", systemImage: "square.and.arrow.up") }
                    NavigationLink { SnapshotsView() } label: { Label("復元ポイント", systemImage: "clock.arrow.circlepath") }
                } header: { Text("データ") } footer: {
                    Text("Web 版の「その他 › データ管理 › バックアップ」で書き出した .json を読み込めます。iOS 版から書き出した .json は、Web 版でそのまま復元できます。読み込む前の状態は復元ポイントに残ります。")
                }
                Section("このアプリ") {
                    LabeledContent("勤務先", value: "\(model.doc.employers.count)件")
                    LabeledContent("給与の記録", value: "\(model.doc.salaryRecords.count)件")
                    LabeledContent("支出の記録", value: "\(model.doc.transactions.count)件")
                    LabeledContent("版", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                }
            }
            .navigationTitle("その他")
            .fileImporter(isPresented: $importing, allowedContentTypes: [.json]) { result in
                switch result {
                case .success(let url):
                    let ok = url.startAccessingSecurityScopedResource()
                    defer { if ok { url.stopAccessingSecurityScopedResource() } }
                    do { pending = try Data(contentsOf: url); confirmImport = true }
                    catch { model.errorMessage = "ファイルを読めませんでした。（\(error.localizedDescription)）" }
                case .failure(let error):
                    model.errorMessage = error.localizedDescription
                }
            }
            .fileExporter(isPresented: $exporting, document: BackupFile(data: model.exportBackup()), contentType: .json,
                          defaultFilename: "MyMoney-\(model.today).json") { result in
                if case .success = result { model.toast = "バックアップを書き出しました" }
            }
            .confirmationDialog("今のデータを、このバックアップに置き換えますか？", isPresented: $confirmImport, titleVisibility: .visible) {
                Button("置き換える", role: .destructive) {
                    guard let data = pending else { return }
                    do {
                        let n = try model.importBackup(data)
                        model.toast = "読み込みました（勤務先\(n.employers)・給与\(n.salary)・支出\(n.transactions)件）"
                    } catch { model.errorMessage = error.localizedDescription }
                    pending = nil
                }
                Button("キャンセル", role: .cancel) { pending = nil }
            } message: {
                Text("今のデータは復元ポイントに残るので、あとで戻せます。")
            }
        }
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
                Button { target = s } label: {
                    LabeledContent(s.reason, value: s.createdAt.formatted(date: .abbreviated, time: .shortened))
                }
            }
        }
        .navigationTitle("復元ポイント")
        .confirmationDialog("この時点の状態に戻しますか？", isPresented: Binding(get: { target != nil }, set: { if !$0 { target = nil } }), titleVisibility: .visible) {
            Button("戻す", role: .destructive) { if let t = target { model.restore(t) }; target = nil }
        } message: { Text("今の状態も復元ポイントに残ります。") }
    }
}
