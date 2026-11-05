// What each optional species looks like, seen from above. This module holds data
// only: `species-renderer.ts` turns it into geometry through the shared swimming
// functions in `fish-spine.ts`, and the settings list draws its icons from it.
//
// Lengths are fractions of body length, measured back from the snout (`t`) and
// out from the spine (`across`). Colors are final on-screen values, 0-255: the
// pond composites vertex colors without re-encoding them.

import type { SmallSpeciesId, SpineSpeciesId } from "./settings/species";

export type Rgb = readonly [number, number, number];
export type Vertex = readonly [number, number];

/** One layer of a caudal fin. `right` defaults to `left`, mirrored. */
export interface MembraneArt {
  left: readonly Vertex[];
  right?: readonly Vertex[];
  root: Rgb;
  tip: Rgb;
  rightRoot?: Rgb;
  rightTip?: Rgb;
  /** Only the outer layer needs a shadow. */
  shadow?: boolean;
}
/** A streak in the fin; `side` keeps it on one lobe of an unequal tail. */
export interface RayArt { from: Vertex; to: Vertex; side?: "left" | "right" }
export interface TailArt {
  layers: readonly MembraneArt[];
  rays: readonly RayArt[];
  rayTone: Rgb;
  /** Scales the shared tail flex; the anchor and clocks stay the same for every fish. */
  flex: number;
  /** How far the koi's traveling wave carries through a long fin, as added flex. */
  wave: number;
}
/** A fin sweeping rigidly around its root; `contour` is [along the fin, across it]. */
export interface FinArt {
  contour: readonly Vertex[];
  t: number;
  /** Fraction of the body's half-width at `t` where the fin leaves the body. */
  inset: number;
  reach: number;
  rest: number;
  spread: number;
  scull: number;
  tone: Rgb;
  /** A pale leading edge, drawn between two contour points. */
  edge?: { from: number; to: number; tone: Rgb };
}
/** A fin or flap standing on the back; every vertex follows the bending spine. */
export interface RidgeArt {
  contour: readonly Vertex[];
  tone: Rgb;
  /** Side-to-side sway at the rear of the ridge, as a fraction of body length. */
  sway: number;
  /** A tall fin seen from above: it leans over with the stroke and the turn. */
  lean?: boolean;
  mirror?: boolean;
  shadow?: boolean;
}
export interface MarkArt {
  t: number;
  across: number;
  length: number;
  width: number;
  tone: Rgb;
  sides: number;
  mirror?: boolean;
  /** Drawn before the body, so the body overlaps it. */
  under?: boolean;
  shadow?: boolean;
  /** Fluid sacs: the radius breathes with the stroke and lags behind a turn. */
  jiggle?: number;
}
export interface LineArt {
  from: Vertex;
  to: Vertex;
  tone: Rgb;
  mirror?: boolean;
  /** Attached to one tangent, so it can reach ahead of the snout. */
  rigid?: boolean;
}
export interface EyeArt { t: number; across: number; radius: number; minimum: number; pupil: Rgb; glint: boolean; sides: number }

export interface SpeciesArt {
  stations: readonly number[];
  widths: readonly number[];
  bands: readonly number[];
  palette: readonly Rgb[];
  /** Builds one fish slot's fixed coat: a palette index for each body cell. */
  coat: (slot: number) => (t: number, across: number) => number;
  /** How strongly a scale glint slides down the lit flank. */
  shimmer: number;
  glintTone: Rgb;
  tail: TailArt;
  fins: readonly FinArt[];
  ridges: readonly RidgeArt[];
  marks: readonly MarkArt[];
  lines: readonly LineArt[];
  eye: EyeArt;
  mouth?: Rgb;
}

const SIX_BANDS = [-1, -0.66, -0.3, 0, 0.3, 0.66, 1] as const;

/** Half the body's width at `t`, read from its stations. */
export function widthAt(art: Pick<SpeciesArt, "stations" | "widths">, t: number): number {
  const {stations, widths} = art;
  if (t <= stations[0]) return widths[0];
  for (let i = 1; i < stations.length; i++) {
    if (t <= stations[i]) return widths[i - 1] + (widths[i] - widths[i - 1]) * (t - stations[i - 1]) / (stations[i] - stations[i - 1]);
  }
  return widths[widths.length - 1];
}

/** A stable per-slot random stream, so a fish keeps its coat through reloads. */
export function slotRandom(slot: number, salt: number): () => number {
  let state = (Math.imul(slot + 1, 0x9e3779b1) ^ salt) >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}
