import * as THREE from "three";
import { ButterflyKoiPopulation, type ButterflyKoiAgent } from "./butterfly-koi";
import { SurfaceGeometryBatch } from "./surface-geometry";
import type { SurfaceWeather } from "./weather-pass";
import { buildRenderSpine, sampleSwimSpine } from "./fish-spine";
import { SwimState } from "./koi";
import { FISH, MAX_BUTTERFLY_KOI } from "./config";

type Vertex = readonly [number, number];
// Coordinates are fractions of body length, measured back from the snout.
// Reference: normal-bodied platinum longfin koi; broad membranes taper into a fork.
const TAIL: readonly Vertex[] = [
  [0.94, 0.025], [1.08, 0.07], [1.26, 0.19], [1.46, 0.23],
  [1.68, 0.17], [1.74, 0.10], [1.51, 0.08], [1.30, 0.035], [1.1, 0.014],
];
const PECTORAL: readonly Vertex[] = [[0.2, 0.08], [0.27, 0.20], [0.41, 0.34], [0.55, 0.38], [0.68, 0.28], [0.56, 0.15], [0.35, 0.085]];
const PELVIC: readonly Vertex[] = [[0.58, 0.085], [0.7, 0.17], [0.87, 0.19], [0.94, 0.12], [0.77, 0.055]];
const BODY: readonly Vertex[] = [[0, 0.027], [0.09, 0.075], [0.24, 0.145], [0.44, 0.132], [0.65, 0.087], [0.85, 0.037], [1, 0.016]];
function triangulate(contour: readonly Vertex[]): readonly number[][] {
  return THREE.ShapeUtils.triangulateShape(contour.map(([x, y]) => new THREE.Vector2(x, y)), []);
}
const FINS = [TAIL, PECTORAL, PELVIC].map(contour => ({ contour, triangles: triangulate(contour) }));
const WHITE = new THREE.Color(0xe6ece8), FIN = new THREE.Color(0xc8dcd7);
const EYE = new THREE.Color(0x253b3d), WATER_TINT = new THREE.Color(0x548775);
// Budgets are vertices per fish; SurfaceGeometryBatch capacity is FLOAT slots.
const finVertices = FINS.reduce((sum, fin) => sum + fin.triangles.length * 3 * 2, 0);
const bodyVertices = (BODY.length - 1) * 3 * 12;
export const BUTTERFLY_KOI_VERTEX_BUDGET = {
  body: bodyVertices + 9, membranes: finVertices,
  shapes: bodyVertices + finVertices + 9, shadows: bodyVertices + finVertices, lines: 12,
} as const;

export class ButterflyKoiRenderer {
  public readonly group = new THREE.Group();
  public readonly shadowGroup = new THREE.Group();
  private readonly shapes = new THREE.BufferGeometry();
  private readonly shadows = new THREE.BufferGeometry();
  private readonly lines = new THREE.BufferGeometry();
  private readonly shapeBatch = new SurfaceGeometryBatch(this.shapes, BUTTERFLY_KOI_VERTEX_BUDGET.shapes * MAX_BUTTERFLY_KOI * 3, true);
  private readonly shadowBatch = new SurfaceGeometryBatch(this.shadows, BUTTERFLY_KOI_VERTEX_BUDGET.shadows * MAX_BUTTERFLY_KOI * 3, true);
  private readonly lineBatch = new SurfaceGeometryBatch(this.lines, BUTTERFLY_KOI_VERTEX_BUDGET.lines * MAX_BUTTERFLY_KOI * 3, true);
  private readonly color = new THREE.Color();
  private readonly finColor = new THREE.Color();
  private readonly rayColor = new THREE.Color();
  private readonly shadowColor = new THREE.Color();
  private readonly eyeColor = new THREE.Color();
  private readonly order: number[] = [];
  private readonly sample = { x: 0, y: 0, forwardX: 1, forwardY: 0 };
  private shadowX = 0;
  private shadowY = 0;
  private shadowScale = 1;

