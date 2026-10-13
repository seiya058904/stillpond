import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { School } from "./school";
import { Koi } from "./koi";
import { ButterflyKoiRenderer, BUTTERFLY_KOI_VERTEX_BUDGET } from "./butterfly-koi-renderer";
import { settings, SettingsStore } from "./settings/store";
import { setCanvasSize } from "./config";
import { buildRenderSpine } from "./fish-spine";
import { SurfaceDisturbancePass } from "./surface-disturbance";

afterEach(() => { settings.resetAll(); setCanvasSize(480, 270); vi.restoreAllMocks(); });

describe("platinum butterfly koi integration", () => {
  it("preserves the six koi families and independently persists longfin settings", () => {
    const store = new SettingsStore(), families = [...store.live.koi.families];
    store.set(["butterfly-koi", "count"], 6); store.set(["butterfly-koi", "size"], 1.3);
    const next = new SettingsStore(); next.importOverrides(store.exportOverrides(), "sunny", false);
    expect(next.live["butterfly-koi"]).toEqual({count: 6, size: 1.3});
    expect(next.live.koi.families).toEqual(families);
    next.importOverrides({"koi.initialCount": 0}, "sunny", false);
    expect(next.live["butterfly-koi"]).toEqual({count: 2, size: 1}); expect(next.live.koi.families).toEqual([]);
  });

  it("uses identical behavior and poses for an isolated agent in either population", () => {
    settings.set(["goldfish", "count"], 0); settings.set(["butterfly-koi", "count"], 0);
    const a = new School(), b = new School(); a.setCount(1); b.setCount(0);
    Object.defineProperty(b.butterflyKoi, "count", {get: () => 1});
    const koi = a.fish[0], longfin = b.butterflyKoi.fish[0]; Object.assign(longfin, structuredClone(koi));
    expect(longfin).toBeInstanceOf(Koi);
    for (let frame = 0; frame < 900; frame++) {
      if (frame === 120 || frame === 420) { const point = frame === 120 ? {x: 460, y: 30} : {x: 40, y: 240}; a.callTo(point); b.callTo(point); }
      if (frame === 720) { a.scatter(); b.scatter(); }
      a.update(1 / 60, frame / 60); b.update(1 / 60, frame / 60); buildRenderSpine(koi); buildRenderSpine(longfin);
      for (const key of Object.keys(koi) as Array<keyof Koi>) expect(longfin[key]).toEqual(koi[key]);
    }
  });

  it("preserves identity and pose through size, zero count, resize and deterministic reset", () => {
    const school = new School(), population = school.butterflyKoi, fish = population.fish[0];
    const initial = structuredClone(population.fish); school.reset(); expect(population.fish).toEqual(initial);
    for (let i = 0; i < 60; i++) school.update(1 / 60, i / 60);
    const before = structuredClone(fish);
    settings.set(["butterfly-koi", "size"], 1.3); population.refreshConfig();
    expect(fish.position).toEqual(before.position); expect(fish.swimPhase).toBe(before.swimPhase);
    expect(fish.bodyLength).toBeCloseTo(before.bodyLength * 1.3);
    settings.set(["butterfly-koi", "count"], 0); const hidden = structuredClone(fish);
    school.update(1 / 60, 1); expect(fish).toEqual(hidden);
    population.resize(0.5, 2);
    for (const pose of ["spine", "renderSpine"] as const) fish[pose].forEach((node, i) => {
      expect(node.x - hidden[pose][i].x).toBeCloseTo(-hidden.position.x * 0.5);
      expect(node.y - hidden[pose][i].y).toBeCloseTo(hidden.position.y);
    });
    settings.set(["butterfly-koi", "count"], 6); expect(population.fish[0]).toBe(fish);
  });

  it.each([0, 3, 12, 32])("keeps all 62 agents finite alongside %i Medaka shoals and queries both avoidance populations", shoals => {
    settings.set(["koi", "initialCount"], 48); settings.set(["goldfish", "count"], 8);
    settings.set(["butterfly-koi", "count"], 6); settings.set(["tiny-fish", "visibleSchoolCount"], shoals);
    const school = new School(), agents = [...school.fish, ...school.goldfish.fish, ...school.butterflyKoi.fish];
    const wakin = vi.spyOn(school.goldfish, "avoidance"), longfin = vi.spyOn(school.butterflyKoi, "avoidance");
    expect(new Set(agents.map(f => f.behaviorRng)).size).toBe(62);
    for (let frame = 0; frame < 120; frame++) {
      if (frame === 30) school.callTo({x: 400, y: 100}); if (frame === 90) school.scatter();
      school.update(1 / 60, frame / 60);
      expect(agents.every(f => Number.isFinite(f.position.x + f.position.y + f.speed + f.turnBend))).toBe(true);
    }
    if (shoals) { expect(wakin).toHaveBeenCalled(); expect(longfin).toHaveBeenCalled(); }
    const f = school.butterflyKoi.fish[0];
    expect(Math.hypot(...Object.values(school.butterflyKoi.avoidance(f.position.x, f.position.y, 2)))).toBeGreaterThan(0);
  });

  it("writes 62 disturbance instances, omits longfins in preview, and handles a fishless pond", () => {
    settings.set(["koi", "initialCount"], 48); settings.set(["goldfish", "count"], 8); settings.set(["butterfly-koi", "count"], 6);
    const school = new School(), pass = new SurfaceDisturbancePass();
    const draw = vi.fn();
    const gpu = { getClearColor: (out: THREE.Color) => out.set(0), getClearAlpha: () => 1,
      setRenderTarget: vi.fn(), setClearColor: vi.fn(), clear: vi.fn(), render: draw } as unknown as THREE.WebGLRenderer;
    pass.render(gpu, school, 0);
    const scene = draw.mock.calls[0][0] as THREE.Scene, geometry = (scene.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry;
    expect(geometry.instanceCount).toBe(62);
    expect(geometry.getAttribute("aCenter").count).toBe(62);
    expect(geometry.getAttribute("aCenter").getX(56)).toBeCloseTo(school.butterflyKoi.fish[0].position.x, 4);
    pass.render(gpu, school, 0, 0); expect(geometry.instanceCount).toBe(1);
    school.setCount(0); settings.set(["goldfish", "count"], 0); settings.set(["butterfly-koi", "count"], 0);
    pass.render(gpu, school, 0); expect(geometry.instanceCount).toBe(0); pass.dispose();
  });

  it("fills exact bounded geometry without truncation across motion, scaling and hiding", () => {
    settings.set(["butterfly-koi", "count"], 6); settings.set(["butterfly-koi", "size"], 1.3);
    const school = new School(), renderer = new ButterflyKoiRenderer();
    const meshes = [...renderer.group.children, ...renderer.shadowGroup.children] as THREE.Mesh[];
    const expected = [BUTTERFLY_KOI_VERTEX_BUDGET.shapes, BUTTERFLY_KOI_VERTEX_BUDGET.lines, BUTTERFLY_KOI_VERTEX_BUDGET.shadows];
    const buffers = meshes.map(mesh => mesh.geometry.getAttribute("position"));
    const membraneWinding: number[] = [];
    for (let frame = 0; frame < 360; frame++) {
      if (frame === 60) school.callTo({x: 460, y: 25}); if (frame === 180) school.callTo({x: 20, y: 245}); if (frame === 280) school.scatter();
      school.update(1 / 60, frame / 60); renderer.update(school.butterflyKoi);
      meshes.forEach((mesh, i) => {
        expect(mesh.geometry.getAttribute("position")).toBe(buffers[i]);
        expect(mesh.geometry.drawRange.count).toBe(expected[i] * 6);
        expect(mesh.geometry.drawRange.count).toBeLessThanOrEqual(buffers[i].count);
        expect(buffers[i].array.every(Number.isFinite)).toBe(true);
      });
      // Mirrored fins have opposite winding; neither side may fold through itself.
      const position = buffers[0];
      for (let fish = 0; fish < 6; fish++) for (let vertex = 0; vertex < BUTTERFLY_KOI_VERTEX_BUDGET.membranes; vertex += 3) {
        const a = fish * BUTTERFLY_KOI_VERTEX_BUDGET.shapes + vertex, b = a + 1, c = a + 2;
        const area = (position.getX(b) - position.getX(a)) * (position.getY(c) - position.getY(a))
          - (position.getY(b) - position.getY(a)) * (position.getX(c) - position.getX(a));
        if (frame === 0 && fish === 0) membraneWinding[vertex] = Math.sign(area);
        expect(Math.sign(area), `frame ${frame}, fish ${fish}, membrane vertex ${vertex}, area ${area}`).toBe(membraneWinding[vertex]);
      }
    }
    settings.set(["butterfly-koi", "count"], 0); renderer.update(school.butterflyKoi);
    expect(meshes.every(mesh => mesh.geometry.drawRange.count === 0)).toBe(true);
    for (const mesh of meshes) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
  });
});
