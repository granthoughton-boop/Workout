import * as store from '../store.js';
import { html, raw, fmt, duration, clock, ago, onAct } from '../ui.js';

let rest = null;      // { endsAt, total }
let restTimerId = null;
let picking = false;
let coachOpen = false;
let query = '';
let rerenderRef = () => {};

export function view() {
  const s = store.get();
  if (!s.active) return idle(s);

  const w = s.active;
  const v = store.volumeOf(w);

  return html`
    <div class="topbar">
      <h1>Log Workout<span class="sub">${w.title}</span></h1>
      <button class="pill" data-act="rest-open">Rest ${clock(s.restSeconds)}</button>
      <button class="btn primary sm" data-act="finish">Finish</button>
    </div>
    <div class="stats">
      <div><div class="k">Duration</div><div class="v accent" id="dur">${duration(w.start, null)}</div></div>
      <div><div class="k">Volume</div><div class="v" id="vol">${v.kg.toLocaleString()} kg</div></div>
      <div><div class="k">Sets</div><div class="v" id="nsets">${v.sets}</div></div>
    </div>
    <main>
      ${raw(coach())}
      ${raw(w.exercises.map((ex, i) => exerciseBlock(ex, i, w.id)).join(''))}
      ${raw(w.exercises.length ? '' : '<div class="empty">Add your first exercise to start logging.</div>')}
      <button class="btn primary" data-act="add-ex" style="margin:8px 0 14px">+ Add Exercise</button>
      <div class="btn-row">
        <button class="btn ghost" data-act="settings">Settings</button>
        <button class="btn ghost danger" data-act="discard">Discard Workout</button>
      </div>
    </main>
    ${raw(rest ? restBar() : '')}
    ${raw(picking ? picker() : '')}`;
}

function idle(s) {
  const last = s.workouts[s.workouts.length - 1];
  return html`
    <div class="topbar"><h1>Log Workout</h1></div>
    <main>
      <div class="card center">
        <div class="small muted" style="margin-bottom:14px">No workout in progress</div>
        <button class="btn primary" data-act="start">+ Start empty workout</button>
      </div>
      ${raw(coach())}
      ${raw(last ? html`
      <div class="card">
        <h2>Repeat last session</h2>
        <div class="mg-name">${last.title}</div>
        <div class="tiny muted" style="margin:3px 0 10px">${ago(last.start)} · ${last.exercises.map(e => e.name).join(', ')}</div>
        <button class="btn ghost" data-act="repeat">Start with these ${last.exercises.length} exercises</button>
      </div>` : '')}
      ${raw(picking ? picker() : '')}
    </main>`;
}

function exerciseBlock(ex, exIndex, workoutId) {
  const prev = store.lastPerformance(ex.name, workoutId);
  const pb = store.personalBest(ex.name);
  const muscles = store.findExercise(ex.name).muscles;

  return html`
    <div class="ex">
      <div class="ex-head">
        <span class="ex-name">${ex.name}</span>
        <button class="ex-menu" data-act="rm-ex" data-i="${exIndex}" aria-label="Remove exercise">✕</button>
      </div>
      <div class="ex-muscles">${raw(Object.entries(muscles).sort((a, b) => b[1] - a[1])
        .map(([id, f]) => `${id.replace(/_/g, ' ')} ${f}`).join(' · '))}</div>
      <input class="ex-note" data-act-input="note" data-i="${exIndex}" placeholder="Add notes here…" value="${ex.notes || ''}">
      <table class="sets">
        <colgroup><col class="c-set"><col class="c-prev"><col><col><col class="c-tick"></colgroup>
        <thead><tr><th>Set</th><th>Previous</th><th>kg</th><th>Reps</th><th>✓</th></tr></thead>
        <tbody>
          ${raw(ex.sets.map((st, i) => {
            const p = prev && prev.sets[i];
            const isPb = pb && st.done && st.w >= pb.w && st.w > 0;
            return html`
              <tr class="${st.done ? 'on' : ''}">
                <td><div class="set-n">${raw(isPb ? '🏅' : String(i + 1))}</div></td>
                <td class="prev">${raw(p ? `${fmt(p.w)}kg × ${p.r}` : '—')}</td>
                <td><input class="cell" type="number" inputmode="decimal" step="0.5" data-act-input="w"
                     data-i="${exIndex}" data-s="${i}" value="${st.w || ''}" placeholder="${raw(p ? fmt(p.w) : '0')}"></td>
                <td><input class="cell" type="number" inputmode="numeric" step="1" data-act-input="r"
                     data-i="${exIndex}" data-s="${i}" value="${st.r || ''}" placeholder="${raw(p ? String(p.r) : '0')}"></td>
                <td><button class="tick ${st.done ? 'on' : ''}" data-act="tick" data-i="${exIndex}" data-s="${i}"
                     aria-label="Complete set ${i + 1}">✓</button></td>
              </tr>`;
          }).join(''))}
        </tbody>
      </table>
      <button class="btn sm ghost" data-act="add-set" data-i="${exIndex}" style="width:100%;margin-top:8px">+ Add Set</button>
    </div>`;
}

