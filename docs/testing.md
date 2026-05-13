# Manual testing checklist — Clear Website Data+

Run before every release / AMO submission.

## 1. Functional — site scope

- [ ] Log into github.com. Open popup, check `cookies`, scope = `This site`, click Clear.
      Expectation: page reloads, you are logged out.
- [ ] Visit a heavy site (e.g. youtube.com). Open the Network panel. Check `cache`, scope = `This site`, Clear.
      Expectation: reload shows fresh network requests (no `(disk cache)` rows).
- [ ] On a PWA site (e.g. twitter.com), check `serviceWorkers`, scope = `This site`, Clear.
      Expectation: service worker disappears from `about:debugging#/runtime/this-firefox -> Service Workers`.
- [ ] Grant a site notification permission. Check `permissions`, scope = `This site`, Clear.
      Expectation: site no longer appears in `about:preferences#privacy -> Notifications`.
- [ ] Visit a site with several pages. Check `history`, scope = `This site`, Clear.
      Expectation: site is gone from `about:history`.

## 2. Functional — all scope

- [ ] On a fresh profile, populate cookies/cache/history on a few sites. Open popup, scope = `All sites`, check everything except passwords/formData, Clear.
      Expectation: `about:history` empty, cookies gone, cache cleared.

## 3. Global-only caveat

- [ ] In site mode, check `cache`. Note the `(global)` chip with tooltip on hover.
      Click Clear.
      Expectation: cache is cleared globally; the user has seen the chip.

## 4. Internal-page state

- [ ] Open the popup from `about:addons`. The origin row should read "Cleaning data for this page is not available". The `This site` radio should be disabled. `All sites` should be selected.

## 5. Persistence

- [ ] Open popup, change checkboxes + scope, close without clicking Clear.
- [ ] Reopen popup. The same checkboxes + scope should be restored.

## 6. Theme & native look

- [ ] Toggle Firefox between built-in Light and Dark themes. Popup should follow.
- [ ] Install a custom LWT theme (e.g. "Solarized Dark"). Popup background/text/accent should adopt the theme's palette.
- [ ] Switch themes rapidly — no flicker, debounced 80 ms.

## 7. i18n

For each of `it`, `es`, `fr`, `de`:

- [ ] In `about:preferences#general`, switch Firefox UI language. Restart.
- [ ] Open popup. All visible strings should be translated. The `(global)` chip tooltip too.

## 8. Reduced motion

- [ ] OS setting "Reduce motion" enabled.
- [ ] Click Clear, trigger the error dialog. No slide-in animation.
- [ ] Hover transitions on checkboxes / buttons should be effectively instant.

## 9. AMO lint

```bash
npm run lint
```

Expectation: 0 errors, 0 warnings.

## 10. Smoke (build)

```bash
npm run build
```

Expectation: `web-ext-artifacts/clear_website_data_plus-<v>.zip` created. Load that zip in `about:debugging` "Load Temporary Add-on" and verify the popup still works end-to-end.
