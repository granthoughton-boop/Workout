// Single source of truth. Everything lives in localStorage under one key so a
// backup is just one JSON blob.

import { EXERCISES, MUSCLES } from './data/exercises.js';
import { SEED_WORKOUTS } from './data/seed.js';

const KEY = 'workout.v1';
const listeners = new Set();

function blank() {
  return {
    version: 1,
    seededIds: null,       // ids of seed workouts already offered (null = never)
    workouts: [],          // finished workouts
    weights: [],           // { date: 'YYYY-MM-DD', kg }
    active: null,          // in-progress workout, or null
    targets: {},           // muscleId -> sets/week override
    customMuscles: {},     // exercise name -> muscle fraction override
    customExercises: [],   // { name, muscles }
    restSeconds: 90,
    restAlerts: true,      // sound + notification when a rest runs out
    alertsAsked: false,    // notification permission has been asked for once
  };
}

let state = load();
persist(); // write the seeded state immediately, don't wait for the first edit

function load() {
  let s;
  try {
    s = JSON.parse(localStorage.getItem(KEY)) || blank();
  } catch {
    s = blank();
  }
  return applySeed({ ...blank(), ...s });
}

// The bundled history is re-issued whenever a fresh Hevy export is generated,
// so seeding can't be a one-shot flag: an install that already ran would never
// see the new workouts. Seed ids are derived from start time and stay stable
// across exports, so tracking the ids already offered means a new export adds
// only what's genuinely new, and anything deleted stays deleted.
function applySeed(s) {
  if (!Array.isArray(s.seededIds)) {
    // Pre-tracking install. Treat every seed workout up to the newest one
    // already stored as offered, so this doesn't resurrect deleted workouts.
    const newest = s.workouts.reduce((max, w) => (w.start > max ? w.start : max), '');
    s.seededIds = SEED_WORKOUTS.filter(w => w.start <= newest).map(w => w.id);
  }

  const offered = new Set(s.seededIds);
  const starts = new Set(s.workouts.map(w => w.start));
  let added = 0;
  for (const w of SEED_WORKOUTS) {
    if (offered.has(w.id)) continue;
    s.seededIds.push(w.id);
    if (starts.has(w.start)) continue; // already logged by hand in the app
    s.workouts.push(w);
    added++;
  }
  if (added) s.workouts.sort((a, b) => a.start.localeCompare(b.start));
  return s;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save', err);
  }
}

export function get() { return state; }

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Mutate through here so saving and re-rendering can never be forgotten.
export function update(fn) {
  fn(state);
  persist();
  listeners.forEach(l => l());
}

// Save without re-rendering. Used for text/number fields: rebuilding the DOM
// under a focused input drops the on-screen keyboard and loses the edit.
export function updateQuiet(fn) {
  fn(state);
  persist();
}

export function replaceState(next) {
  // A backup restored from another device may predate the current export.
  state = applySeed({ ...blank(), ...next });
  persist();
  listeners.forEach(l => l());
}

/* ---------- exercise catalog ---------- */

