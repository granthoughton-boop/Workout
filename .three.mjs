import { chromium } from 'playwright';
const URL = 'http://localhost:8200/index.html';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
// The user's zone - the one that makes the timestamp bug visible.
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Australia/Sydney' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL);
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
console.log('browser zone offset (min):', await page.evaluate(() => new Date().getTimezoneOffset()));

/* ---- 3. the clock ---- */
await page.goto(URL + '#/log');
await page.waitForSelector('[data-act="start"], [data-act="finish"]');
if (await page.$('[data-act="start"]')) await page.click('[data-act="start"]');
await page.waitForSelector('#dur');
console.log('time on a workout started just now:', await page.$eval('#dur', e => e.textContent));
console.log('stored start:', await page.evaluate(() =>
  JSON.parse(localStorage.getItem('workout.v1')).active.start), '| local now:',
  await page.evaluate(() => new Date().toString().slice(0, 24)));

/* ---- repair of a record written the old way ---- */
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('workout.v1'));
  const began = Date.now() - 45 * 60 * 1000;              // started 45 minutes ago
  s.active = null;
  s.workouts.push({
    id: 'w' + began,
    title: 'Old-style record',
    start: new Date(began).toISOString().slice(0, 19),     // the buggy UTC stamp
    end: new Date(began + 40 * 60 * 1000).toISOString().slice(0, 19),
    exercises: [{ name: 'Leg Press (Machine)', notes: '', sets: [{ w: 100, r: 10, done: true }] }],
  });
  localStorage.setItem('workout.v1', JSON.stringify(s));
});
await page.reload();
await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
const repaired = await page.evaluate(() => {
  const w = JSON.parse(localStorage.getItem('workout.v1')).workouts.find(x => x.title === 'Old-style record');
  return { start: w.start, end: w.end, shownAgo: (Date.now() - new Date(w.start)) / 60000 };
});
console.log('repaired record:', repaired.start, '->', repaired.end,
  `| reads as ${Math.round(repaired.shownAgo)} min ago, duration kept at`,
  Math.round((new Date(repaired.end) - new Date(repaired.start)) / 60000), 'min');
// Running it again must not move it a second time.
await page.reload();
await page.waitForTimeout(500);
console.log('idempotent:', repaired.start === await page.evaluate(() =>
  JSON.parse(localStorage.getItem('workout.v1')).workouts.find(x => x.title === 'Old-style record').start));

/* ---- 2. suggestions drop what is already done ---- */
await page.goto(URL + '#/log');
await page.waitForSelector('[data-act="start"], [data-act="finish"]');
if (await page.$('[data-act="start"]')) await page.click('[data-act="start"]');
await page.click('[data-act="coach"]');
await page.waitForSelector('.sug');
const top = await page.$eval('.sug .sug-name', e => e.textContent.trim());
console.log('top suggestion:', top);
await page.click('.sug');                                  // adds it
await page.waitForSelector('[data-act="tick"]');
await page.click('[data-act="tick"]');                     // completes a set of it
await page.click('[data-act="coach"]');
await page.waitForTimeout(300);
const after = await page.$$eval('.sug .sug-name', els => els.map(e => e.textContent.trim()));
console.log('after completing a set of it, ranking:', after.join(', ') || '(empty)');
console.log('still suggested:', after.includes(top));

/* ---- 1. the header stays put ---- */
for (let i = 0; i < 6; i++) await page.click('[data-act="add-ex"]').then(async () => {
  await page.waitForSelector('.pick'); await page.click('.pick');
});
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(400);
const head = await page.evaluate(() => {
  const s = document.querySelector('.stats').getBoundingClientRect();
  const t = document.querySelector('.topbar').getBoundingClientRect();
  return { scrollY: Math.round(window.scrollY), statsTop: Math.round(s.top), statsBottom: Math.round(s.bottom), topbarTop: Math.round(t.top) };
});
console.log('after scrolling', head.scrollY, 'px — topbar top', head.topbarTop, ', stats', head.statsTop, '->', head.statsBottom, head.statsBottom > 0 && head.statsTop < 200 ? '[visible]' : '[SCROLLED AWAY]');
console.log('time still shown while scrolled:', await page.$eval('#dur', e => e.textContent));

console.log('console errors:', errors.length ? errors : 'none');
await browser.close();
