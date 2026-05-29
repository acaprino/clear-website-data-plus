/* ============================================================
   Clear Website Data+ — Popup controller
   Wires up:
     - i18n substitution on data-i18n attributes
     - theme detection + LWT var injection (theme-apply.js)
     - scope radio + time-period select + checkbox list (defaults
       from storage via background)
     - "Clear" action -> background -> optional tab reload
   ============================================================ */

const INTERNAL_SCHEMES = new Set([
  "about:", "moz-extension:", "chrome:", "file:",
  "view-source:", "resource:", "javascript:", "data:",
]);

const PREFS_KEY = "cwd.prefs.v1";

// Whitelist of allowed `since` values (ms). Must match storage.js ALLOWED_SINCE.
const ALLOWED_SINCE = new Set([0, 900000, 3600000, 86400000, 604800000]);

const GROUPS = Object.freeze([
  Object.freeze({
    id: "cwd-group-storage",
    types: Object.freeze([
      Object.freeze({ key: "cookies",        global: false }),
      Object.freeze({ key: "cache",          global: true  }),
      Object.freeze({ key: "localStorage",   global: false, hostWide: true }),
      Object.freeze({ key: "indexedDB",      global: false, hostWide: true }),
      Object.freeze({ key: "serviceWorkers", global: false, hostWide: true }),
      Object.freeze({ key: "pluginData",     global: true  }),
    ]),
  }),
  Object.freeze({
    id: "cwd-group-other",
    types: Object.freeze([
      Object.freeze({ key: "history",   global: false }),
      Object.freeze({ key: "downloads", global: false }),
      Object.freeze({ key: "formData",  global: true  }),
      Object.freeze({ key: "passwords", global: true  }),
    ]),
  }),
]);

function _t(key) {
  return browser.i18n.getMessage(key) || key;
}

function _applyI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach(el => {
    const msg = _t(el.dataset.i18n);
    if (msg) el.textContent = msg;
  });
  const titleEl = document.querySelector("title[data-i18n]");
  if (titleEl) document.title = titleEl.textContent;
}

function _typeLabelKey(typeKey) {
  return "type" + typeKey.charAt(0).toUpperCase() + typeKey.slice(1);
}

function _buildTypeList(groupSpec, checkedSet) {
  const ul = document.getElementById(groupSpec.id);
  if (!ul) return;
  ul.innerHTML = "";
  for (const t of groupSpec.types) {
    const li = document.createElement("li");
    li.className = "cwd-type-item";
    li.dataset.type = t.key;

    const label = document.createElement("label");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = t.key;
    cb.checked = checkedSet.has(t.key);
    cb.dataset.type = t.key;

    const span = document.createElement("span");
    span.className = "cwd-type-label";
    span.textContent = _t(_typeLabelKey(t.key));

    label.appendChild(cb);
    label.appendChild(span);
    li.appendChild(label);

    if (t.global) {
      const chip = document.createElement("span");
      chip.className = "cwd-chip";
      chip.textContent = _t("globalChip");
      chip.title = _t("globalChipTitle");
      li.appendChild(chip);
    } else if (t.hostWide) {
      // Origin-keyed stores cleared via browsingData {hostnames} — matches the
      // whole host (every scheme/port), wider than the exact origin shown.
      // Only meaningful in site scope; CSS hides it under body.cwd-scope-all.
      const chip = document.createElement("span");
      chip.className = "cwd-chip cwd-chip--hostwide";
      chip.textContent = _t("hostWideChip");
      chip.title = _t("hostWideChipTitle");
      li.appendChild(chip);
    }

    ul.appendChild(li);
  }
}

function _syncFromPrefs(prefs) {
  const checked = new Set(prefs.types || []);
  document.querySelectorAll(".cwd-type-list input[type=checkbox]").forEach(cb => {
    cb.checked = checked.has(cb.dataset.type);
  });
  const scope = prefs.scope === "all" ? "all" : "site";
  const radio = document.getElementById(scope === "all" ? "cwd-scope-all" : "cwd-scope-site");
  if (radio && !radio.disabled) radio.checked = true;
  _applyScopeChips();

  const sinceSel = document.getElementById("cwd-since");
  if (sinceSel) {
    const v = String(typeof prefs.since === "number" ? prefs.since : 0);
    if ([...sinceSel.options].some(o => o.value === v)) sinceSel.value = v;
  }
}

