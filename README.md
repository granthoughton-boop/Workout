# Workout

A mobile-first PWA for logging lifts, tracking bodyweight, and keeping weekly
volume on target per muscle group. No build step, no server, no accounts —
open `index.html` and everything runs from `localStorage`.

## Installing it on your phone

The one hard requirement is **HTTPS** (or `localhost`). Service workers refuse
to register on a plain `http://192.168.x.x` LAN address, and without a service
worker there is no offline support and Android will only make a bookmark
shortcut instead of installing the app.

### GitHub Pages (automatic)

`.github/workflows/deploy.yml` deploys on every push to `main`, so once it is
set up you never touch it again.

1. **Settings → Pages → Source: GitHub Actions** (one time).
2. Push to `main`.
3. Open `https://<user>.github.io/Workout/` on your phone.

Each run builds the site with `tools/build_site.mjs` and fails rather than
deploying if the service worker precaches a file that is not shipped, a
manifest icon would 404, or an imported module is missing — the failures that
break an installed app silently instead of visibly. Run the same check locally
with:

```sh
node tools/build_site.mjs
```

Only the app's runtime files are deployed; `tools/`, `data/` and the
single-file build stay out of the published site.

Then:

- **iOS Safari** — Share → *Add to Home Screen*. (Must be Safari; Chrome on iOS
  cannot install web apps.)
- **Android Chrome** — ⋮ → *Install app* / *Add to Home screen*.

It launches full-screen with no browser chrome and runs offline afterwards.

Note that anything served from Pages is public, including the workout history
baked into `js/data/seed.js`. Use a private host if that matters to you.

### Testing on your machine

```sh
npm start                  # python3 -m http.server 8000
```

`http://localhost:8000` is treated as a secure origin, so the service worker
and install prompt both work there — but only on that machine, not from your
phone over the LAN.

## Regenerating the icons

`icon.svg` is the source; the PNGs in `icons/` are generated from it:

```sh
npm i && node tools/gen_icons.mjs
```

They are not optional — iOS ignores an SVG `apple-touch-icon` and falls back to
a screenshot of the page, and Android wants a raster icon of at least 192px
before it will offer to install.

## Screens

- **Home** — bodyweight entry with `−`/`+` steppers to the nearest 0.1 kg, a
  week-over-week trend chip, an SVG trend chart (30d/90d/365d/all), and this
  week's muscle-group summary.
- **Log** — the active workout: a collapsible **what to train next** panel at the
  top, then per-exercise set tables with each set's previous performance,
  kg/reps cells, a tick to complete, a 🏅 on record sets, an auto-starting rest
  timer, running duration/volume/set totals.
- **Muscles** — the weekly-volume screen. Rolling 7-day fractional set counts
  against a target per muscle group, with what's remaining.
- **History** — every workout, expandable to per-set detail.
- **Settings** — rest length, weekly targets, exercise→muscle mapping, JSON/CSV
  import + export, and the build id at the bottom.

## Versioning

`tools/build_site.mjs` hashes everything it ships and stamps that value into
both the service worker's cache name and `js/version.js`, which Settings
displays. The two cannot drift: the build shown in the app *is* the build
running, so "did my update land?" is answered by looking rather than guessing.
Served straight from the repo the placeholder survives and reads as `dev`.

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

Eleven groups are tracked: Chest, Biceps, Triceps, Side Delts, Back, Rear
Delts, Traps, Quads, Hamstrings, Glutes, Core — listed in priority order, so
the top of the screen is the work that matters most. A group earns its place
only if you would actually program work for it — muscles that only ever come along for the ride
(forearms under every curl, front delts under every press) made the list longer
without ever changing a training decision, so they are not tracked. Lats, upper
back and traps are one Back number; abs and lower back are one Core number.

Targets are budgeted against a real week rather than picked per muscle in
isolation, since fractional credit means the totals have to fit the sets you
actually do. They sum to 89 credits.

Calf Press is not in the catalog: calves are not tracked, so it would have been
invisible work. Add it back by creating it in the exercise picker and mapping
it in Settings.

The full mapping for all 32 exercises lives in `js/data/exercises.js` and every
fraction is editable in Settings (stored as an override, so the defaults stay
intact). Weekly targets default to common hypertrophy ranges and are adjustable
per muscle.

### What to train next

The Log screen ranks the five exercises whose next set would close the most of
your weekly gap. Each contribution is capped at what is still needed (credit
past a target is worth nothing) and weighted by how far behind that muscle is,
so a group at 0/12 pulls harder than one at 11/12.

It ranks against the window as it will stand **tomorrow**, not today. In a
rolling window, credit earned seven days ago ages out overnight, so a muscle can
read as satisfied and be short by morning. When that is about to happen the
panel says how much is leaving and from where. It recomputes on every render, so
ticking a set reorders it mid-session, and tapping a row adds that exercise —
or another set of it if it is already in the workout.

The window is a **rolling 7 days** — always the last 168 hours, so "remaining"
is a live number rather than something that resets to zero every Monday.

## Data

Seeded from `data/hevy-export.csv`: 27 workouts, 513 sets, 29 Jan – 30 Aug 2026.

To take in a newer export, drop it over `data/hevy-export.csv` and run:

```sh
python3 tools/gen_seed.py
```

Workout ids are derived from the start time, so re-exporting keeps existing ids
stable. The app records which seed workouts it has already offered, so an
install that already has the old history picks up only the genuinely new
workouts — and anything you deleted stays deleted. **Settings → Import Hevy
CSV** does the same job at runtime without regenerating the file.

Everything is stored in `localStorage` under a single `workout.v1` key, so
**Settings → Export JSON** is a complete backup and Import restores it. Data
lives on one device only — there is no sync.

## Layout

```
index.html            app shell
icons/                generated PNG home-screen icons
data/hevy-export.csv  source export for the seeded history
manifest.webmanifest  PWA manifest
sw.js                 cache-first service worker
css/app.css
js/app.js             hash router + tab bar
js/version.js         build id, stamped at deploy time
js/store.js           state, persistence, weekly-volume + bodyweight maths
js/ui.js              escaping/formatting helpers, delegated click binding
js/data/exercises.js  muscle groups, targets, exercise→muscle fractions
js/data/seed.js       generated workout history
js/views/*.js         one module per screen: view() + mount()
tools/gen_seed.py     CSV -> seed.js
tools/gen_icons.mjs   icon.svg -> icons/*.png
tools/build_singlefile.mjs  bundle everything into one HTML file
tools/build_site.mjs  assemble + verify the deployable site
.github/workflows/    deploy to GitHub Pages on push to main
```

Views return HTML strings and bind behaviour through `[data-act]` delegation.
The router mounts each render into a fresh element so listeners never stack.
Cell edits save via `store.updateQuiet()`, which persists without re-rendering —
rebuilding the DOM under a focused input would drop the keyboard mid-entry.
