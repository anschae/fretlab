import { pitchAt, type Position } from "../../core/fretboard";
import type { PitchClass } from "../../core/pitch";
import { Scheduler, MAX_BPM, MIN_BPM, clampBpm } from "../../audio/Scheduler";
import { checkbox, field, segmented, select } from "../../ui/components/controls";
import { boardOptionsFromSettings, Fretboard, type FretMark } from "../../ui/components/Fretboard";
import { clear, h } from "../../ui/dom";
import { ALL_PCS } from "../../exercises/shared/controls";
import { defineTool, type ToolContext } from "../../exercises/types";
import {
  BPM_STEP,
  boardFrets,
  DEFAULTS,
  drillSequence,
  GOAL_BPM,
  nextInFourths,
  noteOfTheDay,
  recordBest,
  stepForBeat,
  type DrillSettings,
} from "./logic";

const messages = {
  en: {
    "nd.title": "One-note drill",
    "nd.description": "One note, every string, to a metronome. Play it, say its name, speed up.",
    "nd.how": "Play the highlighted note on each beat and say its name out loud. Don't look at the inlays — find it from the strings around it.",
    "nd.note": "Note",
    "nd.today": "Note of the day",
    "nd.nextFourth": "Next (circle of 4ths)",
    "nd.tempo": "Tempo",
    "nd.bpm": "{n} bpm",
    "nd.best": "best {n}",
    "nd.beatsPerNote": "Beats per note",
    "nd.zone": "Fret zone",
    "nd.zone.open": "0–11",
    "nd.zone.low": "1–12",
    "nd.zone.high": "12–23",
    "nd.direction": "Direction",
    "nd.direction.updown": "Up and back down",
    "nd.direction.up": "Low to high only",
    "nd.reveal": "Mode",
    "nd.reveal.show": "Show the position",
    "nd.reveal.test": "Test me (show it one step later)",
    "nd.countIn": "One bar count-in",
    "nd.playReference": "Play the note when it's shown (pitch check)",
    "nd.start": "Start",
    "nd.stop": "Stop",
    "nd.slower": "−{n}",
    "nd.faster": "+{n}",
    "nd.countingIn": "Count-in…",
    "nd.on": "on {string}",
    "nd.round": "Round",
    "nd.step": "String",
    "nd.saved": "Round done at {bpm} bpm — saved as your best for {note}.",
    "nd.goal": "{note} is solid at {bpm} bpm. Time to add the next note: {next}.",
    "nd.keys": "Space: start/stop · ←/→: tempo",
    "nd.noAudio": "No audio here — the drill runs silently (visual beat only).",
  },
  de: {
    "nd.title": "Ein-Ton-Drill",
    "nd.description": "Ein Ton, alle Saiten, zum Metronom. Spielen, Namen sagen, schneller werden.",
    "nd.how": "Spiele auf jeden Schlag den markierten Ton und sag seinen Namen laut. Nicht auf die Bundmarkierungen schauen – finde ihn über die Saiten daneben.",
    "nd.note": "Ton",
    "nd.today": "Ton des Tages",
    "nd.nextFourth": "Nächster (Quartenzirkel)",
    "nd.tempo": "Tempo",
    "nd.bpm": "{n} bpm",
    "nd.best": "Best {n}",
    "nd.beatsPerNote": "Schläge pro Ton",
    "nd.zone": "Bundbereich",
    "nd.zone.open": "0–11",
    "nd.zone.low": "1–12",
    "nd.zone.high": "12–23",
    "nd.direction": "Richtung",
    "nd.direction.updown": "Hoch und wieder runter",
    "nd.direction.up": "Nur von tief nach hoch",
    "nd.reveal": "Modus",
    "nd.reveal.show": "Position anzeigen",
    "nd.reveal.test": "Prüfen (Position einen Schritt später zeigen)",
    "nd.countIn": "Einen Takt einzählen",
    "nd.playReference": "Ton beim Anzeigen abspielen (Tonhöhe prüfen)",
    "nd.start": "Start",
    "nd.stop": "Stopp",
    "nd.slower": "−{n}",
    "nd.faster": "+{n}",
    "nd.countingIn": "Einzählen…",
    "nd.on": "auf der {string}",
    "nd.round": "Runde",
    "nd.step": "Saite",
    "nd.saved": "Runde bei {bpm} bpm geschafft – als Bestwert für {note} gespeichert.",
    "nd.goal": "{note} sitzt bei {bpm} bpm. Zeit für den nächsten Ton: {next}.",
    "nd.keys": "Leertaste: Start/Stopp · ←/→: Tempo",
    "nd.noAudio": "Hier gibt es keinen Ton – der Drill läuft stumm (nur visueller Takt).",
  },
};

