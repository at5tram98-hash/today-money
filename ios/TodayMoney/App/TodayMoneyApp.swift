import SwiftUI
import SwiftData
import UserNotifications
import UIKit
import TodayMoneyCore

@main
struct TodayMoneyApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var model = AppModel.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .modelContainer(AppModel.container)
        }
    }
}

extension AppModel {
    /// 保存先（アプリ・Siri・ショートカット・ウィジェットの更新で共通）
    static let container: ModelContainer = {
        // UI テスト・スクリーンショット用：起動引数 -inMemory で端末のデータに触れずに起動する
        let inMemory = ProcessInfo.processInfo.arguments.contains("-inMemory")
        do { return try MoneySchema.container(inMemory: inMemory) }
        catch {
            containerFailure = "保存先を開けなかったため、一時的なメモリ上で起動しました。この状態の変更は保存されません。（\(error.localizedDescription)）"
            return try! MoneySchema.container(inMemory: true)
        }
    }()
    nonisolated(unsafe) static var containerFailure: String?

    /// アプリ全体で1つのデータ（画面と Siri・ショートカットが同じものを使う）
    static let shared: AppModel = {
        let model = AppModel.live(container: container)
        if let f = containerFailure { model.errorMessage = f }
        NotificationRouter.shared.model = model
        UNUserNotificationCenter.current().delegate = NotificationRouter.shared
        return model
    }()
}

/// ホーム画面のアイコンを長押しした時のメニュー（クイックアクション）
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        if let item = options.shortcutItem { QuickActions.pending = item.type }
        let c = UISceneConfiguration(name: nil, sessionRole: session.role)
        c.delegateClass = SceneDelegate.self
        return c
    }
}

final class SceneDelegate: NSObject, UIWindowSceneDelegate {
    func windowScene(_ windowScene: UIWindowScene, performActionFor shortcutItem: UIApplicationShortcutItem) async -> Bool {
        await MainActor.run { QuickActions.perform(shortcutItem.type) }
        return true
    }
}

enum QuickActions {
    nonisolated(unsafe) static var pending: String?

    /// 種類は mymoney:// の行き先（entry/expense・day-close・acf・mail など）
    @MainActor static func perform(_ type: String) {
        if let url = URL(string: "mymoney://\(type)") { AppModel.shared.open(url) }
    }

    /// 長押しメニューの中身（今日の残り・確認待ちの件数を出す）
    @MainActor static func update(doc: MoneyDocument) {
        let today = Dates.ymd()
        let goal = doc.dailyGoal(today), spent = doc.spent(on: today)
        var items: [UIApplicationShortcutItem] = [
            UIApplicationShortcutItem(type: "entry/expense", localizedTitle: "支出を入力",
                                      localizedSubtitle: goal > 0 ? (spent <= goal ? "今日あと \((goal - spent).yen)" : "目標を \((spent - goal).yen) 超えています") : nil,
                                      icon: UIApplicationShortcutIcon(systemImageName: "plus.circle.fill")),
            UIApplicationShortcutItem(type: "day-close", localizedTitle: "日締め", localizedSubtitle: nil, icon: UIApplicationShortcutIcon(systemImageName: "checkmark.seal")),
            UIApplicationShortcutItem(type: "acf", localizedTitle: "ACF（使えるお金）", localizedSubtitle: nil, icon: UIApplicationShortcutIcon(systemImageName: "chart.line.uptrend.xyaxis")),
        ]
        let n = doc.pendingMailIds.count
        if n > 0 { items.append(UIApplicationShortcutItem(type: "mail", localizedTitle: "メールの確認", localizedSubtitle: "確認待ち \(n)件", icon: UIApplicationShortcutIcon(systemImageName: "envelope.badge"))) }
        UIApplication.shared.shortcutItems = items
    }
}
