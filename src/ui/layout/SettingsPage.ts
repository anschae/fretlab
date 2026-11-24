import { describeTuning } from "../../core/tuning";
import type { Services } from "../../services";
import type { GlobalSettings } from "../../state/settings";
import { checkbox, field, fretRangeInput, section, segmented, select, slider } from "../components/controls";
import { h } from "../dom";

/** Global settings panel. Every change is saved immediately. */
export function renderSettingsPage(container: HTMLElement, app: Services, toast: (msg: string) => void): () => void {
  const root = h("div", { class: "page settings-page" });
  container.append(root);

  const render = () => {
    root.replaceChildren();
    const t = app.t;
    const s = app.settings;
    const set = (fn: (s: GlobalSettings) => GlobalSettings) => app.updateSettings(fn);
    const tuning = app.tuning;
    const feats = app.audio.features;

    const customs = app.tunings.list().filter((x) => x.custom);
    const instrument = section(
      t("settings.instrument"),
      field(
        t("settings.strings"),
        segmented(
          t("settings.strings"),
          [6, 7, 8].map((n) => ({ value: n, label: String(n) })),
          s.instrument.customTuningId ? -1 : s.instrument.strings,
          (n) => set((x) => ({ ...x, instrument: { ...x.instrument, strings: n, customTuningId: null } })),
        ),
      ),
      customs.length
        ? field(
            t("settings.tuning"),
            select(
              [{ value: "", label: "—" }, ...customs.map((c) => ({ value: c.id, label: c.name }))],
              s.instrument.customTuningId ?? "",
              (id) => set((x) => ({ ...x, instrument: { ...x.instrument, customTuningId: id || null } })),
            ),
          )
        : null,
      checkbox(t("settings.drop"), s.instrument.drop, (v) => set((x) => ({ ...x, instrument: { ...x.instrument, drop: v } }))),
      s.instrument.drop
        ? field(
            t("settings.dropAmount"),
            select(
              [1, 2, 3, 4, 5].map((n) => ({ value: n, label: `−${n}` })),
              s.instrument.dropSemitones,
              (n) => set((x) => ({ ...x, instrument: { ...x.instrument, dropSemitones: n } })),
            ),
          )
        : null,
      h("p", { class: "tuning-readout" }, h("strong", null, app.tuningName(tuning)), " · ", h("code", null, describeTuning(tuning))),
    );

    const fretboard = section(
      t("settings.fretboard"),
      field(
        t("settings.fretRange"),
        fretRangeInput(s.frets, (r) => set((x) => ({ ...x, frets: r })), { from: t("settings.fretFrom"), to: t("settings.fretTo") }),
      ),
      field(
        t("settings.orientation"),
        segmented(
          t("settings.orientation"),
          [
            { value: "bottom", label: t("settings.orientation.bottom") },
            { value: "top", label: t("settings.orientation.top") },
          ],
          s.fretboard.lowestAtBottom ? "bottom" : "top",
          (v) => set((x) => ({ ...x, fretboard: { ...x.fretboard, lowestAtBottom: v === "bottom" } })),
        ),
      ),
      checkbox(t("settings.leftHanded"), s.fretboard.leftHanded, (v) => set((x) => ({ ...x, fretboard: { ...x.fretboard, leftHanded: v } }))),
      checkbox(t("settings.markers"), s.fretboard.markers, (v) => set((x) => ({ ...x, fretboard: { ...x.fretboard, markers: v } }))),
    );

    const notation = section(
      t("settings.notation"),
      field(
        t("settings.notationSystem"),
        segmented(
          t("settings.notationSystem"),
          [
            { value: "en", label: t("settings.notation.en") },
            { value: "de", label: t("settings.notation.de") },
          ],
          s.notation.system,
          (v) => set((x) => ({ ...x, notation: { ...x.notation, system: v } })),
        ),
      ),
      field(
        t("settings.accidentals"),
        select(
          (["mixed", "sharps", "flats"] as const).map((v) => ({ value: v, label: t(`settings.accidentals.${v}`) })),
          s.notation.accidentals,
          (v) => set((x) => ({ ...x, notation: { ...x.notation, accidentals: v } })),
        ),
      ),
      s.notation.system === "de"
        ? checkbox(t("settings.germanSuffixes"), s.notation.germanSuffixes, (v) => set((x) => ({ ...x, notation: { ...x.notation, germanSuffixes: v } })))
        : null,
    );

    const language = section(
      t("settings.language"),
      segmented(
        t("settings.language"),
        [
          { value: "en", label: "English" },
          { value: "de", label: "Deutsch" },
        ],
        s.language,
        (v) => set((x) => ({ ...x, language: v })),
      ),
    );

    const audioNotes = [
      !feats.webAudio ? t("audio.unsupported") : null,
      feats.webAudio && !feats.audioWorklet ? t("audio.fallback") : null,
      feats.ios ? t("audio.iosSilent") : null,
    ].filter(Boolean) as string[];
    const audio = section(
      t("settings.audio"),
      field(
        t("settings.volume"),
        slider(s.audio.volume, 0, 1, 0.05, (v) => `${Math.round(v * 100)} %`, (v) => set((x) => ({ ...x, audio: { ...x.audio, volume: v } }))),
      ),
      field(
        t("settings.noteDuration"),
        slider(s.audio.noteDuration, 0.3, 3, 0.1, (v) => t("settings.seconds", { n: v.toFixed(1) }), (v) =>
          set((x) => ({ ...x, audio: { ...x.audio, noteDuration: v } })),
        ),
      ),
      h(
        "button",
        {
          type: "button",
          class: "btn",
          onClick: async () => {
            await app.audio.unlock();
            await app.audio.ready();
            app.audio.playChord([40, 47, 52, 56, 59, 64], 0, 2.5, { strum: 0.03 });
          },
        },
        "♪ ",
        t("audio.test"),
      ),
      ...audioNotes.map((n) => h("p", { class: "notice" }, "ℹ ", n)),
    );

    const practice = section(
      t("settings.practice"),
      field(
        t("settings.autoAdvance"),
        select(
          (["correct", "always", "off"] as const).map((v) => ({ value: v, label: t(`settings.autoAdvance.${v}`) })),
          s.practice.autoAdvance,
          (v) => set((x) => ({ ...x, practice: { ...x.practice, autoAdvance: v } })),
        ),
      ),
      field(
        t("settings.autoAdvanceDelay"),
        slider(s.practice.autoAdvanceDelayMs, 300, 4000, 100, (v) => t("settings.ms", { n: v }), (v) =>
          set((x) => ({ ...x, practice: { ...x.practice, autoAdvanceDelayMs: v } })),
        ),
      ),
      checkbox(t("settings.adaptive"), s.practice.adaptive, (v) => set((x) => ({ ...x, practice: { ...x.practice, adaptive: v } }))),
    );

    const fileInput = h("input", {
      type: "file",
      accept: "application/json,.json",
      hidden: true,
      onChange: async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        try {
          app.importBackup(await file.text());
          toast(t("settings.importOk"));
        } catch (e) {
          toast(t("settings.importFailed", { error: e instanceof Error ? e.message : String(e) }));
        }
        fileInput.value = "";
      },
    });
    const data = section(
      t("settings.data"),
      h("p", { class: "hint" }, t("settings.dataHint")),
      h(
        "div",
        { class: "row wrap" },
        h(
          "button",
          {
            type: "button",
            class: "btn",
            onClick: () => {
              const blob = new Blob([app.exportBackup()], { type: "application/json" });
              const a = h("a", { href: URL.createObjectURL(blob), download: `fretlab-backup-${new Date().toISOString().slice(0, 10)}.json` });
              document.body.append(a);
              a.click();
              setTimeout(() => {
                URL.revokeObjectURL(a.href);
                a.remove();
              }, 1000);
            },
          },
          "⤓ ",
          t("settings.export"),
        ),
        h("button", { type: "button", class: "btn", onClick: () => fileInput.click() }, "⤒ ", t("settings.import")),
        fileInput,
        h(
          "button",
          {
            type: "button",
            class: "btn danger",
            onClick: () => {
              if (confirm(t("settings.resetConfirm"))) app.resetAll();
            },
          },
          t("settings.resetAll"),
        ),
      ),
    );

    root.append(h("h2", null, t("settings.title")), instrument, fretboard, notation, language, audio, practice, data);
  };

  render();
  // Re-render on changes (keeps focus sensible: only structural changes matter here)
  const unsub = app.onSettingsChange(() => {
    const active = document.activeElement;
    const isSlider = active instanceof HTMLInputElement && active.type === "range";
    if (!isSlider) render();
  });
  return () => {
    unsub();
    root.remove();
  };
}
