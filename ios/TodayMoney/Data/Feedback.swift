import AVFoundation
import SwiftUI
import TodayMoneyCore
import UIKit

/// 操作フィードバックの設定（Web 版 feedbackSettings：sound / haptic / motion / volume）
struct FeedbackSettings: Equatable {
    var sound = true, haptic = true, motion = true, volume = 0.45

    init() {}
    init(_ v: JSONValue?) {
        sound = v?["sound"]?.boolValue != false
        haptic = v?["haptic"]?.boolValue != false
        motion = v?["motion"]?.boolValue != false
        volume = min(1, max(0, v?["volume"]?.doubleValue ?? 0.45))
    }
    var json: JSONValue { .object(["sound": .bool(sound), "haptic": .bool(haptic), "motion": .bool(motion), "volume": .number(volume)]) }
}

extension MoneyDocument {
    var feedbackSettings: FeedbackSettings { FeedbackSettings(self["feedbackSettings"]) }
}

/// 操作音と触覚（Web 版 feedback.*：保存・承認・同期などで短い音と振動を返す）
@MainActor
enum Feedback {
    enum Kind { case selection, success, warning, error, delete, commit, sync, approval }

    static var settings = FeedbackSettings()

    static func play(_ kind: Kind) {
        haptic(kind)
        if kind != .selection { tone(kind) }
    }
    static func selection() { haptic(.selection) }

    // MARK: 触覚
    private static func haptic(_ kind: Kind) {
        guard settings.haptic else { return }
        switch kind {
        case .selection: UISelectionFeedbackGenerator().selectionChanged()
        case .success, .approval: UINotificationFeedbackGenerator().notificationOccurred(.success)
        case .warning: UINotificationFeedbackGenerator().notificationOccurred(.warning)
        case .error: UINotificationFeedbackGenerator().notificationOccurred(.error)
        case .delete: UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case .commit, .sync: UIImpactFeedbackGenerator(style: .light).impactOccurred()
        }
    }

    // MARK: 操作音（Web 版と同じ高さ・長さの短いサイン波）
    private static let engine = AVAudioEngine()
    private static let player = AVAudioPlayerNode()
    private static var ready = false

    private static func tone(_ kind: Kind) {
        guard settings.sound, settings.volume > 0 else { return }
        let (hz, dur): (Double, Double) = switch kind {
        case .success: (620, 0.055)
        case .approval: (720, 0.07)
        case .commit: (540, 0.045)
        case .sync: (660, 0.05)
        case .warning: (330, 0.06)
        case .error: (210, 0.08)
        case .delete: (260, 0.05)
        case .selection: (420, 0.025)
        }
        let rise = kind == .success || kind == .approval
        do {
            if !ready {
                try AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
                engine.attach(player)
                engine.connect(player, to: engine.mainMixerNode, format: nil)
                ready = true
            }
            if !engine.isRunning { try engine.start() }
            let format = player.outputFormat(forBus: 0)
            let rate = format.sampleRate
            let frames = AVAudioFrameCount((dur + 0.01) * rate)
            guard let buf = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames) else { return }
            buf.frameLength = frames
            let peak = Float(max(0.001, 0.045 * settings.volume)) * 4
            var phase = 0.0
            for i in 0..<Int(frames) {
                let t = Double(i) / rate
                // 立ち上がり 8ms → 指数的に減衰（Web 版の gain カーブ）
                let env = t < 0.008 ? t / 0.008 : max(0, exp(-6 * (t - 0.008) / max(0.001, dur - 0.008)))
                let f = rise ? hz * pow(1.22, min(1, t / dur)) : hz
                phase += 2 * .pi * f / rate
                let s = Float(sin(phase) * env) * peak
                for ch in 0..<Int(format.channelCount) { buf.floatChannelData?[ch][i] = s }
            }
            player.scheduleBuffer(buf, at: nil, options: .interrupts)
            if !player.isPlaying { player.play() }
        } catch {}
    }
}

extension View {
    /// 設定で触覚が有効な時だけの選択フィードバック
    func selectionFeedback<T: Equatable>(trigger: T) -> some View {
        onChange(of: trigger) { Feedback.selection() }
    }
    /// 設定で触覚・音が有効な時だけの完了フィードバック
    func successFeedback<T: Equatable>(trigger: T) -> some View {
        onChange(of: trigger) { Feedback.play(.success) }
    }
}
