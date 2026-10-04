// An ordered assignment to the pond's existing fish slots. Counts are derived
// from this array; slot order is saved so edits and reloads never shuffle fish.
export const KOI_FAMILIES = ["Kohaku", "Sanke", "Showa", "Ogon", "Tancho", "Shiro"] as const;
export const MAX_KOI = 48;
export const DEFAULT_FAMILIES = [0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1] as const;

export function validFamilies(value: unknown): value is number[] {
  return Array.isArray(value) && value.length <= MAX_KOI && value.every(family =>
    Number.isInteger(family) && family >= 0 && family < KOI_FAMILIES.length);
}

export function familyCounts(families: readonly number[]): number[] {
  const counts = Array<number>(KOI_FAMILIES.length).fill(0);
  for (const family of families) counts[family]++;
  return counts;
}

/** Used only to migrate the pre-composition, alternating family assignment. */
export function legacyFamilies(count: number): number[] {
  const families: number[] = [];
  let family = 0;
  while (families.length < Math.min(MAX_KOI, Math.max(0, Math.round(count)))) {
    families.push(family);
    family = family + 1 === KOI_FAMILIES.length ? 0 : family + 1;
  }
  return families;
}

/** Shrink from the end; grow proportionally without reintroducing zero families. */
export function resizeFamilies(previous: readonly number[], count: number): number[] {
  const total = Math.min(MAX_KOI, Math.max(0, Math.round(count)));
  if (total <= previous.length) return previous.slice(0, total);
  if (previous.length === 0) return legacyFamilies(total);
  const next = [...previous];
  const weights = familyCounts(previous);
  const counts = [...weights];
  while (next.length < total) {
    let selected = 0;
    let largestDeficit = -Infinity;
    for (let family = 0; family < weights.length; family++) {
      if (weights[family] === 0) continue;
      const deficit = (next.length + 1) * weights[family] / previous.length - counts[family];
      if (deficit > largestDeficit) { largestDeficit = deficit; selected = family; }
    }
    next.push(selected);
    counts[selected]++;
  }
  return next;
}

/** Keep every possible assignment in the remaining slots, filling only deficits. */
export function reconcileFamilies(previous: readonly number[], requested: readonly number[]): number[] {
  const total = requested.reduce((sum, count) => sum + count, 0);
  const next = Array<number>(total).fill(-1);
  const remaining = [...requested];
  for (let slot = 0; slot < Math.min(total, previous.length); slot++) {
    const family = previous[slot];
    if (remaining[family] > 0) { next[slot] = family; remaining[family]--; }
  }
  for (let slot = 0; slot < total; slot++) {
    if (next[slot] !== -1) continue;
    const family = remaining.findIndex(count => count > 0);
    next[slot] = family;
    remaining[family]--;
  }
  return next;
}
