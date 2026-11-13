'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { sanitizeSegment, safeJoin, uniquePath, parseTarget, safeEqual } = require('../lib/safe');
const { ShareServer } = require('../lib/share-server');
const { Discovery } = require('../lib/discovery');
const rx = require('../lib/receiver');

const tmp = (n) => fs.mkdtempSync(path.join(os.tmpdir(), n || 'fs-'));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function get(port, p, headers) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: p, headers, agent: false }, (res) => {
      const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(parts) }));
    }).on('error', reject);
  });
}

/* ------------------------------------------------------------------ names and paths */
test('sanitizeSegment makes hostile names harmless', () => {
  assert.strictEqual(sanitizeSegment('..'), 'file');
  assert.strictEqual(sanitizeSegment('.'), 'file');
  assert.strictEqual(sanitizeSegment(''), 'file');
  assert.strictEqual(sanitizeSegment('a/b\\c'), 'a_b_c');
  assert.strictEqual(sanitizeSegment('CON'), '_CON');
  assert.strictEqual(sanitizeSegment('nul.txt'), '_nul.txt');
  assert.strictEqual(sanitizeSegment('report. '), 'report');
  assert.strictEqual(sanitizeSegment('a<b>:"|?*.txt'), 'a_b______.txt'.replace('______', '______'));
  assert.ok(!/[\u202e]/.test(sanitizeSegment('photo\u202egpj.exe')));
  assert.ok(Buffer.byteLength(sanitizeSegment('x'.repeat(500) + '.mp4')) <= 200);
  assert.ok(sanitizeSegment('x'.repeat(500) + '.mp4').endsWith('.mp4'));
  assert.strictEqual(sanitizeSegment('Fotos de verão 2026.jpg'), 'Fotos de verão 2026.jpg');
});

test('safeJoin never leaves the destination folder', () => {
  const root = tmp();
  for (const bad of ['../x', '..\\..\\x', '/etc/passwd', 'C:\\Windows\\win.ini', 'a/../../b', '....//x']) {
    const p = safeJoin(root, bad);
    assert.ok(path.relative(root, p) && !path.relative(root, p).startsWith('..'), bad + ' -> ' + p);
  }
  assert.strictEqual(safeJoin(root, 'Holiday/day 1/a.jpg'), path.join(root, 'Holiday', 'day 1', 'a.jpg'));
  assert.throws(() => safeJoin(root, ''));
  assert.throws(() => safeJoin(root, '/'));
});

test('uniquePath adds a number instead of overwriting', () => {
  const d = tmp(); const p = path.join(d, 'a.txt');
  assert.strictEqual(uniquePath(p), p);
  fs.writeFileSync(p, 'x');
  assert.strictEqual(uniquePath(p), path.join(d, 'a (1).txt'));
  fs.writeFileSync(path.join(d, 'a (1).txt.part'), 'x');
  assert.strictEqual(uniquePath(p), path.join(d, 'a (2).txt'));
});

test('parseTarget understands links and addresses and refuses the rest', () => {
  const tok = 'a'.repeat(32);
  assert.deepStrictEqual(parseTarget('http://192.168.1.5:5123/?t=' + tok), { host: '192.168.1.5', port: 5123, token: tok });
  assert.deepStrictEqual(parseTarget('192.168.1.5:5123'), { host: '192.168.1.5', port: 5123, token: null });
  assert.strictEqual(parseTarget('https://192.168.1.5:5123'), null);
  assert.strictEqual(parseTarget('file:///etc/passwd'), null);
  assert.strictEqual(parseTarget('192.168.1.5'), null);
  assert.strictEqual(parseTarget('javascript:alert(1)'), null);
  assert.strictEqual(parseTarget(''), null);
  assert.strictEqual(parseTarget('x'.repeat(700)), null);
  assert.ok(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd'));
});

/* ------------------------------------------------------------------ sender server */
async function makeShare(files) {
  const dir = tmp('src-');
  const paths = [];
  for (const [n, c] of Object.entries(files)) { const p = path.join(dir, n); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); paths.push(p); }
  const s = new ShareServer({ deviceName: 'Test PC' });
  await s.addPaths([dir]);
  const info = await s.start();
  return { s, info, dir };
}

