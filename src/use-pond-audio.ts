import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO } from "./audio-config";
import { readSoundEnabled, saveSoundEnabled } from "./sound-preference";

export type AudioStatus = "off" | "waiting" | "loading" | "playing" | "paused" | "error";
interface PondAudio {
  context: AudioContext;
  gain: GainNode;
  abort: AbortController;
  source?: AudioBufferSourceNode;
}
function release(current: PondAudio): void {
  current.abort.abort();
  current.context.onstatechange = null;
  current.source?.stop();
  if (current.context.state !== "closed") void current.context.close().catch(() => undefined);
}

export function usePondAudio() {
  const [enabled, setEnabled] = useState(readSoundEnabled);
  const [status, setStatus] = useState<AudioStatus>(enabled ? "waiting" : "off");
  const wanted = useRef(enabled);
  const state = useRef(status);
  const audio = useRef<PondAudio | null>(null);
  const disposed = useRef(false);
  const pageHidden = useRef(false);
  const suspendTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inactive = useCallback(() => document.hidden || pageHidden.current, []);
  const publish = useCallback((next: AudioStatus) => {
    if (disposed.current) return;
    state.current = next;
    setStatus(next);
  }, []);
  const fail = useCallback((current: PondAudio) => {
    // A cancelled request or a late decode must not replace a newer session.
    if (audio.current !== current || disposed.current) return;
    audio.current = null;
    release(current);
    publish(wanted.current ? "error" : "off");
  }, [publish]);

  const sync = useCallback(async () => {
    const current = audio.current;
    if (!current) {
      if (wanted.current && state.current !== "error") publish(inactive() ? "paused" : "waiting");
      return;
    }
    clearTimeout(suspendTimer.current);
    try {
      if (inactive() || !wanted.current) {
        publish(wanted.current ? "paused" : "off");
        const now = current.context.currentTime;
        current.gain.gain.cancelScheduledValues(now);
        current.gain.gain.setTargetAtTime(0, now, AUDIO.toggleFadeSeconds / 6);
        if (inactive()) await current.context.suspend();
        else suspendTimer.current = setTimeout(() => {
          if (!wanted.current && audio.current === current) void current.context.suspend().catch(() => fail(current));
        }, AUDIO.toggleFadeSeconds * 1000);
      } else if (current.source) {
        if (current.context.state !== "running") publish("waiting");
        await current.context.resume();
        if (audio.current !== current || disposed.current) return;
        if (!wanted.current || inactive()) { await current.context.suspend(); return; }
        const now = current.context.currentTime;
        current.gain.gain.cancelScheduledValues(now);
        current.gain.gain.setTargetAtTime(AUDIO.ambient.volume, now, AUDIO.toggleFadeSeconds / 3);
        publish("playing");
      } else publish("loading");
    } catch { fail(current); }
  }, [fail, inactive, publish]);

  const start = useCallback(async () => {
    if (disposed.current || !wanted.current || inactive()) return;
    if (audio.current) return sync();
    let context: AudioContext | undefined;
    let current: PondAudio;
    try {
      context = new AudioContext();
      const gain = context.createGain();
      gain.gain.value = 0;
      gain.connect(context.destination);
      current = { context, gain, abort: new AbortController() };
    } catch {
      if (context && context.state !== "closed") void context.close().catch(() => undefined);
      publish("error");
      return;
    }
    audio.current = current;
    publish("loading");
    current.context.onstatechange = () => {
      if (audio.current !== current || !wanted.current || !current.source || disposed.current) return;
      if (current.context.state === "closed") fail(current);
      else if (inactive()) publish("paused");
      else publish(current.context.state === "running" ? "playing" : "waiting");
    };
    // Resume within the user gesture; downloading need not wait for autoplay permission.
    void current.context.resume().catch(() => fail(current));
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${AUDIO.ambient.source}`, { signal: current.abort.signal });
      if (!response.ok) throw new Error("Audio unavailable");
      const buffer = await current.context.decodeAudioData(await response.arrayBuffer());
      if (disposed.current || audio.current !== current) return;
      const source = current.context.createBufferSource();
      source.buffer = buffer; source.loop = true; source.connect(current.gain); source.start();
      current.source = source;
      await sync();
    } catch { fail(current); }
  }, [fail, inactive, publish, sync]);

  const change = useCallback((value: boolean) => {
    wanted.current = value; setEnabled(value); saveSoundEnabled(value);
    if (value) {
      publish(inactive() ? "paused" : "waiting");
      void start();
    } else {
      publish("off");
      const current = audio.current;
      if (current && !current.source) { audio.current = null; release(current); }
      else void sync();
    }
  }, [inactive, publish, start, sync]);
  const retry = useCallback(() => change(true), [change]);

  useEffect(() => {
    disposed.current = false;
    // Only autoplay unlock is automatic. Network/decode failures require Retry.
    const unlock = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("[data-audio-control]")) return;
      if (wanted.current && state.current === "waiting") void start();
    };
    const visibility = () => { void sync(); };
    const pagehide = () => { pageHidden.current = true; void sync(); };
    const pageshow = () => { pageHidden.current = false; void sync(); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", pageshow);
    return () => {
      disposed.current = true; clearTimeout(suspendTimer.current);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", pageshow);
      const current = audio.current; audio.current = null;
      if (current) release(current);
    };
  }, [start, sync]);
  return { enabled, change, status, retry };
}
