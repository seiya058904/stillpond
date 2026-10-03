import { useSyncExternalStore } from "react";
import project from "../../project.config.json";
import { messages, type Language, type MessageKey } from "./catalog";
import { fieldLabels } from "./fields";

export { languages, type Language, type MessageKey } from "./catalog";
export const LANGUAGE_STORAGE_KEY = `${project.storagePrefix}:language:v1`;

export function readLanguage(): Language {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY) === "zh-CN" ? "zh-CN" : "en";
  } catch {
    return "en";
  }
}

export function createTranslator(language: Language) {
  const column = language === "zh-CN" ? 1 : 0;
  const t = (key: MessageKey, values: Record<string, string | number> = {}): string =>
    messages[key][column].replace(/\{(\w+)\}/g, (token, name: string) => String(values[name] ?? token));
  const field = (key: string): string => fieldLabels[key as keyof typeof fieldLabels]?.[column] ?? key;
  const family = (name: string): string => {
    const key = `family.${name}` as MessageKey;
    return key in messages ? t(key) : name;
  };
  return { t, field, family };
}

const translators = { en: createTranslator("en"), "zh-CN": createTranslator("zh-CN") };
let language = readLanguage();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => language;

export function setLanguage(value: string): void {
  if (value !== "en" && value !== "zh-CN") return;
  language = value;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, value); } catch { /* Storage may be disabled. */ }
  listeners.forEach((listener) => listener());
}

export function useI18n() {
  const language = useSyncExternalStore(subscribe, snapshot);
  return { language, setLanguage, ...translators[language] };
}
