import { mod, type PitchClass } from "./pitch";

/**
 * Scale and mode formulas as semitone offsets from the root, plus degree
 * labels. Patterns (3NPS, CAGED) are generated from these in patterns.ts.
 */
export interface ScaleType {
  id: string;
  nameKey: string;
  semitones: number[];
  degrees: string[];
}

function scale(id: string, semitones: number[], degrees: string[]): ScaleType {
  if (semitones.length !== degrees.length) throw new Error(`Scale ${id}: formula/degree mismatch`);
  return { id, nameKey: `scale.${id}`, semitones, degrees };
}

export const SCALE_TYPES: readonly ScaleType[] = [
  scale("major", [0, 2, 4, 5, 7, 9, 11], ["1", "2", "3", "4", "5", "6", "7"]),
  scale("naturalMinor", [0, 2, 3, 5, 7, 8, 10], ["1", "2", "b3", "4", "5", "b6", "b7"]),
  scale("harmonicMinor", [0, 2, 3, 5, 7, 8, 11], ["1", "2", "b3", "4", "5", "b6", "7"]),
  scale("melodicMinor", [0, 2, 3, 5, 7, 9, 11], ["1", "2", "b3", "4", "5", "6", "7"]),
  scale("ionian", [0, 2, 4, 5, 7, 9, 11], ["1", "2", "3", "4", "5", "6", "7"]),
  scale("dorian", [0, 2, 3, 5, 7, 9, 10], ["1", "2", "b3", "4", "5", "6", "b7"]),
  scale("phrygian", [0, 1, 3, 5, 7, 8, 10], ["1", "b2", "b3", "4", "5", "b6", "b7"]),
  scale("lydian", [0, 2, 4, 6, 7, 9, 11], ["1", "2", "3", "#4", "5", "6", "7"]),
  scale("mixolydian", [0, 2, 4, 5, 7, 9, 10], ["1", "2", "3", "4", "5", "6", "b7"]),
  scale("aeolian", [0, 2, 3, 5, 7, 8, 10], ["1", "2", "b3", "4", "5", "b6", "b7"]),
  scale("locrian", [0, 1, 3, 5, 6, 8, 10], ["1", "b2", "b3", "4", "b5", "b6", "b7"]),
  scale("majorPentatonic", [0, 2, 4, 7, 9], ["1", "2", "3", "5", "6"]),
  scale("minorPentatonic", [0, 3, 5, 7, 10], ["1", "b3", "4", "5", "b7"]),
  scale("blues", [0, 3, 5, 6, 7, 10], ["1", "b3", "4", "b5", "5", "b7"]),
  scale("wholeTone", [0, 2, 4, 6, 8, 10], ["1", "2", "3", "#4", "#5", "b7"]),
  scale("diminishedHW", [0, 1, 3, 4, 6, 7, 9, 10], ["1", "b2", "b3", "3", "#4", "5", "6", "b7"]),
  scale("diminishedWH", [0, 2, 3, 5, 6, 8, 9, 11], ["1", "2", "b3", "4", "b5", "b6", "6", "7"]),
  scale("phrygianDominant", [0, 1, 4, 5, 7, 8, 10], ["1", "b2", "3", "4", "5", "b6", "b7"]),
  scale("hungarianMinor", [0, 2, 3, 6, 7, 8, 11], ["1", "2", "b3", "#4", "5", "b6", "7"]),
];

const BY_ID = new Map(SCALE_TYPES.map((s) => [s.id, s]));

export function getScaleType(id: string): ScaleType {
  const s = BY_ID.get(id);
  if (!s) throw new Error(`Unknown scale "${id}"`);
  return s;
}

export function scalePitchClasses(root: PitchClass, type: ScaleType): PitchClass[] {
  return type.semitones.map((s) => mod(root + s, 12));
}
