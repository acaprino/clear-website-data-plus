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
    CWD_LOG.debug("[CWD] background ready (debug enabled)");
  } catch (e) {
    CWD_LOG.warn("[CWD][handler] _initFromPrefs failed:", e?.message);
  }
}

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  const change = changes[CWD_STORAGE.PREFS_KEY];
  if (!change?.newValue) return;
  if (typeof change.newValue.debug === "boolean") {
    CWD_LOG.setDebug(change.newValue.debug);
  }
});

_initFromPrefs();
