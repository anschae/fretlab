import { createRng, type Rng } from "../../core/random";
import {
  NoQuestionError,
  type AnyExercise,
  type CheckResult,
  type KeyBindings,
  type PartialResult,
  type QuestionView,
  type RenderContext,
} from "../../exercises/types";
import type { Services } from "../../services";
import { Feedback } from "../components/Feedback";
import { h, clear } from "../dom";

interface Binding {
  match: (e: KeyboardEvent) => boolean;
  handler: (e: KeyboardEvent) => void;
}

/**
 * Generic exercise flow shared by every quiz: next question, score, streak,
 * replay, show solution, partial answers, auto-advance, timed sessions,
 * keyboard shortcuts and statistics recording. Exercises only generate,
 * render and check questions.
 */
export class ExerciseRunner {
  readonly el: HTMLElement;
  private readonly questionEl = h("div", { class: "question" });
  private readonly feedback = new Feedback();
  private readonly statsEl = h("div", { class: "stats-bar", "aria-live": "off" });
  private readonly settingsEl = h("div", { class: "exercise-settings", hidden: true });
  private readonly controlsEl = h("div", { class: "controls" });
  private readonly replayBtn: HTMLButtonElement;
  private readonly solutionBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly settingsBtn: HTMLButtonElement;

  private rng: Rng = createRng();
  private settings: unknown;
  private question: unknown = undefined;
  private view: QuestionView<unknown> | null = null;
  private bindings: Binding[] = [];
  private inputs: unknown[] = [];
  private answered = false;
  private startedAt = 0;
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;

