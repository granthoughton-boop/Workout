import * as store from '../store.js';
import { html, raw, fmt, ago, onAct } from '../ui.js';

export function view() {
  const vol = store.weeklyVolume();
  const totalDone = vol.reduce((a, m) => a + m.done, 0);
  const totalTarget = vol.reduce((a, m) => a + m.target, 0);
  const hit = vol.filter(m => m.remaining === 0).length;
  const { start } = store.weekWindow();

  return html`
    <div class="topbar"><h1>Muscle groups<span class="sub">Rolling 7 days · since ${start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></h1>
      <a href="#/settings" class="pill" style="text-decoration:none">Targets</a></div>
    <main>
      <div class="card">
        <div class="row" style="gap:20px">
          <div><div class="bw-now" style="font-size:34px">${fmt(totalDone)}<span> / ${totalTarget}</span></div>
            <div class="tiny muted" style="margin-top:4px">sets this week</div></div>
          <div style="margin-left:auto" class="center">
            <div class="bw-now" style="font-size:34px">${hit}<span> / ${vol.length}</span></div>
            <div class="tiny muted" style="margin-top:4px">at target</div></div>
        </div>
      </div>

      <div class="card">
        ${raw(vol.map(m => html`
          <div class="mg">
            <div class="mg-top">
              <span class="mg-name">${m.name}</span>
              <span class="mg-num"><b>${fmt(m.done)}</b> / ${m.target}${raw(m.remaining > 0
                ? ` <span style="color:var(--muted)">· ${fmt(m.remaining)} left</span>`
                : ' <span style="color:var(--green)">· done</span>')}</span>
            </div>
            <div class="bar"><i class="${cls(m)}" style="width:${m.pct.toFixed(1)}%"></i></div>
            ${raw(m.done === 0 && m.lastTrained
              ? `<div class="tiny muted" style="margin-top:5px">Last trained ${ago(m.lastTrained)}</div>` : '')}
          </div>`).join(''))}
        <div class="legend">
          <span><i style="background:var(--green)"></i>Target met</span>
          <span><i style="background:var(--accent)"></i>On track</span>
          <span><i style="background:#ff9f0a"></i>Under half</span>
          <span><i style="background:var(--red)"></i>Nothing yet</span>
        </div>
      </div>

      <div class="card">
        <h2>How this is counted</h2>
        <p class="small muted" style="margin:0 0 12px">
          Each completed set is split across the muscles that exercise trains — an Incline DB Press
          set counts 1.0 to Chest, 0.5 to Front Delts and 0.5 to Triceps. Only ticked sets count.
        </p>
        <button class="btn ghost" data-act="breakdown">Show per-exercise contributions</button>
        <div id="bd" hidden style="margin-top:12px">
          ${raw(store.catalog().map(e => html`
            <div class="mg"><div class="mg-name small">${e.name}</div>
            <div class="tiny muted" style="margin-top:3px">${raw(Object.entries(e.muscles)
              .sort((a, b) => b[1] - a[1])
              .map(([id, f]) => `${muscleName(id)} ${f}`).join(' · ') || 'unmapped')}</div></div>`).join(''))}
        </div>
      </div>
    </main>`;
}

function muscleName(id) {
  return id.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function cls(m) {
  if (m.done === 0) return 'none';
  if (m.remaining === 0) return 'done';
  if (m.pct < 50) return 'low';
  return '';
}

export function mount(root) {
  onAct(root, {
    breakdown: el => {
      const bd = root.querySelector('#bd');
      bd.hidden = !bd.hidden;
      el.textContent = bd.hidden ? 'Show per-exercise contributions' : 'Hide per-exercise contributions';
    },
  });
}
