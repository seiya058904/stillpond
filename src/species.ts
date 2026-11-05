// The optional populations. Large and medium species are ordinary `Koi` agents in
// the shared `School`, with their own proportions and pace; their artwork lives in
// `species-art.ts`. Small species are Medaka in another color.

import { CANVAS_HEIGHT, CANVAS_WIDTH, MAX_BUTTERFLY_KOI, MAX_FISH, MAX_GOLDFISH, MAX_SHUBUNKIN, SPINE_NODES, TINY_FISH } from "./config";
import { Koi } from "./koi";
import { fishBodyAvoidance } from "./large-fish-avoidance";
import { type Vec2, XorShift32 } from "./math";
import { settings } from "./settings/store";
import { MAX_SMALL_SHOALS, SMALL_SPECIES, SPINE_SPECIES, speciesLimit, type SmallSpeciesId, type SpineSpeciesId } from "./settings/species";
import { SMALL_SPECIES_SEEDS, SPINE_SPECIES_MOTION } from "./species-art";
import { TinyFishSchools, type FishAvoidance, type TinyFishConfig } from "./tiny-fish";

export class SpeciesAgent extends Koi {
  public baseLength = 24;
}

export class SpeciesPopulation {
  public readonly fish: SpeciesAgent[];
  private readonly random: XorShift32;
  private readonly avoidanceVector: Vec2 = {x: 0, y: 0};
  private readonly profile;
  private readonly pace: number;
  private readonly agility: number;
  private readonly seed: number;

  public constructor(public readonly id: SpineSpeciesId, private readonly firstIndex: number) {
    const motion = SPINE_SPECIES_MOTION[id];
    this.profile = {length: motion.length, widthRatio: [motion.waveRatio, motion.waveRatio] as const};
    this.pace = motion.pace;
    this.agility = motion.agility;
    this.seed = motion.seed;
    this.random = new XorShift32(motion.seed);
    this.fish = Array.from({length: speciesLimit(id)}, () => new SpeciesAgent(this.profile));
  }

  public get count(): number { return Math.min(this.fish.length, settings.live[this.id].count); }
  public get visibleFish(): number { return this.count; }
  public get bodies(): readonly SpeciesAgent[] { return this.fish; }

