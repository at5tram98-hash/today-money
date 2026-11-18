import SwiftUI
import Charts
import TodayMoneyCore

/// 予定の入出金から見た、日ごとの口座残高の見通し
struct CashFlowModel {
    struct Day: Identifiable { var date: String; var balance: Double; var events: [FinancialEvent]; var id: String { date } }
    var days: [Day]
    var reserveFloor: Double
    var minDay: Day? { days.min { $0.balance < $1.balance } }
    var firstShort: Day? { days.first { $0.balance < reserveFloor } }

    init(doc: MoneyDocument, today: String, days count: Int = 60) {
        let events = doc.financialEvents(from: today, days: count, today: today)
        var bal = doc.totalBankBalance, out: [Day] = []
        for i in 0...count {
            let d = Dates.addDays(today, i)
            let ev = events.filter { $0.date == d }
            bal += ev.reduce(0) { $0 + $1.amount }
            out.append(Day(date: d, balance: bal, events: ev))
        }
        days = out
        reserveFloor = num(doc["acfSettings"]?["reserveFloor"])
    }
}

/// 支払いタブの小さなグラフ
struct CashFlowPreview: View {
    @Environment(AppModel.self) private var model
    var month: String
    var body: some View {
        let cf = CashFlowModel(doc: model.doc, today: model.today, days: 45)
        VStack(alignment: .leading, spacing: 8) {
            Chart(cf.days) { d in
                AreaMark(x: .value("日", Dates.date(d.date)), y: .value("残高", d.balance)).foregroundStyle(.teal.opacity(0.15)).interpolationMethod(.stepEnd)
                LineMark(x: .value("日", Dates.date(d.date)), y: .value("残高", d.balance)).foregroundStyle(.teal).interpolationMethod(.stepEnd)
                if cf.reserveFloor > 0 { RuleMark(y: .value("最低残高", cf.reserveFloor)).foregroundStyle(.orange).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3])) }
            }
            .chartXAxis { AxisMarks(values: .stride(by: .day, count: 14)) { AxisValueLabel(format: .dateTime.month(.defaultDigits).day()) } }
            .frame(height: 120)
            .accessibilityLabel("45日間の残高の見通し")
            HStack {
                metric("最低残高", cf.minDay?.balance ?? 0, warn: (cf.minDay?.balance ?? 0) < cf.reserveFloor)
                metric("45日後", cf.days.last?.balance ?? 0, warn: false)
            }
            Text(cf.firstShort.map { "\(Format.dayLabel($0.date))に\(cf.reserveFloor > 0 ? "最低残したい額" : "残高")を下回る見込みです" } ?? "登録済みの予定では、残高は不足しません")
                .font(.footnote).foregroundStyle(cf.firstShort == nil ? Color.secondary : Color.red)
        }
        .padding(.vertical, 4)
    }
    private func metric(_ t: String, _ v: Double, warn: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(t).font(.caption).foregroundStyle(.secondary)
            Text(v.yen).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(warn ? .red : .primary)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// 資金見通し（日ごとの残高と入出金の予定）
struct CashFlowView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        let cf = CashFlowModel(doc: model.doc, today: model.today, days: 90)
        List {
            Section {
                Chart(cf.days) { d in
                    LineMark(x: .value("日", Dates.date(d.date)), y: .value("残高", d.balance)).interpolationMethod(.stepEnd).foregroundStyle(.teal)
                    if cf.reserveFloor > 0 { RuleMark(y: .value("最低残高", cf.reserveFloor)).foregroundStyle(.orange).lineStyle(StrokeStyle(lineWidth: 1, dash: [4, 3])) }
                }
                .frame(height: 200)
                LabeledContent("今の口座残高の合計", value: model.doc.totalBankBalance.yen)
                LabeledContent("90日間の最低残高", value: (cf.minDay?.balance ?? 0).yen)
                if cf.reserveFloor > 0 { LabeledContent("最低残したい額", value: cf.reserveFloor.yen) }
            } footer: {
                Text("給与・カード引落・固定支払い（カード以外）・必須の大型支出を、日付順に今の口座残高から足し引きしています。日々の支出の見込みは含みません。")
            }
            ForEach(cf.days.filter { !$0.events.isEmpty }) { d in
                Section {
                    ForEach(d.events) { e in
                        HStack {
                            Image(systemName: e.type == .income ? "arrow.down.circle.fill" : e.type == .card ? "creditcard.fill" : e.type == .fixed ? "repeat.circle.fill" : "cart.circle.fill")
                                .foregroundStyle(e.type == .income ? .green : .secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(e.title)
                                Text(e.detail).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(signedYen(e.amount)).monospacedDigit().foregroundStyle(e.amount > 0 ? .green : .primary)
                        }
                    }
                } header: {
                    HStack {
                        Text("\(Format.dayLabel(d.date))・\(daysUntilText(d.date, today: model.today))")
                        Spacer()
                        Text("残高 \(d.balance.yen)").monospacedDigit().foregroundStyle(d.balance < cf.reserveFloor ? .red : .secondary)
                    }
                }
            }
        }
        .navigationTitle("資金見通し")
    }
}
