let pin = sessionStorage.getItem('eightysix-pin') || '';
let invoiceLineItems = [];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Pin': pin,
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json();
}

function showPinError(message) {
  document.getElementById('pin-error').textContent = message;
}

async function tryPin(candidatePin) {
  try {
    const response = await fetch('/api/inventory-counts', { headers: { 'X-Pin': candidatePin } });
    if (!response.ok) {
      showPinError('Incorrect PIN.');
      return;
    }
    pin = candidatePin;
    sessionStorage.setItem('eightysix-pin', pin);
    document.getElementById('pin-gate').style.display = 'none';
    document.getElementById('app-content').style.display = 'block';
  } catch (err) {
    showPinError('Could not reach the app. Check you are on the same WiFi network.');
  }
}

document.getElementById('pin-submit-btn').addEventListener('click', () => {
  const value = document.getElementById('pin-input').value.trim();
  if (value.length !== 4) {
    showPinError('Enter the 4-digit PIN.');
    return;
  }
  tryPin(value);
});

if (pin) tryPin(pin);

/* ---------- Tabs ---------- */

document.querySelectorAll('.mobile-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mobile-tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.mobile-screen').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.screen).classList.add('active');
  });
});

/* ---------- Inventory count ---------- */

document.getElementById('submit-count-btn').addEventListener('click', async () => {
  const status = document.getElementById('count-status');
  const itemName = document.getElementById('count-item-name').value.trim();
  const quantity = parseFloat(document.getElementById('count-qty').value);
  const unit = document.getElementById('count-unit').value.trim() || 'case';

  if (!itemName) {
    status.textContent = 'Enter an item name.';
    status.className = 'mobile-status error';
    return;
  }

  try {
    await apiRequest('/api/inventory-counts', {
      method: 'POST',
      body: JSON.stringify({ date: todayISO(), item_name: itemName, quantity_on_hand: quantity || 0, unit_label: unit })
    });
    status.textContent = `Saved: ${itemName} = ${quantity || 0} ${unit}`;
    status.className = 'mobile-status success';
    document.getElementById('count-item-name').value = '';
    document.getElementById('count-qty').value = '0';
  } catch (err) {
    status.textContent = err.message;
    status.className = 'mobile-status error';
  }
});

/* ---------- Receive invoice ---------- */

function renderInvoiceItemsList() {
  const list = document.getElementById('invoice-items-list');
  list.innerHTML = '';

  invoiceLineItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'mobile-item-row';
    row.innerHTML = `
      <input type="text" data-index="${index}" data-field="item_name" value="${item.item_name}" placeholder="Item" />
      <input type="number" min="0" step="1" data-index="${index}" data-field="quantity" value="${item.quantity}" placeholder="Qty" />
      <input type="number" min="0" step="0.01" data-index="${index}" data-field="price" value="${item.price}" placeholder="Price" />
      <button type="button" class="icon-btn remove-invoice-item-btn" data-index="${index}">&times;</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('input').forEach((el) => {
    el.addEventListener('input', () => {
      const index = Number(el.dataset.index);
      const field = el.dataset.field;
      invoiceLineItems[index][field] = (field === 'quantity' || field === 'price') ? (parseFloat(el.value) || 0) : el.value;
    });
  });

  list.querySelectorAll('.remove-invoice-item-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      invoiceLineItems.splice(Number(btn.dataset.index), 1);
      renderInvoiceItemsList();
    });
  });
}

document.getElementById('add-invoice-item-btn').addEventListener('click', () => {
  invoiceLineItems.push({ item_name: '', quantity: 1, price: 0, cost_category: 'food' });
  renderInvoiceItemsList();
});

document.getElementById('invoice-photo-input').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const status = document.getElementById('scan-status');
  status.textContent = 'Scanning…';
  status.className = 'mobile-status';

  try {
    const imageBase64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const scanData = await apiRequest('/api/extract-invoice', {
      method: 'POST',
      body: JSON.stringify({ imageBase64 })
    });

    document.getElementById('invoice-vendor').value = scanData.guessedVendor || '';
    document.getElementById('invoice-date').value = scanData.guessedDate || todayISO();
    invoiceLineItems = scanData.guessedLineItems.length > 0
      ? scanData.guessedLineItems
      : [{ item_name: '', quantity: 1, price: 0, cost_category: 'food' }];
    renderInvoiceItemsList();

    status.textContent = 'Scanned — review before saving.';
    status.className = 'mobile-status success';
  } catch (err) {
    status.textContent = err.message;
    status.className = 'mobile-status error';
  }
});

document.getElementById('invoice-date').value = todayISO();
renderInvoiceItemsList();

document.getElementById('submit-invoice-btn').addEventListener('click', async () => {
  const status = document.getElementById('invoice-status');
  const vendorName = document.getElementById('invoice-vendor').value.trim();
  const invoiceDate = document.getElementById('invoice-date').value;
  const lineItems = invoiceLineItems.filter((item) => item.item_name.trim() !== '');

  if (!vendorName || !invoiceDate || lineItems.length === 0) {
    status.textContent = 'Vendor, date, and at least one line item are required.';
    status.className = 'mobile-status error';
    return;
  }

  try {
    await apiRequest('/api/invoices', {
      method: 'POST',
      body: JSON.stringify({ vendor_name: vendorName, invoice_date: invoiceDate, line_items: lineItems })
    });
    status.textContent = 'Invoice saved.';
    status.className = 'mobile-status success';
    document.getElementById('invoice-vendor').value = '';
    invoiceLineItems = [{ item_name: '', quantity: 1, price: 0, cost_category: 'food' }];
    renderInvoiceItemsList();
    document.getElementById('invoice-photo-input').value = '';
    document.getElementById('scan-status').textContent = '';
  } catch (err) {
    status.textContent = err.message;
    status.className = 'mobile-status error';
  }
});
