const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('milim', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  exportData: (data) => ipcRenderer.invoke('data:export', data),
  importData: () => ipcRenderer.invoke('data:import'),
  notify: (payload) => ipcRenderer.invoke('app:notify', payload),
  geminiStatus: () => ipcRenderer.invoke('gemini:status'),
  saveGeminiKey: (key) => ipcRenderer.invoke('gemini:save-key', key),
  checkGeminiAnswer: (payload) => ipcRenderer.invoke('gemini:check-answer', payload),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close')
});
