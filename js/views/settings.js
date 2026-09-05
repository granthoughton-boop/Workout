import * as store from '../store.js';
import * as alerts from '../alerts.js';
import { MUSCLES } from '../data/exercises.js';
import { VERSION_LABEL } from '../version.js';
import { html, raw, fmt, onAct } from '../ui.js';

let editing = null; // exercise name whose muscle map is open

export function view() {
  const s = store.get();
  return html`
    <div class="topbar"><h1>Settings</h1></div>
    <main>
      <div class="card">
        <h2>Rest timer</h2>
        <div class="row">
          <input class="cell" id="rest" type="number" step="15" min="0" max="600" value="${s.restSeconds}" style="width:110px">
          <span class="muted small">seconds between sets</span>
        </div>
        ${raw(alertRows(s))}
      </div>

      <div class="card">
        <h2>Weekly set targets</h2>
        ${raw(MUSCLES.map(m => html`
          <div class="mg"><div class="spread">
            <span class="mg-name">${m.name}</span>
            <div class="row">
              <button class="step" style="width:40px;height:36px" data-act="t-dec" data-m="${m.id}">−</button>
              <b style="min-width:32px;text-align:center">${store.targetFor(m.id)}</b>
              <button class="step" style="width:40px;height:36px" data-act="t-inc" data-m="${m.id}">+</button>
            </div>
          </div></div>`).join(''))}
      </div>

      <div class="card">
        <h2>Exercise → muscle mapping</h2>
        <p class="small muted" style="margin:0 0 10px">Tap an exercise to change how much each set contributes.</p>
        ${raw(store.catalog().map(e => html`
          <div class="mg">
            <button class="hist" data-act="edit" data-n="${e.name}">
              <div class="spread"><span class="mg-name">${e.name}</span><span class="muted">${raw(editing === e.name ? '▴' : '▾')}</span></div>
              <div class="tiny muted" style="margin-top:3px">${raw(Object.entries(e.muscles).sort((a, b) => b[1] - a[1])
                .map(([id, f]) => `${id.replace(/_/g, ' ')} ${f}`).join(' · ') || 'not mapped — counts toward nothing')}</div>
            </button>
            ${raw(editing === e.name ? html`
              <div style="margin-top:10px">
                ${raw(MUSCLES.map(m => html`
                  <div class="spread" style="padding:5px 0">
                    <span class="small">${m.name}</span>
                    <div class="row">
                      ${[0, 0.25, 0.5, 0.75, 1].map(f => html`
                        <button class="btn sm ${(e.muscles[m.id] || 0) === f ? 'primary' : 'ghost'}"
                          style="padding:5px 9px;min-height:30px;font-size:12px"
                          data-act="setfrac" data-n="${e.name}" data-m="${m.id}" data-f="${f}">${f || '–'}</button>`)}
                    </div>
                  </div>`).join(''))}
              </div>` : '')}
          </div>`).join(''))}
      </div>

      <div class="card">
        <h2>Data</h2>
        <div class="small muted" style="margin-bottom:12px">
          ${s.workouts.length} workouts · ${s.weights.length} weight entries. Everything is stored on this
          device only — export regularly if you care about it.
        </div>
        <div class="btn-row" style="margin-bottom:10px">
          <button class="btn ghost" data-act="export">Export JSON</button>
          <button class="btn ghost" data-act="import">Import JSON</button>
        </div>
        <button class="btn ghost" data-act="import-csv" style="margin-bottom:10px">Import Hevy CSV</button>
        <button class="btn ghost danger" data-act="reset">Erase all data</button>
        <input type="file" id="file" accept=".json,.csv" hidden>
      </div>

      <div class="version">Workout &middot; build <b>${VERSION_LABEL}</b></div>
    </main>`;
}

// Whether the alert can actually reach you depends on a permission the phone
// owns, so the row says what the current state really is rather than what the
// setting hopes for.
function alertRows(s) {
  const perm = alerts.permission();
  const on = !!s.restAlerts;
  const status = !on ? 'Off — the rest timer finishes silently.'
    : perm === 'granted' ? 'A beep and a banner at the top of the screen, even when you have switched away.'
    : perm === 'denied' ? 'Beep only. Notifications are blocked for this app in your phone’s settings.'
    : perm === 'unsupported' ? 'Beep only. This browser cannot show notifications.'
    : 'Beep only so far. Allow notifications and the alert can also reach you with the app in the background.';

  return html`
    <div class="alert-row">
      <div class="alert-txt">
        <div class="mg-name">Alert when rest is up</div>
        <div class="tiny muted" style="margin-top:3px">${status}</div>
      </div>
      <button class="btn sm ${on ? 'primary' : 'ghost'}" data-act="alerts-toggle">${on ? 'On' : 'Off'}</button>
    </div>
    ${raw(on && perm === 'default' ? html`
      <button class="btn ghost sm" data-act="alerts-allow" style="width:100%;margin-top:10px">Allow notifications</button>` : '')}
    ${raw(on ? html`
      <button class="btn ghost sm" data-act="alerts-test" style="width:100%;margin-top:10px">Test in 5 seconds</button>
      <div class="tiny muted" style="margin-top:6px">Tap Test, then switch away or lock the phone — the alert should still arrive.</div>` : '')}`;
}

