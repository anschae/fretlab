import { pitchAt, samePosition, type Position } from "../../core/fretboard";
import { checkbox, field, segmented, select } from "../../ui/components/controls";
import { boardOptionsFromSettings, Fretboard, type FretMark } from "../../ui/components/Fretboard";
import { h } from "../../ui/dom";
import { fretOverrideControl, stringSelector, withShared } from "../shared/controls";
import { defineExercise, type PartialResult } from "../types";
import { checkFind, checkFindPartial, DEFAULTS, generateFindNote, type FindAnswer, type FindNoteSettings, type FindQuestion } from "./logic";

const messages = withShared({
  en: {
    "fn.title": "Find the note",
    "fn.description": "Click the note on the fretboard — on one string, everywhere, or against the clock.",
    "fn.mode": "Mode",
    "fn.mode.single": "On one string",
    "fn.mode.all": "Find all",
    "fn.mode.timed": "Timed",
    "fn.timedSeconds": "Duration",
    "fn.promptSingle": "Find {note} on {string}",
    "fn.promptAll": "Find every {note} between fret {from} and {to}",
    "fn.playOnClick": "Play the clicked note",
  },
  de: {
    "fn.title": "Ton finden",
    "fn.description": "Klicke den Ton auf dem Griffbrett – auf einer Saite, überall oder gegen die Uhr.",
    "fn.mode": "Modus",
    "fn.mode.single": "Auf einer Saite",
    "fn.mode.all": "Alle finden",
    "fn.mode.timed": "Auf Zeit",
    "fn.timedSeconds": "Dauer",
    "fn.promptSingle": "Finde {note} auf der {string}",
    "fn.promptAll": "Finde jedes {note} zwischen Bund {from} und {to}",
    "fn.playOnClick": "Angeklickten Ton spielen",
  },
});

export const fretboardFindNote = defineExercise<FindQuestion, FindAnswer, FindNoteSettings, Position>({
  kind: "exercise",
  id: "fretboard-find-note",
  titleKey: "fn.title",
  descriptionKey: "fn.description",
  category: "fretboard",
  answerModes: ["click"],
  defaultSettings: DEFAULTS,
  messages,

  renderSettings(container, s, onChange, ctx) {
    const t = ctx.t;
    const items = [
      field(
        t("fn.mode"),
        segmented(
          t("fn.mode"),
          (["single", "all", "timed"] as const).map((m) => ({ value: m, label: t(`fn.mode.${m}`) })),
          s.mode,
          (mode) => onChange({ ...s, mode }),
        ),
      ),
      s.mode === "timed"
        ? field(
            t("fn.timedSeconds"),
            select(
              [30, 60, 120].map((n) => ({ value: n, label: t("settings.seconds", { n }) })),
              s.timedSeconds,
              (n) => onChange({ ...s, timedSeconds: n }),
            ),
          )
        : null,
      stringSelector(ctx, s.strings, (strings) => onChange({ ...s, strings })),
      fretOverrideControl(ctx, s, (f) => onChange({ ...s, ...f })),
      checkbox(t("shared.naturalsOnly"), s.naturalsOnly, (v) => onChange({ ...s, naturalsOnly: v })),
      checkbox(t("fn.playOnClick"), s.playOnClick, (v) => onChange({ ...s, playOnClick: v })),
    ];
    for (const el of items) if (el) container.append(el);
  },

  generateQuestion: generateFindNote,
  checkAnswer: checkFind,
  checkPartial: checkFindPartial,
  statKey: (q) => q.key,
  session: (s) => (s.mode === "timed" ? { durationSec: s.timedSeconds } : {}),
  describeAnswer: (a, ctx) => {
    const list = Array.isArray(a) ? a : [a];
    return list
      .map((p) =>
        p.fret === 0
          ? ctx.t("fretboard.positionOpen", { string: ctx.names.string(ctx.tuning, p.string) })
          : ctx.t("fretboard.position", { string: ctx.names.string(ctx.tuning, p.string), fret: p.fret }),
      )
      .join(" · ");
  },

  renderQuestion(container, q, ctx, s) {
    const t = ctx.t;
    const note = ctx.names.pc(q.pc);
    const multi = q.kind === "all";
    const marks: FretMark[] = [];
    const board = new Fretboard(
      boardOptionsFromSettings(ctx.settings, ctx.tuning, t, {
        frets: q.frets,
        activeStrings: q.kind === "single" ? [q.string] : q.strings,
        stringLabel: (i) => ctx.names.pc((ctx.tuning.strings[i] ?? 0) % 12),
        isSelectable: (p) => (q.kind === "single" ? p.string === q.string : q.strings.includes(p.string)),
        onSelect: (p) => {
          if (s.playOnClick) {
            ctx.audio.stop();
            ctx.audio.playNote(pitchAt(ctx.tuning, p));
          }
          if (multi) ctx.input(p);
          else ctx.submit(p);
        },
      }),
    );
    const prompt =
      q.kind === "single"
        ? t("fn.promptSingle", { note: `<b>${note}</b>`, string: ctx.names.string(ctx.tuning, q.string) })
        : t("fn.promptAll", { note: `<b>${note}</b>`, from: q.frets.min, to: q.frets.max });
    const p = h("p", { class: "prompt" });
    // Bold the note name without using innerHTML on translated text
    prompt.split(/<b>|<\/b>/).forEach((part, i) => p.append(i % 2 ? h("strong", null, part) : part));
    container.append(p, h("p", { class: "rotate-hint muted" }, t("fretboard.rotate")), board.el);

    return {
      showPartial(r: PartialResult) {
        const fb = r.feedback as { input: Position; ok: boolean }[];
        const last = fb[fb.length - 1];
        if (!last) return;
        if (marks.some((m) => samePosition(m.pos, last.input))) return;
        marks.push({ pos: last.input, kind: last.ok ? "correct" : "wrong", label: ctx.names.pc(pitchAt(ctx.tuning, last.input) % 12) });
        board.setMarks(marks);
      },
      showResult(_result, given) {
        const clicked = given === null ? [] : Array.isArray(given) ? given : [given];
        const out: FretMark[] = [];
        for (const pos of q.targets) {
          const hit = clicked.some((c) => samePosition(c, pos));
          out.push({ pos, kind: hit ? "correct" : "hint", label: note });
        }
        for (const c of clicked) {
          if (!q.targets.some((tp) => samePosition(tp, c)))
            out.push({ pos: c, kind: "wrong", label: ctx.names.pc(pitchAt(ctx.tuning, c) % 12) });
        }
        board.setMarks(out);
      },
    };
  },
});
