import { describe, expect, it } from "vitest";
import {
  centsOff,
  frequencyToMidi,
  isNatural,
  midiToFrequency,
  noteToMidi,
  octaveOf,
  parseNote,
  pitchClass,
  spelledPitchClass,
  spelledToMidi,
  transposeSpelled,
} from "../../src/core/pitch";

describe("MIDI ↔ frequency", () => {
  it("A4 = 440 Hz", () => {
    expect(midiToFrequency(69)).toBeCloseTo(440, 10);
    expect(frequencyToMidi(440)).toBeCloseTo(69, 10);
  });
  it("low guitar strings", () => {
    expect(midiToFrequency(noteToMidi("E2"))).toBeCloseTo(82.407, 2);
    expect(midiToFrequency(noteToMidi("F#1"))).toBeCloseTo(46.249, 2);
    expect(midiToFrequency(noteToMidi("E1"))).toBeCloseTo(41.203, 2);
  });
  it("supports other reference pitches", () => {
    expect(midiToFrequency(69, 442)).toBe(442);
  });
  it("round-trips", () => {
    for (let m = 20; m < 110; m++) expect(frequencyToMidi(midiToFrequency(m))).toBeCloseTo(m, 9);
  });
  it("cents offset", () => {
    expect(centsOff(midiToFrequency(69.25), 69)).toBeCloseTo(25, 6);
    expect(centsOff(midiToFrequency(68.9), 69)).toBeCloseTo(-10, 6);
  });
});

describe("pitch classes and octaves", () => {
  it("C4 = 60", () => {
    expect(noteToMidi("C4")).toBe(60);
    expect(octaveOf(60)).toBe(4);
    expect(octaveOf(59)).toBe(3);
    expect(pitchClass(61)).toBe(1);
    expect(pitchClass(-1)).toBe(11);
  });
  it("naturals", () => {
    expect([0, 2, 4, 5, 7, 9, 11].every(isNatural)).toBe(true);
    expect([1, 3, 6, 8, 10].some(isNatural)).toBe(false);
  });
});

describe("parseNote", () => {
  it("English names", () => {
    expect(noteToMidi("E1")).toBe(28);
    expect(noteToMidi("F#1")).toBe(30);
    expect(noteToMidi("Bb3")).toBe(58);
    expect(noteToMidi("B♭3")).toBe(58);
    expect(noteToMidi("Cb4")).toBe(59);
    expect(noteToMidi("B#3")).toBe(60);
    expect(parseNote("c#")).toEqual({ note: { letter: 0, accidental: 1 }, octave: null });
    expect(parseNote("Fx2")?.note).toEqual({ letter: 3, accidental: 2 });
  });
  it("German names", () => {
    expect(noteToMidi("H3", { german: true })).toBe(59);
    expect(noteToMidi("B3", { german: true })).toBe(58);
    expect(noteToMidi("Fis2", { german: true })).toBe(42);
    expect(noteToMidi("Es4", { german: true })).toBe(63);
    expect(noteToMidi("As4", { german: true })).toBe(68);
    expect(noteToMidi("Cis4", { german: true })).toBe(61);
    // H is accepted in English mode too (unambiguous)
    expect(noteToMidi("H3")).toBe(59);
  });
  it("rejects junk", () => {
    expect(parseNote("X4")).toBeNull();
    expect(parseNote("C###")).toBeNull();
    expect(parseNote("")).toBeNull();
    expect(() => noteToMidi("C")).toThrow();
  });
});

describe("spelled transposition", () => {
  it("C + minor third = E♭ (not D♯)", () => {
    expect(transposeSpelled({ letter: 0, accidental: 0 }, 2, 3)).toEqual({ letter: 2, accidental: -1 });
  });
  it("F♯ + major third = A♯", () => {
    expect(transposeSpelled({ letter: 3, accidental: 1 }, 2, 4)).toEqual({ letter: 5, accidental: 1 });
  });
  it("wraps letters and keeps pitch class", () => {
    const b = { letter: 6 as const, accidental: 0 };
    const r = transposeSpelled(b, 1, 1); // B + m2 = C
    expect(r).toEqual({ letter: 0, accidental: 0 });
    expect(spelledPitchClass(r)).toBe(0);
    expect(spelledToMidi({ letter: 6, accidental: 1 }, 3)).toBe(60);
  });
});
