/* ============================================================
   Clear Website Data+ — In-popup dialog
   Full-popup overlay for error / diagnostic reporting.
   ============================================================ */

const _DIALOG_IDS = {
  backdrop: "cwd-dialog-backdrop",
  msgEl:    "cwd-dialog-message",
  bodyEl:   "cwd-dialog-body",
  copyBtn:  "cwd-dialog-copy",
  closeBtn: "cwd-dialog-close",
};

const _dialog = {
  backdrop: null, msgEl: null, bodyEl: null, copyBtn: null, closeBtn: null,
  diagnostic: "",
  copyOriginal: null,
  copyResetTimer: null,
  hideTimer: null,
  initialized: false,
};

function _init() {
  if (_dialog.initialized) return true;
  for (const [field, id] of Object.entries(_DIALOG_IDS)) {
    const el = document.getElementById(id);
    if (!el) {
      console.error("[CWD][dialog] missing #" + id + " — cannot show errors");
      return false;
    }
    _dialog[field] = el;
  }
  _dialog.closeBtn.addEventListener("click", hide);
  _dialog.copyBtn.addEventListener("click", _onCopy);
  _dialog.initialized = true;
  return true;
}

async function _onCopy() {
  try {
    await navigator.clipboard.writeText(_dialog.diagnostic);
    // Capture the real original label exactly once per burst.
    if (_dialog.copyResetTimer !== null) {
      clearTimeout(_dialog.copyResetTimer);
    } else {
      _dialog.copyOriginal = _dialog.copyBtn.textContent;
    }
    _dialog.copyBtn.textContent = browser.i18n.getMessage("dialogCopied") || "Copied";
    _dialog.copyResetTimer = setTimeout(() => {
      if (_dialog.copyOriginal !== null) _dialog.copyBtn.textContent = _dialog.copyOriginal;
      _dialog.copyOriginal = null;
      _dialog.copyResetTimer = null;
    }, 1200);
  } catch (e) {
    console.warn("[CWD][dialog] clipboard write failed:", e?.message);
    // Surface the failure in-button so the user is not left guessing.
    const fallbackOriginal = _dialog.copyBtn.textContent;
    _dialog.copyBtn.textContent = "✗";
    setTimeout(() => { _dialog.copyBtn.textContent = fallbackOriginal; }, 1200);
  }
}

function showError({ title, summary, errors }) {
  if (!_init()) {
    console.error("[CWD][dialog] cannot render error:", { title, summary, errors });
    return;
  }
  // Cancel any pending hide animation timer — re-opening the dialog beats
  // a stale "remove .show" callback from a previous close.
  if (_dialog.hideTimer !== null) {
    clearTimeout(_dialog.hideTimer);
    _dialog.hideTimer = null;
  }

  _dialog.msgEl.textContent = title || browser.i18n.getMessage("dialogErrorTitle") || "Error";

  const lines = [];
  if (Array.isArray(errors)) for (const e of errors) lines.push(`• ${e.phase}: ${e.message}`);

  _dialog.bodyEl.innerHTML = "";
  if (lines.length) {
    const p = document.createElement("div");
    p.textContent = lines.join("\n");
    p.style.whiteSpace = "pre-wrap";
    _dialog.bodyEl.appendChild(p);
  }

  // Build the diagnostic payload AND show its rendered form identical to the
  // clipboard payload — no hidden fields.
  const diagnosticObj = {
    ts: new Date().toISOString(),
    userAgent: navigator.userAgent,
    summary,
    errors,
  };
  const dumpText = JSON.stringify(diagnosticObj, null, 2);
  _dialog.diagnostic = dumpText;

  const dump = document.createElement("code");
  dump.textContent = dumpText;
  _dialog.bodyEl.appendChild(dump);

  _dialog.backdrop.classList.remove("hiding");
  _dialog.backdrop.classList.add("show");
}

function hide() {
  if (!_dialog.backdrop) return;
  _dialog.backdrop.classList.add("hiding");
  if (_dialog.hideTimer !== null) clearTimeout(_dialog.hideTimer);
  _dialog.hideTimer = setTimeout(() => {
    _dialog.backdrop.classList.remove("show", "hiding");
    _dialog.hideTimer = null;
  }, 120);
}

globalThis.CWD_DIALOG = Object.freeze({ showError, hide });
