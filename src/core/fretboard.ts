import { pitchClass, type Midi, type PitchClass } from "./pitch";
import type { Tuning } from "./tuning";

/**
 * A fretboard position. `string` is an index into `tuning.strings`, so
 * 0 = the lowest string. Guitarists number strings from the highest (1 =
 * high E); use `stringNumber` / `stringIndex` to convert.
 */
export interface Position {
  string: number;
  fret: number;
}

export interface FretRange {
  min: number;
  max: number;
}

export const MAX_FRET = 24;

export function pitchAt(tuning: Tuning, pos: Position): Midi {
  const open = tuning.strings[pos.string];
  if (open === undefined) throw new Error(`String index ${pos.string} doesn't exist in ${tuning.id}`);
  return open + pos.fret;
}

/** Guitarist string number (1 = highest string) for an index. */
export function stringNumber(tuning: Tuning, index: number): number {
  return tuning.strings.length - index;
}

/** String index (0 = lowest) for a guitarist string number (1 = highest). */
export function stringIndex(tuning: Tuning, number: number): number {
  return tuning.strings.length - number;
}

export function allStringIndices(tuning: Tuning): number[] {
  return tuning.strings.map((_, i) => i);
}

/**
 * Resolves a stored selection of guitarist string numbers against the active
 * tuning: numbers that don't exist are dropped; an empty result means "all".
 */
export function resolveStrings(tuning: Tuning, numbers: readonly number[] | null | undefined): number[] {
  const n = tuning.strings.length;
  const valid = (numbers ?? []).filter((x) => Number.isInteger(x) && x >= 1 && x <= n);
  if (valid.length === 0) return allStringIndices(tuning);
  return [...new Set(valid.map((x) => n - x))].sort((a, b) => a - b);
}

export function clampRange(r: FretRange): FretRange {
  const min = Math.max(0, Math.min(MAX_FRET, Math.round(r.min)));
  const max = Math.max(min, Math.min(MAX_FRET, Math.round(r.max)));
  return { min, max };
}

export interface PositionQuery {
  frets?: FretRange;
  /** String indices to search (default: all). */
  strings?: readonly number[];
}

function* iterPositions(tuning: Tuning, q: PositionQuery): Generator<Position> {
  const { min, max } = clampRange(q.frets ?? { min: 0, max: 12 });
  const strings = q.strings ?? allStringIndices(tuning);
  for (const s of strings) {
    if (tuning.strings[s] === undefined) continue;
    for (let f = min; f <= max; f++) yield { string: s, fret: f };
  }
}

export function allPositions(tuning: Tuning, q: PositionQuery = {}): Position[] {
  return [...iterPositions(tuning, q)];
}

/** All positions whose pitch class is `pc`. */
export function positionsOfPitchClass(tuning: Tuning, pc: PitchClass, q: PositionQuery = {}): Position[] {
  return allPositions(tuning, q).filter((p) => pitchClass(pitchAt(tuning, p)) === pitchClass(pc));
}

/** All positions that sound exactly `midi`. */
export function positionsOfMidi(tuning: Tuning, midi: Midi, q: PositionQuery = {}): Position[] {
  return allPositions(tuning, q).filter((p) => pitchAt(tuning, p) === midi);
}

export function samePosition(a: Position, b: Position): boolean {
  return a.string === b.string && a.fret === b.fret;
}

export function positionKey(p: Position): string {
  return `s${p.string}-f${p.fret}`;
}

/**
 * Finds a compact pair of positions for two pitches (e.g. to show an
 * interval): minimises fret distance, then prefers lower frets.
 */
export function closestPair(tuning: Tuning, a: Midi, b: Midi, frets: FretRange): [Position, Position] | null {
  const pa = positionsOfMidi(tuning, a, { frets });
  const pb = positionsOfMidi(tuning, b, { frets });
  let best: [Position, Position] | null = null;
  let bestScore = Infinity;
  for (const x of pa) {
    for (const y of pb) {
      const span = Math.abs(x.fret - y.fret);
      const strDist = Math.abs(x.string - y.string);
      const score = span * 10 + strDist * 2 + (x.fret + y.fret) * 0.1;
      if (score < bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
  }
  return best;
}
