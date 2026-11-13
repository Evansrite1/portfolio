'use strict';
/* The sending side. It serves ONLY the files the person picked (each under a random id, never a path),
   behind a secret token that is handed out by a 6 digit code or by a copied link. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { newToken, newCode, newId, safeEqual } = require('./safe');

const MAX_ENTRIES = 50000;
const PAIR_ATTEMPTS = 5;
const DEFAULT_TTL_MS = 2 * 60 * 60 * 1000;

class ShareServer extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.deviceName = opts.deviceName || 'This computer';
    this.platform = opts.platform || process.platform;
    this.ttl = opts.ttlMs || DEFAULT_TTL_MS;
    this.files = new Map();        /* id -> { id, name, abs, size, mtimeMs, hash } */
    this.server = null;
    this.token = null;
    this.code = null;
    this.failures = 0;
    this.expiresAt = 0;
    this.sent = new Map();         /* id -> bytes served (highest offset reached) */
    this.clients = new Set();
    this._hashing = false;
    this._timer = null;
    this._progressTimer = null;
    this._sockets = new Set();
  }

  /* ------------------------------------------------------------ choosing files */
  async addPaths(paths) {
    if (this.server) throw new Error('Stop sharing before changing the files');
    const have = new Set([...this.files.values()].map((f) => f.abs));
    let added = 0, skipped = 0;
    const add = async (abs, name) => {
      if (this.files.size >= MAX_ENTRIES) { skipped++; return; }
      if (have.has(abs)) return;
      let st; try { st = await fs.promises.lstat(abs); } catch (e) { skipped++; return; }
      if (!st.isFile()) { skipped++; return; }       /* symbolic links, sockets and devices are never shared */
      have.add(abs);
      const id = newId();
      this.files.set(id, { id, name, abs, size: st.size, mtimeMs: st.mtimeMs, hash: null });
      added++;
    };
    const walk = async (dir, prefix) => {
      let list; try { list = await fs.promises.readdir(dir, { withFileTypes: true }); } catch (e) { skipped++; return; }
      list.sort((a, b) => a.name.localeCompare(b.name));
      for (const d of list) {
        if (this.files.size >= MAX_ENTRIES) { skipped++; return; }
        const abs = path.join(dir, d.name);
        if (d.isSymbolicLink()) { skipped++; continue; }
        if (d.isDirectory()) await walk(abs, prefix + '/' + d.name);
        else if (d.isFile()) await add(abs, prefix + '/' + d.name);
      }
    };
    for (const p of paths) {
      if (typeof p !== 'string' || !path.isAbsolute(p)) { skipped++; continue; }
      let st; try { st = await fs.promises.lstat(p); } catch (e) { skipped++; continue; }
      if (st.isSymbolicLink()) { skipped++; continue; }
      if (st.isDirectory()) await walk(p, path.basename(p));
      else await add(p, path.basename(p));
    }
    return { added, skipped, files: this.list() };
  }
  remove(id) { if (this.server) return false; return this.files.delete(id); }
  clear() { if (this.server) return false; this.files.clear(); return true; }
  list() { return [...this.files.values()].map((f) => ({ id: f.id, name: f.name, size: f.size, hashed: !!f.hash })); }
  total() { let n = 0; for (const f of this.files.values()) n += f.size; return n; }

  /* ------------------------------------------------------------ start and stop */
  async start(opts = {}) {
    if (this.server) throw new Error('Already sharing');
    if (!this.files.size) throw new Error('Choose at least one file first');
    this.token = newToken(); this.code = newCode(); this.failures = 0;
    this.sent.clear(); this.clients.clear();
    this.expiresAt = Date.now() + this.ttl;
    const server = http.createServer((req, res) => this._handle(req, res));
    server.headersTimeout = 15000;
    server.requestTimeout = 0;                         /* downloads of large files must never be cut off */
    server.on('connection', (s) => { this._sockets.add(s); s.on('close', () => this._sockets.delete(s)); });
    /* A fixed port lets a firewall rule name it; if something else holds it, any free port does. */
    const listen = (port) => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', () => { server.removeListener('error', reject); resolve(); });
    });
    try { await listen(opts.port || 0); }
    catch (e) { if (opts.port && e.code === 'EADDRINUSE') await listen(0); else throw e; }
    server.on('error', (e) => this.emit('error', e));
    this.server = server;
    this.port = server.address().port;
    this._timer = setInterval(() => { if (Date.now() > this.expiresAt) { this.stop(); this.emit('expired'); } }, 5000);
    this._timer.unref && this._timer.unref();
    this._progressTimer = setInterval(() => this._flushProgress(), 250);
    this._progressTimer.unref && this._progressTimer.unref();
    this._hashAll();
    return { port: this.port, token: this.token, code: this.code, expiresAt: this.expiresAt };
  }

  stop() {
    clearInterval(this._timer); clearInterval(this._progressTimer);
    this._timer = this._progressTimer = null;
    const s = this.server; this.server = null; this.token = null; this.code = null;
    if (s) { try { s.close(); } catch (e) {} for (const sock of this._sockets) sock.destroy(); this._sockets.clear(); }
    this.emit('stopped');
  }

  get active() { return !!this.server; }

  /* ------------------------------------------------------------ checksums */
  async _hashAll() {
    if (this._hashing) return; this._hashing = true;
    try {
      for (const f of this.files.values()) {
        if (!this.server) break;
        if (f.hash) continue;
        try {
          f.hash = await new Promise((resolve, reject) => {
            const h = crypto.createHash('sha256');
            fs.createReadStream(f.abs, { highWaterMark: 1 << 20 }).on('data', (c) => h.update(c)).on('error', reject).on('end', () => resolve(h.digest('hex')));
          });
          const st = await fs.promises.stat(f.abs);
          if (st.size !== f.size || st.mtimeMs !== f.mtimeMs) f.hash = null, f.changed = true;
        } catch (e) { f.changed = true; }
        this.emit('hashed', { id: f.id, ok: !!f.hash });
      }
    } finally { this._hashing = false; }
  }

  /* ------------------------------------------------------------ progress for the sender's screen */
  _note(id, upTo) {
    const cur = this.sent.get(id) || 0;
    if (upTo > cur) { this.sent.set(id, upTo); this._dirty = true; }
  }
  _flushProgress() {
    if (!this._dirty) return;
    this._dirty = false;
    const o = {}; for (const [id, n] of this.sent) o[id] = n;
    this.emit('progress', o);
  }

  /* ------------------------------------------------------------ HTTP */
  _tokenOk(url) {
    const t = url.searchParams.get('t');
    return !!(this.token && t && /^[0-9a-f]{32}$/.test(t) && safeEqual(t, this.token));
  }

  _send(res, status, body, type) {
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8', 'Content-Length': buf.length });
    res.end(buf);
  }
  _json(res, status, obj) { this._send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8'); }

  _handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (!this.server) return this._send(res, 410, 'This share has ended.');
    if (Date.now() > this.expiresAt) { this.stop(); this.emit('expired'); return this._send(res, 410, 'This share has expired.'); }
    let url;
    try { url = new URL(req.url, 'http://file-share.local'); } catch (e) { return this._send(res, 400, 'Bad request'); }
    const ip = req.socket.remoteAddress;

    if (req.method === 'POST' && url.pathname === '/api/pair') return this._pair(req, res, ip);
    if (req.method !== 'GET' && req.method !== 'HEAD') return this._send(res, 405, 'Method not allowed');
    if (!this._tokenOk(url)) return this._send(res, 401, 'This link is not valid. Ask the sender for a new one.');
    this._seen(ip);

    if (url.pathname === '/api/offer') {
      return this._json(res, 200, {
        name: this.deviceName, platform: this.platform, total: this.total(),
        files: [...this.files.values()].map((f) => ({ id: f.id, name: f.name, size: f.size }))
      });
    }
    let m;
    if ((m = /^\/api\/hash\/([0-9a-f]{12})$/.exec(url.pathname))) {
      const f = this.files.get(m[1]);
      if (!f) return this._send(res, 404, 'No such file');
      if (f.changed) return this._json(res, 409, { error: 'changed' });
      return this._json(res, 200, { ready: !!f.hash, sha256: f.hash || null });
    }
    if ((m = /^\/api\/file\/([0-9a-f]{12})$/.exec(url.pathname))) return this._file(req, res, m[1]);
    return this._send(res, 404, 'Not found');
  }

  _seen(ip) {
    if (!this.clients.has(ip)) { this.clients.add(ip); this.emit('client', ip); }
  }

  _readBody(req, max) {
    return new Promise((resolve, reject) => {
      let n = 0; const parts = [];
      req.on('data', (c) => { n += c.length; if (n > max) { reject(new Error('too large')); req.destroy(); } else parts.push(c); });
      req.on('end', () => resolve(Buffer.concat(parts).toString('utf8')));
      req.on('error', reject);
    });
  }

  async _pair(req, res, ip) {
    if (this.failures >= PAIR_ATTEMPTS) return this._json(res, 423, { error: 'locked', message: 'Too many wrong codes. The sender must share again to get a new code.' });
    let code = '';
    try { code = String(JSON.parse(await this._readBody(req, 1024)).code || ''); } catch (e) { return this._json(res, 400, { error: 'bad request' }); }
    if (!/^\d{6}$/.test(code) || !safeEqual(code, this.code)) {
      this.failures++;
      this.emit('wrong-code', { ip, left: Math.max(0, PAIR_ATTEMPTS - this.failures) });
      return this._json(res, 403, { error: 'wrong code', left: Math.max(0, PAIR_ATTEMPTS - this.failures) });
    }
    this._seen(ip);
    this.emit('paired', ip);
    return this._json(res, 200, { token: this.token });
  }

  _file(req, res, id) {
    const f = this.files.get(id);
    if (!f) return this._send(res, 404, 'No such file');
    fs.stat(f.abs, (err, st) => {
      if (err || !st.isFile()) return this._send(res, 404, 'The file is no longer on the sender\'s computer.');
      if (st.size !== f.size || st.mtimeMs !== f.mtimeMs) return this._send(res, 409, 'The file changed after it was chosen. Share again.');
      let start = 0, end = f.size - 1, partial = false;
      const range = req.headers.range;
      if (range) {
        const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
        if (!m || (m[1] === '' && m[2] === '')) { res.setHeader('Content-Range', 'bytes */' + f.size); return this._send(res, 416, 'Bad range'); }
        if (m[1] === '') { const n = Number(m[2]); start = Math.max(0, f.size - n); }
        else { start = Number(m[1]); if (m[2] !== '') end = Math.min(Number(m[2]), f.size - 1); }
        if (start >= f.size || start > end) { res.setHeader('Content-Range', 'bytes */' + f.size); return this._send(res, 416, 'Range not satisfiable'); }
        partial = true;
      }
      if (f.size === 0) { res.writeHead(200, { 'Content-Length': 0, 'Content-Type': 'application/octet-stream' }); return res.end(); }
      const len = end - start + 1;
      const base = path.basename(f.name);
      const headers = {
        'Content-Type': 'application/octet-stream', 'Content-Length': len, 'Accept-Ranges': 'bytes',
        'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(base).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
      };
      if (partial) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + f.size;
      res.writeHead(partial ? 206 : 200, headers);
      if (req.method === 'HEAD') return res.end();
      const rs = fs.createReadStream(f.abs, { start, end, highWaterMark: 1 << 20 });
      let pos = start;
      rs.on('data', (c) => { pos += c.length; this._note(id, pos); });
      rs.on('error', () => res.destroy());
      res.on('close', () => { rs.destroy(); this._flushProgress(); this.emit('served', { id, to: pos, complete: pos >= f.size }); });
      rs.pipe(res);
    });
  }
}

module.exports = { ShareServer };
