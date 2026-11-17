import SwiftUI
import TodayMoneyCore

// メール取引センター（Web 版 14-gmail.js openGmailSettings・23-statement-import-and-review.js の
// mm3OpenMailReview / mm3OpenMailEditor / openMailHistory）。

struct MailCenterView: View {
    @Environment(AppModel.self) private var model
    @State private var busy: String?
    @State private var reviewing: String?
    @State private var connected = GmailService.shared.tokenValid || GmailService.shared.hasRefreshToken

    var body: some View {
        let doc = model.doc, s = doc.gmailSettings
        let pending = doc.pendingMailIds.compactMap { doc.mailImport($0) }
        let clientId = str(s["iosClientId"])
        List {
            Section {
                LabeledContent("状態") {
                    Text(connected ? (str(s["emailAddress"]).isEmpty ? "Gmail 接続中" : "\(str(s["emailAddress"])) 接続中") : clientId.isEmpty ? "初期設定が必要" : "未接続")
                        .foregroundStyle(connected ? .green : .secondary)
                }
                LabeledContent("最後の同期", value: str(s["lastSyncAt"]).isEmpty ? "未同期" : Format.dateTime(str(s["lastSyncAt"])))
                if !str(s["lastError"]).isEmpty { Text(str(s["lastError"])).font(.footnote).foregroundStyle(.orange) }
                if let busy { HStack { ProgressView(); Text(busy).font(.footnote) } }
                HStack {
                    if connected {
                        PillButton(title: "今すぐ同期", systemImage: "arrow.clockwise") { Task { await sync() } }
                        PillButton(title: "接続を切る", systemImage: "xmark", tint: .red) { Task { await GmailService.shared.disconnect(); connected = false
                            model.change("Gmailの切断") { d, _, _ in d.setGmailSettings { $0["emailAddress"] = .string("") } } } }
                    } else {
                        PillButton(title: "Gmail に接続", systemImage: "envelope.badge") { Task { await connect() } }
                    }
                }
                .disabled(busy != nil)
                NavigationLink { GmailSettingsView() } label: { Label("Gmail自動取得の設定", systemImage: "gearshape") }
            } header: { Text("Gmail") } footer: {
                Text("カード・銀行の利用通知メールを読み取り（読み取り専用）、確認してから家計に反映します。メールの内容はこの iPhone の中だけで解析します。")
            }
            Section {
                if pending.isEmpty { Text("確認待ちの取引はありません。").foregroundStyle(.secondary) }
                ForEach(pending.map { (str($0["id"]), $0) }, id: \.0) { _, mi in
                    Button { reviewing = str(mi["id"]) } label: { MailRow(mi: mi) }
                }
                let ready = pending.filter { mi in
                    MoneyDocument.mailConfidence(mi).ready && doc.validPayment(method: str(mi["paymentMethod"]), id: str(mi["paymentId"])) && !doc.mailHistoryStatus(mi).duplicate
                }
                if !ready.isEmpty {
                    Button("確認済みにして\(ready.count)件を反映") {
                        let ids = ready.map { str($0["id"]) }
                        var n = 0
                        if model.change("メール取引をまとめて反映", { d, now, today in n = try d.applyMailItems(ids, now: now, today: today) }) { model.toast = "\(n)件を家計に反映しました" }
                    }.bold()
                }
            } header: { Text("確認待ち（\(pending.count)件）") } footer: {
                if !pending.isEmpty { Text("まとめて反映できるのは、金額・利用先・カテゴリ・支払い方法が分かっていて、既存の取引と重ならないものだけです。") }
            }
            Section {
                NavigationLink { MailHistoryView() } label: { Label("メール取引履歴", systemImage: "clock") }
            }
        }
        .navigationTitle("メール取引センター")
        .sheet(item: Binding(get: { reviewing.map(IdBox.init) }, set: { reviewing = $0?.id })) { b in NavigationStack { MailEditorView(mailId: b.id) } }
    }

