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
    @State private var locked = false

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.tab) {
            HomeScreen().tabItem { Label("ホーム", systemImage: "house.fill") }.tag(AppModel.Tab.home)
            PaymentsScreen().tabItem { Label("支払い", systemImage: "creditcard.fill") }.tag(AppModel.Tab.payments)
            MoreScreen().tabItem { Label("その他", systemImage: "square.grid.2x2.fill") }.tag(AppModel.Tab.more)
        }
        .overlay(alignment: .bottomTrailing) {
            Button { model.entryMode = .expense } label: {
                Image(systemName: "plus").font(.title2.weight(.semibold)).foregroundStyle(.white)
                    .frame(width: 58, height: 58)
                    .background(Color.accentColor.gradient, in: Circle())
                    .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
            }
            .accessibilityLabel("入力する")
            .padding(.trailing, 20).padding(.bottom, 92)
            .contextMenu {
                ForEach(EntryMode.allCases) { m in Button { model.entryMode = m } label: { Label(m.label, systemImage: m.symbol) } }
            }
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
        .animation(.snappy, value: model.toast)
        .preferredColorScheme(appearance == "dark" ? .dark : appearance == "light" ? .light : nil)
        .onAppear {
            model.runScheduled()
            if lockEnabled { locked = true; unlock() }
        }
        .onChange(of: phase) { _, p in
            if p == .active { model.runScheduled() }
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
