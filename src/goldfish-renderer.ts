import * as THREE from "three";
import { GoldfishPopulation, type GoldfishAgent } from "./goldfish";
import { SurfaceGeometryBatch } from "./surface-geometry";
import type { SurfaceWeather } from "./weather-pass";

type Vertex = readonly [number, number];
// Coordinates are fractions of body length, measured back from the snout.
// Each side of the split caudal fin has its own two tips and rounded shoulder.
const TAIL: readonly Vertex[] = [
  [0.94, 0.025], [1.08, 0.09], [1.24, 0.255], [1.39, 0.29],
  [1.36, 0.235], [1.25, 0.15], [1.46, 0.095], [1.4, 0.04], [1.13, 0.018],
];
const PECTORAL: readonly Vertex[] = [[0.19, 0.075], [0.24, 0.15], [0.34, 0.25], [0.43, 0.235], [0.44, 0.175], [0.35, 0.09]];
const PELVIC: readonly Vertex[] = [[0.57, 0.105], [0.69, 0.165], [0.77, 0.13], [0.7, 0.055]];
const BODY: readonly Vertex[] = [[0, 0.035], [0.1, 0.1], [0.24, 0.17], [0.43, 0.157], [0.65, 0.108], [0.85, 0.045], [1, 0.017]];
function triangulate(contour: readonly Vertex[]): readonly number[][] {
  return THREE.ShapeUtils.triangulateShape(contour.map(([x, y]) => new THREE.Vector2(x, y)), []);
}
const FINS = [TAIL, PECTORAL, PELVIC].map(contour => ({ contour, triangles: triangulate(contour) }));
const RED = new THREE.Color(0xd95130), WHITE = new THREE.Color(0xf2eddb);
const EYE = new THREE.Color(0x283b32), WATER_TINT = new THREE.Color(0x548775);

export class GoldfishRenderer {
  public readonly group = new THREE.Group();
  public readonly shadowGroup = new THREE.Group();
  private readonly shapes = new THREE.BufferGeometry();
  private readonly shadows = new THREE.BufferGeometry();
  private readonly lines = new THREE.BufferGeometry();
  private readonly shapeBatch = new SurfaceGeometryBatch(this.shapes, 32_768, true);
  private readonly shadowBatch = new SurfaceGeometryBatch(this.shadows, 16_384, true);
  private readonly lineBatch = new SurfaceGeometryBatch(this.lines, 4_096, true);
  private readonly color = new THREE.Color();
  private readonly finColor = new THREE.Color();
  private readonly rayColor = new THREE.Color();
  private readonly shadowColor = new THREE.Color();
  private readonly eyeColor = new THREE.Color();
  private readonly order: number[] = [];
  private forwardX = 1;
  private forwardY = 0;
  private shadowX = 0;
  private shadowY = 0;
  private shadowScale = 1;

  public constructor() {
    this.shapes.name = "wakin bodies and split tails";
    this.shadows.name = "wakin shadows";
    this.lines.name = "wakin fin rays";
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

  public update(population: GoldfishPopulation, weather?: Readonly<SurfaceWeather>): void {
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
      this.forwardX = Math.cos(fish.heading); this.forwardY = Math.sin(fish.heading);
      this.shadowScale = 0.98 - fish.depth * 0.12;
      this.shadowX = -(weather?.lightDirection.x ?? -0.58) * (3 + fish.depth * 7) * (weather?.shadowScale ?? 1);
      this.shadowY = (weather?.lightDirection.y ?? 0.82) * (3 + fish.depth * 7) * (weather?.shadowScale ?? 1);
      this.shadowColor.setRGB(0.85 - fish.depth * 0.65, 0, 0);
      this.tint(this.finColor.copy(fish.palette === 0 ? RED : WHITE).lerp(WHITE, 0.25), fish.depth);
      this.rayColor.copy(this.finColor).multiplyScalar(0.76);
      this.tint(this.eyeColor.copy(EYE), fish.depth);
      for (let sign = -1; sign <= 1; sign += 2) {
        for (let finIndex = 0; finIndex < FINS.length; finIndex++) {
          const fin = FINS[finIndex];
          for (const triangle of fin.triangles) {
            for (const vertex of triangle) {
              const [t, width] = fin.contour[vertex];
              const opening = finIndex === 0 ? 0.88 + Math.sin(fish.tailPhase - 1.1) * 0.1 : 0.88 + Math.sin(fish.finPhase + sign * 0.7) * 0.12;
              this.vertex(this.shapeBatch, fish, t, width * sign * opening, this.finColor);
              if (finIndex === 0) this.vertex(this.shadowBatch, fish, t, width * sign * opening, this.shadowColor, true);
            }
          }
        }
        for (let ray = 0; ray < 3; ray++) {
          this.vertex(this.lineBatch, fish, 1.01, sign * 0.022, this.rayColor);
          this.vertex(this.lineBatch, fish, 1.27 + ray * 0.045, sign * (0.075 + ray * 0.065), this.rayColor);
        }
      }
      for (let segment = 0; segment < BODY.length - 1; segment++) {
        const [a, wa] = BODY[segment], [b, wb] = BODY[segment + 1];
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
      // A narrow dorsal ridge, small head and close-set eyes differ from koi.
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

  private bodyVertex(fish: GoldfishAgent, t: number, width: number, ridge: boolean): void {
    const redPatch = fish.palette === 0 || (fish.palette === 1 &&
      (t > 0.09 && t < 0.36 + Math.sin(fish.phase + width * 20) * 0.055 || t > 0.61 && t < 0.79));
    this.color.copy(redPatch ? RED : WHITE);
    if (ridge) this.color.lerp(WHITE, redPatch ? 0.14 : 0.09);
    else this.color.multiplyScalar(0.82);
    this.tint(this.color, fish.depth);
    this.vertex(this.shapeBatch, fish, t, width, this.color);
  }

  private tint(color: THREE.Color, depth: number): void {
    color.lerp(WATER_TINT, depth * 0.38).multiplyScalar(1 - depth * 0.3);
  }

  private vertex(batch: SurfaceGeometryBatch, fish: GoldfishAgent, t: number, width: number, color: THREE.Color, shadow = false): void {
    const envelope = Math.pow(Math.min(t, 1), 2.3);
    const bodyWave = Math.sin(fish.tailPhase - t * 3.2) * 0.055 * fish.effort * envelope;
    const trailingFin = t > 1 ? Math.sin(fish.tailPhase - t * 4.1) * (t - 1) * 0.065 : 0;
    const lateral = (width + bodyWave + trailingFin - fish.angularVelocity * envelope * 0.025) * fish.bodyLength;
    const axial = -t * fish.bodyLength;
    const scale = shadow ? this.shadowScale : 1;
    batch.pointXY(fish.position.x + (this.forwardX * axial - this.forwardY * lateral) * scale + (shadow ? this.shadowX : 0),
      fish.position.y + (this.forwardY * axial + this.forwardX * lateral) * scale + (shadow ? this.shadowY : 0), color);
  }
}
