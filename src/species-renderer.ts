import * as THREE from "three";
import { FISH } from "./config";
import { buildRenderSpine, LONG_TAIL_ANCHOR, longTailFlex, longTailOpening, membranePoint, sampleSwimSpine, type SwimBody } from "./fish-spine";
import { SwimState, type Koi } from "./koi";
import { clamp } from "./math";
import type { SpineSpeciesId } from "./settings/species";
import { SPECIES_ART, widthAt, type FinArt, type MarkArt, type MembraneArt, type RidgeArt, type Rgb, type SpeciesArt, type Vertex } from "./species-art";
import { SurfaceGeometryBatch } from "./surface-geometry";
import type { SurfaceWeather } from "./weather-pass";

/** Everything the artwork reads from a fish. */
export type SpeciesBody = SwimBody & Pick<Koi, "angularVelocity" | "finPhase" | "gulpAnimation" | "state" | "depth">;
export interface SpeciesFlock {
  readonly id: SpineSpeciesId;
  readonly visibleFish: number;
  readonly bodies: readonly SpeciesBody[];
}

const onScreen = ([r, g, b]: Rgb): THREE.Color => new THREE.Color().setRGB(r / 255, g / 255, b / 255);
const triangulate = (contour: readonly Vertex[]): readonly number[][] =>
  THREE.ShapeUtils.triangulateShape(contour.map(([x, y]) => new THREE.Vector2(x, y)), []);
const WATER_TINT = new THREE.Color(0x548775);
const WHITE = new THREE.Color(1, 1, 1);
const BOTH_SIDES = [-1, 1] as const, ONE_SIDE = [1] as const;
const RAY_SIDES = {left: [-1], right: [1], both: BOTH_SIDES} as const;

interface CompiledSide { contour: readonly Vertex[]; triangles: readonly number[][]; root: THREE.Color; tip: THREE.Color; from: number; to: number }
interface CompiledMembrane { sides: readonly [CompiledSide, CompiledSide]; shadow: boolean }
interface CompiledFin { art: FinArt; triangles: readonly number[][]; color: THREE.Color; edge?: THREE.Color; rootWidth: number }
interface CompiledRidge { art: RidgeArt; triangles: readonly number[][]; color: THREE.Color; from: number; span: number }
interface CompiledMark { art: MarkArt; color: THREE.Color }
export interface VertexBudget { shapes: number; shadows: number; lines: number; membranes: number }
export interface CompiledSpecies {
  art: SpeciesArt;
  palette: readonly THREE.Color[];
  glint: THREE.Color;
  tail: readonly CompiledMembrane[];
  /** Where the tail's traveling wave starts and how far it runs, shared by every lobe and layer. */
  waveFrom: number;
  waveSpan: number;
  rayColor: THREE.Color;
  fins: readonly CompiledFin[];
  ridges: readonly CompiledRidge[];
  under: readonly CompiledMark[];
  over: readonly CompiledMark[];
  lines: readonly { from: Vertex; to: Vertex; color: THREE.Color; mirror: boolean; rigid: boolean }[];
  eye: THREE.Color;
  mouth: THREE.Color | null;
  segments: number;
  bandCount: number;
  budget: VertexBudget;
}

/**
 * Cuts a fin into strips along its length. The tail's wave only ever slides points
 * sideways by an amount that depends on `t`, and a triangle with one edge across the
 * fin keeps its exact area under that, so these strips cannot fold however it curves.
 */
export function membraneStrips(contour: readonly Vertex[]): {points: readonly Vertex[]; triangles: readonly number[][]} {
  const last = contour.reduce((far, point, index) => point[0] > contour[far][0] ? index : far, 0);
  const outer = contour.slice(0, last + 1), inner = [contour[0], ...contour.slice(last).reverse()];
  const ascending = (chain: readonly Vertex[]) => chain.every((point, index) => index === 0 || point[0] > chain[index - 1][0]);
  // A contour that doubles back along its length, like a notched wing, cannot be cut this way.
  if (!ascending(outer) || !ascending(inner)) return {points: contour, triangles: triangulate(contour)};
  const at = (chain: readonly Vertex[], t: number): number => {
    for (let i = 1; i < chain.length; i++) if (t <= chain[i][0]) return chain[i - 1][1] + (chain[i][1] - chain[i - 1][1]) * (t - chain[i - 1][0]) / (chain[i][0] - chain[i - 1][0]);
    return chain[chain.length - 1][1];
  };
  const stations = [...new Set([...outer, ...inner].map(([t]) => t))].sort((a, b) => a - b);
  const points: Vertex[] = [], triangles: number[][] = [];
  stations.forEach((t, index) => {
    points.push([t, at(outer, t)], [t, at(inner, t)]);
    if (index === 0) return;
    const a = (index - 1) * 2, b = a + 1, c = a + 2, d = a + 3;
    if (index > 1) triangles.push([a, b, d]);
    if (index < stations.length - 1) triangles.push([a, d, c]);
    else if (index === 1) triangles.push([a, d, c]);
  });
  return {points, triangles};
}

