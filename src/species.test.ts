import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { setCanvasSize, TINY_FISH, TINY_FISH_SCHOOLS } from "./config";
import { buildRenderSpine, LONG_TAIL, LONG_TAIL_ANCHOR, longTailFlex, longTailOpening, membranePoint } from "./fish-spine";
import { FISH_GLYPHS } from "./fish-glyphs";
import { FISH_ROSTER, speciesInPond } from "./fish-settings";
import { Koi } from "./koi";
import { School } from "./school";
import { nodeAt } from "./settings/schema";
import { definition } from "./settings/definition";
import { __internal, loadInto, save } from "./settings/persistence";
import { LARGE_SPECIES, MAX_SMALL_SHOALS, MAX_SPINE_SPECIES_FISH, MEDIUM_SPECIES, SMALL_SPECIES, SPINE_SPECIES, speciesLimit, type SpeciesId } from "./settings/species";
import { settings, SettingsStore } from "./settings/store";
import { MEDAKA_SHOALS, smallSpeciesConfig } from "./species";
import { SMALL_SPECIES_PALETTES, SPECIES_ART } from "./species-art";
import { compiledSpecies, membraneStrips, speciesCoat, SpeciesRenderer, type SpeciesBody, type SpeciesFlock } from "./species-renderer";
import { SurfaceDisturbancePass } from "./surface-disturbance";
import { TinyFishSchools } from "./tiny-fish";
import { TinyFishRenderer } from "./tiny-fish-renderer";

afterEach(() => { settings.resetAll(); setCanvasSize(480, 270); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const ALL_SPECIES: readonly SpeciesId[] = [...SPINE_SPECIES, ...SMALL_SPECIES];
const population = (school: School, id: (typeof SPINE_SPECIES)[number]) => school.species.populations.find(entry => entry.id === id)!;
function memoryStorage() {
  const data = new Map<string, string>();
  vi.stubGlobal("localStorage", {getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key)});
}
/** The same call, second call and scatter every motion test runs through. */
function scenario(school: School, frame: number): void {
  if (frame === 60) school.callTo({x: 460, y: 25});
  if (frame === 180) school.callTo({x: 20, y: 245});
  if (frame === 280) school.scatter();
  school.update(1 / 60, frame / 60);
}
function disposeRenderer(renderer: SpeciesRenderer): void {
  for (const group of [renderer.group, renderer.shadowGroup]) group.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) (mesh.material as THREE.Material).dispose();
  });
}

describe("who is in the default pond", () => {
  it("has no Shubunkin and none of the added species, and keeps everything else", () => {
    const store = new SettingsStore();
    expect(store.live.shubunkin).toEqual({count: 0, size: 1});
    for (const id of ALL_SPECIES) expect(store.live[id], id).toEqual({count: 0, size: 1});
    expect(store.live.koi.initialCount).toBe(14);
    expect(store.live.goldfish.count).toBe(3);
    expect(store.live["butterfly-koi"].count).toBe(2);
    expect(store.live["tiny-fish"].visibleSchoolCount).toBe(3);
    const school = new School();
    expect(school.species.active()).toEqual([]);
    expect(school.smallSpecies.every(shoals => shoals.visibleFish === 0)).toBe(true);
  });

  it("consumes no shared randomness and moves nothing already in the pond when fish are added", () => {
    const run = (added: number) => {
      for (const id of SPINE_SPECIES) settings.set([id, "count"], added);
      for (const id of SMALL_SPECIES) settings.set([id, "count"], Math.min(added, MAX_SMALL_SHOALS));
      const school = new School(); school.reset();
      const existing = [...school.fish, ...school.goldfish.fish, ...school.butterflyKoi.fish, ...school.shubunkin.fish];
      const placed = structuredClone(existing.map(fish => [fish.position, fish.heading, fish.behaviorRng]));
      const medaka = structuredClone(school.tinyFish.fish.map(fish => [fish.position, fish.velocity, fish.bodyLength]));
      school.callTo({x: 240, y: 135});
      return {placed, medaka, delays: school.fish.slice(0, school.count).map(fish => fish.callDelay)};
    };
    const without = run(0), withFish = run(4);
    expect(withFish.placed).toEqual(without.placed);
    expect(withFish.medaka).toEqual(without.medaka);
    expect(withFish.delays).toEqual(without.delays);
  });

  it("gives every agent its own behavior stream across all the slots", () => {
    for (const id of SPINE_SPECIES) settings.set([id, "count"], speciesLimit(id));
    const school = new School();
    const agents = [...school.fish, ...school.goldfish.fish, ...school.butterflyKoi.fish, ...school.shubunkin.fish, ...school.species.active()];
    expect(agents).toHaveLength(68 + MAX_SPINE_SPECIES_FISH);
    expect(new Set(agents.map(fish => fish.behaviorRng)).size).toBe(agents.length);
  });
});

