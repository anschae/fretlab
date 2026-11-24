# Progress

Source of truth: [SPEC.md](SPEC.md).

| Step | What | Status |
|---|---|---|
| 1 | Project setup (Vite, TS strict, ESLint, Vitest, Pages workflow, PWA) | done |
| 2 | `core/` + unit tests (pitch, intervals, chords, scales, tuning + drop, fretboard, notation EN/DE, RNG) | done — patterns/progressions/rhythm come with their modules |
| 3 | Audio engine + Karplus-Strong (AudioWorklet, buffer fallback, tuning tests E1–E6) | done |
| 4 | App shell, settings page, i18n (EN+DE), storage with migrations + backup export/import, registry, ExerciseRunner | done |
| 5 | Fretboard SVG component (any string count, fret range, orientation, left-handed, markers, click + keyboard, labelled marks) | done |
| 6 | Modules 1 (interval-ear), 2a (fretboard-name-note), 2b (fretboard-find-note: single / find all / timed) | done |
| — | **Stopped for feedback** — try the first modules on the guitar | ← here |
| 7 | Chord core + chord JSON data + chord modules | next after feedback |

## Notes for the review

- Verified in headless Chrome: all three exercises, German H/B naming, 8-string Drop E, left-handed + lowest-string-on-top, timed mode, find-all, keyboard navigation, phone portrait/landscape, offline reload via the service worker.
- The AudioWorklet synth was rendered offline in Chrome: sample-accurate onset and correct pitch from E1 (41 Hz) to E6.
- Not testable here: how the synth *sounds* to you, Safari/iOS behaviour, and touch feel on a real phone — that's what the feedback round is for.
- Interval reference songs are in `src/data/interval-hints.json` (editable).
