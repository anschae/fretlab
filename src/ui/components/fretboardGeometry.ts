import type { FretRange, Position } from "../../core/fretboard";

/**
 * Pure layout math for the fretboard SVG (unit-tested). Frets get narrower
 * towards the body like on a real guitar, but compressed so high frets stay
 * clickable on a phone.
 */
export interface GeometryOptions {
  strings: number;
  frets: FretRange;
  lowestAtBottom: boolean;
  leftHanded: boolean;
  /** viewBox width of the board area (excluding margins) */
  boardWidth?: number;
  stringSpacing?: number;
}

export interface Geometry {
  width: number;
  height: number;
  boardLeft: number;
  boardRight: number;
  boardTop: number;
  boardBottom: number;
  /** x of the nut (only meaningful when frets.min === 0) */
  nutX: number | null;
  stringSpacing: number;
  /** x of the wire at the *end* of fret f (f ≥ frets.min); for the open column, the nut */
  fretWireX(f: number): number;
  /** horizontal centre of the cell for fret f (where a finger goes) */
  cellCenterX(f: number): number;
  /** x-extent [from, to] of the clickable cell for fret f (from < to) */
  cellSpan(f: number): [number, number];
  stringY(index: number): number;
  positionXY(p: Position): { x: number; y: number };
  /** x for the fret-number label of fret f */
  labelX(f: number): number;
}

const MARGIN_X = 44;
const MARGIN_TOP = 14;
const MARGIN_BOTTOM = 30;

/** Relative width of fret n (1-based): softened 12-TET spacing. */
export function fretWeight(n: number): number {
  return Math.pow(2, -n / 19);
}

export function computeGeometry(o: GeometryOptions): Geometry {
  const spacing = o.stringSpacing ?? 30;
  const boardWidth = o.boardWidth ?? 1000;
  const { min, max } = o.frets;
  const showOpen = min === 0;
  const first = Math.max(1, min);
  // Width units: open column ≈ 0.75 of the first fret
  const weights: number[] = [];
  for (let f = first; f <= max; f++) weights.push(fretWeight(f));
  const openWeight = showOpen ? fretWeight(1) * 0.75 : 0;
  const total = weights.reduce((s, w) => s + w, 0) + openWeight || 1;
  const unit = boardWidth / total;

  // Unmirrored x coordinates, left = headstock side
  const left = MARGIN_X;
  const nutX = showOpen ? left + openWeight * unit : null;
  const wire: Record<number, number> = {};
  let x = showOpen ? (nutX as number) : left;
  if (!showOpen) wire[first - 1] = left; // left edge acts as the previous wire
  else wire[0] = nutX as number;
  for (let f = first; f <= max; f++) {
    x += fretWeight(f) * unit;
    wire[f] = x;
  }
  const right = x;
  const width = right + MARGIN_X;
  const height = MARGIN_TOP + spacing * (o.strings - 1) + spacing + MARGIN_BOTTOM;
  const top = MARGIN_TOP + spacing / 2;
  const bottom = top + spacing * (o.strings - 1);

  const mirror = (v: number) => (o.leftHanded ? width - v : v);
  const rawSpan = (f: number): [number, number] => {
    if (f === 0) return [left, nutX ?? left];
    return [wire[f - 1] ?? left, wire[f] ?? right];
  };
  const cellSpan = (f: number): [number, number] => {
    const [a, b] = rawSpan(f);
    const [ma, mb] = [mirror(a), mirror(b)];
    return ma < mb ? [ma, mb] : [mb, ma];
  };
  const cellCenterX = (f: number) => {
    const [a, b] = rawSpan(f);
    // fingers sit closer to the higher fret wire
    return mirror(f === 0 ? (a + b) / 2 : a + (b - a) * 0.6);
  };
  const stringY = (i: number) => (o.lowestAtBottom ? bottom - i * spacing : top + i * spacing);

  return {
    width,
    height,
    boardLeft: Math.min(mirror(showOpen ? (nutX as number) : left), mirror(right)),
    boardRight: Math.max(mirror(showOpen ? (nutX as number) : left), mirror(right)),
    boardTop: top - spacing / 2 + 2,
    boardBottom: bottom + spacing / 2 - 2,
    nutX: nutX === null ? null : mirror(nutX),
    stringSpacing: spacing,
    fretWireX: (f) => mirror(wire[f] ?? right),
    cellCenterX,
    cellSpan,
    stringY,
    positionXY: (p) => ({ x: cellCenterX(p.fret), y: stringY(p.string) }),
    labelX: (f) => {
      const [a, b] = rawSpan(f);
      return mirror((a + b) / 2);
    },
  };
}

/** Fret-marker inlays: single dots and double dots (12, 24). */
export function inlayFrets(min: number, max: number): { fret: number; double: boolean }[] {
  const singles = [3, 5, 7, 9, 15, 17, 19, 21];
  const out: { fret: number; double: boolean }[] = [];
  for (let f = Math.max(1, min); f <= max; f++) {
    if (singles.includes(f)) out.push({ fret: f, double: false });
    else if (f === 12 || f === 24) out.push({ fret: f, double: true });
  }
  return out;
}
