import type { FretRange } from "../core/fretboard";
import type { Midi, PitchClass, SpelledNote } from "../core/pitch";
import type { Rng } from "../core/random";
import type { Tuning } from "../core/tuning";
import type { Dict, Language, Translate } from "../i18n";
import type { GlobalSettings } from "../state/settings";

export type Category = "ear" | "fretboard" | "chords" | "scales" | "rhythm" | "theory";
export const CATEGORIES: readonly Category[] = ["ear", "fretboard", "chords", "scales", "rhythm", "theory"];

/** "click" = on-screen answers; "audio" = microphone mode (module 4). */
export type AnswerMode = "click" | "audio";

/**
 * Everything `generateQuestion` may depend on. Deliberately free of DOM and
 * audio so generation is pure given the RNG (unit-tested with a fixed seed).
 */
export interface QuestionContext<Q = unknown> {
  tuning: Tuning;
  settings: GlobalSettings;
  /** effective global fret range */
  frets: FretRange;
  rng: Rng;
  /** Adaptive weight for an item (1 when adaptive practice is off). */
  weight(statKey: string): number;
  /** The previous question of this session, e.g. to avoid repeating a root. */
  previous?: Q;
}

/** Note naming according to the user's notation settings. */
export interface NoteNamer {
  pc(pc: PitchClass): string;
  midi(m: Midi): string;
  spelled(n: SpelledNote): string;
  /** answer-button label, e.g. "C♯/D♭" in mixed mode */
  button(pc: PitchClass): string;
  /** "string 3 (G)" */
  string(tuning: Tuning, index: number): string;
}

/** What exercises use to make sound (no-op until audio is unlocked). */
export interface AudioPort {
  readonly available: boolean;
  /** seconds, from the global note-duration setting */
  readonly noteDuration: number;
  playNote(midi: Midi, delay?: number, duration?: number): void;
  playChord(midis: readonly Midi[], delay?: number, duration?: number, strum?: number): void;
  /** returns the total length in seconds */
  playSequence(midis: readonly Midi[], gap: number, duration?: number): number;
  stop(): void;
}

/** Keyboard bindings that live only as long as the current question. */
export interface KeyBindings {
  bind(match: (e: KeyboardEvent) => boolean, handler: (e: KeyboardEvent) => void): void;
}

export interface RenderContext<A = unknown, P = unknown, Q = unknown> extends QuestionContext<Q> {
  audio: AudioPort;
  t: Translate;
  language: Language;
  names: NoteNamer;
  keys: KeyBindings;
  /** Submit a complete answer. */
  submit(answer: A): void;
  /** Submit one input of a multi-input question (see `checkPartial`). */
  input(partial: P): void;
  giveUp(): void;
}

export interface CheckResult<A> {
  correct: boolean;
  correctAnswer: A;
  /** optional extra line (already-translated text is fine; or an i18n key with params) */
  explanation?: string | { key: string; params?: Record<string, string | number> };
}

export interface PartialFeedback<P> {
  input: P;
  ok: boolean;
}

export interface PartialResult<P = unknown> {
  complete: boolean;
  found: number;
  total: number;
  mistakes: number;
  feedback: PartialFeedback<P>[];
}

export interface QuestionView<A> {
  /** Called once the question is scored. `given` is null when the user gave up. */
  showResult(result: CheckResult<A>, given: A | null): void;
  /** Multi-input questions: called after every input. */
  showPartial?(result: PartialResult): void;
  /** Space / Replay button. */
  replay?(): void;
  destroy?(): void;
}

export interface SettingsContext {
  t: Translate;
  tuning: Tuning;
  settings: GlobalSettings;
  names: NoteNamer;
}

export interface ExerciseMessages {
  en: Dict;
  de?: Dict;
}

/**
 * The exercise plugin interface. One folder per exercise; register it with
 * one line in registry.ts. Multi-input exercises (find all, build a chord,
 * dictation) implement `checkPartial`; for them the answer type A is P[].
 */
export interface Exercise<Q, A, S, P = never> {
  kind: "exercise";
  id: string;
  titleKey: string;
  descriptionKey?: string;
  category: Category;
  answerModes: AnswerMode[];
  /** Show the "tap to start" overlay until audio is unlocked. */
  needsAudio?: boolean;
  defaultSettings: S;
  messages?: ExerciseMessages;

  renderSettings(container: HTMLElement, settings: S, onChange: (s: S) => void, ctx: SettingsContext): void;
  /** Must be pure given ctx.rng. Throw `NoQuestionError` if the settings allow no question. */
  generateQuestion(ctx: QuestionContext<Q>, settings: S): Q;
  renderQuestion(container: HTMLElement, q: Q, ctx: RenderContext<A, P, Q>, settings: S): QuestionView<A>;
  checkAnswer(q: Q, answer: A): CheckResult<A>;
  checkPartial?(q: Q, inputs: P[]): PartialResult<P>;
  /** Text for an answer in feedback ("m3", "F♯"). */
  describeAnswer?(answer: A, ctx: RenderContext<A, P, Q>, q: Q): string;
  /** Item key for weak-spot tracking ("m3", "s3-f5"). */
  statKey(q: Q): string;
  /** Key of a given answer, for confusion matrices (same key space as statKey). */
  answerKey?(answer: A, q: Q): string;
  /** e.g. timed mode: the runner shows a countdown and a summary. */
  session?(settings: S): { durationSec?: number };
}

/** Non-quiz tools (chord library, scale viewer, metronome, tuner). */
export interface ToolContext {
  t: Translate;
  tuning: Tuning;
  settings: GlobalSettings;
  names: NoteNamer;
  audio: AudioPort;
}

export interface Tool {
  kind: "tool";
  id: string;
  titleKey: string;
  descriptionKey?: string;
  category: Category;
  messages?: ExerciseMessages;
  /** Returns a cleanup function. */
  render(container: HTMLElement, ctx: ToolContext): () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyExercise = Exercise<any, any, any, any>;
export type AppModule = AnyExercise | Tool;

export class NoQuestionError extends Error {
  constructor(message = "No question possible with these settings") {
    super(message);
    this.name = "NoQuestionError";
  }
}

/** Helper so exercise files get full type inference. */
export function defineExercise<Q, A, S, P = never>(e: Exercise<Q, A, S, P>): Exercise<Q, A, S, P> {
  return e;
}

export function defineTool(t: Tool): Tool {
  return t;
}