  public constructor() {
    this.shapes.name = "platinum butterfly koi bodies and long fins";
    this.shadows.name = "platinum butterfly koi shadows";
    this.lines.name = "platinum butterfly koi fin rays";
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
    // The medium fish lie beneath the koi in the shared underwater scene.
    mesh.renderOrder = -2; rays.renderOrder = -1;
    this.group.add(mesh, rays); this.shadowGroup.add(shadow);
  }

  public update(population: ButterflyKoiPopulation, weather?: Readonly<SurfaceWeather>): void {
    this.shapeBatch.reset(); this.shadowBatch.reset(); this.lineBatch.reset();
    this.order.length = population.count;
    for (let index = 0; index < population.count; index++) this.order[index] = index;
    for (let i = 1; i < this.order.length; i++) {
      const index = this.order[i]; let j = i;
      while (j > 0 && population.fish[this.order[j - 1]].depth < population.fish[index].depth) {
        this.order[j] = this.order[j - 1]; j--;
      }
      this.order[j] = index;
    }
    for (const index of this.order) {
      const fish = population.fish[index];
      buildRenderSpine(fish);
      const gulpProgress = fish.gulpAnimation / Math.max(FISH.feeding.animationDurationSeconds, 0.001);
      const paddleActivity = (fish.state === SwimState.Hover ? 1 : fish.state === SwimState.Pivot ? 0.85 : 0.45)
        + Math.sin(Math.PI * gulpProgress) * 0.85;
      const finPulse = 0.82 + paddleActivity * 0.25 * Math.sin(fish.finPhase);
      this.shadowScale = 0.98 - fish.depth * 0.12;
      this.shadowX = -(weather?.lightDirection.x ?? -0.58) * (3 + fish.depth * 7) * (weather?.shadowScale ?? 1);
      this.shadowY = (weather?.lightDirection.y ?? 0.82) * (3 + fish.depth * 7) * (weather?.shadowScale ?? 1);
      this.shadowColor.setRGB(0.85 - fish.depth * 0.65, 0, 0);
      this.tint(this.finColor.copy(FIN), fish.depth);
      this.rayColor.copy(this.finColor).multiplyScalar(0.9);
      this.tint(this.eyeColor.copy(EYE), fish.depth);
      for (let sign = -1; sign <= 1; sign += 2) {
        for (let finIndex = 0; finIndex < FINS.length; finIndex++) {
          const fin = FINS[finIndex];
          for (const triangle of fin.triangles) {
            for (const vertex of triangle) {
              const [t, width] = fin.contour[vertex];
              const opening = finIndex === 0 ? 0.88 + Math.sin(fish.swimPhase - 0.8) * 0.08 : finPulse;
              this.finVertex(this.shapeBatch, fish, finIndex, t, width * sign * opening, this.finColor);
              this.finVertex(this.shadowBatch, fish, finIndex, t, width * sign * opening, this.shadowColor, true);
            }
          }
        }
        for (let ray = 0; ray < 3; ray++) {
          const opening = 0.88 + Math.sin(fish.swimPhase - 0.8) * 0.08;
          this.finVertex(this.lineBatch, fish, 0, 1.01, sign * 0.022 * opening, this.rayColor);
          this.finVertex(this.lineBatch, fish, 0, 1.42 + ray * 0.065, sign * (0.07 + ray * 0.047) * opening, this.rayColor);
        }
      }
      for (let segment = 0; segment < BODY.length - 1; segment++) {
        const [start, startWidth] = BODY[segment], [end, endWidth] = BODY[segment + 1];
        // Keep the authored silhouette while giving its curved centerline
        // enough longitudinal vertices to bend visibly at pixel resolution.
        for (let part = 0; part < 3; part++) {
          const a = start + (end - start) * part / 3, b = start + (end - start) * (part + 1) / 3;
          const wa = startWidth + (endWidth - startWidth) * part / 3, wb = startWidth + (endWidth - startWidth) * (part + 1) / 3;
          for (let sign = -1; sign <= 1; sign += 2) {
            this.bodyVertex(fish, a, 0, true); this.bodyVertex(fish, a, wa * sign, false); this.bodyVertex(fish, b, wb * sign, false);
            this.bodyVertex(fish, a, 0, true); this.bodyVertex(fish, b, wb * sign, false); this.bodyVertex(fish, b, 0, true);
            this.vertex(this.shadowBatch, fish, a, 0, this.shadowColor, true);
            this.vertex(this.shadowBatch, fish, a, wa * sign, this.shadowColor, true);
            this.vertex(this.shadowBatch, fish, b, wb * sign, this.shadowColor, true);
            this.vertex(this.shadowBatch, fish, a, 0, this.shadowColor, true);
            this.vertex(this.shadowBatch, fish, b, wb * sign, this.shadowColor, true);
            this.vertex(this.shadowBatch, fish, b, 0, this.shadowColor, true);
          }
        }
      }
      // A restrained dorsal ridge and eyes keep the metallic body readable.
      this.color.copy(this.finColor).multiplyScalar(0.83);
      this.vertex(this.shapeBatch, fish, 0.3, 0, this.color);
      this.vertex(this.shapeBatch, fish, 0.57, -0.035, this.color);
      this.vertex(this.shapeBatch, fish, 0.7, 0.006, this.color);
      for (let sign = -1; sign <= 1; sign += 2) {
        this.vertex(this.shapeBatch, fish, 0.045, sign * 0.05, this.eyeColor);
        this.vertex(this.shapeBatch, fish, 0.095, sign * 0.055, this.eyeColor);
        this.vertex(this.shapeBatch, fish, 0.07, sign * 0.078, this.eyeColor);
      }
    }
    this.shapeBatch.commit(); this.shadowBatch.commit(); this.lineBatch.commit();
  }