    private func connect() async {
        let id = str(model.doc.gmailSettings["iosClientId"])
        busy = "Google に接続しています…"
        defer { busy = nil }
        do {
            try await GmailService.shared.connect(clientId: id)
            let email = (try? await GmailService.shared.profileEmail()) ?? ""
            model.change("Gmailの接続") { d, _, _ in d.setGmailSettings { $0["emailAddress"] = .string(email) } }
            connected = true
            await sync()
        } catch { model.errorMessage = "Gmail接続に失敗しました。\((error as? LocalizedError)?.errorDescription ?? "")" }
    }

    private func sync() async {
        busy = "メールを確認しています…"
        defer { busy = nil }
        do {
            let ids = try await GmailService.shared.sync(model: model) { p in busy = p }
            model.toast = ids.isEmpty ? "新しい支払いメールはありませんでした" : "\(ids.count)件を確認してください"
        } catch {
            model.errorMessage = "Gmail同期に失敗しました。\((error as? LocalizedError)?.errorDescription ?? "")\n記録済みの取引はそのままです。"
            connected = GmailService.shared.tokenValid || GmailService.shared.hasRefreshToken
        }
    }
}

/// メール1件の行
struct MailRow: View {
    @Environment(AppModel.self) private var model
    var mi: JSONValue
    var body: some View {
        let st = model.doc.mailHistoryStatus(mi), conf = MoneyDocument.mailConfidence(mi)
        HStack(spacing: 10) {
            Image(systemName: st.key == "pending" ? "envelope.badge" : st.key == "imported" ? "checkmark.circle.fill" : "envelope.open")
                .foregroundStyle(st.key == "pending" ? .orange : st.key == "imported" ? .green : .secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(str(mi["merchant"]).isEmpty ? (str(mi["subject"]).isEmpty ? "利用先不明" : str(mi["subject"])) : str(mi["merchant"])).foregroundStyle(.primary).lineLimit(1)
                Text("\(str(mi["date"]).isEmpty ? "日付不明" : str(mi["date"]))・\(str(mi["sourceName"]).isEmpty ? "Gmail" : str(mi["sourceName"]))").font(.caption).foregroundStyle(.secondary)
                Text(st.key == "pending" ? "\(st.duplicate ? "重複候補・" : "")\(conf.label)" : st.label)
                    .font(.caption2.weight(.semibold)).foregroundStyle(st.key == "pending" ? (conf.good && !st.duplicate ? .green : .orange) : .secondary)
            }
            Spacer()
            let a = num(mi["amount"])
            Text(a > 0 ? (str(mi["direction"]) == "refund" ? "−\(a.yen)" : a.yen) : "金額不明").monospacedDigit().foregroundStyle(str(mi["direction"]) == "refund" ? .green : .primary)
            Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
    }
}

/// メール取引を確認（Web 版 mm3OpenMailEditor）
struct MailEditorView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var mailId: String
    @State private var merchant = ""
    @State private var amount = 0.0
    @State private var date = Date()
    @State private var category = ""
    @State private var pm = "other"
    @State private var pid = ""
    @State private var direction = "expense"
    @State private var memo = ""
    @State private var loaded = false

