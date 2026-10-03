import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PondRuntime, type PondStatus } from "./pond-runtime";
import { setCanvasSize } from "./config";

const gpu = vi.hoisted(() => ({ instances: [] as Array<{ times: number[]; dispose: ReturnType<typeof vi.fn> }> }));
vi.mock("./fish-renderer", () => ({
  FishRenderer: class {
    times: number[] = [];
    dispose = vi.fn();
    constructor() { gpu.instances.push(this); }
    setWeatherPreset() {}
    setPreviewFamily() {}
    refreshSection() {}
    resize() {}
    draw(_school: unknown, time: number) { this.times.push(time); }
  },
}));

let now = 0;
let nextFrame = 0;
let frames: Map<number, FrameRequestCallback>;
let page: EventTarget & { hidden: boolean };
let pond: PondRuntime | undefined;
beforeEach(() => {
  now = 0; nextFrame = 0; frames = new Map(); gpu.instances = [];
  page = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal("document", page);
  vi.stubGlobal("window", Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(performance, "now").mockImplementation(() => now);
});
afterEach(() => { pond?.dispose(); pond = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); setCanvasSize(480, 270); });

function setup() {
  let lost = false;
  const canvas = Object.assign(new EventTarget(), {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1920, height: 1080 }),
    getContext: () => ({ getExtension: () => lost ? null : extension }),
  });
  const extension = { restoreContext: vi.fn(() => { lost = false; canvas.dispatchEvent(new Event("webglcontextrestored")); }) };
  const states: PondStatus[] = [];
  pond = new PondRuntime(canvas as unknown as HTMLCanvasElement, canvas as unknown as HTMLElement, () => "60", state => states.push(state));
  return { canvas, extension, states, runtime: pond, lose: () => {
    lost = true;
    const event = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(event);
    return event;
  } };
}
function tick(milliseconds: number) {
  now += milliseconds;
  const pending = [...frames.values()]; frames.clear();
  pending.forEach(callback => callback(now));
}

describe("pond runtime lifecycle", () => {
  it("recovers repeatedly using the healthy extension handle, preserving the fish", () => {
    const { runtime, lose, extension, states } = setup();
    tick(20);
    const school = runtime.school;
    const positions = school.fish.map(fish => ({ ...fish.position }));
    for (let i = 0; i < 3; i++) {
      const retired = gpu.instances.at(-1)!;
      expect(lose().defaultPrevented).toBe(true);
      expect(frames.size).toBe(0);
      expect(retired.dispose).toHaveBeenCalledOnce();
      expect(states.at(-1)).toBe("restoring");
      runtime.retry();
      expect(states.at(-1)).toBe("ready");
      expect(runtime.school).toBe(school);
      expect(school.fish.map(fish => fish.position)).toEqual(positions);
      expect(frames.size).toBe(1);
    }
    expect(extension.restoreContext).toHaveBeenCalledTimes(3);
    expect(gpu.instances).toHaveLength(4);
  });
  it("pauses while hidden and resumes without advancing through background time", () => {
    setup(); tick(20); tick(20);
    const renderer = gpu.instances[0];
    const time = renderer.times.at(-1)!;
    page.hidden = true; page.dispatchEvent(new Event("visibilitychange"));
    expect(frames.size).toBe(0);
    tick(60_000);
    expect(renderer.times.at(-1)).toBe(time);
    page.hidden = false; page.dispatchEvent(new Event("visibilitychange"));
    tick(20);
    expect(renderer.times.at(-1)! - time).toBeGreaterThan(0);
    expect(renderer.times.at(-1)! - time).toBeLessThan(.04);
  });
  it("does not restart a disposed pond on visibility or page restoration", () => {
    const { runtime } = setup(); tick(20);
    runtime.dispose(); pond = undefined;
    page.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("pageshow"));
    expect(frames.size).toBe(0);
    expect(gpu.instances[0].dispose).toHaveBeenCalledOnce();
  });
});
