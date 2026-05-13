<div align="center">

<img alt="Clear Website Data+" src="icons/broom-mono.svg" width="96">

# Clear Website Data+

**One click. One site. Or every site. Wipe cookies, cache, storage, history, downloads — in a popup that looks like Firefox built it.**

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-orange?style=flat-square)](LICENSE)
[![Firefox 115+](https://img.shields.io/badge/Firefox-115%2B-FF7139?style=flat-square&logo=firefox-browser&logoColor=white)](https://www.mozilla.org/firefox/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-7B4FAB?style=flat-square)](https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/)
[![AMO signed](https://img.shields.io/badge/AMO-signed%20(unlisted)-3FE1B0?style=flat-square)](https://addons.mozilla.org/)
[![GitHub stars](https://img.shields.io/github/stars/acaprino/clear-website-data-plus?style=flat-square)](https://github.com/acaprino/clear-website-data-plus/stargazers)
[![Last commit](https://img.shields.io/github/last-commit/acaprino/clear-website-data-plus?style=flat-square)](https://github.com/acaprino/clear-website-data-plus/commits/main)

</div>

---

## Why

- 🎯 **Per-site or global, your call.** Toggle "This site / All sites" without a separate menu.
- 🧠 **Remembers what you picked.** Selections persist across openings — open, click, done.
- 🪟 **Native Firefox panel.** Zero hardcoded colors. Follows your LWT theme, your accent, your system palette.
- 🛑 **Honest about Firefox's limits.** Cache, plugin data, form data, passwords get a `(global)` chip when they can't be scoped to one site — no silent surprises.
- 🌍 **Five languages out of the box.** EN, IT, ES, FR, DE.
- 🔒 **Zero network, zero tracking.** No `fetch`, no telemetry. Manifest CSP locks `connect-src 'none'` — the browser enforces it.

---

## Quick Start

### Install (end users)

The signed XPI ships with each tagged release.

```bash
gh release download --repo acaprino/clear-website-data-plus --pattern '*.xpi'
```

Then drag the `.xpi` onto Firefox, or open `about:addons` → ⚙️ → **Install Add-on From File…**

> No releases yet? Use the developer path below — `npm run dev` opens a temp Firefox profile with the extension already loaded.

### Install (developers)

```bash
git clone https://github.com/acaprino/clear-website-data-plus
cd clear-website-data-plus
npm install
npm run dev
```

A fresh Firefox profile launches with the extension loaded. Click the broom icon in the toolbar.

---

## What it clears

| Data type | Per-site? | Notes |
|---|:---:|---|
| Cookies | ✅ | Plus eTLD+1 sweep that `browsingData.remove` may miss |
| Local storage | ✅ | |
| IndexedDB | ✅ | |
| Service workers + Cache API | ✅ | Wipes PWA installs |
| History | ✅ | Filtered by hostname; paginated to handle 200k+ entries |
| Downloads | ✅ | Entry only — your files on disk stay put |
| Cache | 🌐 global | Firefox API limitation; surfaced with a `(global)` chip |
| Plugin data | 🌐 global | |
| Form data | 🌐 global | |
| Passwords | 🌐 global | Off by default — opt-in only |

---

## Permissions

No `<all_urls>`, no host permissions, no remote code.

| Permission | Why |
|---|---|
| `browsingData` | The primary clearing API. |
| `cookies` | Subdomain cookie sweep. |
| `history`, `downloads` | Per-site filtering (browsingData ignores `origins` for these). |
| `activeTab` | Reads the active tab URL and reloads it after clear. |
| `storage` | Persists the user's last selection. |
| `theme` | Native-panel look via `browser.theme.getCurrent` / `onUpdated`. |

The popup ships with an explicit `content_security_policy` containing `connect-src 'none'` — any future bug that introduced a `fetch()` would be blocked by the browser, not just by code review.

---

## Build & sign

```bash
npm run lint      # web-ext lint --self-hosted
npm run build     # produces web-ext-artifacts/clear_website_data_-<v>.zip
```

To sign for self-distribution (unlisted) or AMO (listed):

```bash
export WEB_EXT_API_KEY=user:...        # from https://addons.mozilla.org/developers/addon/api/key/
export WEB_EXT_API_SECRET=...
npm run sign:unlisted                   # signed XPI for direct install
npm run sign:listed                     # public AMO listing
```

`web-ext` reads the env vars directly — works the same on bash, PowerShell, and CI.

---

<details>
<summary><b>Architecture</b></summary>

Two execution contexts share one constant utility module. All cross-script wiring goes through `globalThis.CWD_*` namespaces (Firefox MV3 background scripts don't accept ES `import`).

```mermaid
flowchart LR
  subgraph "Background event page"
    TU[theme-utils.js] --> ST[storage.js<br/>CWD_STORAGE] --> CL[cleaner.js<br/>CWD_CLEANER] --> HD[handler.js]
  end
  subgraph "Popup document"
    TU2[theme-utils.js] --> TA[theme-apply.js<br/>CWD_APPLY] --> DG[dialog.js<br/>CWD_DIALOG] --> CW[cwd.js]
  end
  CW -.runtime.sendMessage.-> HD
  HD -.runtime.onMessage.-> CW
```

| File | Lines | Responsibility |
|---|---:|---|
| `background/theme-utils.js` | 81 | LWT color detection — loaded into both contexts |
| `background/storage.js` | ~75 | `cwd.prefs.v1` schema + `_sanitizePrefs` |
| `background/cleaner.js` | ~250 | `browsingData.remove` strategy per data type + eTLD+1 cookie sweep + history/downloads filters |
| `background/handler.js` | ~75 | `runtime.onMessage` dispatcher: `clear` / `getPrefs` / `setPrefs` |
| `popup/css/cwd.css` | 425 | Native-panel stylesheet — system colors + LWT vars |
| `popup/js/theme-apply.js` | ~85 | Injects `--ff-popup-*` CSS vars from `theme.colors` |
| `popup/js/dialog.js` | ~95 | In-popup error/diagnostic dialog |
| `popup/js/cwd.js` | ~270 | Popup controller (i18n, scope, checkboxes, clear flow) |

</details>

<details>
<summary><b>Caveats (read once)</b></summary>

- `cache`, `pluginData`, `formData`, `passwords` cannot be scoped to a single site by Firefox. Selecting them in "This site" mode clears them globally — each row shows a `(global)` chip and tooltip.
- Default-checked types: cookies, cache, localStorage, indexedDB, serviceWorkers. `cache` is in the defaults to match the original *Clear Website Data* extension's behavior; the chip is the explicit signal.
- Site permissions (notifications, geolocation, camera, mic) are **not** supported — Firefox doesn't expose a WebExtension API for clearing them. The placeholder was intentionally cut from MVP.
- Cookie sweep walks up to 3 parent hostnames but never queries the public-suffix domain (`com`, `co.uk`, …) — this is approximate eTLD+1 without bundling a Public Suffix List.

</details>

<details>
<summary><b>Testing checklist</b></summary>

See [`docs/testing.md`](docs/testing.md) for the manual smoke checklist run before each release: site-scope cookies, all-scope wipe, theme switching, i18n verification, reduced-motion mode, AMO lint.

</details>

---

## Contributing

Issues and pull requests welcome at [github.com/acaprino/clear-website-data-plus](https://github.com/acaprino/clear-website-data-plus). Start small: a translation, a default-types tweak, a UX nit. The codebase is ~1300 lines total and has no transpiler — open a file and start reading.

---

<div align="center">

Built with ❤️ for Firefox by <a href="https://github.com/acaprino">Alfio Caprino</a> · <a href="LICENSE">MPL-2.0</a>

</div>
