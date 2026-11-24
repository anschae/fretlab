import type { Midi } from "../core/pitch";

/**
 * Anything that can play notes on the AudioContext clock. The default is the
 * Karplus-Strong synth; a sample-based instrument can implement the same
 * interface later and be swapped in via `AudioEngine.setInstrument`.
 *
 * All times are AudioContext times in seconds (`ctx.currentTime` based).
 */
export interface NoteOptions {
  /** 0..1 */
  velocity?: number;
  /** 0..1, timbre brightness (instrument-specific) */
  brightness?: number;
}

export interface ChordOptions extends NoteOptions {
  /** Seconds between successive strings; 0 = block chord. */
  strum?: number;
  direction?: "down" | "up";
}

export interface Instrument {
  readonly id: string;
  /** Resolves once the instrument can play (worklet loaded, samples decoded …). */
  ready(): Promise<void>;
  playNote(midi: Midi, time: number, duration: number, opts?: NoteOptions): void;
  playChord(midis: readonly Midi[], time: number, duration: number, opts?: ChordOptions): void;
  /** Quickly silences everything that is sounding or scheduled. */
  stopAll(): void;
  /** The node to connect to the master bus. */
  readonly output: AudioNode;
  dispose(): void;
}

/** Shared strum logic so every instrument behaves the same. */
export function strumTimes(count: number, time: number, opts: ChordOptions = {}): number[] {
  const step = Math.max(0, opts.strum ?? 0);
  const times = Array.from({ length: count }, (_, i) => time + i * step);
  return opts.direction === "up" ? times.reverse() : times;
}
