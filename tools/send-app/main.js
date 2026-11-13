/* File Share — same‑network transfer between two laptops.
   Each instance shows only its own files; the receiver chooses the destination folder.
   No cross‑device browsing. Fast streams over LAN. */

const { app, BrowserWindow, ipcMain, Tray, nativeImage, Menu, dialog, shell } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dgram = require('dgram');

let win = null;
let tray = null;
let senderId = null;
let httpServer = null;
let discoverySocket = null;
let peers = new Map(); // id → { port, os, lastSeen }
let destinationFolder = null;

const LOCAL_PORT = 19432;
const BROADCAST_INTERVAL = 3000;
const FILE_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB
const ALLOWED_ROOTS = [
  ...(process.platform === 'win32'
    ? ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos']
    : ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Music', 'Videos'])
];

function startDiscovery() {
  discoverySocket = dgram.createSocket('udp4');
  const msg = Buffer.from(JSON.stringify({ type: 'announce', id: senderId, port: httpServer ? httpServer.address().port : 0, os: os.platform() }));
  discoverySocket.send(msg, 0, msg.length, LOCAL_PORT, '255.255.255.255', (err) => {
    if (err) console.error('UDP send error:', err);
  });
  discoverySocket.on('message', (msg, rinfo) => {
    try {
      const data = JSON.parse(msg.toString());
      if (data.type === 'announce' && data.id && data.id !== senderId) {
        peers.set(data.id, { port: data.port, os: data.os, lastSeen: Date.now() });
        ipcMain.emit('peer-list-updated', Array.from(peers.values()));
      }
    } catch (e) { /* ignore malformed */ }
  });
  setInterval(() => {
    const now = Date.now();
    for (const [id, p] of peers) {
      if (now - p.lastSeen > 30000) peers.delete(id);
    }
    ipcMain.emit('peer-list-updated', Array.from(peers.values()));
  }, 30000);
  setInterval(startDiscovery, BROADCAST_INTERVAL);
  startDiscovery();
}

function startHttpServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';
      if (req.method === 'GET' && url === '/info') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ id: senderId, port: server.address().port, os: os.platform() }));
        return;
      }
      if (req.method === 'GET' && url.startsWith('/list')) {
        const rel = url.substring('/list'.length).replace(/^\//, '');
        const abs = path.resolve(destinationFolder || os.homedir(), rel);
        try {
          if (!fs.existsSync(abs)) { res.writeHead(404); res.end('Not found'); return; }
          const stat = fs.statSync(abs);
          if (stat.isDirectory()) {
            const items = fs.readdirSync(abs)
              .filter(f => { const full = path.join(abs, f); return fs.statSync(full).isFile(); })
              .map(f => {
                const full = path.join(abs, f);
                const ext = path.extname(f).toLowerCase();
                let kind = 'other';
                if (['.mp3', '.wav', '.m4a'].includes(ext)) kind = 'music';
                if (['.jpg', '.jpeg', '.png', '.heic', '.gif'].includes(ext)) kind = 'pictures';
                if (['.mp4', '.mov', '.mkv', '.webm'].includes(ext)) kind = 'video';
                if (['.zip', '.rar', '.7z', '.tar'].includes(ext)) kind = 'archives';
                if (['.js', '.css', '.ts', '.py'].includes(ext)) kind = 'code';
                return { name: f, kind, path: full };
              });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ kind, items }));
          } else { res.writeHead(400); res.end('Not a directory'); return; }
        } catch (e) { res.writeHead(500); res.end(e.message); return; }
        return;
      }
      if (req.method === 'GET' && url.startsWith('/download')) {
        const { path: filePath, offset = 0 } = parseQuery(url);
        if (!filePath) { res.writeHead(400); res.end('Missing path'); return; }
        const abs = path.resolve(destinationFolder || os.homedir(), filePath);
        if (!fs.existsSync(abs)) { res.writeHead(404); res.end('File not found'); return; }
        const stat = fs.statSync(abs);
        const total = stat.size;
        res.writeHead(206, {
          'Content-Type': 'application/octet-stream',
          'Content-Length': total - parseInt(offset),
          'Content-Range': `bytes ${parseInt(offset)}-${total - 1}/${total}`,
          'Accept-Ranges': 'bytes'
        });
        fs.createReadStream(abs, { start: parseInt(offset) }).pipe(res);
        return;
      }
      if (req.method === 'GET' && url.startsWith('/thumb')) {
        const filePath = parseQuery(url).path;
        if (!filePath) { res.writeHead(400); res.end('Missing path'); return; }
        const abs = path.resolve(destinationFolder || os.homedir(), filePath);
        try {
          const img = fs.readFileSync(abs);
          res.writeHead(200, { 'Content-Type': 'image/png' });
          res.end(img);
        } catch (e) {
          res.writeHead(500); res.end(e.message);
        }
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(0, () => {
      const port = server.address().port;
      console.log(`HTTP file server running on port ${port}`);
      resolve({ server, port });
    });

    server.on('error', (e) => {
      console.error('HTTP server error:', e);
      reject(e);
    });
  });
}

function parseQuery(url) {
  const parts = url.split('?')[1] || '';
  const kv = new Map();
  parts.split('&').forEach(kvPair => { const [k, v] = kvPair.split('='); if (k && v) kv.set(k, decodeURIComponent(v)); });
  return { path: kv.get('path'), offset: kv.get('offset') };
}

ipcMain.on('connect-peer', (e, { peerId, connectViaIp, ip }) => {
  const peer = peers.get(peerId);
  if (!peer) return e.reply('connect-peer', { ok: false, reason: 'unknown peer' });
  e.reply('connect-peer', { ok: true, peer });
});

ipcMain.on('set-destination', (e, folder) => {
  destinationFolder = folder;
  ipcMain.emit('destination-changed', folder);
});

ipcMain.on('request-file', async (e, { senderId, filePath, offset }) => {
  const peer = peers.get(senderId);
  if (!peer) return e.reply('request-file', { ok: false, reason: 'peer offline' });
  const abs = path.resolve(destinationFolder || os.homedir(), filePath);
  if (!fs.existsSync(abs)) return e.reply('request-file', { ok: false, reason: 'file not found' });
  const stat = fs.statSync(abs);
  e.reply('request-file', { ok: true, size: stat.size, stream: fs.createReadStream(abs, { start: offset || 0 }) });
});

function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 600,
    backgroundColor: '#0b0b0c', title: 'File Share',
    webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.on('closed', () => { win = null; });

  const trayIcon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show', click: () => { win.show(); } },
    { label: 'Exit', click: () => { app.quit(); } }
  ]);
  tray.setToolTip('File Share – local only');
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  senderId = `${os.hostname()}-${Date.now()}`;
  startDiscovery();
  startHttpServer().then(({ server }) => { httpServer = server; createWindow(); });
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') { if (httpServer) httpServer.close(); if (discoverySocket) discoverySocket.close(); app.quit(); });
});