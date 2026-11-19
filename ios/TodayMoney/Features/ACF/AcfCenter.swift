import Charts
import SwiftUI
import TodayMoneyCore

// MARK: - ACFセンター
//
// ACF・ACF指標・資金見通し（90日）・お金のタイムライン・引落準備・購入前シミュレーションを1つにまとめた画面。
// 開いている間は ACF 専用の下タブを出し、ふだんの下タブは左の丸いボタンにしまう
// （押すと戻る。長押しして指を上へすべらせると ホーム・支払い・その他 を選べる）。

enum AcfCenterTab: String, CaseIterable, Identifiable {
    case overview, table, events, accounts, simulate
    var id: String { rawValue }
    var label: String {
        switch self { case .overview: return "概要"; case .table: return "資金表"; case .events: return "予定"; case .accounts: return "口座"; case .simulate: return "試算" }
    }
    var title: String {
        switch self { case .overview: return "ACFセンター"; case .table: return "日別資金表"; case .events: return "入出金の予定"; case .accounts: return "口座の見通し"; case .simulate: return "もし使ったら" }
    }
    var symbol: String {
        switch self { case .overview: return "gauge.with.dots.needle.67percent"; case .table: return "tablecells"; case .events: return "calendar.day.timeline.left"; case .accounts: return "building.columns"; case .simulate: return "wand.and.sparkles" }
    }
}

/// センターの中で開く画面
enum AcfCenterDest: Hashable {
    case settings
    case action(String, String)
    case bank(String)
    case transfers
}

/// ACF の計算結果（センター全体で1つを共有する）
@Observable final class AcfCenterData {
    var forecast: AcfForecast?
    var key = ""
}

struct AcfCenterView: View {
    @Environment(AppModel.self) private var model
    @State private var data = AcfCenterData()
    @State private var path = NavigationPath()
    @State private var day: AcfRow?
    @State private var indexPeriod = false
    @State private var origin: AppModel.Tab = .home

