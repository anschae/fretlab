# Build "Fretlab" — a browser-based ear & fretboard trainer for guitarists

**Repository:** https://github.com/anschae/fretlab (already exists — work in this repo)
**Live site (GitHub Pages):** https://anschae.github.io/fretlab/

## Goal
Build a static, client-side web app that helps a guitarist train:
1. **Interval recognition by ear**
2. **Fretboard note knowledge** (both directions: name the note ↔ find the note)
3. **Chords** (shapes, chord tones, chord quality by ear)
4. Plus: interval shapes, scales & modes, triads, chord progressions by ear, rhythm & odd meters, melodic dictation, and a microphone mode for answering on a real guitar

The app must work for **6-, 7- and 8-string guitars** in standard tuning, with an optional **drop tuning** (lowest string lowered by 2 semitones). Most importantly, the code must be **cleanly modular so new exercises, tunings, chord types and languages can be added without touching existing modules**.

---

## Tech stack & constraints
- **TypeScript (strict)** + **Vite**. No backend; everything runs in the browser.
- UI: plain TypeScript with small components, **or** a lightweight framework (Svelte or Preact). Pick one and use it consistently. No heavy UI kits.
- Fretboard and chord diagrams are rendered as **SVG** (crisp, scalable, clickable).
- Audio: **Web Audio API**. Default instrument is a **Karplus-Strong plucked-string synth** in an AudioWorklet, so no sample files are needed. It must sound good down to E1 (8-string Drop E). Put the instrument behind an interface so a sample-based instrument can be added later.
- Persistence: `localStorage` only (settings + statistics), behind a small storage service with a **schema version and migrations**, so later updates never break saved data. Add **export/import of all settings and stats as a JSON file** (browsers can clear storage, Safari in particular).
- Tests: **Vitest** for all music-theory and question-generation logic.
- Deployment: build to static files; include a **GitHub Actions workflow that deploys to GitHub Pages**. Set Vite's `base` to `/fretlab/` and make the service worker scope and manifest `start_url` match it. In the repo settings, Pages must use **"GitHub Actions"** as the source; mention this in the README.
- **PWA**: installable (web app manifest, icons) and **fully usable offline** via a service worker that precaches the build (e.g. `vite-plugin-pwa`). Show a small "new version available — reload" notice when an update is deployed.

### Browser support
- Target the current versions of **Chrome, Edge, Firefox and Safari** on macOS and Windows, plus Safari on iOS and Chrome on Android.
- Click-based exercises must work everywhere. For microphone mode, Chrome/Edge are the reference browsers; Safari and Firefox should work but may be less reliable. Show a short notice in the microphone settings.
- On iOS, mention that the silent switch can mute web audio.
- Feature-detect (AudioWorklet, `getUserMedia`, `setSinkId`) and degrade gracefully with a clear message instead of failing silently.
- Responsive: usable on a laptop and on a phone (landscape for the fretboard). Keyboard shortcuts on desktop.
- Accessibility: no information conveyed by color alone (also use labels/icons for correct/wrong); buttons reachable by keyboard.

---

## Architecture (the most important part)

```
src/
  core/                 # pure logic, no DOM, fully unit-tested
    pitch.ts            # Note, PitchClass, MIDI <-> frequency, transposition
    intervals.ts        # interval definitions (semitones, names, short labels)
    chords.ts           # chord type definitions (formula as intervals)
    scales.ts           # scale/mode formulas
    patterns.ts         # 3NPS / CAGED / triad-voicing generators
    progressions.ts     # Roman-numeral -> chords in a key
    rhythm.ts           # meters, groupings, polyrhythm math
    tuning.ts           # Tuning model + registry
    fretboard.ts        # position <-> pitch, find all positions of a pitch class
    notation.ts         # note naming: sharps/flats, English vs German (H/B)
    random.ts           # seedable RNG, weighted picking (for adaptive practice)
  audio/
    Instrument.ts       # interface: playNote(midi, time, duration), playChord(...)
    KarplusStrong.ts
    AudioEngine.ts      # context unlock on first user gesture, master volume
    Scheduler.ts        # sample-accurate look-ahead scheduler
    PitchDetector.ts    # YIN pitch detection (AudioWorklet) for microphone mode
  ui/
    components/         # Fretboard.svg component, ChordDiagram, AnswerButtons, Feedback, StatsBar ...
    layout/             # app shell, navigation, settings panel
  exercises/
    types.ts            # Exercise interface (see below)
    registry.ts         # exercises register themselves here
    interval-ear/
    fretboard-name-note/
    fretboard-find-note/
    chord-*/            # see chord modules below
    ...                 # one folder per module/exercise (scales-*, triads, rhythm-*, ...)
  tools/                # non-quiz tools: chord library, scale viewer, metronome, tuner
  i18n/
    en.ts, de.ts        # all UI strings; no hard-coded text in components
  state/
    settings.ts         # global settings (tuning, notation, language, handedness ...)
    stats.ts            # per-exercise, per-item statistics
```

