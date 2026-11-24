/* Screen Recorder by Evans Large. Records the whole screen or any window (also outside the browser) with sound, and saves
   the video in the Videos folder on this computer. Nothing is uploaded. */
'use strict';
const { app, BrowserWindow, ipcMain, desktopCapturer, shell, screen, systemPreferences, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null, ctl = null, out = null, outPath = '', bytes = 0, recording = false;
const E2E = process.env.REC_E2E || '';

if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); } });
}

function folder() {
  const d = E2E ? path.join(app.getPath('temp'), 'rec-e2e') : path.join(app.getPath('videos'), 'Screen Recordings');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function stamp() {
  const n = new Date(), p = (x) => String(x).padStart(2, '0');
  return n.getFullYear() + '-' + p(n.getMonth() + 1) + '-' + p(n.getDate()) + ' ' + p(n.getHours()) + '-' + p(n.getMinutes()) + '-' + p(n.getSeconds());
}

function createWindow() {
  win = new BrowserWindow({
    width: 960, height: 700, minWidth: 760, minHeight: 560, show: false, backgroundColor: '#14171c', autoHideMenuBar: true,
    title: 'Screen Recorder by Evans Large', icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'), { query: E2E ? { e2e: '1', fmt: process.env.REC_FMT || 'mp4' } : {} });
  win.once('ready-to-show', () => win.show());
  win.on('closed', () => { win = null; app.quit(); });
}

function openController() {
  const d = screen.getPrimaryDisplay().workArea;
  ctl = new BrowserWindow({
    width: 300, height: 58, x: Math.round(d.x + d.width / 2 - 150), y: d.y + 12, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true,
    focusable: true, show: false, backgroundColor: '#14171c', transparent: false, hasShadow: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  ctl.setAlwaysOnTop(true, 'screen-saver');
  try { ctl.setContentProtection(true); } catch (e) { /* keeps this bar out of the recording where the system allows */ }
  ctl.loadFile(path.join(__dirname, 'renderer', 'controller.html'));
  ctl.once('ready-to-show', () => ctl.showInactive());
  ctl.on('closed', () => { ctl = null; });
}

ipcMain.handle('sources', async () => {
  const list = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 320, height: 180 }, fetchWindowIcons: false });
  return list.map((s) => ({ id: s.id, name: s.name, kind: s.id.startsWith('screen') ? 'screen' : 'window', thumb: s.thumbnail.isEmpty() ? '' : s.thumbnail.toDataURL() }));
});
ipcMain.handle('perm', () => {
  if (process.platform !== 'darwin') return { screen: 'granted', mic: 'granted' };
  return { screen: systemPreferences.getMediaAccessStatus('screen'), mic: systemPreferences.getMediaAccessStatus('microphone') };
});
ipcMain.handle('ask-mic', async () => (process.platform === 'darwin' ? systemPreferences.askForMediaAccess('microphone') : true));

ipcMain.handle('rec:start', (_e, o) => {
  const ext = o && o.ext === 'mp4' ? 'mp4' : 'webm';
  outPath = path.join(folder(), 'Recording ' + stamp() + '.' + ext);
  out = fs.createWriteStream(outPath);
  bytes = 0; recording = true;
  if (!E2E) { openController(); if (win) win.minimize(); }
  return outPath;
});
ipcMain.on('rec:chunk', (_e, buf) => { if (out && recording) { const b = Buffer.from(buf); bytes += b.length; out.write(b); } });
ipcMain.handle('rec:stop', () => new Promise((resolve) => {
  recording = false;
  if (ctl && !ctl.isDestroyed()) ctl.close();
  const done = () => { if (win) { win.restore(); win.show(); win.focus(); } resolve({ path: outPath, bytes }); };
  if (out) { out.end(done); out = null; } else done();
}));
ipcMain.on('rec:tick', (_e, t) => { if (ctl && !ctl.isDestroyed()) ctl.webContents.send('tick', t); });
ipcMain.on('ctl', (_e, cmd) => { if (win && !win.isDestroyed() && ['stop', 'pause'].includes(cmd)) win.webContents.send('cmd', cmd); });
ipcMain.handle('show', (_e, p) => { if (p && fs.existsSync(p)) shell.showItemInFolder(p); return true; });
ipcMain.handle('open', (_e, p) => { if (p && fs.existsSync(p)) shell.openPath(p); return true; });
ipcMain.handle('folder', () => { shell.openPath(folder()); return true; });
ipcMain.handle('e2e-result', (_e, r) => { fs.writeFileSync(E2E, JSON.stringify(r)); setTimeout(() => app.quit(), 200); return true; });
ipcMain.handle('e2e-size', (_e, p) => { try { return fs.statSync(p).size; } catch (e) { return -1; } });

app.whenReady().then(() => {
  createWindow();
  globalShortcut.register('CommandOrControl+Shift+R', () => { if (win && !win.isDestroyed()) win.webContents.send('cmd', 'toggle'); });
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());

/* in-app updates: asks when a newer version exists (skip twice, then it is required) */
require('electron').app.whenReady().then(() => { const { app, dialog, shell } = require('electron'); require('./update-gate')({ app, dialog, shell, getWindow: () => win, name: 'Screen Recorder by Evans Large', downloadPage: 'https://evansademilua.vercel.app/tools/screen-recorder/', macSigned: false }); });
