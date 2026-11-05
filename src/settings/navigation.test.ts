import { describe, expect, it } from "vitest";
import { ADVANCED_GROUPS } from "./advanced";
import { pageDepth, pageGroup, parentPage, type PreferencePage } from "./navigation";

describe("settings navigation hierarchy", () => {
  it("climbs one level at a time back to the root", () => {
    for (const {id} of ADVANCED_GROUPS) {
      const page: PreferencePage = `advanced/${id}`;
      expect(pageDepth(page)).toBe(2);
      expect(pageGroup(page)).toBe(id);
      expect(parentPage(page)).toBe("advanced");
    }
    expect(pageDepth("advanced")).toBe(1);
    expect(parentPage("advanced")).toBe("root");
    expect(pageDepth("root")).toBe(0);
    expect(parentPage("root")).toBe("root");
    expect(pageGroup("advanced")).toBeNull();
    expect(pageGroup("root")).toBeNull();
  });

  it("keeps fish on one page per size class, so the list stays short", () => {
    expect(ADVANCED_GROUPS.map(group => group.id)).toEqual(["koi", "large-fish", "medium-fish", "small-fish", "plants", "water", "appearance"]);
  });

  it("reaches the fish list from the root, and returns to it", () => {
    expect(pageDepth("fish")).toBe(1);
    expect(parentPage("fish")).toBe("root");
    expect(pageGroup("fish")).toBeNull();
  });
});