interface Blob { tone: number; t: number; across: number; rt: number; ra: number }
const inBlob = (blob: Blob, t: number, across: number): boolean => {
  const dt = (t - blob.t) / blob.rt, da = (across - blob.across) / blob.ra;
  return dt * dt + da * da <= 1;
};

/** A dashed run along the body, as short line pieces. */
function dashes(start: number, end: number, step: number, length: number, across: (t: number) => number, tone: Rgb, mirror: boolean): LineArt[] {
  const pieces: LineArt[] = [];
  for (let t = start; t + length <= end + 1e-6; t += step) pieces.push({from: [t, across(t)], to: [t + length, across(t + length)], tone, mirror});
  return pieces;
}

// ---- Large ---------------------------------------------------------------

// Sterlet: a slim, near-black back ruled by pale scute rows, a long pointed
// rostrum with a pale tip, white-edged pectorals held out flat, and a shark tail.
const STERLET_BACK: Rgb = [74, 70, 72], STERLET_FLANK: Rgb = [100, 94, 90], STERLET_RIM: Rgb = [150, 142, 126];
const STERLET_SNOUT: Rgb = [172, 164, 146], STERLET_TIP: Rgb = [226, 220, 202], STERLET_SCUTE: Rgb = [208, 200, 178];
const sterletBody = {
  stations: [0, 0.03, 0.08, 0.14, 0.2, 0.25, 0.32, 0.44, 0.56, 0.68, 0.8, 0.9, 1],
  widths: [0.008, 0.016, 0.027, 0.043, 0.062, 0.076, 0.081, 0.079, 0.071, 0.059, 0.045, 0.033, 0.024],
};
const sterlet: SpeciesArt = {
  ...sterletBody,
  bands: SIX_BANDS,
  palette: [STERLET_BACK, STERLET_FLANK, STERLET_RIM, STERLET_SNOUT, STERLET_TIP],
  coat: () => (t, across) => {
    const side = Math.abs(across);
    if (t < 0.06) return 4;
    if (t < 0.17) return side < 0.34 ? 1 : 3;
    if (t < 0.25) return side < 0.34 ? 0 : side < 0.7 ? 1 : 3;
    return side < 0.34 ? 0 : side < 0.7 ? 1 : 2;
  },
  shimmer: 0.28,
  glintTone: [176, 170, 158],
  tail: {
    flex: 0.8,
    wave: 0.6,
    rayTone: [150, 144, 132],
    layers: [{
      // The long upper lobe of a heterocercal tail, laid flat; the lower is short.
      left: [[0.93, 0.024], [1.02, 0.05], [1.12, 0.08], [1.22, 0.102], [1.33, 0.118], [1.38, 0.088], [1.27, 0.04], [1.16, 0.012], [1.1, 0]],
      right: [[0.93, 0.024], [1.0, 0.048], [1.05, 0.068], [1.1, 0.078], [1.13, 0.05], [1.12, 0.02], [1.1, 0]],
      root: [66, 62, 64], tip: [112, 106, 100], shadow: true,
    }],
    rays: [{from: [1.0, 0.03], to: [1.3, 0.098], side: "left"}],
  },
  fins: [
    {contour: [[-0.1, -0.22], [0, 0.22], [0.4, 0.3], [0.86, 0.3], [1, 0.14], [0.66, -0.08], [0.3, -0.18]], t: 0.28, inset: 0.86, reach: 0.185, rest: 0.6, spread: 0.2, scull: 0.3,
      tone: [78, 74, 74], edge: {from: 2, to: 3, tone: [214, 208, 192]}},
    {contour: [[-0.1, -0.26], [-0.1, 0.26], [0.5, 0.26], [1, 0.12], [0.7, -0.18], [0.3, -0.26]], t: 0.62, inset: 0.86, reach: 0.09, rest: 0.54, spread: 0.2, scull: 0.2, tone: [86, 80, 78]},
  ],
  ridges: [{contour: [[0.66, 0], [0.71, 0.015], [0.8, 0.012], [0.82, 0], [0.8, -0.012], [0.71, -0.015]], tone: [58, 54, 56], sway: 0.012}],
  marks: [],
  lines: [
    ...dashes(0.26, 0.64, 0.052, 0.024, () => 0, STERLET_SCUTE, false),
    ...dashes(0.24, 0.9, 0.033, 0.033, t => widthAt(sterletBody, t) * 0.7, STERLET_SCUTE, true),
    {from: [0.02, 0.008], to: [-0.018, 0.022], tone: [214, 208, 190], mirror: true, rigid: true},
    {from: [0.05, 0.016], to: [0.018, 0.04], tone: [214, 208, 190], mirror: true, rigid: true},
  ],
  eye: {t: 0.215, across: 0.054, radius: 0.016, minimum: 0.62, pupil: [28, 26, 28], glint: false, sides: 5},
};

