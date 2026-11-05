// Small top-down portraits for the fish list, drawn from the same outlines as the
// pond's artwork, so a row looks like the fish it adds. No raster assets.

import { LONG_TAIL, SHUBUNKIN_TAIL } from "./fish-spine";
import type { SpeciesId } from "./settings/species";
import { SMALL_SPECIES_PALETTES, SPECIES_ART, widthAt, type Rgb, type SmallSpeciesPalette, type SpeciesArt, type Vertex } from "./species-art";

export type GlyphId = SpeciesId | "koi" | "wakin" | "butterfly-koi" | "shubunkin" | "medaka";
export interface GlyphPath { d: string; fill: string }
export interface Glyph { viewBox: string; paths: readonly GlyphPath[] }

const fill = ([r, g, b]: Rgb): string => `rgb(${r} ${g} ${b})`;
// Portraits lie along x, head to the right, at this many units per body length.
const UNIT = 100;
const px = (t: number): number => (1 - t) * UNIT;
const py = (across: number): number => across * UNIT;
const n = (value: number): string => String(Math.round(value * 10) / 10);
const polygon = (points: readonly (readonly [number, number])[]): string =>
  `M${points.map(([x, y]) => `${n(x)} ${n(y)}`).join("L")}Z`;
const side = (contour: readonly Vertex[], sign: number) => contour.map(([t, across]) => [px(t), py(across * sign)] as const);

interface PortraitInput extends Pick<SpeciesArt, "stations" | "widths" | "bands" | "palette" | "coat"> {
  tail: readonly {left: readonly Vertex[]; right?: readonly Vertex[]; tone: Rgb; rightTone?: Rgb}[];
  fins?: readonly {contour: readonly Vertex[]; tone: Rgb}[];
  marks?: readonly {t: number; across: number; length: number; width: number; tone: Rgb; mirror?: boolean; under?: boolean}[];
  ridges?: readonly {contour: readonly Vertex[]; tone: Rgb; mirror?: boolean}[];
  eye: {t: number; across: number; radius: number; tone: Rgb};
}

const ellipse = (cx: number, cy: number, rx: number, ry: number): string => {
  const points: [number, number][] = [];
  for (let i = 0; i < 12; i++) points.push([cx + Math.cos(i / 12 * Math.PI * 2) * rx, cy + Math.sin(i / 12 * Math.PI * 2) * ry]);
  return polygon(points);
};

function portrait(input: PortraitInput): Glyph {
  const paths: GlyphPath[] = [];
  const bounds = {x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity};
  const note = (points: readonly (readonly [number, number])[]) => {
    for (const [x, y] of points) {
      bounds.x0 = Math.min(bounds.x0, x); bounds.x1 = Math.max(bounds.x1, x);
      bounds.y0 = Math.min(bounds.y0, y); bounds.y1 = Math.max(bounds.y1, y);
    }
  };
  const add = (points: readonly (readonly [number, number])[], tone: Rgb) => {
    note(points);
    paths.push({d: polygon(points), fill: fill(tone)});
  };
  for (const layer of input.tail) {
    add(side(layer.left, -1), layer.tone);
    add(side(layer.right ?? layer.left, 1), layer.rightTone ?? layer.tone);
  }
  // Fins spread at a calm resting angle, on both sides.
  for (const fin of input.fins ?? []) for (const sign of [-1, 1]) add(side(fin.contour, sign), fin.tone);
  const addMark = (mark: NonNullable<PortraitInput["marks"]>[number]) => {
    for (const sign of mark.mirror ? [-1, 1] : [1]) {
      const cx = px(mark.t), cy = py(mark.across * sign), rx = mark.length * UNIT, ry = mark.width * UNIT;
      note([[cx - rx, cy - ry], [cx + rx, cy + ry]]);
      paths.push({d: ellipse(cx, cy, rx, ry), fill: fill(mark.tone)});
    }
  };
  for (const mark of input.marks ?? []) if (mark.under) addMark(mark);
  // One path per coat color keeps the list light however many cells a fish has.
  const paint = input.coat(0), cells = new Map<number, string>();
  const {stations, widths, bands} = input;
  for (let s = 0; s < stations.length - 1; s++) {
    const t = (stations[s] + stations[s + 1]) * 0.5;
    for (let b = 0; b < bands.length - 1; b++) {
      const tone = paint(t, (bands[b] + bands[b + 1]) * 0.5);
      const quad = polygon([[px(stations[s]), py(bands[b] * widths[s])], [px(stations[s]), py(bands[b + 1] * widths[s])],
        [px(stations[s + 1]), py(bands[b + 1] * widths[s + 1])], [px(stations[s + 1]), py(bands[b] * widths[s + 1])]]);
      cells.set(tone, (cells.get(tone) ?? "") + quad);
    }
    note([[px(stations[s]), py(widths[s])], [px(stations[s]), py(-widths[s])]]);
  }
  note([[px(1), py(widths[widths.length - 1])], [px(1), py(-widths[widths.length - 1])]]);
  for (const [tone, d] of cells) paths.push({d, fill: fill(input.palette[tone])});
  for (const ridge of input.ridges ?? []) for (const sign of ridge.mirror ? [-1, 1] : [1]) add(side(ridge.contour, sign), ridge.tone);
  for (const mark of input.marks ?? []) if (!mark.under) addMark(mark);
  const {eye} = input;
  const radius = Math.max(eye.radius * UNIT, 1.8);
  for (const sign of [-1, 1]) paths.push({d: ellipse(px(eye.t), py(eye.across * sign), radius, radius), fill: fill(eye.tone)});
  // The pond tile is 44 × 28: fit the whole fish and center it, with a margin.
  const margin = 8, width = bounds.x1 - bounds.x0 + margin * 2, height = bounds.y1 - bounds.y0 + margin * 2;
  const scale = Math.max(width / 44, height / 28);
  const vw = 44 * scale, vh = 28 * scale;
  const vx = (bounds.x0 + bounds.x1) * 0.5 - vw * 0.5, vy = (bounds.y0 + bounds.y1) * 0.5 - vh * 0.5;
  return {viewBox: `${n(vx)} ${n(vy)} ${n(vw)} ${n(vh)}`, paths};
}

