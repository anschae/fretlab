import { describe, expect, it } from "vitest";
import { pitchAt } from "../../src/core/fretboard";
import { getInterval } from "../../src/core/intervals";
import { pitchClass, isNatural } from "../../src/core/pitch";
import { createRng } from "../../src/core/random";
import { dropLowest, playableRange, standardTuning, type Tuning } from "../../src/core/tuning";
import { defaultSettings } from "../../src/state/settings";
import type { QuestionContext } from "../../src/exercises/types";
import { NoQuestionError } from "../../src/exercises/types";
import * as ie from "../../src/exercises/interval-ear/logic";
import * as nn from "../../src/exercises/fretboard-name-note/logic";
import * as fn from "../../src/exercises/fretboard-find-note/logic";
import { MODULES } from "../../src/exercises/registry";

const TUNINGS: Tuning[] = [6, 7, 8].flatMap((n) => [standardTuning(n), dropLowest(standardTuning(n))]);

function ctx<Q>(tuning: Tuning, seed: number, previous?: Q, frets = { min: 0, max: 12 }): QuestionContext<Q> {
  return { tuning, settings: defaultSettings(), frets, rng: createRng(seed), weight: () => 1, previous };
}

describe("registry", () => {
  it("ids are unique and every module has a title", () => {
    const ids = MODULES.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MODULES) expect(m.titleKey).toBeTruthy();
  });
  it("every exercise ships EN and DE strings for the keys it declares", () => {
    for (const m of MODULES) {
      if (!m.messages) continue;
      expect(Object.keys(m.messages.de ?? {}).sort()).toEqual(Object.keys(m.messages.en).sort());
    }
  });
});

describe("interval-ear", () => {
  it("is deterministic for a seed", () => {
    const t = standardTuning(6);
    expect(ie.generateIntervalQuestion(ctx(t, 5), ie.DEFAULTS)).toEqual(ie.generateIntervalQuestion(ctx(t, 5), ie.DEFAULTS));
  });
  for (const tuning of TUNINGS) {
    it(`stays within the playable range and changes root every time (${tuning.id})`, () => {
      const { low, high } = playableRange(tuning, 12);
      const c = ctx<ie.IntervalQuestion>(tuning, 99);
      let prev: ie.IntervalQuestion | undefined;
      for (let i = 0; i < 400; i++) {
        const s = { ...ie.DEFAULTS, direction: "random" as const, intervals: ["m2", "P5", "P8", "P15"] };
        const q = ie.generateIntervalQuestion({ ...c, previous: prev }, s);
        const [a, b] = ie.noteSpan(q);
        expect(a).toBeGreaterThanOrEqual(low);
        expect(b).toBeLessThanOrEqual(high);
        if (prev) expect(q.root).not.toBe(prev.root);
        expect(Math.abs(ie.secondNote(q) - q.root)).toBe(getInterval(q.interval).semitones);
        prev = q;
      }
    });
  }
  it("respects direction", () => {
    const t = standardTuning(7);
    const q = ie.generateIntervalQuestion(ctx(t, 1), { ...ie.DEFAULTS, direction: "desc", intervals: ["P5"] });
    expect(ie.secondNote(q)).toBe(q.root - 7);
  });
  it("adaptive weights pick weak intervals more often", () => {
    const t = standardTuning(6);
    const counts: Record<string, number> = {};
    const c = { ...ctx<ie.IntervalQuestion>(t, 3), weight: (k: string) => (k === "m3" ? 9 : 1) };
    for (let i = 0; i < 1000; i++) {
      const q = ie.generateIntervalQuestion(c, { ...ie.DEFAULTS, intervals: ["m3", "M3"] });
      counts[q.interval] = (counts[q.interval] ?? 0) + 1;
    }
    expect(counts.m3! / counts.M3!).toBeGreaterThan(5);
  });
  it("no intervals → NoQuestionError", () => {
    expect(() => ie.generateIntervalQuestion(ctx(standardTuning(6), 1), { ...ie.DEFAULTS, intervals: [] })).toThrow(NoQuestionError);
  });
  it("checks answers", () => {
    const q = { root: 45, interval: "m3", direction: "asc" as const };
    expect(ie.checkInterval(q, "m3").correct).toBe(true);
    expect(ie.checkInterval(q, "M3").correct).toBe(false);
    expect(ie.checkInterval(q, undefined).correct).toBe(false);
  });
});

