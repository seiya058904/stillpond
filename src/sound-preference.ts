import project from "../project.config.json";
const storageKey = `${project.storagePrefix}:sound:v1`;

export function readSoundEnabled(): boolean {
  try { return localStorage.getItem(storageKey) === "true"; } catch { return false; }
}

export function saveSoundEnabled(enabled: boolean): void {
  try { localStorage.setItem(storageKey, String(enabled)); } catch { /* Optional storage. */ }
}