// What to train next, ranked against the week as it will stand tomorrow.
// Recomputed on every render, so ticking a set reorders it immediately.
function coach() {
  const picks = store.suggestions(5);
  const out = store.weekOutlook();
  const top = picks[0];

  // With no picks the reason matters: everything met is a different message
  // from "you are behind, but nothing you have trained lately covers it".
  // Never spill a full muscle list into a one-line header.
  const headline = top ? top.name
    : !out.recentCount ? `Nothing logged in the last ${store.RECENT_DAYS} days`
    : out.uncovered.length === 1 ? `Nothing recent trains ${out.uncovered[0].name}`
    : out.uncovered.length ? `Nothing recent trains ${out.uncovered.length} of your groups`
    : out.behind ? 'Nothing left that helps'
    : 'All targets met';

  const sub = out.behind
    ? `${out.behind} of ${out.groups} groups behind &middot; ${fmt(out.gap)} sets to go`
    : 'Nothing is behind for the next 24h';

  return html`
    <div class="coach ${coachOpen ? 'open' : ''}">
      <button class="coach-head" data-act="coach" aria-expanded="${coachOpen ? 'true' : 'false'}">
        <div class="coach-txt">
          <div class="coach-k">Best next exercise</div>
          <div class="coach-v">${headline}</div>
          <div class="coach-s">${raw(sub)}</div>
        </div>
        <span class="coach-caret">${raw(coachOpen ? '&#9650;' : '&#9660;')}</span>
      </button>
      ${raw(coachOpen ? coachBody(picks, out) : '')}
    </div>`;
}

