/* ============================================================
   Clear Website Data+ — Prefs storage
   Single key cwd.prefs.v1 in browser.storage.local. Missing keys
   are filled from DEFAULT_PREFS on read. Unknown values are
   silently coerced back to defaults.
   ============================================================ */

const PREFS_KEY = "cwd.prefs.v1";

// Time-period filter (milliseconds). 0 = "since the dawn of time".
const SINCE_ALL       = 0;
const SINCE_15_MIN    = 15 * 60 * 1000;
const SINCE_1_HOUR    = 60 * 60 * 1000;
const SINCE_24_HOURS  = 24 * 60 * 60 * 1000;
const SINCE_1_WEEK    = 7 * 24 * 60 * 60 * 1000;

const ALLOWED_SINCE = Object.freeze([
  SINCE_ALL, SINCE_15_MIN, SINCE_1_HOUR, SINCE_24_HOURS, SINCE_1_WEEK,
]);

const ALLOWED_CLICK_ACTIONS = Object.freeze(["popup", "clean"]);

const DEFAULT_PREFS = Object.freeze({
  scope: "site",                // "site" | "all"
  types: [
    "cookies",
    "cache",
    "localStorage",
    "indexedDB",
    "serviceWorkers",
  ],
  since: SINCE_ALL,             // 0 | 15min | 1h | 24h | 1w
  clickAction: "popup",         // "popup" | "clean" — toolbar icon / F9 behavior
  notifyOnFailure: true,        // show OS notification when clear() reports errors
  reloadAfter: true,            // reload the active tab after a successful clear
  debug: false,                 // verbose console logging
});

const ALLOWED_TYPES = Object.freeze([
  "cookies",
  "cache",
  "localStorage",
  "indexedDB",
  "serviceWorkers",
  "pluginData",
  "history",
  "downloads",
  "formData",
  "passwords",
]);

function _sanitizePrefs(raw) {
  const out = { ...DEFAULT_PREFS };
  if (raw && typeof raw === "object") {
    if (raw.scope === "site" || raw.scope === "all") out.scope = raw.scope;

    if (Array.isArray(raw.types)) {
      const seen = new Set();
      const filtered = [];
      for (const t of raw.types) {
        if (typeof t === "string" && ALLOWED_TYPES.includes(t) && !seen.has(t)) {
          seen.add(t);
          filtered.push(t);
        }
      }
      out.types = filtered;
    }

    if (typeof raw.since === "number" && ALLOWED_SINCE.includes(raw.since)) {
      out.since = raw.since;
    }
    if (typeof raw.clickAction === "string" && ALLOWED_CLICK_ACTIONS.includes(raw.clickAction)) {
      out.clickAction = raw.clickAction;
    }
    if (typeof raw.notifyOnFailure === "boolean") out.notifyOnFailure = raw.notifyOnFailure;
    if (typeof raw.reloadAfter     === "boolean") out.reloadAfter     = raw.reloadAfter;
    if (typeof raw.debug           === "boolean") out.debug           = raw.debug;
  }
  return out;
}

async function getPrefs() {
  try {
    const got = await browser.storage.local.get(PREFS_KEY);
    return _sanitizePrefs(got?.[PREFS_KEY]);
  } catch (e) {
    globalThis.CWD_LOG?.warn("[CWD][storage] getPrefs failed, returning defaults:", e?.message);
    return { ...DEFAULT_PREFS };
  }
}

async function setPrefs(partial) {
  const current = await getPrefs();
  const merged = _sanitizePrefs({ ...current, ...partial });
  await browser.storage.local.set({ [PREFS_KEY]: merged });
  return merged;
}

globalThis.CWD_STORAGE = Object.freeze({
  PREFS_KEY,
  DEFAULT_PREFS,
  ALLOWED_TYPES,
  ALLOWED_SINCE,
  ALLOWED_CLICK_ACTIONS,
  SINCE_ALL, SINCE_15_MIN, SINCE_1_HOUR, SINCE_24_HOURS, SINCE_1_WEEK,
  getPrefs,
  setPrefs,
});