describe("saved preferences", () => {
  it.each([0, 1, 2, 4, 6])("never rewrites a saved Shubunkin count of %i", count => {
    memoryStorage();
    localStorage.setItem(__internal.STORAGE_KEY_V2, JSON.stringify({version: 2, weather: "sunny", rain: false, overrides: {"shubunkin.count": count, "koi.initialCount": 9}}));
    const store = new SettingsStore(); loadInto(store);
    expect(store.live.shubunkin.count).toBe(count);
    expect(store.live.koi.initialCount).toBe(9);
    save(store);
    const again = new SettingsStore(); loadInto(again);
    expect(again.live.shubunkin.count).toBe(count);
  });

  it("gives an old save that never touched these fish the new default", () => {
    memoryStorage();
    localStorage.setItem(__internal.STORAGE_KEY_V2, JSON.stringify({version: 2, weather: "mist", rain: true, overrides: {"goldfish.count": 5, "shubunkin.size": 1.2}}));
    const store = new SettingsStore(); loadInto(store);
    expect(store.live.shubunkin).toEqual({count: 0, size: 1.2});
    expect(store.live.goldfish.count).toBe(5);
    for (const id of ALL_SPECIES) expect(store.live[id].count).toBe(0);
    expect(store.meta()).toMatchObject({weather: "mist", rain: true});
  });

  it("migrates a v1 save without inventing any of the new fish", () => {
    memoryStorage();
    localStorage.setItem(__internal.STORAGE_KEY_V1, JSON.stringify({version: 1, weather: "mist", rain: false, config: {koi: {initialCount: 17}}}));
    const store = new SettingsStore(); loadInto(store);
    expect(store.live.koi.initialCount).toBe(17);
    expect(store.live.shubunkin.count).toBe(0);
    for (const id of ALL_SPECIES) expect(store.live[id].count).toBe(0);
  });

  it.each(ALL_SPECIES)("saves, reloads, undoes and clamps %s", id => {
    memoryStorage();
    const store = new SettingsStore();
    const node = nodeAt(definition, [id, "count"]);
    const max = node?.kind === "num" ? node.max : 0;
    store.set([id, "count"], 2); store.set([id, "size"], 1.2);
    save(store);
    const restored = new SettingsStore(); loadInto(restored);
    expect(restored.live[id]).toEqual({count: 2, size: 1.2});
    store.undo(); expect(store.live[id].size).toBe(1);
    store.undo(); expect(store.live[id].count).toBe(0);
    store.set([id, "count"], 999);
    expect(store.live[id].count).toBe(max);
  });

  it("restores who is in the pond without touching sizes, colors or weather", () => {
    const store = new SettingsStore();
    store.set(["sterlet", "count"], 3); store.set(["sterlet", "size"], 1.25);
    store.set(["shubunkin", "count"], 4); store.set(["koi", "initialCount"], 30);
    store.set(["koi-palettes", 0, "base"], 0x112233); store.set(["tiny-fish", "visibleSchoolCount"], 7);
    store.setWeather("mist");
    store.resetOverrides(["sterlet.count", "shubunkin.count", "koi.initialCount", "koi.families", "tiny-fish.visibleSchoolCount", "tiny-fish.lastEnabledSchoolCount"]);
    expect(store.live.sterlet).toEqual({count: 0, size: 1.25});
    expect(store.live.shubunkin.count).toBe(0);
    expect(store.live.koi.initialCount).toBe(14);
    expect(store.live.koi.families).toHaveLength(14);
    expect(store.live["tiny-fish"].visibleSchoolCount).toBe(3);
    expect(store.live["koi-palettes"][0].base).toBe(0x112233);
    expect(store.meta().weather).toBe("mist");
    store.undo();
    expect(store.live.sterlet.count).toBe(3);
    expect(store.live.koi.initialCount).toBe(30);
    expect(store.live["tiny-fish"].visibleSchoolCount).toBe(7);
  });
});