// Chinese high-fin banded shark: the juvenile's cream head and three dark
// slanting bands, a tall dorsal sail that leans with every stroke, and a forked
// tail with one pale and one dark lobe.
const BAND_DARK: Rgb = [66, 52, 50], BAND_CREAM: Rgb = [232, 212, 178], BAND_ROSE: Rgb = [226, 192, 160], BAND_HEAD: Rgb = [214, 184, 142];
const highFin: SpeciesArt = {
  stations: [0, 0.035, 0.09, 0.16, 0.23, 0.32, 0.42, 0.53, 0.64, 0.75, 0.86, 0.94, 1],
  widths: [0.04, 0.07, 0.098, 0.122, 0.142, 0.156, 0.152, 0.132, 0.106, 0.08, 0.054, 0.038, 0.028],
  bands: SIX_BANDS,
  palette: [BAND_CREAM, BAND_DARK, BAND_ROSE, BAND_HEAD],
  coat: slot => {
    const shift = (slotRandom(slot, 0x68666e31)() - 0.5) * 0.03;
    return (t, across) => {
      if (t < 0.21) return 3;
      // Bands slant back toward the belly, so the two flanks read as a chevron.
      const s = t - Math.abs(across) * 0.055 + shift;
      if (s < 0.29) return 1;
      if (s < 0.4) return 0;
      if (s < 0.54) return 1;
      if (s < 0.64) return 2;
      if (s < 0.78) return 1;
      if (s < 0.87) return 0;
      return 1;
    };
  },
  shimmer: 0.32,
  glintTone: [244, 228, 200],
  tail: {
    flex: 1,
    wave: 0.5,
    rayTone: [176, 150, 124],
    layers: [{
      left: [[0.95, 0.028], [1.06, 0.085], [1.18, 0.16], [1.29, 0.225], [1.38, 0.255], [1.36, 0.18], [1.3, 0.09], [1.25, 0]],
      root: [214, 190, 156], tip: [236, 222, 196], rightRoot: [70, 56, 54], rightTip: [96, 80, 76], shadow: true,
    }],
    rays: [{from: [1.0, 0.04], to: [1.3, 0.19], side: "right"}],
  },
  fins: [
    {contour: [[-0.12, -0.34], [-0.12, 0.3], [0.34, 0.42], [0.78, 0.44], [1, 0.26], [0.92, -0.06], [0.46, -0.3]], t: 0.26, inset: 0.84, reach: 0.21, rest: 0.42, spread: 0.72, scull: 1, tone: [76, 62, 58]},
    {contour: [[-0.12, -0.3], [-0.12, 0.3], [0.6, 0.32], [1, 0.08], [0.56, -0.3]], t: 0.56, inset: 0.82, reach: 0.13, rest: 0.42, spread: 0.3, scull: 0.3, tone: [84, 68, 62]},
  ],
  ridges: [
    // The sail: tallest near its front, running low along the back toward the tail.
    {contour: [[0.26, 0.008], [0.31, 0.07], [0.35, 0.125], [0.39, 0.13], [0.43, 0.075], [0.52, 0.026], [0.68, 0.012], [0.82, 0.006], [0.82, -0.006], [0.5, -0.01], [0.26, -0.008]],
      tone: [104, 82, 74], sway: 0.012, lean: true, shadow: true},
    {contour: [[0.27, 0.01], [0.32, 0.07], [0.36, 0.115], [0.375, 0.105], [0.335, 0.05], [0.295, 0.004]], tone: [226, 204, 170], sway: 0.012, lean: true},
  ],
  marks: [{t: 0.012, across: 0.03, length: 0.016, width: 0.018, tone: [190, 148, 118], sides: 5, mirror: true}],
  lines: [
    {from: [0.2, 0.05], to: [0.215, 0.12], tone: [164, 134, 100], mirror: true},
    {from: [0.215, 0.12], to: [0.2, 0.15], tone: [164, 134, 100], mirror: true},
  ],
  eye: {t: 0.095, across: 0.072, radius: 0.026, minimum: 0.8, pupil: [26, 22, 22], glint: true, sides: 6},
};

