import Foundation

// カード明細の取り込み・確認・最終確定（Web 版 23-statement-import-and-review.js）と
// 請求照合センター（15-pro-features.js openStatementReconciliation）。照合テスト StatementCompatTests。

// MARK: - 明細の行

public struct StatementRow: Equatable, Sendable, Identifiable {
    public var id: String
    public var fingerprint: String
    public var transactionDate: String
    public var merchant: String
    public var originalMerchant: String
    public var originalAmount: Double
    public var currentPaymentAmount: Double
    public var fee: Double
    public var adjustment: Double
    public var carryOver: Double
    public var installmentText: String
    public var installmentCurrent: Int
    public var installmentTotal: Int
    public var category: String
    /// rules / rule / fallback / manual
    public var categorySource: String
    /// expense / refund
    public var direction: String
    public var linkedTransactionId: String
    public var linkedMailImportId: String
    /// needs_review / ready / pending
    public var reviewStatus: String
    public var included: Bool
    public var memo: String
    public var duplicateCandidateId = ""
    public var duplicateScore = 0
    var raw: [String: JSONValue]

    public init(json: JSONValue, provider: String = "", today: String = Dates.ymd()) {
        let o = json.objectValue ?? [:]
        raw = o
        id = str(o["id"]).isEmpty ? MoneyDocument.uid("stmtrow") : str(o["id"])
        originalMerchant = str(o["originalMerchant"]).isEmpty ? str(o["merchant"]) : str(o["originalMerchant"])
        merchant = str(o["merchant"]).isEmpty ? (originalMerchant.isEmpty ? "利用先不明" : originalMerchant) : str(o["merchant"])
        transactionDate = str(o["transactionDate"]).isEmpty ? today : str(o["transactionDate"])
        originalAmount = num(o["originalAmount"]); currentPaymentAmount = num(o["currentPaymentAmount"]); fee = num(o["fee"])
        adjustment = num(o["adjustment"]); carryOver = num(o["carryOver"])
        installmentText = str(o["installmentText"]); installmentCurrent = Int(num(o["installmentCurrent"])); installmentTotal = Int(num(o["installmentTotal"]))
        category = str(o["category"]).isEmpty ? "その他" : str(o["category"])
        categorySource = str(o["categorySource"]).isEmpty ? "fallback" : str(o["categorySource"])
        direction = str(o["direction"]) == "refund" ? "refund" : "expense"
        linkedTransactionId = str(o["linkedTransactionId"]); linkedMailImportId = str(o["linkedMailImportId"])
        reviewStatus = str(o["reviewStatus"]).isEmpty ? "pending" : str(o["reviewStatus"])
        included = o["included"]?.boolValue ?? true
        memo = str(o["memo"])
        duplicateCandidateId = str(o["duplicateCandidateId"]); duplicateScore = Int(num(o["duplicateScore"]))
        let fp = str(o["fingerprint"])
        fingerprint = fp.isEmpty ? StatementParser.stableHash([provider, transactionDate, originalMerchant, JSONValue.formatNumber(currentPaymentAmount), installmentText].joined(separator: "|")) : fp
    }

    /// Web 版 mm3RowContribution（今月支払額。返金は負、調整額を足す）
    public var contribution: Double { abs(currentPaymentAmount) * (direction == "refund" ? -1 : 1) + adjustment }
    /// Web 版 mm3StatementLedgerAmount（分割の支出は元の利用金額で記録する）
    public var ledgerAmount: Double {
        let original = abs(originalAmount), current = abs(contribution)
        return direction != "refund" && installmentTotal > 1 && original > 0 ? original : current
    }
    public var needsReview: Bool { reviewStatus == "needs_review" }

    public var json: JSONValue {
        var o = raw
        let known: [String: JSONValue] = [
            "id": .string(id), "fingerprint": .string(fingerprint), "transactionDate": .string(transactionDate), "merchant": .string(merchant),
            "originalMerchant": .string(originalMerchant), "originalAmount": .number(originalAmount), "currentPaymentAmount": .number(currentPaymentAmount),
            "fee": .number(fee), "adjustment": .number(adjustment), "carryOver": .number(carryOver), "installmentText": .string(installmentText),
            "installmentCurrent": .number(Double(installmentCurrent)), "installmentTotal": .number(Double(installmentTotal)), "category": .string(category),
            "categorySource": .string(categorySource), "direction": .string(direction), "linkedTransactionId": .string(linkedTransactionId),
            "linkedMailImportId": .string(linkedMailImportId), "reviewStatus": .string(reviewStatus), "included": .bool(included), "memo": .string(memo),
            "duplicateCandidateId": .string(duplicateCandidateId), "duplicateScore": .number(Double(duplicateScore)),
        ]
        for (k, v) in known { o[k] = v }
        return .object(o)
    }
}

// MARK: - 取り込んだ明細

public struct CardStatementImport: JSONRecord {
    public var raw: JSONValue
    public var id: String
    public var cardId: String
    /// paypay / smbc / unknown
    public var provider: String
    public var fileName: String
    public var fileHash: String
    public var paymentMonth: String
    public var paymentDate: String
    public var officialTotal: Double
    /// pdf_official / calculated_pdf / calculated_csv
    public var officialTotalSource: String
    public var calculatedTotal: Double
    /// draft / reviewing / confirmed
    public var status: String
    public var importedAt: String
    public var confirmedAt: String
    public var rows: [StatementRow]

