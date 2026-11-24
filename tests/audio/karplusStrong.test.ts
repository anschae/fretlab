import { describe, expect, it } from "vitest";
import { allpassCoefForDelay, renderPluck, defaultDecay } from "../../src/audio/dsp/karplusStrong";
import { frequencyToMidi, midiToFrequency, noteToMidi } from "../../src/core/pitch";

/**
 * Fundamental estimate: normalised difference function (YIN step 2/3) with
 * parabolic interpolation, searching lags around the expected period.
 */
function estimateFrequency(x: Float32Array, sr: number, expected: number): number {
  const start = Math.floor(0.25 * sr);
  const win = Math.floor(Math.max(4 * (sr / expected), 0.1 * sr));
  const minLag = Math.floor((sr / expected) * 0.8);
  const maxLag = Math.ceil((sr / expected) * 1.25);
  const d: number[] = [];
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let s = 0;
    for (let i = 0; i < win; i++) {
      const diff = (x[start + i] ?? 0) - (x[start + i + lag] ?? 0);
      s += diff * diff;
    }
    d.push(s);
  }
  let best = 1;
  for (let i = 1; i < d.length - 1; i++) if ((d[i] ?? 0) < (d[best] ?? 0)) best = i;
  const a = d[best - 1] ?? 0;
  const b = d[best] ?? 0;
  const c = d[best + 1] ?? 0;
  const shift = (a - c) / (2 * (a - 2 * b + c));
  const lag = minLag - 1 + best + (Number.isFinite(shift) ? shift : 0);
  return sr / lag;
}

const rms = (x: Float32Array, from: number, to: number) => {
  let s = 0;
  for (let i = from; i < to; i++) s += (x[i] ?? 0) ** 2;
  return Math.sqrt(s / (to - from));
};

describe("Karplus-Strong voice", () => {
  const sampleRates = [44100, 48000];
  const notes = ["E1", "F#1", "B1", "E2", "A2", "G3", "E4", "E5", "E6"];

  for (const sr of sampleRates) {
    for (const n of notes) {
      it(`${n} is in tune at ${sr} Hz (±3 cents)`, () => {
        const f = midiToFrequency(noteToMidi(n));
        const x = renderPluck(f, sr, 0.7, 0.7, {}, 1234);
        const est = estimateFrequency(x, sr, f);
        const cents = 100 * (frequencyToMidi(est) - noteToMidi(n));
        expect(Math.abs(cents)).toBeLessThan(3);
      });
    }
  }

  it("produces a non-silent, bounded signal down to E1", () => {
    const x = renderPluck(midiToFrequency(noteToMidi("E1")), 48000, 1.5, 1.5, {}, 7);
    const peak = x.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak).toBeGreaterThan(0.1);
    expect(peak).toBeLessThanOrEqual(1.5);
    expect(rms(x, 48000, 72000)).toBeGreaterThan(0.01); // still ringing after 1 s
  });

  it("decays, and the release damps the note quickly", () => {
    const sr = 48000;
    const f = midiToFrequency(noteToMidi("A2"));
    const held = renderPluck(f, sr, 1.2, 1.2, {}, 3);
    const released = renderPluck(f, sr, 1.2, 0.3, {}, 3);
    expect(rms(held, 0.1 * sr, 0.2 * sr)).toBeGreaterThan(rms(held, 1.0 * sr, 1.1 * sr));
    expect(rms(released, 0.8 * sr, 0.9 * sr)).toBeLessThan(rms(held, 0.8 * sr, 0.9 * sr) * 0.05);
  });

  it("default decay is longer for low notes", () => {
    expect(defaultDecay(41)).toBeGreaterThan(defaultDecay(330));
    expect(defaultDecay(330)).toBeGreaterThan(defaultDecay(1300));
  });

  it("all-pass coefficient yields delay≈1 for c=0", () => {
    expect(allpassCoefForDelay(1, 0.01)).toBeCloseTo(0, 3);
    expect(allpassCoefForDelay(0.5, 0.01)).toBeCloseTo(1 / 3, 3);
  });
});