    var body: some View {
        let doc = model.doc
        if let mi = doc.mailImport(mailId) {
            let st = doc.mailHistoryStatus(mi)
            if st.key != "pending" { MailDetailView(mi: mi, status: st) } else {
                let draft = draftJSON(mi)
                let match = doc.mailUiMatch(draft)
                Form {
                    Section {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(merchant.isEmpty ? "利用先不明" : merchant).font(.headline)
                            MoneyText(value: direction == "refund" ? -amount : amount)
                            Text(match != nil ? "重複候補" : "確認待ち・まだ家計には反映されていません。").font(.footnote.weight(.semibold)).foregroundStyle(match != nil ? .orange : .secondary)
                        }
                        LabeledContent("件名", value: str(mi["subject"])).font(.footnote)
                        LabeledContent("取得元", value: str(mi["sourceName"])).font(.footnote)
                    }
                    Section {
                        LabeledContent("利用先") { TextField("利用先", text: $merchant).multilineTextAlignment(.trailing) }
                        AmountField(title: "金額", value: $amount)
                        DatePicker("日付", selection: $date, displayedComponents: .date)
                        Picker("カテゴリ", selection: $category) {
                            Text("未選択").tag("")
                            ForEach(doc.categories) { Text($0.name).tag($0.name) }
                        }
                        PaymentPicker(method: $pm, paymentId: $pid)
                        Picker("種類", selection: $direction) { Text("支出").tag("expense"); Text("返金").tag("refund") }.pickerStyle(.segmented)
                        LabeledContent("メモ") { TextField("なし", text: $memo).multilineTextAlignment(.trailing) }
                    }
                    if let match {
                        Section {
                            if let tx = match.tx {
                                LabeledContent(tx.merchant, value: "\(tx.date)・\(abs(tx.amount).yen)")
                            } else { Text("カード明細に同じ取引があります。").foregroundStyle(.secondary) }
                            if match.tx != nil { Button("既存取引に紐づける") { save(link: true) }.bold() }
                        } header: { Text("カード明細・既存取引との照合") } footer: { Text("同じ取引なら紐づけてください。二重に記録しません。") }
                    }
                    Section {
                        Button("取引に反映") { save(link: false) }.bold().disabled(match != nil)
                        Button("対象外にする", role: .destructive) {
                            if model.change("メールを対象外", { d, _, _ in try d.ignoreMail(mailId) }) { model.toast = "対象外にしました"; dismiss() }
                        }
                    }
                }
                .navigationTitle("メール取引を確認").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() } } }
                .onAppear { load(mi) }
            }
        } else {
            ContentUnavailableView("メールが見つかりません", systemImage: "envelope")
        }
    }

    private func load(_ mi: JSONValue) {
        guard !loaded else { return }
        loaded = true
        merchant = str(mi["merchant"]); amount = num(mi["amount"]); date = Dates.isYMD(str(mi["date"])) ? Dates.date(str(mi["date"])) : Date()
        category = str(mi["category"]); direction = str(mi["direction"]) == "refund" ? "refund" : "expense"; memo = str(mi["memo"])
        let m = str(mi["paymentMethod"]), i = str(mi["paymentId"])
        if model.doc.validPayment(method: m, id: i) && !(m != "other" && i.isEmpty) { pm = m; pid = i } else { pm = "other"; pid = "" }
    }

    private func draftJSON(_ mi: JSONValue) -> JSONValue {
        var o = mi.objectValue ?? [:]
        o["merchant"] = .string(merchant.trimmingCharacters(in: .whitespaces)); o["amount"] = .number(amount); o["date"] = .string(Dates.ymd(date))
        o["category"] = .string(category); o["paymentMethod"] = .string(pm); o["paymentId"] = .string(pid); o["direction"] = .string(direction)
        return .object(o)
    }

    private func save(link: Bool) {
        let m = merchant.trimmingCharacters(in: .whitespaces), ds = Dates.ymd(date)
        if model.change(link ? "メール取引を既存取引に紐づけ" : "メール取引を反映", { d, now, today in
            try d.resolveMail(mailId, merchant: m, amount: amount, date: ds, category: category, paymentMethod: pm, paymentId: pid,
                              direction: direction, memo: memo.trimmingCharacters(in: .whitespaces), link: link, now: now, today: today)
        }) {
            model.toast = link ? "既存取引に紐づけました" : "取引に反映しました"
            dismiss()
        }
    }
}

