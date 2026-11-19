import Charts
import SwiftUI
import TodayMoneyCore

// MARK: - 資金表（表は左の項目名を固定して横にめくる。上の小さなグラフをなぞるとその日の列へ飛ぶ）

struct AcfTableTab: View {
    @Environment(AppModel.self) private var model
    @Environment(\.acfOpenDay) private var openDay
    var f: AcfForecast
    @AppStorage("acfFundsView") private var viewMode = "table"
    @State private var importantOnly = false
    @State private var month = ""
    @State private var focusDate: String?

    var body: some View {
        let visibleEnd = model.doc.acfVisibleEnd(f.startDate)
        let months = Array(NSOrderedSet(array: f.rows.filter { $0.date <= visibleEnd }.map { String($0.date.prefix(7)) })) as? [String] ?? []
        let m = months.contains(month) ? month : (months.first ?? model.thisMonth)
        let monthRows = f.rows.filter { $0.date.hasPrefix(m) }
        let rows = monthRows.filter { !importantOnly || $0.important }
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                // 表示の切り替え
                Picker("表示", selection: $viewMode) {
                    Label("表", systemImage: "tablecells").tag("table")
                    Label("カレンダー", systemImage: "calendar").tag("calendar")
                }
                .pickerStyle(.segmented)
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(months, id: \.self) { x in
                            Button { withAnimation(.snappy) { month = x; focusDate = nil } } label: {
                                Text(Format.monthLabel(x)).font(.subheadline.weight(.semibold))
                                    .padding(.horizontal, 14).padding(.vertical, 8)
                                    .foregroundStyle(x == m ? Color.white : Color.primary)
                                    .background(x == m ? Color.teal : Color(.secondarySystemGroupedBackground), in: Capsule())
                            }
                            .buttonStyle(.plain)
                        }
                        Toggle(isOn: $importantOnly.animation(.snappy)) { Text("重要日のみ").font(.subheadline.weight(.semibold)) }
                            .toggleStyle(.button).buttonBorderShape(.capsule).tint(.orange)
                    }
                }
                .scrollIndicators(.hidden)

                if viewMode == "calendar" {
                    AcfCalendar(month: m, rows: rows, today: model.today) { openDay($0) }
                        .padding(12)
                        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
                } else {
                    AcfMonthStrip(rows: monthRows, today: model.today, focus: $focusDate)
                    AcfPinnedTable(rows: rows, today: model.today, firstDeficit: f.firstNegativeDate, focus: focusDate) { openDay($0) }
                    legend
                }
                Text("\(Format.dayLabel(f.startDate))〜\(Format.dayLabel(visibleEnd))を月ごとに表示。カード利用後の請求は\(Format.dayLabel(f.endDate))まで確認します。現金余力は、必須の入出金後に将来残せる最低残高と安全残高の差です。「計画支出（現金）」は実際の引落しではなく、ACFが想定した生活費を使う場合の金額です。カードで使う目安は利用日の現金からは引かず、後日の請求に反映します。")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    private var legend: some View {
        HStack(spacing: 12) {
            HStack(spacing: 3) { Text("¥").foregroundStyle(.green); Text("給与") }
            HStack(spacing: 3) { Circle().fill(.purple).frame(width: 6, height: 6); Text("カード") }
            HStack(spacing: 3) { Circle().fill(.pink).frame(width: 6, height: 6); Text("大型支出") }
            HStack(spacing: 3) { RoundedRectangle(cornerRadius: 2).fill(Color.red.opacity(0.18)).frame(width: 10, height: 10); Text("不足") }
            Spacer()
            Text("列を押すと内訳")
        }
        .font(.caption2).foregroundStyle(.secondary)
    }
}

