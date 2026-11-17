import SwiftUI
import PDFKit
import CryptoKit
import UniformTypeIdentifiers
import TodayMoneyCore

// カード明細の取り込み・確認・最終確定（Web 版 23-statement-import-and-review.js）と
// 請求照合センター（Web 版 openStatementReconciliation）。

/// カード詳細に出す「カード会社の明細」（Web 版 mm3StatementImportSummaryHtml）
struct StatementImportSection: View {
    @Environment(AppModel.self) private var model
    var cardId: String
    var paymentMonth: String
    var billingMonth: String
    @State private var importing = false

    var body: some View {
        let list = model.doc.statementImports(cardId: cardId, paymentMonth: paymentMonth)
        Section {
            Button { importing = true } label: {
                Label { VStack(alignment: .leading) { Text("明細を取り込む"); Text("PayPay CSV / 三井住友カード PDF").font(.caption).foregroundStyle(.secondary) } } icon: { Image(systemName: "square.and.arrow.down") }
            }
            ForEach(list) { imp in
                NavigationLink { StatementEntryView(importId: imp.id) } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(imp.providerLabel)・\(imp.rows.count)件")
                            Text("\(imp.fileName)・\(imp.statusLabel)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                        Spacer()
                        Text(imp.shownTotal.yen).monospacedDigit()
                    }
                }
            }
            NavigationLink { StatementReconciliationView(cardId: cardId, paymentMonth: paymentMonth, billingMonth: billingMonth) } label: {
                Label("請求照合センター", systemImage: "checklist")
            }
        } header: { Text("カード会社の明細") } footer: {
            if list.isEmpty { Text("取り込んだ明細はありません") }
        }
        .sheet(isPresented: $importing) { NavigationStack { StatementImportView(preselectedCardId: cardId) } }
    }
}

/// 確定済みなら確定画面、それ以外は確認画面を開く（Web 版 mm3OpenStatementEntry）
struct StatementEntryView: View {
    @Environment(AppModel.self) private var model
    var importId: String
    var body: some View {
        if model.doc.statementImport(importId)?.status == "confirmed" { ConfirmedStatementView(importId: importId) }
        else { StatementReviewView(importId: importId) }
    }
}

// MARK: - 取り込み