// Long lists get truncated: a header or a note is not a place to enumerate
// eleven muscle groups.
function namesOf(list, max = 3) {
  const shown = list.slice(0, max).map(v => `${v.name} ${fmt(v.projectedRemaining)}`).join(', ');
  const rest = list.length - max;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

function coachBody(picks, out) {
  if (!out.recentCount) {
    return html`<div class="coach-body">
      <div class="coach-empty">Rankings come from the exercises you have trained in the last
      ${store.RECENT_DAYS} days, and there aren't any yet. Log a set and this fills in.</div>
    </div>`;
  }

  if (!picks.length && !out.uncovered.length) {
    return html`<div class="coach-body">
      <div class="coach-empty">Every group is on target for the next 24 hours. Anything you add now is
      banked against later in the week.</div>
    </div>`;
  }

  return html`<div class="coach-body">
    ${raw(picks.map((p, i) => html`
      <button class="sug" data-act="sug" data-n="${p.name}">
        <span class="sug-rank">${i + 1}</span>
        <span class="sug-main">
          <span class="sug-name">${p.name}</span>
          <span class="sug-parts">${raw(p.parts.map(part =>
            `<b>${part.name}</b> +${fmt(part.closes)}`).join(' &middot; '))}</span>
        </span>
        <span class="sug-gain">+${fmt(p.gain)}</span>
      </button>`).join(''))}
    ${raw(out.uncovered.length ? html`
      <div class="coach-gap">
        <b>${raw(namesOf(out.uncovered))}</b>
        ${out.uncovered.length === 1 ? 'is' : 'are'} behind, but nothing you have trained in the last
        ${store.RECENT_DAYS} days works ${out.uncovered.length === 1 ? 'it' : 'them'}.
        Use Add Exercise to bring ${out.uncovered.length === 1 ? 'it' : 'them'} back into rotation.
      </div>` : '')}
    ${raw(out.expiringTotal > 0 ? html`
      <div class="coach-note">
        <b>${fmt(out.expiringTotal)} sets roll off in the next 24h</b> —
        ${raw(out.rollingOff.slice(0, 4).map(v => `${v.name} ${fmt(v.expiring)}`).join(', '))}.
        Rankings already assume that.
      </div>` : '')}
    <div class="coach-foot">Ranked by how much one set closes your biggest gaps, from the
      ${out.recentCount} exercises you have trained in the last ${store.RECENT_DAYS} days. Tap to add.</div>
  </div>`;
}

function restBar() {
  const left = Math.max(0, Math.round((rest.endsAt - Date.now()) / 1000));
  const pct = rest.total ? (left / rest.total) * 100 : 0;
  return html`
    <div class="rest-bar">
      <div class="rest-progress" style="width:${pct.toFixed(1)}%"></div>
      <button class="adj" data-act="rest-adj" data-d="-15">−15</button>
      <div class="t" id="rest-t">${clock(left)}</div>
      <button class="adj" data-act="rest-adj" data-d="15">+15</button>
      <button class="btn primary sm" data-act="rest-skip">Skip</button>
    </div>`;
}

function picker() {
  const q = query.trim().toLowerCase();
  const list = store.catalog().filter(e => !q || e.name.toLowerCase().includes(q));
  const exact = list.some(e => e.name.toLowerCase() === q);
  return html`
    <div class="sheet">
      <header>
        <h2>Add exercise</h2>
        <button class="btn sm ghost" data-act="close-pick">Close</button>
      </header>
      <div style="padding:12px 16px">
        <input class="search" id="q" placeholder="Search ${store.catalog().length} exercises…" value="${query}" autocomplete="off">
      </div>
      <div class="body">
        ${raw(list.map(e => html`
          <button class="pick" data-act="choose" data-n="${e.name}">
            <div class="n">${e.name}</div>
            <div class="m">${raw(Object.keys(e.muscles).map(m => m.replace(/_/g, ' ')).join(' · '))}</div>
          </button>`).join(''))}
        ${raw(q && !exact ? html`
          <button class="pick" data-act="create" data-n="${query.trim()}">
            <div class="n">+ Create “${query.trim()}”</div>
            <div class="m">Map it to muscles in Settings afterwards</div>
          </button>` : '')}
        ${raw(!list.length && !q ? '<div class="empty">No exercises.</div>' : '')}
      </div>
    </div>`;
}

/* ---------- behaviour ---------- */

export function mount(root, rerender) {
  rerenderRef = rerender;
  const s = store.get();

  onAct(root, {
    start: () => { store.startWorkout(); },
    repeat: () => {
      const last = store.get().workouts.slice(-1)[0];
      store.startWorkout();
      store.update(st => {
        st.active.exercises = last.exercises.map(e => ({
          name: e.name, notes: '',
          sets: e.sets.map(x => ({ w: x.w, r: x.r, done: false })),
        }));
      });
    },
    finish: () => {
      const v = store.volumeOf(store.get().active);
      if (!v.sets || confirm(`Finish with ${v.sets} completed set${v.sets === 1 ? '' : 's'}?`)) {
        stopRest();
        store.finishWorkout();
        location.hash = '#/history';
      }
    },
    discard: () => { if (confirm('Discard this workout? Nothing will be saved.')) { stopRest(); store.discardWorkout(); } },
    settings: () => { location.hash = '#/settings'; },
    coach: () => { coachOpen = !coachOpen; rerender(); },
    sug: el => addOrExtend(el.dataset.n),
    'add-ex': () => openPicker(),
    'close-pick': () => dismissPicker(),
    choose: el => addExercise(el.dataset.n),
    create: el => {
      const name = el.dataset.n;
      store.update(st => { st.customExercises.push({ name, muscles: {} }); });
      addExercise(name);
    },
    'rm-ex': el => {
      const i = Number(el.dataset.i);
      const name = store.get().active.exercises[i].name;
      if (confirm(`Remove ${name}?`)) store.update(st => { st.active.exercises.splice(i, 1); });
    },
    'add-set': el => {
      const i = Number(el.dataset.i);
      store.update(st => {
        const sets = st.active.exercises[i].sets;
        const last = sets[sets.length - 1];
        sets.push({ w: last ? last.w : 0, r: last ? last.r : 0, done: false });
      });
    },
    tick: el => {
      const i = Number(el.dataset.i), j = Number(el.dataset.s);
      let started = false;
      store.update(st => {
        const set = st.active.exercises[i].sets[j];
        set.done = !set.done;
        if (set.done) {
          // Blank cells fall back to the placeholder so a quick tick still records something.
          const prev = store.lastPerformance(st.active.exercises[i].name, st.active.id);
          if (!set.w && prev && prev.sets[j]) set.w = prev.sets[j].w;
          if (!set.r && prev && prev.sets[j]) set.r = prev.sets[j].r;
          started = true;
        }
      });
      if (started) startRest();
    },
    'rest-open': () => startRest(),
    'rest-skip': () => stopRest(),
    'rest-adj': el => {
      if (!rest) return;
      rest.endsAt += Number(el.dataset.d) * 1000;
      rest.total = Math.max(rest.total, Math.round((rest.endsAt - Date.now()) / 1000));
      paintRest();
    },
  });

  // Field edits save on every keystroke but never re-render: rebuilding the DOM
  // under a focused cell drops the keyboard and would discard the value being
  // typed in the next field. Only the stats header needs refreshing.
  root.addEventListener('input', e => {
    const el = e.target.closest('[data-act-input]');
    if (!el) return;
    const kind = el.dataset.actInput;
    const i = Number(el.dataset.i), j = Number(el.dataset.s);
    store.updateQuiet(st => {
      if (!st.active) return;
      const ex = st.active.exercises[i];
      if (!ex) return;
      if (kind === 'note') ex.notes = el.value;
      if (kind === 'w') ex.sets[j].w = parseFloat(el.value) || 0;
      if (kind === 'r') ex.sets[j].r = parseInt(el.value, 10) || 0;
    });
    if (kind !== 'note') paintStats(root);
  });

  const q = root.querySelector('#q');
  if (q) {
    q.focus();
    q.addEventListener('input', () => {
      query = q.value;
      const at = q.selectionStart;
      rerender();
      const nq = document.querySelector('#q');
      if (nq) { nq.focus(); nq.setSelectionRange(at, at); }
    });
  }

  if (s.active) startDurationTick(root);
  if (rest) paintRest();
}

// The picker is a full-screen sheet, so it gets its own history entry: the
// phone's back gesture should close it, not jump to the previous screen.
// A suggestion you are already doing should deepen that block rather than
// start a duplicate one.
function addOrExtend(name) {
  const active = store.get().active;
  if (!active) {
    store.startWorkout();
    return addExercise(name);
  }
  const existing = active.exercises.findIndex(e => e.name === name);
  if (existing < 0) return addExercise(name);
  store.update(st => {
    const sets = st.active.exercises[existing].sets;
    const last = sets[sets.length - 1];
    sets.push({ w: last ? last.w : 0, r: last ? last.r : 0, done: false });
  });
}

function openPicker() {
  picking = true;
  query = '';
  history.pushState({ sheet: 'picker' }, '');
  rerenderRef();
}

function dismissPicker() {
  picking = false;
  rerenderRef();
  // Consume the entry the sheet pushed so a later back doesn't spend a press
  // doing nothing visible.
  if (history.state && history.state.sheet === 'picker') history.back();
}

// Called by the router on popstate. Returns true when back was spent closing
// the sheet, so the router leaves the route alone.
export function handleBack() {
  if (!picking) return false;
  picking = false;
  return true;
}

function addExercise(name) {
  picking = false;
  if (history.state && history.state.sheet === 'picker') history.back();
  store.update(st => {
    if (!st.active) return;
    const prev = store.lastPerformance(name, st.active.id);
    const sets = prev
      ? prev.sets.map(p => ({ w: p.w, r: p.r, done: false }))
      : [{ w: 0, r: 0, done: false }];
    st.active.exercises.push({ name, notes: '', sets });
  });
}

// Refresh the volume/sets header in place after a keystroke.
function paintStats(root) {
  const a = store.get().active;
  if (!a) return;
  const v = store.volumeOf(a);
  const vol = root.querySelector('#vol');
  const n = root.querySelector('#nsets');
  if (vol) vol.textContent = `${v.kg.toLocaleString()} kg`;
  if (n) n.textContent = String(v.sets);
}

function startDurationTick(root) {
  const el = root.querySelector('#dur');
  if (!el) return;
  clearInterval(startDurationTick.id);
  startDurationTick.id = setInterval(() => {
    const a = store.get().active;
    if (!a || !document.body.contains(el)) return clearInterval(startDurationTick.id);
    el.textContent = duration(a.start, null);
  }, 1000);
}

function startRest() {
  const secs = store.get().restSeconds;
  rest = { endsAt: Date.now() + secs * 1000, total: secs };
  clearInterval(restTimerId);
  restTimerId = setInterval(paintRest, 250);
  rerenderRef();
}

function stopRest() {
  rest = null;
  clearInterval(restTimerId);
  restTimerId = null;
  rerenderRef();
}

function paintRest() {
  if (!rest) return;
  const left = Math.round((rest.endsAt - Date.now()) / 1000);
  const t = document.querySelector('#rest-t');
  const bar = document.querySelector('.rest-progress');
  if (!t) return;
  t.textContent = clock(Math.max(0, left));
  if (bar) bar.style.width = `${Math.max(0, (left / rest.total) * 100).toFixed(1)}%`;
  if (left <= 0) {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    stopRest();
  }
}
