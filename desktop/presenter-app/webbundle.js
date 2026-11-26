'use strict';
/* The Presenter's pages live inside the app, so it opens and works with no internet (HDMI, Bible, songs, listening).
   The app asks the site once in a while whether a newer set of pages exists. If so it offers "Update now": the changed files are
   downloaded right inside the app, saved next to the settings and used from then on, with no trip to a website and no new installer.
   Files from the site are only ever read from the site's own address and are checked against the list before they are kept. */
const { app, net, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const MANIFEST = '/tools/second-screen-presenter/bundle.json';
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json', webmanifest: 'application/manifest+json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', webm: 'video/webm', mp4: 'video/mp4', wasm: 'application/wasm', onnx: 'application/octet-stream', txt: 'text/plain; charset=utf-8', ico: 'image/x-icon' };

module.exports = function webBundle(o) {
  const { site, origin, send } = o;
  const packaged = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, 'web');
  const user = path.join(app.getPath('userData'), 'web');
  const baseFile = path.join(app.getPath('userData'), 'web-base.json');

  /* a new installer brings its own newer pages, so older downloaded pages are cleared once */
  try {
    const b = JSON.parse(fs.readFileSync(baseFile, 'utf8'));
    if (b.v !== app.getVersion()) { fs.rmSync(user, { recursive: true, force: true }); fs.writeFileSync(baseFile, JSON.stringify({ v: app.getVersion() })); }
  } catch (e) { try { fs.writeFileSync(baseFile, JSON.stringify({ v: app.getVersion() })); } catch (e2) { /* optional */ } }

  const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
  const MREL = path.join('tools', 'second-screen-presenter', 'bundle.json');
  const localManifest = () => readJson(path.join(user, MREL)) || readJson(path.join(packaged, MREL));

  function resolveFile(rel) {
    for (const root of [user, packaged]) {
      const f = path.normalize(path.join(root, rel));
      if (f.startsWith(root + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) return f;
    }
    return null;
  }

  async function fileResponse(file, req) {
    const ext = path.extname(file).slice(1).toLowerCase(), size = fs.statSync(file).size;
    const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    const range = req.headers.get('range'), m = range && /bytes=(\d*)-(\d*)/.exec(range);
    if (m && size) {
      let start = 0, end = size - 1;
      if (m[1] !== '') { start = +m[1]; if (m[2] !== '') end = Math.min(+m[2], size - 1); } else if (m[2] !== '') start = Math.max(0, size - +m[2]);
      if (start > end) return new Response('Bad range', { status: 416 });
      headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size; headers['Content-Length'] = String(end - start + 1);
      return new Response(require('stream').Readable.toWeb(fs.createReadStream(file, { start, end })), { status: 206, headers });
    }
    headers['Content-Length'] = String(size);
    return new Response(size ? require('stream').Readable.toWeb(fs.createReadStream(file)) : null, { status: 200, headers });
  }

  /* pages of the site that are inside the app come from the computer; everything else goes to the internet as usual */
  function install() {
    protocol.handle('https', (req) => {
      try {
        const u = new URL(req.url);
        if (u.origin === origin && req.method === 'GET') {
          let rel = decodeURIComponent(u.pathname); if (rel.endsWith('/')) rel += 'index.html';
          const f = resolveFile(rel);
          if (f) return fileResponse(f, req);
        }
      } catch (e) { /* fall through to the network */ }
      return net.fetch(req, { bypassCustomProtocolHandlers: true });
    });
  }

  function sha1(buf) { return crypto.createHash('sha1').update(buf).digest('hex'); }
  async function getRemote() {
    const r = await net.fetch(site + MANIFEST + '?t=' + Date.now(), { bypassCustomProtocolHandlers: true, cache: 'no-store' });
    if (!r.ok) throw new Error('no manifest');
    return r.json();
  }
  function diff(remote) {
    const local = localManifest(), have = (local && local.files) || {}, out = [];
    Object.keys(remote.files || {}).forEach((p) => { if (have[p] !== remote.files[p]) out.push(p); });
    return out;
  }

  let pending = null;
  async function check() {
    try {
      const remote = await getRemote(), local = localManifest();
      if (!remote || !remote.files || (local && local.v === remote.v)) return null;
      const changed = diff(remote); if (!changed.length) return null;
      const bytes = changed.reduce((n, p) => n + (+String(remote.files[p]).split(':')[1] || 0), 0);
      pending = { remote, changed };
      return { state: 'web', version: remote.v, files: changed.length, bytes };
    } catch (e) { return null; /* offline: the pages in the app keep working */ }
  }

  async function apply(progress) {
    if (!pending) { const c = await check(); if (!c) return { ok: false, reason: 'none' }; }
    const { remote, changed } = pending;
    const stage = path.join(app.getPath('userData'), 'web-staging');
    fs.rmSync(stage, { recursive: true, force: true }); fs.mkdirSync(stage, { recursive: true });
    let done = 0;
    for (const p of changed) {
      const want = String(remote.files[p]).split(':')[0];
      if (!/^\/tools\/[A-Za-z0-9_./@-]+$/.test(p) || p.includes('..')) throw new Error('bad path');
      const r = await net.fetch(site + p + '?t=' + remote.v, { bypassCustomProtocolHandlers: true, cache: 'no-store' });
      if (!r.ok) throw new Error('download failed: ' + p);
      const buf = Buffer.from(await r.arrayBuffer());
      if (sha1(buf) !== want) throw new Error('check failed: ' + p);
      const dest = path.join(stage, p); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buf);
      done++; if (progress) progress(done / changed.length);
    }
    for (const p of changed) { const to = path.join(user, p); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(stage, p), to); }
    fs.mkdirSync(path.dirname(path.join(user, MREL)), { recursive: true }); fs.writeFileSync(path.join(user, MREL), JSON.stringify(remote));
    fs.rmSync(stage, { recursive: true, force: true });
    pending = null;
    return { ok: true };
  }

  return { install, check, apply };
};
