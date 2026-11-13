'use strict';
/* The receiving side. Pairs with a code, lists the offer, downloads every file with resume, and checks
   each one against the sender's SHA-256 before it is given its real name. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { safeJoin, uniquePath } = require('./safe');

function request(host, port, method, p, { body, headers, signal, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, method, path: p, headers: Object.assign({ Connection: 'close' }, headers || {}), agent: false }, resolve);
    req.setTimeout(timeout, () => req.destroy(Object.assign(new Error('The other computer stopped answering'), { code: 'ETIMEDOUT' })));
    req.on('error', reject);
    if (signal) {
      if (signal.aborted) return req.destroy(Object.assign(new Error('Cancelled'), { code: 'ABORT' }));
      signal.addEventListener('abort', () => req.destroy(Object.assign(new Error('Cancelled'), { code: 'ABORT' })), { once: true });
    }
    if (body) req.write(body);
    req.end();
  });
}

async function readJson(res, max = 5 * 1024 * 1024) {
  const parts = []; let n = 0;
  for await (const c of res) { n += c.length; if (n > max) { res.destroy(); throw new Error('Reply too large'); } parts.push(c); }
  const text = Buffer.concat(parts).toString('utf8');
  try { return JSON.parse(text); } catch (e) { return { _text: text }; }
}

/* Trade the 6 digit code for the secret token. */
async function pair(host, port, code, opts = {}) {
  const res = await request(host, port, 'POST', '/api/pair', { body: JSON.stringify({ code: String(code) }), headers: { 'Content-Type': 'application/json' }, signal: opts.signal });
  const j = await readJson(res);
  if (res.statusCode === 200 && j.token) return j.token;
  if (res.statusCode === 403) { const e = new Error('That code is not right.' + (typeof j.left === 'number' ? ' ' + j.left + ' tries left.' : '')); e.code = 'WRONG_CODE'; throw e; }
  if (res.statusCode === 423) { const e = new Error(j.message || 'Too many wrong codes.'); e.code = 'LOCKED'; throw e; }
  if (res.statusCode === 410) { const e = new Error('That share has ended.'); e.code = 'ENDED'; throw e; }
  throw new Error('Could not connect (' + res.statusCode + ')');
}

async function getOffer(host, port, token, opts = {}) {
  const res = await request(host, port, 'GET', '/api/offer?t=' + encodeURIComponent(token), { signal: opts.signal });
  const j = await readJson(res);
  if (res.statusCode === 401) { const e = new Error('This link is not valid or has ended.'); e.code = 'BAD_TOKEN'; throw e; }
  if (res.statusCode === 410) { const e = new Error('That share has ended.'); e.code = 'ENDED'; throw e; }
  if (res.statusCode !== 200 || !Array.isArray(j.files)) throw new Error('Could not read the list of files (' + res.statusCode + ')');
  const files = j.files.filter((f) => f && /^[0-9a-f]{12}$/.test(f.id) && typeof f.name === 'string' && Number.isSafeInteger(f.size) && f.size >= 0).slice(0, 50000);
  return { name: String(j.name || '').replace(/[\u0000-\u001f]/g, '').slice(0, 64), platform: String(j.platform || ''), files, total: files.reduce((a, f) => a + f.size, 0) };
}

async function getHash(host, port, token, id, opts = {}) {
  const deadline = Date.now() + (opts.waitMs == null ? 20 * 60 * 1000 : opts.waitMs);
  for (;;) {
    if (opts.signal && opts.signal.aborted) throw Object.assign(new Error('Cancelled'), { code: 'ABORT' });
    const res = await request(host, port, 'GET', '/api/hash/' + id + '?t=' + encodeURIComponent(token), { signal: opts.signal });
    const j = await readJson(res);
    if (res.statusCode === 409) throw Object.assign(new Error('The file changed on the sender\'s computer while it was being shared.'), { code: 'CHANGED' });
    if (res.statusCode !== 200) throw new Error('Could not get the safety check (' + res.statusCode + ')');
    if (j.ready && /^[0-9a-f]{64}$/.test(j.sha256)) return j.sha256;
    if (Date.now() > deadline) throw new Error('The sender is still checking this file. Try again in a moment.');
    await new Promise((r) => setTimeout(r, 700));
  }
}

