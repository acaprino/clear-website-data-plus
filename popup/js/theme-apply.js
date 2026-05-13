/* ============================================================
   Clear Website Data+ — Theme application (popup)
   Injects --ff-popup-* CSS vars from the active LWT theme; falls
   back to system colors when theme.colors is empty (built-in themes).
   ============================================================ */

// Guard against load-order drift: this file consumes CWD_THEME at call time.
if (typeof globalThis.CWD_THEME === "undefined") {
  console.error("[CWD][theme-apply] CWD_THEME not loaded — check popup/cwd.html <script> order");
}

// CSS color allowlist: hex / rgb[a] / hsl[a] / single keyword. Anything else
// (multi-declaration, var() references, url(), custom-property names that
// would smuggle through setProperty) is rejected.
const _SAFE_CSS_COLOR = /^(?:#[0-9a-fA-F]{3,8}|rgba?\([^()]{1,40}\)|hsla?\([^()]{1,40}\)|[a-zA-Z]{1,32})$/;

function _toCSSColor(value) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value) && value.length >= 3) {
    const [r, g, b, a] = value;
    if (![r, g, b].every(Number.isFinite)) return null;
    if (a !== undefined && Number.isFinite(a)) {
      return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
    }
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (s.length === 0 || s.length > 64) return null;
  return _SAFE_CSS_COLOR.test(s) ? s : null;
}

function _isFirefoxThemeDark(theme) {
  const fromColors = globalThis.CWD_THEME?.detectDarkFromThemeColors?.(theme?.colors);
  if (fromColors !== null && fromColors !== undefined) return fromColors;
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;background:-moz-Dialog;color:-moz-DialogText";
    document.documentElement.appendChild(probe);
    const cs = getComputedStyle(probe);
    const bg = cs.backgroundColor;
    probe.remove();
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
    if (m) {
      const lum = 0.299 * (+m[1]) + 0.587 * (+m[2]) + 0.114 * (+m[3]);
      return lum < 128;
    }
  } catch { /* swallow */ }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

// Each entry: [cssVar, [theme.colors keys in priority order]]
// The accent row delegates to CWD_THEME.pickAccentFromThemeColors so the
// chain stays single-sourced with the background's badge accent (THEME_ACCENT_KEYS).
const _FF_POPUP_PROPS = [
  ["--ff-popup-bg",             ["popup", "frame", "toolbar"]],
  ["--ff-popup-text",           ["popup_text", "toolbar_text", "bookmark_text"]],
  ["--ff-popup-border",         ["popup_border", "toolbar_field_border"]],
  ["--ff-popup-highlight",      ["popup_highlight", "toolbar_field_focus", "tab_selected"]],
  ["--ff-popup-highlight-text", ["popup_highlight_text", "toolbar_field_highlight_text"]],
  // --ff-popup-accent is resolved separately via pickAccentFromThemeColors.
  ["--ff-popup-input-bg",       ["toolbar_field", "popup", "frame"]],
  ["--ff-popup-input-text",     ["toolbar_field_text", "popup_text", "toolbar_text"]],
  ["--ff-popup-input-border",   ["toolbar_field_border", "popup_border"]],
];

function applyTheme(theme) {
  const dark = _isFirefoxThemeDark(theme);
  document.documentElement.dataset.theme = dark ? "dark" : "light";

  const s = document.documentElement.style;
  for (const [cssVar] of _FF_POPUP_PROPS) s.removeProperty(cssVar);
  s.removeProperty("--ff-popup-accent");

  const c = theme?.colors ?? {};
  for (const [cssVar, keys] of _FF_POPUP_PROPS) {
    for (const k of keys) {
      const v = _toCSSColor(c[k]);
      if (v) { s.setProperty(cssVar, v); break; }
    }
  }
  // Accent goes through the shared picker so the popup and any future
  // background badge use the same color key.
  const rawAccent = globalThis.CWD_THEME?.pickAccentFromThemeColors?.(c);
  const accent = _toCSSColor(rawAccent);
  if (accent) s.setProperty("--ff-popup-accent", accent);

  return dark;
}

// Debounced theme.onUpdated — dynamic themes can fire many events per second.
function subscribeThemeUpdates() {
  let timer = null;
  browser.theme.onUpdated.addListener(({ theme }) => {
    clearTimeout(timer);
    timer = setTimeout(() => applyTheme(theme), 80);
  });
}

globalThis.CWD_APPLY = Object.freeze({ applyTheme, subscribeThemeUpdates });
