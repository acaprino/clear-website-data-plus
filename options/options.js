/* ============================================================
   Clear Website Data+ — Options controller
   Loads prefs from the background, binds change listeners that
   persist immediately (no Save button), shows a transient
   "Saved" toast. External writes re-sync the UI live.
   ============================================================ */

const FIELDS = Object.freeze([
  { id: "opt-reload", key: "reloadAfter" },
  { id: "opt-notify", key: "notifyOnFailure" },
  { id: "opt-debug",  key: "debug" },
]);

const RADIO_GROUPS = Object.freeze([
  { name: "opt-click-action", key: "clickAction", allowed: ["popup", "clean"], fallback: "popup" },
]);

const PREFS_KEY = "cwd.prefs.v1";

function _t(key, fallback) {
  return browser.i18n.getMessage(key) || fallback || key;
}

function _applyI18n() {
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const msg = _t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
  const titleEl = document.querySelector("title[data-i18n]");
  if (titleEl) document.title = titleEl.textContent;
}

function _applyPrefsToUI(prefs) {
  for (const f of FIELDS) {
    const el = document.getElementById(f.id);
    if (!el) continue;
    el.checked = !!prefs[f.key];
  }
  for (const g of RADIO_GROUPS) {
    const raw = prefs[g.key];
    const value = g.allowed.includes(raw) ? raw : g.fallback;
    const radios = document.querySelectorAll(`input[type="radio"][name="${g.name}"]`);
    for (const r of radios) r.checked = (r.value === value);
  }
}

let _statusTimer = null;
function _flashSaved() {
  const el = document.getElementById("opt-status");
  if (!el) return;
  el.textContent = _t("optSaved", "Saved");
  el.classList.add("show");
  if (_statusTimer) clearTimeout(_statusTimer);
  _statusTimer = setTimeout(() => el.classList.remove("show"), 900);
}

let _saveChain = Promise.resolve();
function _saveOne(key, value) {
  _saveChain = _saveChain.then(async () => {
    try {
      const reply = await browser.runtime.sendMessage({
        action: "setPrefs",
        prefs: { [key]: value },
      });
      if (reply?.ok) _flashSaved();
    } catch (e) {
      console.warn("[CWD][options] save failed:", e?.message);
    }
  });
}

async function init() {
  _applyI18n();

  for (const f of FIELDS) {
    const el = document.getElementById(f.id);
    if (!el) continue;
    el.addEventListener("change", () => _saveOne(f.key, el.checked));
  }

  for (const g of RADIO_GROUPS) {
    const radios = document.querySelectorAll(`input[type="radio"][name="${g.name}"]`);
    for (const r of radios) {
      r.addEventListener("change", () => {
        if (!r.checked) return;
        const v = g.allowed.includes(r.value) ? r.value : g.fallback;
        _saveOne(g.key, v);
      });
    }
  }

  // Live-sync from external writes (popup, concurrent options page).
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = changes[PREFS_KEY];
    if (!change?.newValue) return;
    _applyPrefsToUI(change.newValue);
  });

  try {
    const prefs = await browser.runtime.sendMessage({ action: "getPrefs" });
    if (prefs && typeof prefs === "object") _applyPrefsToUI(prefs);
  } catch (e) {
    console.warn("[CWD][options] getPrefs failed:", e?.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch(e => console.error("[CWD][options] init failed:", e));
});
