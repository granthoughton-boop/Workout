import * as store from '../store.js';
import * as alerts from '../alerts.js';
import { html, raw, fmt, fmtDay, duration, clock, ago, onAct } from '../ui.js';

let rest = null;      // { endsAt, total }
let restTimerId = null;
let restHidden = false; // the rest spent some of its time with the app off-screen
let picking = false;
let coachOpen = false;
let histFor = null;   // exercise name whose history sheet is open
let query = '';
let rerenderRef = () => {};

export function view() {
  const s = store.get();
  if (!s.active) return idle(s);

  const w = s.active;
  const v = store.volumeOf(w);

  return html`
    <div class="stickyhead">
      <div class="topbar">
        <h1>Log Workout<span class="sub">${w.title}</span></h1>
        <button class="pill" data-act="rest-open">Rest ${clock(s.restSeconds)}</button>
        <button class="btn primary sm" data-act="finish">Finish</button>
      </div>
      <div class="stats">
        <div><div class="k">Time</div><div class="v accent" id="dur">${duration(w.start, null)}</div></div>
        <div><div class="k">Exercises</div><div class="v">${v.exercises}</div></div>
        <div><div class="k">Sets</div><div class="v">${v.sets}</div></div>
      </div>
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
    ${raw(picking ? picker() : '')}
    ${raw(histFor ? historySheet(histFor) : '')}`;
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

  return html`
    <div class="ex" data-ex="${exIndex}">
      <div class="ex-head">
        <button class="ex-name" data-act="hist" data-n="${ex.name}">${ex.name}</button>
        <button class="ex-menu" data-act="rm-ex" data-i="${exIndex}" aria-label="Remove exercise">✕</button>
      </div>
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
      ${raw(exIndex === 0 ? '<div class="swipe-hint">Swipe a row sideways to delete that set</div>' : '')}
      <button class="btn sm ghost" data-act="add-set" data-i="${exIndex}" style="width:100%;margin-top:8px">+ Add Set</button>
    </div>`;
}

// What to train next, ranked against the week as it will stand tomorrow.
// Recomputed on every render, so ticking a set reorders it immediately.
function coach() {
  const picks = store.suggestions(5);
  const out = store.weekOutlook();
  const top = picks[0];

  // Closed, it says one thing. Every number lives behind the tap.
  return html`
    <div class="coach ${coachOpen ? 'open' : ''}">
      <button class="coach-head" data-act="coach" aria-expanded="${coachOpen ? 'true' : 'false'}">
        <span class="coach-v">What to train today</span>
        <span class="coach-caret">${raw(coachOpen ? '&#9650;' : '&#9660;')}</span>
      </button>
      ${raw(coachOpen ? coachBody(picks, out) : '')}
    </div>`;
}

