import { AudioEngine } from "./audio/AudioEngine";
import { formatMidi, formatPitchClass, formatPitchClassButton, formatSpelled } from "./core/notation";
import { stringNumber } from "./core/fretboard";
import { TuningRegistry, type Tuning } from "./core/tuning";
import type { AudioPort, NoteNamer } from "./exercises/types";
import { detectLanguage, I18n, type Translate } from "./i18n";
import { activeTuning, defaultSettings, notationOptions, sanitizeSettings, type GlobalSettings } from "./state/settings";
import { adaptiveWeight, medianResponseMs, recordAttempt, type AttemptRecord, type StatsData } from "./state/stats";
import { mergeWithDefaults, SCHEMA_VERSION, StorageService, type KeyValueStore, MemoryStore } from "./state/storage";

export const APP_VERSION = "0.1.0";

/**
 * App-wide services, created once in main.ts and passed down. Nothing here
 * knows about individual exercises.
 */
export class Services {
  readonly i18n = new I18n();
  readonly audio = new AudioEngine();
  readonly tunings = new TuningRegistry();
  readonly storage: StorageService;
  private listeners = new Set<() => void>();

  constructor(kv: KeyValueStore = safeLocalStorage()) {
    const lang = detectLanguage();
    this.storage = new StorageService(kv, {
      schema: SCHEMA_VERSION,
      settings: defaultSettings(lang),
      exerciseSettings: {},
      stats: {},
      customTunings: [],
    });
    this.applyLoaded();
  }

  /** Re-applies everything after load/import/reset. */
  private applyLoaded(): void {
    for (const t of this.tunings.list()) if (t.custom) this.tunings.unregister(t.id);
    for (const t of this.storage.get().customTunings) this.tunings.register({ ...t, custom: true });
    const s = this.settings;
    this.i18n.setLanguage(s.language);
    this.audio.setVolume(s.audio.volume);
  }

  get settings(): GlobalSettings {
    return sanitizeSettings(this.storage.get().settings);
  }

  get tuning(): Tuning {
    return activeTuning(this.settings, this.tunings);
  }

  get t(): Translate {
    return this.i18n.t;
  }

  onSettingsChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  updateSettings(fn: (s: GlobalSettings) => GlobalSettings): void {
    const next = sanitizeSettings(fn(this.settings));
    this.storage.update((d) => ({ ...d, settings: next }));
    this.i18n.setLanguage(next.language);
    this.audio.setVolume(next.audio.volume);
    this.emit();
  }

  exerciseSettings<S>(id: string, defaults: S): S {
    return mergeWithDefaults(defaults, this.storage.get().exerciseSettings[id]);
  }

  setExerciseSettings<S>(id: string, value: S): void {
    this.storage.update((d) => ({ ...d, exerciseSettings: { ...d.exerciseSettings, [id]: value } }));
  }

  get stats(): StatsData {
    return this.storage.get().stats;
  }

  record(r: AttemptRecord): void {
    this.storage.update((d) => ({ ...d, stats: recordAttempt(d.stats, r) }));
  }

  resetStats(exerciseId: string): void {
    this.storage.update((d) => {
      const stats = { ...d.stats };
      delete stats[exerciseId];
      return { ...d, stats };
    });
  }

  /** Weight function for adaptive question generation. */
  weightFn(exerciseId: string): (key: string) => number {
    if (!this.settings.practice.adaptive) return () => 1;
    const ex = this.stats[exerciseId];
    const median = medianResponseMs(ex);
    const now = Date.now();
    return (key) => adaptiveWeight(ex?.items[key], median, now);
  }

  saveCustomTunings(list: Tuning[]): void {
    this.storage.update((d) => ({ ...d, customTunings: list }));
    this.applyLoaded();
    this.emit();
  }

  exportBackup(): string {
    this.storage.flush();
    return JSON.stringify(this.storage.exportBackup(APP_VERSION), null, 2);
  }

  importBackup(json: string): void {
    this.storage.importBackup(json);
    this.applyLoaded();
    this.emit();
  }

  resetAll(): void {
    this.storage.reset();
    this.applyLoaded();
    this.emit();
  }

  names(): NoteNamer {
    const opts = notationOptions(this.settings);
    const t = this.t;
    return {
      pc: (pc) => formatPitchClass(pc, opts),
      midi: (m) => formatMidi(m, opts),
      spelled: (n) => formatSpelled(n, opts),
      button: (pc) => formatPitchClassButton(pc, opts),
      string: (tuning, index) =>
        t("string.label", { n: stringNumber(tuning, index), note: formatPitchClass((tuning.strings[index] ?? 0) % 12, opts) }),
    };
  }

  audioPort(): AudioPort {
    const engine = this.audio;
    const dur = this.settings.audio.noteDuration;
    return {
      get available() {
        return engine.state === "running";
      },
      noteDuration: dur,
      playNote: (m, delay = 0, duration = dur) => engine.playNote(m, delay, duration),
      playChord: (ms, delay = 0, duration = dur * 1.5, strum = 0.025) => engine.playChord(ms, delay, duration, { strum }),
      playSequence: (ms, gap, duration = dur) => engine.playSequence(ms, gap, duration),
      stop: () => engine.stopAll(),
    };
  }

  tuningName(t: Tuning): string {
    const p = t.nameParts;
    if (!t.custom && p?.kind === "standard") return this.t("tuning.standard", { count: p.count });
    if (!t.custom && p?.kind === "drop") return this.t("tuning.drop", { count: p.count, label: p.label ?? "" });
    return t.name;
  }
}

function safeLocalStorage(): KeyValueStore {
  try {
    const k = "__fretlab_probe__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return new MemoryStore();
  }
}