const COUNT_IN_BEATS = 4;

export const noteDrill = defineTool({
  kind: "tool",
  id: "note-drill",
  titleKey: "nd.title",
  descriptionKey: "nd.description",
  category: "fretboard",
  messages,
  render: (container, ctx) => new NoteDrillView(container, ctx).destroy,
});

class NoteDrillView {
  private s: DrillSettings;
  private scheduler: Scheduler | null = null;
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  private sequence: Position[] = [];
  /** highest tempo at which a full round was played this run (0 = none yet) */
  private bestThisRun = 0;
  /** tempo when the current round started; a round only counts if it didn't change */
  private roundBpm = 0;
  private readonly root = h("div", { class: "note-drill" });
  private readonly settingsBox = h("div", { class: "exercise-settings-body" });
  private readonly status = h("div", { class: "drill-status", "aria-live": "polite" });
  private readonly message = h("p", { class: "feedback info", role: "status" });
  private readonly startBtn = h("button", { type: "button", class: "btn primary big" });
  private readonly tempoOut = h("output", { class: "drill-tempo" });
  private readonly beatDot = h("span", { class: "beat-dot", "aria-hidden": "true" });
  private board: Fretboard;

  constructor(
    container: HTMLElement,
    private readonly ctx: ToolContext,
  ) {
    const stored = ctx.load(DEFAULTS);
    this.s = { ...stored, bpm: clampBpm(stored.bpm), pc: stored.noteOfTheDay ? noteOfTheDay(new Date()) : stored.pc };
    const t = ctx.t;

    this.board = new Fretboard(this.boardOptions([]));
    this.startBtn.addEventListener("click", () => void this.toggle());

    const tempoRow = h(
      "div",
      { class: "row drill-tempo-row" },
      h("button", { type: "button", class: "btn", onClick: () => this.changeTempo(-BPM_STEP) }, t("nd.slower", { n: BPM_STEP })),
      this.tempoOut,
      this.beatDot,
      h("button", { type: "button", class: "btn", onClick: () => this.changeTempo(BPM_STEP) }, t("nd.faster", { n: BPM_STEP })),
    );

    this.root.append(
      h("h2", null, t("nd.title")),
      h("p", { class: "muted" }, t("nd.how")),
      this.status,
      h("p", { class: "rotate-hint muted" }, t("fretboard.rotate")),
      this.board.el,
      h("div", { class: "controls drill-controls" }, this.startBtn, tempoRow),
      h("p", { class: "keys-hint muted" }, t("nd.keys")),
      this.message,
      h("div", { class: "exercise-settings" }, this.settingsBox),
    );
    this.message.hidden = true;
    container.append(this.root);
    window.addEventListener("keydown", this.onKey);
    this.renderSettings();
    this.resetView();
  }

  destroy = (): void => {
    this.stop(true);
    window.removeEventListener("keydown", this.onKey);
    this.root.remove();
  };

  // ------------------------------------------------------------ state

  private update(patch: Partial<DrillSettings>, rerenderSettings = true): void {
    this.s = { ...this.s, ...patch };
    this.ctx.save(this.s);
    if (rerenderSettings) this.renderSettings();
    if (!this.running) this.resetView();
  }

  private get running(): boolean {
    return this.scheduler?.running ?? false;
  }

  private noteName(pc: PitchClass = this.s.pc): string {
    return this.ctx.names.pc(pc);
  }

  // ------------------------------------------------------------ view

  private boardOptions(activeStrings: readonly number[]) {
    const { ctx } = this;
    return boardOptionsFromSettings(ctx.settings, ctx.tuning, ctx.t, {
      frets: boardFrets(this.s.zone),
      // test mode hides the inlays: find the note from the strings, not the dots
      markers: this.s.reveal === "test" ? false : ctx.settings.fretboard.markers,
      activeStrings: activeStrings.length ? activeStrings : undefined,
      stringLabel: (i) => ctx.names.pc((ctx.tuning.strings[i] ?? 0) % 12),
    });
  }

  private resetView(): void {
    this.sequence = drillSequence(this.ctx.tuning, this.s.pc, this.s.zone, this.s.direction);
    this.board.update(this.boardOptions([]));
    // Idle: show where the note lives so the shape is visible before starting
    this.board.setMarks(this.s.reveal === "show" ? this.sequence.map((pos) => ({ pos, kind: "note" as const, label: this.noteName() })) : []);
    this.renderStatus(null);
    this.startBtn.textContent = `▶ ${this.ctx.t("nd.start")}`;
    this.tempoOut.textContent = this.ctx.t("nd.bpm", { n: this.s.bpm });
  }

