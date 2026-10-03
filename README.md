<!-- project:start -->
# Stillpond

A calm digital pond with procedural koi, full-viewport scenery, and English / Simplified Chinese controls.

**V1.0.0** · [Open the pond](https://seiya058904.github.io/stillpond/) · [Source](https://github.com/seiya058904/stillpond)
<!-- project:end -->

A quiet, observational pond. Click or tap the water to call the koi; enjoy the
existing procedural swimming, water, plants, weather, and optional river sound.
This V1 establishes an independent, reproducible baseline. It adds no species,
scenes, art assets, progression, economy, or new game systems.

## Run and verify

Use Node.js 22.12+ (CI uses Node.js 24) and npm.

```sh
npm ci
npm run dev
npm run verify
npm run preview
```

`verify` checks project metadata, runs the regression suite, type-checks, and
builds the production site. The dependency lockfile is committed. Development
runs at `/`; a production preview uses the path configured in `siteUrl`.

## Controls and languages

- Click / tap: call the fish. `Space`: scatter. `[` / `]`: change koi count.
- `F`: ambient / browser fullscreen (when supported). `H`: hide or restore UI.
  On a touch device, tap the pond to restore hidden controls.
- `D`: procedural spine debug view. `R`: reset the simulation.
- Settings → **Language**: **English** (first-visit default) or **简体中文**.
  Changes apply immediately, including detailed controls and accessibility labels.
- Pond settings, frame rate, language, and sound preference save on this device.
  Sound starts off on the first visit; browsers require a gesture to resume audio.
  Reset all resets pond settings; language, sound, and frame-rate preferences are
  independent. Storage being disabled must not prevent the pond from running.

## Rendering and responsive layout

The pond covers `100vw × 100dvh`, with controls floating over the scenery.
The original pixel-art renderer is intentional: its logical short edge stays at
270 pixels while its world aspect follows the viewport. At 16:9 this remains
480 × 270; wider / taller windows reveal an adapted pond without stretching
fish geometry. The camera, render targets, shader dimensions, and pointer
coordinates resize together. The scene's internal DPR stays at 1; browser UI
uses native display density. A 4K screen therefore does not create enormous
multi-pass render targets or change the simulation speed.

The default is 60 fps, with 30 fps in ambient mode unless a frame rate was
explicitly selected. Performance depends on the device and browser. Emulated
mobile viewports do not substitute for physical iOS / Android testing.

## Project configuration and development

`project.config.json` is the source of truth for name, slug, version, description,
repository, site URL, and storage namespace. After editing it, run:

```sh
npm run sync:project
npm install --package-lock-only --ignore-scripts
npm run verify
```

The sync script updates the README header and npm metadata. Vite consumes the
same configuration for page metadata, base path, sitemap, and build identity.
When transferring or renaming the GitHub repository, update its About fields
to match the configuration as well. Never change `storagePrefix` merely to
change display branding; it identifies saved preferences.

- `src/app.tsx`: interaction, controls, renderer lifecycle.
- `src/viewport.ts`: viewport/world and input mapping.
- `src/i18n/`: all English/Chinese product text and schema labels.
- `src/settings/`: typed settings, persistence, undo, rendering effects.
- `src/fish-renderer.ts`, `src/koi.ts`, `src/school.ts`: existing renderer and simulation.
- [How the pond works](docs/how-it-works.md): inherited procedural-animation guide.

## Deployment

Push to `main` to run `.github/workflows/pages.yml`: clean dependency install,
metadata checks, tests, build, Pages artifact upload, and deployment. Pull requests
run the same validation without deployment. Pages uses GitHub Actions as its
source. `build-info.json` identifies the exact deployed commit. The production
artifact includes the original `LICENSE` and the attribution `NOTICE`.

## Origin, attribution, and license

This project is derived from **[Nagomi by Mayank Kadam](https://github.com/msk1039/nagomi)**,
starting from `01e93a410c0a317ee0a2b81e84a71e54a6db81d0`. Upstream Git history is
retained, and the original procedural fish, water, artwork, and atmosphere form
the baseline. The upstream promotional UI and product links are removed from
the application; legal attribution remains here and in [NOTICE](NOTICE).

**[PolyForm Noncommercial License 1.0.0](LICENSE)** is preserved unchanged.
This is a noncommercial derivative, not a relicensing under MIT or another
permissive license. Redistribution must include the license (or its URL) and
the required notice. Commercial use is not granted by this initialization.

Required Notice: Copyright 2026 Mayank Kadam (https://github.com/msk1039)
