/**
 * Look-ahead beat scheduler ("A Tale of Two Clocks"): a coarse JS timer
 * wakes up every `intervalMs` and schedules every beat that falls inside the
 * next `lookAhead` seconds on the precise clock (the AudioContext clock when
 * audio runs). Beats are computed from the start time, so there is no drift.
 *
 * The clock and timer are injected, so the scheduler is unit-testable and
 * also works without audio (visual-only, with a performance.now() clock).
 */
export interface SchedulerClock {
  /** seconds */
  now(): number;
}

export interface TimerApi {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(id: unknown): void;
}

export interface SchedulerOptions {
  clock: SchedulerClock;
  bpm: number;
  /** Called once per beat, ahead of time, with the beat's exact clock time. */
  onBeat(time: number, index: number): void;
  /** Delay before beat 0 (seconds). */
  startDelay?: number;
  lookAhead?: number;
  intervalMs?: number;
  timers?: TimerApi;
}

const defaultTimers: TimerApi = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (id) => globalThis.clearInterval(id as ReturnType<typeof setInterval>),
};

export class Scheduler {
  private timer: unknown = null;
  private bpm: number;
  /** clock time of the next beat to schedule */
  private nextTime = 0;
  private nextIndex = 0;
  private readonly o: Required<Omit<SchedulerOptions, "bpm" | "startDelay">> & { startDelay: number };

  constructor(opts: SchedulerOptions) {
    this.bpm = clampBpm(opts.bpm);
    this.o = {
      clock: opts.clock,
      onBeat: opts.onBeat,
      startDelay: opts.startDelay ?? 0.1,
      lookAhead: opts.lookAhead ?? 0.12,
      intervalMs: opts.intervalMs ?? 25,
      timers: opts.timers ?? defaultTimers,
    };
  }

  get running(): boolean {
    return this.timer !== null;
  }

  get tempo(): number {
    return this.bpm;
  }

  get beatLength(): number {
    return 60 / this.bpm;
  }

  start(): void {
    if (this.running) return;
    this.nextTime = this.o.clock.now() + this.o.startDelay;
    this.nextIndex = 0;
    this.tick();
    this.timer = this.o.timers.setInterval(() => this.tick(), this.o.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) this.o.timers.clearInterval(this.timer);
    this.timer = null;
  }

  /** Takes effect from the next unscheduled beat. */
  setTempo(bpm: number): void {
    this.bpm = clampBpm(bpm);
  }

  /** Exposed for tests; normally driven by the interval timer. */
  tick(): void {
    const horizon = this.o.clock.now() + this.o.lookAhead;
    while (this.nextTime < horizon) {
      this.o.onBeat(this.nextTime, this.nextIndex);
      this.nextIndex++;
      this.nextTime += 60 / this.bpm;
    }
  }
}

export const MIN_BPM = 20;
export const MAX_BPM = 300;

export function clampBpm(bpm: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(bpm)));
}