### Exercise plugin interface
Every exercise is a self-contained module implementing something like:

```ts
interface Exercise<Q, A, S> {
  id: string;                       // "interval-ear"
  titleKey: string;                 // i18n key
  category: "ear" | "fretboard" | "chords" | "scales" | "rhythm" | "theory";
  answerModes: ("click" | "audio")[];  // "audio" = microphone mode, see module 4
  defaultSettings: S;
  renderSettings(container, settings: S, onChange): void;
  generateQuestion(ctx: ExerciseContext, settings: S): Q;  // ctx = tuning, rng, stats, audio
  renderQuestion(container, q: Q, ctx): void;
  checkAnswer(q: Q, a: A): { correct: boolean; correctAnswer: A; explanation?: string };
  statKey(q: Q): string;            // e.g. "m3" or "string3-fret5" for weak-spot tracking
}
```

- Some questions take several inputs before they are complete ("find all Cs", build a chord, melodic dictation). Support this with partial answers: `checkPartial(q, partial)` returns progress and per-input feedback; the runner only scores the question when it is complete or the user gives up.
- Non-quiz **tools** (chord library, scale viewer, metronome, tuner) use a simpler `Tool` interface (`id`, `titleKey`, `category`, `render(container, ctx)`) and live in the same registry and navigation.
- Adding a new exercise = adding one folder + one line in `registry.ts`. The navigation and stats pages are generated from the registry.
- `generateQuestion` must be **pure given the RNG** so it can be unit-tested with a fixed seed.
- Shared flow (next question, score, streak, replay, show solution, keyboard shortcuts) lives in a generic **ExerciseRunner**, not in each exercise.

### Tuning model
```ts
interface Tuning {
  id: string;            // "8-drop"
  name: string;          // "8-string Drop E"
  strings: number[];     // MIDI notes, lowest string first
}
```
- Generate the standard tunings from data:
  - 6-string standard: E2 A2 D3 G3 B3 E4
  - 7-string standard: B1 E2 A2 D3 G3 B3 E4
  - 8-string standard: F#1 B1 E2 A2 D3 G3 B3 E4
- **Drop option**: lowest string −2 semitones (→ Drop D, Drop A, Drop E). Implement it as a transform (`dropLowest(tuning, 2)`), not as hard-coded copies.
- **Custom tunings** (see the section near the end) are just more `Tuning` objects in the registry; no module may need code changes to support them.
- Every fretboard-related exercise reads the active tuning from the context; nothing assumes 6 strings.

### Note naming (notation.ts)
- Setting: **English (B, Bb)** vs **German (H, B)**. Important: the user is in Switzerland.
- Setting: prefer sharps / prefer flats / mixed (context-dependent, e.g. for chord roots).
- Enharmonic equivalence: when the user answers a note-name question, C# and Db are both correct unless the exercise explicitly asks for a spelling.

---

## Global settings
- Instrument: 6 / 7 / 8 strings, standard or drop
- Fret range for fretboard exercises (default 0–12, max 24)
- Notation: English / German; sharps / flats
- UI language: English / German (i18n from day one)
- Fretboard orientation: lowest string at bottom (like looking down at the guitar / like tab) or at top; **left-handed** mirror option
- Fret markers (dots at 3, 5, 7, 9, 12 …) on/off — turning them off makes the exercise harder
- Volume, note duration
- Settings persist in `localStorage`

---

## Module 1 — Interval ear training (`interval-ear`)
- The app plays **two notes**; the user picks the interval from buttons (m2, M2, m3, M3, P4, TT, P5, m6, M6, m7, M7, P8).
- **The root changes randomly every question** (no fixed reference pitch).
- Notes must lie within the playable range of the active tuning (lowest open string up to the highest string at the max fret).
- Settings:
  - Which intervals are included (checkboxes + presets: "Beginner: P4 P5 P8", "All simple intervals", later "Compound up to 2 octaves")
  - Direction: ascending / descending / harmonic (simultaneous) / random
  - Tempo between notes
