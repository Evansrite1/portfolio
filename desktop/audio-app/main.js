/* Audio by Evans Large: the studio from the website in its own window, for Windows and Mac. Everything it needs is inside
   the app, so it works with no internet. Files are opened and saved on this computer. */
'use strict';
const { app, BrowserWindow, Menu, protocol, net, session, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const WEB = path.join(__dirname, 'web');
const ENTRY = 'studio://app/tools/audio-mastering/app/index.html';
const SMOKE = process.env.AUDIO_SMOKE || '';
let win = null;

protocol.registerSchemesAsPrivileged([{ scheme: 'studio', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

if (!app.requestSingleInstanceLock()) { app.quit(); } else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
}

function menu() {
  const mac = process.platform === 'darwin';
  const t = [
    ...(mac ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'togglefullscreen' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }] },
    { role: 'windowMenu' },
    { label: 'Help', submenu: [{ label: 'Audio by Evans Large on the web', click: () => shell.openExternal('https://evansademilua.vercel.app/tools/audio-mastering/') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(t));
}

function create() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 640, show: false, backgroundColor: '#0e1013', title: 'Audio by Evans Large',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => { win.show(); win.maximize(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('studio://')) { e.preventDefault(); if (/^https:/.test(url)) shell.openExternal(url); } });
  win.loadURL(ENTRY);
  win.on('closed', () => { win = null; });
  return win;
}

app.whenReady().then(async () => {
  protocol.handle('studio', (req) => {
    const u = new URL(req.url);
    const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '');
    const full = path.normalize(path.join(WEB, rel));
    if (!full.startsWith(WEB) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(full).toString());
  });
  // microphone and audio devices for recording; nothing else
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(['media', 'audioCapture'].includes(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => ['media', 'audioCapture'].includes(permission));
  // files made in the studio are saved with a normal Save window
  session.defaultSession.on('will-download', () => { /* Electron shows its own Save As window */ });
  menu();
  const w = create();
  if (SMOKE) {
    // build check: the studio must load, define its engine and print no script errors
    const errors = [];
    w.webContents.on('console-message', (_e, level, message) => { if (level >= 3) errors.push(message.slice(0, 200)); });
    w.webContents.once('did-finish-load', async () => {
      await new Promise((r) => setTimeout(r, 2500));
      let info = {};
      try { info = await w.webContents.executeJavaScript('({ title: document.title, buttons: document.querySelectorAll("button").length, am: Object.keys(window).filter(k => /^(Am|AM|am)/.test(k)).slice(0,6), ctx: typeof AudioContext })'); } catch (e) { info = { error: String(e) }; }
      fs.writeFileSync(SMOKE, JSON.stringify({ ok: !info.error && info.buttons > 5 && errors.length === 0, info, errors }));
      app.quit();
    });
  }
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!win) create(); });
