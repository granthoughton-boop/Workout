import * as store from '../store.js';
import { html, raw, fmt, fmtDate, ago, duration, onAct } from '../ui.js';

let range = 90; // days shown on the chart

export function view() {
  const s = store.get();
  const stats = store.weightStats();
  const vol = store.weeklyVolume();
  const behind = vol.filter(m => m.remaining > 0).length;
  const recent = s.workouts.slice(-3).reverse();
  const draft = stats ? stats.latest.kg : 75;

  return html`
    <div class="topbar"><h1>Today<span class="sub">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</span></h1></div>
    <main>
      <div class="card">
        <div class="spread">
          <div>
            <div class="small muted">Bodyweight</div>
            <div class="bw-now">${stats ? fmt(stats.latest.kg) : '—'}<span> kg</span></div>
            <div class="tiny muted" style="margin-top:4px">
              ${stats ? (stats.latest.date === store.todayKey() ? 'Logged today' : 'Last logged ' + ago(stats.latest.date)) : 'No entries yet'}
            </div>
          </div>
          ${raw(stats && stats.trend !== null ? html`
            <div class="center">
              <span class="delta ${stats.trend > 0 ? 'up' : stats.trend < 0 ? 'down' : ''}">${(stats.trend > 0 ? '+' : '') + fmt(stats.trend)} kg</span>
              <div class="tiny muted" style="margin-top:5px">vs last week</div>
            </div>` : '')}
        </div>

        <div class="bw-entry">
          <button class="step" data-act="dec" aria-label="Decrease 0.1">−</button>
          <input id="bw" type="number" inputmode="decimal" step="0.1" min="20" max="400"
                 value="${fmt(draft)}" aria-label="Bodyweight in kg">
          <button class="step" data-act="inc" aria-label="Increase 0.1">+</button>
        </div>
        <div style="margin-top:10px"><button class="btn primary" data-act="save">Save weight</button></div>
      </div>

      <div class="card">
        <div class="spread">
          <h2 style="margin:0">Weight trend</h2>
          ${raw(stats ? html`<span class="pill">${fmt(stats.min)}–${fmt(stats.max)} kg</span>` : '')}
        </div>
        ${raw(chart(s.weights, range))}
        <div class="chips">
          ${[30, 90, 365, 0].map(d => html`<button class="${range === d ? 'on' : ''}" data-act="range" data-d="${d}">${d ? d + 'd' : 'All'}</button>`)}
        </div>
      </div>

      <div class="card">
        <div class="spread" style="margin-bottom:10px">
          <h2 style="margin:0">This week</h2>
          <a href="#/muscles" class="pill" style="text-decoration:none">View all →</a>
        </div>
        <div class="spread">
          <div><div class="bw-now" style="font-size:34px">${vol.length - behind}<span> / ${vol.length}</span></div>
          <div class="tiny muted" style="margin-top:4px">muscle groups at target</div></div>
        </div>
        <div style="margin-top:12px"><button class="btn ${s.active ? 'green' : 'primary'}" data-act="start">
          ${s.active ? 'Resume workout' : '+ Start workout'}</button></div>
      </div>

      <div class="card">
        <h2>Recent workouts</h2>
        ${raw(recent.length ? recent.map(w => {
          const v = store.volumeOf(w);
          return html`<div class="mg"><div class="spread">
            <div><div class="mg-name">${w.title}</div>
            <div class="tiny muted">${fmtDate(w.start)} · ${duration(w.start, w.end)}</div></div>
            <div class="mg-num"><b>${v.sets}</b> sets<br><span class="tiny">${v.kg.toLocaleString()} kg</span></div>
          </div></div>`;
        }).join('') : '<div class="empty">No workouts logged yet.</div>')}
      </div>
    </main>`;
}

export function mount(root, rerender) {
  const input = root.querySelector('#bw');
  const bump = d => {
    const v = (parseFloat(input.value) || 0) + d;
    input.value = fmt(Math.max(0, v));
  };
  onAct(root, {
    inc: () => bump(0.1),
    dec: () => bump(-0.1),
    save: () => {
      const kg = parseFloat(input.value);
      if (!kg || kg <= 0) return;
      store.logWeight(kg);
      input.blur();
    },
    range: el => { range = Number(el.dataset.d); rerender(); },
    start: () => {
      if (!store.get().active) store.startWorkout();
      location.hash = '#/log';
    },
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
}

// Inline SVG sparkline - no chart library, scales to the card width via viewBox.
function chart(weights, days) {
  if (weights.length < 2) {
    return '<div class="empty">Log your weight on two different days to see a trend.</div>';
  }
  let pts = weights;
  if (days) {
    const cut = new Date();
    cut.setDate(cut.getDate() - days);
    const key = store.todayKey(cut);
    const filtered = weights.filter(w => w.date >= key);
    if (filtered.length >= 2) pts = filtered;
  }

  const W = 320, H = 110, padL = 30, padR = 6, padT = 10, padB = 18;
  const xs = pts.map(p => new Date(p.date).getTime());
  const ys = pts.map(p => p.kg);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 1) { y0 -= 0.5; y1 += 0.5; }
  const pad = (y1 - y0) * 0.15;
  y0 -= pad; y1 += pad;

  const px = t => padL + ((t - x0) / (x1 - x0 || 1)) * (W - padL - padR);
  const py = v => padT + (1 - (v - y0) / (y1 - y0)) * (H - padT - padB);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${px(xs[i]).toFixed(1)},${py(p.kg).toFixed(1)}`).join('');
  const area = `${line}L${px(x1).toFixed(1)},${py(y0).toFixed(1)}L${px(x0).toFixed(1)},${py(y0).toFixed(1)}Z`;
  const last = pts[pts.length - 1];

  const ticks = [y1 - pad, y0 + pad].map(v =>
    `<line class="grid" x1="${padL}" y1="${py(v).toFixed(1)}" x2="${W - padR}" y2="${py(v).toFixed(1)}"/>
     <text x="0" y="${(py(v) + 3).toFixed(1)}">${fmt(v)}</text>`).join('');

  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
      aria-label="Bodyweight from ${fmtDate(pts[0].date)} to ${fmtDate(last.date)}">
    ${ticks}
    <path class="area" d="${area}"/>
    <path class="line" d="${line}"/>
    <circle cx="${px(new Date(last.date).getTime()).toFixed(1)}" cy="${py(last.kg).toFixed(1)}" r="3.5"/>
    <text x="${padL}" y="${H - 4}">${fmtDate(pts[0].date)}</text>
    <text x="${W - padR}" y="${H - 4}" text-anchor="end">${fmtDate(last.date)}</text>
  </svg>`;
}
