import * as THREE from "three";
import {
  LOTUS,
  LOTUS_FLOWERS,
  LOTUS_LEAVES,
  viewportPoint,
  RIPPLES,
  flowerLeafIndex,
} from "./config";
import { duckweedRippleDisplacement } from "./duckweed-geometry";
import type { RippleSystem } from "./ripple-system";
import type { SurfaceWeather } from "./weather-pass";

interface Point {
  x: number;
  y: number;
}

interface LeafPalette {
  base: THREE.Color;
  light: THREE.Color;
  shade: THREE.Color;
  vein: THREE.Color;
  center: THREE.Color;
}

interface FlowerPalette {
  outerPetal: THREE.Color;
  innerPetal: THREE.Color;
  petalLight: THREE.Color;
  center: THREE.Color;
  centerDark: THREE.Color;
}

const TAU = Math.PI * 2;

const PALETTES: readonly LeafPalette[] = LOTUS.leafPalettes.map((palette) => ({
  base: new THREE.Color(palette.base),
  light: new THREE.Color(palette.light),
  shade: new THREE.Color(palette.shade),
  vein: new THREE.Color(palette.vein),
  center: new THREE.Color(palette.center),
}));

const FLOWER_PALETTES: readonly FlowerPalette[] = LOTUS.flowerPalettes.map(
  (palette) => ({
    outerPetal: new THREE.Color(palette.outerPetal),
    innerPetal: new THREE.Color(palette.innerPetal),
    petalLight: new THREE.Color(palette.petalLight),
    center: new THREE.Color(palette.center),
    centerDark: new THREE.Color(palette.centerDark),
  }),
);

// Collects static, local-space geometry. Built once per refreshConfig; only
// object transforms change per frame.
class LotusGeometryBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];

  public get vertexCount(): number {
    return this.positions.length / 3;
  }

  public point(point: Point, color: THREE.Color): void {
    this.positions.push(point.x, point.y, 0);
    this.colors.push(color.r, color.g, color.b);
  }

  public triangle(
    a: Point,
    b: Point,
    c: Point,
    color: THREE.Color,
  ): void {
    this.point(a, color);
    this.point(b, color);
    this.point(c, color);
  }

  public triangleColors(
    a: Point,
    b: Point,
    c: Point,
    colorA: THREE.Color,
    colorB: THREE.Color,
    colorC: THREE.Color,
  ): void {
    this.point(a, colorA);
    this.point(b, colorB);
    this.point(c, colorC);
  }

  public line(a: Point, b: Point, color: THREE.Color): void {
    this.point(a, color);
    this.point(b, color);
  }

  public circle(center: Point, radius: number, color: THREE.Color): void {
    for (let index = 0; index < 8; index += 1) {
      const angleA = (index / 8) * TAU;
      const angleB = ((index + 1) / 8) * TAU;
      this.triangle(
        center,
        {
          x: center.x + Math.cos(angleA) * radius,
          y: center.y + Math.sin(angleA) * radius,
        },
        {
          x: center.x + Math.cos(angleB) * radius,
          y: center.y + Math.sin(angleB) * radius,
        },
        color,
      );
    }
  }

  public toGeometry(name: string): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(this.positions), 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.BufferAttribute(new Float32Array(this.colors), 3),
    );
    geometry.name = name;
    return geometry;
  }
}

interface LotusLeafMesh {
  group: THREE.Group;
  shadowMesh: THREE.Mesh;
  geometries: THREE.BufferGeometry[];
}

interface LotusFlowerMesh {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
}

export class LotusLeavesPass {
  public readonly shadowGroup = new THREE.Group();
  public readonly group = new THREE.Group();