function fromArt(art: SpeciesArt): Glyph {
  return portrait({
    ...art,
    tail: art.tail.layers.map(layer => ({left: layer.left, right: layer.right, tone: layer.tip, rightTone: layer.rightTip ?? layer.tip})),
    fins: art.fins.map(fin => {
      // The same rigid sweep the pond uses, frozen at its resting angle.
      const angle = fin.rest + fin.spread * 0.22, cosine = Math.cos(angle), sine = Math.sin(angle);
      const root = fin.inset * widthAt(art, fin.t);
      return {tone: fin.tone, contour: fin.contour.map(([u, v]): Vertex => [
        fin.t + (u * cosine - v * sine) * fin.reach, root + (u * sine + v * cosine) * fin.reach,
      ])};
    }),
    ridges: art.ridges.map(ridge => ({contour: ridge.contour, tone: ridge.tone, mirror: ridge.mirror})),
    marks: art.marks,
    eye: {t: art.eye.t, across: art.eye.across, radius: art.eye.radius, tone: art.eye.pupil},
  });
}

const SIX = [-1, -0.66, -0.3, 0, 0.3, 0.66, 1] as const;

// The fish that predate the species table, in the same simple terms.
const KOI: PortraitInput = {
  stations: [0, 0.06, 0.18, 0.34, 0.5, 0.66, 0.82, 1],
  widths: [0.12, 0.17, 0.2, 0.19, 0.155, 0.11, 0.07, 0.03],
  bands: SIX,
  palette: [[238, 230, 212], [216, 70, 44]],
  coat: () => (t, across) => (t > 0.14 && t < 0.3) || (t > 0.42 && t < 0.58 && across < 0.4) || (t > 0.7 && t < 0.82) ? 1 : 0,
  tail: [{left: [[0.96, 0.03], [1.1, 0.1], [1.26, 0.17], [1.32, 0.13], [1.24, 0.06], [1.17, 0]], tone: [228, 220, 200]}],
  fins: [{contour: [[0.2, 0.15], [0.3, 0.3], [0.42, 0.14]], tone: [228, 220, 200]}],
  eye: {t: 0.1, across: 0.1, radius: 0.022, tone: [30, 30, 28]},
};
const WAKIN: PortraitInput = {
  stations: [0, 0.1, 0.24, 0.43, 0.65, 0.85, 1],
  widths: [0.035, 0.1, 0.17, 0.157, 0.108, 0.045, 0.017],
  bands: SIX,
  palette: [[224, 92, 56], [244, 238, 222]],
  coat: () => (t, across) => t > 0.5 && t < 0.72 && across > -0.2 ? 1 : 0,
  tail: [{left: [[0.94, 0.025], [1.08, 0.09], [1.24, 0.255], [1.39, 0.29], [1.4, 0.23], [1.34, 0.17], [1.46, 0.095], [1.4, 0.055], [1.13, 0.018]], tone: [234, 148, 112]}],
  fins: [{contour: [[0.19, 0.075], [0.24, 0.15], [0.34, 0.25], [0.43, 0.235], [0.44, 0.175], [0.35, 0.09]], tone: [234, 148, 112]}],
  eye: {t: 0.07, across: 0.062, radius: 0.026, tone: [34, 48, 42]},
};
const LONGFIN: PortraitInput = {
  stations: [0, 0.09, 0.24, 0.44, 0.65, 0.85, 1],
  widths: [0.027, 0.075, 0.145, 0.132, 0.087, 0.037, 0.016],
  bands: SIX,
  palette: [[232, 238, 234]],
  coat: () => () => 0,
  tail: [{left: LONG_TAIL, tone: [202, 222, 216]}],
  fins: [{contour: [[0.2, 0.08], [0.27, 0.2], [0.41, 0.34], [0.55, 0.38], [0.68, 0.28], [0.56, 0.15], [0.35, 0.085]], tone: [202, 222, 216]}],
  eye: {t: 0.07, across: 0.062, radius: 0.022, tone: [36, 56, 58]},
};
const SHUBUNKIN: PortraitInput = {
  stations: [0, 0.05, 0.12, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.92, 1],
  widths: [0.03, 0.08, 0.122, 0.155, 0.162, 0.148, 0.12, 0.09, 0.062, 0.044, 0.032],
  bands: SIX,
  palette: [[104, 138, 168], [222, 92, 44], [238, 232, 214], [36, 38, 46]],
  coat: () => (t, across) => t > 0.24 && t < 0.4 && across > -0.3 ? 1 : t > 0.46 && t < 0.6 && across < 0.3 ? 2 : t > 0.68 && t < 0.78 && across > 0.2 ? 3 : 0,
  tail: [{left: SHUBUNKIN_TAIL, tone: [168, 198, 216]}],
  fins: [{contour: [[0.2, 0.1], [0.26, 0.24], [0.42, 0.28], [0.44, 0.14]], tone: [168, 198, 216]}],
  eye: {t: 0.085, across: 0.074, radius: 0.03, tone: [18, 20, 26]},
};
const rgb = (hex: number): Rgb => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
/** One outline for every small fish, as in the pond. Only the palette differs. */
const medaka = (palette: Pick<SmallSpeciesPalette, "body" | "light" | "fin" | "eye">): PortraitInput => ({
  stations: [0, 0.16, 0.4, 0.7, 1],
  widths: [0.03, 0.11, 0.12, 0.085, 0.04],
  bands: [-1, 0, 1],
  palette: [rgb(palette.body), rgb(palette.light)],
  coat: () => t => t < 0.34 ? 1 : 0,
  tail: [{left: [[0.96, 0.03], [1.14, 0.1], [1.32, 0.14], [1.28, 0.05], [1.24, 0]], tone: rgb(palette.fin)}],
  fins: [{contour: [[0.3, 0.1], [0.42, 0.2], [0.5, 0.1]], tone: rgb(palette.fin)}],
  eye: {t: 0.1, across: 0.075, radius: 0.03, tone: rgb(palette.eye)},
});

export const FISH_GLYPHS: Record<GlyphId, Glyph> = {
  koi: portrait(KOI),
  wakin: portrait(WAKIN),
  "butterfly-koi": portrait(LONGFIN),
  shubunkin: portrait(SHUBUNKIN),
  medaka: portrait(medaka({body: 0xc5ae79, light: 0xe6d4a3, fin: 0xa9b38b, eye: 0x263a32})),
  sterlet: fromArt(SPECIES_ART.sterlet),
  "high-fin": fromArt(SPECIES_ART["high-fin"]),
  paddlefish: fromArt(SPECIES_ART.paddlefish),
  ranchu: fromArt(SPECIES_ART.ranchu),
  "panda-butterfly": fromArt(SPECIES_ART["panda-butterfly"]),
  "bubble-eye": fromArt(SPECIES_ART["bubble-eye"]),
  orfe: fromArt(SPECIES_ART.orfe),
  "white-cloud": portrait(medaka(SMALL_SPECIES_PALETTES["white-cloud"][0])),
  "paradise-fish": portrait(medaka(SMALL_SPECIES_PALETTES["paradise-fish"][0])),
};
