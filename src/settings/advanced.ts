// The complete product-facing Advanced schema. Only these explicit controls
// participate in UI and search; the runtime definition is not an editor tree.
import type { FieldKey } from "../i18n/fields";
import { definition, type SectionId } from "./definition";
import { nodeAt, type SettingPath } from "./schema";

export interface AdvancedControl {
  id: string;
  label: FieldKey;
  path: SettingPath;
  min?: number;
  max?: number;
  percent?: boolean;
}

export const ADVANCED_GROUPS = [
  {id: "koi", sections: ["koi", "koi-palettes", "koi-patterns"], controls: [
    {id: "adult-size", label: "regularLength", path: ["koi", "regularLength"], min: 18, max: 55},
    {id: "young-size", label: "tinyLength", path: ["koi", "tinyLength"], min: 10, max: 32},
  ]},
  {id: "large-fish", sections: ["sterlet", "high-fin", "paddlefish"], controls: [
    {id: "sterlet-count", label: "sterletCount", path: ["sterlet", "count"]},
    {id: "sterlet-size", label: "sterletSize", path: ["sterlet", "size"], percent: true},
    {id: "high-fin-count", label: "highFinCount", path: ["high-fin", "count"]},
    {id: "high-fin-size", label: "highFinSize", path: ["high-fin", "size"], percent: true},
    {id: "paddlefish-count", label: "paddlefishCount", path: ["paddlefish", "count"]},
    {id: "paddlefish-size", label: "paddlefishSize", path: ["paddlefish", "size"], percent: true},
  ]},
  {id: "medium-fish", sections: ["goldfish", "butterfly-koi", "shubunkin", "ranchu", "panda-butterfly", "bubble-eye", "orfe"], controls: [
    {id: "goldfish-count", label: "goldfishCount", path: ["goldfish", "count"]},
    {id: "goldfish-size", label: "goldfishSize", path: ["goldfish", "size"], percent: true},
    {id: "butterfly-koi-count", label: "butterflyKoiCount", path: ["butterfly-koi", "count"]},
    {id: "butterfly-koi-size", label: "butterflyKoiSize", path: ["butterfly-koi", "size"], percent: true},
    {id: "shubunkin-count", label: "shubunkinCount", path: ["shubunkin", "count"]},
    {id: "shubunkin-size", label: "shubunkinSize", path: ["shubunkin", "size"], percent: true},
    {id: "ranchu-count", label: "ranchuCount", path: ["ranchu", "count"]},
    {id: "ranchu-size", label: "ranchuSize", path: ["ranchu", "size"], percent: true},
    {id: "panda-butterfly-count", label: "pandaButterflyCount", path: ["panda-butterfly", "count"]},
    {id: "panda-butterfly-size", label: "pandaButterflySize", path: ["panda-butterfly", "size"], percent: true},
    {id: "bubble-eye-count", label: "bubbleEyeCount", path: ["bubble-eye", "count"]},
    {id: "bubble-eye-size", label: "bubbleEyeSize", path: ["bubble-eye", "size"], percent: true},
    {id: "orfe-count", label: "orfeCount", path: ["orfe", "count"]},
    {id: "orfe-size", label: "orfeSize", path: ["orfe", "size"], percent: true},
  ]},
  {id: "small-fish", sections: ["tiny-fish", "tiny-fish-schools", "white-cloud", "paradise-fish"], controls: [
    {id: "medaka-shoals", label: "visibleSchoolCount", path: ["tiny-fish", "visibleSchoolCount"], max: 12},
    {id: "medaka-size", label: "bodyLength", path: ["tiny-fish", "bodyLength"], min: 3, max: 12},
    {id: "white-cloud-count", label: "whiteCloudCount", path: ["white-cloud", "count"]},
    {id: "white-cloud-size", label: "whiteCloudSize", path: ["white-cloud", "size"], percent: true},
    {id: "paradise-fish-count", label: "paradiseFishCount", path: ["paradise-fish", "count"]},
    {id: "paradise-fish-size", label: "paradiseFishSize", path: ["paradise-fish", "size"], percent: true},
  ]},
  {id: "plants", sections: ["lotus", "lotus-leaves", "lotus-flowers", "duckweed", "duckweed-patches", "butterflies", "butterfly-spawns"], controls: [
    {id: "lotus-leaves", label: "visibleLeafCount", path: ["lotus", "visibleLeafCount"]},
    {id: "lotus-flowers", label: "visibleFlowerCount", path: ["lotus", "visibleFlowerCount"]},
    {id: "duckweed", label: "visiblePatchCount", path: ["duckweed", "visiblePatchCount"]},
    {id: "butterflies", label: "visibleCount", path: ["butterflies", "visibleCount"]},
    {id: "leaf-size", label: "radiusScale", path: ["lotus", "radiusScale"], min: 0.6, max: 1.6},
  ]},
  {id: "water", sections: ["water", "ripples"], controls: [
    {id: "clarity", label: "clarity", path: ["water", "clarity"], percent: true},
    {id: "currents", label: "showCurrentEffect", path: ["water", "showCurrentEffect"]},
    {id: "current-strength", label: "currentStrength", path: ["water", "currentStrength"], percent: true},
    {id: "ripple-strength", label: "strength", path: ["ripples", "strength"], percent: true},
  ]},
  {id: "appearance", sections: ["pond-bed"], controls: [
    {id: "deep-color", label: "deepColor", path: ["pond-bed", "deepColor"]},
    {id: "shallow-color", label: "shallowColor", path: ["pond-bed", "shallowColor"]},
  ]},
] as const satisfies readonly {id: string; sections: readonly SectionId[]; controls: readonly AdvancedControl[]}[];

export const FAMILY_COLOR_FIELDS = ["base", "accent", "marking", "fin"] as const;

export function familyColorControls(family: number, patches: readonly {color: string}[]): AdvancedControl[] {
  return FAMILY_COLOR_FIELDS.filter(field => field === "base" || field === "fin" || patches.some(patch => patch.color === field))
    .map(field => ({id: `family-${family}-${field}`, label: field, path: ["koi-palettes", family, field]}));
}

export function controlNode(control: AdvancedControl) {
  const node = nodeAt(definition, control.path);
  if (!node || !["num", "range", "bool", "color", "rgb"].includes(node.kind)) throw new Error(`Unsupported product control: ${control.id}`);
  return node;
}
