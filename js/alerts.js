// Rest-timer alerts: a sound and a notification when the rest is up, including
// when the phone has moved on to something else.
//
// Three things have to line up for that to work on a phone:
//
//  1. Audio can only start from a user gesture, so the context is unlocked on
//     the tap that starts the rest and the beep is *scheduled* into it there
//     and then. A scheduled beep survives the screen going off on Android,
//     where a setTimeout in a backgrounded page is throttled to minutes.
//  2. iOS suspends the audio context the moment the app is backgrounded, so
//     audio alone can never be the whole answer there. The service worker
//     posts a real OS notification instead - which is also the banner at the
//     top of the screen, and brings the system's own sound with it.
//  3. Both paths can fire, so each one records that it rang and the other
//     stands down rather than beeping twice.

let ctx = null;
let scheduled = [];   // audio nodes for the rest currently in flight
let rangAt = 0;       // when a beep last actually sounded

const AUDIBLE = 0.35;
const CARRIER = 0.0001; // inaudible, but enough that the tab counts as playing

/* ---------- sound ---------- */

// Safe to call on every gesture: creating the context is what a browser wants
// to see happen inside a tap, and resuming a running one is a no-op.
export function prime() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

function blip(when, freq, dur = 0.14) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, when);
  // Exponential ramps can't touch zero, hence the near-silent endpoints.
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(AUDIBLE, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(ctx.destination);
  o.start(when);
  o.stop(when + dur + 0.05);
  return o;
}

// Two rising blips: short enough not to be a nuisance in a gym, distinct
// enough to hear over music.
function chime(at) {
  const first = blip(at, 880);
  blip(at + 0.22, 1320);
  first.onended = () => { rangAt = Date.now(); };
  return first;
}

function stopNodes() {
  for (const n of scheduled) {
    try { n.stop(); } catch { /* already stopped */ }
    try { n.disconnect(); } catch { /* already gone */ }
  }
  scheduled = [];
}

/* ---------- service worker ---------- */

function tellWorker(msg) {
  try {
    const sw = navigator.serviceWorker;
    if (sw && sw.controller) sw.controller.postMessage(msg);
  } catch { /* no worker: the audio path still stands */ }
}

export function canNotify() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

export function permission() {
  return canNotify() ? Notification.permission : 'unsupported';
}

// Must be called inside a user gesture - iOS refuses otherwise, and Chrome
// counts an unprompted ask against the site.
export async function askPermission() {
  if (!canNotify()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/* ---------- the rest timer ---------- */

// endsAt is a wall-clock ms timestamp. Called from the tap that starts the
// rest, so the audio context is unlockable at this point and not later.
export function scheduleRest(endsAt, body) {
  cancelRest({ keepSound: false });
  prime();

  const secs = (endsAt - Date.now()) / 1000;
  if (ctx && secs > 0) {
    const at = ctx.currentTime + secs;
    // A carrier tone holds the audio graph open for the whole rest. Without
    // something playing, a backgrounded tab's context is free to be suspended
    // and the beep waiting at the end of it never arrives.
    const carrier = ctx.createOscillator();
    const cg = ctx.createGain();
    cg.gain.value = CARRIER;
    carrier.frequency.value = 60;
    carrier.connect(cg).connect(ctx.destination);
    carrier.start();
    carrier.stop(at + 0.6);
    scheduled = [carrier, chime(at)];
  }

  tellWorker({ type: 'rest-start', endsAt, body: body || 'Time for your next set.' });
}

export function cancelRest({ keepSound = false } = {}) {
  if (!keepSound) stopNodes();
  tellWorker({ type: 'rest-cancel' });
}

// The countdown reached zero with the page still alive. Whatever got here
// first, make sure exactly one sound happens - and leave any banner the worker
// has posted where it is, since on Android the page can reach this while the
// phone is still in the user's pocket.
export function restEnded() {
  ring();
  stopNodes();
  tellWorker({ type: 'rest-done' });
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

// Beep now, unless the scheduled chime just did it for us.
export function ring() {
  if (Date.now() - rangAt < 3000) return;
  prime();
  if (!ctx) return;
  rangAt = Date.now();
  chime(ctx.currentTime + 0.02);
}

// A rest that ended while the app was in the background: the worker saw it
// first and is telling the page so the bar can clear itself.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (!e.data || e.data.type !== 'rest-over') return;
    ring();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    window.dispatchEvent(new Event('rest:over'));
  });
}
