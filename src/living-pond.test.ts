import { afterEach, describe, expect, it } from "vitest";
import { FISH, setCanvasSize } from "./config";
import { School } from "./school";
import { RippleSystem } from "./ripple-system";
import { wrapAngle } from "./math";
import { SwimState } from "./koi";

afterEach(() => setCanvasSize(480, 270));
const step = (school: School, seconds: number, start = 0) => {
  for (let i = 1; i <= seconds * 60; i++) school.update(1 / 60, start + i / 60);
};

describe("living pond continuity", () => {
  it("coasts forward under drag while the tail relaxes, then resumes propulsion", () => {
    const school = new School(); school.setCount(1);
    const f = school.fish[0];
    f.position = {x:200,y:135}; f.heading = 0; f.angularVelocity = 0;
    f.state = SwimState.Coast; f.stateAge = 0; f.stateDuration = 2;
    f.speed = f.cruiseSpeed; f.tailEffort = 1;
    let distance = 0;
    for (let i = 0; i < 60; i++) {
      const {x,y} = f.position, speed = f.speed;
      school.update(1/60,i/60);
      distance += Math.hypot(f.position.x-x,f.position.y-y);
      expect(f.speed).toBeLessThan(speed);
      expect(f.speed).toBeGreaterThan(f.cruiseSpeed * 0.48);
    }
    expect(distance).toBeGreaterThan(f.cruiseSpeed * 0.7);
    expect(f.tailEffort).toBeLessThan(0.04);
    step(school,1.5,1);
    expect(f.state).not.toBe(SwimState.Coast);
    expect(f.speed).toBeGreaterThan(f.cruiseSpeed * 0.48);
  });
  it("does not mechanically freeze during five minutes of unprompted swimming", () => {
    const school = new School(); let resting = 0, samples = 0;
    for(let i=0;i<18000;i++) {
      school.update(1/60,i/60);
      for(const f of school.fish.slice(0,school.count)) {
        samples++; if(f.state === SwimState.Hover) resting++;
        if(f.speed < 1) throw new Error(`Mechanical stop at ${i/60}s: ${f.speed}`);
      }
    }
    expect(resting/samples).toBeLessThan(0.025);
  });
  it("resting retains drift and independent fin motion", () => {
    const school = new School(); school.setCount(1);
    const f=school.fish[0]; f.state=SwimState.Hover; f.stateAge=0; f.stateDuration=4;
    const position={...f.position}, phase=f.finPhase;
    step(school,3);
    expect(Math.hypot(f.position.x-position.x,f.position.y-position.y)).toBeGreaterThan(3);
    expect(f.finPhase-phase).toBeGreaterThan(9);
    expect(f.speed).toBeGreaterThan(1);
  });
  it("medaka coordinate speed without locking tail phase and flee without an impulse jump", () => {
    const school=new School(); const fish=school.tinyFish.fish;
    const states=new Set<string>();
    for(let i=0;i<1200;i++) {
      const before=fish[0].tailPhase;
      school.tinyFish.update(1/60,i/60);
      expect(fish[0].tailPhase).toBeGreaterThan(before);
      states.add(fish[0].swimState);
    }
    expect(states.size).toBe(3);
    expect(new Set(fish.slice(0,24).map(f=>Math.round(f.tailPhase*10))).size).toBeGreaterThan(12);
    school.tinyFish.fleeFrom({...fish[0].position});
    const velocity={...fish[0].velocity};
    school.tinyFish.update(1/60,20);
    expect(Math.hypot(fish[0].velocity.x-velocity.x,fish[0].velocity.y-velocity.y)).toBeLessThan(5);
  });
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
