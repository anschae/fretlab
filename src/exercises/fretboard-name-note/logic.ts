import { allPositions, pitchAt, resolveStrings, samePosition, stringNumber, type FretRange, type Position } from "../../core/fretboard";
import { isNatural, pitchClass, type Midi, type PitchClass } from "../../core/pitch";
import type { Tuning } from "../../core/tuning";
import { effectiveFrets, type FretOverride } from "../shared/frets";
import { NoQuestionError, type CheckResult, type QuestionContext } from "../types";

export interface NameNoteSettings extends FretOverride {
  /** guitarist string numbers (1 = highest); empty = all strings */
  strings: number[];
  naturalsOnly: boolean;
  play: "never" | "question" | "answer";
}

export interface NameNoteQuestion {
  pos: Position;
  midi: Midi;
  /** stat key, computed at generation (string number + fret) */
  key: string;
}

export const DEFAULTS: NameNoteSettings = {
  strings: [],
  naturalsOnly: false,
  useGlobalFrets: true,
  frets: { min: 0, max: 12 },
  play: "answer",
};

/** Position key used for statistics and the heatmap: "n6-f5" = string 6, fret 5. */
export function positionStatKey(tuning: Tuning, p: Position): string {
  return `n${stringNumber(tuning, p.string)}-f${p.fret}`;
}

export function candidatePositions(tuning: Tuning, frets: FretRange, strings: number[], naturalsOnly: boolean): Position[] {
  return allPositions(tuning, { frets, strings: resolveStrings(tuning, strings) }).filter(
    (p) => !naturalsOnly || isNatural(pitchAt(tuning, p)),
  );
}

export function generateNameNote(ctx: QuestionContext<NameNoteQuestion>, s: NameNoteSettings): NameNoteQuestion {
  const frets = effectiveFrets(ctx, s);
  const all = candidatePositions(ctx.tuning, frets, s.strings, s.naturalsOnly);
  const prev = ctx.previous?.pos;
  const pool = all.length > 1 && prev ? all.filter((p) => !samePosition(p, prev)) : all;
  if (pool.length === 0) throw new NoQuestionError();
  const pos = ctx.rng.weighted(pool, (p) => ctx.weight(positionStatKey(ctx.tuning, p)));
  return { pos, midi: pitchAt(ctx.tuning, pos), key: positionStatKey(ctx.tuning, pos) };
}

/** Enharmonic answers are equivalent: the answer is a pitch class. */
export function checkNameNote(q: NameNoteQuestion, answer: PitchClass | undefined): CheckResult<PitchClass> {
  const correct = pitchClass(q.midi);
  return { correct: answer !== undefined && pitchClass(answer) === correct, correctAnswer: correct };
}
