/* シフトの受け渡し（iPhoneのショートカット → アプリ）
   iPhoneのカレンダー（シフトボードが書き出したシフト）は、Webアプリから直接は読めない。
   そこで、iOSショートカットの「個人用オートメーション（毎日）」がカレンダーの予定を文字にして
   POST /v1/shifts へ送り、アプリは開いた時に GET /v1/shifts で受け取る。
   鍵（256ビット以上）は端末のアプリが作り、ここにはその SHA-256 だけを保存する。
   保存するのは最後に送られた1件だけ（シフトの文字・最大32KB）。30日で消える。 */
const MAX_TEXT = 32768,
  MAX_ROWS = 200,
  KEEP_MS = 30 * 86400000;

async function readText(request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_TEXT + 4096) {
      await reader.cancel();
      throw new Error("too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  return new TextDecoder().decode(bytes);
}
/* ショートカットの「URLの内容を取得」は JSON（{"text": …}）でも、ファイル（文字そのまま）でも送れる */
export function shiftTextFrom(raw) {
  const s = String(raw || "").trim();
  if (s.startsWith("{")) {
    try {
      const j = JSON.parse(s);
      if (typeof j.text === "string") return j.text;
      if (Array.isArray(j.shifts)) return JSON.stringify(j.shifts);
    } catch {}
  }
  return s;
}
export async function shiftRelay(request, env, { json, sha }, headers) {
  const key =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(key))
    return json({ error: "unauthorized" }, 401, headers);
  const hash = await sha("shift:" + key);
  if (request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT payload,updated_at FROM shift_inbox WHERE key_hash=?",
    )
      .bind(hash)
      .first();
    if (!row) return json({ text: "", updatedAt: 0 }, 200, headers);
    return json(
      { text: row.payload, updatedAt: Number(row.updated_at) || 0 },
      200,
      headers,
    );
  }
  if (request.method === "POST") {
    let text;
    try {
      text = shiftTextFrom(await readText(request));
    } catch {
      return json({ error: "too large" }, 413, headers);
    }
    if (text.length > MAX_TEXT) return json({ error: "too large" }, 413, headers);
    const now = Date.now(),
      exists = await env.DB.prepare(
        "SELECT 1 AS ok FROM shift_inbox WHERE key_hash=?",
      )
        .bind(hash)
        .first();
    if (!exists) {
      const count = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM shift_inbox",
      ).first();
      if (Number(count?.n) >= MAX_ROWS)
        return json({ error: "full" }, 409, headers);
    }
    await env.DB.prepare(
      "INSERT INTO shift_inbox(key_hash,payload,updated_at) VALUES(?,?,?) ON CONFLICT(key_hash) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
    )
      .bind(hash, text, now)
      .run();
    const lines = text.split(/\r?\n/).filter((x) => x.trim()).length;
    return json({ ok: true, lines, updatedAt: now }, 200, headers);
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM shift_inbox WHERE key_hash=?")
      .bind(hash)
      .run();
    return json({ ok: true }, 200, headers);
  }
  return json({ error: "method not allowed" }, 405, headers);
}
export const shiftCleanup = (env, now) =>
  env.DB.prepare("DELETE FROM shift_inbox WHERE updated_at<?").bind(
    now - KEEP_MS,
  );
