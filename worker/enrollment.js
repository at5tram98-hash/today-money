/* Anonymous registration proves delivery before activating a device. Tokens never appear in logs. */
export async function enrollment(request, env, helpers, headers) {
  const {
      json,
      sha,
      randomToken,
      readBody,
      validateSubscription,
      normalizePreferences,
      normalizeSummary,
      sendPush,
    } = helpers,
    path = new URL(request.url).pathname,
    now = Date.now();
  if (!path.startsWith("/v1/enroll")) return null;
  if (path === "/v1/enroll") {
    const ipHash = await sha(
        request.headers.get("CF-Connecting-IP") || "unknown",
      ),
      window = Math.floor(now / 60000);
    const limit = await env.DB.prepare(
      "INSERT INTO enrollment_limits(ip_hash,window,count) VALUES(?,?,1) ON CONFLICT(ip_hash) DO UPDATE SET window=excluded.window,count=CASE WHEN enrollment_limits.window=excluded.window THEN enrollment_limits.count+1 ELSE 1 END RETURNING count",
    )
      .bind(ipHash, window)
      .first();
    if (limit.count > 5)
      return json({ error: "registration rate limit" }, 429, headers);
    const count = await env.DB.prepare(
      "SELECT (SELECT COUNT(*) FROM devices)+(SELECT COUNT(*) FROM enrollments WHERE expires_at>?) AS n",
    )
      .bind(now)
      .first();
    if (count.n >= 20) return json({ error: "device limit" }, 409, headers);
    const body = await readBody(request),
      subscription = validateSubscription(body.subscription),
      prefs = normalizePreferences(body.preferences),
      summary = normalizeSummary(body.summary, prefs),
      token = randomToken(),
      id = crypto.randomUUID(),
      challenge = randomToken();
    await env.DB.prepare(
      "INSERT INTO enrollments(id,token_hash,challenge,subscription,summary,preferences,expires_at) VALUES(?,?,?,?,?,?,?)",
    )
      .bind(
        id,
        await sha(token),
        challenge,
        JSON.stringify(subscription),
        JSON.stringify(summary),
        JSON.stringify(prefs),
        now + 600000,
      )
      .run();
    return json({ token, id }, 200, headers);
  }
  if (path === "/v1/enroll/confirm") {
    const body = await readBody(request);
    if (
      typeof body.id !== "string" ||
      typeof body.challenge !== "string" ||
      body.challenge.length !== 64
    )
      return json({ error: "invalid proof" }, 400, headers);
    const entry = await env.DB.prepare(
      "SELECT * FROM enrollments WHERE id=? AND expires_at>?",
    )
      .bind(body.id, now)
      .first();
    if (!entry || (await sha(entry.challenge)) !== (await sha(body.challenge)))
      return json({ error: "invalid proof" }, 401, headers);
    const subscription = JSON.parse(entry.subscription),
      existing = await env.DB.prepare("SELECT id FROM devices WHERE endpoint=?")
        .bind(subscription.endpoint)
        .first(),
      id = existing?.id || entry.id;
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO devices(id,token_hash,endpoint,subscription,summary,preferences,revision,synced_at) SELECT ?,?,?,?,?,?,0,? WHERE EXISTS(SELECT 1 FROM enrollments WHERE id=? AND expires_at>?) ON CONFLICT(endpoint) DO UPDATE SET token_hash=excluded.token_hash,subscription=excluded.subscription,summary=excluded.summary,preferences=excluded.preferences,revision=0,synced_at=excluded.synced_at,enabled=1",
      ).bind(
        id,
        entry.token_hash,
        subscription.endpoint,
        entry.subscription,
        entry.summary,
        entry.preferences,
        now,
        entry.id,
        now,
      ),
      env.DB.prepare("DELETE FROM enrollments WHERE id=?").bind(entry.id),
    ]);
    return json({ ok: true }, 200, headers);
  }
  const token =
    request.headers.get("Authorization")?.replace(/^Bearer /, "") || "";
  if (!/^[a-f0-9]{64}$/.test(token))
    return json({ error: "unauthorized" }, 401, headers);
  if (path === "/v1/enroll/cancel") {
    const hash = await sha(token);
    await env.DB.batch([
      env.DB.prepare("DELETE FROM enrollments WHERE token_hash=?").bind(hash),
      env.DB.prepare(
        "DELETE FROM deliveries WHERE device_id IN (SELECT id FROM devices WHERE token_hash=?)",
      ).bind(hash),
      env.DB.prepare("DELETE FROM devices WHERE token_hash=?").bind(hash),
    ]);
    return json({ ok: true }, 200, headers);
  }
  const entry = await env.DB.prepare(
    "SELECT * FROM enrollments WHERE token_hash=? AND expires_at>?",
  )
    .bind(await sha(token), now)
    .first();
  if (!entry) return json({ error: "registration expired" }, 401, headers);
  if (path === "/v1/enroll/send") {
    const claim = await env.DB.prepare(
      "UPDATE enrollments SET sends=sends+1 WHERE id=? AND sends<3",
    )
      .bind(entry.id)
      .run();
    if (!claim.meta.changes)
      return json({ error: "verification limit" }, 429, headers);
    const response = await sendPush(env, JSON.parse(entry.subscription), {
      title: "My Money 通知の接続確認",
      body: "この端末への通知を接続します。",
      target: "today",
      tag: "money-connection",
      kind: "connection-proof",
      id: entry.id,
      challenge: entry.challenge,
    });
    return json({ ok: response.ok }, response.ok ? 200 : 502, headers);
  }
  return json({ error: "not found" }, 404, headers);
}
