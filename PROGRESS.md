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

## TODO (from feedback, not yet implemented)

- [ ] Note names: English convention (B, B♭) by default, even when the UI language is German (currently the German UI defaults to German H/B). Adjust `defaultSettings()` in `src/state/settings.ts` and its test.
- [ ] GitHub Actions: update actions to versions that run on Node 24 (deprecation warning for Node 20).
- [ ] **Show all notes (practice tool):** pick a note → every position of that note is shown on the fretboard (active tuning, global fret range). Implement as a `Tool` (`src/tools/note-finder/`), registered in the registry like an exercise.
- [ ] **Find all notes (quiz):** the app picks a note, the user must click it *everywhere* on the fretboard. Already exists as mode "Find all" in `fretboard-find-note` (default frets 0–12). To do: make it easier to find (e.g. its own entry on the home page instead of a hidden mode) and consider defaulting to the whole neck.