// American paddlefish: a third of the fish is a pale, spoon-ended rostrum; a long
// mottled gill flap trails from each side of the head; the skin is smooth steel.
const PADDLE: Rgb = [196, 198, 180], PADDLE_RIB: Rgb = [146, 154, 148];
const paddlefish: SpeciesArt = {
  stations: [0, 0.014, 0.04, 0.09, 0.15, 0.22, 0.29, 0.335, 0.385, 0.44, 0.52, 0.62, 0.72, 0.82, 0.92, 1],
  widths: [0.022, 0.038, 0.049, 0.053, 0.049, 0.038, 0.027, 0.036, 0.072, 0.098, 0.106, 0.094, 0.074, 0.054, 0.036, 0.024],
  bands: SIX_BANDS,
  palette: [[86, 104, 120], [116, 134, 146], [158, 174, 178], PADDLE, PADDLE_RIB],
  coat: () => (t, across) => {
    const side = Math.abs(across);
    if (t < 0.31) return side < 0.3 ? 4 : 3;
    if (t < 0.36) return side < 0.3 ? 0 : 1;
    return side < 0.3 ? 0 : side < 0.66 ? 1 : 2;
  },
  shimmer: 0.2,
  glintTone: [206, 218, 222],
  tail: {
    flex: 0.9,
    wave: 0.6,
    rayTone: [166, 180, 186],
    layers: [{
      left: [[0.95, 0.024], [1.04, 0.058], [1.13, 0.102], [1.24, 0.148], [1.36, 0.185], [1.34, 0.11], [1.26, 0.05], [1.18, 0]],
      right: [[0.95, 0.024], [1.03, 0.052], [1.1, 0.086], [1.17, 0.116], [1.25, 0.135], [1.24, 0.08], [1.2, 0.035], [1.18, 0]],
      root: [84, 102, 118], tip: [128, 146, 158], shadow: true,
    }],
    rays: [],
  },
  fins: [
    {contour: [[-0.12, -0.2], [-0.12, 0.22], [0.42, 0.26], [1, 0.2], [0.78, -0.02], [0.3, -0.18]], t: 0.47, inset: 0.84, reach: 0.135, rest: 0.42, spread: 0.46, scull: 0.5, tone: [92, 110, 124]},
    {contour: [[-0.12, -0.22], [-0.12, 0.22], [0.6, 0.24], [1, 0.1], [0.6, -0.2]], t: 0.68, inset: 0.84, reach: 0.07, rest: 0.42, spread: 0.2, scull: 0.2, tone: [100, 118, 130]},
  ],
  ridges: [
    {contour: [[0.385, 0.05], [0.44, 0.096], [0.53, 0.122], [0.64, 0.09], [0.52, 0.074], [0.44, 0.056]], tone: [170, 172, 146], sway: 0, mirror: true, shadow: true},
    {contour: [[0.67, 0], [0.72, 0.012], [0.79, 0.014], [0.81, 0.002], [0.8, -0.012], [0.72, -0.012]], tone: [74, 92, 108], sway: 0.012},
  ],
  marks: [
    {t: 0.46, across: 0.086, length: 0.012, width: 0.009, tone: [112, 116, 98], sides: 4, mirror: true},
    {t: 0.52, across: 0.1, length: 0.012, width: 0.008, tone: [112, 116, 98], sides: 4, mirror: true},
    {t: 0.58, across: 0.09, length: 0.01, width: 0.007, tone: [122, 126, 108], sides: 4, mirror: true},
  ],
  lines: [{from: [0.03, 0], to: [0.16, 0], tone: PADDLE_RIB}, {from: [0.16, 0], to: [0.3, 0], tone: PADDLE_RIB}],
  eye: {t: 0.345, across: 0.032, radius: 0.012, minimum: 0.62, pupil: [24, 26, 30], glint: false, sides: 5},
};

// ---- Medium --------------------------------------------------------------

