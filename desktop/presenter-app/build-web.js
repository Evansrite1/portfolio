'use strict';
/* Copies the Presenter's pages into ./web so they travel inside the installer (the app then works with no internet).
   The list comes from tools/second-screen-presenter/bundle.json, made by make_bundle.py in the site folder. */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const man = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'second-screen-presenter', 'bundle.json'), 'utf8'));
const out = path.join(__dirname, 'web');
fs.rmSync(out, { recursive: true, force: true });
let n = 0;
Object.keys(man.files).forEach((p) => {
  const to = path.join(out, p); fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(root, p), to); n++;
});
fs.copyFileSync(path.join(root, 'tools', 'second-screen-presenter', 'bundle.json'), path.join(out, 'tools', 'second-screen-presenter', 'bundle.json'));
console.log('web bundle ' + man.v + ': ' + n + ' files copied');
