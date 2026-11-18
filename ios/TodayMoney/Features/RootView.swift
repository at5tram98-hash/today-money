import SwiftUI
import LocalAuthentication
import TodayMoneyCore

/// 下のタブ：ホーム・支払い・その他（Web 版と同じ）と、右下の「＋」（新規入力）
struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var phase
    @AppStorage("appearance") private var appearance = "system"
    @AppStorage("lockEnabled") private var lockEnabled = false
    @AppStorage("privacyBlur") private var privacyBlur = true
    @AppStorage("startTab") private var startTab = "home"
    @State private var launched = false
    @State private var locked = false

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            HomeScreen().tabItem { Label("ホーム", systemImage: "house.fill") }.tag(AppModel.Tab.home)
            PaymentsScreen().tabItem { Label("支払い", systemImage: "creditcard.fill") }.tag(AppModel.Tab.payments)
            MoreScreen().tabItem { Label("その他", systemImage: "square.grid.2x2.fill") }.tag(AppModel.Tab.more)
        }
        .sheet(item: $model.entryMode) { mode in EntrySheet(mode: mode).presentationDetents([.large]) }
        .alert("お知らせ", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(model.errorMessage ?? "")
        }
        .overlay(alignment: .top) {
            if let t = model.toast {
                Text(t)
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    .background(.regularMaterial, in: Capsule())
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task(id: t) {
                        try? await Task.sleep(for: .seconds(2.4))
                        withAnimation { model.toast = nil }
                    }
            }
        }
        .overlay {
            if locked || (privacyBlur && phase != .active) {
                ZStack {
                    Rectangle().fill(.ultraThinMaterial).ignoresSafeArea()
                    if locked {
                        VStack(spacing: 16) {
                            Image(systemName: "lock.fill").font(.largeTitle)
                            Text("My Money はロックされています").font(.headline)
                            Button("ロックを解除") { unlock() }.buttonStyle(.borderedProminent)
                        }
                    }
                }
            }
        }
        .animation(model.doc.feedbackSettings.motion ? .snappy : nil, value: model.toast)
        // 操作フィードバックで「アニメーション」を切った時は、画面内の動きを止める
        .transaction { if !model.doc.feedbackSettings.motion { $0.disablesAnimations = true; $0.animation = nil } }
        .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
        .onOpenURL { model.open($0) }
        .onAppear {
            if ProcessInfo.processInfo.arguments.contains("-launchTiming") { FileHandle.standardError.write(Data("[launch] appeared \(Date().timeIntervalSince1970)\n".utf8)) }
            // 一般 › 起動時に開く画面（リンクから開いた時は、そちらを優先）
            if !launched { launched = true; if startTab == "payments" && model.tab == .home && model.route == nil { model.tab = .payments } }
            model.runScheduled()
            QuickActions.update(doc: model.doc)
            WidgetBridge.publish(doc: model.doc)
            if let q = QuickActions.pending { QuickActions.pending = nil; QuickActions.perform(q) }
            #if DEBUG
            CalendarShiftService.seedForTesting(today: model.today)
            Self.seedStatementForTesting(model)
            #endif
            Task { await model.syncCalendarShifts(auto: true) }
            if lockEnabled { locked = true; unlock() }
        }
        .onChange(of: phase) { _, p in
            if p == .active { model.runScheduled(); Task { await model.syncCalendarShifts(auto: true) }; Task { await Notifications.reschedule(doc: model.doc) } }
            if p == .background && lockEnabled { locked = true }
            if p == .active && locked { unlock() }
        }
    }

    /// Face ID / Touch ID / パスコードで解除（Web 版のパスコードの代わり）
    private func unlock() {
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { locked = false; return }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "家計のデータを表示します") { ok, _ in
            Task { @MainActor in if ok { locked = false } }
        }
    }
}

#Preview {
    RootView().environment(AppModel.preview())
}

/// 右下の「＋」（新規入力）。タブの最初の画面だけに出す（先へ進んだ画面では隠れる）
struct EntryButton: ViewModifier {
    @Environment(AppModel.self) private var model
    func body(content: Content) -> some View {
        content.overlay(alignment: .bottomTrailing) {
            Button { model.entryMode = .expense } label: {
                Image(systemName: "plus").font(.title2.weight(.semibold)).foregroundStyle(.white)
                    .frame(width: 58, height: 58)
                    .background(Color.accentColor.gradient, in: Circle())
                    .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
            }
            .accessibilityLabel("入力する")
            .padding(.trailing, 20).padding(.bottom, 16)
            .contextMenu {
                ForEach(EntryMode.allCases) { m in Button { model.entryMode = m } label: { Label(m.label, systemImage: m.symbol) } }
            }
        }
    }
}
extension View { func entryButton() -> some View { modifier(EntryButton()) } }

#if DEBUG
extension RootView {
    /// シミュレーターでの確認用（起動引数 -seedStatement <CSVのパス>）：カード明細を1件取り込む。Release には入らない
    static func seedStatementForTesting(_ model: AppModel) {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-seedStatement"), i + 1 < args.count,
              let text = try? String(contentsOfFile: args[i + 1], encoding: .utf8) else { return }
        let hash = "debug-\(text.hashValue)"
        guard !model.doc.cardStatementImports.contains(where: { $0.fileName == "debug.csv" }) else { return }
        model.change("確認用のカード明細") { d, _, today in
            let p = try d.parsePayPayStatementCsv(text, today: today)
            let card = d.providerCard(p.provider)?.id ?? d.cards.first?.id ?? ""
            try d.addStatementImport(p, cardId: card, fileName: "debug.csv", fileHash: hash)
        }
    }
}
#endif
