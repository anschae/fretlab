import { describe, expect, it } from "vitest";
import {
  mergeWithDefaults,
  MemoryStore,
  migrate,
  SCHEMA_VERSION,
  StorageService,
  STORAGE_KEY,
  type PersistedData,
} from "../../src/state/storage";
import { activeTuning, defaultSettings, sanitizeSettings } from "../../src/state/settings";
import { adaptiveWeight, recordAttempt, summarize, type StatsData } from "../../src/state/stats";
import { describeTuning, TuningRegistry } from "../../src/core/tuning";

const defaults = (): PersistedData => ({
  schema: SCHEMA_VERSION,
  settings: defaultSettings("en"),
  exerciseSettings: {},
  stats: {},
  customTunings: [],
});

describe("mergeWithDefaults", () => {
  it("fills missing keys, drops unknown ones, rejects wrong types", () => {
    const d = { a: 1, b: { c: "x", d: true }, list: [1] };
    expect(mergeWithDefaults(d, { a: 5, b: { c: 3 }, zzz: 1 })).toEqual({ a: 5, b: { c: "x", d: true }, list: [1] });
    expect(mergeWithDefaults(d, null)).toEqual(d);
    expect(mergeWithDefaults(d, { list: [4, 5] }).list).toEqual([4, 5]);
  });
  it("nullable defaults accept stored values", () => {
    expect(mergeWithDefaults({ id: null as string | null }, { id: "custom-1" })).toEqual({ id: "custom-1" });
  });
});

describe("migrations", () => {
  it("upgrades unversioned data", () => {
    expect(migrate({ settings: {} }).schema).toBe(SCHEMA_VERSION);
  });
  it("runs a chain of migrations", () => {
    const migs = { 0: (d: Record<string, unknown>) => ({ ...d, schema: 1, a: 1 }), 1: (d: Record<string, unknown>) => ({ ...d, schema: 2, b: 2 }) };
    expect(migrate({}, migs, 2)).toEqual({ schema: 2, a: 1, b: 2 });
  });
  it("refuses data from a newer version", () => {
    expect(() => migrate({ schema: 999 })).toThrow(/newer/);
  });
});

describe("StorageService", () => {
  it("persists and reloads", () => {
    const kv = new MemoryStore();
    const s1 = new StorageService(kv, defaults(), 0);
    s1.update((d) => ({ ...d, settings: { ...d.settings, instrument: { ...d.settings.instrument, strings: 8 } } }));
    const s2 = new StorageService(kv, defaults(), 0);
    expect(s2.get().settings.instrument.strings).toBe(8);
  });
  it("survives an app update that adds settings (old saved data)", () => {
    const kv = new MemoryStore();
    const old = { schema: 1, settings: { language: "de", instrument: { strings: 7 } }, stats: { x: { items: {}, confusions: {} } } };
    kv.setItem(STORAGE_KEY, JSON.stringify(old));
    const s = new StorageService(kv, defaults(), 0);
    expect(s.get().settings.language).toBe("de");
    expect(s.get().settings.instrument.strings).toBe(7);
    expect(s.get().settings.instrument.drop).toBe(false); // new field → default
    expect(s.get().settings.frets).toEqual({ min: 0, max: 12 });
    expect(s.get().stats.x).toBeDefined();
  });
  it("keeps unreadable data aside instead of losing it", () => {
    const kv = new MemoryStore();
    kv.setItem(STORAGE_KEY, "{broken");
    const s = new StorageService(kv, defaults(), 0);
    expect(s.loadError).toBeTruthy();
    expect(s.get().settings.instrument.strings).toBe(6);
  });
  it("export → import round trip", () => {
    const a = new StorageService(new MemoryStore(), defaults(), 0);
    a.update((d) => ({ ...d, stats: recordAttempt(d.stats, { exerciseId: "interval-ear", statKey: "m3", correct: true, ms: 900 }) }));
    const json = JSON.stringify(a.exportBackup("0.1.0"));
    const b = new StorageService(new MemoryStore(), defaults(), 0);
    b.importBackup(json);
    expect(b.get().stats["interval-ear"]?.items.m3?.correct).toBe(1);
  });
  it("rejects invalid backups", () => {
    const s = new StorageService(new MemoryStore(), defaults(), 0);
    expect(() => s.importBackup("nope")).toThrow(/JSON/);
    expect(() => s.importBackup(JSON.stringify({ format: "other" }))).toThrow(/format/);
  });
  it("filters malformed custom tunings on import", () => {
    const s = new StorageService(new MemoryStore(), defaults(), 0);
    const backup = { format: "fretlab-backup", data: { schema: 1, customTunings: [{ id: "c1", name: "X", strings: [40, 45] }, { id: 3 }] } };
    s.importBackup(JSON.stringify(backup));
    expect(s.get().customTunings.map((t) => t.id)).toEqual(["c1"]);
  });
});

describe("settings", () => {
  it("German UI defaults to German note names", () => {
    expect(defaultSettings("de").notation.system).toBe("de");
    expect(defaultSettings("en").notation.system).toBe("en");
  });
  it("sanitize clamps", () => {
    const s = defaultSettings();
    const bad = { ...s, instrument: { ...s.instrument, strings: 12 }, frets: { min: -3, max: 99 } };
    const ok = sanitizeSettings(bad);
    expect(ok.instrument.strings).toBe(6);
    expect(ok.frets).toEqual({ min: 0, max: 24 });
  });
  it("active tuning with drop and custom tunings", () => {
    const s = defaultSettings();
    expect(describeTuning(activeTuning({ ...s, instrument: { ...s.instrument, strings: 8, drop: true } }))).toBe("E1 B1 E2 A2 D3 G3 B3 E4");
    const reg = new TuningRegistry();
    reg.register({ id: "c-dadgad", name: "DADGAD", strings: [38, 45, 50, 55, 57, 62], custom: true });
    const t = activeTuning({ ...s, instrument: { ...s.instrument, customTuningId: "c-dadgad" } }, reg);
    expect(t.name).toBe("DADGAD");
    // unknown custom id falls back to standard
    expect(activeTuning({ ...s, instrument: { ...s.instrument, customTuningId: "gone" } }, reg).strings).toHaveLength(6);
  });
});

describe("stats", () => {
  it("records attempts, averages and confusions", () => {
    let d: StatsData = {};
    d = recordAttempt(d, { exerciseId: "e", statKey: "m3", correct: true, ms: 1000, at: 1 });
    d = recordAttempt(d, { exerciseId: "e", statKey: "m3", correct: false, ms: 3000, answerKey: "M3", at: 2 });
    const item = d.e!.items.m3!;
    expect(item.attempts).toBe(2);
    expect(item.correct).toBe(1);
    expect(item.avgMs).toBe(2000);
    expect(item.recent).toEqual([1, 0]);
    expect(d.e!.confusions.m3).toEqual({ M3: 1 });
    expect(summarize(d.e)).toEqual({ attempts: 2, correct: 1, accuracy: 0.5 });
  });
  it("adaptive weight favours weak and unseen items", () => {
    const now = 1_000_000;
    const strong = { attempts: 20, correct: 20, avgMs: 800, lastSeen: now, recent: Array(10).fill(1) };
    const weak = { attempts: 20, correct: 8, avgMs: 2000, lastSeen: now, recent: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0] };
    expect(adaptiveWeight(weak, 1000, now)).toBeGreaterThan(adaptiveWeight(strong, 1000, now) * 3);
    expect(adaptiveWeight(undefined, 1000, now)).toBeGreaterThan(adaptiveWeight(strong, 1000, now));
  });
});
