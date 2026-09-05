# Working on this repo

## Shipping

Push finished work straight to `main`. Every push to `main` deploys to GitHub
Pages, so main is the app on the phone — that is the point, not an accident.
No pull request unless asked for one.

Rolling back is a revert and a push: about thirty seconds to redeploy, and the
service worker fetches app code network-first and reloads the page when the new
worker takes over, so an installed app picks up the revert the next time it is
opened. That is what makes shipping directly reasonable.

The exception is data. Workouts live in `localStorage` under `workout.v1` on the
user's phone, and reverting code does not un-write what a bad build saved.
Anything that changes the shape of stored state, the seeding logic in
`applySeed`, or the CSV/JSON import path is worth flagging before it ships,
because a backup export is the only way back from it.

## Before pushing

`node tools/build_site.mjs _site` catches a service worker precaching a file
that isn't shipped, a manifest icon that would 404, and a missing module. It
does not catch anything about behaviour, so drive the change in a real browser
too — Playwright with `/opt/pw-browsers/chromium-*/chrome-linux/chrome` against
`python3 -m http.server` over the built `_site`, which is the only way to
exercise the service worker and the install path. Check the console is clean
while you are there.
