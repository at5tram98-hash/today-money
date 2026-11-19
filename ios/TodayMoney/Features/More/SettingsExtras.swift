import LocalAuthentication
import PhotosUI
import SwiftUI
import TodayMoneyCore

/// プロフィールの写真（Web 版 profileAvatarHtml。profile.icon は data URL）
struct ProfileAvatar: View {
    var icon: String
    var size: CGFloat = 46
    var body: some View {
        if let img = Self.image(icon) {
            Image(uiImage: img).resizable().scaledToFill().frame(width: size, height: size).clipShape(Circle())
                .accessibilityLabel("プロフィール写真")
        } else {
            Image(systemName: "person.crop.circle.fill").resizable().foregroundStyle(.gray.opacity(0.6))
                .frame(width: size, height: size).accessibilityHidden(true)
        }
    }
    static func image(_ dataURL: String) -> UIImage? {
        guard dataURL.hasPrefix("data:"), let comma = dataURL.firstIndex(of: ",") else { return nil }
        guard let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])) else { return nil }
        return UIImage(data: data)
    }
    /// Web 版 resizeImage と同じく、長い辺を縮めて JPEG の data URL にする
    static func dataURL(from data: Data, maxSide: CGFloat = 256) -> String? {
        guard let src = UIImage(data: data) else { return nil }
        let scale = min(1, maxSide / max(src.size.width, src.size.height))
        let size = CGSize(width: (src.size.width * scale).rounded(), height: (src.size.height * scale).rounded())
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        let img = UIGraphicsImageRenderer(size: size, format: format).image { _ in src.draw(in: CGRect(origin: .zero, size: size)) }
        guard let jpg = img.jpegData(compressionQuality: 0.82) else { return nil }
        return "data:image/jpeg;base64," + jpg.base64EncodedString()
    }
}

/// プロフィール（Web 版 openProfileEdit：写真・名前。保存ボタンで確定）
struct ProfileView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var icon = ""
    @State private var pick: PhotosPickerItem?
    @State private var loaded = false
    @State private var loading = false

    var body: some View {
        Form {
            Section {
                VStack(spacing: 12) {
                    ZStack {
                        ProfileAvatar(icon: icon, size: 110)
                        if loading { ProgressView().controlSize(.large) }
                    }
                    PhotosPicker(selection: $pick, matching: .images) { Text(icon.isEmpty ? "写真を選ぶ" : "写真を変更").font(.subheadline.weight(.semibold)) }
                    if !icon.isEmpty {
                        Button("写真を削除", role: .destructive) { icon = ""; pick = nil }.font(.subheadline)
                    }
                }
                .frame(maxWidth: .infinity)
                .listRowBackground(Color.clear)
            }
            Section {
                TextField("名前を入力", text: $name).textContentType(.name)
            } header: { Text("名前") } footer: { Text("写真は縮小して、この端末のアプリのデータとして保存します。どこにも送信しません。") }
        }
        .navigationTitle("プロフィール")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("保存") {
                    let n = name.trimmingCharacters(in: .whitespaces), ic = icon
                    model.commit("プロフィールの変更") { d in
                        var p = d["profile"]?.objectValue ?? [:]
                        p["name"] = .string(n); p["icon"] = .string(ic)
                        d["profile"] = .object(p)
                    }
                    model.done("プロフィールを保存しました")
                    dismiss()
                }
                .bold().disabled(loading || !changed)
            }
        }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            name = str(model.doc["profile"]?["name"]); icon = str(model.doc["profile"]?["icon"])
        }
        .onChange(of: pick) { _, item in
            guard let item else { return }
            loading = true
            Task {
                defer { loading = false }
                if let data = try? await item.loadTransferable(type: Data.self), let url = ProfileAvatar.dataURL(from: data) { icon = url }
                else { model.errorMessage = "写真を読み込めませんでした。別の画像を選んでください。"; Feedback.play(.error) }
            }
        }
    }
    private var changed: Bool {
        name.trimmingCharacters(in: .whitespaces) != str(model.doc["profile"]?["name"]) || icon != str(model.doc["profile"]?["icon"])
    }
}

/// いつ再ロックするか（Web 版 security.relock：すぐ・1分後・5分後・しない）
enum Relock: String, CaseIterable, Identifiable {
    case immediate, m1 = "1m", m5 = "5m", never
    var id: String { rawValue }
    var label: String { switch self { case .immediate: return "すぐ"; case .m1: return "1分後"; case .m5: return "5分後"; case .never: return "しない" } }
    /// バックグラウンドにいた秒数がこれ以上ならロック（nil はロックしない）
    var seconds: TimeInterval? { switch self { case .immediate: return 0; case .m1: return 60; case .m5: return 300; case .never: return nil } }
}

