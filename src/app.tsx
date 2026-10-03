import {
  Cloud,
  CloudFog,
  CloudRain,
  EyeOff,
  Gauge,
  Maximize2,
  Minus,
  Minimize2,
  Moon,
  Plus,
  RotateCcw,
  Settings2,
  Shuffle,
  Sun,
  Sunset as SunsetIcon,
  Undo2,
  Volume2,
  Waves,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { AUDIO } from "./audio-config";
import { ConfigEditor } from "./config-editor";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  FIXED_STEP,
  setCanvasSize,
} from "./config";
import { FishRenderer } from "./fish-renderer";
import { createFrameLimiter } from "./frame-limiter";
import { useIsMobile } from "./hooks/use-mobile";
import { clamp } from "./math";
import project from "../project.config.json";
import { useI18n } from "./i18n";
import { pondPoint, pondSize } from "./viewport";
import { readSoundEnabled, saveSoundEnabled } from "./sound-preference";
import {
  FRAME_RATE_OPTIONS,
  effectiveFrameRate,
  frameRateOption,
  isFrameRateCap,
  loadPerformancePrefs,
  savePerformancePrefs,
  type PerformancePrefs,
} from "./performance-prefs";
import { connectSettingsEffects } from "./settings/effects";
import { connectPersistence, loadInto } from "./settings/persistence";
import { useSetting, useSettingsMeta } from "./settings/react";
import { settings } from "./settings/store";
import type { SectionId } from "./settings/definition";
import { School } from "./school";
import {
  DEFAULT_WEATHER_PRESET_ID,
  getWeatherPreset,
  WEATHER_PRESETS,
  type WeatherPresetId,
} from "./weather";

interface PondRuntime {
  school: School;
  renderer: FishRenderer;
  showDebug: boolean;
}

const AMBIENT_IDLE_DELAY_MS = 2400;

// Restores v2 (or migrates v1) localStorage settings into the store before
// the first render, and wires up debounced+pagehide saving from then on.
loadInto(settings);
connectPersistence(settings);

function pondRenderSize(display: HTMLElement) {
  const { width, height } = display.getBoundingClientRect();
  return pondSize(width, height);
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && (target.isContentEditable ||
      Boolean(target.closest("button, summary, [role=slider], [role=switch], [role=menuitemradio]"))))
  );
}

function WeatherIcon({ id }: { id: WeatherPresetId }) {
  switch (id) {
    case "sunny":
      return <Sun aria-hidden="true" />;
    case "deep-clear":
      return <Waves aria-hidden="true" />;
    case "overcast":
      return <Cloud aria-hidden="true" />;
    case "mist":
      return <CloudFog aria-hidden="true" />;
    case "sunset":
      return <SunsetIcon aria-hidden="true" />;
    case "moonlight":
      return <Moon aria-hidden="true" />;
    case "rain":
      return <CloudRain aria-hidden="true" />;
  }
}