  private renderStatus(info: { step: number; round: number } | "count" | null): void {
    const t = this.ctx.t;
    clear(this.status);
    const note = h("strong", { class: "drill-note" }, this.noteName());
    if (info === null || info === "count") {
      this.status.append(note);
      if (info === "count") this.status.append(h("span", { class: "muted" }, t("nd.countingIn")));
      return;
    }
    const pos = this.sequence[info.step];
    const stringName = pos ? this.ctx.names.string(this.ctx.tuning, pos.string) : "";
    this.status.append(
      note,
      h("span", { class: "drill-string" }, t("nd.on", { string: stringName })),
      h(
        "span",
        { class: "stats-bar" },
        h("span", { class: "stat" }, h("span", { class: "stat-label" }, t("nd.step")), h("span", { class: "stat-value" }, `${info.step + 1}/${this.sequence.length}`)),
        h("span", { class: "stat" }, h("span", { class: "stat-label" }, t("nd.round")), h("span", { class: "stat-value" }, String(info.round + 1))),
      ),
    );
  }

  /** Called on the beat (at the audible click), not when it was scheduled. */
  private showStep(step: number, round: number): void {
    const pos = this.sequence[step];
    if (!pos) return;
    const label = this.noteName();
    const test = this.s.reveal === "test";
    // Steps already played in this cycle stay visible, which draws the octave shapes
    const marks: FretMark[] = this.sequence.slice(0, step).map((p) => ({ pos: p, kind: "note", label }));
    if (!test) marks.push({ pos, kind: "target", label });
    this.board.update(this.boardOptions([pos.string]));
    this.board.setMarks(marks);
    this.board.reveal(pos);
    this.renderStatus({ step, round });
  }

  private flashBeat(accent: boolean): void {
    this.beatDot.classList.remove("on", "accent");
    void this.beatDot.offsetWidth; // restart the animation
    this.beatDot.classList.add("on");
    if (accent) this.beatDot.classList.add("accent");
  }

