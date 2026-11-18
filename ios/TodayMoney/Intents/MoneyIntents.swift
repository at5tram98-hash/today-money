import AppIntents
import SwiftUI
import TodayMoneyCore

// MARK: - カテゴリ・支払い方法（Siri やショートカットで選べるもの）

struct CategoryEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "カテゴリ"
    static let defaultQuery = CategoryQuery()
    var id: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(id)") }
}

struct CategoryQuery: EntityStringQuery {
    @MainActor func entities(for identifiers: [String]) async throws -> [CategoryEntity] {
        let names = Set(AppModel.shared.doc.categories.map(\.name))
        return identifiers.filter { names.contains($0) }.map { CategoryEntity(id: $0) }
    }
    @MainActor func suggestedEntities() async throws -> [CategoryEntity] { AppModel.shared.doc.categories.map { CategoryEntity(id: $0.name) } }
    @MainActor func entities(matching string: String) async throws -> [CategoryEntity] {
        AppModel.shared.doc.categories.filter { $0.name.localizedCaseInsensitiveContains(string) }.map { CategoryEntity(id: $0.name) }
    }
}

struct PaymentEntity: AppEntity {
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "支払い方法"
    static let defaultQuery = PaymentQuery()
    /// "<method>|<id>"（cash|・bank|<口座>・card|<カード>・debit|<デビット>）
    var id: String
    var name: String
    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
    var method: String { String(id.split(separator: "|", omittingEmptySubsequences: false).first ?? "other") }
    var paymentId: String { String(id.split(separator: "|", omittingEmptySubsequences: false).dropFirst().first ?? "") }
}

struct PaymentQuery: EntityQuery {
    @MainActor static func all() -> [PaymentEntity] {
        let d = AppModel.shared.doc
        return [PaymentEntity(id: "cash|", name: "現金")]
            + d.cards.map { PaymentEntity(id: "card|\($0.id)", name: $0.name) }
            + d.debitCards.map { PaymentEntity(id: "debit|\($0.id)", name: $0.name) }
            + d.banks.map { PaymentEntity(id: "bank|\($0.id)", name: "\($0.name)（口座）") }
    }
    @MainActor func entities(for identifiers: [String]) async throws -> [PaymentEntity] { Self.all().filter { identifiers.contains($0.id) } }
    @MainActor func suggestedEntities() async throws -> [PaymentEntity] { Self.all() }
}

// MARK: - 支出を記録

struct RecordExpenseIntent: AppIntent {
    static let title: LocalizedStringResource = "支出を記録"
    static let description = IntentDescription("金額とカテゴリを言うだけで、My Money に支出を記録します。")
    static let openAppWhenRun = false

    @Parameter(title: "金額", description: "円", inclusiveRange: (1, 10_000_000), requestValueDialog: "いくら使いましたか？")
    var amount: Int
    @Parameter(title: "カテゴリ", requestValueDialog: "カテゴリは？")
    var category: CategoryEntity?
    @Parameter(title: "店名")
    var merchant: String?
    @Parameter(title: "支払い方法")
    var payment: PaymentEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("\(\.$amount)円を\(\.$category)で記録") { \.$merchant; \.$payment }
    }

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Int> & ProvidesDialog & ShowsSnippetView {
        let model = AppModel.shared
        let doc = model.doc
        let recent = doc.transactions.filter { $0.source == "manual" || $0.source.isEmpty }.max { ($0.createdAt, $0.date) < ($1.createdAt, $1.date) }
        let cat = category?.id ?? recent?.category ?? doc.categories.first?.name ?? "その他"
        let method = payment?.method ?? (recent?.paymentMethod.isEmpty == false ? recent!.paymentMethod : "cash")
        let pid = payment?.paymentId ?? (payment == nil ? recent?.paymentId ?? "" : "")
        let shop = (merchant ?? "").trimmingCharacters(in: .whitespaces)
        let ok = model.change("支出の記録（Siri）") { d, now, today in
            d.recordExpense(date: today, amount: Double(amount), category: cat, merchant: shop.isEmpty ? cat : shop, paymentMethod: method, paymentId: pid, source: "manual", now: now, today: today)
        }
        guard ok else { throw IntentError.message(model.errorMessage ?? "記録できませんでした。") }
        let s = model.doc.widgetSnapshot()
        let left = s.remaining(Dates.ymd())
        let tail = left.map { $0 >= 0 ? "今日あと \($0.yen) 使えます。" : "今日の目標を \((-$0).yen) 超えました。" } ?? ""
        return .result(value: amount, dialog: "\(cat) \(Double(amount).yen) を記録しました。\(tail)", view: TodaySnippet(snapshot: s))
    }
}

// MARK: - 今日あと使える額