function compileSide(contour: readonly Vertex[], root: Rgb, tip: Rgb, curves: boolean): CompiledSide {
  const stations = contour.map(([t]) => t);
  // A fin too small to show the wave does not need its extra vertices.
  const strips = curves ? membraneStrips(contour) : {points: contour, triangles: triangulate(contour)};
  return {contour: strips.points, triangles: strips.triangles, root: onScreen(root), tip: onScreen(tip), from: Math.min(...stations), to: Math.max(...stations)};
}

function compile(art: SpeciesArt): CompiledSpecies {
  const tail = art.tail.layers.map((layer: MembraneArt): CompiledMembrane => ({
    shadow: layer.shadow === true,
    sides: [
      compileSide(layer.left, layer.root, layer.tip, art.tail.wave > 0),
      compileSide(layer.right ?? layer.left, layer.rightRoot ?? layer.root, layer.rightTip ?? layer.tip, art.tail.wave > 0),
    ],
  }));
  const fins = art.fins.map((fin): CompiledFin => ({
    art: fin, triangles: triangulate(fin.contour), color: onScreen(fin.tone), edge: fin.edge ? onScreen(fin.edge.tone) : undefined,
    rootWidth: widthAt(art, fin.t) * fin.inset,
  }));
  const ridges = art.ridges.map((ridge): CompiledRidge => {
    const stations = ridge.contour.map(([t]) => t), from = Math.min(...stations);
    return {art: ridge, triangles: triangulate(ridge.contour), color: onScreen(ridge.tone), from, span: Math.max(...stations) - from};
  });
  const marks = art.marks.map((mark): CompiledMark => ({art: mark, color: onScreen(mark.tone)}));
  const segments = art.stations.length - 1, bandCount = art.bands.length - 1;
  const sum = <T,>(items: readonly T[], count: (item: T) => number): number => items.reduce((total, item) => total + count(item), 0);
  const membraneVertices = sum(tail, layer => (layer.sides[0].triangles.length + layer.sides[1].triangles.length) * 3)
    + sum(fins, fin => fin.triangles.length * 6);
  const markVertices = (items: readonly CompiledMark[]) => sum(items, ({art: mark}) => mark.sides * 3 * (mark.mirror ? 2 : 1));
  const ridgeVertices = (items: readonly CompiledRidge[]) => sum(items, ridge => ridge.triangles.length * 3 * (ridge.art.mirror ? 2 : 1));
  const eyeVertices = 2 * art.eye.sides * 3 + (art.eye.glint ? 6 : 0);
  const shadowLayers = tail.filter(layer => layer.shadow);
  const tailSides = tail.flatMap(layer => layer.sides);
  const waveFrom = Math.min(...tailSides.map(side => side.from));
  return {
    art, tail, fins, ridges, segments, bandCount, waveFrom,
    waveSpan: Math.max(Math.max(...tailSides.map(side => side.to)) - waveFrom, 0.001),
    palette: art.palette.map(onScreen),
    glint: onScreen(art.glintTone),
    rayColor: onScreen(art.tail.rayTone),
    under: marks.filter(({art: mark}) => mark.under),
    over: marks.filter(({art: mark}) => !mark.under),
    lines: art.lines.map(line => ({from: line.from, to: line.to, color: onScreen(line.tone), mirror: line.mirror === true, rigid: line.rigid === true})),
    eye: onScreen(art.eye.pupil),
    mouth: art.mouth ? onScreen(art.mouth) : null,
    budget: {
      membranes: membraneVertices,
      shapes: membraneVertices + segments * bandCount * 6 + ridgeVertices(ridges) + markVertices(marks) + eyeVertices + (art.mouth ? 3 : 0),
      shadows: sum(shadowLayers, layer => (layer.sides[0].triangles.length + layer.sides[1].triangles.length) * 3)
        + sum(fins, fin => fin.triangles.length * 6) + segments * 12
        + ridgeVertices(ridges.filter(ridge => ridge.art.shadow)) + markVertices(marks.filter(({art: mark}) => mark.shadow)),
      lines: sum(art.tail.rays, ray => ray.side ? 2 : 4) + sum(art.fins, fin => fin.edge ? 4 : 0) + sum(art.lines, line => line.mirror ? 4 : 2),
    },
  };
}