  private bodyVertex(fish: ButterflyKoiAgent, t: number, width: number, ridge: boolean): void {
    this.color.copy(WHITE);
    if (ridge) this.color.multiplyScalar(1.015);
    else this.color.multiplyScalar(0.83);
    this.tint(this.color, fish.depth);
    this.vertex(this.shapeBatch, fish, t, width, this.color);
  }

  private tint(color: THREE.Color, depth: number): void {
    color.lerp(WATER_TINT, depth * 0.38).multiplyScalar(1 - depth * 0.3);
  }

  private vertex(batch: SurfaceGeometryBatch, fish: ButterflyKoiAgent, t: number, width: number, color: THREE.Color, shadow = false): void {
    sampleSwimSpine(fish, t, this.sample);
    const { forwardX, forwardY } = this.sample;
    let { x, y } = this.sample;
    x -= forwardY * width * fish.bodyLength;
    y += forwardX * width * fish.bodyLength;
    this.point(batch, fish, x, y, color, shadow);
  }

  private finVertex(batch: SurfaceGeometryBatch, fish: ButterflyKoiAgent, fin: number, t: number, width: number, color: THREE.Color, shadow = false): void {
    // A membrane is attached to ONE spine tangent. Sampling a different tangent
    // at every contour point folds wide chest fins inside out during sharp turns.
    const anchor = fin === 0 ? 0.97 : fin === 1 ? 0.25 : 0.64;
    sampleSwimSpine(fish, anchor, this.sample);
    const along = (t - anchor) * fish.bodyLength;
    const flex = fin === 0 ? Math.sin(fish.swimPhase - 1.4) * 0.06 * (0.25 + fish.tailEffort)
      : Math.sin(fish.finPhase) * 0.035;
    const across = width * fish.bodyLength + along * (flex + fish.turnBend * 0.025);
    const {x, y, forwardX, forwardY} = this.sample;
    this.point(batch, fish, x - forwardX * along - forwardY * across,
      y - forwardY * along + forwardX * across, color, shadow);
  }

  private point(batch: SurfaceGeometryBatch, fish: ButterflyKoiAgent, x: number, y: number, color: THREE.Color, shadow: boolean): void {
    const scale = shadow ? this.shadowScale : 1;
    batch.pointXY(fish.position.x + (x - fish.position.x) * scale + (shadow ? this.shadowX : 0),
      fish.position.y + (y - fish.position.y) * scale + (shadow ? this.shadowY : 0), color);
  }
}
