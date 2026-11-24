/**
 * AudioWorklet processor: polyphonic Karplus-Strong. Notes are scheduled
 * by AudioContext time and start sample-accurately inside the render block.
 *
 * Messages (port):
 *   { type: "note", freq, when, duration, velocity, brightness, seed }
 *   { type: "stopAll" }
 */
import { KsVoice, Noise } from "./dsp/karplusStrong";

declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor();
}

interface NoteMsg {
  type: "note";
  freq: number;
  when: number;
  duration: number;
  velocity: number;
  brightness: number;
  seed: number;
}
type Msg = NoteMsg | { type: "stopAll" };

const MAX_VOICES = 32;

class KsProcessor extends AudioWorkletProcessor {
  private pending: { frame: number; msg: NoteMsg }[] = [];
  private voices: KsVoice[] = [];
  private mix = new Float32Array(128);

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<Msg>) => {
      const m = e.data;
      if (m.type === "stopAll") {
        this.pending = [];
        for (const v of this.voices) v.releaseAfter(0);
      } else if (m.type === "note") {
        this.pending.push({ frame: Math.round(m.when * sampleRate), msg: m });
        this.pending.sort((a, b) => a.frame - b.frame);
      }
    };
  }

  private start(msg: NoteMsg): KsVoice {
    const v = new KsVoice(msg.freq, sampleRate, { velocity: msg.velocity, brightness: msg.brightness }, new Noise(msg.seed));
    v.releaseAfter(Math.round(msg.duration * sampleRate));
    if (this.voices.length >= MAX_VOICES) this.voices.shift();
    this.voices.push(v);
    return v;
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const first = out[0] as Float32Array;
    const n = first.length;
    if (this.mix.length !== n) this.mix = new Float32Array(n);
    const mix = this.mix;
    mix.fill(0);
    const blockStart = currentFrame;
    const blockEnd = blockStart + n;

    // Existing voices render the whole block.
    for (const v of this.voices) v.process(mix, 0, n);

    // New voices start at their exact sample offset (late events start at 0).
    while (this.pending.length > 0 && (this.pending[0] as { frame: number }).frame < blockEnd) {
      const { frame, msg } = this.pending.shift() as { frame: number; msg: NoteMsg };
      const offset = Math.max(0, frame - blockStart);
      this.start(msg).process(mix, offset, n - offset);
    }
    this.voices = this.voices.filter((v) => !v.done);

    for (let ch = 0; ch < out.length; ch++) (out[ch] as Float32Array).set(mix);
    return true;
  }
}

registerProcessor("ks-synth", KsProcessor);
