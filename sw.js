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
  './js/data/exercises.js', './js/data/seed.js',
  './js/views/home.js', './js/views/log.js', './js/views/muscles.js',
  './js/views/history.js', './js/views/settings.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

async function networkFirst(req) {
  // Kept as its own promise so a response that arrives after the timeout still
  // refreshes the cache for next launch.
  const net = fetch(req).then(res => {
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