const compiled = new Map<SpineSpeciesId, CompiledSpecies>();
export function compiledSpecies(id: SpineSpeciesId): CompiledSpecies {
  let species = compiled.get(id);
  if (!species) compiled.set(id, species = compile(SPECIES_ART[id]));
  return species;
}

/** A fixed coat per fish slot: one palette index per body cell. */
export function speciesCoat(art: SpeciesArt, slot: number): Uint8Array {
  const paint = art.coat(slot);
  const segments = art.stations.length - 1, bands = art.bands.length - 1;
  const coat = new Uint8Array(segments * bands);
  for (let segment = 0; segment < segments; segment++) {
    const t = (art.stations[segment] + art.stations[segment + 1]) * 0.5;
    for (let band = 0; band < bands; band++) coat[segment * bands + band] = paint(t, (art.bands[band] + art.bands[band + 1]) * 0.5);
  }
  return coat;
}

interface FlockState { species: CompiledSpecies; coats: Uint8Array[]; finOpen: Float32Array }

export class SpeciesRenderer {
  public readonly group = new THREE.Group();
  public readonly shadowGroup = new THREE.Group();
  private readonly shapes = new THREE.BufferGeometry();
  private readonly shadows = new THREE.BufferGeometry();
  private readonly lines = new THREE.BufferGeometry();
  // The default pond has none of these fish, so buffers start empty and grow on demand.
  private readonly shapeBatch = new SurfaceGeometryBatch(this.shapes, 9, true);
  private readonly shadowBatch = new SurfaceGeometryBatch(this.shadows, 9, true);
  private readonly lineBatch = new SurfaceGeometryBatch(this.lines, 6, true);
  private readonly states = new Map<SpineSpeciesId, FlockState>();
  private readonly orderFlock: number[] = [];
  private readonly orderFish: number[] = [];
  private readonly sample = {x: 0, y: 0, forwardX: 1, forwardY: 0};
  private stationX = new Float32Array(16);
  private stationY = new Float32Array(16);
  private stationFX = new Float32Array(16);
  private stationFY = new Float32Array(16);
  private readonly color = new THREE.Color();
  private readonly lineColor = new THREE.Color();
  private readonly shadowColor = new THREE.Color();
  private sunX = -0.58;
  private sunY = -0.82;
  private shimmer = 1;
  private shadowX = 0;
  private shadowY = 0;
  private shadowScale = 1;
  private lastTime = -1;

  public constructor(meshOrder: number, lineOrder: number, name: string) {
    this.shapes.name = `${name} bodies and fins`;
    this.shadows.name = `${name} shadows`;
    this.lines.name = `${name} fin rays`;
    const material = new THREE.MeshBasicMaterial({vertexColors: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false});
    const lineMaterial = new THREE.LineBasicMaterial({vertexColors: true, depthTest: false, depthWrite: false, toneMapped: false});
    const shadowMaterial = new THREE.ShaderMaterial({
      uniforms: {uColor: {value: new THREE.Color(0x163c32)}, uOpacity: {value: 0.28}},
      vertexColors: true, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: "varying float vStrength; void main(){vStrength=color.r;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "uniform vec3 uColor;uniform float uOpacity;varying float vStrength;void main(){gl_FragColor=vec4(uColor,uOpacity*vStrength);}",
    });
    const mesh = new THREE.Mesh(this.shapes, material);
    const rays = new THREE.LineSegments(this.lines, lineMaterial);
    const shadow = new THREE.Mesh(this.shadows, shadowMaterial);
    mesh.frustumCulled = rays.frustumCulled = shadow.frustumCulled = false;
    mesh.renderOrder = meshOrder; rays.renderOrder = lineOrder;
    this.group.add(mesh, rays); this.shadowGroup.add(shadow);
    this.setVisible(false);
  }

