/**
 * Seedable RNG (mulberry32) plus helpers. Every question generator takes an
 * `Rng` so it is deterministic under a fixed seed in tests.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Picks with probability proportional to `weight(item)` (non-negative). */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T;
  shuffle<T>(items: readonly T[]): T[];
  bool(pTrue?: number): boolean;
}

export function createRng(seed: number = Date.now()): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return fromSource(next);
}

/** Wraps any [0,1) source (e.g. Math.random) as an Rng. */
export function fromSource(next: () => number): Rng {
  const rng: Rng = {
    next,
    int(min, max) {
      if (max < min) throw new Error(`int(): max ${max} < min ${min}`);
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      if (items.length === 0) throw new Error("pick() from empty list");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    weighted(items, weight) {
      if (items.length === 0) throw new Error("weighted() from empty list");
      const ws = items.map((i) => Math.max(0, weight(i)));
      const total = ws.reduce((s, w) => s + w, 0);
      if (!(total > 0)) return rng.pick(items);
      let r = next() * total;
      for (let i = 0; i < items.length; i++) {
        r -= ws[i] ?? 0;
        if (r < 0) return items[i] as (typeof items)[number];
      }
      return items[items.length - 1] as (typeof items)[number];
    },
    shuffle(items) {
      const out = [...items];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j] as (typeof out)[number], out[i] as (typeof out)[number]];
      }
      return out;
    },
    bool(pTrue = 0.5) {
      return next() < pTrue;
    },
  };
  return rng;
}
