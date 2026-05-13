/* ============================================================
   Clear Website Data+ — Prefs storage
   Single key cwd.prefs.v1 in browser.storage.local. Missing keys
   are filled from DEFAULT_PREFS on read.
   ============================================================ */

const PREFS_KEY = "cwd.prefs.v1";

const DEFAULT_PREFS = Object.freeze({
  scope: "site",                // "site" | "all"
  types: [
    "cookies",
    "cache",
    "localStorage",
    "indexedDB",
    "serviceWorkers",
  ],
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
      // Allow empty array — user may explicitly want nothing checked.
      out.types = filtered;
    }
  }
  return out;
}

async function getPrefs() {
  try {
    const got = await browser.storage.local.get(PREFS_KEY);
    return _sanitizePrefs(got?.[PREFS_KEY]);
  } catch (e) {
    console.warn("[CWD][storage] getPrefs failed, returning defaults:", e?.message);
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
  getPrefs,
  setPrefs,
});
