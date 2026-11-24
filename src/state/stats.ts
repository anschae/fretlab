/**
 * Per-exercise, per-item statistics. Each exercise defines its own item
 * keys via `statKey(q)` ("m3", "s3-f5", …). Stored as plain JSON.
 */
export interface ItemStats {
  attempts: number;
  correct: number;
  /** running mean in ms over all attempts */
  avgMs: number;
  /** epoch ms */
  lastSeen: number;
  /** recent results, newest last (1 = correct), max 10 — for adaptive weighting */
  recent: number[];
}

export interface ExerciseStats {
  items: Record<string, ItemStats>;
  /** confusions[expected][given] = count (only wrong answers) */
  confusions: Record<string, Record<string, number>>;
}

export type StatsData = Record<string, ExerciseStats>;

const RECENT = 10;

export function emptyExerciseStats(): ExerciseStats {
  return { items: {}, confusions: {} };
}

export interface AttemptRecord {
  exerciseId: string;
  statKey: string;
  correct: boolean;
  ms: number;
  /** key of the given answer, for the confusion matrix */
  answerKey?: string;
  at?: number;
}

/** Pure update: returns new stats data (input is not mutated). */
export function recordAttempt(data: StatsData, r: AttemptRecord): StatsData {
  const ex = data[r.exerciseId] ?? emptyExerciseStats();
  const prev = ex.items[r.statKey] ?? { attempts: 0, correct: 0, avgMs: 0, lastSeen: 0, recent: [] };
  const attempts = prev.attempts + 1;
  const ms = Math.max(0, Math.min(120_000, r.ms));
  const item: ItemStats = {
    attempts,
    correct: prev.correct + (r.correct ? 1 : 0),
    avgMs: prev.avgMs + (ms - prev.avgMs) / attempts,
    lastSeen: r.at ?? Date.now(),
    recent: [...prev.recent, r.correct ? 1 : 0].slice(-RECENT),
  };
  let confusions = ex.confusions;
  if (!r.correct && r.answerKey !== undefined && r.answerKey !== r.statKey) {
    const row = { ...(confusions[r.statKey] ?? {}) };
    row[r.answerKey] = (row[r.answerKey] ?? 0) + 1;
    confusions = { ...confusions, [r.statKey]: row };
  }
  return { ...data, [r.exerciseId]: { items: { ...ex.items, [r.statKey]: item }, confusions } };
}

export function accuracy(item: ItemStats | undefined): number | null {
  if (!item || item.attempts === 0) return null;
  return item.correct / item.attempts;
}

/**
 * Adaptive weight for picking an item: higher for items that are often
 * wrong (recent results count most), slow, or not seen for a while.
 * Unseen items get a moderate boost so everything is visited.
 */
export function adaptiveWeight(item: ItemStats | undefined, medianMs: number, now = Date.now()): number {
  if (!item || item.attempts === 0) return 2;
  const recentAcc = item.recent.length ? item.recent.reduce((s, x) => s + x, 0) / item.recent.length : 1;
  // Laplace-smoothed blend of long-term and recent accuracy
  const longAcc = (item.correct + 1) / (item.attempts + 2);
  const acc = 0.4 * longAcc + 0.6 * recentAcc;
  const slow = medianMs > 0 ? Math.min(2, Math.max(0, item.avgMs / medianMs - 1)) : 0;
  const days = (now - item.lastSeen) / 86_400_000;
  const stale = Math.min(1, Math.max(0, days / 7));
  return 0.5 + 4 * (1 - acc) + 0.75 * slow + 0.75 * stale;
}

export function medianResponseMs(ex: ExerciseStats | undefined): number {
  const xs = Object.values(ex?.items ?? {})
    .filter((i) => i.attempts > 0)
    .map((i) => i.avgMs)
    .sort((a, b) => a - b);
  if (xs.length === 0) return 0;
  return xs[Math.floor(xs.length / 2)] ?? 0;
}

export function summarize(ex: ExerciseStats | undefined): { attempts: number; correct: number; accuracy: number | null } {
  let attempts = 0;
  let correct = 0;
  for (const i of Object.values(ex?.items ?? {})) {
    attempts += i.attempts;
    correct += i.correct;
  }
  return { attempts, correct, accuracy: attempts ? correct / attempts : null };
}