/// 月の残高の小さなグラフ。なぞった日へ表を動かす
struct AcfMonthStrip: View {
    var rows: [AcfRow]
    var today: String
    @Binding var focus: String?
    @State private var scrub: String?
    var body: some View {
        let sel = rows.first { $0.date == (scrub ?? focus) }
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(sel.map { Format.dayLabel($0.date) } ?? "なぞると、その日の列へ移動します").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if let s = sel { Text(s.forecastBalance.yen).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(s.forecastBalance < 0 ? .red : .primary) }
            }
            Chart(rows) { r in
                BarMark(x: .value("日", r.date), y: .value("残高", r.forecastBalance), width: .ratio(0.7))
                    .cornerRadius(2)
                    .foregroundStyle(r.forecastBalance < 0 ? Color.red : r.headroom < 0 ? Color.orange : (r.date == today ? Color.teal : Color.teal.opacity(0.45)))
                    .opacity(sel == nil || sel?.date == r.date ? 1 : 0.5)
            }
            .chartXAxis(.hidden)
            .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 2)) { v in AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)).font(.system(size: 9)) } } } }
            .chartXSelection(value: $scrub)
            .onChange(of: scrub) { _, s in if let s { focus = s; Feedback.selection() } }
            .frame(height: 64)
        }
        .padding(12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// 左の項目名を固定した日別資金表
struct AcfPinnedTable: View {
    var rows: [AcfRow]
    var today: String
    var firstDeficit: String
    var focus: String?
    var select: (AcfRow) -> Void
    private let headerH: CGFloat = 48, cellH: CGFloat = 34, colW: CGFloat = 86, labelW: CGFloat = 118

    var body: some View {
        if rows.isEmpty {
            Text("この月に表示する日がありません。").foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(30)
        } else {
            HStack(alignment: .top, spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("項目").font(.caption.weight(.semibold)).foregroundStyle(.secondary).frame(height: headerH)
                    ForEach(Array(AcfTable.fields.enumerated()), id: \.offset) { i, f in
                        Text(f.0).font(.caption).lineLimit(1).minimumScaleFactor(0.8)
                            .frame(width: labelW - 12, height: cellH, alignment: .leading)
                    }
                }
                .padding(.leading, 12)
                .frame(width: labelW, alignment: .leading)
                .background(Color(.secondarySystemGroupedBackground))
                .shadow(color: .black.opacity(0.08), radius: 4, x: 3)
                .zIndex(1)
                ScrollViewReader { proxy in
                    ScrollView(.horizontal) {
                        LazyHStack(spacing: 0) {
                            ForEach(rows) { r in column(r).id(r.date) }
                        }
                    }
                    .scrollIndicators(.visible)
                    .onAppear { if let t = rows.first(where: { $0.date >= today })?.date { proxy.scrollTo(t, anchor: .leading) } }
                    .onChange(of: focus) { _, d in
                        guard let d, rows.contains(where: { $0.date == d }) else { return }
                        withAnimation(.snappy) { proxy.scrollTo(d, anchor: .center) }
                    }
                }
            }
            .background(
                VStack(spacing: 0) {
                    Color.clear.frame(height: headerH)
                    ForEach(0..<AcfTable.fields.count, id: \.self) { i in (i % 2 == 0 ? Color.primary.opacity(0.035) : Color.clear).frame(height: cellH) }
                }
            )
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }

    private func column(_ r: AcfRow) -> some View {
        let isToday = r.date == today, isFocus = r.date == focus
        return Button { select(r) } label: {
            VStack(spacing: 0) {
                VStack(spacing: 2) {
                    HStack(spacing: 2) {
                        Text(Format.shortDay(r.date)).font(.caption.weight(.bold))
                        if r.date == firstDeficit { Image(systemName: "exclamationmark.circle.fill").font(.caption2).foregroundStyle(.red) }
                    }
                    HStack(spacing: 3) {
                        if r.salary { Text("¥").foregroundStyle(.green).fontWeight(.bold) }
                        if r.card || r.cardPayment > 0 || r.flexibleCardDue > 0 { Circle().fill(.purple).frame(width: 5, height: 5) }
                        if r.large { Circle().fill(.pink).frame(width: 5, height: 5) }
                        Text(String(Array("日月火水木金土")[Dates.weekday(r.date)])).foregroundStyle(Dates.weekday(r.date) == 0 ? .red : Dates.weekday(r.date) == 6 ? .blue : .secondary)
                    }
                    .font(.caption2)
                }
                .frame(height: headerH)
                ForEach(Array(AcfTable.fields.enumerated()), id: \.offset) { _, f in
                    let v = r[keyPath: f.1]
                    Text(AcfTable.text(v, f.2)).font(.caption.monospacedDigit())
                        .foregroundStyle(f.2 == "signed" && v < 0 ? Color.red : f.2 == "plus" && v > 0 ? Color.green : Color.primary)
                        .lineLimit(1).minimumScaleFactor(0.7)
                        .frame(width: colW - 10, height: cellH, alignment: .trailing)
                }
            }
            .frame(width: colW)
            .background(isFocus ? Color.teal.opacity(0.18) : isToday ? Color.accentColor.opacity(0.10) : r.forecastBalance < 0 ? Color.red.opacity(0.10) : Color.clear)
            .overlay(alignment: .top) { if isToday { Capsule().fill(Color.accentColor).frame(width: 26, height: 3).padding(.top, 2) } }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(Format.dayLabel(r.date))、計画後の残高 \(r.forecastBalance.yen)")
    }
}

// MARK: - 予定（週ごとにたたむ。上で日ごとの入出金をグラフに）

struct AcfEventsTab: View {
    @Environment(AppModel.self) private var model
    @Environment(\.acfOpenDay) private var openDay
    var f: AcfForecast
    @State private var filter = "all"
    @State private var openWeeks: Set<String> = []
    @State private var touched = false
    @State private var flowScrub: Date?

    struct Item: Identifiable {
        var id: String
        var row: AcfRow
        var label: String
        var amount: Double
        var kind: String   // income / card / fixed / large / outflow / marker
    }

    var body: some View {
        let end = model.doc.acfVisibleEnd(f.startDate)
        let rows = f.rows.filter { $0.date <= end }
        let items = Self.items(rows, f: f).filter { pass($0) }
        let weeks = Dictionary(grouping: items) { Self.weekStart($0.row.date, from: f.startDate) }.sorted { $0.key < $1.key }
        let inSum = items.filter { $0.amount > 0 }.reduce(0) { $0 + $1.amount }
        let outSum = items.filter { $0.amount < 0 }.reduce(0) { $0 + $1.amount }
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                flowChart(rows)
                HStack(alignment: .top, spacing: 8) {
                    StatTile(title: "入金の予定", value: inSum.yen, tint: .green)
                    StatTile(title: "支払いの予定", value: abs(outSum).yen, tint: .orange)
                    StatTile(title: "最低予測残高", value: f.minForecastBalance.yen, sub: Format.shortDay(f.minForecastDate), tint: f.minForecastBalance < f.reserveFloor ? .red : .primary)
                }
                .fixedSize(horizontal: false, vertical: true)
                Picker("絞り込み", selection: $filter.animation(.snappy)) {
                    Text("すべて").tag("all"); Text("入金").tag("income"); Text("支払い").tag("out"); Text("注意").tag("warn")
                }
                .pickerStyle(.segmented)
                if weeks.isEmpty {
                    Text("この条件の予定はありません").foregroundStyle(.secondary).frame(maxWidth: .infinity).padding(30)
                }
                ForEach(Array(weeks.enumerated()), id: \.element.key) { i, w in
                    weekCard(w.key, w.value, open: touched ? openWeeks.contains(w.key) : i < 2)
                }
                Text("給与・臨時収入・カード引落・固定支払い・必須の大型支出・ACFが想定したカード利用の引落を、日付順にまとめています。日付を押すと、その日の資金の内訳を開きます。")
                    .font(.caption2).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    private func pass(_ x: Item) -> Bool {
        switch filter {
        case "income": return x.amount > 0
        case "out": return x.amount < 0
        case "warn": return x.row.headroom < 0 || x.row.forecastBalance < 0
        default: return true
        }
    }

    static func items(_ rows: [AcfRow], f: AcfForecast) -> [Item] {
        var out: [Item] = []
        for r in rows {
            for (i, e) in r.events.enumerated() {
                out.append(Item(id: "\(r.date)|\(i)", row: r, label: e.label, amount: e.amount, kind: e.type == "income" ? "income" : e.type))
            }
            if r.flexibleCardDue > 0 { out.append(Item(id: "\(r.date)|due", row: r, label: "カード利用分の引落（ACFの想定）", amount: -r.flexibleCardDue, kind: "card")) }
            if r.events.isEmpty && r.flexibleCardDue == 0 && r.headroom < 0 && (out.last?.row.headroom ?? 0) >= 0 {
                out.append(Item(id: "\(r.date)|warn", row: r, label: "安全ラインを下回る見込み", amount: 0, kind: "marker"))
            }
        }
        return out
    }
    static func weekStart(_ d: String, from start: String) -> String { Dates.addDays(start, (Dates.daysBetween(start, d) / 7) * 7) }

    private func flowChart(_ rows: [AcfRow]) -> some View {
        let sel = flowScrub.flatMap { d in rows.first { $0.date == Dates.ymd(d) } }
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(sel.map { Format.dayLabel($0.date) } ?? "日ごとの入出金（なぞると金額）").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if let s = sel {
                    if s.income > 0 { Text("+\(s.income.yen)").foregroundStyle(.green) }
                    if s.mandatoryOutflow + s.flexibleCardDue > 0 { Text("−\((s.mandatoryOutflow + s.flexibleCardDue).yen)").foregroundStyle(.orange) }
                    Text("残高 \(s.forecastBalance.yen)").foregroundStyle(.secondary)
                }
            }
            .font(.caption.weight(.semibold)).monospacedDigit()
            Chart {
                ForEach(rows) { r in
                    if r.income > 0 { BarMark(x: .value("日", Dates.date(r.date), unit: .day), y: .value("入金", r.income)).foregroundStyle(Color.green.gradient) }
                    if r.mandatoryOutflow + r.flexibleCardDue > 0 {
                        BarMark(x: .value("日", Dates.date(r.date), unit: .day), y: .value("支払い", -(r.mandatoryOutflow + r.flexibleCardDue))).foregroundStyle(Color.orange.gradient)
                    }
                }
                RuleMark(y: .value("0", 0)).foregroundStyle(Color.secondary.opacity(0.4))
                if let s = sel { RuleMark(x: .value("日", Dates.date(s.date), unit: .day)).foregroundStyle(Color.primary.opacity(0.2)) }
            }
            .chartXScale(domain: Dates.date(rows.first?.date ?? model.today)...Dates.date(Dates.addDays(rows.last?.date ?? model.today, 1)))
            .chartXAxis { AxisMarks(values: .stride(by: .day, count: 14)) { v in AxisGridLine().foregroundStyle(.clear); AxisValueLabel { if let d = v.as(Date.self) { Text(d.formatted(.dateTime.month(.defaultDigits).day())) } } } }
            .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
            .chartXSelection(value: $flowScrub)
            .onChange(of: sel?.date) { _, d in if d != nil { Feedback.selection() } }
            .frame(height: 140)
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func weekCard(_ start: String, _ items: [Item], open: Bool) -> some View {
        let end = Dates.addDays(start, 6)
        let inSum = items.filter { $0.amount > 0 }.reduce(0) { $0 + $1.amount }
        let outSum = items.filter { $0.amount < 0 }.reduce(0) { $0 + $1.amount }
        let minBal = items.map(\.row.forecastBalance).min() ?? 0
        let warn = items.contains { $0.row.headroom < 0 || $0.row.forecastBalance < 0 }
        return VStack(alignment: .leading, spacing: 0) {
            Button {
                withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) {
                    if !touched { touched = true; openWeeks = Set(Self.firstTwo(start: f.startDate)) }
                    if openWeeks.contains(start) { openWeeks.remove(start) } else { openWeeks.insert(start) }
                }
                Feedback.selection()
            } label: {
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text("\(Format.shortDay(start))〜\(Format.shortDay(end))").font(.subheadline.weight(.bold))
                            if warn { Image(systemName: "exclamationmark.triangle.fill").font(.caption).foregroundStyle(.orange) }
                        }
                        HStack(spacing: 8) {
                            if inSum > 0 { Text("+\(inSum.yen)").foregroundStyle(.green) }
                            if outSum < 0 { Text("−\(abs(outSum).yen)").foregroundStyle(.orange) }
                            Text("\(items.count)件").foregroundStyle(.secondary)
                        }
                        .font(.caption.weight(.semibold)).monospacedDigit()
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("最低").font(.caption2).foregroundStyle(.secondary)
                        Text(minBal.yen).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(minBal < f.reserveFloor ? .red : .primary)
                    }
                    Image(systemName: "chevron.down").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
                        .rotationEffect(.degrees(open ? 0 : -90))
                }
                .padding(14)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open {
                Divider().padding(.leading, 14)
                ForEach(items) { x in
                    Button { openDay(x.row) } label: { itemRow(x) }.buttonStyle(.plain)
                }
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
    static func firstTwo(start: String) -> [String] { [start, Dates.addDays(start, 7)] }

    private func itemRow(_ x: Item) -> some View {
        let p = Dates.parts(x.row.date)
        return HStack(spacing: 12) {
            VStack(spacing: 0) {
                Text("\(p.d)").font(.headline.monospacedDigit())
                Text(String(Array("日月火水木金土")[Dates.weekday(x.row.date)])).font(.caption2).foregroundStyle(.secondary)
            }
            .frame(width: 30)
            Image(systemName: symbol(x.kind)).font(.footnote.weight(.semibold)).foregroundStyle(.white)
                .frame(width: 26, height: 26).background(color(x.kind), in: Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(x.label).font(.subheadline).lineLimit(2).multilineTextAlignment(.leading)
                Text("終わりの残高 \(x.row.forecastBalance.yen)\(x.row.headroom < 0 ? "・安全ラインを下回る" : "")").font(.caption2)
                    .foregroundStyle(x.row.headroom < 0 ? .red : .secondary)
            }
            Spacer()
            if x.amount != 0 { Text(signedYen(x.amount)).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(x.amount > 0 ? .green : .primary) }
        }
        .padding(.horizontal, 14).padding(.vertical, 9)
        .contentShape(Rectangle())
    }
    private func symbol(_ k: String) -> String {
        switch k { case "income": return "arrow.down"; case "card": return "creditcard.fill"; case "fixed": return "repeat"; case "large": return "cart.fill"; case "marker": return "exclamationmark"; default: return "arrow.up" }
    }
    private func color(_ k: String) -> Color {
        switch k { case "income": return .green; case "card": return .purple; case "fixed": return .indigo; case "large": return .pink; case "marker": return .red; default: return .orange }
    }
}

// MARK: - 口座（口座ごとの見通し・引落準備・振替計画）

struct AcfAccountsTab: View {
    @Environment(AppModel.self) private var model
    var f: AcfForecast
    @State private var days = 60

    var body: some View {
        let doc = model.doc
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Picker("期間", selection: $days) { Text("30日").tag(30); Text("60日").tag(60); Text("90日").tag(90) }.pickerStyle(.segmented)
                let list = doc.banks.compactMap { b in doc.bankForecast(b.id, days: days, today: model.today).map { (b, $0) } }
                let short = list.filter { $0.1.minBalance < max(0, $0.0.threshold) }
                HStack(alignment: .top, spacing: 8) {
                    StatTile(title: "口座の合計", value: doc.totalBankBalance.yen)
                    StatTile(title: "不足しそうな口座", value: "\(short.count)件", tint: short.isEmpty ? .green : .red)
                    StatTile(title: "振替計画", value: "\(doc.transferPlans.filter { $0.status == "planned" }.count)件")
                }
                .fixedSize(horizontal: false, vertical: true)
                ForEach(list, id: \.0.id) { b, fc in
                    NavigationLink(value: AcfCenterDest.bank(b.id)) { bankCard(b, fc) }.buttonStyle(.plain)
                }
                NavigationLink(value: AcfCenterDest.transfers) {
                    HStack {
                        Image(systemName: "arrow.left.arrow.right").foregroundStyle(.white).frame(width: 30, height: 30).background(Color.teal, in: RoundedRectangle(cornerRadius: 8))
                        VStack(alignment: .leading, spacing: 2) { Text("振替計画").font(.subheadline.weight(.semibold)); Text("口座の間でお金を移す予定").font(.caption).foregroundStyle(.secondary) }
                        Spacer()
                        Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
                    }
                    .padding(14)
                    .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                }
                .buttonStyle(.plain)
                Text("口座ごとに、給与の入金・カード引落・固定支払い・振替計画を日付順に足し引きした見通しです（日々の生活費は含みません）。").font(.caption2).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
        }
    }

    private func bankCard(_ b: Bank, _ fc: BankForecast) -> some View {
        let floor = max(0, b.threshold), warn = fc.minBalance < floor
        let points = fc.rows.map { ValuePoint(date: $0.date, value: $0.forecastBalance) }
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(b.name).font(.headline)
                Spacer()
                Text(warn ? "不足見込み" : "範囲内").font(.caption.weight(.bold)).padding(.horizontal, 8).padding(.vertical, 3)
                    .background((warn ? Color.red : Color.green).opacity(0.15), in: Capsule()).foregroundStyle(warn ? .red : .green)
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(.tertiary)
            }
            HStack(alignment: .bottom) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("いま").font(.caption2).foregroundStyle(.secondary)
                    Text(b.balance.yen).font(.title3.weight(.bold)).monospacedDigit()
                }
                Spacer()
                Sparkline(points: points, tint: warn ? .red : .teal).frame(width: 120, height: 36)
            }
            HStack(spacing: 12) {
                Label("最低 \(fc.minBalance.yen)（\(Format.shortDay(fc.minDate))）", systemImage: "arrow.down.to.line").foregroundStyle(warn ? .red : .secondary)
                Spacer()
                Text("\(days)日後 \(fc.endBalance.yen)").foregroundStyle(.secondary)
            }
            .font(.caption).monospacedDigit()
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(warn ? Color.red.opacity(0.35) : .clear))
    }
}

