# Workout

A mobile-first PWA for logging lifts, tracking bodyweight, and keeping weekly
volume on target per muscle group. No build step, no server, no accounts —
open `index.html` and everything runs from `localStorage`.

## Running it on your phone

The app must be served over HTTP(S) for the service worker to install:

```sh
python3 -m http.server 8000        # from this directory
```

Then on your phone (same Wi-Fi) open `http://<your-computer-ip>:8000` and use
**Add to Home Screen**. It launches full-screen and works offline.

To have it permanently, push this repo and enable GitHub Pages on the branch —
the app is fully static, so the repo root is the site root.

## Screens

- **Home** — bodyweight entry with `−`/`+` steppers to the nearest 0.1 kg, a
  week-over-week trend chip, an SVG trend chart (30d/90d/365d/all), and this
  week's muscle-group summary.
- **Log** — the active workout: per-exercise set tables with each set's previous
  performance, kg/reps cells, a tick to complete, a 🏅 on record sets, an
  auto-starting rest timer, running duration/volume/set totals.
- **Muscles** — the weekly-volume screen. Rolling 7-day fractional set counts
  against a target per muscle group, with what's remaining.
- **History** — every workout, expandable to per-set detail.
- **Settings** — rest length, weekly targets, exercise→muscle mapping, and
  JSON/CSV import + export.

## How muscle credit works

Each *completed* set is split across the muscles the exercise trains, rather
than counted once against a single "primary" muscle. One set of
Incline Bench Press (Dumbbell) counts:

| Muscle | Credit |
| --- | --- |
| Chest | 1.0 |
| Front Delts | 0.5 |
| Triceps | 0.5 |

So a week of heavy pressing correctly shows partial triceps and front-delt
volume instead of leaving them looking untrained. Only ticked sets count;
planned-but-unfinished sets are ignored.

The full mapping for all 32 exercises lives in `js/data/exercises.js` and every
fraction is editable in **Settings → Exercise → muscle mapping** (stored as an
override, so the defaults stay intact).

Weekly targets default to common hypertrophy ranges (12 sets for chest, 10 for
biceps, and so on) and are adjustable per muscle in Settings.

The window is a **rolling 7 days** — always the last 168 hours, so "remaining"
is a live number rather than something that resets to zero every Monday.

## Data

Seeded from a Hevy CSV export: 26 workouts, 492 sets, 29 Jan – 19 Aug 2026.
`tools/gen_seed.py` regenerates `js/data/seed.js` from a CSV; **Settings →
Import Hevy CSV** does the same thing at runtime and skips workouts already
present (matched on start time).

Everything is stored in `localStorage` under a single `workout.v1` key, so
**Settings → Export JSON** is a complete backup and Import restores it. Data
lives on one device only — there is no sync.

## Layout

```
index.html            app shell
manifest.webmanifest  PWA manifest
sw.js                 cache-first service worker
css/app.css
js/app.js             hash router + tab bar
js/store.js           state, persistence, weekly-volume + bodyweight maths
js/ui.js              escaping/formatting helpers, delegated click binding
js/data/exercises.js  muscle groups, targets, exercise→muscle fractions
js/data/seed.js       generated workout history
js/views/*.js         one module per screen: view() + mount()
tools/gen_seed.py     CSV → seed.js
```

Views return HTML strings and bind behaviour through `[data-act]` delegation.
The router mounts each render into a fresh element so listeners never stack.
Cell edits save via `store.updateQuiet()`, which persists without re-rendering —
rebuilding the DOM under a focused input would drop the keyboard mid-entry.
