import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCanvasSize } from "../config";
import { School } from "../school";
import { TinyFishSchools, type TinyFishAgent } from "../tiny-fish";
import { pondSize } from "../viewport";
import { connectSettingsEffects } from "./effects";
import { settings } from "./store";

let frames: Map<number, FrameRequestCallback>;
let disconnect: (() => void) | undefined;
let sequence = 0;
beforeEach(() => {
  settings.resetAll();
  setCanvasSize(480, 270);
  vi.useFakeTimers();
  sequence = 0; frames = new Map();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.set(++sequence, callback); return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});
afterEach(() => {
  disconnect?.(); disconnect = undefined;
  vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals();
  settings.resetAll(); setCanvasSize(480, 270);
});

function setup() {
  const school = new School();
  for (let frame = 0; frame < 10; frame++) school.update(1 / 60, frame / 60);
  disconnect = connectSettingsEffects(settings, { school, renderer: null });
  return school;
}
function flushLight() {
  const pending = [...frames.values()]; frames.clear();
  pending.forEach(callback => callback(performance.now()));
}
function flush(order: string) {
  for (const queue of order) {
    if (queue === "L") flushLight();
    else vi.advanceTimersByTime(100);
  }
}
function move() {
  settings.set(["tiny-fish-schools", 0, "x"], 244);
  settings.set(["tiny-fish-schools", 0, "y"], 52);
}
function expectPose(school: School, before: TinyFishAgent, dx = 0, dy = 0) {
  const fish = school.tinyFish.fish[0];
  expect(fish.position.x).toBeCloseTo(before.position.x + dx, 10);
  expect(fish.position.y).toBeCloseTo(before.position.y + dy, 10);
  expect(fish.velocity).toEqual(before.velocity);
  expect(fish.tailPhase).toBe(before.tailPhase);
}

describe.each(["LH", "HL"])("Medaka authored placement with %s effect order", order => {
  it("applies a two-axis move once across a concurrent size refresh", () => {
    const school = setup(), before = structuredClone(school.tinyFish.fish[0]);
    move(); settings.set(["tiny-fish", "bodyLength"], [7, 9]);
    flush(order);
    expectPose(school, before, 70, -30);
  });

  it.each(["undo", "reset-group", "reset-all"])("retains drift and momentum through a same-frame %s", action => {
    const school = setup(), before = structuredClone(school.tinyFish.fish[0]);
    move();
    if (action === "undo") { settings.undo(); settings.undo(); }
    else if (action === "reset-group") settings.resetSections(["tiny-fish-schools"]);
    else settings.resetAll();
    flush(order);
    expectPose(school, before);
  });

  it("restores a completed move on undo and reapplies it on redo", () => {
    const school = setup(), before = structuredClone(school.tinyFish.fish[0]);
    move(); flush(order); expectPose(school, before, 70, -30);
    settings.undo(); settings.undo(); flush(order); expectPose(school, before);
    settings.redo(); settings.redo(); flush(order); expectPose(school, before, 70, -30);
  });

  it("uses the new viewport if a pending move crosses a portrait resize", () => {
    const school = setup(), before = structuredClone(school.tinyFish.fish[0]);
    move(); settings.set(["tiny-fish", "bodyLength"], [7, 9]);
    const portrait = pondSize(390, 844), sx = portrait.width / 480, sy = portrait.height / 270;
    setCanvasSize(portrait.width, portrait.height); school.resize(sx, sy);
    before.position.x *= sx; before.position.y *= sy;
    flush(order); expectPose(school, before, 70 * sx, -30 * sy);
    settings.resetSections(["tiny-fish-schools"]); flush(order);
    expectPose(school, before);
  });

  it("handles generated and removed schools while coordinate callbacks are queued", () => {
    const school = setup(), before = structuredClone(school.tinyFish.fish[0]);
    settings.set(["tiny-fish", "visibleSchoolCount"], 6);
    settings.set(["tiny-fish-schools", 5, "x"], 222);
    settings.set(["tiny-fish-schools", 5, "y"], 111);
    const expected = new TinyFishSchools().fish.filter(fish => fish.schoolIndex === 5).map(fish => fish.position);
    flush(order);
    expect(school.tinyFish.fish.filter(fish => fish.schoolIndex === 5).map(fish => fish.position)).toEqual(expected);
    expectPose(school, before);
    settings.set(["tiny-fish-schools", 5, "x"], 333);
    settings.resetSections(["tiny-fish", "tiny-fish-schools"]);
    flush(order);
    expect(school.tinyFish.fish.some(fish => fish.schoolIndex === 5)).toBe(false);
    expectPose(school, before);
  });
});
