# Stillpond Agent Guide

React + TypeScript + Vite + Three.js (`index.html` → `src/main.tsx` → `src/app.tsx`; `src/styles.css` shell). Preserve the quiet pond, procedural fish motion, pixel-art scale, `src/i18n/` (EN/ZH-CN), and `LICENSE`/`NOTICE`.

## Architecture & Invariants
- `src/pond-runtime.ts` owns `School`, simulation clock, resize/visibility listeners, and replaceable `FishRenderer`. React owns creation and `dispose()` cleanup only, never simulation frames.
- `src/settings/effects.ts` tracks CPU `School` lifetime across WebGL context loss/recovery; GPU handlers resolve the current nullable renderer (never capture/disconnect stale renderers). `dispose()` tears down all subscriptions, frames, and listeners.
- Hidden pages pause and resume without catch-up. Resize world, renderer, and pointer mapping together (logical short edge `270px`, internal DPR `1`). Physical iOS/Android acceptance requires real devices.
- `src/settings/store.ts` owns live settings, sparse overrides, weather, and undo; extend via `src/settings/definition.ts`. Keep koi-family order and v1/v2 compatibility in `src/settings/persistence.ts` (flushes on `pagehide`). Access `localStorage` existence + read/write/remove inside the same `try` (getter can throw `SecurityError`); denied/full storage must keep defaults/session usable.
- Optional species live in `src/species-art.ts` with default count `0` (default pond stays byte-identical). Large/medium fish reuse `Koi` agents + `membranePoint` (`src/fish-spine.ts`); small species are color-only Medaka via `TinyFishRenderer` (see `docs/how-it-works.md`, inspect frame-by-frame against koi).
- `project.config.json` is metadata source of truth — keep `storagePrefix` stable on rebrands; lazy-load only the detailed editor.

## Commands & Delivery
- Node 22.12+ (CI uses 24), committed lockfile: `npm ci`, `npm run dev` (root `/`), `npm run verify` (metadata + Vitest + typecheck + build), `npm run preview` (`siteUrl` subpath), `npm run sync:project` (after metadata edits), `git diff --check`.
- For runtime/settings changes: build, run `npm run test:browser` (`npx playwright install chromium` first; owns preview, writes evidence outside repo), and verify real WebGL2 context-loss/restore + reload persistence + visibility pause/dispose (software WebGL/unit tests alone do not prove hardware GPU recovery).
- Fork rule: derive `gh --repo` from `origin` (never auto-select `upstream`). `.github/workflows/pages.yml` runs `verify` + browser checks and deploys `dist/` on `main`; confirm deployed SHA, `build-info.json`, and asset bytes after authorized release.
