const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restaurantData', {
  getInvoices: () => ipcRenderer.invoke('get-invoices'),
  getBudgetThresholds: () => ipcRenderer.invoke('get-budget-thresholds'),
  getDailyRevenue: () => ipcRenderer.invoke('get-daily-revenue'),
  getRecipes: () => ipcRenderer.invoke('get-recipes'),
  getPosSales: () => ipcRenderer.invoke('get-pos-sales'),
  getInventoryCounts: () => ipcRenderer.invoke('get-inventory-counts'),
  getLaborShifts: () => ipcRenderer.invoke('get-labor-shifts'),
  saveInvoices: (data) => ipcRenderer.invoke('save-invoices', data),
  saveBudgetThresholds: (data) => ipcRenderer.invoke('save-budget-thresholds', data),
  saveDailyRevenue: (data) => ipcRenderer.invoke('save-daily-revenue', data),
  saveRecipes: (data) => ipcRenderer.invoke('save-recipes', data),
  savePosSales: (data) => ipcRenderer.invoke('save-pos-sales', data),
  saveInventoryCounts: (data) => ipcRenderer.invoke('save-inventory-counts', data),
  saveLaborShifts: (data) => ipcRenderer.invoke('save-labor-shifts', data),
  onDataChanged: (callback) => ipcRenderer.on('data-changed', () => callback())
});
