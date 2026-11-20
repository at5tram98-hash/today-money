import SwiftUI

/// ACF を計算している間の表示（ACFセンターを開いた時）。
/// 線が左から描かれていき、ゲージが回り、いま何を集めているかを順に見せる。
struct AcfCalculatingView: View {
    @State private var draw: CGFloat = 0
    @State private var spin = false
    @State private var step = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    private let steps = ["口座の残高を集めています", "給与と入金の予定を並べています", "カードの引落を計算しています", "固定支払い・大型支出を足しています", "日ごとの残高を予測しています"]

    var body: some View {
        VStack(spacing: 26) {
            ZStack {
                Circle().stroke(Color.teal.opacity(0.12), lineWidth: 10)
                Circle().trim(from: 0, to: 0.28)
                    .stroke(AngularGradient(colors: [.teal.opacity(0), .teal, .green], center: .center), style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(spin ? 360 : 0))
                AcfDrawingLine(progress: draw)
                    .stroke(LinearGradient(colors: [.teal, .green], startPoint: .leading, endPoint: .trailing), style: StrokeStyle(lineWidth: 3.5, lineCap: .round, lineJoin: .round))
                    .frame(width: 92, height: 46)
            }
            .frame(width: 150, height: 150)
            VStack(spacing: 8) {
                Text("ACFを計算しています").font(.title3.weight(.bold))
                Text(steps[step]).font(.subheadline).foregroundStyle(.secondary)
                    .contentTransition(.opacity)
                    .id(step)
                    .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity), removal: .move(edge: .top).combined(with: .opacity)))
            }
            .frame(height: 56)
            HStack(spacing: 6) {
                ForEach(steps.indices, id: \.self) { i in
                    Capsule().fill(i <= step ? Color.teal : Color.teal.opacity(0.18))
                        .frame(width: i == step ? 22 : 8, height: 8)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("ACFを計算しています")
        .onAppear {
            guard !reduceMotion else { draw = 1; return }
            withAnimation(.linear(duration: 1.1).repeatForever(autoreverses: false)) { spin = true }
            withAnimation(.easeInOut(duration: 1.4).repeatForever(autoreverses: false)) { draw = 1 }
        }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(700))
                withAnimation(.spring(response: 0.4, dampingFraction: 0.85)) { step = (step + 1) % steps.count }
            }
        }
    }
}

/// 描かれていく折れ線（残高の上下のような形）
struct AcfDrawingLine: Shape {
    var progress: CGFloat
    var animatableData: CGFloat { get { progress } set { progress = newValue } }
    func path(in r: CGRect) -> Path {
        let ys: [CGFloat] = [0.55, 0.35, 0.5, 0.2, 0.42, 0.62, 0.3, 0.45]
        var p = Path()
        for (i, y) in ys.enumerated() {
            let pt = CGPoint(x: r.minX + r.width * CGFloat(i) / CGFloat(ys.count - 1), y: r.minY + r.height * y)
            if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
        }
        return p.trimmedPath(from: 0, to: max(0.001, progress))
    }
}

/// カードの中の小さな「計算中」（ホームの ACF カード・支払いタブなど）
struct AcfCalculatingInline: View {
    @State private var draw: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        HStack(spacing: 12) {
            AcfDrawingLine(progress: draw)
                .stroke(Color.teal, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
                .frame(width: 46, height: 22)
            Text("ACFを計算しています…").font(.subheadline).foregroundStyle(.secondary)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, minHeight: 60)
        .onAppear {
            guard !reduceMotion else { draw = 1; return }
            withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: false)) { draw = 1 }
        }
        .accessibilityElement(children: .combine)
    }
}

/// ACFセンターで計算し直している間に上に出す小さな印
struct AcfRecalcPill: View {
    var body: some View {
        HStack(spacing: 8) {
            ProgressView().controlSize(.small)
            Text("計算し直しています").font(.footnote.weight(.semibold))
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .acfGlass(Capsule())
        .transition(.move(edge: .top).combined(with: .opacity))
    }
}

/// 計算が終わった後、カードを上から順に、下からふわっと浮かび上がらせる
struct AcfReveal: ViewModifier {
    var index: Int
    @State private var shown = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : 36)
            .scaleEffect(shown ? 1 : 0.96, anchor: .top)
            .blur(radius: shown ? 0 : 6)
            .onAppear {
                guard !shown else { return }
                if reduceMotion { shown = true; return }
                withAnimation(.spring(response: 0.55, dampingFraction: 0.82).delay(0.06 + Double(index) * 0.07)) { shown = true }
            }
    }
}
extension View {
    func acfReveal(_ index: Int) -> some View { modifier(AcfReveal(index: index)) }
}
