const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electron, {
  connectToPeer: (peerId, ip) => ipcRenderer.send('connect-peer', { peerId, connectViaIp: !!ip, ip }),
  setDestinationFolder: (folder) => ipcRenderer.send('set-destination', folder),
  requestFile: (senderId, filePath, offset) => ipcRenderer.send('request-file', { senderId, filePath, offset })
});