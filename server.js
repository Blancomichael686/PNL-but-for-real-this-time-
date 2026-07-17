const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

function serveFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, contents) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(contents);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) req.destroy();
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleApi(req, res, url, deps) {
  const { readJSON, writeJSON, extractInvoiceFromImageBuffer } = deps;
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && url.pathname === '/api/inventory-counts') {
    res.writeHead(200);
    res.end(JSON.stringify(readJSON('inventory_counts.json')));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/inventory-counts') {
    const body = JSON.parse(await readRequestBody(req));
    const counts = readJSON('inventory_counts.json');
    const nextId = counts.reduce((max, c) => Math.max(max, c.count_id), 0) + 1;
    const entry = {
      count_id: nextId,
      date: body.date || new Date().toISOString().slice(0, 10),
      item_name: body.item_name || '',
      quantity_on_hand: Number(body.quantity_on_hand) || 0,
      unit_label: body.unit_label || 'case'
    };
    counts.push(entry);
    writeJSON('inventory_counts.json', counts);
    res.writeHead(201);
    res.end(JSON.stringify(entry));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/invoices') {
    res.writeHead(200);
    res.end(JSON.stringify(readJSON('invoices.json')));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/invoices') {
    const body = JSON.parse(await readRequestBody(req));
    const invoices = readJSON('invoices.json');
    const nextId = invoices.reduce((max, i) => Math.max(max, i.invoice_id), 0) + 1;
    const lineItems = Array.isArray(body.line_items) ? body.line_items : [];
    const totalCost = lineItems.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.price) || 0), 0);
    const invoice = {
      invoice_id: nextId,
      vendor_name: body.vendor_name || '',
      invoice_date: body.invoice_date || new Date().toISOString().slice(0, 10),
      total_cost: totalCost,
      line_items: lineItems.map((item) => ({
        item_name: item.item_name || '',
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
        cost_category: item.cost_category || 'food'
      }))
    };
    invoices.push(invoice);
    writeJSON('invoices.json', invoices);
    res.writeHead(201);
    res.end(JSON.stringify(invoice));
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/extract-invoice') {
    const body = JSON.parse(await readRequestBody(req));
    if (!body.imageBase64) {
      res.writeHead(400);
      res.end(JSON.stringify({ error: 'Missing imageBase64' }));
      return;
    }
    const buffer = Buffer.from(body.imageBase64, 'base64');
    const scanData = await extractInvoiceFromImageBuffer(buffer);
    res.writeHead(200);
    res.end(JSON.stringify(scanData));
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
}

function startMobileServer({ port, pin, readJSON, writeJSON, extractInvoiceFromImageBuffer, staticDir }) {
  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch (err) {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/mobile.html')) {
      serveFile(res, path.join(staticDir, 'mobile.html'), 'text/html');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/mobile.js') {
      serveFile(res, path.join(staticDir, 'mobile.js'), 'application/javascript');
      return;
    }
    if (req.method === 'GET' && url.pathname === '/styles.css') {
      serveFile(res, path.join(staticDir, 'styles.css'), 'text/css');
      return;
    }

    if (url.pathname.startsWith('/api/')) {
      if (req.headers['x-pin'] !== pin) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid PIN' }));
        return;
      }
      handleApi(req, res, url, { readJSON, writeJSON, extractInvoiceFromImageBuffer }).catch((err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String((err && err.message) || err) }));
      });
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  });

  server.listen(port, '0.0.0.0');
  return server;
}

module.exports = { startMobileServer, getLanAddress };
