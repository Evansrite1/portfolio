'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const call = (ch, arg) => ipcRenderer.invoke(ch, arg);
const on = (ch, cb) => {
  const f = (_e, data) => cb(data);
  ipcRenderer.on(ch, f);
  return () => ipcRenderer.removeListener(ch, f);
};

contextBridge.exposeInMainWorld('api', {
  info: () => call('app:info'),
  pick: (kind) => call('files:pick', kind),
  add: (paths) => call('files:add', paths),
  pathsFor: (files) => Array.from(files || []).map((f) => { try { return webUtils.getPathForFile(f); } catch (e) { return ''; } }).filter(Boolean),
  remove: (id) => call('files:remove', id),
  clear: () => call('files:clear'),
  startShare: () => call('share:start'),
  stopShare: () => call('share:stop'),
  chooseDest: () => call('recv:dest'),
  connect: (a) => call('recv:connect', a),
  download: () => call('recv:download'),
  cancel: () => call('recv:cancel'),
  openDest: () => call('shell:open-dest'),
  reveal: (p) => call('shell:reveal', p),
  copy: (t) => call('clip:copy', t),
  netCheck: () => call('net:check'),
  netFix: (id) => call('net:fix', id),
  on
});
