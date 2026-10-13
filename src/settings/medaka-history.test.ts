import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsStore } from "./store";
import { __internal, connectPersistence, loadInto, save } from "./persistence";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const counts = (store: SettingsStore) => [store.live["tiny-fish"].visibleSchoolCount, store.live["tiny-fish"].lastEnabledSchoolCount];

describe("Medaka quantity transactions", () => {
  it("notifies and saves one consistent transaction, and groups a continuous drag", () => {
    vi.useFakeTimers();
    const store = new SettingsStore(), observed: number[][] = [];
    const persisted = vi.fn(); store.onPersistRequested(persisted);
    store.subscribe(() => observed.push(counts(store)));
    store.set(["tiny-fish", "visibleSchoolCount"], 4, {interaction: "drag"});
    store.set(["tiny-fish", "visibleSchoolCount"], 5, {interaction: "drag"});
    expect(observed).toEqual([[4, 4], [5, 5]]);
    vi.advanceTimersByTime(600); expect(persisted).toHaveBeenCalledTimes(1);
    store.undo(); expect(counts(store)).toEqual([3, 3]);
    store.redo(); expect(counts(store)).toEqual([5, 5]);
    store.setMedakaEnabled(false); expect(counts(store)).toEqual([0, 5]);
    store.setMedakaEnabled(true); expect(counts(store)).toEqual([5, 5]);
    store.undo(); expect(counts(store)).toEqual([0, 5]);
    store.undo(); expect(counts(store)).toEqual([5, 5]);
    store.redo(); expect(counts(store)).toEqual([0, 5]);
  });

  it.each(["group", "pond"])("resets both fields and can undo the %s reset", scope => {
    const store = new SettingsStore(); store.set(["tiny-fish", "visibleSchoolCount"], 32); store.setMedakaEnabled(false);
    if (scope === "group") store.resetSections(["tiny-fish", "tiny-fish-schools"]); else store.resetAll();
    expect(counts(store)).toEqual([3, 3]); store.undo(); expect(counts(store)).toEqual([0, 32]);
  });

  for (const version of [1, 2]) for (const count of [0, 5, 32]) {
    it.each([undefined, 7, 0, 99, 1.5, "5"])(`loads v${version} count ${count}, history %s without losing legacy quantities`, history => {
      const data = new Map<string, string>();
      vi.stubGlobal("localStorage", {getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key)});
      const section = {visibleSchoolCount: count, ...(history === undefined ? {} : {lastEnabledSchoolCount: history})};
      data.set(version === 1 ? __internal.STORAGE_KEY_V1 : __internal.STORAGE_KEY_V2, JSON.stringify({
        version, weather: "mist", rain: true,
        ...(version === 1 ? {config: {"tiny-fish": section}} : {overrides: {"tiny-fish": section}}),
      }));
      const store = new SettingsStore(); loadInto(store);
      const expected = count || (history === 7 ? 7 : 3);
      expect(counts(store)).toEqual([count, expected]);
      store.setMedakaEnabled(false); expect(save(store)).toBe(true);
      const reloaded = new SettingsStore(); loadInto(reloaded); reloaded.setMedakaEnabled(true);
      expect(counts(reloaded)).toEqual([expected, expected]);
      expect(reloaded.meta()).toMatchObject({weather: "mist", rain: true});
    });
  }

  it("keeps remembered quantities usable when storage is denied", () => {
    vi.stubGlobal("localStorage", undefined);
    Object.defineProperty(globalThis, "localStorage", {configurable: true, get() {throw new DOMException("denied", "SecurityError");}});
    const store = new SettingsStore(), disconnect = connectPersistence(store);
    store.set(["tiny-fish", "visibleSchoolCount"], 32); store.setMedakaEnabled(false); store.setMedakaEnabled(true);
    expect(() => store.flushPersist()).not.toThrow(); expect(counts(store)).toEqual([32, 32]); disconnect();
  });
});