  private score = { correct: 0, total: 0, streak: 0, best: 0 };
  private session: { durationSec: number; endsAt: number; timer: ReturnType<typeof setInterval> | null; running: boolean } | null = null;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);
  /** Fired by the "tap to start" overlay: play the pending question now. */
  private readonly onAudioReady = () => this.replay();
  private unsub: (() => void)[] = [];

  constructor(
    private readonly exercise: AnyExercise,
    private readonly app: Services,
  ) {
    const t = app.t;
    this.settings = app.exerciseSettings(exercise.id, exercise.defaultSettings);
    this.replayBtn = h("button", { type: "button", class: "btn", onClick: () => this.replay(), "aria-keyshortcuts": "Space" }, "↻ ", t("runner.replay"));
    this.solutionBtn = h("button", { type: "button", class: "btn ghost", onClick: () => this.giveUp(), "aria-keyshortcuts": "Escape" }, t("runner.showSolution"));
    this.nextBtn = h("button", { type: "button", class: "btn primary", onClick: () => this.next(), "aria-keyshortcuts": "Enter" }, t("runner.next"), " →");
    this.settingsBtn = h(
      "button",
      { type: "button", class: "btn ghost", "aria-expanded": "false", onClick: () => this.toggleSettings() },
      "⚙ ",
      h("span", { class: "btn-label" }, t("runner.settings")),
    );
    this.settingsBtn.setAttribute("aria-label", t("runner.settings"));
    this.controlsEl.append(this.replayBtn, this.solutionBtn, this.nextBtn);

    this.el = h(
      "div",
      { class: "runner" },
      h(
        "header",
        { class: "runner-head" },
        h("div", null, h("h2", null, t(exercise.titleKey)), exercise.descriptionKey ? h("p", { class: "muted" }, t(exercise.descriptionKey)) : null),
        this.settingsBtn,
      ),
      this.settingsEl,
      this.statsEl,
      this.questionEl,
      this.feedback.el,
      this.controlsEl,
      h("p", { class: "keys-hint muted" }, t("runner.keysHint")),
    );
  }

  mount(container: HTMLElement): void {
    container.append(this.el);
    document.addEventListener("keydown", this.onKey);
    window.addEventListener("fretlab:audio-ready", this.onAudioReady);
    // Global settings (tuning, notation, frets …) change → fresh question
    this.unsub.push(this.app.onSettingsChange(() => this.restart()));
    this.restart();
  }

  destroy(): void {
    document.removeEventListener("keydown", this.onKey);
    window.removeEventListener("fretlab:audio-ready", this.onAudioReady);
    for (const u of this.unsub) u();
    this.clearQuestion();
    this.stopSession();
    this.el.remove();
  }

  // ---------------------------------------------------------------- settings

  private toggleSettings(force?: boolean): void {
    const open = force ?? this.settingsEl.hidden;
    this.settingsEl.hidden = !open;
    this.settingsBtn.setAttribute("aria-expanded", String(open));
    if (open) this.renderSettings();
  }

  private renderSettings(): void {
    clear(this.settingsEl);
    const body = h("div", { class: "exercise-settings-body" });
    this.exercise.renderSettings(
      body,
      this.settings,
      (s: unknown) => {
        this.settings = s;
        this.app.setExerciseSettings(this.exercise.id, s);
        this.restart(false);
      },
      { t: this.app.t, tuning: this.app.tuning, settings: this.app.settings, names: this.app.names() },
    );
    this.settingsEl.append(
      body,
      h("div", { class: "row end" }, h("button", { type: "button", class: "btn", onClick: () => this.toggleSettings(false) }, this.app.t("runner.closeSettings"))),
    );
  }

  // ---------------------------------------------------------------- flow

  /** Resets the session and shows a new question (or the timed-session start screen). */
  private restart(rerenderSettings = true): void {
    this.stopSession();
    this.score = { correct: 0, total: 0, streak: 0, best: 0 };
    this.question = undefined;
    if (rerenderSettings && !this.settingsEl.hidden) this.renderSettings();
    const dur = this.exercise.session?.(this.settings)?.durationSec;
    if (dur) {
      this.session = { durationSec: dur, endsAt: 0, timer: null, running: false };
      this.showSessionStart();
    } else {
      this.next();
    }
  }

  private showSessionStart(): void {
    this.clearQuestion();
    this.feedback.clear();
    this.renderStats();
    const t = this.app.t;
    const start = h("button", { type: "button", class: "btn primary big", onClick: () => this.startSession() }, "▶ ", t("runner.start"));
    this.questionEl.append(h("div", { class: "session-start" }, h("p", null, t("runner.timeLeft"), `: ${this.session?.durationSec ?? 0} s`), start));
    this.setButtons({ replay: false, solution: false, next: false });
    start.focus();
  }

  private startSession(): void {
    if (!this.session) return;
    this.score = { correct: 0, total: 0, streak: 0, best: 0 };
    this.session.running = true;
    this.session.endsAt = performance.now() + this.session.durationSec * 1000;
    this.session.timer = setInterval(() => {
      if (!this.session) return;
      if (performance.now() >= this.session.endsAt) this.endSession();
      else this.renderStats();
    }, 200);
    this.next();
  }

  private endSession(): void {
    if (!this.session) return;
    const dur = this.session.durationSec;
    this.stopSession();
    this.session = { durationSec: dur, endsAt: 0, timer: null, running: false };
    this.clearQuestion();
    const t = this.app.t;
    this.feedback.show("info", t("runner.timeUp"), [t("runner.sessionResult", { correct: this.score.correct, total: this.score.total, seconds: dur })]);
    const again = h("button", { type: "button", class: "btn primary big", onClick: () => this.startSession() }, "↻ ", t("runner.again"));
    this.questionEl.append(h("div", { class: "session-start" }, again));
    this.setButtons({ replay: false, solution: false, next: false });
    this.renderStats();
    again.focus();
  }

  private stopSession(): void {
    if (this.session?.timer) clearInterval(this.session.timer);
    this.session = null;
  }

  private clearQuestion(): void {
    if (this.advanceTimer) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.view?.destroy?.();
    this.view = null;
    this.bindings = [];
    this.app.audio.stopAll();
    clear(this.questionEl);
  }

  next(): void {
    if (this.session && !this.session.running) return;
    this.clearQuestion();
    this.feedback.clear();
    this.inputs = [];
    this.answered = false;

    const ctx = this.makeContext();
    let q: unknown;
    try {
      q = this.exercise.generateQuestion(ctx, this.settings);
    } catch (e) {
      if (e instanceof NoQuestionError) {
        this.feedback.show("info", this.app.t("runner.noQuestion"));
        this.setButtons({ replay: false, solution: false, next: false });
        this.renderStats();
        return;
      }
      throw e;
    }
    this.question = q;
    this.view = this.exercise.renderQuestion(this.questionEl, q, ctx, this.settings);
    this.startedAt = performance.now();
    this.setButtons({ replay: !!this.view.replay, solution: true, next: false });
    this.renderStats();
  }

  replay(): void {
    this.view?.replay?.();
  }

  giveUp(): void {
    if (this.answered || this.question === undefined) return;
    if (this.exercise.checkPartial) this.finish(this.inputs, true);
    else this.finish(null, true);
  }

  private submit(answer: unknown): void {
    if (this.answered) return;
    this.finish(answer, false);
  }

  private input(p: unknown): void {
    if (this.answered || !this.exercise.checkPartial) return;
    this.inputs.push(p);
    const r: PartialResult = this.exercise.checkPartial(this.question, this.inputs);
    this.view?.showPartial?.(r);
    const t = this.app.t;
    const lines = r.mistakes ? [t("runner.mistakes", { n: r.mistakes })] : [];
    if (!r.complete) this.feedback.show("info", t("runner.progress", { found: r.found, total: r.total }), lines);
    else this.finish(this.inputs, false);
  }

  private finish(answer: unknown, gaveUp: boolean): void {
    if (this.question === undefined) return;
    this.answered = true;
    const ms = performance.now() - this.startedAt;
    const q = this.question;
    const ex = this.exercise;
    const t = this.app.t;
    const result: CheckResult<unknown> =
      answer === null && !ex.checkPartial ? { ...ex.checkAnswer(q, undefined), correct: false } : ex.checkAnswer(q, answer);
    const correct = result.correct && !gaveUp;

    this.score.total++;
    if (correct) {
      this.score.correct++;
      this.score.streak++;
      this.score.best = Math.max(this.score.best, this.score.streak);
    } else {
      this.score.streak = 0;
    }

    this.app.record({
      exerciseId: ex.id,
      statKey: ex.statKey(q),
      correct,
      ms,
      answerKey: !gaveUp && answer !== null && ex.answerKey ? ex.answerKey(answer, q) : undefined,
    });

    this.view?.showResult(result, gaveUp && !ex.checkPartial ? null : answer);

    const ctx = this.makeContext() as RenderContext;
    const describe = (a: unknown) => (ex.describeAnswer ? ex.describeAnswer(a, ctx, q) : String(a));
    const lines: string[] = [];
    if (!correct) lines.push(t("runner.correctAnswer", { answer: describe(result.correctAnswer) }));
    if (!correct && !gaveUp && answer !== null && !ex.checkPartial) lines.push(t("runner.yourAnswer", { answer: describe(answer) }));
    if (result.explanation) lines.push(typeof result.explanation === "string" ? result.explanation : t(result.explanation.key, result.explanation.params));
    this.feedback.show(correct ? "correct" : "wrong", gaveUp ? t("runner.gaveUp") : correct ? t("runner.correct") : t("runner.wrong"), lines);

    this.setButtons({ replay: !!this.view?.replay, solution: false, next: true });
    this.renderStats();

    const p = this.app.settings.practice;
    const timed = !!this.session?.running;
    const auto = timed || p.autoAdvance === "always" || (p.autoAdvance === "correct" && correct);
    if (auto) {
      const delay = timed ? Math.min(p.autoAdvanceDelayMs, correct ? 350 : 900) : p.autoAdvanceDelayMs;
      this.advanceTimer = setTimeout(() => this.next(), delay);
    } else {
      this.nextBtn.focus({ preventScroll: true });
    }
  }

  // ---------------------------------------------------------------- context

  private makeContext(): RenderContext<unknown, unknown, unknown> {
    const app = this.app;
    const keys: KeyBindings = { bind: (match, handler) => this.bindings.push({ match, handler }) };
    return {
      tuning: app.tuning,
      settings: app.settings,
      frets: app.settings.frets,
      rng: this.rng,
      weight: app.weightFn(this.exercise.id),
      previous: this.question,
      audio: app.audioPort(),
      t: app.t,
      language: app.i18n.language,
      names: app.names(),
      keys,
      submit: (a) => this.submit(a),
      input: (p) => this.input(p),
      giveUp: () => this.giveUp(),
    };
  }

  // ---------------------------------------------------------------- UI

  private setButtons(s: { replay: boolean; solution: boolean; next: boolean }): void {
    this.replayBtn.hidden = !s.replay;
    this.solutionBtn.hidden = !s.solution;
    this.nextBtn.disabled = !s.next;
  }

  private renderStats(): void {
    const t = this.app.t;
    const { correct, total, streak, best } = this.score;
    const acc = total ? Math.round((100 * correct) / total) : null;
    clear(this.statsEl);
    const item = (label: string, value: string, extra?: string) =>
      h("div", { class: "stat" }, h("span", { class: "stat-label" }, label), h("span", { class: "stat-value" }, value), extra ? h("span", { class: "stat-extra" }, extra) : null);
    this.statsEl.append(
      item(t("runner.score"), `${correct}/${total}`),
      item(t("runner.streak"), String(streak), best ? t("runner.best", { n: best }) : undefined),
      item(t("runner.accuracy"), acc === null ? "–" : `${acc} %`),
    );
    if (this.session?.running) {
      const left = Math.max(0, Math.ceil((this.session.endsAt - performance.now()) / 1000));
      this.statsEl.append(item(t("runner.timeLeft"), `${left} s`));
    }
  }

  private handleKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey) return;
    const target = e.target as HTMLElement | null;
    const typing = !!target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
    if (typing) return;
    if (!this.settingsEl.hidden && this.settingsEl.contains(target)) return;
    if (e.key === " " || e.code === "Space") {
      // Space on a focused button would click it; we want "replay" instead
      e.preventDefault();
      this.replay();
      return;
    }
    if (e.key === "Enter") {
      if (this.answered || (this.session && !this.session.running)) {
        e.preventDefault();
        if (this.session && !this.session.running) this.startSession();
        else this.next();
      }
      return;
    }
    if (e.key === "Escape") {
      if (!this.answered) {
        e.preventDefault();
        this.giveUp();
      }
      return;
    }
    for (const b of this.bindings) {
      if (b.match(e)) {
        e.preventDefault();
        b.handler(e);
        return;
      }
    }
  }
}
