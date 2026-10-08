/* Credentials stay outside financial backups; publishing the UI does not enable Push. */
const PUSH_DEVICE_KEY = "myMoney3_pushDevice_v1";
let pushConfiguration = null,
  pushRegistration = null,
  pushSyncTimer = null,
  pushLastError = "",
  pushConnectionState = "off",
  pushReconnectPromise = null;
function pushDevice() {
  try {
    return JSON.parse(localStorage.getItem(PUSH_DEVICE_KEY) || "null");
  } catch {
    return null;
  }
}
function writePushDevice(value) {
  if (value) localStorage.setItem(PUSH_DEVICE_KEY, JSON.stringify(value));
  else localStorage.removeItem(PUSH_DEVICE_KEY);
}
function pushReady() {
  return !!(pushConfiguration?.apiBase && pushConfiguration?.vapidPublicKey);
}
function pushSupported() {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}
function pushPreferences() {
  return { ...DEFAULT_DATA.pushPreferences, ...data.pushPreferences };
}
function buildPushSummary() {
  const day = systemNoticeDay(new Date()),
    atf = mm3AtfForMonth(day.slice(0, 7)),
    risk =
      atf.available && atf.forecast.known ? mm3AtfNextRisk(atf.forecast) : null;
  return {
    date: day,
    closed: dayClosingStatus(day) === "closed",
    changed: dayClosingStatus(day) === "changed",
    spending: pushPreferences().showAmount ? spentDate(day) : null,
    pendingCount: data.mailImports.filter((x) => x.status === "pending").length,
    risk: risk
      ? { date: risk.date, label: risk.label.replace(/¥[\d,]+/g, "安全残高") }
      : null,
  };
}
async function pushApi(path, body, token = pushDevice()?.token) {
  if (!pushReady()) throw new Error("通知サーバーが未接続です");
  const device = pushDevice();
  if (
    device?.apiBase &&
    device.apiBase !== pushConfiguration.apiBase &&
    token === device.token
  )
    throw new Error(
      "配信先が変更されています。端末認証は別のサーバーへ送信しません",
    );
  return globalThis.MoneyPushConnection.request(
    { ...pushConfiguration, token },
    path,
    body,
  );
}
function queuePushSummary() {
  if (
    !pushDevice()?.token ||
    !pushReady() ||
    pushDevice()?.enrolling ||
    pushDevice()?.invalidAuth
  )
    return;
  clearTimeout(pushSyncTimer);
  pushSyncTimer = setTimeout(() => void syncPushSummary(), 1000);
}
async function syncPushSummary() {
  const device = pushDevice();
  if (!device?.token || !pushReady() || device.enrolling) return false;
  if (
    device.apiBase !== pushConfiguration.apiBase ||
    device.vapidPublicKey !== pushConfiguration.vapidPublicKey
  ) {
    pushLastError =
      "配信先または公開鍵が変わっています。接続設定を確認してください";
    pushConnectionState = "reconnect";
    return false;
  }
  try {
    const revision = Math.max(Date.now(), Number(device.revision || 0) + 1);
    writePushDevice({ ...device, revision });
    await pushApi("/v1/sync", {
      revision,
      summary: buildPushSummary(),
      preferences: pushPreferences(),
    });
    const latest = pushDevice();
    if (latest?.token === device.token)
      writePushDevice({ ...latest, lastSyncAt: new Date().toISOString() });
    pushLastError = "";
    return true;
  } catch (error) {
    if (error.status === 401 && pushDevice()?.token === device.token)
      writePushDevice({ ...pushDevice(), invalidAuth: true });
    pushLastError = error.message;
    return false;
  }
}
async function initializeWebPush() {
  try {
    const response = await fetch("./push-config.json", { cache: "no-store" });
    if (response.ok) {
      const config = await response.json();
      if (config.apiBase && config.vapidPublicKey) {
        const url = new URL(config.apiBase);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          url.search ||
          url.hash
        )
          throw new Error("通知サーバーのURLが不正です");
        pushConfiguration = {
          apiBase: url.href.replace(/\/$/, ""),
          vapidPublicKey: config.vapidPublicKey,
        };
      }
    }
    if ("serviceWorker" in navigator)
      pushRegistration = await navigator.serviceWorker.register("./sw.js", {
        scope: "./",
        updateViaCache: "none",
      });
    await reconcilePushConnection();
    queuePushSummary();
    navigator.serviceWorker?.addEventListener("message", (event) => {
      if (event.data?.type === "money-notification")
        openPushDestination(event.data.target);
      if (event.data?.type === "money-push-refresh")
        void reconcilePushConnection();
    });
    const target = new URL(location.href).searchParams.get("notice");
    if (target) {
      openPushDestination(target);
      const url = new URL(location.href);
      url.searchParams.delete("notice");
      history.replaceState(null, "", url.href);
    }
  } catch (error) {
    pushLastError = error.message;
  }
}
async function reconcilePushConnection() {
  if (pushReconnectPromise) return pushReconnectPromise;
  pushReconnectPromise = (async () => {
    if (!pushReady() || !pushSupported()) return false;
    let device = pushDevice();
    try {
      const saved = await globalThis.MoneyPushConnection.read();
      if (!device && saved?.token) {
        device = saved;
        writePushDevice(device);
      }
      if (!device?.token) return false;
      if (
        (device.apiBase && device.apiBase !== pushConfiguration.apiBase) ||
        (device.vapidPublicKey &&
          device.vapidPublicKey !== pushConfiguration.vapidPublicKey)
      )
        throw new Error(
          "配信先または公開鍵が変わっています。既存の接続を維持する設定を確認してください",
        );
      if (Notification.permission !== "granted") {
        pushConnectionState = "permission";
        return false;
      }
      const registration =
          pushRegistration || (await navigator.serviceWorker.ready),
        status = await pushApi("/v1/status", {});
      if (device.enrolling) {
        device = { ...device, enrolling: false };
        await globalThis.MoneyPushConnection.write(device);
        writePushDevice(device);
      }
      if (!status.enabled) {
        const old = await registration.pushManager.getSubscription();
        if (
          old &&
          !globalThis.MoneyPushConnection.sameKey(
            old.options?.applicationServerKey,
            pushConfiguration.vapidPublicKey,
          )
        )
          throw new Error(
            "通知の公開鍵が変更されています。配信基盤の鍵を確認してください",
          );
        await old?.unsubscribe();
      }
      const connection = { ...device, ...pushConfiguration },
        result = await globalThis.MoneyPushConnection.reconcile(
          registration,
          connection,
          { force: true },
        );
      await globalThis.MoneyPushConnection.write(result.connection);
      writePushDevice({ ...result.connection, lastSyncAt: device.lastSyncAt });
      pushConnectionState = "connected";
      pushLastError = "";
      return true;
    } catch (error) {
      if (error.status === 401 && device?.token)
        writePushDevice({ ...device, invalidAuth: true });
      pushConnectionState = "reconnect";
      pushLastError = error.message;
      return false;
    }
  })();
  try {
    return await pushReconnectPromise;
  } finally {
    pushReconnectPromise = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible")
    void reconcilePushConnection().then((ok) => {
      if (ok) queuePushSummary();
    });
});
window.addEventListener(
  "online",
  () =>
    void reconcilePushConnection().then((ok) => {
      if (ok) queuePushSummary();
    }),
);
function openPushDestination(target) {
  if (target === "day-close") openDayClosing(ymd());
  else if (target === "mail") openMailOverview();
  else if (target === "atf") mm3OpenAtfSheet(mm3AtfForMonth(ym()));
  else switchTab("today");
}
function pushSettingsHtml() {
  const device = pushDevice(),
    prefs = pushPreferences(),
    supported = pushSupported();
  return `<div class="form-group-title">アプリを閉じた後の通知</div><div class="card card-pad"><div class="push-status">${device?.enrolling ? "端末への到達を確認中" : device?.token ? (pushConnectionState === "connected" ? "通知に接続済み" : "接続の再確認が必要") : pushReady() ? "通知はオフです" : "通知サーバー未接続"}</div><p class="push-status-note">${pushReady() ? "Cloudflareの配信基盤を使用します。" : "配信基盤の本番認証・公開URL・公開鍵の設定が必要です。画面の公開だけでは通知は届きません。"}<br>iPhoneではホーム画面に追加したアプリから、通知を許可してください。通知時刻は日本時間、23:00〜7:00は配信を休止します。</p><p class="push-status-note">通知用に日締め状態・未確認件数・ATF警告と設定を同期します。取引明細・Gmail認証情報は送りません。金額は下の設定で選択した場合だけ同期します。最後にアプリで更新した情報に基づく通知です。</p>${device?.lastSyncAt ? `<p class="push-status-note">最終同期 ${esc(new Date(device.lastSyncAt).toLocaleString("ja-JP"))}</p>` : ""}${pushLastError ? `<p class="push-status-note">${esc(pushLastError)}</p>` : ""}${!device?.token ? `<label class="day-review-check"><input type="checkbox" id="pushConsent" ${pushReady() ? "" : "disabled"}>通知用の情報同期に同意する</label><button type="button" class="primary" id="pushEnable" ${pushReady() && supported ? "" : "disabled"}>通知を許可して接続</button>` : `<button type="button" class="secondary" id="pushReconnect">接続を確認・復旧</button><button type="button" class="secondary" id="pushTest">テスト通知を送る</button><button type="button" class="secondary" id="pushDisable">この端末の通知を停止</button>`}${!supported ? '<p class="push-status-note">この環境ではWeb Pushを開始できません。対応ブラウザ、またはiPhoneのホーム画面アプリで開いてください。</p>' : ""}</div><div class="form-group-title">通知する内容</div><div class="group">${[
    ["dayClose", "日締めのリマインド"],
    ["atf", "ATFの警告"],
    ["mail", "メール取込の承認待ち"],
    ["spending", "登録支出の状況"],
    ["showAmount", "通知に金額を表示・同期"],
  ]
    .map(
      ([key, label]) =>
        `<div class="row"><div class="row-main"><div class="row-title">${label}</div></div><button type="button" class="switch ${prefs[key] ? "on" : ""}" data-push-pref="${key}" aria-label="${label}"></button></div>`,
    )
    .join(
      "",
    )}</div><label class="push-time-row">日締めの時刻<input type="time" id="pushCloseTime" value="${esc(prefs.closeTime)}" min="07:00" max="22:59"></label><p class="push-status-note">支出の状況は12:00・18:00に配信します。数値は最終更新時刻を併記し、24時間以上古い情報は通知しません。通知は通信状況やOSの設定によって遅れる場合があります。</p>`;
}
function bindPushSettings(root, redraw) {
  root.querySelectorAll("[data-push-pref]").forEach(
    (button) =>
      (button.onclick = () => {
        try {
          safeCommit(
            () => {
              data.pushPreferences[button.dataset.pushPref] =
                !pushPreferences()[button.dataset.pushPref];
            },
            { label: "push preference" },
          );
          queuePushSummary();
          redraw();
        } catch {}
      }),
  );
  root.querySelector("#pushCloseTime").onchange = (e) => {
    const value = e.target.value;
    if (!/^(0[7-9]|1\d|2[0-2]):[0-5]\d$/.test(value)) {
      showToast("7:00〜22:59で設定してください");
      e.target.value = pushPreferences().closeTime;
      return;
    }
    try {
      safeCommit(
        () => {
          data.pushPreferences.closeTime = value;
        },
        { label: "push reminder time" },
      );
      queuePushSummary();
    } catch {}
  };
  root.querySelector("#pushEnable")?.addEventListener("click", async () => {
    if (!root.querySelector("#pushConsent").checked)
      return showToast("通知用の情報同期への同意を確認してください");
    const permissionPromise = Notification.requestPermission(),
      button = root.querySelector("#pushEnable");
    button.disabled = true;
    let created = false,
      subscription,
      connection;
    try {
      if ((await permissionPromise) !== "granted")
        throw new Error("通知が許可されませんでした");
      const registration =
        pushRegistration || (await navigator.serviceWorker.ready);
      subscription = await registration.pushManager.getSubscription();
      if (
        subscription &&
        !globalThis.MoneyPushConnection.sameKey(
          subscription.options?.applicationServerKey,
          pushConfiguration.vapidPublicKey,
        )
      )
        throw new Error(
          "通知の公開鍵が変更されています。配信基盤の鍵を確認してください",
        );
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: globalThis.MoneyPushConnection.bytes(
            pushConfiguration.vapidPublicKey,
          ),
        });
        created = true;
      }
      connection = {
        ...pushConfiguration,
        endpoint: subscription.endpoint,
        enrolling: true,
      };
      const enrollment = await globalThis.MoneyPushConnection.request(
        connection,
        "/v1/enroll",
        {
          subscription: subscription.toJSON(),
          summary: buildPushSummary(),
          preferences: pushPreferences(),
        },
      );
      connection = {
        ...connection,
        token: enrollment.token,
        enrollmentId: enrollment.id,
      };
      await globalThis.MoneyPushConnection.write(connection);
      await globalThis.MoneyPushConnection.request(
        connection,
        "/v1/enroll/send",
        {},
      );
      let confirmed = false;
      for (let attempt = 0; attempt < 15; attempt++) {
        try {
          const status = await globalThis.MoneyPushConnection.request(
            connection,
            "/v1/status",
            {},
          );
          if (status.confirmed) {
            confirmed = true;
            break;
          }
        } catch (error) {
          if (error.status !== 401) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!confirmed)
        throw new Error(
          "端末への通知到達を確認できませんでした。通信と通知設定を確認して再接続してください",
        );
      connection = { ...connection, enrolling: false, revision: 0 };
      await globalThis.MoneyPushConnection.write(connection);
      writePushDevice(connection);
      pushConnectionState = "connected";
      await syncPushSummary();
      showToast("通知を接続しました");
      redraw();
    } catch (error) {
      if (connection?.token) {
        await globalThis.MoneyPushConnection.request(
          connection,
          "/v1/delete",
          {},
        ).catch(() => {});
        await globalThis.MoneyPushConnection.request(
          connection,
          "/v1/enroll/cancel",
          {},
        ).catch(() => {});
      }
      if (connection)
        await globalThis.MoneyPushConnection.clear().catch(() => {});
      if (created) await subscription?.unsubscribe().catch(() => {});
      pushLastError = error.message;
      showToast(error.message, { tone: "error" });
      button.disabled = false;
    }
  });
  root.querySelector("#pushReconnect")?.addEventListener("click", async () => {
    const device = pushDevice();
    if (device?.enrolling || device?.invalidAuth) {
      if (device.enrolling)
        await globalThis.MoneyPushConnection.request(
          device,
          "/v1/enroll/cancel",
          {},
        ).catch(() => {});
      await globalThis.MoneyPushConnection.clear();
      writePushDevice(null);
      pushConnectionState = "off";
      pushLastError = "";
      showToast("接続の準備をやり直しました。通知を接続してください");
      redraw();
      return;
    }
    if (Notification.permission !== "granted")
      await Notification.requestPermission();
    const ok = await reconcilePushConnection();
    if (ok) await syncPushSummary();
    showToast(
      ok
        ? "通知の接続を確認しました"
        : pushLastError || "通知許可を確認してください",
      { tone: ok ? "success" : "error" },
    );
    redraw();
  });
  root.querySelector("#pushTest")?.addEventListener("click", async () => {
    try {
      await pushApi("/v1/test", {});
      showToast("テスト通知を送信しました");
    } catch (error) {
      showToast(error.message, { tone: "error" });
    }
  });
  root.querySelector("#pushDisable")?.addEventListener("click", async () => {
    try {
      await pushApi("/v1/delete", {});
      const registration =
        pushRegistration || (await navigator.serviceWorker.getRegistration());
      await (await registration?.pushManager.getSubscription())?.unsubscribe();
      await globalThis.MoneyPushConnection.clear();
      writePushDevice(null);
      pushConnectionState = "off";
      pushLastError = "";
      showToast("この端末の通知を停止しました");
      redraw();
    } catch (error) {
      showToast(error.message, { tone: "error" });
    }
  });
}
