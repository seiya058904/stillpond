import { useSyncExternalStore } from "react";
import { useI18n, type MessageKey } from "./i18n";
import { settings } from "./settings/store";
import type { SettingPath } from "./settings/schema";
import { Stepper } from "./settings-ui";
import { MAX_LARGE_SPECIES, MAX_MEDIUM_SPECIES, MAX_SMALL_SHOALS } from "./settings/species";
import { FISH_GLYPHS, type GlyphId } from "./fish-glyphs";

interface RosterEntry {
  id: GlyphId;
  name: MessageKey;
  /** How the count reads to a screen reader: fish, or shoals for small species. */
  unit: "fish" | "shoal";
  path: SettingPath;
  max: number;
}
const fish = (id: GlyphId, name: MessageKey, path: SettingPath, max: number): RosterEntry => ({id, name, unit: "fish", path, max});
const shoal = (id: GlyphId, name: MessageKey, path: SettingPath, max: number): RosterEntry => ({id, name, unit: "shoal", path, max});

export const FISH_ROSTER: readonly {title: MessageKey; note: MessageKey; entries: readonly RosterEntry[]}[] = [
  {title: "fish.large", note: "fish.largeHint", entries: [
    fish("koi", "species.koi", ["koi", "initialCount"], 48),
    fish("sterlet", "species.sterlet", ["sterlet", "count"], MAX_LARGE_SPECIES),
    fish("high-fin", "species.high-fin", ["high-fin", "count"], MAX_LARGE_SPECIES),
    fish("paddlefish", "species.paddlefish", ["paddlefish", "count"], MAX_LARGE_SPECIES),
  ]},
  {title: "fish.medium", note: "fish.mediumHint", entries: [
    fish("wakin", "species.wakin", ["goldfish", "count"], 8),
    fish("butterfly-koi", "species.butterfly-koi", ["butterfly-koi", "count"], 6),
    fish("shubunkin", "species.shubunkin", ["shubunkin", "count"], 6),
    fish("ranchu", "species.ranchu", ["ranchu", "count"], MAX_MEDIUM_SPECIES),
    fish("panda-butterfly", "species.panda-butterfly", ["panda-butterfly", "count"], MAX_MEDIUM_SPECIES),
    fish("bubble-eye", "species.bubble-eye", ["bubble-eye", "count"], MAX_MEDIUM_SPECIES),
    fish("orfe", "species.orfe", ["orfe", "count"], MAX_MEDIUM_SPECIES),
  ]},
  {title: "fish.small", note: "fish.smallHint", entries: [
    shoal("medaka", "species.medaka", ["tiny-fish", "visibleSchoolCount"], 12),
    shoal("white-cloud", "species.white-cloud", ["white-cloud", "count"], MAX_SMALL_SHOALS),
    shoal("paradise-fish", "species.paradise-fish", ["paradise-fish", "count"], MAX_SMALL_SHOALS),
  ]},
];

const ENTRIES = FISH_ROSTER.flatMap(section => section.entries);
/** Restores who is in the pond. Sizes and koi colors the visitor chose stay as they are. */
const restoreDefaultFish = (): void => settings.resetOverrides([
  ...ENTRIES.map(entry => entry.path.join(".")), "koi.families", "tiny-fish.lastEnabledSchoolCount",
]);

const subscribe = (listener: () => void) => settings.subscribe(() => listener());
const countsSnapshot = () => ENTRIES.map(entry => settings.get(entry.path) as number).join();

/** All roster counts, in roster order, from one cached string snapshot. */
export function useFishCounts(): readonly number[] {
  const snapshot = useSyncExternalStore(subscribe, countsSnapshot, countsSnapshot);
  return snapshot.split(",").map(Number);
}

/** How many kinds of fish currently share the pond. */
export const speciesInPond = (counts: readonly number[]): number => counts.filter(count => count > 0).length;

export function FishGlyph({id}: {id: GlyphId}) {
  const glyph = FISH_GLYPHS[id];
  return <svg className="fish-tile" viewBox={glyph.viewBox} aria-hidden="true">
    {glyph.paths.map((path, index) => <path key={index} d={path.d} fill={path.fill} />)}
  </svg>;
}

export function FishSettings() {
  const {t} = useI18n();
  const counts = useFishCounts();
  let cursor = 0;
  return <div className="preferences fish-settings">
    {FISH_ROSTER.map(section => <section className="preference-group" aria-label={t(section.title)} key={section.title}>
      <h3>{t(section.title)}</h3>
      <div className="preference-card">
        {section.entries.map(entry => {
          const count = counts[cursor++] ?? 0, name = t(entry.name);
          return <div className="preference-row fish-row" role="group" aria-label={name} data-species={entry.id} key={entry.id}>
            <FishGlyph id={entry.id} />
            <span className="preference-row__label">{name}</span>
            <output className="preference-row__value" aria-live="polite"
              aria-label={t(entry.unit === "fish" ? "fish.count" : "fish.shoals", {count})}>{count}</output>
            <Stepper value={count} min={0} max={entry.max} onChange={next => settings.set(entry.path, next, {interaction: `fish:${entry.id}`})}
              decreaseLabel={t("composition.remove", {family: name})} increaseLabel={t("composition.add", {family: name})} />
          </div>;
        })}
      </div>
      <p className="preference-note">{t(section.note)}</p>
    </section>)}
    <section className="preference-group"><div className="preference-card">
      <button type="button" className="preference-row preference-row--button preference-row--danger" data-fish-reset onClick={restoreDefaultFish}>{t("fish.reset")}</button>
    </div></section>
  </div>;
}
