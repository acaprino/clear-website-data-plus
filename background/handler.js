/* ============================================================
   Clear Website Data+ — Message dispatcher
   Actions: "clear", "getPrefs", "setPrefs". Validates shape,
   hands off to cleaner/storage. Updates badge + notifications
   as a side-effect of every clear.
   ============================================================ */

function _isValidOrigin(s) {
  if (typeof s !== "string" || s.length === 0 || s.length > 2048) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    if (s !== u.origin) return false;
    const host = u.hostname;
    if (!host || !host.includes(".")) return false;       // single-label or empty
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;  // IPv4 literal
    if (host.startsWith("[")) return false;                // IPv6 literal
    return true;
  } catch { return false; }
}

function _validateClear(req) {
  if (!req || typeof req !== "object") return "invalid_request";
  if (req.scope !== "site" && req.scope !== "all") return "invalid_scope";
  if (req.scope === "site" && !_isValidOrigin(req.origin)) return "invalid_origin";
  if (!Array.isArray(req.types) || req.types.length === 0) return "invalid_types";
  for (const t of req.types) {
    if (typeof t !== "string" || !CWD_STORAGE.ALLOWED_TYPES.includes(t)) {
      return "invalid_type:" + String(t);
    }
  }
  if (req.since !== undefined && req.since !== null) {
    if (typeof req.since !== "number" || !CWD_STORAGE.ALLOWED_SINCE.includes(req.since)) {
      return "invalid_since";
    }
  }
  return null;
}

function _isAllowedSender(sender) {
  // Reject messages from any tab or web page; only accept from this extension's
  // own privileged contexts (popup, options, devtools).
  if (sender?.tab) return false;
  if (sender?.url && /^(https?|file):/i.test(sender.url)) return false;
  if (sender && sender.id && sender.id !== browser.runtime.id) return false;
  return true;
}

async function _handleClear(msg) {
  const result = await CWD_CLEANER.clear({
    scope: msg.scope,
    origin: msg.origin || null,
    types: [...msg.types],
    since: typeof msg.since === "number" ? msg.since : 0,
  });
  // Side effects fire-and-forget — clearing must not be gated on badge UI.
  CWD_BADGE.update(result).catch(() => {});
  CWD_NOTIFY.maybeNotify(result).catch(() => {});
  return result;
}

const POPUP_PATH = "popup/cwd.html";

function _originFromTabUrl(url) {
  if (typeof url !== "string" || url.length === 0) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch { return null; }
}

// Reads the user's stored preset and runs a one-shot clear on the active tab.
// Used by the toolbar icon / F9 shortcut when prefs.clickAction === "clean".
async function _runOneClickClean(tab) {
  let prefs;
  try { prefs = await CWD_STORAGE.getPrefs(); }
  catch (e) {
    CWD_LOG.warn("[CWD][handler] one-click prefs read failed:", e?.message);
    return;
  }
  const types = Array.isArray(prefs.types) ? prefs.types : [];
  if (types.length === 0) {
    CWD_LOG.debug("[CWD][handler] one-click skipped: no types in preset");
    const r = { ok: false, summary: {}, errors: [{ phase: "oneClick", message: "no_types_selected" }] };
    CWD_BADGE.update(r).catch(() => {});
    CWD_NOTIFY.maybeNotify(r).catch(() => {});
    return;
  }

  const origin = _originFromTabUrl(tab?.url);
  const scope = prefs.scope === "all" ? "all" : (origin ? "site" : "all-fallback");

  if (scope === "all-fallback") {
    // Site scope was requested but the current tab is internal / restricted.
    // Don't silently widen to "all sites" — surface the failure instead.
    CWD_LOG.debug("[CWD][handler] one-click skipped: no clean origin for active tab");
    const r = { ok: false, summary: {}, errors: [{ phase: "oneClick", message: "no_origin_for_active_tab" }] };
    CWD_BADGE.update(r).catch(() => {});
    CWD_NOTIFY.maybeNotify(r).catch(() => {});
    return;
  }

  const result = await _handleClear({
    scope,
    origin: scope === "site" ? origin : null,
    types,
    since: prefs.since,
  });

  if (result.ok && prefs.reloadAfter && tab?.id != null && scope === "site") {
    try { await browser.tabs.reload(tab.id, { bypassCache: true }); }
    catch (e) { CWD_LOG.debug("[CWD][handler] one-click reload failed:", e?.message); }
  }
}

