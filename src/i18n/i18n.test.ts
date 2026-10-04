import { afterEach, describe, expect, it, vi } from "vitest";
import { definition } from "../settings/definition";
import { ADVANCED_GROUPS, controlNode, familyColorControls } from "../settings/advanced";
import { messages } from "./catalog";
import { fieldLabels } from "./fields";
import { createTranslator, LANGUAGE_STORAGE_KEY, readLanguage, setLanguage } from ".";

afterEach(() => vi.unstubAllGlobals());

describe("complete bilingual UI", () => {
  it("covers every product control and group without exposing runtime tuning labels", () => {
    const controls = [...ADVANCED_GROUPS.flatMap(group => [...group.controls]),
      ...definition.children["koi-patterns"].defaults.flatMap((patches,index) => familyColorControls(index,patches))];
    for (const control of controls) {
      expect(control.label in fieldLabels, control.id).toBe(true);
      expect(controlNode(control)).toBeDefined();
    }
    for (const group of ADVANCED_GROUPS) {
      expect(`section.${group.id}` in messages).toBe(true);
      expect(`group.${group.id}` in messages).toBe(true);
    }
    expect("visualStart" in fieldLabels).toBe(false);
    expect("mouthForwardOffset" in fieldLabels).toBe(false);
    for (const [key, [en, zh]] of Object.entries({ ...messages, ...fieldLabels })) {
      expect(en.length, key).toBeGreaterThan(0);
      expect(zh, key).toMatch(/[\u3400-\u9fff]/);
      expect([...en.matchAll(/\{\w+\}/g)].map(m => m[0]).sort(), key)
        .toEqual([...zh.matchAll(/\{\w+\}/g)].map(m => m[0]).sort());
    }
  });

  it("defaults to English even on a Chinese browser and validates stored values", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("navigator", { language: "zh-CN" });
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key), setItem: (key: string, value: string) => data.set(key, value) });
    expect(readLanguage()).toBe("en");
    setLanguage("zh-CN");
    expect(readLanguage()).toBe("zh-CN");
    setLanguage("unsupported");
    expect(readLanguage()).toBe("zh-CN");
    data.set(LANGUAGE_STORAGE_KEY, "corrupted");
    expect(readLanguage()).toBe("en");
    expect(createTranslator("zh-CN").t("pond.preview", { family: "红白" })).toBe("红白预览");
  });

  it("continues to work when browser storage is blocked", () => {
    vi.stubGlobal("localStorage", { getItem() { throw Error("blocked"); }, setItem() { throw Error("blocked"); } });
    expect(readLanguage()).toBe("en");
    expect(() => setLanguage("zh-CN")).not.toThrow();
    expect(() => setLanguage("en")).not.toThrow();
  });
});
