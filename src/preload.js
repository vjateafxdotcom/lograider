const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lograider', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Authentication
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  logout: () => ipcRenderer.invoke('logout'),
  verifySession: () => ipcRenderer.invoke('verify-session'),

  // Logs
  getLogs: (filters) => ipcRenderer.invoke('get-logs', filters),
  addLog: (logEntry) => ipcRenderer.invoke('add-log', logEntry),
  deleteLog: (id) => ipcRenderer.invoke('delete-log', id),
  clearLogs: () => ipcRenderer.invoke('clear-logs'),
  getStats: () => ipcRenderer.invoke('get-stats'),
  exportLogs: (format) => ipcRenderer.invoke('export-logs', format),

  // External
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
});
