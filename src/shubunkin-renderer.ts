import * as THREE from "three";
import { FISH, MAX_SHUBUNKIN } from "./config";
import { buildRenderSpine, LONG_TAIL_ANCHOR, longTailFlex, longTailOpening, membranePoint, sampleSwimSpine, SHUBUNKIN_TAIL } from "./fish-spine";
import { SwimState } from "./koi";
import { clamp } from "./math";
import type { ShubunkinAgent, ShubunkinPopulation } from "./shubunkin";
import { SurfaceGeometryBatch } from "./surface-geometry";
import type { SurfaceWeather } from "./weather-pass";

// All lengths are fractions of body length, measured back from the snout.
const BODY_T = [0, 0.05, 0.12, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.92, 1] as const;
const BODY_WIDTH = [0.03, 0.08, 0.122, 0.155, 0.162, 0.148, 0.12, 0.09, 0.062, 0.044, 0.032] as const;
const BAND = [-1, -0.66, -0.3, 0, 0.3, 0.66, 1] as const;
const BAND_SHADE = [0.82, 0.94, 1.03, 1.03, 0.94, 0.82] as const;
const SEGMENTS = BODY_T.length - 1, BANDS = BAND.length - 1;
const TAIL_TRIANGLES = THREE.ShapeUtils.triangulateShape(SHUBUNKIN_TAIL.map(([x, y]) => new THREE.Vector2(x, y)), []);
const PECTORAL_LENGTH = 0.27, PELVIC_LENGTH = 0.13;
const PECTORAL: readonly (readonly [number, number])[] = [[0, 0], [0.35, 0.32], [0.75, 0.42], [1, 0.22], [0.9, -0.11], [0.45, -0.2]];
const PELVIC: readonly (readonly [number, number])[] = [[0, 0], [0.7, 0.3], [1, 0.05], [0.55, -0.22]];

const Tone = { base: 0, deep: 1, sky: 2, red: 3, ink: 4, pearl: 5 } as const;
// The pond composites vertex colors without re-encoding them, so these 0-255
// values are the colors that appear on screen: a pearly slate calico that sits
// with the koi's cream and red, rather than a saturated tropical blue.
const onScreen = (r: number, g: number, b: number) => new THREE.Color().setRGB(r / 255, g / 255, b / 255);
const TONES = [onScreen(104, 138, 168), onScreen(78, 110, 144), onScreen(164, 192, 208), onScreen(222, 92, 44), onScreen(36, 38, 46), onScreen(238, 232, 214)];
const FIN_ROOT = onScreen(132, 168, 200), FIN_TIP = onScreen(206, 228, 236);
const DORSAL = onScreen(64, 92, 124), EYE = onScreen(18, 20, 26), GLINT = onScreen(255, 255, 255);
const MOUTH = onScreen(120, 60, 66), WATER_TINT = new THREE.Color(0x548775);

// Budgets are vertices per fish; every frame writes exactly these amounts.
const bodyVertices = SEGMENTS * BANDS * 6;
const tailVertices = TAIL_TRIANGLES.length * 3 * 2;
const pectoralVertices = (PECTORAL.length - 2) * 3 * 2, pelvicVertices = (PELVIC.length - 2) * 3 * 2;
const detailVertices = 9 + 24 + 6 + 3; // dorsal, eyes, glints, mouth
export const SHUBUNKIN_VERTEX_BUDGET = {
  membranes: tailVertices + pectoralVertices + pelvicVertices,
  shapes: tailVertices + pectoralVertices + pelvicVertices + bodyVertices + detailVertices,
  shadows: SEGMENTS * 2 * 6 + tailVertices + pectoralVertices + pelvicVertices,
  lines: 3 * 2 * 2 + 2 * 2 * 2,
} as const;

interface Blob { tone: number; t: number; band: number; rt: number; rb: number }