struct StatementImportView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var preselectedCardId = ""
    @State private var picking = false
    @State private var busy = false
    @State private var error: String?
    @State private var parsed: ParsedStatement?
    @State private var fileName = ""
    @State private var fileHash = ""
    @State private var cardId = ""
    @State private var existingId: String?
    @State private var openedId: String?

    var body: some View {
        let doc = model.doc
        Form {
            Section {
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: "doc.text.magnifyingglass").font(.title2).foregroundStyle(.purple)
                    VStack(alignment: .leading, spacing: 4) {
                        Text("カード会社の明細を読み取る").font(.headline)
                        Text("PayPayカードのCSV、三井住友カードのPDFに対応しています。ファイルはこの iPhone の中だけで処理します。").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Button { picking = true } label: { Label(parsed == nil ? "ファイルを選択" : "別のファイルを選択", systemImage: "folder") }
            }
            if busy { Section { HStack { ProgressView(); Text("明細を解析しています…") } } }
            if let error { Section { Text(error).foregroundStyle(.red) } }
            if let existingId {
                Section {
                    Text("この明細はすでに取り込み済みです。").foregroundStyle(.orange)
                    Button("取り込み済みの明細を見る") { openedId = existingId }
                }
            }
            if let p = parsed {
                let diff = p.officialTotal - p.calculatedTotal
                Section("読み取り結果") {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(StatementParser.providerLabel(p.provider)).font(.headline)
                        MoneyText(value: p.officialTotal != 0 ? p.officialTotal : p.calculatedTotal)
                        Text("\(p.paymentDate.isEmpty ? "支払日不明" : Format.dayLabel(p.paymentDate))・\(p.rows.count)件").font(.footnote).foregroundStyle(.secondary)
                    }
                    LabeledContent("明細合計", value: p.calculatedTotal.yen)
                    LabeledContent(p.officialTotalSource == "pdf_official" ? "公式請求額" : "CSV算出", value: (p.officialTotal != 0 ? p.officialTotal : p.calculatedTotal).yen)
                    LabeledContent("差額") { Text("\(diff > 0 ? "+" : "")\(diff.yen)").foregroundStyle(diff != 0 ? .red : .green) }
                }
                Section {
                    Picker("登録先カード", selection: $cardId) { ForEach(doc.cards) { Text($0.name).tag($0.id) } }
                } footer: {
                    Text("利用月ではなく、\(p.paymentDate.isEmpty ? "明細の支払日" : Format.dayLabel(p.paymentDate))を基準に\(Format.monthLabel(p.paymentMonth))請求として保存します。")
                }
                Section {
                    Button("分類を確認する") { start(p) }.bold().disabled(cardId.isEmpty)
                }
            }
        }
        .navigationTitle("カード明細を取り込む").navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() } } }
        .fileImporter(isPresented: $picking, allowedContentTypes: [.commaSeparatedText, .pdf, .plainText]) { result in
            if case .success(let url) = result { read(url) }
        }
        .navigationDestination(item: $openedId) { StatementEntryView(importId: $0) }
    }

    private func read(_ url: URL) {
        error = nil; parsed = nil; existingId = nil; busy = true
        defer { busy = false }
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
            if let old = model.doc.cardStatementImports.first(where: { $0.fileHash == hash }) { existingId = old.id; return }
            let today = Dates.ymd()
            let name = url.lastPathComponent
            let p: ParsedStatement
            if name.lowercased().hasSuffix(".pdf") {
                guard let pdf = PDFDocument(data: data) else { throw StatementError("PDFを開けませんでした。") }
                let (lines, text) = Self.pdfLines(pdf)
                p = try model.doc.parseSmbcStatement(lines: lines, text: text, today: today)
            } else if name.lowercased().hasSuffix(".csv") || name.lowercased().hasSuffix(".txt") {
                let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .shiftJIS) ?? ""
                p = try model.doc.parsePayPayStatementCsv(text, today: today)
            } else { throw StatementError("対応しているのはPayPay CSVと三井住友カードPDFです。") }
            fileName = name; fileHash = hash; parsed = p
            cardId = model.doc.providerCard(p.provider)?.id ?? (preselectedCardId.isEmpty ? model.doc.cards.first?.id ?? "" : preselectedCardId)
        } catch let e as StatementError { error = e.message } catch { self.error = "明細を読み取れませんでした。" }
    }

    /// PDF の文字を行ごとに取り出す（Web 版 mm3PdfLines は pdf.js で y 座標ごとにまとめる）
    static func pdfLines(_ pdf: PDFDocument) -> ([String], String) {
        var lines: [String] = [], pages: [String] = []
        for i in 0..<pdf.pageCount {
            guard let page = pdf.page(at: i) else { continue }
            let pl = (page.string ?? "").components(separatedBy: .newlines)
                .map { $0.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
            lines += pl; pages.append(pl.joined(separator: "\n"))
        }
        return (lines, pages.joined(separator: "\n"))
    }

    private func start(_ p: ParsedStatement) {
        var newId = ""
        let ok = model.commit("カード明細の取り込み") { d in newId = try d.addStatementImport(p, cardId: cardId, fileName: fileName, fileHash: fileHash) }
        if ok { openedId = newId }
    }
}

// MARK: - 確認

struct StatementReviewView: View {
    @Environment(AppModel.self) private var model
    var importId: String
    @State private var filter = "all"
    @State private var editingRow: String?
    @State private var showFinal = false

    static let filters = [("all", "すべて"), ("review", "要確認"), ("ready", "分類済み"), ("refund", "返金"), ("installment", "分割"), ("duplicate", "重複候補")]
    static func match(_ r: TodayMoneyCore.StatementRow, _ f: String) -> Bool {
        switch f {
        case "review": return r.needsReview
        case "ready": return !r.needsReview
        case "refund": return r.direction == "refund"
        case "installment": return r.installmentTotal > 1
        case "duplicate": return !r.duplicateCandidateId.isEmpty || !r.linkedTransactionId.isEmpty
        default: return true
        }
    }

