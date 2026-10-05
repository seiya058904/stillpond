# Stillpond repository guide

## Source and lifecycle

- React + TypeScript + Vite + Three.js. `index.html` → `src/main.tsx` → `src/app.tsx`; `src/styles.css` owns the shell. Preserve the quiet pond, procedural fish motion and pixel-art scale. Keep English / Simplified Chinese copy in `src/i18n/` and retain `LICENSE` / `NOTICE` attribution.
- `src/pond-runtime.ts` owns the `School`, simulation clock, resize and visibility listeners, and replaceable `FishRenderer`. React owns its creation and `dispose()` cleanup, never simulation frames.
- The settings-effect subscription in `src/settings/effects.ts` follows the CPU `School` lifetime, including pending light/heavy changes during WebGL loss or renderer creation failure. GPU handlers resolve the current nullable renderer; do not disconnect or capture an obsolete renderer during recovery. `dispose()` ends subscriptions, cancels scheduled effects and frames, and removes listeners.
- Hidden pages pause simulation and resume without catch-up. Resize world, renderer and pointer mapping together; the logical short edge is 270 pixels and internal DPR is 1. Desktop and touch layouts share the pond; physical iOS / Android acceptance needs actual devices.
- `src/settings/store.ts` owns live settings, sparse overrides, weather and undo. Extend settings through `src/settings/definition.ts`. Preserve ordered koi-family assignments and v1/v2 compatibility through `src/settings/persistence.ts`; disabled or full storage must not stop the pond. Persistence flushes on `pagehide`.
- Acquire Web Storage and check its existence inside the same `try` as each read/write/remove: the `localStorage` getter itself can throw `SecurityError` before React mounts. Denied storage must keep defaults and session settings usable.
- `project.config.json` is the project metadata source. Preserve `storagePrefix` when changing branding so existing preferences remain readable. Ordinary settings load with the app; only the detailed editor is lazy-loaded.

## Commands and acceptance

Use Node.js 22.12+ (CI uses 24) and the committed npm lockfile, from the repository root:

```text
npm ci
npm run dev
npm run verify
npm run preview
```

`verify` checks project metadata, runs Vitest, type-checks and builds. Development uses `/`; production preview uses the pathname in `siteUrl`. Run `npm run sync:project` after intentional metadata changes, then verify the resulting diff.

For runtime/settings changes, use an isolated browser profile and real WebGL2: change both light and heavy settings while the context is lost, restore it, confirm fish state and motion, then reload to check persistence. Also cover visibility pause/resume and disposal. Browser tests have no npm script; unit tests alone do not establish GPU recovery. Keep unique browser evidence outside the repository and run `git diff --check`.

## Delivery

`.github/workflows/pages.yml` runs `verify` for pull requests and deploys `dist/` on `main`. Check the exact final CI/Pages commit, deployed `build-info.json` and asset bytes. This is a fork: derive GitHub CLI `--repo` from `origin`; automatic selection can choose `upstream` instead. Preserve upstream history, attribution and unique evidence; remove only verified disposable outputs.
