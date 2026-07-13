const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

const DATA_FILES = [
  'invoices.json',
  'budget_thresholds.json',
  'daily_revenue.json',
  'recipes.json',
  'pos_sales.json',
  'inventory_counts.json',
  'labor_shifts.json'
];

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile('index.html');
}

function readJSON(filename) {
  const filePath = path.join(__dirname, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

const pendingSelfWrites = new Set();

function writeJSON(filename, data) {
  const filePath = path.join(__dirname, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  pendingSelfWrites.add(filename);
}

ipcMain.handle('get-invoices', () => readJSON('invoices.json'));
ipcMain.handle('get-budget-thresholds', () => readJSON('budget_thresholds.json'));
ipcMain.handle('get-daily-revenue', () => readJSON('daily_revenue.json'));
ipcMain.handle('get-recipes', () => readJSON('recipes.json'));
ipcMain.handle('get-pos-sales', () => readJSON('pos_sales.json'));
ipcMain.handle('get-inventory-counts', () => readJSON('inventory_counts.json'));
ipcMain.handle('get-labor-shifts', () => readJSON('labor_shifts.json'));

ipcMain.handle('save-invoices', (event, data) => writeJSON('invoices.json', data));
ipcMain.handle('save-budget-thresholds', (event, data) => writeJSON('budget_thresholds.json', data));
ipcMain.handle('save-daily-revenue', (event, data) => writeJSON('daily_revenue.json', data));
ipcMain.handle('save-recipes', (event, data) => writeJSON('recipes.json', data));
ipcMain.handle('save-pos-sales', (event, data) => writeJSON('pos_sales.json', data));
ipcMain.handle('save-inventory-counts', (event, data) => writeJSON('inventory_counts.json', data));
ipcMain.handle('save-labor-shifts', (event, data) => writeJSON('labor_shifts.json', data));

let watchDebounceTimer = null;

function notifyDataChanged() {
  clearTimeout(watchDebounceTimer);
  watchDebounceTimer = setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('data-changed');
    }
  }, 300);
}

function watchDataFiles() {
  for (const filename of DATA_FILES) {
    fs.watch(path.join(__dirname, filename), () => {
      if (pendingSelfWrites.delete(filename)) {
        return;
      }
      notifyDataChanged();
    });
  }
}

app.whenReady().then(() => {
  createWindow();
  watchDataFiles();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
