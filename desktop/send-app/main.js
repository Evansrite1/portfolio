'use strict';
/* File Share by Evans Large: send files between computers on the same network. Windows, Mac and Linux.
   Nothing is uploaded. The sender picks the files, the receiver pairs with a 6 digit code (or a copied link),
   chooses where to save, and every file is checked against a SHA-256 before it gets its real name. */
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, powerSaveBlocker, Menu, session } = require('electron');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

if (process.env.FILESHARE_USERDATA) app.setPath('userData', process.env.FILESHARE_USERDATA);   /* for tests only */
const MULTI = !!process.env.FILESHARE_MULTI;                                                    /* for tests only */
if (!MULTI && !app.requestSingleInstanceLock()) { app.quit(); return; }

const { ShareServer } = require('./lib/share-server');
const { Discovery, deviceName } = require('./lib/discovery');
const rx = require('./lib/receiver');
const { parseTarget } = require('./lib/safe');
const { lanAddresses } = require('./lib/net');
const { createChecker } = require('./lib/netcheck');
const fs = require('fs');

const APP_NAME = 'File Share by Evans Large';
const PORTS = { udp: 41873, tcp: 41874 };

const INDEX = path.join(__dirname, 'renderer', 'index.html');
const INDEX_URL = pathToFileURL(INDEX).href;
const myId = crypto.randomUUID();
const myName = deviceName();

let win = null;
const share = new ShareServer({ deviceName: myName, platform: process.platform });
const discovery = new Discovery({ id: myId, port: Number(process.env.FILESHARE_DISCOVERY_PORT) || PORTS.udp });
let discoveryOk = false;

/* A tiny file remembering what the person already allowed (needed on Mac and Linux, where it cannot be read back). */
const store = {
  file: () => path.join(app.getPath('userData'), 'state.json'),
  get(k) { try { return JSON.parse(fs.readFileSync(this.file(), 'utf8'))[k]; } catch (e) { return null; } },
  set(k, v) { let o = {}; try { o = JSON.parse(fs.readFileSync(this.file(), 'utf8')); } catch (e) {} o[k] = v; try { fs.mkdirSync(path.dirname(this.file()), { recursive: true }); fs.writeFileSync(this.file(), JSON.stringify(o)); } catch (e) {} }
};
const checker = createChecker({ ports: PORTS, store, discoveryOk: () => discoveryOk });
let session_ = null;            /* the receive session: { host, port, token, offer, dest, abort, running } */
let blockerId = null;

const send = (ch, data) => { if (win && !win.isDestroyed()) win.webContents.send(ch, data); };
function keepAwake(on) {                       /* the computer must not sleep in the middle of a transfer */
  if (on && blockerId === null) blockerId = powerSaveBlocker.start('prevent-app-suspension');
  else if (!on && blockerId !== null) { try { powerSaveBlocker.stop(blockerId); } catch (e) {} blockerId = null; }
}
const defaultDest = () => path.join(app.getPath('downloads'), 'File Share');
const isStr = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max;

