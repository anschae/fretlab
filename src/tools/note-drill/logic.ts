import { positionsOfPitchClass, type FretRange, type Position } from "../../core/fretboard";
import type { PitchClass } from "../../core/pitch";
import type { Tuning } from "../../core/tuning";

/**
 * One-note drill: pick one note, play it on every string in turn against a
 * metronome while saying its name. Pure helpers here; the UI is in index.ts.
 */

export type Zone = "open" | "low" | "high";
export type Direction = "updown" | "up";
export type Reveal = "show" | "test";

export interface DrillSettings {
  pc: PitchClass;
  /** true = start with today's note when the tool opens */
  noteOfTheDay: boolean;
  bpm: number;
  beatsPerNote: number;
  zone: Zone;
  direction: Direction;
  reveal: Reveal;
  countIn: boolean;
  playReference: boolean;
  /** best tempo with at least one full round, per pitch class (0 = never) */
  best: number[];
}

export const DEFAULTS: DrillSettings = {
  pc: 0,
  noteOfTheDay: true,
  bpm: 40,
  beatsPerNote: 1,
  zone: "open",
  direction: "updown",
  reveal: "show",
  countIn: true,
  playReference: false,
  best: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

/** Each zone spans exactly 12 frets, so every string has the note exactly once. */
export const ZONES: Record<Zone, FretRange> = {
  open: { min: 0, max: 11 },
  low: { min: 1, max: 12 },
  high: { min: 12, max: 23 },
};

/** Frets the board shows for a zone (a little context around it). */
export function boardFrets(zone: Zone): FretRange {
  return zone === "high" ? { min: 11, max: 24 } : { min: 0, max: 12 };
}

/** C F B♭ E♭ … — the classic order for "one new note at a time". */
export const CIRCLE_OF_FOURTHS: readonly PitchClass[] = [0, 5, 10, 3, 8, 1, 6, 11, 4, 9, 2, 7];

export function nextInFourths(pc: PitchClass): PitchClass {
  const i = CIRCLE_OF_FOURTHS.indexOf(pc);
  return CIRCLE_OF_FOURTHS[(i + 1) % 12] ?? 0;
}

/** Same note for everyone on the same (local) day, walking the circle of fourths. */
export function noteOfTheDay(date: Date): PitchClass {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return CIRCLE_OF_FOURTHS[((day % 12) + 12) % 12] ?? 0;
}

/** The note on one string inside the zone (exactly one, since zones are 12 frets wide). */
export function positionOnString(tuning: Tuning, pc: PitchClass, string: number, zone: Zone): Position | null {
  return positionsOfPitchClass(tuning, pc, { frets: ZONES[zone], strings: [string] })[0] ?? null;
}

/**
 * One cycle of the drill, lowest string first. "updown" goes up and back
 * down without repeating the turning points (6 strings → 10 steps), so the
 * cycle can loop seamlessly.
 */
export function drillSequence(tuning: Tuning, pc: PitchClass, zone: Zone, direction: Direction): Position[] {
  const up: Position[] = [];
  for (let s = 0; s < tuning.strings.length; s++) {
    const p = positionOnString(tuning, pc, s, zone);
    if (p) up.push(p);
  }
  if (direction === "up" || up.length < 3) return up;
  return [...up, ...up.slice(1, -1).reverse()];
}

/**
 * Maps a metronome beat to the drill: count-in beats come first, then each
 * step lasts `beatsPerNote` beats. Returns null during the count-in.
 */
export function stepForBeat(
  beat: number,
  o: { countInBeats: number; beatsPerNote: number; length: number },
): { step: number; round: number; firstBeatOfStep: boolean } | null {
  const b = beat - o.countInBeats;
  if (b < 0 || o.length === 0) return null;
  const per = Math.max(1, o.beatsPerNote);
  const n = Math.floor(b / per);
  return { step: n % o.length, round: Math.floor(n / o.length), firstBeatOfStep: b % per === 0 };
}

/** Records a tempo as personal best for a note (returns a new array). */
export function recordBest(best: readonly number[], pc: PitchClass, bpm: number): number[] {
  const out = Array.from({ length: 12 }, (_, i) => best[i] ?? 0);
  out[pc] = Math.max(out[pc] ?? 0, bpm);
  return out;
}

/** Tempo at which the drill suggests adding the next note. */
export const GOAL_BPM = 80;
export const BPM_STEP = 4;
