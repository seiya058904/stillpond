import { afterEach, describe, expect, it, vi } from "vitest";
import { definition, SETTINGS_GROUPS, SECTION_IDS } from "../settings/definition";
import type { AnyNode } from "../settings/schema";
import { messages } from "./catalog";
import { fieldLabels } from "./fields";
import { createTranslator, LANGUAGE_STORAGE_KEY, readLanguage, setLanguage } from ".";

afterEach(() => vi.unstubAllGlobals());

describe("complete bilingual UI", () => {
  it("covers every schema field, choice, section, group, and help text", () => {
    const visit = (node: AnyNode) => {
      if (node.description) expect(node.description in messages).toBe(true);
      if (node.kind === "choice") node.options.forEach((option) => expect(option.label in messages).toBe(true));
      if (node.kind === "group") {
        Object.entries(node.children).forEach(([key, child]) => {
          expect(key in fieldLabels, key).toBe(true);
          visit(child as AnyNode);
        });
      } else if (node.kind === "list" || node.kind === "collection") visit(node.item);
    };
    Object.values(definition.children).forEach(visit);
    for (const id of SECTION_IDS) {
      expect(`section.${id}` in messages).toBe(true);
      expect(`section.${id}.description` in messages).toBe(true);
    }
    for (const group of SETTINGS_GROUPS) expect(`group.${group.id}` in messages).toBe(true);
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
