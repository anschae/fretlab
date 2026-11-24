import type { Tuning } from "../core/tuning";
import type { GlobalSettings } from "./settings";
import type { StatsData } from "./stats";

/**
 * Everything Fretlab persists, in one versioned document. When the shape
 * changes, bump SCHEMA_VERSION and add a migration from the previous
 * version — old saved data and old backup files then keep working.
 */
export const SCHEMA_VERSION = 1;
export const STORAGE_KEY = "fretlab";
export const BACKUP_FORMAT = "fretlab-backup";

export interface PersistedData {
  schema: number;
  settings: GlobalSettings;
  /** per exercise id; merged with the exercise's defaults on load */
  exerciseSettings: Record<string, unknown>;
  stats: StatsData;
  customTunings: Tuning[];
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  app: string;
  data: PersistedData;
}

type AnyData = Record<string, unknown> & { schema?: number };
/** migrations[n] upgrades a version-n document to version n+1 */
export type Migration = (old: AnyData) => AnyData;

export const MIGRATIONS: Record<number, Migration> = {
  // Version 0 = documents written before versioning existed (none in the
  // wild yet); kept as the template for future migrations.
  0: (old) => ({ ...old, schema: 1 }),
};

/** Minimal key/value backend (localStorage in the app, a Map in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  private m = new Map<string, string>();
  getItem(k: string): string | null {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.m.set(k, v);
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
}

export function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Deep-merges `stored` over `defaults`: keys missing from storage get their
 * default, unknown keys are dropped, and type mismatches fall back to the
 * default. This is what keeps settings working when new fields are added.
 */
export function mergeWithDefaults<T>(defaults: T, stored: unknown): T {
  if (Array.isArray(defaults)) return (Array.isArray(stored) ? stored : defaults) as T;
  if (isPlainObject(defaults)) {
    const src = isPlainObject(stored) ? stored : {};
    const out: Record<string, unknown> = {};
    for (const [k, dv] of Object.entries(defaults)) out[k] = mergeWithDefaults(dv, src[k]);
    return out as T;
  }
  if (defaults === null) return (stored === undefined ? null : stored) as T;
  return (typeof stored === typeof defaults ? stored : defaults) as T;
}

export function migrate(doc: AnyData, migrations: Record<number, Migration> = MIGRATIONS, target = SCHEMA_VERSION): AnyData {
  let d = { ...doc };
  let v = typeof d.schema === "number" ? d.schema : 0;
  if (v > target) throw new Error(`Data is from a newer Fretlab version (schema ${v}); please update the app.`);
  while (v < target) {
    const m = migrations[v];
    if (!m) throw new Error(`No migration from schema ${v}`);
    d = m(d);
    v = typeof d.schema === "number" ? d.schema : v + 1;
  }
  return d;
}

export function normalize(doc: AnyData, defaults: PersistedData): PersistedData {
  const migrated = migrate(doc);
  return {
    schema: SCHEMA_VERSION,
    settings: mergeWithDefaults(defaults.settings, migrated.settings),
    exerciseSettings: isPlainObject(migrated.exerciseSettings) ? (migrated.exerciseSettings as Record<string, unknown>) : {},
    stats: isPlainObject(migrated.stats) ? (migrated.stats as StatsData) : {},
    customTunings: Array.isArray(migrated.customTunings)
      ? (migrated.customTunings as unknown[]).filter(
          (t): t is Tuning =>
            isPlainObject(t) && typeof t.id === "string" && typeof t.name === "string" && Array.isArray(t.strings) && t.strings.every((n) => typeof n === "number"),
        )
      : [],
  };
}

/**
 * Storage service. Loads once, keeps the document in memory, writes back
 * (debounced) on every change.
 */
export class StorageService {
  private data: PersistedData;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** set when stored data couldn't be read — shown to the user */
  loadError: string | null = null;

  constructor(
    private readonly kv: KeyValueStore,
    private readonly defaults: PersistedData,
    private readonly debounceMs = 300,
  ) {
    this.data = this.load();
  }

  private load(): PersistedData {
    let raw: string | null = null;
    try {
      raw = this.kv.getItem(STORAGE_KEY);
    } catch {
      this.loadError = "storage unavailable";
    }
    if (!raw) return structuredClone(this.defaults);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isPlainObject(parsed)) throw new Error("not an object");
      return normalize(parsed, this.defaults);
    } catch (e) {
      this.loadError = e instanceof Error ? e.message : String(e);
      // Keep the unreadable data so it isn't lost silently
      try {
        this.kv.setItem(`${STORAGE_KEY}:unreadable:${Date.now()}`, raw);
      } catch {
        /* ignore */
      }
      return structuredClone(this.defaults);
    }
  }

  get(): PersistedData {
    return this.data;
  }

  update(fn: (d: PersistedData) => PersistedData): void {
    this.data = fn(this.data);
    this.scheduleSave();
  }

  private scheduleSave(): void {
    if (this.debounceMs <= 0) return this.flush();
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    try {
      this.kv.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn("Could not save Fretlab data", e);
    }
  }

  exportBackup(appVersion: string, now = new Date()): BackupFile {
    return { format: BACKUP_FORMAT, exportedAt: now.toISOString(), app: appVersion, data: structuredClone(this.data) };
  }

  /** Validates, migrates and replaces all data. Throws with a readable message on invalid input. */
  importBackup(json: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      throw new Error("not JSON");
    }
    if (!isPlainObject(parsed) || parsed.format !== BACKUP_FORMAT || !isPlainObject(parsed.data)) throw new Error("wrong file format");
    this.data = normalize(parsed.data as AnyData, this.defaults);
    this.flush();
  }

  reset(): void {
    this.data = structuredClone(this.defaults);
    this.flush();
  }
}
