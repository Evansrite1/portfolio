'use strict';
/* Small, dependency free helpers that keep File Share safe:
   file names from another computer are never trusted, tokens are random, comparisons are constant time. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/* One path segment from the other computer, made safe on Windows, Mac and Linux. */
function sanitizeSegment(name) {
  let s = String(name == null ? '' : name).normalize('NFC');
  s = s.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '_');
  s = s.replace(/[‪-‮⁦-⁩]/g, '');       /* bidi tricks that disguise extensions */
  s = s.replace(/[. ]+$/g, '').replace(/^\s+/, '');
  if (s === '' || s === '.' || s === '..') s = 'file';
  if (RESERVED.test(s)) s = '_' + s;
  if (Buffer.byteLength(s) > 200) {
    const ext = path.extname(s).slice(0, 20);
    let base = s.slice(0, s.length - ext.length);
    while (Buffer.byteLength(base + ext) > 200) base = base.slice(0, -1);
    s = base + ext;
  }
  return s;
}

/* A relative path such as "Holiday/day 1/a.jpg" becomes a safe path inside destRoot, or throws. */
function safeJoin(destRoot, rel) {
  const root = path.resolve(destRoot);
  const parts = String(rel).split(/[\\/]+/).filter((p) => p !== '');
  if (!parts.length) throw new Error('empty file name');
  if (parts.length > 40) throw new Error('path too deep');
  const full = path.resolve(root, ...parts.map(sanitizeSegment));
  const back = path.relative(root, full);
  if (!back || back.startsWith('..') || path.isAbsolute(back)) throw new Error('unsafe path');
  return full;
}

/* "photo.jpg" -> "photo (1).jpg" when the name is taken. */
function uniquePath(p) {
  if (!fs.existsSync(p) && !fs.existsSync(p + '.part')) return p;
  const dir = path.dirname(p), ext = path.extname(p), base = path.basename(p, ext);
  for (let i = 1; i < 10000; i++) {
    const c = path.join(dir, base + ' (' + i + ')' + ext);
    if (!fs.existsSync(c) && !fs.existsSync(c + '.part')) return c;
  }
  throw new Error('could not find a free file name');
}

const newToken = () => crypto.randomBytes(16).toString('hex');
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');
const newId = () => crypto.randomBytes(6).toString('hex');

/* Constant time string comparison (hashing first makes both sides the same length). */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function fmtSize(n) {
  if (!isFinite(n)) return '';
  const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)) + ' ' + u[i];
}

/* What a person may paste in the Receive screen: a full link, or "192.168.1.5:5123". */
function parseTarget(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 600) return null;
  let url;
  try { url = new URL(/^https?:\/\//i.test(t) ? t : 'http://' + t); } catch (e) { return null; }
  if (url.protocol !== 'http:') return null;
  const port = Number(url.port);
  if (!url.hostname || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const token = url.searchParams.get('t');
  return { host: url.hostname.replace(/^\[|\]$/g, ''), port, token: token && /^[0-9a-f]{32}$/.test(token) ? token : null };
}

module.exports = { sanitizeSegment, safeJoin, uniquePath, newToken, newCode, newId, safeEqual, fmtSize, parseTarget };