    var body: some View {
        let tab = model.acfCenter ?? .overview
        ZStack(alignment: .bottom) {
            NavigationStack(path: $path) {
                content(tab)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color(.systemGroupedBackground).ignoresSafeArea())
                    .id(tab)
                    .transition(.opacity.combined(with: .scale(scale: 0.985)))
                    .navigationTitle(tab.title)
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar { toolbar }
                    .navigationDestination(for: AcfCenterDest.self) { d in destination(d) }
                    .safeAreaInset(edge: .bottom) { Color.clear.frame(height: 72) }
            }
            .environment(data)
            AcfCenterBar(selection: Binding(get: { model.acfCenter ?? .overview }, set: { t in
                if t == model.acfCenter { if !path.isEmpty { path = NavigationPath() } } else { model.acfCenter = t }
            }), origin: origin) { leave($0) }
        }
        .background(Color(.systemGroupedBackground))
        .sheet(item: $day) { r in NavigationStack { AcfDayView(row: r) }.presentationDetents([.medium, .large]) }
        .sheet(isPresented: $indexPeriod) { NavigationStack { AcfIndexPeriodView() }.presentationDetents([.medium]) }
        .task(id: "\(model.revision)|\(model.today)") { await load() }
        .onAppear {
            origin = model.tab
            if model.acfSettingsRequested { model.acfSettingsRequested = false; path.append(AcfCenterDest.settings) }
        }
        .onChange(of: model.acfSettingsRequested) { _, v in if v { model.acfSettingsRequested = false; path.append(AcfCenterDest.settings) } }
        .environment(\.acfOpenDay) { r in day = r }
        .environment(\.acfOpenIndexPeriod) { indexPeriod = true }
    }

    @ToolbarContentBuilder private var toolbar: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                Button { path.append(AcfCenterDest.settings) } label: { Label("ACF設定", systemImage: "gearshape") }
                Button { indexPeriod = true } label: { Label("ACF指標の期間", systemImage: "calendar.badge.clock") }
                Button { path.append(AcfCenterDest.transfers) } label: { Label("振替計画", systemImage: "arrow.left.arrow.right") }
                Divider()
                Button { Task { data.key = ""; await load(force: true) }; Feedback.play(.sync) } label: { Label("再計算", systemImage: "arrow.clockwise") }
            } label: { Image(systemName: "gearshape") }
            .accessibilityLabel("ACFの設定とメニュー")
        }
    }

    @ViewBuilder private func content(_ tab: AcfCenterTab) -> some View {
        if !model.doc.acfStoredSettings.initialized {
            AcfSetupPrompt { path.append(AcfCenterDest.settings) }
        } else if let f = data.forecast {
            switch tab {
            case .overview: AcfOverviewTab(f: f)
            case .table: AcfTableTab(f: f)
            case .events: AcfEventsTab(f: f)
            case .accounts: AcfAccountsTab(f: f)
            case .simulate: AcfSimulateTab(base: f)
            }
        } else {
            VStack(spacing: 12) {
                ProgressView().controlSize(.large)
                Text("ACFを計算しています…").foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    @ViewBuilder private func destination(_ d: AcfCenterDest) -> some View {
        switch d {
        case .settings: AcfSettingsView()
        case .action(let a, let date): AcfActionDestination(action: a, date: date)
        case .bank(let id): AcfBankForecastView(bankId: id)
        case .transfers: TransferPlansView()
        }
    }

    private func load(force: Bool = false) async {
        let key = "\(model.revision)|\(model.today)"
        guard force || data.key != key else { return }
        let doc = model.doc, today = model.today
        guard doc.acfStoredSettings.initialized else { return }
        let f = await Task.detached(priority: .userInitiated) { doc.acfForecast(today: today) }.value
        withAnimation(.snappy) { data.forecast = f }
        data.key = key
    }

    private func leave(_ tab: AppModel.Tab) {
        Feedback.selection()
        withAnimation(.spring(response: 0.45, dampingFraction: 0.86)) {
            model.tab = tab
            model.acfCenter = nil
        }
    }
}

// MARK: - 開く・選ぶ（環境で渡す）

private struct OpenDayKey: EnvironmentKey { static let defaultValue: (AcfRow) -> Void = { _ in } }
private struct OpenIndexPeriodKey: EnvironmentKey { static let defaultValue: () -> Void = {} }
extension EnvironmentValues {
    var acfOpenDay: (AcfRow) -> Void { get { self[OpenDayKey.self] } set { self[OpenDayKey.self] = newValue } }
    var acfOpenIndexPeriod: () -> Void { get { self[OpenIndexPeriodKey.self] } set { self[OpenIndexPeriodKey.self] = newValue } }
}

/// ACF を使い始める前
struct AcfSetupPrompt: View {
    var open: () -> Void
    var body: some View {
        ContentUnavailableView {
            Label("ACFはまだ設定されていません", systemImage: "chart.line.uptrend.xyaxis")
        } description: {
            Text("最低残したい金額を決めると、給与・カード引落・固定支払い・大型支出から、今日使える額と未来の残高を計算します。")
        } actions: {
            Button("ACFを設定する", action: open).buttonStyle(.borderedProminent)
        }
    }
}

// MARK: - ガラスの見た目（iOS 26 以降は Liquid Glass）

extension View {
    @ViewBuilder func acfGlass<S: Shape>(_ shape: S, interactive: Bool = false) -> some View {
        if #available(iOS 26.0, *) {
            self.glassEffect(interactive ? .regular.interactive() : .regular, in: shape)
        } else {
            self.background(.regularMaterial, in: shape)
                .overlay(shape.stroke(Color.primary.opacity(0.08), lineWidth: 0.5))
                .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
        }
    }
}

// MARK: - 下のバー（ふだんのタブの丸ボタン ＋ ACFのタブ）

struct AcfCenterBar: View {
    @Binding var selection: AcfCenterTab
    var origin: AppModel.Tab
    var leave: (AppModel.Tab) -> Void
    @Namespace private var pill
    @State private var morphed = false

    var body: some View {
        HStack(spacing: 10) {
            MainTabOrb(origin: origin, morphed: morphed, leave: leave)
            if morphed {
                HStack(spacing: 0) {
                    ForEach(AcfCenterTab.allCases) { t in
                        Button {
                            guard t != selection else { selection = t; return }
                            Feedback.selection()
                            withAnimation(.spring(response: 0.38, dampingFraction: 0.8)) { selection = t }
                        } label: {
                            VStack(spacing: 2) {
                                Image(systemName: t.symbol).font(.system(size: 17, weight: .semibold)).frame(height: 22)
                                Text(t.label).font(.system(size: 10, weight: .semibold))
                            }
                            .foregroundStyle(t == selection ? Color.teal : Color.primary.opacity(0.75))
                            .frame(maxWidth: .infinity).frame(height: 50)
                            .background {
                                if t == selection {
                                    Capsule().fill(Color.teal.opacity(0.16)).matchedGeometryEffect(id: "pill", in: pill)
                                }
                            }
                            .contentShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(t.title)
                        .accessibilityAddTraits(t == selection ? .isSelected : [])
                    }
                }
                .padding(4)
                .acfGlass(Capsule(), interactive: true)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
            }
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 2)
        .onAppear {
            withAnimation(.spring(response: 0.5, dampingFraction: 0.82).delay(0.08)) { morphed = true }
        }
    }
}

/// ふだんの下タブをしまった丸いボタン。押すと戻り、長押しすると ホーム・支払い・その他 が縦に開く
struct MainTabOrb: View {
    var origin: AppModel.Tab
    var morphed: Bool
    var leave: (AppModel.Tab) -> Void
    @State private var expanded = false
    @State private var hover: Int?
    @State private var pressStart: Date?
    @State private var pressToken: UUID?
    @State private var moved = false
    private let items: [(AppModel.Tab, String, String)] = [(.home, "house.fill", "ホーム"), (.payments, "creditcard.fill", "支払い"), (.more, "square.grid.2x2.fill", "その他")]
    private let step: CGFloat = 64

    var body: some View {
        let icon = items.first { $0.0 == origin }?.1 ?? "house.fill"
        ZStack(alignment: .bottom) {
            if expanded {
                VStack(spacing: step - 52) {
                    ForEach(Array(items.enumerated().reversed()), id: \.offset) { i, item in
                        HStack(spacing: 10) {
                            Image(systemName: item.1).font(.system(size: 19, weight: .semibold))
                                .foregroundStyle(hover == i ? Color.white : Color.primary)
                                .frame(width: 52, height: 52)
                                .background(hover == i ? Color.accentColor : Color.clear, in: Circle())
                                .acfGlass(Circle())
                                .scaleEffect(hover == i ? 1.12 : 1)
                            Text(item.2).font(.subheadline.weight(.semibold))
                                .padding(.horizontal, 10).padding(.vertical, 6)
                                .acfGlass(Capsule())
                                .opacity(hover == nil || hover == i ? 1 : 0.6)
                        }
                        .transition(.scale(scale: 0.3, anchor: .bottomLeading).combined(with: .opacity))
                    }
                }
                .padding(.bottom, step)
                .fixedSize()
                .frame(width: 52, alignment: .leading)
            }
            ZStack {
                if morphed {
                    Image(systemName: expanded ? "xmark" : icon).font(.system(size: 20, weight: .semibold))
                        .contentTransition(.symbolEffect(.replace))
                        .transition(.opacity)
                } else {
                    HStack(spacing: 40) { ForEach(items, id: \.0) { Image(systemName: $0.1).font(.system(size: 20, weight: .semibold)) } }
                        .transition(.opacity)
                }
            }
            .foregroundStyle(Color.primary)
            .frame(width: morphed ? 58 : nil, height: 58)
            .frame(maxWidth: morphed ? 58 : .infinity)
            .acfGlass(Capsule(), interactive: true)
            .contentShape(Capsule())
            .gesture(press)
            .accessibilityLabel("\(items.first { $0.0 == origin }?.2 ?? "ホーム")に戻る")
            .accessibilityHint("長押しすると、ほかのタブを選べます")
            .accessibilityAction(named: "ホーム") { leave(.home) }
            .accessibilityAction(named: "支払い") { leave(.payments) }
            .accessibilityAction(named: "その他") { leave(.more) }
        }
        .animation(.spring(response: 0.36, dampingFraction: 0.78), value: expanded)
        .animation(.snappy(duration: 0.18), value: hover)
    }

    /// 1本の指の動きだけで「押す（戻る）」「長押し（開く）」「すべらせて選ぶ」を見分ける
    private var press: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { v in
                if pressStart == nil {
                    pressStart = Date()
                    let token = UUID(); pressToken = token
                    Task { @MainActor in
                        try? await Task.sleep(for: .milliseconds(320))
                        guard pressToken == token, pressStart != nil, !moved else { return }
                        expanded = true
                        Feedback.play(.commit)
                    }
                }
                if !expanded && hypot(v.translation.width, v.translation.height) > 14 { moved = true }
                guard expanded else { return }
                let up = -v.translation.height
                let i = Int(((up - step * 0.5) / step).rounded(.down))
                let next = (0..<items.count).contains(i) ? i : nil
                if next != hover { hover = next; if next != nil { Feedback.selection() } }
            }
            .onEnded { _ in
                let wasExpanded = expanded, chosen = hover, wasMoved = moved
                pressStart = nil; pressToken = nil; moved = false; hover = nil; expanded = false
                if wasExpanded { if let c = chosen { leave(items[c].0) } }
                else if !wasMoved { leave(origin) }
            }
    }
}

/// 画面の行き先として ACF を指定された時（お気に入りなど）：ACFセンターを開いて、元の画面に戻る
struct AcfCenterLauncher: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var tab: AcfCenterTab = .overview
    var body: some View {
        Color(.systemGroupedBackground)
            .onAppear {
                model.openAcf(tab)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { dismiss() }
            }
    }
}