  public setVisible(visible: boolean): void {
    this.group.visible = visible;
    this.shadowGroup.visible = visible;
  }

  private state(flock: SpeciesFlock): FlockState {
    let state = this.states.get(flock.id);
    if (!state) {
      const species = compiledSpecies(flock.id);
      state = {species, coats: [], finOpen: new Float32Array(0)};
      this.states.set(flock.id, state);
    }
    while (state.coats.length < flock.bodies.length) state.coats.push(speciesCoat(state.species.art, state.coats.length));
    if (state.finOpen.length < flock.bodies.length * 2) state.finOpen = new Float32Array(flock.bodies.length * 2).fill(0.3);
    return state;
  }

  public update(flocks: readonly SpeciesFlock[], weather?: Readonly<SurfaceWeather>, time?: number): void {
    let total = 0, shapes = 0, shadows = 0, lines = 0;
    this.orderFlock.length = 0; this.orderFish.length = 0;
    for (let flock = 0; flock < flocks.length; flock++) {
      const count = flocks[flock].visibleFish;
      if (count === 0) continue;
      const {budget} = this.state(flocks[flock]).species;
      total += count;
      shapes += budget.shapes * count; shadows += budget.shadows * count; lines += budget.lines * count;
      for (let fish = 0; fish < count; fish++) { this.orderFlock.push(flock); this.orderFish.push(fish); }
    }
    this.setVisible(total > 0);
    if (total === 0) { this.lastTime = time ?? this.lastTime; return; }
    this.shapeBatch.reserve(shapes * 3); this.shadowBatch.reserve(shadows * 3); this.lineBatch.reserve(lines * 3);
    const dt = time === undefined || this.lastTime < 0 ? 1 / 60 : clamp(time - this.lastTime, 0, 0.1);
    if (time !== undefined) this.lastTime = time;
    this.shapeBatch.reset(); this.shadowBatch.reset(); this.lineBatch.reset();
    this.sunX = weather?.lightDirection.x ?? -0.58;
    this.sunY = -(weather?.lightDirection.y ?? 0.82);
    this.shimmer = clamp(weather?.shadowScale ?? 1, 0, 1);
    // Deepest first, across species, so a shallower fish passes over a deeper one.
    for (let i = 1; i < total; i++) {
      const flock = this.orderFlock[i], fish = this.orderFish[i];
      const depth = flocks[flock].bodies[fish].depth;
      let j = i;
      while (j > 0 && flocks[this.orderFlock[j - 1]].bodies[this.orderFish[j - 1]].depth < depth) {
        this.orderFlock[j] = this.orderFlock[j - 1]; this.orderFish[j] = this.orderFish[j - 1]; j--;
      }
      this.orderFlock[j] = flock; this.orderFish[j] = fish;
    }
    for (let i = 0; i < total; i++) {
      const flock = flocks[this.orderFlock[i]];
      this.drawFish(flock.bodies[this.orderFish[i]], this.states.get(flock.id)!, this.orderFish[i], dt, weather);
    }
    this.shapeBatch.commit(); this.shadowBatch.commit(); this.lineBatch.commit();
  }

  private drawFish(fish: SpeciesBody, state: FlockState, slot: number, dt: number, weather?: Readonly<SurfaceWeather>): void {
    const {species} = state, {art} = species;
    buildRenderSpine(fish);
    if (art.stations.length > this.stationX.length) {
      const size = art.stations.length;
      this.stationX = new Float32Array(size); this.stationY = new Float32Array(size);
      this.stationFX = new Float32Array(size); this.stationFY = new Float32Array(size);
    }
    for (let i = 0; i < art.stations.length; i++) {
      sampleSwimSpine(fish, art.stations[i], this.sample);
      this.stationX[i] = this.sample.x; this.stationY[i] = this.sample.y;
      this.stationFX[i] = this.sample.forwardX; this.stationFY[i] = this.sample.forwardY;
    }
    // The same light and shadow rules as the other medium fish.
    this.shadowScale = 0.98 - fish.depth * 0.12;
    this.shadowX = -(weather?.lightDirection.x ?? -0.58) * (3 + fish.depth * 7) * (weather?.shadowScale ?? 1);
    this.shadowY = (weather?.lightDirection.y ?? 0.82) * (3 + fish.depth * 7) * (weather?.shadowScale ?? 1);
    this.shadowColor.setRGB(0.85 - fish.depth * 0.65, 0, 0);

    this.drawTail(fish, species);
    const gulp = Math.sin(Math.PI * clamp(fish.gulpAnimation / Math.max(FISH.feeding.animationDurationSeconds, 0.001), 0, 1));
    this.drawFins(fish, species, state.finOpen, slot, gulp, dt);
    this.drawMarks(fish, species.under, slot, gulp);
    this.drawBody(fish, species, state.coats[slot], gulp);
    this.drawRidges(fish, species, slot);
    this.drawMarks(fish, species.over, slot, gulp);
    this.drawLines(fish, species);
    this.drawEyes(fish, species);
    if (species.mouth) this.drawMouth(fish, species.mouth, gulp);
  }

