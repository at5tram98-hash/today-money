import Foundation

// 目標の計画づくり（Web 版 src/js/11-home-and-month.js の goalRecommendation / createGoalPlanner / buildMonthlyDailyPlan / goalPlanner* / commitGoalPlan）。
// 照合テスト GoalPlannerCompatTests。

public struct GoalRecommendation: Sendable, Equatable {
    public var base: Double, low: Double, high: Double, current: Double
    public var dataCount: Int
    public var sparse: Bool { dataCount < 2 }
    public var categories: [String: Double]
    public var explanation: String
}

/// 計画の下書き（承認するまで保存しない）
public struct GoalPlan: Sendable, Equatable {
    public enum Kind: String, Sendable { case daily, monthly }
    public var type: Kind
    /// 日なら YYYY-MM-DD、月なら YYYY-MM
    public var key: String
    public var recommendation: GoalRecommendation
    public var total: Double
    public var categories: [String: Double]
    public var largeExpenses: [LargeExpensePlan] = []
    /// 日 → 金額（月の計画だけ）
    public var dailyPlan: [Int: Double] = [:]
    /// 自分で決めた日（自動の配分で変えない）
    public var dailyLocks: Set<String> = []
    public var dailyPlanNeedsRebuild = false
}

func roundGoal(_ v: Double, _ unit: Double) -> Double { max(0, (v / unit).rounded(.toNearestOrAwayFromZero) * unit) }

public extension MoneyDocument {
    func hasMonthSpendData(_ month: String) -> Bool {
        !transactions(inMonth: month).isEmpty || (root["monthlyCorrections"]?[month].map { !$0.isNull } ?? false)
    }
    /// 過去の同じ曜日（Web 版 sameWeekdaySpendHistory）
    func sameWeekdaySpendHistory(_ date: String, weeks: Int = 3) -> [(date: String, total: Double)] {
        (1...weeks).compactMap { i in let d = Dates.addDays(date, -7 * i); return hasDailySpendData(d) ? (d, spent(on: d)) : nil }
    }
    func recommendedDaily(_ date: String) -> Double {
        let hist = sameWeekdaySpendHistory(date, weeks: 3)
        if !hist.isEmpty { return roundGoal(hist.reduce(0) { $0 + $1.total } / Double(hist.count), 100) }
        return roundGoal(max(dailyGoal(date), spent(on: date) * 1.1, 1000), 100)
    }
    func recommendedMonth(_ month: String) -> Double {
        let vals = (1...3).map { Dates.addMonths(month, -$0) }.filter(hasMonthSpendData).map(spentMonth)
        if !vals.isEmpty { return roundGoal(vals.reduce(0, +) / Double(vals.count), 1000) }
        return roundGoal(max(monthlyGoalTotal(month), spentMonth(month) * 1.1, 10000), 1000)
    }
    func monthCategorySpent(_ month: String, _ cat: String) -> Double { categorySpent(month: month, category: cat) }

    /// カテゴリごとの過去の平均（Web 版 goalCategoryHistory）
    func goalCategoryHistory(_ type: GoalPlan.Kind, _ key: String) -> [String: Double] {
        var out: [String: Double] = [:]
        for c in categories {
            var vals: [Double] = []
            if type == .daily { for h in sameWeekdaySpendHistory(key, weeks: 3) { vals.append(categorySpent(day: h.date, category: c.name)) } }
            else { for i in 1...3 { let m = Dates.addMonths(key, -i); if hasMonthSpendData(m) { vals.append(monthCategorySpent(m, c.name)) } } }
            out[c.name] = vals.isEmpty ? 0 : vals.reduce(0, +) / Double(vals.count)
        }
        return out
    }
    /// 合計に合わせてカテゴリを按分（Web 版 scaleGoalCategories）
    func scaleGoalCategories(_ raw: [String: Double], total: Double, unit: Double) -> [String: Double] {
        let entries = categories.map { ($0.name, max(0, raw[$0.name] ?? 0)) }
        let base = entries.reduce(0) { $0 + $1.1 }
        var out: [String: Double] = [:]
        if base <= 0 || total <= 0 { for (n, _) in entries { out[n] = 0 }; return out }
        for (n, v) in entries { out[n] = max(0, floor((total * v / base) / unit) * unit) }
        return out
    }
    /// おすすめ（Web 版 goalRecommendation）
    func goalRecommendation(_ type: GoalPlan.Kind, _ key: String) -> GoalRecommendation {
        let unit: Double = type == .daily ? 100 : 1000
        let base = type == .daily ? recommendedDaily(key) : recommendedMonth(key)
        let current = type == .daily ? spent(on: key) : spentMonth(key)
        let count = type == .daily ? sameWeekdaySpendHistory(key, weeks: 3).count : (1...3).map { Dates.addMonths(key, -$0) }.filter(hasMonthSpendData).count
        return GoalRecommendation(base: base, low: roundGoal(base * 0.9, unit), high: roundGoal(base * 1.1, unit), current: current, dataCount: count,
                                  categories: scaleGoalCategories(goalCategoryHistory(type, key), total: base, unit: type == .daily ? 100 : 500),
                                  explanation: type == .daily ? "過去3週間の同じ曜日から" : "過去3ヶ月の支出から")
    }