describe("each species looks like itself", () => {
  const outline = (contour: readonly (readonly [number, number])[]) => contour.map(point => point.join()).join(";");
  const arts = SPINE_SPECIES.map(id => SPECIES_ART[id]);

  it("shares no body, tail, fin or palette with any other fish", () => {
    expect(new Set(arts.map(art => art.widths.join())).size).toBe(arts.length);
    const tails = arts.map(art => outline(art.tail.layers[0].left));
    expect(new Set([...tails, outline(LONG_TAIL)]).size).toBe(arts.length + 1);
    expect(new Set(arts.map(art => outline(art.fins[0].contour))).size).toBe(arts.length);
    expect(new Set(arts.map(art => art.palette.join())).size).toBe(arts.length);
  });

  it("only uses colors its palette defines, and gives patterned fish a coat per slot", () => {
    for (const id of SPINE_SPECIES) {
      const art = SPECIES_ART[id];
      for (let slot = 0; slot < 6; slot++) {
        const coat = speciesCoat(art, slot);
        expect(coat).toEqual(speciesCoat(art, slot));
        expect(Math.max(...coat), id).toBeLessThan(art.palette.length);
      }
    }
    for (const id of ["ranchu", "panda-butterfly", "orfe"] as const) {
      const coats = Array.from({length: 6}, (_, slot) => speciesCoat(SPECIES_ART[id], slot).join());
      expect(new Set(coats).size, id).toBeGreaterThan(1);
    }
  });

  it("portrays every fish in the list, with a real viewBox", () => {
    for (const section of FISH_ROSTER) for (const entry of section.entries) {
      const glyph = FISH_GLYPHS[entry.id];
      expect(glyph.paths.length, entry.id).toBeGreaterThan(2);
      expect(glyph.viewBox.split(" ").map(Number).every(Number.isFinite), entry.id).toBe(true);
      for (const path of glyph.paths) expect(path.d).not.toContain("NaN");
    }
  });
});

