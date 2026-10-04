import { afterEach, describe, expect, it } from "vitest";
import { GoldfishRenderer } from "./goldfish-renderer";
import { School } from "./school";
import { settings } from "./settings/store";
import { setCanvasSize } from "./config";
import { Koi, SwimState } from "./koi";
import { buildRenderSpine } from "./fish-spine";
import type { Mesh, LineSegments } from "three";

afterEach(() => { settings.resetAll(); setCanvasSize(480, 270); });

describe("wakin on the shared koi system", () => {
  it("keeps existing fish and motion when changing size, hiding, and restoring the population", () => {
    const school = new School(); school.setCount(0); school.reset();
    const population = school.goldfish;
    for (let frame = 0; frame < 90; frame++) school.update(1 / 60, frame / 60);
    const fish = population.fish[0], position = { ...fish.position }, phase = fish.swimPhase;
    const before = structuredClone(fish);
    settings.set(["goldfish", "size"], 1.3); population.refreshConfig();
    expect(fish.position).toEqual(position);
    expect(fish.swimPhase).toBe(phase);
    expect(fish.bodyLength).toBeCloseTo(fish.baseLength * 1.3);
    for (const key of ["spine", "renderSpine"] as const) fish[key].forEach((node, i) => {
      expect(node.x - position.x).toBeCloseTo((before[key][i].x - position.x) * 1.3, 10);
      expect(node.y - position.y).toBeCloseTo((before[key][i].y - position.y) * 1.3, 10);
    });
    expect(fish.angularVelocity).toBe(before.angularVelocity);
    expect(fish.turnBend).toBe(before.turnBend);
    settings.set(["goldfish", "count"], 0);
    const hidden = structuredClone(fish);
    school.update(1 / 60, 1);
    expect(fish).toEqual(hidden);
    settings.set(["goldfish", "count"], 8);
    expect(population.fish[0]).toBe(fish);
    expect(population.count).toBe(8);
    school.update(1 / 60, 1);
    expect(Math.hypot(fish.position.x - position.x, fish.position.y - position.y)).toBeLessThan(1);
    expect(fish.tailPhase).toBe(fish.swimPhase); expect(fish.effort).toBe(fish.tailEffort);
  });

  it("translates the complete curved pose on resize and restores a deterministic fresh population", () => {
    const school = new School(); school.setCount(0); school.reset();
    const population = school.goldfish;
    const initial = structuredClone(population.fish);
    for (let frame = 0; frame < 90; frame++) school.update(1 / 60, frame / 60);
    const fish = population.fish[0], before = structuredClone(fish);
    population.resize(0.7, 2);
    const dx = fish.position.x - before.position.x, dy = fish.position.y - before.position.y;
    for (const key of ["spine", "renderSpine"] as const) fish[key].forEach((node, i) => {
      expect(node.x - before[key][i].x).toBeCloseTo(dx, 10);
      expect(node.y - before[key][i].y).toBeCloseTo(dy, 10);
    });
    expect(fish.bodyLength).toBe(before.bodyLength); expect(fish.swimPhase).toBe(before.swimPhase);
    population.reset(); expect(population.fish).toEqual(initial);
  });

  it("attracts both species, including a Wakin-only pond, then releases attention", () => {
    for (const koiCount of [0, 3]) {
      const school = new School(); school.setCount(koiCount);
      const fish = [...school.fish.slice(0, koiCount), ...school.goldfish.fish.slice(0, 3)];
      const point = { x: 240, y: 135 };
      const distances = fish.map(f => Math.hypot(f.position.x - point.x, f.position.y - point.y));
      school.callTo(point);
      expect(fish.every(f => f.callDelay > 0 && !f.respondedToCall)).toBe(true);
      for (let frame = 0; frame < 180; frame++) school.update(1 / 60, frame / 60);
      expect(fish.every(f => f.respondedToCall && f.callInfluence > 0.5)).toBe(true);
      expect(fish.reduce((sum, f) => sum + Math.hypot(f.position.x - point.x, f.position.y - point.y), 0))
        .toBeLessThan(distances.reduce((sum, d) => sum + d, 0));
      school.callTo({ x: 100, y: 70 });
      for (let frame = 0; frame < 1800; frame++) school.update(1 / 60, 3 + frame / 60);
      expect(fish.every(f => f.callInfluence < 0.001)).toBe(true);
    }
  });

  it("scatters Wakin through the same burst state without moving their pose instantly", () => {
    const school = new School(), fish = school.goldfish.fish[0];
    const before = structuredClone(fish);
    school.scatter();
    expect(fish.state).toBe(SwimState.Burst);
    expect(fish.escapeTime).toBeGreaterThan(0);
    expect(fish.position).toEqual(before.position);
    expect(fish.spine).toEqual(before.spine);
    expect(fish.heading).toBe(before.heading);
    school.update(1 / 60, 1 / 60);
    expect(fish.position).not.toEqual(before.position);
  });

  it("uses identical motion for an identical agent in either population", () => {
    const koiSchool = new School(), wakinSchool = new School();
    koiSchool.setCount(1); wakinSchool.setCount(0);
    const koi = koiSchool.fish[0], wakin = wakinSchool.goldfish.fish[0];
    // Keep one shared agent active in each school without changing global settings.
    Object.defineProperty(koiSchool.goldfish, "count", { get: () => 0 });
    Object.defineProperty(wakinSchool.goldfish, "count", { get: () => 1 });
    Object.assign(wakin, structuredClone(koi));
    expect(wakin).toBeInstanceOf(Koi);
    const keys = Object.keys(koi) as Array<keyof Koi>;
    for (let frame = 0; frame < 900; frame++) {
      if (frame === 120 || frame === 420) {
        const point = frame === 120 ? { x: 460, y: 30 } : { x: 40, y: 240 };
        koiSchool.callTo(point); wakinSchool.callTo(point);
      }
      if (frame === 720) { koiSchool.scatter(); wakinSchool.scatter(); }
      koiSchool.update(1 / 60, frame / 60); wakinSchool.update(1 / 60, frame / 60);
      buildRenderSpine(koi); buildRenderSpine(wakin);
      for (const key of keys) expect(wakin[key]).toEqual(koi[key]);
    }
  });

  it("keeps the maximum mixed population finite without lateral position corrections", () => {
    settings.set(["goldfish", "count"], 8);
    const school = new School(); school.setCount(48);
    const fish = [...school.fish, ...school.goldfish.fish];
    for (let frame = 0; frame < 900; frame++) {
      if (frame === 300) school.callTo({ x: 440, y: 60 });
      const before = fish.map(f => ({ ...f.position }));
      school.update(1 / 60, frame / 60);
      fish.forEach((f, i) => {
        expect(Number.isFinite(f.position.x + f.position.y + f.speed + f.turnBend)).toBe(true);
        expect(f.position.x - before[i].x).toBeCloseTo(f.velocity.x / 60, 10);
        expect(f.position.y - before[i].y).toBeCloseTo(f.velocity.y / 60, 10);
        expect(f.position.x).toBeGreaterThan(-f.bodyLength);
        expect(f.position.x).toBeLessThan(480 + f.bodyLength);
        expect(f.position.y).toBeGreaterThan(-f.bodyLength);
        expect(f.position.y).toBeLessThan(270 + f.bodyLength);
      });
    }
  });

  it("draws the body, fins and shadow from the same curved spine", () => {
    settings.set(["goldfish", "count"], 1);
    const school = new School(), fish = school.goldfish.fish[0];
    const renderer = new GoldfishRenderer(); renderer.update(school.goldfish);
    const meshes = [...renderer.group.children, ...renderer.shadowGroup.children] as Mesh[];
    const before = meshes.map(mesh => Array.from(mesh.geometry.getAttribute("position").array));
    const heading = fish.heading;
    fish.spine.forEach((node, i) => { node.y += 0.1 * i * i; });
    renderer.update(school.goldfish);
    expect(fish.heading).toBe(heading);
    meshes.forEach((mesh, i) => {
      const positions = mesh.geometry.getAttribute("position").array;
      expect(positions.some((value, j) => Math.abs(value - before[i][j]) > 0.5)).toBe(true);
      expect(Array.from(positions).every(Number.isFinite)).toBe(true);
      mesh.geometry.dispose();
    });
  });

  it("reuses bounded geometry through full population, depth, tail motion, and hiding", () => {
    settings.set(["goldfish", "count"], 8);
    const school = new School(); school.setCount(0); school.reset();
    const population = school.goldfish;
    const renderer = new GoldfishRenderer();
    const meshes = [...renderer.group.children, ...renderer.shadowGroup.children] as Array<Mesh | LineSegments>;
    const buffers = meshes.map(mesh => mesh.geometry.getAttribute("position").array);
    let prior = 0;
    for (let frame = 0; frame < 120; frame++) {
      school.update(1 / 60, frame / 60); renderer.update(population);
      for (let index = 0; index < meshes.length; index++) {
        const geometry = meshes[index].geometry, attribute = geometry.getAttribute("position");
        expect(attribute.array).toBe(buffers[index]);
        expect(geometry.drawRange.count).toBeGreaterThan(0);
        expect(geometry.drawRange.count).toBeLessThan(attribute.count);
      }
      const x = buffers[0][0]; if (frame === 119) expect(x).not.toBe(prior); prior = x;
    }
    settings.set(["goldfish", "count"], 0); renderer.update(population);
    expect(meshes.every(mesh => mesh.geometry.drawRange.count === 0)).toBe(true);
    for (const mesh of meshes) mesh.geometry.dispose();
  });
});
