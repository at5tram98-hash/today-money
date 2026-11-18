// アプリアイコン（ライト・ダーク・色合い）を描いて PNG にする
//   swift ios/tools/make-icon.swift <出力フォルダ>
import AppKit
import CoreGraphics

let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "."
let S: CGFloat = 1024
func rgb(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255, blue: CGFloat(hex & 0xff) / 255, alpha: a)
}
func gradient(_ cs: [CGColor], _ locs: [CGFloat]? = nil) -> CGGradient {
    CGGradient(colorsSpace: CGColorSpace(name: CGColorSpace.sRGB), colors: cs as CFArray, locations: locs)!
}

enum Style { case light, dark, tinted }

func draw(_ style: Style, to file: String) {
    let cs = CGColorSpace(name: CGColorSpace.sRGB)!
    let g = CGContext(data: nil, width: Int(S), height: Int(S), bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                      bitmapInfo: style == .light ? CGImageAlphaInfo.noneSkipLast.rawValue : CGImageAlphaInfo.premultipliedLast.rawValue)!
    // 上を y=0 にする
    g.translateBy(x: 0, y: S); g.scaleBy(x: 1, y: -1)

    // 背景
    switch style {
    case .light:
        g.drawLinearGradient(gradient([rgb(0x5AB0FF), rgb(0x2A7DF6), rgb(0x0B4FD4)], [0, 0.5, 1]), start: .zero, end: CGPoint(x: 0, y: S), options: [])
        g.drawRadialGradient(gradient([rgb(0xFFFFFF, 0.28), rgb(0xFFFFFF, 0)]), startCenter: CGPoint(x: 260, y: 120), startRadius: 0,
                             endCenter: CGPoint(x: 260, y: 120), endRadius: 700, options: [])
    case .dark:
        g.drawLinearGradient(gradient([rgb(0x22262F), rgb(0x0B0D12)]), start: .zero, end: CGPoint(x: 0, y: S), options: [])
    case .tinted:
        g.setFillColor(rgb(0x000000)); g.fill(CGRect(x: 0, y: 0, width: S, height: S))
    }

    let c = CGPoint(x: 512, y: 520), r: CGFloat = 318
    let coin = CGRect(x: c.x - r, y: c.y - r, width: 2 * r, height: 2 * r)

    // 影（ふわっと浮いて見える）
    if style != .tinted {
        g.saveGState()
        g.setShadow(offset: CGSize(width: 0, height: -34), blur: 70, color: rgb(0x001A55, style == .light ? 0.45 : 0.8))
        g.setFillColor(rgb(0xFFFFFF)); g.fillEllipse(in: coin)
        g.restoreGState()
    }

    // コインの面
    g.saveGState()
    g.addEllipse(in: coin); g.clip()
    let face: [CGColor] = switch style {
    case .light: [rgb(0xFFFFFF), rgb(0xEAF2FF), rgb(0xCFDFFB)]
    case .dark: [rgb(0x5AA6FF), rgb(0x2B78F2), rgb(0x1149C4)]
    case .tinted: [rgb(0xFFFFFF), rgb(0xD9D9D9), rgb(0xB8B8B8)]
    }
    g.drawLinearGradient(gradient(face, [0, 0.55, 1]), start: CGPoint(x: 0, y: coin.minY), end: CGPoint(x: 0, y: coin.maxY), options: [])
    g.restoreGState()

    // 縁の内側のリング
    let ringR = r - 46
    g.setLineWidth(10)
    g.setStrokeColor(style == .light ? rgb(0x2A7DF6, 0.16) : style == .dark ? rgb(0xFFFFFF, 0.22) : rgb(0x000000, 0.18))
    g.strokeEllipse(in: CGRect(x: c.x - ringR, y: c.y - ringR, width: 2 * ringR, height: 2 * ringR))
    // 上の縁の光
    g.setLineWidth(6)
    g.setStrokeColor(rgb(0xFFFFFF, style == .dark ? 0.35 : 0.9))
    g.addArc(center: c, radius: r - 3, startAngle: .pi * 1.12, endAngle: .pi * 1.88, clockwise: false); g.strokePath()

    // ¥（Web 版のアイコンと同じ形を拡大）
    let s: CGFloat = 3.25, ox = c.x - 96 * s, oy = c.y + 6 - 96.5 * s
    func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + x * s, y: oy + y * s) }
    let yen = CGMutablePath()
    yen.move(to: p(64, 50)); yen.addLine(to: p(96, 94)); yen.addLine(to: p(128, 50))
    yen.move(to: p(64, 101)); yen.addLine(to: p(128, 101))
    yen.move(to: p(64, 121)); yen.addLine(to: p(128, 121))
    yen.move(to: p(96, 94)); yen.addLine(to: p(96, 145))
    let stroked = yen.copy(strokingWithWidth: 13.5 * s, lineCap: .round, lineJoin: .round, miterLimit: 10)

    g.saveGState()
    g.addPath(stroked); g.clip()
    let ink: [CGColor] = switch style {
    case .light: [rgb(0x3D93FF), rgb(0x0B52DA)]
    case .dark: [rgb(0xFFFFFF), rgb(0xDCE8FF)]
    case .tinted: [rgb(0x000000, 0.0), rgb(0x000000, 0.0)]
    }
    if style == .tinted {
        // 色合いモードは明るさだけが使われるので、文字は抜いて暗くする
        g.setBlendMode(.copy); g.setFillColor(rgb(0x000000)); g.fill(CGRect(x: 0, y: 0, width: S, height: S))
    } else {
        g.drawLinearGradient(gradient(ink), start: CGPoint(x: 0, y: c.y - 200), end: CGPoint(x: 0, y: c.y + 220), options: [])
    }
    g.restoreGState()

    let img = g.makeImage()!
    let rep = NSBitmapImageRep(cgImage: img)
    try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(out)/\(file)"))
}

draw(.light, to: "AppIcon-1024.png")
draw(.dark, to: "AppIcon-1024-dark.png")
draw(.tinted, to: "AppIcon-1024-tinted.png")
print("ok")
