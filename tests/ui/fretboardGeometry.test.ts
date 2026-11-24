import { describe, expect, it } from "vitest";
import { computeGeometry, inlayFrets } from "../../src/ui/components/fretboardGeometry";

const base = { strings: 6, frets: { min: 0, max: 12 }, lowestAtBottom: true, leftHanded: false };

describe("fretboard geometry", () => {
  it("fret wires move away from the nut and frets get narrower", () => {
    const g = computeGeometry(base);
    let prev = g.nutX!;
    let prevWidth = Infinity;
    for (let f = 1; f <= 12; f++) {
      const x = g.fretWireX(f);
      expect(x).toBeGreaterThan(prev);
      expect(x - prev).toBeLessThan(prevWidth);
      prevWidth = x - prev;
      prev = x;
    }
  });
  it("cells contain their centres and don't overlap", () => {
    const g = computeGeometry({ ...base, frets: { min: 0, max: 24 } });
    for (let f = 0; f <= 24; f++) {
      const [a, b] = g.cellSpan(f);
      expect(g.cellCenterX(f)).toBeGreaterThan(a);
      expect(g.cellCenterX(f)).toBeLessThan(b);
      if (f > 0) expect(a).toBeCloseTo(g.cellSpan(f - 1)[1], 6);
    }
  });
  it("lowest string at bottom or top", () => {
    const bottom = computeGeometry(base);
    const top = computeGeometry({ ...base, lowestAtBottom: false });
    expect(bottom.stringY(0)).toBeGreaterThan(bottom.stringY(5));
    expect(top.stringY(0)).toBeLessThan(top.stringY(5));
  });
  it("left-handed mirrors horizontally", () => {
    const r = computeGeometry(base);
    const l = computeGeometry({ ...base, leftHanded: true });
    expect(l.width).toBe(r.width);
    for (const f of [0, 1, 5, 12]) expect(l.cellCenterX(f)).toBeCloseTo(r.width - r.cellCenterX(f), 6);
    expect(l.fretWireX(3)).toBeLessThan(l.fretWireX(2));
  });
  it("height grows with string count (8-string)", () => {
    expect(computeGeometry({ ...base, strings: 8 }).height).toBeGreaterThan(computeGeometry(base).height);
  });
  it("ranges that don't start at 0 have no nut", () => {
    const g = computeGeometry({ ...base, frets: { min: 5, max: 9 } });
    expect(g.nutX).toBeNull();
    const [a] = g.cellSpan(5);
    expect(a).toBeCloseTo(44, 6);
  });
  it("inlays", () => {
    expect(inlayFrets(0, 12).map((i) => i.fret)).toEqual([3, 5, 7, 9, 12]);
    expect(inlayFrets(0, 24).filter((i) => i.double).map((i) => i.fret)).toEqual([12, 24]);
  });
});
