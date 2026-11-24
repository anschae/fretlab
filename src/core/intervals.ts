/**
 * Interval definitions. `steps` is the diatonic distance (0 = unison,
 * 2 = third, 7 = octave) so intervals can be spelled correctly on notes.
 */
export interface IntervalDef {
  id: string;
  semitones: number;
  steps: number;
  /** Short label shown on answer buttons ("m3", "TT"). */
  short: string;
  /** i18n key for the long name ("interval.m3" → "minor third"). */
  nameKey: string;
  compound: boolean;
}

function def(id: string, semitones: number, steps: number, short = id): IntervalDef {
  return { id, semitones, steps, short, nameKey: `interval.${id}`, compound: semitones > 12 };
}

export const INTERVALS: readonly IntervalDef[] = [
  def("P1", 0, 0),
  def("m2", 1, 1),
  def("M2", 2, 1),
  def("m3", 3, 2),
  def("M3", 4, 2),
  def("P4", 5, 3),
  def("TT", 6, 3), // spelled as augmented fourth
  def("P5", 7, 4),
  def("m6", 8, 5),
  def("M6", 9, 5),
  def("m7", 10, 6),
  def("M7", 11, 6),
  def("P8", 12, 7),
  def("m9", 13, 8),
  def("M9", 14, 8),
  def("m10", 15, 9),
  def("M10", 16, 9),
  def("P11", 17, 10),
  def("A11", 18, 10),
  def("P12", 19, 11),
  def("m13", 20, 12),
  def("M13", 21, 12),
  def("m14", 22, 13),
  def("M14", 23, 13),
  def("P15", 24, 14),
];

const BY_ID = new Map(INTERVALS.map((i) => [i.id, i]));
const BY_SEMITONES = new Map(INTERVALS.map((i) => [i.semitones, i]));

export function getInterval(id: string): IntervalDef {
  const i = BY_ID.get(id);
  if (!i) throw new Error(`Unknown interval "${id}"`);
  return i;
}

export function intervalBySemitones(semitones: number): IntervalDef | undefined {
  return BY_SEMITONES.get(Math.abs(semitones));
}

/** The 12 simple intervals used for ear training (m2 … P8). */
export const SIMPLE_INTERVAL_IDS = ["m2", "M2", "m3", "M3", "P4", "TT", "P5", "m6", "M6", "m7", "M7", "P8"] as const;
export const COMPOUND_INTERVAL_IDS = INTERVALS.filter((i) => i.compound).map((i) => i.id);

export interface IntervalPreset {
  id: string;
  labelKey: string;
  intervals: string[];
}

export const INTERVAL_PRESETS: readonly IntervalPreset[] = [
  { id: "beginner", labelKey: "preset.beginner", intervals: ["P4", "P5", "P8"] },
  { id: "thirds", labelKey: "preset.thirds", intervals: ["m3", "M3", "P5", "P8"] },
  { id: "simple", labelKey: "preset.simple", intervals: [...SIMPLE_INTERVAL_IDS] },
  { id: "compound", labelKey: "preset.compound", intervals: [...SIMPLE_INTERVAL_IDS, ...COMPOUND_INTERVAL_IDS] },
];