describe("large and medium species on the shared koi system", () => {
  it.each(SPINE_SPECIES)("%s moves exactly like an identical koi", id => {
    settings.set(["goldfish", "count"], 0); settings.set(["butterfly-koi", "count"], 0);
    const koiSchool = new School(), school = new School();
    koiSchool.setCount(1); school.setCount(0);
    const target = population(school, id);
    Object.defineProperty(target, "count", {get: () => 1});
    const koi = koiSchool.fish[0], fish = target.fish[0];
    Object.assign(fish, structuredClone(koi));
    expect(fish).toBeInstanceOf(Koi);
    for (let frame = 0; frame < 420; frame++) {
      scenario(koiSchool, frame); scenario(school, frame);
      buildRenderSpine(koi); buildRenderSpine(fish);
      for (const key of Object.keys(koi) as Array<keyof Koi>) expect(fish[key]).toEqual(koi[key]);
    }
  });

  it("paces each species through its own proportions, not its own rules", () => {
    const school = new School();
    const reference = new School().fish[0];
    expect(reference.cruiseSpeed).toBeGreaterThan(0);
    const ranchu = population(school, "ranchu").fish[0], orfe = population(school, "orfe").fish[0], sterlet = population(school, "sterlet").fish[0];
    expect(ranchu.cruiseSpeed).toBeLessThan(13); // Slower than any koi's slowest cruise.
    expect(orfe.cruiseSpeed).toBeGreaterThan(ranchu.cruiseSpeed);
    expect(sterlet.bodyLength).toBeGreaterThan(40);
    expect(sterlet.turnStrength).toBeLessThan(3.5); // A long body takes a wider circle.
    expect(Math.hypot(ranchu.velocity.x, ranchu.velocity.y)).toBeCloseTo(ranchu.speed);
  });

  it("answers a call, scatters, and stays in the pond at the maximum population", () => {
    settings.set(["koi", "initialCount"], 48); settings.set(["goldfish", "count"], 8);
    settings.set(["butterfly-koi", "count"], 6); settings.set(["shubunkin", "count"], 6);
    for (const id of SPINE_SPECIES) settings.set([id, "count"], speciesLimit(id));
    for (const id of SMALL_SPECIES) settings.set([id, "count"], MAX_SMALL_SHOALS);
    const school = new School(); school.setCount(48);
    const added = school.species.active();
    expect(added).toHaveLength(MAX_SPINE_SPECIES_FISH);
    const responded = new Set<Koi>();
    for (let frame = 0; frame < 900; frame++) {
      if (frame === 60) school.callTo({x: 240, y: 135});
      if (frame === 600) school.scatter();
      school.update(1 / 60, frame / 60);
      for (const fish of added) {
        if (fish.respondedToCall) responded.add(fish);
        expect(Number.isFinite(fish.position.x + fish.position.y + fish.speed + fish.turnBend)).toBe(true);
        expect(fish.position.x).toBeGreaterThan(-fish.bodyLength);
        expect(fish.position.x).toBeLessThan(480 + fish.bodyLength);
        expect(fish.position.y).toBeGreaterThan(-fish.bodyLength);
        expect(fish.position.y).toBeLessThan(270 + fish.bodyLength);
      }
    }
    expect(responded.size).toBe(added.length);
  }, 20_000);

  it("keeps identity and pose through size, zero count, resize and a deterministic reset", () => {
    settings.set(["paddlefish", "count"], 2);
    const school = new School(), target = population(school, "paddlefish"), fish = target.fish[0];
    const initial = structuredClone(target.fish); school.reset(); expect(target.fish).toEqual(initial);
    for (let i = 0; i < 60; i++) school.update(1 / 60, i / 60);
    const before = structuredClone(fish);
    settings.set(["paddlefish", "size"], 1.3); target.refreshConfig();
    expect(fish.position).toEqual(before.position); expect(fish.swimPhase).toBe(before.swimPhase);
    expect(fish.bodyLength).toBeCloseTo(before.bodyLength * 1.3);
    settings.set(["paddlefish", "count"], 0); const hidden = structuredClone(fish);
    school.update(1 / 60, 1); expect(fish).toEqual(hidden);
    target.resize(0.5, 2);
    for (const pose of ["spine", "renderSpine"] as const) fish[pose].forEach((node, i) => {
      expect(node.x - hidden[pose][i].x).toBeCloseTo(-hidden.position.x * 0.5);
      expect(node.y - hidden[pose][i].y).toBeCloseTo(hidden.position.y);
    });
    settings.set(["paddlefish", "count"], 4); expect(target.fish[0]).toBe(fish);
  });

  it("reserves one surface disturbance per fish and leaves added fish out of a koi preview", () => {
    settings.set(["koi", "initialCount"], 48); settings.set(["goldfish", "count"], 8); settings.set(["butterfly-koi", "count"], 6); settings.set(["shubunkin", "count"], 6);
    for (const id of SPINE_SPECIES) settings.set([id, "count"], speciesLimit(id));
    const school = new School(), pass = new SurfaceDisturbancePass();
    const draw = vi.fn();
    const gpu = {getClearColor: (out: THREE.Color) => out.set(0), getClearAlpha: () => 1,
      setRenderTarget: vi.fn(), setClearColor: vi.fn(), clear: vi.fn(), render: draw} as unknown as THREE.WebGLRenderer;
    pass.render(gpu, school, 0);
    const scene = draw.mock.calls[0][0] as THREE.Scene, geometry = (scene.children[0] as THREE.Mesh<THREE.InstancedBufferGeometry>).geometry;
    expect(geometry.instanceCount).toBe(68 + MAX_SPINE_SPECIES_FISH);
    expect(geometry.getAttribute("aCenter").count).toBe(68 + MAX_SPINE_SPECIES_FISH);
    expect(geometry.getAttribute("aCenter").getX(68)).toBeCloseTo(school.species.populations[0].fish[0].position.x, 4);
    pass.render(gpu, school, 0, 0); expect(geometry.instanceCount).toBe(1);
    pass.dispose();
  });
});