  private readonly leafCenterColor = new THREE.Color();
  private readonly leafEdgeColorA = new THREE.Color();
  private readonly leafEdgeColorB = new THREE.Color();
  private readonly shadowMaterial = new THREE.MeshBasicMaterial({
    color: LOTUS.shadow.color,
    opacity: LOTUS.shadow.opacity,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly leafMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly veinMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private readonly flowerMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private leaves: LotusLeafMesh[] = [];
  private flowers: LotusFlowerMesh[] = [];
  // Per-frame scratch: animated center of each built leaf.
  private leafCenters: Point[] = [];

  public constructor() {
    this.refreshConfig();
  }

  public refreshConfig(): void {
    this.shadowMaterial.color.setHex(LOTUS.shadow.color);
    this.shadowMaterial.opacity = LOTUS.shadow.opacity;
    for (const [index, palette] of LOTUS.leafPalettes.entries()) {
      const target = PALETTES[index];
      if (!target) continue;
      target.base.setHex(palette.base);
      target.light.setHex(palette.light);
      target.shade.setHex(palette.shade);
      target.vein.setHex(palette.vein);
      target.center.setHex(palette.center);
    }
    for (const [index, palette] of LOTUS.flowerPalettes.entries()) {
      const target = FLOWER_PALETTES[index];
      if (!target) continue;
      target.outerPetal.setHex(palette.outerPetal);
      target.innerPetal.setHex(palette.innerPetal);
      target.petalLight.setHex(palette.petalLight);
      target.center.setHex(palette.center);
      target.centerDark.setHex(palette.centerDark);
    }
    this.rebuild();
  }

  public update(time: number, ripples?: RippleSystem, weather?: Readonly<SurfaceWeather>): void {
    const wind = weather?.wind ?? 0;
    const shadowScale = weather?.shadowScale ?? 1;
    const shadowX = -(weather?.lightDirection.x ?? -0.58) / 0.58;
    const shadowY = (weather?.lightDirection.y ?? 0.82) / 0.82;
    if (
      LOTUS_LEAVES.length !== this.leaves.length ||
      LOTUS_FLOWERS.length !== this.flowers.length
    ) {
      this.rebuild();
    }

    const visibleLeafCount = LOTUS.visibleLeafCount;
    const visibleFlowerCount = LOTUS.visibleFlowerCount;
    const shadowOffset = LOTUS.shadow.offset;
    // Use the same expanding fronts as duckweed; larger leaves move less.
    const surfaceRipples = (ripples?.instances ?? []).filter(r => r.alive && r.age >= 0).map(r => ({
      x: r.center.x, y: r.center.y, age: r.age, strength: r.strength * (r.type === "rain" ? 0.12 : 1),
      lifetime: RIPPLES.types[r.type].lifetime,
      startRadius: RIPPLES.types[r.type].startRadius,
      expansionSpeed: RIPPLES.types[r.type].expansionSpeed,
    }));

    for (const [leafIndex, mesh] of this.leaves.entries()) {
      const visible = leafIndex < visibleLeafCount;
      mesh.group.visible = visible;
      mesh.shadowMesh.visible = visible;
      if (!visible) continue;

      const leaf = LOTUS_LEAVES[leafIndex];
      const elevation = 0.3 + (0.5 + Math.sin(leaf.phase * 1.7) * 0.5) * 0.7;
      const placement = viewportPoint(leaf.x, leaf.y);
      const response = duckweedRippleDisplacement(placement.x, placement.y, surfaceRipples, {
        strength: 1.15 * (1 - elevation * 0.6), bandWidth: 12, falloffDistance: 100, maxPush: 0.85, spin: 0.008,
      });
      const centerX =
        placement.x + Math.sin(time * 0.12 + leaf.phase) * LOTUS.driftX + response.pushX;
      const centerY =
        placement.y +
        Math.cos(time * 0.15 + leaf.phase * 1.3) * LOTUS.driftY + response.pushY;
      const sway =
        Math.sin(time * 0.085 + leaf.phase) * LOTUS.rotationAmount + response.spin;
      const tilt = 0.88 + Math.sin(leaf.phase * 1.7) * 0.075;
      const rocking = Math.sin(time * (0.45 + wind * 0.28) + leaf.phase) * (0.008 + wind * 0.014);

      const center = this.leafCenters[leafIndex];
      center.x = centerX;
      center.y = centerY;

      mesh.group.position.set(centerX, centerY, 0);
      mesh.group.rotation.z = sway;
      mesh.group.scale.set(1, tilt + rocking + response.spin * 0.3, 1);
      mesh.shadowMesh.position.set(
        centerX + shadowOffset.x * elevation * shadowScale * shadowX,
        centerY + shadowOffset.y * elevation * shadowScale * shadowY + rocking * leaf.radius * LOTUS.radiusScale,
        0,
      );
      mesh.shadowMesh.rotation.z = sway;
      mesh.shadowMesh.scale.set(1 + elevation * 0.02, tilt * 1.02, 1);
    }

    for (const [flowerIndex, mesh] of this.flowers.entries()) {
      const flower = LOTUS_FLOWERS[flowerIndex];
      const leafIndex = flowerLeafIndex(flowerIndex);
      const leaf = LOTUS_LEAVES[leafIndex];
      const visible =
        flowerIndex < visibleFlowerCount &&
        leafIndex >= 0 &&
        leaf !== undefined &&
        this.leafCenters[leafIndex] !== undefined;
      mesh.mesh.visible = visible;
      if (!visible) continue;

      const center = this.leafCenters[leafIndex];
      mesh.mesh.position.set(
        center.x + flower.offsetX,
        center.y + flower.offsetY,
        0,
      );
      mesh.mesh.rotation.z = Math.sin(time * 0.12 + leaf.phase) * 0.04;
    }
  }

  private rebuild(): void {
    this.disposeMeshes();

    const leaves: LotusLeafMesh[] = [];
    for (const [leafIndex, leaf] of LOTUS_LEAVES.entries()) {
      const palette = PALETTES[
        ((leaf.palette % PALETTES.length) + PALETTES.length) % PALETTES.length
      ];
      const radius = leaf.radius * LOTUS.radiusScale;
      const origin = { x: 0, y: 0 };

      // Leaf triangles come first so the shadow can draw just that range of
      // the same position buffer (the center circle would double-blend).
      const leafBuilder = new LotusGeometryBuilder();
      this.drawLeaf(leafBuilder, origin, radius, leaf.angle, leaf.phase, palette);
      const leafTriangleVertices = leafBuilder.vertexCount;
      leafBuilder.circle(origin, Math.max(0.5, radius * 0.035), palette.center);
      leafBuilder.circle({x:-radius * 0.015,y:-radius * 0.025}, Math.max(0.3, radius * 0.019), palette.vein);
      const leafGeometry = leafBuilder.toGeometry(`lotus leaf ${leafIndex}`);

      const shadowGeometry = new THREE.BufferGeometry();
      shadowGeometry.setAttribute("position", leafGeometry.getAttribute("position"));
      shadowGeometry.setDrawRange(0, leafTriangleVertices);
      shadowGeometry.name = `lotus shadow ${leafIndex}`;

      const veinBuilder = new LotusGeometryBuilder();
      this.drawVeins(veinBuilder, origin, radius, leaf.angle, leaf.phase, palette);
      const veinGeometry = veinBuilder.toGeometry(`lotus veins ${leafIndex}`);

      const leafMesh = new THREE.Mesh(leafGeometry, this.leafMaterial);
      const veins = new THREE.LineSegments(veinGeometry, this.veinMaterial);
      const shadowMesh = new THREE.Mesh(shadowGeometry, this.shadowMaterial);
      leafMesh.frustumCulled = false;
      veins.frustumCulled = false;
      shadowMesh.frustumCulled = false;
      leafMesh.renderOrder = 1;
      veins.renderOrder = 2;

      const group = new THREE.Group();
      group.add(leafMesh, veins);
      this.group.add(group);
      this.shadowGroup.add(shadowMesh);
      leaves.push({
        group,
        shadowMesh,
        geometries: [leafGeometry, shadowGeometry, veinGeometry],
      });
    }
    this.leaves = leaves;
    this.leafCenters = leaves.map(() => ({ x: 0, y: 0 }));

    const flowers: LotusFlowerMesh[] = [];
    for (const [flowerIndex, flower] of LOTUS_FLOWERS.entries()) {
      const builder = new LotusGeometryBuilder();
      this.drawFlower(
        builder,
        { x: 0, y: 0 },
        flower.radius * LOTUS.flowerRadiusScale,
        flower.rotation,
        FLOWER_PALETTES[
          ((flower.palette % FLOWER_PALETTES.length) +
            FLOWER_PALETTES.length) %
            FLOWER_PALETTES.length
        ],
      );
      const geometry = builder.toGeometry(`lotus flower ${flowerIndex}`);
      const mesh = new THREE.Mesh(geometry, this.flowerMaterial);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      flowers.push({ mesh, geometry });
    }
    this.flowers = flowers;
  }

  private disposeMeshes(): void {
    for (const leaf of this.leaves) {
      this.group.remove(leaf.group);
      this.shadowGroup.remove(leaf.shadowMesh);
      for (const geometry of leaf.geometries) geometry.dispose();
    }
    for (const flower of this.flowers) {
      this.group.remove(flower.mesh);
      flower.geometry.dispose();
    }
    this.leaves = [];
    this.flowers = [];
    this.leafCenters = [];
  }

  private edgePoint(
    center: Point,
    radius: number,
    angle: number,
    phase: number,
  ): Point {
    const wobble =
      1 + Math.sin(angle * 2 + phase) * 0.045 + Math.cos(angle * 5 - phase) * 0.022
      + Math.sin(angle + phase * 1.3) * 0.055;
    return {
      x: center.x + Math.cos(angle) * radius * wobble,
      y: center.y + Math.sin(angle) * radius * LOTUS.verticalScale * wobble,
    };
  }

  private drawLeaf(
    builder: LotusGeometryBuilder,
    center: Point,
    radius: number,
    angle: number,
    phase: number,
    palette: LeafPalette,
  ): void {
    const start = angle + LOTUS.notchHalfAngle;
    const span = TAU - LOTUS.notchHalfAngle * 2;

    const youth = Math.max(0, Math.min(1, (25 - radius) / 15));
    this.leafCenterColor.copy(palette.base).lerp(palette.center, 0.45).lerp(palette.light, youth * 0.1);

    for (let index = 0; index < LOTUS.leafSegments; index += 1) {
      const angleA = start + (index / LOTUS.leafSegments) * span;
      const angleB = start + ((index + 1) / LOTUS.leafSegments) * span;
      this.leafColorAt(this.leafEdgeColorA, palette, angleA, phase);
      this.leafColorAt(this.leafEdgeColorB, palette, angleB, phase);
      const rimA = 0.87 + Math.sin(angleA * 3 + phase) * (0.018 + youth * 0.025);
      const rimB = 0.87 + Math.sin(angleB * 3 + phase) * (0.018 + youth * 0.025);
      const innerA = this.edgePoint(center, radius * rimA, angleA, phase);
      const innerB = this.edgePoint(center, radius * rimB, angleB, phase);
      const edgeA = this.edgePoint(center, radius, angleA, phase);
      const edgeB = this.edgePoint(center, radius, angleB, phase);
      builder.triangleColors(center, innerA, innerB, this.leafCenterColor, this.leafEdgeColorA, this.leafEdgeColorB);
      const curlA = this.leafEdgeColorA.clone().lerp(palette.light, 0.16 + Math.sin(angleA * 3 + phase) * 0.14);
      const curlB = this.leafEdgeColorB.clone().lerp(palette.shade, 0.12 + Math.cos(angleB * 4 - phase) * 0.1);
      builder.triangleColors(innerA, edgeA, edgeB, this.leafEdgeColorA, curlA, curlB);
      builder.triangleColors(innerA, edgeB, innerB, this.leafEdgeColorA, curlB, this.leafEdgeColorB);
    }
  }

  private leafColorAt(
    target: THREE.Color,
    palette: LeafPalette,
    angle: number,
    phase: number,
  ): void {
    const directionalLight = 0.5 + Math.cos(angle + 2.2) * 0.42;
    const organicVariation = Math.sin(angle * 3 + phase * 0.7) * 0.045 + Math.sin(phase * 2.3) * 0.09;
    const tone = Math.max(0, Math.min(1, directionalLight + organicVariation));
    if (tone < 0.5) {
      target.copy(palette.shade).lerp(palette.base, tone * 2);
      return;
    }
    target.copy(palette.base).lerp(palette.light, (tone - 0.5) * 2);
  }

  private drawVeins(
    builder: LotusGeometryBuilder,
    center: Point,
    radius: number,
    angle: number,
    phase: number,
    palette: LeafPalette,
  ): void {
    const start = angle + LOTUS.notchHalfAngle;
    const span = TAU - LOTUS.notchHalfAngle * 2;
    const veinColor = palette.base.clone().lerp(palette.vein, 0.34);
    const minorColor = palette.base.clone().lerp(palette.vein, 0.17);
    for (let index = 0; index < LOTUS.veinCount; index += 1) {
      const veinAngle = start + (index / LOTUS.veinCount) * span + Math.sin(index * 2.4 + phase) * 0.11;
      const branchRadius = 0.43 + Math.sin(index * 1.7 + phase) * 0.09;
      const branch = this.edgePoint(center, radius * branchRadius, veinAngle, phase);
      const primary = index % 3 === 0 ? veinColor : minorColor;
      builder.line(center, branch, primary);
      builder.line(branch, this.edgePoint(center, radius * (0.82 + Math.sin(index + phase) * 0.07), veinAngle + 0.045, phase), primary);
      if (radius > 18) {
        builder.line(branch, this.edgePoint(center, radius * 0.69, veinAngle - 0.18, phase), minorColor);
        const upperBranch = this.edgePoint(center, radius * 0.64, veinAngle + 0.015, phase);
        builder.line(upperBranch, this.edgePoint(center, radius * 0.82, veinAngle + 0.13, phase), minorColor);
      }
    }
  }

  private drawFlower(
    builder: LotusGeometryBuilder,
    center: Point,
    radius: number,
    rotation: number,
    palette: FlowerPalette,
  ): void {
    const drawPetalRing = (
      count: number,
      length: number,
      width: number,
      angleOffset: number,
      primary: THREE.Color,
      alternate: THREE.Color,
    ): void => {
      for (let index = 0; index < count; index += 1) {
        const angle = rotation + angleOffset + (index / count) * TAU + Math.sin(index * 2.7 + rotation) * 0.035;
        const direction = { x: Math.cos(angle), y: Math.sin(angle) };
        const side = { x: -direction.y, y: direction.x };
        const base = {
          x: center.x + direction.x * radius * 0.12,
          y: center.y + direction.y * radius * 0.12,
        };
        const halfWidth = radius * width * (0.93 + Math.sin(index * 3.7 + rotation) * 0.12);
        const color = index % 3 === 0 ? alternate : primary;
        // Five shoulder/tip stations produce a cupped lanceolate petal, rather
        // than the previous pair of long, flat triangles. Geometry stays static.
        const petalLength = radius * length * (0.94 + Math.sin(index * 1.9 + rotation) * 0.055);
        const stations = [0, 0.2, 0.45, 0.7, 0.88, 1];
        const centers = stations.map(t => ({x:base.x + direction.x * petalLength * t + side.x * Math.sin(t * Math.PI) * radius * 0.035,
          y:base.y + direction.y * petalLength * t + side.y * Math.sin(t * Math.PI) * radius * 0.035}));
        const widths = stations.map(t => Math.pow(Math.sin(t * Math.PI), 0.78) * halfWidth);
        const ridgeColor = color.clone().lerp(palette.petalLight, 0.32);
        for (let j = 0; j < stations.length - 1; j++) {
          for (const sign of [-1, 1]) {
            const edgeA = {x:centers[j].x + side.x * widths[j] * sign,y:centers[j].y + side.y * widths[j] * sign};
            const edgeB = {x:centers[j+1].x + side.x * widths[j+1] * sign,y:centers[j+1].y + side.y * widths[j+1] * sign};
            builder.triangleColors(centers[j], edgeA, edgeB, ridgeColor, primary, color);
            builder.triangleColors(centers[j], edgeB, centers[j+1], ridgeColor, color, alternate);
          }
        }
      }
    };

    drawPetalRing(9, 0.93, 0.24, 0, palette.outerPetal, palette.innerPetal);
    drawPetalRing(
      7,
      0.73,
      0.22,
      Math.PI / 6,
      palette.innerPetal,
      palette.petalLight,
    );
    drawPetalRing(5, 0.48, 0.16, 0.2, palette.innerPetal, palette.petalLight);
    for (let i = 0; i < 9; i++) {
      const a = rotation + i * TAU / 9;
      builder.circle({x:center.x + Math.cos(a) * radius * 0.24,y:center.y + Math.sin(a) * radius * 0.24}, radius * 0.032, palette.center);
    }
    builder.circle(center, radius * 0.22, palette.centerDark);
    builder.circle({x:center.x,y:center.y - radius * 0.03}, radius * 0.16, palette.center);
    for (let i = 0; i < 5; i++) builder.circle({x:center.x + Math.cos(i * TAU / 5) * radius * 0.1,
      y:center.y + Math.sin(i * TAU / 5) * radius * 0.1}, radius * 0.023, palette.centerDark);
  }
}
