import { getInterval, SIMPLE_INTERVAL_IDS } from "../../core/intervals";
import type { Midi } from "../../core/pitch";
import { playableRange } from "../../core/tuning";
import { NoQuestionError, type CheckResult, type QuestionContext } from "../types";

export type Direction = "asc" | "desc" | "harmonic";

export interface IntervalEarSettings {
  intervals: string[];
  direction: Direction | "random";
  /** pause between the two notes (ms) */
  gapMs: number;
  showOnFretboard: boolean;
  showHints: boolean;
}

export interface IntervalQuestion {
  /** the first note played (the lower note for harmonic intervals) */
  root: Midi;
  interval: string;
  direction: Direction;
}

export const DEFAULTS: IntervalEarSettings = {
  intervals: [...SIMPLE_INTERVAL_IDS],
  direction: "asc",
  gapMs: 700,
  showOnFretboard: true,
  showHints: true,
};

/** The second note of the question. */
export function secondNote(q: IntervalQuestion): Midi {
  const semis = getInterval(q.interval).semitones;
  return q.direction === "desc" ? q.root - semis : q.root + semis;
}

/** Lowest and highest MIDI note of a question. */
export function noteSpan(q: IntervalQuestion): [Midi, Midi] {
  const b = secondNote(q);
  return [Math.min(q.root, b), Math.max(q.root, b)];
}

/**
 * Pure question generator. The interval is picked by adaptive weight, the
 * root is random within the instrument's range (lowest open string up to
 * the highest string at the max fret) and never equals the previous root.
 */
export function generateIntervalQuestion(ctx: QuestionContext<IntervalQuestion>, s: IntervalEarSettings): IntervalQuestion {
  const valid = s.intervals.filter((id) => {
    try {
      return getInterval(id).semitones > 0;
    } catch {
      return false;
    }
  });
  if (valid.length === 0) throw new NoQuestionError("no intervals selected");
  const { low, high } = playableRange(ctx.tuning, ctx.frets.max);
  const fits = valid.filter((id) => getInterval(id).semitones <= high - low);
  if (fits.length === 0) throw new NoQuestionError("range too small");

  const interval = ctx.rng.weighted(fits, (id) => ctx.weight(id));
  const direction: Direction = s.direction === "random" ? ctx.rng.pick(["asc", "desc", "harmonic"] as const) : s.direction;
  const semis = getInterval(interval).semitones;
  const minRoot = direction === "desc" ? low + semis : low;
  const maxRoot = direction === "desc" ? high : high - semis;
  const roots: Midi[] = [];
  for (let m = minRoot; m <= maxRoot; m++) if (m !== ctx.previous?.root) roots.push(m);
  if (roots.length === 0) throw new NoQuestionError("no root available");
  return { root: ctx.rng.pick(roots), interval, direction };
}

export function checkInterval(q: IntervalQuestion, answer: string | undefined): CheckResult<string> {
  return { correct: answer === q.interval, correctAnswer: q.interval };
}
