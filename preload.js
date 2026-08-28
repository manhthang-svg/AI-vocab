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
  emailReminderStatus: () => ipcRenderer.invoke('reminder:status'),
  configureEmailReminder: (payload) => ipcRenderer.invoke('reminder:configure', payload),
  signalEmailReminderActivity: (payload) => ipcRenderer.invoke('reminder:activity', payload),
  testEmailReminder: () => ipcRenderer.invoke('reminder:test'),
  copyEmailReminderScript: () => ipcRenderer.invoke('reminder:copy-script'),
  openEmailReminderScript: () => ipcRenderer.invoke('reminder:open-script'),
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