describe("the species renderer", () => {
  it("starts empty and hidden, and draws nothing while no fish are added", () => {
    const school = new School(), renderer = new SpeciesRenderer(-0.5, -0.4, "test");
    renderer.update(school.species.populations);
    expect(renderer.group.visible).toBe(false);
    expect(renderer.shadowGroup.visible).toBe(false);
    const mesh = renderer.group.children[0] as THREE.Mesh;
    expect(mesh.geometry.getAttribute("position").count).toBeLessThan(10);
    disposeRenderer(renderer);
  });

  it.each(SPINE_SPECIES)("fills exact geometry for %s and never folds a membrane through calls and scattering", id => {
    settings.set([id, "count"], speciesLimit(id));
    settings.set([id, "size"], 1.3);
    const school = new School(), renderer = new SpeciesRenderer(-0.5, -0.4, "test");
    const flock: SpeciesFlock = population(school, id), {budget} = compiledSpecies(id);
    const [shapes, lines] = renderer.group.children as THREE.Mesh[];
    const shadows = renderer.shadowGroup.children[0] as THREE.Mesh;
    const winding: number[] = [];
    const count = flock.visibleFish;
    for (let frame = 0; frame < 240; frame++) {
      scenario(school, frame);
      if (frame === 0) school.update(1 / 60, 0);
      renderer.update([flock], undefined, frame / 60);
      expect(shapes.geometry.drawRange.count).toBe(budget.shapes * count);
      expect(shadows.geometry.drawRange.count).toBe(budget.shadows * count);
      expect(lines.geometry.drawRange.count).toBe(budget.lines * count);
      const position = shapes.geometry.getAttribute("position");
      expect((position.array as Float32Array).every(Number.isFinite)).toBe(true);
      // Fish are sorted by depth, so read membranes of a single fish by clearing the rest.
      if (count === 1 || frame % 40 !== 0) continue;
      const single = new SpeciesRenderer(-0.5, -0.4, "single");
      for (let index = 0; index < Math.min(count, 4); index++) {
        single.update([{id, visibleFish: 1, bodies: [flock.bodies[index]]}], undefined, frame / 60);
        const points = (single.group.children[0] as THREE.Mesh).geometry.getAttribute("position");
        for (let vertex = 0; vertex < budget.membranes; vertex += 3) {
          const area = (points.getX(vertex + 1) - points.getX(vertex)) * (points.getY(vertex + 2) - points.getY(vertex))
            - (points.getY(vertex + 1) - points.getY(vertex)) * (points.getX(vertex + 2) - points.getX(vertex));
          if (Math.abs(area) < 1e-3) continue; // A lobe closes to zero width at its tip.
          winding[vertex] ??= Math.sign(area);
          expect(Math.sign(area), `frame ${frame}, fish ${index}, vertex ${vertex}`).toBe(winding[vertex]);
        }
      }
      disposeRenderer(single);
    }
    settings.set([id, "count"], 0);
    renderer.update([flock]);
    expect(renderer.group.visible).toBe(false);
    disposeRenderer(renderer);
  });

  it("moves both lobes of an unequal tail together where they meet", () => {
    settings.set(["sterlet", "count"], 1);
    const school = new School(), fish = population(school, "sterlet").fish[0];
    const renderer = new SpeciesRenderer(-0.5, -0.4, "test"), flock = population(school, "sterlet");
    const {tail} = compiledSpecies("sterlet");
    const [left, right] = tail[0].sides;
    const notch = (side: typeof left) => side.triangles.flat().findIndex(vertex => side.contour[vertex][0] === 1.1 && side.contour[vertex][1] === 0);
    expect(notch(left)).toBeGreaterThanOrEqual(0);
    expect(notch(right)).toBeGreaterThanOrEqual(0);
    const positions = (renderer.group.children[0] as THREE.Mesh).geometry;
    for (let frame = 0; frame < 200; frame++) {
      scenario(school, frame);
      fish.turnBend = Math.sin(frame * 0.1);
      renderer.update([flock], undefined, frame / 60);
      const position = positions.getAttribute("position");
      const leftVertices = left.triangles.length * 3;
      expect(position.getX(notch(left))).toBeCloseTo(position.getX(leftVertices + notch(right)), 3);
      expect(position.getY(notch(left))).toBeCloseTo(position.getY(leftVertices + notch(right)), 3);
    }
    disposeRenderer(renderer);
  });

  it("keeps fin strips free of folds under any sideways wave", () => {
    for (const id of SPINE_SPECIES) for (const layer of SPECIES_ART[id].tail.layers) for (const contour of [layer.left, layer.right ?? layer.left]) {
      const {points, triangles} = membraneStrips(contour);
      const area = (shift: (t: number) => number) => triangles.map(([a, b, c]) => {
        const [ax, ay] = points[a], [bx, by] = points[b], [cx, cy] = points[c];
        return (bx - ax) * (cy + shift(cx) - ay - shift(ax)) - (by + shift(bx) - ay - shift(ax)) * (cx - ax);
      });
      // A contour that doubles back along its length (the butterfly wing) keeps its plain triangles.
      if (!points.every((point, index) => index === 0 || index % 2 === 1 || point[0] > points[index - 2][0])) continue;
      const still = area(() => 0), bent = area(t => Math.sin(t * 9) * 0.2);
      still.forEach((value, index) => expect(bent[index], id).toBeCloseTo(value, 9));
      // Together the strips cover what the outline covers.
      const outline = contour.reduce((sum, point, index) => {
        const next = contour[(index + 1) % contour.length];
        return sum + point[0] * next[1] - next[0] * point[1];
      }, 0);
      expect(Math.abs(still.reduce((sum, value) => sum + Math.abs(value), 0)), id).toBeCloseTo(Math.abs(outline), 6);
    }
  });

  it("is as smooth as the koi: no tail tip jumps harder than the koi's own, in pond pixels", () => {
    const tips = (select: (school: School) => SpeciesBody, setup: () => void, tip: (fish: SpeciesBody, out: {x: number; y: number; forwardX: number; forwardY: number}) => void) => {
      settings.resetAll(); settings.set(["goldfish", "count"], 0); settings.set(["butterfly-koi", "count"], 0); settings.set(["koi", "initialCount"], 0);
      setup();
      const school = new School(); school.setCount(settings.live.koi.initialCount);
      const fish = select(school), out = {x: 0, y: 0, forwardX: 1, forwardY: 0};
      const path: {x: number; y: number}[] = [];
      for (let frame = 0; frame < 900; frame++) {
        scenario(school, frame);
        buildRenderSpine(fish);
        tip(fish, out);
        path.push({x: out.x, y: out.y});
      }
      let worst = 0;
      for (let i = 2; i < path.length; i++) worst = Math.max(worst, Math.hypot(
        path[i].x - 2 * path[i - 1].x + path[i - 2].x, path[i].y - 2 * path[i - 1].y + path[i - 2].y));
      return worst;
    };
    const koi = tips(school => school.fish[0], () => settings.set(["koi", "initialCount"], 1), (fish, out) => {
      // drawKoi's tail edge at its last station, on the outer lobe.
      const last = fish.renderSpine.length - 1, a = fish.renderSpine[last - 1], b = fish.renderSpine[last];
      const magnitude = Math.hypot(a.x - b.x, a.y - b.y) || 1, fx = (a.x - b.x) / magnitude, fy = (a.y - b.y) / magnitude;
      const sway = fish.bodyWidth * (Math.sin(fish.swimPhase - 3.7) * 0.3 * (0.2 + fish.tailEffort) + fish.turnBend * 0.28);
      const across = sway + 0.62 * fish.bodyWidth * (1 + 0.14 * Math.sin(fish.swimPhase - 0.8)), back = fish.bodyWidth * 1.38;
      out.x = b.x - fx * back - fy * across; out.y = b.y - fy * back + fx * across;
    });
    expect(koi).toBeGreaterThan(0);
    for (const id of [...LARGE_SPECIES, ...MEDIUM_SPECIES]) {
      const {tail} = SPECIES_ART[id];
      const contour = tail.layers[0].left;
      const tipVertex = contour.reduce((far, point) => point[0] > far[0] ? point : far);
      const worst = tips(school => population(school, id).fish[0], () => settings.set([id, "count"], 1), (fish, out) => {
        const wave = tail.wave * (Math.sin(fish.swimPhase - 3.7) * 0.08 * (0.2 + fish.tailEffort) + fish.turnBend * 0.12);
        membranePoint(fish, LONG_TAIL_ANCHOR, tipVertex[0], tipVertex[1] * longTailOpening(fish), longTailFlex(fish) * tail.flex + wave, out);
      });
      expect(worst, id).toBeLessThanOrEqual(koi * 2);
    }
  }, 20_000);
});

