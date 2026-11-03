'use strict';
const { app, BrowserWindow, Menu, screen, session, desktopCapturer, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const cfg = require('./config.json');

const SITE = (process.env.PRESENTER_URL || cfg.site).replace(/\/$/, '');
const ORIGIN = new URL(SITE).origin;
const APP_URL = SITE + cfg.appPath;
const TV_URL = SITE + cfg.tvPath;
const SMOKE = !!process.env.PRESENTER_SMOKE;
const FAKE = !!process.env.PRESENTER_FAKE_DISPLAY;
const IS_MAC = process.platform === 'darwin';

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
    minWidth: 900, minHeight: 600, show: false, backgroundColor: '#0e0e10', title: 'Presenter',
    icon: path.join(__dirname, 'build', 'icon.png'), webPreferences: webPrefs()
  });
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
  mainWin.on('moved', () => { buildMenu(); onDisplaysChanged(); });
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
  const ctl = controlDisplay(), others = screen.getAllDisplays().filter((d) => d.id !== ctl.id), cur = tvDisplay();
  const tvItems = others.length ? others.map((d, i) => ({
    label: 'Show on ' + (d.label || ('screen ' + (i + 2))) + ' (' + d.size.width + ' x ' + d.size.height + ')', type: 'radio', checked: !!cur && cur.id === d.id,
    click: () => { writePrefs(Object.assign(readPrefs(), { tvDisplay: d.id })); tvWindowed = false; closeTV(); placeTV(); notify(); }
  })) : [{ label: 'No second screen found', enabled: false }];
  const t = [];
  if (IS_MAC) t.push({ role: 'appMenu' });
  t.push({ label: 'File', submenu: [IS_MAC ? { role: 'close' } : { role: 'quit' }] });
  t.push({ role: 'editMenu' });
  t.push({
    label: 'TV screen',
    submenu: tvItems.concat([
      { type: 'separator' },
      { label: 'Send the TV screen to the second screen', click: () => { tvWindowed = false; closeTV(); placeTV(); notify(); } },
      { label: 'Close the TV screen', click: () => { closeTV(); notify(); } },
      { label: 'Show the TV screen in a window (for testing)', click: () => { closeTV(); tvWindowed = true; createTV(controlDisplay()); notify(); } }
    ])
  });
  t.push({ label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }].concat(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]) });
  t.push({ role: 'windowMenu' });
  t.push({
    label: 'Help',
    submenu: [
      { label: 'Presenter website', click: () => shell.openExternal(cfg.downloadPage) },
      { label: 'Contact the builder', click: () => shell.openExternal(SITE + '/tools/second-screen-presenter/contact/') },
      { type: 'separator' },
      { label: 'Version ' + app.getVersion(), enabled: false }
    ]
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
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
  if (!app.isPackaged || SMOKE) return;
  let autoUpdater;
  try { autoUpdater = require('electron-updater').autoUpdater; } catch (e) { return; }
  const canInstall = process.platform !== 'darwin' || cfg.macSigned;
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;
  const tell = (o) => { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('presenter:update', o); };
  autoUpdater.on('update-available', (i) => { tell(canInstall ? { state: 'downloading', version: i.version } : { state: 'manual', version: i.version, url: cfg.downloadPage }); });
  autoUpdater.on('update-downloaded', (i) => { tell({ state: 'ready', version: i.version }); });
  autoUpdater.on('error', () => { /* offline or no release yet: try again later */ });
  const check = () => { autoUpdater.checkForUpdates().catch(() => {}); };
  setTimeout(check, 8000);
  setInterval(check, 4 * 60 * 60 * 1000);
}

/* ------------------------------------------------------------------ messages from the page */
ipcMain.on('presenter:info', (e) => { e.returnValue = info(); });
ipcMain.handle('presenter:show-tv', () => {
  if (screen.getAllDisplays().length < 2 && !FAKE) return { ok: false, reason: 'one-display' };
  tvWindowed = false; if (!tvAlive()) placeTV(); else positionTV(tvDisplay() || controlDisplay());
  notify(); return { ok: true };
});
ipcMain.handle('presenter:retry', () => { if (mainWin && !mainWin.isDestroyed() && !/^https?:/.test(mainWin.webContents.getURL())) loadMain(); });

/* ------------------------------------------------------------------ start */
if (!app.requestSingleInstanceLock() && !SMOKE) { app.quit(); } else {
  app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
  app.on('before-quit', () => { quitting = true; });
  app.on('window-all-closed', () => { app.quit(); });
  app.whenReady().then(() => {
    setupSession();
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
    console.log('SMOKE ' + JSON.stringify(out));
    app.exit(out.tvAlive && out.api.indexOf('"d":true') >= 0 ? 0 : 1);
  };
  run().catch((e) => { console.log('SMOKE ERROR ' + e.message); app.exit(2); });
}
