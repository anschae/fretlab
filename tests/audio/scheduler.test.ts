import { describe, expect, it } from "vitest";
import { Scheduler } from "../../src/audio/Scheduler";

function fake() {
  let now = 0;
  let fn: (() => void) | null = null;
  return {
    clock: { now: () => now },
    timers: { setInterval: (f: () => void) => ((fn = f), 1), clearInterval: () => (fn = null) },
    advance(sec: number, step = 0.025) {
      for (let t = 0; t < sec; t += step) {
        now += step;
        fn?.();
      }
    },
    get active() {
      return fn !== null;
    },
  };
}

describe("Scheduler", () => {
  it("schedules beats exactly 60/bpm apart without drift", () => {
    const f = fake();
    const beats: number[] = [];
    const s = new Scheduler({ clock: f.clock, timers: f.timers, bpm: 120, startDelay: 0.1, onBeat: (t) => beats.push(t) });
    s.start();
    f.advance(300); // 5 minutes
    expect(beats.length).toBeGreaterThan(590);
    beats.forEach((t, i) => expect(t).toBeCloseTo(0.1 + i * 0.5, 6));
  });

  it("schedules ahead of time, never late", () => {
    const f = fake();
    const s = new Scheduler({ clock: f.clock, timers: f.timers, bpm: 90, onBeat: (t) => expect(t).toBeGreaterThanOrEqual(f.clock.now()) });
    s.start();
    f.advance(10);
  });

  it("tempo changes apply from the next beat; stop clears the timer", () => {
    const f = fake();
    const beats: number[] = [];
    const s = new Scheduler({ clock: f.clock, timers: f.timers, bpm: 60, startDelay: 0, lookAhead: 0.05, onBeat: (t) => beats.push(t) });
    s.start();
    f.advance(2.01);
    s.setTempo(120);
    f.advance(2);
    s.stop();
    expect(f.active).toBe(false);
    const gaps = beats.slice(1).map((t, i) => t - (beats[i] ?? 0));
    expect(gaps[0]).toBeCloseTo(1);
    expect(gaps[gaps.length - 1]).toBeCloseTo(0.5);
  });
});
