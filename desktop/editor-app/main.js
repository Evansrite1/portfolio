/* Video Editor desktop app. A window around the live editor, so every improvement reaches the app as soon as the
   website is updated. The video work happens on this computer; nothing is uploaded. */
const { app, BrowserWindow, Menu, session, shell } = require('electron');
const path = require('path');

const SITE = (process.env.EDITOR_URL || 'https://evansademilua.vercel.app').replace(/\/$/, '');
const START = SITE + '/tools/video-editor/app/?desktop=1';
let win = null;

function create() {
  win = new BrowserWindow({
    width: 1500, height: 940, minWidth: 1100, minHeight: 640, backgroundColor: '#0b0b0c', title: 'Video Editor',
    autoHideMenuBar: true, webPreferences: { contextIsolation: true, sandbox: true }
  });
  win.maximize();
  win.loadURL(START).catch(() => { /* did-fail-load shows the offline page */ });
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, 'offline.html'));
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(SITE) && !url.startsWith('file:')) { e.preventDefault(); shell.openExternal(url); }
  });
  win.on('closed', () => { win = null; });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(['media', 'fullscreen', 'clipboard-sanitized-write'].includes(permission)));
  if (process.platform === 'darwin') {
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }]));
  } else {
    Menu.setApplicationMenu(null);
  }
  create();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) create(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