    var body: some View {
        let doc = model.doc
        if var imp = doc.statementImport(importId) {
            let _ = doc.refreshDuplicateFlags(&imp)
            let rows = imp.rows.filter { Self.match($0, filter) }
            let review = imp.rows.filter { $0.needsReview && $0.included }.count
            let ready = imp.rows.filter { $0.included && !$0.needsReview }.count
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(Format.monthLabel(imp.paymentMonth))請求・\(doc.card(imp.cardId)?.name ?? imp.providerLabel)").font(.subheadline).foregroundStyle(.secondary)
                        MoneyText(value: imp.shownTotal)
                        HStack { Text("明細 \(imp.rows.count)件"); Text("要確認 \(review)件").foregroundStyle(review > 0 ? .orange : .green) }.font(.footnote.weight(.semibold))
                    }
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(Self.filters, id: \.0) { f in
                                Button(f.1) { filter = f.0 }
                                    .buttonStyle(.bordered).tint(filter == f.0 ? .accentColor : .secondary).controlSize(.small)
                            }
                        }
                    }
                }
                Section {
                    if rows.isEmpty { Text("この条件の明細はありません。").foregroundStyle(.secondary) }
                    ForEach(rows) { r in
                        HStack(spacing: 10) {
                            Button { toggle(r.id) } label: {
                                Image(systemName: r.included ? "checkmark.circle.fill" : "circle").font(.title3).foregroundStyle(r.included ? Color.accentColor : .secondary)
                            }.buttonStyle(.plain).accessibilityLabel("反映対象を切替")
                            Button { editingRow = r.id } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(r.merchant).fontWeight(.semibold).lineLimit(1)
                                        Text("\(r.transactionDate)・\(r.category)\(r.installmentTotal > 1 ? "・\(r.installmentText)" : "")").font(.caption).foregroundStyle(.secondary)
                                        let dup = !r.linkedTransactionId.isEmpty ? "・照合済み" : !r.duplicateCandidateId.isEmpty ? "・重複候補" : ""
                                        Text("\(r.needsReview ? "要確認" : "分類済み")\(dup)\(r.direction == "refund" ? "・返金" : "")").font(.caption2.weight(.semibold)).foregroundStyle(r.needsReview ? .orange : .green)
                                    }
                                    Spacer()
                                    Text("\(r.direction == "refund" ? "−" : "")\(abs(r.contribution).yen)").monospacedDigit().foregroundStyle(r.direction == "refund" ? .green : .primary)
                                    Image(systemName: "chevron.right").font(.caption.weight(.semibold)).foregroundStyle(.tertiary)
                                }.contentShape(Rectangle())
                            }.buttonStyle(.plain)
                        }
                        .opacity(r.included ? 1 : 0.45)
                    }
                } footer: {
                    if review > 0 { Text("要確認が \(review)件あります。要確認の明細を編集するか、請求対象外ならチェックを外してから最終確定してください。").foregroundStyle(.orange) }
                }
                Section {
                    Button("保存可能\(ready)件を取引へ保存") {
                        model.change("カード明細を取引へ保存") { d, now, today in try d.persistStatementRows(importId, now: now, today: today) }
                        model.toast = "取引へ保存しました"
                    }
                    Button("請求金額を最終確認") {
                        if review > 0 { model.errorMessage = "要確認の明細が\(review)件あります。確認してください。"; return }
                        if model.change("カード明細の確定準備", { d, now, today in try d.persistStatementRows(importId, now: now, today: today) }) { showFinal = true }
                    }.bold()
                }
            }
            .navigationTitle("カード明細を確認").navigationBarTitleDisplayMode(.inline)
            .sheet(item: Binding(get: { editingRow.map(IdBox.init) }, set: { editingRow = $0?.id })) { b in
                NavigationStack { StatementRowEditor(importId: importId, rowId: b.id) }
            }
            .navigationDestination(isPresented: $showFinal) { StatementFinalView(importId: importId) }
        } else {
            ContentUnavailableView("明細が見つかりません", systemImage: "doc")
        }
    }

    private func toggle(_ rowId: String) {
        model.change("明細の反映対象を切替") { d, now, today in
            try d.updateStatementRow(importId, rowId: rowId) { $0.included.toggle() }
            try d.persistStatementRows(importId, now: now, today: today)
        }
    }
}