test('the server serves only chosen files, behind the token', async () => {
  const { s, info, dir } = await makeShare({ 'a.txt': 'hello', 'sub/b.txt': 'world' });
  try {
    const secret = path.join(os.tmpdir(), 'secret-' + Date.now() + '.txt'); fs.writeFileSync(secret, 'TOP SECRET');
    const t = info.token, port = info.port;
    assert.strictEqual((await get(port, '/')).status, 401);
    assert.strictEqual((await get(port, '/api/offer')).status, 401);
    assert.strictEqual((await get(port, '/api/offer?t=' + 'b'.repeat(32))).status, 401);
    assert.strictEqual((await get(port, '/api/offer?t=../../x')).status, 401);
    const offer = JSON.parse((await get(port, '/api/offer?t=' + t)).body);
    assert.strictEqual(offer.files.length, 2);
    assert.ok(offer.files.every((f) => /^[0-9a-f]{12}$/.test(f.id) && !('abs' in f) && !('path' in f)));
    assert.deepStrictEqual(offer.files.map((f) => f.name).sort(), [path.basename(dir) + '/a.txt', path.basename(dir) + '/sub/b.txt']);
    /* attempts to read other files */
    for (const p of ['/api/file/..%2f..%2fetc%2fpasswd', '/api/file/' + encodeURIComponent(secret), '/api/file/%2e%2e', '/api/file/000000000000', '/download?path=' + encodeURIComponent(secret), '/list', '/info', '/thumb?path=' + encodeURIComponent(secret)]) {
      const r = await get(port, p + (p.includes('?') ? '&' : '?') + 't=' + t);
      assert.ok(r.status === 404 || r.status === 400, p + ' -> ' + r.status);
      assert.ok(!r.body.toString().includes('TOP SECRET'));
    }
    const f = offer.files[0];
    const ok = await get(port, '/api/file/' + f.id + '?t=' + t);
    assert.strictEqual(ok.status, 200); assert.strictEqual(ok.body.toString(), 'hello');
    assert.ok(/attachment/.test(ok.headers['content-disposition']));
    assert.strictEqual((await rx_post(port, '/api/offer?t=' + t)).status, 405);
  } finally { s.stop(); }
});

function rx_post(port, p) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: p, method: 'POST', agent: false }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode })); });
    r.on('error', reject); r.end('x');
  });
}

test('pairing: the right code gives the token, five wrong codes lock it', async () => {
  const { s, info } = await makeShare({ 'a.txt': 'x' });
  try {
    await assert.rejects(rx.pair('127.0.0.1', info.port, '000000' === info.code ? '000001' : '000000'), (e) => e.code === 'WRONG_CODE');
    await assert.rejects(rx.pair('127.0.0.1', info.port, 'abcdef'), (e) => e.code === 'WRONG_CODE');
    const good = await rx.pair('127.0.0.1', info.port, info.code);
    assert.strictEqual(good, info.token);
    for (let i = 0; i < 3; i++) await assert.rejects(rx.pair('127.0.0.1', info.port, '111111' === info.code ? '222222' : '111111'));
    await assert.rejects(rx.pair('127.0.0.1', info.port, info.code), (e) => e.code === 'LOCKED');
  } finally { s.stop(); }
});

test('the sender serves no web page: the other computer must use the app', async () => {
  const { s, info } = await makeShare({ 'a.txt': 'x' });
  try {
    assert.strictEqual((await get(info.port, '/')).status, 401);
    assert.strictEqual((await get(info.port, '/?t=' + info.token)).status, 404);
    assert.strictEqual((await get(info.port, '/index.html?t=' + info.token)).status, 404);
  } finally { s.stop(); }
});

test('the sender uses the fixed port when free and another one when it is taken', async () => {
  const net = require('net');
  const probe = net.createServer(); await new Promise((r) => probe.listen(0, '0.0.0.0', r)); const taken = probe.address().port;
  const dir = tmp('port-'); fs.writeFileSync(path.join(dir, 'a.txt'), 'x');
  const s = new ShareServer(); await s.addPaths([path.join(dir, 'a.txt')]);
  try { const info = await s.start({ port: taken }); assert.notStrictEqual(info.port, taken); assert.ok(info.port > 0); } finally { s.stop(); probe.close(); }
  const probe2 = net.createServer(); await new Promise((r) => probe2.listen(0, '0.0.0.0', r)); const free = probe2.address().port; await new Promise((r) => probe2.close(r));
  const s2 = new ShareServer(); await s2.addPaths([path.join(dir, 'a.txt')]);
  try { assert.strictEqual((await s2.start({ port: free })).port, free); } finally { s2.stop(); }
});

