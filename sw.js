// The cache name is stamped with a hash of the shipped files at build time
// (tools/build_site.mjs). That matters more than it looks: a browser only
// re-runs a service worker's install step when sw.js itself differs byte for
// byte, so a hand-maintained version string means any deploy that doesn't
// happen to touch this file leaves every installed app serving the old code
// forever. Stamping ties the two together automatically.
const CACHE = 'workout-__BUILD__';

const SHELL = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './icons/icon-192.png', './icons/icon-512.png',
  './icons/maskable-512.png', './icons/apple-touch-icon.png',
  './css/app.css',
  './js/app.js', './js/store.js', './js/ui.js', './js/version.js',
  './js/alerts.js',
  './js/data/exercises.js', './js/data/seed.js',
  './js/views/home.js', './js/views/log.js', './js/views/muscles.js',
  './js/views/history.js', './js/views/settings.js',
];

// cache: 'reload' on every precache request, because the browser's own HTTP
// cache sits underneath this one. GitHub Pages serves with a ten minute
// max-age, so a plain addAll here happily fills a brand new cache with the
// *previous* build's files - the worker updates, the cache name changes, and
// the app still runs the old code. Bypassing the HTTP cache is what makes an
// install actually mean "fetch the deploy that just landed".
self.addEventListener('install', e => {
  const fresh = SHELL.map(url => new Request(url, { cache: 'reload' }));
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(fresh)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// App code goes to the network first so a deploy is picked up as soon as there
// is signal, falling back to the cache when there isn't. Icons are immutable
// under their own names, so they stay cache-first.
const APP_CODE = /\.(?:html|js|css|webmanifest)$/;
const NET_TIMEOUT = 2500;

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

// Same reason as the install above: "network first" has to mean the network,
// not a ten minute old copy the browser is still holding. no-cache still
// revalidates, so an unchanged file comes back as a cheap 304.
function fetchFresh(req) {
  return fetch(req, { cache: 'no-cache' });
}

async function networkFirst(req) {
  // Kept as its own promise so a response that arrives after the timeout still
  // refreshes the cache for next launch.
  const net = fetchFresh(req).then(res => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
    }
    return res;
  });

  try {
    return await Promise.race([net, timeout(NET_TIMEOUT)]);
  } catch {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      return await net;
    } catch {
      // A navigation to any in-app URL can still be answered by the shell.
      const shell = await caches.match('./index.html');
      if (shell) return shell;
      return Response.error();
    }
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) {
    const copy = res.clone();
    caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
  }
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate' || APP_CODE.test(url.pathname)) {
    e.respondWith(networkFirst(req));
  } else {
    e.respondWith(cacheFirst(req));
  }
});

/* ---------- rest-timer notifications ---------- */

// The page schedules its own beep, but a backgrounded page cannot be trusted
// to run a timer at all - iOS suspends it outright. The worker keeps its own
// timer and turns it into a real notification, which is the banner at the top
// of the phone and the sound that comes with it.
//
// A worker is killed once it goes idle, so the wait is held inside the message
// event's waitUntil: the browser keeps the worker alive for as long as that
// promise is pending, which covers a rest of a few minutes.

// Scope-relative on purpose: the build's precache check reads every
// dot-slash-prefixed string literal in this file as a file that has to ship,
// and a URL carrying a hash route is not one of those.
const LOG_URL = 'index.html#/log';

let restCancel = null;

self.addEventListener('message', e => {
  const msg = e.data || {};
  if (msg.type === 'rest-start') {
    e.waitUntil(scheduleRest(msg.endsAt, msg.body));
  } else if (msg.type === 'rest-cancel') {
    // Called off - skipped, finished, or replaced by the next rest. Anything
    // still on screen about it is stale.
    clearRest();
    e.waitUntil(closeRestNotifications());
  } else if (msg.type === 'rest-done') {
    // The page saw the rest out itself. Drop the worker's own timer, but leave
    // any banner alone: it is the thing the user has not read yet.
    clearRest();
  }
});

function clearRest() {
  if (restCancel) { restCancel(); restCancel = null; }
}

function scheduleRest(endsAt, body) {
  clearRest();
  const wait = Math.max(0, endsAt - Date.now());
  return new Promise(resolve => {
    const id = setTimeout(() => {
      restCancel = null;
      fireRest(body).then(resolve, resolve);
    }, wait);
    restCancel = () => { clearTimeout(id); resolve(); };
  });
}

async function fireRest(body) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

  // App on screen: it makes its own noise, and a banner over the set you are
  // about to start is just something else to dismiss.
  if (windows.some(c => c.visibilityState === 'visible')) {
    for (const c of windows) c.postMessage({ type: 'rest-over' });
    return;
  }

  try {
    await self.registration.showNotification('Rest over', {
      body: body || 'Time for your next set.',
      tag: 'rest',
      renotify: true,
      silent: false,
      vibrate: [200, 100, 200],
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: LOG_URL },
    });
  } catch {
    // Permission not granted, or notifications unavailable on this platform.
  }
  for (const c of windows) c.postMessage({ type: 'rest-over' });
}

async function closeRestNotifications() {
  try {
    const open = await self.registration.getNotifications({ tag: 'rest' });
    for (const n of open) n.close();
  } catch { /* nothing to close */ }
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of windows) {
      if ('focus' in c) return c.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(LOG_URL);
  })());
});
