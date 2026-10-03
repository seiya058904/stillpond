import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { LOTUS, LOTUS_LEAVES } from "./config";
import { LotusLeavesPass } from "./lotus-leaves";
import { WeatherPass } from "./weather-pass";

describe("natural pond surface", () => {
  it("covers a complete peltate leaf and reuses its geometry while rocking", () => {
    const pass = new LotusLeavesPass();
    const mesh = (pass.group.children[0] as THREE.Group).children[0] as THREE.Mesh<THREE.BufferGeometry>;
    const positions = mesh.geometry.getAttribute("position");
    const radius = LOTUS_LEAVES[0].radius * LOTUS.radiusScale * 0.5;
    const area = (ax:number, ay:number, bx:number, by:number, cx:number, cy:number) => (bx-ax)*(cy-ay)-(by-ay)*(cx-ax);
    for(let sample=0;sample<72;sample++) {
      const angle=sample/72*Math.PI*2, x=Math.cos(angle)*radius, y=Math.sin(angle)*radius*LOTUS.verticalScale;
      let covered=false;
      for(let i=0;i<positions.count;i+=3) {
        const a=area(positions.getX(i),positions.getY(i),positions.getX(i+1),positions.getY(i+1),x,y);
        const b=area(positions.getX(i+1),positions.getY(i+1),positions.getX(i+2),positions.getY(i+2),x,y);
        const c=area(positions.getX(i+2),positions.getY(i+2),positions.getX(i),positions.getY(i),x,y);
        if((a>=-0.001&&b>=-0.001&&c>=-0.001)||(a<=0.001&&b<=0.001&&c<=0.001))covered=true;
      }
      expect(covered).toBe(true);
    }
    const geometry=mesh.geometry;
    for(let i=0;i<600;i++)pass.update(i/60);
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.geometry.getAttribute("position")).toBe(positions);
  });
  it("blends physical surface weather without jumping on a preset change", () => {
    const texture=new THREE.Texture(), pass=new WeatherPass(texture);
    pass.update(0);
    const calm=pass.surface.wind;
    pass.setPreset("rain");
    expect(pass.surface.wind).toBe(calm);
    pass.update(1/60);
    expect(pass.surface.wind).toBeGreaterThan(calm);
    expect(pass.surface.wind-calm).toBeLessThan(0.05);
    for(let i=2;i<=180;i++)pass.update(i/60);
    expect(pass.surface.wind).toBeGreaterThan(0.8);
    pass.setPreset("mist");
    for(let i=181;i<=360;i++)pass.update(i/60);
    expect(pass.surface.mist).toBeGreaterThan(0.15);
    expect(pass.surface.wind).toBeLessThan(0.1);
    pass.dispose(); texture.dispose();
  });
});
