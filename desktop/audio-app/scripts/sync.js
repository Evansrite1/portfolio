'use strict';
// Copies the studio from the website into the app, so the app and the web version are always the same code.
// The pages ask for files like /tools/am/engine.js, so the folders keep their names under web/.
const fs = require('fs');
const path = require('path');

const site = path.join(__dirname, '..', '..', '..', 'tools');
const out = path.join(__dirname, '..', 'web', 'tools');
const items = [['am', 'am'], ['audio-mastering/app', 'audio-mastering/app'], ['vendor/mediabunny', 'vendor/mediabunny']];

function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const a = path.join(from, e.name), b = path.join(to, e.name);
    if (e.isDirectory()) copy(a, b); else fs.copyFileSync(a, b);
  }
}

if (!fs.existsSync(site)) { console.error('The website tools folder was not found at ' + site); process.exit(1); }
fs.rmSync(path.join(__dirname, '..', 'web'), { recursive: true, force: true });
for (const [a, b] of items) copy(path.join(site, a), path.join(out, b));
fs.writeFileSync(path.join(__dirname, '..', 'web', 'FROM_WEBSITE.txt'), 'Copied from the website tools folder by scripts/sync.js. Do not edit here.\n');
console.log('Studio files copied.');
