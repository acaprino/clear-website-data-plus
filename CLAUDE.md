# CLAUDE.md — operator notes for Clear Website Data+

## Project at a glance

Firefox extension (MV3, browser_specific_settings.gecko id `clear-website-data-plus@hardfox`). Wipes cookies, cache, storage, history, downloads for the current site or all sites via a native-Firefox-panel popup. ~1300 LOC, no transpiler, vanilla JS + CSS.

## Signing

AMO credentials live in `.env` (gitignored). `scripts/sign.mjs` is a zero-dep wrapper that loads `.env` and invokes `web-ext sign`, so the npm scripts work the same on PowerShell, bash, and CI:

```
npm run sign:unlisted   # signed XPI for self-distribution (default channel)
npm run sign:listed     # publish on addons.mozilla.org (Mozilla review required)
```

Defaults / behavior:
- `.env` is gitignored. `.env.example` documents the two var names (`WEB_EXT_API_KEY`, `WEB_EXT_API_SECRET`). Get fresh credentials at https://addons.mozilla.org/developers/addon/api/key/.
- Shell-set env vars take precedence over `.env` (the wrapper only fills gaps), so CI can override without touching the file.
- `.amo-upload-uuid` updates after a successful sign — that's the source of truth for "last channel + last XPI hash signed."
- AMO rejects re-signing the same version. To re-sign, bump `manifest.json` and `package.json` together (they must stay in lockstep).

Default channel is **unlisted** (matches `.amo-upload-uuid` and the README's GitHub-Releases distribution story). Only switch to `listed` when the user explicitly asks to publish publicly.

## Build / lint / dev

```
npm run lint       # web-ext lint --self-hosted (must be clean before sign)
npm run build      # XPI -> web-ext-artifacts/clear_website_data_-<v>.zip
npm run dev        # opens temp Firefox profile with the extension loaded
```

`web-ext-config.mjs` controls bundled files. Already excludes node_modules, docs, README, `.env*`, `claude_.bat`, etc.

## Architecture (read this before editing background scripts)

Two execution contexts share `background/theme-utils.js` (LWT color detection). MV3 background event pages **don't accept ES `import`** — cross-script wiring goes through `globalThis.CWD_*` namespaces. Load order in `manifest.json` matters:

```
theme-utils.js -> log.js -> icon.js -> badge.js
                         -> storage.js -> notify.js -> cleaner.js -> handler.js
```

| Namespace | Owner | What it does |
|---|---|---|
| `CWD_THEME` | theme-utils.js | LWT color → dark/light verdict, accent picking |
| `CWD_LOG` | log.js | Debug-gated console wrappers (`debug` is silent unless prefs.debug=true; `warn`/`error` always emit) |
| `CWD_ICON` | icon.js | Programmatic `action.setIcon()` based on theme detection + `matchMedia(prefers-color-scheme)`. **Bypasses `manifest.theme_icons`** because the default Firefox theme (even in OS dark mode) doesn't trigger theme_icons |
| `CWD_BADGE` | badge.js | Red `!` badge on clear failure, cleared on next success or popup open |
| `CWD_STORAGE` | storage.js | Single key `cwd.prefs.v1`, schema-sanitized read/write, ALLOWED_TYPES + ALLOWED_SINCE whitelists |
| `CWD_NOTIFY` | notify.js | Failure-only OS notification, gated by `prefs.notifyOnFailure` |
| `CWD_CLEANER` | cleaner.js | `browsingData.remove` routing per type + eTLD+1 cookie sweep + paginated history/downloads filter. Accepts `since` (ms delta) and converts to absolute epoch ms |

## Prefs schema (`cwd.prefs.v1`)

```js
{
  scope:           "site" | "all",
  types:           string[],         // subset of ALLOWED_TYPES
  since:           number,           // ms; one of [0, 15min, 1h, 24h, 1w]
  notifyOnFailure: boolean,
  reloadAfter:     boolean,
  debug:           boolean,
}
```

Unknown values silently coerce back to defaults via `_sanitizePrefs`. Adding a new pref means:
1. Field in `DEFAULT_PREFS` + validator branch in `_sanitizePrefs`
2. UI in popup or options page
3. (If used at clear-time) read via `getPrefs()` in handler / cleaner

## Firefox API limits to remember

- Firefox's `browsingData.remove()` does **not** support Chrome's `origins` option (Bugzilla 1632796 still open) — passing it throws `Unexpected property "origins"`. Use `hostnames: [host]` instead. It's honored for `cookies`, `localStorage`, `indexedDB`, `serviceWorkers`. **Caveat:** `hostnames` matches by host only (no scheme/port), so a site clear is *wider* than the tab's exact origin — clearing `https://site:8443` also clears `http://site` and other ports of that host. Acceptable (same registrable host, no narrower API exists) but worth knowing for origin-keyed stores. Cache, plugin data, form data, passwords ignore the filter and clear globally → surfaced in popup with the `(global)` chip.
- `history` and `downloads` ignore the host filter entirely → we filter manually via `history.search` + `downloads.search`. History is paginated (10k/page, 20-page cap = 200k entries) to handle large histories.
- Cookie sweep walks up parent hostnames but **never queries the TLD** (would wipe all `.com` cookies). Stops at depth 3.
- `__Host-` / `__Secure-` cookie prefixes have scheme-locked semantics — no http/https flip retry, the failure is reported.

## i18n

5 locales: `en` (default), `it`, `es`, `fr`, `de`. Every new UI string needs all 5. Keys are referenced via:
- `__MSG_key__` in `manifest.json`
- `data-i18n="key"` in HTML (popup + options)
- `browser.i18n.getMessage("key")` in JS

## Versioning

Tied: `manifest.json` `version` and `package.json` `version` must match. Bump together. Current: **0.2.3**.

## What NOT to do

- Don't add `<all_urls>` or host permissions. The CSP `connect-src 'none'` is a deliberate browser-enforced guarantee — don't relax it.
- Don't introduce `fetch`, `XMLHttpRequest`, or any remote call. Network silence is a feature of the extension.
- Don't move logic out of `globalThis.CWD_*` namespaces unless you're migrating the whole background to a module system (MV3 background scripts in Firefox don't support ES modules yet).
- Don't sign on the user's behalf without explicit credentials in the current shell session.
