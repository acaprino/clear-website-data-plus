/* ============================================================
   Clear Website Data+ — Cleaner
   Routes each UI data type to the right Firefox API.

   Firefox's browsingData.remove({origins:[...]}) only honors the
   origins filter for: cookies, localStorage, indexedDB,
   serviceWorkers. Other types ignore origins and clear globally.
   ============================================================ */

const ORIGIN_AWARE = Object.freeze(new Set([
  "cookies", "localStorage", "indexedDB", "serviceWorkers",
]));

const GLOBAL_ONLY = Object.freeze(new Set([
  "cache", "pluginData", "formData", "passwords",
]));

const ALL_SCOPE_BROWSING_DATA = Object.freeze(new Set([
  "cookies", "cache", "localStorage", "indexedDB", "serviceWorkers",
  "pluginData", "history", "downloads", "formData", "passwords",
]));

const PER_SITE_FILTERED = Object.freeze(new Set(["history", "downloads"]));

const HISTORY_PAGE_SIZE = 10000;

// Load-time taxonomy assertions — INV6, INV15. Catches manual-sync drift between
// ALLOWED_TYPES (storage.js) and the cleaner classification.
(function _assertTaxonomy() {
  if (!globalThis.CWD_STORAGE?.ALLOWED_TYPES) {
    console.error("[CWD][cleaner] CWD_STORAGE not loaded — manifest order broken");
    return;
  }
  for (const t of CWD_STORAGE.ALLOWED_TYPES) {
    const buckets = +ORIGIN_AWARE.has(t) + +GLOBAL_ONLY.has(t) + +PER_SITE_FILTERED.has(t);
    if (buckets !== 1) console.error("[CWD][cleaner] taxonomy drift:", t, "bucket count =", buckets);
    if (!ALL_SCOPE_BROWSING_DATA.has(t) && !PER_SITE_FILTERED.has(t)) {
      console.error("[CWD][cleaner] type missing from ALL_SCOPE_BROWSING_DATA:", t);
    }
  }
})();

function _pickKeys(arr, allow) {
  const out = {};
  for (const k of arr) if (allow.has(k)) out[k] = true;
  return out;
}

async function _safe(fn, label) {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e?.message || String(e), label };
  }
}

function _hostFromOrigin(origin) {
  try { return new URL(origin).hostname; } catch { return null; }
}

function _isHostCookiePrefix(name) {
  return typeof name === "string" && (name.startsWith("__Host-") || name.startsWith("__Secure-"));
}

// Cookies eTLD+1 sweep: browsingData.remove may miss subdomain cookies.
// We enumerate every cookie whose domain matches the origin's host or its
// proper-suffix parents, but stop BEFORE the TLD itself — otherwise
// getAll({domain:"com"}) would return every .com cookie and the remove
// loop would wipe cookies from unrelated sites.
async function _sweepCookies(origin) {
  const host = _hostFromOrigin(origin);
  if (!host || !host.includes(".")) return { count: 0, failed: 0, failures: [] };
  const removed = { count: 0, failed: 0, failures: [] };
  const seen = new Set();
  const queries = [host];
  const parts = host.split(".");
  // Walk up to parent labels but NEVER reach the TLD (the last label).
  // For "example.com" -> queries=["example.com"] only.
  // For "www.example.com" -> queries=["www.example.com","example.com"].
  for (let i = 1; i < Math.min(parts.length - 1, 3); i++) {
    queries.push(parts.slice(i).join("."));
  }
  for (const domain of queries) {
    let cookies;
    try {
      cookies = await browser.cookies.getAll({ domain });
    } catch { continue; }
    for (const c of cookies) {
      const key = `${c.storeId}|${c.domain}|${c.path}|${c.name}|${c.firstPartyDomain ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const url = `${c.secure ? "https" : "http"}://${c.domain.replace(/^\./, "")}${c.path}`;
      const primary = await _safe(
        () => browser.cookies.remove({
          url, name: c.name, storeId: c.storeId,
          firstPartyDomain: c.firstPartyDomain || undefined,
        }),
        "cookieRemove",
      );
      if (primary.ok) { removed.count++; continue; }

      // __Host-/__Secure- cookies have prefix semantics tied to their security
      // flag — flipping the scheme is guaranteed to fail by spec, so don't retry.
      if (_isHostCookiePrefix(c.name)) {
        removed.failed++;
        removed.failures.push({ name: c.name, domain: c.domain, message: primary.error });
        continue;
      }

      const alt = `${c.secure ? "http" : "https"}://${c.domain.replace(/^\./, "")}${c.path}`;
      const fallback = await _safe(
        () => browser.cookies.remove({
          url: alt, name: c.name, storeId: c.storeId,
          firstPartyDomain: c.firstPartyDomain || undefined,
        }),
        "cookieRemoveAlt",
      );
      if (fallback.ok) {
        removed.count++;
      } else {
        removed.failed++;
        removed.failures.push({ name: c.name, domain: c.domain, message: fallback.error });
      }
    }
  }
  return removed;
}

