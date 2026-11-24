'use strict';
const { app, BrowserWindow, Menu, screen, session, desktopCapturer, ipcMain, shell, dialog, protocol } = require('electron');
const { Readable } = require('stream');
const updateGate = require('./update-gate');
const path = require('path');
const fs = require('fs');
const cfg = require('./config.json');
app.setPath('userData', path.join(app.getPath('appData'), 'Presenter'));      /* keep the saved settings after the rename */

const SITE = (process.env.PRESENTER_URL || cfg.site).replace(/\/$/, '');
const ORIGIN = new URL(SITE).origin;
const APP_URL = SITE + cfg.appPath;
const TV_URL = SITE + cfg.tvPath;
const SMOKE = !!process.env.PRESENTER_SMOKE;
const FAKE = !!process.env.PRESENTER_FAKE_DISPLAY;
const IS_MAC = process.platform === 'darwin';

/* pmedia://f/<encoded path>: a video or photo is played from where it already sits on the computer, so nothing is copied or uploaded */
protocol.registerSchemesAsPrivileged([{ scheme: 'pmedia', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true } }]);
const MEDIA_TYPES = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', ogv: 'video/ogg', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv', mpg: 'video/mpeg', mpeg: 'video/mpeg', ts: 'video/mp2t', '3gp': 'video/3gpp', flv: 'video/x-flv', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', bmp: 'image/bmp', svg: 'image/svg+xml' };
function mediaResponse(req) {
  const refOk = !req.referrer || isOurs(req.referrer) || /^pmedia:/.test(req.referrer);
  let file = '';
  try { file = decodeURIComponent(new URL(req.url).pathname.replace(/^\//, '')); } catch (e) { return new Response('Bad address', { status: 400 }); }
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!refOk || !MEDIA_TYPES[ext]) return new Response('Not allowed', { status: 403 });
  let size = 0;
  try { size = fs.statSync(file).size; } catch (e) { return new Response('The file is not there any more', { status: 404 }); }
  let start = 0, end = Math.max(0, size - 1), status = 200;
  const range = req.headers.get('range'), m = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (m) {
    if (m[1] !== '') { start = +m[1]; if (m[2] !== '') end = Math.min(+m[2], size - 1); }
    else if (m[2] !== '') { start = Math.max(0, size - +m[2]); }
    status = 206;
  }
  if (start > end) return new Response('Bad range', { status: 416 });
  const headers = { 'Content-Type': MEDIA_TYPES[ext], 'Accept-Ranges': 'bytes', 'Content-Length': String(size ? end - start + 1 : 0), 'Access-Control-Allow-Origin': '*' };
  if (status === 206) headers['Content-Range'] = 'bytes ' + start + '-' + end + '/' + size;
  const body = size ? Readable.toWeb(fs.createReadStream(file, { start, end })) : null;
  return new Response(body, { status, headers });
}

let mainWin = null, tvWin = null, quitting = false, tvWindowed = false, picker = null, pickerDone = null;

/* ------------------------------------------------------------------ small saved settings */
function prefsFile() { return path.join(app.getPath('userData'), 'prefs.json'); }
function readPrefs() { try { return JSON.parse(fs.readFileSync(prefsFile(), 'utf8')); } catch (e) { return {}; } }
function writePrefs(p) { try { fs.writeFileSync(prefsFile(), JSON.stringify(p)); } catch (e) { /* settings are optional */ } }

/* ------------------------------------------------------------------ windows */
function webPrefs() {
  return {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    autoplayPolicy: 'no-user-gesture-required',
    backgroundThrottling: false,
    spellcheck: false
  };
}
function isOurs(url) {
  if (/^file:/.test(url)) return true;
  try { return new URL(url).origin === ORIGIN; } catch (e) { return false; }
}
function wire(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isOurs(url)) return { action: 'allow', overrideBrowserWindowOptions: { width: 1024, height: 640, backgroundColor: '#000000', autoHideMenuBar: true, webPreferences: webPrefs() } };
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (isOurs(url)) return;
    e.preventDefault();
    if (/^https?:/.test(url)) shell.openExternal(url);
  });
}

