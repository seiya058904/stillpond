import { CANVAS_HEIGHT, CANVAS_WIDTH, GOLDFISH, MAX_GOLDFISH, TINY_FISH } from "./config";
import type { Koi } from "./koi";
import { clamp, wrapAngle, XorShift32, type Vec2 } from "./math";
import type { TinyFishAgent } from "./tiny-fish";

export interface GoldfishAgent {
  position: Vec2;
  velocity: Vec2;
  target: Vec2;
  heading: number;
  angularVelocity: number;
  baseLength: number;
  bodyLength: number;
  bodyWidth: number;
  speed: number;
  cruiseSpeed: number;
  targetSpeed: number;
  intentionAge: number;
  depth: number;
  targetDepth: number;
  depthAge: number;
  tailPhase: number;
  finPhase: number;
  effort: number;
  phase: number;
  palette: number;
}

// Wakin travel independently. A changing destination and propulsion clock are
// sufficient; there is no koi state machine, schooling, or tap attraction.
export class GoldfishPopulation {
  public readonly fish: GoldfishAgent[] = Array.from({ length: MAX_GOLDFISH }, () => ({
    position: { x: 0, y: 0 }, velocity: { x: 0, y: 0 }, target: { x: 0, y: 0 },
    heading: 0, angularVelocity: 0, baseLength: 18, bodyLength: 18, bodyWidth: 3,
    speed: 15, cruiseSpeed: 15, targetSpeed: 15, intentionAge: 0,
    depth: 0.2, targetDepth: 0.2, depthAge: 0, tailPhase: 0, finPhase: 0,
    effort: 0.7, phase: 0, palette: 0,
  }));
  private readonly random = new XorShift32(0x716b696e);
  private readonly avoidanceVector: Vec2 = { x: 0, y: 0 };

  public get count(): number { return Math.min(MAX_GOLDFISH, GOLDFISH.count); }

  public reset(koi: readonly Koi[] = [], koiCount = 0): void {
    this.random.state = 0x716b696e;
    for (let index = 0; index < this.fish.length; index++) {
      const fish = this.fish[index];
      fish.baseLength = this.random.range(16, 20);
      fish.bodyLength = fish.baseLength * GOLDFISH.size;
      fish.bodyWidth = fish.bodyLength * 0.17;
      fish.heading = this.random.range(-Math.PI, Math.PI);
      fish.angularVelocity = 0;
      fish.cruiseSpeed = this.random.range(14, 20);
      fish.speed = fish.cruiseSpeed * this.random.range(0.8, 1);
      fish.targetSpeed = fish.cruiseSpeed;
      fish.phase = this.random.range(0, Math.PI * 2);
      fish.tailPhase = fish.phase;
      fish.finPhase = fish.phase * 1.7;
      fish.palette = index % 3;
      fish.depth = this.random.range(0.12, 0.38);
      fish.targetDepth = fish.depth;
      fish.depthAge = this.random.range(3, 12);
      fish.effort = 0.7;
      // Avoid beginning with a new fish inside an existing koi or wakin.
      for (let attempt = 0; attempt < 48; attempt++) {
        fish.position.x = this.random.range(40, CANVAS_WIDTH - 30);
        fish.position.y = this.random.range(30, CANVAS_HEIGHT - 30);
        let clear = true;
        for (let k = 0; k < koiCount && clear; k++) {
          for (const node of koi[k].spine) {
            if (Math.hypot(node.x - fish.position.x, node.y - fish.position.y) < koi[k].bodyWidth + fish.bodyLength) { clear = false; break; }
          }
        }
        for (let k = 0; k < index && clear; k++) {
          if (Math.hypot(this.fish[k].position.x - fish.position.x, this.fish[k].position.y - fish.position.y) < fish.bodyLength * 2) clear = false;
        }
        if (clear) break;
      }
      fish.velocity.x = Math.cos(fish.heading) * fish.speed;
      fish.velocity.y = Math.sin(fish.heading) * fish.speed;
      this.chooseDestination(fish);
      fish.intentionAge *= this.random.range(0.2, 1);
    }
  }

  public refreshConfig(): void {
    for (const fish of this.fish) {
      fish.bodyLength = fish.baseLength * GOLDFISH.size;
      fish.bodyWidth = fish.bodyLength * 0.17;
    }
  }

  public resize(scaleX: number, scaleY: number): void {
    for (const fish of this.fish) {
      fish.position.x *= scaleX; fish.position.y *= scaleY;
      fish.target.x *= scaleX; fish.target.y *= scaleY;
    }
  }

