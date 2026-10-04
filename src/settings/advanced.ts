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
  {id: "goldfish", sections: ["goldfish"], controls: [
    {id: "goldfish-count", label: "goldfishCount", path: ["goldfish", "count"]},
    {id: "goldfish-size", label: "goldfishSize", path: ["goldfish", "size"], percent: true},
  ]},
  {id: "medaka", sections: ["tiny-fish", "tiny-fish-schools"], controls: [
    {id: "medaka-shoals", label: "visibleSchoolCount", path: ["tiny-fish", "visibleSchoolCount"], max: 12},
    {id: "medaka-size", label: "bodyLength", path: ["tiny-fish", "bodyLength"], min: 3, max: 12},
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
