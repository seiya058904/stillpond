import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff, Maximize2, Minimize2, Settings2, Shuffle, Volume2, VolumeX } from "lucide-react";
import project from "../project.config.json";
import { useI18n } from "./i18n";
import { PondRuntime, type PondStatus } from "./pond-runtime";
import { effectiveFrameRate, isFrameRateCap, loadPerformancePrefs, savePerformancePrefs, type PerformancePrefs } from "./performance-prefs";
import { connectPersistence, loadInto } from "./settings/persistence";
import { settings } from "./settings/store";
import { usePondAudio } from "./use-pond-audio";

const loadSettings = () => import("./settings-panel");
const SettingsPanel = lazy(loadSettings);
loadInto(settings);
connectPersistence(settings);

// A failed on-demand download must not take the running pond down with it.
class SettingsBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function isControl(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, button, summary, [role=slider], [role=switch], [role=dialog], [contenteditable=true]"));
}

export function App() {
  const { language, t, family } = useI18n();
  const canvas = useRef<HTMLCanvasElement>(null);
  const display = useRef<HTMLDivElement>(null);
  const runtime = useRef<PondRuntime | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<PondStatus>("ready");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showInterface, setShowInterface] = useState(true);
  const [ambient, setAmbient] = useState(false);
  const ambientRef = useRef(false);
  const [idle, setIdle] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [performancePrefs, setPerformancePrefs] = useState<PerformancePrefs>(loadPerformancePrefs);
  const frameRate = effectiveFrameRate(performancePrefs, ambient);
  const cap = useRef(frameRate);
  cap.current = frameRate;
  const sound = usePondAudio();

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("page.title", { name: project.name });
    document.querySelectorAll('meta[name="description"], meta[property="og:description"]')
      .forEach((meta) => meta.setAttribute("content", t("page.description")));
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", document.title);
    document.querySelector('meta[property="og:locale"]')?.setAttribute("content", language === "en" ? "en_US" : "zh_CN");
  }, [language, t]);
  useEffect(() => {
    if (!canvas.current || !display.current) return;
    const pond = new PondRuntime(canvas.current, display.current, () => cap.current, setStatus);
    runtime.current = pond;
    return () => { pond.dispose(); runtime.current = null; };
  }, []);

  const changePreview = useCallback((index: number | null) => {
    setPreview(index); runtime.current?.setPreviewFamily(index);
  }, []);
  const changeSettingsOpen = useCallback((open: boolean) => {
    if (open) setSettingsLoaded(true);
    else { changePreview(null); trigger.current?.focus(); }
    setSettingsOpen(open);
  }, [changePreview]);
  const toggleAmbient = useCallback(async () => {
    const next = !ambientRef.current;
    ambientRef.current = next; setAmbient(next); setIdle(false);
    if (!next && document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else if (next && !document.fullscreenElement) await document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  const changeFrameRate = useCallback((value: string) => {
    if (!isFrameRateCap(value)) return;
    const next: PerformancePrefs = { version: 1, frameRate: value, explicit: true };
    setPerformancePrefs(next); savePerformancePrefs(next);
  }, []);

  useEffect(() => settings.subscribe((batch) => {
    if (batch.some((change) => !change.keepsFamilyPreview)) changePreview(null);
  }), [changePreview]);
  useEffect(() => {
    const fullscreen = () => {
      const next = Boolean(document.fullscreenElement);
      ambientRef.current = next; setAmbient(next);
    };
    document.addEventListener("fullscreenchange", fullscreen);
    return () => document.removeEventListener("fullscreenchange", fullscreen);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || isControl(event.target)) return;
      const pond = runtime.current;
      if (!pond) return;
      switch (event.code) {
        case "Space": event.preventDefault(); pond.school.scatter(); break;
        case "BracketLeft": settings.set(["koi", "initialCount"], Math.max(1, settings.live.koi.initialCount - 1)); break;
        case "BracketRight": settings.set(["koi", "initialCount"], Math.min(48, settings.live.koi.initialCount + 1)); break;
        case "KeyD": pond.showDebug = !pond.showDebug; break;
        case "KeyR": pond.school.reset(); break;
        case "KeyH": setShowInterface(value => !value); changePreview(null); break;
        case "KeyF": event.preventDefault(); void toggleAmbient(); break;
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [toggleAmbient, changePreview]);
  useEffect(() => {
    setIdle(false);
    if (!ambient || settingsOpen) return;
    let timer: ReturnType<typeof setTimeout>;
    const reveal = () => { setIdle(false); clearTimeout(timer); timer = setTimeout(() => setIdle(true), 2800); };
    reveal();
    window.addEventListener("pointermove", reveal);
    window.addEventListener("pointerdown", reveal);
    window.addEventListener("keydown", reveal);
    return () => {
      clearTimeout(timer); window.removeEventListener("pointermove", reveal);
      window.removeEventListener("pointerdown", reveal); window.removeEventListener("keydown", reveal);
    };
  }, [ambient, settingsOpen]);

  return <main className={"stage" + (idle ? " stage--idle" : "")} data-version={project.version} aria-label={t("pond.label")}>
    <div className="pond-shell"><div className="display" ref={display}>
      <canvas ref={canvas} id="pond" aria-label={t("pond.canvas")} onPointerDown={event => {
        if (!event.isPrimary || event.button !== 0) return;
        if (!showInterface) { setShowInterface(true); return; }
        runtime.current?.call(event.clientX, event.clientY);
      }} />
      {preview !== null && <div className="pond-preview-label" aria-live="polite">{t("pond.preview", { family: family(settings.live["koi-palettes"][preview]?.name ?? "") })}</div>}
    </div></div>
    {status !== "ready" && <div className="pond-status" role="status">
      <strong>{t(status === "restoring" ? "runtime.restoring" : "runtime.unavailable")}</strong>
      <p>{t("runtime.hint")}</p><button className="panel-button" onClick={() => runtime.current?.retry()}>{t("action.retry")}</button>
    </div>}
    {showInterface && <div className={"pond-ui" + (idle ? " pond-ui--hidden" : "")} inert={idle || undefined}>
      <header className="brand-float"><h1>{project.name}</h1></header>
      <button ref={trigger} className="glass-button settings-trigger" aria-label={t("settings.open")}
        aria-expanded={settingsOpen} aria-haspopup="dialog" onPointerEnter={() => { void loadSettings().catch(() => undefined); }} onFocus={() => { void loadSettings().catch(() => undefined); }}
        onClick={() => changeSettingsOpen(true)}><Settings2 aria-hidden="true" /><span>{t("settings.button")}</span></button>
      <nav className="control-dock" aria-label={t("controls.label")}>
        <button aria-label={t(ambient ? "controls.exitAmbient" : "controls.enterAmbient")} aria-pressed={ambient} aria-keyshortcuts="F" onClick={() => void toggleAmbient()}>
          {ambient ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}<span>{t("controls.ambient")}</span></button>
        <button aria-label={t("controls.scatter")} aria-keyshortcuts="Space" onClick={() => runtime.current?.school.scatter()}><Shuffle aria-hidden="true" /><span>{t("controls.scatter")}</span></button>
        <button aria-label={t("controls.soundLabel")} aria-pressed={sound.enabled} onClick={() => sound.change(!sound.enabled)}>
          {sound.enabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}<span>{t("controls.sound")}</span></button>
        <button aria-label={t("controls.hideLabel")} aria-keyshortcuts="H" onClick={() => { setShowInterface(false); changePreview(null); }}><EyeOff aria-hidden="true" /><span>{t("controls.hide")}</span></button>
      </nav>
    </div>}
    {!showInterface && <button className="restore-ui glass-button" aria-label={t("controls.show")} onClick={() => setShowInterface(true)}><Eye aria-hidden="true" /></button>}
    {settingsLoaded && <SettingsBoundary fallback={settingsOpen && <div className="settings-loading settings-load-error" role="alert">
      <p>{t("settings.loadFailed")}</p><div>
        <button className="glass-button" onClick={() => changeSettingsOpen(false)}>{t("action.cancel")}</button>
        <button className="glass-button" onClick={() => window.location.reload()}>{t("action.reload")}</button>
      </div>
    </div>}><Suspense fallback={<div className="settings-loading" role="status">{t("settings.loading")}</div>}>
      <SettingsPanel open={settingsOpen} onOpenChange={changeSettingsOpen} sound={sound} frameRate={frameRate}
        onFrameRateChange={changeFrameRate} ambient={ambient} onAmbientChange={() => void toggleAmbient()} preview={preview} onPreviewChange={changePreview} />
    </Suspense></SettingsBoundary>}
  </main>;
}
