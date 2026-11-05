// The optional species a visitor can add. None of them is in the default pond.
// Large and medium species count fish; small species count shoals.

export const LARGE_SPECIES = ["sterlet", "high-fin", "paddlefish"] as const;
export const MEDIUM_SPECIES = ["ranchu", "panda-butterfly", "bubble-eye", "orfe"] as const;
export const SMALL_SPECIES = ["white-cloud", "paradise-fish"] as const;

export type SpineSpeciesId = (typeof LARGE_SPECIES)[number] | (typeof MEDIUM_SPECIES)[number];
export type SmallSpeciesId = (typeof SMALL_SPECIES)[number];
export type SpeciesId = SpineSpeciesId | SmallSpeciesId;

export const MAX_LARGE_SPECIES = 4;
export const MAX_MEDIUM_SPECIES = 6;
export const MAX_SMALL_SHOALS = 4;

export const SPINE_SPECIES: readonly SpineSpeciesId[] = [...LARGE_SPECIES, ...MEDIUM_SPECIES];
export const speciesLimit = (id: SpineSpeciesId): number =>
  (LARGE_SPECIES as readonly string[]).includes(id) ? MAX_LARGE_SPECIES : MAX_MEDIUM_SPECIES;
/** Every fish slot the shared steering and surface disturbance must reserve. */
export const MAX_SPINE_SPECIES_FISH = LARGE_SPECIES.length * MAX_LARGE_SPECIES + MEDIUM_SPECIES.length * MAX_MEDIUM_SPECIES;
