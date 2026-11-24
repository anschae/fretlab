import {
  noteToMidi,
  octaveOf,
  parseNote,
  pitchClass,
  simpleSpelling,
  spelledPitchClass,
  spelledToMidi,
  LETTER_NAMES,
  type Midi,
} from "./pitch";

/**
 * A tuning is just data: MIDI notes, lowest string first. Nothing in the
 * app may assume a particular string count.
 */
export interface Tuning {
  id: string;
  /** Display name, e.g. "8-string Drop E". Localised names use `nameParts`. */
  name: string;
  strings: Midi[];
  /** Structured name for i18n: string count + "standard" / "drop X" / custom label. */
  nameParts?: { count: number; kind: "standard" | "drop" | "custom"; label?: string };
  custom?: boolean;
}

/** English name of a MIDI pitch without octave, sharps preferred ("F#"). */
function plainName(midi: Midi, prefer: "sharp" | "flat" = "sharp"): string {
  const sp = simpleSpelling(pitchClass(midi), prefer);
  return `${LETTER_NAMES[sp.letter]}${sp.accidental > 0 ? "#" : sp.accidental < 0 ? "b" : ""}`;
}

/** Highest six strings of every standard tuning. */
const SIX_STANDARD = ["E2", "A2", "D3", "G3", "B3", "E4"];
/** Each extra low string is a fourth below the previous lowest. */
function standardStrings(count: number): Midi[] {
  const strings = SIX_STANDARD.map((n) => noteToMidi(n));
  while (strings.length < count) strings.unshift((strings[0] as Midi) - 5);
  return strings;
}

export function standardTuning(count: number): Tuning {
  if (count < 4 || count > 9) throw new Error(`Unsupported string count ${count}`);
  return {
    id: `${count}-std`,
    name: `${count}-string standard`,
    strings: standardStrings(count),
    nameParts: { count, kind: "standard" },
  };
}

/**
 * Drop transform: lowers the lowest string by `semitones` (default 2).
 * 6-string → Drop D, 7-string → Drop A, 8-string → Drop E.
 */
export function dropLowest(tuning: Tuning, semitones = 2): Tuning {
  if (tuning.strings.length === 0) return tuning;
  const strings = [...tuning.strings];
  strings[0] = (strings[0] as Midi) - semitones;
  const label = `Drop ${plainName(strings[0] as Midi)}`;
  const count = strings.length;
  return {
    id: `${tuning.id}-drop${semitones}`,
    name: tuning.custom ? `${tuning.name} (${label})` : `${count}-string ${label}`,
    strings,
    nameParts: { count, kind: "drop", label },
    custom: tuning.custom,
  };
}

/** Notes with octave, lowest first: "E1 B1 E2 A2 D3 G3 B3 E4". */
export function describeTuning(t: Tuning): string {
  return t.strings.map((m) => `${plainName(m)}${octaveOf(m)}`).join(" ");
}

export const STANDARD_TUNINGS: readonly Tuning[] = [6, 7, 8].map(standardTuning);

/** Lowest and highest playable MIDI note given a maximum fret. */
export function playableRange(t: Tuning, maxFret: number): { low: Midi; high: Midi } {
  const low = Math.min(...t.strings);
  const high = Math.max(...t.strings) + maxFret;
  return { low, high };
}

/**
 * Registry of available tunings. Custom tunings are added here at runtime and
 * behave exactly like built-in ones.
 */
export class TuningRegistry {
  private readonly tunings = new Map<string, Tuning>();

  constructor(initial: readonly Tuning[] = STANDARD_TUNINGS) {
    for (const t of initial) this.register(t);
  }

  register(t: Tuning): void {
    if (t.strings.length < 1) throw new Error("A tuning needs at least one string");
    this.tunings.set(t.id, t);
  }

  unregister(id: string): void {
    this.tunings.delete(id);
  }

  get(id: string): Tuning | undefined {
    return this.tunings.get(id);
  }

  list(): Tuning[] {
    return [...this.tunings.values()];
  }
}

/**
 * Parses a list of open-string notes, lowest first. Octaves are optional:
 * without them, octaves are inferred so each string is the closest pitch
 * above the previous one, anchored so the highest string sits near E4.
 * Accepts English names and German H/B (`german: true`).
 */
export function parseTuningNotes(text: string, opts: { german?: boolean } = {}): Midi[] | null {
  const tokens = text.trim().split(/[\s,;]+/).filter(Boolean);
  if (tokens.length < 1 || tokens.length > 12) return null;
  const notes: { pc: number; midi: Midi | null }[] = [];
  for (const tok of tokens) {
    const p = parseNote(tok, { german: opts.german ?? false });
    if (!p) return null;
    notes.push({ pc: spelledPitchClass(p.note), midi: p.octave === null ? null : spelledToMidi(p.note, p.octave) });
  }
  if (notes.every((n) => n.midi !== null)) return notes.map((n) => n.midi as Midi);
  if (notes.some((n) => n.midi !== null)) return null; // mixing with/without octaves is ambiguous

  // Infer octaves: each string is the next pitch above the previous one…
  const chain: Midi[] = [];
  for (const n of notes) {
    const prev = chain[chain.length - 1];
    if (prev === undefined) chain.push(n.pc);
    else {
      let m = prev - (prev % 12) + n.pc;
      while (m <= prev) m += 12;
      chain.push(m);
    }
  }
  // …then shift whole octaves so the highest string lies in C#4..C5 (E4 = 64).
  const top = chain[chain.length - 1] as Midi;
  let shift = 0;
  while (top + shift < 61) shift += 12;
  while (top + shift > 72) shift -= 12;
  return chain.map((m) => m + shift);
}
