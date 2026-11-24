/**
 * Pitch primitives. No DOM, no audio.
 *
 * - `Midi`        integer MIDI note number (C4 = 60, A4 = 69, E1 = 28)
 * - `PitchClass`  0..11, C = 0
 * - `SpelledNote` a letter plus accidental (C♯ and D♭ are different spellings
 *                 of the same pitch class) — needed for correct chord/scale
 *                 spelling and for German B/H naming.
 */

export type Midi = number;
export type PitchClass = number;

/** 0..6 = C D E F G A B */
export type Letter = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SpelledNote {
  letter: Letter;
  /** -2 = double flat, -1 = flat, 0 = natural, 1 = sharp, 2 = double sharp */
  accidental: number;
}

export const LETTER_NAMES = ["C", "D", "E", "F", "G", "A", "B"] as const;
/** Pitch class of each natural letter. */
export const LETTER_PC: readonly PitchClass[] = [0, 2, 4, 5, 7, 9, 11];
/** Pitch classes that are natural notes. */
export const NATURAL_PCS: readonly PitchClass[] = LETTER_PC;

export const A4_MIDI = 69;
export const DEFAULT_A4_HZ = 440;

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}

export function pitchClass(midi: Midi): PitchClass {
  return mod(Math.round(midi), 12);
}

/** Scientific pitch notation octave: C4 = 60, B3 = 59. */
export function octaveOf(midi: Midi): number {
  return Math.floor(Math.round(midi) / 12) - 1;
}

export function isNatural(pc: PitchClass): boolean {
  return NATURAL_PCS.includes(mod(pc, 12));
}

export function midiToFrequency(midi: Midi, a4 = DEFAULT_A4_HZ): number {
  return a4 * Math.pow(2, (midi - A4_MIDI) / 12);
}

/** Fractional MIDI number for a frequency (69.0 = A4 exactly). */
export function frequencyToMidi(freq: number, a4 = DEFAULT_A4_HZ): number {
  return A4_MIDI + 12 * Math.log2(freq / a4);
}

/** Signed distance in cents from `midi` (integer) to `freq`. */
export function centsOff(freq: number, midi: Midi, a4 = DEFAULT_A4_HZ): number {
  return 100 * (frequencyToMidi(freq, a4) - midi);
}

export function transpose(midi: Midi, semitones: number): Midi {
  return midi + semitones;
}

export function spelledPitchClass(n: SpelledNote): PitchClass {
  return mod((LETTER_PC[n.letter] ?? 0) + n.accidental, 12);
}

export function sameSpelling(a: SpelledNote, b: SpelledNote): boolean {
  return a.letter === b.letter && a.accidental === b.accidental;
}

/**
 * Transposes a spelled note by a diatonic interval: `steps` letter steps and
 * `semitones` half-steps. E.g. C + (2 steps, 3 semitones) = E♭, not D♯.
 */
export function transposeSpelled(n: SpelledNote, steps: number, semitones: number): SpelledNote {
  const letter = mod(n.letter + steps, 7) as Letter;
  const startPc = spelledPitchClass(n);
  const targetPc = mod(startPc + semitones, 12);
  let accidental = mod(targetPc - (LETTER_PC[letter] ?? 0), 12);
  if (accidental > 6) accidental -= 12;
  return { letter, accidental };
}

/** The natural or sharp/flat spelling of a pitch class. */
export function simpleSpelling(pc: PitchClass, prefer: "sharp" | "flat"): SpelledNote {
  const p = mod(pc, 12);
  const natural = LETTER_PC.indexOf(p);
  if (natural >= 0) return { letter: natural as Letter, accidental: 0 };
  if (prefer === "sharp") return { letter: LETTER_PC.indexOf(p - 1) as Letter, accidental: 1 };
  return { letter: LETTER_PC.indexOf(mod(p + 1, 12)) as Letter, accidental: -1 };
}

/**
 * Parses an English note name with optional octave: "E", "F#1", "Bb3", "c#",
 * "D♭4", "Ebb", "Fx". When `german` is true, "H" means B natural and "B"
 * means B♭; German suffixes ("Fis", "Es", "As", "Cis2") are also accepted.
 * Returns null when the text isn't a note.
 */
export function parseNote(text: string, opts: { german?: boolean } = {}): { note: SpelledNote; octave: number | null } | null {
  const s = text.trim();
  const m = /^([A-Ha-h])((?:is|es|s)*|[#♯x𝄪b♭]*)(-?\d+)?$/u.exec(s);
  if (!m) return null;
  let letterChar = (m[1] ?? "").toUpperCase();
  const accText = m[2] ?? "";
  let accidental = 0;
  if (letterChar === "H") {
    letterChar = "B";
  } else if (letterChar === "B" && opts.german) {
    // German "B" = B♭ (further "es" suffixes flatten more: "Bes" is unusual but accepted)
    accidental -= 1;
  }
  const letter = LETTER_NAMES.indexOf(letterChar as (typeof LETTER_NAMES)[number]);
  if (letter < 0) return null;

  if (/^(is|es|s)+$/.test(accText)) {
    const parts = accText.match(/is|es|s/g) ?? [];
    for (const p of parts) accidental += p === "is" ? 1 : -1;
  } else {
    for (const ch of accText) {
      if (ch === "#" || ch === "♯") accidental += 1;
      else if (ch === "x" || ch === "𝄪") accidental += 2;
      else if (ch === "b" || ch === "♭") accidental -= 1;
    }
  }
  if (Math.abs(accidental) > 2) return null;
  const octave = m[3] !== undefined ? Number(m[3]) : null;
  return { note: { letter: letter as Letter, accidental }, octave };
}

/** MIDI number of a spelled note in a given octave (B♯3 = 60, C♭4 = 59). */
export function spelledToMidi(n: SpelledNote, octave: number): Midi {
  return (octave + 1) * 12 + (LETTER_PC[n.letter] ?? 0) + n.accidental;
}

/** Parses "E2", "F#1", "Bb3" to MIDI; throws on invalid text. */
export function noteToMidi(text: string, opts: { german?: boolean } = {}): Midi {
  const parsed = parseNote(text, opts);
  if (!parsed || parsed.octave === null) throw new Error(`Not a note with octave: "${text}"`);
  return spelledToMidi(parsed.note, parsed.octave);
}