function _getCheckedTypes() {
  return [...document.querySelectorAll(".cwd-type-list input[type=checkbox]")]
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.type);
}

function _getScope() {
  const checked = document.querySelector("input[name=cwd-scope]:checked");
  return checked?.value || "site";
}

function _getSince() {
  const sel = document.getElementById("cwd-since");
  const v = sel ? Number(sel.value) : 0;
  return ALLOWED_SINCE.has(v) ? v : 0;
}

function _isInternalUrl(url) {
  if (!url) return true;
  try {
    const u = new URL(url);
    return INTERNAL_SCHEMES.has(u.protocol);
  } catch { return true; }
}

function _resolveState(tab) {
  const state = { origin: null, host: null, tabId: tab?.id ?? null, internal: true };
  if (!tab?.url) return state;
  if (_isInternalUrl(tab.url)) return state;
  try {
    const u = new URL(tab.url);
    return { origin: u.origin, host: u.hostname, tabId: tab.id, internal: false };
  } catch {
    return state;
  }
}

function _setSiteState(state) {
  const originEl = document.getElementById("cwd-origin");
  const siteRadio = document.getElementById("cwd-scope-site");
  const allRadio  = document.getElementById("cwd-scope-all");
  const siteLabel = siteRadio.closest(".cwd-scope-option");

  if (state.internal) {
    originEl.textContent = _t("internalPageNotice");
    originEl.classList.add("cwd-origin--disabled");
    siteRadio.disabled = true;
    siteLabel.title = _t("internalPageNotice");
    if (siteRadio.checked) {
      siteRadio.checked = false;
      allRadio.checked = true;
    }
  } else {
    originEl.textContent = state.host || state.origin || "";
    originEl.classList.remove("cwd-origin--disabled");
    siteRadio.disabled = false;
    siteLabel.removeAttribute("title");
  }
}

// Persist prefs through the background — single writer collapses the I3/I4 race.
let _persistChain = Promise.resolve();
function _persistPrefs() {
  const prefs = { scope: _getScope(), types: _getCheckedTypes(), since: _getSince() };
  _persistChain = _persistChain
    .then(() => browser.runtime.sendMessage({ action: "setPrefs", prefs }))
    .catch(() => {});
}

let _clearInFlight = false;

async function _onClearClick() {
  if (_clearInFlight) return;
  _clearInFlight = true;
  const btn = document.getElementById("cwd-clear");
  const labelEl = btn.querySelector(".cwd-clear-label");
  btn.disabled = true;
  const originalLabel = labelEl.textContent;

  // Re-resolve the active tab AT CLICK TIME — avoid stale-closure on tab switch.
  const tabs = await browser.tabs.query({ active: true, currentWindow: true }).catch(() => []);
  const state = _resolveState(tabs?.[0]);
  _setSiteState(state);

  const scope = _getScope();
  const types = _getCheckedTypes();
  const since = _getSince();

  const _abort = () => {
    _clearInFlight = false;
    labelEl.textContent = originalLabel;
    _updateClearButton();
  };

  if (types.length === 0) { _abort(); return; }
  if (scope === "site" && !state.origin) {
    _abort();
    CWD_DIALOG.showError({
      title: _t("internalPageNotice"),
      summary: {},
      errors: [{ phase: "scope", message: "no_origin_for_active_tab" }],
    });
    return;
  }

  labelEl.textContent = _t("clearing");

  try {
    const reply = await browser.runtime.sendMessage({
      action: "clear",
      scope,
      origin: scope === "site" ? state.origin : null,
      types,
      since,
    });

    if (!reply || !reply.ok) {
      _abort();
      CWD_DIALOG.showError({
        title: _t("dialogErrorTitle"),
        summary: reply?.summary || {},
        errors: reply?.errors || [{ phase: "ipc", message: "no_reply" }],
      });
      return;
    }

    // Fresh-read the reload pref at click time so a change in the options
    // page takes effect without needing to close+reopen the popup.
    const freshPrefs = await browser.runtime.sendMessage({ action: "getPrefs" }).catch(() => null);
    const reloadAfter = freshPrefs?.reloadAfter !== false;

    if (reloadAfter && state.tabId != null) {
      browser.tabs.reload(state.tabId, { bypassCache: true }).catch(() => {});
    }
    window.close();
  } catch (e) {
    _abort();
    CWD_DIALOG.showError({
      title: _t("dialogErrorTitle"),
      summary: {},
      errors: [{ phase: "exception", message: e?.message || String(e) }],
    });
  }
}

