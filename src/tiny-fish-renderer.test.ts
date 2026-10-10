import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { TINY_FISH } from "./config";
import { settings } from "./settings/store";
import { TinyFishSchools } from "./tiny-fish";
import { TinyFishRenderer } from "./tiny-fish-renderer";
import { SurfaceGeometryBatch } from "./surface-geometry";

afterEach(() => { vi.restoreAllMocks(); settings.resetAll(); });

function geometries(renderer: TinyFishRenderer) {
  return [
    (renderer.shadowGroup.children[0] as THREE.Mesh).geometry,
    ...renderer.group.children.map(mesh => (mesh as THREE.Mesh).geometry),
  ];
}
function assertComplete(renderer: TinyFishRenderer, schools: TinyFishSchools) {
  const count = schools.fish.filter(fish => fish.schoolIndex < TINY_FISH.visibleSchoolCount).length;
  expect(geometries(renderer).map(geometry => geometry.drawRange.count)).toEqual([count * 24, count * 30, count * 36]);
}
function dispose(renderer: TinyFishRenderer) {
  const materials = new Set<THREE.Material>();
  for (const group of [renderer.shadowGroup, renderer.group]) group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
  });
  materials.forEach(material => material.dispose());
}

describe("Medaka population geometry", () => {
  it("retains the small default buffers and emits every default fish", () => {
    const renderer = new TinyFishRenderer();
    try {
      const schools = new TinyFishSchools();
      const original = geometries(renderer).map(geometry => geometry.getAttribute("position"));
      renderer.update(schools);
      assertComplete(renderer, schools);
      expect(geometries(renderer).map(geometry => geometry.getAttribute("position"))).toEqual(original);
    } finally { dispose(renderer); }
  });

  it("draws all layers at the supported 12-shoal UI limit, then reuses grown buffers", () => {
    const renderer = new TinyFishRenderer();
    try {
      vi.spyOn(Math, "random").mockReturnValue(.99);
      settings.set(["tiny-fish", "visibleSchoolCount"], 12);
      const schools = new TinyFishSchools();
      expect(schools.fish.length).toBe(236);
      renderer.update(schools);
      assertComplete(renderer, schools);
      const grown = geometries(renderer).map(geometry => geometry.getAttribute("position"));
      settings.set(["tiny-fish", "visibleSchoolCount"], 3);
      renderer.update(schools);
      assertComplete(renderer, schools);
      settings.set(["tiny-fish", "visibleSchoolCount"], 12);
      renderer.update(schools);
      assertComplete(renderer, schools);
      expect(geometries(renderer).map(geometry => geometry.getAttribute("position"))).toEqual(grown);
    } finally { dispose(renderer); }
  });

  it("draws every supported saved fish at 32 shoals of 80 members", () => {
    settings.set(["tiny-fish", "visibleSchoolCount"], 32);
    for (let index = 0; index < 32; index++) settings.set(["tiny-fish-schools", index, "count"], 80);
    const schools = new TinyFishSchools();
    const renderer = new TinyFishRenderer();
    try {
      expect(schools.fish.length).toBe(2560);
      renderer.update(schools);
      assertComplete(renderer, schools);
    } finally { dispose(renderer); }
  });

  it("retires uploaded attributes before replacing them and keeps geometry identity", () => {
    const geometry = new THREE.BufferGeometry();
    const batch = new SurfaceGeometryBatch(geometry, 9, true);
    const original = geometry.getAttribute("position");
    const retired: THREE.BufferAttribute[] = [];
    geometry.addEventListener("dispose", () => retired.push(geometry.getAttribute("position") as THREE.BufferAttribute));
    batch.triangle({ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 });
    batch.reserve(18);
    expect(retired).toEqual([original]);
    expect(geometry.getAttribute("position")).not.toBe(original);
    expect(Array.from(geometry.getAttribute("position").array.slice(0, 9))).toEqual([1, 2, 0, 3, 4, 0, 5, 6, 0]);
    expect((geometry.getAttribute("position") as THREE.BufferAttribute).usage).toBe(THREE.DynamicDrawUsage);
    batch.reserve(9);
    expect(retired).toHaveLength(1);
    batch.commit();
    expect(geometry.drawRange.count).toBe(3);
    geometry.dispose();
  });
});