/// 1つの口座の見通し（Web 版 お金のタイムライン の口座ごとの表示・引落準備）
struct AcfBankForecastView: View {
    @Environment(AppModel.self) private var model
    var bankId: String
    @State private var days = 60
    @State private var selected: ValuePoint?
    @State private var planning = false

    var body: some View {
        let doc = model.doc
        if let b = doc.bank(bankId), let fc = doc.bankForecast(bankId, days: days, today: model.today) {
            let floor = max(0, b.threshold)
            let points = fc.rows.map { ValuePoint(date: $0.date, value: $0.forecastBalance) }
            let important = fc.rows.filter { !$0.events.isEmpty || $0.forecastBalance < floor }
            List {
                Section {
                    Picker("期間", selection: $days) { Text("30日").tag(30); Text("60日").tag(60); Text("90日").tag(90) }.pickerStyle(.segmented)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(selected.map { Format.dayLabel($0.date) } ?? "最低予測残高（\(Format.dayLabel(fc.minDate))）").font(.caption).foregroundStyle(.secondary)
                        Text((selected?.value ?? fc.minBalance).yen).font(.title.bold()).monospacedDigit().foregroundStyle((selected?.value ?? fc.minBalance) < floor ? .red : .primary)
                        if floor > 0 { Text("確保ライン \(floor.yen)").font(.caption).foregroundStyle(.orange) }
                    }
                    ValueLineChart(points: points, tint: fc.minBalance < floor ? .red : .teal, floor: floor > 0 ? floor : nil, height: 200, selected: $selected)
                    HStack(alignment: .top, spacing: 8) {
                        StatTile(title: "いま", value: b.balance.yen)
                        StatTile(title: "\(days)日後", value: fc.endBalance.yen)
                    }
                    .fixedSize(horizontal: false, vertical: true)
                }
                if fc.minBalance < floor {
                    Section {
                        Button { planning = true } label: {
                            Label("この口座へ \((floor - fc.minBalance).yen) の振替を計画", systemImage: "arrow.left.arrow.right")
                        }
                    } footer: { Text("\(Format.dayLabel(fc.minDate))までに移すと、確保ラインを保てます。") }
                }
                Section("重要な日（\(important.count)日）") {
                    if important.isEmpty { Text("予定された入出金はありません").foregroundStyle(.secondary) }
                    ForEach(important) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(Format.dayLabel(r.date)).font(.subheadline.weight(.semibold))
                                Spacer()
                                Text("終わり \(r.forecastBalance.yen)").font(.caption).monospacedDigit().foregroundStyle(r.forecastBalance < floor ? .red : .secondary)
                            }
                            ForEach(Array(r.events.enumerated()), id: \.offset) { _, e in
                                HStack {
                                    Text(e.label).font(.footnote).lineLimit(1)
                                    Spacer()
                                    Text(signedYen(e.amount)).font(.footnote).monospacedDigit().foregroundStyle(e.amount > 0 ? .green : .primary)
                                }
                            }
                        }
                    }
                }
                Section {
                    NavigationLink { BankDetailView(bankId: bankId) } label: { Label("口座の詳細と履歴", systemImage: "building.columns") }
                }
            }
            .navigationTitle(b.name)
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $planning) {
                NavigationStack { TransferPlanEditor(toBankId: bankId, suggested: max(0, floor - fc.minBalance), date: fc.minDate) }
            }
        } else {
            ContentUnavailableView("口座が見つかりません", systemImage: "building.columns")
        }
    }
}

