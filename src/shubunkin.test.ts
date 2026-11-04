import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { setCanvasSize } from "./config";
import { buildRenderSpine, LONG_TAIL } from "./fish-spine";
import { Koi } from "./koi";
import { School } from "./school";
import { settings, SettingsStore } from "./settings/store";
import { ShubunkinRenderer, SHUBUNKIN_VERTEX_BUDGET, shubunkinCoat } from "./shubunkin-renderer";
import { ButterflyKoiRenderer } from "./butterfly-koi-renderer";

afterEach(() => { settings.resetAll(); setCanvasSize(480, 270); vi.restoreAllMocks(); });

const signedArea = (position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, vertex: number) => {
  const a = vertex, b = a + 1, c = a + 2;
  return (position.getX(b) - position.getX(a)) * (position.getY(c) - position.getY(a))
    - (position.getY(b) - position.getY(a)) * (position.getX(c) - position.getX(a));
};

describe("shubunkin integration", () => {
  it("persists independently of koi families and gives old saves the default population", () => {
    const store = new SettingsStore(), families = [...store.live.koi.families];
    store.set(["shubunkin", "count"], 6); store.set(["shubunkin", "size"], 1.3);
    const next = new SettingsStore(); next.importOverrides(store.exportOverrides(), "sunny", false);
    expect(next.live.shubunkin).toEqual({count: 6, size: 1.3});
    expect(next.live.koi.families).toEqual(families);
    next.importOverrides({"goldfish.count": 5}, "sunny", false);
    expect(next.live.goldfish.count).toBe(5);
    expect(next.live.shubunkin).toEqual({count: 2, size: 1});
    expect(next.live["butterfly-koi"]).toEqual({count: 2, size: 1});
  });

  it("uses identical behavior and poses for an isolated agent in either population", () => {
    settings.set(["goldfish", "count"], 0); settings.set(["butterfly-koi", "count"], 0); settings.set(["shubunkin", "count"], 0);
    const a = new School(), b = new School(); a.setCount(1); b.setCount(0);
    Object.defineProperty(b.shubunkin, "count", {get: () => 1});
    const koi = a.fish[0], fish = b.shubunkin.fish[0]; Object.assign(fish, structuredClone(koi));
    expect(fish).toBeInstanceOf(Koi);
    for (let frame = 0; frame < 900; frame++) {
      if (frame === 120 || frame === 420) { const point = frame === 120 ? {x: 460, y: 30} : {x: 40, y: 240}; a.callTo(point); b.callTo(point); }
      if (frame === 720) { a.scatter(); b.scatter(); }
      a.update(1 / 60, frame / 60); b.update(1 / 60, frame / 60); buildRenderSpine(koi); buildRenderSpine(fish);
      for (const key of Object.keys(koi) as Array<keyof Koi>) expect(fish[key]).toEqual(koi[key]);
    }
  });

  it("does not change how the existing fish start or respond when it is added", () => {
    const run = (count: number) => {
      settings.set(["shubunkin", "count"], count);
      const school = new School(); school.reset();
      const existing = [...school.fish, ...school.goldfish.fish, ...school.butterflyKoi.fish];
      const placed = structuredClone(existing.map(fish => [fish.position, fish.heading, fish.behaviorRng]));
      school.callTo({x: 240, y: 135});
      return {placed, delays: school.fish.slice(0, school.count).map(fish => fish.callDelay)};
    };
    const without = run(0), withFish = run(6);
    expect(withFish.placed).toEqual(without.placed);
    expect(withFish.delays).toEqual(without.delays);
  });

  it("preserves identity and pose through size, zero count, resize and deterministic reset", () => {
    const school = new School(), population = school.shubunkin, fish = population.fish[0];
    const initial = structuredClone(population.fish); school.reset(); expect(population.fish).toEqual(initial);
    for (let i = 0; i < 60; i++) school.update(1 / 60, i / 60);
    const before = structuredClone(fish);
    settings.set(["shubunkin", "size"], 1.3); population.refreshConfig();
    expect(fish.position).toEqual(before.position); expect(fish.swimPhase).toBe(before.swimPhase);
    expect(fish.bodyLength).toBeCloseTo(before.bodyLength * 1.3);
    settings.set(["shubunkin", "count"], 0); const hidden = structuredClone(fish);
    school.update(1 / 60, 1); expect(fish).toEqual(hidden);
    population.resize(0.5, 2);
    for (const pose of ["spine", "renderSpine"] as const) fish[pose].forEach((node, i) => {
      expect(node.x - hidden[pose][i].x).toBeCloseTo(-hidden.position.x * 0.5);
      expect(node.y - hidden[pose][i].y).toBeCloseTo(hidden.position.y);
    });
    settings.set(["shubunkin", "count"], 6); expect(population.fish[0]).toBe(fish);
  });

  it("paints a stable, different calico coat with every tone family on each fish slot", () => {
    const coats = Array.from({length: 6}, (_, index) => shubunkinCoat(index));
    expect(shubunkinCoat(2)).toEqual(coats[2]);
    expect(new Set(coats.map(coat => coat.join())).size).toBe(6);
    for (const coat of coats) {
      const tones = new Set(coat);
      expect(tones.has(3), "vermilion").toBe(true);
      expect(tones.has(4), "ink").toBe(true);
      // Blue stays present alongside the patches, so it still reads as a Shubunkin.
      expect(coat.filter(tone => tone <= 2).length / coat.length).toBeGreaterThan(0.35);
    }
  });

  it("fills exact bounded geometry and never folds a membrane across calls and scattering", () => {
    settings.set(["shubunkin", "count"], 6); settings.set(["shubunkin", "size"], 1.3);
    const school = new School(), renderer = new ShubunkinRenderer();
    const meshes = [...renderer.group.children, ...renderer.shadowGroup.children] as THREE.Mesh[];
    const expected = [SHUBUNKIN_VERTEX_BUDGET.shapes, SHUBUNKIN_VERTEX_BUDGET.lines, SHUBUNKIN_VERTEX_BUDGET.shadows];
    const buffers = meshes.map(mesh => mesh.geometry.getAttribute("position"));
    const winding: number[] = [];
    for (let frame = 0; frame < 360; frame++) {
      if (frame === 60) school.callTo({x: 460, y: 25}); if (frame === 180) school.callTo({x: 20, y: 245}); if (frame === 280) school.scatter();
      school.update(1 / 60, frame / 60); renderer.update(school.shubunkin, undefined, frame / 60);
      meshes.forEach((mesh, i) => {
        expect(mesh.geometry.getAttribute("position")).toBe(buffers[i]);
        expect(mesh.geometry.drawRange.count).toBe(expected[i] * 6);
        expect(mesh.geometry.drawRange.count).toBeLessThanOrEqual(buffers[i].count);
        expect(buffers[i].array.every(Number.isFinite)).toBe(true);
      });
      const position = buffers[0];
      for (let fish = 0; fish < 6; fish++) for (let vertex = 0; vertex < SHUBUNKIN_VERTEX_BUDGET.membranes; vertex += 3) {
        const area = signedArea(position, fish * SHUBUNKIN_VERTEX_BUDGET.shapes + vertex);
        if (Math.abs(area) < 1e-3) continue; // The closing tip of a lobe is intentionally zero-width.
        winding[vertex] ??= Math.sign(area);
        expect(Math.sign(area), `frame ${frame}, fish ${fish}, membrane vertex ${vertex}`).toBe(winding[vertex]);
      }
    }
    settings.set(["shubunkin", "count"], 0); renderer.update(school.shubunkin);
    expect(meshes.every(mesh => mesh.geometry.drawRange.count === 0)).toBe(true);
    for (const mesh of meshes) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  });

  it("moves its tail exactly like the platinum longfin, frame by frame", () => {
    settings.set(["koi", "initialCount"], 0); settings.set(["goldfish", "count"], 0);
    settings.set(["butterfly-koi", "count"], 1); settings.set(["shubunkin", "count"], 0);
    const school = new School(), longfinRenderer = new ButterflyKoiRenderer(), renderer = new ShubunkinRenderer();
    const longfin = school.butterflyKoi.fish[0], fish = school.shubunkin.fish[0];
    Object.defineProperty(school.shubunkin, "count", {get: () => 1});
    const theirs = (longfinRenderer.group.children[0] as THREE.Mesh).geometry.getAttribute("position");
    const ours = (renderer.group.children[0] as THREE.Mesh).geometry.getAttribute("position");
    const tailVertices = (LONG_TAIL.length - 2) * 3;
    for (let frame = 0; frame < 480; frame++) {
      if (frame === 120) school.callTo({x: 460, y: 25}); if (frame === 360) school.scatter();
      school.update(1 / 60, frame / 60);
      Object.assign(fish, structuredClone({...longfin}));
      longfinRenderer.update(school.butterflyKoi); renderer.update(school.shubunkin, undefined, frame / 60);
      for (let vertex = 0; vertex < tailVertices; vertex++) {
        expect(ours.getX(vertex)).toBeCloseTo(theirs.getX(vertex), 4);
        expect(ours.getY(vertex)).toBeCloseTo(theirs.getY(vertex), 4);
      }
    }
  });
});