/// 明細の行を編集（Web 版 mm3OpenStatementRowEditor）
struct StatementRowEditor: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var importId: String
    var rowId: String
    @State private var merchant = ""
    @State private var date = Date()
    @State private var category = ""
    @State private var amount = 0.0
    @State private var installment = ""
    @State private var memo = ""
    @State private var direction = "expense"
    @State private var linked = ""
    @State private var loaded = false

    var body: some View {
        let doc = model.doc
        let imp = doc.statementImport(importId)
        let row = imp?.rows.first { $0.id == rowId }
        Form {
            if let imp, let row {
                Section {
                    LabeledContent("利用先") { TextField("利用先", text: $merchant).multilineTextAlignment(.trailing) }
                    DatePicker("利用日", selection: $date, displayedComponents: .date)
                    Picker("カテゴリ", selection: $category) { ForEach(doc.categories) { Text($0.name).tag($0.name) } }
                    AmountField(title: "今月支払額", value: $amount)
                    LabeledContent("分割情報") { TextField("1回", text: $installment).multilineTextAlignment(.trailing) }
                    LabeledContent("メモ") { TextField("なし", text: $memo).multilineTextAlignment(.trailing) }
                }
                Section("種類") {
                    Picker("種類", selection: $direction) { Text("支出").tag("expense"); Text("返金").tag("refund") }.pickerStyle(.segmented)
                }
                let cands = doc.statementDuplicateCandidates(row, cardId: imp.cardId)
                if !cands.isEmpty {
                    Section {
                        ForEach(cands, id: \.tx.id) { c in
                            Button { linked = linked == c.tx.id ? "" : c.tx.id } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(c.tx.merchant).foregroundStyle(.primary)
                                        Text("\(c.tx.date)・\(c.tx.category)・\(doc.paymentLabel(method: c.tx.paymentMethod, id: c.tx.paymentId))").font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text(c.tx.amount.yen).monospacedDigit().foregroundStyle(.primary)
                                    Image(systemName: linked == c.tx.id ? "checkmark.circle.fill" : "circle").foregroundStyle(linked == c.tx.id ? Color.accentColor : .secondary)
                                }
                            }
                        }
                    } header: { Text("既存取引との照合候補") } footer: { Text("自動統合はしません。実際に同じ取引の場合だけ紐づけてください。") }
                }
                Section {
                    Button(row.included ? "この明細を除外する" : "この明細を反映対象に戻す", role: row.included ? .destructive : nil) {
                        if model.change("明細の除外", { d, _, _ in try d.updateStatementRow(importId, rowId: rowId) { $0.included.toggle() } }) { dismiss() }
                    }
                }
            }
        }
        .navigationTitle("明細を編集").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button("保存") { save() }.bold() }
        }
        .onAppear {
            guard !loaded, let row else { return }
            loaded = true
            merchant = row.merchant; date = Dates.date(row.transactionDate); category = row.category
            amount = abs(row.currentPaymentAmount); installment = row.installmentText; memo = row.memo; direction = row.direction; linked = row.linkedTransactionId
        }
    }

    private func save() {
        let ds = Dates.ymd(date)
        if model.change("明細の編集", { d, _, _ in
            try d.saveStatementRow(importId, rowId: rowId, merchant: merchant, date: ds, category: category, amount: amount, direction: direction,
                                   installmentText: installment, memo: memo, linkedTransactionId: linked)
        }) { dismiss() }
    }
}

// MARK: - 最終確定

struct StatementFinalView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    var importId: String
    @State private var askDiff = false

    var body: some View {
        let doc = model.doc
        if let imp = doc.statementImport(importId) {
            let calc = imp.total, official = imp.officialTotal != 0 ? imp.officialTotal : calc, diff = official - calc
            let linked = imp.rows.filter { $0.included && !$0.linkedTransactionId.isEmpty }.count
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(doc.card(imp.cardId)?.name ?? imp.providerLabel)・\(Format.monthLabel(imp.paymentMonth))請求").font(.subheadline).foregroundStyle(.secondary)
                        MoneyText(value: official)
                        Text("\(imp.paymentDate.isEmpty ? "支払日不明" : Format.dayLabel(imp.paymentDate))・\(linked)件").font(.footnote).foregroundStyle(.secondary)
                    }
                }
                Section {
                    LabeledContent(imp.officialTotalSource == "pdf_official" ? "カード会社の請求額" : "明細から算出した請求額", value: official.yen)
                    LabeledContent("取り込んだ明細合計", value: calc.yen)
                    LabeledContent("差額") { Text("\(diff > 0 ? "+" : "")\(diff.yen)").foregroundStyle(diff != 0 ? .red : .green) }
                } footer: {
                    Text(diff != 0 ? "カード会社の請求額と明細合計に \(abs(diff).yen) の差があります。明細を確認してください。差額は自動で消去しません。" : "請求額と明細合計が一致しています。同日・同額の取引も個別IDのまま保持しています。")
                        .foregroundStyle(diff != 0 ? .orange : .secondary)
                }
                Section {
                    Button(diff != 0 ? "差額を確認したうえで請求金額を最終確定" : "この金額で請求金額を最終確定") { if diff != 0 { askDiff = true } else { finalize() } }.bold()
                    Button("明細へ戻る") { dismiss() }
                }
            }
            .navigationTitle("請求金額を最終確認").navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("差額があります", isPresented: $askDiff, titleVisibility: .visible) {
                Button("公式請求額で確定") { finalize() }
                Button("戻る", role: .cancel) {}
            } message: { Text("差額を残したままカード会社の公式請求額で確定します。よろしいですか？") }
        }
    }

    private func finalize() {
        if model.change("カード明細の最終確定", { d, now, today in try d.finalizeStatement(importId, now: now, today: today) }) {
            model.toast = "カード請求額を最終確定しました"
        }
    }
}