/// 反映済み・対象外のメールの詳細（Web 版 mm3OpenMailHistoryDetail）
struct MailDetailView: View {
    @Environment(AppModel.self) private var model
    var mi: JSONValue
    var status: MailHistoryStatus
    var body: some View {
        let doc = model.doc
        let a = num(mi["amount"])
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text(str(mi["merchant"]).isEmpty ? (str(mi["subject"]).isEmpty ? "利用先不明" : str(mi["subject"])) : str(mi["merchant"])).font(.headline)
                    if a > 0 { MoneyText(value: str(mi["direction"]) == "refund" ? -a : a) } else { Text("金額不明").foregroundStyle(.secondary) }
                    Text("\(status.label)・\(status.note)").font(.footnote).foregroundStyle(.secondary)
                    if status.duplicate { Text("重複候補：カード明細または既存取引との照合が必要です。").font(.footnote).foregroundStyle(.orange) }
                }
            }
            Section {
                LabeledContent("日付", value: str(mi["date"]).isEmpty ? "日付不明" : str(mi["date"]))
                LabeledContent("カテゴリ", value: str(mi["category"]).isEmpty ? "未分類" : str(mi["category"]))
                LabeledContent("支払い方法", value: doc.paymentLabel(method: str(mi["paymentMethod"]), id: str(mi["paymentId"])))
                LabeledContent("種類", value: MoneyDocument.mailInfoOnly(mi) ? "通知のみ" : str(mi["direction"]) == "refund" ? "返金" : "支出")
                LabeledContent("メモ", value: str(mi["memo"]).isEmpty ? "—" : str(mi["memo"]))
                LabeledContent("件名", value: str(mi["subject"]))
                LabeledContent("取得元", value: str(mi["sourceName"]))
            }
            if let tx = doc.transactions.first(where: { $0.id == str(mi["transactionId"]) || str($0.raw["mailImportId"]) == str(mi["id"]) }) {
                Section("家計の取引") {
                    NavigationLink { TransactionEditor(draft: tx, isNew: false) } label: { TransactionRow(t: tx, showDate: true) }
                }
            }
        }
        .navigationTitle("メール取引の詳細").navigationBarTitleDisplayMode(.inline)
    }
}

/// メール取引履歴（Web 版 openMailHistory）
struct MailHistoryView: View {
    @Environment(AppModel.self) private var model
    @State private var filter = "all"
    @State private var query = ""
    @State private var opened: String?

    var body: some View {
        let doc = model.doc
        let needle = MoneyDocument.merchantKey(query)
        let items = doc.mailImports.sorted { (str($0["receivedAt"]).isEmpty ? str($0["date"]) : str($0["receivedAt"])) > (str($1["receivedAt"]).isEmpty ? str($1["date"]) : str($1["receivedAt"])) }
            .filter { mi in
                let st = doc.mailHistoryStatus(mi)
                let okFilter = filter == "all" || (filter == "duplicate" ? st.duplicate : filter == "linked" ? st.linked : st.key == filter)
                let okQuery = needle.isEmpty || MoneyDocument.merchantKey("\(str(mi["merchant"])) \(str(mi["subject"])) \(str(mi["sourceName"])) \(str(mi["category"]))").contains(needle)
                return okFilter && okQuery
            }
        List {
            Section {
                Picker("状態", selection: $filter) {
                    Text("すべて").tag("all"); Text("確認待ち").tag("pending"); Text("反映済み").tag("imported"); Text("情報のみ").tag("info")
                    Text("対象外").tag("ignored"); Text("明細照合済み").tag("linked"); Text("重複候補").tag("duplicate")
                }
            }
            Section {
                if items.isEmpty { Text("該当するメール取引はありません。").foregroundStyle(.secondary) }
                ForEach(items.map { (str($0["id"]), $0) }, id: \.0) { _, mi in Button { opened = str(mi["id"]) } label: { MailRow(mi: mi) } }
            }
        }
        .searchable(text: $query, prompt: "利用先・件名・取得元を検索")
        .navigationTitle("メール取引履歴")
        .sheet(item: Binding(get: { opened.map(IdBox.init) }, set: { opened = $0?.id })) { b in NavigationStack { MailEditorView(mailId: b.id) } }
    }
}

