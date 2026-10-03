import { Check, Cloud, CloudFog, CloudRain, Fish, Globe2, Maximize2, Moon, Sun, Sunset, Volume2, Waves, Monitor } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { motion } from "motion/react";
import { Switch } from "@/components/ui/switch";
import { languages, useI18n } from "./i18n";
import { useSetting } from "./settings/react";
import { WEATHER_PRESETS, type WeatherPresetId } from "./weather";
import type { FrameRateCap } from "./performance-prefs";

const weatherIcons = {sunny: Sun, rain: CloudRain, "deep-clear": Waves, overcast: Cloud, mist: CloudFog, sunset: Sunset, moonlight: Moon};

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
}

function Group({title, icon, children}: {title: string; icon: ReactNode; children: ReactNode}) {
  return <section className="preference-group" aria-label={title}>
    <h3>{icon}{title}</h3><div className="preference-card">{children}</div>
  </section>;
}

export function QuickSettings({weather, rain, onWeatherChange, onRainChange, sound, frameRate, onFrameRateChange, ambient, onAmbientChange}: QuickSettingsProps) {
  const {t, language, setLanguage} = useI18n();
  const [count, setCount] = useSetting<number>(["koi", "initialCount"]);
  return <div className="preferences">
    <Group title={t("product.pond")} icon={<Fish aria-hidden="true" />}>
      <div className="preference-row"><label htmlFor="pond-density">{t("product.density")}</label><output htmlFor="pond-density">{t("product.koi", {count})}</output></div>
      <input id="pond-density" className="pond-range" type="range" min="1" max="48" step="1" value={count}
        style={{"--range": ((count-1)/47*100)+"%"} as CSSProperties} onChange={event => setCount(Number(event.target.value))} />
      <div className="range-captions"><span>{t("product.few")}</span><span>{t("product.many")}</span></div>
    </Group>
    <Group title={t("quick.atmosphere")} icon={<Sun aria-hidden="true" />}>
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
    </Group>
    <Group title={t("controls.sound")} icon={<Volume2 aria-hidden="true" />}>
      <div className="preference-row"><label htmlFor="pond-sound">{t("quick.sound")}</label><Switch id="pond-sound" checked={sound.enabled} onCheckedChange={sound.change} /></div>
      <p className="preference-note" role={sound.unavailable ? "status" : undefined}>{t(sound.unavailable ? "audio.unavailable" : "product.soundHint")}</p>
    </Group>
    <Group title={t("settings.language")} icon={<Globe2 aria-hidden="true" />}>
      <div className="segmented" role="group" aria-label={t("settings.language")}>
        {languages.map(option => <button key={option.id} aria-pressed={language===option.id} lang={option.id} onClick={() => setLanguage(option.id)}>
          {language===option.id && <motion.span className="segment-selection" layoutId="language-selection" transition={{type:"spring",stiffness:450,damping:35}} />}
          <span>{option.label}</span></button>)}
      </div>
    </Group>
    <Group title={t("product.display")} icon={<Monitor aria-hidden="true" />}>
      <div className="segmented" role="group" aria-label={t("product.motion")}>
        {(["60","30","20","native"] as const).map(id => <button key={id} aria-pressed={frameRate===id} onClick={() => onFrameRateChange(id)}>
          {frameRate===id && <motion.span className="segment-selection" layoutId="display-selection" transition={{type:"spring",stiffness:450,damping:35}} />}
          <span>{t(`product.fps.${id}`)}</span></button>)}
      </div>
      <button className="preference-row row-button divided" aria-pressed={ambient} onClick={onAmbientChange}>
        <span><Maximize2 aria-hidden="true" />{t(ambient ? "controls.exitAmbient" : "controls.enterAmbient")}</span><span aria-hidden="true">↗</span>
      </button>
    </Group>
  </div>;
}
