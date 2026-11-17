import Foundation
import SwiftData
import SwiftUI
import TodayMoneyCore

/// 画面共通の状態。データ（MoneyDocument）を持ち、変更はすべて `commit` を通して保存する。
@MainActor
@Observable
final class AppModel {
    private(set) var doc: MoneyDocument
    var errorMessage: String?
    var toast: String?
    /// 画面の再描画のきっかけ（保存のたびに増える）
    private(set) var revision = 0

    private let context: ModelContext?
    static let snapshotLimit = 20

    init(doc: MoneyDocument, context: ModelContext?) {
        self.doc = doc
        self.context = context
    }

    /// 保存先から読み込む。初めて起動した時は Web 版と同じ初期データから始める
    static func live(container: ModelContainer) -> AppModel {
        let context = ModelContext(container)
        do {
            if let stored = try context.fetch(FetchDescriptor<StoredDocument>(predicate: #Predicate { $0.key == "main" })).first {
                return AppModel(doc: try MoneyDocument(data: stored.json), context: context)
            }
        } catch {
            let m = AppModel(doc: MoneyDocument(), context: nil)
            m.errorMessage = "保存したデータを読めませんでした。データは消していません。（\(error)）"
            return m
        }
        let model = AppModel(doc: firstRunDocument(), context: context)
        model.persist()
        return model
    }

    static func firstRunDocument() -> MoneyDocument {
        guard let url = Bundle.main.url(forResource: "first-run", withExtension: "json"),
              let data = try? Data(contentsOf: url), let doc = try? MoneyDocument(data: data) else { return MoneyDocument() }
        return doc
    }

    /// 画面のプレビュー・UI テスト用
    static func preview() -> AppModel { AppModel(doc: firstRunDocument(), context: nil) }

    var today: String { Dates.ymd() }
    var thisMonth: String { Dates.ym() }

    // MARK: 変更

    /// データを変える。変える前の状態を復元ポイントに残してから保存する
    func commit(_ reason: String, _ mutate: (inout MoneyDocument) throws -> Void) {
        let before = doc
        do {
            var next = doc
            try mutate(&next)
            guard next != before else { return }
            snapshot(before, reason: reason)
            doc = next
            persist()
        } catch {
            errorMessage = "保存できませんでした。変更は取り消しました。（\(error)）"
        }
    }

    private func persist() {
        revision += 1
        guard let context else { return }
        let data = doc.exportJSON().data
        do {
            if let stored = try context.fetch(FetchDescriptor<StoredDocument>(predicate: #Predicate { $0.key == "main" })).first {
                stored.json = data; stored.updatedAt = .now
            } else {
                context.insert(StoredDocument(json: data))
            }
            try context.save()
        } catch {
            errorMessage = "端末に保存できませんでした。（\(error.localizedDescription)）"
        }
    }

    private func snapshot(_ d: MoneyDocument, reason: String) {
        guard let context else { return }
        context.insert(StoredSnapshot(reason: reason, json: d.exportJSON().data))
        if let all = try? context.fetch(FetchDescriptor<StoredSnapshot>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)])), all.count > Self.snapshotLimit {
            for old in all.dropFirst(Self.snapshotLimit) { context.delete(old) }
        }
    }

    var snapshots: [StoredSnapshot] {
        (try? context?.fetch(FetchDescriptor<StoredSnapshot>(sortBy: [SortDescriptor(\.createdAt, order: .reverse)]))) ?? []
    }

    func restore(_ s: StoredSnapshot) {
        do {
            let d = try MoneyDocument(data: s.json)
            commit("復元（\(s.reason)）") { $0 = d }
            toast = "\(s.createdAt.formatted(date: .abbreviated, time: .shortened))の状態に戻しました"
        } catch {
            errorMessage = "復元ポイントを読めませんでした。（\(error)）"
        }
    }

    // MARK: Web 版とのやり取り

    /// Web 版の「バックアップを書き出す」で作った .json を読み込む（今のデータは復元ポイントに残す）
    func importBackup(_ data: Data) throws -> (employers: Int, salary: Int, transactions: Int) {
        let d = try MoneyDocument(data: data)
        guard d["employers"] != nil || d["transactions"] != nil || d["salaryRecords"] != nil else {
            throw ImportError.notMoneyData
        }
        var clean = d.root; clean.removeValue(forKey: "backupMeta")
        commit("バックアップの読み込み") { $0 = MoneyDocument(root: clean) }
        return (doc.employers.count, doc.salaryRecords.count, doc.transactions.count)
    }

    func exportBackup() -> Data { doc.exportJSON().data }

    enum ImportError: LocalizedError {
        case notMoneyData
        var errorDescription: String? { "My Money のバックアップではないようです（勤務先・給与・支出が見つかりません）。" }
    }
}
