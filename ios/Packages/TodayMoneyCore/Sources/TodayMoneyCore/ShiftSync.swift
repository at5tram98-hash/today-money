import Foundation

/// シフトの自動取り込み（Web 版 `applyShiftsAuto` ＋ `saveShiftImport(auto:true)` と同じ規則）
///
/// - 届いた中で一番早い日から先のカレンダー由来のシフトは、毎回まるごと入れ替える（重ならない・消したシフトは消える）。
/// - その2か月前からの取り込み済みシフトも合わせて、勤務先・勤務月ごとに給与（予定）を作る／更新する。
/// - 入金済みの給与は変えない。手入力した給与は7日間そのまま。
/// - シフトが0件になった月の「シフトから作った給与予定」は消す（入金記録・振り分けにつながったものは残す）。
public enum ShiftSync {
    public static let manualLock: TimeInterval = 7 * 86400

    public enum State: String, Sendable { case created, updated, kept, manual }
    public struct Result: Equatable, Sendable {
        public var count: Int
        public var total: Double
        public var states: [(key: String, state: State)]
        public var unmatched: [String]
        public static func == (a: Result, b: Result) -> Bool {
            a.count == b.count && a.total == b.total && a.unmatched == b.unmatched && a.states.map { "\($0.key)=\($0.state.rawValue)" } == b.states.map { "\($0.key)=\($0.state.rawValue)" }
        }
    }

    static func parseISO(_ s: String) -> Date? {
        let a = ISO8601DateFormatter(); a.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let b = ISO8601DateFormatter(); b.formatOptions = [.withInternetDateTime]
        return a.date(from: s) ?? b.date(from: s)
    }
    static func iso(_ d: Date) -> String {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: d)
    }
    /// 手入力の給与を自動で上書きしない期限
    public static func manualLockUntil(_ r: SalaryRecord) -> Date? {
        guard let t = parseISO(r.manualAt) else { return nil }
        return t.addingTimeInterval(manualLock)
    }

    /// Web 版 `uid(prefix)` と同じ形の ID
    public static func uid(_ prefix: String, now: Date = Date()) -> String {
        let t = String(Int64(now.timeIntervalSince1970 * 1000), radix: 36)
        let chars = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        return "\(prefix)_\(t)_\(String((0..<6).map { _ in chars.randomElement()! }))"
    }

    @discardableResult
    /// - replaceFrom: 置き換える範囲の始まり。nil なら取り込んだシフトの最初の日（Web 版と同じ）。
    ///   カレンダーを今日から全部読む時は今日を渡すと、最初のシフトより前で消えたシフトにも気づける
    public static func apply(_ shifts: [Shift], to doc: inout MoneyDocument, replace: Bool = true, replaceFrom: String? = nil, now: Date = Date()) -> Result {
        let settings = doc.shiftSettings
        let employers = Dictionary(doc.employers.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        var mapped: [Shift] = [], unmatched: [String] = []
        for x in shifts {
            let id = !x.employerId.isEmpty && employers[x.employerId] != nil ? x.employerId : Shifts.employerId(for: x.title, in: doc, settings: settings)
            if id.isEmpty {
                let t = x.title.isEmpty ? "（名前なし）" : x.title
                if !unmatched.contains(t) { unmatched.append(t) }
            } else { var y = x; y.employerId = id; mapped.append(y) }
        }
        guard !mapped.isEmpty else { return Result(count: 0, total: 0, states: [], unmatched: unmatched) }

        let firstShift = mapped.map(\.date).min()!
        let from = min(replaceFrom ?? firstShift, firstShift)
        let keepFrom = Dates.addMonths(String(from.prefix(7)), -2) + "-01"
        let plans = doc.shiftPlans
        let before = plans.filter { $0.date < from && $0.date >= keepFrom && employers[$0.employerId] != nil }
            .map { Shift(date: $0.date, start: $0.start, end: $0.end, title: $0.title, employerId: $0.employerId) }
        func monthKey(_ empId: String, _ date: String) -> String { "\(empId)|\(Payroll.workMonth(employers[empId], date: date))" }
        var months = Set(mapped.map { monthKey($0.employerId, $0.date) })
        var oldMonths = Set<String>()
        if replace { for p in plans where p.source == "calendar" && p.date >= from && employers[p.employerId] != nil { oldMonths.insert(monthKey(p.employerId, p.date)) } }
        months.formUnion(oldMonths)
        let groups = Shifts.estimate(before + mapped, in: doc, settings: settings).filter { months.contains($0.key) }
        let live = Set(groups.map(\.key))
        let emptied = oldMonths.subtracting(live)

        // 保存（Web 版 saveShiftImport と同じ順）
        var newPlans = plans
        if replace { newPlans.removeAll { $0.source == "calendar" && $0.date >= from } }
        var records = doc.salaryRecords
        if !emptied.isEmpty {
            let incomes = doc.incomes, allocations = doc["salaryAllocations"]?.arrayValue ?? []
            records.removeAll { r in
                emptied.contains("\(r.employerId)|\(r.month)") && r.source == "shift" && r.status == "予定"
                    && !((manualLockUntil(r).map { $0 > now }) ?? false)
                    && !incomes.contains { $0.salaryRecordId == r.id }
                    && !allocations.contains { str($0["salaryRecordId"]) == r.id }
            }
        }
        var states: [(String, State)] = [], total = 0.0
        let nowISO = iso(now)
        for g in groups {
            let dates = Set(g.items.map(\.shift.date))
            newPlans.removeAll { $0.employerId == g.employerId && dates.contains($0.date) }
            for it in g.items {
                var p = ShiftPlan(json: .object([:]))
                p.id = uid("shift", now: now); p.employerId = g.employerId; p.date = it.shift.date; p.start = it.shift.start; p.end = it.shift.end
                p.title = it.shift.title; p.workMinutes = it.duration.work; p.nightMinutes = it.duration.night; p.pay = it.pay
                p.source = "calendar"; p.importedAt = nowISO
                newPlans.append(p)
            }
            if let i = records.firstIndex(where: { $0.employerId == g.employerId && $0.month == g.month }) {
                var rec = records[i]
                if !rec.status.isEmpty && rec.status != "予定" { states.append((g.key, .kept)); continue }
                if let until = manualLockUntil(rec), until > now { states.append((g.key, .manual)); continue }
                rec.gross = g.gross + g.transport; rec.transport = g.transport; rec.date = g.payDate; rec.source = "shift"
                rec.shiftCount = g.items.count; rec.shiftMinutes = g.minutes; rec.manualAt = ""
                var raw = rec.json.objectValue ?? [:]
                raw.removeValue(forKey: "manualAt"); raw["updatedAt"] = .string(nowISO)
                records[i] = SalaryRecord(json: .object(raw))
                states.append((g.key, .updated))
            } else {
                var rec = SalaryRecord(id: uid("salary", now: now), employerId: g.employerId, month: g.month, date: g.payDate,
                                       gross: g.gross + g.transport, transport: g.transport, status: "予定", source: "shift")
                rec.shiftCount = g.items.count; rec.shiftMinutes = g.minutes
                var raw = rec.json.objectValue ?? [:]; raw["createdAt"] = .string(nowISO)
                records.append(SalaryRecord(json: .object(raw)))
                states.append((g.key, .created))
            }
            total += g.gross + g.transport
        }
        doc.shiftPlans = newPlans
        doc.salaryRecords = records
        doc.shiftSettings = settings
        return Result(count: mapped.count, total: total, states: states.map { (key: $0.0, state: $0.1) }, unmatched: unmatched)
    }
}
