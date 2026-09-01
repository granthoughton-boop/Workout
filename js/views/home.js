import * as store from '../store.js';
import { html, raw, fmt, fmtDate, ago, duration, onAct } from '../ui.js';

let range = 90;          // days shown on the chart
let weeksOpen = false;   // "This week" row expanded to the previous 8 weeks
const PAST_WEEKS = 8;

export function view() {
  const s = store.get();
  const stats = store.weightStats();
  const goal = store.goalProgress();
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
        <button class="wk-row" data-act="weeks" aria-expanded="${weeksOpen ? 'true' : 'false'}">
          <span class="wk-pct">${goal.pct}<span>%</span></span>
          <span class="bar wk-bar"><i class="${barCls(goal.pct)}" style="width:${Math.min(100, goal.pct)}%"></i></span>
          <span class="wk-sets">${fmt(goal.credited)} / ${fmt(goal.target)} sets</span>
          <span class="wk-caret">${raw(weeksOpen ? '&#9650;' : '&#9660;')}</span>
        </button>
        ${raw(weeksOpen ? pastWeeks() : '')}
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
    weeks: () => { weeksOpen = !weeksOpen; rerender(); },
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
}

// Percent of the weekly goal, coloured the same way the muscle bars are.
function barCls(pct) {
  if (pct <= 0) return 'none';
  if (pct >= 100) return 'done';
  if (pct < 50) return 'low';
  return '';
}

// The eight weeks before the current rolling window, one row each.
function pastWeeks() {
  const weeks = store.goalHistory(PAST_WEEKS);
  return html`<div class="wk-past">
    ${weeks.map(w => html`
      <div class="wk-hist">
        <span class="wk-hist-lbl">${weekLabel(w)}</span>
        <span class="bar wk-bar"><i class="${barCls(w.pct)}" style="width:${Math.min(100, w.pct)}%"></i></span>
        <span class="wk-hist-pct">${w.pct}%</span>
      </div>`)}
    <div class="wk-foot">Each week scored against today's targets. A group counts at most its own target.</div>
  </div>`;
}

function weekLabel(w) {
  const from = w.start;
  const to = new Date(w.end.getTime() - 86400000); // last full day of the window
  const f = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
  // formatRange collapses the shared month the way the locale expects
  // ("18–24 Aug" here, "Aug 18 – 24" in en-US); hand-joining two formatted
  // dates gets that wrong in one locale or the other.
  return f.formatRange ? f.formatRange(from, to) : `${f.format(from)} – ${f.format(to)}`;
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
