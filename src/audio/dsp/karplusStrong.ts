/**
 * Extended Karplus-Strong plucked string (Jaffe/Smith style), as a pure DSP
 * class with no Web Audio dependency. Used inside the AudioWorklet and by the
 * offline fallback renderer, and unit-tested for tuning accuracy.
 *
 * Loop: delay line → two-point averager (½ sample, linear phase) → one-pole
 * low-pass (brightness, frequency-dependent loss) → first-order all-pass
 * (fractional delay, exact tuning) → loop gain (decay time).
 *
 * The excitation is a band-limited noise burst with a pick-position comb, so
 * low strings sound round and high strings sound bright. Tuning stays within
 * about one cent from E1 (41 Hz) to the 24th fret of the high E string.
 */

export interface PluckParams {
  /** 0..1 — how bright the pick attack is. */
  brightness: number;
  /** Pick position as a fraction of the string length (0.05..0.5). */
  pickPosition: number;
  /** T60 of the fundamental in seconds, or null for a pitch-dependent default. */
  decay: number | null;
  /** 0..1 — peak level. */
  velocity: number;
}

export const DEFAULT_PLUCK: PluckParams = { brightness: 0.6, pickPosition: 0.13, decay: null, velocity: 0.8 };

/** Default decay: long for low strings, shorter for high notes. */
export function defaultDecay(freq: number): number {
  // ~7 s at 41 Hz, ~3.5 s at 330 Hz, ~1.6 s at 1.3 kHz
  return Math.max(1.2, Math.min(8, 7 * Math.pow(41 / freq, 0.33)));
}

/** Phase delay (in samples) of y = (1-a)·x + a·y[n-1] at angular frequency w. */
function onePolePhaseDelay(a: number, w: number): number {
  const phase = Math.atan2(a * Math.sin(w), 1 - a * Math.cos(w));
  return phase / w;
}

function onePoleMagnitude(a: number, w: number): number {
  return (1 - a) / Math.sqrt(1 - 2 * a * Math.cos(w) + a * a);
}

/** Small deterministic noise source (xorshift32), so voices are testable. */
export class Noise {
  private s: number;
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.s = x >>> 0;
    return (this.s / 4294967296) * 2 - 1;
  }
}

export class KsVoice {
  private buf: Float32Array;
  private len = 0;
  private idx = 0;
  /** previous delay-line output (for the averager) */
  private prevOut = 0;
  /** one-pole state */
  private lpState = 0;
  private lpCoef = 0;
  /** all-pass */
  private apCoef = 0;
  private apX1 = 0;
  private apY1 = 0;
  private gain = 0.999;
  private releaseGain = 0.9;
  private releaseLp = 0.5;
  private released = false;
  private releaseAt = Infinity;
  private age = 0;
  private energy = 1;
  /** sample counter at which this voice starts sounding (relative) */
  done = false;
  readonly freq: number;

  constructor(freq: number, sampleRate: number, params: Partial<PluckParams> = {}, noise = new Noise()) {
    const p = { ...DEFAULT_PLUCK, ...params };
    this.freq = freq;
    const w = (2 * Math.PI * freq) / sampleRate;

    // Brightness of the loop filter: low strings lose highs faster per second
    // in reality, so use a darker loop for long delays.
    const nominal = sampleRate / freq;
    const loopDark = Math.min(0.6, Math.max(0.0, 0.05 + 0.12 * Math.log2(nominal / 50)));
    this.lpCoef = loopDark;

    const fixedDelay = 0.5 + onePolePhaseDelay(this.lpCoef, w);
    const total = nominal - fixedDelay;
    // Integer part with an all-pass fractional delay in [0.1, 1.1)
    let n = Math.floor(total - 0.1);
    let frac = total - n;
    if (n < 2) {
      n = 2;
      frac = Math.max(0.1, total - n);
    }
    // All-pass coefficient for delay `frac`, using its exact phase delay at w
    this.apCoef = allpassCoefForDelay(frac, w);
    this.len = n;
    this.buf = new Float32Array(n);

    // Loop gain for the requested T60 at the fundamental
    const t60 = p.decay ?? defaultDecay(freq);
    const perTrip = Math.pow(10, -3 / (t60 * freq));
    const loss = Math.cos(w / 2) * onePoleMagnitude(this.lpCoef, w);
    this.gain = Math.min(0.99995, perTrip / loss);
    // Release: damp in ~0.12 s like lifting a fretting finger
    const relPerTrip = Math.pow(10, -3 / (0.12 * freq));
    this.releaseGain = Math.min(this.gain, relPerTrip / loss);
    this.releaseLp = Math.min(0.85, this.lpCoef + 0.3);

    // Excitation: noise, low-passed by brightness, comb-filtered at the pick position
    const bright = Math.max(0.02, Math.min(1, p.brightness));
    const exLp = 1 - bright * 0.9; // one-pole coefficient for the excitation
    const tmp = new Float32Array(n);
    let s = 0;
    for (let i = 0; i < n; i++) {
      s = (1 - exLp) * noise.next() + exLp * s;
      tmp[i] = s;
    }
    const pick = Math.max(1, Math.round(Math.max(0.03, Math.min(0.5, p.pickPosition)) * n));
    let mean = 0;
    for (let i = 0; i < n; i++) {
      const v = (tmp[i] ?? 0) - (i >= pick ? (tmp[i - pick] ?? 0) : 0);
      this.buf[i] = v;
      mean += v;
    }
    mean /= n;
    let peak = 0;
    for (let i = 0; i < n; i++) {
      const v = (this.buf[i] ?? 0) - mean;
      this.buf[i] = v;
      peak = Math.max(peak, Math.abs(v));
    }
    // Short delay lines lose their upper partials within milliseconds, so high
    // notes sound much quieter than low ones; compensate up to +8 dB.
    const levelComp = Math.min(2.5, Math.max(1, Math.sqrt(freq / 330)));
    const scale = peak > 0 ? (Math.max(0, Math.min(1, p.velocity)) * levelComp) / peak : 0;
    for (let i = 0; i < n; i++) this.buf[i] = (this.buf[i] ?? 0) * scale;
  }

