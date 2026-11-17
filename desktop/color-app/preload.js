'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cp', {
  state: () => ipcRenderer.invoke('state'),
  pick: () => ipcRenderer.invoke('pick'),
  copy: (t) => ipcRenderer.invoke('copy', t),
  remove: (hex) => ipcRenderer.invoke('remove', hex),
  clear: () => ipcRenderer.invoke('clear'),
  autoCopy: (on) => ipcRenderer.invoke('autocopy', on),
  onState: (fn) => ipcRenderer.on('state', (_e, s) => fn(s)),
  onPicked: (fn) => ipcRenderer.on('picked', (_e, h) => fn(h)),
  onNotice: (fn) => ipcRenderer.on('notice', (_e, t) => fn(t)),
  // the picking overlay
  onShot: (fn) => ipcRenderer.on('shot', (_e, s) => fn(s)),
  picked: (c) => ipcRenderer.send('overlay:pick', c),
  cancel: () => ipcRenderer.send('overlay:cancel'),
});
