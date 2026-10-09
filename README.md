<!-- project:start -->
# Stillpond

A calm digital pond with procedural koi, full-viewport scenery, and English / Simplified Chinese controls.

**V1.4.0** · [Open the pond](https://seiya058904.github.io/stillpond/) · [Source](https://github.com/seiya058904/stillpond)
<!-- project:end -->

<div align="center">

<h2>🌿 A Little World That Asks Nothing of You</h2>

<p><strong>Watch the light move. Follow a fish. Let the water settle.</strong></p>

<p>A full-screen, procedural pond where koi, Wakin goldfish, and Medaka<br>
move through water, weather, lotus leaves, and the occasional butterfly.</p>

<p>
  <a href="https://seiya058904.github.io/stillpond/"><strong>▶ Enter the Pond</strong></a>
  &nbsp;·&nbsp;
  <a href="#life-in-the-pond">🐟 Pond Life</a>
  &nbsp;·&nbsp;
  <a href="#a-gentle-touch">🫧 Interact</a>
  &nbsp;·&nbsp;
  <a href="#make-it-yours">⚙️ Settings</a>
  &nbsp;·&nbsp;
  <a href="#behind-the-water">🛠️ How It Works</a>
</p>

<p><sub>PROCEDURAL FISH &nbsp;·&nbsp; LIVING WATER &nbsp;·&nbsp; DESKTOP + TOUCH &nbsp;·&nbsp; ENGLISH / 简体中文</sub></p>

<img width="860" alt="Stillpond — original full-width screenshot of the digital koi pond" src="https://github.com/user-attachments/assets/e08a399d-e92f-4210-a37b-fe2eb51d8321" />

</div>

---

> **No levels to clear. No score to improve. No reason to hurry.**
>
> Stillpond is a quiet, interactive scene. You can call the fish toward you, change the atmosphere, or simply leave everything undisturbed. The pond carries on either way.

<a id="life-in-the-pond"></a>
## 🐟 Life in the Pond

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🎏 Koi — A Body in Motion</h3>
      <p><sub>GLIDE · COAST · TURN · FOLLOW</sub></p>
      <p>Procedural koi travel with gentle inertia and a flexible spine. Their heads steer; the rest of each body follows, with fins and tails responding to motion rather than playing a fixed animation.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🐠 Wakin — A Different Silhouette</h3>
      <p><sub>GOLDFISH · SPLIT TAIL · SHARED SWIMMING RULES</sub></p>
      <p>Wakin goldfish share the mature movement system while retaining their own smaller body proportions and expressive, split-tail appearance. Three are present by default in V1.4.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🌊 Medaka — Small Movements</h3>
      <p><sub>SCHOOLING · DISTURBANCE · DEPTH</sub></p>
      <p>Small fish move in coordinated schools. A tap that draws the larger fish closer may send the tiny ones away, making the same ripple mean different things beneath the surface.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🪷 A Living Environment</h3>
      <p><sub>LOTUS · BUTTERFLIES · LIGHT · WEATHER</sub></p>
      <p>Layered lotus flowers, floating leaves, butterflies, water tint, and changing atmospheric conditions give the pond a sense of time and place without creating a task list.</p>
    </td>
  </tr>
</table>

### ✦ What's New in V1.4

A visual ecology pass brings **three Wakin goldfish**, more distinct butterfly wing families, refined lotus geometry, and a subtler pond surface. The additions strengthen the shared scene without turning it into a collection game.

<a id="a-gentle-touch"></a>
## 🫧 A Gentle Touch

<p align="center"><code>WATCH &nbsp;→&nbsp; TAP THE WATER &nbsp;→&nbsp; LET THE POND RESPOND</code></p>

| Action | Control |
| --- | --- |
| **Invite nearby fish** | Click or tap the water |
| **Scatter the fish** | `Space` |
| **Change koi population** | `[` / `]` |
| **Toggle fullscreen** | `F` (where supported) |
| **Hide or restore the interface** | `H` (tap the scene to restore on touch devices) |
| **Restart the simulation** | `R` |
| **Show procedural-spine diagnostics** | `D` |

When you click or tap, a ripple appears and individual koi and Wakin respond with different delays. They approach, turn, and circle naturally rather than snapping to a cursor. You can also do nothing; the scene remains alive without input.

<a id="make-it-yours"></a>
## ⚙️ Make It Yours

The everyday settings are deliberately small. More detailed controls live in a separately loaded **Advanced** editor.

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🐟 Pond</h3>
      <p>Adjust the visible koi and Wakin population and selected composition settings.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🌤️ Atmosphere</h3>
      <p>Explore weather and lighting presets while keeping the same living pond beneath them.</p>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🔉 Sound</h3>
      <p>Enable or adjust optional ambient water and river sounds under your control.</p>
    </td>
    <td width="50%" valign="top">
      <h3>🖥️ Display & Language</h3>
      <p>Choose Smooth (60 fps), Balanced (30), Save energy (20), or Native display modes; switch between English and Simplified Chinese.</p>
    </td>
  </tr>
</table>

**English is the first-visit default**, and language changes update the interface and accessibility labels. Preferences are stored locally when browser storage permits; a storage-denied session should still be usable with defaults.

> [!NOTE]
> **A procedural illustration, not a scientific tank simulator.** Fish steering and water rendering are informed by natural references, but their speeds, proportions, and behavior are tuned for an artistic, low-resolution pond. Physical devices and browsers can differ in WebGL performance and visual detail.

<a id="behind-the-water"></a>
## 🛠️ Behind the Water

The pond is built with **React, TypeScript, Vite, and Three.js**. Fish movement is simulated independently from rendering: a school decides where fish travel, their spines create a pose, and the renderer composites the pond bed, depth, fish, water, plants, and weather.

<details>
<summary><strong>⚙️ Expand source map, local development &amp; preservation notes</strong></summary>

### Run locally

Use **Node.js 22.12+** and the committed lockfile. From the repository root:

```bash
npm ci
npm run dev
npm run verify
npm run preview
```

`verify` checks generated project metadata, runs Vitest tests, type-checks, and builds the production app. Browser-based checks of real WebGL recovery, visibility changes, pointer alignment, and touch interactions are separate from unit-test coverage.

### Source map

| Path | Responsibility |
| --- | --- |
| [`src/pond-runtime.ts`](src/pond-runtime.ts) | Simulation lifetime, resize, visibility, and WebGL recovery |
| [`src/school.ts`](src/school.ts) · [`src/koi.ts`](src/koi.ts) | Steering, group behavior, and procedural koi motion |
| [`src/goldfish.ts`](src/goldfish.ts) | Wakin silhouette and motion integration |
| [`src/fish-renderer.ts`](src/fish-renderer.ts) | Layered fish and pond rendering |
| [`src/settings/`](src/settings/) | Settings, persistence, and runtime effects |
| [`src/i18n/`](src/i18n/) | English and Chinese interface text |
| [`docs/how-it-works.md`](docs/how-it-works.md) | Accessible explanation of procedural movement and rendering |
| [`docs/natural-pond.md`](docs/natural-pond.md) | Natural references and visual-ecology design boundaries |

### Preserve the project identity

[`project.config.json`](project.config.json) defines the name, version, homepage, and stable storage namespace. The **machine-managed block at the top of this README** is synchronized with that file. After an intentional metadata change, run `npm run sync:project`, review the diff, and keep the `storagePrefix` stable for existing preferences.

The [Pages workflow](.github/workflows/pages.yml) verifies the app and deploys `dist/` from `main`; a successful source push alone does not prove that a particular browser received the new build. Preserve the original upstream attribution and distributed notices.

</details>

## 📜 Origin, Attribution & License

Stillpond is a derivative of **[Nagomi by Mayank Kadam](https://github.com/msk1039/nagomi)**, based on upstream commit `01e93a410c0a317ee0a2b81e84a71e54a6db81d0`. Its procedural fish, water, artwork, and core scene are inherited foundations, extended here with new interaction, presentation, accessibility, and ecology work.

The project retains the **[PolyForm Noncommercial License 1.0.0](LICENSE)** and its [required NOTICE](NOTICE). **This is not an MIT-licensed project and does not grant general commercial reuse permission.** Review the license terms and keep the required notice with distributed copies.

> Required Notice: Copyright 2026 Mayank Kadam (https://github.com/msk1039)

---

<p align="center">
  <sub>NOTHING TO WIN. NOTHING TO RUSH. JUST A POND THAT KEEPS MOVING.</sub><br>
  <sub>Stillpond · A little place to stay.</sub>
</p>
