<!-- project:start -->
# Stillpond

A calm digital pond with procedural koi, full-viewport scenery, and English / Simplified Chinese controls.

**V1.4.0** · [Open the pond](https://seiya058904.github.io/stillpond/) · [Source](https://github.com/seiya058904/stillpond)
<!-- project:end -->

<div align="center">

**An unhurried place for light, water and small movements.**

**[🌿 Open Stillpond](https://seiya058904.github.io/stillpond/)** · [Controls](#controls-and-languages) · [How it works](docs/how-it-works.md) · [Source and license](#origin-and-license)

<img width="3840" height="1866" alt="image" src="https://github.com/user-attachments/assets/e08a399d-e92f-4210-a37b-fe2eb51d8321" />


</div>

> Nothing to complete. No economy to manage. No progress bar to chase.
>
> Call a fish, alter the light or leave the water undisturbed. Stillpond is a quiet place to observe rather than a system to optimize.

## 🌿 A place to observe

The scene shares one evolving water surface across desktop and touch layouts; fish motion and environmental details continue whether or not you interact.

| In the water | Around it |
| --- | --- |
| Procedural koi with body-led turns and drifting, coherent swimming | Lotus leaves and layered petals with subtle surface detail |
| Wakin goldfish with their own silhouette and four-lobed tails | Butterflies with distinct wing families, visits and soft shadows |
| Small Medaka schools with coordinated motion | Weather, light, reflections and optional water/river audio |

**V1.4 — Visual Ecology & Pond Life Pass** adds three Wakin by default, refines butterfly wing families, lotus material, and the subtle way pond life moves together. The world remains a single scene, not a task system.

## Controls and languages

| Action | Control |
| --- | --- |
| Invite fish | Click or tap water to call nearby koi and Wakin |
| Scatter fish | `Space` |
| Change koi count | `[` / `]` |
| Fullscreen (where supported) | `F` |
| Hide / restore UI | `H` (touch the pond to restore on touch devices) |
| Restart simulation | `R` |
| Debug the procedural spine | `D` |

Settings provide **English** (first-visit default) and **简体中文**, with immediate language changes to controls and accessibility labels.

- **Pond:** fish and Wakin count, population settings.
- **Atmosphere:** existing weather presets and light conditions.
- **Sound:** optional ambience, under user control.
- **Display:** Smooth (60 fps), Balanced (30), Save energy (20) and Native choices.
- **Advanced:** more detailed separately loaded options without overwhelming the everyday settings panel.

The scene responds to window size and input across desktop/touch layouts. Rendering has deliberate logical scaling; selected visual detail and device GPU behavior can vary.

## Run locally

Requires Node.js **22.12+** and the committed npm lockfile (CI uses Node 24).

```bash
npm ci
npm run dev
npm run verify
npm run preview
```

`verify` checks synchronized project metadata, tests, TypeScript and the production build. Real-device WebGL recovery, storage denial and touch interactions are distinct acceptance cases; unit tests alone cannot certify every GPU/device combination.

## Behind the water

| Location | Responsibility |
| --- | --- |
| [`src/pond-runtime.ts`](src/pond-runtime.ts) | Simulation lifetime, resize, visibility and renderer recovery |
| [`src/school.ts`](src/school.ts), [`src/koi.ts`](src/koi.ts) | Fish movement and schooling |
| [`src/goldfish.ts`](src/goldfish.ts) | Wakin shape and behavior |
| [`src/fish-renderer.ts`](src/fish-renderer.ts) | Shared water/fish rendering |
| [`src/settings/`](src/settings/) | Live settings, persistence, undo and effects |
| [`src/i18n/`](src/i18n/) | English / Chinese interface copy |
| [`docs/natural-pond.md`](docs/natural-pond.md) | Motion and botanical reference boundaries |

`project.config.json` owns project identity, version, site URL and the stable storage namespace. If project metadata changes intentionally, use `npm run sync:project` and inspect the generated diff; **do not casually change `storagePrefix`**, which identifies existing saved settings. The README header above is maintained as part of that metadata contract.

## Deployment

`.github/workflows/pages.yml` validates and deploys the Vite build to GitHub Pages on the repository's established `main` workflow. The deployed build includes `build-info.json`, the original license and attribution notice. Confirm the actual workflow run and build identity rather than assuming that a Git Push guarantees a successful Pages deployment.

## Origin and license

Stillpond is a derivative of **[Nagomi by Mayank Kadam](https://github.com/msk1039/nagomi)**, starting from upstream commit `01e93a410c0a317ee0a2b81e84a71e54a6db81d0`. Original procedural fish, water, artwork and atmosphere form its inherited foundation; this project extends that base while retaining upstream history and notices.

The **[PolyForm Noncommercial License 1.0.0](LICENSE)** remains in force. This is **not an MIT-licensed or unrestricted commercial project**. Redistribution must include the required license and [NOTICE](NOTICE).

Required Notice: Copyright 2026 Mayank Kadam (https://github.com/msk1039)
