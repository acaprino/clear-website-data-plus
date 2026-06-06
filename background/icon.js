/* ============================================================
   Clear Website Data+ — Programmatic toolbar icon switch
   theme_icons in manifest only swaps for *explicit* themes;
   the default Firefox theme (even in OS dark mode) keeps the
   default_icon. We watch browser.theme.onUpdated AND the OS
   prefers-color-scheme MQL so the icon matches the toolbar
   in every combination.

   Caveat: built-in themes (Light / Dark / Automatic) report
   EMPTY theme.colors, and this background page is never
   rendered — its matchMedia / system colors can lag or ignore
   the Firefox theme (stuck-white-icon bug on dark→light).
   Defenses, in order of trust:
     1. theme.colors when present (custom LWT themes)
     2. verdict reported by the popup (a *visible* document
        resolves the real palette; see theme-apply.js)
     3. -moz-Dialog luminance probe (popup-proven trick)
     4. prefers-color-scheme MQL (last resort)
   Plus: a delayed re-check after theme.onUpdated (the scheme
   flip lags the event) and a re-apply on window focus (MQL
   listeners die with the suspended event page and cannot wake
   it — only WebExtension events do).
   ============================================================ */

const ICON_FOR_LIGHT_BG = { 48: "icons/eraser-dark.svg"  }; // dark fill -> visible on light toolbars
const ICON_FOR_DARK_BG  = { 48: "icons/eraser-light.svg" }; // light fill -> visible on dark toolbars

let _osDarkMql = null;

// Last verdict reported by a visible extension document (popup).
// Cleared whenever the theme state changes (onUpdated / MQL flip):
// the popup re-reports on its next paint.
let _popupVerdict = null;

function _osPrefersDark() {
  try {
    if (!_osDarkMql && typeof matchMedia === "function") {
      _osDarkMql = matchMedia("(prefers-color-scheme: dark)");
    }
    return _osDarkMql?.matches ?? false;
  } catch { return false; }
}

// Same trick as popup/js/theme-apply.js: system colors in extension
// documents resolve against the effective browser palette, which tracks
// built-in themes that report no colors. Returns true/false/null.
function _probeSystemDark() {
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;background:-moz-Dialog";
    document.documentElement.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg);
    if (m) {
      const lum = 0.299 * (+m[1]) + 0.587 * (+m[2]) + 0.114 * (+m[3]);
      return lum < 128;
    }
  } catch { /* fall through */ }
  return null;
}

function _detectDark(theme) {
  if (theme?.colors && Object.keys(theme.colors).length > 0) {
    const v = globalThis.CWD_THEME?.detectDarkFromThemeColors?.(theme.colors);
    if (v !== null && v !== undefined) return v;
  }
  if (_popupVerdict !== null) return _popupVerdict;
  const probed = _probeSystemDark();
  if (probed !== null) return probed;
  return _osPrefersDark();
}

async function _setIcon(dark) {
  try {
    await browser.action.setIcon({ path: dark ? ICON_FOR_DARK_BG : ICON_FOR_LIGHT_BG });
    globalThis.CWD_LOG?.debug("[CWD][icon] applied", dark ? "dark-bg variant" : "light-bg variant");
  } catch (e) {
    globalThis.CWD_LOG?.warn("[CWD][icon] setIcon failed:", e?.message);
  }
}

async function apply(theme) {
  await _setIcon(_detectDark(theme));
}

async function applyCurrent() {
  let theme = {};
  try { theme = await browser.theme.getCurrent(); } catch { /* default theme */ }
  await apply(theme);
}

// Direct verdict from a visible extension page (popup). Wins over the
// background's own guessing until the theme state changes again.
async function applyVerdict(dark) {
  _popupVerdict = !!dark;
  await _setIcon(_popupVerdict);
}

// theme.onUpdated can fire before this document's color scheme flips,
// so a verdict computed right now may still read the OLD theme.
// Re-check once the dust settles — one getCurrent + setIcon, cheap.
let _recheckTimer = null;
function _scheduleRecheck() {
  clearTimeout(_recheckTimer);
  _recheckTimer = setTimeout(() => { applyCurrent(); }, 400);
}

function _bind() {
  if (browser.theme?.onUpdated) {
    browser.theme.onUpdated.addListener(({ theme }) => {
      _popupVerdict = null; // theme changed — popup verdict is stale
      apply(theme);
      _scheduleRecheck();
    });
  }
  try {
    if (typeof matchMedia === "function") {
      const mql = matchMedia("(prefers-color-scheme: dark)");
      const handler = () => { _popupVerdict = null; applyCurrent(); };
      if (mql.addEventListener) mql.addEventListener("change", handler);
      else if (mql.addListener)  mql.addListener(handler); // older Firefox
    }
  } catch { /* ignore */ }

  // Heal an icon that went stale while the event page was suspended
  // (e.g. OS scheme toggled under the Automatic theme): fires on the
  // first interaction with a Firefox window after wake-up.
  if (browser.windows?.onFocusChanged) {
    browser.windows.onFocusChanged.addListener((windowId) => {
      if (windowId !== browser.windows.WINDOW_ID_NONE) applyCurrent();
    });
  }

  if (browser.runtime?.onStartup) browser.runtime.onStartup.addListener(applyCurrent);
  if (browser.runtime?.onInstalled) browser.runtime.onInstalled.addListener(applyCurrent);
}

_bind();
applyCurrent();

globalThis.CWD_ICON = Object.freeze({ apply, applyCurrent, applyVerdict });