struct TodayBudgetIntent: AppIntent {
    static let title: LocalizedStringResource = "今日あと使える額"
    static let description = IntentDescription("今日の目標からあといくら使えるか、ACF の見通しと一緒に答えます。")
    static let openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ReturnsValue<Int> & ProvidesDialog & ShowsSnippetView {
        let s = AppModel.shared.doc.widgetSnapshot()
        let today = Dates.ymd(), day = s.day(today)
        let text: String
        if let left = s.remaining(today) {
            text = left >= 0 ? "今日はあと \(left.yen) 使えます（目標 \(day.goal.yen)・使った額 \(day.spent.yen)）。" : "今日の目標 \(day.goal.yen) を \((-left).yen) 超えています。"
        } else {
            text = "今日の目標はまだありません。今日は \(day.spent.yen) 使いました。"
        }
        return .result(value: Int((s.remaining(today) ?? 0).rounded()), dialog: "\(text)", view: TodaySnippet(snapshot: s))
    }
}

// MARK: - 次の支払い

struct NextPaymentsIntent: AppIntent {
    static let title: LocalizedStringResource = "次の支払い"
    static let description = IntentDescription("これからの引落・固定支払いを教えます。")
    static let openAppWhenRun = false

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog {
        let s = AppModel.shared.doc.widgetSnapshot()
        let list = s.upcoming(from: Dates.ymd()).prefix(3)
        guard let first = list.first else { return .result(dialog: "45日以内の支払い予定はありません。") }
        let rest = list.dropFirst().map { "\(Format.shortDay($0.date)) \($0.title) \($0.amount.yen)" }.joined(separator: "、")
        return .result(dialog: "次は \(Format.shortDay(first.date)) の \(first.title) \(first.amount.yen) です。\(rest.isEmpty ? "" : "そのあと \(rest)。")")
    }
}

// MARK: - 画面を開く

enum AppScreen: String, AppEnum {
    case home, entry = "entry/expense", dayClose = "day-close", acf, payments, mail, search, analysis, goals
    static let typeDisplayRepresentation: TypeDisplayRepresentation = "画面"
    static let caseDisplayRepresentations: [AppScreen: DisplayRepresentation] = [
        .home: "ホーム", .entry: "支出の入力", .dayClose: "日締め", .acf: "ACF（使えるお金）", .payments: "支払い",
        .mail: "メール取引センター", .search: "検索", .analysis: "理由が分かる分析", .goals: "旅行・プレゼント目標",
    ]
}

struct OpenScreenIntent: AppIntent {
    static let title: LocalizedStringResource = "My Money の画面を開く"
    static let openAppWhenRun = true
    @Parameter(title: "画面", default: .home) var screen: AppScreen
    static var parameterSummary: some ParameterSummary { Summary("\(\.$screen)を開く") }

    @MainActor func perform() async throws -> some IntentResult {
        if let url = URL(string: "mymoney://\(screen.rawValue)") { AppModel.shared.open(url) }
        return .result()
    }
}

enum IntentError: Error, CustomLocalizedStringResourceConvertible {
    case message(String)
    var localizedStringResource: LocalizedStringResource { switch self { case .message(let m): return "\(m)" } }
}

// MARK: - Siri の言い方（設定しなくても使える）

struct MoneyShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: RecordExpenseIntent(), phrases: [
            "\(.applicationName)で支出を記録", "\(.applicationName)に支出を記録", "\(.applicationName)で\(\.$category)を記録",
        ], shortTitle: "支出を記録", systemImageName: "plus.circle.fill")
        AppShortcut(intent: TodayBudgetIntent(), phrases: [
            "\(.applicationName)で今日あと使える額", "\(.applicationName)で今日いくら使える", "\(.applicationName)の残り",
        ], shortTitle: "今日あと使える額", systemImageName: "yensign.circle")
        AppShortcut(intent: NextPaymentsIntent(), phrases: ["\(.applicationName)で次の支払い", "\(.applicationName)の支払い予定"],
                    shortTitle: "次の支払い", systemImageName: "calendar")
        AppShortcut(intent: OpenScreenIntent(), phrases: ["\(.applicationName)で\(\.$screen)を開く"], shortTitle: "画面を開く", systemImageName: "rectangle.portrait.and.arrow.right")
    }
    static let shortcutTileColor: ShortcutTileColor = .blue
}

// MARK: - Siri の答えに出す小さな画面

struct TodaySnippet: View {
    let snapshot: WidgetSnapshot
    var body: some View {
        let today = Dates.ymd(), day = snapshot.day(today), left = snapshot.remaining(today)
        VStack(alignment: .leading, spacing: 8) {
            Text(left == nil ? "今日の支出" : (left! >= 0 ? "今日あと使える額" : "目標オーバー")).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Text((left.map { abs($0) } ?? day.spent).yen).font(.system(size: 32, weight: .bold, design: .rounded)).monospacedDigit()
                .foregroundStyle((left ?? 0) < 0 ? .red : .primary)
            if day.goal > 0 { ProgressView(value: min(1, day.spent / max(1, day.goal))).tint((left ?? 0) < 0 ? .red : .orange) }
            HStack {
                Text("使った額 \(day.spent.yen)")
                Spacer()
                if let v = snapshot.acfValue, let l = snapshot.acfLabel { Text("ACF \(String(format: "%.2f", v)) \(l)") }
            }
            .font(.caption).foregroundStyle(.secondary)
        }
        .padding()
    }
}
