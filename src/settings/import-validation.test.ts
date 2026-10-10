import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { School } from "../school";
import { definition } from "./definition";
import { __internal, loadInto, save } from "./persistence";
import { defaults, nodeAt, validate } from "./schema";
import { SettingsStore, settings } from "./store";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    clear: () => data.clear(), key: () => null,
    get length() { return data.size; },
  };
}

function seed(overrides: unknown): void {
  localStorage.setItem(__internal.STORAGE_KEY_V2,
    JSON.stringify({version: 2, overrides, weather: "sunny", rain: false}));
}

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  settings.resetAll();
});
afterEach(() => {
  delete (Object.prototype as Record<string, unknown>).stillpondAuditPolluted;
  settings.resetAll();
  vi.unstubAllGlobals();
});

describe("saved settings validation boundary", () => {
  it.each([
    {koi: {depth: null}},
    {koi: {regularLength: "invalid", callResponse: false}},
    {"tiny-fish-schools": [null]},
    {"tiny-fish-schools": [{x: 120, count: "invalid", sizeScale: null}]},
    {"tiny-fish": {flee: null, palettes: [null]}},
    {"koi-palettes": [null], "koi-patterns": [null]},
    {"lotus": {leafPalettes: [null]}, "water": {currentDistortion: {waves: [null]}}},
  ])("keeps real simulation usable with malformed nested saves: %j", overrides => {
    seed(overrides);
    const koi = settings.live.koi;
    const schools = settings.live["tiny-fish-schools"];
    expect(() => loadInto(settings)).not.toThrow();
    expect(settings.live.koi).toBe(koi);
    expect(settings.live["tiny-fish-schools"]).toBe(schools);
    const school = new School();
    for (let frame = 0; frame < 60; frame++) school.update(1 / 60, (frame + 1) / 60);
    expect([...school.fish, ...school.tinyFish.fish, ...school.goldfish.fish].every(fish =>
      [fish.position.x, fish.position.y, fish.velocity.x, fish.velocity.y, fish.bodyLength, fish.bodyWidth]
        .every(Number.isFinite))).toBe(true);
    settings.set(["koi", "initialCount"], 9);
    expect(settings.live.koi.initialCount).toBe(9);
    expect(save(settings)).toBe(true);
  });

  it.each([null, false, 31, "invalid", []])("ignores non-record overrides: %j", value => {
    seed(value);
    const store = new SettingsStore();
    const before = structuredClone(store.live);
    expect(() => loadInto(store)).not.toThrow();
    expect(store.live).toEqual(before);
  });

  it("filters prototype payloads and inherited schema paths without mutating shared prototypes", () => {
    const payload = JSON.parse('{"koi":{"__proto__":{"stillpondAuditPolluted":true},"constructor":{"prototype":{"stillpondAuditPolluted":true}},"initialCount":8},"koi.__proto__":{"stillpondAuditPolluted":true},"koi.constructor.prototype.stillpondAuditPolluted":true,"tiny-fish-schools":[{"__proto__":{"stillpondAuditPolluted":true},"x":123}]}');
    seed(payload);
    const store = new SettingsStore();
    expect(() => loadInto(store)).not.toThrow();
    expect(({} as Record<string, unknown>).stillpondAuditPolluted).toBeUndefined();
    expect(store.live.koi.initialCount).toBe(8);
    expect(store.live["tiny-fish-schools"][0].x).toBe(123);
    expect(JSON.stringify(store.exportOverrides())).not.toMatch(/__proto__|constructor|stillpondAuditPolluted/);
    expect(nodeAt(definition, ["koi", "__proto__"])).toBeUndefined();
    expect(nodeAt(definition, ["constructor"])).toBeUndefined();
  });

  it("preserves partial groups and lets weather replace only the owned leaves", () => {
    const store = new SettingsStore();
    store.importOverrides({koi: {initialCount: 8, regularLength: [23, 47], depth: {callRiseSeconds: 4}},
      water: {detailCurrentSpeed: 4, clarity: 0.5}}, "moonlight", true);
    expect(store.live.koi).toMatchObject({initialCount: 8, regularLength: [23, 47], depth: {callRiseSeconds: 4}});
    expect(store.live.water).toMatchObject({detailCurrentSpeed: 4, clarity: 0.5});
    store.setWeather("sunny");
    expect(store.live.water.detailCurrentSpeed).toBe(1);
    expect(store.live.water.clarity).toBe(0.5);
    expect(store.live.koi.regularLength).toEqual([23, 47]);
    expect(store.live.koi.depth.callRiseSeconds).toBe(4);
    expect(store.exportOverrides()).not.toHaveProperty("koi");
  });

  it.each([false, true])("keeps explicit leaves over parent snapshots in either JSON order: reversed=%s", reverse => {
    const entries: [string, unknown][] = [
      ["koi.regularLength", [30, 45]], ["koi", {regularLength: [20, 40], initialCount: 7}],
      ["koi-palettes.0.base", 0x123456], ["koi-palettes", [{base: 0xabcdef}]],
    ];
    const store = new SettingsStore();
    store.importOverrides(Object.fromEntries(reverse ? entries.reverse() : entries), "sunny", false);
    expect(store.live.koi.regularLength).toEqual([30, 45]);
    expect(store.live.koi.initialCount).toBe(7);
    expect(store.live["koi-palettes"][0].base).toBe(0x123456);
    save(store);
    const next = new SettingsStore(); loadInto(next);
    expect(next.live).toEqual(store.live);
  });

  it("retains fixed palette slots and each family's variable patch list", () => {
    const authored = defaults(definition) as typeof settings.live;
    const patches = authored["koi-patterns"].map(family => family.map(patch => ({...patch})));
    patches[0] = Array.from({length: 7}, (_, index) => ({...patches[0][0], position: index / 10}));
    patches[1] = [];
    const store = new SettingsStore();
    store.importOverrides({"koi-palettes": [{base: 0x123456}], "koi-patterns": patches}, "sunny", false);
    expect(store.live["koi-palettes"]).toHaveLength(6);
    expect(store.live["koi-palettes"][0]).toEqual({...authored["koi-palettes"][0], base: 0x123456});
    expect(store.live["koi-palettes"][5]).toEqual(authored["koi-palettes"][5]);
    expect(store.live["koi-patterns"]).toEqual(patches);
    save(store);
    const next = new SettingsStore(); loadInto(next);
    expect(next.live).toEqual(store.live);
  });

  it("uses final collection lengths for restored references, including grown leaf slots", () => {
    const store = new SettingsStore();
    store.set(["lotus", "visibleLeafCount"], 32);
    store.set(["lotus", "visibleFlowerCount"], 16);
    store.set(["lotus-flowers", 0, "leafIndex"], 31);
    store.set(["tiny-fish", "visibleSchoolCount"], 12);
    store.set(["tiny-fish-schools", 11, "x"], 245);
    const payload = Object.fromEntries(Object.entries(store.exportOverrides()).reverse());
    const next = new SettingsStore();
    next.importOverrides(payload, "sunny", false);
    expect(next.live["lotus-flowers"][0].leafIndex).toBe(31);
    expect(next.live["tiny-fish-schools"][11].x).toBe(245);
    expect(next.live).toEqual(store.live);
    save(next);
    const reloaded = new SettingsStore(); loadInto(reloaded);
    expect(reloaded.live).toEqual(store.live);
  });

  it("rejects sparse or unsafe numeric paths and bounds collection payloads", () => {
    const store = new SettingsStore();
    store.importOverrides({"koi-palettes.6.base": 0x123456, "koi-palettes.9007199254740992.base": 0x123456,
      "tiny-fish-schools.4294967295.x": 0, "tiny-fish-schools.-1.x": 0,
      "tiny-fish-schools": Array.from({length: 40}, () => ({x: 200, count: 1000}))}, "sunny", false);
    expect(store.live["koi-palettes"]).toHaveLength(6);
    expect(store.live["tiny-fish-schools"]).toHaveLength(32);
    expect(store.live["tiny-fish-schools"].every(school => school.count === 80)).toBe(true);
    expect(Object.keys(store.exportOverrides()).some(key => /9007199254740992|4294967295|\.6\.|\.-1\./.test(key))).toBe(false);
    expect(nodeAt(definition, ["koi-palettes", -1])).toBeUndefined();
    expect(nodeAt(definition, ["koi-palettes", Infinity])).toBeUndefined();
  });

  it.each([[NaN, 40], [27, Infinity], [-Infinity, 40]])("rejects non-finite range values: %j", (a, b) => {
    const node = nodeAt(definition, ["koi", "regularLength"])!;
    expect(validate(node, [a, b], definition)).toBeUndefined();
    const store = new SettingsStore();
    store.set(["koi", "regularLength"], [a, b]);
    expect(store.live.koi.regularLength).toEqual([27, 40]);
    expect(store.meta().canUndo).toBe(false);
  });
});
