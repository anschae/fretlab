import {
  allPositions,
  pitchAt,
  positionsOfPitchClass,
  resolveStrings,
  samePosition,
  stringNumber,
  type FretRange,
  type Position,
} from "../../core/fretboard";
import { isNatural, pitchClass, type PitchClass } from "../../core/pitch";
import type { Tuning } from "../../core/tuning";
import { effectiveFrets, type FretOverride } from "../shared/frets";
import { NoQuestionError, type CheckResult, type PartialResult, type QuestionContext } from "../types";

export type FindMode = "single" | "all" | "timed";

export interface FindNoteSettings extends FretOverride {
  mode: FindMode;
  strings: number[];
  naturalsOnly: boolean;
  playOnClick: boolean;
  timedSeconds: number;
}

export const DEFAULTS: FindNoteSettings = {
  mode: "single",
  strings: [],
  naturalsOnly: false,
  useGlobalFrets: true,
  frets: { min: 0, max: 12 },
  playOnClick: true,
  timedSeconds: 60,
};

/** "Find E on string 3" — any fret of that string in range with that pitch class counts. */
export interface SingleQuestion {
  kind: "single";
  pc: PitchClass;
  string: number;
  frets: FretRange;
  key: string;
  /** every correct position (computed at generation, so checking is pure) */
  targets: Position[];
}

/** "Find every C between fret 0 and 12" (on the selected strings). */
export interface AllQuestion {
  kind: "all";
  pc: PitchClass;
  strings: number[];
  frets: FretRange;
  key: string;
  targets: Position[];
}

export type FindQuestion = SingleQuestion | AllQuestion;
/** single: one position; all: the list of clicked positions */
export type FindAnswer = Position | Position[];


export function generateFindNote(ctx: QuestionContext<FindQuestion>, s: FindNoteSettings): FindQuestion {
  const frets = effectiveFrets(ctx, s);
  const strings = resolveStrings(ctx.tuning, s.strings);
  const okPc = (pc: PitchClass) => !s.naturalsOnly || isNatural(pc);

  if (s.mode === "all") {
    const pcs = [...new Set(allPositions(ctx.tuning, { frets, strings }).map((p) => pitchClass(pitchAt(ctx.tuning, p))))].filter(okPc);
    const prevPc = ctx.previous?.kind === "all" ? ctx.previous.pc : undefined;
    const pool = pcs.length > 1 ? pcs.filter((pc) => pc !== prevPc) : pcs;
    if (pool.length === 0) throw new NoQuestionError();
    const pc = ctx.rng.weighted(pool, (x) => ctx.weight(`all-pc${x}`));
    const targets = positionsOfPitchClass(ctx.tuning, pc, { frets, strings });
    return { kind: "all", pc, strings, frets, key: `all-pc${pc}`, targets };
  }

  // single / timed: pick a position, ask for its note on its string
  const positions = allPositions(ctx.tuning, { frets, strings }).filter((p) => okPc(pitchClass(pitchAt(ctx.tuning, p))));
  const prev = ctx.previous?.kind === "single" ? ctx.previous : undefined;
  const pool = positions.length > 1 && prev ? positions.filter((p) => !(p.string === prev.string && pitchClass(pitchAt(ctx.tuning, p)) === prev.pc)) : positions;
  if (pool.length === 0) throw new NoQuestionError();
  const keyOf = (p: Position) => canonicalKey(ctx.tuning, p.string, pitchClass(pitchAt(ctx.tuning, p)), frets);
  const pos = ctx.rng.weighted(pool, (p) => ctx.weight(keyOf(p)));
  const pc = pitchClass(pitchAt(ctx.tuning, pos));
  const targets = positionsOfPitchClass(ctx.tuning, pc, { frets, strings: [pos.string] });
  return { kind: "single", pc, string: pos.string, frets, key: keyOf(pos), targets };
}

/** Stat key = lowest fret on that string with that note ("n3-f9"), shared with the heatmap. */
function canonicalKey(tuning: Tuning, string: number, pc: PitchClass, frets: FretRange): string {
  const first = positionsOfPitchClass(tuning, pc, { frets, strings: [string] })[0];
  return `n${stringNumber(tuning, string)}-f${first?.fret ?? 0}`;
}

function isTarget(q: FindQuestion, p: Position): boolean {
  return q.targets.some((t) => samePosition(t, p));
}

/** Progress for "find all": unique correct positions found, wrong clicks. */
export function checkFindPartial(q: FindQuestion, inputs: Position[]): PartialResult<Position> {
  const found: Position[] = [];
  let mistakes = 0;
  const feedback = inputs.map((p) => {
    const ok = isTarget(q, p);
    if (ok && !found.some((f) => samePosition(f, p))) found.push(p);
    if (!ok) mistakes++;
    return { input: p, ok };
  });
  const complete = q.kind === "single" ? found.length > 0 : found.length === q.targets.length;
  return { complete, found: found.length, total: q.kind === "single" ? 1 : q.targets.length, mistakes, feedback };
}

export function checkFind(q: FindQuestion, answer: FindAnswer | undefined): CheckResult<FindAnswer> {
  if (q.kind === "single") {
    const p = Array.isArray(answer) ? answer[answer.length - 1] : answer;
    return { correct: !!p && isTarget(q, p), correctAnswer: q.targets };
  }
  const inputs = Array.isArray(answer) ? answer : answer ? [answer] : [];
  const r = checkFindPartial(q, inputs);
  return { correct: r.found === r.total && r.mistakes === 0, correctAnswer: q.targets };
}
