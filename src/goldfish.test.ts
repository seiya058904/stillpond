import { afterEach, describe, expect, it } from "vitest";
import { GoldfishPopulation } from "./goldfish";
import { GoldfishRenderer } from "./goldfish-renderer";
import { School } from "./school";
import { settings } from "./settings/store";
import { setCanvasSize } from "./config";
import { wrapAngle } from "./math";
import type { Mesh, LineSegments } from "three";

afterEach(() => { settings.resetAll(); setCanvasSize(480, 270); });

describe("independent wakin", () => {
  it("keeps existing fish and motion when changing size, hiding, and restoring the population", () => {
    const population = new GoldfishPopulation(); population.reset();
    const fish = population.fish[0], position = { ...fish.position }, phase = fish.tailPhase;
    settings.set(["goldfish", "size"], 1.3); population.refreshConfig();
    expect(fish.position).toEqual(position);
    expect(fish.tailPhase).toBe(phase);
    expect(fish.bodyLength).toBeCloseTo(fish.baseLength * 1.3);
    settings.set(["goldfish", "count"], 0);
    population.update(1 / 60, 1, [], 0, []);
    expect(fish.position).toEqual(position);
    settings.set(["goldfish", "count"], 8);
    expect(population.fish[0]).toBe(fish);
    expect(population.count).toBe(8);
  });

  it("does not share the koi tap or scatter state and retains continuous propulsion", () => {
    const school = new School();
    const fish = school.goldfish.fish[0];
    const before = structuredClone(fish);
    school.callTo({ x: 180, y: 120 }); school.scatter();
    expect(fish).toEqual(before);
    const depths = new Set<number>(), phases = new Set<number>();
    for (let frame = 0; frame < 3600; frame++) {
      const heading = fish.heading, phase = fish.tailPhase, speed = fish.speed;
      school.goldfish.update(1 / 60, frame / 60, [], 0, []);
      expect(Math.abs(wrapAngle(fish.heading - heading))).toBeLessThanOrEqual(2.751 / 60);
      expect(fish.tailPhase).toBeGreaterThan(phase);
      expect(Math.abs(fish.speed - speed)).toBeLessThan(0.4);
      if (frame % 60 === 0) depths.add(Math.round(fish.depth * 100));
    }
    for (const f of school.goldfish.fish.slice(0, school.goldfish.count)) phases.add(Math.round(f.tailPhase * 10));
    expect(depths.size).toBeGreaterThan(8);
    expect(phases.size).toBe(school.goldfish.count);
    expect(Math.hypot(fish.position.x - before.position.x, fish.position.y - before.position.y)).toBeGreaterThan(20);
  });

  it("turns around a koi body before an approaching head enters it", () => {
    const school = new School(); school.setCount(1);
    settings.set(["goldfish", "count"], 1);
    const koi = school.fish[0], fish = school.goldfish.fish[0];
    Object.assign(koi.position, { x: 240, y: 110 });
    koi.velocity.x = koi.velocity.y = 0; koi.bodyWidth = 8;
    koi.spine.forEach((node, index) => { node.x = 240; node.y = 110 + index * 4; });
    Object.assign(fish.position, { x: 175, y: 135 });
    Object.assign(fish.target, { x: 330, y: 135 });
    fish.heading = 0; fish.angularVelocity = 0; fish.intentionAge = 15;
    fish.speed = fish.targetSpeed = 18; fish.velocity.x = 18; fish.velocity.y = 0;
    let nearest = Infinity;
    for (let frame = 0; frame < 600; frame++) {
      school.goldfish.update(1 / 60, frame / 60, school.fish, 1, []);
      for (const node of koi.spine) nearest = Math.min(nearest, Math.hypot(fish.position.x - node.x, fish.position.y - node.y));
    }
    expect(nearest).toBeGreaterThan(koi.bodyWidth + fish.bodyWidth);
    expect(Math.abs(fish.position.y - 135)).toBeGreaterThan(20);
  });

  it.each([[480, 270], [640, 270], [270, 584]])("keeps the maximum population finite and moving at %s × %s", (width, height) => {
    setCanvasSize(width, height); settings.set(["goldfish", "count"], 8);
    const population = new GoldfishPopulation(); population.reset();
    for (let frame = 0; frame < 7200; frame++) {
      population.update(1 / 60, frame / 60, [], 0, []);
      for (const fish of population.fish) {
        if (!Number.isFinite(fish.position.x + fish.position.y + fish.speed + fish.depth + fish.tailPhase)) throw new Error("Nonfinite wakin");
        if (fish.position.x < 8 || fish.position.x > width - 8 || fish.position.y < 8 || fish.position.y > height - 8) throw new Error("Wakin escaped pond");
        if (fish.speed < 3) throw new Error("Wakin stopped");
      }
    }
  });

  it("reuses bounded geometry through full population, depth, tail motion, and hiding", () => {
    settings.set(["goldfish", "count"], 8);
    const population = new GoldfishPopulation(); population.reset();
    const renderer = new GoldfishRenderer();
    const meshes = [...renderer.group.children, ...renderer.shadowGroup.children] as Array<Mesh | LineSegments>;
    const buffers = meshes.map(mesh => mesh.geometry.getAttribute("position").array);
    let prior = 0;
    for (let frame = 0; frame < 120; frame++) {
      population.update(1 / 60, frame / 60, [], 0, []); renderer.update(population);
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
