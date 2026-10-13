import { BUTTERFLY_KOI, CANVAS_HEIGHT, CANVAS_WIDTH, MAX_BUTTERFLY_KOI, MAX_FISH, MAX_GOLDFISH, SPINE_NODES } from "./config";
import { Koi, type FishProfile } from "./koi";
import { XorShift32, type Vec2 } from "./math";
import { fishBodyAvoidance } from "./large-fish-avoidance";

export const BUTTERFLY_KOI_PROFILE: FishProfile = {length: [24, 30], widthRatio: [0.145, 0.145]};

// Long fins change the artwork, never the shared koi steering or state machine.
export class ButterflyKoiAgent extends Koi {
  public baseLength = 27;
  public constructor() { super(BUTTERFLY_KOI_PROFILE); }
}

export class ButterflyKoiPopulation {
  public readonly fish = Array.from({length: MAX_BUTTERFLY_KOI}, () => new ButterflyKoiAgent());
  private readonly random = new XorShift32(0x706c6174);
  private readonly avoidanceVector: Vec2 = {x: 0, y: 0};
  public get count(): number { return Math.min(MAX_BUTTERFLY_KOI, BUTTERFLY_KOI.count); }

  public reset(neighbors: readonly Koi[] = []): void {
    this.random.state = 0x706c6174;
    for (let index = 0; index < this.fish.length; index++) {
      const fish = this.fish[index];
      fish.reset(MAX_FISH + MAX_GOLDFISH + index, this.random);
      fish.baseLength = fish.bodyLength;
      fish.bodyLength *= BUTTERFLY_KOI.size;
      fish.bodyWidth *= BUTTERFLY_KOI.size;
      for (let attempt = 0; attempt < 48; attempt++) {
        fish.position.x = this.random.range(40, CANVAS_WIDTH - 30);
        fish.position.y = this.random.range(30, CANVAS_HEIGHT - 30);
        let clear = true;
        for (const other of neighbors) {
          for (const node of other.spine) {
            if (Math.hypot(node.x - fish.position.x, node.y - fish.position.y) < other.bodyWidth + fish.bodyLength) { clear = false; break; }
          }
          if (!clear) break;
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
        fish.renderSpine[node] = {...fish.spine[node]};
      }
    }
  }

  public refreshConfig(): void {
    for (const fish of this.fish) {
      const scale = fish.baseLength * BUTTERFLY_KOI.size / fish.bodyLength;
      for (const spine of [fish.spine, fish.renderSpine]) for (const node of spine) {
        node.x = fish.position.x + (node.x - fish.position.x) * scale;
        node.y = fish.position.y + (node.y - fish.position.y) * scale;
      }
      fish.bodyLength = fish.baseLength * BUTTERFLY_KOI.size;
      fish.bodyWidth = fish.bodyLength * BUTTERFLY_KOI_PROFILE.widthRatio[0];
    }
  }

  public resize(scaleX: number, scaleY: number): void {
    for (const fish of this.fish) {
      const dx = fish.position.x * (scaleX - 1), dy = fish.position.y * (scaleY - 1);
      fish.position.x += dx; fish.position.y += dy;
      for (const spine of [fish.spine, fish.renderSpine]) for (const node of spine) { node.x += dx; node.y += dy; }
    }
  }

  public avoidance(x: number, y: number, radius: number): Vec2 {
    return fishBodyAvoidance(this.fish, this.count, x, y, radius, this.avoidanceVector);
  }
}
