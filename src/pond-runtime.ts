import { CANVAS_WIDTH, CANVAS_HEIGHT, FIXED_STEP, setCanvasSize } from "./config";
import { FishRenderer } from "./fish-renderer";
import { createFrameLimiter } from "./frame-limiter";
import { frameRateOption, type FrameRateCap } from "./performance-prefs";
import { School } from "./school";
import { connectSettingsEffects } from "./settings/effects";
import { settings } from "./settings/store";
import { pondPoint, pondSize } from "./viewport";

export type PondStatus = "ready" | "restoring" | "unavailable";

/** Owns the GPU and clock. React controls never own a simulation frame. */
export class PondRuntime {
  readonly school: School;
  renderer: FishRenderer | null = null;
  showDebug = false;
  private frame = 0;
  private time = 0;
  private accumulator = 0;
  private previousTime = 0;
  private limiter = createFrameLimiter();
  private lost = false;
  private recovery: WEBGL_lose_context | null = null;
  private disposed = false;
  private pageHidden = false;
  private disconnectEffects = () => {};
  private readonly observer: ResizeObserver;
  private readonly disconnectMeta: () => void;
  private preview: number | null = null;

  constructor(private canvas: HTMLCanvasElement, private display: HTMLElement,
    private cap: () => FrameRateCap, private status: (status: PondStatus) => void) {
    const bounds = display.getBoundingClientRect();
    const size = pondSize(bounds.width, bounds.height);
    setCanvasSize(size.width, size.height);
    this.school = new School();
    this.school.setCount(settings.live.koi.initialCount);
    this.createRenderer();
    // CPU configuration belongs to the school, which survives GPU recovery.
    // Renderer effects resolve the current instance and skip a lost context.
    const pond = this;
    this.disconnectEffects = connectSettingsEffects(settings, {
      school: this.school,
      get renderer() { return pond.renderer; },
    });
    // Retire the old renderer while its context is lost, then rebuild once.
    // Disposing stale GL handles after restoration would target the new context.
    canvas.addEventListener("webglcontextlost", this.onLost);
    canvas.addEventListener("webglcontextrestored", this.onRestored);
    document.addEventListener("visibilitychange", this.syncActivity);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(display);
    let meta = settings.meta();
    this.disconnectMeta = settings.subscribe(() => {
      const next = settings.meta();
      if (next.weather !== meta.weather) this.renderer?.setWeatherPreset(next.weather);
      if (next.rain !== meta.rain) this.school.setRainIntensity(next.rain ? 1 : 0);
      this.school.setCount(settings.live.koi.initialCount);
      meta = next;
    });
    this.syncActivity();
  }

  private createRenderer = (): void => {
    this.renderer?.dispose();
    this.renderer = null;
    try {
      this.renderer = new FishRenderer(this.canvas);
      // getExtension() returns null while the context is lost. Keep the handle
      // while it is healthy so the recovery button can request a restoration.
      this.recovery = this.canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context") ?? null;
      this.renderer.setWeatherPreset(settings.meta().weather, true);
      this.renderer.setPreviewFamily(this.preview);
      this.school.setCount(settings.live.koi.initialCount);
      this.school.setRainIntensity(settings.meta().rain ? 1 : 0);
      this.status("ready");
    } catch {
      this.status("unavailable");
    }
  };

  private resize = (): void => {
    const bounds = this.display.getBoundingClientRect();
    const size = pondSize(bounds.width, bounds.height);
    if (size.width === CANVAS_WIDTH && size.height === CANVAS_HEIGHT) return;
    const oldWidth = CANVAS_WIDTH, oldHeight = CANVAS_HEIGHT;
    setCanvasSize(size.width, size.height);
    this.school.resize(size.width / oldWidth, size.height / oldHeight);
    if (!this.lost) this.renderer?.resize(size.width, size.height, oldWidth, oldHeight);
  };

  private stop = (): void => {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.accumulator = 0;
  };
  private syncActivity = (): void => {
    this.stop();
    if (this.disposed || document.hidden || this.pageHidden || this.lost || !this.renderer) return;
    this.previousTime = performance.now();
    this.limiter = createFrameLimiter();
    this.frame = requestAnimationFrame(this.animate);
  };
  private onPageHide = (): void => { this.pageHidden = true; this.stop(); };
  private onPageShow = (): void => { this.pageHidden = false; this.syncActivity(); };
  private onLost = (event: Event): void => {
    event.preventDefault();
    this.lost = true;
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
    this.status("restoring");
  };
  private onRestored = (): void => {
    if (this.disposed) return;
    this.lost = false;
    this.createRenderer();
    this.syncActivity();
  };
  retry = (): void => {
    if (this.lost) this.recovery?.restoreContext();
    else this.onRestored();
  };
  private animate = (now: number): void => {
    if (!this.renderer || this.lost || this.disposed) return;
    if (this.limiter.shouldRender(now, frameRateOption(this.cap()).fps)) {
      this.accumulator += Math.min((now - this.previousTime) / 1000, 0.1);
      this.previousTime = now;
      while (this.accumulator >= FIXED_STEP) {
        this.time += FIXED_STEP;
        this.school.update(FIXED_STEP, this.time);
        this.accumulator -= FIXED_STEP;
      }
      this.renderer.draw(this.school, this.time, this.showDebug);
    }
    this.frame = requestAnimationFrame(this.animate);
  };
  call(clientX: number, clientY: number): void {
    if (this.lost || !this.renderer) return;
    this.school.callTo(pondPoint(clientX, clientY, this.canvas.getBoundingClientRect(), { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }));
  }
  setPreviewFamily(index: number | null): void {
    this.preview = index;
    this.renderer?.setPreviewFamily(index);
  }
  dispose(): void {
    this.disposed = true;
    this.stop();
    this.disconnectEffects();
    this.disconnectMeta();
    this.observer.disconnect();
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onRestored);
    document.removeEventListener("visibilitychange", this.syncActivity);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("pageshow", this.onPageShow);
    this.renderer?.dispose();
    this.renderer = null;
    this.recovery = null;
  }
}
