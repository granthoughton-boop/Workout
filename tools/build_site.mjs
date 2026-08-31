// Assembles the deployable site into _site/ and verifies it.
//
//   node tools/build_site.mjs [outdir]
//
// Only the app's own runtime files ship. Sources that exist to produce them
// (tools/, data/, node_modules/, the single-file build) stay out of the deploy.
// Then it checks the two things that fail silently in a browser rather than
// loudly in CI: a file the service worker precaches that isn't there (addAll
// rejects, so the app never works offline), and a manifest icon that 404s
// (Android quietly declines to offer the install).

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] || join(root, '_site'));

const SHIP = [
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'icon.svg',
  '.nojekyll',
  'icons',
  'css',
  'js',
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const entry of SHIP) {
  const from = join(root, entry);
  if (!existsSync(from)) {
    console.error(`missing required path: ${entry}`);
    process.exit(1);
  }
  cpSync(from, join(out, entry), { recursive: true });
}

// GitHub Pages runs Jekyll unless told not to; cpSync of a dotfile is easy to
// lose track of, so make sure it landed.
if (!existsSync(join(out, '.nojekyll'))) writeFileSync(join(out, '.nojekyll'), '');

const problems = [];

// Everything the service worker precaches must exist, or addAll rejects and
// the install silently has no offline support.
const sw = readFileSync(join(root, 'sw.js'), 'utf8');
const shell = [...sw.matchAll(/'\.\/([^']*)'/g)].map(m => m[1]).filter(Boolean);
for (const rel of shell) {
  if (!existsSync(join(out, rel))) problems.push(`service worker precaches missing file: ${rel}`);
}

// Every manifest icon must resolve, or Android won't offer to install.
const manifest = JSON.parse(readFileSync(join(out, 'manifest.webmanifest'), 'utf8'));
for (const icon of manifest.icons || []) {
  if (!existsSync(join(out, icon.src))) problems.push(`manifest icon missing: ${icon.src}`);
}
if (!(manifest.icons || []).some(i => i.type === 'image/png' && /192/.test(i.sizes))) {
  problems.push('manifest has no 192px PNG icon; Android will not offer to install');
}

// Every module the app imports must be present.
const seen = new Set();
const walk = rel => {
  if (seen.has(rel)) return;
  seen.add(rel);
  const file = join(out, rel);
  if (!existsSync(file)) return problems.push(`imported module missing: ${rel}`);
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/from\s+'(\.[^']+)'/g)) {
    walk(join(dirname(rel), m[1]).split('\\').join('/'));
  }
};
walk('js/app.js');

if (problems.length) {
  console.error('site verification failed:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

console.log(`built ${out}`);
console.log(`  ${shell.length} precached files, ${(manifest.icons || []).length} icons, ${seen.size} modules — all present`);
