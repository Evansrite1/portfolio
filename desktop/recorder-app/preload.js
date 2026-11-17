'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sr', {
  sources: () => ipcRenderer.invoke('sources'),
  perm: () => ipcRenderer.invoke('perm'),
  askMic: () => ipcRenderer.invoke('ask-mic'),
  start: (o) => ipcRenderer.invoke('rec:start', o),
  chunk: (buf) => ipcRenderer.send('rec:chunk', buf),
  stop: () => ipcRenderer.invoke('rec:stop'),
  tick: (t) => ipcRenderer.send('rec:tick', t),
  show: (p) => ipcRenderer.invoke('show', p),
  open: (p) => ipcRenderer.invoke('open', p),
  folder: () => ipcRenderer.invoke('folder'),
  onCmd: (fn) => ipcRenderer.on('cmd', (_e, c) => fn(c)),
  // the small control bar
  ctl: (cmd) => ipcRenderer.send('ctl', cmd),
  onTick: (fn) => ipcRenderer.on('tick', (_e, t) => fn(t)),
  // build checks
  e2eResult: (r) => ipcRenderer.invoke('e2e-result', r),
  e2eSize: (p) => ipcRenderer.invoke('e2e-size', p),
});
