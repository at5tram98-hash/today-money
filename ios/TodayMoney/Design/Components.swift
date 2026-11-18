import SwiftUI
import TodayMoneyCore

// MARK: - 支払い方法

/// 支払い方法の選択肢（Web 版 entryPaymentChoices：現金・その他 → 口座 → デビット → カード）
struct PaymentChoice: Hashable, Identifiable {
    var method: String
    var id: String
    var label: String
    var key: String { "\(method)|\(id)" }
    var symbol: String {
        switch method { case "bank": return "building.columns"; case "debit": return "creditcard.and.123"; case "card": return "creditcard"; default: return "banknote" }
    }
    static func all(_ doc: MoneyDocument) -> [PaymentChoice] {
        [PaymentChoice(method: "other", id: "", label: "現金・その他")]
            + doc.banks.map { PaymentChoice(method: "bank", id: $0.id, label: $0.name) }
            + doc.debitCards.map { PaymentChoice(method: "debit", id: $0.id, label: $0.name) }
            + doc.cards.map { PaymentChoice(method: "card", id: $0.id, label: $0.name) }
    }
}

/// 支払い方法のメニュー
struct PaymentPicker: View {
    var title: String = "支払い方法"
    @Binding var method: String
    @Binding var paymentId: String
    @Environment(AppModel.self) private var model
    var body: some View {
        let choices = PaymentChoice.all(model.doc)
        Picker(title, selection: Binding(get: { "\(method)|\(paymentId)" }, set: { v in
            let p = v.split(separator: "|", maxSplits: 1, omittingEmptySubsequences: false).map(String.init)
            method = p.first ?? "other"; paymentId = p.count > 1 ? p[1] : ""
        })) {
            ForEach(choices) { c in Label(c.label, systemImage: c.symbol).tag(c.key) }
        }
    }
}

// MARK: - カテゴリ

extension Color {
    /// "#RRGGBB"
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        let v = UInt64(s, radix: 16) ?? 0x8E8E93
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}

enum CategoryStyle {
    /// Web 版のアイコン名 → SF Symbols
    static func symbol(_ icon: String) -> String {
        switch icon {
        case "fork": return "fork.knife"
        case "tram", "train": return "tram.fill"
        case "bag": return "bag.fill"
        case "tshirt", "shirt": return "tshirt.fill"
        case "ticket": return "ticket.fill"
        case "repeat": return "repeat"
        case "book": return "book.fill"
        case "bolt": return "bolt.fill"
        case "heart": return "heart.fill"
        case "people": return "person.2.fill"
        case "star": return "star.fill"
        case "gift": return "gift.fill"
        case "home", "house": return "house.fill"
        case "car": return "car.fill"
        case "phone": return "iphone"
        case "cart": return "cart.fill"
        case "coffee": return "cup.and.saucer.fill"
        case "game": return "gamecontroller.fill"
        case "medical", "health": return "cross.case.fill"
        case "pet": return "pawprint.fill"
        case "beauty": return "sparkles"
        default: return "ellipsis"
        }
    }
    static let choices: [(String, String)] = [
        ("fork", "食事"), ("tram", "交通"), ("bag", "買い物"), ("tshirt", "服"), ("ticket", "娯楽"), ("repeat", "定期"),
        ("book", "学び"), ("bolt", "光熱"), ("heart", "健康"), ("people", "交際"), ("star", "趣味"), ("gift", "贈り物"),
        ("house", "住まい"), ("car", "車"), ("phone", "通信"), ("cart", "日用品"), ("coffee", "カフェ"), ("game", "ゲーム"),
        ("pet", "ペット"), ("beauty", "美容"), ("ellipsis", "その他"),
    ]
    static let colors = ["#34C759", "#007AFF", "#30B0C7", "#AF52DE", "#FF9500", "#5856D6", "#64D2FF", "#FFCC00", "#FF3B30", "#FF2D55", "#A2845E", "#8E8E93"]
}

/// カテゴリの丸いアイコン
struct CategoryIcon: View {
    var category: TodayMoneyCore.Category
    var size: CGFloat = 30
    var body: some View {
        Image(systemName: CategoryStyle.symbol(category.icon))
            .font(.system(size: size * 0.45, weight: .semibold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hex: category.color), in: Circle())
            .accessibilityHidden(true)
    }
}

// MARK: - 一覧の行

