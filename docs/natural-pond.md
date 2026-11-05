# Natural Pond & Visual Ecology

## Optional species — local iteration

The default pond no longer includes Shubunkin, and nine new species join them as fish
a visitor can add. None is present until added. A saved count is an explicit edit and
is never rewritten, whatever its value; a save that never touched a count receives
the new default of zero.

| Class | Species | Scientific name or line | Reads as | Limit |
| --- | --- | --- | --- | --- |
| Large | Sterlet / 小体鲟 | *Acipenser ruthenus* | Near-black back, pale scute rows, pointed rostrum, shark tail | 4 fish |
| Large | High-fin banded shark / 胭脂鱼 | *Myxocyprinus asiaticus* | Cream head, dark slanting bands, a leaning dorsal sail | 4 fish |
| Large | American paddlefish / 匙吻鲟 | *Polyodon spathula* | Pale spoon rostrum, mottled gill flaps, steel skin | 4 fish |
| Medium | Ranchu / 兰寿 | Goldfish variety | Broad back with no dorsal, raspberry hood, short tucked tail | 6 fish |
| Medium | Panda butterfly tail / 熊猫蝶尾 | Goldfish variety | Black and white blocks, telescope eyes, wings of a tail | 6 fish |
| Medium | Bubble eye / 水泡眼 | Goldfish variety | Two jiggling fluid sacs, no dorsal, long soft fan | 6 fish |
| Medium | Golden orfe / 金色高体雅罗鱼 | *Leuciscus idus*, golden form | Slim orange dart, pale flanks, freckled head, clean fork | 6 fish |
| Small | White Cloud minnow / 唐鱼 | *Tanichthys albonubes* | A Medaka in olive gold with a red tail | 4 shoals |
| Small | Paradise fish / 叉尾斗鱼 | *Macropodus opercularis* | A Medaka in coral with blue-green fins | 4 shoals |

Shubunkin also receive their own tail. Theirs had been the platinum longfin's outline,
as a stopgap. It is now the Bristol form: broad, moderately forked and rounded at the
ends, like a heart or a soft "B". The motion code did not change, and a test compares each vertex with
`membranePoint` and the shared clocks.

### Choices where the fish and the view disagree

These are illustrations seen from above, so a few things are deliberately not literal:

- Caudal fins are vertical on a living fish and nearly edge-on from above. Here, as with
  every fish in the pond, they lie spread so the outline can be read. The sterlet's and
  paddlefish's unequal lobes are the heterocercal tail, laid flat.
- A high-fin banded shark is laterally compressed, so its back is narrower from above
  than drawn. The pond shows the banded juvenile, which is the recognizable form; bands
  fade in adults, which grow long and lose the tall fin.
- Its tall sail would be seen nearly edge-on. It leans with the stroke and away from a
  turn so that it stays visible, and never collapses to a line.
- The small species are not drawn to their own outlines at all. Individually drawn
  bodies, a thin pond loach among them, looked less natural at this scale than the
  Medaka, so the loach was dropped and the other two became Medaka in their own colors.
  Their real colors sit mostly on the flanks, and are brought onto the back here.
- No established Chinese trade name was found for the golden orfe. 高体雅罗鱼 is the
  species name, so the label is that name with 金色 for the color form.

### Motion

No fish has its own swimming rules. Large and medium species are `Koi` agents in
`School`. Small species are `TinyFishSchools` whose config inherits the live Medaka
settings and adds only a shoal count and a size slider. Tests check that, from the same
start, they swim exactly as Medaka do and draw the same vertices in other colors.

The knobs are proportions and pace. `waveRatio` sets the swimming wave through
`bodyWidth`, separately from the silhouette, so a fat Ranchu does not thrash. `pace`
scales speed: fancy goldfish are slow, and the orfe is quick. `agility` scales turning,
because at the koi's turn strength a fish 50 pixels long coils like a snake.

All caudal fins run on `membranePoint`, `longTailOpening` and `longTailFlex`. A long
fin held rigid looked stiff beside a bending body, so large and medium species add the
koi's own traveling wave and turn follow-through to the `flex` argument. Sideways
motion that varies along a fin can flip thin triangles, so those fins are cut into
strips with one edge across the fin, whose area is exactly preserved under it. Fins that
double back along their length (the butterfly wing) keep plain triangles and a lower
wave. Pectorals are the Shubunkin's rigid sweep, now done in contour space and passed
through `membranePoint`.

Tail-tip smoothness was compared with the koi over one scripted run with a call and a
scatter, as the largest change between consecutive frame-to-frame movements. A test
requires each large and medium species to stay within twice the koi's value in pond
pixels. Tails are longer than the koi's, so they travel further for the same swing. The
table below is one measured run, in fractions of body length.

| Fish | Beats per second at cruise | Tail swing | P99 | Largest |
| --- | --- | --- | --- | --- |
| Koi | 0.71 | 1.01 | 0.022 | 0.093 |
| Platinum longfin | 1.07 | 1.68 | 0.030 | 0.115 |
| Sterlet | 0.65 | 0.92 | 0.014 | 0.041 |
| High-fin banded shark | 0.79 | 0.96 | 0.036 | 0.061 |
| American paddlefish | 0.71 | 0.72 | 0.017 | 0.023 |
| Ranchu | 1.02 | 0.92 | 0.036 | 0.062 |
| Panda butterfly tail | 0.87 | 1.03 | 0.030 | 0.073 |
| Bubble eye | 0.93 | 1.42 | 0.040 | 0.089 |
| Golden orfe | 1.17 | 1.21 | 0.035 | 0.057 |

