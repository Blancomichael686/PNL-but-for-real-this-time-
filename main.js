const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 750,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile('index.html');
}

function readJSON(filename) {
  const filePath = path.join(__dirname, filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJSON(filename, data) {
  const filePath = path.join(__dirname, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

ipcMain.handle('get-invoices', () => readJSON('invoices.json'));
ipcMain.handle('get-budget-thresholds', () => readJSON('budget_thresholds.json'));
ipcMain.handle('get-daily-revenue', () => readJSON('daily_revenue.json'));

ipcMain.handle('save-invoices', (event, data) => writeJSON('invoices.json', data));
ipcMain.handle('save-budget-thresholds', (event, data) => writeJSON('budget_thresholds.json', data));
ipcMain.handle('save-daily-revenue', (event, data) => writeJSON('daily_revenue.json', data));

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