/* ------------------------------------------------------------------ what the screen can ask for */
const H = {
  async 'app:info'() {
    return { id: myId, name: myName, version: app.getVersion(), platform: process.platform, dest: defaultDest(), files: share.list(), active: share.active };
  },

  async 'files:pick'(kind) {
    if (share.active) throw new Error('Stop sharing before changing the files.');
    const r = await dialog.showOpenDialog(win, {
      title: kind === 'folder' ? 'Choose a folder to send' : 'Choose files to send',
      properties: kind === 'folder' ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections']
    });
    if (r.canceled || !r.filePaths.length) return { added: 0, skipped: 0, files: share.list() };
    return share.addPaths(r.filePaths);
  },
  async 'files:add'(paths) {
    if (!Array.isArray(paths) || paths.length > 5000 || !paths.every((p) => isStr(p, 4096))) throw new Error('Those files could not be added.');
    return share.addPaths(paths);
  },
  async 'files:remove'(id) { if (!isStr(id, 20)) throw new Error('Bad request'); share.remove(id); return share.list(); },
  async 'files:clear'() { share.clear(); return share.list(); },

  async 'share:start'() {
    const info = await share.start({ port: PORTS.tcp });
    const addrs = lanAddresses();
    const links = addrs.map((a) => ({ ip: a.ip, name: a.name, url: 'http://' + a.ip + ':' + info.port + '/?t=' + info.token }));
    discovery.setAnnounce({ name: myName, platform: process.platform, port: info.port, files: share.files.size, bytes: share.total() });
    keepAwake(true);
    return { code: info.code, port: info.port, expiresAt: info.expiresAt, links, files: share.list() };
  },
  async 'share:stop'() { share.stop(); return true; },

  async 'net:check'() { return checker.check(); },
  async 'net:fix'(id) {
    if (!isStr(id, 20)) throw new Error('Bad request');
    const r = await checker.fix(id);
    return { result: r, check: await checker.check() };
  },

  async 'recv:dest'() {
    const r = await dialog.showOpenDialog(win, { title: 'Where should the files be saved?', defaultPath: (session_ && session_.dest) || defaultDest(), properties: ['openDirectory', 'createDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    if (session_) session_.dest = r.filePaths[0];
    return r.filePaths[0];
  },

  /* peerId + code, or target (link or address) + optional code */
  async 'recv:connect'(a) {
    if (!a || typeof a !== 'object') throw new Error('Bad request');
    let host, port, token = null;
    const code = a.code == null ? '' : String(a.code).replace(/\s+/g, '');
    if (a.peerId != null) {
      const p = discovery.list().find((x) => x.id === a.peerId);
      if (!p) throw new Error('That computer is no longer sharing. Ask the sender to share again.');
      host = p.host; port = p.port;
    } else if (isStr(a.target, 600)) {
      const t = parseTarget(a.target);
      if (!t) throw new Error('That is not a valid link or address. It looks like 192.168.1.5:5123 or a link starting with http://.');
      host = t.host; port = t.port; token = t.token;
    } else throw new Error('Bad request');
    if (!token) {
      if (!/^\d{6}$/.test(code)) throw new Error('Type the 6 digit code shown on the sender\'s screen.');
      token = await rx.pair(host, port, code);
    }
    const offer = await rx.getOffer(host, port, token);
    if (session_ && session_.abort) session_.abort.abort();
    session_ = { host, port, token, offer, dest: (session_ && session_.dest) || defaultDest(), abort: null, running: false };
    return { name: offer.name, platform: offer.platform, total: offer.total, files: offer.files.map((f) => ({ id: f.id, name: f.name, size: f.size })), dest: session_.dest };
  },

  async 'recv:download'() {
    const s = session_;
    if (!s) throw new Error('Connect to a sender first.');
    if (s.running) throw new Error('Already downloading.');
    s.running = true; s.abort = new AbortController();
    keepAwake(true);
    const bytes = {}; let dirty = false;
    const timer = setInterval(() => { if (dirty) { dirty = false; send('recv:progress', { bytes }); } }, 150);
    rx.downloadAll({
      host: s.host, port: s.port, token: s.token, offer: s.offer, destDir: s.dest, signal: s.abort.signal,
      onBytes: (id, n) => { bytes[id] = n; dirty = true; },
      onFile: (f) => send('recv:file', f)
    }).then((res) => {
      send('recv:progress', { bytes });
      send('recv:done', { done: res.done, failed: res.failed, dest: s.dest, cancelled: s.abort.signal.aborted });
    }).catch((e) => {
      send('recv:done', { done: [], failed: [{ name: '', error: e.message }], dest: s.dest, cancelled: false });
    }).finally(() => { clearInterval(timer); s.running = false; keepAwake(share.active); });
    return { started: true, dest: s.dest };
  },
  async 'recv:cancel'() { if (session_ && session_.abort) session_.abort.abort(); return true; },

  async 'shell:open-dest'() { if (session_ && session_.dest) { const e = await shell.openPath(session_.dest); return e || null; } return null; },
  async 'shell:reveal'(p) {
    if (!isStr(p, 4096) || !session_) return false;
    const rel = path.relative(path.resolve(session_.dest), path.resolve(p));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;      /* only files inside the save folder */
    shell.showItemInFolder(path.resolve(p)); return true;
  },
  async 'clip:copy'(text) { if (!isStr(text, 1000)) return false; clipboard.writeText(text); return true; }
};

/* Only our own screen may call these. */
for (const [ch, fn] of Object.entries(H)) {
  ipcMain.handle(ch, async (e, arg) => {
    if (!e.senderFrame || e.senderFrame.url !== INDEX_URL) throw new Error('Not allowed');
    return fn(arg);
  });
}

/* ------------------------------------------------------------------ events to the screen */
share.on('progress', (sent) => send('share:progress', { sent }));
share.on('hashed', (h) => send('share:hashed', h));
share.on('client', (ip) => send('share:client', { ip }));
share.on('paired', (ip) => send('share:paired', { ip }));
share.on('wrong-code', (w) => send('share:wrong-code', w));
share.on('served', (s) => send('share:served', s));
share.on('stopped', () => { discovery.setAnnounce(null); keepAwake(!!(session_ && session_.running)); send('share:ended', { reason: 'stopped' }); });
share.on('expired', () => send('share:ended', { reason: 'expired' }));
share.on('error', (e) => send('share:error', { message: e.message }));
discovery.on('peers', (list) => send('peers', list));
discovery.on('error', (e) => send('discovery:error', { message: e.message }));

/* ------------------------------------------------------------------ window */
function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 720, minWidth: 760, minHeight: 560, backgroundColor: '#0b0b0c', title: APP_NAME,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, preload: path.join(__dirname, 'preload.js') }
  });
  if (process.platform !== 'darwin') win.removeMenu();
  win.loadFile(INDEX);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => { win = null; });
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(false));
  if (process.platform === 'darwin') Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  try { await discovery.start(); discoveryOk = true; } catch (e) { /* the app still works with a link or an address */ }
  createWindow();
  if (process.argv.includes('--smoke')) {
    try { await require('./test/smoke')({ app, win, H, share, discovery, getSession: () => session_ }); }
    catch (e) { console.error('SMOKE FAILED', e && e.stack || e); app.exit(1); }
  }
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('before-quit', () => { share.stop(); discovery.stop(); if (session_ && session_.abort) session_.abort.abort(); });
app.on('window-all-closed', () => { app.quit(); });