function loadMain() { if (mainWin && !mainWin.isDestroyed()) mainWin.loadURL(APP_URL).catch(() => { /* did-fail-load shows the offline page */ }); }

function createMain() {
  const saved = readPrefs().main || {};
  mainWin = new BrowserWindow({
    width: saved.width || 1360, height: saved.height || 860, x: saved.x, y: saved.y,
    minWidth: 900, minHeight: 600, show: false, backgroundColor: '#0e0e10', title: 'Presenter by Evans Large',
    icon: path.join(__dirname, 'build', 'icon.png'), autoHideMenuBar: true, webPreferences: webPrefs()
  });
  if (!IS_MAC) mainWin.removeMenu();
  wire(mainWin);
  mainWin.once('ready-to-show', () => { mainWin.show(); });
  mainWin.webContents.on('did-fail-load', (_e, code, _d, _u, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    mainWin.loadFile(path.join(__dirname, 'offline.html'));
  });
  mainWin.webContents.on('will-prevent-unload', (e) => {
    const choice = dialog.showMessageBoxSync(mainWin, { type: 'question', buttons: ['Close anyway', 'Keep working'], defaultId: 1, cancelId: 1, title: 'Presenter', message: 'You are recording or sharing a screen.', detail: 'Closing now stops it.' });
    if (choice === 0) e.preventDefault();
  });
  mainWin.on('close', () => { if (!mainWin.isMaximized() && !mainWin.isMinimized()) writePrefs(Object.assign(readPrefs(), { main: mainWin.getBounds() })); });
  mainWin.on('closed', () => { mainWin = null; quitting = true; closeTV(); app.quit(); });
  mainWin.on('moved', () => { onDisplaysChanged(); });
  loadMain();
}

/* ------------------------------------------------------------------ the TV screen: a borderless full screen window on the other display */
function controlDisplay() { return mainWin && !mainWin.isDestroyed() ? screen.getDisplayMatching(mainWin.getBounds()) : screen.getPrimaryDisplay(); }
function tvDisplay() {
  if (FAKE) return screen.getPrimaryDisplay();
  const ctl = controlDisplay(), others = screen.getAllDisplays().filter((d) => d.id !== ctl.id), want = readPrefs().tvDisplay;
  return others.find((d) => d.id === want) || others[0] || null;
}
function tvAlive() { return !!tvWin && !tvWin.isDestroyed(); }
function positionTV(d) {
  if (!tvAlive()) return;
  if (tvWindowed || FAKE) {
    if (tvWin.isFullScreen()) tvWin.setFullScreen(false);
    tvWin.setBounds({ x: d.bounds.x + 60, y: d.bounds.y + 60, width: 960, height: 540 });
    return;
  }
  tvWin.setBounds(d.bounds);
  if (IS_MAC) tvWin.setSimpleFullScreen(true); else tvWin.setFullScreen(true);
  tvWin.setAlwaysOnTop(true, 'screen-saver');
}
function createTV(d) {
  tvWin = new BrowserWindow({
    x: d.bounds.x, y: d.bounds.y, width: d.bounds.width, height: d.bounds.height,
    frame: tvWindowed || FAKE, show: false, skipTaskbar: !(tvWindowed || FAKE), resizable: tvWindowed || FAKE,
    movable: tvWindowed || FAKE, minimizable: tvWindowed || FAKE, maximizable: false, fullscreenable: true,
    backgroundColor: '#000000', title: 'Presenter TV screen', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: webPrefs()
  });
  wire(tvWin);
  tvWin.setMenuBarVisibility(false);
  tvWin.once('ready-to-show', () => { positionTV(d); if (tvWindowed || FAKE) tvWin.show(); else tvWin.showInactive(); });
  tvWin.webContents.on('did-fail-load', (_e, code, _d, _u, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    setTimeout(() => { if (tvAlive()) tvWin.loadURL(TV_URL).catch(() => {}); }, 5000);
  });
  tvWin.webContents.on('render-process-gone', () => { if (tvAlive()) tvWin.reload(); });
  tvWin.on('closed', () => { tvWin = null; tvWindowed = false; if (!quitting) notify(); });
  tvWin.loadURL(TV_URL).catch(() => {});
}
function placeTV() {
  const d = tvDisplay();
  if (!d) { closeTV(); return false; }
  if (!tvAlive()) createTV(d); else positionTV(d);
  return true;
}
function closeTV() { if (tvAlive()) { const w = tvWin; tvWin = null; w.destroy(); } }
function onDisplaysChanged() {
  if (quitting) return;
  if (tvAlive() && !tvWindowed) { const d = tvDisplay(); if (d) positionTV(d); else closeTV(); }
  else if (!tvAlive() && !tvWindowed) placeTV();
  buildMenu(); notify();
}
function info() { return { desktop: true, platform: process.platform, version: app.getVersion(), displays: screen.getAllDisplays().length, tvOpen: tvAlive() }; }
function notify() { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('presenter:displays', info()); }

