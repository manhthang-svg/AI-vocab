const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('milim', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  exportData: (data) => ipcRenderer.invoke('data:export', data),
  importData: () => ipcRenderer.invoke('data:import'),
  pickWritingImage: () => ipcRenderer.invoke('writing:pick-image'),
  readWritingClipboardImage: () => ipcRenderer.invoke('writing:clipboard-image'),
  normalizeWritingImage: (dataUrl) => ipcRenderer.invoke('writing:normalize-image', dataUrl),
  captureWritingScreen: () => ipcRenderer.invoke('writing:capture-screen'),
  notify: (payload) => ipcRenderer.invoke('app:notify', payload),
  geminiStatus: () => ipcRenderer.invoke('gemini:status'),
  saveGeminiKey: (key) => ipcRenderer.invoke('gemini:save-key', key),
  checkGeminiAnswer: (payload) => ipcRenderer.invoke('gemini:check-answer', payload),
  generateRecallChallenge: (payload) => ipcRenderer.invoke('gemini:generate-challenge', payload),
  aiStatus: () => ipcRenderer.invoke('ai:status'),
  downloadLocalAI: () => ipcRenderer.invoke('ai:download-local'),
  pauseLocalAIDownload: () => ipcRenderer.invoke('ai:pause-download'),
  deleteLocalAI: () => ipcRenderer.invoke('ai:delete-local'),
  stopLocalAI: () => ipcRenderer.invoke('ai:stop-local'),
  testLocalAI: () => ipcRenderer.invoke('ai:test-local'),
  checkAIAnswer: (payload) => ipcRenderer.invoke('ai:check-answer', payload),
  generateAIChallenge: (payload) => ipcRenderer.invoke('ai:generate-challenge', payload),
  enrichScriptTerms: (payload) => ipcRenderer.invoke('ai:enrich-script-terms', payload),
  onAIStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('ai:status-changed', listener);
    return () => ipcRenderer.removeListener('ai:status-changed', listener);
  },
  updateStatus: () => ipcRenderer.invoke('update:status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close')
});
