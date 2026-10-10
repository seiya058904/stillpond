import { afterEach, describe, expect, it } from "vitest";
import { setCanvasSize } from "./config";
import { settings } from "./settings/store";
import { TinyFishSchools } from "./tiny-fish";

afterEach(() => { settings.resetAll(); setCanvasSize(480, 270); });

function expectFinite(schools: TinyFishSchools) {
  for (const fish of schools.fish) {
    for (const value of [fish.position.x, fish.position.y, fish.velocity.x, fish.velocity.y, fish.tailPhase]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  }
}

describe("Medaka boundary numerics", () => {
  it.each([0, 4.8])("keeps offscreen fish finite with zero margin and edge strength %s", strength => {
    settings.set(["tiny-fish", "visibleSchoolCount"], 1);
    settings.set(["tiny-fish", "edgeMargin"], 0);
    settings.set(["tiny-fish", "edgeStrength"], strength);
    settings.set(["tiny-fish-schools", 0, "x"], -80);
    settings.set(["tiny-fish-schools", 0, "y"], -80);
    const schools = new TinyFishSchools();
    for (let step = 1; step <= 120; step++) schools.update(1 / 60, step / 60);
    expectFinite(schools);
  });

  it("keeps a zero-margin saved pond finite after ordinary motion crosses its bounds", () => {
    settings.set(["tiny-fish", "visibleSchoolCount"], 1);
    settings.set(["tiny-fish", "edgeMargin"], 0);
    const schools = new TinyFishSchools();
    for (let step = 1; step <= 1800; step++) schools.update(1 / 60, step / 60);
    expectFinite(schools);
  });
});
