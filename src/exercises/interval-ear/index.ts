import { closestPair } from "../../core/fretboard";
import { getInterval, INTERVAL_PRESETS, INTERVALS } from "../../core/intervals";
import type { Midi } from "../../core/pitch";
import hintsData from "../../data/interval-hints.json";
import { AnswerButtons, indexKey } from "../../ui/components/AnswerButtons";
import { checkbox, checkboxGroup, field, segmented, slider } from "../../ui/components/controls";
import { boardOptionsFromSettings, Fretboard } from "../../ui/components/Fretboard";
import { h } from "../../ui/dom";
import { defineExercise, type AudioPort } from "../types";
import { checkInterval, DEFAULTS, generateIntervalQuestion, secondNote, type IntervalEarSettings, type IntervalQuestion } from "./logic";
import { messages } from "./messages";

type HintEntry = { en?: string; de?: string };
const hints = hintsData as unknown as Record<string, Record<string, HintEntry> | string>;

function hintFor(q: IntervalQuestion, lang: "en" | "de"): string | null {
  const table = hints[q.direction === "desc" ? "desc" : "asc"];
  if (!table || typeof table === "string") return null;
  const e = table[q.interval];
  return e ? (e[lang] ?? e.en ?? null) : null;
}

function play(audio: AudioPort, root: Midi, other: Midi, harmonic: boolean, gapMs: number): void {
  audio.stop();
  if (harmonic) audio.playChord([root, other], 0, audio.noteDuration * 1.4, 0);
  else audio.playSequence([root, other], gapMs / 1000, Math.max(audio.noteDuration, gapMs / 1000));
}

export const intervalEar = defineExercise<IntervalQuestion, string, IntervalEarSettings>({
  kind: "exercise",
  id: "interval-ear",
  titleKey: "ie.title",
  descriptionKey: "ie.description",
  category: "ear",
  answerModes: ["click"],
  needsAudio: true,
  defaultSettings: DEFAULTS,
  messages,

  renderSettings(container, s, onChange, ctx) {
    const t = ctx.t;
    const items = INTERVALS.filter((i) => i.semitones > 0).map((i) => ({ id: i.id, label: i.short }));
    container.append(
      field(
        t("ie.intervals"),
        checkboxGroup(
          items,
          s.intervals,
          (ids) => onChange({ ...s, intervals: ids }),
          { all: t("common.all"), none: t("common.none") },
          INTERVAL_PRESETS.map((p) => ({ label: t(p.labelKey), ids: p.intervals })),
        ),
      ),
      field(
        t("ie.direction"),
        segmented(
          t("ie.direction"),
          (["asc", "desc", "harmonic", "random"] as const).map((d) => ({ value: d, label: t(`direction.${d}`) })),
          s.direction,
          (d) => onChange({ ...s, direction: d }),
        ),
      ),
      field(t("ie.gap"), slider(s.gapMs, 250, 2000, 50, (v) => t("settings.ms", { n: v }), (v) => onChange({ ...s, gapMs: v }))),
      checkbox(t("ie.showOnFretboard"), s.showOnFretboard, (v) => onChange({ ...s, showOnFretboard: v })),
      checkbox(t("ie.showHints"), s.showHints, (v) => onChange({ ...s, showHints: v })),
    );
  },

  generateQuestion: generateIntervalQuestion,
  checkAnswer: checkInterval,
  statKey: (q) => q.interval,
  answerKey: (a) => a,
  describeAnswer: (a, ctx) => `${getInterval(a).short} (${ctx.t(getInterval(a).nameKey)})`,

  renderQuestion(container, q, ctx, s) {
    const t = ctx.t;
    const other = secondNote(q);
    const harmonic = q.direction === "harmonic";
    const playQ = () => play(ctx.audio, q.root, other, harmonic, s.gapMs);

    // Buttons in ascending order of size, for the selected intervals only
    const ids = INTERVALS.filter((i) => s.intervals.includes(i.id) && i.semitones > 0).map((i) => i.id);
    const buttons = new AnswerButtons(
      ids.map((id, i) => {
        const iv = getInterval(id);
        const k = indexKey(i);
        return { value: id, label: iv.short, sub: t(iv.nameKey), ariaLabel: t(iv.nameKey), keyHint: k?.hint, matches: k?.matches };
      }),
      (id) => ctx.submit(id),
      ctx.keys,
      { columns: Math.min(6, Math.max(3, ids.length <= 4 ? ids.length : 6)) },
    );

    const after = h("div", { class: "after-answer row wrap" });
    const boardBox = h("div", { class: "interval-board" });
    container.append(
      h("p", { class: "prompt" }, t("ie.prompt"), " ", h("span", { class: "muted" }, `(${t(`direction.${q.direction}`)})`)),
      h(
        "div",
        { class: "row wrap" },
        h("button", { type: "button", class: "btn", onClick: () => (ctx.audio.stop(), ctx.audio.playNote(q.root)) }, "♪ ", t("ie.playRoot")),
      ),
      buttons.el,
      after,
      boardBox,
    );
    // Small delay so a question change doesn't clip the previous release
    const timer = setTimeout(playQ, 120);

    return {
      replay: playQ,
      destroy: () => clearTimeout(timer),
      showResult(result, given) {
        buttons.lock();
        buttons.mark(q.interval, "correct");
        if (given && given !== q.interval) buttons.mark(given, "wrong");

        const correctName = getInterval(q.interval).short;
        after.append(h("button", { type: "button", class: "btn", onClick: playQ }, "↻ ", t("ie.playCorrect", { name: correctName })));
        if (given && given !== q.interval) {
          const g = getInterval(given);
          const chosenOther = q.direction === "desc" ? q.root - g.semitones : q.root + g.semitones;
          after.append(
            h("button", { type: "button", class: "btn", onClick: () => play(ctx.audio, q.root, chosenOther, harmonic, s.gapMs) }, "♪ ", t("ie.playChosen", { name: g.short })),
          );
        }
        if (s.showHints) {
          const hint = hintFor(q, ctx.language);
          if (hint) after.append(h("p", { class: "hint-line" }, "💡 ", t("ie.hint", { hint })));
        }
        if (s.showOnFretboard) {
          const pair = closestPair(ctx.tuning, q.root, other, { min: 0, max: Math.max(ctx.frets.max, 12) });
          if (pair) {
            const frets = { min: Math.max(0, Math.min(pair[0].fret, pair[1].fret) - 2), max: Math.max(pair[0].fret, pair[1].fret) + 2 };
            const board = new Fretboard(
              boardOptionsFromSettings(ctx.settings, ctx.tuning, t, {
                frets: { min: frets.min, max: Math.max(frets.max, frets.min + 4) },
                stringLabel: (i) => ctx.names.pc((ctx.tuning.strings[i] ?? 0) % 12),
              }),
            );
            board.setMarks([
              { pos: pair[0], kind: "root", label: ctx.names.pc(q.root % 12) },
              { pos: pair[1], kind: "note", label: ctx.names.pc(other % 12) },
            ]);
            boardBox.append(board.el);
          }
        }
        void result;
      },
    };
  },
});
