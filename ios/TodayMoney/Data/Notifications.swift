import Foundation
import TodayMoneyCore
import UserNotifications

/// ローカル通知の予約（Core の notificationPlan を、端末の通知として予約し直す）
@MainActor
enum Notifications {
    private static var pendingTask: Task<Void, Never>?

    /// データが変わった時に呼ぶ。続けて変わった時は最後の1回だけ予約し直す
    static func scheduleSoon(doc: MoneyDocument) {
        pendingTask?.cancel()
        pendingTask = Task {
            try? await Task.sleep(for: .seconds(1.5))
            guard !Task.isCancelled else { return }
            await reschedule(doc: doc)
        }
    }

    static func reschedule(doc: MoneyDocument, now: Date = Date()) async {
        let center = UNUserNotificationCenter.current()
        let st = await center.notificationSettings().authorizationStatus
        guard st == .authorized || st == .provisional || st == .ephemeral else { return }
        let d = UserDefaults.standard
        let today = Dates.ymd(now)
        let f = DateFormatter(); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "HH:mm"
        let plan = doc.notificationPlan(today: today, nowTime: f.string(from: now),
                                        payments: d.object(forKey: "notifyPayments") as? Bool ?? true,
                                        salary: d.object(forKey: "notifySalary") as? Bool ?? true, now: now)
        center.removeAllPendingNotificationRequests()
        for n in plan {
            let dp = Dates.parts(n.date), tp = n.time.split(separator: ":").compactMap { Int($0) }
            let c = UNMutableNotificationContent()
            c.title = n.title; c.body = n.body; c.sound = .default
            c.userInfo = ["target": n.target]
            c.threadIdentifier = String(n.id.prefix { $0 != ":" })
            let comps = DateComponents(year: dp.y, month: dp.m, day: dp.d, hour: tp.first ?? 9, minute: tp.count > 1 ? tp[1] : 0)
            try? await center.add(UNNotificationRequest(identifier: n.id, content: c, trigger: UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)))
        }
    }
}

/// 通知を押した時に、その画面を開く。アプリを開いている間も通知を出す
final class NotificationRouter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = NotificationRouter()
    @MainActor weak var model: AppModel?

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .list]
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let target = response.notification.request.content.userInfo["target"] as? String ?? "home"
        await MainActor.run {
            if let url = URL(string: "mymoney://\(target)") { model?.open(url) }
        }
    }
}
