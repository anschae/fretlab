import type { Midi } from "../core/pitch";
import { detectAudioFeatures, type AudioFeatures } from "./features";
import type { ChordOptions, Instrument, NoteOptions } from "./Instrument";
import { KarplusStrongInstrument } from "./KarplusStrong";

export type AudioState = "unsupported" | "locked" | "running" | "suspended";

/**
 * Owns the AudioContext. Browsers only allow audio after a user gesture, so
 * the context is created/resumed in `unlock()`, which the app shell calls on
 * the first pointer or key event (and from the "Tap to start" overlay).
 *
 * Graph: instrument → master gain (volume) → limiter → destination
 */
export class AudioEngine {
  readonly features: AudioFeatures = detectAudioFeatures();
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private instrument: Instrument | null = null;
  private volume = 0.8;
  private listeners = new Set<(s: AudioState) => void>();
  private createInstrument: (ctx: AudioContext) => Instrument = (ctx) => new KarplusStrongInstrument(ctx);

  get context(): AudioContext | null {
    return this.ctx;
  }

  get state(): AudioState {
    if (!this.features.webAudio) return "unsupported";
    if (!this.ctx) return "locked";
    return this.ctx.state === "running" ? "running" : "suspended";
  }

  onStateChange(fn: (s: AudioState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }

  /** Must be called from a user gesture handler. Safe to call repeatedly. */
  async unlock(): Promise<void> {
    if (!this.features.webAudio) return;
    if (!this.ctx) {
      const AC: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC({ latencyHint: "interactive" });
      this.ctx.onstatechange = () => this.emit();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const limiter = this.ctx.createDynamicsCompressor();
      limiter.threshold.value = -6;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.15;
      this.master.connect(limiter).connect(this.ctx.destination);
      this.setInstrumentFactory(this.createInstrument);
      // iOS: playing a silent buffer inside the gesture fully unlocks output
      const silent = this.ctx.createBufferSource();
      silent.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      silent.connect(this.ctx.destination);
      silent.start();
    }
    if (this.ctx.state !== "running") {
      try {
        await this.ctx.resume();
      } catch {
        /* resume can reject outside a gesture */
      }
    }
    this.emit();
  }

  /** Swap the instrument (e.g. a future sample-based one). */
  setInstrumentFactory(factory: (ctx: AudioContext) => Instrument): void {
    this.createInstrument = factory;
    if (!this.ctx || !this.master) return;
    this.instrument?.dispose();
    this.instrument = factory(this.ctx);
    this.instrument.output.connect(this.master);
  }

  async ready(): Promise<boolean> {
    if (this.state !== "running") return false;
    await this.instrument?.ready();
    return true;
  }

  get usingWorklet(): boolean {
    return (this.instrument as { usingWorklet?: boolean } | null)?.usingWorklet ?? false;
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  /** Current audio clock time (0 before unlock). */
  now(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** Output latency in seconds as reported by the browser (best effort). */
  outputLatency(): number {
    const c = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return (c?.outputLatency ?? 0) + (c?.baseLatency ?? 0);
  }

  /** Schedules relative to now; a small lead avoids clipped attacks. */
  private at(delay: number): number {
    return this.now() + 0.03 + Math.max(0, delay);
  }

  playNote(midi: Midi, delay = 0, duration = 1.2, opts?: NoteOptions): void {
    if (this.state !== "running" || !this.instrument) return;
    this.instrument.playNote(midi, this.at(delay), duration, opts);
  }

  playChord(midis: readonly Midi[], delay = 0, duration = 2, opts?: ChordOptions): void {
    if (this.state !== "running" || !this.instrument) return;
    this.instrument.playChord(midis, this.at(delay), duration, opts);
  }

  /** Plays notes one after another, `gap` seconds apart. Returns total seconds. */
  playSequence(midis: readonly Midi[], gap: number, duration = gap * 1.1, opts?: NoteOptions): number {
    midis.forEach((m, i) => this.playNote(m, i * gap, duration, opts));
    return midis.length * gap;
  }

  /**
   * Metronome click at an absolute AudioContext time (see `Scheduler`).
   * A short pitched blip straight into the master bus; accents are higher.
   */
  playClick(time: number, accent = false): void {
    if (this.state !== "running" || !this.ctx || !this.master) return;
    const t = Math.max(time, this.ctx.currentTime);
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.value = accent ? 1760 : 1175;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.22, t + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    osc.connect(env).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.06);
    osc.onended = () => env.disconnect();
  }

  stopAll(): void {
    this.instrument?.stopAll();
  }
}