export function App() {
  const { language, t, family } = useI18n();
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("page.title", { name: project.name });
    document.querySelectorAll('meta[name="description"], meta[property="og:description"]')
      .forEach((meta) => meta.setAttribute("content", t("page.description")));
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", document.title);
    document.querySelector('meta[property="og:locale"]')?.setAttribute("content", language === "en" ? "en_US" : "zh_CN");
  }, [language, t]);
  const isMobile = useIsMobile();
  const stageRef = useRef<HTMLElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ambientAudioContextRef = useRef<AudioContext | null>(null);
  const ambientAudioGainRef = useRef<GainNode | null>(null);
  const ambientAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const ambientAudioLoadingRef = useRef<Promise<void> | null>(null);
  const runtimeRef = useRef<PondRuntime | null>(null);
  const ambientModeRef = useRef(false);
  const [initialSound] = useState(readSoundEnabled);
  const soundEnabledRef = useRef(initialSound);
  const [koiCount] = useSetting<number>(["koi", "initialCount"]);
  const [showInterface, setShowInterface] = useState(true);
  const [ambientMode, setAmbientMode] = useState(false);
  const [ambientControlsVisible, setAmbientControlsVisible] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [weatherMenuOpen, setWeatherMenuOpen] = useState(false);
  const [frameRateMenuOpen, setFrameRateMenuOpen] = useState(false);
  const [performancePrefs, setPerformancePrefs] =
    useState<PerformancePrefs>(loadPerformancePrefs);
  const frameRateCap = effectiveFrameRate(performancePrefs, ambientMode);
  // The render loop reads the cap from a ref so changing it never re-runs the
  // runtime effect (which would dispose and recreate the renderer).
  const frameRateCapRef = useRef(frameRateCap);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(
    initialSound,
  );
  const settingsMeta = useSettingsMeta();
  const { weather: weatherPreset, rain: rainEnabled, canUndo } = settingsMeta;
  const [selectedFamily, setSelectedFamily] = useState(0);
  const [previewFamily, setPreviewFamily] = useState<number | null>(null);
  const previewFamilyRef = useRef<number | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const scatter = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.school.scatter();

  }, []);

  const setFamilyPreview = useCallback((index: number | null) => {
    previewFamilyRef.current = index;
    setPreviewFamily(index);
    runtimeRef.current?.renderer.setPreviewFamily(index);
  }, []);

  // Clears the family preview on any settings edit that doesn't keep it
  // (koi-palettes/koi-patterns edits and a few koi body/eye fields do).
  useEffect(() => {
    return settings.subscribe((batch) => {
      if (previewFamilyRef.current === null) return;
      if (batch.some((change) => !change.keepsFamilyPreview)) setFamilyPreview(null);
    });
  }, [setFamilyPreview]);

  const changeKoiCount = useCallback((amount: number) => {
    const current = settings.live.koi.initialCount;
    settings.set(["koi", "initialCount"], clamp(current + amount, 1, 48));
  }, []);

  const setAmbientModeState = useCallback((active: boolean) => {
    ambientModeRef.current = active;
    setAmbientMode(active);
    setAmbientControlsVisible(true);
  }, []);

  useEffect(() => {
    frameRateCapRef.current = frameRateCap;
  }, [frameRateCap]);

  const changeFrameRate = useCallback((value: string) => {
    if (!isFrameRateCap(value)) return;
    const next: PerformancePrefs = { version: 1, frameRate: value, explicit: true };
    setPerformancePrefs(next);
    savePerformancePrefs(next);
  }, []);

  const toggleAmbientMode = useCallback(async () => {
    const stage = stageRef.current;
    if (!stage) return;

    if (ambientModeRef.current) {
      setAmbientModeState(false);
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => undefined);
      }
      return;
    }

    setAmbientModeState(true);
    const fullscreenRoot = document.documentElement;
    if (!document.fullscreenElement && fullscreenRoot.requestFullscreen) {
      await fullscreenRoot.requestFullscreen().catch(() => undefined);
    }
  }, [setAmbientModeState]);

  // Keeps the renderer's weather look and the simulation's rain intensity in
  // sync with the store, whether they change via a slider, Undo, or reload.
  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    runtime.renderer.setWeatherPreset(weatherPreset);
  }, [weatherPreset]);
  useEffect(() => {
    runtimeRef.current?.school.setRainIntensity(rainEnabled ? 1 : 0);
  }, [rainEnabled]);

  const startAmbientAudio = useCallback(async (): Promise<void> => {
    if (ambientAudioSourceRef.current) {
      await ambientAudioContextRef.current?.resume();
      return;
    }
    if (ambientAudioLoadingRef.current) {
      await ambientAudioLoadingRef.current;
      return;
    }

    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.value = soundEnabledRef.current ? AUDIO.ambient.volume : 0;
    gain.connect(context.destination);
    ambientAudioContextRef.current = context;
    ambientAudioGainRef.current = gain;

    const loading = (async (): Promise<void> => {
      await context.resume();
      const loadBuffer = async (path: string): Promise<AudioBuffer> => {
        const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
        if (!response.ok) throw new Error(`Unable to load ${path}`);
        return context.decodeAudioData(await response.arrayBuffer());
      };
      const ambientBuffer = await loadBuffer(AUDIO.ambient.source);
      if (context.state === "closed") return;

      const ambientSource = context.createBufferSource();
      ambientSource.buffer = ambientBuffer;
      ambientSource.loop = true;
      ambientSource.connect(gain);
      ambientSource.start();
      ambientAudioSourceRef.current = ambientSource;
    })();
    ambientAudioLoadingRef.current = loading;
    try {
      await loading;
    } catch (error) {
      if (ambientAudioContextRef.current === context) {
        ambientAudioContextRef.current = null;
        ambientAudioGainRef.current = null;
      }
      if (context.state !== "closed") void context.close();
      throw error;
    } finally {
      ambientAudioLoadingRef.current = null;
    }
  }, []);

  const setAmbientSoundEnabled = useCallback((enabled: boolean) => {
    soundEnabledRef.current = enabled;
    setSoundEnabled(enabled);
    saveSoundEnabled(enabled);
    if (enabled) void startAmbientAudio().catch(() => {
      soundEnabledRef.current = false;
      setSoundEnabled(false);
      saveSoundEnabled(false);
    });

    const context = ambientAudioContextRef.current;
    const gain = ambientAudioGainRef.current;
    if (context && gain) {
      const now = context.currentTime;
      // cancelAndHoldAtTime is missing in Firefox; pin the current value manually there.
      if (typeof gain.gain.cancelAndHoldAtTime === "function") {
        gain.gain.cancelAndHoldAtTime(now);
      } else {
        const current = gain.gain.value;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(current, now);
      }
      gain.gain.linearRampToValueAtTime(
        enabled ? AUDIO.ambient.volume : 0,
        now + AUDIO.toggleFadeSeconds,
      );
    }
  }, [startAmbientAudio]);

  const undoLastInteraction = useCallback(() => {
    settings.undo();
  }, []);

  const resetSection = useCallback((sectionIds: readonly SectionId[]) => {
    settings.resetSections(sectionIds);
    if (previewFamilyRef.current !== null && sectionIds.some((id) => id !== "koi-palettes" && id !== "koi-patterns")) {
      setFamilyPreview(null);
    }
  }, [setFamilyPreview]);

  const resetSettings = useCallback(() => {
    settings.resetAll();
    setFamilyPreview(null);
    setConfirmResetAll(false);
  }, [setFamilyPreview]);

  const changeFamily = useCallback((index: number) => {
    setSelectedFamily(index);
    setFamilyPreview(index);
  }, [setFamilyPreview]);

  const handleSettingsOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setFamilyPreview(null);
      setConfirmResetAll(false);
    }
    setSettingsOpen(open);
  }, [setFamilyPreview]);

  useEffect(() => {
    const unlockAmbientAudio = (): void => {
      window.removeEventListener("pointerdown", unlockAmbientAudio);
      window.removeEventListener("keydown", unlockAmbientAudio);
      if (soundEnabledRef.current) {
        void startAmbientAudio().catch(() => undefined);
      }
    };

    window.addEventListener("pointerdown", unlockAmbientAudio);
    window.addEventListener("keydown", unlockAmbientAudio);
    return () => {
      window.removeEventListener("pointerdown", unlockAmbientAudio);
      window.removeEventListener("keydown", unlockAmbientAudio);
    };
  }, [startAmbientAudio]);

  useEffect(() => () => {
    ambientAudioSourceRef.current?.stop();
    ambientAudioSourceRef.current = null;
    ambientAudioGainRef.current = null;
    const context = ambientAudioContextRef.current;
    ambientAudioContextRef.current = null;
    if (context && context.state !== "closed") void context.close();
  }, []);

  const changeWeather = useCallback((id: WeatherPresetId) => {
    setFamilyPreview(null);
    settings.setWeather(id);
    setWeatherMenuOpen(false);
  }, [setFamilyPreview]);

  const handleRainChange = useCallback((enabled: boolean) => {
    settings.setRain(enabled);
  }, []);

  const handleSoundChange = useCallback((enabled: boolean) => {
    setAmbientSoundEnabled(enabled);
  }, [setAmbientSoundEnabled]);

  const resetAtmosphere = useCallback(() => {
    changeWeather(DEFAULT_WEATHER_PRESET_ID);
    setAmbientSoundEnabled(false);
  }, [changeWeather, setAmbientSoundEnabled]);

  useEffect(() => {
    const handleFullscreenChange = (): void => {
      if (document.fullscreenElement === document.documentElement) {
        setAmbientModeState(true);
      } else if (ambientModeRef.current && !document.fullscreenElement) {
        setAmbientModeState(false);
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, [setAmbientModeState]);

  useEffect(() => {
    if (!ambientMode || settingsOpen || weatherMenuOpen || frameRateMenuOpen) {
      setAmbientControlsVisible(true);
      return;
    }

    let idleTimer = window.setTimeout(
      () => setAmbientControlsVisible(false),
      AMBIENT_IDLE_DELAY_MS,
    );
    const revealControls = (): void => {
      setAmbientControlsVisible(true);
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(
        () => setAmbientControlsVisible(false),
        AMBIENT_IDLE_DELAY_MS,
      );
    };

    window.addEventListener("pointermove", revealControls);
    window.addEventListener("pointerdown", revealControls);
    window.addEventListener("keydown", revealControls);
    return () => {
      window.clearTimeout(idleTimer);
      window.removeEventListener("pointermove", revealControls);
      window.removeEventListener("pointerdown", revealControls);
      window.removeEventListener("keydown", revealControls);
    };
  }, [ambientMode, settingsOpen, weatherMenuOpen, frameRateMenuOpen]);

  useEffect(() => {
    if (!showInterface && previewFamilyRef.current !== null) setFamilyPreview(null);
  }, [showInterface, setFamilyPreview]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const display = displayRef.current;
    if (!canvas || !display) return;
    const initialSize = pondRenderSize(display);
    setCanvasSize(initialSize.width, initialSize.height);
    const school = new School();
    const renderer = new FishRenderer(canvas);
    const runtime: PondRuntime = { school, renderer, showDebug: false };
    runtimeRef.current = runtime;
    const activeWeather = getWeatherPreset(settings.meta().weather);
    renderer.setWeatherPreset(activeWeather.id);
    school.setRainIntensity(settings.meta().rain ? 1 : 0);
    const disconnectEffects = connectSettingsEffects(settings, { school, renderer });

    const resizeObserver = new ResizeObserver(() => {
      const nextSize = pondRenderSize(display);
      if (nextSize.width === CANVAS_WIDTH && nextSize.height === CANVAS_HEIGHT) return;
      const oldWidth = CANVAS_WIDTH;
      const oldHeight = CANVAS_HEIGHT;
      setCanvasSize(nextSize.width, nextSize.height);
      school.resize(nextSize.width / oldWidth, nextSize.height / oldHeight);
      renderer.resize(nextSize.width, nextSize.height, oldWidth, oldHeight);
    });
    resizeObserver.observe(display);

    let animationFrame = 0;
    let accumulator = 0;
    let simulationTime = 0;
    let previousTime = performance.now();
    const frameLimiter = createFrameLimiter();
    const animate = (now: number): void => {
      const cap = frameRateOption(frameRateCapRef.current);
      if (!frameLimiter.shouldRender(now, cap.fps)) {
        // previousTime only advances on rendered frames, so the accumulator
        // below still receives the full real elapsed time.
        animationFrame = requestAnimationFrame(animate);
        return;
      }
      accumulator += Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      while (accumulator >= FIXED_STEP) {
        simulationTime += FIXED_STEP;
        school.update(FIXED_STEP, simulationTime);
        accumulator -= FIXED_STEP;
      }

      renderer.draw(school, simulationTime, runtime.showDebug);
      animationFrame = requestAnimationFrame(animate);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      switch (event.code) {
        case "Space":
          event.preventDefault();
          school.scatter();
          break;
        case "BracketLeft":
          changeKoiCount(-1);
          break;
        case "BracketRight":
          changeKoiCount(1);
          break;
        case "KeyD":
          runtime.showDebug = !runtime.showDebug;
          break;
        case "KeyH":
          setShowInterface((current) => !current);
          break;
        case "KeyR":
          school.reset();
          break;
        case "KeyF":
          event.preventDefault();
          void toggleAmbientMode();
          break;
        default:
          return;
      }

    };

    window.addEventListener("keydown", handleKeyDown);

    animationFrame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationFrame);
      disconnectEffects();
      resizeObserver.disconnect();
      window.removeEventListener("keydown", handleKeyDown);
      renderer.dispose();
      runtimeRef.current = null;
    };
  }, [changeKoiCount, toggleAmbientMode]);

  const callFish = (event: ReactPointerEvent<HTMLCanvasElement>): void => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (event.button !== 0 || !event.isPrimary) return;
    runtime.school.callTo(pondPoint(event.clientX, event.clientY, bounds, {
      width: CANVAS_WIDTH, height: CANVAS_HEIGHT,
    }));

  };

  const revealHiddenInterfaceOnMobile = (
    event: ReactPointerEvent<HTMLElement>,
  ): void => {
    if (!isMobile || showInterface) return;
    event.preventDefault();
    event.stopPropagation();
    setShowInterface(true);
  };

  const selectedWeather = getWeatherPreset(weatherPreset);
  const selectedFrameRate = frameRateOption(frameRateCap);
  const ambientUiHeldOpen = settingsOpen || weatherMenuOpen || frameRateMenuOpen;
  const ambientUiHidden =
    ambientMode && !ambientControlsVisible && !ambientUiHeldOpen;

  return (
    <main
      ref={stageRef}
      className={`stage${ambientMode ? " stage--ambient" : ""}${
        ambientUiHidden
          ? " stage--ambient-idle"
          : ""
      }`}
      data-version={project.version}
      aria-label={t("pond.label")}
      onPointerDownCapture={revealHiddenInterfaceOnMobile}
    >
      <div className="pond-shell">
        <div className="display" ref={displayRef}>
          <canvas
            ref={canvasRef}
            id="pond"
            aria-label={t("pond.canvas")}
            onPointerDown={callFish}
          />
          {previewFamily !== null && settingsOpen && (
            <div className="pond-preview-label" aria-live="polite">
              {t("pond.preview", { family: family(settings.live["koi-palettes"][previewFamily]?.name ?? "") })}
            </div>
          )}
        </div>

        {showInterface && (
          <div
            className={`pond-ui${
              ambientUiHidden
                ? " pond-ui--hidden"
                : ""
            }`}
          >
            <header className="brand-float">
              <h1 className="brand-wordmark">{project.name}</h1>
            </header>

            <div className="top-actions">
              <Drawer
                open={settingsOpen}
                onOpenChange={handleSettingsOpenChange}
                modal={false}
                swipeDirection={isMobile ? "down" : "right"}
                showSwipeHandle={isMobile}
                disablePointerDismissal
              >
              <DrawerTrigger
                render={
                  <Button
                    className="settings-trigger"
                    variant="ghost"
                    aria-label={t("settings.open")}
                  />
                }
              >
                <Settings2 aria-hidden="true" />
                <span>{t("settings.button")}</span>
              </DrawerTrigger>
              <DrawerContent className="settings-drawer">
                <DrawerHeader className="settings-drawer__header">
                  <div>
                    <DrawerTitle>{t("settings.title")}</DrawerTitle>
                    <DrawerDescription>{t("settings.description")}</DrawerDescription>
                  </div>
                  <DrawerClose
                    render={
                      <Button variant="ghost" size="icon" aria-label={t("settings.close")} />
                    }
                  >
                    <X aria-hidden="true" />
                  </DrawerClose>
                </DrawerHeader>
                <div className="settings-scroll">
                  <ConfigEditor
                    query={searchQuery}
                    onQueryChange={setSearchQuery}
                    weather={weatherPreset}
                    rainEnabled={rainEnabled}
                    soundEnabled={soundEnabled}
                    onWeatherChange={changeWeather}
                    onRainChange={handleRainChange}
                    onSoundChange={handleSoundChange}
                    onResetSection={resetSection}
                    onResetAtmosphere={resetAtmosphere}
                    selectedFamily={selectedFamily}
                    previewFamily={previewFamily}
                    onFamilyChange={changeFamily}
                    onPreviewFamilyChange={setFamilyPreview}
                  />
                </div>
                <DrawerFooter className="settings-drawer__footer">
                  {confirmResetAll ? (
                    <div className="settings-reset-confirm" role="group" aria-label={t("settings.resetConfirmLabel")}>
                      <span>{t("settings.resetConfirm")}</span>
                      <Button variant="ghost" onClick={() => setConfirmResetAll(false)}>{t("action.cancel")}</Button>
                      <Button variant="destructive" onClick={resetSettings}>{t("action.resetAll")}</Button>
                    </div>
                  ) : (
                    <>
                      <Button variant="ghost" onClick={undoLastInteraction} disabled={!canUndo}>
                        <Undo2 aria-hidden="true" />{t("action.undo")}</Button>
                      <Button variant="outline" onClick={() => setConfirmResetAll(true)}>
                        <RotateCcw aria-hidden="true" />{t("action.resetAll")}</Button>
                      <DrawerClose render={<Button />}>{t("action.done")}</DrawerClose>
                    </>
                  )}
                </DrawerFooter>
              </DrawerContent>
              </Drawer>
            </div>
          </div>
        )}

        {showInterface && (
          <nav
            className={`control-dock${
              ambientUiHidden
                ? " control-dock--hidden"
                : ""
            }`}
            aria-label={t("controls.label")}
          >
            <div className="control-group control-group--view">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void toggleAmbientMode()}
                aria-label={t(ambientMode ? "controls.exitAmbient" : "controls.enterAmbient")}
                aria-keyshortcuts="F"
                aria-pressed={ambientMode}
              >
                {ambientMode ? (
                  <Minimize2 aria-hidden="true" />
                ) : (
                  <Maximize2 aria-hidden="true" />
                )}
                <span className="control-label">{t(ambientMode ? "controls.exit" : "controls.ambient")}</span>
                <Kbd className="control-shortcut">F</Kbd>
              </Button>
              <DropdownMenu
                open={frameRateMenuOpen}
                onOpenChange={setFrameRateMenuOpen}
              >
                <DropdownMenuTrigger
                  render={
                    <Button
                      className="frame-rate-trigger"
                      variant="ghost"
                      size="sm"
                      aria-label={t("controls.frameRateValue", { value: t(`fps.${selectedFrameRate.id}`) })}
                    />
                  }
                >
                  <Gauge aria-hidden="true" />
                  <span className="control-label">{t(`fps.${selectedFrameRate.id}`)}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="frame-rate-menu"
                  side="top"
                  align="center"
                  sideOffset={8}
                >
                  <DropdownMenuRadioGroup
                    value={frameRateCap}
                    onValueChange={changeFrameRate}
                  >
                    <DropdownMenuLabel>{t("controls.frameRate")}</DropdownMenuLabel>
                    {FRAME_RATE_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.id}
                        value={option.id}
                        closeOnClick
                      >
                        <span className="frame-rate-option">
                          <span className="frame-rate-option__label">{t(`fps.${option.id}`)}</span>
                          <span className="frame-rate-option__hint">{t(`fps.${option.id}.hint`)}</span>
                        </span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowInterface(false)}
                aria-label={t("controls.hideLabel")}
                aria-keyshortcuts="H"
              >
                <EyeOff aria-hidden="true" />
                <span className="control-label">{t("controls.hide")}</span>
                <Kbd className="control-shortcut">H</Kbd>
              </Button>
            </div>
            <Separator className="control-divider" orientation="vertical" />
            <div className="control-group control-group--simulation">
              <Button
                variant="secondary"
                size="sm"
                onClick={scatter}
                aria-label={t("controls.scatter")}
                aria-keyshortcuts="Space"
              >
                <Shuffle aria-hidden="true" />
                <span className="control-label">{t("controls.scatter")}</span>
                <Kbd className="control-shortcut">{t("controls.space")}</Kbd>
              </Button>
              <Separator orientation="vertical" />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => changeKoiCount(-1)}
                aria-label={t("controls.removeKoi")}
                aria-keyshortcuts="["
              >
                <Minus aria-hidden="true" />
              </Button>
              <output className="koi-count" aria-live="polite" aria-label={t("controls.koiCount")}>
                {koiCount}
              </output>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => changeKoiCount(1)}
                aria-label={t("controls.addKoi")}
                aria-keyshortcuts="]"
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
            <Separator className="control-divider" orientation="vertical" />
            <div className="control-group control-group--environment">
              <DropdownMenu
                open={weatherMenuOpen}
                onOpenChange={setWeatherMenuOpen}
              >
                <DropdownMenuTrigger
                  render={
                    <Button
                      className="weather-trigger"
                      variant="ghost"
                      size="sm"
                      aria-label={t("controls.weatherValue", { value: t(`weather.${selectedWeather.id}`) })}
                    />
                  }
                >
                  <WeatherIcon id={weatherPreset} />
                  <span className="control-label">{t(`weather.${selectedWeather.id}`)}</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  className="weather-menu"
                  side="top"
                  align="center"
                  sideOffset={8}
                >
                  <DropdownMenuRadioGroup
                    value={weatherPreset}
                    onValueChange={(value) =>
                      changeWeather(value as WeatherPresetId)
                    }
                  >
                    <DropdownMenuLabel>{t("controls.weatherLighting")}</DropdownMenuLabel>
                    {WEATHER_PRESETS.map((preset) => (
                      <DropdownMenuRadioItem
                        key={preset.id}
                        value={preset.id}
                        closeOnClick
                      >
                        <WeatherIcon id={preset.id} />
                        {t(`weather.${preset.id}`)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="rain-control">
                <CloudRain aria-hidden="true" />
                <span className="rain-control__label">{t("weather.rain")}</span>
                <Switch
                  size="sm"
                  checked={rainEnabled}
                  onCheckedChange={handleRainChange}
                  aria-label={t("controls.rainLabel")}
                />
              </div>
              <div className="rain-control">
                <Volume2 aria-hidden="true" />
                <span className="rain-control__label">{t("controls.sound")}</span>
                <Switch
                  size="sm"
                  checked={soundEnabled}
                  onCheckedChange={handleSoundChange}
                  aria-label={t("controls.soundLabel")}
                />
              </div>
            </div>
          </nav>
        )}
      </div>
    </main>
  );
}
