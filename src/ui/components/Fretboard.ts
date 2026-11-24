import { samePosition, type FretRange, type Position } from "../../core/fretboard";
import type { Tuning } from "../../core/tuning";
import type { Translate } from "../../i18n";
import type { GlobalSettings } from "../../state/settings";
import { h, s, uid } from "../dom";
import { computeGeometry, inlayFrets, type Geometry } from "./fretboardGeometry";

export type MarkKind = "target" | "root" | "correct" | "wrong" | "hint" | "selected" | "note";

export interface FretMark {
  pos: Position;
  kind: MarkKind;
  /** text inside the dot (note name, degree, "R") */
  label?: string;
}

export interface FretboardOptions {
  tuning: Tuning;
  frets: FretRange;
  lowestAtBottom: boolean;
  leftHanded: boolean;
  markers: boolean;
  t: Translate;
  /** Note name for each open string (shown beside the nut). */
  stringLabel?: (index: number) => string;
  /** Accessible name for a position ("string 3 (G), fret 5"). */
  positionLabel?: (p: Position) => string;
  /** Clickable positions; omit for a display-only board. */
  onSelect?: (p: Position) => void;
  isSelectable?: (p: Position) => boolean;
  /** Strings not in this list are drawn faded (exercise string filters). */
  activeStrings?: readonly number[];
}

/** Builds board options from the global settings. */
export function boardOptionsFromSettings(
  s: GlobalSettings,
  tuning: Tuning,
  t: Translate,
  extra: Partial<FretboardOptions> = {},
): FretboardOptions {
  return {
    tuning,
    frets: s.frets,
    lowestAtBottom: s.fretboard.lowestAtBottom,
    leftHanded: s.fretboard.leftHanded,
    markers: s.fretboard.markers,
    t,
    ...extra,
  };
}

const SYMBOL: Partial<Record<MarkKind, string>> = { correct: "✓", wrong: "✗" };

/**
 * SVG fretboard for any tuning: wood, frets, inlays, strings of increasing
 * gauge, clickable cells (mouse, touch and keyboard via arrow keys + Enter),
 * and coloured marks that always carry a label or symbol, never colour alone.
 */
export class Fretboard {
  readonly el: HTMLElement;
  private svg!: SVGSVGElement;
  private marksLayer!: SVGGElement;
  private cursorEl!: SVGRectElement;
  private geo!: Geometry;
  private marks: FretMark[] = [];
  private cursor: Position | null = null;
  private readonly live = h("div", { class: "sr-only", "aria-live": "polite" });
  private readonly gradId = uid("wood");

  constructor(private opts: FretboardOptions) {
    this.el = h("div", { class: "fretboard-wrap" });
    this.el.addEventListener("keydown", (e) => this.onKey(e));
    this.render();
  }

  update(opts: Partial<FretboardOptions>): void {
    this.opts = { ...this.opts, ...opts };
    this.render();
  }

  setMarks(marks: FretMark[]): void {
    this.marks = marks;
    this.drawMarks();
  }

  addMark(mark: FretMark): void {
    this.marks = [...this.marks.filter((m) => !samePosition(m.pos, mark.pos)), mark];
    this.drawMarks();
  }

  clearMarks(): void {
    this.setMarks([]);
  }

  /** Scrolls a horizontally scrollable board so `p` is visible. */
  reveal(p: Position): void {
    const { x } = this.geo.positionXY(p);
    const box = this.svg.getBoundingClientRect();
    if (box.width === 0) return;
    const scale = box.width / this.geo.width;
    const target = x * scale - this.el.clientWidth / 2;
    if (this.el.scrollWidth > this.el.clientWidth) this.el.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
  }

  private selectable(p: Position): boolean {
    if (!this.opts.onSelect) return false;
    return this.opts.isSelectable ? this.opts.isSelectable(p) : true;
  }

  private posLabel(p: Position): string {
    if (this.opts.positionLabel) return this.opts.positionLabel(p);
    const t = this.opts.t;
    const n = this.opts.tuning.strings.length - p.string;
    const string = t("string.label", { n, note: this.opts.stringLabel?.(p.string) ?? "" }).replace(/ \(\)$/, "");
    return p.fret === 0 ? t("fretboard.positionOpen", { string }) : t("fretboard.position", { string, fret: p.fret });
  }

