import { clampRange, MAX_FRET, type FretRange } from "../core/fretboard";
import type { NotationOptions } from "../core/notation";
import { dropLowest, standardTuning, type Tuning, type TuningRegistry } from "../core/tuning";
import type { Language } from "../i18n";

export type AutoAdvance = "off" | "correct" | "always";

export interface GlobalSettings {
  language: Language;
  notation: Required<Pick<NotationOptions, "system" | "accidentals">> & { germanSuffixes: boolean };
  instrument: {
    /** 6, 7 or 8 — ignored when `customTuningId` is set */
    strings: number;
    drop: boolean;
    dropSemitones: number;
    /** id of a custom tuning from the registry, or null for standard */
    customTuningId: string | null;
  };
  frets: FretRange;
  fretboard: {
    lowestAtBottom: boolean;
    leftHanded: boolean;
    markers: boolean;
  };
  audio: {
    volume: number;
    /** seconds */
    noteDuration: number;
  };
  practice: {
    autoAdvance: AutoAdvance;
    autoAdvanceDelayMs: number;
    adaptive: boolean;
  };
}

export function defaultSettings(lang: Language = "en"): GlobalSettings {
  return {
    language: lang,
    // The German UI defaults to German note names (H/B), as used in Switzerland.
    notation: { system: lang === "de" ? "de" : "en", accidentals: "mixed", germanSuffixes: false },
    instrument: { strings: 6, drop: false, dropSemitones: 2, customTuningId: null },
    frets: { min: 0, max: 12 },
    fretboard: { lowestAtBottom: true, leftHanded: false, markers: true },
    audio: { volume: 0.8, noteDuration: 1.5 },
    practice: { autoAdvance: "correct", autoAdvanceDelayMs: 1200, adaptive: true },
  };
}

/** Clamps values loaded from storage/import into valid ranges. */
export function sanitizeSettings(s: GlobalSettings): GlobalSettings {
  const strings = [6, 7, 8].includes(s.instrument.strings) ? s.instrument.strings : 6;
  return {
    ...s,
    language: s.language === "de" ? "de" : "en",
    notation: {
      system: s.notation.system === "de" ? "de" : "en",
      accidentals: (["sharps", "flats", "mixed"] as const).includes(s.notation.accidentals) ? s.notation.accidentals : "mixed",
      germanSuffixes: !!s.notation.germanSuffixes,
    },
    instrument: {
      strings,
      drop: !!s.instrument.drop,
      dropSemitones: Math.max(1, Math.min(7, Math.round(s.instrument.dropSemitones || 2))),
      customTuningId: typeof s.instrument.customTuningId === "string" ? s.instrument.customTuningId : null,
    },
    frets: clampRange(s.frets),
    audio: {
      volume: Math.max(0, Math.min(1, Number(s.audio.volume))),
      noteDuration: Math.max(0.2, Math.min(4, Number(s.audio.noteDuration))),
    },
    practice: {
      autoAdvance: (["off", "correct", "always"] as const).includes(s.practice.autoAdvance) ? s.practice.autoAdvance : "correct",
      autoAdvanceDelayMs: Math.max(200, Math.min(5000, Math.round(Number(s.practice.autoAdvanceDelayMs)))),
      adaptive: !!s.practice.adaptive,
    },
  };
}

/** The tuning every exercise uses: standard or custom, then the optional drop transform. */
export function activeTuning(s: GlobalSettings, registry?: TuningRegistry): Tuning {
  const custom = s.instrument.customTuningId ? registry?.get(s.instrument.customTuningId) : undefined;
  const base = custom ?? standardTuning(s.instrument.strings);
  return s.instrument.drop ? dropLowest(base, s.instrument.dropSemitones) : base;
}

export function notationOptions(s: GlobalSettings): NotationOptions {
  return { system: s.notation.system, accidentals: s.notation.accidentals, germanSuffixes: s.notation.germanSuffixes };
}

export { MAX_FRET };
