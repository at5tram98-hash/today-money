import SwiftUI

// ホームのカードの決まり（どこが押せるかを見た目で分ける）
//  1. 押すと別の画面へ移るカード … タイトル行の右端に「›」、押すと少し沈んで暗くなる（TapCard）
//  2. カードの中の操作 … 色のついたカプセルのボタン（PillButton）。文字だけのリンクは使わない
//  3. 押せない情報 … 「›」なし・枠なし（InfoBlock）

/// 押した時に沈んで暗くなる（カード全体が1つのボタンだと分かる）
struct CardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.975 : 1)
            .brightness(configuration.isPressed ? -0.04 : 0)
            .animation(.snappy(duration: 0.18), value: configuration.isPressed)
    }
}

/// カードの見出し（アイコン・タイトル・右端の「›」）
struct CardHeader: View {
    var title: String
    var systemImage: String
    var tint: Color
    var showsChevron = false
    var trailing: AnyView? = nil
    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.footnote.weight(.bold)).foregroundStyle(.white)
                .frame(width: 26, height: 26)
                .background(tint.gradient, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
            Text(title).font(.subheadline.weight(.semibold))
            Spacer(minLength: 4)
            if let trailing { trailing }
            if showsChevron {
                Image(systemName: "chevron.right").font(.subheadline.weight(.bold)).foregroundStyle(.tertiary)
            }
        }
    }
}

/// 押すと移動するカード
struct TapCard<Content: View, Destination: View>: View {
    var title: String
    var systemImage: String
    var tint: Color
    var accessibilityHint: String = "詳しく見る"
    @ViewBuilder var destination: () -> Destination
    @ViewBuilder var content: Content
    var body: some View {
        NavigationLink(destination: destination) {
            VStack(alignment: .leading, spacing: 12) {
                CardHeader(title: title, systemImage: systemImage, tint: tint, showsChevron: true)
                content
            }
            .cardSurface()
        }
        .buttonStyle(CardPressStyle())
        .accessibilityHint(accessibilityHint)
    }
}

/// 押すと動作をするカード（画面を積まずに開くもの：ACFセンターなど）
struct ActionCard<Content: View>: View {
    var title: String
    var systemImage: String
    var tint: Color
    var accessibilityHint: String = "開く"
    var action: () -> Void
    @ViewBuilder var content: Content
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                CardHeader(title: title, systemImage: systemImage, tint: tint, showsChevron: true)
                content
            }
            .cardSurface()
        }
        .buttonStyle(CardPressStyle())
        .accessibilityHint(accessibilityHint)
    }
}

/// 押せない情報のかたまり（枠を付けない）
struct InfoBlock<Content: View>: View {
    var title: String
    var systemImage: String
    var tint: Color
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            CardHeader(title: title, systemImage: systemImage, tint: tint, showsChevron: false)
            content
        }
        .padding(.horizontal, 4).padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// カードの中のボタン（色のついたカプセル）
struct PillButton: View {
    var title: String
    var systemImage: String? = nil
    var tint: Color = .accentColor
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(tint.opacity(0.14), in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(CardPressStyle())
    }
}

/// ナビゲーションのカプセルボタン
struct PillLink<Destination: View>: View {
    var title: String
    var systemImage: String? = nil
    var tint: Color = .accentColor
    @ViewBuilder var destination: () -> Destination
    var body: some View {
        NavigationLink(destination: destination) {
            HStack(spacing: 5) {
                if let systemImage { Image(systemName: systemImage) }
                Text(title)
                Image(systemName: "chevron.right").font(.caption.weight(.bold))
            }
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 14).padding(.vertical, 8)
            .background(tint.opacity(0.14), in: Capsule())
        }
        .buttonStyle(CardPressStyle())
    }
}

/// ホームの区切り見出し
struct HomeSectionTitle: View {
    var title: String
    var body: some View {
        Text(title).font(.title3.bold()).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 10).padding(.horizontal, 4)
    }
}

extension View {
    /// 押せるカードの面（白い面・角丸・薄い影）
    func cardSurface() -> some View {
        padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: .black.opacity(0.06), radius: 8, y: 2)
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}