// MARK: - 試算（もし使ったら：使う前と後の残高をグラフで重ねる）

struct AcfSimulateTab: View {
    @Environment(AppModel.self) private var model
    var base: AcfForecast
    @State private var name = ""
    @State private var amount = 0.0
    @State private var date = Dates.ymd()
    @State private var method = "other"
    @State private var payId = ""
    @State private var after: AcfForecast?
    @State private var running = false
    @State private var scrub: Date?

    var body: some View {
        Form {
            Section {
                TextField("名前（例：イヤホン）", text: $name)
                AmountField(title: "金額", value: $amount)
                YMDPicker(title: "日付", value: $date)
                PaymentPicker(method: $method, paymentId: $payId)
            } header: { Text("買いたいもの") } footer: { Text("保存はしません。いまの予定に、この支払いを足した場合の見通しを比べます。") }
            Section {
                Button { run() } label: {
                    HStack { Spacer(); if running { ProgressView() } else { Label("比べる", systemImage: "wand.and.sparkles").bold() }; Spacer() }
                }
                .disabled(amount <= 0 || running)
            }
            if let a = after {
                Section {
                    chart(a)
                    compare("今日使える目安", base.safeTotalBudget, a.safeTotalBudget)
                    compare("月末予測", base.monthEndForecast, a.monthEndForecast)
                    compare("最低残高", base.minForecastBalance, a.minForecastBalance)
                    LabeledContent("状態", value: "\(base.status) → \(a.status)")
                    if a.minForecastBalance < a.reserveFloor {
                        Label("使うと、最低残したい金額を下回る日があります", systemImage: "exclamationmark.triangle.fill").foregroundStyle(.orange)
                    } else {
                        Label("使っても、最低残したい金額は保てる見込みです", systemImage: "checkmark.circle.fill").foregroundStyle(.green)
                    }
                } header: { Text("結果") }
                .transition(.opacity.combined(with: .move(edge: .bottom)))
            }
        }
        .animation(.snappy, value: after?.minForecastBalance)
    }

