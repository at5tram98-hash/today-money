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
        LabeledContent(title) { AmountInput(value: $value).multilineTextAlignment(.trailing) }
    }
}

/// 金額の入力欄。押すと新しく打ち直す（今の金額は薄く見えたまま）。打つたびに値が決まるので、
/// 数字キーボードのまま「保存」を押しても打った金額で保存される（前は欄を離れるまで反映されず、
/// 既存の「13,000」の後ろに数字が付いて「13,00020000」のような値になることがあった）
struct AmountInput: View {
    @Binding var value: Double
    var font: Font = .body
    var allowNegative = false
    @State private var text = ""
    @State private var editing = false
    @FocusState private var focused: Bool

    var body: some View {
        TextField(Self.grouped(value), text: $text)
            .keyboardType(allowNegative ? .numbersAndPunctuation : .numberPad)
            .font(font)
            .monospacedDigit()
            .focused($focused)
            .onAppear { if !focused { text = value == 0 ? "" : Self.grouped(value) } }
            .onChange(of: focused) { _, f in
                editing = f
                text = f ? "" : (value == 0 ? "" : Self.grouped(value))
            }
            .onChange(of: text) { _, t in
                guard editing else { return }
                var digits = t.filter(\.isNumber).map { String($0) }.joined()
                digits = String(digits.prefix(12))
                let neg = allowNegative && (t.hasPrefix("-") || t.hasPrefix("−"))
                let shown = (neg ? "-" : "") + digits
                if shown != t { text = shown; return }
                if let n = Double(digits) { value = neg ? -n : n }
            }
            .onChange(of: value) { _, v in if !focused { text = v == 0 ? "" : Self.grouped(v) } }
    }
    static func grouped(_ v: Double) -> String { v.formatted(.number.grouping(.automatic).precision(.fractionLength(0))) }
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
