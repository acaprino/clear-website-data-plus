/* ============================================================
   Clear Website Data+ — Failure notifications
   Success is silent. Errors fire a single notification iff the
   user opted in via the options page (notifyOnFailure pref).
   ============================================================ */

const NOTIFY_ID = "cwd-clear-failure";

function _t(key, fallback) {
  return browser.i18n.getMessage(key) || fallback || key;
}

function _summarizeErrors(errors) {
  if (!Array.isArray(errors) || errors.length === 0) return "";
  // Cap at 3 lines so the notification stays readable.
  const lines = errors.slice(0, 3).map(e => `${e.phase}: ${e.message}`);
  if (errors.length > 3) lines.push(`(+${errors.length - 3} more)`);
  return lines.join("\n");
}

async function maybeNotify(result) {
  if (!result || result.ok === true) return;
  if (!Array.isArray(result.errors) || result.errors.length === 0) return;

  let prefs = null;
  try { prefs = await globalThis.CWD_STORAGE?.getPrefs(); }
  catch { /* fall through */ }
  if (!prefs?.notifyOnFailure) return;

  if (!browser.notifications) return;
  try {
    await browser.notifications.create(NOTIFY_ID, {
      type: "basic",
      iconUrl: browser.runtime.getURL("icons/icon-96.png"),
      title: _t("notifyFailureTitle", "Clear Website Data+ — some data not cleared"),
      message: _summarizeErrors(result.errors),
    });
  } catch (e) {
    globalThis.CWD_LOG?.warn("[CWD][notify] create failed:", e?.message);
  }
}

globalThis.CWD_NOTIFY = Object.freeze({ maybeNotify });
