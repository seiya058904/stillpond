import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO } from "./audio-config";
import { readSoundEnabled, saveSoundEnabled } from "./sound-preference";

export function usePondAudio() {
  const [enabled, setEnabled] = useState(readSoundEnabled);
  const [unavailable, setUnavailable] = useState(false);
  const wanted = useRef(enabled);
  const audio = useRef<{ context: AudioContext; gain: GainNode; source?: AudioBufferSourceNode } | null>(null);
  const loading = useRef<Promise<void> | null>(null);
  const disposed = useRef(false);
  const suspendTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const sync = useCallback(async () => {
    const current = audio.current;
    if (!current || current.context.state === "closed") return;
    clearTimeout(suspendTimer.current);
    if (document.hidden || !wanted.current) {
      const now = current.context.currentTime;
      current.gain.gain.cancelScheduledValues(now);
      current.gain.gain.setTargetAtTime(0, now, AUDIO.toggleFadeSeconds / 6);
      if (document.hidden) await current.context.suspend();
      else suspendTimer.current = setTimeout(() => {
        if (!wanted.current && current.context.state !== "closed") void current.context.suspend();
      }, AUDIO.toggleFadeSeconds * 1000);
    } else {
      await current.context.resume();
      if (!wanted.current || document.hidden || disposed.current) { await current.context.suspend(); return; }
      const now = current.context.currentTime;
      current.gain.gain.cancelScheduledValues(now);
      current.gain.gain.setTargetAtTime(AUDIO.ambient.volume, now, AUDIO.toggleFadeSeconds / 3);
    }
  }, []);
  const start = useCallback(async () => {
    if (disposed.current || !wanted.current || document.hidden) return;
    if (loading.current) return loading.current;
    if (audio.current?.source) return sync();
    let context: AudioContext;
    try { context = new AudioContext(); } catch { setUnavailable(true); return; }
    const gain = context.createGain();
    gain.gain.value = 0;
    gain.connect(context.destination);
    const current = { context, gain, source: undefined as AudioBufferSourceNode | undefined };
    audio.current = current;
    const task = (async () => {
      await context.resume();
      const response = await fetch(`${import.meta.env.BASE_URL}${AUDIO.ambient.source}`);
      if (!response.ok) throw new Error("Audio unavailable");
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (disposed.current || context.state === "closed") return;
      const source = context.createBufferSource();
      source.buffer = buffer; source.loop = true; source.connect(gain); source.start();
      current.source = source;
      await sync();
      setUnavailable(false);
    })();
    loading.current = task;
    try { await task; } catch {
      if (!disposed.current) setUnavailable(true);
      if (audio.current === current) audio.current = null;
      if (context.state !== "closed") void context.close();
    } finally { if (loading.current === task) loading.current = null; }
  }, [sync]);
  const change = useCallback((value: boolean) => {
    wanted.current = value; setEnabled(value); saveSoundEnabled(value);
    if (value) void start().catch(() => setUnavailable(true)); else void sync().catch(() => undefined);
  }, [start, sync]);
  useEffect(() => {
    disposed.current = false;
    const unlock = () => { if (wanted.current) void start().catch(() => setUnavailable(true)); };
    const visibility = () => { void sync().catch(() => undefined); };
    const pagehide = () => { const context = audio.current?.context; if (context && context.state !== "closed") void context.suspend(); };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", visibility);
    return () => {
      disposed.current = true; clearTimeout(suspendTimer.current);
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", visibility);
      const current = audio.current; audio.current = null;
      current?.source?.stop();
      if (current && current.context.state !== "closed") void current.context.close();
    };
  }, [start, sync]);
  return { enabled, change, unavailable };
}
