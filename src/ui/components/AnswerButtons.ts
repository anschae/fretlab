import type { KeyBindings } from "../../exercises/types";
import { h } from "../dom";

export interface AnswerItem<T> {
  value: T;
  label: string;
  /** shown as a small key hint ("1", "C", "⇧C") */
  keyHint?: string;
  /** key matcher; defaults to none */
  matches?: (e: KeyboardEvent) => boolean;
  ariaLabel?: string;
}

export type MarkState = "correct" | "wrong" | "chosen" | "dim";

const SYMBOL: Record<MarkState, string> = { correct: "✓", wrong: "✗", chosen: "", dim: "" };

/**
 * A grid of answer buttons with keyboard shortcuts. Correct/wrong are shown
 * by colour *and* a ✓/✗ symbol (never colour alone).
 */
export class AnswerButtons<T> {
  readonly el: HTMLElement;
  private buttons: { item: AnswerItem<T>; btn: HTMLButtonElement; mark: HTMLSpanElement }[] = [];
  private locked = false;

  constructor(
    items: AnswerItem<T>[],
    private readonly onPick: (value: T) => void,
    keys?: KeyBindings,
    opts: { columns?: number; className?: string } = {},
  ) {
    this.el = h("div", { class: ["answer-grid", opts.className], role: "group", style: opts.columns ? `--cols:${opts.columns}` : undefined });
    for (const item of items) {
      const mark = h("span", { class: "mark", "aria-hidden": "true" });
      const btn = h(
        "button",
        { type: "button", class: "answer", "aria-label": item.ariaLabel ?? item.label, onClick: () => this.pick(item.value) },
        h("span", { class: "answer-label" }, item.label),
        item.keyHint ? h("kbd", { "aria-hidden": "true" }, item.keyHint) : null,
        mark,
      );
      this.buttons.push({ item, btn, mark });
      this.el.append(btn);
      if (keys && item.matches) keys.bind(item.matches, () => this.pick(item.value));
    }
  }

  private pick(value: T): void {
    if (this.locked) return;
    this.onPick(value);
  }

  lock(): void {
    this.locked = true;
    this.el.classList.add("locked");
  }

  mark(value: T, state: MarkState, eq: (a: T, b: T) => boolean = Object.is): void {
    for (const b of this.buttons) {
      if (!eq(b.item.value, value)) continue;
      b.btn.classList.add(state);
      b.mark.textContent = SYMBOL[state];
      if (state === "correct" || state === "wrong") {
        const extra = state === "correct" ? "✓" : "✗";
        b.btn.setAttribute("aria-label", `${b.item.ariaLabel ?? b.item.label} ${extra}`);
      }
    }
  }

  focusFirst(): void {
    this.buttons[0]?.btn.focus();
  }
}

/** Key matchers ------------------------------------------------------- */

const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable);
};

/** Digit keys 1–9, 0, then -, = for buttons 11 and 12. */
export function indexKey(i: number): { hint: string; matches: (e: KeyboardEvent) => boolean } | undefined {
  const codes = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0", "Minus", "Equal"];
  const hints = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="];
  const code = codes[i];
  if (!code) return undefined;
  return {
    hint: hints[i] ?? "",
    matches: (e) => !isTyping(e) && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && (e.code === code || e.code === `Numpad${hints[i]}`),
  };
}

/**
 * Note-letter keys: letter = natural, Shift+letter = sharp, Alt/Option+letter = flat.
 * In German notation "H" is B natural and "B" is B♭.
 */
export function noteKey(pc: number, system: "en" | "de"): { hint: string; matches: (e: KeyboardEvent) => boolean } {
  const naturals: Record<number, string> = { 0: "c", 2: "d", 4: "e", 5: "f", 7: "g", 9: "a", 11: system === "de" ? "h" : "b" };
  const letterOf = (e: KeyboardEvent) => (e.code.startsWith("Key") ? e.code.slice(3).toLowerCase() : e.key.toLowerCase());
  const plain = (e: KeyboardEvent) => !isTyping(e) && !e.ctrlKey && !e.metaKey;
  const nat = naturals[pc];
  if (nat) {
    // German: plain "b" means B♭
    return { hint: nat.toUpperCase(), matches: (e) => plain(e) && !e.shiftKey && !e.altKey && letterOf(e) === nat };
  }
  const below = naturals[(pc + 11) % 12] as string; // sharp of the note below
  const above = naturals[(pc + 1) % 12] as string; // flat of the note above
  const deBflat = system === "de" && pc === 10;
  return {
    hint: `⇧${below.toUpperCase()}`,
    matches: (e) =>
      plain(e) &&
      ((e.shiftKey && !e.altKey && letterOf(e) === below) ||
        (e.altKey && !e.shiftKey && letterOf(e) === above) ||
        (deBflat && !e.shiftKey && !e.altKey && letterOf(e) === "b")),
  };
}
