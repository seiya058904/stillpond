import { afterEach, describe, expect, it } from "vitest";
import { FISH, setCanvasSize } from "./config";
import { School } from "./school";
import { RippleSystem } from "./ripple-system";
import { wrapAngle } from "./math";

afterEach(() => setCanvasSize(480, 270));
const step = (school: School, seconds: number, start = 0) => {
  for (let i = 1; i <= seconds * 60; i++) school.update(1 / 60, start + i / 60);
};

describe("living pond continuity", () => {
  it("scatter asks for a turn without teleporting the head, speed or body", () => {
    const school = new School();
    const before = school.fish.slice(0, school.count).map(f => ({heading:f.heading,speed:f.speed,position:{...f.position},spine:structuredClone(f.spine)}));
    school.scatter();
    before.forEach((f,i) => {
      expect(school.fish[i].heading).toBe(f.heading);
      expect(school.fish[i].speed).toBe(f.speed);
      expect(school.fish[i].position).toEqual(f.position);
      expect(school.fish[i].spine).toEqual(f.spine);
    });
    step(school, 0.5);
    expect(school.fish.slice(0, school.count).some((f,i) => Math.abs(wrapAngle(f.heading-before[i].heading)) > .05)).toBe(true);
  });
  it("retains individual call latency and lets attention fade instead of snapping off", () => {
    const school = new School();
    school.callTo({x:240,y:135});
    const delays = school.fish.slice(0,school.count).map(f=>f.callDelay);
    expect(Math.max(...delays)-Math.min(...delays)).toBeGreaterThan(.1);
    step(school, 2);
    expect(school.fish.slice(0,school.count).some(f=>f.callInfluence>.5)).toBe(true);
    const duration=FISH.callResponse.targetLifetimeSeconds;
    step(school, duration-2, 2);
    const interest=school.fish.slice(0,school.count).map(f=>f.callInfluence);
    expect(Math.max(...interest)-Math.min(...interest)).toBeGreaterThan(.05);
    const prior=school.fish[0].callInfluence;
    school.update(1/60,duration+1/60);
    expect(Math.abs(school.fish[0].callInfluence-prior)).toBeLessThan(.055);
    step(school, 6, duration);
    expect(school.fish.slice(0,school.count).every(f=>f.callInfluence<.001)).toBe(true);
  });
  it.each([[480,270],[640,270],[270,584]])("stays finite and turns continuously over two minutes at %s × %s", (width,height) => {
    setCanvasSize(width,height);
    const school=new School(); school.setCount(48);
    for(let i=0;i<7200;i++) {
      if(i%900===0)school.callTo({x:width*.37,y:height*.42});
      if(i%1800===1500)school.scatter();
      const headings=school.fish.map(f=>f.heading);
      school.update(1/60,i/60);
      for(let j=0;j<school.count;j++) {
        const f=school.fish[j];
        if(!Number.isFinite(f.position.x+f.position.y+f.speed+f.depth)) throw new Error("Nonfinite simulation");
        if(Math.abs(wrapAngle(f.heading-headings[j]))>2.901/60) throw new Error("Discontinuous heading");
        if(f.position.x < -f.bodyLength || f.position.x>width+f.bodyLength || f.position.y < -f.bodyLength || f.position.y>height+f.bodyLength) throw new Error("Fish escaped pond");
      }
    }
  });
  it("ramps rain in and drains existing ripples when rain stops", () => {
    const ripples=new RippleSystem();
    ripples.setRainIntensity(1);
    ripples.update(1/60);
    expect(ripples.instances.filter(r=>r.alive).length).toBeLessThan(4);
    for(let i=0;i<240;i++)ripples.update(1/60);
    expect(ripples.instances.some(r=>r.alive)).toBe(true);
    ripples.setRainIntensity(0);
    expect(ripples.instances.some(r=>r.alive)).toBe(true);
    for(let i=0;i<1800;i++)ripples.update(1/60);
    expect(ripples.instances.some(r=>r.alive)).toBe(false);
  });
});