### Rendering and settings

One `SpeciesRenderer` draws every large and medium fish in one batch and three draw
calls, deepest first across species, beneath the koi and above the older medium fish.
Buffers start empty and grow on demand, and the groups are hidden while empty. Each fish
uses 516–792 shape, 234–330 shadow and 4–108 line vertices. Small species are drawn by
`TinyFishRenderer` in the Medaka batch, one palette per shoal, in shoals of the default
Medaka sizes (24, 15, 34 and 19). The disturbance pass reserves 104 instances.

The settings root now has the koi slider, one row for the fish list, and the Medaka
switch. The list groups all 14 populations into large, medium and small, each row with a
portrait drawn from the fish's own outlines, a count and a stepper. Advanced replaces one
page per species with one per size class, and search still finds each fish in either
language. "Restore default fish" resets who is in the pond, leaving sizes and koi colors
alone, and can be undone.

To keep the maximum scene responsive, the shared spine functions and the neighbor loop
stopped allocating a vector per node. The arithmetic is unchanged, and the default pond
trace below confirms it.

### Sources

Photographs and illustrations studied, from Wikimedia Commons:
[sterlet](https://commons.wikimedia.org/wiki/File:Acipenser_ruthenus_Prague_Vltava_1.jpg),
[high-fin juveniles](https://commons.wikimedia.org/wiki/File:Myxocyprinus_asiaticus_by_OpenCage.jpg),
[high-fin juvenile and adult](https://commons.wikimedia.org/wiki/File:Myxocyprinus-asiaticus-Catostomidae-juveniles-body-length-14cm-foreground-differ-in.png),
[paddlefish illustration](https://commons.wikimedia.org/wiki/File:Paddlefish_Polyodon_spathula.jpg),
[Ranchu](https://commons.wikimedia.org/wiki/File:Three_Ranchu_Goldfish.jpg),
[Ranchu plate](https://commons.wikimedia.org/wiki/File:Ranchu_goldfish_plate.jpg),
[butterfly tail from above](https://commons.wikimedia.org/wiki/File:Calico-butterfly-tail-demekin.png),
[panda butterfly tail](https://commons.wikimedia.org/wiki/File:%E3%83%91%E3%83%B3%E3%83%80%E3%83%81%E3%83%A7%E3%82%A6%E3%83%93.jpg),
[bubble eye from above](https://commons.wikimedia.org/wiki/File:Bubble_eye_goldfish_(top).jpg),
[golden orfe from above, in a pond](https://commons.wikimedia.org/wiki/File:Wraxall_2009_MMB_%C2%AB01_leuciscus_idus.jpg),
[White Cloud minnow](https://commons.wikimedia.org/wiki/File:White_Cloud_Mountain_Minnow_1.jpg),
[paradise fish](https://commons.wikimedia.org/wiki/File:DV_Paradise_fish_male_05.jpg) and
[Shubunkin](https://commons.wikimedia.org/wiki/File:Shubunkin_goldfish.jpg).
Only the butterfly tail, bubble eye and orfe images are true top views. The others were
read from the side alongside these descriptions:

- [FishBase on the sterlet](https://www.fishbase.org/summary/4604): beige back and flanks, five scute rows, narrow snout. Photographs show darker fish, which the pond follows.
- [Wikipedia on *Myxocyprinus*](https://en.wikipedia.org/wiki/Myxocyprinus): three slanting bands, the tall fin, and how both change with age.
- [Louisiana Wildlife and Fisheries on the paddlefish](https://www.wlf.louisiana.gov/species/detail/80): dark gray and scaleless, with a long gill flap; [USFWS](https://legacy.fws.gov/species/paddlefish-polyodon-spathula) on the paddle.
- [The Goldfish Council on top-view Ranchu](https://www.thegoldfishcouncil.org/post/top-view-ranchu): judged from above, rectangular body, short tail, large hood. [Wikipedia](https://en.wikipedia.org/wiki/Ranchu) on the same.
- [Wikipedia's list of goldfish varieties](https://en.wikipedia.org/wiki/List_of_goldfish_varieties): butterfly-shaped caudal fins when viewed from above, and tails flattened horizontally.
- [Wikipedia on the bubble eye](https://en.wikipedia.org/wiki/Bubble_Eye): sacs of fluid that jiggle, no dorsal fin, slow swimming.
- [Garnelio on the golden orfe](https://www.garnelio.de/en/golden-orfe-leuciscus-idus): golden orange with a lighter belly, a schooling fish.
- [Seriously Fish on the White Cloud minnow](https://seriouslyfish.com/species/Tanichthys-albonubes) and [Britannica](https://www.britannica.com/print/article/642182): olive to reddish brown, a gleaming line, red on the fins.
- [FishBase on the paradise fish](https://www.fishbase.org/summary/4777): forked tail with filaments, and an air breather.
- [Wikipedia on the Shubunkin](https://en.wikipedia.org/wiki/Shubunkin): the Bristol's large, moderately forked tail, rounded at the end, shaped like a heart or a capital "B". [Practical Fishkeeping](https://www.practicalfishkeeping.co.uk/features/the-bristol-shubunkin-a-national-treasure/): a drooping tail is a fault.
- Chinese Wikipedia for the names [胭脂鱼](https://zh.wikipedia.org/wiki/胭脂魚), [高体雅罗鱼](https://zh.wikipedia.org/wiki/高体雅罗鱼), [唐鱼](https://zh.wikipedia.org/wiki/唐鱼), [叉尾斗鱼](https://zh.wikipedia.org/wiki/叉尾鬥魚) and [小体鲟](https://zh.wikipedia.org/wiki/小体鲟). Its current title for the last is 小体鳇, after a change of genus; 小体鲟 stays the common name.

### Local acceptance, 2026-11-05

These results were measured on the uncommitted iteration against
`bea5d6d87f5199ee5ac6a34bd07ff8fcb0a0dcb7`, before the small species became recolored
Medaka and the pond loach was removed. The GPU object counts, the trace comparison and the
CPU table below have not been repeated since; the largest scene now has 184 small fish,
not 92. The change itself was checked by the tests above, `scripts/browser-settings.mjs`
at both sizes and an enlarged visual comparison of the three small fish, on SwiftShader.

- `npm run verify` passed 357 tests, with the existing large-chunk build warning.
- With a fixed clock and seeded randomness, the default pond was compared against that
  commit with its Shubunkin count set to zero: all six sampled frames over 20 seconds,
  including a call and a scatter, matched byte for byte, as did the fish state trace.
- `scripts/browser-settings.mjs` passed at 1280×900 and 390×844 on real WebGL2 (NVIDIA
  GeForce RTX 3070 Laptop through ANGLE D3D11). It now also adds a sterlet and a shoal
  while the context is lost and checks both after a reload.
- A separate scripted run covered defaults, steppers and limits, overflow, focus return,
  search in both languages, reload, restore and undo at 1440×900 (English dark), 1280×800
  (Chinese light), 390×844 (Chinese dark, English light), 320×568 (Chinese light) and
  844×390 (English dark). At 844×390 the side panel still overlaps part of the dock.
- GPU objects stayed at 84 geometries / 3 textures across five rounds of adding and
  removing every species, up from 78 / 3 before the first fish is added, and fell to zero
  on disposal. These are object counts, not memory bytes.
- Each species was reviewed on frame-by-frame sheets of straight swimming, a turn, a call
  and a scatter, beside the koi. The full pond was reviewed on desktop in sunny, sunset
  and moonlight weather, and at phone size in sunny weather.

CPU time per animation-frame callback on production builds, P95 / P99 in milliseconds,
across two or three 12-second samples at 1440×900. Most callbacks at this display's refresh rate do no
work under the 60 fps cap, which is why medians are omitted. No frame interval exceeded
50 ms. This excludes GPU elapsed time.

| Scene | Before | After |
| --- | --- | --- |
| Default, without Shubunkin | 2.8 / 3.6–3.9 | 2.7–2.9 / 3.3–3.7 |
| 68 older fish | 4.2–4.4 / 6.1–6.2 | 4.2–4.3 / 5.1–5.6 |
| All 104 large and medium fish, 92 small, default Medaka | n/a | 8.7–8.9 / 10.1–10.9 |

Physical iOS and Android devices and low-end GPUs were not tested.

## Shubunkin and the scene pass — local iteration

**Shubunkin** are calico, single-tailed goldfish. They bring the first cool color
to a pond of red, white, orange and silver. When this section was written, two were
present by default, with a separate 0–6 population and 70–130% size; older saves simply
received these defaults. Agents extend `Koi`, their random IDs follow the 48 koi, 8 Wakin and
6 longfin slots, and they are appended last, so existing fish keep their starting
positions and call delays. The disturbance pass now reserves 68 instances.

Everything that distinguishes them is render-only, in `src/shubunkin-renderer.ts`:

- A coat fixed per fish slot: a 10 × 6 cell grid of slate blue with broad vermilion
  and pearl patches and single-cell ink flecks. Cells are flat-colored so patches stay crisp at
  pixel scale, and they follow the bending spine.
- The platinum longfin's long tail: the same contour and motion code, shared through
  `src/fish-spine.ts`, with a test comparing both fish frame by frame. Two custom
  tails, a sheared ribbon and a spring chain, were tried first and both looked stiffer.
  Only the tail's color is specific to Shubunkin.
- Pectorals that sweep rigidly around their root: tucked while cruising, rowing
  alternately while hovering, with the inside fin opening as a brake on a turn. This
  state belongs to the renderer; one rebuilt after GPU recovery relaxes from the
  default opening.
- A mouth that opens with the existing surface gulp, gill lines, eye glints, and a
  scale glint that slides down the lit flank.

Each fish uses 480 shape, 20 line and 198 shadow vertices, reserved for all six.

The pond's output is not re-encoded after compositing, so authored hex values
appear darker on screen. New colors are chosen for their final appearance.

The rest of the scene had a matching pass:

- **Butterflies** are larger, with brighter wings and fewer interior dark marks,
  which used to merge into a blot at this size. Flight mixes beats with short glides,
  the hindwing lags the forewing, and folding wings show a darker underside. They
  bask on flowers for longer, and a tap within 46 logical pixels startles them away.
- **Lotus leaves** are lighter saucers: a pale navel, a waxy crescent on the lit
  side, a rim that catches light or falls into shade, and water beads on larger
  leaves. About a third have one lifted edge.
- **Lotus flowers** deepen from a pale base to the tip, press a soft shadow onto
  the leaf, and breathe very slightly. Blooms and butterflies use opaque materials
  in the transparent queue, because Three draws that queue last and the bloom has
  to land on top of its translucent shadow.
- **Koi** gain a ribbon tail with a traveling wave, alternating pectorals and eye
  glints. Saved colors, families and the spine are unchanged.

### Settings panel

The panel follows iOS conventions: system semantic colors in light and dark, inset
grouped lists with hairlines that start at the label, icon tiles, steppers, a
segmented control, a large title that collapses into the bar, drill-down Advanced
pages and an action sheet for reset. Escape closes the sheet, then climbs one level
at a time, then closes the panel. Edge-swipe back is deliberately absent because it
would conflict with the drawer's own swipe gesture.

### Local acceptance, 2026-11-04

These results were measured on the uncommitted iteration against
`9ad4d55d7bbfd387543619232f2fe934486ffa8d`.

- `npm run verify` passed, with the existing large-chunk build warning.
- `scripts/browser-settings.mjs` passed at 1280×900 and 390×844 on headless
  Chromium with SwiftShader, a software WebGL2 implementation.
- A separate scripted run on an NVIDIA GeForce RTX 3070 Laptop through ANGLE D3D11
  covered Shubunkin count and size changes while the context was lost, recovery,
  hidden-page pause and resume, reload persistence, reset and undo, stepper limits,
  an empty pond, koi preview and search.
- GPU objects held at 78 geometries / 3 textures across five lotus rebuilds and
  fell to zero on disposal. These are object counts, not memory bytes.
- Panel navigation, reset and focus return were scripted and visually reviewed at
  1440×900 (English dark, Chinese light), 390×844 (Chinese dark; English light with
  reduced motion), 320×568 (English light and dark), 844×390 (English dark) and
  3440×900 (Chinese light), not at every language and appearance combination. At
  844×390, the side panel still overlaps part of the centered control dock.

CPU time per animation-frame callback on the production builds, median / P95 / P99
in milliseconds, with ranges across three 15-second samples at 1440×900. The
"maximum" scene has 62 agents before this change and 68 after. This excludes GPU
elapsed time.

| Scene | Before | After |
| --- | --- | --- |
| Default | 1.8–1.9 / 3–3.3 / 3.5–4.3 | 2.2–2.3 / 3.3–3.5 / 3.8–4.4 |
| Maximum population | 3.1–3.2 / 4.3–5 / 5.3–6.5 | 3.6 / 4.4–4.8 / 5.1–6.1 |

Physical iOS and Android devices were not tested.

## Platinum butterfly koi — local iteration

The added fish is a real longfin koi variety, **Platinum Butterfly Koi**: a
silver-white body, broad flowing pectorals and an elongated forked caudal fin.
Two are present by default, with a separate 0–6 population and 70–130% size.
It is not an additional koi color-family slot. The existing six-family order,
saved artwork, and flying-butterfly settings retain their meanings.

- [Blue Ridge's butterfly koi history](https://blueridgekoi.com/the-butterfly-koi-story/)
  provides the variety's breeding background.
- [Koifarm's 35 cm platinum butterfly koi](https://koifarm.shop/product/26-5-butterfly-platinum-35cm/)
  documents a real specimen of this silver-white longfin variety.
- [Aquatropics' platinum butterfly koi](https://aquatropics.co.uk/shop/platinum-butterfly-koi/)
  identifies this pond-fish variety and its silver-white longfin appearance.

The population extends `Koi` and uses the existing shared steering, spine,
depth, calls and scattering. Its random IDs follow the 48 koi and 8 Wakin
slots. Medaka query both additional populations for body avoidance. The
existing disturbance pass reserves 48 + 8 + 6 instances, including zero-count
scenes; koi previews hide longfin bodies, shadows and disturbances together.

Each longfin uses 225 body/detail vertices, 90 membrane vertices, 12 ray
vertices and 306 shadow vertices. Buffer capacities reserve all six fish in
float slots: 5,670 shapes, 216 rays and 5,508 shadows. Count changes reuse these
buffers. Body vertices follow the curved spine; each wide membrane attaches to
one local spine tangent and shears with the existing animation clocks. This
prevents chest triangles turning inside out during sharp turns. Wakin retain
their split-tail identity with broader membranes and lower-contrast rays.

The Advanced editor now exposes 44 curated controls. The internal remembered
Medaka count is not a control or a search result. Count and history change in
one transaction, including Undo/Redo, reset and v1/v2 import. Old positive
counts initialize history, including 13–32 shoals; a disabled school retains
valid history or falls back to three. Reset pond restores fish, plants, water
and weather while leaving language, sound and display preferences alone.
No dependencies, raster assets, render passes or gameplay systems are added.

### Local acceptance, 2026-10-13

The uncommitted iteration was checked against `0ac0ce01b016636ff1d8de54e7f346672f5482f7`.
`npm run verify` passed 262 tests, TypeScript and the production build. The
existing large-chunk build warning remains. Real Chromium WebGL2 on AMD Radeon
RX 7900 XT / ANGLE D3D11 completed five context-loss/recovery cycles, including
count, size, heavy settings and reset changes while lost. Renderer resources
returned to 71 geometries / 3 textures after each recovery and zero on disposal;
these are object counts, not GPU memory bytes. Empty populations and koi previews
with zero and nonzero koi were also exercised.

English and Chinese settings were checked at 320×568, 390×844, 844×390,
1440×900 and 3440×900. The ultra-wide panel fits within 32px top/bottom margins.
Medaka 5 → off → reload → on restores 5; unit coverage includes v1/v2 counts
0, 5 and 32, invalid history, undo/redo and reset. Dropdown Escape, focus/scroll
restoration, reduced motion, and denied/full storage during a live session were
checked in the browser. Denied storage at startup is covered by unit tests.

The 432×270 diagnostic recording covers straight swimming, left/right calls
and scattering over 12 seconds / 360 frames, with shallow, middle and deep fish.
A 36-frame contact sheet and sunny/sunset/moonlight images were visually reviewed.
Automated geometry checks cover every frame of a separate 360-frame sequence,
including finite coordinates, triangle winding, exact draw counts and stable
buffer identity. This is not a claim of manually inspecting all video frames.

Performance uses the production-compiled runtime without React UI, fixed initial
conditions, sunny weather, 1440×900 viewport, 432×270 logical canvas and internal
DPR 1. Each scenario has a 10-second warmup and three 60-second samples. Below,
each cell is **median / P95 / P99**, in milliseconds; ranges span the three
samples. Simulation is CPU time per fixed step; submission is CPU draw time,
not GPU elapsed time. Render-call intervals include browser scheduling and are
not direct measurements of physical presentation.

| Scene (koi + Wakin + longfin; Medaka shoals) | Simulation | Submission | Render interval | Intervals >50ms |
| --- | --- | --- | --- | --- |
| Baseline 14+3+0; 3 | 0.3 / 0.4 / 0.6 | 1.4 / 2.1–2.2 / 2.5–10.6 | 17.4–18.1 / 29–31.9 / 32.8–37 | 0 |
| Baseline 48+8+0; 3 | 0.5 / 0.7 / 0.9–1.2 | 2.1–2.2 / 3.5–3.6 / 6.8–15.3 | 17.7–18 / 30.8–33.6 / 33.8–36 | 0 |
| Baseline 48+8+0; 32 | 1.3 / 1.8–1.9 / 2.9–14.9 | 2.6–2.8 / 5–5.2 / 15.7–21.7 | 17.1–17.4 / 33.6–33.8 / 36–36.5 | 0 |
| New default 14+3+2; 3 | 0.2–0.3 / 0.4 / 0.4–0.5 | 1–1.1 / 1.4–1.6 / 1.5–2 | 18.6–18.8 / 19–19.2 / 19.4–19.5 | 0 |
| Equal control 14+3+0; 3 | 0.2 / 0.4 / 0.4 | 0.9–1 / 1.2–1.6 / 1.4–1.9 | 18.7 / 18.9–19 / 19.2–19.4 | 0 |
| Equal control 48+8+0; 3 | 0.3–0.4 / 0.6 / 0.6–0.7 | 1.6–1.7 / 1.9–2.8 / 2.4–3.3 | 18.6 / 19 / 19.2–19.7 | 6 (6,0,0) |
| Maximum 48+8+6; 3, repeat | 0.4 / 0.6–0.7 / 0.7 | 1.9 / 2.2–2.5 / 2.8–2.9 | 18.6 / 19 / 19.1 | 0 |
| Equal control 48+8+0; 32, repeat | 0.9–1 / 1.3–1.4 / 1.4–1.5 | 2–2.2 / 2.3–2.6 / 3.1–3.5 | 18.5–18.6 / 19.2 / 19.3–19.4 | 0 |
| Maximum 48+8+6; 32, repeat | 1–1.1 / 1.5 / 1.6 | 2.3–2.4 / 2.5–2.8 / 3.6–3.8 | 18.5–18.6 / 19.2 / 19.3–19.4 | 0 |

Initial samples of the last three scenes encountered approximately one-second
browser background throttling. They are retained in the raw evidence; all three
scenes were rerun with the IAB visible and focused, using the complete protocol.
Six interval spikes in the first equal-56 sample remain unexplained and are
retained above; its other two samples had none. No sampled simulation/submission
exceeded 50ms. Equal-population CPU measurements show no repeated regression;
six additional fish cost roughly 0.2–0.3ms median submission in the 3-shoal
comparison. Sequential runs, desktop activity and timer granularity prevent a
claim of overall speedup. Baseline and focused repeats have different browser
scheduling conditions, so interval distributions are not a strict A/B result.

Screenshots, motion recordings, per-sample CSV and raw JSON remain outside the
repository in the task's `stillpond-iteration` evidence directory. Physical
iOS/Android, other browser engines and actual OS backgrounding remain unverified;
synthetic visibility events and lifecycle unit tests passed. Original fish-photo
and swimming-video viewing was blocked by external challenge pages; the linked
text descriptions establish the real variety, but direct visual-reference
validation remains incomplete. No push, merge or deployment was performed.

### Independent final local review, 2026-10-13

The checkout was `D:/xia zai/AI project/Project in Iteration/fish`, on `main`
at baseline `0ac0ce01b016636ff1d8de54e7f346672f5482f7`. All 24 modified and
five untracked files at entry belonged to this iteration; no unrelated dirty
files were identified. This review preserves that implementation and adds this
closeout record. No additional product defect requiring a code repair was found.

Source review independently traced Medaka count/history transactions, v1/v2
sanitization, save/import and undo/reset snapshots; independent longfin count,
size and geometry; shared steering/calls/scatter and Medaka avoidance; the
62-instance disturbance capacity; preview isolation, resize and renderer cleanup.
The graph reported changed metadata, so current source/diffs were read rather
than treating its freshness as proof. No dependencies or assets were added.

Independent production UI checks used installed Chrome 154 on Windows, an
isolated browser context and AMD Radeon RX 7900 XT / ANGLE D3D11 WebGL2.
Both v1 and v2 saves with 32 shoals showed 32 in Advanced, allowed 32 -> 31,
undid to 32, and restored 32 after off -> reload -> on. English and Chinese
passed 320x568, 390x844, 844x390, 1440x900 and 3440x900; header/footer bounds,
scroll access, pond-reset copy and screenshots were checked. The ultra-wide
drawer occupied y=32..868. Page identity, visible content and captured page
errors passed. Tests selected the visible switch, not its hidden checkbox.

The freshly production-compiled diagnostic runtime completed five real
`WEBGL_lose_context` loss/restoration cycles with 48+8+6 fish, light size and
heavy shoal changes while lost, post-recovery edits and preview changes.
Each recovery returned to 71 geometries / 3 textures, with GL error 0.
Four initial event comparisons preserved position/phase; the first sampled
before asynchronous event delivery. A sixth cycle sampled inside the loss
event and also preserved both. Both raw and corrected results are retained.
Disposal returned to zero geometries/textures and a null renderer. A separate
900-frame mixed-school sequence covered calls toward opposite boundaries and
scatter: all checked Wakin and longfin membrane triangles retained winding.
This numerical check does not establish perfect visual anatomy or absence of
all body/fin overlap. The existing browser suite also passed desktop/mobile
reload, synthetic pagehide/pageshow, denied startup storage and quota handling;
that suite used Chromium SwiftShader, distinct from the hardware Chrome checks.

Original `performance.csv`, `before-default.jpg`, `longfin-motion.mp4`, raw
JSON, recovery logs and referenced screenshots exist and were retained. The
MP4 metadata is 432x270, 360 frames, 12.033 seconds. Its 36-frame motion contact
sheet was independently inspected; this is not a claim of watching every video
frame. The original CSV retains 27 throttled metric rows and three rows for
the six unexplained interval spikes. Its measurements remain original evidence,
not newly repeated baseline/default/equal-population measurements.

New evidence is outside Git at
`C:/Users/admin/.codex/visualizations/2026/10/13/01a1339e-761a-7a42-b73b-2f1632141971/stillpond-final/`.
Original evidence remains at
`C:/Users/admin/.codex/visualizations/2026/10/13/01a1331e-1d79-7240-9d38-df4b40527958/stillpond-iteration/`.
JSON files record actual UTC measurement times; local timezone is Asia/Shanghai
(UTC+8). Failed seeding/selector attempts and environment corrections are retained.
Browser plugin was unavailable; the existing Playwright package was used without
installing dependencies. External original-photo/video reference validation,
physical iOS/Android, Safari/Firefox and actual OS background switching remain
unverified. No push, merge, deployment or release is authorized in this closeout.

Independent maximum-density performance used the same fresh production runtime,
sunny weather, deterministic initialization, 1440x900 viewport, 432x270 logical
canvas, internal DPR 1 and cap 60. Both headful attempts encountered one-second
throttling despite `document.hidden === false`; all summaries and the last raw
segment remain in `independent-performance.json` and `performance-repeat.json`.
The first headful segment also retains one submission and five intervals above
50ms. Disabling background timer/renderer/occlusion throttling flags did not
make the second headful attempt suitable for performance acceptance.

A final **headless Chrome hardware WebGL2** run verified the same AMD D3D11
renderer, additionally disabled `CalculateNativeWinOcclusion`, and completed a
10-second warmup followed by three full 60-second samples. Each sample contained
3,600 simulation steps and 3,600/3,600/3,601 submissions. Ranges below span all
three samples, in milliseconds:

| 48 koi + 8 Wakin + 6 longfins; 32 shoals | Median | P95 | P99 | >50ms |
| --- | --- | --- | --- | --- |
| Simulation CPU time | 1.0–1.1 | 1.5 | 1.6–1.7 | 0 |
| Render submission CPU time | 2.4–2.7 | 3.1–3.6 | 3.8–4.3 | 0 |
| Render-call interval | 17.8–18.5 | 20.9–21.2 | 21.5–24.7 | 0 |

`performance-headless.json` records the actual UTC finish time, launch flags,
per-sample statistics and final raw segment. Headless/occlusion settings differ
from the original IAB measurements; this is a targeted maximum-load check,
not a baseline A/B speedup or stable-60-FPS claim. GPU elapsed time and physical
presentation are not measured. No severe repeated CPU stall was demonstrated.

Final local gate result: **READY FOR PUSH within this desktop/local scope**.
`npm run verify` independently passed 21 files / 262 tests twice, TypeScript and
production builds; `git diff --check` passed. The main JS remains 1,231.49 kB
(352.75 kB gzip), with the existing >500 kB chunk warning. Production assets
contain no diagnostic harness/test bridge identifiers checked by this review.
Only these iteration files are eligible for the authorized local commit;
physical-device, other-engine and original real-fish-reference limitations remain.

## V1.4 — Visual Ecology & Pond Life Pass

The medium fish is Wakin, with a small head, slightly deeper slender body,
short split caudal fin, and red, red/white and ivory families. Three fish add a
middle scale without enlarging the existing koi or Medaka populations. Wakin
retain their own body/fin geometry and size profile, using the mature koi behavior
and movement system. Steering, state transitions, angular velocity, trailing spine,
bend/recoil, cornering speed, propulsion and animation clocks are shared. The Wakin
renderer follows that spine to draw its short body and split tail. Both species
use the same soft avoidance and boundary turns, without lateral position corrections.
Taps attract both koi and Wakin through the existing delayed call response and
interest decay; scatter also applies to both. Medaka retain their separate system.

- [Yamatokoriyama's Wakin description](https://www.city.yamatokoriyama.lg.jp/kanko_bunka_sports/kingyo/kingyonokeitotohinshu/6266.html)
  describes the long body, small head, short fins, and three/four-lobed or simple
  tails. This pond uses the split-tail form, without claiming every Wakin has it.
- [Sumida Aquarium's Wakin](https://www.sumida-aquarium.com/about/animals/wakin/)
  provides an additional morphology reference.
- [The effects of caudal fin loss and regeneration on the swimming performance
  of goldfish](https://doi.org/10.1242/jeb.084244) informs the relationship between
  tail movement and propulsion. These logical-pixel speeds and frequencies are
  artistic coefficients, not measured Wakin kinematics.

Butterfly palettes now select wing families as well as colors: a larger
swallowtail inspired by Papilio xuthus, a smaller white inspired by Pieris rapae,
and copper/yellow garden forms. Curved forewing and hindwing contours are separate;
the swallowtail has tails, dark margins and bands, small blue hindwing spots,
while the white family has an apical patch and sparse forewing marks. A tapered
abdomen, thorax, head and bent antennae replace the old icon-like body. Template
geometry is compiled only on configuration changes. Flapping changes projected
wing area; resting half-folds the wings. Shadow displacement, size and strength
suggest height without introducing a new 3D flight system. Visits, approach,
orbit and rest behavior are retained.

- [Museums Victoria's Papilio xuthus specimen](https://collections.museumsvictoria.com.au/specimens/2635094)
  and [Papilio dorsal-wing morphology](https://pure.rug.nl/ws/portalfiles/portal/14413443/01_c1.pdf)
  inform separate wing proportions, dark/yellow markings and hindwing accents.
- [Wing pigmentation patterns in Pieris butterflies](https://pmc.ncbi.nlm.nih.gov/articles/PMC1679869/)
  informs the pale wings, dark tip and small forewing spots. The pond's simplified
  families are illustrative, not a species-identification model.

Lotus keeps its existing leaf structure and three petal rings. Subtle age-related
rim changes, varied primary/secondary vein angles, curved petal shoulders and
small stamens improve the same artwork. Pond-bed noise is static and limited to
a 1.8% tonal variation. No rocks, decorations or new scenery are introduced.
Water and all seven weather presets retain their shaders and shared state;
Wakin reuse the existing underwater, shadow and disturbance passes.

The [Koi Farm presentation](https://store.steampowered.com/app/1518810/Koi_Farm/)
and [Riu-F's pond rendering notes](https://github.com/Riu-F/koi-pond) were design
references for readable silhouettes, depth and layering. No external repository
code or media is copied. Existing project licensing and attribution remain.
The ordinary settings add one count slider, while Advanced stays at 42 controls.
Explicit saved artwork overrides remain authoritative.

## V1.2 — Natural Pond Pass

The aim is a quiet, living pond, using the existing procedural pixel renderer.
This is an animation informed by biology, not a fluid-dynamics simulation.
Timing, drag, and amplitudes are tuned for the pond's logical pixels; they are
not claimed as measured biological constants.

## Koi

The V1.1 pause had two concrete causes: `Hover` asked for zero speed, and
`Pivot` asked for 16% of cruise speed. Both were common transitions. In V1.2:

- Coast integrates quadratic drag (`v / (1 + k v dt)`) without stopping;
  propulsion resumes before speed falls below 48% of cruise speed.
- Brief rest is rare, keeps forward drift, and has an independent pectoral-fin
  clock. Fish start swimming instead of spawning in rest or pivot states.
- Turns keep forward motion, with a brief bend and relaxation/recoil envelope.
  Tail phase remains continuous; effort responds to speed and acceleration,
  and the body straightens during coasting.
- Call latency, approach, orbit, loss of interest, avoidance, depth, and
  scattering remain in the existing school/state architecture.

Sources:

- Wu, Yang & Zeng (2007), [Kinematics, hydrodynamics and energetic advantages
  of burst-and-coast swimming of koi carps](https://doi.org/10.1242/jeb.001842).
  The relevant observation is active propulsion followed by passive forward
  travel; energy savings are not a claim made by this implementation.
- Yang et al. (2010), [A study on flow physics of burst-and-coast swimming
  of koi carp](https://www.jstage.jst.go.jp/article/jabmech/1/1/1_1_30/_article).
  The body/tail returns toward straight between propulsive bouts. Both
  multiple-tail-beat and half-tail-beat motion occur in the observations.
- Wu, Yang & Zeng (2007), [Routine turning maneuvers of koi carp](https://pubmed.ncbi.nlm.nih.gov/18055627/).
  Bending and tail recoil inform the turn animation; body heading alone is
  insufficient to convey the maneuver.
- The Nature Box, [Koi carp in a park](https://commons.wikimedia.org/wiki/File:Koi_carp_in_a_park.webm),
  Shinjuku Gyoen (2015), CC BY 4.0. Used as a public video reference for forward
  movement, body bending and pectoral activity; no footage is shipped.

## Medaka

The generic tiny-fish system becomes Japanese ricefish / Medaka. Its existing
population, batches, configuration, and startle propagation are reused. Bodies
are slender, tails are less deeply forked, and palettes are muted ricefish gold,
silver, and olive. Body and tail undulation continues through acceleration,
steady travel, and deceleration. Schoolmates coordinate speed with small
response lags; their tail phases do not lock together. Startle changes intent
and smoothly accelerates, without replacing velocity with an impulse.

[Harpaz et al., Collective Behavior in Medaka Fish Depends on Discrete Kinematic
States of Swimming Behavior](https://pmc.ncbi.nlm.nih.gov/articles/PMC12324306/)
(2025 **preprint**) describes these three continuous-swimming modes and stronger
social responsiveness during steady travel. The simplified school cadence here
is an artistic interpretation, not a reproduction of its experimental model.
No second new species or personality system is added.

## Lotus, water and weather

[NParks' Nelumbo nucifera description](https://www.nparks.gov.sg/florafaunaweb/flora/2/2/2257)
and [University of Florida's botanical reference](https://plant-directory.ifas.ufl.edu/plant-directory/nelumbo-nucifera/)
inform the entire, circular, peltate leaf and central attachment. The default
has no water-lily notch. The old notch control remains available for saved custom
artwork. Branching radial veins, subdued age/tone variation, asymmetric margins,
rim shading, different inclinations and elevations break up repetition.
Three staggered petal rings and a small seed receptacle replace flat star flowers.
Plant geometry stays static; only transforms change each frame.

Weather blends a shared surface state. Rain increases small surface movement
and leaf rocking; mist moves in thin banks; sunlight and moonlight create broken
reflections perturbed by the same ripple and fish-disturbance field. Shadows
change length and direction with lighting. Coasting fish retain a small wake.
Existing ripple fading, water clarity and depth attenuation stay intact.

## Settings and compatibility

Pond, Atmosphere, Sound, Language and Display are directly editable groups in a
single scrolling page. Advanced has a separate entry and retains the complete
editor. Normal settings are eagerly imported, so opening them never requests a
chunk. Advanced remains lazy and has its own error boundary, allowing a return
to ordinary settings if its download fails. Push/pop navigation restores focus;
English, Chinese, keyboard controls and reduced motion are retained.

The settings follow-up uses a translucent, green-tinted dark frosted sheet,
system typography, soft mint accents and green switches. Ordinary controls need
no page navigation; the Advanced page retains push/pop motion, restores the prior
scroll position and focus, and makes exiting content inert. The sheet retains
drag-to-dismiss and the sliders retain native pointer/keyboard interaction.
Reduced-motion changes apply live.
Page changes use a matched 280ms full-width slide with a fixed header, so the
transparent pages never overlap. Advanced dropdowns share a dark, readable
popup for family, numeric and text choices, with keyboard navigation and focus
restoration; Escape dismisses a dropdown before closing the settings sheet.
Switch thumbs use one CSS translation, with a 2px inset in both states and during
press feedback; combining Tailwind `translate` with a second `transform` previously
moved the checked thumb 14px beyond its track.

Storage keys and the override schema are unchanged. Existing explicit artwork
customizations remain authoritative; defaults improve for new or reset settings.
The logical short edge remains 270 pixels, default population is unchanged, and
no dependencies, raster assets, render passes, or game systems were added.
