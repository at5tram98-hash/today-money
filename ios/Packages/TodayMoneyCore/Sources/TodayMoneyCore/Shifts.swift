import Foundation

/// シフト1回（取り込み前）
public struct Shift: Equatable, Sendable, Hashable {
    public var date: String
    public var start: String
    public var end: String
    public var title: String
    public var employerId: String
    public init(date: String, start: String, end: String, title: String, employerId: String = "") {
        self.date = date; self.start = start; self.end = end; self.title = title; self.employerId = employerId
    }
}

/// 勤務時間・休憩・深夜（分）
public struct ShiftDuration: Equatable, Sendable {
    public var total: Int
    public var brk: Int
    public var work: Int
    public var night: Int
}

/// 勤務先・勤務月ごとの見込み（Web 版 `shiftEstimate` の1グループ）
public struct ShiftGroup: Equatable, Sendable {
    public struct Item: Equatable, Sendable { public var shift: Shift; public var duration: ShiftDuration; public var pay: Double }
    public var employerId: String
    public var month: String
    public var items: [Item]
    public var minutes: Int
    public var night: Int
    /// 給与（交通費を除く）
    public var gross: Double
    public var transport: Double
    public var transportUncapped: Double?
    public var days: Int
    public var payDate: String
    public var key: String { "\(employerId)|\(month)" }
}

/// シフトボード → iPhone のカレンダー → ショートカットで届いた文字からシフトを読み、給与を計算する（Web 版 shift-import.js・salary-v18.js と同じ規則）
public enum Shifts {
    // MARK: 読み取り

