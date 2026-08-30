// Tiny helpers. No framework: views return HTML strings and wire behaviour with
// delegated [data-act] handlers.

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const html = (strings, ...vals) =>
  strings.reduce((out, s, i) => out + s + (i < vals.length ? render(vals[i]) : ''), '');

function render(v) {
  if (v === null || v === undefined || v === false) return '';
  if (Array.isArray(v)) return v.join('');
  if (v && v.raw) return v.value;
  return esc(v);
}

export const raw = value => ({ raw: true, value });

export const fmt = n => (Math.round(n * 10) / 10).toString();

export function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDay(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ago(date) {
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function duration(startIso, endIso) {
  const ms = (endIso ? new Date(endIso) : new Date()) - new Date(startIso);
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${m}min`;
  if (m) return `${m}min ${s}s`;
  return `${s}s`;
}

export function clock(seconds) {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.abs(seconds) % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function muscleSummary(muscles) {
  return Object.entries(muscles)
    .sort((a, b) => b[1] - a[1])
    .map(([id, f]) => `${id.replace(/_/g, ' ')} ${f}`)
    .join(' · ');
}

// Delegated click handling: <button data-act="foo" data-x="1">
export function onAct(root, map) {
  root.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const fn = map[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
}