describe("fretboard-name-note", () => {
  for (const tuning of TUNINGS) {
    it(`only uses existing strings and frets (${tuning.id})`, () => {
      const c = ctx<nn.NameNoteQuestion>(tuning, 11);
      let prev: nn.NameNoteQuestion | undefined;
      for (let i = 0; i < 300; i++) {
        const q = nn.generateNameNote({ ...c, previous: prev }, nn.DEFAULTS);
        expect(tuning.strings[q.pos.string]).toBeDefined();
        expect(q.pos.fret).toBeGreaterThanOrEqual(0);
        expect(q.pos.fret).toBeLessThanOrEqual(12);
        expect(q.midi).toBe(pitchAt(tuning, q.pos));
        if (prev) expect(q.pos).not.toEqual(prev.pos);
        prev = q;
      }
    });
  }
  it("string filter: only strings 7 and 8 on an 8-string", () => {
    const t = standardTuning(8);
    for (let i = 0; i < 100; i++) {
      const q = nn.generateNameNote(ctx(t, i), { ...nn.DEFAULTS, strings: [7, 8] });
      expect(q.pos.string).toBeLessThanOrEqual(1);
      expect(q.key).toMatch(/^n[78]-f\d+$/);
    }
  });
  it("string filter falls back to all strings when the selection doesn't exist", () => {
    const q = nn.generateNameNote(ctx(standardTuning(6), 2), { ...nn.DEFAULTS, strings: [7, 8] });
    expect(q.pos.string).toBeLessThan(6);
  });
  it("naturals only + exercise fret range", () => {
    const t = standardTuning(6);
    for (let i = 0; i < 100; i++) {
      const q = nn.generateNameNote(ctx(t, i), { ...nn.DEFAULTS, naturalsOnly: true, useGlobalFrets: false, frets: { min: 5, max: 9 } });
      expect(isNatural(pitchClass(q.midi))).toBe(true);
      expect(q.pos.fret).toBeGreaterThanOrEqual(5);
      expect(q.pos.fret).toBeLessThanOrEqual(9);
    }
  });
  it("enharmonic answers count (pitch classes)", () => {
    const q = { pos: { string: 0, fret: 1 }, midi: 41 + 0, key: "" };
    expect(nn.checkNameNote(q, 5).correct).toBe(true);
    expect(nn.checkNameNote({ ...q, midi: 42 }, 6).correct).toBe(true);
    expect(nn.checkNameNote(q, 6).correct).toBe(false);
  });
});

describe("fretboard-find-note", () => {
  for (const tuning of TUNINGS) {
    it(`single: target is on the asked string and in range (${tuning.id})`, () => {
      for (let i = 0; i < 200; i++) {
        const q = fn.generateFindNote(ctx(tuning, i), fn.DEFAULTS) as fn.SingleQuestion;
        expect(q.kind).toBe("single");
        expect(tuning.strings[q.string]).toBeDefined();
        expect(q.targets.length).toBeGreaterThan(0);
        for (const p of q.targets) {
          expect(p.string).toBe(q.string);
          expect(pitchClass(pitchAt(tuning, p))).toBe(q.pc);
          expect(p.fret).toBeLessThanOrEqual(12);
        }
      }
    });
  }
  it("single: any valid fret counts (open and 12th)", () => {
    const t = standardTuning(6);
    // find E on the high E string, frets 0–12 → 0 and 12
    let q: fn.FindQuestion | undefined;
    for (let seed = 0; seed < 500 && !q; seed++) {
      const x = fn.generateFindNote(ctx(t, seed), { ...fn.DEFAULTS, strings: [1] });
      if (x.pc === 4) q = x;
    }
    expect(q).toBeDefined();
    expect(q!.targets.map((p) => p.fret)).toEqual([0, 12]);
    expect(fn.checkFind(q!, { string: 5, fret: 12 }).correct).toBe(true);
    expect(fn.checkFind(q!, { string: 5, fret: 0 }).correct).toBe(true);
    expect(fn.checkFind(q!, { string: 5, fret: 5 }).correct).toBe(false);
    expect(fn.checkFind(q!, undefined).correct).toBe(false);
  });
  it("find all: progress, completion and mistakes", () => {
    const t = standardTuning(6);
    const q = fn.generateFindNote(ctx(t, 4), { ...fn.DEFAULTS, mode: "all" });
    expect(q.kind).toBe("all");
    const targets = q.targets;
    const wrong = { string: 0, fret: (targets[0]!.fret + 1) % 12 };
    let r = fn.checkFindPartial(q, [targets[0]!, targets[0]!]);
    expect(r.found).toBe(1);
    expect(r.complete).toBe(targets.length === 1);
    r = fn.checkFindPartial(q, [...targets, wrong]);
    expect(r.complete).toBe(true);
    expect(r.mistakes).toBe(1);
    expect(fn.checkFind(q, targets).correct).toBe(true);
    expect(fn.checkFind(q, [...targets, wrong]).correct).toBe(false);
  });
  it("find all on 8-string covers the low strings", () => {
    const t = standardTuning(8);
    const q = fn.generateFindNote(ctx(t, 8), { ...fn.DEFAULTS, mode: "all" });
    expect(q.targets.some((p) => p.string <= 1)).toBe(true);
  });
  it("timed mode uses single questions", () => {
    const q = fn.generateFindNote(ctx(standardTuning(7), 1), { ...fn.DEFAULTS, mode: "timed" });
    expect(q.kind).toBe("single");
  });
});