export function catalog() {
  const all = [...EXERCISES, ...state.customExercises];
  return all.map(e => ({ ...e, muscles: state.customMuscles[e.name] || e.muscles }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function findExercise(name) {
  return catalog().find(e => e.name === name) || { name, muscles: {} };
}

export function targetFor(muscleId) {
  const override = state.targets[muscleId];
  if (typeof override === 'number') return override;
  return MUSCLES.find(m => m.id === muscleId)?.target ?? 0;
}

/* ---------- history queries ---------- */

// Sets the user actually completed. An unticked set is planned, not trained.
function completedSets(ex) {
  return ex.sets.filter(s => s.done);
}

export function lastPerformance(name, excludeId) {
  const past = state.workouts
    .filter(w => w.id !== excludeId)
    .sort((a, b) => b.start.localeCompare(a.start));
  for (const w of past) {
    const ex = w.exercises.find(e => e.name === name);
    if (ex && completedSets(ex).length) return { date: w.start, sets: completedSets(ex) };
  }
  return null;
}

// Every session that trained this exercise, newest first, with only the sets
// actually completed - the same rule the rest of the history queries use.
export function exerciseHistory(name) {
  const out = [];
  for (const w of state.workouts) {
    const sets = [];
    const notes = [];
    for (const ex of w.exercises) {
      if (ex.name !== name) continue;
      sets.push(...completedSets(ex));
      if (ex.notes) notes.push(ex.notes);
    }
    if (!sets.length) continue;
    const kg = sets.reduce((a, x) => a + x.w * x.r, 0);
    const top = sets.reduce((b, x) => (!b || x.w > b.w || (x.w === b.w && x.r > b.r) ? x : b), null);
    out.push({ id: w.id, title: w.title, start: w.start, sets, top, kg: Math.round(kg), notes });
  }
  return out.reverse();
}

export function personalBest(name) {
  let best = null;
  for (const w of state.workouts) {
    for (const ex of w.exercises.filter(e => e.name === name)) {
      for (const s of completedSets(ex)) {
        if (!best || s.w > best.w || (s.w === best.w && s.r > best.r)) best = { w: s.w, r: s.r };
      }
    }
  }
  return best;
}

/* ---------- weekly muscle volume ---------- */

export function weekWindow(now = new Date()) {
  const end = now;
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

// Rolling-7-day fractional set count per muscle, including the live workout so
// ticking a set on the log screen moves these numbers immediately.
export function weeklyVolume(now = new Date()) {
  const { start } = weekWindow(now);
  // Credit earned more than six days ago leaves the rolling window within the
  // next 24 hours, so a muscle can look satisfied today and be short tomorrow.
  const expiryEdge = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
  const totals = {};
  const expiring = {};
  const lastTrained = {};
  MUSCLES.forEach(m => { totals[m.id] = 0; expiring[m.id] = 0; });

  const sessions = state.active ? [...state.workouts, state.active] : state.workouts;
  for (const w of sessions) {
    const when = new Date(w.start);
    for (const ex of w.exercises) {
      const n = completedSets(ex).length;
      if (!n) continue;
      const muscles = findExercise(ex.name).muscles;
      for (const [id, frac] of Object.entries(muscles)) {
        if (totals[id] === undefined) continue;
        if (when >= start) {
          totals[id] += n * frac;
          if (when < expiryEdge) expiring[id] += n * frac;
        }
        if (!lastTrained[id] || when > lastTrained[id]) lastTrained[id] = when;
      }
    }
  }

  return MUSCLES.map(m => {
    const done = Math.round(totals[m.id] * 10) / 10;
    const leaving = Math.round(expiring[m.id] * 10) / 10;
    const target = targetFor(m.id);
    // What the window will show once today's oldest credit ages out. Planning
    // against this instead of the current number is what stops a muscle
    // quietly falling behind the moment a session rolls off.
    const projected = Math.round((done - leaving) * 10) / 10;
    return {
      id: m.id,
      name: m.name,
      done,
      target,
      expiring: leaving,
      projected,
      remaining: Math.max(0, Math.round((target - done) * 10) / 10),
      projectedRemaining: Math.max(0, Math.round((target - projected) * 10) / 10),
      pct: target ? Math.min(100, (done / target) * 100) : 0,
      lastTrained: lastTrained[m.id] || null,
    };
  });
}

/* ---------- weekly goal progress ---------- */

// Fractional set count per muscle inside an arbitrary window, used for past
// weeks. weeklyVolume() covers the live rolling week and carries the extra
// expiry bookkeeping the home and muscles screens need.
function musclesInWindow(start, end) {
  const totals = {};
  MUSCLES.forEach(m => { totals[m.id] = 0; });

  const sessions = state.active ? [...state.workouts, state.active] : state.workouts;
  for (const w of sessions) {
    const when = new Date(w.start);
    if (when < start || when >= end) continue;
    for (const ex of w.exercises) {
      const n = completedSets(ex).length;
      if (!n) continue;
      for (const [id, frac] of Object.entries(findExercise(ex.name).muscles)) {
        if (totals[id] === undefined) continue;
        totals[id] += n * frac;
      }
    }
  }
  return totals;
}

// One number for "how did the week go". Each muscle's credit is capped at its
// own target, so hammering chest can't paper over a week that never touched
// legs - 100% means every group was actually served.
function progressFrom(totals) {
  let sets = 0, credited = 0, target = 0, hit = 0, groups = 0;
  for (const m of MUSCLES) {
    const done = totals[m.id] || 0;
    const t = targetFor(m.id);
    sets += done;
    if (!t) continue;
    groups++;
    target += t;
    credited += Math.min(done, t);
    if (done >= t) hit++;
  }
  const r1 = n => Math.round(n * 10) / 10;
  return {
    sets: r1(sets),
    credited: r1(credited),
    target: r1(target),
    pct: target ? Math.round((credited / target) * 100) : 0,
    hit,
    groups,
  };
}

export function goalProgress(now = new Date()) {
  const totals = {};
  for (const m of weeklyVolume(now)) totals[m.id] = m.done;
  return progressFrom(totals);
}

// The weeks before the current rolling window, most recent first. Targets are
// today's targets: this answers "how would past weeks score against what I am
// aiming for now", which is what makes the rows comparable.
export function goalHistory(weeks = 8, now = new Date()) {
  const wk = 7 * 24 * 60 * 60 * 1000;
  const out = [];
  for (let i = 1; i <= weeks; i++) {
    const start = new Date(now.getTime() - (i + 1) * wk);
    const end = new Date(now.getTime() - i * wk);
    out.push({ start, end, weeksAgo: i, ...progressFrom(musclesInWindow(start, end)) });
  }
  return out;
}

/* ---------- what to train next ---------- */

// Suggestions are limited to things actually in rotation. A ranking full of
// lifts you have not touched in months is a reading list, not a prompt.
export const RECENT_DAYS = 30;

export function recentExercises(days = RECENT_DAYS, now = new Date()) {
  const cut = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const seen = new Set();
  const sessions = state.active ? [...state.workouts, state.active] : state.workouts;
  for (const w of sessions) {
    if (new Date(w.start) < cut) continue;
    for (const ex of w.exercises) {
      if (completedSets(ex).length) seen.add(ex.name);
    }
  }
  return seen;
}

// Ranks the catalog by how much one set would close the gap, weighted by how
// far behind each muscle is, and measured against the window as it will stand
// tomorrow rather than today. Credit past a target is worth nothing, so each
// contribution is capped at what is actually still needed.
export function suggestions(limit = 5, now = new Date()) {
  const vol = weeklyVolume(now);
  const byId = Object.fromEntries(vol.map(v => [v.id, v]));

  const recent = recentExercises(RECENT_DAYS, now);
  const ranked = catalog().filter(ex => recent.has(ex.name)).map(ex => {
    let score = 0;
    let gain = 0;
    const parts = [];
    for (const [id, frac] of Object.entries(ex.muscles)) {
      const v = byId[id];
      if (!v || !v.target) continue;
      const need = v.projectedRemaining;
      if (need <= 0) continue;
      const closes = Math.min(frac, need);
      gain += closes;
      score += closes * (need / v.target); // the further behind, the more it counts
      parts.push({ id, name: v.name, closes, frac });
    }
    parts.sort((a, b) => b.closes - a.closes);
    return { name: ex.name, score, gain: Math.round(gain * 10) / 10, parts };
  }).filter(s => s.score > 0);

  ranked.sort((a, b) => b.score - a.score || b.gain - a.gain || a.name.localeCompare(b.name));
  return ranked.slice(0, limit);
}

export function weekOutlook(now = new Date()) {
  const vol = weeklyVolume(now);
  const behind = vol.filter(v => v.projectedRemaining > 0);
  const rollingOff = vol.filter(v => v.expiring > 0)
    .sort((a, b) => b.expiring - a.expiring);

  // A muscle you are behind on that nothing in rotation trains would otherwise
  // just be missing from the rankings, which reads as "no gap here".
  const recent = recentExercises(RECENT_DAYS, now);
  const trainable = new Set();
  for (const ex of catalog()) {
    if (!recent.has(ex.name)) continue;
    for (const id of Object.keys(ex.muscles)) trainable.add(id);
  }
  const uncovered = behind.filter(v => !trainable.has(v.id));

  return {
    behind: behind.length,
    groups: vol.length,
    gap: Math.round(behind.reduce((a, v) => a + v.projectedRemaining, 0) * 10) / 10,
    rollingOff,
    expiringTotal: Math.round(rollingOff.reduce((a, v) => a + v.expiring, 0) * 10) / 10,
    uncovered,
    recentCount: recent.size,
  };
}

/* ---------- bodyweight ---------- */

export function todayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function logWeight(kg, date = todayKey()) {
  update(s => {
    const rounded = Math.round(kg * 10) / 10;
    const existing = s.weights.find(w => w.date === date);
    if (existing) existing.kg = rounded;
    else s.weights.push({ date, kg: rounded });
    s.weights.sort((a, b) => a.date.localeCompare(b.date));
  });
}

export function deleteWeight(date) {
  update(s => { s.weights = s.weights.filter(w => w.date !== date); });
}

export function weightStats() {
  const ws = state.weights;
  if (!ws.length) return null;
  const latest = ws[ws.length - 1];
  const avg = arr => arr.reduce((a, b) => a + b.kg, 0) / arr.length;
  const cutoff = k => {
    const d = new Date();
    d.setDate(d.getDate() - k);
    return todayKey(d);
  };
  const last7 = ws.filter(w => w.date >= cutoff(7));
  const prev7 = ws.filter(w => w.date >= cutoff(14) && w.date < cutoff(7));
  const trend = last7.length && prev7.length ? avg(last7) - avg(prev7) : null;
  return {
    latest,
    trend: trend === null ? null : Math.round(trend * 10) / 10,
    avg7: last7.length ? Math.round(avg(last7) * 10) / 10 : null,
    min: Math.min(...ws.map(w => w.kg)),
    max: Math.max(...ws.map(w => w.kg)),
  };
}

/* ---------- workout lifecycle ---------- */

export function startWorkout(title) {
  update(s => {
    s.active = {
      id: 'w' + Date.now(),
      title: title || defaultTitle(),
      start: new Date().toISOString().slice(0, 19),
      end: null,
      exercises: [],
    };
  });
}

function defaultTitle() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning workout';
  if (h < 17) return 'Afternoon workout';
  return 'Evening workout';
}

export function finishWorkout() {
  update(s => {
    if (!s.active) return;
    // Drop untouched sets and exercises so history stays honest.
    const w = s.active;
    w.exercises = w.exercises
      .map(e => ({ ...e, sets: e.sets.filter(x => x.done) }))
      .filter(e => e.sets.length);
    w.end = new Date().toISOString().slice(0, 19);
    if (w.exercises.length) s.workouts.push(w);
    s.workouts.sort((a, b) => a.start.localeCompare(b.start));
    s.active = null;
  });
}

export function discardWorkout() {
  update(s => { s.active = null; });
}

export function deleteWorkout(id) {
  update(s => { s.workouts = s.workouts.filter(w => w.id !== id); });
}

export function deleteSet(exIndex, setIndex) {
  update(st => {
    const ex = st.active && st.active.exercises[exIndex];
    if (!ex) return;
    ex.sets.splice(setIndex, 1);
  });
}

export function volumeOf(workout) {
  let kg = 0, sets = 0, exercises = 0;
  for (const ex of workout.exercises) {
    const done = ex.sets.filter(x => x.done);
    if (done.length) exercises++; // an exercise you have not yet worked isn't one you've done
    for (const s of done) { kg += s.w * s.r; sets++; }
  }
  return { kg: Math.round(kg), sets, exercises };
}
