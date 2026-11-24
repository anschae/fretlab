import { mod, transposeSpelled, type PitchClass, type SpelledNote } from "./pitch";
import { getInterval } from "./intervals";

/**
 * Chord types are defined only by their formula. `tones` gives each chord
 * tone as an interval id from the root, which yields both the semitone
 * formula and correct spelling (C–E♭–G♭–B♭♭ for C°7). `degrees` are the
 * labels shown when naming chord tones ("1", "b3", "5", "b7").
 */
export interface ChordType {
  id: string;
  /** Chord symbol suffix after the root: "", "m", "maj7", "m7♭5". */
  symbol: string;
  nameKey: string;
  tones: string[];
  degrees: string[];
}

function chord(id: string, symbol: string, tones: string[], degrees: string[]): ChordType {
  return { id, symbol, nameKey: `chord.${id}`, tones, degrees };
}

export const CHORD_TYPES: readonly ChordType[] = [
  chord("maj", "", ["P1", "M3", "P5"], ["1", "3", "5"]),
  chord("min", "m", ["P1", "m3", "P5"], ["1", "b3", "5"]),
  chord("dim", "°", ["P1", "m3", "TT"], ["1", "b3", "b5"]),
  chord("aug", "+", ["P1", "M3", "m6"], ["1", "3", "#5"]),
  chord("sus2", "sus2", ["P1", "M2", "P5"], ["1", "2", "5"]),
  chord("sus4", "sus4", ["P1", "P4", "P5"], ["1", "4", "5"]),
  chord("5", "5", ["P1", "P5"], ["1", "5"]),
  chord("maj7", "maj7", ["P1", "M3", "P5", "M7"], ["1", "3", "5", "7"]),
  chord("7", "7", ["P1", "M3", "P5", "m7"], ["1", "3", "5", "b7"]),
  chord("m7", "m7", ["P1", "m3", "P5", "m7"], ["1", "b3", "5", "b7"]),
  chord("m7b5", "m7♭5", ["P1", "m3", "TT", "m7"], ["1", "b3", "b5", "b7"]),
  chord("dim7", "°7", ["P1", "m3", "TT", "M6"], ["1", "b3", "b5", "bb7"]),
  chord("mMaj7", "m(maj7)", ["P1", "m3", "P5", "M7"], ["1", "b3", "5", "7"]),
  chord("6", "6", ["P1", "M3", "P5", "M6"], ["1", "3", "5", "6"]),
  chord("m6", "m6", ["P1", "m3", "P5", "M6"], ["1", "b3", "5", "6"]),
  chord("add9", "add9", ["P1", "M3", "P5", "M9"], ["1", "3", "5", "9"]),
];

/** Augmented/diminished intervals that aren't in the ear-training list. */
const SPELLING_OVERRIDES: Record<string, Record<string, { steps: number }>> = {
  // °7's bb7 is a diminished seventh (6 steps), not a major sixth (5 steps)
  dim7: { TT: { steps: 4 }, M6: { steps: 6 } },
  // aug's #5 is an augmented fifth (4 steps), not a minor sixth
  aug: { m6: { steps: 4 } },
  // b5 is a diminished fifth (4 steps), not an augmented fourth
  dim: { TT: { steps: 4 } },
  m7b5: { TT: { steps: 4 } },
};

const BY_ID = new Map(CHORD_TYPES.map((c) => [c.id, c]));

export function getChordType(id: string): ChordType {
  const c = BY_ID.get(id);
  if (!c) throw new Error(`Unknown chord type "${id}"`);
  return c;
}

export function chordSemitones(type: ChordType): number[] {
  return type.tones.map((t) => getInterval(t).semitones);
}

export function chordPitchClasses(root: PitchClass, type: ChordType): PitchClass[] {
  return chordSemitones(type).map((s) => mod(root + s, 12));
}

export function spellChord(root: SpelledNote, type: ChordType): SpelledNote[] {
  return type.tones.map((t) => {
    const iv = getInterval(t);
    const steps = SPELLING_OVERRIDES[type.id]?.[t]?.steps ?? iv.steps;
    return transposeSpelled(root, steps, iv.semitones);
  });
}
