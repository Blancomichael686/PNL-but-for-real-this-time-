const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { createWorker } = require('tesseract.js');
const { extractInvoiceData } = require('./invoice-ocr');
const { startMobileServer, getLanAddress } = require('./server');

const DATA_FILES = [
  'invoices.json',
  'budget_thresholds.json',
  'daily_revenue.json',
  'recipes.json',
  'pos_sales.json',
  'inventory_counts.json',
  'labor_shifts.json',
  'order_guides.json',
  'purchase_orders.json'
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

// Used for writes that originate outside the desktop window (the mobile server).
// Deliberately skips pendingSelfWrites: the desktop's in-memory state doesn't have
// this change yet, so it needs the normal fs.watch -> data-changed notification to
// refetch and actually show what was just added from a phone.
function writeJSONFromExternal(filename, data) {
  const filePath = path.join(__dirname, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

ipcMain.handle('get-invoices', () => readJSON('invoices.json'));
ipcMain.handle('get-budget-thresholds', () => readJSON('budget_thresholds.json'));
ipcMain.handle('get-daily-revenue', () => readJSON('daily_revenue.json'));
ipcMain.handle('get-recipes', () => readJSON('recipes.json'));
ipcMain.handle('get-pos-sales', () => readJSON('pos_sales.json'));
ipcMain.handle('get-inventory-counts', () => readJSON('inventory_counts.json'));
ipcMain.handle('get-labor-shifts', () => readJSON('labor_shifts.json'));
ipcMain.handle('get-order-guides', () => readJSON('order_guides.json'));
ipcMain.handle('get-purchase-orders', () => readJSON('purchase_orders.json'));

ipcMain.handle('save-invoices', (event, data) => writeJSON('invoices.json', data));
ipcMain.handle('save-budget-thresholds', (event, data) => writeJSON('budget_thresholds.json', data));
ipcMain.handle('save-daily-revenue', (event, data) => writeJSON('daily_revenue.json', data));
ipcMain.handle('save-recipes', (event, data) => writeJSON('recipes.json', data));
ipcMain.handle('save-pos-sales', (event, data) => writeJSON('pos_sales.json', data));
ipcMain.handle('save-inventory-counts', (event, data) => writeJSON('inventory_counts.json', data));
ipcMain.handle('save-labor-shifts', (event, data) => writeJSON('labor_shifts.json', data));
ipcMain.handle('save-order-guides', (event, data) => writeJSON('order_guides.json', data));
ipcMain.handle('save-purchase-orders', (event, data) => writeJSON('purchase_orders.json', data));

ipcMain.handle('select-invoice-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Invoice Photo',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
    properties: ['openFile']
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

let ocrWorker = null;

async function getOcrWorker() {
  if (!ocrWorker) {
    // langPath points at the locally bundled eng.traineddata.gz (ocr-data/) so this
    // never fetches from the jsdelivr CDN tesseract.js otherwise defaults to.
    ocrWorker = await createWorker('eng', undefined, {
      langPath: path.join(__dirname, 'ocr-data'),
      cachePath: path.join(__dirname, 'ocr-data'),
      gzip: true
    });
  }
  return ocrWorker;
}

ipcMain.handle('extract-invoice-image', async (event, filePath) => {
  const worker = await getOcrWorker();
  const { data: { text } } = await worker.recognize(filePath);
  return extractInvoiceData(text);
});

async function extractInvoiceFromImageBuffer(buffer) {
  const worker = await getOcrWorker();
  const { data: { text } } = await worker.recognize(buffer);
  return extractInvoiceData(text);
}

let mobileServer = null;
let mobilePin = null;
const MOBILE_PORT = 8787;

function mobileAccessStatus() {
  if (!mobileServer) return { enabled: false };
  return { enabled: true, url: `http://${getLanAddress()}:${MOBILE_PORT}`, pin: mobilePin };
}

ipcMain.handle('get-mobile-access-status', () => mobileAccessStatus());

ipcMain.handle('enable-mobile-access', () => {
  if (!mobileServer) {
    mobilePin = String(Math.floor(1000 + Math.random() * 9000));
    mobileServer = startMobileServer({
      port: MOBILE_PORT,
      pin: mobilePin,
      readJSON,
      writeJSON: writeJSONFromExternal,
      extractInvoiceFromImageBuffer,
      staticDir: __dirname
    });
  }
  return mobileAccessStatus();
});

ipcMain.handle('disable-mobile-access', () => {
  if (mobileServer) {
    mobileServer.close();
    mobileServer = null;
    mobilePin = null;
  }
  return mobileAccessStatus();
});

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