    /// 月の予算を日ごとに配る（Web 版 buildMonthlyDailyPlan）
    func buildMonthlyDailyPlan(_ month: String, total: Double, existing: [Int: Double], today: String) -> [Int: Double] {
        let days = Dates.daysInMonth(month), todayMonth = String(today.prefix(7)), todayDay = Dates.parts(today).d
        let futureStart = month == todayMonth ? todayDay : (month > todayMonth ? 1 : days + 1)
        var plan: [Int: Double] = [:]
        for (k, v) in existing where v > 0 { plan[k] = v }
        if futureStart > days { return plan }
        var remaining = max(0, total)
        if month == todayMonth { remaining = max(0, remaining - spentMonth(month)) } else if month < todayMonth { return plan }
        var candidates: [Int] = [], protectedRemaining = 0.0
        for day in futureStart...days {
            let ds = "\(month)-\(pad2(day))"
            let raw = root["dailyGoals"]?[ds]
            if str(raw?["origin"]) == "daily" && num(raw?["total"]) > 0 {
                plan[day] = num(raw?["total"])
                protectedRemaining += max(0, num(raw?["total"]) - (ds == today ? spent(on: ds) : 0))
                continue
            }
            plan.removeValue(forKey: day); candidates.append(day)
        }
        remaining = max(0, remaining - protectedRemaining)
        let weights = weekdaySpendingWeights(month: month, weeks: 8)
        let wsum = candidates.reduce(0) { $0 + weights[Dates.weekday("\(month)-\(pad2($1))")] }
        var allocated = 0.0
        for (i, day) in candidates.enumerated() {
            let ds = "\(month)-\(pad2(day))"
            let share = i == candidates.count - 1 ? max(0, remaining - allocated) : max(0, floor((remaining * (weights[Dates.weekday(ds)] / max(1, wsum))) / 100) * 100)
            allocated += share
            plan[day] = share + (ds == today ? spent(on: ds) : 0)
        }
        return plan
    }

    func goalEditableStart(_ month: String, today: String) -> Int {
        let tm = String(today.prefix(7))
        if month < tm { return Dates.daysInMonth(month) + 1 }
        if month > tm { return 1 }
        return Dates.parts(today).d
    }

    /// 計画を始める（Web 版 createGoalPlanner）
    func createGoalPlan(_ type: GoalPlan.Kind, _ key: String, today: String) -> GoalPlan {
        let rec = goalRecommendation(type, key)
        let raw = type == .daily ? root["dailyGoals"]?[key] : root["monthlyGoals"]?[key]
        let existingTotal = num(raw?["total"])
        let baseTotal = existingTotal > 0 ? existingTotal : rec.base
        let rawCats = (raw?["categories"]?.objectValue ?? [:]).mapValues { num($0) }
        let cats = rawCats.isEmpty ? scaleGoalCategories(goalCategoryHistory(type, key), total: baseTotal, unit: type == .daily ? 100 : 500) : rawCats
        var plan = GoalPlan(type: type, key: key, recommendation: rec, total: baseTotal, categories: cats)
        if type == .monthly {
            plan.largeExpenses = largeExpensePlans.filter { $0.date.hasPrefix(key) && $0.status != "completed" && $0.status != "cancelled" }
            let existingDaily = Dictionary((raw?["daily"]?.objectValue ?? [:]).compactMap { k, v in Int(k).map { ($0, num(v)) } }, uniquingKeysWith: { a, _ in a })
            var daily = buildMonthlyDailyPlan(key, total: baseTotal, existing: existingDaily, today: today)
            for day in 1...Dates.daysInMonth(key) {
                let ds = "\(key)-\(pad2(day))"
                if str(root["dailyGoals"]?[ds]?["origin"]) == "daily" { plan.dailyLocks.insert(ds); daily[day] = num(root["dailyGoals"]?[ds]?["total"]) }
            }
            plan.dailyPlan = daily
        }
        return plan
    }

