// Renders the home-screen icons from icon.svg.
//
// iOS ignores an SVG apple-touch-icon (it falls back to a screenshot of the
// page), and Android's install criteria want a raster icon of at least 192px,
// so the PNGs are not optional for "Add to Home Screen".
//
//   npm i playwright && node tools/gen_icons.mjs

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The dumbbell mark, drawn on a 192-unit grid. Kept inside the middle 80% so a
// maskable icon can be cropped to any shape without clipping it.
const MARK = `
  <g fill="#2f7cf6">
    <rect x="26" y="78" width="20" height="36" rx="6"/>
    <rect x="146" y="78" width="20" height="36" rx="6"/>
    <rect x="50" y="66" width="24" height="60" rx="8"/>
    <rect x="118" y="66" width="24" height="60" rx="8"/>
    <rect x="70" y="87" width="52" height="18" rx="6"/>
  </g>`;

// `rounded` matches the in-app icon; `square` is full-bleed, for Apple (which
// applies its own corner radius) and for maskable, which the OS crops itself.
const svg = shape => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192">
  <rect width="192" height="192" ${shape === 'rounded' ? 'rx="42" ' : ''}fill="#000"/>
  ${MARK}
</svg>`;

const TARGETS = [
  { file: 'icons/icon-192.png', size: 192, shape: 'rounded' },
  { file: 'icons/icon-512.png', size: 512, shape: 'rounded' },
  { file: 'icons/maskable-512.png', size: 512, shape: 'square' },
  { file: 'icons/apple-touch-icon.png', size: 180, shape: 'square' },
];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

for (const { file, size, shape } of TARGETS) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg(shape)}`
  );
  writeFileSync(join(root, file), await page.screenshot({ omitBackground: false }));
  await page.close();
  console.log(`wrote ${file} (${size}x${size})`);
}

await browser.close();