// Ranchu: judged from above. A broad, almost rectangular back with no dorsal fin,
// a raspberry hood as wide as the body, and a short twin tail tucked at the end.
const RANCHU_CREAM: Rgb = [244, 230, 206], RANCHU_RED: Rgb = [224, 82, 44], RANCHU_HOOD: Rgb = [206, 62, 44], RANCHU_BUMP: Rgb = [240, 124, 84], RANCHU_GOLD: Rgb = [240, 148, 62];
const ranchu: SpeciesArt = {
  stations: [0, 0.05, 0.12, 0.19, 0.25, 0.33, 0.44, 0.56, 0.68, 0.79, 0.89, 1],
  widths: [0.13, 0.215, 0.27, 0.295, 0.285, 0.31, 0.33, 0.33, 0.3, 0.235, 0.155, 0.075],
  bands: SIX_BANDS,
  palette: [RANCHU_CREAM, RANCHU_RED, RANCHU_HOOD, RANCHU_GOLD],
  coat: slot => {
    const random = slotRandom(slot, 0x72616e63);
    // Three coats a breeder would recognize: red and white, self-red, and a red cap.
    const variant = slot % 3;
    const blobs: Blob[] = [];
    if (variant === 0) for (let i = 0; i < 3; i++) blobs.push({tone: 1, t: 0.38 + i * 0.2 + (random() - 0.5) * 0.07, across: (random() - 0.5) * 0.9, rt: 0.09 + random() * 0.05, ra: 0.5 + random() * 0.3});
    return (t, across) => {
      if (t < 0.25) return variant === 1 ? 3 : 2;
      if (variant === 1) return Math.abs(across) > 0.72 ? 3 : 1;
      if (variant === 2) return Math.abs(across) < 0.3 && t > 0.62 && t < 0.78 ? 1 : 0;
      for (const blob of blobs) if (inBlob(blob, t, across)) return blob.tone;
      return 0;
    };
  },
  shimmer: 0.6,
  glintTone: [255, 244, 224],
  tail: {
    flex: 1.1,
    wave: 0.35,
    rayTone: [224, 138, 96],
    layers: [{
      // Short and spread nearly flat: two rounded lobes with a soft central notch.
      left: [[0.94, 0.03], [1.0, 0.09], [1.07, 0.18], [1.16, 0.25], [1.27, 0.262], [1.34, 0.19], [1.29, 0.1], [1.21, 0.04], [1.16, 0]],
      root: [238, 132, 88], tip: [248, 216, 186], shadow: true,
    }],
    rays: [{from: [1.0, 0.04], to: [1.2, 0.19]}, {from: [1.0, 0.03], to: [1.22, 0.1]}],
  },
  fins: [
    {contour: [[-0.14, -0.4], [-0.14, 0.4], [0.32, 0.52], [0.78, 0.5], [1, 0.2], [0.82, -0.2], [0.4, -0.42]], t: 0.3, inset: 0.86, reach: 0.17, rest: 0.4, spread: 0.72, scull: 1, tone: [240, 158, 112]},
    {contour: [[-0.14, -0.36], [-0.14, 0.36], [0.6, 0.4], [1, 0.08], [0.56, -0.36]], t: 0.58, inset: 0.86, reach: 0.1, rest: 0.42, spread: 0.3, scull: 0.3, tone: [244, 176, 136]},
  ],
  ridges: [],
  marks: [
    // The hood: a raspberry of soft lobes across forehead and cheeks.
    {t: 0.055, across: 0, length: 0.05, width: 0.1, tone: RANCHU_BUMP, sides: 7},
    {t: 0.1, across: 0.14, length: 0.048, width: 0.076, tone: RANCHU_BUMP, sides: 7, mirror: true},
    {t: 0.15, across: 0, length: 0.042, width: 0.066, tone: [228, 96, 62], sides: 6},
    {t: 0.21, across: 0.09, length: 0.036, width: 0.06, tone: [230, 104, 68], sides: 6, mirror: true},
  ],
  lines: [],
  eye: {t: 0.16, across: 0.205, radius: 0.034, minimum: 0.8, pupil: [28, 22, 20], glint: true, sides: 6},
  mouth: [150, 58, 52],
};

