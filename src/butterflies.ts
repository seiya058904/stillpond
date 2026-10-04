import * as THREE from "three";
import {
  BUTTERFLIES,
  BUTTERFLY_SPAWNS,
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  LOTUS,
  LOTUS_FLOWERS,
  LOTUS_LEAVES,
  viewportPoint,
  flowerLeafIndex,
} from "./config";
import {
  SurfaceGeometryBatch,
  type SurfacePoint,
} from "./surface-geometry";
import { buildButterflyModel, type ButterflyModel, type ButterflyPalette } from "./butterfly-shape";
import type { SurfaceWeather } from "./weather-pass";

type ButterflyState = "wander" | "approach" | "orbit" | "rest";

interface Butterfly {
  position: SurfacePoint;
  velocity: SurfacePoint;
  wanderTarget: SurfacePoint;
  restOffset: SurfacePoint;
  state: ButterflyState;
  stateAge: number;
  stateDuration: number;
  flowerIndex: number;
  orbitAngle: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitDirection: number;
  cruiseSpeed: number;
  flapSpeed: number;
  turnAngle: number;
  turnTarget: number;
  turnTimer: number;
  curveFrequency: number;
  speedPhase: number;
  phase: number;
  palette: number;
  randomState: number;
  flapPhase: number;
  wingSpread: number;
  lift: number;
}

const PALETTES: readonly ButterflyPalette[] = BUTTERFLIES.palettes.map(
  (palette) => ({
    wing: new THREE.Color(palette.wing),
    wingLight: new THREE.Color(palette.wingLight),
    accent: new THREE.Color(palette.accent),
    body: new THREE.Color(palette.body),
  }),
);

const SHADOW_COLOR = new THREE.Color(BUTTERFLIES.shadow.color);

function length(vector: SurfacePoint): number {
  return Math.hypot(vector.x, vector.y);
}

function normalize(vector: SurfacePoint, fallback: SurfacePoint): SurfacePoint {
  const magnitude = length(vector);
  return magnitude > 0.0001
    ? { x: vector.x / magnitude, y: vector.y / magnitude }
    : fallback;
}

export class ButterflyPass {
  public readonly shadowGroup = new THREE.Group();
  public readonly group = new THREE.Group();