test('ranges work, bad ranges are refused, a stopped share answers 410', async () => {
  const { s, info } = await makeShare({ 'a.bin': '0123456789' });
  const offer = JSON.parse((await get(info.port, '/api/offer?t=' + info.token)).body);
  const id = offer.files[0].id, base = '/api/file/' + id + '?t=' + info.token;
  let r = await get(info.port, base, { Range: 'bytes=3-6' });
  assert.strictEqual(r.status, 206); assert.strictEqual(r.body.toString(), '3456'); assert.strictEqual(r.headers['content-range'], 'bytes 3-6/10');
  r = await get(info.port, base, { Range: 'bytes=7-' }); assert.strictEqual(r.body.toString(), '789');
  r = await get(info.port, base, { Range: 'bytes=-2' }); assert.strictEqual(r.body.toString(), '89');
  r = await get(info.port, base, { Range: 'bytes=50-' }); assert.strictEqual(r.status, 416);
  r = await get(info.port, base, { Range: 'bytes=abc' }); assert.strictEqual(r.status, 416);
  s.stop();
  await assert.rejects(get(info.port, base));      /* the server is closed */
});

test('a file changed after choosing is refused', async () => {
  const { s, info, dir } = await makeShare({ 'a.txt': 'before' });
  try {
    const offer = JSON.parse((await get(info.port, '/api/offer?t=' + info.token)).body);
    const abs = path.join(dir, 'a.txt'); fs.writeFileSync(abs, 'after!!'); fs.utimesSync(abs, new Date(), new Date(Date.now() + 5000));
    const r = await get(info.port, '/api/file/' + offer.files[0].id + '?t=' + info.token);
    assert.strictEqual(r.status, 409);
  } finally { s.stop(); }
});

test('symbolic links and non-absolute paths are not shared', async () => {
  const dir = tmp('lnk-'); fs.writeFileSync(path.join(dir, 'real.txt'), 'x');
  let linked = true; try { fs.symlinkSync(path.join(dir, 'real.txt'), path.join(dir, 'link.txt')); } catch (e) { linked = false; }
  const s = new ShareServer(); const r = await s.addPaths([dir, 'relative/path', '../x']);
  assert.strictEqual(r.files.length, 1);
  if (linked) assert.ok(r.skipped >= 1);
  assert.ok(r.skipped >= 2);
});

/* ------------------------------------------------------------------ full transfer */
test('a whole share downloads, with folders, empty files and a matching checksum', async () => {
  const { s, info, dir } = await makeShare({ 'a.txt': 'hello', 'sub/b.txt': 'world', 'sub/deep/empty.txt': '', 'Ünï cödé.txt': 'ü' });
  const out = tmp('dst-');
  try {
    const token = await rx.pair('127.0.0.1', info.port, info.code);
    const offer = await rx.getOffer('127.0.0.1', info.port, token);
    assert.strictEqual(offer.files.length, 4);
    const res = await rx.downloadAll({ host: '127.0.0.1', port: info.port, token, offer, destDir: out });
    assert.strictEqual(res.failed.length, 0, JSON.stringify(res.failed));
    assert.strictEqual(res.done.length, 4);
    const root = path.join(out, path.basename(dir));
    assert.strictEqual(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'hello');
    assert.strictEqual(fs.readFileSync(path.join(root, 'sub', 'b.txt'), 'utf8'), 'world');
    assert.strictEqual(fs.statSync(path.join(root, 'sub', 'deep', 'empty.txt')).size, 0);
    assert.strictEqual(fs.readFileSync(path.join(root, 'Ünï cödé.txt'), 'utf8'), 'ü');
    assert.deepStrictEqual(fs.readdirSync(root).filter((n) => n.endsWith('.part')), []);
    /* second time: nothing is overwritten */
    const again = await rx.downloadAll({ host: '127.0.0.1', port: info.port, token, offer, destDir: out });
    assert.strictEqual(again.done.length, 4);
    assert.ok(fs.existsSync(path.join(out, path.basename(dir) + ' (1)')) === false);   /* folder differs by file, files get (1) */
    assert.ok(fs.existsSync(path.join(root, 'a (1).txt')));
  } finally { s.stop(); }
});

