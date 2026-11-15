'use strict';
/* Real-window checks. Run with:  npx electron . --smoke
   Single process (default): the sender is driven through the app's own handlers, the receiver through the real screen.
   Two processes: set FILESHARE_SMOKE_ROLE=send in one and =recv in the other (each with FILESHARE_MULTI=1,
   its own FILESHARE_USERDATA, and the same SMOKE_DIR). That drives BOTH screens and checks discovery, the code and the transfer. */
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
  const shot = async (name) => { await sleep(1200); const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(shots, role + '-' + name + '.png'), img.toPNG()); };
  const ok = (m) => console.log('SMOKE OK   ' + m);
  const fail = (m) => { throw new Error(m); };
  const visible = (id) => js("!document.getElementById('" + id + "').hidden");
  const click = (id) => js("document.getElementById('" + id + "').click()");
  const text = (id) => js("document.getElementById('" + id + "').textContent");

  await until('the screen', () => js("!!window.api && !!document.getElementById('go-send') && !!window.__fileShare"));
  const title = await js("document.querySelector('.tb-name').textContent");
  if (!/^File Share\s*by Evans Large$/.test(title.trim())) fail('wrong title bar text: ' + title);
  ok('screen loaded; title bar reads "' + title.trim() + '"');
  const leaked = await js("typeof require + '|' + typeof process + '|' + typeof module");
  if (leaked !== 'undefined|undefined|undefined') fail('node leaked into the screen: ' + leaked);
  ok('the screen has no access to node');
  if ((await js("(function(){try{eval('1');return 'allowed'}catch(e){return 'blocked'}})()")) !== 'blocked') fail('CSP does not block eval');
  ok('CSP blocks eval');
  const plat = await js('document.documentElement.dataset.platform');
  if (plat !== process.platform) fail('platform attribute ' + plat);
  const bounds = win.getContentBounds(), full = win.getBounds();
  ok('custom title bar: platform=' + plat + ', window ' + full.width + 'x' + full.height + ', content ' + bounds.width + 'x' + bounds.height);
  if (!(await visible('home')) || (await visible('flow'))) fail('the home screen should show first');
  if (!/Send files/.test(await text('go-send')) || !/Receive files/.test(await text('go-recv'))) fail('home cards missing');
  ok('home shows the Send and Receive cards');
  await shot('01-home');

  if (role !== 'update') {
    /* the update banner (the real updater needs a real feed; this checks the screen reacts) */
    win.webContents.send('update:available', { version: '9.9.9', mode: 'auto' });
    await until('the update banner', () => visible('update'));
    if (!/9\.9\.9/.test(await text('update-text'))) fail('update banner text');
    ok('update banner appears: ' + (await text('update-text')) + ' / button "' + (await text('update-btn')) + '"');
    await shot('02-update-banner');
    await js("document.getElementById('update').hidden = true");

  }

  const mkFiles = () => {
    const src = path.join(dir, 'to-send'); fs.rmSync(src, { recursive: true, force: true }); fs.mkdirSync(path.join(src, 'Holiday', 'Day 1'), { recursive: true });
    const files = { 'hello.txt': Buffer.from('hello from the sender'), 'Holiday/Day 1/photo.bin': crypto.randomBytes(3 * 1024 * 1024), 'Holiday/notes.txt': Buffer.from('notes ünïcödé') };
    for (const [n, c] of Object.entries(files)) fs.writeFileSync(path.join(src, n), c);
    return { src, files };
  };
  const digest = (b) => crypto.createHash('sha256').update(b).digest('hex');

  /* the first two steps are the same on both sides */
  const throughChecks = async (flowButton, label) => {
    await click(flowButton);
    await until('the Wi-Fi step', () => visible('p-wifi'));
    await until('the Wi-Fi check', () => js("/ok|warn/.test(document.getElementById('wifi-status').className)"));
    const wifiOk = await js("document.getElementById('wifi-status').classList.contains('ok')");
    await shot(label + '-03-wifi');
    if (!wifiOk) { console.log('SMOKE INFO no network on this machine: the Wi-Fi help is shown instead'); if (!(await visible('wifi-help'))) fail('Wi-Fi help should show when there is no network'); return false; }
    ok(label + ': Wi-Fi step is green: ' + (await text('wifi-detail')));
    await until('Next enabled', () => js("!document.getElementById('next').disabled"));
    await click('next');
    await until('the allow step', () => visible('p-allow'));
    await until('the firewall check', () => js("document.getElementById('allow-title').textContent !== 'Checking...'"));
    const fwOk = await js("document.getElementById('allow-status').classList.contains('ok')");
    console.log('SMOKE INFO firewall step: ' + (await text('allow-title')) + (fwOk ? '' : ' (button: ' + (await text('allow-fix')) + ')'));
    await shot(label + '-04-allow');
    if (fwOk) await click('next'); else { if (!(await visible('allow-fix'))) fail('the Allow button should show when the firewall blocks'); await click('skip'); }     /* the button itself is never pressed: it changes the firewall */
    return true;
  };

  const startSharingUi = async () => {
    const { src, files } = mkFiles();
    await until('the choose step', () => visible('p-choose'));
    await js('window.api.add(' + JSON.stringify([path.join(src, 'hello.txt'), path.join(src, 'Holiday')]) + ').then(window.__fileShare.added)');
    await until('files listed', () => js("document.querySelectorAll('#send-list li').length === 3"));
    ok('3 files listed (one folder expanded)'); await shot('05-choose');
    await until('Start sharing enabled', () => js("!document.getElementById('next').disabled"));
    await click('next');
    await until('the share step', () => js("!document.getElementById('p-share').hidden && /^\\d{3} \\d{3}$/.test(document.getElementById('code').textContent)"));
    const code = (await text('code')).replace(/\s/g, ''), link = await js("document.getElementById('link').value");
    if (!/^http:\/\/[\d.]+:\d+\/\?t=[0-9a-f]{32}$/.test(link)) fail('bad link ' + link);
    ok('sharing started: code ' + code + ', link ' + link.replace(/t=.*/, 't=...')); await shot('06-share');
    return { code, link, files, src };
  };

  const receiveUi = async ({ viaPeer, code, link, files, rootName, dest }) => {
    if (viaPeer) {
      await until('the sender to appear nearby', () => js("document.querySelectorAll('#peers li').length >= 1"), 25000);
      ok('discovery: the sender appeared in the nearby list'); await shot('07-find');
      await js("document.querySelector('#peers li button').click()");
      await js("(function(){var i=document.getElementById('code-in');i.value='" + code + "';i.dispatchEvent(new Event('input'));document.getElementById('pair-go').click()})()");
    } else {
      await js("(function(){document.getElementById('target').value=" + JSON.stringify(link) + ";document.getElementById('target-go').click()})()");
    }
    await until('the file list', () => js("!document.getElementById('p-get').hidden && document.querySelectorAll('#offer-list li').length === 3"));
    ok('connected and the offer is listed (3 files)');
    fs.rmSync(dest, { recursive: true, force: true }); getSession().dest = dest; await js("document.getElementById('dest').textContent=" + JSON.stringify(dest));
    await shot('08-offer'); await click('download');
    await until('the downloads', () => js("/^Done\\./.test(document.getElementById('recv-status').textContent)"), 60000);
    ok('download finished: ' + (await text('recv-status'))); await shot('09-done');
    for (const [n, c] of Object.entries(files)) {
      const p = path.join(dest, n);
      if (!fs.existsSync(p)) fail('missing ' + p);
      if (digest(fs.readFileSync(p)) !== digest(c)) fail('content differs ' + p);
    }
    const left = []; (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(p) : (/\.part$/.test(e.name) && left.push(p)); } })(dest);
    if (left.length) fail('leftover .part files ' + left);
    ok('all 3 files are byte-identical and no .part files are left');
  };

  if (role === 'update') {
    /* a real update: the feed (FILESHARE_UPDATE_FEED) says a newer version exists; the app must find it, download it and check it.
       It stops before installing, so nothing on this computer is replaced. */
    await until('the update banner from the real updater', () => js("!document.getElementById('update').hidden && /Version [0-9]/.test(document.getElementById('update-text').textContent)"), 60000);
    ok('the real updater found: ' + (await text('update-text')));
    await shot('11-update-found');
    await click('update-btn');
    await until('the update to download and verify', () => js("document.getElementById('update-btn').textContent === 'Restart now'"), 180000);
    ok('the update downloaded and passed its checksum: ' + (await text('update-text')));
    await shot('12-update-ready');
    console.log('SMOKE PASSED (update)');
    return app.exit(0);
  }
  if (role === 'self') {
    /* sender through the handlers, receiver through the real screen */
    const { src, files } = mkFiles();
    await H['files:add']([path.join(src, 'hello.txt'), path.join(src, 'Holiday')]);
    const s = await H['share:start']();
    ok('sender started through the app handlers on port ' + s.port + ' (fixed port 41874 expected)');
    if (s.port !== 41874 && !process.env.FILESHARE_MULTI) fail('did not use the fixed port');
    const link = s.links[0].url;
    const passed = await throughChecks('go-recv', 'recv').catch((e) => { throw e; });
    /* go-recv was already clicked; throughChecks clicks again, which is harmless (restarts the flow) */
    if (passed) await until('the find step', () => visible('p-find'));
    const bad = s.code === '123456' ? '654321' : '123456';
    await js("(function(){document.getElementById('target').value=" + JSON.stringify(link.replace(/\?t=[0-9a-f]{32}/, '')) + ";document.getElementById('target-code').value='" + bad + "';document.getElementById('target-go').click()})()");
    await until('the wrong code message', () => js("!document.getElementById('alert').hidden && /not right/.test(document.getElementById('alert').textContent)"));
    ok('a wrong code shows a clear message: ' + (await text('alert')));
    await receiveUi({ viaPeer: false, code: s.code, link, files, rootName: 'Holiday', dest: path.join(dir, 'received-self') });
    await click('tb-home'); await until('home again', () => visible('home')); ok('Home button returns to the two choices');
    await H['share:stop']();
  } else if (role === 'send') {
    const passed = await throughChecks('go-send', 'send');
    const s = await startSharingUi();
    fs.writeFileSync(path.join(dir, 'info.json'), JSON.stringify({ code: s.code, link: s.link }));
    await until('the receiver to finish', () => fs.existsSync(path.join(dir, 'done')), 120000);
    await sleep(800); await shot('10-after');
    await click('next'); await until('back at the choose step', () => visible('p-choose')); ok('Stop sharing returns to the choose step');
  } else if (role === 'recv') {
    const info = await until('the sender info', () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'info.json'), 'utf8')); } catch (e) { return null; } }, 90000);
    await throughChecks('go-recv', 'recv');
    await until('the find step', () => visible('p-find'));
    const read = (n) => fs.readFileSync(path.join(dir, 'to-send', n));
    await receiveUi({ viaPeer: true, code: info.code, link: info.link, files: { 'hello.txt': read('hello.txt'), 'Holiday/Day 1/photo.bin': read('Holiday/Day 1/photo.bin'), 'Holiday/notes.txt': read('Holiday/notes.txt') }, rootName: 'Holiday', dest: path.join(dir, 'received-recv') });
    fs.writeFileSync(path.join(dir, 'done'), '1');
  }
  console.log('SMOKE PASSED (' + role + ')  shots: ' + shots);
  app.exit(0);
};
