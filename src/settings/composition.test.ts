import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FAMILIES, familyCounts, legacyFamilies, MAX_KOI, reconcileFamilies, resizeFamilies, validFamilies } from "./composition";
import { SettingsStore } from "./store";
import { loadInto, save } from "./persistence";
import { ADVANCED_GROUPS, controlNode, familyColorControls } from "./advanced";
import { definition } from "./definition";
import { School } from "../school";
import { settings } from "./store";
import { RippleSystem } from "../ripple-system";

afterEach(() => vi.unstubAllGlobals());
function memoryStorage() {
  const data = new Map<string,string>();
  vi.stubGlobal("localStorage", {getItem:(key:string) => data.get(key) ?? null,
    setItem:(key:string,value:string) => data.set(key,value), removeItem:(key:string) => data.delete(key)});
}

describe("stable koi composition", () => {
  it("starts with the exact original fourteen fish", () => {
    const store = new SettingsStore();
    expect(store.live.koi.families).toEqual(DEFAULT_FAMILIES);
    expect(familyCounts(store.live.koi.families)).toEqual([3,3,2,2,2,2]);
  });
  it("supports zero for every family, including an empty pond", () => {
    const store = new SettingsStore();
    for (let family=0;family<6;family++) store.setFamilyCount(family,0);
    expect(store.live.koi.families).toEqual([]);
    expect(store.live.koi.initialCount).toBe(0);
    store.setFamilyCount(5,4);
    expect(store.live.koi.families).toEqual([5,5,5,5]);
  });
  it("adds to the chosen family without recoloring any existing slot", () => {
    const store = new SettingsStore();
    store.setFamilyCount(4,5);
    expect(store.live.koi.families.slice(0,14)).toEqual(DEFAULT_FAMILIES);
    expect(store.live.koi.families.slice(14)).toEqual([4,4,4]);
    expect(store.live.koi.initialCount).toBe(17);
  });
  it("minimizes reassignment when reducing a family or the total", () => {
    const next = reconcileFamilies(DEFAULT_FAMILIES,[2,3,2,2,2,2]);
    expect(familyCounts(next)).toEqual([2,3,2,2,2,2]);
    expect(next.filter((family,slot) => family !== DEFAULT_FAMILIES[slot])).toHaveLength(1);
    expect(resizeFamilies(next,8)).toEqual(next.slice(0,8));
  });
  it("grows in proportion to the current mix and keeps absent families absent", () => {
    const previous = [0,0,0,3];
    const next = resizeFamilies(previous,40);
    expect(next.slice(0,previous.length)).toEqual(previous);
    expect(familyCounts(next)).toEqual([30,0,0,10,0,0]);
    expect(resizeFamilies(previous,40)).toEqual(next);
  });
  it("keeps count and assignment atomic through undo, redo, weather, and reset", () => {
    const store = new SettingsStore();
    const batches: number[][] = [];
    store.subscribe(() => batches.push([store.live.koi.initialCount,store.live.koi.families.length]));
    store.setFamilyCount(3,0);
    const changed = [...store.live.koi.families];
    store.undo(); expect(store.live.koi.families).toEqual(DEFAULT_FAMILIES);
    store.redo(); expect(store.live.koi.families).toEqual(changed);
    store.setWeather("moonlight"); expect(store.live.koi.families).toEqual(changed);
    store.resetSections(["koi"]); expect(store.live.koi.families).toEqual(DEFAULT_FAMILIES);
    store.undo(); expect(store.live.koi.families).toEqual(changed);
    store.resetAll(); expect(store.live.koi.families).toEqual(DEFAULT_FAMILIES);
    expect(batches.every(([count,length]) => count === length)).toBe(true);
  });
  it("caps the total at 48 and rejects malformed assignments", () => {
    const store = new SettingsStore();
    store.setFamilyCount(0,100);
    expect(store.live.koi.initialCount).toBe(MAX_KOI);
    store.setFamilyCount(1,100);
    expect(store.live.koi.initialCount).toBe(MAX_KOI);
    for (const invalid of [[6],[NaN],[1.5],Array(49).fill(0),null]) {
      expect(validFamilies(invalid)).toBe(false);
      store.set(["koi","families"],invalid);
      expect(store.live.koi.initialCount).toBe(MAX_KOI);
    }
  });
  it("persists the exact ordered assignment and migrates old v2 counts", () => {
    memoryStorage();
    const store = new SettingsStore(); store.setFamilyCount(1,0); store.setFamilyCount(4,7);
    save(store);
    const restored = new SettingsStore(); loadInto(restored);
    expect(restored.live.koi.families).toEqual(store.live.koi.families);
    for (const count of [1,14,40,48]) {
      localStorage.setItem("stillpond:pond-settings:v2",JSON.stringify({version:2,weather:"mist",rain:true,
        overrides:{"koi.initialCount":count,"koi-palettes.2.base":0x112233,"koi.depth.visualStart":0.2}}));
      const old = new SettingsStore(); loadInto(old);
      expect(old.live.koi.families).toEqual(legacyFamilies(count));
      expect(old.live["koi-palettes"][2].base).toBe(0x112233);
      expect(old.live.koi.depth.visualStart).toBe(0.2);
      expect(old.meta()).toMatchObject({weather:"mist",rain:true});
    }
  });
  it("repairs a conflicting total and corrupt family array without losing other preferences", () => {
    const store = new SettingsStore();
    store.importOverrides({"koi.initialCount":40,"koi.families":[3,3,5],"lotus.visibleLeafCount":9},"sunny",false);
    expect(store.live.koi.initialCount).toBe(3);
    expect(store.live.lotus.visibleLeafCount).toBe(9);
    store.importOverrides({koi:{initialCount:8,families:"invalid"}},"sunny",false);
    expect(store.live.koi.families).toEqual(legacyFamilies(8));
    store.setWeather("rain");
    expect(store.live.koi.families).toEqual(legacyFamilies(8));
  });
  it("allows an empty school to simulate, call, and scatter safely", () => {
    const school = new School(); school.setCount(0);
    expect(() => {school.update(1/60,1);school.callTo({x:120,y:90});school.scatter();}).not.toThrow();
    expect(school.count).toBe(0);
  });
  it("applies ripple strength to existing ripples immediately", () => {
    const ripples = new RippleSystem(); ripples.trigger("touch",{x:80,y:80});
    const initial = ripples.instances.find(ripple => ripple.alive)!.strength;
    settings.set(["ripples","strength"],0.5);
    expect(ripples.instances.find(ripple => ripple.alive)!.strength).toBe(initial*0.5);
    settings.resetAll();
  });
});