- Controls: **Replay**, play root only, play interval again after answering (to compare a wrong answer with the correct one: "You chose M3, this is M3 — this was m3")
- Optional reference hints (e.g. "P4 = 'Here Comes the Bride'"): put these in a data file the user can edit; don't hard-code them in the logic.
- Optional: after answering, show both notes on the fretboard.

## Module 2a — Name the note (`fretboard-name-note`)
- Show the fretboard of the active tuning. **Highlight one position** (any string, fret within the configured range, default 0–12).
- The user picks the note name from 12 buttons (spelled according to the notation settings).
- Settings: which strings are included (e.g. "only the 7th and 8th string" — very useful for extended-range players), fret range, natural notes only / all notes.
- Optional: play the note when the question appears or after answering.

## Module 2b — Find the note (`fretboard-find-note`)
- The app asks e.g. **"Find E on the G string"**; the user clicks the fret.
- Variant **"Find all"**: "Find every C between fret 0 and 12" — the user clicks all positions; done when all are found or the user gives up.
- Variant **"Timed"**: as many correct answers as possible in 60 s.
- Same string/fret/natural-notes settings as 2a.

## Module 3 — Chords
Build these as separate exercises that share a `chords` core:
- **Chord library viewer** (not a quiz): pick root + chord type → show common voicings as chord diagrams and on the full fretboard; play it (strummed). Voicings come from a **JSON data file** (open chords, E-/A-shape barre chords, drop-2/drop-3, power chords; for 7/8 strings also extended-range power chords and drop-tuning one-finger shapes). Add new chord types and voicings by editing data, not code.
- **Name that chord** (`chord-name-shape`): a voicing is shown → pick root + quality.
- **Build the chord** (`chord-build`): "Show Cmaj7 between frets 7–10" → the user clicks notes; the app validates against the chord's pitch classes (any correct voicing counts, the chord's root must be the lowest note if "root position" is enabled).
- **Chord tones** (`chord-tones`): a chord shape is shown; the user clicks the root / 3rd / 5th / 7th as asked. Great for learning *why* shapes work.
- **Chord quality by ear** (`chord-ear`): a chord is played (random root) → major / minor / dim / aug / maj7 / 7 / m7 / m7b5 / sus2 / sus4 (configurable subset).

Chord types are defined only as interval formulas in `core/chords.ts`, e.g. `{ id: "m7", intervals: [0, 3, 7, 10], symbol: "m7" }`.

---

## Statistics & adaptive practice
- Track per exercise and per `statKey`: attempts, correct, average response time, last seen.
- **Adaptive mode** (toggle): weight question generation toward items with low accuracy or slow responses (simple weighted random or a lightweight spaced-repetition scheme).
- Stats page:
  - Overall accuracy per exercise
  - **Fretboard heatmap**: every string/fret cell colored by accuracy (with numeric values on hover/tap, not color only)
  - Interval confusion matrix (which interval is mistaken for which)
- Reset stats per exercise.

---

## UX details
- Instant feedback (correct/wrong + correct answer), then auto-advance after a short delay (configurable) or on keypress.
- Keyboard: Space = replay, Enter = next, number keys / letters for answer buttons (C D E F G A B/H, with modifiers or a second row for accidentals).
- Score, streak and session accuracy always visible.
- The audio context must be started on the first user interaction (browser autoplay rules) — show a "Tap to start" overlay if needed.
- Clean, dark-friendly design; the fretboard should look like a fretboard (wood, frets, inlays) without being kitsch.

---

## Module 4 — Microphone mode (play on your real guitar)
A cross-cutting **answer mode**, not a single exercise: the user *plays* the answer on a real guitar and the app detects it.
- `audio/PitchDetector.ts`: monophonic pitch detection with the **YIN algorithm** in an AudioWorklet (`getUserMedia`, echo cancellation / noise suppression / auto gain **off**).
- Robust note onset: an RMS threshold plus a stable pitch for ~80–150 ms before accepting a note; ignore the decaying tail of the previous note.
- Must track down to **F#1 (~46 Hz)** for 8-string standard and **E1 (~41 Hz)** for 8-string Drop E: use a large enough analysis window and test the low range explicitly.
- Tolerance setting in cents (default ±35 cents); octave-agnostic or octave-exact, depending on the exercise.
- Calibration screen: input level meter, live tuner display (note + cents), choice of input device (audio interface), and **choice of input channel** (left/right or channel 1/2, via a ChannelSplitter). Browsers usually expose only the first two channels of an interface, and a guitar on input 2 must still work.
- **Latency calibration** (shared with module 9): the app plays clicks and the user taps or plays along; the app measures the average offset and stores it. Also use `AudioContext.outputLatency` / `baseLatency` where available. Apply the offset to all timing measurements.
- Exercises declare `answerModes` (see the Exercise interface). Exercises that support audio answers:
  - Find the note: "Play E on the G string". Pitch detection can't tell which string was played, so octave-exact means the exact pitch at that position (any string producing that pitch counts); octave-agnostic means any E
  - Interval ear: hear the interval, then play the second note relative to a given root
  - Melodic dictation: play the melody back
  - Scales: play the scale up/down; the app checks note by note
