const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('MavPadDesktop', {
  saveTextFile: (name, text) => ipcRenderer.invoke('save-text-file', name, text)
});