// Panda butterfly telescope: the Chinese butterfly tail, spread flat like wings and
// meant to be seen from above. Black and white in blocks, with bulging eyes.
const PANDA_PEARL: Rgb = [238, 234, 224], PANDA_INK: Rgb = [50, 50, 56], PANDA_MIST: Rgb = [176, 176, 172];
const WING: readonly Vertex[] = [[0.93, 0.02], [0.96, 0.1], [0.97, 0.26], [1.0, 0.45], [1.1, 0.62], [1.24, 0.66], [1.36, 0.58], [1.4, 0.46], [1.35, 0.37], [1.48, 0.3], [1.54, 0.17], [1.46, 0.07], [1.28, 0.025], [1.02, 0.006]];
const wingCore = WING.slice(0, 13).map(([t, across]): Vertex => [0.97 + (t - 0.97) * 0.68, across * 0.68]);
const pandaButterfly: SpeciesArt = {
  stations: [0, 0.05, 0.12, 0.2, 0.3, 0.42, 0.54, 0.66, 0.78, 0.89, 1],
  widths: [0.095, 0.15, 0.185, 0.215, 0.25, 0.265, 0.255, 0.22, 0.165, 0.1, 0.048],
  bands: SIX_BANDS,
  palette: [PANDA_PEARL, PANDA_INK, PANDA_MIST],
  coat: slot => {
    const random = slotRandom(slot, 0x70616e64);
    // Several whole color blocks rather than dots, which is what breeders prize.
    const blobs: Blob[] = [];
    const count = 2 + slot % 2;
    for (let i = 0; i < count; i++) blobs.push({tone: 1, t: 0.34 + i * 0.26 + (random() - 0.5) * 0.08, across: (random() - 0.5) * 1.3, rt: 0.08 + random() * 0.05, ra: 0.42 + random() * 0.28});
    return (t, across) => {
      if (t < 0.07) return 1;
      if (t < 0.25) return 0;
      for (const blob of blobs) if (inBlob(blob, t, across)) return blob.tone;
      return 0;
    };
  },
  shimmer: 0.5,
  glintTone: [255, 255, 252],
  tail: {
    flex: 1.15,
    wave: 0.35,
    rayTone: [64, 64, 70],
    layers: [
      {left: WING, root: PANDA_INK, tip: [78, 78, 84], shadow: true},
      {left: wingCore, root: PANDA_PEARL, tip: [224, 220, 210]},
    ],
    rays: [
      {from: [1.0, 0.08], to: [1.08, 0.34]},
      {from: [1.02, 0.07], to: [1.2, 0.3]},
      {from: [1.04, 0.04], to: [1.29, 0.17]},
    ],
  },
  fins: [
    {contour: [[-0.12, -0.3], [-0.12, 0.34], [0.3, 0.42], [0.76, 0.5], [1, 0.26], [0.84, -0.12], [0.4, -0.3]], t: 0.28, inset: 0.86, reach: 0.27, rest: 0.42, spread: 0.72, scull: 1, tone: [58, 58, 64]},
    {contour: [[-0.12, -0.3], [-0.12, 0.3], [0.6, 0.34], [1, 0.08], [0.56, -0.3]], t: 0.56, inset: 0.86, reach: 0.16, rest: 0.42, spread: 0.3, scull: 0.3, tone: [66, 66, 72]},
  ],
  ridges: [{contour: [[0.29, 0.012], [0.38, 0.03], [0.52, 0.03], [0.72, 0.012], [0.8, 0], [0.72, -0.012], [0.52, -0.018], [0.38, -0.018], [0.29, -0.012]], tone: [44, 44, 50], sway: 0.012, lean: true}],
  marks: [
    // A telescope eye sits on a short stalk, well outside the head.
    {t: 0.12, across: 0.19, length: 0.05, width: 0.11, tone: PANDA_PEARL, sides: 6, mirror: true, under: true, shadow: true},
    {t: 0.12, across: 0.285, length: 0.083, width: 0.083, tone: [52, 50, 56], sides: 9, mirror: true, under: true, shadow: true},
  ],
  lines: [],
  eye: {t: 0.12, across: 0.293, radius: 0.044, minimum: 0.9, pupil: [20, 18, 22], glint: true, sides: 7},
};

