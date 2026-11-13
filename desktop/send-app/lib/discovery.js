'use strict';
/* Finding the other computer on the same network.
   A sharing computer announces itself (name, number of files, port, NOT the secret) about every 1.5 seconds.
   A receiving computer only listens. Nothing is announced while nothing is being shared. */
const dgram = require('dgram');
const os = require('os');
const { EventEmitter } = require('events');
const { lanAddresses } = require('./net');

const PORT = 41873;
const APP = 'file-share-1';
const EXPIRE_MS = 6000;

class Discovery extends EventEmitter {
  constructor(opts = {}) {
    super();
    this.id = opts.id;
    this.port = opts.port || PORT;
    this.targets = opts.targets || null;       /* tests pass explicit targets; normally every broadcast address */
    this.peers = new Map();
    this.info = null;
    this.sock = null;
    this._timers = [];
  }

  start() {
    return new Promise((resolve, reject) => {
      const s = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.sock = s;
      s.on('error', (e) => { this.emit('error', e); });
      s.on('message', (msg, rinfo) => this._onMessage(msg, rinfo));
      s.bind(this.port, '0.0.0.0', () => {
        try { s.setBroadcast(true); } catch (e) {}
        this._timers.push(setInterval(() => this._prune(), 1500));
        this._timers.push(setInterval(() => this._announce(), 1500));
        resolve();
      });
      s.once('error', reject);
    });
  }

  /* info = { name, platform, port, files, bytes } while sharing, or null. */
  setAnnounce(info) { this.info = info; if (info) this._announce(); }

  _announce() {
    if (!this.info || !this.sock) return;
    const msg = Buffer.from(JSON.stringify({
      app: APP, id: this.id, name: this.info.name, platform: this.info.platform,
      port: this.info.port, files: this.info.files, bytes: this.info.bytes
    }));
    const targets = this.targets || [...new Set(['255.255.255.255', ...lanAddresses().map((a) => a.broadcast)])].map((h) => ({ host: h, port: this.port }));
    for (const t of targets) { try { this.sock.send(msg, 0, msg.length, t.port, t.host, () => {}); } catch (e) {} }
  }

  _onMessage(buf, rinfo) {
    if (buf.length > 1024) return;
    let d; try { d = JSON.parse(buf.toString('utf8')); } catch (e) { return; }
    if (!d || d.app !== APP || typeof d.id !== 'string' || d.id === this.id) return;
    const port = Number(d.port), files = Number(d.files), bytes = Number(d.bytes);
    if (!Number.isInteger(port) || port < 1 || port > 65535) return;
    const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, n);
    const p = {
      id: clean(d.id, 40), name: clean(d.name, 64) || 'Another computer', platform: clean(d.platform, 12),
      host: rinfo.address, port, files: Number.isFinite(files) ? Math.max(0, Math.floor(files)) : 0,
      bytes: Number.isFinite(bytes) ? Math.max(0, Math.floor(bytes)) : 0, seen: Date.now()
    };
    const before = this.peers.get(p.id);
    this.peers.set(p.id, p);
    if (!before || before.port !== p.port || before.host !== p.host || before.files !== p.files) this._changed();
  }

  _prune() {
    const now = Date.now(); let changed = false;
    for (const [id, p] of this.peers) if (now - p.seen > EXPIRE_MS) { this.peers.delete(id); changed = true; }
    if (changed) this._changed();
  }
  _changed() { this.emit('peers', this.list()); }
  list() { return [...this.peers.values()].map(({ seen, ...rest }) => rest); }

  stop() {
    for (const t of this._timers) clearInterval(t);
    this._timers = [];
    if (this.sock) { try { this.sock.close(); } catch (e) {} this.sock = null; }
  }
}

function deviceName() {
  return (os.hostname() || 'This computer').replace(/\.local$/i, '').slice(0, 64);
}

module.exports = { Discovery, deviceName, PORT };
