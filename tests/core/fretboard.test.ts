import { describe, expect, it } from "vitest";
import {
  allPositions,
  closestPair,
  pitchAt,
  positionsOfMidi,
  positionsOfPitchClass,
  resolveStrings,
  stringIndex,
  stringNumber,
} from "../../src/core/fretboard";
import { noteToMidi } from "../../src/core/pitch";
import { dropLowest, standardTuning } from "../../src/core/tuning";

const six = standardTuning(6);
const seven = standardTuning(7);
const eight = standardTuning(8);
const eightDrop = dropLowest(eight);

describe("position ↔ pitch", () => {
  it("6-string", () => {
    expect(pitchAt(six, { string: 0, fret: 0 })).toBe(noteToMidi("E2"));
    expect(pitchAt(six, { string: 3, fret: 2 })).toBe(noteToMidi("A3"));
    expect(pitchAt(six, { string: 5, fret: 24 })).toBe(noteToMidi("E6"));
  });
  it("7- and 8-string low strings", () => {
    expect(pitchAt(seven, { string: 0, fret: 1 })).toBe(noteToMidi("C2"));
    expect(pitchAt(eight, { string: 0, fret: 0 })).toBe(noteToMidi("F#1"));
    expect(pitchAt(eightDrop, { string: 0, fret: 0 })).toBe(noteToMidi("E1"));
  });
  it("throws for missing strings", () => {
    expect(() => pitchAt(six, { string: 6, fret: 0 })).toThrow();
  });
});

describe("string numbering", () => {
  it("1 = highest string", () => {
    expect(stringNumber(six, 5)).toBe(1);
    expect(stringNumber(eight, 0)).toBe(8);
    expect(stringIndex(eight, 8)).toBe(0);
    expect(stringIndex(seven, 1)).toBe(6);
  });
  it("resolveStrings drops strings that don't exist", () => {
    expect(resolveStrings(eight, [7, 8])).toEqual([0, 1]);
    expect(resolveStrings(six, [7, 8])).toEqual([0, 1, 2, 3, 4, 5]); // none valid → all
    expect(resolveStrings(six, [1, 7])).toEqual([5]);
    expect(resolveStrings(seven, [])).toHaveLength(7);
  });
});

describe("searching positions", () => {
  it("every C between fret 0 and 12 on a 6-string", () => {
    const cs = positionsOfPitchClass(six, 0, { frets: { min: 0, max: 12 } });
    expect(cs.map((p) => `${p.string}:${p.fret}`).sort()).toEqual(
      ["0:8", "1:3", "2:10", "3:5", "4:1", "5:8"].sort(),
    );
    // B string at fret 13 is outside the range
  });
  it("8-string adds positions on the low strings", () => {
    const cs = positionsOfPitchClass(eight, 0, { frets: { min: 0, max: 12 } });
    expect(cs.filter((p) => p.string < 2).map((p) => p.fret).sort((a, b) => a - b)).toEqual([1, 6]);
    expect(cs).toHaveLength(8);
  });
  it("open-string duplicates on 8-string (E2 and E4 both exist)", () => {
    const es = positionsOfPitchClass(eight, 4, { frets: { min: 0, max: 0 } });
    expect(es.map((p) => p.string)).toEqual([2, 7]);
  });
  it("exact pitch lookup", () => {
    expect(positionsOfMidi(six, noteToMidi("E4"), { frets: { min: 0, max: 24 } })).toHaveLength(6);
    expect(positionsOfMidi(eightDrop, noteToMidi("E1"))).toEqual([{ string: 0, fret: 0 }]);
  });
  it("respects the string filter", () => {
    const res = positionsOfPitchClass(eight, 0, { strings: [0, 1], frets: { min: 0, max: 24 } });
    expect(res.every((p) => p.string <= 1)).toBe(true);
    expect(allPositions(six, { frets: { min: 0, max: 12 } })).toHaveLength(6 * 13);
  });
  it("closest pair for an interval", () => {
    const pair = closestPair(six, noteToMidi("A2"), noteToMidi("E3"), { min: 0, max: 12 });
    expect(pair).not.toBeNull();
    const [a, b] = pair!;
    expect(Math.abs(a.fret - b.fret)).toBeLessThanOrEqual(2);
  });
});