/// Gmail自動取得の設定（Web 版 openGmailSettings）
struct GmailSettingsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var clientId = ""
    @State private var query = ""
    @State private var minutes = 5
    @State private var auto = false
    @State private var selected: Set<String> = []
    @State private var loaded = false

    var body: some View {
        let doc = model.doc
        Form {
            Section {
                TextField("xxxxx.apps.googleusercontent.com", text: $clientId).textInputAutocapitalization(.never).autocorrectionDisabled().font(.footnote.monospaced())
            } header: { Text("Google OAuth クライアントID（iOS）") } footer: {
                Text("Google Cloud Console の「認証情報」で、種類「iOS」の OAuth クライアントIDを作って貼り付けてください（バンドルID：\(Bundle.main.bundleIdentifier ?? "")）。Client Secret は使いません。Gmail API を有効にし、同意画面のテストユーザーに自分のアドレスを追加します。")
            }
            Section {
                ForEach(sources(doc), id: \.id) { x in
                    Button {
                        if selected.contains(x.id) { selected.remove(x.id) } else { selected.insert(x.id) }
                    } label: {
                        HStack {
                            VStack(alignment: .leading) { Text(x.name).foregroundStyle(.primary); Text(x.sub).font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Image(systemName: selected.contains(x.id) ? "checkmark.circle.fill" : "circle").foregroundStyle(selected.contains(x.id) ? Color.accentColor : .secondary)
                        }
                    }
                }
            } header: { Text("自動反映する銀行・カード・デビット") } footer: { Text("何も選択しない場合は、認識できるすべての金融メールを対象にします。") }
            Section {
                TextField("検索条件", text: $query, axis: .vertical).font(.footnote.monospaced())
            } header: { Text("Gmail検索条件") }
            Section {
                Toggle("アプリを開いた時に自動で同期", isOn: $auto)
                Stepper("間隔 \(minutes)分", value: $minutes, in: 1...60)
            }
        }
        .navigationTitle("Gmail自動取得").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold() } }
        .onAppear {
            guard !loaded else { return }
            loaded = true
            let s = doc.gmailSettings
            clientId = str(s["iosClientId"]); query = doc.gmailQuery; minutes = max(1, min(60, Int(num(s["syncMinutes"])) == 0 ? 5 : Int(num(s["syncMinutes"]))))
            auto = s["autoSync"]?.boolValue ?? false; selected = Set(doc.gmailSourceIds)
        }
    }

    private func sources(_ doc: MoneyDocument) -> [(id: String, name: String, sub: String)] {
        doc.banks.map { ($0.id, $0.name, "銀行口座") } + doc.cards.map { ($0.id, $0.name, "クレジットカード") }
            + doc.debitCards.map { ($0.id, $0.name, "デビット・\(doc.bank($0.bankId)?.name ?? "口座未設定")") }
    }

    private func save() {
        let ids = sources(model.doc).map(\.id).filter { selected.contains($0) }
        let changedSources = Set(ids) != Set(model.doc.gmailSourceIds)
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if model.change("Gmailの設定", { d, _, _ in
            d.setGmailSettings { s in
                s["iosClientId"] = .string(clientId.trimmingCharacters(in: .whitespaces)); s["query"] = .string(q.isEmpty ? MailParser.defaultQuery : q)
                s["syncMinutes"] = .number(Double(minutes)); s["autoSync"] = .bool(auto); s["sourceIds"] = .array(ids.map { .string($0) })
            }
            // 対象を変えたら、手で決めていないメールは次の同期で読み直す（Web 版と同じ）
            if changedSources { d.resetMailParserVersions() }
        }) { model.toast = "保存しました"; dismiss() }
    }
}