/** A fixed calico coat per fish slot: broad vermilion and pearl, then single-cell ink flecks. */
export function shubunkinCoat(index: number): Uint8Array {
  let state = (Math.imul(index + 1, 0x9e3779b1) ^ 0x5bd1e995) >>> 0;
  const unit = () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
  const range = (low: number, high: number) => low + (high - low) * unit();
  const blobs: Blob[] = [];
  const add = (tone: number, count: number, rt: readonly [number, number], rb: readonly [number, number]) => {
    for (let i = 0; i < count; i++) blobs.push({ tone, t: range(0.16, 0.94), band: range(-0.85, 0.85), rt: range(rt[0], rt[1]), rb: range(rb[0], rb[1]) });
  };
  add(Tone.deep, 2, [0.09, 0.15], [0.35, 0.6]);
  add(Tone.sky, 2, [0.07, 0.12], [0.3, 0.5]);
  add(Tone.pearl, 2 + index % 2, [0.07, 0.12], [0.32, 0.55]);
  add(Tone.red, 2 + (index + 1) % 2, [0.07, 0.12], [0.34, 0.6]);
  const coat = new Uint8Array(SEGMENTS * BANDS);
  for (let segment = 0; segment < SEGMENTS; segment++) {
    const t = (BODY_T[segment] + BODY_T[segment + 1]) * 0.5;
    for (let band = 0; band < BANDS; band++) {
      const across = (BAND[band] + BAND[band + 1]) * 0.5;
      let tone: number = Tone.base;
      // The head stays clean so the eyes and gill line can be read.
      if (t < 0.12) tone = Tone.sky;
      else for (const blob of blobs) {
        const dt = (t - blob.t) / blob.rt, db = (across - blob.band) / blob.rb;
        if (dt * dt + db * db <= 1) tone = blob.tone;
      }
      coat[segment * BANDS + band] = tone;
    }
  }
  // Ink is painted per cell: a blob this small could fall between cell centers.
  for (let fleck = 0, count = 4 + index % 2; fleck < count; fleck++) {
    coat[Math.floor(range(2, SEGMENTS - 1)) * BANDS + Math.floor(range(0, BANDS))] = Tone.ink;
  }
  return coat;
}

export class ShubunkinRenderer {
  public readonly group = new THREE.Group();
  public readonly shadowGroup = new THREE.Group();
  private readonly shapes = new THREE.BufferGeometry();
  private readonly shadows = new THREE.BufferGeometry();
  private readonly lines = new THREE.BufferGeometry();
  private readonly shapeBatch = new SurfaceGeometryBatch(this.shapes, SHUBUNKIN_VERTEX_BUDGET.shapes * MAX_SHUBUNKIN * 3, true);
  private readonly shadowBatch = new SurfaceGeometryBatch(this.shadows, SHUBUNKIN_VERTEX_BUDGET.shadows * MAX_SHUBUNKIN * 3, true);
  private readonly lineBatch = new SurfaceGeometryBatch(this.lines, SHUBUNKIN_VERTEX_BUDGET.lines * MAX_SHUBUNKIN * 3, true);
  private readonly coats = Array.from({ length: MAX_SHUBUNKIN }, (_, index) => shubunkinCoat(index));
  // Visual follow-through only. It lives here so the shared simulation stays koi behavior;
  // a rebuilt renderer after GPU recovery simply starts relaxing from the current pose.
  private readonly finOpen = new Float32Array(MAX_SHUBUNKIN * 2).fill(0.3);
  private readonly order: number[] = [];
  private readonly sample = { x: 0, y: 0, forwardX: 1, forwardY: 0 };
  private readonly stationX = new Float32Array(BODY_T.length);
  private readonly stationY = new Float32Array(BODY_T.length);
  private readonly stationFX = new Float32Array(BODY_T.length);
  private readonly stationFY = new Float32Array(BODY_T.length);
  private readonly color = new THREE.Color();
  private readonly finColor = new THREE.Color();
  private readonly shadowColor = new THREE.Color();
  private sunX = -0.58;
  private sunY = -0.82;
  private shimmer = 1;
  private shadowX = 0;
  private shadowY = 0;
  private shadowScale = 1;
  private lastTime = -1;

