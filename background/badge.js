/* ============================================================
   Clear Website Data+ — Toolbar badge
   Surfaces clear-time failures without forcing the user to
   reopen the popup. Red "!" on error, cleared on next success.
   ============================================================ */

const BADGE_TEXT_ERROR = "!";
const BADGE_BG_ERROR   = "#e34242";
const BADGE_FG_ERROR   = "#ffffff";

async function _clear() {
  try { await browser.action.setBadgeText({ text: "" }); }
  catch (e) { globalThis.CWD_LOG?.warn("[CWD][badge] clear failed:", e?.message); }
}

async function _showError() {
  try {
    await browser.action.setBadgeText({ text: BADGE_TEXT_ERROR });
    if (browser.action.setBadgeBackgroundColor) {
      await browser.action.setBadgeBackgroundColor({ color: BADGE_BG_ERROR });
    }
    // setBadgeTextColor is Firefox 63+; ignored elsewhere.
    if (browser.action.setBadgeTextColor) {
      await browser.action.setBadgeTextColor({ color: BADGE_FG_ERROR });
    }
  } catch (e) {
    globalThis.CWD_LOG?.warn("[CWD][badge] showError failed:", e?.message);
  }
}

// Single entry point: feed it the clear() result, the badge reflects it.
async function update(result) {
  const hasErrors = !!(result && (result.ok === false || (Array.isArray(result.errors) && result.errors.length > 0)));
  if (hasErrors) await _showError();
  else           await _clear();
}

globalThis.CWD_BADGE = Object.freeze({ update, clear: _clear, showError: _showError });
