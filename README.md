# Fretlab

Ear and fretboard trainer for 6-, 7- and 8-string guitars (standard, drop and later custom tunings).
Runs entirely in the browser, works offline as an installable PWA, and needs no backend.

**Live:** https://anschae.github.io/fretlab/

Status and roadmap: [PROGRESS.md](PROGRESS.md). Full specification: [SPEC.md](SPEC.md).

## Run locally

```bash
npm install
npm run dev        # http://localhost:5173/fretlab/
npm test           # Vitest (music theory, generators, storage, DSP)
npm run lint
npm run build      # static site in dist/
npm run preview    # serve dist/ at http://localhost:4173/fretlab/
```

Node 20 or newer.

## Deploy (GitHub Pages)

Every push to `main` runs `.github/workflows/deploy.yml` (lint → test → build → deploy).

One-time setup in the repository: **Settings → Pages → Build and deployment → Source: “GitHub Actions”**.

The app is served from `/fretlab/`; Vite's `base`, the service-worker scope and the manifest `start_url` all use that path (see `vite.config.ts`).
If the repository is renamed, change `BASE` there.

## Architecture in one minute

```
src/core/        pure music theory (no DOM), fully unit-tested
src/audio/       AudioEngine, Instrument interface, Karplus-Strong synth (AudioWorklet + fallback)
src/exercises/   one folder per exercise + registry.ts
src/ui/          DOM helpers, components (Fretboard, AnswerButtons …), ExerciseRunner, app shell
src/state/       settings, statistics, versioned storage with migrations + backup
src/i18n/        en.ts / de.ts (exercises bring their own strings)
src/data/        editable data files (e.g. interval reference songs)
```

The full “how to add an exercise / tuning / chord type / scale” guide follows in step 15.
Short version for an exercise: create `src/exercises/my-exercise/index.ts` exporting a
`defineExercise({...})` object (see `src/exercises/types.ts`), then add one import and one line to
`src/exercises/registry.ts`. Navigation, routing and the statistics page pick it up automatically.

## Browser notes

- Click-based exercises: current Chrome, Edge, Firefox and Safari (desktop and mobile).
- On iPhone/iPad the silent switch can mute web audio.
- Settings and statistics live in `localStorage`. Export a backup now and then (Settings → Your data); Safari in particular can clear storage.
