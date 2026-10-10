import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { School } from "../school";
import { connectSettingsEffects } from "./effects";
import { settings } from "./store";

let callbacks: Map<number, FrameRequestCallback>;
let disconnect: (() => void) | undefined;
let sequence = 0;
beforeEach(() => {
  settings.resetAll();
  vi.useFakeTimers();
  callbacks = new Map();
  sequence = 0;
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callbacks.set(++sequence, callback);
    return sequence;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
});
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  settings.resetAll();
});

function flush() {
  const pending = [...callbacks.values()];
  callbacks.clear();
  pending.forEach(callback => callback(performance.now()));
}
function setup() {
  const school = new School();
  disconnect = connectSettingsEffects(settings, { school, renderer: null });
  return school;
}

describe("coalesced body changes", () => {
  it.each(["undo", "reset"])("keeps the original body after a size edit and same-frame %s", action => {
    const school = setup();
    const before = school.fish.map(fish => [fish.bodyLength, fish.bodyWidth]);
    settings.set(["koi", "regularLength"], [40, 50]);
    if (action === "undo") settings.undo();
    else settings.resetAll();
    flush();
    expect(school.fish.map(fish => [fish.bodyLength, fish.bodyWidth])).toEqual(before);
  });

  it.each(["edit-first", "weather-first"])("applies the size exactly once with coalesced weather: %s", order => {
    const school = setup();
    const before = school.fish[0].bodyLength;
    if (order === "weather-first") settings.setWeather("mist");
    settings.set(["koi", "regularLength"], [40, 50]);
    if (order === "edit-first") settings.setWeather("mist");
    flush();
    expect(school.fish[0].bodyLength).toBeCloseTo(before * 90 / 67);
    settings.setWeather("sunset");
    flush();
    expect(school.fish[0].bodyLength).toBeCloseTo(before * 90 / 67);
  });

  it("uses each field's earliest baseline across multiple edits and a reset", () => {
    const school = setup();
    const before = school.fish.map(fish => [fish.bodyLength, fish.bodyWidth]);
    settings.set(["koi", "regularLength"], [40, 50]);
    settings.set(["koi", "regularWidthRatio"], [.25, .3]);
    settings.set(["koi", "tinyLength"], [20, 28]);
    settings.resetSections(["koi"]);
    flush();
    expect(school.fish.map(fish => [fish.bodyLength, fish.bodyWidth])).toEqual(before);
  });

  it("preserves the existing behavior when edits and undo flush separately", () => {
    const school = setup();
    const before = school.fish[0].bodyLength;
    settings.set(["koi", "regularLength"], [40, 50]);
    flush();
    expect(school.fish[0].bodyLength).toBeCloseTo(before * 90 / 67);
    settings.undo();
    flush();
    expect(school.fish[0].bodyLength).toBeCloseTo(before);
  });
});