export function mount(root, rerender) {
  const restInput = root.querySelector('#rest');
  restInput.addEventListener('change', () => {
    store.update(s => { s.restSeconds = Math.max(0, parseInt(restInput.value, 10) || 0); });
  });

  const file = root.querySelector('#file');
  let mode = 'json';
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    const text = await f.text();
    try {
      if (mode === 'csv') {
        const added = importCsv(text);
        alert(`Imported ${added} workout${added === 1 ? '' : 's'}.`);
      } else {
        store.replaceState(JSON.parse(text));
        alert('Data restored.');
      }
    } catch (err) {
      alert('Could not read that file: ' + err.message);
    }
    file.value = '';
  });

  onAct(root, {
    'alerts-toggle': async () => {
      const next = !store.get().restAlerts;
      // Asking here rather than at the first rest: this tap is the gesture the
      // phone requires, and it is the moment the user has said they want this.
      if (next && alerts.permission() === 'default') {
        store.updateQuiet(st => { st.alertsAsked = true; });
        await alerts.askPermission();
      }
      store.update(st => { st.restAlerts = next; });
    },
    'alerts-allow': async el => {
      store.updateQuiet(st => { st.alertsAsked = true; });
      el.textContent = 'Waiting for the phone…';
      await alerts.askPermission();
      rerender();
    },
    'alerts-test': el => {
      const label = el.textContent;
      alerts.scheduleRest(Date.now() + 5000, 'This is what a finished rest looks like.');
      el.textContent = 'Alert in 5 seconds…';
      setTimeout(() => { el.textContent = label; }, 6000);
    },
    't-inc': el => bumpTarget(el.dataset.m, 1),
    't-dec': el => bumpTarget(el.dataset.m, -1),
    edit: el => { editing = editing === el.dataset.n ? null : el.dataset.n; rerender(); },
    setfrac: el => {
      const { n, m } = el.dataset;
      const f = Number(el.dataset.f);
      store.update(s => {
        const base = store.findExercise(n).muscles;
        const next = { ...base };
        if (f === 0) delete next[m]; else next[m] = f;
        s.customMuscles[n] = next;
      });
    },
    export: el => exportBackup(el),
    import: () => { mode = 'json'; file.click(); },
    'import-csv': () => { mode = 'csv'; file.click(); },
    reset: () => {
      if (confirm('Erase every workout and weight entry on this device? This cannot be undone.')) {
        localStorage.removeItem('workout.v1');
        location.reload();
      }
    },
  });
}

// Served from a plain web server an anchor download works; inside a sandboxed
// host viewer it silently does nothing, so hand the file over through the host
// when it offers a way to.
async function exportBackup(btn) {
  const filename = `workout-backup-${store.todayKey()}.json`;
  const json = JSON.stringify(store.get(), null, 2);
  const label = btn.textContent;
  const say = t => { btn.textContent = t; setTimeout(() => { btn.textContent = label; }, 2200); };

  const host = typeof claude !== 'undefined' && claude.use
    ? await claude.use('downloads').catch(() => null)
    : null;

  if (host) {
    try {
      await host.save({ filename, data: json });
      say('Saved');
    } catch (err) {
      say(err && err.code === 'declined' ? 'Export cancelled' : 'Export unavailable here');
    }
    return;
  }

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function bumpTarget(id, d) {
  store.update(s => {
    s.targets[id] = Math.max(0, store.targetFor(id) + d);
  });
}

/* ---------- Hevy CSV import ---------- */

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function hevyDate(s) {
  const m = /^(\d{1,2}) (\w{3}) (\d{4}), (\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const mo = MONTHS.indexOf(m[2]);
  if (mo < 0) return null;
  const p = n => String(n).padStart(2, '0');
  return `${m[3]}-${p(mo + 1)}-${p(m[1])}T${m[4]}:${m[5]}:00`;
}

function importCsv(text) {
  const rows = parseCsv(text);
  const header = rows.shift().map(h => h.trim());
  const col = n => header.indexOf(n);
  const need = ['title', 'start_time', 'exercise_title', 'weight_kg', 'reps'];
  for (const n of need) if (col(n) < 0) throw new Error(`missing column "${n}"`);

  const byStart = new Map();
  for (const r of rows) {
    if (!r[col('start_time')]) continue;
    const start = hevyDate(r[col('start_time')]);
    if (!start) continue;
    if (!byStart.has(start)) {
      byStart.set(start, {
        id: 'imp-' + start,
        title: r[col('title')] || 'Workout',
        start,
        end: (col('end_time') >= 0 && hevyDate(r[col('end_time')] || '')) || start,
        exercises: [],
      });
    }
    const w = byStart.get(start);
    const name = r[col('exercise_title')];
    let ex = w.exercises.find(e => e.name === name);
    if (!ex) { ex = { name, notes: (col('exercise_notes') >= 0 ? r[col('exercise_notes')] : '') || '', sets: [] }; w.exercises.push(ex); }
    ex.sets.push({ w: parseFloat(r[col('weight_kg')]) || 0, r: parseInt(r[col('reps')], 10) || 0, done: true });
  }

  let added = 0;
  store.update(s => {
    const seen = new Set(s.workouts.map(w => w.start));
    for (const w of byStart.values()) {
      if (seen.has(w.start)) continue;
      s.workouts.push(w);
      added++;
    }
    s.workouts.sort((a, b) => a.start.localeCompare(b.start));
    // Any exercise name the catalog doesn't know still needs to exist so it can be mapped.
    const known = new Set(store.catalog().map(e => e.name));
    for (const w of s.workouts) for (const e of w.exercises) {
      if (!known.has(e.name)) { s.customExercises.push({ name: e.name, muscles: {} }); known.add(e.name); }
    }
  });
  return added;
}
