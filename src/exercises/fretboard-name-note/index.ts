import { pitchClass, type PitchClass } from "../../core/pitch";
import { checkbox, field, segmented } from "../../ui/components/controls";
import { boardOptionsFromSettings, Fretboard } from "../../ui/components/Fretboard";
import { h } from "../../ui/dom";
import { ALL_PCS, effectiveFrets, fretOverrideControl, NATURAL_PC_LIST, noteButtons, stringSelector, withShared } from "../shared/controls";
import { defineExercise } from "../types";
import { checkNameNote, DEFAULTS, generateNameNote, type NameNoteQuestion, type NameNoteSettings } from "./logic";
import { resolveStrings } from "../../core/fretboard";

const messages = withShared({
  en: {
    "nn.title": "Name the note",
    "nn.description": "A position is marked on the fretboard — which note is it?",
    "nn.prompt": "Which note is marked?",
    "nn.play": "Play the note",
    "nn.play.never": "Never",
    "nn.play.question": "With the question",
    "nn.play.answer": "After answering",
  },
  de: {
    "nn.title": "Ton benennen",
    "nn.description": "Eine Position ist markiert – welcher Ton ist das?",
    "nn.prompt": "Welcher Ton ist markiert?",
    "nn.play": "Ton abspielen",
    "nn.play.never": "Nie",
    "nn.play.question": "Mit der Frage",
    "nn.play.answer": "Nach der Antwort",
  },
});

export const fretboardNameNote = defineExercise<NameNoteQuestion, PitchClass, NameNoteSettings>({
  kind: "exercise",
  id: "fretboard-name-note",
  titleKey: "nn.title",
  descriptionKey: "nn.description",
  category: "fretboard",
  answerModes: ["click"],
  defaultSettings: DEFAULTS,
  messages,

  renderSettings(container, s, onChange, ctx) {
    const t = ctx.t;
    container.append(
      stringSelector(ctx, s.strings, (strings) => onChange({ ...s, strings })),
      fretOverrideControl(ctx, s, (f) => onChange({ ...s, ...f })),
      checkbox(t("shared.naturalsOnly"), s.naturalsOnly, (v) => onChange({ ...s, naturalsOnly: v })),
      field(
        t("nn.play"),
        segmented(
          t("nn.play"),
          (["never", "question", "answer"] as const).map((v) => ({ value: v, label: t(`nn.play.${v}`) })),
          s.play,
          (v) => onChange({ ...s, play: v }),
        ),
      ),
    );
  },

  generateQuestion: generateNameNote,
  checkAnswer: checkNameNote,
  statKey: (q) => q.key,
  describeAnswer: (a, ctx) => ctx.names.pc(a),

  renderQuestion(container, q, ctx, s) {
    const t = ctx.t;
    const frets = effectiveFrets(ctx, s);
    const board = new Fretboard(
      boardOptionsFromSettings(ctx.settings, ctx.tuning, t, {
        frets,
        activeStrings: resolveStrings(ctx.tuning, s.strings),
        stringLabel: (i) => ctx.names.pc((ctx.tuning.strings[i] ?? 0) % 12),
      }),
    );
    board.setMarks([{ pos: q.pos, kind: "target" }]);
    const pcs = s.naturalsOnly ? NATURAL_PC_LIST : ALL_PCS;
    const buttons = noteButtons(pcs, ctx.names, ctx.settings.notation.system, ctx.keys, (pc) => ctx.submit(pc));
    container.append(
      h("p", { class: "prompt" }, t("nn.prompt"), " ", h("span", { class: "muted" }, ctx.names.string(ctx.tuning, q.pos.string))),
      h("p", { class: "rotate-hint muted" }, t("fretboard.rotate")),
      board.el,
      buttons.el,
    );
    requestAnimationFrame(() => board.reveal(q.pos));
    const playIt = () => {
      ctx.audio.stop();
      ctx.audio.playNote(q.midi);
    };
    if (s.play === "question") playIt();

    return {
      replay: s.play === "never" ? undefined : playIt,
      showResult(result, given) {
        buttons.lock();
        const correct = pitchClass(q.midi);
        buttons.mark(correct, "correct");
        if (given !== null && given !== correct) buttons.mark(given, "wrong");
        board.setMarks([{ pos: q.pos, kind: result.correct ? "correct" : "wrong", label: ctx.names.pc(correct) }]);
        if (s.play === "answer") playIt();
      },
    };
  },
});
