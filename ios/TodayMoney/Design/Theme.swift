import SwiftUI
import TodayMoneyCore

/// 色・金額の表示・カードなど、画面共通の部品（Apple 純正アプリのように、標準の部品を基本にする）
enum Theme {
    static let spending = Color.orange
    static let assets = Color.blue
    static let salary = Color.green
    static let acf = Color.teal
}

extension Double {
    /// ¥1,234（マイナスは −¥1,234）
    var yen: String { Format.yen(self) }
}

/// 金額（丸みのある数字・桁がそろう）
struct MoneyText: View {
    var value: Double
    var size: CGFloat = 34
    var weight: Font.Weight = .bold
    var body: some View {
        Text(value.yen)
            .moneyFont(size, weight: weight)
            .monospacedDigit()
            .contentTransition(.numericText(value: value))
    }
}

/// ヘルスケアの概要のようなカード（見出し・中身・押すと詳しく）
struct SummaryCard<Content: View>: View {
    var title: String
    var systemImage: String
    var tint: Color
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                Text(title)
                Spacer()
                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(tint)
            content
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.background.secondary, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

/// 状態のカプセル（入金済み・入金予定・未確認）
struct StatusPill: View {
    var status: SalaryStatus
    var body: some View {
        Text(status.rawValue)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: Capsule())
    }
    var color: Color {
        switch status {
        case .received: return .green
        case .overdue: return .orange
        case .planned: return .blue
        }
    }
}

/// 金額の入力欄（数字キーボード・右寄せ）
struct AmountField: View {
    var title: String
    @Binding var value: Double
    var body: some View {
        LabeledContent(title) {
            TextField("0", value: $value, format: .number.grouping(.automatic))
                .keyboardType(.numberPad)
                .multilineTextAlignment(.trailing)
                .monospacedDigit()
        }
    }
}

/// 大きな金額の文字。文字サイズの設定（Dynamic Type）に合わせて大きく・小さくなる
struct ScaledMoneyFont: ViewModifier {
    @ScaledMetric private var size: CGFloat
    let weight: Font.Weight
    init(size: CGFloat, weight: Font.Weight) { _size = ScaledMetric(wrappedValue: size, relativeTo: .largeTitle); self.weight = weight }
    func body(content: Content) -> some View {
        content.font(.system(size: min(size, 96), weight: weight, design: .rounded)).minimumScaleFactor(0.4).lineLimit(1)
    }
}

extension View {
    func moneyFont(_ size: CGFloat, weight: Font.Weight = .bold) -> some View { modifier(ScaledMoneyFont(size: size, weight: weight)) }
}
