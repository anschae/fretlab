import { midiToFrequency, type Midi } from "../core/pitch";
import { renderPluck } from "./dsp/karplusStrong";
import { strumTimes, type ChordOptions, type Instrument, type NoteOptions } from "./Instrument";
import workletUrl from "./ks.worklet.ts?worker&url";

/**
 * Karplus-Strong plucked-string instrument. Runs in an AudioWorklet when
 * available; otherwise renders each note offline into an AudioBuffer (same
 * DSP code), which works in every browser with Web Audio.
 *
 * Signal chain: voices → body (resonant peaks + gentle top-end roll-off) → output
 */
export class KarplusStrongInstrument implements Instrument {
  readonly id = "karplus-strong";
  readonly output: GainNode;
  private readonly bodyIn: AudioNode;
  private node: AudioWorkletNode | null = null;
  private readonly loading: Promise<void>;
  private fallbackSources = new Set<AudioBufferSourceNode>();
  private seed = 1;
  /** true when the AudioWorklet path is used */
  usingWorklet = false;

  constructor(private readonly ctx: BaseAudioContext) {
    this.output = ctx.createGain();
    this.output.gain.value = 0.9;

    // A little "body": low cut, two soft resonances and a top roll-off
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 30;
    hp.Q.value = 0.5;
    const body1 = ctx.createBiquadFilter();
    body1.type = "peaking";
    body1.frequency.value = 110;
    body1.Q.value = 1.2;
    body1.gain.value = 2.5;
    const body2 = ctx.createBiquadFilter();
    body2.type = "peaking";
    body2.frequency.value = 2400;
    body2.Q.value = 0.9;
    body2.gain.value = 2;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 7500;
    lp.Q.value = 0.5;
    hp.connect(body1).connect(body2).connect(lp).connect(this.output);
    this.bodyIn = hp;

    this.loading = this.init();
  }

  private async init(): Promise<void> {
    if (!("audioWorklet" in this.ctx) || typeof AudioWorkletNode === "undefined") return;
    try {
      await this.ctx.audioWorklet.addModule(workletUrl);
      this.node = new AudioWorkletNode(this.ctx, "ks-synth", { numberOfInputs: 0, outputChannelCount: [1] });
      this.node.connect(this.bodyIn);
      this.usingWorklet = true;
    } catch (err) {
      console.warn("AudioWorklet unavailable, using buffer fallback", err);
      this.node = null;
    }
  }

  ready(): Promise<void> {
    return this.loading;
  }

  playNote(midi: Midi, time: number, duration: number, opts: NoteOptions = {}): void {
    const freq = midiToFrequency(midi);
    const velocity = opts.velocity ?? 0.8;
    const brightness = opts.brightness ?? 0.6;
    const seed = (this.seed = (this.seed * 1103515245 + 12345) >>> 0);
    if (this.node) {
      this.node.port.postMessage({ type: "note", freq, when: time, duration, velocity, brightness, seed });
      return;
    }
    // Fallback: render offline (duration + release tail) and schedule a buffer
    const sr = this.ctx.sampleRate;
    const tail = 0.25;
    const data = renderPluck(freq, sr, duration + tail, duration, { velocity, brightness }, seed);
    const buffer = this.ctx.createBuffer(1, data.length, sr);
    buffer.getChannelData(0).set(data);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.bodyIn);
    src.onended = () => this.fallbackSources.delete(src);
    this.fallbackSources.add(src);
    src.start(Math.max(time, this.ctx.currentTime));
  }

  playChord(midis: readonly Midi[], time: number, duration: number, opts: ChordOptions = {}): void {
    const sorted = [...midis].sort((a, b) => a - b);
    const times = strumTimes(sorted.length, time, opts);
    const velocity = (opts.velocity ?? 0.8) / Math.sqrt(Math.max(1, sorted.length / 2));
    sorted.forEach((m, i) => {
      const t = times[i] ?? time;
      this.playNote(m, t, duration - (t - time), { ...opts, velocity });
    });
  }

  stopAll(): void {
    this.node?.port.postMessage({ type: "stopAll" });
    for (const s of this.fallbackSources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.fallbackSources.clear();
  }

  dispose(): void {
    this.stopAll();
    this.node?.disconnect();
    this.output.disconnect();
  }
}