  private renderSettings(): void {
    const { t } = this.ctx;
    const s = this.s;
    clear(this.settingsBox);

    const today = noteOfTheDay(new Date());
    const notes = h(
      "div",
      { class: "note-picker", role: "radiogroup", "aria-label": t("nd.note") },
      ...ALL_PCS.map((pc) =>
        h(
          "button",
          {
            type: "button",
            role: "radio",
            "aria-checked": String(pc === s.pc),
            class: ["btn", "note-choice", pc === s.pc && "primary"],
            onClick: () => this.pickNote(pc, false),
          },
          h("span", null, this.ctx.names.button(pc)),
          (s.best[pc] ?? 0) > 0 ? h("small", null, t("nd.best", { n: s.best[pc] ?? 0 })) : pc === today ? h("small", null, "★") : null,
        ),
      ),
    );

    this.settingsBox.append(
      field(t("nd.note"), notes),
      h(
        "div",
        { class: "row wrap" },
        h("button", { type: "button", class: "btn small ghost", onClick: () => this.pickNote(today, true) }, `★ ${t("nd.today")}: ${this.noteName(today)}`),
        h("button", { type: "button", class: "btn small ghost", onClick: () => this.pickNote(nextInFourths(s.pc), false) }, `${t("nd.nextFourth")} → ${this.noteName(nextInFourths(s.pc))}`),
      ),
      field(
        t("nd.reveal"),
        segmented(t("nd.reveal"), (["show", "test"] as const).map((v) => ({ value: v, label: t(`nd.reveal.${v}`) })), s.reveal, (reveal) => this.update({ reveal })),
      ),
      field(
        t("nd.zone"),
        segmented(t("nd.zone"), (["open", "low", "high"] as const).map((v) => ({ value: v, label: t(`nd.zone.${v}`) })), s.zone, (zone) => this.update({ zone })),
      ),
      field(
        t("nd.direction"),
        select((["updown", "up"] as const).map((v) => ({ value: v, label: t(`nd.direction.${v}`) })), s.direction, (direction) => this.update({ direction })),
      ),
      field(
        t("nd.beatsPerNote"),
        segmented(t("nd.beatsPerNote"), [1, 2, 4].map((v) => ({ value: v, label: String(v) })), s.beatsPerNote, (beatsPerNote) => this.update({ beatsPerNote })),
      ),
      checkbox(t("nd.countIn"), s.countIn, (countIn) => this.update({ countIn }, false)),
      checkbox(t("nd.playReference"), s.playReference, (playReference) => this.update({ playReference }, false)),
    );
    // Changing these mid-run would scramble the sequence
    for (const el of this.settingsBox.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input, button, select")) el.disabled = this.running;
  }

  private pickNote(pc: PitchClass, noteOfTheDayMode: boolean): void {
    if (this.running) return;
    this.message.hidden = true;
    this.update({ pc, noteOfTheDay: noteOfTheDayMode });
  }

  // ------------------------------------------------------------ transport

  private async toggle(): Promise<void> {
    if (this.running) this.stop(true);
    else await this.start();
  }

  private async start(): Promise<void> {
    const audioOk = await this.ctx.unlockAudio();
    if (this.running) return;
    const { audio } = this.ctx;
    this.resetView();
    this.message.hidden = true;
    if (!audioOk) this.say(this.ctx.t("nd.noAudio"));
    if (this.sequence.length === 0) return;

    this.bestThisRun = 0;
    this.roundBpm = this.s.bpm;
    const clock = audioOk ? { now: () => audio.now() } : { now: () => performance.now() / 1000 };
    const countInBeats = this.s.countIn ? COUNT_IN_BEATS : 0;
    const layout = { countInBeats, beatsPerNote: this.s.beatsPerNote, length: this.sequence.length };

    this.scheduler = new Scheduler({
      clock,
      bpm: this.s.bpm,
      onBeat: (time, beat) => {
        const st = stepForBeat(beat, layout);
        const accent = st ? st.firstBeatOfStep && st.step === 0 : beat === 0;
        if (audioOk) audio.click(time, accent);
        const pos = st ? this.sequence[st.step] : undefined;
        if (st && pos && st.firstBeatOfStep && this.s.playReference && audioOk) {
          // In test mode the reference sounds when the answer is shown: one step later
          const delay = time - clock.now() + (this.s.reveal === "test" ? this.s.beatsPerNote * (this.scheduler?.beatLength ?? 1) : 0);
          audio.playNote(pitchAt(this.ctx.tuning, pos), Math.max(0, delay - 0.03));
        }
        this.at(time - clock.now(), () => {
          this.flashBeat(accent);
          if (!st) return this.renderStatus("count");
          if (!st.firstBeatOfStep) return;
          if (st.step === 0) {
            if (st.round > 0 && this.roundBpm === this.s.bpm) this.bestThisRun = Math.max(this.bestThisRun, this.s.bpm);
            this.roundBpm = this.s.bpm;
          }
          this.showStep(st.step, st.round);
        });
      },
    });
    this.scheduler.start();
    this.startBtn.textContent = `■ ${this.ctx.t("nd.stop")}`;
    this.renderSettings();
  }

  private stop(record: boolean): void {
    if (!this.scheduler) return;
    this.scheduler?.stop();
    this.scheduler = null;
    for (const id of this.timeouts) clearTimeout(id);
    this.timeouts.clear();
    if (record && this.bestThisRun > 0) this.saveBest(this.bestThisRun);
    if (record) {
      this.renderSettings();
      this.resetView();
    }
  }

  private saveBest(bpm: number): void {
    const { t } = this.ctx;
    const before = this.s.best[this.s.pc] ?? 0;
    if (bpm <= before) return;
    this.update({ best: recordBest(this.s.best, this.s.pc, bpm) }, false);
    this.say(
      bpm >= GOAL_BPM
        ? t("nd.goal", { note: this.noteName(), bpm, next: this.noteName(nextInFourths(this.s.pc)) })
        : t("nd.saved", { bpm, note: this.noteName() }),
    );
  }

  private changeTempo(delta: number): void {
    const bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, this.s.bpm + delta));
    // The round in progress no longer counts (see roundBpm)
    this.roundBpm = 0;
    this.scheduler?.setTempo(bpm);
    this.update({ bpm }, false);
    this.tempoOut.textContent = this.ctx.t("nd.bpm", { n: bpm });
  }

  private at(delaySec: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      fn();
    }, Math.max(0, delaySec * 1000));
    this.timeouts.add(id);
  }

  private say(text: string): void {
    this.message.textContent = text;
    this.message.hidden = false;
  }

  private onKey = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    if (target && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(target.tagName)) return;
    if (e.key === " ") {
      e.preventDefault();
      void this.toggle();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      this.changeTempo(BPM_STEP);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      this.changeTempo(-BPM_STEP);
    }
  };
}