    // MARK: 月の日別計画

    /// 配る対象の合計（Web 版 goalPlannerTarget）
    func goalTarget(_ p: GoalPlan, today: String) -> Double {
        if p.type != .monthly { return max(0, p.total) }
        let total = max(0, p.total), start = goalEditableStart(p.key, today: today), tm = String(today.prefix(7))
        if p.key != tm { return p.key > tm ? total : p.dailyPlan.values.reduce(0, +) }
        var past = 0.0
        if start > 1 { for d in 1..<start { past += spent(on: "\(p.key)-\(pad2(d))") } }
        return max(0, total - past)
    }
    func goalAllocated(_ p: GoalPlan, _ plan: [Int: Double], today: String) -> Double {
        let start = goalEditableStart(p.key, today: today), days = Dates.daysInMonth(p.key)
        guard start <= days else { return 0 }
        return (start...days).reduce(0) { $0 + max(0, plan[$1] ?? 0) }
    }
    func goalCandidates(_ p: GoalPlan, exclude: Set<String>, today: String) -> [String] {
        let large = Set(p.largeExpenses.filter { $0.status == "planned" }.map(\.date))
        let start = goalEditableStart(p.key, today: today), days = Dates.daysInMonth(p.key)
        guard start <= days else { return [] }
        let dates = (start...days).map { "\(p.key)-\(pad2($0))" }.filter { !exclude.contains($0) && !p.dailyLocks.contains($0) }
        return dates.enumerated().sorted { a, b in
            let la = large.contains(a.element) ? 1 : 0, lb = large.contains(b.element) ? 1 : 0
            return la != lb ? la < lb : a.element < b.element
        }.map(\.element)
    }
    /// 合計に合うよう、固定日以外で足し引きする（Web 版 goalPlannerNormalizePlan）
    func goalNormalize(_ p: GoalPlan, _ plan: [Int: Double], exclude: Set<String>, today: String) -> [Int: Double] {
        var next = plan
        let target = goalTarget(p, today: today), gap = target - goalAllocated(p, next, today: today)
        if abs(gap) < 0.5 { return next }
        let cands = goalCandidates(p, exclude: exclude, today: today)
        guard !cands.isEmpty else { return next }
        let w = weekdaySpendingWeights(month: p.key, weeks: 8)
        func wt(_ ds: String) -> Double { let x = w[Dates.weekday(ds)]; return x == 0 ? 1 : x }
        if gap > 0 {
            var left = gap
            let wtotal = cands.reduce(0) { $0 + wt($1) }
            for (i, ds) in cands.enumerated() {
                let day = Dates.parts(ds).d
                let add = i == cands.count - 1 ? left : min(left, max(0, floor((gap * (wt(ds) / max(1, wtotal))) / 100) * 100))
                next[day] = (next[day] ?? 0) + add
                left -= add
            }
            if left > 0 { let day = Dates.parts(cands.last!).d; next[day] = (next[day] ?? 0) + left }
        } else {
            var need = -gap
            for ds in cands where need > 0 {
                let day = Dates.parts(ds).d, avail = max(0, next[day] ?? 0), take = min(avail, need)
                next[day] = avail - take; need -= take
            }
        }
        return next
    }
    /// 総額を変えた後に日別計画を作り直す（Web 版 ensureGoalDailyPlan）
    func goalEnsureDaily(_ p: inout GoalPlan, force: Bool = false, today: String) {
        guard p.type == .monthly, force || p.dailyPlanNeedsRebuild else { return }
        let existing = Dictionary((root["monthlyGoals"]?[p.key]?["daily"]?.objectValue ?? [:]).compactMap { k, v in Int(k).map { ($0, num(v)) } }, uniquingKeysWith: { a, _ in a })
        var next = buildMonthlyDailyPlan(p.key, total: p.total, existing: existing, today: today)
        let start = goalEditableStart(p.key, today: today)
        for ds in p.dailyLocks where ds.hasPrefix(p.key) && Dates.parts(ds).d >= start {
            let day = Dates.parts(ds).d
            next[day] = p.dailyPlan[day] ?? num(root["dailyGoals"]?[ds]?["total"])
        }
        p.dailyPlan = goalNormalize(p, next, exclude: p.dailyLocks, today: today)
        p.dailyPlanNeedsRebuild = false
    }
    /// 1日の金額を変え、他の日で合計を合わせる（Web 版 goalPlannerRebalancePreview）
    func goalRebalance(_ p: GoalPlan, date: String, value: Double, maintain: Bool = true, today: String) -> [Int: Double] {
        var next = p.dailyPlan
        next[Dates.parts(date).d] = max(0, value)
        return maintain ? goalNormalize(p, next, exclude: [date], today: today) : next
    }
    /// 同じ曜日・平日・週末に同じ金額を入れる（Web 版 goalPlannerApplyScope）
    func goalApplyScope(_ p: GoalPlan, date: String, scope: String, today: String) -> [Int: Double] {
        let value = p.dailyPlan[Dates.parts(date).d] ?? 0, wd0 = Dates.weekday(date)
        var next = p.dailyPlan, changed: Set<String> = [date]
        let start = goalEditableStart(p.key, today: today), days = Dates.daysInMonth(p.key)
        if start <= days {
            for d in start...days {
                let ds = "\(p.key)-\(pad2(d))"
                if ds == date || p.dailyLocks.contains(ds) { continue }
                let wd = Dates.weekday(ds)
                let match = scope == "weekday" ? wd == wd0 : scope == "weekdays" ? (1...5).contains(wd) : scope == "weekend" ? (wd == 0 || wd == 6) : false
                if match { next[d] = value; changed.insert(ds) }
            }
        }
        return goalNormalize(p, next, exclude: changed, today: today)
    }
    /// ACF の安全な額に合わせる（Web 版 goalPlannerSafeAutoPlan）
    func goalSafeAuto(_ p: GoalPlan, baseline: AcfForecast, today: String) -> [Int: Double] {
        var next = p.dailyPlan
        let start = goalEditableStart(p.key, today: today), days = Dates.daysInMonth(p.key)
        if start <= days {
            for d in start...days {
                let ds = "\(p.key)-\(pad2(d))"
                if p.dailyLocks.contains(ds) { continue }
                if let row = baseline.rows.first(where: { $0.date == ds }) { next[d] = max(0, floor(row.safeTotalBudget / 100) * 100) }
            }
        }
        return goalNormalize(p, next, exclude: p.dailyLocks, today: today)
    }
    /// 下書きの大型支出を入れた計画（Web 版 goalPlannerDraftLargePlans）
    func goalDraftLargePlans(_ p: GoalPlan) -> [LargeExpensePlan] {
        largeExpensePlans.filter { !$0.date.hasPrefix(p.key) } + p.largeExpenses
    }
    /// ACF 推奨の月の総額（Web 版 goalPlannerAcfRecommendedTotal）
    func goalAcfRecommendedTotal(_ p: GoalPlan, baseline f: AcfForecast, today: String) -> Double {
        let future = f.rows.filter { $0.date.hasPrefix(p.key) }.reduce(0) { $0 + $1.safeTotalBudget }
        if p.key == String(today.prefix(7)) {
            var past = 0.0
            let start = goalEditableStart(p.key, today: today)
            if start > 1 { for d in 1..<start { past += spent(on: "\(p.key)-\(pad2(d))") } }
            return past + future
        }
        return future > 0 ? future : p.recommendation.base
    }
    /// 日別計画の予測（Web 版 goalPlannerForecast）
    func goalPlanForecast(_ p: GoalPlan, today: String) -> AcfForecast {
        var map: [String: Double] = [:]
        for d in 1...Dates.daysInMonth(p.key) {
            let ds = "\(p.key)-\(pad2(d))", v = max(0, p.dailyPlan[d] ?? 0)
            if v > 0 && ds >= today { map[ds] = v }
        }
        let end = p.key > String(today.prefix(7)) ? "\(p.key)-\(pad2(Dates.daysInMonth(p.key)))" : nil
        return acfForecast(today: today, plan: map, planIncludesSpent: true, horizonEnd: end, largeExpensePlans: goalDraftLargePlans(p))
    }