// The status line the closed header used to carry.
function coachSummary(picks, out) {
  const lead = picks.length ? `Start with <b>${picks[0].name}</b>` : '';
  const state = !out.recentCount ? `Nothing logged in the last ${store.RECENT_DAYS} days`
    : out.behind ? `${out.behind} of ${out.groups} groups behind &middot; ${fmt(out.gap)} sets to go`
    : 'Nothing is behind for the next 24h';
  return html`<div class="coach-sum">${raw(lead ? lead + ' &middot; ' : '')}${raw(state)}</div>`;
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
    // "Nothing to suggest" has two quite different causes now, and reading the
    // wrong one back would be misleading.
    const done = store.trainedInActive().size;
    return html`<div class="coach-body">
      <div class="coach-empty">${raw(done && out.behind
        ? `Everything in rotation that would close a gap is already in this session. Add an exercise
           if you want more, or call it here.`
        : `Every group is on target for the next 24 hours. Anything you add now is
           banked against later in the week.`)}</div>
    </div>`;
  }

  return html`<div class="coach-body">
    ${raw(coachSummary(picks, out))}
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
      ${out.recentCount} exercises you have trained in the last ${store.RECENT_DAYS} days, minus
      anything already worked in this session. Tap to add.</div>
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

// Everything logged for one exercise, newest first. It opens over the workout
// rather than routing away, so back puts you straight back on the set you were
// in the middle of.
function historySheet(name) {
  const sessions = store.exerciseHistory(name);
  const pb = store.personalBest(name);
  const totalSets = sessions.reduce((a, x) => a + x.sets.length, 0);

  return html`
    <div class="sheet">
      <header>
        <h2>${name}</h2>
        <button class="btn sm ghost" data-act="close-hist">Close</button>
      </header>
      ${raw(sessions.length ? html`
        <div class="stats">
          <div><div class="k">Sessions</div><div class="v">${sessions.length}</div></div>
          <div><div class="k">Sets</div><div class="v">${totalSets}</div></div>
          <div><div class="k">Best set</div><div class="v accent">${raw(pb ? `${fmt(pb.w)}<span class="tiny"> kg × ${pb.r}</span>` : '—')}</div></div>
        </div>` : '')}
      <div class="body">
        ${raw(sessions.length ? sessions.map(x => html`
          <div class="xh">
            <div class="spread">
              <span class="xh-d">${fmtDay(x.start)}<span class="muted"> · ${ago(x.start)}</span></span>
              <span class="xh-k">${x.sets.length} sets · ${x.kg.toLocaleString()} kg</span>
            </div>
            <div class="xh-sets">
              ${raw(x.sets.map(st => html`<span class="xh-set ${pb && st.w >= pb.w && st.w > 0 ? 'best' : ''}">${fmt(st.w)}<i>kg</i> × ${st.r}</span>`).join(''))}
            </div>
            ${raw(x.notes.map(n => html`<div class="xh-note">${n}</div>`).join(''))}
          </div>`).join('') : html`
          <div class="empty">No completed sets of ${name} yet. Tick one and it shows up here.</div>`)}
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
    sug: el => {
      // Collapse first: the panel has done its job the moment you pick, and
      // leaving it open pushes the exercise you just added off the screen.
      coachOpen = false;
      revealExercise(addOrExtend(el.dataset.n));
    },
    hist: el => openHistory(el.dataset.n),
    'close-hist': () => dismissHistory(),
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
  // Tapping a number cell selects what's there, so typing replaces the value
  // instead of appending to it. The delay is deliberate: mobile browsers move
  // the caret after the focus handler runs, which would undo an immediate
  // select().
  root.addEventListener('focusin', e => {
    const el = e.target;
    if (el.classList && el.classList.contains('cell')) {
      setTimeout(() => { try { el.select(); } catch { /* not selectable */ } }, 0);
    }
  });

  root.addEventListener('input', e => {
    const el = e.target.closest('[data-act-input]');
    if (!el) return;
    const kind = el.dataset.actInput;
    const i = Number(el.dataset.i), j = Number(el.dataset.s);
    const carried = [];
    store.updateQuiet(st => {
      if (!st.active) return;
      const ex = st.active.exercises[i];
      if (!ex) return;
      if (kind === 'note') ex.notes = el.value;
      if (kind === 'r') {
        const reps = parseInt(el.value, 10) || 0;
        ex.sets[j].r = reps;
        // Step the reps down: fatigue means later sets of the same exercise
        // come in one rep short of the one before, so 11 on the first set
        // predicts 10 then 9. Same rules as the weight below - ticked sets are
        // a record and are left alone, and clearing the field carries nothing.
        // A set of zero reps is not a set, so the ladder stops at 1.
        if (el.value !== '' && reps > 0) {
          let prev = reps;
          for (let k = j + 1; k < ex.sets.length; k++) {
            // A set already ticked keeps what was actually lifted, and the
            // ladder carries on from that rather than from what it displaced.
            if (ex.sets[k].done) { prev = ex.sets[k].r; continue; }
            prev = Math.max(1, prev - 1);
            ex.sets[k].r = prev;
            carried.push({ k, kind: 'r', value: String(prev) });
          }
        }
      }
      if (kind === 'w') {
        ex.sets[j].w = parseFloat(el.value) || 0;
        // Carry the weight down: you normally work a whole exercise at one
        // load, so retyping it on every row is pure friction. Sets already
        // ticked are a record of what you lifted and are left alone, and
        // clearing the field carries nothing.
        if (el.value !== '') {
          for (let k = j + 1; k < ex.sets.length; k++) {
            if (ex.sets[k].done) continue;
            ex.sets[k].w = parseFloat(el.value) || 0;
            carried.push({ k, kind: 'w', value: el.value });
          }
        }
      }
    });
    // Those rows are on screen already, so update them in place rather than
    // re-rendering out from under the keyboard.
    for (const { k, kind: field, value } of carried) {
      const other = root.querySelector(
        `input[data-act-input="${field}"][data-i="${i}"][data-s="${k}"]`);
      if (other && other !== el) other.value = value;
    }
  });

  wireSwipe(root);

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

// Swipe a set row sideways to delete it. The rows carry touch-action: pan-y,
// so the browser keeps vertical scrolling for itself and hands us the
// horizontal drag - which is what stops the list fighting the gesture.
function wireSwipe(root) {
  const COMMIT = 96;   // px of travel that deletes
  const SLOP = 12;     // px before the gesture commits to an axis
  let row = null, x0 = 0, y0 = 0, dx = 0, id = null, decided = false, swiped = false;

  function reset() {
    if (row) {
      row.classList.remove('swiping', 'armed');
      row.style.removeProperty('--dx');
    }
    row = null; dx = 0; id = null; decided = false;
  }

  root.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const tr = e.target.closest('table.sets tbody tr');
    if (!tr) return;
    // A drag inside the field you are editing is caret work, not a swipe.
    if (e.target.closest('input') && document.activeElement === e.target) return;
    row = tr; x0 = e.clientX; y0 = e.clientY; dx = 0; id = e.pointerId; decided = false;
  });

  root.addEventListener('pointermove', e => {
    if (!row || e.pointerId !== id) return;
    const mx = e.clientX - x0, my = e.clientY - y0;
    if (!decided) {
      if (Math.abs(mx) < SLOP && Math.abs(my) < SLOP) return;
      // Vertical intent: drop the gesture and let the page scroll.
      if (Math.abs(mx) < Math.abs(my) * 1.5) { reset(); return; }
      decided = true;
      row.classList.add('swiping');
      try { row.setPointerCapture(id); } catch { /* capture is a nicety */ }
    }
    dx = mx;
    row.style.setProperty('--dx', `${dx}px`);
    row.classList.toggle('armed', Math.abs(dx) >= COMMIT);
    e.preventDefault();
  });

  function end(e) {
    if (!row || e.pointerId !== id) return;
    const commit = decided && Math.abs(dx) >= COMMIT;
    const target = row;
    swiped = decided;
    reset();
    if (!commit) return;
    const tick = target.querySelector('[data-act="tick"]');
    if (!tick) return;
    if (navigator.vibrate) navigator.vibrate(30);
    store.deleteSet(Number(tick.dataset.i), Number(tick.dataset.s));
  }

  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', () => reset());

  // A finished swipe must not also read as a tap on whatever sat under it.
  root.addEventListener('click', e => {
    if (!swiped) return;
    swiped = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);
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
  return existing;
}

