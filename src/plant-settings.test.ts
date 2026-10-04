import * as THREE from "three";
import { afterEach, describe, expect, it } from "vitest";
import { flowerLeafIndex, LOTUS_FLOWERS } from "./config";
import { LotusLeavesPass } from "./lotus-leaves";
import { settings } from "./settings/store";

afterEach(() => settings.resetAll());
describe("flower amount with fewer leaves", () => {
  it("keeps the original attachments for the unchanged pond", () => {
    expect(LOTUS_FLOWERS.map((_,index) => flowerLeafIndex(index))).toEqual(LOTUS_FLOWERS.map(flower => flower.leafIndex));
  });
  it("actually renders the requested flowers on the remaining visible leaf", () => {
    settings.set(["lotus","visibleLeafCount"],1);
    const lotus = new LotusLeavesPass();
    lotus.update(1);
    const flowers = () => lotus.group.children.filter(child => child instanceof THREE.Mesh && child.geometry.name.startsWith("lotus flower"));
    expect(flowers().filter(flower => flower.visible)).toHaveLength(4);
    expect(LOTUS_FLOWERS.map((_,index) => flowerLeafIndex(index))).toEqual([0,0,0,0]);
    settings.set(["lotus","visibleLeafCount"],0);
    lotus.update(2);
    expect(flowers().filter(flower => flower.visible)).toHaveLength(0);
    settings.resetAll(); lotus.update(3);
    expect(flowers().filter(flower => flower.visible)).toHaveLength(4);
    lotus.group.traverse(child => {if(child instanceof THREE.Mesh) child.geometry.dispose();});
  });
});