  // Reused scratch result. Callers consume it before the next query. The
  // capsule spans the body, not just its head; the look-ahead softens contact.
  public avoidance(x: number, y: number, radius: number, exclude = -1): Vec2 {
    const result = this.avoidanceVector;
    result.x = 0; result.y = 0;
    for (let index = 0; index < this.count; index++) {
      if (index === exclude) continue;
      const fish = this.fish[index];
      const fx = Math.cos(fish.heading), fy = Math.sin(fish.heading);
      const dx = x - fish.position.x - fish.velocity.x * 0.22;
      const dy = y - fish.position.y - fish.velocity.y * 0.22;
      const along = clamp(dx * fx + dy * fy, -fish.bodyLength * 0.85, 0);
      const ox = dx - fx * along, oy = dy - fy * along;
      const distance = Math.hypot(ox, oy);
      const reach = radius + fish.bodyWidth + 7;
      if (distance >= reach) continue;
      const strength = Math.pow(1 - distance / reach, 2) * 3.8;
      if (distance > 0.001) { result.x += ox / distance * strength; result.y += oy / distance * strength; }
      else { result.x -= fy * strength; result.y += fx * strength; }
    }
    return result;
  }

  public update(dt: number, time: number, koi: readonly Koi[], koiCount: number, medaka: readonly TinyFishAgent[]): void {
    for (let index = 0; index < this.count; index++) {
      const fish = this.fish[index];
      fish.intentionAge -= dt;
      if (fish.intentionAge <= 0 || Math.hypot(fish.target.x - fish.position.x, fish.target.y - fish.position.y) < 15) this.chooseDestination(fish);
      const targetHeading = Math.atan2(fish.target.y - fish.position.y, fish.target.x - fish.position.x);
      let sx = Math.cos(targetHeading), sy = Math.sin(targetHeading);
      let clearanceSpeed = 1;
      const own = this.avoidance(fish.position.x + fish.velocity.x * 0.35, fish.position.y + fish.velocity.y * 0.35, fish.bodyWidth + 3, index);
      sx += own.x; sy += own.y;
      for (let k = 0; k < koiCount; k++) {
        const other = koi[k];
        let nearest = Infinity, ox = 0, oy = 0;
        for (let node = 0; node < other.spine.length - 2; node++) {
          const dx = fish.position.x + fish.velocity.x * 0.45 - other.spine[node].x - other.velocity.x * 0.22;
          const dy = fish.position.y + fish.velocity.y * 0.45 - other.spine[node].y - other.velocity.y * 0.22;
          const d = Math.hypot(dx, dy);
          if (d < nearest) { nearest = d; ox = dx; oy = dy; }
        }
        const reach = other.bodyWidth + fish.bodyWidth + 20;
        if (nearest < reach && nearest > 0.001) {
          const strength = Math.pow(1 - nearest / reach, 2) * 5;
          sx += ox / nearest * strength; sy += oy / nearest * strength;
          // A head-on approach needs a side to turn toward before repulsion
          // alone cancels the forward vector. Brake smoothly in close traffic.
          const cross = Math.cos(fish.heading) * oy - Math.sin(fish.heading) * ox;
          const side = Math.abs(cross) < 0.1 ? (index % 2 === 0 ? 1 : -1) : Math.sign(cross);
          sx -= Math.sin(fish.heading) * side * strength * 0.8;
          sy += Math.cos(fish.heading) * side * strength * 0.8;
          clearanceSpeed = Math.min(clearanceSpeed, clamp((nearest - other.bodyWidth - fish.bodyWidth) / 16, 0.4, 1));
        }
      }
      for (const other of medaka) {
        if (other.schoolIndex >= TINY_FISH.visibleSchoolCount) continue;
        const dx = fish.position.x - other.position.x, dy = fish.position.y - other.position.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 0.001 && distance < 8) {
          sx += dx / distance * (1 - distance / 8) * 0.12;
          sy += dy / distance * (1 - distance / 8) * 0.12;
        }
      }
      const margin = 35;
      sx += clamp((margin - fish.position.x) / margin, 0, 1) * 4;
      sx -= clamp((fish.position.x - CANVAS_WIDTH + margin) / margin, 0, 1) * 4;
      sy += clamp((margin - fish.position.y) / margin, 0, 1) * 4;
      sy -= clamp((fish.position.y - CANVAS_HEIGHT + margin) / margin, 0, 1) * 4;
      const error = wrapAngle(Math.atan2(sy, sx) - fish.heading);
      const turn = clamp(error * 3.4, -2.75, 2.75);
      fish.angularVelocity += (turn - fish.angularVelocity) * (1 - Math.exp(-4.8 * dt));
      fish.heading = wrapAngle(fish.heading + fish.angularVelocity * dt);
      const desiredSpeed = fish.targetSpeed * clearanceSpeed * (1 - Math.min(Math.abs(error), 2) * 0.18);
      fish.speed += (desiredSpeed - fish.speed) * (1 - Math.exp(-1.9 * dt));
      fish.velocity.x = Math.cos(fish.heading) * fish.speed;
      fish.velocity.y = Math.sin(fish.heading) * fish.speed;
      fish.position.x = clamp(fish.position.x + fish.velocity.x * dt, 8, CANVAS_WIDTH - 8);
      fish.position.y = clamp(fish.position.y + fish.velocity.y * dt, 8, CANVAS_HEIGHT - 8);
      this.keepClear(fish, index, koi, koiCount);
      fish.effort += (clamp(fish.speed / fish.cruiseSpeed, 0.35, 1.25) - fish.effort) * (1 - Math.exp(-4 * dt));
      // Faster, smaller strokes than koi; the split fin trails the peduncle.
      fish.tailPhase += Math.PI * 2 * (1.25 + fish.speed / fish.bodyLength * 0.85 + Math.sin(time * 0.37 + fish.phase) * 0.08) * dt;
      fish.finPhase += (4.4 + fish.effort * 1.2) * dt;
      fish.depthAge -= dt;
      if (fish.depthAge <= 0) { fish.targetDepth = this.random.range(0.12, 0.62); fish.depthAge = this.random.range(8, 21); }
      fish.depth += (fish.targetDepth - fish.depth) * (1 - Math.exp(-0.3 * dt));
    }
  }

  private keepClear(fish: GoldfishAgent, index: number, koi: readonly Koi[], koiCount: number): void {
    // A small contact constraint backs up steering when another fish turns
    // into this one. Move only the wakin; the koi spine and states are intact.
    const fx = Math.cos(fish.heading), fy = Math.sin(fish.heading);
    for (let pass = 0; pass < 2; pass++) {
      let penetration = 0, pushX = 0, pushY = 0;
      for (let sample = 0; sample < 3; sample++) {
        const x = fish.position.x - fx * fish.bodyLength * sample * 0.4;
        const y = fish.position.y - fy * fish.bodyLength * sample * 0.4;
        const radius = fish.bodyWidth * (sample === 2 ? 0.5 : 1);
        for (let k = 0; k < koiCount + this.count; k++) {
          if (k >= koiCount && k - koiCount === index) continue;
          const other = k < koiCount ? koi[k] : this.fish[k - koiCount];
          if (Math.hypot(fish.position.x - other.position.x, fish.position.y - other.position.y) > other.bodyLength + fish.bodyLength + other.bodyWidth + 3) continue;
          const nodes = k < koiCount ? (other as Koi).spine : null;
          const segments = nodes ? nodes.length - 3 : 1;
          for (let node = 0; node < segments; node++) {
            const ax = nodes ? nodes[node].x : other.position.x;
            const ay = nodes ? nodes[node].y : other.position.y;
            const bx = nodes ? nodes[node + 1].x : ax - Math.cos((other as GoldfishAgent).heading) * other.bodyLength * 0.85;
            const by = nodes ? nodes[node + 1].y : ay - Math.sin((other as GoldfishAgent).heading) * other.bodyLength * 0.85;
            const vx = bx - ax, vy = by - ay;
            const along = clamp(((x - ax) * vx + (y - ay) * vy) / Math.max(vx * vx + vy * vy, 0.001), 0, 1);
            const dx = x - ax - vx * along, dy = y - ay - vy * along;
            const distance = Math.hypot(dx, dy);
            const overlap = radius + other.bodyWidth + 0.3 - distance;
            if (overlap > penetration) {
              penetration = overlap;
              pushX = distance > 0.001 ? dx / distance : -fy;
              pushY = distance > 0.001 ? dy / distance : fx;
            }
          }
        }
      }
      if (penetration <= 0) break;
      fish.position.x = clamp(fish.position.x + pushX * penetration, 8, CANVAS_WIDTH - 8);
      fish.position.y = clamp(fish.position.y + pushY * penetration, 8, CANVAS_HEIGHT - 8);
    }
  }

  private chooseDestination(fish: GoldfishAgent): void {
    const angle = fish.heading + this.random.range(-1.3, 1.3);
    const distance = this.random.range(55, 145);
    fish.target.x = clamp(fish.position.x + Math.cos(angle) * distance, 30, CANVAS_WIDTH - 30);
    fish.target.y = clamp(fish.position.y + Math.sin(angle) * distance, 26, CANVAS_HEIGHT - 26);
    if (this.random.unit() < 0.22) {
      fish.target.x = this.random.range(CANVAS_WIDTH * 0.2, CANVAS_WIDTH * 0.8);
      fish.target.y = this.random.range(CANVAS_HEIGHT * 0.18, CANVAS_HEIGHT * 0.82);
    }
    fish.intentionAge = this.random.range(3.2, 8.5);
    fish.targetSpeed = fish.cruiseSpeed * this.random.range(0.65, 1.22);
  }
}