// Scroll the exercise a suggestion just landed on into view and flash it. The
// store update above has already re-rendered the screen, so this is querying
// the fresh DOM, not the one the tap came from.
function revealExercise(index) {
  if (index === undefined || index === null) return;
  const el = document.querySelector(`.ex[data-ex="${index}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.classList.remove('flash');
  void el.offsetWidth; // restart the animation if the same block is picked twice
  el.classList.add('flash');
}

function openHistory(name) {
  histFor = name;
  history.pushState({ sheet: 'hist' }, '');
  rerenderRef();
}

function dismissHistory() {
  histFor = null;
  rerenderRef();
  if (history.state && history.state.sheet === 'hist') history.back();
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
  if (histFor) { histFor = null; return true; }
  if (!picking) return false;
  picking = false;
  return true;
}

function addExercise(name) {
  picking = false;
  if (history.state && history.state.sheet === 'picker') history.back();
  let at = null;
  store.update(st => {
    if (!st.active) return;
    const prev = store.lastPerformance(name, st.active.id);
    const sets = prev
      ? prev.sets.map(p => ({ w: p.w, r: p.r, done: false }))
      : [{ w: 0, r: 0, done: false }];
    st.active.exercises.push({ name, notes: '', sets });
    at = st.active.exercises.length - 1;
  });
  return at;
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
  restHidden = false;
  clearInterval(restTimerId);
  restTimerId = setInterval(paintRest, 250);
  if (store.get().restAlerts) {
    // Scheduled here rather than when the timer runs out: this call is inside
    // the tap, which is the only place a phone lets audio start.
    alerts.scheduleRest(rest.endsAt, `${clock(secs)} rest is up — next set.`);
    askAlertsOnce();
  }
  rerenderRef();
}

// The first rest of the app's life is the moment to ask for notifications: the
// question is inside a tap, which is the only kind a phone will accept, and
// the answer is about to matter. Asked once, then never again from here.
function askAlertsOnce() {
  if (store.get().alertsAsked || alerts.permission() !== 'default') return;
  store.updateQuiet(st => { st.alertsAsked = true; });
  alerts.askPermission();
}

// keepAlert is for a rest that ran its course: the sound has happened and the
// notification is the user's to dismiss. Everything else - Skip, Finish,
// Discard, coming back to a rest that expired while you were away - is a
// cancellation, and takes the stale banner with it.
function stopRest({ keepAlert = false } = {}) {
  rest = null;
  restHidden = false;
  clearInterval(restTimerId);
  restTimerId = null;
  if (!keepAlert) alerts.cancelRest();
  rerenderRef();
}

function paintRest() {
  if (!rest) return;
  const left = Math.round((rest.endsAt - Date.now()) / 1000);
  const t = document.querySelector('#rest-t');
  if (t) {
    t.textContent = clock(Math.max(0, left));
    const bar = document.querySelector('.rest-progress');
    if (bar) bar.style.width = `${Math.max(0, (left / rest.total) * 100).toFixed(1)}%`;
  }
  if (left > 0) return;

  // Coming back to a rest that ran out while you were elsewhere: the beep and
  // the banner have already happened, so this only tidies the bar away.
  const returning = restHidden && !document.hidden;
  if (returning) {
    stopRest();
    return;
  }
  alerts.restEnded();
  stopRest({ keepAlert: true });
}

// The bar lives on this screen, but the timer belongs to the session: it keeps
// running while you are on another tab, and the countdown has to be caught up
// the moment the app is looked at again, since a backgrounded page's timers are
// throttled to minutes or stopped outright.
document.addEventListener('visibilitychange', () => {
  if (!rest) return;
  if (document.hidden) restHidden = true;
  else paintRest();
});

// The service worker got there first - the rest ended while the app was in the
// background and it posted the notification.
window.addEventListener('rest:over', () => { if (rest) stopRest({ keepAlert: true }); });
