import { afterEach, describe, expect, it } from "vitest";
import { baskOpening, ButterflyPass, flapOpening } from "./butterflies";
import { RippleSystem } from "./ripple-system";
import { settings } from "./settings/store";

afterEach(() => settings.resetAll());

interface Flyer { state: string; startle: number; position: {x: number; y: number}; wanderTarget: {x: number; y: number}; flapPhase: number; gliding: boolean; displayHeading: number; velocity: {x: number; y: number}; wingSpread: number }
const flyers = (pass: ButterflyPass) => (pass as unknown as {butterflies: Flyer[]}).butterflies;

describe("butterfly flight", () => {
  it("opens and closes within a believable wing range", () => {
    for (let phase = 0; phase < 20; phase += 0.13) {
      const open = flapOpening(phase);
      expect(open).toBeGreaterThanOrEqual(0.16);
      expect(open).toBeLessThanOrEqual(1);
    }
    for (let time = 0; time < 40; time += 0.07) {
      const open = baskOpening(time, 0.4);
      expect(open).toBeGreaterThan(0.15);
      expect(open).toBeLessThanOrEqual(1);
    }
  });

  it("mixes flapping with glides while wandering and keeps the wing phase still in a glide", () => {
    const pass = new ButterflyPass(), butterfly = flyers(pass)[0];
    let glidingFrames = 0, flappingFrames = 0, previous = butterfly.flapPhase;
    for (let frame = 1; frame < 1800; frame++) {
      butterfly.state = "wander"; butterfly.startle = 0;
      pass.update(frame / 60);
      if (butterfly.gliding) { glidingFrames++; expect(butterfly.flapPhase).toBe(previous); }
      else flappingFrames++;
      previous = butterfly.flapPhase;
    }
    expect(glidingFrames).toBeGreaterThan(60);
    expect(flappingFrames).toBeGreaterThan(glidingFrames);
  });

  it("takes off away from a nearby tap and ignores a distant one", () => {
    const pass = new ButterflyPass(), ripples = new RippleSystem();
    const [near, far] = flyers(pass);
    for (const butterfly of [near, far]) butterfly.state = "rest";
    near.position = {x: 100, y: 100}; far.position = {x: 400, y: 220};
    ripples.trigger("touch", {x: 110, y: 100});
    for (let frame = 0; frame < 8 && !ripples.instances.some(r => r.alive && r.age >= 0); frame++) ripples.update(1 / 60);
    pass.update(1, undefined, ripples);
    expect(near.state).toBe("wander");
    expect(near.startle).toBeGreaterThan(0.5);
    expect(near.wanderTarget.x).toBeLessThan(near.position.x);
    expect(far.state).toBe("rest");
    expect(far.startle).toBe(0);
  });

  it("does not spin in place while resting on a flower", () => {
    const pass = new ButterflyPass(), butterfly = flyers(pass)[0];
    butterfly.state = "rest"; pass.update(0);
    const before = butterfly.displayHeading;
    butterfly.velocity = {x: -butterfly.velocity.x * 0.01, y: -butterfly.velocity.y * 0.01};
    butterfly.state = "rest";
    pass.update(1 / 60);
    expect(Math.abs(butterfly.displayHeading - before)).toBeLessThan(0.1);
  });
});
