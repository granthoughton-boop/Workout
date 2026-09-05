import * as store from '../store.js';
import { html, raw, fmt, fmtDayFull, shortDuration, onAct } from '../ui.js';

let open = null;

export function view() {
  const s = store.get();
  const list = s.workouts.slice().reverse();
  const totals = list.reduce((a, w) => {
    const v = store.volumeOf(w);
    return { sets: a.sets + v.sets, kg: a.kg + v.kg };
  }, { sets: 0, kg: 0 });

  return html`
    <div class="topbar"><h1>History<span class="sub">${list.length} workouts · ${totals.sets} sets · ${Math.round(totals.kg / 1000)}t lifted</span></h1></div>
    <main>
      ${raw(list.length ? html`
        <div class="card hist-list">
          ${raw(list.map(row).join(''))}
        </div>` : '<div class="empty">No workouts yet.</div>')}
    </main>`;
}

// One line per session: when it was, how much of it there was. Everything else
// is behind the caret, so a year of training scrolls as a list rather than as a
// wall of exercise names.
function row(w) {
  const v = store.volumeOf(w);
  const isOpen = open === w.id;
  return html`
    <div class="h-item ${isOpen ? 'open' : ''}">
      <button class="h-row" data-act="toggle" data-id="${w.id}" aria-expanded="${isOpen ? 'true' : 'false'}">
        <span class="h-day">${fmtDayFull(w.start)}</span>
        <span class="h-meta">${v.sets} sets<i>·</i>${shortDuration(w.start, w.end)}</span>
        <span class="h-caret">${raw(isOpen ? '&#9650;' : '&#9660;')}</span>
      </button>
      ${raw(isOpen ? detail(w, v) : '')}
    </div>`;
}

function detail(w, v) {
  const exercises = w.exercises
    .map(e => ({ ...e, sets: e.sets.filter(x => x.done) }))
    .filter(e => e.sets.length);

  return html`
    <div class="h-open">
      <div class="h-sub">${w.title}<span class="muted"> · ${v.kg.toLocaleString()} kg</span></div>
      ${raw(exercises.map(e => html`
        <div class="h-ex">
          <div class="h-ex-top">
            <span class="h-ex-name">${e.name}</span>
            <span class="h-ex-n">${e.sets.length} ${e.sets.length === 1 ? 'set' : 'sets'}</span>
          </div>
          <div class="h-sets">${raw(groupSets(e.sets).map(g => html`
            <span class="h-set">${fmt(g.w)}<i>kg</i> × ${g.r}${raw(g.n > 1 ? `<b>×${g.n}</b>` : '')}</span>`).join(''))}</div>
          ${raw(e.notes ? html`<div class="h-note">${e.notes}</div>` : '')}
        </div>`).join(''))}
      ${raw(exercises.length ? '' : '<div class="tiny muted">No completed sets in this session.</div>')}
      <button class="btn ghost danger sm" data-act="del" data-id="${w.id}" style="width:100%;margin-top:12px">Delete workout</button>
    </div>`;
}

// Straight sets are the normal case, so three identical rows read better as one
// entry with a multiplier than as three chips saying the same thing.
function groupSets(sets) {
  const out = [];
  for (const s of sets) {
    const last = out[out.length - 1];
    if (last && last.w === s.w && last.r === s.r) last.n++;
    else out.push({ w: s.w, r: s.r, n: 1 });
  }
  return out;
}

export function mount(root) {
  onAct(root, {
    toggle: el => { open = open === el.dataset.id ? null : el.dataset.id; render(); },
    del: el => { if (confirm('Delete this workout permanently?')) store.deleteWorkout(el.dataset.id); },
  });
}

// Local re-render trigger; app.js listens to hashchange + store updates.
function render() { window.dispatchEvent(new Event('app:render')); }
