const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restaurantData', {
  getInvoices: () => ipcRenderer.invoke('get-invoices'),
  getBudgetThresholds: () => ipcRenderer.invoke('get-budget-thresholds'),
  getDailyRevenue: () => ipcRenderer.invoke('get-daily-revenue'),
  saveInvoices: (data) => ipcRenderer.invoke('save-invoices', data),
  saveBudgetThresholds: (data) => ipcRenderer.invoke('save-budget-thresholds', data),
  saveDailyRevenue: (data) => ipcRenderer.invoke('save-daily-revenue', data)
});