  public reset(neighbors: readonly Koi[] = []): void {
    const size = settings.live[this.id].size;
    this.random.state = this.seed;
    for (let index = 0; index < this.fish.length; index++) {
      const fish = this.fish[index];
      fish.reset(this.firstIndex + index, this.random);
      fish.baseLength = fish.bodyLength;
      fish.bodyLength *= size;
      fish.bodyWidth *= size;
      fish.cruiseSpeed *= this.pace;
      fish.maximumSpeed *= this.pace;
      fish.speed *= this.pace;
      fish.velocity.x *= this.pace;
      fish.velocity.y *= this.pace;
      fish.turnStrength *= this.agility;
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
    const size = settings.live[this.id].size, ratio = this.profile.widthRatio[0];
    for (const fish of this.fish) {
      const scale = fish.baseLength * size / fish.bodyLength;
      for (const spine of [fish.spine, fish.renderSpine]) for (const node of spine) {
        node.x = fish.position.x + (node.x - fish.position.x) * scale;
        node.y = fish.position.y + (node.y - fish.position.y) * scale;
      }
      fish.bodyLength = fish.baseLength * size;
      fish.bodyWidth = fish.bodyLength * ratio;
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

/** Random IDs follow the existing slots, so nothing already in the pond changes. */
const FIRST_SPECIES_SLOT = MAX_FISH + MAX_GOLDFISH + MAX_BUTTERFLY_KOI + MAX_SHUBUNKIN;

export class SpeciesPopulations {
  public readonly populations: readonly SpeciesPopulation[];

  public constructor() {
    let slot = FIRST_SPECIES_SLOT;
    this.populations = SPINE_SPECIES.map(id => {
      const population = new SpeciesPopulation(id, slot);
      slot += population.fish.length;
      return population;
    });
  }

  public active(): Koi[] {
    const fish: Koi[] = [];
    for (const population of this.populations) for (let index = 0; index < population.count; index++) fish.push(population.fish[index]);
    return fish;
  }

  public reset(neighbors: readonly Koi[]): void {
    const placed = [...neighbors];
    for (const population of this.populations) {
      population.reset(placed);
      for (let index = 0; index < population.count; index++) placed.push(population.fish[index]);
    }
  }

  public refreshConfig(): void { for (const population of this.populations) population.refreshConfig(); }
  public resize(scaleX: number, scaleY: number): void { for (const population of this.populations) population.resize(scaleX, scaleY); }
}

// The shoals' own starting places, so that they do not begin on top of Medaka.
const SMALL_SCHOOL_PLACES = [
  {x: 112, y: 150, heading: 0.5, swirl: 1}, {x: 332, y: 92, heading: 2.6, swirl: -1},
  {x: 248, y: 214, heading: -0.9, swirl: 1}, {x: 390, y: 200, heading: 3.6, swirl: -1},
] as const;

/** The default Medaka shoals, so that the first shoal added looks like the first Medaka shoal. */
export const MEDAKA_SHOALS = [
  {count: 24, spreadX: 32, spreadY: 15, sizeScale: 0.88, speedScale: 1.04},
  {count: 15, spreadX: 22, spreadY: 11, sizeScale: 1.08, speedScale: 0.95},
  {count: 34, spreadX: 40, spreadY: 18, sizeScale: 0.82, speedScale: 1.12},
  {count: 19, spreadX: 28, spreadY: 13, sizeScale: 0.94, speedScale: 1},
] as const;

/** Inherits every Medaka setting live. Only the shoal count and the size slider are its own. */
export function smallSpeciesConfig(id: SmallSpeciesId): TinyFishConfig {
  const live = settings.live[id];
  return Object.defineProperties(Object.create(TINY_FISH) as TinyFishConfig, {
    visibleSchoolCount: {get: () => live.count},
    bodyLength: {get: () => [TINY_FISH.bodyLength[0] * live.size, TINY_FISH.bodyLength[1] * live.size]},
  });
}

/** Medaka in another color. Drawn by `TinyFishRenderer` with Medaka, from its own palette. */
export class SmallSpeciesShoals {
  public readonly schools: TinyFishSchools;

  public constructor(public readonly id: SmallSpeciesId, firstPlace = 0) {
    const places = MEDAKA_SHOALS.map((shoal, index) => {
      const place = SMALL_SCHOOL_PLACES[(firstPlace + index) % SMALL_SCHOOL_PLACES.length];
      return {...shoal, x: place.x, y: place.y, heading: place.heading, swirlDirection: place.swirl as -1 | 1, palette: index};
    });
    this.schools = new TinyFishSchools(smallSpeciesConfig(id), places, SMALL_SPECIES_SEEDS[id]);
  }

  public get count(): number { return Math.min(MAX_SMALL_SHOALS, settings.live[this.id].count); }
  public get visibleFish(): number {
    let fish = 0;
    for (let shoal = 0; shoal < this.count; shoal++) fish += MEDAKA_SHOALS[shoal].count;
    return fish;
  }

  public update(dt: number, time: number, avoid: readonly FishAvoidance[]): void {
    if (this.count > 0) this.schools.update(dt, time, avoid);
  }

  public fleeFrom(point: Vec2): void { if (this.count > 0) this.schools.fleeFrom(point); }
  public reset(): void { this.schools.reset(); }
  /** Size or shoal count changed: fish keep their place, phase and heading. */
  public refreshConfig(): void { this.schools.refreshConfig(); }
  public resize(scaleX: number, scaleY: number): void { this.schools.resize(scaleX, scaleY); }
}

export const createSmallShoals = (): SmallSpeciesShoals[] => SMALL_SPECIES.map((id, index) => new SmallSpeciesShoals(id, index));
