import Foundation
import AuthenticationServices
import CryptoKit
import Security
import UIKit
import TodayMoneyCore

/// Gmail（読み取り専用）への接続と金融メールの取得（Web 版 14-gmail.js の gmailRequestToken / gmailFetch / syncGmail）。
///
/// Web 版は「ウェブ アプリケーション」の OAuth クライアントを使うが、iPhone では Google Cloud で作った
/// 「iOS」の OAuth クライアント ID を使う（Client Secret は不要・PKCE で認可）。
/// 読み取ったメールの内容はこの iPhone の中だけで解析し、Google 以外には送らない。
/// 更新用のトークンはキーチェーンにだけ保存する（バックアップの .json には入らない）。
@MainActor
final class GmailService: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = GmailService()

    private(set) var accessToken = ""
    private(set) var expiresAt = Date.distantPast
    private(set) var syncing = false
    private var session: ASWebAuthenticationSession?

    var tokenValid: Bool { !accessToken.isEmpty && Date() < expiresAt.addingTimeInterval(-60) }
    var hasRefreshToken: Bool { Keychain.read(Self.refreshKey) != nil }
    static let refreshKey = "gmail.refreshToken"

    enum GmailError: LocalizedError {
        case message(String)
        var errorDescription: String? { if case .message(let m) = self { return m }; return nil }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first { $0.isKeyWindow } ?? ASPresentationAnchor()
        }
    }

    /// "123-abc.apps.googleusercontent.com" → "com.googleusercontent.apps.123-abc"
    static func redirectScheme(_ clientId: String) -> String {
        let base = clientId.replacingOccurrences(of: ".apps.googleusercontent.com", with: "")
        return "com.googleusercontent.apps.\(base)"
    }

    // MARK: 接続

    /// Google の同意画面を開いてトークンを受け取る（Web 版 gmailRequestToken）
    func connect(clientId: String) async throws {
        let id = clientId.trimmingCharacters(in: .whitespaces)
        guard id.hasSuffix(".apps.googleusercontent.com") else { throw GmailError.message("iOS 用の Google OAuth クライアントIDを設定してください。") }
        let verifier = Self.randomString(64)
        let challenge = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        let scheme = Self.redirectScheme(id), redirect = "\(scheme):/oauth2redirect", state = Self.randomString(24)
        var c = URLComponents(string: "https://accounts.google.com/o/oauth2/v2/auth")!
        c.queryItems = [
            .init(name: "client_id", value: id), .init(name: "redirect_uri", value: redirect), .init(name: "response_type", value: "code"),
            .init(name: "scope", value: MailParser.scope), .init(name: "code_challenge", value: challenge), .init(name: "code_challenge_method", value: "S256"),
            .init(name: "state", value: state), .init(name: "prompt", value: "consent"), .init(name: "access_type", value: "offline"),
        ]
        let callback: URL = try await withCheckedThrowingContinuation { cont in
            let s = ASWebAuthenticationSession(url: c.url!, callbackURLScheme: scheme) { url, error in
                if let url { cont.resume(returning: url) }
                else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin { cont.resume(throwing: GmailError.message("接続をキャンセルしました。")) }
                else { cont.resume(throwing: GmailError.message(error?.localizedDescription ?? "Google に接続できませんでした。")) }
            }
            s.presentationContextProvider = self
            s.prefersEphemeralWebBrowserSession = false
            session = s
            s.start()
        }
        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let e = items.first(where: { $0.name == "error" })?.value { throw GmailError.message("Google が接続を許可しませんでした（\(e)）。") }
        guard items.first(where: { $0.name == "state" })?.value == state, let code = items.first(where: { $0.name == "code" })?.value else {
            throw GmailError.message("Google からの応答を確認できませんでした。")
        }
        try await token(["client_id": id, "code": code, "code_verifier": verifier, "redirect_uri": redirect, "grant_type": "authorization_code"])
    }

    /// 保存してある更新用トークンで、アクセストークンを取り直す
    func refresh(clientId: String) async throws {
        guard let rt = Keychain.read(Self.refreshKey) else { throw GmailError.message("Gmail に接続してください。") }
        try await token(["client_id": clientId.trimmingCharacters(in: .whitespaces), "refresh_token": rt, "grant_type": "refresh_token"])
    }

    private func token(_ form: [String: String]) async throws {
        var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var allowed = CharacterSet.alphanumerics; allowed.insert(charactersIn: "-._~")
        req.httpBody = form.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: allowed) ?? "")" }.joined(separator: "&").data(using: .utf8)
        let (data, resp) = try await URLSession.shared.data(for: req)
        let json = try JSONValue.parse(data)
        guard (resp as? HTTPURLResponse)?.statusCode == 200, let at = json["access_token"]?.stringValue else {
            if str(json["error"]) == "invalid_grant" { Keychain.delete(Self.refreshKey) }
            throw GmailError.message("Google の認証に失敗しました（\(str(json["error_description"]).isEmpty ? str(json["error"]) : str(json["error_description"]))）。")
        }
        accessToken = at
        expiresAt = Date().addingTimeInterval(optNum(json["expires_in"]) ?? 3600)
        if let rt = json["refresh_token"]?.stringValue, !rt.isEmpty { Keychain.save(Self.refreshKey, rt) }
    }

    /// 接続を切る（トークンを取り消してキーチェーンから消す）
    func disconnect() async {
        let t = Keychain.read(Self.refreshKey) ?? accessToken
        accessToken = ""; expiresAt = .distantPast
        Keychain.delete(Self.refreshKey)
        guard !t.isEmpty, var c = URLComponents(string: "https://oauth2.googleapis.com/revoke") else { return }
        c.queryItems = [.init(name: "token", value: t)]
        var req = URLRequest(url: c.url!); req.httpMethod = "POST"
        _ = try? await URLSession.shared.data(for: req)
    }

    /// 期限が切れていれば取り直す
    func ensureToken(clientId: String) async throws {
        if tokenValid { return }
        if hasRefreshToken { try await refresh(clientId: clientId); return }
        throw GmailError.message("Gmail に接続してください。")
    }

    // MARK: 取得

    /// Gmail API（Web 版 gmailFetch：時間切れ・通信断・429/5xx は待ってから再試行）
    func fetch(_ url: URL, attempts: Int = 4) async throws -> JSONValue {
        var last: Error = GmailError.message("Gmailから取得できませんでした")
        for n in 0..<attempts {
            if n > 0 { try await Task.sleep(nanoseconds: UInt64(min(8000, 1000 * (1 << (n - 1))) + Int.random(in: 0...400)) * 1_000_000) }
            var req = URLRequest(url: url, timeoutInterval: 20)
            req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            let data: Data, resp: URLResponse
            do { (data, resp) = try await URLSession.shared.data(for: req) }
            catch { last = GmailError.message("通信できませんでした。電波の良い所でもう一度お試しください。"); continue }
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if code == 401 { accessToken = ""; expiresAt = .distantPast; throw GmailError.message("Gmailの認証期限が切れました。再接続してください。") }
            if code == 429 || code >= 500 { last = GmailError.message(code == 429 ? "Gmailの利用回数の上限に達しました。少し待ってから再試行します。" : "Gmailが一時的に応答していません (\(code))"); continue }
            let json = (try? JSONValue.parse(data)) ?? .null
            guard (200..<300).contains(code) else { throw GmailError.message(str(json["error"]?["message"]).isEmpty ? "Gmail APIエラー (\(code))" : str(json["error"]?["message"])) }
            return json
        }
        throw last
    }

    func profileEmail() async throws -> String {
        str(try await fetch(URL(string: "https://gmail.googleapis.com/gmail/v1/users/me/profile")!)["emailAddress"])
    }

    /// 金融メールを探して取り込む（Web 版 syncGmail）。確認待ちになったメールの ID を返す
    func sync(model: AppModel, progress: @escaping (String) -> Void = { _ in }) async throws -> [String] {
        guard !syncing else { return [] }
        syncing = true
        defer { syncing = false }
        let clientId = str(model.doc.gmailSettings["iosClientId"])
        do {
            try await ensureToken(clientId: clientId)
            progress("Gmailから新しい金融メールを探しています")
            var ids: [String] = [], pageToken = "", pages = 0
            repeat {
                var c = URLComponents(string: "https://gmail.googleapis.com/gmail/v1/users/me/messages")!
                c.queryItems = [.init(name: "maxResults", value: "100"), .init(name: "q", value: model.doc.gmailQuery)] + (pageToken.isEmpty ? [] : [.init(name: "pageToken", value: pageToken)])
                let list = try await fetch(c.url!)
                ids += (list["messages"]?.arrayValue ?? []).map { str($0["id"]) }
                pageToken = str(list["nextPageToken"]); pages += 1
            } while !pageToken.isEmpty && pages < 3
            let targets = model.doc.mailIdsToFetch(ids)
            var messages: [JSONValue] = [], failed = 0
            for start in stride(from: 0, to: targets.count, by: 6) {
                let batch = Array(targets[start..<min(start + 6, targets.count)])
                progress("金額と利用先を読み取っています（\(min(start + 6, targets.count)) / \(targets.count)件）")
                let results = await withTaskGroup(of: Result<JSONValue, Error>.self) { g in
                    for id in batch {
                        g.addTask { @MainActor in
                            let url = URL(string: "https://gmail.googleapis.com/gmail/v1/users/me/messages/\(id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id)?format=full")!
                            do { return .success(try await self.fetch(url)) } catch { return .failure(error) }
                        }
                    }
                    var out: [Result<JSONValue, Error>] = []
                    for await r in g { out.append(r) }
                    return out
                }
                for r in results {
                    switch r {
                    case .success(let m): messages.append(m)
                    case .failure(let e):
                        if (e as? GmailError)?.errorDescription?.contains("認証期限") == true { throw e }
                        failed += 1
                    }
                }
            }
            var review: [String] = []
            model.change("Gmailの同期") { d, now, _ in review = d.applySyncedMessages(messages, failed: failed, now: now).reviewIds }
            return review
        } catch {
            let msg = (error as? LocalizedError)?.errorDescription ?? "同期に失敗しました"
            model.change("Gmail同期のエラー") { d, now, _ in d.setGmailSettings { $0["lastError"] = .string(msg); $0["lastErrorAt"] = .string(ISODate.now(now)) } }
            throw error
        }
    }

    static func randomString(_ n: Int) -> String {
        let chars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        var bytes = [UInt8](repeating: 0, count: n)
        _ = SecRandomCopyBytes(kSecRandomDefault, n, &bytes)
        return String(bytes.map { chars[Int($0) % chars.count] })
    }
}

/// キーチェーン（この iPhone だけ・ロック解除後に読める）
enum Keychain {
    static let service = "com.example.mymoney.gmail"
    static func save(_ key: String, _ value: String) {
        delete(key)
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key,
                                kSecValueData as String: Data(value.utf8), kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly]
        SecItemAdd(q as CFDictionary, nil)
    }
    static func read(_ key: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key,
                                kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func delete(_ key: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
        SecItemDelete(q as CFDictionary)
    }
}