  // Every caudal fin runs on the same functions as the platinum longfin: one anchor
  // tangent, the shared opening and flex clocks. Only its outline and colors differ.
  private drawTail(fish: SpeciesBody, species: CompiledSpecies): void {
    const {tail} = species.art;
    const opening = longTailOpening(fish), flex = longTailFlex(fish) * tail.flex;
    for (const layer of species.tail) {
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1, part = layer.sides[side];
        const span = Math.max(part.to - part.from, 0.001);
        for (const triangle of part.triangles) {
          for (const vertex of triangle) {
            const point = part.contour[vertex], t = point[0], width = point[1];
            const along = clamp((t - part.from) / span, 0, 1);
            this.color.copy(part.root).lerp(part.tip, along);
            this.tint(this.color, fish.depth);
            this.color.lerp(WATER_TINT, along * along * 0.16);
            membranePoint(fish, LONG_TAIL_ANCHOR, t, width * sign * opening, flex + this.tailWave(fish, species, t), this.sample);
            this.point(this.shapeBatch, fish, this.sample.x, this.sample.y, this.color, false);
            if (layer.shadow) this.point(this.shadowBatch, fish, this.sample.x, this.sample.y, this.shadowColor, true);
          }
        }
      }
    }
    this.lineColor.copy(species.rayColor); this.tint(this.lineColor, fish.depth);
    for (const ray of tail.rays) {
      for (const sign of RAY_SIDES[ray.side ?? "both"]) {
        this.rayPoint(fish, species, ray.from, sign, opening, flex);
        this.rayPoint(fish, species, ray.to, sign, opening, flex);
      }
    }
  }

  private rayPoint(fish: SpeciesBody, species: CompiledSpecies, point: Vertex, sign: number, opening: number, flex: number): void {
    membranePoint(fish, LONG_TAIL_ANCHOR, point[0], point[1] * sign * opening, flex + this.tailWave(fish, species, point[0]), this.sample);
    this.point(this.lineBatch, fish, this.sample.x, this.sample.y, this.lineColor, false);
  }

  // The koi's ribbon tail, expressed as flex: a wave running off the fin that also
  // follows the turn, so a long fin curves with the body instead of staying a blade.
  private tailWave(fish: SpeciesBody, species: CompiledSpecies, t: number): number {
    const amount = species.art.tail.wave;
    if (amount === 0) return 0;
    const along = clamp((t - species.waveFrom) / species.waveSpan, 0, 1);
    return amount * (Math.sin(fish.swimPhase - 1.3 - along * 2.4) * 0.08 * (0.2 + fish.tailEffort) * along + fish.turnBend * 0.12 * along);
  }

  // Pectorals scull alternately: tucked while cruising, rowing at rest, and the fin on
  // the inside of a turn opens as a brake. Each is a membrane on one tangent, so it
  // can never fold inside out however sharply the fish turns.
  private drawFins(fish: SpeciesBody, species: CompiledSpecies, finOpen: Float32Array, slot: number, gulp: number, dt: number): void {
    const rest = fish.state === SwimState.Hover ? 1 : fish.state === SwimState.Pivot ? 0.85
      : fish.state === SwimState.Burst ? 0 : fish.state === SwimState.Coast ? 0.36 : 0.22;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const target = clamp(rest + gulp * 0.45 + clamp(fish.angularVelocity * sign * 0.42, 0, 0.6), 0, 1);
      const index = slot * 2 + side;
      finOpen[index] += (target - finOpen[index]) * (1 - Math.exp(-7 * dt));
      const open = finOpen[index];
      const scull = Math.sin(fish.finPhase + side * Math.PI) * (0.1 + open * 0.42);
      const flex = Math.sin(fish.finPhase) * 0.035;
      for (const fin of species.fins) {
        const {art} = fin;
        const angle = clamp(art.rest + open * art.spread + scull * art.scull, 0.2, 1.5);
        const cosine = Math.cos(angle), sine = Math.sin(angle);
        this.color.copy(fin.color); this.tint(this.color, fish.depth); this.color.lerp(WATER_TINT, 0.1);
        for (const triangle of fin.triangles) {
          for (const vertex of triangle) {
            this.finPoint(fish, fin, vertex, cosine, sine, sign, flex);
            this.point(this.shapeBatch, fish, this.sample.x, this.sample.y, this.color, false);
            this.point(this.shadowBatch, fish, this.sample.x, this.sample.y, this.shadowColor, true);
          }
        }
        if (art.edge && fin.edge) {
          this.lineColor.copy(fin.edge); this.tint(this.lineColor, fish.depth);
          this.finPoint(fish, fin, art.edge.from, cosine, sine, sign, flex);
          this.point(this.lineBatch, fish, this.sample.x, this.sample.y, this.lineColor, false);
          this.finPoint(fish, fin, art.edge.to, cosine, sine, sign, flex);
          this.point(this.lineBatch, fish, this.sample.x, this.sample.y, this.lineColor, false);
        }
      }
    }
  }

  /** A rigid sweep around the fin's root, in its own coordinates, on one tangent. */
  private finPoint(fish: SpeciesBody, fin: CompiledFin, vertex: number, cosine: number, sine: number, sign: number, flex: number): void {
    const {art} = fin, point = art.contour[vertex], u = point[0], v = point[1];
    const t = art.t + (u * cosine - v * sine) * art.reach;
    const width = fin.rootWidth + (u * sine + v * cosine) * art.reach;
    membranePoint(fish, art.t, t, width * sign, flex, this.sample);
  }

  private drawBody(fish: SpeciesBody, species: CompiledSpecies, coat: Uint8Array, gulp: number): void {
    const {art, segments, bandCount} = species, {bands, stations, widths} = art, length = fish.bodyLength;
    const swell = species.mouth ? gulp * 0.3 : 0;
    for (let segment = 0; segment < segments; segment++) {
      const widthA = widths[segment] * length * (segment < 2 ? 1 + swell : 1);
      const widthB = widths[segment + 1] * length * (segment + 1 < 2 ? 1 + swell : 1);
      const t = (stations[segment] + stations[segment + 1]) * 0.5;
      // A soft scale glint sliding down the flank with the swimming wave.
      const wave = Math.sin(t * 10.5 - fish.swimPhase * 0.55);
      const glint = wave > 0.72 ? (wave - 0.72) / 0.28 * this.shimmer * art.shimmer : 0;
      const facing = -this.stationFY[segment] * this.sunX + this.stationFX[segment] * this.sunY;
      for (let band = 0; band < bandCount; band++) {
        const across = (bands[band] + bands[band + 1]) * 0.5;
        const lit = clamp(across * facing, -1, 1);
        const shade = 1.05 - 0.27 * Math.pow(Math.abs(across), 1.3) + lit * 0.16;
        this.color.copy(species.palette[coat[segment * bandCount + band]]).multiplyScalar(shade);
        if (glint > 0 && lit > 0) this.color.lerp(species.glint, glint * 0.42);
        this.tint(this.color, fish.depth);
        const a = bands[band], b = bands[band + 1];
        this.bodyPoint(this.shapeBatch, fish, segment, a * widthA, this.color, false);
        this.bodyPoint(this.shapeBatch, fish, segment, b * widthA, this.color, false);
        this.bodyPoint(this.shapeBatch, fish, segment + 1, b * widthB, this.color, false);
        this.bodyPoint(this.shapeBatch, fish, segment, a * widthA, this.color, false);
        this.bodyPoint(this.shapeBatch, fish, segment + 1, b * widthB, this.color, false);
        this.bodyPoint(this.shapeBatch, fish, segment + 1, a * widthB, this.color, false);
      }
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        this.bodyPoint(this.shadowBatch, fish, segment, 0, this.shadowColor, true);
        this.bodyPoint(this.shadowBatch, fish, segment, sign * widthA, this.shadowColor, true);
        this.bodyPoint(this.shadowBatch, fish, segment + 1, sign * widthB, this.shadowColor, true);
        this.bodyPoint(this.shadowBatch, fish, segment, 0, this.shadowColor, true);
        this.bodyPoint(this.shadowBatch, fish, segment + 1, sign * widthB, this.shadowColor, true);
        this.bodyPoint(this.shadowBatch, fish, segment + 1, 0, this.shadowColor, true);
      }
    }
  }

  private drawRidges(fish: SpeciesBody, species: CompiledSpecies, slot: number): void {
    if (species.ridges.length === 0) return;
    const stroke = Math.sin(fish.swimPhase - 2);
    // A tall fin seen from above leans with the stroke and away from a turn, and each
    // fish rests a little to its own side, so the blade never collapses to a line.
    const lean = clamp((slot % 2 === 0 ? 0.3 : -0.3) + stroke * (0.34 + fish.tailEffort * 0.26) - fish.turnBend * 0.7, -1, 1);
    for (const ridge of species.ridges) {
      this.color.copy(ridge.color); this.tint(this.color, fish.depth);
      for (const sign of ridge.art.mirror ? BOTH_SIDES : ONE_SIDE) {
        for (const triangle of ridge.triangles) {
          for (const vertex of triangle) {
            const point = ridge.art.contour[vertex], t = point[0], across = point[1];
            const rear = ridge.span > 0 ? (t - ridge.from) / ridge.span : 0;
            const sway = stroke * ridge.art.sway * rear * 1.7;
            const reach = ridge.art.lean ? across * lean + Math.sign(across) * 0.007 : across;
            sampleSwimSpine(fish, t, this.sample);
            const out = (reach * sign + sway) * fish.bodyLength;
            const x = this.sample.x - this.sample.forwardY * out, y = this.sample.y + this.sample.forwardX * out;
            this.point(this.shapeBatch, fish, x, y, this.color, false);
            if (ridge.art.shadow) this.point(this.shadowBatch, fish, x, y, this.shadowColor, true);
          }
        }
      }
    }
  }

  private drawMarks(fish: SpeciesBody, marks: readonly CompiledMark[], slot: number, gulp: number): void {
    const length = fish.bodyLength;
    for (const {art: mark, color} of marks) {
      this.color.copy(color); this.tint(this.color, fish.depth);
      for (const sign of mark.mirror ? BOTH_SIDES : ONE_SIDE) {
        // Fluid sacs swell with a gulp, breathe with the stroke, and lag behind a turn.
        const jiggle = mark.jiggle ?? 0;
        const breathe = 1 + jiggle * (Math.sin(fish.swimPhase * 0.5 + slot * 1.7 + sign * 0.7) * 0.055 + gulp * 0.05);
        const lag = jiggle * clamp(fish.angularVelocity, -2.9, 2.9) * 0.012;
        sampleSwimSpine(fish, mark.t, this.sample);
        const {x, y, forwardX, forwardY} = this.sample;
        const out = (mark.across * sign - lag) * length;
        const cx = x - forwardY * out, cy = y + forwardX * out;
        const rt = mark.length * length * breathe, ra = mark.width * length * breathe;
        for (let i = 0; i < mark.sides; i++) {
          const a = i / mark.sides * Math.PI * 2, b = (i + 1) / mark.sides * Math.PI * 2;
          const ax = cx + forwardX * Math.cos(a) * rt - forwardY * Math.sin(a) * ra;
          const ay = cy + forwardY * Math.cos(a) * rt + forwardX * Math.sin(a) * ra;
          const bx = cx + forwardX * Math.cos(b) * rt - forwardY * Math.sin(b) * ra;
          const by = cy + forwardY * Math.cos(b) * rt + forwardX * Math.sin(b) * ra;
          this.point(this.shapeBatch, fish, cx, cy, this.color, false);
          this.point(this.shapeBatch, fish, ax, ay, this.color, false);
          this.point(this.shapeBatch, fish, bx, by, this.color, false);
          if (mark.shadow) {
            this.point(this.shadowBatch, fish, cx, cy, this.shadowColor, true);
            this.point(this.shadowBatch, fish, ax, ay, this.shadowColor, true);
            this.point(this.shadowBatch, fish, bx, by, this.shadowColor, true);
          }
        }
      }
    }
  }

  private drawLines(fish: SpeciesBody, species: CompiledSpecies): void {
    for (const line of species.lines) {
      this.lineColor.copy(line.color); this.tint(this.lineColor, fish.depth);
      for (const sign of line.mirror ? BOTH_SIDES : ONE_SIDE) {
        this.linePoint(fish, line.from[0], line.from, line.rigid, sign);
        this.linePoint(fish, line.from[0], line.to, line.rigid, sign);
      }
    }
  }

  private linePoint(fish: SpeciesBody, anchor: number, point: Vertex, rigid: boolean, sign: number): void {
    if (rigid) {
      membranePoint(fish, anchor, point[0], point[1] * sign, 0, this.sample);
      this.point(this.lineBatch, fish, this.sample.x, this.sample.y, this.lineColor, false);
    } else {
      sampleSwimSpine(fish, point[0], this.sample);
      const out = point[1] * sign * fish.bodyLength;
      this.point(this.lineBatch, fish, this.sample.x - this.sample.forwardY * out, this.sample.y + this.sample.forwardX * out, this.lineColor, false);
    }
  }

  private drawEyes(fish: SpeciesBody, species: CompiledSpecies): void {
    const {eye} = species.art, length = fish.bodyLength;
    const radius = Math.max(eye.minimum, length * eye.radius);
    this.color.copy(species.eye); this.tint(this.color, fish.depth * 0.6);
    sampleSwimSpine(fish, eye.t, this.sample);
    const {x, y, forwardX, forwardY} = this.sample;
    this.lineColor.copy(WHITE); this.tint(this.lineColor, fish.depth);
    for (let side = -1; side <= 1; side += 2) {
      const cx = x - forwardY * eye.across * length * side, cy = y + forwardX * eye.across * length * side;
      for (let i = 0; i < eye.sides; i++) {
        const a = i / eye.sides * Math.PI * 2, b = (i + 1) / eye.sides * Math.PI * 2;
        this.point(this.shapeBatch, fish, cx, cy, this.color, false);
        this.point(this.shapeBatch, fish, cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, this.color, false);
        this.point(this.shapeBatch, fish, cx + Math.cos(b) * radius, cy + Math.sin(b) * radius, this.color, false);
      }
      if (eye.glint) {
        const gx = cx + this.sunX * radius * 0.34, gy = cy + this.sunY * radius * 0.34;
        this.point(this.shapeBatch, fish, gx - 0.42, gy + 0.3, this.lineColor, false);
        this.point(this.shapeBatch, fish, gx + 0.42, gy + 0.3, this.lineColor, false);
        this.point(this.shapeBatch, fish, gx, gy - 0.5, this.lineColor, false);
      }
    }
  }

  private drawMouth(fish: SpeciesBody, color: THREE.Color, gulp: number): void {
    const x = this.stationX[0], y = this.stationY[0], fx = this.stationFX[0], fy = this.stationFY[0];
    const mouth = gulp * fish.bodyLength * 0.04;
    this.point(this.shapeBatch, fish, x + fx * mouth, y + fy * mouth, color, false);
    this.point(this.shapeBatch, fish, x - fx * mouth * 0.6 - fy * mouth, y - fy * mouth * 0.6 + fx * mouth, color, false);
    this.point(this.shapeBatch, fish, x - fx * mouth * 0.6 + fy * mouth, y - fy * mouth * 0.6 - fx * mouth, color, false);
  }

  private bodyPoint(batch: SurfaceGeometryBatch, fish: SpeciesBody, station: number, across: number, color: THREE.Color, shadow: boolean): void {
    this.point(batch, fish, this.stationX[station] - this.stationFY[station] * across, this.stationY[station] + this.stationFX[station] * across, color, shadow);
  }

  private tint(color: THREE.Color, depth: number): void {
    color.lerp(WATER_TINT, depth * 0.38).multiplyScalar(1 - depth * 0.3);
  }

  private point(batch: SurfaceGeometryBatch, fish: SpeciesBody, x: number, y: number, color: THREE.Color, shadow: boolean): void {
    const scale = shadow ? this.shadowScale : 1;
    batch.pointXY(fish.position.x + (x - fish.position.x) * scale + (shadow ? this.shadowX : 0),
      fish.position.y + (y - fish.position.y) * scale + (shadow ? this.shadowY : 0), color);
  }
}