async function _filterDeleteHistory(origin) {
  const host = _hostFromOrigin(origin);
  if (!host) return { count: 0, truncated: false };
  let count = 0;
  let truncated = false;
  try {
    // Page by startTime: when a page returns exactly HISTORY_PAGE_SIZE entries,
    // there may be more older entries. We re-query with endTime = oldest visit.
    let endTime = Date.now();
    for (let page = 0; page < 20; page++) { // hard cap at 200k entries
      const items = await browser.history.search({
        text: host, maxResults: HISTORY_PAGE_SIZE, startTime: 0, endTime,
      });
      if (!items || items.length === 0) break;
      let oldest = endTime;
      for (const item of items) {
        try {
          if (!item.url) continue;
          if (new URL(item.url).hostname === host) {
            await browser.history.deleteUrl({ url: item.url });
            count++;
          }
        } catch { /* skip invalid URL */ }
        if (typeof item.lastVisitTime === "number" && item.lastVisitTime < oldest) {
          oldest = item.lastVisitTime;
        }
      }
      if (items.length < HISTORY_PAGE_SIZE) break;
      if (oldest >= endTime) { truncated = true; break; } // could not advance
      endTime = oldest;
    }
  } catch (e) {
    console.warn("[CWD][cleaner] history filter failed:", e?.message);
  }
  return { count, truncated };
}

async function _filterDeleteDownloads(origin) {
  const host = _hostFromOrigin(origin);
  if (!host) return 0;
  let count = 0;
  try {
    // Restrict at the API level via the URL glob; JS-side hostname check is
    // defense-in-depth (the glob is permissive about ports/subdomains).
    const items = await browser.downloads.search({ url: `*://${host}/*`, limit: 0 });
    for (const item of items) {
      try {
        if (!item.url) continue;
        if (new URL(item.url).hostname === host) {
          // erase removes from history; do not removeFile (user's disk content)
          await browser.downloads.erase({ id: item.id });
          count++;
        }
      } catch { /* skip */ }
    }
  } catch (e) {
    console.warn("[CWD][cleaner] downloads filter failed:", e?.message);
  }
  return count;
}

async function clear({ scope, origin, types, since }) {
  const summary = {};
  const errors = [];

  // since=0 means "since beginning of time" per browsingData.remove spec.
  // Any positive ms value is treated as "removeOptions.since" (epoch ms).
  // Validated upstream by handler._validateClear — re-clamp defensively.
  const _since = (typeof since === "number" && since >= 0 && Number.isFinite(since))
    ? since : 0;
  // The browsingData spec expects an absolute timestamp: epoch ms.
  const sinceAbs = _since > 0 ? (Date.now() - _since) : 0;
  summary._since = _since;

  // 1. Origin-aware types via browsingData.remove({origins})
  if (scope === "site") {
    const dt = _pickKeys(types, ORIGIN_AWARE);
    if (Object.keys(dt).length) {
      const r = await _safe(
        () => browser.browsingData.remove({ origins: [origin], since: sinceAbs }, dt),
        "browsingDataSite",
      );
      if (r.ok) Object.assign(summary, dt);
      else errors.push({ phase: "browsingDataSite", message: r.error });
    }
  } else {
    const dt = _pickKeys(types, ALL_SCOPE_BROWSING_DATA);
    if (Object.keys(dt).length) {
      const r = await _safe(
        () => browser.browsingData.remove({ since: sinceAbs }, dt),
        "browsingDataAll",
      );
      if (r.ok) Object.assign(summary, dt);
      else errors.push({ phase: "browsingDataAll", message: r.error });
    }
  }

  // 2. cookies eTLD+1 sweep (site scope only) — surfaces failures
  if (types.includes("cookies") && scope === "site") {
    const swept = await _sweepCookies(origin);
    if (swept.count > 0) summary.cookiesSwept = swept.count;
    if (swept.failed > 0) {
      summary.cookiesSweepFailed = swept.failed;
      errors.push({
        phase: "cookieSweep",
        message: `${swept.failed} cookie(s) could not be removed`,
        failures: swept.failures.slice(0, 20),
      });
    }
  }

  // 3. per-site history/downloads (browsingData ignores origins for these)
  if (scope === "site") {
    if (types.includes("history")) {
      const h = await _filterDeleteHistory(origin);
      summary.historyEntries = h.count;
      if (h.truncated) summary.historyTruncated = true;
    }
    if (types.includes("downloads")) {
      summary.downloadEntries = await _filterDeleteDownloads(origin);
    }
  }

  // 4. global-only types the user opted into in site mode: clear globally
  if (scope === "site") {
    const optedIn = types.filter(t => GLOBAL_ONLY.has(t));
    if (optedIn.length) {
      const dt = Object.fromEntries(optedIn.map(t => [t, true]));
      const r = await _safe(
        () => browser.browsingData.remove({ since: sinceAbs }, dt),
        "globalFallback",
      );
      if (r.ok) {
        Object.assign(summary, dt);
        summary._globalOnlyCleared = optedIn;
      } else errors.push({ phase: "globalFallback", message: r.error });
    }
  }

  return { ok: errors.length === 0, summary, errors };
}

globalThis.CWD_CLEANER = Object.freeze({
  ORIGIN_AWARE,
  GLOBAL_ONLY,
  PER_SITE_FILTERED,
  clear,
});
