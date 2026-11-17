import SwiftUI
import TodayMoneyCore

/// ホーム：今日の支出・総資産・今月の給与（Web 版ホームの5枚のうち、移した3枚）
struct HomeScreen: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let doc = model.doc, today = model.today, month = model.thisMonth
        let spentToday = doc.spentDay(today), goal = doc.dailyGoal(today)
        let salary = doc.salarySummary(month, today: today)
        let next = doc.nextSalaryEvent(month, today: today)
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    NavigationLink { SpendingDayView(date: today) } label: {
                        SummaryCard(title: "支出", systemImage: "flame.fill", tint: Theme.spending) {
                            Text("今日・\(Format.dayLabel(today))").font(.footnote).foregroundStyle(.secondary)
                            if goal > 0 {
                                MoneyText(value: max(0, goal - spentToday))
                                Text("あと使える額（目標 \(goal.yen)・使った額 \(spentToday.yen)）").font(.footnote).foregroundStyle(.secondary)
                                ProgressView(value: min(1, spentToday / max(goal, 1))).tint(spentToday > goal ? .red : Theme.spending)
                            } else {
                                MoneyText(value: spentToday)
                                Text(spentToday > 0 ? "今日使った額" : "まだ使っていません").font(.footnote).foregroundStyle(.secondary)
                            }
                            Divider()
                            LabeledContent("今月の支出", value: doc.spentMonth(month).yen).font(.subheadline)
                        }
                    }
                    NavigationLink { AssetsView() } label: {
                        SummaryCard(title: "総資産", systemImage: "building.columns.fill", tint: Theme.assets) {
                            MoneyText(value: doc.totalBankBalance)
                            Text("口座 \(doc.banks.count)件の合計").font(.footnote).foregroundStyle(.secondary)
                        }
                    }
                    NavigationLink { SalaryMonthView(month: month) } label: {
                        SummaryCard(title: "今月の給与", systemImage: "briefcase.fill", tint: Theme.salary) {
                            MoneyText(value: salary.total)
                            Text("今月の受取見込み").font(.footnote).foregroundStyle(.secondary)
                            if let next {
                                Divider()
                                LabeledContent("次の給料日", value: "\(Format.shortDay(next.date))・\(next.name) \(next.amount.yen)").font(.subheadline)
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("ホーム")
        }
    }
}

/// 今日の支出（その日の記録）
struct SpendingDayView: View {
    @Environment(AppModel.self) private var model
    var date: String
    var body: some View {
        let list = model.doc.transactions(on: date)
        List {
            Section {
                LabeledContent("合計", value: model.doc.spentDay(date).yen).font(.headline)
            }
            Section("記録") {
                if list.isEmpty { Text("この日の支出はありません").foregroundStyle(.secondary) }
                ForEach(list) { t in
                    LabeledContent {
                        Text(t.amount.yen).monospacedDigit()
                    } label: {
                        Text(t.merchant.isEmpty ? t.category : t.merchant)
                        Text(t.category).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
        }
        .navigationTitle(Format.dayLabel(date))
    }
}

/// 口座の残高
struct AssetsView: View {
    @Environment(AppModel.self) private var model
    var body: some View {
        List {
            Section {
                LabeledContent("合計", value: model.doc.totalBankBalance.yen).font(.headline)
            }
            Section("口座") {
                ForEach(model.doc.banks) { b in
                    LabeledContent(b.name, value: b.balance.yen).monospacedDigit()
                }
            }
        }
        .navigationTitle("総資産")
    }
}

#Preview {
    HomeScreen().environment(AppModel.preview())
}
