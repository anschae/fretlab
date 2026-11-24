import { describe, expect, it } from "vitest";
import {
  formatMidi,
  formatPitchClass,
  formatPitchClassButton,
  formatSpelled,
  noteAnswerCorrect,
  parseNoteName,
  spellPitchClass,
  type NotationOptions,
} from "../../src/core/notation";
import { noteToMidi } from "../../src/core/pitch";
import { getChordType, spellChord } from "../../src/core/chords";

const en: NotationOptions = { system: "en", accidentals: "mixed" };
const de: NotationOptions = { system: "de", accidentals: "mixed" };

describe("English", () => {
  it("names all 12 pitch classes (mixed)", () => {
    expect([...Array(12).keys()].map((pc) => formatPitchClass(pc, en))).toEqual(
      ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"],
    );
  });
  it("sharps / flats preference", () => {
    expect(formatPitchClass(10, { system: "en", accidentals: "sharps" })).toBe("A♯");
    expect(formatPitchClass(1, { system: "en", accidentals: "flats" })).toBe("D♭");
    expect(formatPitchClass(10, { system: "en", accidentals: "flats", ascii: true })).toBe("Bb");
  });
  it("with octave", () => {
    expect(formatMidi(noteToMidi("F#1"), en)).toBe("F♯1");
  });
});

describe("German (H/B)", () => {
  it("B natural is H, B♭ is B", () => {
    expect(formatPitchClass(11, de)).toBe("H");
    expect(formatPitchClass(10, de)).toBe("B");
    expect(formatPitchClass(10, { system: "de", accidentals: "sharps" })).toBe("A♯");
    expect(formatMidi(noteToMidi("B3"), de)).toBe("H3");
  });
  it("all 12 pitch classes (mixed)", () => {
    expect([...Array(12).keys()].map((pc) => formatPitchClass(pc, de))).toEqual(
      ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B", "H"],
    );
  });
  it("suffix style: Cis, Es, As, B, H", () => {
    const sfx: NotationOptions = { ...de, germanSuffixes: true };
    expect([...Array(12).keys()].map((pc) => formatPitchClass(pc, sfx))).toEqual(
      ["C", "Cis", "D", "Es", "E", "F", "Fis", "G", "As", "A", "B", "H"],
    );
    expect(formatSpelled({ letter: 1, accidental: -1 }, sfx)).toBe("Des");
    expect(formatSpelled({ letter: 6, accidental: 1 }, sfx)).toBe("His");
    expect(formatSpelled({ letter: 2, accidental: -2 }, sfx)).toBe("Eses");
  });
  it("chord spelling uses H/B too (B♭ major = B D F)", () => {
    const bb = { letter: 6 as const, accidental: -1 };
    const names = spellChord(bb, getChordType("maj")).map((n) => formatSpelled(n, de));
    expect(names).toEqual(["B", "D", "F"]);
    const bMinor = spellChord({ letter: 6, accidental: 0 }, getChordType("min")).map((n) => formatSpelled(n, de));
    expect(bMinor).toEqual(["H", "D", "F♯"]);
  });
  it("button labels", () => {
    expect(formatPitchClassButton(10, de)).toBe("A♯/B");
    expect(formatPitchClassButton(10, en)).toBe("A♯/B♭");
    expect(formatPitchClassButton(11, de)).toBe("H");
  });
});

describe("parsing and answer checking", () => {
  it("parses in the active system", () => {
    expect(parseNoteName("B", "de")).toEqual({ letter: 6, accidental: -1 });
    expect(parseNoteName("B", "en")).toEqual({ letter: 6, accidental: 0 });
    expect(parseNoteName("H", "de")).toEqual({ letter: 6, accidental: 0 });
  });
  it("enharmonic answers are correct unless spelling is required", () => {
    const cs = spellPitchClass(1, "sharps");
    const db = spellPitchClass(1, "flats");
    expect(noteAnswerCorrect(cs, db)).toBe(true);
    expect(noteAnswerCorrect(cs, db, true)).toBe(false);
    expect(noteAnswerCorrect(1, 13)).toBe(true);
    expect(noteAnswerCorrect(1, 2)).toBe(false);
  });
});
