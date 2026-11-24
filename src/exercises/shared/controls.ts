import { stringNumber } from "../../core/fretboard";
import type { FretOverride } from "./frets";
export { effectiveFrets, type FretOverride } from "./frets";
import type { PitchClass } from "../../core/pitch";
import { AnswerButtons, noteKey, type AnswerItem } from "../../ui/components/AnswerButtons";
import { checkbox, checkboxGroup, field, fretRangeInput } from "../../ui/components/controls";
import { h } from "../../ui/dom";
import type { KeyBindings, NoteNamer, SettingsContext } from "../types";

/**
 * Building blocks shared by fretboard exercises (settings widgets, note
 * answer buttons). Exercises import these; they never depend on each other.
 */

/** String selection stored as guitarist numbers (1 = highest), so it survives tuning changes. */
export function stringSelector(ctx: SettingsContext, selected: readonly number[], onChange: (numbers: number[]) => void): HTMLElement {
  const { tuning, t, names } = ctx;
  const n = tuning.strings.length;
  const items = tuning.strings
    .map((_, i) => ({ id: String(stringNumber(tuning, i)), label: names.string(tuning, i) }))
    .reverse(); // string 1 first
  const presets: { label: string; ids: string[] }[] = [];
  if (n > 6) {
    const label = n === 7 ? t("shared.lowString7") : t("shared.lowStrings", { max: n });
    presets.push({ label, ids: Array.from({ length: n - 6 }, (_, k) => String(7 + k)) });
  }
  presets.push({ label: t("shared.top3"), ids: ["1", "2", "3"] });
  const sel = selected.length ? selected.map(String) : items.map((i) => i.id);
  return field(
    t("shared.strings"),
    checkboxGroup(items, sel, (ids) => onChange(ids.length === items.length ? [] : ids.map(Number)), { all: t("common.all"), none: t("common.none") }, presets),
    t("shared.stringsHint"),
  );
}

export function fretOverrideControl(ctx: SettingsContext, s: FretOverride, onChange: (s: FretOverride) => void): HTMLElement {
  const t = ctx.t;
  const range = fretRangeInput(s.useGlobalFrets ? ctx.settings.frets : s.frets, (r) => onChange({ useGlobalFrets: false, frets: r }), {
    from: t("settings.fretFrom"),
    to: t("settings.fretTo"),
  });
  return h(
    "div",
    { class: "field" },
    h("label", null, t("settings.fretRange")),
    checkbox(t("shared.useGlobalFrets", { from: ctx.settings.frets.min, to: ctx.settings.frets.max }), s.useGlobalFrets, (v) =>
      onChange({ useGlobalFrets: v, frets: v ? s.frets : ctx.settings.frets }),
    ),
    s.useGlobalFrets ? null : range,
  );
}

/** 12 (or 7) note-name buttons with letter shortcuts. */
export function noteButtons(
  pcs: readonly PitchClass[],
  names: NoteNamer,
  system: "en" | "de",
  keys: KeyBindings,
  onPick: (pc: PitchClass) => void,
): AnswerButtons<PitchClass> {
  const items: AnswerItem<PitchClass>[] = pcs.map((pc) => {
    const k = noteKey(pc, system);
    return { value: pc, label: names.button(pc), keyHint: k.hint, matches: k.matches };
  });
  return new AnswerButtons(items, onPick, keys, { columns: pcs.length > 7 ? 6 : 7, className: "note-grid" });
}

export const ALL_PCS: readonly PitchClass[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const NATURAL_PC_LIST: readonly PitchClass[] = [0, 2, 4, 5, 7, 9, 11];

export const sharedMessages = {
  en: {
    "shared.strings": "Strings",
    "shared.stringsHint": "Only these strings are used in questions.",
    "shared.lowStrings": "Strings 7–{max}",
    "shared.lowString7": "String 7 only",
    "shared.top3": "Strings 1–3",
    "shared.useGlobalFrets": "Use global range ({from}–{to})",
    "shared.naturalsOnly": "Natural notes only (no ♯/♭)",
  },
  de: {
    "shared.strings": "Saiten",
    "shared.stringsHint": "Nur diese Saiten kommen in den Fragen vor.",
    "shared.lowStrings": "Saiten 7–{max}",
    "shared.lowString7": "Nur 7. Saite",
    "shared.top3": "Saiten 1–3",
    "shared.useGlobalFrets": "Globalen Bereich verwenden ({from}–{to})",
    "shared.naturalsOnly": "Nur Stammtöne (ohne ♯/♭)",
  },
};

/** Combines message dictionaries (shared + exercise-specific). */
export function withShared(own: { en: Record<string, string>; de?: Record<string, string> }): { en: Record<string, string>; de: Record<string, string> } {
  return { en: { ...sharedMessages.en, ...own.en }, de: { ...sharedMessages.de, ...(own.de ?? {}) } };
}