describe("small species are Medaka in another color", () => {
  /** What one renderer drew: the used part of each buffer, so buffer capacity does not matter. */
  const drawn = (group: THREE.Group, attribute: string) => group.children.map(child => {
    const {geometry} = child as THREE.Mesh, values = geometry.getAttribute(attribute);
    return Array.from(values.array).slice(0, geometry.drawRange.count * values.itemSize);
  });
  const shoalsOf = (school: School, id: (typeof SMALL_SPECIES)[number]) => school.smallSpecies.find(entry => entry.id === id)!;

  it("leaves Medaka exactly as they were, with or without a shoal beside them", () => {
    const run = (shoals: number) => {
      for (const id of SMALL_SPECIES) settings.set([id, "count"], shoals);
      const school = new School();
      for (let frame = 0; frame < 200; frame++) scenario(school, frame);
      return school.tinyFish.fish.map(fish => [fish.position, fish.velocity, fish.tailPhase]);
    };
    expect(run(2)).toEqual(run(0));
  });

  it.each(SMALL_SPECIES)("%s swims exactly as Medaka do, fish for fish, given the same start", id => {
    settings.set([id, "count"], TINY_FISH.visibleSchoolCount);
    const medaka = new TinyFishSchools(), shoal = new TinyFishSchools(smallSpeciesConfig(id), TINY_FISH_SCHOOLS);
    for (let frame = 0; frame < 300; frame++) {
      if (frame === 120) { medaka.fleeFrom({x: 240, y: 135}); shoal.fleeFrom({x: 240, y: 135}); }
      medaka.update(1 / 60, frame / 60); shoal.update(1 / 60, frame / 60);
    }
    expect(shoal.fish).toEqual(medaka.fish);
  });

  it.each(SMALL_SPECIES)("%s has the Medaka outline and shadow in every vertex, and only its color differs", id => {
    const fish = new TinyFishSchools(), count = TINY_FISH.visibleSchoolCount;
    const asMedaka = new TinyFishRenderer(), asSpecies = new TinyFishRenderer();
    asMedaka.update(fish);
    settings.set(["tiny-fish", "visibleSchoolCount"], 0); // Only the species draws these fish now.
    asSpecies.update(fish, [{id, count, schools: fish}]);
    expect(drawn(asMedaka.group, "position")[0].length).toBeGreaterThan(0);
    expect(drawn(asSpecies.group, "position")).toEqual(drawn(asMedaka.group, "position"));
    expect(drawn(asSpecies.shadowGroup, "position")).toEqual(drawn(asMedaka.shadowGroup, "position"));
    expect(drawn(asSpecies.group, "color")).not.toEqual(drawn(asMedaka.group, "color"));
  });

  it("gives each species a palette of its own, per shoal, in Medaka's slots", () => {
    const seen = new Set<number>(TINY_FISH.palettes.flatMap(palette => [palette.body, palette.fin]));
    for (const id of SMALL_SPECIES) {
      expect(SMALL_SPECIES_PALETTES[id]).toHaveLength(MAX_SMALL_SHOALS);
      for (const palette of SMALL_SPECIES_PALETTES[id]) for (const tone of [palette.body, palette.fin]) {
        expect(seen.has(tone), id).toBe(false);
        seen.add(tone);
      }
    }
  });

  it("takes its shoals from the default Medaka shoals", () => {
    settings.set(["tiny-fish", "visibleSchoolCount"], MEDAKA_SHOALS.length);
    MEDAKA_SHOALS.forEach((shoal, index) => expect(TINY_FISH_SCHOOLS[index]).toMatchObject(shoal));
  });

  it("inherits Medaka settings live, and keeps its own shoal count and size slider", () => {
    settings.set(["white-cloud", "count"], 1);
    const config = smallSpeciesConfig("white-cloud");
    expect(config.bodyLength).toEqual(TINY_FISH.bodyLength);
    settings.set(["tiny-fish", "bodyLength"], [7, 9]);
    settings.set(["tiny-fish", "cruiseSpeed"], [30, 30]);
    expect(config.bodyLength).toEqual([7, 9]);
    expect(config.cruiseSpeed).toEqual([30, 30]);
    settings.set(["white-cloud", "size"], 1.2);
    expect(config.bodyLength[0]).toBeCloseTo(8.4);
    expect(config.visibleSchoolCount).toBe(1);
  });

  it.each(SMALL_SPECIES)("%s shoals by count, avoids the large fish, flees a tap and stays finite", id => {
    settings.set(["goldfish", "count"], 8);
    settings.set([id, "count"], 2);
    settings.set(["sterlet", "count"], 4);
    const school = new School(), shoals = shoalsOf(school, id);
    expect(shoals.visibleFish).toBe(MEDAKA_SHOALS[0].count + MEDAKA_SHOALS[1].count);
    const sterlet = vi.spyOn(population(school, "sterlet"), "avoidance");
    const paddlefish = vi.spyOn(population(school, "paddlefish"), "avoidance");
    const flee = vi.spyOn(shoals.schools, "fleeFrom");
    for (let frame = 0; frame < 300; frame++) scenario(school, frame);
    expect(sterlet).toHaveBeenCalled();
    expect(paddlefish).not.toHaveBeenCalled(); // An empty population is not even asked.
    expect(flee).toHaveBeenCalled();
    for (const fish of shoals.schools.fish) expect(Number.isFinite(fish.position.x + fish.position.y + fish.velocity.x + fish.velocity.y + fish.tailPhase)).toBe(true);
  });

  it("does no work while empty, and keeps place and phase through size changes and a resize", () => {
    const school = new School(), shoals = school.smallSpecies[0];
    const before = structuredClone(shoals.schools.fish);
    for (let frame = 0; frame < 30; frame++) school.update(1 / 60, frame / 60);
    expect(shoals.schools.fish).toEqual(before);
    settings.set([shoals.id, "count"], 1);
    for (let frame = 0; frame < 30; frame++) school.update(1 / 60, frame / 60);
    const fish = shoals.schools.fish[0], position = {...fish.position}, phase = fish.tailPhase, length = fish.bodyLength;
    settings.set([shoals.id, "size"], 1.3); shoals.refreshConfig();
    const next = shoals.schools.fish[0];
    expect(next.position).toEqual(position);
    expect(next.tailPhase).toBe(phase);
    expect(next.bodyLength).toBeCloseTo(length * 1.3);
    shoals.resize(2, 0.5);
    expect(shoals.schools.fish[0].position.x).toBeCloseTo(position.x * 2);
  });

  it("forgets the pond loach in an old save, and keeps everything else in it", () => {
    memoryStorage();
    localStorage.setItem(__internal.STORAGE_KEY_V2, JSON.stringify({version: 2, weather: "sunny", rain: false, overrides: {"pond-loach.count": 3, "pond-loach.size": 1.2, "white-cloud.count": 2}}));
    const store = new SettingsStore(); loadInto(store);
    expect(store.live["white-cloud"].count).toBe(2);
    expect(Object.keys(store.live)).not.toContain("pond-loach");
    expect(Object.keys(store.exportOverrides())).not.toContain("pond-loach.count");
  });
});

describe("the fish list", () => {
  it("lists every population once, within its schema limit, by size class", () => {
    const entries = FISH_ROSTER.flatMap(section => section.entries);
    expect(new Set(entries.map(entry => entry.id)).size).toBe(entries.length);
    expect(entries).toHaveLength(14);
    for (const entry of entries) {
      const node = nodeAt(definition, entry.path);
      expect(node?.kind, entry.id).toBe("num");
      if (node?.kind === "num") expect(node.max, entry.id).toBeGreaterThanOrEqual(entry.max);
    }
    expect(FISH_ROSTER[0].entries.map(entry => entry.id)).toEqual(["koi", ...LARGE_SPECIES]);
    expect(FISH_ROSTER[1].entries.map(entry => entry.id)).toEqual(["wakin", "butterfly-koi", "shubunkin", ...MEDIUM_SPECIES]);
    expect(FISH_ROSTER[2].entries.map(entry => entry.id)).toEqual(["medaka", ...SMALL_SPECIES]);
  });

  it("counts kinds in the pond, not fish", () => {
    expect(speciesInPond([14, 0, 0, 3, 2, 0, 3])).toBe(4);
    expect(speciesInPond([0, 0])).toBe(0);
  });
});