function _updateClearButton() {
  const btn = document.getElementById("cwd-clear");
  if (btn) btn.disabled = _clearInFlight || _getCheckedTypes().length === 0;
}

// The (host-wide) chip only applies in site scope; in all scope these types
// clear globally like everything else. Toggle a body class the CSS keys off.
function _applyScopeChips() {
  document.body.classList.toggle("cwd-scope-all", _getScope() === "all");
}

async function init() {
  _applyI18n();

  // ============================================================
  // Attach listeners FIRST — before any await — so clicks during init
  // are queued by the platform, not silently dropped.
  // ============================================================

  // theme subscribe BEFORE the initial getCurrent so events fired during
  // the await window are not lost.
  CWD_APPLY.subscribeThemeUpdates();

  // Single delegated change listener — persist prefs AND update Clear button.
  document.addEventListener("change", (ev) => {
    if (!ev.target.matches('input[name="cwd-scope"], .cwd-type-list input[type="checkbox"], #cwd-since')) return;
    if (ev.target.matches('input[name="cwd-scope"]')) _applyScopeChips();
    _persistPrefs();
    _updateClearButton();
  });

  // Clear button — uses fresh tab/state each click.
  document.getElementById("cwd-clear").addEventListener("click", () => _onClearClick());

  // External writes to prefs (e.g., a concurrent popup or the options page)
  // re-sync our UI live.
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = changes[PREFS_KEY];
    if (!change?.newValue) return;
    _syncFromPrefs(change.newValue);
    _updateClearButton();
  });

  // Best-effort: clear the toolbar "!" badge when the popup opens, so the
  // user sees a clean slate while interacting.
  browser.runtime.sendMessage({ action: "clearBadge" }).catch(() => {});

  // ============================================================
  // Now do the awaited work and paint.
  // ============================================================
  const [currentTheme, activeTabs, prefsReply] = await Promise.all([
    browser.theme.getCurrent().catch(() => ({})),
    browser.tabs.query({ active: true, currentWindow: true }).catch(() => []),
    browser.runtime.sendMessage({ action: "getPrefs" }).catch(() => null),
  ]);

  CWD_APPLY.applyTheme(currentTheme);

  const prefs = (prefsReply && typeof prefsReply === "object")
    ? prefsReply
    : { scope: "site", types: ["cookies","cache","localStorage","indexedDB","serviceWorkers"], since: 0 };

  const state = _resolveState(activeTabs?.[0]);
  _setSiteState(state);

  // Build checkbox lists; apply persisted state.
  const checked = new Set(prefs.types || []);
  for (const g of GROUPS) _buildTypeList(g, checked);

  // Apply persisted scope — but respect the disabled-site forcing of "all".
  const scopeRadio = document.getElementById(
    state.internal ? "cwd-scope-all" : (prefs.scope === "all" ? "cwd-scope-all" : "cwd-scope-site"),
  );
  if (scopeRadio) scopeRadio.checked = true;
  _applyScopeChips();

  // Apply persisted time-period.
  const sinceSel = document.getElementById("cwd-since");
  if (sinceSel) {
    const v = String(typeof prefs.since === "number" ? prefs.since : 0);
    if ([...sinceSel.options].some(o => o.value === v)) sinceSel.value = v;
  }

  _updateClearButton();
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch(e => {
    console.error("[CWD][popup] init failed:", e);
  });
});
