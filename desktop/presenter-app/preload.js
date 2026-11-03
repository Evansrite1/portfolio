'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('presenter:info');
let displays = info.displays, tvOpen = info.tvOpen;
const subs = { displays: [], update: [] };

ipcRenderer.on('presenter:displays', (_e, d) => {
  displays = d.displays; tvOpen = d.tvOpen;
  subs.displays.forEach((f) => { try { f(d); } catch (e) { /* page handler failed */ } });
});
ipcRenderer.on('presenter:update', (_e, u) => {
  subs.update.forEach((f) => { try { f(u); } catch (e) { /* page handler failed */ } });
});

contextBridge.exposeInMainWorld('presenterDesktop', {
  isDesktop: true,
  platform: info.platform,
  version: info.version,
  get displays() { return displays; },
  get tvOpen() { return tvOpen; },
  showTV: () => ipcRenderer.invoke('presenter:show-tv'),
  onDisplays: (f) => { subs.displays.push(f); },
  onUpdate: (f) => { subs.update.push(f); },
  retry: () => ipcRenderer.invoke('presenter:retry')
});