/// セキュリティ（Web 版 openSecuritySettings。4桁のパスコードの代わりに Face ID / Touch ID / 端末のパスコード）
struct SecuritySettingsView: View {
    @AppStorage("lockEnabled") private var lockEnabled = false
    @AppStorage("relock") private var relock = Relock.immediate.rawValue
    @AppStorage("privacyBlur") private var privacyCover = true
    @State private var message: String?

    var body: some View {
        let kind = Self.biometryName
        Form {
            Section {
                Toggle(isOn: Binding(get: { lockEnabled }, set: { on in on ? enable() : disable() })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(kind)でロック")
                        Text("アプリを開く時に\(kind)か端末のパスコードで確認します").font(.caption).foregroundStyle(.secondary)
                    }
                }
            } footer: { if let message { Text(message).foregroundStyle(.red) } }
            if lockEnabled {
                Section("再ロック") {
                    Picker("再ロック", selection: $relock) {
                        ForEach(Relock.allCases) { r in Text(r.label).tag(r.rawValue) }
                    }
                    .pickerStyle(.inline).labelsHidden()
                }
            }
            Section {
                Toggle("アプリの切り替え画面で隠す", isOn: $privacyCover)
            } footer: { Text("ほかのアプリに切り替える時、金額が見えないように画面をぼかします。") }
        }
        .navigationTitle("セキュリティ")
    }

    static var biometryName: String {
        let ctx = LAContext()
        _ = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: nil)
        switch ctx.biometryType { case .faceID: return "Face ID"; case .touchID: return "Touch ID"; case .opticID: return "Optic ID"; default: return "パスコード" }
    }
    /// 一度確認できた時だけ ON にする（確認できない端末で閉め出されないように）
    private func enable() {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else {
            message = "この端末ではパスコードが設定されていないため、ロックを使えません。"; Feedback.play(.error); return
        }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "ロックをオンにします") { ok, _ in
            Task { @MainActor in
                if ok { lockEnabled = true; message = nil; Feedback.play(.success) } else { message = "確認できなかったため、オンにしませんでした。" }
            }
        }
    }
    private func disable() {
        let ctx = LAContext()
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "ロックをオフにします") { ok, _ in
            Task { @MainActor in if ok { lockEnabled = false; message = nil } }
        }
    }
}

/// ヘルプ（Web 版 openHelp のよくある質問を iPhone 版に合わせたもの）
struct HelpView: View {
    private let questions: [(String, String)] = [
        ("メール取引が分類されません", "メール取引センターの「カテゴリ不明」で一度分類すると、同じお店は次から自動で分類します。"),
        ("Gmail連携がつながりません", "その他 › Gmail連携 で接続し直してください。メールの内容は端末の中で読み取り、外部には送りません。"),
        ("日締めはいつ使えますか？", "対象日の18:00以降に、照合・承認・修正・取消ができます。ジャーナルはいつでも見られます。"),
        ("間違えて日締めを承認しました", "承認済みの画面で「日締めの承認を取り消す」を選び、確認を進めます。取引と残高は変わりません。"),
        ("PDFを保存するには", "その他 › データとバックアップ › PDFで書き出す から、共有画面で「ファイルに保存」やメールを選べます。"),
        ("Web版とデータを移すには", "Web版でバックアップを書き出し、その他 › データとバックアップ から読み込みます。形式は同じです。"),
        ("間違えて消してしまいました", "操作の直後に出る「元に戻す」を押すか、データとバックアップ › 復元ポイント から前の状態に戻せます。"),
        ("ウィジェットやSiriで使うには", "ホーム画面を長押ししてウィジェットを追加できます。「My Money で支出を記録」と話しかけると、Siriからも記録できます。"),
    ]
    @State private var open: Set<Int> = []
    var body: some View {
        List {
            Section {
                ForEach(Array(questions.enumerated()), id: \.offset) { i, q in
                    DisclosureGroup(isExpanded: Binding(get: { open.contains(i) }, set: { if $0 { open.insert(i) } else { open.remove(i) } })) {
                        Text(q.1).font(.subheadline).foregroundStyle(.secondary).padding(.vertical, 4)
                    } label: { Text(q.0) }
                }
            } header: { Text("よくある質問") }
            Section {
                LabeledContent("版", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                LabeledContent("ビルド", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—")
            } footer: { Text("家計のデータはこの端末の中に保存しています。") }
        }
        .navigationTitle("ヘルプ")
    }
}