const controls = [...ADVANCED_GROUPS.flatMap(group => [...group.controls]),
  ...definition.children["koi-patterns"].defaults.flatMap((patches,index) => familyColorControls(index,patches))];
describe("every retained Advanced value", () => {
  it.each(controls)("$id saves, reloads, undoes, and resets", control => {
    memoryStorage();
    const store = new SettingsStore();
    const before = structuredClone(store.get(control.path));
    const node = controlNode(control);
    const next = node.kind === "num" ? Math.min(node.max,(before as number)+node.step*2) : node.kind === "range"
      ? [(before as number[])[0]+node.step,(before as number[])[1]+node.step] : node.kind === "bool" ? !before
      : node.kind === "color" ? 0x42a88f : [0.1,0.2,0.3];
    store.set(control.path,next);
    expect(store.get(control.path)).toEqual(next);
    save(store);
    const restored = new SettingsStore(); loadInto(restored);
    expect(restored.get(control.path)).toEqual(next);
    store.undo(); expect(store.get(control.path)).toEqual(before);
    store.redo(); expect(store.get(control.path)).toEqual(next);
    store.resetSections([control.path[0] as keyof typeof store.live]);
    expect(store.get(control.path)).toEqual(before);
    store.undo(); expect(store.get(control.path)).toEqual(next);
  });
  it("exposes only 40 meaningful settings across all six families", () => {
    expect(controls.length+6).toBe(40);
    expect(controls.some(control => /visualStart|offset|phase|sharpness/i.test(control.path.join('.')))).toBe(false);
  });
});
