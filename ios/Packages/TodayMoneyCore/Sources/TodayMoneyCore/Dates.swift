import Foundation

/// Web 版と同じ「YYYY-MM-DD」「YYYY-MM」の文字列で日付を扱う（保存値をそのまま使い、時差で日付がずれないようにする）。
/// 計算はグレゴリオ暦・東京時間で行う。
public enum Dates {
    public static let calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        c.locale = Locale(identifier: "ja_JP")
        return c
    }()

    static func pad(_ n: Int) -> String { n < 10 ? "0\(n)" : "\(n)" }

    /// 今日（東京）の YYYY-MM-DD
    public static func ymd(_ date: Date = Date()) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return "\(c.year!)-\(pad(c.month!))-\(pad(c.day!))"
    }
    /// 今月の YYYY-MM
    public static func ym(_ date: Date = Date()) -> String { String(ymd(date).prefix(7)) }

    /// "2026-11-14" → (2026, 11, 14)。日がなければ 1
    public static func parts(_ s: String) -> (y: Int, m: Int, d: Int) {
        let p = s.split(separator: "-").map { Int($0) ?? 0 }
        return (p.count > 0 ? p[0] : 0, p.count > 1 ? p[1] : 1, p.count > 2 ? p[2] : 1)
    }

    /// Web 版 `parseYmd` と同じ（範囲外の日は繰り上がる）
    public static func date(_ s: String) -> Date {
        let p = parts(s)
        var c = DateComponents(); c.year = p.y; c.month = 1; c.day = 1
        let base = calendar.date(from: c)!
        let withMonth = calendar.date(byAdding: .month, value: p.m - 1, to: base)!
        return calendar.date(byAdding: .day, value: p.d - 1, to: withMonth)!
    }

    /// Web 版 `addMonths`（"2026-11" ＋ n か月 → "YYYY-MM"）
    public static func addMonths(_ s: String, _ n: Int) -> String {
        let p = parts(s)
        let total = p.y * 12 + (p.m - 1) + n
        let y = Int((Double(total) / 12).rounded(.down)), m = total - y * 12 + 1
        return "\(y)-\(pad(m))"
    }

    /// Web 版 `addDays`
    public static func addDays(_ s: String, _ n: Int) -> String {
        ymd(calendar.date(byAdding: .day, value: n, to: date(s))!)
    }

    /// その月の日数
    public static func daysInMonth(_ month: String) -> Int {
        let p = parts(month)
        return calendar.range(of: .day, in: .month, for: date("\(p.y)-\(pad(p.m))-01"))!.count
    }

    /// 曜日（0 = 日曜）
    public static func weekday(_ s: String) -> Int { calendar.component(.weekday, from: date(s)) - 1 }

    /// a から b まで何日か（b − a）
    public static func daysBetween(_ a: String, _ b: String) -> Int {
        calendar.dateComponents([.day], from: date(a), to: date(b)).day ?? 0
    }

    public static func isYMD(_ s: String) -> Bool {
        s.count == 10 && s.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil
    }
    public static func isYM(_ s: String) -> Bool {
        s.range(of: #"^\d{4}-(0[1-9]|1[0-2])$"#, options: .regularExpression) != nil
    }
}

/// Web 版と同じ表示（金額・月・日）
public enum Format {
    /// Web 版 `yen`：−¥1,234（マイナスは全角の − ）
    public static func yen(_ n: Double) -> String {
        let x = Int64((n).rounded(.toNearestOrAwayFromZero))
        return "\(x < 0 ? "−" : "")¥\(grouped(abs(x)))"
    }
    public static func yen(_ n: Int) -> String { yen(Double(n)) }

    static func grouped(_ n: Int64) -> String {
        let s = String(n)
        var out = ""
        for (i, ch) in s.enumerated() {
            if i > 0 && (s.count - i) % 3 == 0 { out += "," }
            out.append(ch)
        }
        return out
    }

    /// "2026-11" → "2026年11月"
    public static func monthLabel(_ s: String) -> String {
        let p = Dates.parts(s)
        return "\(p.y)年\(p.m)月"
    }
    /// "2026-11-14" → "11月14日（土）"
    public static func dayLabel(_ s: String) -> String {
        let p = Dates.parts(s), w = Array("日月火水木金土")[Dates.weekday(s)]
        return "\(p.m)月\(p.d)日（\(w)）"
    }
    /// "11/14" のような短い日付
    public static func shortDay(_ s: String) -> String {
        let p = Dates.parts(s)
        return "\(p.m)/\(p.d)"
    }
}
