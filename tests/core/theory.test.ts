import { describe, expect, it } from "vitest";
import { CHORD_TYPES, chordPitchClasses, chordSemitones, getChordType, spellChord } from "../../src/core/chords";
import { getInterval, INTERVAL_PRESETS, INTERVALS, intervalBySemitones, SIMPLE_INTERVAL_IDS } from "../../src/core/intervals";
import { getScaleType, SCALE_TYPES, scalePitchClasses } from "../../src/core/scales";
import { formatSpelled } from "../../src/core/notation";
import { createRng } from "../../src/core/random";

describe("intervals", () => {
  it("12 simple intervals m2..P8 with increasing semitones", () => {
    expect(SIMPLE_INTERVAL_IDS.map((id) => getInterval(id).semitones)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
  it("compound up to two octaves", () => {
    expect(Math.max(...INTERVALS.map((i) => i.semitones))).toBe(24);
    expect(intervalBySemitones(19)?.id).toBe("P12");
    expect(intervalBySemitones(-7)?.id).toBe("P5");
  });
  it("presets reference known intervals", () => {
    for (const p of INTERVAL_PRESETS) for (const id of p.intervals) expect(() => getInterval(id)).not.toThrow();
    expect(INTERVAL_PRESETS[0]?.intervals).toEqual(["P4", "P5", "P8"]);
  });
  it("unknown id throws", () => {
    expect(() => getInterval("X9")).toThrow();
  });
});

describe("chords", () => {
  it("formulas", () => {
    expect(chordSemitones(getChordType("m7"))).toEqual([0, 3, 7, 10]);
    expect(chordSemitones(getChordType("m7b5"))).toEqual([0, 3, 6, 10]);
    expect(chordSemitones(getChordType("dim7"))).toEqual([0, 3, 6, 9]);
    expect(chordPitchClasses(9, getChordType("maj"))).toEqual([9, 1, 4]);
  });
  it("degree labels match tone count", () => {
    for (const c of CHORD_TYPES) expect(c.degrees).toHaveLength(c.tones.length);
  });
  it("spelling", () => {
    const en = { system: "en" as const, accidentals: "mixed" as const };
    const c = { letter: 0 as const, accidental: 0 };
    const sp = (id: string) => spellChord(c, getChordType(id)).map((n) => formatSpelled(n, en)).join(" ");
    expect(sp("dim7")).toBe("C E♭ G♭ B♭♭");
    expect(sp("aug")).toBe("C E G♯");
    expect(sp("m7b5")).toBe("C E♭ G♭ B♭");
    expect(sp("maj7")).toBe("C E G B");
  });
});

describe("scales", () => {
  it("modes are rotations of the major scale", () => {
    const major = getScaleType("major").semitones;
    const modes = ["ionian", "dorian", "phrygian", "lydian", "mixolydian", "aeolian", "locrian"];
    modes.forEach((id, k) => {
      const rotated = major.map((_, i) => (((major[(i + k) % 7] ?? 0) - (major[k] ?? 0)) + 12) % 12);
      expect(getScaleType(id).semitones).toEqual(rotated);
    });
  });
  it("every formula starts at 0 and ascends", () => {
    for (const s of SCALE_TYPES) {
      expect(s.semitones[0]).toBe(0);
      for (let i = 1; i < s.semitones.length; i++) expect(s.semitones[i]!).toBeGreaterThan(s.semitones[i - 1]!);
    }
  });
  it("pitch classes", () => {
    expect(scalePitchClasses(4, getScaleType("minorPentatonic"))).toEqual([4, 7, 9, 11, 2]);
  });
});

describe("random", () => {
  it("is deterministic for a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 20 }, () => a.next());
    expect(Array.from({ length: 20 }, () => b.next())).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
  it("int is inclusive and in range", () => {
    const r = createRng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(3, 6));
    expect([...seen].sort()).toEqual([3, 4, 5, 6]);
  });
  it("weighted pick follows weights", () => {
    const r = createRng(7);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 6000; i++) counts[r.weighted(["a", "b", "c"] as const, (x) => (x === "a" ? 1 : x === "b" ? 2 : 0))]++;
    expect(counts.c).toBe(0);
    expect(counts.b / counts.a).toBeGreaterThan(1.7);
    expect(counts.b / counts.a).toBeLessThan(2.3);
  });
  it("weighted falls back to uniform when all weights are zero", () => {
    const r = createRng(3);
    expect(["x", "y"]).toContain(r.weighted(["x", "y"], () => 0));
  });
  it("shuffle is a permutation", () => {
    const r = createRng(9);
    expect(r.shuffle([1, 2, 3, 4, 5]).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});
