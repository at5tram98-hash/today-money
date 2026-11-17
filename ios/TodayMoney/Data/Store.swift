import Foundation
import SwiftData

/// 端末に保存するデータ。Web 版と同じ JSON（バックアップと同じ形）を1件まるごと保存する。
/// iOS が知らない項目も JSON のまま残るので、Web 版との行き来で情報を失わない。
@Model
final class StoredDocument {
    @Attribute(.unique) var key: String
    var json: Data
    var updatedAt: Date
    init(key: String = "main", json: Data, updatedAt: Date = .now) {
        self.key = key; self.json = json; self.updatedAt = updatedAt
    }
}

/// 変更の直前の状態（復元ポイント）。新しいものから一定数だけ残す。
@Model
final class StoredSnapshot {
    var createdAt: Date
    var reason: String
    var json: Data
    init(createdAt: Date = .now, reason: String, json: Data) {
        self.createdAt = createdAt; self.reason = reason; self.json = json
    }
}

enum MoneySchema {
    static let models: [any PersistentModel.Type] = [StoredDocument.self, StoredSnapshot.self]

    static func container(inMemory: Bool) throws -> ModelContainer {
        let schema = Schema(models)
        let config = ModelConfiguration("MyMoney", schema: schema, isStoredInMemoryOnly: inMemory)
        return try ModelContainer(for: schema, configurations: [config])
    }
}
