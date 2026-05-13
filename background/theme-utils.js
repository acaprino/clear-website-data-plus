/* ============================================================
   Clear Website Data+ — Shared Theme Utilities
   Ported from firefox-workspaces. Loaded by BOTH the background
   page (via manifest background.scripts) AND the popup document
   (via <script src> in popup/cwd.html, before theme-apply.js).
   Must be a pure script: no DOM access, no browser.* calls.
   ============================================================ */

const THEME_ACCENT_KEYS = Object.freeze([
  "accentcolor",
  "toolbar_field_focus_border",
  "icons_attention",
  "tab_loading",
  "popup_highlight",
]);

function _themeParseRgb(c) {
  if (Array.isArray(c)) {
    const [r, g, b] = c;
    if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
      return [r | 0, g | 0, b | 0];
    }
    return null;
  }
  if (typeof c !== "string") return null;
  const s = c.trim();
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(s);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16)];
  const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (rgb) return [+rgb[1], +rgb[2], +rgb[3]];
  return null;
}

function _themeLuminance(rgb) {
  if (!rgb) return null;
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

// Returns true (dark), false (light), or null (indeterminate).
function detectDarkFromThemeColors(colors) {
  if (!colors || typeof colors !== "object") return null;

  const textSrc = colors.icons
               ?? colors.toolbar_text
               ?? colors.bookmark_text
               ?? colors.tab_background_text
               ?? colors.toolbar_field_text
               ?? colors.popup_text;
  const textLum = _themeLuminance(_themeParseRgb(textSrc));
  if (textLum !== null) return textLum > 128;

  const bgSrc = colors.toolbar ?? colors.frame ?? colors.popup;
  const bgLum = _themeLuminance(_themeParseRgb(bgSrc));
  if (bgLum !== null) return bgLum < 128;

  return null;
}

function pickAccentFromThemeColors(colors) {
  if (!colors) return null;
  for (const key of THEME_ACCENT_KEYS) {
    const c = colors[key];
    if (c === undefined || c === null) continue;
    if (Array.isArray(c) && c.length >= 3) {
      const [r, g, b] = c;
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return `rgb(${r | 0},${g | 0},${b | 0})`;
      }
    }
    if (typeof c === "string" && c.length > 0) return c;
  }
  return null;
}

// Expose to popup (window) and background (globalThis). Both contexts share
// this file so we attach to globalThis for uniform access.
globalThis.CWD_THEME = Object.freeze({
  THEME_ACCENT_KEYS,
  detectDarkFromThemeColors,
  pickAccentFromThemeColors,
});
