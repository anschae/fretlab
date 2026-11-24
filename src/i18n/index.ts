import { de } from "./de";
import { en } from "./en";

export type Language = "en" | "de";
export const LANGUAGES: readonly Language[] = ["en", "de"];
export type Dict = Record<string, string>;
export type Params = Record<string, string | number>;
export type Translate = (key: string, params?: Params) => string;

/**
 * Translator with per-module message registration. Lookup order: active
 * language → English → the key itself (so a missing string is visible but
 * never crashes).
 */
export class I18n {
  private dicts: Record<Language, Dict> = { en: { ...en }, de: { ...de } };
  private lang: Language = "en";
  private listeners = new Set<() => void>();

  get language(): Language {
    return this.lang;
  }

  setLanguage(lang: Language): void {
    if (lang === this.lang) return;
    this.lang = lang;
    if (typeof document !== "undefined") document.documentElement.lang = lang;
    for (const fn of this.listeners) fn();
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Adds strings (e.g. an exercise's own messages). Existing keys are kept unless `override`. */
  register(messages: Partial<Record<Language, Dict>>, override = false): void {
    for (const lang of LANGUAGES) {
      const add = messages[lang];
      if (!add) continue;
      this.dicts[lang] = override ? { ...this.dicts[lang], ...add } : { ...add, ...this.dicts[lang] };
    }
  }

  has(key: string): boolean {
    return key in this.dicts[this.lang] || key in this.dicts.en;
  }

  t: Translate = (key, params) => {
    const raw = this.dicts[this.lang][key] ?? this.dicts.en[key] ?? key;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
  };
}

export function detectLanguage(): Language {
  const langs = typeof navigator !== "undefined" ? (navigator.languages ?? [navigator.language]) : [];
  return langs.some((l) => l?.toLowerCase().startsWith("de")) ? "de" : "en";
}
