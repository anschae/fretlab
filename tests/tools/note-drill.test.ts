import { describe, expect, it } from "vitest";
import { pitchAt } from "../../src/core/fretboard";
import { pitchClass } from "../../src/core/pitch";
import { dropLowest, standardTuning, type Tuning } from "../../src/core/tuning";
import {
  CIRCLE_OF_FOURTHS,
  drillSequence,
  nextInFourths,
  noteOfTheDay,
  recordBest,
  stepForBeat,
  ZONES,
  type Zone,
} from "../../src/tools/note-drill/logic";

const TUNINGS: Tuning[] = [6, 7, 8].flatMap((n) => [standardTuning(n), dropLowest(standardTuning(n))]);
const ZONE_LIST: Zone[] = ["open", "low", "high"];

describe("note-drill sequence", () => {
  for (const tuning of TUNINGS) {
    for (const zone of ZONE_LIST) {
      it(`${tuning.id} / ${zone}: every pitch class once per string, inside the zone`, () => {
        for (let pc = 0; pc < 12; pc++) {
          const up = drillSequence(tuning, pc, zone, "up");
          expect(up.map((p) => p.string)).toEqual(tuning.strings.map((_, i) => i));
          for (const p of up) {
            expect(pitchClass(pitchAt(tuning, p))).toBe(pc);
            expect(p.fret).toBeGreaterThanOrEqual(ZONES[zone].min);
            expect(p.fret).toBeLessThanOrEqual(ZONES[zone].max);
          }
        }
      });
    }
  }

  it("up-and-down loops without repeating the turning points", () => {
    const t = standardTuning(6);
    const seq = drillSequence(t, 0, "open", "updown");
    expect(seq.map((p) => p.string)).toEqual([0, 1, 2, 3, 4, 5, 4, 3, 2, 1]);
    // C in the open zone on standard 6: E8 A3 D10 G5 B1 E8
    expect(seq.slice(0, 6).map((p) => p.fret)).toEqual([8, 3, 10, 5, 1, 8]);
  });

  it("7-string low B mirrors the B string", () => {
    const t = standardTuning(7);
    for (let pc = 0; pc < 12; pc++) {
      const seq = drillSequence(t, pc, "open", "up");
      expect(seq[0]?.fret).toBe(seq[5]?.fret);
    }
  });
});

describe("note-drill timing", () => {
  const layout = { countInBeats: 4, beatsPerNote: 2, length: 10 };
  it("count-in beats map to nothing", () => {
    for (let b = 0; b < 4; b++) expect(stepForBeat(b, layout)).toBeNull();
  });
  it("steps last beatsPerNote beats and rounds wrap", () => {
    expect(stepForBeat(4, layout)).toEqual({ step: 0, round: 0, firstBeatOfStep: true });
    expect(stepForBeat(5, layout)).toEqual({ step: 0, round: 0, firstBeatOfStep: false });
    expect(stepForBeat(6, layout)).toEqual({ step: 1, round: 0, firstBeatOfStep: true });
    expect(stepForBeat(4 + 20, layout)).toEqual({ step: 0, round: 1, firstBeatOfStep: true });
  });
});

describe("note-drill helpers", () => {
  it("circle of fourths covers all 12 notes and wraps", () => {
    expect(new Set(CIRCLE_OF_FOURTHS).size).toBe(12);
    expect(nextInFourths(0)).toBe(5);
    expect(nextInFourths(7)).toBe(0);
  });
  it("note of the day is stable within a day and moves a fourth per day", () => {
    const a = noteOfTheDay(new Date(2026, 10, 27, 8));
    expect(noteOfTheDay(new Date(2026, 10, 27, 23))).toBe(a);
    expect(noteOfTheDay(new Date(2026, 10, 28, 8))).toBe(nextInFourths(a));
  });
  it("records only improvements", () => {
    const b = recordBest([], 3, 60);
    expect(b).toHaveLength(12);
    expect(b[3]).toBe(60);
    expect(recordBest(b, 3, 52)[3]).toBe(60);
  });
});
