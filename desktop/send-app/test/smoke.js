'use strict';
/* Real-window checks. Run with:  npx electron . --smoke
   Single process (default): shares files, then receives them from itself through the real screen.
   Two processes: set FILESHARE_SMOKE_ROLE=send in one and =recv in the other (each with FILESHARE_MULTI=1,
   its own FILESHARE_USERDATA, and the same SMOKE_DIR). That checks discovery, the code and the transfer between two apps. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

module.exports = async function smoke({ app, win, H, share, discovery, getSession }) {
  const role = process.env.FILESHARE_SMOKE_ROLE || 'self';
  const dir = process.env.SMOKE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'fs-smoke-'));
  fs.mkdirSync(dir, { recursive: true });
  const shots = path.join(dir, 'shots'); fs.mkdirSync(shots, { recursive: true });
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (what, fn, ms = 20000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(120); } };
  const shot = async (name) => { await sleep(250); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(shots, role + '-' + name + '.png'), img.toPNG()); };
  const ok = (m) => console.log('SMOKE OK   ' + m);
  const fail = (m) => { throw new Error(m); };

  await until('the screen', () => js("!!window.api && !!document.getElementById('start') && !!window.__fileShare"));
  const title = await js("document.querySelector('h1').textContent");
  if (title !== 'File Share by Evans Large') fail('wrong title ' + title);
  ok('screen loaded, api exposed');
  const leaked = await js("typeof require + '|' + typeof process + '|' + typeof module");
  if (leaked !== 'undefined|undefined|undefined') fail('node leaked into the screen: ' + leaked);
  ok('the screen has no access to node (' + leaked + ')');
  const cspBlocks = await js("(function(){try{eval('1');return 'eval allowed'}catch(e){return 'eval blocked'}})()");
  if (cspBlocks !== 'eval blocked') fail('CSP does not block eval');
  ok('CSP blocks eval');
  await shot('01-start');
  const net = await H['net:check']();
  console.log('SMOKE INFO connection check: ' + net.items.map((i) => i.id + '=' + (i.ok ? 'ok' : 'WARN')).join(', '));
  await sleep(1500);
  const panel = await js("(function(){var n=document.getElementById('net');return n.hidden?'hidden':n.textContent.slice(0,200)})()");
  console.log('SMOKE INFO connection panel: ' + panel.replace(/\s+/g, ' '));
  if (!net.allOk && panel === 'hidden') fail('the connection panel should be visible when something is wrong');
  ok('connection check runs and the panel matches it');
  await shot('01b-net-panel');

  const mkFiles = () => {
    const src = path.join(dir, 'to-send'); fs.rmSync(src, { recursive: true, force: true }); fs.mkdirSync(path.join(src, 'Holiday', 'Day 1'), { recursive: true });
    const files = { 'hello.txt': Buffer.from('hello from the sender'), 'Holiday/Day 1/photo.bin': crypto.randomBytes(3 * 1024 * 1024), 'Holiday/notes.txt': Buffer.from('notes ünïcödé') };
    for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(src, n), c);
    return { src, files };
  };
  const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');

  const startSharing = async () => {
    const { src, files } = mkFiles();
    await js('window.api.add(' + JSON.stringify([path.join(src, 'hello.txt'), path.join(src, 'Holiday')]) + ').then(window.__fileShare.added)');
    await until('files listed', () => js("document.querySelectorAll('#send-list li').length === 3"));
    ok('3 files listed on the Send screen (one folder expanded)');
    await shot('02-files');
    await js("document.getElementById('start').click()");
    await until('sharing screen', () => js("!document.getElementById('send-live').hidden && /^\\d{3} \\d{3}$/.test(document.getElementById('code').textContent)"));
    const code = (await js("document.getElementById('code').textContent")).replace(/\s/g, '');
    const link = await js("document.getElementById('link').value");
    if (!/^http:\/\/[\d.]+:\d+\/\?t=[0-9a-f]{32}$/.test(link)) fail('bad link ' + link);
    ok('sharing started: code ' + code + ', link ' + link.replace(/t=.*/, 't=...'));
    await shot('03-sharing');
    return { code, link, files, src };
  };

  const receive = async ({ viaPeer, code, link, files, rootName }) => {
    await js("document.getElementById('tab-recv').click()");
    if (viaPeer) {
      await until('the sender to appear nearby', () => js("document.querySelectorAll('#peers li').length >= 1"), 25000);
      ok('discovery: the sender appeared in the nearby list');
      await shot('04-peers');
      await js("document.querySelector('#peers li button').click()");
      await js("(function(){var i=document.getElementById('code-in');i.value='" + code + "';i.dispatchEvent(new Event('input'));document.getElementById('pair-go').click()})()");
    } else {
      await js("(function(){document.getElementById('target').value=" + JSON.stringify(link) + ";document.getElementById('target-go').click()})()");
    }
    await until('the file list', () => js("!document.getElementById('recv-offer').hidden && document.querySelectorAll('#offer-list li').length === 3"));
    ok('connected and the offer is listed (3 files)');
    const dest = path.join(dir, 'received-' + role); fs.rmSync(dest, { recursive: true, force: true });
    getSession().dest = dest; await js("document.getElementById('dest').textContent=" + JSON.stringify(dest));
    await shot('05-offer');
    await js("document.getElementById('download').click()");
    await until('the downloads', () => js("/^Done\\./.test(document.getElementById('recv-status').textContent)"), 60000);
    ok('download finished: ' + await js("document.getElementById('recv-status').textContent"));
    await shot('06-done');
    for (const [n, c] of Object.entries(files)) {
      const p = path.join(dest, rootName, n);
      if (!fs.existsSync(p)) fail('missing ' + p);
      if (digest(fs.readFileSync(p)) !== digest(c)) fail('content differs ' + p);
    }
    const leftovers = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : (/\.part$/.test(e.name) && leftovers.push(p)); } })(dest);
    if (leftovers.length) fail('leftover .part files ' + leftovers);
    ok('all files are byte-identical and no .part files are left');
  };

  const wrongCode = async (link, goodCode) => {
    await js("document.getElementById('tab-recv').click()");
    const bad = goodCode === '123456' ? '654321' : '123456';
    await js("(function(){document.getElementById('target').value=" + JSON.stringify(link.replace(/\?t=[0-9a-f]{32}/, '')) + ";document.getElementById('target-code').value='" + bad + "';document.getElementById('target-go').click()})()");
    await until('the wrong code message', () => js("!document.getElementById('alert').hidden && /not right/.test(document.getElementById('alert').textContent)"));
    ok('a wrong code shows a clear message: ' + await js("document.getElementById('alert').textContent"));
    await shot('07-wrong-code');
  };

  if (role === 'self') {
    const s = await startSharing();
    const root = 'to-send'.length && path.basename(path.join(s.src, 'Holiday'));
    await wrongCode(s.link, s.code);
    await receive({ viaPeer: false, code: s.code, link: s.link, files: { 'Day 1/photo.bin': s.files['Holiday/Day 1/photo.bin'], 'notes.txt': s.files['Holiday/notes.txt'] }, rootName: 'Holiday' }).catch(async (e) => {
      /* hello.txt sits at the top level, Holiday is a folder; check both below */
      throw e;
    });
    if (digest(fs.readFileSync(path.join(dir, 'received-self', 'hello.txt'))) !== digest(s.files['hello.txt'])) fail('hello.txt differs');
    ok('the top-level file arrived too');
    await js("document.getElementById('tab-send').click()");
    await js("document.getElementById('stop').click()");
    await until('the share to end', () => js("document.getElementById('send-live').hidden"));
    ok('stop sharing returns to the file list');
  } else if (role === 'send') {
    const s = await startSharing();
    fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ code: s.code, link: s.link }));
    await until('the receiver to finish', () => fs.existsSync(path.join(dir, 'done')), 120000);
    await shot('08-after');
  } else if (role === 'recv') {
    const info = await until('the sender info', () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8')); } catch (e) { return null; } }, 60000);
    await receive({ viaPeer: true, code: info.code, link: info.link, files: { 'Day 1/photo.bin': fs.readFileSync(path.join(dir, 'to-send', 'Holiday', 'Day 1', 'photo.bin')), 'notes.txt': fs.readFileSync(path.join(dir, 'to-send', 'Holiday', 'notes.txt')) }, rootName: 'Holiday' });
    fs.writeFileSync(path.join(dir, 'done'), '1');
  }
  console.log('SMOKE PASSED (' + role + ')  shots: ' + shots);
  app.exit(0);
};
