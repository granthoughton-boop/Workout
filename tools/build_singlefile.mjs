// Bundles the app into one self-contained HTML file (no modules, no network
// requests). Used for the hosted preview; the repo itself stays multi-file.
//
//   npm i esbuild && node tools/build_singlefile.mjs [outfile]

import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'dist', 'workout.html');
mkdirSync(dirname(out), { recursive: true });

const { outputFiles } = await esbuild.build({
  entryPoints: [join(root, 'js/app.js')],
  bundle: true, format: 'iife', target: 'es2020', charset: 'ascii',
  write: false, outfile: 'bundle.js',
});

// esbuild's ascii charset escapes string literals but leaves template-literal
// contents alone, and this file gets inlined by hosts that may not declare a
// charset. Escaping every non-ASCII code unit keeps the output byte-safe.
const js = outputFiles[0].text.replace(/[^\x00-\x7F]/g,
  c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const css = readFileSync(join(root, 'css/app.css'), 'utf8');

writeFileSync(out, `<title>Workout Log</title>
<style>
${css}</style>

<div id="app"></div>
<nav class="tabs" id="nav"></nav>

<script>window.SINGLE_FILE_BUILD = true;</script>
<script>
${js}</script>
`);

const bytes = readFileSync(out);
console.log(`wrote ${out} - ${(bytes.length / 1024).toFixed(0)}kB, ` +
  `${bytes.filter(b => b > 127).length} non-ascii bytes`);