/// 確定済みの明細（Web 版 mm3OpenConfirmedStatement）
struct ConfirmedStatementView: View {
    @Environment(AppModel.self) private var model
    var importId: String
    @State private var askUnlock = false

    var body: some View {
        let doc = model.doc
        if let imp = doc.statementImport(importId) {
            let bm = doc.statementBillingMonth(imp)
            let matched = str(doc.statementRecon(imp.cardId, billingMonth: bm)?["status"]) == "matched"
            let linked = imp.rows.filter { !$0.linkedTransactionId.isEmpty }.count
            List {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("\(doc.card(imp.cardId)?.name ?? imp.providerLabel)・\(Format.monthLabel(imp.paymentMonth))請求").font(.subheadline).foregroundStyle(.secondary)
                        MoneyText(value: imp.shownTotal)
                        Text("\(imp.paymentDate.isEmpty ? "支払日不明" : Format.dayLabel(imp.paymentDate))・確定").font(.footnote.weight(.semibold)).foregroundStyle(.green)
                    }
                }
                Section {
                    LabeledContent("明細", value: "\(imp.rows.count)件")
                    LabeledContent("照合") { Text(matched ? "一致" : "要確認").foregroundStyle(matched ? .green : .orange) }
                    LabeledContent("取引へ紐づけ", value: "\(linked)件")
                    LabeledContent("最終確定日時", value: imp.confirmedAt.isEmpty ? "—" : Format.dateTime(imp.confirmedAt))
                }
                Section("明細") {
                    ForEach(imp.rows) { r in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(r.merchant)
                                Text("\(r.transactionDate)・\(r.category)\(r.installmentTotal > 1 ? "・\(r.installmentText)" : "")\(r.linkedMailImportId.isEmpty ? "" : "・メール照合済み")").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text("\(r.direction == "refund" ? "−" : "")\(abs(r.contribution).yen)").monospacedDigit().foregroundStyle(r.direction == "refund" ? .green : .primary)
                        }
                        .opacity(r.included ? 1 : 0.45)
                    }
                }
                Section {
                    Button("確定を解除して編集") { askUnlock = true }
                } footer: { Text("確定解除では銀行残高を変更しません。支払済みの請求は、先にカード画面から未払いへ戻してください。") }
            }
            .navigationTitle("確定済みカード明細").navigationBarTitleDisplayMode(.inline)
            .confirmationDialog("確定を解除しますか？", isPresented: $askUnlock, titleVisibility: .visible) {
                Button("確定を解除") {
                    if model.change("カード明細の確定解除", { d, now, today in try d.unlockStatement(importId, now: now, today: today) }) { model.toast = "確定を解除しました" }
                }
                Button("キャンセル", role: .cancel) {}
            } message: { Text("請求額を「見込み」に戻し、明細を編集できる状態にします。銀行残高は変更しません。") }
        }
    }
}

// MARK: - 請求照合センター

struct StatementReconciliationView: View {
    @Environment(AppModel.self) private var model
    var cardId: String
    var paymentMonth: String
    var billingMonth: String
    @State private var selected: Set<String> = []
    @State private var confirmed = 0.0
    @State private var loaded = false
    @State private var editAmount = false