let _clickListenerInstalled = false;
function _onActionClicked(tab) {
  _runOneClickClean(tab).catch(e => CWD_LOG.warn("[CWD][handler] one-click failed:", e?.message));
}

// Switches between popup mode and one-click clean mode without requiring a
// reload. setPopup("") suppresses the popup, which makes Firefox dispatch
// action.onClicked (and the F9 _execute_action command) to our listener.
async function _applyClickAction(clickAction) {
  try {
    if (clickAction === "clean") {
      await browser.action.setPopup({ popup: "" });
      if (!_clickListenerInstalled) {
        browser.action.onClicked.addListener(_onActionClicked);
        _clickListenerInstalled = true;
      }
    } else {
      await browser.action.setPopup({ popup: POPUP_PATH });
      if (_clickListenerInstalled) {
        browser.action.onClicked.removeListener(_onActionClicked);
        _clickListenerInstalled = false;
      }
    }
  } catch (e) {
    CWD_LOG.warn("[CWD][handler] _applyClickAction failed:", e?.message);
  }
}

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!_isAllowedSender(sender)) {
    CWD_LOG.warn("[CWD][handler] rejected message from foreign context:", sender?.url || sender?.id);
    return;
  }
  if (!msg || typeof msg !== "object") return;

  switch (msg.action) {
    case "clear": {
      const err = _validateClear(msg);
      if (err) {
        CWD_LOG.warn("[CWD][handler] validation failed:", err);
        const validationResult = {
          ok: false, summary: {}, errors: [{ phase: "validation", message: err }],
        };
        CWD_BADGE.update(validationResult).catch(() => {});
        return Promise.resolve(validationResult);
      }
      return _handleClear(msg);
    }
    case "getPrefs":
      return CWD_STORAGE.getPrefs();

    case "setPrefs": {
      if (!msg.prefs || typeof msg.prefs !== "object") {
        return Promise.resolve({ ok: false, error: "invalid_prefs" });
      }
      return CWD_STORAGE.setPrefs(msg.prefs).then(
        prefs => ({ ok: true, prefs }),
        e => ({ ok: false, error: e?.message || String(e) }),
      );
    }

    case "clearBadge":
      CWD_BADGE.clear().catch(() => {});
      return Promise.resolve({ ok: true });

    default:
      return; // ignore unrelated messages
  }
});

// Live-sync the debug flag with prefs storage so toggling the option in the
// options page takes effect without a reload.
async function _initFromPrefs() {
  try {
    const prefs = await CWD_STORAGE.getPrefs();
    CWD_LOG.setDebug(prefs.debug);
    await _applyClickAction(prefs.clickAction);
    _lastAppliedClickAction = prefs.clickAction;
    CWD_LOG.debug("[CWD] background ready (debug enabled)");
  } catch (e) {
    CWD_LOG.warn("[CWD][handler] _initFromPrefs failed:", e?.message);
  }
}

let _lastAppliedClickAction = null;
browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const change = changes[CWD_STORAGE.PREFS_KEY];
  if (!change?.newValue) return;
  if (typeof change.newValue.debug === "boolean") {
    CWD_LOG.setDebug(change.newValue.debug);
  }
  const ca = change.newValue.clickAction;
  if (typeof ca === "string" && ca !== _lastAppliedClickAction) {
    _lastAppliedClickAction = ca;
    _applyClickAction(ca).catch(() => {});
  }
});

_initFromPrefs();