    private func chart(_ a: AcfForecast) -> some View {
        let rows = Array(base.rows.prefix(62)), arows = Array(a.rows.prefix(62))
        let near = { (list: [AcfRow]) in scrub.flatMap { d in list.min { abs(Dates.date($0.date).timeIntervalSince(d)) < abs(Dates.date($1.date).timeIntervalSince(d)) } } }
        let b0 = near(rows), a0 = near(arows)
        return VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(b0.map { Format.dayLabel($0.date) } ?? "なぞると、その日の残高を比べます").font(.caption).foregroundStyle(.secondary)
                Spacer()
                if let b0, let a0 {
                    Text("いま \(b0.forecastBalance.yen)").foregroundStyle(.secondary)
                    Text("使うと \(a0.forecastBalance.yen)").foregroundStyle(.pink)
                }
            }
            .font(.caption.weight(.semibold)).monospacedDigit()
            Chart {
                ForEach(rows) { r in LineMark(x: .value("日", Dates.date(r.date)), y: .value("残高", r.forecastBalance), series: .value("系列", "いま")).foregroundStyle(.teal).interpolationMethod(.stepEnd) }
                ForEach(arows) { r in LineMark(x: .value("日", Dates.date(r.date)), y: .value("残高", r.forecastBalance), series: .value("系列", "使うと")).foregroundStyle(.pink).lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 3])).interpolationMethod(.stepEnd) }
                if base.reserveFloor > 0 { RuleMark(y: .value("最低残高", base.reserveFloor)).foregroundStyle(.orange).lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3])) }
                if let d = scrub { RuleMark(x: .value("選択", d)).foregroundStyle(Color.primary.opacity(0.2)) }
            }
            .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 3)) { v in AxisGridLine(); AxisValueLabel { if let n = v.as(Double.self) { Text(compactYen(n)) } } } }
            .chartXSelection(value: $scrub)
            .onChange(of: b0?.date) { _, d in if d != nil { Feedback.selection() } }
            .frame(height: 180)
            HStack(spacing: 12) {
                HStack(spacing: 4) { Capsule().fill(.teal).frame(width: 14, height: 3); Text("いま") }
                HStack(spacing: 4) { Capsule().fill(.pink).frame(width: 14, height: 3); Text("使うと") }
            }
            .font(.caption2).foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private func compare(_ t: String, _ a: Double, _ b: Double) -> some View {
        LabeledContent(t) {
            VStack(alignment: .trailing) {
                Text("\(a.yen) → \(b.yen)").monospacedDigit()
                Text(signedYen(b - a)).font(.caption).foregroundStyle(b - a < 0 ? .red : .green)
            }
        }
    }

    private func run() {
        running = true
        let doc = model.doc, today = model.today
        var plan = LargeExpensePlan(id: "scenario")
        plan.name = name.isEmpty ? "What-if" : name; plan.date = date; plan.amount = amount; plan.priority = "required"; plan.status = "planned"
        plan.paymentMethod = method; plan.paymentId = payId; plan.category = "その他"
        Task.detached(priority: .userInitiated) {
            var copy = doc
            copy.largeExpensePlans = copy.largeExpensePlans + [plan]
            var s = copy.acfSettings; s.includeRequiredLargeExpenses = true
            let a = copy.acfForecast(today: today, settings: s)
            await MainActor.run { withAnimation(.snappy) { after = a; running = false }; Feedback.play(.success) }
        }
    }
}
