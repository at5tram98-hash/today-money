import SwiftUI
import TodayMoneyCore

/// 下のタブ：ホーム・給与・その他（Web 版の「支払い」はまだ移していない。docs/ios/status.md）
struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView {
            HomeScreen()
                .tabItem { Label("ホーム", systemImage: "house.fill") }
            SalaryScreen()
                .tabItem { Label("給与", systemImage: "yensign.circle.fill") }
            MoreScreen()
                .tabItem { Label("その他", systemImage: "square.grid.2x2.fill") }
        }
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
                    .task {
                        try? await Task.sleep(for: .seconds(2.4))
                        withAnimation { model.toast = nil }
                    }
            }
        }
        .animation(.snappy, value: model.toast)
    }
}

#Preview {
    RootView().environment(AppModel.preview())
}
