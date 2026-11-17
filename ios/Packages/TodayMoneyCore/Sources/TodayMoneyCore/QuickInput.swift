import Foundation

// 一行入力（Web 版 16-analysis-and-goals.js の parseQuickExpenseLine）・電卓の補助（calculator.js の calcAssistResult）・
// 横断検索（pro4SearchItems）・タグ／お気に入り（15-pro-features.js）。照合テスト QuickInputCompatTests。

public struct QuickDraft: Equatable, Sendable, Identifiable {
    public var id: String
    public var raw: String
    public var date: String
    public var amount: Double
    public var merchant: String
    public var category: String
    public var paymentMethod: String
    public var paymentId: String
    public var paymentCandidates: [(method: String, id: String, label: String)]
    public var paymentAmbiguous: Bool
    public var notes: [String]
    public var duplicateIds: [String]
    public var allowDuplicate = false
    public var valid: Bool { amount > 0 && !merchant.trimmingCharacters(in: .whitespaces).isEmpty && !date.isEmpty && !paymentMethod.isEmpty && (duplicateIds.isEmpty || allowDuplicate) }
    public static func == (a: QuickDraft, b: QuickDraft) -> Bool {
        a.id == b.id && a.date == b.date && a.amount == b.amount && a.merchant == b.merchant && a.category == b.category && a.paymentMethod == b.paymentMethod && a.paymentId == b.paymentId && a.allowDuplicate == b.allowDuplicate
    }
}

func rx(_ p: String) -> NSRegularExpression { try! NSRegularExpression(pattern: p) }
extension String {
    func matches(_ p: String) -> [[String?]] {
        let ns = self as NSString
        return rx(p).matches(in: self, range: NSRange(location: 0, length: ns.length)).map { m in
            (0..<m.numberOfRanges).map { m.range(at: $0).location == NSNotFound ? nil : ns.substring(with: m.range(at: $0)) }
        }
    }
    func has(_ p: String) -> Bool { rx(p).firstMatch(in: self, range: NSRange(location: 0, length: (self as NSString).length)) != nil }
    func replacing(_ p: String, with t: String) -> String { rx(p).stringByReplacingMatches(in: self, range: NSRange(location: 0, length: (self as NSString).length), withTemplate: t) }
}

