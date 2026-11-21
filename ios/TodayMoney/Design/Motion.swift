import SwiftUI

// MARK: - スケルトン（時間のかかる計算の間、形を先に出して画面を揺らさない）

/// 光が左から右へ流れる（読み込み中の印）
struct Shimmer: ViewModifier {
    @State private var phase: CGFloat = -1
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content
            .overlay {
                GeometryReader { g in
                    LinearGradient(colors: [.clear, .white.opacity(0.28), .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: g.size.width * 0.6)
                        .offset(x: phase * g.size.width * 1.6)
                        .blendMode(.plusLighter)
                }
                .mask(content)
                .allowsHitTesting(false)
            }
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.linear(duration: 1.25).repeatForever(autoreverses: false)) { phase = 1 }
            }
    }
}
extension View { func shimmer() -> some View { modifier(Shimmer()) } }

/// 灰色の帯（文字や数字の代わり）
struct SkeletonBar: View {
    var width: CGFloat? = nil
    var height: CGFloat = 12
    var body: some View {
        RoundedRectangle(cornerRadius: height / 2, style: .continuous)
            .fill(Color.primary.opacity(0.09))
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil, alignment: .leading)
    }
}

/// よく使う形：見出し・大きな数字・グラフの場所・説明
struct SkeletonCard: View {
    var chart = true
    var lines = 2
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) { Circle().fill(Color.primary.opacity(0.09)).frame(width: 26, height: 26); SkeletonBar(width: 110) }
            SkeletonBar(width: 170, height: 30)
            if chart {
                RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.primary.opacity(0.06)).frame(height: 110)
            }
            ForEach(0..<lines, id: \.self) { i in SkeletonBar(width: i == lines - 1 ? 180 : nil) }
        }
        .shimmer()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("読み込んでいます")
    }
}

// MARK: - カルーセル（横にめくるカード。ページの点つき）

struct PagedCarousel<Item: Identifiable, Content: View>: View {
    var items: [Item]
    /// 画面の横幅に対するカードの幅（1未満で次のカードが少しのぞく）
    var widthRatio: CGFloat = 0.86
    var spacing: CGFloat = 12
    @ViewBuilder var content: (Item) -> Content
    @State private var current: Item.ID?

    var body: some View {
        VStack(spacing: 10) {
            ScrollView(.horizontal) {
                LazyHStack(alignment: .top, spacing: spacing) {
                    ForEach(items) { item in
                        content(item)
                            .containerRelativeFrame(.horizontal) { w, _ in w * widthRatio }
                            .scrollTransition(.interactive, axis: .horizontal) { c, p in
                                c.scaleEffect(p.isIdentity ? 1 : 0.93).opacity(p.isIdentity ? 1 : 0.65).rotation3DEffect(.degrees(p.value * -8), axis: (0, 1, 0))
                            }
                            .id(item.id)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.viewAligned)
            .scrollPosition(id: $current)
            .scrollIndicators(.hidden)
            .contentMargins(.horizontal, 16, for: .scrollContent)
            .onChange(of: current) { _, v in if v != nil { Feedback.selection() } }
            if items.count > 1 {
                HStack(spacing: 6) {
                    ForEach(items) { item in
                        Capsule().fill(item.id == (current ?? items.first?.id) ? Color.primary.opacity(0.75) : Color.primary.opacity(0.2))
                            .frame(width: item.id == (current ?? items.first?.id) ? 18 : 7, height: 7)
                    }
                }
                .animation(.snappy, value: current)
                .accessibilityHidden(true)
            }
        }
    }
}

// MARK: - インフォグラフィックの動き

/// 0 → 1 に動く値（グラフの棒を伸ばす・線を描く・円を回す時に使う）
struct AppearProgress: ViewModifier {
    @Binding var progress: CGFloat
    var delay: Double = 0
    var duration: Double = 0.9
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content.onAppear {
            guard progress < 1 else { return }
            if reduceMotion { progress = 1; return }
            withAnimation(.spring(response: duration, dampingFraction: 0.86).delay(delay)) { progress = 1 }
        }
    }
}
extension View {
    func appearProgress(_ p: Binding<CGFloat>, delay: Double = 0, duration: Double = 0.9) -> some View {
        modifier(AppearProgress(progress: p, delay: delay, duration: duration))
    }
}

/// 金額を 0 から数え上げて見せる（初めて出た時と、値が変わった時）
struct CountUpYen: View, Animatable {
    var value: Double
    var animatableData: Double { get { value } set { value = newValue } }
    var body: some View { Text(value.rounded().yen).monospacedDigit() }
}

struct CountingYen: View {
    var value: Double
    var font: Font = .title2.weight(.bold)
    @State private var shown: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        CountUpYen(value: shown)
            .font(font)
            .accessibilityLabel(value.yen)
            .onAppear { if reduceMotion { shown = value } else { withAnimation(.easeOut(duration: 0.9)) { shown = value } } }
            .onChange(of: value) { _, v in withAnimation(.easeOut(duration: 0.6)) { shown = v } }
    }
}

/// 押したら少し沈んで、離すと戻る（カルーセルのカードなど）
struct PressScale: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.965 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

/// 左から伸びる横棒（割合を見せる）
struct GrowBar: View {
    var fraction: Double
    var tint: Color
    var height: CGFloat = 8
    var delay: Double = 0
    @State private var p: CGFloat = 0
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(Color.primary.opacity(0.08))
                Capsule().fill(tint.gradient).frame(width: max(height, g.size.width * CGFloat(min(1, max(0, fraction))) * p))
            }
        }
        .frame(height: height)
        .appearProgress($p, delay: delay)
        .accessibilityHidden(true)
    }
}

/// グラフを左から描いていく（折れ線・面）
struct RevealFromLeading: ViewModifier {
    var delay: Double = 0
    @State private var p: CGFloat = 0
    func body(content: Content) -> some View {
        content
            // 上下は大きめに取って、なぞった時の吹き出しが切れないようにする
            .mask(alignment: .leading) { GeometryReader { g in Rectangle().frame(width: g.size.width * p + (p >= 1 ? 60 : 0)).padding(.vertical, -300) } }
            .appearProgress($p, delay: delay, duration: 1.1)
    }
}
/// 棒グラフを下から伸ばす
struct GrowFromBottom: ViewModifier {
    var delay: Double = 0
    @State private var p: CGFloat = 0
    func body(content: Content) -> some View {
        content
            .mask(alignment: .bottom) { GeometryReader { g in VStack { Spacer(minLength: 0); Rectangle().frame(height: g.size.height * p + (p >= 1 ? 300 : 0)).padding(.horizontal, -60) } } }
            .appearProgress($p, delay: delay, duration: 0.85)
    }
}
extension View {
    func revealFromLeading(delay: Double = 0) -> some View { modifier(RevealFromLeading(delay: delay)) }
    func growFromBottom(delay: Double = 0) -> some View { modifier(GrowFromBottom(delay: delay)) }
}