    /// 計画を保存する（Web 版 commitGoalPlan）
    mutating func commitGoalPlan(_ p: GoalPlan, now: Date = Date(), today: String) throws {
        let total = max(0, p.total)
        var cats: [String: JSONValue] = [:]
        for c in categories { cats[c.name] = .number(max(0, p.categories[c.name] ?? 0)) }
        let catTotal = cats.values.reduce(0) { $0 + num($1) }
        if total <= 0 { throw GoalError.message("目標金額を入力してください。") }
        if catTotal > total { throw GoalError.message("カテゴリ合計が目標を \(Format.yen(catTotal - total)) 超えています。") }
        var mg = root["monthlyGoals"]?.objectValue ?? [:]
        var dg = root["dailyGoals"]?.objectValue ?? [:]
        if p.type == .daily {
            let month = String(p.key.prefix(7)), day = String(Dates.parts(p.key).d)
            dg[p.key] = .object(["total": .number(total), "categories": .object(cats), "origin": .string("daily")])
            var m = mg[month]?.objectValue ?? [:]
            m["categories"] = m["categories"] ?? .object([:])
            var daily = m["daily"]?.objectValue ?? [:]; daily[day] = .number(total); m["daily"] = .object(daily)
            mg[month] = .object(m)
            self["dailyGoals"] = .object(dg); self["monthlyGoals"] = .object(mg)
            return
        }
        let target = goalTarget(p, today: today), gap = target - goalAllocated(p, p.dailyPlan, today: today)
        if abs(gap) > 0.5 { throw GoalError.message(gap > 0 ? "\(Format.yen(gap)) が未配分です。" : "日別計画が \(Format.yen(abs(gap))) 超過しています。") }
        let month = p.key, days = Dates.daysInMonth(month), start = goalEditableStart(month, today: today)
        var m = mg[month]?.objectValue ?? [:]
        m["total"] = .number(total); m["categories"] = .object(cats)
        var daily = m["daily"]?.objectValue ?? [:]
        for day in 1...days {
            let ds = "\(month)-\(pad2(day))"
            if month == String(today.prefix(7)) && day < start { continue }
            let v = max(0, p.dailyPlan[day] ?? 0), locked = p.dailyLocks.contains(ds), old = dg[ds]
            if v > 0 {
                daily[String(day)] = .number(v)
                dg[ds] = .object(["total": .number(v), "categories": old?["categories"] ?? .object([:]), "origin": .string(locked ? "daily" : "monthly")])
            } else {
                daily.removeValue(forKey: String(day))
                if str(old?["origin"]) == "monthly" || (!locked && str(old?["origin"]) == "daily") { dg.removeValue(forKey: ds) }
            }
        }
        m["daily"] = .object(daily); mg[month] = .object(m)
        self["monthlyGoals"] = .object(mg); self["dailyGoals"] = .object(dg)
        let keep = largeExpensePlans.filter { !$0.date.hasPrefix(month) || $0.status == "completed" || $0.status == "cancelled" }
        let iso = ISODate.now(now)
        let drafts = p.largeExpenses.map { x -> LargeExpensePlan in
            var raw = x.json.objectValue ?? [:]
            if str(raw["status"]).isEmpty { raw["status"] = .string("planned") }
            raw["updatedAt"] = .string(iso)
            return LargeExpensePlan(json: .object(raw))
        }
        largeExpensePlans = keep + drafts
    }
}

public enum GoalError: LocalizedError { case message(String)
    public var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
}