- Show a clear hint that headphones are needed when the app plays audio while listening (otherwise it hears itself).

## Module 5 — Interval shapes on the fretboard (`interval-shapes`)
- The app marks a **root** on the fretboard: "Click the major 6th" → the user clicks a position.
- Settings: which intervals; on the same string / on adjacent strings / anywhere within ±4 frets; above or below the root.
- Every correct position counts (there are often several); after answering, show **all** valid positions nearby.
- Explicitly cover the **G→B string offset** (major 3rd instead of a 4th), and on 7/8 strings the low strings.
- Reverse variant: two positions are marked → name the interval.

## Module 6 — Scales & modes (`scales-*`)
Scale and mode definitions live in `core/scales.ts` as interval formulas (major, natural/harmonic/melodic minor, the 7 modes, major/minor pentatonic, blues, whole tone, diminished; Phrygian dominant and Hungarian minor are welcome for metal).
- **Scale viewer** (not a quiz): pick root + scale + pattern system → highlight the notes on the full fretboard of the active tuning, label them by note name **or** by scale degree (1, b3, 5 …), play it.
- Pattern systems (as generators, not hard-coded per tuning):
  - **3-notes-per-string (3NPS)**, which naturally extends to 7 and 8 strings
  - **CAGED** (6-string concept; on 7/8 strings, extend the shapes onto the low strings)
  - Whole-neck view
- **Scale degree quiz**: a scale pattern is shown, one note is highlighted → name the degree; or "click every b6 in this pattern".
- **Complete the pattern**: part of a 3NPS pattern is shown → click the missing notes.
- **Mode by ear**: a mode is played over a drone of its root → identify it (Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian; configurable subset).

## Module 7 — Triads & inversions (`triads`)
- Triads (major, minor, diminished, augmented) in root position, 1st and 2nd inversion on **every set of three adjacent strings** of the active tuning (also the low string sets on 7/8 strings).
- Viewer: root + quality + string set → show all three inversions along the neck.
- Quiz variants: "Which inversion is this?", "Build a 1st-inversion D minor on strings 4–3–2", "Name the triad".
- Voicings are **generated** from the chord formula and the tuning (search for playable shapes within a 4–5 fret span), not stored as data.

## Module 8 — Chord progressions by ear (`progression-ear`)
- The app plays a short progression (3–5 chords) in a random key → the user enters the **Roman numerals** (I ii iii IV V vi vii°, plus optional bVII, bVI, bIII for rock/metal and V/V etc. later).
- Settings: major / minor key; which chords are allowed; presets from easy (I, IV, V) to hard; tempo; voicing style (piano-like block chords via the synth, or guitar-strummed).
- Always play the **tonic chord first** as a reference (optional cadence I–IV–V–I to set the key).
- After answering, show the progression in the current key with chord names and allow replaying chord by chord.
- Progressions come from a JSON file of common patterns plus a random generator with simple voice-leading rules.

## Module 9 — Rhythm & odd meters (`rhythm-*`)
Important for prog/djent: odd meters and polyrhythms.
- `audio/Scheduler.ts`: a **sample-accurate look-ahead scheduler** (Web Audio clock, not `setInterval`), shared with the metronome.
- **Metronome tool** (not a quiz): BPM, time signature (any `n/4`, `n/8`, `n/16`), **accent grouping** (e.g. 7/8 as 2+2+3 or 3+2+2), subdivision, a different click sound for accents, tap tempo, and optional **meter changes** over a sequence of bars (e.g. 2 bars 4/4, 1 bar 7/8, repeat).
- **Identify the meter**: an accented click or drum pattern is played → pick the meter and grouping (5/8 = 3+2 or 2+3, 7/8, 9/8, 11/8, 7/16 …).
- **Polyrhythms**: two layers with different pitches (3:2, 4:3, 5:4, 7:4 …) → identify the ratio; viewer mode shows both layers as a circular or linear visualisation.
- **Tap along**: the user taps a key (or plays a note in microphone mode) along with a pattern; the app shows timing accuracy in ms (early/late per hit), corrected by the stored latency offset (see module 4). Use `event.timeStamp` mapped to the audio clock, not the time the handler runs.