// Bubble eye: two soft fluid sacs nearly as wide as the body, jiggling as it swims,
// eyes turned upward on top of them. No dorsal fin, and a long, soft twin tail.
const BUBBLE_DEEP: Rgb = [232, 128, 56], BUBBLE_GOLD: Rgb = [242, 164, 84], BUBBLE_CREAM: Rgb = [246, 226, 194];
const SAC_RIM: Rgb = [206, 172, 132], SAC: Rgb = [232, 206, 170], SAC_CORE: Rgb = [244, 226, 196];
const bubbleEye: SpeciesArt = {
  stations: [0, 0.06, 0.14, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 0.93, 1],
  widths: [0.07, 0.11, 0.15, 0.185, 0.21, 0.218, 0.205, 0.17, 0.12, 0.075, 0.04],
  bands: SIX_BANDS,
  palette: [BUBBLE_DEEP, BUBBLE_GOLD, BUBBLE_CREAM],
  coat: slot => {
    const random = slotRandom(slot, 0x62756262);
    const patch: Blob = {tone: 2, t: 0.44 + random() * 0.3, across: (random() - 0.5) * 1.2, rt: 0.09 + random() * 0.06, ra: 0.34 + random() * 0.24};
    return (t, across) => {
      const side = Math.abs(across);
      if (side > 0.7) return 2;
      if (inBlob(patch, t, across)) return patch.tone;
      return side < 0.34 ? 0 : 1;
    };
  },
  shimmer: 0.62,
  glintTone: [255, 244, 222],
  tail: {
    flex: 1.35,
    wave: 0.9,
    rayTone: [226, 196, 162],
    layers: [{
      left: [[0.95, 0.026], [1.06, 0.075], [1.2, 0.15], [1.36, 0.225], [1.5, 0.28], [1.62, 0.3], [1.7, 0.22], [1.65, 0.12], [1.57, 0.05], [1.51, 0]],
      root: [248, 172, 104], tip: [250, 238, 218], shadow: true,
    }],
    rays: [{from: [1.02, 0.03], to: [1.54, 0.2]}, {from: [1.02, 0.02], to: [1.5, 0.1]}],
  },
  fins: [
    {contour: [[-0.14, -0.3], [-0.14, 0.32], [0.3, 0.36], [0.8, 0.34], [1, 0.14], [0.82, -0.1], [0.4, -0.3]], t: 0.3, inset: 0.86, reach: 0.22, rest: 0.3, spread: 0.72, scull: 1, tone: [246, 208, 170]},
    {contour: [[-0.14, -0.3], [-0.14, 0.3], [0.6, 0.28], [1, 0.08], [0.56, -0.28]], t: 0.58, inset: 0.86, reach: 0.12, rest: 0.3, spread: 0.3, scull: 0.3, tone: [246, 214, 180]},
  ],
  ridges: [],
  marks: [
    {t: 0.075, across: 0.2, length: 0.165, width: 0.172, tone: SAC_RIM, sides: 11, mirror: true, under: true, shadow: true, jiggle: 1},
    {t: 0.07, across: 0.202, length: 0.142, width: 0.148, tone: SAC, sides: 10, mirror: true, under: true, jiggle: 1},
    {t: 0.06, across: 0.21, length: 0.086, width: 0.092, tone: SAC_CORE, sides: 8, mirror: true, under: true, jiggle: 1},
  ],
  lines: [],
  eye: {t: 0.125, across: 0.13, radius: 0.026, minimum: 0.72, pupil: [36, 28, 26], glint: true, sides: 6},
  mouth: [176, 92, 66],
};

// Golden orfe: a slim dart from a pond seen from above: an orange back fading to
// pale flanks, dark freckles on the head and shoulder, and a clean pointed fork.
const orfe: SpeciesArt = {
  stations: [0, 0.035, 0.09, 0.17, 0.27, 0.39, 0.52, 0.65, 0.77, 0.88, 1],
  widths: [0.026, 0.05, 0.073, 0.092, 0.104, 0.103, 0.09, 0.073, 0.054, 0.036, 0.019],
  bands: SIX_BANDS,
  palette: [[232, 124, 52], [242, 164, 88], [246, 216, 176], [150, 86, 50]],
  coat: slot => {
    const random = slotRandom(slot, 0x6f726665);
    const freckles = Array.from({length: 4}, () => [0.1 + random() * 0.24, (random() - 0.5) * 1.1] as const);
    return (t, across) => {
      const side = Math.abs(across);
      for (const [ft, fa] of freckles) if (Math.abs(t - ft) < 0.022 && Math.abs(across - fa) < 0.17) return 3;
      return side < 0.34 ? 0 : side < 0.68 ? 1 : 2;
    };
  },
  shimmer: 0.9,
  glintTone: [255, 236, 196],
  tail: {
    flex: 1,
    wave: 0.5,
    rayTone: [236, 158, 96],
    layers: [{
      left: [[0.95, 0.02], [1.05, 0.07], [1.16, 0.135], [1.28, 0.2], [1.41, 0.255], [1.38, 0.17], [1.29, 0.08], [1.22, 0]],
      root: [238, 142, 72], tip: [248, 222, 188], shadow: true,
    }],
    rays: [{from: [1.0, 0.026], to: [1.3, 0.15]}],
  },
  fins: [
    {contour: [[-0.14, -0.2], [-0.14, 0.24], [0.42, 0.24], [1, 0.14], [0.74, -0.04], [0.3, -0.2]], t: 0.25, inset: 0.84, reach: 0.15, rest: 0.22, spread: 0.72, scull: 0.9, tone: [246, 214, 180]},
    {contour: [[-0.14, -0.2], [-0.14, 0.22], [0.6, 0.2], [1, 0.08], [0.58, -0.18]], t: 0.53, inset: 0.84, reach: 0.085, rest: 0.22, spread: 0.3, scull: 0.3, tone: [246, 208, 168]},
  ],
  ridges: [{contour: [[0.46, 0], [0.5, 0.012], [0.6, 0.018], [0.64, 0], [0.6, -0.018], [0.5, -0.012]], tone: [214, 102, 48], sway: 0.014}],
  marks: [],
  lines: [],
  eye: {t: 0.1, across: 0.058, radius: 0.017, minimum: 0.62, pupil: [34, 30, 28], glint: false, sides: 5},
};