test('a hostile sender cannot write outside the destination', async () => {
  const out = tmp('dst-'); const evil = tmp('evil-');
  const bodies = new Map([['aaaaaaaaaaaa', Buffer.from('pwned')], ['bbbbbbbbbbbb', Buffer.from('pwned2')]]);
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let m;
    if (u.pathname === '/api/offer') { res.end(JSON.stringify({ name: 'evil', files: [{ id: 'aaaaaaaaaaaa', name: '../../../escaped.txt', size: 5 }, { id: 'bbbbbbbbbbbb', name: 'C:\\Windows\\evil.txt', size: 6 }, { id: 'cccccccccccc', name: '', size: 1 }] })); return; }
    if ((m = /^\/api\/file\/(\w+)$/.exec(u.pathname))) { const b = bodies.get(m[1]) || Buffer.from('x'); res.writeHead(200, { 'Content-Length': b.length }); res.end(b); return; }
    if ((m = /^\/api\/hash\/(\w+)$/.exec(u.pathname))) { const b = bodies.get(m[1]) || Buffer.from('x'); res.end(JSON.stringify({ ready: true, sha256: crypto.createHash('sha256').update(b).digest('hex') })); return; }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const port = srv.address().port;
    const offer = await rx.getOffer('127.0.0.1', port, 'a'.repeat(32));
    const res = await rx.downloadAll({ host: '127.0.0.1', port, token: 'a'.repeat(32), offer, destDir: out });
    const all = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : all.push(p); } })(out);
    for (const p of all) assert.ok(path.resolve(p).startsWith(path.resolve(out) + path.sep), p);
    assert.ok(!fs.existsSync(path.join(out, '..', 'escaped.txt')));
    assert.ok(!fs.existsSync(path.join(out, '..', '..', 'escaped.txt')));
    assert.ok(res.done.length >= 2);
  } finally { srv.close(); }
});

test('a damaged transfer is caught by the checksum', async () => {
  const out = tmp('dst-'); const good = Buffer.from('the real content'); const bad = Buffer.from('the REAL content');
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/api/offer') return res.end(JSON.stringify({ name: 'x', files: [{ id: 'aaaaaaaaaaaa', name: 'f.txt', size: good.length }] }));
    if (u.pathname.startsWith('/api/file/')) { res.writeHead(200, { 'Content-Length': bad.length }); return res.end(bad); }
    if (u.pathname.startsWith('/api/hash/')) return res.end(JSON.stringify({ ready: true, sha256: crypto.createHash('sha256').update(good).digest('hex') }));
    res.writeHead(404); res.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const port = srv.address().port; const t = 'a'.repeat(32);
    const offer = await rx.getOffer('127.0.0.1', port, t);
    const res = await rx.downloadAll({ host: '127.0.0.1', port, token: t, offer, destDir: out });
    assert.strictEqual(res.done.length, 0); assert.strictEqual(res.failed.length, 1);
    assert.ok(!fs.existsSync(path.join(out, 'f.txt'))); assert.ok(!fs.existsSync(path.join(out, 'f.txt.part')));
  } finally { srv.close(); }
});

test('a dropped connection resumes from where it stopped', async () => {
  const dir = tmp('big-'); const data = crypto.randomBytes(6 * 1024 * 1024); fs.writeFileSync(path.join(dir, 'big.bin'), data);
  const s = new ShareServer(); await s.addPaths([path.join(dir, 'big.bin')]); const info = await s.start();
  /* a proxy that cuts the first download after about 2 MB, then lets everything through */
  let cutOnce = true;
  const proxy = http.createServer((req, res) => {
    const up = http.request({ host: '127.0.0.1', port: info.port, path: req.url, method: req.method, headers: req.headers, agent: false }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      if (cutOnce && req.url.startsWith('/api/file/')) {
        cutOnce = false; let n = 0;
        r.on('data', (c) => { n += c.length; res.write(c); if (n > 2 * 1024 * 1024) { res.socket.destroy(); up.destroy(); } });
      } else r.pipe(res);
    });
    up.on('error', () => {}); req.pipe(up);
  });
  await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
  const out = tmp('dst-');
  try {
    const pport = proxy.address().port;
    const offer = await rx.getOffer('127.0.0.1', pport, info.token);
    const res = await rx.downloadAll({ host: '127.0.0.1', port: pport, token: info.token, offer, destDir: out });
    assert.strictEqual(res.failed.length, 0, JSON.stringify(res.failed));
    assert.strictEqual(sha(path.join(out, 'big.bin')), crypto.createHash('sha256').update(data).digest('hex'));
    assert.strictEqual(cutOnce, false);
  } finally { proxy.close(); s.stop(); }
});