## Module 10 — Melodic dictation (`melodic-dictation`)
- The app plays a melody of 3–8 notes (configurable) in a random key, within a configurable range (e.g. one octave, or "only on strings 1–3").
- Settings: diatonic / pentatonic / chromatic; step-wise motion only vs. leaps allowed; play the tonic first as reference; number of replays allowed.
- The user enters the notes by clicking them on the fretboard (octave-exact or octave-agnostic, configurable) or plays them back in microphone mode.
- Feedback note by note: correct notes green, wrong ones red **with symbols**, and the correct melody shown on the fretboard.

## Custom tunings
- A tuning editor in the settings: enter notes like `D A D G B E` or `C# F# B E A D G# C#`, or pick from presets (whole-step down, Drop C, Drop B, Drop C# on 7 strings, …).
- Drop amount configurable (default −2 semitones).
- Custom tunings are stored in `localStorage` and appear in the tuning picker; every module must work with them.

---

## How to work
- Save this prompt as `SPEC.md` in the repository and treat it as the source of truth. Keep a short `PROGRESS.md` with what is done and what is next.
- Before writing code, propose the folder structure, the framework choice (plain TS / Svelte / Preact) with a one-line reason, and the final `Exercise`/`Tool` interfaces. Then start.
- **After step 6, stop and wait for my feedback** before continuing, so I can try the first modules on my guitar.
- If something in this spec turns out to be impractical in the browser, say so and suggest an alternative instead of silently dropping it.

## Deliverables & order of work
1. Project setup (Vite, TS strict, linting, Vitest, GitHub Pages workflow, PWA setup).
2. `core/` with complete unit tests (pitch math, tunings incl. drop transform, fretboard position lookup for 6/7/8 strings, note naming in English and German, interval and chord definitions).
3. Audio engine + Karplus-Strong instrument.
4. App shell, settings panel, i18n (EN + DE), exercise registry and generic ExerciseRunner.
5. Fretboard SVG component (configurable strings, fret range, orientation, left-handed, clickable, highlight states).
6. Modules 1, 2a, 2b.
7. Chord core + chord JSON data + the chord modules.
8. Statistics, heatmap, adaptive mode.
9. Module 5 (interval shapes) and module 7 (triads).
10. Module 6 (scales & modes), including the 3NPS and CAGED generators.
11. Look-ahead scheduler, metronome and module 9 (rhythm & odd meters).
12. Module 8 (chord progressions) and module 10 (melodic dictation).
13. Pitch detector, calibration screen and microphone answer mode (module 4), then enable it in the supporting exercises.
14. Custom tuning editor.
15. README: how to run, build, deploy, and a short **"How to add a new exercise / tuning / chord type / scale"** guide with a minimal example exercise.

Commit after each step, keep `npm test` green throughout, and keep every step working in the deployed app before starting the next one.

## Acceptance criteria
- Switching between 6, 7, 8 strings and drop tuning instantly updates every exercise; questions never reference strings or pitches that don't exist.
- Drop tunings produce exactly: Drop D (D2 A2 D3 G3 B3 E4), Drop A (A1 E2 A2 D3 G3 B3 E4), Drop E (E1 B1 E2 A2 D3 G3 B3 E4).
- German notation shows H for B-natural and B for B-flat everywhere (buttons, prompts, chord names).
- Interval questions use a different random root each time and stay within the instrument's range.
- `npm test` passes; `npm run build` produces a static site that works when opened from GitHub Pages.
- A new dummy exercise can be added by creating one folder and one registry line, as shown in the README.
- Scale patterns (3NPS, CAGED) and triad voicings are generated correctly for 6, 7 and 8 strings and for custom tunings (unit-tested).
- The metronome stays in time (no audible drift over 5 minutes) and accents odd groupings such as 7/8 = 2+2+3 correctly.
- The pitch detector correctly identifies open low strings down to E1 and the 24th fret of the high E string with a real guitar via an audio interface.
- The installed PWA works offline (all modules except microphone permission prompts need no network).
- Stats and settings survive an app update (schema migration) and can be exported and re-imported.