/// 取引の行（カテゴリのアイコン・店名・支払い方法・金額）
struct TransactionRow: View {
    @Environment(AppModel.self) private var model
    var t: Transaction
    var showDate = false
    var body: some View {
        let doc = model.doc
        HStack(spacing: 12) {
            CategoryIcon(category: doc.category(named: t.category))
            VStack(alignment: .leading, spacing: 2) {
                Text(t.merchant.isEmpty ? t.category : t.merchant).lineLimit(1)
                Text([showDate ? Format.shortDay(t.date) : nil, t.category, doc.paymentLabel(method: t.paymentMethod, id: t.paymentId)].compactMap { $0 }.joined(separator: "・"))
                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(t.amount < 0 ? "+\((-t.amount).yen)" : t.amount.yen)
                .monospacedDigit()
                .foregroundStyle(t.amount < 0 ? .green : .primary)
        }
        .accessibilityElement(children: .combine)
    }
}

/// 月を切り替える（前の月・次の月・メニュー）
struct MonthSwitcher: View {
    @Binding var month: String
    var range: ClosedRange<Int> = -24...12
    var thisMonth: String
    var body: some View {
        HStack {
            Button { month = Dates.addMonths(month, -1) } label: { Image(systemName: "chevron.left") }
                .accessibilityLabel("前の月")
            Menu {
                ForEach(range.reversed(), id: \.self) { i in
                    let m = Dates.addMonths(thisMonth, i)
                    Button { month = m } label: { if m == month { Label(Format.monthLabel(m), systemImage: "checkmark") } else { Text(Format.monthLabel(m)) } }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(Format.monthLabel(month)).font(.headline)
                    Image(systemName: "chevron.down").font(.caption.weight(.bold))
                }
            }
            Text(month == thisMonth ? "今月" : month < thisMonth ? "過去月" : "未来月")
                .font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                .padding(.horizontal, 7).padding(.vertical, 2).background(.quaternary, in: Capsule())
            Spacer()
            Button { month = Dates.addMonths(month, 1) } label: { Image(systemName: "chevron.right") }
                .accessibilityLabel("次の月")
        }
        .buttonStyle(.borderless)
    }
}

/// 日付（YYYY-MM-DD）を DatePicker で選ぶ
struct YMDPicker: View {
    var title: String
    @Binding var value: String
    var body: some View {
        DatePicker(title, selection: Binding(get: { Dates.date(value.isEmpty ? Dates.ymd() : value) }, set: { value = Dates.ymd($0) }), displayedComponents: .date)
            .environment(\.locale, Locale(identifier: "ja_JP"))
    }
}

/// +¥1,234 / −¥1,234
func signedYen(_ v: Double) -> String { v > 0 ? "+\(v.yen)" : v.yen }

/// "あと3日" "今日" "2日前"
func daysUntilText(_ date: String, today: String) -> String {
    let d = Dates.daysBetween(today, date)
    return d == 0 ? "今日" : d > 0 ? "\(d)日後" : "\(-d)日前"
}

/// SwiftUI の Transaction（アニメーション）と区別する
typealias Transaction = TodayMoneyCore.Transaction
typealias Category = TodayMoneyCore.Category


/// 取引の行の操作：右からスワイプで削除、左からスワイプで「もう一度」、長押しでメニュー
struct TransactionActions: ViewModifier {
    @Environment(AppModel.self) private var model
    let t: Transaction
    @State private var confirmDelete = false

    func body(content: Content) -> some View {
        content
            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                Button(role: .destructive) { delete() } label: { Label("削除", systemImage: "trash") }
            }
            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                if t.amount > 0 { Button { again() } label: { Label("今日もう一度", systemImage: "arrow.clockwise") }.tint(.blue) }
            }
            .contextMenu {
                if t.amount > 0 {
                    Button { again() } label: { Label("今日もう一度記録（\(t.amount.yen)）", systemImage: "arrow.clockwise") }
                }
                Button { UIPasteboard.general.string = String(Int(abs(t.amount).rounded())) } label: { Label("金額をコピー", systemImage: "doc.on.doc") }
                if !t.merchant.isEmpty { Button { UIPasteboard.general.string = t.merchant } label: { Label("店名をコピー", systemImage: "textformat") } }
                Divider()
                Button(role: .destructive) { delete() } label: { Label("削除", systemImage: "trash") }
            } preview: {
                TransactionPreview(t: t).environment(model)
            }
    }

    private func delete() {
        let id = t.id
        model.change("支出の削除") { d, now, today in d.deleteTransaction(id, now: now, today: today) }
        model.done("\(t.merchant.isEmpty ? t.category : t.merchant) を削除しました")
    }
    private func again() {
        let x = t
        model.change("支出の記録") { d, now, today in
            d.recordExpense(date: today, amount: x.amount, category: x.category, merchant: x.merchant, paymentMethod: x.paymentMethod, paymentId: x.paymentId, memo: x.memo, now: now, today: today)
        }
        model.done("\(x.merchant.isEmpty ? x.category : x.merchant) \(x.amount.yen) を今日の分として記録しました")
    }
}

/// 長押しした時に出る取引のプレビュー
struct TransactionPreview: View {
    @Environment(AppModel.self) private var model
    let t: Transaction
    var body: some View {
        let doc = model.doc
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                CategoryIcon(category: doc.category(named: t.category))
                VStack(alignment: .leading) {
                    Text(t.merchant.isEmpty ? t.category : t.merchant).font(.headline)
                    Text(Format.dayLabel(t.date)).font(.caption).foregroundStyle(.secondary)
                }
            }
            Text(t.amount < 0 ? "+\((-t.amount).yen)" : t.amount.yen).font(.system(size: 34, weight: .bold, design: .rounded)).monospacedDigit()
            LabeledContent("カテゴリ", value: t.category)
            LabeledContent("支払い", value: doc.paymentLabel(method: t.paymentMethod, id: t.paymentId))
            if !t.memo.isEmpty { LabeledContent("メモ", value: t.memo) }
        }
        .font(.subheadline)
        .padding(20)
        .frame(width: 300)
    }
}

extension View {
    func transactionActions(_ t: Transaction) -> some View { modifier(TransactionActions(t: t)) }
}
