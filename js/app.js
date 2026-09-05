import * as store from './store.js';
import { raw, html } from './ui.js';
import * as home from './views/home.js';
import * as log from './views/log.js';
import * as muscles from './views/muscles.js';
import * as historyView from './views/history.js';
import * as settings from './views/settings.js';

const ROUTES = {
  '/home': { view: home, tab: '/home' },
  '/log': { view: log, tab: '/log' },
  '/muscles': { view: muscles, tab: '/muscles' },
  '/history': { view: historyView, tab: '/history' },
  '/settings': { view: settings, tab: '/settings' },
};

// Emoji rather than glyphs, so every tab carries its own colour: the scales
// and the heavy plus rendered near-grey next to the others, which made two of
// the five read as disabled.
const TABS = [
  ['/home', '🏠', 'Home'],
  ['/log', '📝', 'Log'],
  ['/muscles', '💪', 'Muscles'],
  ['/history', '📋', 'History'],
  ['/settings', '⚙️', 'Settings'],
];

const app = document.getElementById('app');
const nav = document.getElementById('nav');
let current = null;

function path() {
  const p = location.hash.replace(/^#/, '') || '/home';
  return ROUTES[p] ? p : '/home';
}

// Land on an explicit #/home rather than a bare URL, so every screen the user
// visits is its own history entry and the back gesture walks them in order.
if (!location.hash) history.replaceState(null, '', '#/home');

function render() {
  const p = path();
  const route = ROUTES[p];
  const scroll = p === current ? window.scrollY : 0;

  // Mount into a fresh element every time: views bind delegated listeners in
  // mount(), so reusing one container would stack a new handler set per render
  // and make each tap fire N times. Discarding the node discards its listeners.
  const screen = document.createElement('div');
  screen.innerHTML = route.view.view();
  app.replaceChildren(screen);
  route.view.mount(screen, render);

  nav.innerHTML = TABS.map(([href, ico, label]) =>
    `<a href="#${href}" class="${p === href ? 'on' : ''}"><span class="ico">${ico}</span>${label}</a>`).join('');

  current = p;
  window.scrollTo(0, scroll);
}

window.addEventListener('hashchange', render);
window.addEventListener('app:render', render);

// Back closes an open sheet before it leaves the screen.
window.addEventListener('popstate', () => {
  for (const r of Object.values(ROUTES)) {
    if (r.view.handleBack && r.view.handleBack()) break;
  }
  render();
});
store.subscribe(render);
render();

if (!window.SINGLE_FILE_BUILD && 'serviceWorker' in navigator) {
  // When a new build takes over, swap the running page for it. Without this an
  // installed app keeps showing the old code until it is force-closed, which
  // reads as "the update didn't work". Everything is persisted on write, so a
  // reload mid-workout loses nothing.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Ignore the first-ever registration, and never loop.
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  // updateViaCache: 'none' because the browser's HTTP cache otherwise answers
  // its own update check: GitHub Pages serves sw.js with a ten minute max-age,
  // so for ten minutes after a deploy the check fetches the *old* worker, finds
  // it byte-identical, and concludes there is nothing to install. The update
  // then lands whenever the app is next opened after that window, which reads
  // as "the deploy didn't work".
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(reg => {
        const check = () => { reg.update().catch(() => {}); };
        check();
        // Reopening the app is the moment a phone should notice a new build.
        // Throttled, because this fires on every return to the screen and one
        // conditional GET per minute is plenty.
        let last = Date.now();
        document.addEventListener('visibilitychange', () => {
          if (document.hidden || Date.now() - last < 60000) return;
          last = Date.now();
          check();
        });
      })
      .catch(() => {});
  });
}