  /** Keyboard cursor start: the selectable cell closest to the middle of the board near fret 5. */
  private initialCursor(): Position {
    const o = this.opts;
    const n = o.tuning.strings.length;
    const goal = { string: (n - 1) / 2, fret: Math.max(o.frets.min, Math.min(o.frets.max, 5)) };
    let best: Position = { string: Math.floor(n / 2), fret: goal.fret };
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      for (let f = o.frets.min; f <= o.frets.max; f++) {
        const p = { string: i, fret: f };
        if (!this.selectable(p)) continue;
        const d = Math.abs(i - goal.string) * 3 + Math.abs(f - goal.fret);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best;
  }

  private render(): void {
    const o = this.opts;
    const n = o.tuning.strings.length;
    const g = (this.geo = computeGeometry({ strings: n, frets: o.frets, lowestAtBottom: o.lowestAtBottom, leftHanded: o.leftHanded }));
    const t = o.t;
    const interactive = !!o.onSelect;

    const svg = (this.svg = s("svg", {
      viewBox: `0 0 ${g.width.toFixed(1)} ${g.height.toFixed(1)}`,
      class: ["fretboard", interactive && "interactive"],
      role: "img",
      "aria-label": t("fretboard.label", { strings: n, from: o.frets.min, to: o.frets.max }),
      style: `min-width:${Math.round(Math.max(520, (o.frets.max - o.frets.min + 1) * 44))}px`,
    }));

    // Wood
    svg.append(
      s(
        "defs",
        null,
        s(
          "linearGradient",
          { id: this.gradId, x1: "0", y1: "0", x2: "0", y2: "1" },
          s("stop", { offset: "0", "stop-color": "#4a2c1a" }),
          s("stop", { offset: "0.5", "stop-color": "#3b2214" }),
          s("stop", { offset: "1", "stop-color": "#2e1a0f" }),
        ),
      ),
      s("rect", {
        x: g.boardLeft,
        y: g.boardTop,
        width: g.boardRight - g.boardLeft,
        height: g.boardBottom - g.boardTop,
        fill: `url(#${this.gradId})`,
        rx: 3,
      }),
    );

    // Inlays (between the middle strings; double dots at 12/24)
    if (o.markers) {
      // Dots sit *between* strings: centre on a half-string index
      const centre = (n - 1) / 2 + ((n - 1) % 2 === 0 ? 0.5 : 0);
      const yAt = (idx: number) => (g.stringY(Math.floor(idx)) + g.stringY(Math.ceil(idx))) / 2;
      const spread = n >= 8 ? 2 : 1;
      const r = Math.min(7, g.stringSpacing * 0.22);
      for (const { fret, double } of inlayFrets(o.frets.min, o.frets.max)) {
        const x = g.labelX(fret);
        if (double) {
          svg.append(
            s("circle", { cx: x, cy: yAt(centre - spread), r, class: "inlay" }),
            s("circle", { cx: x, cy: yAt(centre + spread), r, class: "inlay" }),
          );
        } else svg.append(s("circle", { cx: x, cy: yAt(centre), r, class: "inlay" }));
      }
    }

    // Nut + fret wires
    if (g.nutX !== null) svg.append(s("rect", { x: g.nutX - 4, y: g.boardTop - 2, width: 8, height: g.boardBottom - g.boardTop + 4, class: "nut", rx: 1.5 }));
    for (let f = Math.max(1, o.frets.min); f <= o.frets.max; f++) {
      const x = g.fretWireX(f);
      svg.append(s("rect", { x: x - 1.5, y: g.boardTop, width: 3, height: g.boardBottom - g.boardTop, class: "fret-wire" }));
    }
    if (o.frets.min > 0) {
      // left edge of a partial board: draw the previous fret wire too
      const [a] = g.cellSpan(o.frets.min);
      const edge = o.leftHanded ? g.cellSpan(o.frets.min)[1] : a;
      svg.append(s("rect", { x: edge - 1.5, y: g.boardTop, width: 3, height: g.boardBottom - g.boardTop, class: "fret-wire" }));
    }

    // Strings (lowest = thickest); faded if not active in the exercise
    const active = o.activeStrings ? new Set(o.activeStrings) : null;
    for (let i = 0; i < n; i++) {
      const y = g.stringY(i);
      const gauge = 1 + (2.6 * (n - 1 - i)) / Math.max(1, n - 1);
      const wound = i < n - 3;
      svg.append(
        s("line", {
          x1: g.boardLeft,
          x2: g.boardRight,
          y1: y,
          y2: y,
          class: ["string", wound && "wound", active && !active.has(i) && "inactive"],
          "stroke-width": gauge.toFixed(2),
        }),
      );
      if (o.stringLabel) {
        const lx = o.leftHanded ? g.width - 20 : 20;
        svg.append(s("text", { x: lx, y: y + 4, class: ["string-label", active && !active.has(i) && "inactive"], "text-anchor": "middle" }, o.stringLabel(i)));
      }
    }

    // Fret numbers
    for (let f = o.frets.min; f <= o.frets.max; f++) {
      if (f === 0) continue;
      const strong = [3, 5, 7, 9, 12, 15, 17, 19, 21, 24].includes(f);
      svg.append(s("text", { x: g.labelX(f), y: g.height - 8, class: ["fret-number", strong && "strong"], "text-anchor": "middle" }, String(f)));
    }

    // Click targets
    if (interactive) {
      const cells = s("g", { class: "cells" });
      for (let i = 0; i < n; i++) {
        for (let f = o.frets.min; f <= o.frets.max; f++) {
          const p = { string: i, fret: f };
          if (!this.selectable(p)) continue;
          const [a, b] = g.cellSpan(f);
          const y = g.stringY(i);
          const cell = s("rect", {
            x: a,
            y: y - g.stringSpacing / 2,
            width: b - a,
            height: g.stringSpacing,
            class: "cell",
            dataset: { s: String(i), f: String(f) },
          });
          cell.append(s("title", null, this.posLabel(p)));
          cells.append(cell);
        }
      }
      cells.addEventListener("click", (e) => {
        const target = e.target as SVGElement;
        const si = target.dataset?.s;
        const fi = target.dataset?.f;
        if (si === undefined || fi === undefined) return;
        const p = { string: Number(si), fret: Number(fi) };
        this.cursor = p;
        this.drawCursor(false);
        o.onSelect?.(p);
      });
      svg.append(cells);
    }

    this.marksLayer = s("g", { class: "marks" });
    svg.append(this.marksLayer);
    this.cursorEl = s("rect", { class: "kbd-cursor", rx: 6, visibility: "hidden" });
    svg.append(this.cursorEl);

    this.el.replaceChildren(svg, this.live);
    if (interactive) {
      this.el.tabIndex = 0;
      this.el.setAttribute("role", "application");
      this.el.setAttribute("aria-label", `${t("fretboard.label", { strings: n, from: o.frets.min, to: o.frets.max })}. ${t("fretboard.keys")}`);
    } else {
      this.el.removeAttribute("tabindex");
      this.el.removeAttribute("role");
    }
    this.drawMarks();
  }

  private drawMarks(): void {
    const g = this.geo;
    const layer = this.marksLayer;
    layer.replaceChildren();
    const r = Math.min(13, g.stringSpacing * 0.44);
    for (const m of this.marks) {
      if (m.pos.fret < this.opts.frets.min || m.pos.fret > this.opts.frets.max) continue;
      if (this.opts.tuning.strings[m.pos.string] === undefined) continue;
      const { x, y } = g.positionXY(m.pos);
      const grp = s("g", { class: ["mark", `mark-${m.kind}`], transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` });
      if (m.kind === "target") grp.append(s("circle", { r: r + 5, class: "pulse" }));
      grp.append(s("circle", { r }));
      const text = m.label ?? (m.kind === "target" ? "?" : "");
      if (text) grp.append(s("text", { y: 4.5, "text-anchor": "middle", class: text.length > 2 ? "small" : undefined }, text));
      const sym = SYMBOL[m.kind];
      if (sym) {
        grp.append(s("circle", { cx: r * 0.8, cy: -r * 0.8, r: 7, class: "sym-bg" }), s("text", { x: r * 0.8, y: -r * 0.8 + 3.5, "text-anchor": "middle", class: "sym" }, sym));
      }
      const desc = `${this.posLabel(m.pos)}${m.label ? `: ${m.label}` : ""}${sym ? ` ${sym}` : ""}`;
      grp.append(s("title", null, desc));
      layer.append(grp);
    }
  }

  // ------------------------------------------------------------ keyboard

  private drawCursor(show = true): void {
    if (!this.cursor || !show) {
      this.cursorEl.setAttribute("visibility", "hidden");
      return;
    }
    const g = this.geo;
    const [a, b] = g.cellSpan(this.cursor.fret);
    const y = g.stringY(this.cursor.string);
    this.cursorEl.setAttribute("x", String(a + 2));
    this.cursorEl.setAttribute("y", String(y - g.stringSpacing / 2 + 2));
    this.cursorEl.setAttribute("width", String(b - a - 4));
    this.cursorEl.setAttribute("height", String(g.stringSpacing - 4));
    this.cursorEl.setAttribute("visibility", "visible");
    this.live.textContent = this.posLabel(this.cursor);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.opts.onSelect) return;
    const o = this.opts;
    const n = o.tuning.strings.length;
    if (!this.cursor && e.key.startsWith("Arrow")) {
      // First arrow press only shows the cursor
      e.preventDefault();
      e.stopPropagation();
      this.cursor = this.initialCursor();
      this.drawCursor();
      this.reveal(this.cursor);
      return;
    }
    const c = this.cursor ?? this.initialCursor();
    let next: Position;
    const right = o.leftHanded ? -1 : 1;
    const up = o.lowestAtBottom ? 1 : -1;
    switch (e.key) {
      case "ArrowRight":
        next = { ...c, fret: c.fret + right };
        break;
      case "ArrowLeft":
        next = { ...c, fret: c.fret - right };
        break;
      case "ArrowUp":
        next = { ...c, string: c.string + up };
        break;
      case "ArrowDown":
        next = { ...c, string: c.string - up };
        break;
      case "Enter":
        if (this.cursor && this.selectable(this.cursor)) {
          e.preventDefault();
          e.stopPropagation();
          o.onSelect?.(this.cursor);
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    next = {
      string: Math.max(0, Math.min(n - 1, next.string)),
      fret: Math.max(o.frets.min, Math.min(o.frets.max, next.fret)),
    };
    this.cursor = next;
    this.drawCursor();
    this.reveal(next);
  }
}
