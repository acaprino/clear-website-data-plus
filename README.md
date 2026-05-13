# Clear Website Data+

A Firefox extension that wipes cookies, cache, storage, history, downloads and per-origin permissions either for the current site or across every site — in a popup styled like Firefox's own native panels.

Forked in spirit from [Clear Website Data](https://addons.mozilla.org/en-US/firefox/addon/clear-website-data/), modernized to Manifest V3 and the native-Firefox-panel visual style from [firefox-workspaces](https://addons.mozilla.org/firefox/addon/workspaces-by-hardfox/).

## Features

- **Toolbar popup**, no options page. One surface, all controls.
- **Scope toggle**: clear data for **This site** or **All sites**.
- **Per-type checkboxes**:
  - Browsing & storage: cookies, cache, local storage, IndexedDB, service workers + Cache API, plugin data
  - Other: history, downloads, form data, passwords
- **Honest "global" chip** on data types Firefox cannot scope to a single site (cache, plugin data, form data, passwords).
- **Remembered selection**: scope + checkboxes persist across openings.
- **Auto-reload** of the active tab after a successful clear.
- **Native Firefox-panel look** — zero hardcoded hex except one "danger" red seed. Follows the user's Firefox LWT theme via `--ff-popup-*` vars; otherwise tracks `Canvas`/`CanvasText`/`AccentColor` system colors.
- **i18n**: English, Italian, Spanish, French, German.
- **Reduced-motion** aware.

## Install (development)

```bash
npm install
npm run dev          # web-ext run — opens a fresh Firefox profile with the extension loaded
```

Then click the broom icon in the toolbar.

## Build (production)

```bash
npm run lint         # web-ext lint
npm run build        # produces web-ext-artifacts/clear_website_data_plus-<v>.zip
```

## Sign (AMO)

Set `WEB_EXT_API_KEY` and `WEB_EXT_API_SECRET` (from <https://addons.mozilla.org/developers/addon/api/key/>) then:

```bash
npm run sign:listed     # public AMO listing
npm run sign:unlisted   # self-hosted signed XPI
```

## Permissions used

| Permission | Why |
|---|---|
| `browsingData` | The primary clearing API. |
| `cookies` | eTLD+1 cookie sweep that `browsingData.remove` may miss for subdomains. |
| `history` | Per-site history clearing (browsingData ignores `origins` for history). |
| `downloads` | Per-site downloads clearing (same reason). |
| `activeTab` | Reading the active tab URL and reloading it after clear. |
| `storage` | Persisting the user's last-chosen scope + checkboxes. |
| `theme` | `browser.theme.getCurrent` + `onUpdated` for the native-panel look. |

No `<all_urls>` host permission is requested. The popup declares an explicit `content_security_policy.extension_pages` with `connect-src 'none'` — the extension has no network surface and that's machine-enforced.

## Architecture

```
clear-website-data-plus/
├── manifest.json
├── background/
│   ├── theme-utils.js     # shared with popup (color/dark detection)
│   ├── storage.js         # prefs schema + sanitizer
│   ├── cleaner.js         # per-type clearing strategy
│   └── handler.js         # runtime.onMessage dispatcher
├── popup/
│   ├── cwd.html
│   ├── css/cwd.css        # native-like stylesheet
│   └── js/
│       ├── theme-apply.js # LWT --ff-popup-* injection
│       ├── dialog.js      # in-popup error/diagnostic dialog
│       └── cwd.js         # popup controller
├── _locales/{en,it,es,fr,de}/messages.json
├── icons/{broom-light,broom-dark,broom-mono}.svg, icon-{48,96}.png
└── docs/testing.md
```

See [`docs/plans/2026-05-13-clear-website-data-firefox-extension-design.md`](../docs/plans/2026-05-13-clear-website-data-firefox-extension-design.md) for the full design spec.

## Caveats

- `cache`, `pluginData`, `formData`, `passwords` cannot be scoped to a single site by Firefox. Selecting them in "This site" mode clears them globally. Each gets a `(global)` chip in the UI so the behavior is never hidden.
- Default-checked types are: cookies, cache, localStorage, indexedDB, serviceWorkers. `cache` is included to match the original Clear Website Data extension's behavior; the chip is the explicit signal.

## License

MPL-2.0
