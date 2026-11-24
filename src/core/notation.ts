import {
  LETTER_NAMES,
  mod,
  octaveOf,
  parseNote,
  pitchClass,
  simpleSpelling,
  spelledPitchClass,
  type Midi,
  type PitchClass,
  type SpelledNote,
} from "./pitch";

/**
 * Note naming.
 *
 * - system "en": C D E F G A B, B♭ is "B♭"
 * - system "de": B natural is "H", B♭ is "B" (everything else as in English);
 *   with `germanSuffixes` the names become Cis, Des, Es, Fis, As, Ais, B, H …
 * - accidentals: prefer sharps / prefer flats / mixed (the common
 *   "key-signature" choice: C♯ E♭ F♯ A♭ B♭)
 */
export type NotationSystem = "en" | "de";
export type AccidentalPreference = "sharps" | "flats" | "mixed";

export interface NotationOptions {
  system: NotationSystem;
  accidentals: AccidentalPreference;
  germanSuffixes?: boolean;
  /** Use ASCII # and b instead of ♯ and ♭. */
  ascii?: boolean;
}

export const DEFAULT_NOTATION: NotationOptions = { system: "en", accidentals: "mixed" };

/** Mixed spelling per pitch class: C C♯ D E♭ E F F♯ G A♭ A B♭ B */
const MIXED_PREFER: Record<number, "sharp" | "flat"> = { 1: "sharp", 3: "flat", 6: "sharp", 8: "flat", 10: "flat" };

/** Chooses a spelling for a bare pitch class according to the preference. */
export function spellPitchClass(pc: PitchClass, pref: AccidentalPreference): SpelledNote {
  const p = mod(pc, 12);
  if (pref === "sharps") return simpleSpelling(p, "sharp");
  if (pref === "flats") return simpleSpelling(p, "flat");
  return simpleSpelling(p, MIXED_PREFER[p] ?? "sharp");
}

function accidentalSymbols(acc: number, ascii: boolean): string {
  if (acc === 0) return "";
  if (acc > 0) return acc === 2 && !ascii ? "𝄪" : (ascii ? "#" : "♯").repeat(acc);
  return (ascii ? "b" : "♭").repeat(-acc);
}

function germanSuffixName(n: SpelledNote): string {
  const letter = LETTER_NAMES[n.letter];
  if (n.letter === 6) {
    // B/H family
    if (n.accidental === -1) return "B";
    if (n.accidental === -2) return "Heses";
    return "H" + "is".repeat(Math.max(0, n.accidental));
  }
  if (n.accidental >= 0) return letter + "is".repeat(n.accidental);
  const flats = -n.accidental;
  if (letter === "E" || letter === "A") return letter + "s" + "es".repeat(flats - 1);
  return letter + "es".repeat(flats);
}

/** Formats a spelled note: "C♯", "B♭" (en) / "C♯", "B", "H" (de) / "Cis" (de + suffixes). */
export function formatSpelled(n: SpelledNote, opts: NotationOptions): string {
  const ascii = opts.ascii ?? false;
  if (opts.system === "de") {
    if (opts.germanSuffixes) return germanSuffixName(n);
    if (n.letter === 6) {
      if (n.accidental === -1) return "B";
      if (n.accidental === -2) return "B" + accidentalSymbols(-1, ascii);
      return "H" + accidentalSymbols(n.accidental, ascii);
    }
  }
  return LETTER_NAMES[n.letter] + accidentalSymbols(n.accidental, ascii);
}

export function formatPitchClass(pc: PitchClass, opts: NotationOptions): string {
  return formatSpelled(spellPitchClass(pc, opts.accidentals), opts);
}

/** Name with octave, e.g. "F♯1", "H3". */
export function formatMidi(midi: Midi, opts: NotationOptions): string {
  return formatPitchClass(pitchClass(midi), opts) + octaveOf(midi);
}

/**
 * Both enharmonic names for answer buttons, e.g. "C♯/D♭"; naturals once.
 * `pref` "sharps"/"flats" shows just one name.
 */
export function formatPitchClassButton(pc: PitchClass, opts: NotationOptions): string {
  const p = mod(pc, 12);
  if (opts.accidentals !== "mixed" || [0, 2, 4, 5, 7, 9, 11].includes(p)) return formatPitchClass(p, opts);
  return `${formatSpelled(simpleSpelling(p, "sharp"), opts)}/${formatSpelled(simpleSpelling(p, "flat"), opts)}`;
}

/** Parses a user-typed note name in the given notation system. */
export function parseNoteName(text: string, system: NotationSystem): SpelledNote | null {
  const p = parseNote(text, { german: system === "de" });
  return p ? p.note : null;
}

/**
 * Answer check for note names. Enharmonic equivalents are correct unless
 * the exercise demands a specific spelling.
 */
export function noteAnswerCorrect(expected: SpelledNote | PitchClass, given: SpelledNote | PitchClass, requireSpelling = false): boolean {
  const toPc = (x: SpelledNote | PitchClass) => (typeof x === "number" ? mod(x, 12) : spelledPitchClass(x));
  if (!requireSpelling || typeof expected === "number" || typeof given === "number") return toPc(expected) === toPc(given);
  return expected.letter === given.letter && expected.accidental === given.accidental;
}