  private readonly shadowGeometry = new THREE.BufferGeometry();
  private readonly shapeGeometry = new THREE.BufferGeometry();
  private readonly lineGeometry = new THREE.BufferGeometry();
  private readonly shadowBatch = new SurfaceGeometryBatch(
    this.shadowGeometry,
    16_384,
    true,
  );
  private readonly shapeBatch = new SurfaceGeometryBatch(
    this.shapeGeometry,
    65_536,
    true,
  );
  private readonly lineBatch = new SurfaceGeometryBatch(
    this.lineGeometry,
    8_192,
    true,
  );
  private readonly shadowMaterial = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: SHADOW_COLOR }, uOpacity: { value: BUTTERFLIES.shadow.opacity } },
    vertexColors: true,
    vertexShader: "varying float vStrength;void main(){vStrength=color.r;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
    fragmentShader: "uniform vec3 uColor;uniform float uOpacity;varying float vStrength;void main(){gl_FragColor=vec4(uColor,uOpacity*vStrength);}",
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  private butterflies: Butterfly[] = [];
  private lastTime = -1;
  private models: ButterflyModel[] = [];
  private readonly shadowStrength = new THREE.Color();

  public constructor() {
    this.butterflies = this.createButterflies();

    this.shadowGeometry.name = "butterfly shadows";
    this.shapeGeometry.name = "butterflies";
    this.lineGeometry.name = "butterfly antennae";

    const shapeMaterial = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    const shadowMesh = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
    const shapeMesh = new THREE.Mesh(this.shapeGeometry, shapeMaterial);
    const lines = new THREE.LineSegments(this.lineGeometry, lineMaterial);
    shadowMesh.frustumCulled = false;
    shapeMesh.frustumCulled = false;
    lines.frustumCulled = false;
    shadowMesh.renderOrder = 4;
    shapeMesh.renderOrder = 10;
    lines.renderOrder = 11;
    this.shadowGroup.add(shadowMesh);
    this.group.add(shapeMesh, lines);
    this.refreshConfig();
  }

  public refreshConfig(preserveMovement = false): void {
    this.shadowMaterial.uniforms.uOpacity.value = BUTTERFLIES.shadow.opacity;
    SHADOW_COLOR.setHex(BUTTERFLIES.shadow.color);
    for (const [index, palette] of BUTTERFLIES.palettes.entries()) {
      const target = PALETTES[index];
      if (!target) continue;
      target.wing.setHex(palette.wing);
      target.wingLight.setHex(palette.wingLight);
      target.accent.setHex(palette.accent);
      target.body.setHex(palette.body);
    }
    this.models = PALETTES.map((palette, index) => buildButterflyModel(index, palette));
    const previous = this.butterflies;
    this.butterflies = this.createButterflies();
    if (preserveMovement) {
      for (const [index, butterfly] of this.butterflies.entries()) {
        const old = previous[index];
        if (old) Object.assign(butterfly, old);
      }
    } else {
      this.lastTime = -1;
    }
  }

  public resize(scaleX: number, scaleY: number): void {
    for (const butterfly of this.butterflies) {
      butterfly.position.x *= scaleX;
      butterfly.position.y *= scaleY;
      butterfly.wanderTarget.x *= scaleX;
      butterfly.wanderTarget.y *= scaleY;
    }
  }

  private createButterflies(): Butterfly[] {
    return BUTTERFLY_SPAWNS.map((spawn, index) => {
      const randomState = (0x9e3779b9 ^ ((index + 1) * 0x85ebca6b)) >>> 0;
      const placement = viewportPoint(spawn.x, spawn.y);
      const butterfly: Butterfly = {
        position: { ...placement },
        velocity: {
          x: Math.cos(spawn.phase) * BUTTERFLIES.minimumSpeed,
          y: Math.sin(spawn.phase) * BUTTERFLIES.minimumSpeed,
        },
        wanderTarget: { ...placement },
        restOffset: { x: 0, y: 0 },
        state: "wander",
        stateAge: 0,
        stateDuration: 0,
        flowerIndex: 0,
        orbitAngle: spawn.phase,
        orbitRadius: BUTTERFLIES.flowerOrbitRadius[0],
        orbitSpeed: BUTTERFLIES.flowerOrbitSpeed[0],
        orbitDirection: index % 2 === 0 ? 1 : -1,
        cruiseSpeed: BUTTERFLIES.minimumSpeed,
        flapSpeed: BUTTERFLIES.flapSpeed[0],
        turnAngle: 0,
        turnTarget: 0,
        turnTimer: 0,
        curveFrequency: BUTTERFLIES.curvedFlightFrequency[0],
        speedPhase: spawn.phase * 1.73,
        phase: spawn.phase,
        palette: spawn.palette,
        randomState,
        flapPhase: spawn.phase,
        wingSpread: 1,
        lift: 0.9,
      };
      this.beginWander(butterfly);
      butterfly.stateAge = this.random(butterfly) * butterfly.stateDuration;
      return butterfly;
    });
  }

  public update(time: number, weather?: Readonly<SurfaceWeather>): void {
    const deltaTime =
      this.lastTime < 0 ? 0 : Math.min(0.05, Math.max(0, time - this.lastTime));
    this.lastTime = time;

    this.shadowBatch.reset();
    this.shapeBatch.reset();
    this.lineBatch.reset();

    const visibleCount = Math.min(
      BUTTERFLIES.visibleCount,
      this.butterflies.length,
    );
    for (let index = 0; index < visibleCount; index += 1) {
      const butterfly = this.butterflies[index];
      this.moveButterfly(butterfly, time, deltaTime);
      // Pose clocks continue through approach and rest; changing a flight
      // interval must not snap wing phase. Height is a visual cue only.
      butterfly.flapPhase += butterfly.flapSpeed * deltaTime;
      const resting = butterfly.state === "rest";
      const spread = resting ? 0.25 + Math.sin(time * 1.3 + butterfly.phase) * 0.025 : 0.16 + Math.abs(Math.cos(butterfly.flapPhase)) * 0.84;
      butterfly.wingSpread += (spread - butterfly.wingSpread) * (1 - Math.exp(-(resting ? 7 : 24) * deltaTime));
      const lift = resting ? 0.07 : butterfly.state === "approach" ? 0.38 : butterfly.state === "orbit" ? 0.52 : 0.92;
      butterfly.lift += (lift - butterfly.lift) * (1 - Math.exp(-3 * deltaTime));
      this.drawButterfly(butterfly, weather);
    }

    this.shadowBatch.commit();
    this.shapeBatch.commit();
    this.lineBatch.commit();
  }

  private moveButterfly(
    butterfly: Butterfly,
    time: number,
    deltaTime: number,
  ): void {
    butterfly.stateAge += deltaTime;
    if (butterfly.stateAge >= butterfly.stateDuration) {
      this.advanceState(butterfly);
    }

    butterfly.turnTimer -= deltaTime;
    if (butterfly.turnTimer <= 0) this.chooseTurn(butterfly);

    let target = butterfly.wanderTarget;
    let targetSpeed = butterfly.cruiseSpeed;
    if (butterfly.state === "approach") {
      target = this.flowerPosition(butterfly.flowerIndex, time);
      targetSpeed = BUTTERFLIES.flowerApproachSpeed;
      if (this.distance(butterfly.position, target) < BUTTERFLIES.flowerArrivalRadius) {
        this.beginOrbit(butterfly);
      }
    } else if (butterfly.state === "orbit") {
      butterfly.orbitAngle +=
        butterfly.orbitSpeed * butterfly.orbitDirection * deltaTime;
      const flower = this.flowerPosition(butterfly.flowerIndex, time);
      target = {
        x: flower.x + Math.cos(butterfly.orbitAngle) * butterfly.orbitRadius,
        y: flower.y + Math.sin(butterfly.orbitAngle) * butterfly.orbitRadius,
      };
      targetSpeed = butterfly.cruiseSpeed * 0.72;
    } else if (butterfly.state === "rest") {
      const flower = this.flowerPosition(butterfly.flowerIndex, time);
      target = {
        x: flower.x + butterfly.restOffset.x,
        y: flower.y + butterfly.restOffset.y,
      };
      targetSpeed = butterfly.cruiseSpeed * 0.12;
    } else if (this.distance(butterfly.position, target) < 12) {
      this.chooseWanderTarget(butterfly);
      target = butterfly.wanderTarget;
    }

    const directDirection = normalize(
      {
        x: target.x - butterfly.position.x,
        y: target.y - butterfly.position.y,
      },
      normalize(butterfly.velocity, { x: 1, y: 0 }),
    );
    const turnScale =
      butterfly.state === "wander"
        ? 1
        : butterfly.state === "approach"
          ? 0.32
          : butterfly.state === "orbit"
            ? 0.12
            : 0;
    const turnSmoothing = Math.min(
      1,
      BUTTERFLIES.turnSmoothing * deltaTime,
    );
    butterfly.turnAngle +=
      (butterfly.turnTarget - butterfly.turnAngle) * turnSmoothing;
    const curvedFlight =
      (Math.sin(time * butterfly.curveFrequency + butterfly.phase) +
        Math.sin(time * butterfly.curveFrequency * 2.17 + butterfly.phase * 2.3) *
          0.38) *
      BUTTERFLIES.curvedFlightStrength *
      turnScale;
    const turn = butterfly.turnAngle * turnScale + curvedFlight;
    const cosine = Math.cos(turn);
    const sine = Math.sin(turn);
    const direction = {
      x: directDirection.x * cosine - directDirection.y * sine,
      y: directDirection.x * sine + directDirection.y * cosine,
    };
    const wobble =
      Math.sin(time * 1.45 + butterfly.phase) *
      BUTTERFLIES.driftAmount *
      turnScale;
    const speedPulse =
      butterfly.state === "rest"
        ? 1
        : 1 +
          BUTTERFLIES.speedVariation *
            (Math.sin(time * 0.73 + butterfly.speedPhase) * 0.68 +
              Math.sin(time * 1.91 + butterfly.speedPhase * 1.4) * 0.32);
    targetSpeed *= speedPulse;
    const desiredVelocity = {
      x: direction.x * targetSpeed - direction.y * wobble,
      y: direction.y * targetSpeed + direction.x * wobble,
    };
    const steering = Math.min(
      1,
      BUTTERFLIES.turnResponsiveness * deltaTime,
    );
    butterfly.velocity.x +=
      (desiredVelocity.x - butterfly.velocity.x) * steering;
    butterfly.velocity.y +=
      (desiredVelocity.y - butterfly.velocity.y) * steering;
    butterfly.position.x += butterfly.velocity.x * deltaTime;
    butterfly.position.y += butterfly.velocity.y * deltaTime;

    const margin = BUTTERFLIES.edgeMargin;
    if (butterfly.position.x < margin || butterfly.position.x > CANVAS_WIDTH - margin) {
      butterfly.position.x = Math.max(
        margin,
        Math.min(CANVAS_WIDTH - margin, butterfly.position.x),
      );
      butterfly.velocity.x *= -0.6;
      this.chooseWanderTarget(butterfly);
    }
    if (butterfly.position.y < margin || butterfly.position.y > CANVAS_HEIGHT - margin) {
      butterfly.position.y = Math.max(
        margin,
        Math.min(CANVAS_HEIGHT - margin, butterfly.position.y),
      );
      butterfly.velocity.y *= -0.6;
      this.chooseWanderTarget(butterfly);
    }
  }

  private advanceState(butterfly: Butterfly): void {
    if (butterfly.state === "wander") {
      if (
        this.visibleFlowerCount() > 0 &&
        this.random(butterfly) < BUTTERFLIES.flowerVisitChance
      ) {
        this.beginApproach(butterfly);
      } else {
        this.beginWander(butterfly);
      }
    } else if (butterfly.state === "approach") {
      this.beginWander(butterfly);
    } else if (butterfly.state === "orbit") {
      this.beginRest(butterfly);
    } else {
      this.beginWander(butterfly);
    }
  }

  private beginWander(butterfly: Butterfly): void {
    butterfly.state = "wander";
    butterfly.stateAge = 0;
    butterfly.stateDuration = this.randomRange(
      butterfly,
      BUTTERFLIES.wanderDuration,
    );
    butterfly.cruiseSpeed = this.randomRange(butterfly, [
      BUTTERFLIES.minimumSpeed,
      BUTTERFLIES.maximumSpeed,
    ]);
    butterfly.flapSpeed = this.randomRange(butterfly, BUTTERFLIES.flapSpeed);
    butterfly.curveFrequency = this.randomRange(
      butterfly,
      BUTTERFLIES.curvedFlightFrequency,
    );
    this.chooseWanderTarget(butterfly);
  }

  private beginApproach(butterfly: Butterfly): void {
    butterfly.state = "approach";
    butterfly.stateAge = 0;
    butterfly.stateDuration = 8;
    butterfly.flowerIndex = Math.floor(
      this.random(butterfly) * this.visibleFlowerCount(),
    );
  }

  private beginOrbit(butterfly: Butterfly): void {
    butterfly.state = "orbit";
    butterfly.stateAge = 0;
    butterfly.stateDuration = this.randomRange(
      butterfly,
      BUTTERFLIES.flowerVisitDuration,
    );
    butterfly.orbitRadius = this.randomRange(
      butterfly,
      BUTTERFLIES.flowerOrbitRadius,
    );
    butterfly.orbitSpeed = this.randomRange(
      butterfly,
      BUTTERFLIES.flowerOrbitSpeed,
    );
    butterfly.orbitDirection = this.random(butterfly) < 0.5 ? -1 : 1;
  }

  private beginRest(butterfly: Butterfly): void {
    butterfly.state = "rest";
    butterfly.stateAge = 0;
    butterfly.stateDuration = this.randomRange(
      butterfly,
      BUTTERFLIES.flowerRestDuration,
    );
    const angle = this.random(butterfly) * Math.PI * 2;
    const radius = this.random(butterfly) * 2.4;
    butterfly.restOffset = {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  }

  private chooseWanderTarget(butterfly: Butterfly): void {
    const margin = BUTTERFLIES.edgeMargin;
    const heading = Math.atan2(butterfly.velocity.y, butterfly.velocity.x);
    const angle =
      heading +
      (this.random(butterfly) - 0.5) * BUTTERFLIES.wanderTargetTurnRange;
    const distance = this.randomRange(
      butterfly,
      BUTTERFLIES.wanderTargetDistance,
    );
    butterfly.wanderTarget = {
      x: Math.max(
        margin,
        Math.min(CANVAS_WIDTH - margin, butterfly.position.x + Math.cos(angle) * distance),
      ),
      y: Math.max(
        margin,
        Math.min(CANVAS_HEIGHT - margin, butterfly.position.y + Math.sin(angle) * distance),
      ),
    };
  }

  private chooseTurn(butterfly: Butterfly): void {
    butterfly.turnTimer = this.randomRange(
      butterfly,
      BUTTERFLIES.randomTurnInterval,
    );
    const sharp = this.random(butterfly) < BUTTERFLIES.sharpTurnChance;
    const maximumAngle = sharp
      ? BUTTERFLIES.sharpTurnAngle
      : BUTTERFLIES.randomTurnAngle;
    butterfly.turnTarget = (this.random(butterfly) * 2 - 1) * maximumAngle;
  }

  private visibleFlowerCount(): number {
    return LOTUS.visibleLeafCount === 0 ? 0 : Math.min(LOTUS_FLOWERS.length, LOTUS.visibleFlowerCount);
  }

  private flowerPosition(flowerIndex: number, time: number): SurfacePoint {
    const index = Math.min(flowerIndex, this.visibleFlowerCount() - 1);
    const flower = LOTUS_FLOWERS[index];
    const leaf = LOTUS_LEAVES[flowerLeafIndex(index)];
    if (!flower || !leaf) return { x: CANVAS_WIDTH * 0.5, y: CANVAS_HEIGHT * 0.5 };
    const placement = viewportPoint(leaf.x, leaf.y);
    return {
      x:
        placement.x +
        Math.sin(time * 0.12 + leaf.phase) * LOTUS.driftX +
        flower.offsetX,
      y:
        placement.y +
        Math.cos(time * 0.15 + leaf.phase * 1.3) * LOTUS.driftY +
        flower.offsetY,
    };
  }

  private drawButterfly(butterfly: Butterfly, weather?: Readonly<SurfaceWeather>): void {
    const model = this.models[butterfly.palette % this.models.length];
    const heading = Math.atan2(butterfly.velocity.y, butterfly.velocity.x);
    const fx = Math.cos(heading), fy = Math.sin(heading);
    const lift = butterfly.lift;
    const shadowScale = BUTTERFLIES.shadow.scale * (0.92 + lift * 0.18);
    const shadowX = BUTTERFLIES.shadow.offset.x * (0.2 + lift * 1.4)
      * (-(weather?.lightDirection.x ?? -0.58) / 0.58) * (weather?.shadowScale ?? 1);
    const shadowY = BUTTERFLIES.shadow.offset.y * (0.2 + lift * 1.4)
      * ((weather?.lightDirection.y ?? 0.82) / 0.82) * (weather?.shadowScale ?? 1);
    this.shadowStrength.setRGB(0.94 - lift * 0.53, 0, 0);
    // The hindwing remains rounder and slightly less folded than the triangular
    // forewing. Both attach at the thorax, rather than making a single diamond.
    for (let wingIndex = 0; wingIndex < 2; wingIndex++) {
      const wing = wingIndex === 0 ? model.hindwing : model.forewing;
      const spread = butterfly.wingSpread * (wingIndex === 0 ? 0.96 : 1);
      for (let sign = -1; sign <= 1; sign += 2) {
        for (const p of wing.silhouette) {
          const x = p.x * spread * sign * shadowScale, y = p.y * shadowScale;
          this.shadowBatch.pointXY(butterfly.position.x + fx * y - fy * x + shadowX,
            butterfly.position.y + fy * y + fx * x + shadowY, this.shadowStrength);
        }
        for (const p of wing.shape) {
          const x = p.x * spread * sign;
          this.shapeBatch.pointXY(butterfly.position.x + fx * p.y - fy * x,
            butterfly.position.y + fy * p.y + fx * x, p.color);
        }
        for (const p of wing.veins) {
          const x = p.x * spread * sign;
          this.lineBatch.pointXY(butterfly.position.x + fx * p.y - fy * x,
            butterfly.position.y + fy * p.y + fx * x, p.color);
        }
      }
    }
    for (const p of model.body) {
      this.shapeBatch.pointXY(butterfly.position.x + fx * p.y - fy * p.x,
        butterfly.position.y + fy * p.y + fx * p.x, p.color);
    }
    for (const p of model.antennae) {
      this.lineBatch.pointXY(butterfly.position.x + fx * p.y - fy * p.x,
        butterfly.position.y + fy * p.y + fx * p.x, p.color);
    }
  }
  private distance(a: SurfacePoint, b: SurfacePoint): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private random(butterfly: Butterfly): number {
    butterfly.randomState =
      (Math.imul(butterfly.randomState, 1664525) + 1013904223) >>> 0;
    return butterfly.randomState / 0x100000000;
  }

  private randomRange(
    butterfly: Butterfly,
    range: readonly [number, number],
  ): number {
    return range[0] + this.random(butterfly) * (range[1] - range[0]);
  }
}