export const SPECIES_ART: Record<SpineSpeciesId, SpeciesArt> = {
  sterlet, "high-fin": highFin, paddlefish,
  ranchu, "panda-butterfly": pandaButterfly, "bubble-eye": bubbleEye, orfe,
};

// ---- Small ---------------------------------------------------------------

/** Small species are Medaka in every way but color, in the same slots as a Medaka palette. */
export interface SmallSpeciesPalette { body: number; light: number; accent: number; fin: number; eye: number }

// One palette per shoal, a shade apart, as Medaka have. These are hex values like
// Medaka's, so they go through the same color conversion.
export const SMALL_SPECIES_PALETTES: Record<SmallSpeciesId, readonly SmallSpeciesPalette[]> = {
  // Pale olive-gold with a gold stripe and a red tail.
  "white-cloud": [
    {body: 0xb4ae62, light: 0xe2dc98, accent: 0xf2c04c, fin: 0xff5040, eye: 0x1c2a22},
    {body: 0xa8ae66, light: 0xd8dc9c, accent: 0xeab84e, fin: 0xf8584a, eye: 0x1c2a22},
    {body: 0xbeb05e, light: 0xeadc94, accent: 0xf8c84a, fin: 0xff4a38, eye: 0x1c2a22},
    {body: 0xaca868, light: 0xdcd6a0, accent: 0xecb850, fin: 0xf25244, eye: 0x1c2a22},
  ],
  // Bright coral with a blue-green stripe and blue-green fins.
  "paradise-fish": [
    {body: 0xf48a58, light: 0xffc09a, accent: 0x38a8c8, fin: 0x4cd0e8, eye: 0x1c2630},
    {body: 0xea8460, light: 0xf8b8a0, accent: 0x34a0c0, fin: 0x54c8e0, eye: 0x1c2630},
    {body: 0xfc9458, light: 0xffc896, accent: 0x3cb0cc, fin: 0x44d8ec, eye: 0x1c2630},
    {body: 0xe68060, light: 0xf4b49c, accent: 0x309cbc, fin: 0x5cc4dc, eye: 0x1c2630},
  ],
};

/** Keeps each species' shoals from repeating Medaka's scatter. */
export const SMALL_SPECIES_SEEDS: Record<SmallSpeciesId, number> = {"white-cloud": 0x77636c64, "paradise-fish": 0x70617261};

/** How each species swims within the shared systems: proportions and pace, never new rules. */
export interface SpineSpeciesMotion {
  /** Body length range, in pond pixels. */
  length: readonly [number, number];
  /** Sets the swimming wave's amplitude. The silhouette comes from the art. */
  waveRatio: number;
  /** Multiplies cruising and top speed. */
  pace: number;
  /** Multiplies turning strength: a long body takes a wider circle. */
  agility: number;
  seed: number;
}
export const SPINE_SPECIES_MOTION: Record<SpineSpeciesId, SpineSpeciesMotion> = {
  sterlet: {length: [46, 56], waveRatio: 0.115, pace: 0.86, agility: 0.5, seed: 0x73746572},
  "high-fin": {length: [30, 38], waveRatio: 0.15, pace: 0.8, agility: 0.9, seed: 0x68696768},
  paddlefish: {length: [50, 60], waveRatio: 0.135, pace: 0.92, agility: 0.46, seed: 0x70616464},
  ranchu: {length: [21, 26], waveRatio: 0.13, pace: 0.6, agility: 1, seed: 0x72616e63},
  "panda-butterfly": {length: [20, 25], waveRatio: 0.13, pace: 0.62, agility: 1, seed: 0x7061726e},
  "bubble-eye": {length: [20, 24], waveRatio: 0.13, pace: 0.52, agility: 0.9, seed: 0x62756262},
  orfe: {length: [27, 33], waveRatio: 0.125, pace: 1.16, agility: 1, seed: 0x6f726665},
};

