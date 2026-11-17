import Foundation

// Gmail の金融メール取り込み（Web 版 14-gmail.js・17-acf-refinements.js syncGmail・23-statement-import-and-review.js のメール解析と確認）。
// Gmail API から受け取ったメッセージ（JSON）を読み取り、確認待ちの取り込み記録（data.mailImports）にする。
// Web 版はカテゴリが分からない店名を Wikipedia で調べるが、iOS 版は店名を外部に送らない（ルール表と学習だけで決める）。
// 照合テスト MailCompatTests。

public enum MailParser {
    public static let parserVersion = 8
    public static let scope = "https://www.googleapis.com/auth/gmail.readonly"
    public static let defaultQuery = "newer_than:30d {subject:(ご利用) subject:(利用) subject:(デビット) subject:(カード) subject:(口座振替) subject:(引落) subject:(決済)}"

    /// base64url → UTF-8 文字列（Web 版 decodeBase64UrlUnicode）
    public static func decodeBase64Url(_ v: String) -> String {
        guard !v.isEmpty else { return "" }
        var b = v.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        guard let d = Data(base64Encoded: b) else { return "" }
        return String(decoding: d, as: UTF8.self)
    }
    /// HTML の文字だけ（Web 版 stripHtml：タグを消して文字参照を戻す）
    public static func stripHtml(_ v: String) -> String {
        var s = v.replacing(#"(?is)<(script|style)[^>]*>.*?</\1>"#, with: "").replacing(#"<[^>]+>"#, with: "")
        let named = ["&nbsp;": "\u{00A0}", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'", "&apos;": "'", "&yen;": "¥"]
        for (k, v) in named { s = s.replacingOccurrences(of: k, with: v) }
        for m in s.matches(#"&#(x?)([0-9a-fA-F]+);"#).reversed() {
            guard let whole = m[0], let n = UInt32(m[2] ?? "", radix: (m[1] ?? "").isEmpty ? 10 : 16), let u = Unicode.Scalar(n) else { continue }
            s = s.replacingOccurrences(of: whole, with: String(Character(u)))
        }
        return s.replacingOccurrences(of: "&amp;", with: "&")
    }
    /// 本文（text/plain を優先、なければ HTML の文字。Web 版 gmailMessageText）
    public static func messageText(_ payload: JSONValue?) -> String {
        var plain: [String] = [], html: [String] = []
        func walk(_ p: JSONValue?) {
            guard let p else { return }
            let mime = str(p["mimeType"]).lowercased(), txt = decodeBase64Url(str(p["body"]?["data"]))
            if !txt.isEmpty {
                if mime.contains("text/plain") { plain.append(txt) } else if mime.contains("text/html") { html.append(stripHtml(txt)) }
            }
            for c in p["parts"]?.arrayValue ?? [] { walk(c) }
        }
        walk(payload)
        return (plain.isEmpty ? html : plain).joined(separator: "\n").replacingOccurrences(of: "\r", with: "\n").replacing(#"\n{3,}"#, with: "\n\n")
    }
    public static func headers(_ payload: JSONValue?) -> [String: String] {
        var o: [String: String] = [:]
        for h in payload?["headers"]?.arrayValue ?? [] { o[str(h["name"]).lowercased()] = str(h["value"]) }
        return o
    }
    /// Web 版 detectMailSource
    public static func detectSource(from: String, subject: String, body: String) -> String {
        let t = "\(from)\n\(subject)\n\(body)".lowercased()
        let table: [(String, String)] = [("paypay.*カード|paypay card", "PayPayカード"), ("三井住友カード|vpass|smbc card", "三井住友カード"), ("paypay銀行|paypay bank", "PayPay銀行"),
                                         (#"sbi新生|sbishinsei|新生銀行"#, "SBI新生銀行"), ("ゆうちょ|japan post bank", "ゆうちょ銀行"), (#"三井住友銀行|smbc\.co\.jp"#, "三井住友銀行"), ("楽天カード", "楽天カード"), ("jcb", "JCB")]
        for (re, name) in table where t.has(re) { return name }
        let m = from.matches(#"^\s*"?([^"<]+?)"?\s*<"#).first?[1]
        return StatementParser.utf16Prefix((m ?? (from.isEmpty ? "Gmail" : from)).trimmingCharacters(in: .whitespacesAndNewlines), 40)
    }
    /// Web 版 detectTransactionType
    public static func detectType(subject: String, body: String, source: String) -> String {
        let t = "\(subject)\n\(body)".lowercased()
        if t.has("返金|取消|取り消し|キャンセル|refund") { return "refund" }
        if t.has("請求額確定|ご請求額|請求金額のお知らせ|お支払い金額のお知らせ") && t.has("カード|vpass|paypay") { return "card_statement" }
        if t.has("デビット|debit") { return "debit_card" }
        if t.has("cl利用|カード利用|カードご利用|ご利用のお知らせ|利用速報|利用通知|クレジット") { return "credit_card" }
        if t.has("口座振替|口座引落|口座引き落とし|自動引落|引落し|引き落とし|引落") { return "bank_debit" }
        if source.has("カード") && t.has("利用|決済") { return "credit_card" }
        return "unknown"
    }
    /// Web 版 extractAmount
    public static func extractAmount(_ text: String) -> Double? {
        let t = text.replacingOccurrences(of: "，", with: ",").replacingOccurrences(of: "￥", with: "¥")
        let pats = [#"(?i)(?:ご利用金額|利用金額|ご利用額|決済金額|お支払い金額|引落金額|引き落とし金額|口座振替額|金額)\s*[：:]?\s*(?:¥\s*)?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,8})\s*円?"#,
                    #"(?i)(?:¥|JPY\s*)([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,8})"#, #"([0-9]{1,3}(?:,[0-9]{3})+)\s*円"#, #"([0-9]{1,8})\s*円"#]
        for p in pats {
            if let m = t.matches(p).first, let n = Double((m[1] ?? "").replacingOccurrences(of: ",", with: "")), n > 0 && n < 100_000_000 { return n.rounded(.toNearestOrAwayFromZero) }
        }
        return nil
    }
    /// Web 版 cleanMerchant
    public static func cleanMerchant(_ v: String) -> String {
        let s = v.replacing(#"[\t ]+"#, with: " ").replacing(#"[｜|].*$"#, with: "").replacing(#"^(?:名称|店舗|加盟店)\s*[：:]?"#, with: "").trimmingCharacters(in: .whitespacesAndNewlines)
        return StatementParser.utf16Prefix(s, 80)
    }
    /// Web 版 extractMerchant
    public static func extractMerchant(subject: String, body: String) -> String {
        let t = body.replacingOccurrences(of: "\r", with: "")
        let label = "(?:ご利用先|利用先|ご利用店|利用店舗|加盟店名?|店舗名|ご利用内容|お取引内容|摘要|明細)"
        for p in ["(?i)\(label)\\s*[：:]\\s*([^\\n]{2,100})", "(?i)\(label)\\s+([^\\n]{2,100})"] {
            if let m = t.matches(p).first {
                let v = cleanMerchant(m[1] ?? "")
                if !v.isEmpty && !v.has("金額|日時|日付") { return v }
            }
        }
        if let m = subject.matches(#"[「【\[]([^」】\]]{2,60})[」】\]]"#).first { return cleanMerchant(m[1] ?? "") }
        return ""
    }
    static func validYmd(_ y: Int, _ m: Int, _ d: Int) -> String? {
        guard (2000...2100).contains(y), (1...12).contains(m), (1...31).contains(d) else { return nil }
        let s = "\(y)-\(StatementParser.pad(m))-\(StatementParser.pad(d))"
        let c = Calendar(identifier: .gregorian).dateComponents([.year, .month, .day], from: Dates.date(s))
        return c.year == y && c.month == m && c.day == d ? s : nil
    }
    /// メールの基準日時（Date ヘッダー → internalDate → 今）
    public static func referenceDate(_ msg: JSONValue, headers: [String: String], now: Date = Date()) -> Date {
        if let d = headers["date"], let v = parseMailDate(d) { return v }
        if let ms = optNum(msg["internalDate"]) { return Date(timeIntervalSince1970: ms / 1000) }
        return now
    }
    static func parseMailDate(_ s: String) -> Date? {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        let clean = s.replacing(#"\s*\([^)]*\)\s*$"#, with: "").trimmingCharacters(in: .whitespaces)
        for fmt in ["EEE, d MMM yyyy HH:mm:ss Z", "d MMM yyyy HH:mm:ss Z", "EEE, d MMM yyyy HH:mm Z", "EEE, d MMM yyyy HH:mm:ss zzz"] {
            f.dateFormat = fmt
            if let d = f.date(from: clean) { return d }
        }
        return ISODate.ms(clean).map { Date(timeIntervalSince1970: $0 / 1000) }
    }
    static func inferYear(month: Int, day: Int, ref: Date) -> String? {
        let y0 = Calendar(identifier: .gregorian).component(.year, from: ref)
        var best: String?, diff = Double.infinity
        for y in [y0 - 1, y0, y0 + 1] {
            guard let ds = validYmd(y, month, day) else { continue }
            let dd = abs(Dates.date(ds).timeIntervalSince(ref))
            if dd < diff { best = ds; diff = dd }
        }
        return best
    }
    /// Web 版 extractTransactionDate
    public static func extractDate(subject: String, body: String, ref: Date) -> String {
        let text = "\(subject)\n\(body)".replacingOccurrences(of: "\r", with: "")
        let labels = "(?:ご利用日時|利用日時|ご利用日|利用日|決済日時|決済日|取引日時|取引日|お取引日|購入日時|購入日)"
        if let m = text.matches("(?i)\(labels)\\s*[：:]?\\s*(20\\d{2})[年/.\\-](\\d{1,2})[月/.\\-](\\d{1,2})(?:日)?").first,
           let ds = validYmd(Int(m[1] ?? "") ?? 0, Int(m[2] ?? "") ?? 0, Int(m[3] ?? "") ?? 0) { return ds }
        if let m = text.matches("(?i)\(labels)\\s*[：:]?\\s*(\\d{1,2})[月/.\\-](\\d{1,2})(?:日)?").first,
           let ds = inferYear(month: Int(m[1] ?? "") ?? 0, day: Int(m[2] ?? "") ?? 0, ref: ref) { return ds }
        if let m = text.matches(#"(?i)(20\d{2})[/.\-](\d{1,2})[/.\-](\d{1,2})[^\n]{0,28}(?:ご利用|利用|決済|取引)"#).first,
           let ds = validYmd(Int(m[1] ?? "") ?? 0, Int(m[2] ?? "") ?? 0, Int(m[3] ?? "") ?? 0) { return ds }
        return Dates.ymd(ref)
    }
}

/// 確認画面での確度（Web 版 mailReviewConfidence）
public struct MailConfidence: Equatable, Sendable { public var label: String; public var good: Bool; public var ready: Bool }

/// 履歴での状態（Web 版 mm3MailHistoryStatus）
public struct MailHistoryStatus: Equatable, Sendable {
    /// imported / ignored / info / pending
    public var key: String
    public var label: String
    public var note: String
    public var linked = false
    public var duplicate = false
}

public extension MoneyDocument {
    var mailImports: [JSONValue] { root["mailImports"]?.arrayValue ?? [] }
    func mailImport(_ id: String) -> JSONValue? { mailImports.first { str($0["id"]) == id } }
    var gmailSettings: [String: JSONValue] { root["gmailSettings"]?.objectValue ?? [:] }
    var gmailQuery: String { str(gmailSettings["query"]).trimmingCharacters(in: .whitespaces).isEmpty ? MailParser.defaultQuery : str(gmailSettings["query"]) }
    var gmailSourceIds: [String] { (gmailSettings["sourceIds"]?.arrayValue ?? []).map { str($0) } }

    mutating func setGmailSettings(_ edit: (inout [String: JSONValue]) -> Void) {
        var o = gmailSettings
        edit(&o)
        self["gmailSettings"] = .object(o)
    }

    /// Web 版 matchFinancialEntity（取得元の名前から口座・カード・デビットを探す）
    func matchFinancialEntity(_ source: String, type: String) -> (method: String, id: String, linkedBankId: String) {
        let key = Self.merchantKey(source)
        func near(_ v: String) -> Bool { let n = Self.merchantKey(v); return !n.isEmpty && !key.isEmpty && (n.contains(key) || key.contains(n)) }
        if type == "debit_card" {
            var d = debitCards.first { near($0.name) }
            if d == nil && source.has("(?i)三井住友|smbc|vpass|olive") {
                d = debitCards.first { $0.name.has("(?i)olive") } ?? debitCards.first { (bank($0.bankId)?.name ?? "").has("三井住友") }
            }
            return ("debit", d?.id ?? "", d?.bankId ?? "")
        }
        if type == "credit_card" {
            let c = cards.first { near($0.name) || near($0.company) }
            return ("card", c?.id ?? "", "")
        }
        let b = banks.first { near($0.name) }
        return ("bank", b?.id ?? "", b?.id ?? "")
    }

    /// Web 版 parseFinancialMessage（基本の読み取り）。金融メールでなければ nil
    func parseFinancialMessageBase(_ msg: JSONValue, now: Date = Date()) -> [String: JSONValue]? {
        let h = MailParser.headers(msg["payload"]), subject = h["subject"] ?? "", from = h["from"] ?? ""
        let body = MailParser.messageText(msg["payload"])
        let source = MailParser.detectSource(from: from, subject: subject, body: body)
        let type0 = MailParser.detectType(subject: subject, body: body, source: source)
        let combined = "\(subject)\n\(body)"
        let amount = MailParser.extractAmount(combined)
        let ref = MailParser.referenceDate(msg, headers: h, now: now)
        let date = MailParser.extractDate(subject: subject, body: body, ref: ref)
        var o: [String: JSONValue] = [:]
        o["id"] = .string(Self.uid("mail", now: now)); o["emailId"] = .string(str(msg["id"])); o["threadId"] = .string(str(msg["threadId"]))
        o["date"] = .string(date); o["receivedAt"] = .string(ISODate.now(ref)); o["from"] = .string(from); o["subject"] = .string(subject); o["sourceName"] = .string(source)
        o["createdAt"] = .string(ISODate.now(now)); o["transactionId"] = .string(""); o["bankApplied"] = .bool(false); o["bankReconciled"] = .bool(false)
        o["parserVersion"] = .number(Double(MailParser.parserVersion))
        if source == "三井住友カード" && !((amount ?? 0) > 0) {
            o["type"] = .string(type0); o["amount"] = .number(0); o["merchant"] = .string(""); o["category"] = .string(""); o["categorySource"] = .string("")
            o["status"] = .string("ignored"); o["direction"] = .string("expense"); o["paymentMethod"] = .string("card"); o["paymentId"] = .string("")
            o["excludedByUser"] = .bool(false); o["ignoredReason"] = .string("三井住友カード金額なし")
            return o
        }
        let financeWords = "(?i)利用|決済|デビット|クレジット|カード|口座振替|引落|引き落とし|支払い|返金|取消|請求|cl利用"
        if type0 == "unknown" && !combined.has(financeWords) { return nil }
        if amount == nil && type0 == "unknown" { return nil }
        let merchant = MailParser.extractMerchant(subject: subject, body: body)
        var type = type0
        if type == "bank_debit" && !merchant.isEmpty && merchant.has("(?i)カード|vpass|paypayカード|visa.*カード") { type = "card_settlement" }
        let category = categoryForMerchant(merchant, context: combined)
        let entity = matchFinancialEntity(source, type: type), selected = gmailSourceIds
        let excluded = !selected.isEmpty && (entity.id.isEmpty || !selected.contains(entity.id))
        let ignored = type == "card_statement" || type == "card_settlement" || excluded
        o["type"] = .string(type); o["amount"] = .number(amount ?? 0); o["merchant"] = .string(merchant); o["category"] = .string(category ?? "")
        o["categorySource"] = .string(category == nil ? "" : "rules")
        o["status"] = .string(ignored ? "ignored" : ((amount ?? 0) > 0 && category != nil && !merchant.isEmpty ? "imported" : "pending"))
        o["direction"] = .string(type == "refund" ? "refund" : "expense"); o["paymentMethod"] = .string(entity.method); o["paymentId"] = .string(entity.id)
        o["linkedBankId"] = .string(entity.linkedBankId); o["excludedByUser"] = .bool(excluded)
        return o
    }

    /// Web 版 parseFinancialMessage（カード会社・銀行ごとの読み分けを含む）
    func parseFinancialMessage(_ msg: JSONValue, now: Date = Date()) -> [String: JSONValue]? {
        let h = MailParser.headers(msg["payload"]), subject = h["subject"] ?? "", from = h["from"] ?? ""
        let body = MailParser.messageText(msg["payload"]), source = MailParser.detectSource(from: from, subject: subject, body: body)
        let ctxType = MailParser.detectType(subject: subject, body: body, source: source)
        let combined = "\(subject)\n\(body)".precomposedStringWithCompatibilityMapping
        let probe = "\(source) \(from) \(subject)".lowercased()
        guard var mi = parseFinancialMessageBase(msg, now: now) else { return nil }
        func refundIf(_ re: String) { if combined.has(re) && num(mi["amount"]) > 0 { mi["direction"] = .string("refund"); mi["type"] = .string("refund") } }
        func ignore(_ type: String, _ reason: String) { mi["type"] = .string(type); mi["status"] = .string("ignored"); mi["ignoredReason"] = .string(reason) }
        let strategy: String
        if probe.has("paypay") && "\(probe) \(body.lowercased())".has("カード|card|クレジット") {
            strategy = "paypay"; mi["sourceName"] = .string("PayPayカード")
            refundIf("返金|取消|キャンセル|取り消し")
            if combined.has("請求(?:額|金額)|お支払(?:い)?(?:金額|予定)|ご請求") && !combined.has("ご利用(?:金額|のお知らせ)|利用速報") { ignore("card_statement", "カード請求確定通知（支出としては登録しない）") }
        } else if probe.has("三井住友カード|smbc|vpass") {
            strategy = "smbc"; mi["sourceName"] = .string("三井住友カード")
            refundIf("返品|返金|取消|キャンセル")
            if combined.has("お支払い金額|ご請求金額|請求額(?:が)?確定|お支払日") && !combined.has("ご利用のお知らせ|利用速報") { ignore("card_statement", "カード請求確定通知（支出としては登録しない）") }
        } else if probe.has("銀行|bank|ゆうちょ|新生|olive") || ctxType == "bank_debit" {
            strategy = "bank"
            if str(mi["type"]) == "bank_debit" && combined.has("カード|Vpass|PayPayカード|VISA|三井住友") { ignore("card_settlement", "カード代金の口座引落通知（個別支出としては登録しない）") }
        } else { strategy = "generic" }
        mi["parserStrategy"] = .string(strategy); mi["parserVersion"] = .number(Double(MailParser.parserVersion))
        let t = str(mi["type"])
        mi["mailRole"] = .string(t == "card_statement" ? "statement_confirmation" : t == "card_settlement" ? "card_settlement" : t == "refund" ? "refund" : "transaction")
        mi["rawSourceHint"] = .string(source.isEmpty ? str(mi["sourceName"]) : source)
        return mi
    }

    // MARK: 確認

    static func mailConfidence(_ mi: JSONValue) -> MailConfidence {
        var missing: [String] = []
        if !(num(mi["amount"]) > 0) { missing.append("金額") }
        if str(mi["merchant"]).trimmingCharacters(in: .whitespaces).isEmpty { missing.append("利用先") }
        if str(mi["category"]).trimmingCharacters(in: .whitespaces).isEmpty { missing.append("カテゴリ") }
        if !missing.isEmpty { return MailConfidence(label: "\(missing.joined(separator: "・"))要確認", good: false, ready: false) }
        if ["manual", "rules"].contains(str(mi["categorySource"])) { return MailConfidence(label: "高い確度", good: true, ready: true) }
        return MailConfidence(label: "確認推奨", good: false, ready: true)
    }
    /// Web 版 prepareMailForReview
    static func prepareForReview(_ mi: inout [String: JSONValue]) {
        guard str(mi["status"]) != "ignored" else { return }
        mi["status"] = .string("pending"); mi["transactionId"] = .string(""); mi["bankApplied"] = .bool(false); mi["bankReconciled"] = .bool(false)
        mi["userResolved"] = .bool(false); mi["reviewPending"] = .bool(true); mi["reviewConfidence"] = .string(mailConfidence(.object(mi)).label)
    }
    static func mailInfoOnly(_ mi: JSONValue) -> Bool {
        ["card_statement", "card_settlement"].contains(str(mi["type"])) || ["statement_confirmation", "card_settlement"].contains(str(mi["mailRole"]))
    }
    /// Web 版 mm3MailUiMatch（既存の取引・カード明細と同じものか）
    func mailUiMatch(_ mi: JSONValue) -> (tx: Transaction?, statementRow: String?, linked: Bool, exact: Bool)? {
        let amount = abs(num(mi["amount"])), merchant = Self.merchantKey(str(mi["merchant"]))
        func exact(_ t: Transaction?) -> Bool {
            guard let t, amount > 0, !merchant.isEmpty else { return false }
            return t.date == str(mi["date"]) && abs(abs(t.amount) - amount) < 1 && Self.merchantKey(t.merchant) == merchant
                && t.paymentMethod == str(mi["paymentMethod"]) && t.paymentId == str(mi["paymentId"]) && (t.amount < 0) == (str(mi["direction"]) == "refund")
        }
        let exacts = transactions.filter { exact($0) }, hit = mailStatementMatch(mi)
        let id = str(mi["id"]), tid = str(mi["transactionId"]), cand = str(mi["linkedTransactionIdCandidate"])
        if let direct = transactions.first(where: { (!tid.isEmpty && $0.id == tid) || (!id.isEmpty && str($0.raw["mailImportId"]) == id) || (!cand.isEmpty && $0.id == cand) }) {
            return (direct, hit?.rowId, direct.id == tid || str(direct.raw["mailImportId"]) == id, exact(direct) && exacts.count == 1)
        }
        if let hit {
            let tx = hit.txId.isEmpty ? nil : transactions.first { $0.id == hit.txId }
            return (tx, hit.rowId, false, exact(tx) && exacts.count == 1)
        }
        return exacts.isEmpty ? nil : (exacts[0], nil, false, exacts.count == 1)
    }
    func mailHistoryStatus(_ mi: JSONValue) -> MailHistoryStatus {
        if str(mi["status"]) == "imported" {
            return MailHistoryStatus(key: "imported", label: "反映済み", note: "家計取引に反映済み。",
                                     linked: !str(mi["statementImportId"]).isEmpty || !str(mi["statementRowId"]).isEmpty || str(mi["reconciliationStatus"]) == "matched",
                                     duplicate: str(mi["reconciliationStatus"]) == "duplicate_candidate")
        }
        if mi["excludedByUser"]?.boolValue == true { return MailHistoryStatus(key: "ignored", label: "対象外", note: "ユーザーが取引対象外に設定しました。") }
        if Self.mailInfoOnly(mi) { return MailHistoryStatus(key: "info", label: "情報のみ", note: "家計取引として登録されません。") }
        if str(mi["status"]) == "ignored" { return MailHistoryStatus(key: "ignored", label: "対象外", note: str(mi["ignoredReason"]).isEmpty ? "取引対象外のメールです。" : str(mi["ignoredReason"])) }
        let dup = mailUiMatch(mi) != nil || str(mi["reconciliationStatus"]) == "duplicate_candidate"
        return MailHistoryStatus(key: "pending", label: "確認待ち", note: "まだ家計には反映されていません。", duplicate: dup)
    }
    var pendingMailIds: [String] { mailImports.filter { str($0["status"]) == "pending" && mailHistoryStatus($0).key == "pending" }.map { str($0["id"]) } }

    // MARK: 同期の結果をまとめる（Web 版 syncGmail の safeCommit 部分）

    /// Gmail のメッセージ ID のうち、まだ読んでいない・読み方が古いもの（最大200件）
    func mailIdsToFetch(_ ids: [String]) -> [String] {
        let byEmail = Dictionary(mailImports.map { (str($0["emailId"]), $0) }, uniquingKeysWith: { a, _ in a })
        return Array(ids.filter { id in byEmail[id].map { num($0["parserVersion"]) < Double(MailParser.parserVersion) } ?? true }.prefix(200))
    }

    /// 取得したメッセージを取り込み記録にまとめる。確認待ちになった ID を返す
    @discardableResult
    mutating func applySyncedMessages(_ messages: [JSONValue], failed: Int = 0, now: Date = Date()) -> (added: Int, reparsed: Int, reviewIds: [String]) {
        var list = mailImports.map { $0.objectValue ?? [:] }
        var index = [String: Int]()
        for (i, o) in list.enumerated() where index[str(o["emailId"])] == nil { index[str(o["emailId"])] = i }
        var added = 0, reparsed = 0, reviewIds: [String] = []
        for msg in messages {
            let emailId = str(msg["id"]), parsed = parseFinancialMessage(msg, now: now)
            guard let i = index[emailId] else {
                if var p = parsed {
                    if str(p["status"]) != "ignored" { Self.prepareForReview(&p); reviewIds.append(str(p["id"])) }
                    list.append(p); index[emailId] = list.count - 1; added += 1
                }
                continue
            }
            var old = list[i]
            if old["userResolved"]?.boolValue == true || !str(old["transactionId"]).isEmpty {
                if let p = parsed { old["date"] = p["date"]; old["receivedAt"] = p["receivedAt"]; old["parserVersion"] = .number(Double(MailParser.parserVersion)) }
                list[i] = old; reparsed += 1; continue
            }
            guard let p = parsed else {
                old["status"] = .string("ignored"); old["parserVersion"] = .number(Double(MailParser.parserVersion)); old["ignoredReason"] = .string("金融取引対象外")
                old["transactionId"] = .string(""); old["bankApplied"] = .bool(false); old["bankReconciled"] = .bool(false); old["reviewPending"] = .bool(false)
                list[i] = old; reparsed += 1; continue
            }
            let keepId = old["id"] ?? .string(""), keepCreated = str(old["createdAt"]).isEmpty ? p["createdAt"] : old["createdAt"]
            for (k, v) in p { old[k] = v }
            old["id"] = keepId; old["createdAt"] = keepCreated; old["transactionId"] = .string("")
            if str(old["status"]) != "ignored" { Self.prepareForReview(&old); reviewIds.append(str(old["id"])) }
            list[i] = old; reparsed += 1
        }
        self["mailImports"] = .array(list.map { .object($0) })
        setGmailSettings { s in
            s["lastSyncAt"] = .string(ISODate.now(now))
            s["lastError"] = .string(failed > 0 ? "\(failed)件のメールを取得できませんでした（次回の同期で取り直します）" : "")
            s["lastErrorAt"] = .string(failed > 0 ? ISODate.now(now) : "")
        }
        return (added, reparsed, reviewIds)
    }

    // MARK: 反映

    func validPayment(method: String, id: String) -> Bool {
        switch method {
        case "bank": return bank(id) != nil
        case "card": return card(id) != nil
        case "debit": return debit(id) != nil
        default: return true
        }
    }

    /// Web 版 importMailToLedger（取引を作る。すでにあればそれを返す）
    @discardableResult
    mutating func importMailToLedger(_ mailId: String, now: Date = Date(), today: String) -> Transaction? {
        guard let mi = mailImport(mailId), str(mi["status"]) == "imported", num(mi["amount"]) > 0, !str(mi["category"]).isEmpty else { return nil }
        let tid = str(mi["transactionId"])
        if let existing = transactions.first(where: { str($0.raw["mailImportId"]) == mailId }) ?? (tid.isEmpty ? nil : transactions.first { $0.id == tid }) {
            let eb = transactionBankId(existing)
            updateMailImport(mailId) { o in
                o["transactionId"] = .string(existing.id); o["linkedBankId"] = .string(eb)
                o["bankApplied"] = .bool(existing.bankApplied); o["bankReconciled"] = .bool(existing.bankReconciled)
            }
            return existing
        }
        let merchant = str(mi["merchant"]).isEmpty ? str(mi["sourceName"]) : str(mi["merchant"])
        let eventAt = str(mi["receivedAt"]).isEmpty ? "\(str(mi["date"]))T12:00:00" : str(mi["receivedAt"])
        var tx: Transaction?
        if str(mi["direction"]) == "refund" {
            tx = recordRefund(date: str(mi["date"]), amount: num(mi["amount"]), category: str(mi["category"]), merchant: merchant, paymentMethod: str(mi["paymentMethod"]),
                              paymentId: str(mi["paymentId"]), memo: str(mi["memo"]), source: "gmail", mailImportId: mailId, linkedBankId: str(mi["linkedBankId"]), eventAt: eventAt, now: now, today: today)
        } else if var t = recordExpense(date: str(mi["date"]), amount: num(mi["amount"]), category: str(mi["category"]), merchant: merchant, paymentMethod: str(mi["paymentMethod"]),
                                         paymentId: str(mi["paymentId"]), memo: str(mi["memo"]), source: "gmail", linkedBankId: str(mi["linkedBankId"]), eventAt: eventAt, now: now, today: today) {
            t.raw = t.raw.merging(.object(["mailImportId": .string(mailId)]))
            let id = t.id
            transactions = transactions.map { $0.id == id ? t : $0 }
            tx = t
        }
        let t = tx, tb = tx.map { transactionBankId($0) } ?? ""
        updateMailImport(mailId) { o in
            o["transactionId"] = .string(t?.id ?? ""); o["linkedBankId"] = .string(tb)
            o["bankApplied"] = .bool(t?.bankApplied ?? false); o["bankReconciled"] = .bool(t?.bankReconciled ?? false)
        }
        return tx
    }

    /// Web 版 mm3ApplyMailItems（確認待ちのメールを家計に反映する）。反映した件数
    @discardableResult
    mutating func applyMailItems(_ ids: [String], now: Date = Date(), today: String) throws -> Int {
        var count = 0
        for id in ids {
            guard let mi = mailImport(id), str(mi["status"]) == "pending", Self.mailConfidence(mi).ready else { continue }
            guard validPayment(method: str(mi["paymentMethod"]), id: str(mi["paymentId"])) else { throw StatementError("支払い方法の参照先が存在しません。選び直してください。") }
            let cand = str(mi["linkedTransactionIdCandidate"])
            if !cand.isEmpty, let tx = transactions.first(where: { $0.id == cand }) {
                var t = tx
                if str(t.raw["mailImportId"]).isEmpty { t.raw = t.raw.merging(.object(["mailImportId": .string(id)])); transactions = transactions.map { $0.id == t.id ? t : $0 } }
                let hit = mailStatementMatch(mi)
                updateMailImport(id) { o in
                    o["status"] = .string("imported"); o["userResolved"] = .bool(true); o["reviewPending"] = .bool(false); o["transactionId"] = .string(tx.id)
                    o["reconciliationStatus"] = .string("matched")
                    if let hit { o["statementImportId"] = .string(hit.importId); o["statementRowId"] = .string(hit.rowId) }
                }
                if let hit { try? updateStatementRow(hit.importId, rowId: hit.rowId) { $0.linkedMailImportId = id } }
                count += 1; continue
            }
            updateMailImport(id) { o in
                o["status"] = .string("imported"); o["userResolved"] = .bool(true); o["reviewPending"] = .bool(false)
                if str(o["categorySource"]).isEmpty { o["categorySource"] = .string("manual") }
            }
            if !str(mi["merchant"]).isEmpty && !str(mi["category"]).isEmpty {
                var rules = root["merchantRules"]?.objectValue ?? [:]
                rules[Self.merchantKey(str(mi["merchant"]))] = .string(str(mi["category"]))
                self["merchantRules"] = .object(rules)
            }
            let tx = importMailToLedger(id, now: now, today: today)
            if tx != nil, mailStatementMatch(mailImport(id) ?? mi) != nil { updateMailImport(id) { $0["reconciliationStatus"] = .string("duplicate_candidate") } }
            count += 1
        }
        return count
    }

    /// 確認画面で直した内容で反映する（Web 版 mm3OpenMailEditor の commit）。link が true なら既存取引に紐づける
    mutating func resolveMail(_ id: String, merchant: String, amount: Double, date: String, category: String, paymentMethod: String, paymentId: String,
                              direction: String, memo: String, link: Bool, now: Date = Date(), today: String) throws {
        guard let cur = mailImport(id), str(cur["status"]) == "pending", !Self.mailInfoOnly(cur), cur["excludedByUser"]?.boolValue != true else {
            throw StatementError("このメールは確認待ちではありません。")
        }
        guard !merchant.isEmpty, amount > 0, Dates.isYMD(date) else { throw StatementError("利用先・金額・日付を確認してください。") }
        guard validPayment(method: paymentMethod, id: paymentId) else { throw StatementError("支払い方法の参照先が存在しません。選び直してください。") }
        var next = cur.objectValue ?? [:]
        next["merchant"] = .string(merchant); next["amount"] = .number(max(0, amount)); next["date"] = .string(date); next["category"] = .string(category)
        next["paymentMethod"] = .string(paymentMethod); next["paymentId"] = .string(paymentId)
        next["linkedBankId"] = .string(paymentMethod == "debit" ? (debit(paymentId)?.bankId ?? "") : paymentMethod == "bank" ? paymentId : "")
        next["direction"] = .string(direction); next["memo"] = .string(memo); next["categorySource"] = .string("manual"); next["paymentManuallySelected"] = .bool(true)
        guard Self.mailConfidence(.object(next)).ready else { throw StatementError("入力内容を確認してください。") }
        let match = mailUiMatch(.object(next))
        if link {
            guard let tx = match?.tx else { throw StatementError("照合候補が変更されました。内容を確認してください。") }
            next["linkedTransactionIdCandidate"] = .string(tx.id)
        } else if match != nil || str(next["reconciliationStatus"]) == "duplicate_candidate" {
            throw StatementError("重複候補があります。既存取引との紐づけを確認してください。")
        }
        let n = next
        updateMailImport(id) { $0 = n }
        if try applyMailItems([id], now: now, today: today) != 1 { throw StatementError("取引を反映できませんでした。") }
    }

    /// 取得元の選択を変えた時、手で決めていないメールを次の同期で読み直す（Web 版 mailEntityLocked / parserVersion=0）
    mutating func resetMailParserVersions() {
        let locked = Set(transactions.compactMap { str($0.raw["mailImportId"]).isEmpty ? nil : str($0.raw["mailImportId"]) })
        var list = mailImports.map { $0.objectValue ?? [:] }
        for i in list.indices {
            let o = list[i]
            let isLocked = o["userResolved"]?.boolValue == true || o["paymentManuallySelected"]?.boolValue == true || str(o["categorySource"]) == "manual"
                || !str(o["transactionId"]).isEmpty || o["bankApplied"]?.boolValue == true || o["bankReconciled"]?.boolValue == true
                || !str(o["statementImportId"]).isEmpty || !str(o["linkedTransactionIdCandidate"]).isEmpty || str(o["status"]) == "imported" || locked.contains(str(o["id"]))
            if !isLocked { list[i]["parserVersion"] = .number(0) }
        }
        self["mailImports"] = .array(list.map { .object($0) })
    }

    /// 対象外にする（Web 版 mailEditIgnore）
    mutating func ignoreMail(_ id: String) throws {
        guard let cur = mailImport(id), str(cur["status"]) == "pending", str(cur["transactionId"]).isEmpty else { throw StatementError("このメールの状態が変更されています。") }
        updateMailImport(id) { o in
            o["status"] = .string("ignored"); o["excludedByUser"] = .bool(true); o["ignoredReason"] = .string("ユーザーが対象外に設定")
            o["reviewPending"] = .bool(false); o["userResolved"] = .bool(true)
        }
    }
}
