import { describe, expect, it } from "vitest";
import { noteToMidi } from "../../src/core/pitch";
import {
  describeTuning,
  dropLowest,
  parseTuningNotes,
  playableRange,
  standardTuning,
  TuningRegistry,
} from "../../src/core/tuning";

const midis = (s: string) => s.split(" ").map((n) => noteToMidi(n));

describe("standard tunings", () => {
  it("6-string: E2 A2 D3 G3 B3 E4", () => {
    expect(standardTuning(6).strings).toEqual(midis("E2 A2 D3 G3 B3 E4"));
  });
  it("7-string: B1 E2 A2 D3 G3 B3 E4", () => {
    expect(standardTuning(7).strings).toEqual(midis("B1 E2 A2 D3 G3 B3 E4"));
  });
  it("8-string: F#1 B1 E2 A2 D3 G3 B3 E4", () => {
    expect(standardTuning(8).strings).toEqual(midis("F#1 B1 E2 A2 D3 G3 B3 E4"));
  });
});

describe("drop transform", () => {
  it("Drop D / Drop A / Drop E exactly", () => {
    expect(dropLowest(standardTuning(6)).strings).toEqual(midis("D2 A2 D3 G3 B3 E4"));
    expect(dropLowest(standardTuning(7)).strings).toEqual(midis("A1 E2 A2 D3 G3 B3 E4"));
    expect(dropLowest(standardTuning(8)).strings).toEqual(midis("E1 B1 E2 A2 D3 G3 B3 E4"));
  });
  it("names", () => {
    expect(dropLowest(standardTuning(6)).name).toBe("6-string Drop D");
    expect(dropLowest(standardTuning(7)).name).toBe("7-string Drop A");
    expect(dropLowest(standardTuning(8)).name).toBe("8-string Drop E");
    expect(dropLowest(standardTuning(8)).nameParts).toEqual({ count: 8, kind: "drop", label: "Drop E" });
  });
  it("configurable amount and immutability", () => {
    const six = standardTuning(6);
    const dropC = dropLowest(six, 4);
    expect(dropC.strings[0]).toBe(noteToMidi("C2"));
    expect(six.strings[0]).toBe(noteToMidi("E2"));
  });
  it("describe", () => {
    expect(describeTuning(dropLowest(standardTuning(8)))).toBe("E1 B1 E2 A2 D3 G3 B3 E4");
  });
});

describe("range and registry", () => {
  it("playable range", () => {
    expect(playableRange(standardTuning(6), 24)).toEqual({ low: 40, high: 64 + 24 });
    expect(playableRange(dropLowest(standardTuning(8)), 12).low).toBe(28);
  });
  it("registry", () => {
    const r = new TuningRegistry();
    expect(r.list().map((t) => t.id)).toEqual(["6-std", "7-std", "8-std"]);
    r.register({ id: "custom-dadgad", name: "DADGAD", strings: midis("D2 A2 D3 G3 A3 D4"), custom: true });
    expect(r.get("custom-dadgad")?.strings.length).toBe(6);
    r.unregister("custom-dadgad");
    expect(r.get("custom-dadgad")).toBeUndefined();
  });
});

describe("parseTuningNotes", () => {
  it("infers octaves", () => {
    expect(parseTuningNotes("D A D G B E")).toEqual(midis("D2 A2 D3 G3 B3 E4"));
    expect(parseTuningNotes("C# F# B E A D G# C#")).toEqual(midis("C#1 F#1 B1 E2 A2 D3 G#3 C#4"));
    expect(parseTuningNotes("E A D G H E", { german: true })).toEqual(midis("E2 A2 D3 G3 B3 E4"));
  });
  it("explicit octaves", () => {
    expect(parseTuningNotes("B1 E2 A2 D3 G3 B3 E4")).toEqual(midis("B1 E2 A2 D3 G3 B3 E4"));
  });
  it("rejects invalid input", () => {
    expect(parseTuningNotes("X Y Z")).toBeNull();
    expect(parseTuningNotes("E2 A D")).toBeNull();
    expect(parseTuningNotes("")).toBeNull();
  });
});