  public constructor() {
    this.shapes.name = "shubunkin bodies and long tails";
    this.shadows.name = "shubunkin shadows";
    this.lines.name = "shubunkin fin rays";
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false });
    const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, toneMapped: false });
    const shadowMaterial = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x163c32) }, uOpacity: { value: 0.28 } },
      vertexColors: true, transparent: true, side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: "varying float vStrength; void main(){vStrength=color.r;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
      fragmentShader: "uniform vec3 uColor;uniform float uOpacity;varying float vStrength;void main(){gl_FragColor=vec4(uColor,uOpacity*vStrength);}",
    });
    const mesh = new THREE.Mesh(this.shapes, material);
    const rays = new THREE.LineSegments(this.lines, lineMaterial);
    const shadow = new THREE.Mesh(this.shadows, shadowMaterial);
    mesh.frustumCulled = rays.frustumCulled = shadow.frustumCulled = false;
    // Rays read as streaks in the tail, beneath the koi like the other medium fish.
    mesh.renderOrder = -2; rays.renderOrder = -1;
    this.group.add(mesh, rays); this.shadowGroup.add(shadow);
  }

  public update(population: ShubunkinPopulation, weather?: Readonly<SurfaceWeather>, time?: number): void {
    const dt = time === undefined || this.lastTime < 0 ? 1 / 60 : clamp(time - this.lastTime, 0, 0.1);
    if (time !== undefined) this.lastTime = time;
    this.shapeBatch.reset(); this.shadowBatch.reset(); this.lineBatch.reset();
    this.sunX = weather?.lightDirection.x ?? -0.58;
    this.sunY = -(weather?.lightDirection.y ?? 0.82);
    this.shimmer = clamp(weather?.shadowScale ?? 1, 0, 1);
    this.order.length = population.count;
    for (let index = 0; index < population.count; index++) this.order[index] = index;
    for (let i = 1; i < this.order.length; i++) {
      const index = this.order[i]; let j = i;
      while (j > 0 && population.fish[this.order[j - 1]].depth < population.fish[index].depth) {
        this.order[j] = this.order[j - 1]; j--;
      }
      this.order[j] = index;
    }
    for (const index of this.order) this.drawFish(population.fish[index], index, dt, weather);
    this.shapeBatch.commit(); this.shadowBatch.commit(); this.lineBatch.commit();
  }

  private drawFish(fish: ShubunkinAgent, index: number, dt: number, weather?: Readonly<SurfaceWeather>): void {
    buildRenderSpine(fish);
    for (let i = 0; i < BODY_T.length; i++) {
      sampleSwimSpine(fish, BODY_T[i], this.sample);
      this.stationX[i] = this.sample.x; this.stationY[i] = this.sample.y;
      this.stationFX[i] = this.sample.forwardX; this.stationFY[i] = this.sample.forwardY;
    }
    this.shadowScale = 0.98 - fish.depth * 0.12;
    this.shadowX = -(weather?.lightDirection.x ?? -0.58) * (3 + fish.depth * 7) * (weather?.shadowScale ?? 1);
    this.shadowY = (weather?.lightDirection.y ?? 0.82) * (3 + fish.depth * 7) * (weather?.shadowScale ?? 1);
    this.shadowColor.setRGB(0.85 - fish.depth * 0.65, 0, 0);

    this.drawTail(fish, index);

    const gulp = Math.sin(Math.PI * clamp(fish.gulpAnimation / Math.max(FISH.feeding.animationDurationSeconds, 0.001), 0, 1));
    const rest = fish.state === SwimState.Hover ? 1 : fish.state === SwimState.Pivot ? 0.85
      : fish.state === SwimState.Burst ? 0 : fish.state === SwimState.Coast ? 0.36 : 0.22;
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      // The fin on the inside of a turn opens like a brake.
      const target = clamp(rest + gulp * 0.45 + clamp(fish.angularVelocity * sign * 0.42, 0, 0.6), 0, 1);
      const slot = index * 2 + side;
      this.finOpen[slot] += (target - this.finOpen[slot]) * (1 - Math.exp(-7 * dt));
      const open = this.finOpen[slot];
      // Pectorals scull alternately; a resting fish rows, a cruising one barely stirs.
      const scull = Math.sin(fish.finPhase + side * Math.PI) * (0.1 + open * 0.42);
      this.drawFin(fish, sign, 3, 0.85, PECTORAL, PECTORAL_LENGTH, 0.4 + open * 0.86 + scull, true);
      this.drawFin(fish, sign, 6, 0.8, PELVIC, PELVIC_LENGTH, 0.42 + open * 0.3 + scull * 0.3, false);
    }

    this.drawBody(fish, index, gulp);
    this.drawHead(fish, gulp);
  }

  // The motion is the platinum longfin's own (see fish-spine.ts); the outline and color are ours.
  private drawTail(fish: ShubunkinAgent, index: number): void {
    const opening = longTailOpening(fish), flex = longTailFlex(fish);
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1;
      const streak = (index + side) % 2 === 0;
      for (const triangle of TAIL_TRIANGLES) {
        for (const vertex of triangle) {
          const [t, width] = SHUBUNKIN_TAIL[vertex];
          this.tailPoint(this.shapeBatch, fish, t, width * sign * opening, flex, this.tailColor(fish, t, streak), false);
          this.tailPoint(this.shadowBatch, fish, t, width * sign * opening, flex, this.shadowColor, true);
        }
      }
      for (let ray = 0; ray < 3; ray++) {
        const color = this.tailColor(fish, 1.3, false).multiplyScalar(0.93);
        this.tailPoint(this.lineBatch, fish, 1.01, sign * 0.022 * opening, flex, color, false);
        this.tailPoint(this.lineBatch, fish, 1.34 + ray * 0.06, sign * (0.075 + ray * 0.06) * opening, flex, color, false);
      }
    }
  }

  // Translucent toward the tip, with an occasional calico streak near the root.
  private tailColor(fish: ShubunkinAgent, t: number, streak: boolean): THREE.Color {
    const s = clamp((t - 0.94) / 0.66, 0, 1);
    this.finColor.copy(FIN_ROOT).lerp(FIN_TIP, s);
    if (streak && s < 0.3) this.finColor.lerp(TONES[Tone.red], (0.3 - s) * 2);
    this.tint(this.finColor, fish.depth);
    return this.finColor.lerp(WATER_TINT, s * s * 0.2);
  }

  private tailPoint(batch: SurfaceGeometryBatch, fish: ShubunkinAgent, t: number, width: number, flex: number, color: THREE.Color, shadow: boolean): void {
    membranePoint(fish, LONG_TAIL_ANCHOR, t, width, flex, this.sample);
    this.point(batch, fish, this.sample.x, this.sample.y, color, shadow);
  }

  private drawFin(fish: ShubunkinAgent, sign: number, station: number, inset: number, contour: readonly (readonly [number, number])[], reach: number, angle: number, sharp: boolean): void {
    const length = fish.bodyLength * reach;
    const fx = this.stationFX[station], fy = this.stationFY[station];
    const nx = -fy * sign, ny = fx * sign;
    const rootX = this.stationX[station] + nx * BODY_WIDTH[station] * fish.bodyLength * inset;
    const rootY = this.stationY[station] + ny * BODY_WIDTH[station] * fish.bodyLength * inset;
    const theta = clamp(angle, 0.2, 1.5), cosine = Math.cos(theta), sine = Math.sin(theta);
    // A rigid sweep around the root, so a membrane can never turn inside out.
    const ux = -fx * cosine + nx * sine, uy = -fy * cosine + ny * sine;
    const vx = fx * sine + nx * cosine, vy = fy * sine + ny * cosine;
    this.finColor.copy(FIN_ROOT).lerp(FIN_TIP, sharp ? 0.55 : 0.4);
    this.tint(this.finColor, fish.depth);
    this.finColor.lerp(WATER_TINT, 0.14);
    for (let i = 1; i < contour.length - 1; i++) {
      for (const vertex of [0, i, i + 1]) {
        const [u, v] = contour[vertex];
        const x = rootX + (ux * u + vx * v) * length, y = rootY + (uy * u + vy * v) * length;
        this.point(this.shapeBatch, fish, x, y, this.finColor, false);
        this.point(this.shadowBatch, fish, x, y, this.shadowColor, true);
      }
    }
  }

  private drawBody(fish: ShubunkinAgent, index: number, gulp: number): void {
    const coat = this.coats[index], length = fish.bodyLength;
    for (let segment = 0; segment < SEGMENTS; segment++) {
      const widthA = this.bodyHalfWidth(segment, length, gulp), widthB = this.bodyHalfWidth(segment + 1, length, gulp);
      const t = (BODY_T[segment] + BODY_T[segment + 1]) * 0.5;
      // A soft scale glint sliding down the flank with the swimming wave.
      const wave = Math.sin(t * 10.5 - fish.swimPhase * 0.55 + fish.phaseOffset);
      const glint = wave > 0.72 ? (wave - 0.72) / 0.28 * this.shimmer : 0;
      const facing = -this.stationFY[segment] * this.sunX + this.stationFX[segment] * this.sunY;
      for (let band = 0; band < BANDS; band++) {
        const across = (BAND[band] + BAND[band + 1]) * 0.5;
        const lit = clamp(across * facing, -1, 1);
        this.color.copy(TONES[coat[segment * BANDS + band]]).multiplyScalar(BAND_SHADE[band] + lit * 0.16);
        if (glint > 0 && lit > 0) this.color.lerp(TONES[Tone.pearl], glint * 0.42);
        this.tint(this.color, fish.depth);
        const a = BAND[band], b = BAND[band + 1];
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

  private bodyHalfWidth(station: number, length: number, gulp: number): number {
    return BODY_WIDTH[station] * length * (station < 2 ? 1 + gulp * 0.3 : 1);
  }

  private bodyPoint(batch: SurfaceGeometryBatch, fish: ShubunkinAgent, station: number, across: number, color: THREE.Color, shadow: boolean): void {
    this.point(batch, fish, this.stationX[station] - this.stationFY[station] * across, this.stationY[station] + this.stationFX[station] * across, color, shadow);
  }

  private drawHead(fish: ShubunkinAgent, gulp: number): void {
    const length = fish.bodyLength;
    // A dorsal fin that leans against the swimming wave, then eyes, gills and mouth.
    this.color.copy(DORSAL); this.tint(this.color, fish.depth);
    const sway = Math.sin(fish.swimPhase - 2) * length * 0.022;
    this.localPoint(fish, 0.3, 0, this.color);
    this.localPoint(fish, 0.48, sway + length * 0.016, this.color);
    this.localPoint(fish, 0.48, sway - length * 0.016, this.color);
    this.localPoint(fish, 0.48, sway + length * 0.016, this.color);
    this.localPoint(fish, 0.48, sway - length * 0.016, this.color);
    this.localPoint(fish, 0.66, sway * 1.7, this.color);
    this.localPoint(fish, 0.3, 0, this.color);
    this.localPoint(fish, 0.48, sway * 0.5, this.color);
    this.localPoint(fish, 0.66, sway * 1.7, this.color);

    this.color.copy(EYE); this.tint(this.color, fish.depth * 0.6);
    const finColor = this.finColor.copy(GLINT); this.tint(finColor, fish.depth);
    const eyeRadius = Math.max(0.85, length * 0.038), eyeAcross = length * 0.074;
    sampleSwimSpine(fish, 0.085, this.sample);
    const eyeX = this.sample.x, eyeY = this.sample.y, fx = this.sample.forwardX, fy = this.sample.forwardY;
    for (let side = -1; side <= 1; side += 2) {
      const cx = eyeX - fy * eyeAcross * side, cy = eyeY + fx * eyeAcross * side;
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2, b = (i + 1) * Math.PI / 2;
        this.point(this.shapeBatch, fish, cx, cy, this.color, false);
        this.point(this.shapeBatch, fish, cx + Math.cos(a) * eyeRadius, cy + Math.sin(a) * eyeRadius, this.color, false);
        this.point(this.shapeBatch, fish, cx + Math.cos(b) * eyeRadius, cy + Math.sin(b) * eyeRadius, this.color, false);
      }
      const gx = cx + this.sunX * eyeRadius * 0.34, gy = cy + this.sunY * eyeRadius * 0.34;
      this.point(this.shapeBatch, fish, gx - 0.42, gy + 0.3, finColor, false);
      this.point(this.shapeBatch, fish, gx + 0.42, gy + 0.3, finColor, false);
      this.point(this.shapeBatch, fish, gx, gy - 0.5, finColor, false);
    }

    // The mouth opens with the existing surface gulp.
    this.color.copy(MOUTH);
    const tipX = this.stationX[0], tipY = this.stationY[0], tipFX = this.stationFX[0], tipFY = this.stationFY[0];
    const mouth = gulp * length * 0.036;
    this.point(this.shapeBatch, fish, tipX + tipFX * mouth, tipY + tipFY * mouth, this.color, false);
    this.point(this.shapeBatch, fish, tipX - tipFX * mouth * 0.6 - tipFY * mouth, tipY - tipFY * mouth * 0.6 + tipFX * mouth, this.color, false);
    this.point(this.shapeBatch, fish, tipX - tipFX * mouth * 0.6 + tipFY * mouth, tipY - tipFY * mouth * 0.6 - tipFX * mouth, this.color, false);

    this.color.copy(TONES[Tone.deep]).multiplyScalar(0.72); this.tint(this.color, fish.depth);
    for (let side = -1; side <= 1; side += 2) {
      this.gillPoint(fish, 0.165, side * 0.058); this.gillPoint(fish, 0.205, side * 0.1);
      this.gillPoint(fish, 0.205, side * 0.1); this.gillPoint(fish, 0.19, side * 0.138);
    }
  }

  private localPoint(fish: ShubunkinAgent, t: number, across: number, color: THREE.Color): void {
    sampleSwimSpine(fish, t, this.sample);
    this.point(this.shapeBatch, fish, this.sample.x - this.sample.forwardY * across, this.sample.y + this.sample.forwardX * across, color, false);
  }

  private gillPoint(fish: ShubunkinAgent, t: number, across: number): void {
    sampleSwimSpine(fish, t, this.sample);
    const width = across * fish.bodyLength;
    this.point(this.lineBatch, fish, this.sample.x - this.sample.forwardY * width, this.sample.y + this.sample.forwardX * width, this.color, false);
  }

  private tint(color: THREE.Color, depth: number): void {
    color.lerp(WATER_TINT, depth * 0.38).multiplyScalar(1 - depth * 0.3);
  }

  private point(batch: SurfaceGeometryBatch, fish: ShubunkinAgent, x: number, y: number, color: THREE.Color, shadow: boolean): void {
    const scale = shadow ? this.shadowScale : 1;
    batch.pointXY(fish.position.x + (x - fish.position.x) * scale + (shadow ? this.shadowX : 0),
      fish.position.y + (y - fish.position.y) * scale + (shadow ? this.shadowY : 0), color);
  }
}