    static func regex(_ p: String) -> NSRegularExpression { try! NSRegularExpression(pattern: p) }
    static let reDateFull = regex(#"(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?"#)
    static let reDateShort = regex(#"(\d{1,2})[/月](\d{1,2})日?"#)
    static let reTime = regex(#"(\d{1,2}):(\d{2})\s*(?:[-〜~ー–—]|から|to)\s*(?:(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\s*)?(\d{1,2}):(\d{2})"#)
    static let reAmPmBefore = regex(#"(午前|午後|AM|PM|am|pm)\s*(\d{1,2}):(\d{2})"#)
    static let reAmPmAfter = regex(#"(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)\b"#)

    static func pad(_ s: String) -> String { s.count < 2 ? "0" + s : s }

    /// 「午後6:00」「6:00 PM」→「18:00」
    static func normAmPm(_ line: String) -> String {
        func to24(_ ap: String, _ h: String, _ m: String) -> String {
            var hh = (Int(h) ?? 0) % 12
            if ap.contains("午後") || ap.lowercased() == "pm" { hh += 12 }
            return "\(hh < 10 ? "0" : "")\(hh):\(m)"
        }
        func replace(_ re: NSRegularExpression, _ s: String, _ f: ([String]) -> String) -> String {
            let ns = s as NSString
            var out = "", last = 0
            for m in re.matches(in: s, range: NSRange(location: 0, length: ns.length)) {
                out += ns.substring(with: NSRange(location: last, length: m.range.location - last))
                let groups = (0..<m.numberOfRanges).map { m.range(at: $0).location == NSNotFound ? "" : ns.substring(with: m.range(at: $0)) }
                out += f(groups)
                last = m.range.location + m.range.length
            }
            return out + ns.substring(from: last)
        }
        let a = replace(reAmPmBefore, line) { to24($0[1], $0[2], $0[3]) }
        return replace(reAmPmAfter, a) { to24($0[3], $0[1], $0[2]) }
    }

    /// 年なしの「12/1」の年：今日から6か月より前の月なら来年（Web 版 `shiftNormDate`）
    static func normDate(_ y: Int, _ m: Int, _ d: Int, today: String) -> String {
        guard m > 0, d > 0, m <= 12, d <= 31 else { return "" }
        var year = y
        if year == 0 {
            let t = Dates.parts(today); year = t.y
            if m < t.m - 6 { year += 1 }
        }
        return "\(year)-\(Dates.pad(m))-\(Dates.pad(d))"
    }

    /// Web 版 `parseShiftText`：1行 =「2026-12-01 10:00-18:00 GU」（JSON の配列も可）
    public static func parse(_ text: String, today: String = Dates.ymd()) -> [Shift] {
        let raw = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.isEmpty { return [] }
        if let j = try? JSONValue.parse(raw), case .array(let a) = j {
            let timeOK = { (s: String) in s.range(of: #"^\d{1,2}:\d{2}$"#, options: .regularExpression) != nil }
            return a.map { x in
                Shift(date: String(str(x["date"]).prefix(10)), start: String(str(x["start"]).prefix(5)), end: String(str(x["end"]).prefix(5)),
                      title: str(x["title"]).trimmingCharacters(in: .whitespacesAndNewlines))
            }.filter { Dates.isYMD($0.date) && timeOK($0.start) && timeOK($0.end) }
        }
        var out: [Shift] = []
        let normalized = raw.precomposedStringWithCompatibilityMapping
        let lines = normalized.replacingOccurrences(of: "\r\n", with: "\n").split(omittingEmptySubsequences: false) { $0 == "\n" || $0 == ";" }
        for l in lines {
            var line = l.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            line = normAmPm(line)
            var ns = line as NSString
            var date = ""
            if let m = reDateFull.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) {
                date = normDate(Int(ns.substring(with: m.range(at: 1))) ?? 0, Int(ns.substring(with: m.range(at: 2))) ?? 0, Int(ns.substring(with: m.range(at: 3))) ?? 0, today: today)
                line = ns.replacingCharacters(in: m.range, with: " "); ns = line as NSString
            } else if let m = reDateShort.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) {
                date = normDate(0, Int(ns.substring(with: m.range(at: 1))) ?? 0, Int(ns.substring(with: m.range(at: 2))) ?? 0, today: today)
                line = ns.replacingCharacters(in: m.range, with: " "); ns = line as NSString
            }
            guard !date.isEmpty, let t = reTime.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) else { continue }
            let g = { (i: Int) in ns.substring(with: t.range(at: i)) }
            let start = "\(pad(g(1))):\(g(2))", end = "\(pad(g(6))):\(g(7))"
            // 終日の予定（休み・希望休など 00:00-00:00）や長さ0の予定は勤務にしない
            if start == end { continue }
            var title = ns.replacingCharacters(in: t.range, with: " ")
            title = title.replacingOccurrences(of: #"[|｜,、]"#, with: " ", options: .regularExpression)
            title = title.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
            out.append(Shift(date: date, start: start, end: end, title: title))
        }
        var seen = Set<String>()
        return out.filter { seen.insert("\($0.date)|\($0.start)|\($0.end)|\($0.title)").inserted }
            .sorted { ($0.date + $0.start) < ($1.date + $1.start) }
    }

    // MARK: 計算

    static func minutes(_ s: String) -> Int {
        let p = s.split(separator: ":").map { Int($0) ?? 0 }
        return (p.first ?? 0) * 60 + (p.count > 1 ? p[1] : 0)
    }

    /// 休憩（分）：勤務先の休憩ルール（例: 4時間以上7時間未満は30分、7時間以上は60分）。なければ 8時間超60分・6時間超45分
    public static func breakMinutes(total: Int, autoBreak: Bool = true, rules: [BreakRule]) -> Int {
        if !rules.isEmpty {
            var best = 0
            for r in rules {
                let from = max(0, r.from), to = r.to ?? Int.max
                if total >= from && total < to { best = max(best, max(0, r.minutes)) }
            }
            return min(best, total)
        }
        return autoBreak ? (total > 480 ? 60 : total > 360 ? 45 : 0) : 0
    }

    /// 勤務時間・深夜（22〜翌5時）。終了が開始より前なら日をまたぐ。休憩は深夜でない時間から先に引く
    public static func duration(start: String, end: String, autoBreak: Bool = true, rules: [BreakRule] = []) -> ShiftDuration {
        let a = minutes(start)
        var b = minutes(end)
        if b <= a { b += 1440 }
        let total = b - a
        var night = 0
        for t in a..<b { let h = (t % 1440) / 60; if h >= 22 || h < 5 { night += 1 } }
        let brk = breakMinutes(total: total, autoBreak: autoBreak, rules: rules)
        let day = max(0, total - night - brk), nightPaid = max(0, night - max(0, brk - (total - night)))
        return ShiftDuration(total: total, brk: brk, work: day + nightPaid, night: nightPaid)
    }

    static func key(_ s: String) -> String {
        s.lowercased().replacingOccurrences(of: #"[\s　・･ー\-_/\\()（）\[\]【】]"#, with: "", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }

    /// 予定名から勤務先（割り当て表 → 名前・別名 → 勤務先が1つだけならそれ）。当てはまらなければ ""。
    /// fallbackFirst = true（貼り付けの取り込み・Web 版 `shiftEmployerFor`）は、当てはまらなければ最初の勤務先
    public static func employerId(for title: String, in doc: MoneyDocument, settings: ShiftSettings, fallbackFirst: Bool = false) -> String {
        let employers = doc.employers
        if let id = settings.titleMap[title], employers.contains(where: { $0.id == id }) { return id }
        let t = key(title)
        if !t.isEmpty, let hit = employers.first(where: { e in ([e.name] + e.aliases).contains { x in let n = key(x); return !n.isEmpty && (t.contains(n) || n.contains(t)) } }) {
            return hit.id
        }
        if fallbackFirst { return employers.first?.id ?? "" }
        return employers.count == 1 ? employers[0].id : ""
    }

    /// 勤務先・勤務月ごとの見込み（交通費は勤務した日数ぶん・月の上限あり）
    public static func estimate(_ shifts: [Shift], in doc: MoneyDocument, settings: ShiftSettings) -> [ShiftGroup] {
        let employers = Dictionary(doc.employers.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var order: [String] = [], groups: [String: ShiftGroup] = [:]
        for x in shifts {
            let empId = x.employerId.isEmpty ? employerId(for: x.title, in: doc, settings: settings, fallbackFirst: true) : x.employerId
            guard let e = employers[empId] else { continue }
            let d = duration(start: x.start, end: x.end, autoBreak: settings.autoBreak, rules: e.breakRules)
            let hourly = max(0, e.hourly)
            let pay = (hourly * Double(d.work) / 60 + hourly * settings.nightRate / 100 * Double(d.night) / 60).rounded(.toNearestOrAwayFromZero)
            let month = Payroll.workMonth(e, date: x.date), k = "\(empId)|\(month)"
            if groups[k] == nil {
                order.append(k)
                groups[k] = ShiftGroup(employerId: empId, month: month, items: [], minutes: 0, night: 0, gross: 0, transport: 0, transportUncapped: nil, days: 0, payDate: "")
            }
            var shift = x; shift.employerId = empId
            groups[k]!.items.append(.init(shift: shift, duration: d, pay: pay))
            groups[k]!.minutes += d.work; groups[k]!.night += d.night; groups[k]!.gross += pay
        }
        var out: [ShiftGroup] = []
        for k in order {
            var g = groups[k]!
            let e = employers[g.employerId]!
            let t = max(0, e.transport), cap = max(0, e.transportCap)
            g.days = Set(g.items.map(\.shift.date)).count
            g.transport = e.transportUnit == "per_shift" ? t * Double(g.days) : t
            if cap > 0 && g.transport > cap { g.transportUncapped = g.transport; g.transport = cap }
            g.payDate = Payroll.payDate(e, workMonth: g.month)
            out.append(g)
        }
        let names = employers.mapValues(\.name)
        return out.sorted { $0.month != $1.month ? $0.month < $1.month : (names[$0.employerId] ?? "").compare(names[$1.employerId] ?? "", locale: Locale(identifier: "ja_JP")) == .orderedAscending }
    }
}