/* ------------------------------------------------------------------ menu */
function buildMenu() {
  /* The app has no menu bar. Screens are chosen inside the app. On a Mac the system keeps a small menu so copy, paste and quit still work. */
  if (IS_MAC) Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
  else Menu.setApplicationMenu(null);
}

/* ------------------------------------------------------------------ camera, microphone and screen share */
const ALLOWED = ['media', 'mediaKeySystem', 'display-capture', 'fullscreen', 'clipboard-sanitized-write', 'clipboard-read', 'notifications', 'midi'];
function setupSession() {
  const ses = session.defaultSession;
  ses.setPermissionRequestHandler((wc, permission, cb, details) => cb(ALLOWED.indexOf(permission) >= 0 && isOurs(details.requestingUrl || wc.getURL())));
  ses.setPermissionCheckHandler((wc, permission, origin) => ALLOWED.indexOf(permission) >= 0 && isOurs(origin || ''));
  ses.setDisplayMediaRequestHandler((request, callback) => {
    pickSource().then((src) => {
      if (!src) { callback({}); return; }
      callback(process.platform === 'win32' ? { video: src, audio: 'loopback' } : { video: src });
    }).catch(() => callback({}));
  });
}
function pickSource() {
  return desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 360, height: 202 } }).then((srcs) => new Promise((resolve) => {
    if (!srcs.length) { resolve(null); return; }
    if (picker && !picker.isDestroyed()) picker.destroy();
    pickerDone = (id) => { pickerDone = null; const hit = srcs.find((s) => s.id === id) || null; if (picker && !picker.isDestroyed()) picker.destroy(); resolve(hit); };
    picker = new BrowserWindow({
      width: 720, height: 520, parent: mainWin || undefined, modal: !!mainWin, title: 'Share a screen or window', autoHideMenuBar: true,
      backgroundColor: '#151517', minimizable: false, maximizable: false,
      webPreferences: { preload: path.join(__dirname, 'picker-preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    picker.setMenuBarVisibility(false);
    picker.on('closed', () => { picker = null; if (pickerDone) pickerDone(null); });
    picker.webContents.once('did-finish-load', () => {
      picker.webContents.send('picker:sources', srcs.map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL() })));
    });
    picker.loadFile(path.join(__dirname, 'picker.html'));
  }));
}
ipcMain.on('picker:choose', (_e, id) => { if (pickerDone) pickerDone(id); });

/* ------------------------------------------------------------------ updates */
function setupUpdater() {
  if (SMOKE) return;
  updateGate({ app, dialog, shell, getWindow: () => mainWin, name: 'Presenter by Evans Large', downloadPage: cfg.downloadPage, macSigned: cfg.macSigned });
}