    public init(json: JSONValue) {
        raw = json
        id = str(json["id"]).isEmpty ? MoneyDocument.uid("stmt") : str(json["id"])
        cardId = str(json["cardId"]); provider = str(json["provider"]).isEmpty ? "unknown" : str(json["provider"])
        fileName = str(json["fileName"]); fileHash = str(json["fileHash"])
        paymentDate = str(json["paymentDate"])
        let pm = str(json["paymentMonth"]).isEmpty ? String(paymentDate.prefix(7)) : str(json["paymentMonth"])
        paymentMonth = pm.isEmpty ? String(Dates.ymd().prefix(7)) : pm
        officialTotal = num(json["officialTotal"]); officialTotalSource = str(json["officialTotalSource"]); calculatedTotal = num(json["calculatedTotal"])
        let s = str(json["status"])
        status = ["draft", "reviewing", "confirmed"].contains(s) ? s : "reviewing"
        importedAt = str(json["importedAt"]).isEmpty ? ISODate.now() : str(json["importedAt"])
        confirmedAt = str(json["confirmedAt"])
        let p = provider
        rows = (json["rows"]?.arrayValue ?? []).map { StatementRow(json: $0, provider: p) }
    }
    public var known: [String: JSONValue] {
        ["id": .string(id), "cardId": .string(cardId), "provider": .string(provider), "fileName": .string(fileName), "fileHash": .string(fileHash),
         "paymentMonth": .string(paymentMonth), "paymentDate": .string(paymentDate), "officialTotal": .number(officialTotal),
         "officialTotalSource": .string(officialTotalSource), "calculatedTotal": .number(calculatedTotal), "status": .string(status),
         "importedAt": .string(importedAt), "confirmedAt": .string(confirmedAt), "rows": .array(rows.map(\.json))]
    }
    /// Web 版 mm3StatementTotal
    public var total: Double { rows.filter(\.included).reduce(0) { $0 + $1.contribution }.rounded(.toNearestOrAwayFromZero) }
    public var shownTotal: Double { officialTotal != 0 ? officialTotal : calculatedTotal }
    public var providerLabel: String { StatementParser.providerLabel(provider) }
    public var statusLabel: String { status == "confirmed" ? "最終確定済み" : status == "reviewing" ? "確認中" : "下書き" }
}

/// ファイルから読み取った明細（保存前）
public struct ParsedStatement: Equatable, Sendable {
    public var provider: String
    public var paymentDate: String
    public var paymentMonth: String
    public var officialTotal: Double
    public var officialTotalSource: String
    public var calculatedTotal: Double
    public var rows: [StatementRow]
}

public struct StatementError: LocalizedError, Equatable {
    public var message: String
    public init(_ m: String) { message = m }
    public var errorDescription: String? { message }
}

// MARK: - 読み取り

