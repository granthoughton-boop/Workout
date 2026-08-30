import * as store from '../store.js';
import { html, raw, fmt, fmtDay, duration, onAct } from '../ui.js';

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
      ${raw(list.length ? list.map(w => {
        const v = store.volumeOf(w);
        const isOpen = open === w.id;
        return html`
          <div class="card">
            <button class="hist" data-act="toggle" data-id="${w.id}">
              <div class="spread">
                <div><div class="t">${w.title}</div>
                  <div class="d">${fmtDay(w.start)} · ${duration(w.start, w.end)} · ${v.sets} sets · ${v.kg.toLocaleString()} kg</div></div>
                <span class="muted">${raw(isOpen ? '▴' : '▾')}</span>
              </div>
              ${raw(isOpen ? '' : `<div class="l">${w.exercises.map(e => `${e.sets.length}× ${e.name}`).join(' · ')}</div>`)}
            </button>
            ${raw(isOpen ? html`
              <div style="margin-top:12px">
                ${raw(w.exercises.map(e => html`
                  <div class="mg">
                    <div class="mg-name" style="color:var(--accent)">${e.name}</div>
                    ${raw(e.notes ? `<div class="tiny muted" style="margin:3px 0">${e.notes}</div>` : '')}
                    <div class="small muted" style="margin-top:5px">
                      ${raw(e.sets.map(st => `${fmt(st.w)}kg × ${st.r}`).join('  ·  '))}
                    </div>
                  </div>`).join(''))}
                <button class="btn ghost danger sm" data-act="del" data-id="${w.id}" style="width:100%;margin-top:12px">Delete workout</button>
              </div>` : '')}
          </div>`;
      }).join('') : '<div class="empty">No workouts yet.</div>')}
    </main>`;
}

export function mount(root) {
  onAct(root, {
    toggle: el => { open = open === el.dataset.id ? null : el.dataset.id; render(); },
    del: el => { if (confirm('Delete this workout permanently?')) store.deleteWorkout(el.dataset.id); },
  });
}

// Local re-render trigger; app.js listens to hashchange + store updates.
function render() { window.dispatchEvent(new Event('app:render')); }