public extension MoneyDocument {
    /// Web 版 pro4MerchantKey（NFKC・小文字・空白や記号を除く）
    static func quickKey(_ v: String) -> String {
        v.precomposedStringWithCompatibilityMapping.lowercased().replacing(#"[\s　・._\-／/]+"#, with: "")
    }
    static func dateFromText(_ s: String, base: String) -> String {
        if s.contains("一昨日") { return Dates.addDays(base, -2) }
        if s.contains("昨日") { return Dates.addDays(base, -1) }
        if s.contains("今日") { return base }
        func valid(_ y: Int, _ m: Int, _ d: Int) -> String? {
            let ds = "\(y)-\(pad2(m))-\(pad2(d))"
            return m >= 1 && m <= 12 && d >= 1 && d <= Dates.daysInMonth("\(y)-\(pad2(m))") ? ds : nil
        }
        if let m = s.matches(#"(20\d{2})[/-](\d{1,2})[/-](\d{1,2})"#).first, let d = valid(Int(m[1]!)!, Int(m[2]!)!, Int(m[3]!)!) { return d }
        let y = Int(base.prefix(4))!
        if let m = s.matches(#"(?:^|\s)(\d{1,2})[/-](\d{1,2})(?:\s|$)"#).first, let d = valid(y, Int(m[1]!)!, Int(m[2]!)!) { return d }
        if let m = s.matches(#"(\d{1,2})月(\d{1,2})日"#).first, let d = valid(y, Int(m[1]!)!, Int(m[2]!)!) { return d }
        return base
    }
    static func amountFromText(_ s: String) -> Double {
        let ms = s.matches(#"[¥￥]\s*([0-9][0-9,]*)|([0-9][0-9,]*)\s*円"#)
        if let last = ms.last, let v = Double((last[1] ?? last[2] ?? "").replacingOccurrences(of: ",", with: "")), v > 0 { return v }
        let nums = s.matches(#"(?:^|\s)([0-9][0-9,]*)(?=\s|$)"#).compactMap { Double(($0[1] ?? "").replacingOccurrences(of: ",", with: "")) }.filter { $0 > 0 && $0 < 100_000_000 }
        return nums.last ?? 0
    }
    func merchantFromText(_ text: String) -> String {
        var s = text.trimmingCharacters(in: .whitespaces)
        s = s.replacing("一昨日|昨日|今日", with: " ").replacing(#"20\d{2}[/-]\d{1,2}[/-]\d{1,2}"#, with: " ").replacing(#"\d{1,2}[/-]\d{1,2}"#, with: " ")
            .replacing(#"\d{1,2}月\d{1,2}日"#, with: " ").replacing(#"[¥￥]?\s*[0-9][0-9,]*\s*円"#, with: " ")
        for c in categories where !c.name.isEmpty { s = s.replacingOccurrences(of: c.name, with: " ") }
        let names = (cards.map { $0.name.isEmpty ? $0.company : $0.name } + banks.map(\.name) + debitCards.map(\.name)).filter { !$0.isEmpty }
        for n in names.enumerated().sorted(by: { $0.element.count != $1.element.count ? $0.element.count > $1.element.count : $0.offset < $1.offset }).map(\.element) {
            s = s.replacingOccurrences(of: n, with: " ")
        }
        s = s.replacing("PayPayカード|PayPay銀行|PayPay|ペイペイ|現金|クレジットカード|カード|デビット", with: " ")
        let out = s.replacing("[、,]", with: " ").replacing(#"\s+"#, with: " ").trimmingCharacters(in: .whitespaces)
        return out.isEmpty ? "支出" : out
    }
    func categoryGuess(_ raw: String, merchant: String) -> String {
        let key = Self.quickKey(merchant)
        let names = Set(categories.map(\.name))
        if let r = str(root["quickInputRules"]?[key]?["category"]).nonEmptyValue, names.contains(r) { return r }
        if let l = root["merchantRules"]?[key]?.stringValue, names.contains(l) { return l }
        if let d = categories.first(where: { raw.contains($0.name) }) { return d.name }
        let table: [(String, String)] = [("食費", "マック|マクド|コンビニ|ローソン|セブン|ファミマ|カフェ|スタバ|飲食|ごはん|ランチ|夕食|昼食"), ("交通費", "JR|地下鉄|バス|電車|タクシー|ICOCA|Suica|運賃|乗車"),
                                         ("衣服費", "GU|ユニクロ|服|衣類|しまむら"), ("日用品", "ドラッグ|薬局|日用品|無印"), ("娯楽費", "映画|カラオケ|ゲーム|遊園地|ナガシマ|チケット"), ("教育費", "大学|教科書|参考書|授業|資格|TOEIC|MOS|簿記")]
        for (cat, re) in table where raw.has(re) && names.contains(cat) { return cat }
        return categories.first { $0.name == "その他" }?.name ?? categories.last?.name ?? "その他"
    }
    func paymentGuess(_ raw: String, merchant: String) -> (method: String, id: String, ambiguous: Bool, candidates: [(method: String, id: String, label: String)]) {
        var matches: [(method: String, id: String, label: String)] = []
        func push(_ m: String, _ i: String, _ l: String) { if !matches.contains(where: { $0.method == m && $0.id == i }) { matches.append((m, i, l)) } }
        let low = raw.lowercased()
        for c in cards where low.contains((c.name.isEmpty ? c.company : c.name).lowercased()) { push("card", c.id, c.name) }
        for b in banks where low.contains(b.name.lowercased()) { push("bank", b.id, b.name) }
        for d in debitCards where low.contains(d.name.lowercased()) { push("debit", d.id, d.name) }
        if raw.contains("現金") { return ("other", "", false, []) }
        let ppCard = cards.first { ($0.name.isEmpty ? $0.company : $0.name).lowercased().contains("paypay") }
        let ppBank = banks.first { $0.name.lowercased().contains("paypay") }
        if raw.contains("PayPayカード"), let c = ppCard { return ("card", c.id, false, []) }
        if raw.contains("PayPay銀行"), let b = ppBank { return ("bank", b.id, false, []) }
        if raw.has(#"(?i)\bPayPay\b|ペイペイ"#) {
            if let c = ppCard { push("card", c.id, c.name) }
            if let b = ppBank { push("bank", b.id, b.name) }
            if matches.count > 1 { return ("", "", true, matches) }
        }
        if matches.count == 1 { return (matches[0].method, matches[0].id, false, []) }
        if matches.count > 1 { return ("", "", true, matches) }
        if raw.contains("カード") {
            if cards.count == 1 { return ("card", cards[0].id, false, []) }
            if cards.count > 1 { return ("", "", true, cards.map { ("card", $0.id, $0.name) }) }
        }
        let key = Self.quickKey(merchant)
        if let m = str(root["quickInputRules"]?[key]?["paymentMethod"]).nonEmptyValue { return (m, str(root["quickInputRules"]?[key]?["paymentId"]), false, []) }
        if let last = transactions.sorted(by: { ($0.createdAt.isEmpty ? $0.date : $0.createdAt) > ($1.createdAt.isEmpty ? $1.date : $1.createdAt) }).first(where: { Self.quickKey($0.merchant) == key }) {
            return (last.paymentMethod.isEmpty ? "other" : last.paymentMethod, last.paymentId, false, [])
        }
        return ("other", "", false, [])
    }
    func duplicateIds(date: String, amount: Double, merchant: String) -> [String] {
        let key = Self.quickKey(merchant)
        return transactions.filter { $0.date == date && abs($0.amount - amount) < 1 && Self.quickKey($0.merchant) == key }.map(\.id)
    }
    /// 一行を読み取る（Web 版 parseQuickExpenseLine）
    func parseQuickLine(_ text: String, base: String) -> QuickDraft {
        let raw = text.trimmingCharacters(in: .whitespaces)
        let date = Self.dateFromText(raw, base: base), amount = Self.amountFromText(raw), merchant = merchantFromText(raw)
        let category = categoryGuess(raw, merchant: merchant), p = paymentGuess(raw, merchant: merchant)
        var notes: [String] = []
        if employers.contains(where: { Self.quickKey($0.name) == Self.quickKey(merchant) }) { notes.append("\(merchant) は勤務先名にも一致します。ここでは支出先として登録します。") }
        let dups = duplicateIds(date: date, amount: amount, merchant: merchant)
        if amount == 0 { notes.append("金額を確認してください。") }
        if p.ambiguous { notes.append("支払い方法に複数候補があります。選択してください。") }
        if !dups.isEmpty { notes.append("同じ日・金額・支出先の既存記録が \(dups.count) 件あります。") }
        return QuickDraft(id: Self.uid("draft"), raw: raw, date: date, amount: amount, merchant: merchant, category: category, paymentMethod: p.method, paymentId: p.id,
                          paymentCandidates: p.candidates, paymentAmbiguous: p.ambiguous, notes: notes, duplicateIds: dups)
    }
    func parseQuickLines(_ text: String, base: String) -> [QuickDraft] {
        text.components(separatedBy: .newlines).map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }.map { parseQuickLine($0, base: base) }
    }
    /// 一行入力の保存（同じ店の次回のために、カテゴリと支払い方法を覚える）
    mutating func saveQuickDrafts(_ drafts: [QuickDraft], now: Date = Date(), today: String) {
        var rules = root["quickInputRules"]?.objectValue ?? [:]
        for d in drafts where d.valid {
            recordExpense(date: d.date, amount: d.amount, category: d.category, merchant: d.merchant, paymentMethod: d.paymentMethod, paymentId: d.paymentId, memo: d.raw, source: "quick_line", now: now, today: today)
            rules[Self.quickKey(d.merchant)] = .object(["category": .string(d.category), "paymentMethod": .string(d.paymentMethod), "paymentId": .string(d.paymentId), "updatedAt": .string(ISODate.now(now))])
        }
        self["quickInputRules"] = .object(rules)
    }
}

extension String { var nonEmptyValue: String? { isEmpty ? nil : self } }

// MARK: - 電卓の補助

public enum CalcAssist {
    /// 割引後・割合を加算・割り勘（Web 版 calcAssistResult）
    public static func result(base: Double, kind: String, value: Double) -> (amount: Double, copy: String)? {
        guard base.isFinite, value.isFinite, base >= 0 else { return nil }
        if kind == "split" {
            guard value == value.rounded(), value >= 2, value <= 100 else { return nil }
            let n = Int(value), b = Int(base)
            let each = b / n, rem = b % n
            let copy = "\(each.formatted())円 × \(n - rem)人\(rem > 0 ? "、\(each + 1)円 × \(rem)人" : "")（合計\(b.formatted())円）"
            return (Double(each), copy)
        }
        guard value >= 0, value <= 100 else { return nil }
        let amount = (base * (kind == "discount" ? 1 - value / 100 : 1 + value / 100)).rounded(.toNearestOrAwayFromZero)
        let v = value == value.rounded() ? String(Int(value)) : String(value)
        return (amount, kind == "discount" ? "\(v)%引き" : "\(v)%を加算（1円単位で四捨五入）")
    }
}

// MARK: - 横断検索

public struct SearchItem: Identifiable, Sendable {
    public var type: String, refId: String, title: String, sub: String, value: String, date: String
    public var id: String { "\(type)|\(refId)" }
}

public extension MoneyDocument {
    /// Web 版 pro4SearchItems（取引・給与・口座・カード・目標を横断して探す）
    func searchItems(_ query: String, type: String = "all", today: String) -> [SearchItem] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        func hit(_ s: String) -> Bool { q.isEmpty || s.lowercased().contains(q) }
        var rows: [SearchItem] = []
        if type == "all" || type == "transaction" {
            for t in transactions where hit("\(t.merchant) \(t.category) \(t.memo) \(txPaymentLabel(t)) \(t.date)") {
                rows.append(SearchItem(type: "transaction", refId: t.id, title: t.merchant, sub: "\(t.date)・\(t.category)・\(txPaymentLabel(t))", value: Format.yen(t.amount), date: t.date))
            }
        }
        if type == "all" || type == "salary" {
            for r in salaryRecords {
                let e = employer(r.employerId), st = status(r, today: today).rawValue
                if hit("\(e?.name ?? "") \(r.month) \(r.date) \(st)") {
                    rows.append(SearchItem(type: "salary", refId: r.id, title: e?.name ?? "給与", sub: "\(Format.monthLabel(r.month))勤務分・\(st)", value: Format.yen(expectedOrReceived(r, today: today)), date: r.date))
                }
            }
        }
        if type == "all" || type == "account" { for b in banks where hit("\(b.name) \(b.label)") { rows.append(SearchItem(type: "account", refId: b.id, title: b.name, sub: b.label.isEmpty ? "銀行口座" : b.label, value: Format.yen(b.balance), date: "")) } }
        if type == "all" || type == "card" { for c in cards where hit("\(c.name) \(c.company)") { rows.append(SearchItem(type: "card", refId: c.id, title: c.name, sub: "クレジットカード", value: "", date: "")) } }
        if type == "all" || type == "goal" {
            for g in eventGoals where hit("\(g.name) \(g.type) \(g.items.map(\.name).joined(separator: " "))") {
                let s = eventGoalSummary(g, today: today)
                rows.append(SearchItem(type: "goal", refId: g.id, title: g.name, sub: "期限 \(g.deadline)・自分の負担 \(Format.yen(s.ownShare))", value: Format.yen(s.total), date: g.deadline))
            }
        }
        return Array(rows.enumerated().sorted { $0.element.date != $1.element.date ? $0.element.date > $1.element.date : $0.offset < $1.offset }.map(\.element).prefix(100))
    }
}

// MARK: - タグ・お気に入り

public struct Tag: JSONRecord {
    public var raw: JSONValue
    public var id: String, name: String, color: String
    public init(json: JSONValue) { raw = json; id = str(json["id"]); name = str(json["name"]); color = str(json["color"]).isEmpty ? "#007AFF" : str(json["color"]) }
    public init(id: String, name: String, color: String) { self.init(json: .object([:])); self.id = id; self.name = name; self.color = color }
    public var known: [String: JSONValue] { ["id": .string(id), "name": .string(name), "color": .string(color)] }
}

public struct Taggable: Identifiable, Sendable { public var ref: String; public var label: String; public var kind: String; public var id: String { ref } }

public extension MoneyDocument {
    var tags: [Tag] { get { records("tags") } set { setRecords("tags", newValue) } }
    /// お気に入り（Web 版 favoriteOrder：最大8件・並び順つき）
    var favorites: [String] {
        let sel = (root["sidebarFavorites"]?.arrayValue ?? []).compactMap(\.stringValue)
        var ordered = (root["sidebarFavoriteOrder"]?.arrayValue ?? []).compactMap(\.stringValue).filter { sel.contains($0) }
        for k in sel where !ordered.contains(k) { ordered.append(k) }
        return Array(ordered.prefix(8))
    }
    mutating func setFavorites(_ list: [String]) {
        let l = Array(list.prefix(8))
        self["sidebarFavorites"] = .array(l.map { .string($0) }); self["sidebarFavoriteOrder"] = .array(l.map { .string($0) })
    }
    /// お気に入りの名前（Web 版 shortcutInfo の名前）
    func favoriteLabel(_ key: String) -> String? {
        let fixed = ["acf": "ACF", "quickExpense": "クイック支出入力", "quickBank": "銀行残高更新", "cardBilling": "カード請求額更新", "planner": "月間Planner", "salary": "給与",
                     "fixed": "固定支払い", "large": "大型支出", "gmail": "Gmail取引", "transactions": "取引一覧", "assetTrend": "資産推移"]
        if let f = fixed[key] { return f }
        let p = key.split(separator: ":", maxSplits: 1).map(String.init)
        guard p.count == 2 else { return nil }
        switch p[0] {
        case "bank": return bank(p[1])?.name
        case "card": return card(p[1])?.name
        case "debit": return debit(p[1])?.name
        case "employer": return employer(p[1])?.name
        default: return nil
        }
    }
    /// タグを付けられるもの（Web 版 taggableItems）
    var taggableItems: [Taggable] {
        favorites.compactMap { k in favoriteLabel(k).map { Taggable(ref: "favorite:\(k)", label: $0, kind: "お気に入り") } }
            + banks.map { Taggable(ref: "bank:\($0.id)", label: $0.name, kind: "銀行") } + cards.map { Taggable(ref: "card:\($0.id)", label: $0.name, kind: "カード") }
            + employers.map { Taggable(ref: "employer:\($0.id)", label: $0.name, kind: "勤務先") } + fixedPayments.map { Taggable(ref: "fixed:\($0.id)", label: $0.name, kind: "固定支払い") }
            + largeExpensePlans.map { Taggable(ref: "large:\($0.id)", label: $0.name, kind: "大型支出") }
    }
    private static let tagKeys = ["bank": "banks", "card": "cards", "employer": "employers", "fixed": "fixedPayments", "large": "largeExpensePlans"]
    func tagsFor(_ ref: String) -> [String] {
        let p = ref.split(separator: ":", maxSplits: 1).map(String.init); guard p.count == 2 else { return [] }
        if p[0] == "favorite" { return (root["favoriteTagMap"]?[p[1]]?.arrayValue ?? []).compactMap(\.stringValue) }
        guard let key = Self.tagKeys[p[0]] else { return [] }
        return ((root[key]?.arrayValue ?? []).first { str($0["id"]) == p[1] }?["tagIds"]?.arrayValue ?? []).compactMap(\.stringValue)
    }
    mutating func setTags(_ ref: String, _ ids: [String]) {
        var seen = Set<String>(); let uniq = ids.filter { seen.insert($0).inserted }
        let p = ref.split(separator: ":", maxSplits: 1).map(String.init); guard p.count == 2 else { return }
        if p[0] == "favorite" { var m = root["favoriteTagMap"]?.objectValue ?? [:]; m[p[1]] = .array(uniq.map { .string($0) }); self["favoriteTagMap"] = .object(m); return }
        guard let key = Self.tagKeys[p[0]] else { return }
        var list = root[key]?.arrayValue ?? []
        if let i = list.firstIndex(where: { str($0["id"]) == p[1] }) { var o = list[i].objectValue ?? [:]; o["tagIds"] = .array(uniq.map { .string($0) }); list[i] = .object(o); self[key] = .array(list) }
    }
    /// タグを消す（付けた先からも外す。元のカードなどは消さない）
    mutating func deleteTag(_ id: String) {
        tags = tags.filter { $0.id != id }
        for item in taggableItems { let t = tagsFor(item.ref); if t.contains(id) { setTags(item.ref, t.filter { $0 != id }) } }
    }
}