/* ------------------------------------------------------------------ messages from the page */
ipcMain.on('presenter:info', (e) => { e.returnValue = info(); });
ipcMain.handle('presenter:show-tv', () => {
  if (screen.getAllDisplays().length < 2 && !FAKE) return { ok: false, reason: 'one-display' };
  tvWindowed = false; if (!tvAlive()) placeTV(); else positionTV(tvDisplay() || controlDisplay());
  notify(); return { ok: true };
});
ipcMain.handle('presenter:list-displays', () => {
  const ctl = controlDisplay(), cur = tvAlive() ? tvDisplay() : null;
  return screen.getAllDisplays().map((d, i) => ({ id: d.id, label: d.label || ('Screen ' + (i + 1)), w: d.size.width, h: d.size.height, control: d.id === ctl.id, tv: !!cur && cur.id === d.id }));
});
ipcMain.handle('presenter:set-tv', (_e, id) => {
  if (!screen.getAllDisplays().some((d) => d.id === id)) return { ok: false };
  writePrefs(Object.assign(readPrefs(), { tvDisplay: id })); tvWindowed = false; closeTV(); placeTV(); notify(); return { ok: true };
});
ipcMain.handle('presenter:retry', () => { if (mainWin && !mainWin.isDestroyed() && !/^https?:/.test(mainWin.webContents.getURL())) loadMain(); });

/* ------------------------------------------------------------------ start */
if (!app.requestSingleInstanceLock() && !SMOKE) { app.quit(); } else {
  app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { app.quit(); });
  app.whenReady().then(() => {
    setupSession();
    protocol.handle('pmedia', mediaResponse);
    createMain();
    buildMenu();
    screen.on('display-added', onDisplaysChanged);
    screen.on('display-removed', onDisplaysChanged);
    screen.on('display-metrics-changed', onDisplaysChanged);
    mainWin.webContents.once('did-finish-load', () => { if (!SMOKE) placeTV(); notify(); });
    setupUpdater();
    if (SMOKE) smoke();
  });
}

/* ------------------------------------------------------------------ self test: node and electron only, prints one JSON line */
function smoke() {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const run = async () => {
    const out = { fake: FAKE };
    await wait(4000);
    out.title = mainWin.getTitle(); out.url = mainWin.webContents.getURL();
    out.api = await mainWin.webContents.executeJavaScript('JSON.stringify({ d: !!window.presenterDesktop, v: window.presenterDesktop && window.presenterDesktop.version, n: window.presenterDesktop && window.presenterDesktop.displays })');
    out.show = await mainWin.webContents.executeJavaScript('window.presenterDesktop.showTV()');
    await wait(4000);
    out.tvAlive = tvAlive(); out.tvUrl = tvAlive() ? tvWin.webContents.getURL() : '';
    out.pill = await mainWin.webContents.executeJavaScript("document.getElementById('p-disp-t') && document.getElementById('p-disp-t').textContent");
    out.gateHidden = await mainWin.webContents.executeJavaScript("!!document.getElementById('gate') && document.getElementById('gate').hidden");
    out.sw = await mainWin.webContents.executeJavaScript("navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(function (r) { return r.length; }) : -1");
    out.displays = await mainWin.webContents.executeJavaScript('window.presenterDesktop.listDisplays().then(function (l) { return l.length + ":" + l.map(function (d) { return d.id + "/" + d.control + "/" + d.tv; }).join(","); })');
    const tmp = path.join(require('os').tmpdir(), 'presenter-smoke.webm'); fs.writeFileSync(tmp, Buffer.alloc(5000, 7));
    out.media = await mainWin.webContents.executeJavaScript('fetch("pmedia://f/' + encodeURIComponent(tmp) + '", { headers: { Range: "bytes=100-199" } }).then(function (r) { return r.status + " " + r.headers.get("content-range") + " " + r.headers.get("content-type"); }).catch(function (e) { return "ERR " + e.message; })');
    out.mediaBad = await mainWin.webContents.executeJavaScript('fetch("pmedia://f/' + encodeURIComponent('C:\Windows\win.ini') + '").then(function (r) { return r.status; }).catch(function (e) { return "ERR " + e.message; })');
    console.log('SMOKE ' + JSON.stringify(out));
    app.exit(out.tvAlive && out.api.indexOf('"d":true') >= 0 ? 0 : 1);
  };
  run().catch((e) => { console.log('SMOKE ERROR ' + e.message); app.exit(2); });
}
