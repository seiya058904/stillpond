import { Check, ChevronRight, SlidersHorizontal, Cloud, CloudFog, CloudRain, Fish, Maximize2, Moon, Sun, Sunset, Volume2, Waves } from "lucide-react";
import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { languages, useI18n } from "./i18n";
import { useSetting } from "./settings/react";
import { settings } from "./settings/store";
import { IconTile, RangeInput, SegmentedControl } from "./settings-ui";
import { speciesInPond, useFishCounts } from "./fish-settings";
import { WEATHER_PRESETS, type WeatherPresetId } from "./weather";
import type { FrameRateCap } from "./performance-prefs";

const weatherIcons = {sunny: Sun, rain: CloudRain, "deep-clear": Waves, overcast: Cloud, mist: CloudFog, sunset: Sunset, moonlight: Moon};
const frameRates = ["60", "30", "20", "native"] as const;

// iOS system colors keep their meaning in light and dark, so tiles stay constant.
export const TILE = {red: "#ff3b30", orange: "#ff9500", gray: "#8e8e93", indigo: "#5856d6", teal: "#30b0c7", pink: "#ff2d55", blue: "#007aff", purple: "#af52de", green: "#34c759"} as const;

export interface QuickSettingsProps {
  weather: WeatherPresetId;
  rain: boolean;
  onWeatherChange: (id: WeatherPresetId) => void;
  onRainChange: (enabled: boolean) => void;
  sound: { enabled: boolean; change: (enabled: boolean) => void; unavailable: boolean };
  frameRate: FrameRateCap;
  onFrameRateChange: (value: string) => void;
  ambient: boolean;
  onAmbientChange: () => void;
  onFish: () => void;
  onAdvanced: () => void;
  onReset: () => void;
}

function Group({title, children, note, status}: {title?: string; children: ReactNode; note?: string; status?: boolean}) {
  return <section className="preference-group" aria-label={title}>
    {title && <h3>{title}</h3>}
    <div className="preference-card">{children}</div>
    {note && <p className="preference-note" role={status ? "status" : undefined}>{note}</p>}
  </section>;
}

export function QuickSettings({weather, rain, onWeatherChange, onRainChange, sound, frameRate, onFrameRateChange, ambient, onAmbientChange, onFish, onAdvanced, onReset}: QuickSettingsProps) {
  const {t, language, setLanguage} = useI18n();
  const [count, setCount] = useSetting<number>(["koi", "initialCount"]);
  const [shoals] = useSetting<number>(["tiny-fish", "visibleSchoolCount"]);
  const kinds = speciesInPond(useFishCounts());
  return <div className="preferences">
    <Group title={t("product.pond")} note={t("product.medakaHint")}>
      <div className="preference-cell" data-base-ui-swipe-ignore>
        <div className="preference-row preference-row--plain">
          <IconTile color={TILE.red}><Fish /></IconTile>
          <label className="preference-row__label" htmlFor="pond-density">{t("product.density")}</label>
          <output className="preference-row__value" htmlFor="pond-density">{t("product.koi", {count})}</output>
        </div>
        <RangeInput id="pond-density" min={0} max={48} step={1} value={count} valueText={t("product.koi", {count})} onChange={setCount} />
        <div className="range-captions"><span>{t("product.few")}</span><span>{t("product.many")}</span></div>
      </div>
      <button className="preference-row preference-row--button" data-preference="fish" onClick={onFish}>
        <IconTile color={TILE.orange}><Fish /></IconTile>
        <span className="preference-row__label">{t("fish.row")}</span>
        <span className="preference-row__value">{t("fish.kinds", {count: kinds})}</span>
        <ChevronRight className="preference-row__chevron" aria-hidden="true" />
      </button>
      <div className="preference-row">
        <IconTile color={TILE.teal}><Fish /></IconTile>
        <label className="preference-row__label" htmlFor="pond-medaka">{t("product.medaka")}</label>
        <Switch id="pond-medaka" checked={shoals > 0} onCheckedChange={on => settings.setMedakaEnabled(on)} />
      </div>
    </Group>
    <Group title={t("quick.atmosphere")}>
      <div className="preference-cell">
        <div className="weather-cards" role="group" aria-label={t("controls.weatherLighting")}>
          {WEATHER_PRESETS.map(preset => {
            const Icon = weatherIcons[preset.id];
            return <button key={preset.id} className={"weather-card weather-card--"+preset.id} aria-pressed={weather===preset.id}
              onClick={() => onWeatherChange(preset.id)}>
              <span className="weather-card__scene" aria-hidden="true"><Icon />
                {weather===preset.id && <span className="weather-check"><Check /></span>}
              </span><span>{t(`weather.${preset.id}`)}</span>
            </button>;
          })}
        </div>
      </div>
      <div className="preference-row">
        <IconTile color={TILE.blue}><CloudRain /></IconTile>
        <label className="preference-row__label" htmlFor="pond-rain">{t("quick.rain")}</label>
        <Switch id="pond-rain" checked={rain} onCheckedChange={onRainChange} />
      </div>
    </Group>
    <Group title={t("controls.sound")} note={t(sound.unavailable ? "audio.unavailable" : "product.soundHint")} status={sound.unavailable}>
      <div className="preference-row">
        <IconTile color={TILE.pink}><Volume2 /></IconTile>
        <label className="preference-row__label" htmlFor="pond-sound">{t("quick.sound")}</label>
        <Switch id="pond-sound" checked={sound.enabled} onCheckedChange={sound.change} />
      </div>
    </Group>
    <Group title={t("product.display")} note={t(frameRate === "native" ? "fps.native.hint" : `fps.${frameRate}`)}>
      <div className="preference-row">
        <IconTile color={TILE.indigo}><Maximize2 /></IconTile>
        <label className="preference-row__label" htmlFor="pond-ambient">{t("product.ambient")}</label>
        <Switch id="pond-ambient" checked={ambient} onCheckedChange={onAmbientChange} />
      </div>
      <div className="preference-cell">
        <SegmentedControl label={t("product.motion")} value={frameRate} onChange={onFrameRateChange}
          options={frameRates.map(id => ({value: id, label: t(`product.fps.${id}`)}))} />
      </div>
    </Group>
    <Group title={t("settings.language")}>
      <div className="preference-list" role="group" aria-label={t("settings.language")}>
        {languages.map(option => <button className="preference-row preference-row--button selection-row" key={option.id} aria-pressed={language===option.id} lang={option.id} onClick={() => setLanguage(option.id)}>
          <span className="preference-row__label">{option.label}</span>{language===option.id && <Check className="selection-row__check" aria-hidden="true" />}</button>)}
      </div>
    </Group>
    <Group note={t("product.advancedHint")}>
      <button className="preference-row preference-row--button" data-preference="advanced" onClick={onAdvanced}>
        <IconTile color={TILE.gray}><SlidersHorizontal /></IconTile>
        <span className="preference-row__label">{t("advanced.title")}</span><ChevronRight className="preference-row__chevron" aria-hidden="true" />
      </button>
    </Group>
    <Group>
      <button className="preference-row preference-row--button preference-row--danger" data-preference="reset" onClick={onReset}>{t("action.resetAll")}</button>
    </Group>
  </div>;
}