/* Download one file into `finalPath` (via finalPath + ".part"), resuming and retrying on a bad network. */
async function downloadOne({ host, port, token, file, finalPath, onBytes, onStatus, signal, retries = 6 }) {
  const part = finalPath + '.part';
  await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
  let attempt = 0, restarted = false;
  for (;;) {
    if (signal && signal.aborted) throw Object.assign(new Error('Cancelled'), { code: 'ABORT' });
    let offset = 0;
    try { offset = (await fs.promises.stat(part)).size; } catch (e) { offset = 0; }
    if (offset > file.size) { await fs.promises.rm(part, { force: true }); offset = 0; }
    const hash = crypto.createHash('sha256');
    if (offset > 0 && offset < file.size) {            /* hash what we already have */
      await new Promise((resolve, reject) => fs.createReadStream(part, { end: offset - 1 }).on('data', (c) => hash.update(c)).on('error', reject).on('end', resolve));
    } else if (offset === file.size && file.size > 0) {
      await new Promise((resolve, reject) => fs.createReadStream(part).on('data', (c) => hash.update(c)).on('error', reject).on('end', resolve));
    }
    onBytes && onBytes(offset);
    try {
      if (offset < file.size || file.size === 0) {
        const res = await request(host, port, 'GET', '/api/file/' + file.id + '?t=' + encodeURIComponent(token), { headers: offset ? { Range: 'bytes=' + offset + '-' } : {}, signal });
        if (res.statusCode === 409) { res.resume(); throw Object.assign(new Error('The file changed on the sender\'s computer while it was being shared.'), { code: 'CHANGED' }); }
        if (res.statusCode === 404 || res.statusCode === 410 || res.statusCode === 401) { res.resume(); throw Object.assign(new Error('The sender stopped sharing or removed this file.'), { code: 'GONE' }); }
        if (res.statusCode !== 200 && res.statusCode !== 206) { res.resume(); throw new Error('The sender answered with an error (' + res.statusCode + ')'); }
        if (res.statusCode === 200 && offset > 0) { await fs.promises.rm(part, { force: true }); res.destroy(); offset = 0; throw Object.assign(new Error('restart'), { code: 'RESTART' }); }
        if (res.statusCode === 206) {
          const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers['content-range'] || '');
          if (!m || Number(m[1]) !== offset || Number(m[3]) !== file.size) { res.destroy(); throw Object.assign(new Error('The sender answered with the wrong part of the file'), { code: 'BADRANGE' }); }
        }
        const out = fs.createWriteStream(part, { flags: offset ? 'a' : 'w' });
        let got = offset;
        await new Promise((resolve, reject) => {
          let done = false; const fin = (e) => { if (done) return; done = true; e ? reject(e) : resolve(); };
          res.on('data', (c) => {
            got += c.length;
            if (got > file.size) { res.destroy(); return fin(new Error('The sender sent more data than expected')); }
            hash.update(c);
            if (!out.write(c)) { res.pause(); out.once('drain', () => res.resume()); }
            onBytes && onBytes(got);
          });
          res.on('end', () => out.end(() => (got === file.size ? fin() : fin(Object.assign(new Error('The connection ended early'), { code: 'SHORT' })))));
          res.on('aborted', () => { out.end(() => fin(Object.assign(new Error('The connection was interrupted'), { code: 'SHORT' }))); });
          res.on('close', () => { if (!res.complete) out.end(() => fin(Object.assign(new Error('The connection was interrupted'), { code: 'SHORT' }))); });
          res.on('error', (e) => { out.end(() => fin(e)); });
          res.setTimeout(30000, () => res.destroy(Object.assign(new Error('The other computer stopped answering'), { code: 'ETIMEDOUT' })));
          out.on('error', (e) => { res.destroy(); fin(e); });
        });
      } else {
        onBytes && onBytes(file.size);
      }
      /* got every byte: now the safety check */
      onStatus && onStatus('checking');
      const expected = await getHash(host, port, token, file.id, { signal });
      const actual = hash.digest('hex');
      if (actual !== expected) {
        await fs.promises.rm(part, { force: true });
        if (!restarted) { restarted = true; attempt = 0; continue; }       /* one fresh start, then give up */
        throw Object.assign(new Error('The file arrived damaged twice. Try again.'), { code: 'HASH' });
      }
      await fs.promises.rename(part, finalPath);
      return { path: finalPath, size: file.size, sha256: actual };
    } catch (e) {
      if (e.code === 'RESTART') { continue; }
      if (e.code === 'ABORT' || e.code === 'CHANGED' || e.code === 'GONE' || e.code === 'HASH' || e.code === 'BADRANGE' || e.code === 'ENOSPC' || e.code === 'EACCES' || e.code === 'EPERM') throw e;
      if (++attempt > retries) throw e;
      onStatus && onStatus('retrying');
      await new Promise((r) => setTimeout(r, Math.min(4000, 400 * attempt)));
    }
  }
}

/* Download everything in the offer into destDir. Returns { done: [...], failed: [...] }. */
async function downloadAll({ host, port, token, offer, destDir, onFile, onBytes, signal }) {
  const done = [], failed = [];
  await fs.promises.mkdir(destDir, { recursive: true });
  for (const file of offer.files) {
    if (signal && signal.aborted) break;
    let finalPath;
    try { finalPath = uniquePath(safeJoin(destDir, file.name)); }
    catch (e) { failed.push({ id: file.id, name: file.name, error: 'Skipped: unsafe file name' }); onFile && onFile({ id: file.id, state: 'failed', error: 'Skipped: unsafe file name' }); continue; }
    onFile && onFile({ id: file.id, state: 'downloading', path: finalPath });
    try {
      const r = await downloadOne({
        host, port, token, file, finalPath, signal,
        onBytes: (n) => onBytes && onBytes(file.id, n),
        onStatus: (s) => onFile && onFile({ id: file.id, state: s })
      });
      done.push({ id: file.id, name: file.name, path: r.path, size: r.size });
      onFile && onFile({ id: file.id, state: 'done', path: r.path });
    } catch (e) {
      if (e.code === 'ABORT') { onFile && onFile({ id: file.id, state: 'cancelled' }); break; }
      failed.push({ id: file.id, name: file.name, error: e.message });
      onFile && onFile({ id: file.id, state: 'failed', error: e.message });
      if (e.code === 'GONE') break;
    }
  }
  return { done, failed };
}

module.exports = { pair, getOffer, getHash, downloadOne, downloadAll };
