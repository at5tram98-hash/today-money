import Foundation
import TodayMoneyCore
import WidgetKit

/// 保存のたびに、ウィジェット用の要約を書き出してウィジェットを更新する
@MainActor
enum WidgetBridge {
    private static var task: Task<Void, Never>?
    private static var last: WidgetSnapshot?

    static func publish(doc: MoneyDocument) {
        task?.cancel()
        task = Task {
            try? await Task.sleep(for: .milliseconds(600))
            guard !Task.isCancelled else { return }
            var s = doc.widgetSnapshot()
            // 時刻だけ違う時は書き直さない（ウィジェットの更新回数を節約）
            if var prev = last { prev.updatedAt = s.updatedAt; if prev == s { return } }
            s.updatedAt = Date()
            do { try SharedStore.write(s); last = s; WidgetCenter.shared.reloadAllTimelines() } catch {}
        }
    }
}