public enum StatementParser {
    /// Web 版 mm3Num
    public static func number(_ v: String) -> Double {
        let s = v.precomposedStringWithCompatibilityMapping.replacing(#"[￥¥円,\s]"#, with: "").replacing("[−－]", with: "-")
        if s.isEmpty { return 0 }
        return Double(s).flatMap { $0.isFinite ? $0 : nil } ?? 0
    }
    /// Web 版 mm3SlashDate
    public static func slashDate(_ v: String) -> String {
        guard let m = v.trimmingCharacters(in: .whitespacesAndNewlines).matches(#"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})"#).first,
              let y = m[1], let mo = Int(m[2] ?? ""), let d = Int(m[3] ?? "") else { return "" }
        return "\(y)-\(pad(mo))-\(pad(d))"
    }
    /// Web 版 mm3SmbcDate（YY/MM/DD）
    public static func smbcDate(_ v: String) -> String {
        guard let m = v.trimmingCharacters(in: .whitespacesAndNewlines).matches(#"(\d{2})/(\d{2})/(\d{2})"#).first, let y = m[1], let mo = m[2], let d = m[3] else { return "" }
        return "\((Int(y) ?? 0) >= 70 ? "19" : "20")\(y)-\(mo)-\(d)"
    }
    static func pad(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }

    /// Web 版 mm3StableHash（FNV 系の 64bit 相当の短いハッシュ）
    public static func stableHash(_ s: String) -> String {
        var h1: UInt32 = 2166136261, h2: UInt32 = 0x9e3779b9
        for u in s.unicodeScalars {
            let c = u.value
            h1 ^= c; h1 = h1 &* 16777619
            h2 ^= (c &+ h1); h2 = h2 &* 2246822519
        }
        func hex(_ v: UInt32) -> String { let x = String(v, radix: 16); return String(repeating: "0", count: max(0, 8 - x.count)) + x }
        return hex(h1) + hex(h2)
    }
    /// Web 版 mm3CleanStatementMerchant
    public static func cleanMerchant(_ v: String) -> String {
        let s = v.precomposedStringWithCompatibilityMapping.replacing(#"^\s*[（(]?分割変更[）)]?\s*"#, with: "").replacing(#"(?i)^PayPay[\s　]+"#, with: "")
            .replacing(#"[\t ]+"#, with: " ").trimmingCharacters(in: .whitespacesAndNewlines)
        return utf16Prefix(s, 100)
    }
    static func utf16Prefix(_ s: String, _ n: Int) -> String {
        let u = Array(s.utf16)
        return u.count <= n ? s : (String(utf16CodeUnits: Array(u.prefix(n)), count: n))
    }
    public static func providerLabel(_ p: String) -> String { p == "paypay" ? "PayPayカード" : p == "smbc" ? "三井住友カード" : "カード明細" }

    /// Web 版 mm3ParseCsv（ダブルクォート対応の CSV）
    public static func parseCsv(_ text: String) -> [[String]] {
        var t = text
        if t.hasPrefix("\u{FEFF}") { t.removeFirst() }
        var rows: [[String]] = [], row: [String] = [], cell = "", q = false
        let chars = Array(t.unicodeScalars)
        var i = 0
        func trimCR(_ s: String) -> String { s.hasSuffix("\r") ? String(s.dropLast()) : s }
        while i < chars.count {
            let ch = chars[i]
            if q {
                if ch == "\"" && i + 1 < chars.count && chars[i + 1] == "\"" { cell.unicodeScalars.append("\""); i += 1 }
                else if ch == "\"" { q = false }
                else { cell.unicodeScalars.append(ch) }
            } else {
                if ch == "\"" { q = true }
                else if ch == "," { row.append(cell); cell = "" }
                else if ch == "\n" { row.append(trimCR(cell)); rows.append(row); row = []; cell = "" }
                else { cell.unicodeScalars.append(ch) }
            }
            i += 1
        }
        if !cell.isEmpty || !row.isEmpty { row.append(trimCR(cell)); rows.append(row) }
        return rows
    }

    /// Web 版 mm3ParseSmbcRowLine
    static func smbcRow(_ line: String, occurrence: inout [String: Int], doc: MoneyDocument) -> StatementRow? {
        let s = line.precomposedStringWithCompatibilityMapping.replacing("[−－]", with: "-").replacing(#"\s+"#, with: " ").trimmingCharacters(in: .whitespaces)
        guard let m = s.matches(#"^(\d{2}/\d{2}/\d{2})\s+(.+?)\s+(-?[\d,]+)\s+(\d+)\s+(\d+)\s+(-?[\d,]+)(?:\s+(-?[\d,]+)\s+(-?[\d,]+))?(?:\s+(返品|取消))?$"#).first else { return nil }
        let date = smbcDate(m[1] ?? ""), merchant = cleanMerchant(m[2] ?? ""), originalAmount = number(m[3] ?? "")
        let payDiv = Int(m[4] ?? "").flatMap { $0 == 0 ? nil : $0 } ?? 1, currentCount = Int(m[5] ?? "").flatMap { $0 == 0 ? nil : $0 } ?? 1
        let currentRaw = number(m[6] ?? ""), paymentTotal = number(m[7] ?? ""), fee = number(m[8] ?? ""), flag = m[9] ?? ""
        let direction = currentRaw < 0 || flag.has("返品|取消") ? "refund" : "expense"
        let cat = doc.categoryForStatement(merchant, context: s)
        let installmentText = payDiv > 1 ? "均等 \(currentCount)/\(payDiv)" : "1回"
        let base = [date, MoneyDocument.merchantKey(merchant), JSONValue.formatNumber(currentRaw), "\(payDiv)", "\(currentCount)"].joined(separator: "|")
        let n = (occurrence[base] ?? 0) + 1; occurrence[base] = n
        var o: [String: JSONValue] = [:]
        o["id"] = .string(MoneyDocument.uid("stmtrow"))
        o["fingerprint"] = .string(stableHash("smbc|\(base)|\(n)"))
        o["transactionDate"] = .string(date)
        o["merchant"] = .string(merchant.isEmpty ? "利用先不明" : merchant)
        o["originalMerchant"] = .string(m[2] ?? "")
        o["originalAmount"] = .number(originalAmount)
        o["currentPaymentAmount"] = .number(currentRaw)
        o["fee"] = .number(fee)
        o["adjustment"] = .number(0)
        o["carryOver"] = .number(0)
        o["installmentText"] = .string(installmentText)
        o["installmentCurrent"] = .number(Double(payDiv > 1 ? currentCount : 0))
        o["installmentTotal"] = .number(Double(payDiv > 1 ? payDiv : 0))
        o["category"] = .string(cat.category)
        o["categorySource"] = .string(cat.source)
        o["direction"] = .string(direction)
        o["linkedTransactionId"] = .string("")
        o["linkedMailImportId"] = .string("")
        o["reviewStatus"] = .string(cat.source == "fallback" ? "needs_review" : "ready")
        o["included"] = .bool(true)
        o["memo"] = .string(flag)
        o["raw"] = .object(["paymentTotal": .number(paymentTotal), "payDiv": .number(Double(payDiv)), "currentCount": .number(Double(currentCount)), "flag": .string(flag)])
        return StatementRow(json: .object(o), provider: "smbc")
    }
}

public extension MoneyDocument {
    var cardStatementImports: [CardStatementImport] { get { records("cardStatementImports") } set { setRecords("cardStatementImports", newValue) } }
    func statementImport(_ id: String) -> CardStatementImport? { cardStatementImports.first { $0.id == id } }

    // MARK: カテゴリの推定（Web 版 categoryForMerchant / MERCHANT_CATEGORY_RULES）

    static let merchantCategoryRules: [(String, [String])] = [
        ("交通費", ["tap to pay", "taptopay", "jr西日本", "jr東日本", "jr東海", "jr北海道", "jr九州", "jr四国", "jr west", "jr east", "jr central", "西日本旅客鉄道", "東日本旅客鉄道", "東海旅客鉄道", "京都市交通局", "京都市営地下鉄", "京都市バス", "kyoto city bus", "kyoto subway", "icoca", "smart icoca", "suica", "モバイルsuica", "pasmo", "pitapa", "交通系ic", "スマートex", "smart ex", "ex予約", "阪急電鉄", "hankyu", "京阪電気鉄道", "keihan", "近畿日本鉄道", "kintetsu", "近鉄", "阪神電車", "hanshin", "南海電鉄", "nankai", "osaka metro", "大阪メトロ", "大阪市高速電気軌道", "神戸市交通局", "神戸市営地下鉄", "神姫バス", "京都バス", "タクシー", "taxi", "uber taxi", "go taxi", "didi", "高速バス", "夜行バス"]),
        ("食費", ["セブンイレブン", "7-eleven", "7eleven", "ファミリーマート", "familymart", "ローソン", "lawson", "ミニストップ", "デイリーヤマザキ", "マクドナルド", "mcdonald", "スターバックス", "starbucks", "ドトール", "tully", "タリーズ", "すき家", "松屋", "吉野家", "モスバーガー", "ケンタッキー", "kfc", "サイゼリヤ", "ガスト", "ココス", "スシロー", "くら寿司", "餃子の王将", "丸亀製麺", "なか卯", "ミスタードーナツ", "uber eats", "出前館"]),
        ("衣服費", ["ジーユー", "gu ", "uniqlo", "ユニクロ", "しまむら", "zara", "h&m"]),
        ("日用品", ["無印良品", "muji", "ダイソー", "daiso", "seria", "セリア", "キャンドゥ", "コーナン", "ニトリ", "ドンキホーテ", "ドン・キホーテ", "スギ薬局", "マツモトキヨシ", "ウエルシア", "ココカラファイン", "サンドラッグ", "ドラッグ"]),
        ("サブスク", ["netflix", "spotify", "youtube premium", "amazon prime", "disney+", "disney plus", "icloud", "adobe creative cloud"]),
        ("娯楽費", ["tohoシネマ", "イオンシネマ", "ラウンドワン", "round1", "カラオケ", "ジャンカラ", "快活club", "ユナイテッドシネマ"]),
        ("教育費", ["大学", "学校", "紀伊國屋書店", "丸善", "ジュンク堂", "教科書"]),
        ("光熱費", ["家賃", "賃料", "関西電力", "大阪ガス", "水道料金", "電気料金", "ガス料金", "京都市上下水道"]),
    ]

    /// Web 版 categoryForMerchant（学習したルール → 決まった店名の表）
    func categoryForMerchant(_ merchant: String, context: String = "") -> String? {
        let key = Self.merchantKey(merchant), ctx = Self.merchantKey(context)
        if key.isEmpty && ctx.isEmpty { return nil }
        let rules: [(String, String)] = (root["merchantRules"]?.objectValue ?? [:]).map { kv in (kv.key, kv.value.stringValue ?? "") }
        let ordered = rules.sorted { a, b in
            let la = a.0.utf16.count, lb = b.0.utf16.count
            return la != lb ? la > lb : a.0 < b.0
        }
        let learned = ordered.first { pair in
            let nk = Self.merchantKey(pair.0)
            return !nk.isEmpty && (key == nk || (nk.utf16.count >= 4 && key.contains(nk)))
        }
        if let l = learned, categories.contains(where: { $0.name == l.1 }) { return l.1 }
        if !key.isEmpty && key.has("amazon|アマゾン|apple|アップル|google|グーグル") { return nil }
        for (cat, keys) in Self.merchantCategoryRules {
            let nks = keys.map { Self.merchantKey($0) }
            if !key.isEmpty && nks.contains(where: { key.contains($0) }) { return cat }
            if !ctx.isEmpty && nks.contains(where: { $0.utf16.count >= 5 && ctx.contains($0) }) { return cat }
        }
        return nil
    }
    /// Web 版 mm3CategoryForStatement
    func categoryForStatement(_ merchant: String, context: String = "") -> (category: String, source: String) {
        if let c = categoryForMerchant(merchant, context: context), categories.contains(where: { $0.name == c }) {
            return (c, root["merchantRules"]?[Self.merchantKey(merchant)]?.stringValue.map { $0.isEmpty ? nil : $0 } != nil ? "rules" : "rule")
        }
        return ("その他", "fallback")
    }
    /// Web 版 mm3FindProviderCard
    func providerCard(_ provider: String) -> Card? {
        let pats = provider == "paypay" ? ["(?i)paypay"] : provider == "smbc" ? ["三井住友", "(?i)smbc", "(?i)vpass"] : []
        return cards.first { c in pats.contains { "\(c.name) \(c.company)".has($0) } }
    }

    // MARK: 読み取り（PayPay CSV / 三井住友カード PDF）

    /// Web 版 parsePayPayStatementCsv
    func parsePayPayStatementCsv(_ text: String, today: String) throws -> ParsedStatement {
        let grid = StatementParser.parseCsv(text)
        guard !grid.isEmpty else { throw StatementError("CSVにデータがありません。") }
        let headers = grid[0].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        let req = ["利用日/キャンセル日", "利用店名・商品名", "支払区分", "当月支払金額", "当月お支払日"]
        if req.contains(where: { !headers.contains($0) }) { throw StatementError("PayPayカードの明細CSVとして認識できませんでした。") }
        func cell(_ cells: [String], _ k: String) -> String { guard let i = headers.firstIndex(of: k), i < cells.count else { return "" }; return cells[i] }
        var out: [StatementRow] = [], occurrence: [String: Int] = [:], paymentDate = ""
        for cells in grid.dropFirst() where cells.contains(where: { !$0.isEmpty }) {
            let rawMerchant = cell(cells, "利用店名・商品名"), merchant = StatementParser.cleanMerchant(rawMerchant)
            let date = StatementParser.slashDate(cell(cells, "利用日/キャンセル日"))
            let originalAmount = StatementParser.number(cell(cells, "利用金額")), currentRaw = StatementParser.number(cell(cells, "当月支払金額"))
            let adjustment = StatementParser.number(cell(cells, "調整額")), fee = StatementParser.number(cell(cells, "手数料")), carryOver = StatementParser.number(cell(cells, "翌月以降繰越金額"))
            let installmentText = cell(cells, "支払区分").precomposedStringWithCompatibilityMapping.trimmingCharacters(in: .whitespacesAndNewlines)
            let pd = StatementParser.slashDate(cell(cells, "当月お支払日"))
            if !pd.isEmpty && paymentDate.isEmpty { paymentDate = pd }
            let im = installmentText.matches(#"(?:均等\s*)?(\d+)\s*[/／]\s*(\d+)"#).first
            let direction = currentRaw + adjustment < 0 ? "refund" : "expense"
            let cat = categoryForStatement(merchant, context: rawMerchant)
            let base = [date, Self.merchantKey(merchant), JSONValue.formatNumber(currentRaw), installmentText].joined(separator: "|")
            let n = (occurrence[base] ?? 0) + 1; occurrence[base] = n
            var o: [String: JSONValue] = [:]
            o["id"] = .string(Self.uid("stmtrow"))
            o["fingerprint"] = .string(StatementParser.stableHash("paypay|\(base)|\(n)"))
            o["transactionDate"] = .string(date.isEmpty ? today : date)
            o["merchant"] = .string(merchant.isEmpty ? "利用先不明" : merchant)
            o["originalMerchant"] = .string(rawMerchant)
            o["originalAmount"] = .number(originalAmount)
            o["currentPaymentAmount"] = .number(currentRaw)
            o["fee"] = .number(fee)
            o["adjustment"] = .number(adjustment)
            o["carryOver"] = .number(carryOver)
            o["installmentText"] = .string(installmentText)
            o["installmentCurrent"] = .number(Double(im.flatMap { Int($0[1] ?? "") } ?? 0))
            o["installmentTotal"] = .number(Double(im.flatMap { Int($0[2] ?? "") } ?? 0))
            o["category"] = .string(cat.category)
            o["categorySource"] = .string(cat.source)
            o["direction"] = .string(direction)
            o["linkedTransactionId"] = .string("")
            o["linkedMailImportId"] = .string("")
            o["reviewStatus"] = .string(cat.source == "fallback" ? "needs_review" : "ready")
            o["included"] = .bool(true)
            o["memo"] = .string("")
            o["paymentMethod"] = .string(cell(cells, "決済方法"))
            o["raw"] = .object(["user": .string(cell(cells, "利用者")), "paymentTotal": .number(StatementParser.number(cell(cells, "支払総額")))])
            out.append(StatementRow(json: .object(o), provider: "paypay"))
        }
        let calculated = out.reduce(0) { $0 + $1.contribution }.rounded(.toNearestOrAwayFromZero)
        return ParsedStatement(provider: "paypay", paymentDate: paymentDate, paymentMonth: String((paymentDate.isEmpty ? today : paymentDate).prefix(7)),
                               officialTotal: calculated, officialTotalSource: "calculated_csv", calculatedTotal: calculated, rows: out)
    }

    /// Web 版 parseSmbcStatementPdf（PDF から取り出した行と全文を受け取る）
    func parseSmbcStatement(lines: [String], text: String, today: String) throws -> ParsedStatement {
        let flat = text.replacing(#"\s+"#, with: " ")
        let dm = flat.matches(#"お支払い日\s*(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日"#).first
        let tm = flat.matches(#"お支払い合計額\s*([\d,]+)円"#).first ?? flat.matches(#"お支払金額総合計[^\d]*([\d,]+)"#).first
        let paymentDate = dm.map { "\($0[1] ?? "")-\(StatementParser.pad(Int($0[2] ?? "") ?? 0))-\(StatementParser.pad(Int($0[3] ?? "") ?? 0))" } ?? ""
        let official = tm.map { StatementParser.number($0[1] ?? "") } ?? 0
        var occurrence: [String: Int] = [:]
        let rows = lines.compactMap { StatementParser.smbcRow($0, occurrence: &occurrence, doc: self) }
        guard !rows.isEmpty else { throw StatementError("三井住友カードPDFの利用明細を読み取れませんでした。") }
        let calculated = rows.reduce(0) { $0 + $1.contribution }.rounded(.toNearestOrAwayFromZero)
        return ParsedStatement(provider: "smbc", paymentDate: paymentDate, paymentMonth: String((paymentDate.isEmpty ? today : paymentDate).prefix(7)),
                               officialTotal: official != 0 ? official : calculated, officialTotalSource: official != 0 ? "pdf_official" : "calculated_pdf",
                               calculatedTotal: calculated, rows: rows)
    }

    // MARK: 重複・照合の候補

    /// Web 版 mm3StatementDuplicateCandidates（スコア 9 以上を最大4件）
    func statementDuplicateCandidates(_ row: StatementRow, cardId: String) -> [(tx: Transaction, score: Int)] {
        let current = abs(row.contribution), original = abs(row.originalAmount)
        let amounts = [current] + (original > 0 && abs(original - current) >= 1 ? [original] : [])
        let key = Self.merchantKey(row.merchant)
        var out: [(tx: Transaction, score: Int, i: Int)] = []
        for (i, t) in transactions.enumerated() {
            var score = 0
            if t.paymentMethod == "card" && t.paymentId == cardId { score += 4 }
            if t.date == row.transactionDate { score += 4 }
            if amounts.contains(where: { abs(abs(t.amount) - $0) < 1 }) { score += 4 }
            let tk = Self.merchantKey(t.merchant)
            if !key.isEmpty && !tk.isEmpty {
                if key == tk { score += 5 } else if key.utf16.count >= 4 && tk.utf16.count >= 4 && (key.contains(tk) || tk.contains(key)) { score += 2 }
            }
            if t.source == "gmail" { score += 1 }
            if score >= 9 { out.append((t, score, i)) }
        }
        return out.sorted { $0.score != $1.score ? $0.score > $1.score : $0.i < $1.i }.prefix(4).map { ($0.tx, $0.score) }
    }
    /// Web 版 mm3RefreshStatementDuplicateFlags
    func refreshDuplicateFlags(_ imp: inout CardStatementImport) {
        for i in imp.rows.indices {
            if !imp.rows[i].linkedTransactionId.isEmpty { imp.rows[i].duplicateCandidateId = ""; imp.rows[i].duplicateScore = 0; continue }
            let c = statementDuplicateCandidates(imp.rows[i], cardId: imp.cardId).first
            imp.rows[i].duplicateCandidateId = c?.tx.id ?? ""; imp.rows[i].duplicateScore = c?.score ?? 0
        }
    }
    /// Web 版 mm3FindMailStatementMatch（メールの取引に合う明細の行）
    func mailStatementMatch(_ mi: JSONValue) -> (importId: String, rowId: String, score: Int, txId: String)? {
        var best: (importId: String, rowId: String, score: Int, txId: String)?
        let amount = abs(num(mi["amount"])), mk = Self.merchantKey(str(mi["merchant"]))
        for imp in cardStatementImports {
            for r in imp.rows where r.included {
                var score = 0
                if str(mi["paymentMethod"]) == "card" && !str(mi["paymentId"]).isEmpty && imp.cardId == str(mi["paymentId"]) { score += 4 }
                if !str(mi["date"]).isEmpty && str(mi["date"]) == r.transactionDate { score += 4 }
                if abs(abs(r.contribution) - amount) < 1 { score += 4 }
                let rk = Self.merchantKey(r.merchant)
                if !mk.isEmpty && !rk.isEmpty {
                    if mk == rk { score += 5 } else if mk.utf16.count >= 4 && rk.utf16.count >= 4 && (mk.contains(rk) || rk.contains(mk)) { score += 2 }
                }
                if score >= 9 && (best == nil || score > best!.score) { best = (imp.id, r.id, score, r.linkedTransactionId) }
            }
        }
        return best
    }

    // MARK: 保存・確定

    /// 読み取った明細を「確認中」として保存する（Web 版 mm3RenderStatementImportPreview の 分類を確認する）
    @discardableResult
    mutating func addStatementImport(_ parsed: ParsedStatement, cardId: String, fileName: String, fileHash: String, now: Date = Date()) throws -> String {
        guard card(cardId) != nil else { throw StatementError("参照先が見つかりません。画面を開き直してください。") }
        var imp = CardStatementImport(json: .object([:]))
        imp.id = Self.uid("stmt", now: now); imp.cardId = cardId; imp.provider = parsed.provider; imp.fileName = fileName; imp.fileHash = fileHash
        imp.paymentMonth = parsed.paymentMonth; imp.paymentDate = parsed.paymentDate; imp.officialTotal = parsed.officialTotal
        imp.officialTotalSource = parsed.officialTotalSource; imp.calculatedTotal = parsed.calculatedTotal; imp.status = "reviewing"
        imp.importedAt = ISODate.now(now); imp.confirmedAt = ""; imp.rows = parsed.rows
        refreshDuplicateFlags(&imp)
        cardStatementImports = cardStatementImports + [imp]
        return imp.id
    }

    mutating func updateStatementRow(_ importId: String, rowId: String, _ edit: (inout StatementRow) -> Void) throws {
        var list = cardStatementImports
        guard let i = list.firstIndex(where: { $0.id == importId }), let j = list[i].rows.firstIndex(where: { $0.id == rowId }) else { throw StatementError("明細が見つかりません") }
        edit(&list[i].rows[j])
        cardStatementImports = list
    }

    /// 明細の行を編集して保存する（Web 版 mm3OpenStatementRowEditor の保存）。店名とカテゴリを学習する
    mutating func saveStatementRow(_ importId: String, rowId: String, merchant: String, date: String, category: String, amount: Double, direction: String,
                                   installmentText: String, memo: String, linkedTransactionId: String) throws {
        let m = merchant.trimmingCharacters(in: .whitespaces).isEmpty ? "利用先不明" : merchant.trimmingCharacters(in: .whitespaces)
        let mailId = linkedTransactionId.isEmpty ? "" : str(transactions.first { $0.id == linkedTransactionId }?.raw["mailImportId"])
        try updateStatementRow(importId, rowId: rowId) { r in
            r.merchant = m; if !date.isEmpty { r.transactionDate = date }; r.category = category
            r.currentPaymentAmount = (direction == "refund" ? -1 : 1) * abs(amount); r.direction = direction
            r.installmentText = installmentText.trimmingCharacters(in: .whitespaces); r.memo = memo.trimmingCharacters(in: .whitespaces)
            r.linkedTransactionId = linkedTransactionId; r.categorySource = "manual"; r.reviewStatus = "ready"
            if !mailId.isEmpty { r.linkedMailImportId = mailId }
        }
        if !category.isEmpty {
            var rules = root["merchantRules"]?.objectValue ?? [:]
            rules[Self.merchantKey(m)] = .string(category)
            self["merchantRules"] = .object(rules)
        }
    }

    /// 返金を記録する（Web 版 recordRefund。金額は負で保存）
    @discardableResult
    mutating func recordRefund(date: String, amount: Double, category: String, merchant: String, paymentMethod: String, paymentId: String,
                               memo: String = "", source: String = "gmail", mailImportId: String = "", linkedBankId: String = "", eventAt: String = "",
                               now: Date = Date(), today: String) -> Transaction? {
        let amount = abs(amount)
        guard amount > 0 else { return nil }
        var t = Transaction(id: Self.uid("tx", now: now))
        t.date = date; t.amount = -amount; t.category = category; t.merchant = merchant
        t.paymentMethod = paymentMethod; t.paymentId = paymentId; t.memo = memo; t.source = source
        t.linkedBankId = linkedBankId.isEmpty ? (paymentMethod == "debit" ? paymentBankId(method: paymentMethod, id: paymentId) : "") : linkedBankId
        t.createdAt = ISODate.now(now)
        if !mailImportId.isEmpty { t.raw = t.raw.merging(.object(["mailImportId": .string(mailImportId)])) }
        if paymentMethod == "bank" || paymentMethod == "debit" { applyBankEffect(&t, eventAt: eventAt, now: now, today: today) }
        var list = transactions; list.append(t); transactions = list
        return t
    }

    /// Web 版 mm3PersistStatementRows（確認済みの行を取引に保存・除外した行の取引を消す）
    @discardableResult
    mutating func persistStatementRows(_ importId: String, now: Date = Date(), today: String) throws -> (saved: Int, removed: Int) {
        guard var imp = statementImport(importId) else { throw StatementError("明細が見つかりません") }
        var saved = 0, removed = 0
        let label = imp.providerLabel
        for i in imp.rows.indices {
            let r = imp.rows[i]
            let existing = !r.linkedTransactionId.isEmpty ? transactions.first { $0.id == r.linkedTransactionId }
                : transactions.first { str($0.raw["statementImportId"]) == imp.id && str($0.raw["statementRowId"]) == r.id }
            let owned = existing.map { $0.source == "card_statement" && str($0.raw["statementImportId"]) == imp.id && str($0.raw["statementRowId"]) == r.id } ?? false
            if !r.included {
                if owned, let e = existing { transactions = transactions.filter { $0.id != e.id }; imp.rows[i].linkedTransactionId = ""; removed += 1 }
                continue
            }
            if r.needsReview { continue }
            var tx = existing
            if tx == nil {
                let memo = r.memo.isEmpty ? "\(label)明細" : r.memo, merchant = r.merchant.isEmpty ? "カード利用" : r.merchant, cat = r.category.isEmpty ? "その他" : r.category
                tx = r.direction == "refund"
                    ? recordRefund(date: r.transactionDate, amount: r.ledgerAmount, category: cat, merchant: merchant, paymentMethod: "card", paymentId: imp.cardId, memo: memo, source: "card_statement", now: now, today: today)
                    : recordExpense(date: r.transactionDate, amount: r.ledgerAmount, category: cat, merchant: merchant, paymentMethod: "card", paymentId: imp.cardId, memo: memo, source: "card_statement", now: now, today: today)
            }
            guard var t = tx else { continue }
            let createdByStatement = t.source == "card_statement" && ((str(t.raw["statementImportId"]) == imp.id && str(t.raw["statementRowId"]) == r.id) || str(t.raw["statementImportId"]).isEmpty)
            if createdByStatement {
                t.date = r.transactionDate; t.amount = (r.direction == "refund" ? -1 : 1) * abs(r.ledgerAmount)
                t.category = r.category.isEmpty ? "その他" : r.category; t.merchant = r.merchant.isEmpty ? "カード利用" : r.merchant
                t.paymentMethod = "card"; t.paymentId = imp.cardId; t.memo = r.memo.isEmpty ? "\(label)明細" : r.memo
                t.bankApplied = false; t.bankReconciled = false
            }
            t.raw = t.raw.merging(.object([
                "statementImportId": .string(imp.id), "statementRowId": .string(r.id), "statementFingerprint": .string(r.fingerprint),
                "statementPaymentMonth": .string(imp.paymentMonth), "statementPaymentDate": .string(imp.paymentDate),
                "statementOriginalAmount": .number(r.originalAmount), "statementCurrentPaymentAmount": .number(r.contribution),
            ]))
            if t.source != "gmail" { t.source = "card_statement" }
            let tid = t.id
            transactions = transactions.map { $0.id == tid ? t : $0 }
            imp.rows[i].linkedTransactionId = tid
            let mailId = str(t.raw["mailImportId"])
            if !mailId.isEmpty {
                imp.rows[i].linkedMailImportId = mailId
                updateMailImport(mailId) { o in o["statementImportId"] = .string(imp.id); o["statementRowId"] = .string(r.id); o["reconciliationStatus"] = .string("matched") }
            }
            saved += 1
        }
        imp.status = imp.status == "confirmed" ? "confirmed" : "reviewing"
        imp.calculatedTotal = imp.total
        let done = imp
        cardStatementImports = cardStatementImports.map { $0.id == done.id ? done : $0 }
        return (saved, removed)
    }

    mutating func updateMailImport(_ id: String, _ edit: (inout [String: JSONValue]) -> Void) {
        guard var list = root["mailImports"]?.arrayValue, let i = list.firstIndex(where: { str($0["id"]) == id }), var o = list[i].objectValue else { return }
        edit(&o); list[i] = .object(o)
        self["mailImports"] = .array(list)
    }

    /// Web 版 statementRecon
    func statementRecon(_ cardId: String, billingMonth: String) -> JSONValue? {
        (root["statementReconciliations"]?.arrayValue ?? []).first { str($0["cardId"]) == cardId && str($0["billingMonth"]) == billingMonth }
    }
    mutating func upsertStatementRecon(_ cardId: String, billingMonth: String, fields: [String: JSONValue], now: Date = Date()) {
        var list = root["statementReconciliations"]?.arrayValue ?? []
        if let i = list.firstIndex(where: { str($0["cardId"]) == cardId && str($0["billingMonth"]) == billingMonth }) {
            list[i] = list[i].merging(.object(fields))
        } else {
            var o: [String: JSONValue] = ["id": .string(Self.uid("recon", now: now))]
            for (k, v) in fields { o[k] = v }
            o["createdAt"] = .string(ISODate.now(now))
            list.append(.object(o))
        }
        self["statementReconciliations"] = .array(list)
    }

    /// 明細の請求月（Web 版 billingMonthForPaymentDate(card, paymentDate || paymentMonth-01)）
    func statementBillingMonth(_ imp: CardStatementImport) -> String {
        billingMonthForPaymentDate(card(imp.cardId), date: imp.paymentDate.isEmpty ? "\(imp.paymentMonth)-01" : imp.paymentDate)
    }

    /// 請求金額を最終確定する（Web 版 mm3OpenStatementFinal の 確定）
    mutating func finalizeStatement(_ importId: String, now: Date = Date(), today: String) throws {
        guard let before = statementImport(importId) else { throw StatementError("明細が見つかりません") }
        let unresolved = before.rows.filter { $0.included && $0.needsReview }.count
        if unresolved > 0 { throw StatementError("\(unresolved)件の分類を確認してから請求金額を最終確定してください。") }
        let calc = before.total, official = before.officialTotal != 0 ? before.officialTotal : calc, diff = official - calc
        let billingMonth = statementBillingMonth(before)
        try persistStatementRows(importId, now: now, today: today)
        guard var imp = statementImport(importId) else { throw StatementError("明細が見つかりません") }
        var seen = Set<String>()
        let linked = imp.rows.filter { $0.included && !$0.linkedTransactionId.isEmpty }.map(\.linkedTransactionId).filter { seen.insert($0).inserted }
        setCardStatement(imp.cardId, billingMonth: billingMonth, amount: official, paymentDate: imp.paymentDate, status: .confirmed,
                         memo: "\(imp.providerLabel)\(imp.provider == "paypay" ? " CSV" : " PDF")明細から最終確定", balanceMode: "keep", now: now, today: today)
        let key = "\(billingMonth)|\(imp.cardId)"
        if var all = root["cardAdjustments"]?.objectValue, let a = all[key] {
            all[key] = a.merging(.object(["confirmedTransactionIds": .array(linked.map { .string($0) }), "statementImportId": .string(imp.id), "statementFileHash": .string(imp.fileHash)]))
            self["cardAdjustments"] = .object(all)
        }
        upsertStatementRecon(imp.cardId, billingMonth: billingMonth, fields: [
            "cardId": .string(imp.cardId), "billingMonth": .string(billingMonth), "confirmedAmount": .number(official),
            "linkedTransactionIds": .array(linked.map { .string($0) }), "status": .string(abs(diff) < 1 ? "matched" : "review"),
            "updatedAt": .string(ISODate.now(now)), "statementImportId": .string(imp.id),
        ], now: now)
        imp.status = "confirmed"; imp.confirmedAt = ISODate.now(now); imp.calculatedTotal = calc
        let done = imp
        cardStatementImports = cardStatementImports.map { $0.id == done.id ? done : $0 }
    }

    /// 確定を解除して編集できる状態に戻す（Web 版 mm3OpenConfirmedStatement の 確定を解除して編集）
    mutating func unlockStatement(_ importId: String, now: Date = Date(), today: String) throws {
        guard var imp = statementImport(importId) else { throw StatementError("明細が見つかりません") }
        let billingMonth = statementBillingMonth(imp)
        if cardAdjustment(imp.cardId, billingMonth: billingMonth)?.status == "paid" { throw StatementError("先にカード詳細の「未払いに戻す」で支払済み状態を解除してから編集してください。") }
        let hadRecon = statementRecon(imp.cardId, billingMonth: billingMonth) != nil
        setCardStatement(imp.cardId, billingMonth: billingMonth, amount: imp.officialTotal != 0 ? imp.officialTotal : imp.calculatedTotal, paymentDate: imp.paymentDate,
                         status: .estimated, memo: "カード明細の確定を解除", balanceMode: "keep", now: now, today: today)
        let key = "\(billingMonth)|\(imp.cardId)"
        if var all = root["cardAdjustments"]?.objectValue, let a = all[key] {
            all[key] = a.merging(.object(["confirmedTransactionIds": .array([]), "statementImportId": .string(""), "statementFileHash": .string("")]))
            self["cardAdjustments"] = .object(all)
        }
        if hadRecon { upsertStatementRecon(imp.cardId, billingMonth: billingMonth, fields: ["status": .string("review"), "updatedAt": .string(ISODate.now(now))], now: now) }
        imp.status = "reviewing"; imp.confirmedAt = ""
        let done = imp
        cardStatementImports = cardStatementImports.map { $0.id == done.id ? done : $0 }
    }

    /// 支払月の取り込み済み明細（新しい順。Web 版 mm3StatementImportSummaryHtml）
    func statementImports(cardId: String, paymentMonth: String) -> [CardStatementImport] {
        cardStatementImports.filter { $0.cardId == cardId && $0.paymentMonth == paymentMonth }.sorted { $0.importedAt > $1.importedAt }
    }

    // MARK: 請求照合センター（Web 版 openStatementReconciliation）

    /// Web 版 statementImportForReconciliation
    func statementImportForReconciliation(cardId: String, paymentMonth: String, billingMonth: String = "") -> CardStatementImport? {
        if !billingMonth.isEmpty, let linked = cardAdjustment(cardId, billingMonth: billingMonth).map({ str($0.raw["statementImportId"]) }), !linked.isEmpty,
           let hit = statementImport(linked) { return hit }
        var list = cardStatementImports.enumerated().filter { $0.element.cardId == cardId && $0.element.paymentMonth == paymentMonth }
        if !billingMonth.isEmpty {
            let exact = list.filter { statementBillingMonth($0.element) == billingMonth }
            if !exact.isEmpty { list = exact }
        }
        return list.sorted { a, b in
            let ac = a.element.status == "confirmed", bc = b.element.status == "confirmed"
            if ac != bc { return ac }
            let at = a.element.confirmedAt.isEmpty ? a.element.importedAt : a.element.confirmedAt, bt = b.element.confirmedAt.isEmpty ? b.element.importedAt : b.element.confirmedAt
            return at != bt ? at > bt : a.offset < b.offset
        }.first?.element
    }
    /// Web 版 statementReconAmountForTransaction
    func statementReconAmount(_ t: Transaction, cardId: String, paymentMonth: String, billingMonth: String) -> Double {
        guard let imp = statementImportForReconciliation(cardId: cardId, paymentMonth: paymentMonth, billingMonth: billingMonth) else { return t.amount }
        let rows = imp.rows.filter { $0.included && $0.linkedTransactionId == t.id }
        return rows.isEmpty ? t.amount : rows.reduce(0) { $0 + $1.contribution }
    }
    /// Web 版 statementReconTransactions
    func statementReconTransactions(cardId: String, billingMonth: String, paymentMonth: String) -> [Transaction] {
        var base = cardTransactions(cardId, billingMonth: billingMonth)
        var ids = Set(base.map(\.id))
        if let imp = statementImportForReconciliation(cardId: cardId, paymentMonth: paymentMonth, billingMonth: billingMonth) {
            for r in imp.rows where r.included && !r.linkedTransactionId.isEmpty && !ids.contains(r.linkedTransactionId) {
                if let t = transactions.first(where: { $0.id == r.linkedTransactionId }) { base.append(t); ids.insert(t.id) }
            }
        }
        return base.enumerated().sorted { $0.element.date != $1.element.date ? $0.element.date < $1.element.date : $0.offset < $1.offset }.map(\.element)
    }
    /// 照合状態を保存する
    mutating func saveStatementRecon(cardId: String, billingMonth: String, confirmed: Double, linkedIds: [String], diff: Double, now: Date = Date()) {
        upsertStatementRecon(cardId, billingMonth: billingMonth, fields: [
            "cardId": .string(cardId), "billingMonth": .string(billingMonth), "confirmedAmount": .number(confirmed),
            "linkedTransactionIds": .array(linkedIds.map { .string($0) }), "status": .string(abs(diff) < 1 ? "matched" : "review"), "updatedAt": .string(ISODate.now(now)),
        ], now: now)
    }
}
