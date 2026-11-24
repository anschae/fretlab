import { clampRange, type FretRange } from "../../core/fretboard";
import type { QuestionContext } from "../types";

/** Exercise-level fret range that can follow the global setting. */
export interface FretOverride {
  useGlobalFrets: boolean;
  frets: FretRange;
}

export function effectiveFrets(ctx: Pick<QuestionContext, "frets">, s: FretOverride): FretRange {
  return s.useGlobalFrets ? ctx.frets : clampRange(s.frets);
}