test('cancelling stops the download and keeps no final file', async () => {
  const dir = tmp('big-'); fs.writeFileSync(path.join(dir, 'big.bin'), crypto.randomBytes(20 * 1024 * 1024));
  const s = new ShareServer(); await s.addPaths([path.join(dir, 'big.bin')]); const info = await s.start();
  const out = tmp('dst-'); const ac = new AbortController();
  try {
    const offer = await rx.getOffer('127.0.0.1', info.port, info.token);
    const p = rx.downloadAll({ host: '127.0.0.1', port: info.port, token: info.token, offer, destDir: out, signal: ac.signal, onBytes: (id, n) => { if (n > 1024 * 1024) ac.abort(); } });
    const res = await p;
    assert.strictEqual(res.done.length, 0);
    assert.ok(!fs.existsSync(path.join(out, 'big.bin')));
  } finally { s.stop(); }
});

test('speed: 300 MB over the loopback, with checksum', async () => {
  const dir = tmp('speed-'); const f = path.join(dir, 'speed.bin');
  const chunk = crypto.randomBytes(1024 * 1024); const fd = fs.openSync(f, 'w'); for (let i = 0; i < 300; i++) fs.writeSync(fd, chunk); fs.closeSync(fd);
  const s = new ShareServer(); await s.addPaths([f]); const info = await s.start();
  const out = tmp('dst-');
  try {
    const t0 = Date.now();
    const offer = await rx.getOffer('127.0.0.1', info.port, info.token);
    const res = await rx.downloadAll({ host: '127.0.0.1', port: info.port, token: info.token, offer, destDir: out });
    const secs = (Date.now() - t0) / 1000;
    assert.strictEqual(res.failed.length, 0, JSON.stringify(res.failed));
    assert.strictEqual(fs.statSync(path.join(out, 'speed.bin')).size, 300 * 1024 * 1024);
    console.log('# 300 MB in ' + secs.toFixed(1) + ' s = ' + (300 / secs).toFixed(0) + ' MB/s (checksum included)');
  } finally { s.stop(); }
});

/* ------------------------------------------------------------------ finding each other */
test('discovery: a receiver hears a sharing computer, ignores itself, and forgets it when it stops', async () => {
  const A = new Discovery({ id: 'aaa', port: 41911, targets: [{ host: '127.0.0.1', port: 41912 }] });
  const B = new Discovery({ id: 'bbb', port: 41912, targets: [] });
  await A.start(); await B.start();
  try {
    const seen = new Promise((resolve) => B.once('peers', resolve));
    A.setAnnounce({ name: 'Laptop A\u0007', platform: 'win32', port: 5555, files: 3, bytes: 1234 });
    const list = await Promise.race([seen, new Promise((_, rej) => setTimeout(() => rej(new Error('not discovered')), 4000))]);
    assert.strictEqual(list.length, 1);
    assert.strictEqual(list[0].name, 'Laptop A'); assert.strictEqual(list[0].port, 5555); assert.strictEqual(list[0].host, '127.0.0.1'); assert.strictEqual(list[0].files, 3);
    assert.strictEqual(A.list().length, 0);                       /* A never lists itself */
    /* junk is ignored */
    const junk = require('dgram').createSocket('udp4'); junk.send(Buffer.from('{"app":"file-share-1","id":"x","port":99999}'), 41912, '127.0.0.1'); junk.send(Buffer.from('not json'), 41912, '127.0.0.1');
    await new Promise((r) => setTimeout(r, 300)); junk.close();
    assert.strictEqual(B.list().length, 1);
    A.setAnnounce(null);
    await new Promise((r) => setTimeout(r, 8500));
    assert.strictEqual(B.list().length, 0);
  } finally { A.stop(); B.stop(); }
});

/* ------------------------------------------------------------------ choosing the address to give out */
test('network ranking puts real Wi-Fi and cable first and virtual adapters last', () => {
  const { rank } = require('../lib/net');
  const wifi = rank('192.168.1.222', 'Wi-Fi'), cable = rank('192.168.0.8', 'Ethernet'), office = rank('10.1.2.3', 'Ethernet');
  const vbox = rank('192.168.56.1', 'Ethernet 2'), docker = rank('172.17.0.1', 'eth1'), hv = rank('172.28.80.1', 'vEthernet (WSL)');
  const ts = rank('100.121.126.54', 'Tailscale'), mac = rank('192.168.1.7', 'en0'), lnx = rank('192.168.1.9', 'wlp3s0');
  assert.ok(wifi < vbox && cable < vbox && office < vbox && wifi < ts);
  assert.ok(vbox > ts && docker > ts && hv > ts);
  assert.ok(mac <= cable && lnx <= cable);
  const nets = require('../lib/net').lanAddresses();
  assert.ok(Array.isArray(nets));
});
