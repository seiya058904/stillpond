import { CANVAS_HEIGHT, CANVAS_WIDTH, GOLDFISH, MAX_FISH, MAX_GOLDFISH, SPINE_NODES } from "./config";
import { Koi, type FishProfile } from "./koi";
import { XorShift32, type Vec2 } from "./math";

import { fishBodyAvoidance } from "./large-fish-avoidance";

export const WAKIN_PROFILE: FishProfile = { length: [16, 20], widthRatio: [0.17, 0.17] };

// Appearance and compatibility with existing water effects only. No movement override.
export class GoldfishAgent extends Koi {
  public baseLength = 18;
  public palette = 0;
  public constructor() { super(WAKIN_PROFILE); }
  public get phase(): number { return this.phaseOffset; }
  public get tailPhase(): number { return this.swimPhase; }
  public get effort(): number { return this.tailEffort; }
}

// Population/configuration owner. School updates these agents alongside koi.
export class GoldfishPopulation {
  public readonly fish = Array.from({ length: MAX_GOLDFISH }, () => new GoldfishAgent());
  private readonly random = new XorShift32(0x716b696e);
  private readonly avoidanceVector: Vec2 = { x: 0, y: 0 };

  public get count(): number { return Math.min(MAX_GOLDFISH, GOLDFISH.count); }

  public reset(koi: readonly Koi[] = [], koiCount = 0): void {
    this.random.state = 0x716b696e;
    for (let index = 0; index < this.fish.length; index++) {
      const fish = this.fish[index];
      fish.reset(MAX_FISH + index, this.random);
      fish.baseLength = fish.bodyLength;
      fish.bodyLength *= GOLDFISH.size;
      fish.bodyWidth *= GOLDFISH.size;
      fish.palette = index % 3;
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
      for (let node = 0; node < SPINE_NODES; node++) {
        fish.spine[node] = {
          x: fish.position.x - Math.cos(fish.heading) * fish.bodyLength * node / (SPINE_NODES - 1),
          y: fish.position.y - Math.sin(fish.heading) * fish.bodyLength * node / (SPINE_NODES - 1),
        };
        fish.renderSpine[node] = { ...fish.spine[node] };
      }
    }
  }

  public refreshConfig(): void {
    for (const fish of this.fish) {
      const scale = fish.baseLength * GOLDFISH.size / fish.bodyLength;
      for (const spine of [fish.spine, fish.renderSpine]) for (const node of spine) {
        node.x = fish.position.x + (node.x - fish.position.x) * scale;
        node.y = fish.position.y + (node.y - fish.position.y) * scale;
      }
      fish.bodyLength = fish.baseLength * GOLDFISH.size;
      fish.bodyWidth = fish.bodyLength * WAKIN_PROFILE.widthRatio[0];
    }
  }

  public resize(scaleX: number, scaleY: number): void {
    for (const fish of this.fish) {
      const dx = fish.position.x * (scaleX - 1), dy = fish.position.y * (scaleY - 1);
      fish.position.x += dx; fish.position.y += dy;
      for (const spine of [fish.spine, fish.renderSpine]) for (const node of spine) {
        node.x += dx; node.y += dy;
      }
    }
  }

  // Kept for the existing Medaka consumer; medium/large fish use School avoidance.
  // Reused scratch result. Callers consume it before the next query. The
  // capsule spans the body, not just its head; the look-ahead softens contact.
  public avoidance(x: number, y: number, radius: number): Vec2 {
    return fishBodyAvoidance(this.fish, this.count, x, y, radius, this.avoidanceVector);
  }

}
