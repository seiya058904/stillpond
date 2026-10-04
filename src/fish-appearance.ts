import * as THREE from "three";
import {
  FISH,
  KOI_PALETTES,
  KOI_PATTERN_PATCHES,
  type KoiPatchSetting,
} from "./config";

export enum KoiPattern {
  Kohaku,
  Sanke,
  Showa,
  Ogon,
  Tancho,
  Shiro,
}

export interface FishAppearance {
  pattern: KoiPattern;
  base: THREE.Color;
  accent: THREE.Color;
  marking: THREE.Color;
  fin: THREE.Color;
  eye: THREE.Color;
}

export const createFishAppearance = (family: number): FishAppearance => {
  const pattern = Math.min(KOI_PALETTES.length - 1, Math.max(0, Math.round(family)));
  const palette = KOI_PALETTES[pattern];
  return {
    pattern,
    base: new THREE.Color(palette.base),
    accent: new THREE.Color(palette.accent),
    marking: new THREE.Color(palette.marking),
    fin: new THREE.Color(palette.fin),
    eye: new THREE.Color(FISH.eyeColor),
  };
};

export const patchesFor = (
  appearance: FishAppearance,
): readonly KoiPatchSetting[] => KOI_PATTERN_PATCHES[appearance.pattern];
