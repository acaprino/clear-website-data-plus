/* ============================================================
   Clear Website Data+ — Programmatic toolbar icon switch
   theme_icons in manifest only swaps for *explicit* themes;
   the default Firefox theme (even in OS dark mode) keeps the
   default_icon. We watch browser.theme.onUpdated AND the OS
   prefers-color-scheme MQL so the icon matches the toolbar
   in every combination.
   ============================================================ */

const ICON_FOR_LIGHT_BG = { 48: "icons/eraser-dark.svg"  }; // dark fill -> visible on light toolbars
const ICON_FOR_DARK_BG  = { 48: "icons/eraser-light.svg" }; // light fill -> visible on dark toolbars

let _osDarkMql = null;

function _osPrefersDark() {
  try {
    if (!_osDarkMql && typeof matchMedia === "function") {
      _osDarkMql = matchMedia("(prefers-color-scheme: dark)");
    }
    return _osDarkMql?.matches ?? false;
  } catch { return false; }
}

function _detectDark(theme) {
  if (theme?.colors && Object.keys(theme.colors).length > 0) {
    const v = globalThis.CWD_THEME?.detectDarkFromThemeColors?.(theme.colors);
    if (v !== null && v !== undefined) return v;
  }
  return _osPrefersDark();
}

async function apply(theme) {
  try {
    const dark = _detectDark(theme);
    await browser.action.setIcon({ path: dark ? ICON_FOR_DARK_BG : ICON_FOR_LIGHT_BG });
    globalThis.CWD_LOG?.debug("[CWD][icon] applied", dark ? "dark-bg variant" : "light-bg variant");
  } catch (e) {
    globalThis.CWD_LOG?.warn("[CWD][icon] setIcon failed:", e?.message);
  }
}

async function applyCurrent() {
  let theme = {};
  try { theme = await browser.theme.getCurrent(); } catch { /* default theme */ }
  await apply(theme);
}

function _bind() {
  if (browser.theme?.onUpdated) {
    browser.theme.onUpdated.addListener(({ theme }) => apply(theme));
  }
  try {
    if (typeof matchMedia === "function") {
      const mql = matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyCurrent();
      if (mql.addEventListener) mql.addEventListener("change", handler);
      else if (mql.addListener)  mql.addListener(handler); // older Firefox
    }
  } catch { /* ignore */ }

  if (browser.runtime?.onStartup) browser.runtime.onStartup.addListener(applyCurrent);
  if (browser.runtime?.onInstalled) browser.runtime.onInstalled.addListener(applyCurrent);
}

_bind();
applyCurrent();

globalThis.CWD_ICON = Object.freeze({ apply, applyCurrent });