  /** Starts the release after `samples` more samples. */
  releaseAfter(samples: number): void {
    this.releaseAt = this.age + Math.max(0, samples);
  }

  /** Adds `count` samples of output to `out` starting at `offset`. */
  process(out: Float32Array, offset: number, count: number): void {
    if (this.done) return;
    const buf = this.buf;
    const len = this.len;
    let idx = this.idx;
    let prev = this.prevOut;
    let lp = this.lpState;
    let apX1 = this.apX1;
    let apY1 = this.apY1;
    const c = this.apCoef;
    let g = this.released ? this.releaseGain : this.gain;
    let a = this.released ? this.releaseLp : this.lpCoef;
    let energy = this.energy;
    const end = offset + count;
    for (let i = offset; i < end; i++) {
      if (!this.released && this.age >= this.releaseAt) {
        this.released = true;
        g = this.releaseGain;
        a = this.releaseLp;
      }
      const x = buf[idx] ?? 0;
      out[i] = (out[i] ?? 0) + x;
      // averager
      const avg = 0.5 * (x + prev);
      prev = x;
      // one-pole low-pass
      lp = (1 - a) * avg + a * lp;
      // all-pass fractional delay: y = c·x + x1 − c·y1
      const ap = c * lp + apX1 - c * apY1;
      apX1 = lp;
      apY1 = ap;
      buf[idx] = ap * g;
      idx++;
      if (idx >= len) idx = 0;
      energy = 0.9995 * energy + 0.0005 * x * x;
      this.age++;
    }
    this.idx = idx;
    this.prevOut = prev;
    this.lpState = lp;
    this.apX1 = apX1;
    this.apY1 = apY1;
    this.energy = energy;
    // Silence threshold (~ -80 dB) after the attack
    if (this.age > len * 4 && energy < 1e-8) this.done = true;
  }
}

/**
 * First-order all-pass H(z) = (c + z⁻¹)/(1 + c z⁻¹). Finds c so the phase
 * delay at w equals `delay` (bisection on the exact phase response).
 */
export function allpassCoefForDelay(delay: number, w: number): number {
  const pd = (c: number) => {
    // phase of numerator minus denominator
    const num = Math.atan2(-Math.sin(w), c + Math.cos(w));
    const den = Math.atan2(-c * Math.sin(w), 1 + c * Math.cos(w));
    return -(num - den) / w;
  };
  // pd is decreasing in c on (-1, 1)
  let lo = -0.999;
  let hi = 0.999;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (pd(mid) > delay) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Renders a single plucked note offline (used by the fallback instrument and tests). */
export function renderPluck(freq: number, sampleRate: number, seconds: number, holdSeconds = seconds, params: Partial<PluckParams> = {}, seed?: number): Float32Array {
  const out = new Float32Array(Math.ceil(seconds * sampleRate));
  const v = new KsVoice(freq, sampleRate, params, new Noise(seed));
  v.releaseAfter(Math.round(holdSeconds * sampleRate));
  const block = 128;
  for (let i = 0; i < out.length && !v.done; i += block) v.process(out, i, Math.min(block, out.length - i));
  return out;
}
