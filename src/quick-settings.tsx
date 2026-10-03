import { Check, ChevronRight, SlidersHorizontal, Cloud, CloudFog, CloudRain, Fish, Globe2, Maximize2, Moon, Sun, Sunset, Volume2, Waves, Monitor } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { motion } from "motion/react";
import { Switch } from "@/components/ui/switch";
import { languages, useI18n } from "./i18n";
import { useSetting } from "./settings/react";
import { WEATHER_PRESETS, type WeatherPresetId } from "./weather";
import type { FrameRateCap } from "./performance-prefs";

const weatherIcons = {sunny: Sun, rain: CloudRain, "deep-clear": Waves, overcast: Cloud, mist: CloudFog, sunset: Sunset, moonlight: Moon};
export const preferenceTitles = {pond:"product.pond", atmosphere:"quick.atmosphere", sound:"controls.sound", language:"settings.language", display:"product.display", advanced:"advanced.title"} as const;
export type PreferencePage = "root" | keyof typeof preferenceTitles;
const preferenceIcons = {pond:Fish, atmosphere:Sun, sound:Volume2, language:Globe2, display:Monitor};

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
  page: PreferencePage;
  onNavigate: (page: PreferencePage) => void;
}

function Group({title, icon, children}: {title: string; icon: ReactNode; children: ReactNode}) {
  return <section className="preference-group" aria-label={title}>
    <h3>{icon}{title}</h3><div className="preference-card">{children}</div>
  </section>;
}

export function QuickSettings({weather, rain, onWeatherChange, onRainChange, sound, frameRate, onFrameRateChange, ambient, onAmbientChange, page, onNavigate}: QuickSettingsProps) {
  const {t, language, setLanguage} = useI18n();
  const [count, setCount] = useSetting<number>(["koi", "initialCount"]);
  const [shoals, setShoals] = useSetting<number>(["tiny-fish", "visibleSchoolCount"]);
  const summaries = {pond:t("product.koi", {count}), atmosphere:t(`weather.${weather}`), sound:t(sound.enabled ? "product.on" : "product.off"),
    language:languages.find(option => option.id === language)?.label, display:t(`product.fps.${frameRate}`)};
  if (page === "root") return <nav className="settings-menu" aria-label={t("settings.title")}>
    <div className="settings-list">
      {(["pond","atmosphere","sound","language","display"] as const).map(id => {
        const Icon = preferenceIcons[id];
        return <button key={id} className="settings-menu-row" data-preference={id} onClick={() => onNavigate(id)}>
          <span className="settings-menu-icon"><Icon aria-hidden="true" /></span><span>{t(preferenceTitles[id])}</span>
          <span className="settings-menu-value">{summaries[id]}</span><ChevronRight aria-hidden="true" />
        </button>;
      })}
    </div>
    <div className="settings-list settings-list--advanced"><button className="settings-menu-row" data-preference="advanced" onClick={() => onNavigate("advanced")}>
      <span className="settings-menu-icon"><SlidersHorizontal aria-hidden="true" /></span><span>{t("advanced.title")}</span><ChevronRight aria-hidden="true" />
    </button></div><p className="settings-menu-note">{t("product.advancedHint")}</p>
  </nav>;
  return <div className="preferences">
    {page === "pond" && <Group title={t("product.pond")} icon={<Fish aria-hidden="true" />}>
      <div className="preference-row"><label htmlFor="pond-density">{t("product.density")}</label><output htmlFor="pond-density">{t("product.koi", {count})}</output></div>
      <input id="pond-density" className="pond-range" type="range" min="1" max="48" step="1" value={count}
        aria-valuetext={t("product.koi", {count})} style={{"--range": ((count-1)/47*100)+"%"} as CSSProperties} onChange={event => setCount(Number(event.target.value))} />
      <div className="range-captions"><span>{t("product.few")}</span><span>{t("product.many")}</span></div>
      <div className="preference-row divided"><label htmlFor="pond-medaka">{t("product.medaka")}</label><Switch id="pond-medaka" checked={shoals > 0} onCheckedChange={on => setShoals(on ? 3 : 0)} /></div>
      <p className="preference-note">{t("product.medakaHint")}</p>
    </Group>}
    {page === "atmosphere" && <Group title={t("quick.atmosphere")} icon={<Sun aria-hidden="true" />}>
      <div className="weather-cards" role="group" aria-label={t("controls.weatherLighting")}>
        {WEATHER_PRESETS.map(preset => {
          const Icon = weatherIcons[preset.id];
          return <button key={preset.id} className={"weather-card weather-card--"+preset.id} aria-pressed={weather===preset.id}
            onClick={() => onWeatherChange(preset.id)}>
            <span className="weather-card__scene" aria-hidden="true"><Icon />
              {weather===preset.id && <motion.span className="weather-check" layoutId="weather-check" transition={{type:"spring",stiffness:480,damping:36}}><Check /></motion.span>}
            </span><span>{t(`weather.${preset.id}`)}</span>
          </button>;
        })}
      </div>
      <div className="preference-row divided"><label htmlFor="pond-rain">{t("quick.rain")}</label><Switch id="pond-rain" checked={rain} onCheckedChange={onRainChange} /></div>
    </Group>}
    {page === "sound" && <Group title={t("controls.sound")} icon={<Volume2 aria-hidden="true" />}>
      <div className="preference-row"><label htmlFor="pond-sound">{t("quick.sound")}</label><Switch id="pond-sound" checked={sound.enabled} onCheckedChange={sound.change} /></div>
      <p className="preference-note" role={sound.unavailable ? "status" : undefined}>{t(sound.unavailable ? "audio.unavailable" : "product.soundHint")}</p>
    </Group>}
    {page === "language" && <Group title={t("settings.language")} icon={<Globe2 aria-hidden="true" />}>
      <div className="settings-list" role="group" aria-label={t("settings.language")}>
        {languages.map(option => <button className="selection-row" key={option.id} aria-pressed={language===option.id} lang={option.id} onClick={() => setLanguage(option.id)}>
          <span>{option.label}</span>{language===option.id && <Check aria-hidden="true" />}</button>)}
      </div>
    </Group>}
    {page === "display" && <Group title={t("product.display")} icon={<Monitor aria-hidden="true" />}>
      <div className="settings-list" role="group" aria-label={t("product.motion")}>
        {(["60","30","20","native"] as const).map(id => <button className="selection-row" key={id} aria-pressed={frameRate===id} onClick={() => onFrameRateChange(id)}>
          <span><strong>{t(`product.fps.${id}`)}</strong><small>{id === "native" ? t("fps.native.hint") : t(`fps.${id}`)}</small></span>
          {frameRate===id && <motion.span layoutId="display-check"><Check aria-hidden="true" /></motion.span>}</button>)}
      </div>
      <button className="preference-row row-button divided" aria-pressed={ambient} onClick={onAmbientChange}>
        <span><Maximize2 aria-hidden="true" />{t(ambient ? "controls.exitAmbient" : "controls.enterAmbient")}</span><ChevronRight aria-hidden="true" />
      </button>
    </Group>}
  </div>;
}
