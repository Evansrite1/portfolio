/* Color Picker by Evans Large. Press the shortcut (or the button), the screen freezes, click any pixel, and the color is
   copied. It works over any app, window, video or windowed game, because it reads a picture of the screen. */
'use strict';
const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, desktopCapturer, screen, clipboard, nativeImage, systemPreferences, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const Color = require('./renderer/color.js');

const SHORTCUT = 'CommandOrControl+Alt+C';
const MAX_HISTORY = 60;
let win = null, overlay = null, tray = null, quitting = false, picking = false;
const store = () => path.join(app.getPath('userData'), 'colors.json');

function load() {
  try { return JSON.parse(fs.readFileSync(store(), 'utf8')); } catch (e) { return { history: [], autoCopy: true }; }
}
function save(d) { try { fs.mkdirSync(path.dirname(store()), { recursive: true }); fs.writeFileSync(store(), JSON.stringify(d)); } catch (e) { /* ignore */ } }
let data = { history: [], autoCopy: true };

if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  app.on('second-instance', () => showWindow());
}

function iconImage() {
  const p = path.join(__dirname, 'build', 'icon.png');
  return fs.existsSync(p) ? nativeImage.createFromPath(p) : undefined;
}

function createWindow() {
  win = new BrowserWindow({
    width: 440, height: 700, minWidth: 380, minHeight: 560, show: false, backgroundColor: '#14171c', autoHideMenuBar: true,
    title: 'Color Picker by Evans Large', icon: iconImage(),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => { if (!process.argv.includes('--hidden')) win.show(); });
  win.on('close', (e) => { if (!quitting && tray) { e.preventDefault(); win.hide(); } });
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}

function state() { return { history: data.history, autoCopy: data.autoCopy, shortcut: SHORTCUT.replace('CommandOrControl', process.platform === 'darwin' ? 'Cmd' : 'Ctrl'), platform: process.platform }; }
function push() { if (win && !win.isDestroyed()) win.webContents.send('state', state()); }

/* ------------------------------------------------------------------ picking */
async function grabScreen() {
  const cursor = screen.getCursorScreenPoint();
  const d = screen.getDisplayNearestPoint(cursor);
  const size = { width: Math.round(d.size.width * d.scaleFactor), height: Math.round(d.size.height * d.scaleFactor) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const src = sources.find((s) => String(s.display_id) === String(d.id)) || sources[0];
  if (!src) throw new Error('No screen could be captured.');
  const img = src.thumbnail, s = img.getSize();
  return { display: d, width: s.width, height: s.height, bitmap: img.toBitmap(), bgra: process.platform !== 'darwin' };
}

async function pick() {
  if (picking) return;
  picking = true;
  try {
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') === 'denied') {
      showWindow();
      if (win) win.webContents.send('notice', 'Allow Color Picker under System Settings, Privacy and Security, Screen Recording, then open the app again.');
      picking = false; return;
    }
    const wasVisible = win && win.isVisible();
    if (wasVisible) { win.hide(); await new Promise((r) => setTimeout(r, 220)); }
    const shot = await grabScreen();
    const b = shot.display.bounds;
    overlay = new BrowserWindow({
      x: b.x, y: b.y, width: b.width, height: b.height, frame: false, resizable: false, movable: false, fullscreenable: false, skipTaskbar: true,
      alwaysOnTop: true, show: false, backgroundColor: '#000000', hasShadow: false, enableLargerThanScreen: true,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    overlay.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin') overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    await overlay.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
    overlay.webContents.send('shot', { width: shot.width, height: shot.height, bgra: shot.bgra, bitmap: shot.bitmap });
    overlay.show(); overlay.focus();
    if (process.env.PICK_E2E) {   // build check: move the mouse to the middle of the screen and click
      const mx = Math.round(b.width / 2), my = Math.round(b.height / 2);
      setTimeout(() => { overlay.webContents.sendInputEvent({ type: 'mouseMove', x: mx, y: my }); setTimeout(() => overlay.webContents.sendInputEvent({ type: 'mouseDown', x: mx, y: my, button: 'left', clickCount: 1 }), 300); }, 900);
    }
    overlay.on('closed', () => { overlay = null; picking = false; if (wasVisible) showWindow(); });
  } catch (e) {
    picking = false;
    showWindow();
    if (win) win.webContents.send('notice', 'Could not read the screen: ' + (e && e.message ? e.message : e));
  }
}

function closeOverlay() { if (overlay && !overlay.isDestroyed()) overlay.close(); }

ipcMain.on('overlay:pick', (_e, c) => {
  const r = Math.round(c.r), g = Math.round(c.g), b = Math.round(c.b);
  if (![r, g, b].every((n) => n >= 0 && n <= 255)) return;
  const hex = Color.toHex(r, g, b);
  data.history = [{ hex, t: Date.now() }].concat(data.history.filter((h) => h.hex !== hex)).slice(0, MAX_HISTORY);
  save(data);
  if (data.autoCopy) clipboard.writeText(hex);
  closeOverlay();
  if (process.env.PICK_E2E) { fs.writeFileSync(process.env.PICK_E2E, JSON.stringify({ picked: hex, history: data.history.length })); setTimeout(() => app.quit(), 200); return; }
  setTimeout(() => { showWindow(); push(); if (win) win.webContents.send('picked', hex); }, 120);
});
ipcMain.on('overlay:cancel', () => closeOverlay());
ipcMain.handle('state', () => state());
ipcMain.handle('pick', () => { pick(); return true; });
ipcMain.handle('copy', (_e, text) => { clipboard.writeText(String(text).slice(0, 200)); return true; });
ipcMain.handle('remove', (_e, hex) => { data.history = data.history.filter((h) => h.hex !== hex); save(data); push(); return true; });
ipcMain.handle('clear', () => { data.history = []; save(data); push(); return true; });
ipcMain.handle('autocopy', (_e, on) => { data.autoCopy = !!on; save(data); push(); return true; });

/* ------------------------------------------------------------------ start */
app.whenReady().then(async () => {
  if (process.argv.includes('--selftest')) {
    // used by the build check: read the screen once and report the size and the center pixel
    let out;
    try {
      const s = await grabScreen();
      const i = (Math.floor(s.height / 2) * s.width + Math.floor(s.width / 2)) * 4;
      out = { ok: true, width: s.width, height: s.height, bytes: s.bitmap.length, center: [s.bitmap[i + 2], s.bitmap[i + 1], s.bitmap[i]] };
    } catch (e) { out = { ok: false, error: String(e) }; }
    fs.writeFileSync(process.env.SELFTEST_OUT || path.join(app.getPath('temp'), 'color-picker-selftest.json'), JSON.stringify(out));
    app.quit();
    return;
  }
  data = Object.assign({ history: [], autoCopy: true }, load());
  createWindow();
  if (process.env.PICK_E2E) setTimeout(() => pick(), 1500);
  try {
    tray = new Tray(iconImage() || nativeImage.createEmpty());
    tray.setToolTip('Color Picker by Evans Large');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Pick a color', click: () => pick() },
      { label: 'Show the window', click: () => showWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ]));
    tray.on('click', () => showWindow());
  } catch (e) { tray = null; }
  const ok = globalShortcut.register(SHORTCUT, () => pick());
  if (!ok && win) win.webContents.once('did-finish-load', () => win.webContents.send('notice', 'The shortcut ' + SHORTCUT + ' is used by another program. Use the Pick button instead.'));
});

app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (!tray) app.quit(); });
app.on('activate', () => showWindow());

/* in-app updates: asks when a newer version exists (skip twice, then it is required) */
require('electron').app.whenReady().then(() => { const { app, dialog, shell } = require('electron'); require('./update-gate')({ app, dialog, shell, getWindow: () => win, name: 'Color Picker by Evans Large', downloadPage: 'https://evansademilua.vercel.app/tools/color-picker/', macSigned: false }); });
