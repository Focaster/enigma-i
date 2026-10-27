#!/usr/bin/env node
/*
 * Build a fully self-contained copy of the machine:
 *   node build-standalone.mjs
 *
 * Everything (HTML, CSS, engine and UI JavaScript) ends up in a single
 * enigma-standalone.html that can be opened offline or sent to someone else.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => fs.readFileSync(path.join(here, name), 'utf8');

let html = read('index.html');
const css = read('styles.css');
const core = read('enigma-core.js');
const app = read('app.js');
const favicon = read('favicon.svg');

for (const [marker, payload, tag] of [
  ['<link rel="stylesheet" href="styles.css">', css, 'style'],
  ['<script src="enigma-core.js"></script>', core, 'script'],
  ['<script src="app.js"></script>', app, 'script'],
]) {
  if (!html.includes(marker)) throw new Error('Missing marker in index.html: ' + marker);
  html = html.replace(marker, () => `<${tag}>\n${payload}\n</${tag}>`);
}

const faviconMarker = '<link rel="icon" href="favicon.svg" type="image/svg+xml">';
if (!html.includes(faviconMarker)) throw new Error('Missing favicon link in index.html');
const faviconData = 'data:image/svg+xml;base64,' + Buffer.from(favicon, 'utf8').toString('base64');
html = html.replace(faviconMarker, () => `<link rel="icon" type="image/svg+xml" href="${faviconData}">`);

if (html.includes('src="app.js"') || html.includes('href="styles.css"') || html.includes('href="favicon.svg"')) {
  throw new Error('Standalone build still references external assets');
}

const banner = '<!-- Self-contained build. Source: index.html, styles.css, enigma-core.js, app.js, favicon.svg. -->\n';
html = html.replace('<!doctype html>', '<!doctype html>\n' + banner);

const out = path.join(here, 'enigma-standalone.html');
fs.writeFileSync(out, html, 'utf8');
console.log(`Wrote ${path.basename(out)} (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`);
