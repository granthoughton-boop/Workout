// Single source of truth. Everything lives in localStorage under one key so a
// backup is just one JSON blob.

import { EXERCISES, MUSCLES } from './data/exercises.js';
import { SEED_WORKOUTS } from './data/seed.js';

const KEY = 'workout.v1';
const listeners = new Set();

function blank() {
  return {
    version: 1,
    seeded: false,
    workouts: [],          // finished workouts
    weights: [],           // { date: 'YYYY-MM-DD', kg }
    active: null,          // in-progress workout, or null
    targets: {},           // muscleId -> sets/week override
    customMuscles: {},     // exercise name -> muscle fraction override
    customExercises: [],   // { name, muscles }
    restSeconds: 90,
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
  s = { ...blank(), ...s };
  if (!s.seeded) {
    s.workouts = SEED_WORKOUTS.slice();
    s.seeded = true;
  }
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
  state = { ...blank(), ...next, seeded: true };
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
  const totals = {};
  const lastTrained = {};
  MUSCLES.forEach(m => { totals[m.id] = 0; });

  const sessions = state.active ? [...state.workouts, state.active] : state.workouts;
  for (const w of sessions) {
    const when = new Date(w.start);
    for (const ex of w.exercises) {
      const n = completedSets(ex).length;
      if (!n) continue;
      const muscles = findExercise(ex.name).muscles;
      for (const [id, frac] of Object.entries(muscles)) {
        if (totals[id] === undefined) continue;
        if (when >= start) totals[id] += n * frac;
        if (!lastTrained[id] || when > lastTrained[id]) lastTrained[id] = when;
      }
    }
  }

  return MUSCLES.map(m => {
    const done = Math.round(totals[m.id] * 10) / 10;
    const target = targetFor(m.id);
    return {
      id: m.id,
      name: m.name,
      done,
      target,
      remaining: Math.max(0, Math.round((target - done) * 10) / 10),
      pct: target ? Math.min(100, (done / target) * 100) : 0,
      lastTrained: lastTrained[m.id] || null,
    };
  });
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

export function volumeOf(workout) {
  let kg = 0, sets = 0;
  for (const ex of workout.exercises) {
    for (const s of ex.sets.filter(x => x.done)) { kg += s.w * s.r; sets++; }
  }
  return { kg: Math.round(kg), sets };
}
