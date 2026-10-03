import { describe, expect, it } from "vitest";
import { pondPoint, pondSize } from "./viewport";
import { setCanvasSize } from "./config";
import { School } from "./school";

describe("full viewport projection", () => {
  it.each([[3840, 2160], [2560, 1440], [1920, 1080], [2560, 1080], [390, 844], [844, 390], [1024, 768], [320, 568]])(
    "%i × %i preserves the same scale in both axes and maps input to the world",
    (width, height) => {
      const world = pondSize(width, height);
      expect(world.width / world.height).toBeCloseTo(width / height, 10);
      expect(Math.min(world.width, world.height)).toBeCloseTo(270);
      const bounds = { left: 17, top: 29, width, height };
      expect(pondPoint(17 + width / 2, 29 + height / 2, bounds, world)).toEqual({ x: world.width / 2, y: world.height / 2 });
      expect(pondPoint(17 + width, 29 + height, bounds, world)).toEqual({ x: world.width, y: world.height });
      expect(pondPoint(-10, -10, bounds, world)).toEqual({ x: 0, y: 0 });
    },
  );

  it("repositions fish during rotation without stretching their spines", () => {
    setCanvasSize(480, 270);
    const school = new School();
    const fish = school.fish[0];
    const lengths = fish.spine.slice(1).map((point, i) => Math.hypot(point.x - fish.spine[i].x, point.y - fish.spine[i].y));
    const portrait = pondSize(390, 844);
    setCanvasSize(portrait.width, portrait.height);
    school.resize(portrait.width / 480, portrait.height / 270);
    fish.spine.slice(1).forEach((point, i) => {
      expect(Math.hypot(point.x - fish.spine[i].x, point.y - fish.spine[i].y)).toBeCloseTo(lengths[i], 10);
    });
    setCanvasSize(480, 270);
  });

  it("survives a temporarily unmeasurable display", () => {
    expect(pondSize(0, 0)).toEqual({ width: 480, height: 270 });
    expect(pondSize(Infinity, 100)).toEqual({ width: 480, height: 270 });
  });
});