    var body: some View {
        let doc = model.doc
        let card = doc.card(cardId)
        let txs = doc.statementReconTransactions(cardId: cardId, billingMonth: billingMonth, paymentMonth: paymentMonth)
        let amountOf = { (t: Transaction) in doc.statementReconAmount(t, cardId: cardId, paymentMonth: paymentMonth, billingMonth: billingMonth) }
        let linkedTotal = txs.filter { selected.contains($0.id) }.reduce(0) { $0 + amountOf($1) }
        let diff = confirmed - linkedTotal
        let status = abs(diff) < 1 ? "一致" : diff > 0 ? "明細不足" : "明細が請求超過"
        let cycle = doc.billingCycle(card, month: billingMonth)
        let st = doc.statements(cardId, paymentMonth: paymentMonth).first { $0.billingMonth == billingMonth }
        List {
            Section {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(card?.name ?? "")・\(Format.monthLabel(paymentMonth))支払い").font(.subheadline).foregroundStyle(.secondary)
                    MoneyText(value: confirmed)
                    Text("\(Format.monthLabel(billingMonth))対象・\(st.map { $0.paymentDate.isEmpty ? "支払日未設定" : Format.dayLabel($0.paymentDate) } ?? "支払日未設定")・対象利用期間 \(cycle.start.replacingOccurrences(of: "-", with: "/"))〜\(cycle.end.replacingOccurrences(of: "-", with: "/"))")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            Section {
                LabeledContent("確認した請求額", value: confirmed.yen)
                LabeledContent("紐づけ明細", value: linkedTotal.yen)
                LabeledContent("差額") { Text("\(diff > 0 ? "+" : "")\(diff.yen)").foregroundStyle(diff != 0 ? .red : .primary) }
            } footer: {
                Text(diff != 0 ? "\(status)：\(abs(diff).yen)。自動で明細を削除・統合しません。" : "請求額と紐づけ明細が一致しています").foregroundStyle(diff != 0 ? .orange : .green)
            }
            Section {
                HStack {
                    PillButton(title: "請求額を更新", systemImage: "square.and.pencil") { editAmount = true }
                    PillButton(title: "照合状態を保存", systemImage: "checkmark") {
                        let ids = txs.map(\.id).filter { selected.contains($0) }
                        model.change("請求照合") { d, now, _ in d.saveStatementRecon(cardId: cardId, billingMonth: billingMonth, confirmed: confirmed, linkedIds: ids, diff: diff, now: now) }
                        model.toast = diff != 0 ? "照合状態を保存しました（差額あり）" : "請求照合を保存しました"
                    }
                }
            }
            Section("この請求に含める明細") {
                if txs.isEmpty { Text("対象期間の明細はありません").foregroundStyle(.secondary) }
                ForEach(txs) { t in
                    let a = amountOf(t), usesStatement = abs(a - t.amount) >= 1
                    Button {
                        if selected.contains(t.id) { selected.remove(t.id) } else { selected.insert(t.id) }
                    } label: {
                        HStack {
                            Image(systemName: selected.contains(t.id) ? "checkmark.circle.fill" : "circle").foregroundStyle(selected.contains(t.id) ? Color.accentColor : .secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(t.merchant).foregroundStyle(.primary)
                                Text("\(t.date)・\(t.category)\(str(t.raw["mailImportId"]).isEmpty ? "" : "・Gmail取込")\(usesStatement ? "・今月支払額" : "")").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(a.yen).monospacedDigit().foregroundStyle(.primary)
                        }
                    }
                }
            }
        }
        .navigationTitle("請求照合センター").navigationBarTitleDisplayMode(.inline)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            let existing = doc.statementRecon(cardId, billingMonth: billingMonth)
            let ids = (existing?["linkedTransactionIds"]?.arrayValue ?? []).map { str($0) }
            selected = Set(ids.isEmpty ? txs.map(\.id) : ids)
            confirmed = st.map { max(0, $0.amount) } ?? doc.cardBillingAmount(cardId, billingMonth: billingMonth)
        }
        .sheet(isPresented: $editAmount) {
            NavigationStack {
                Form { AmountField(title: "確認した請求額", value: $confirmed) }
                    .navigationTitle("請求額を更新").navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("保存") {
                                let cur = doc.cardAdjustment(cardId, billingMonth: billingMonth)
                                let status = StatementStatus(rawValue: cur?.status ?? "confirmed") ?? .confirmed
                                let pd = (cur.map { $0.paymentDateOverride.isEmpty ? nil : $0.paymentDateOverride } ?? nil) ?? doc.effectiveCardPaymentDate(card, billingMonth: billingMonth) ?? ""
                                let v = confirmed
                                model.change("請求照合センターで請求額を更新") { d, now, today in
                                    d.setCardStatement(cardId, billingMonth: billingMonth, amount: v, paymentDate: pd, status: status, memo: "請求照合センターで更新", balanceMode: "keep", now: now, today: today)
                                }
                                model.toast = "確認した請求額を更新しました"; editAmount = false
                            }.bold()
                        }
                    }
            }
            .presentationDetents([.medium])
        }
    }
}
