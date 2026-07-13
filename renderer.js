const CATEGORIES = [
  { key: 'food', label: 'Food', thresholdField: 'food_cost_percentage_threshold' },
  { key: 'inventory', label: 'Inventory', thresholdField: 'inventory_cost_percentage_threshold' },
  { key: 'labor', label: 'Labor', thresholdField: 'labor_cost_percentage_threshold' }
];

let invoices = [];
let thresholds = { food_cost_percentage_threshold: 0, inventory_cost_percentage_threshold: 0, labor_cost_percentage_threshold: 0 };
let dailyRevenue = [];

let modalLineItems = [];
let modalEditingId = null;

function computeCostTotals(invoiceList) {
  const totals = { food: 0, inventory: 0, labor: 0 };
  for (const invoice of invoiceList) {
    for (const item of invoice.line_items) {
      totals[item.cost_category] += item.quantity * item.price;
    }
  }
  return totals;
}

function computeTotalRevenue(revenueList) {
  return revenueList.reduce((sum, day) => sum + day.revenue, 0);
}

function formatMoney(n) {
  return '$' + n.toFixed(2);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function saveInvoices() {
  window.restaurantData.saveInvoices(invoices);
}

function saveThresholds() {
  window.restaurantData.saveBudgetThresholds(thresholds);
}

function saveRevenue() {
  window.restaurantData.saveDailyRevenue(dailyRevenue);
}

/* ---------- Summary cards ---------- */

let summaryCardsBuilt = false;
const lastStatValues = { revenue: 0, food: 0, inventory: 0, labor: 0 };

function buildSummaryCardsSkeleton() {
  const container = document.getElementById('summary-cards');
  let html = `
    <div class="stat-card">
      <div class="stat-label">Total Revenue</div>
      <div class="stat-value" id="stat-revenue">$0.00</div>
    </div>
  `;

  for (const cat of CATEGORIES) {
    html += `
      <div class="stat-card">
        <div class="stat-label">${cat.label} Cost</div>
        <div class="stat-value" id="stat-${cat.key}-pct">0.0%</div>
        <div class="stat-sub" id="stat-${cat.key}-sub">$0.00</div>
      </div>
    `;
  }

  container.innerHTML = html;
  summaryCardsBuilt = true;
}

function animateNumber(el, from, to, formatFn, duration = 600) {
  if (Math.abs(to - from) < 0.005) {
    el.textContent = formatFn(to);
    return;
  }
  el.classList.remove('stat-pulse');
  void el.offsetWidth; // restart the pulse animation even if already running
  el.classList.add('stat-pulse');

  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatFn(from + (to - from) * eased);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.textContent = formatFn(to);
      setTimeout(() => el.classList.remove('stat-pulse'), 250);
    }
  }
  requestAnimationFrame(tick);
}

function renderSummaryCards() {
  if (!summaryCardsBuilt) buildSummaryCardsSkeleton();

  const totals = computeCostTotals(invoices);
  const totalRevenue = computeTotalRevenue(dailyRevenue);

  animateNumber(document.getElementById('stat-revenue'), lastStatValues.revenue, totalRevenue, formatMoney);
  lastStatValues.revenue = totalRevenue;

  for (const cat of CATEGORIES) {
    const actualPct = totalRevenue > 0 ? (totals[cat.key] / totalRevenue) * 100 : 0;
    const threshold = thresholds[cat.thresholdField];
    const isOver = actualPct > threshold;

    const pctEl = document.getElementById(`stat-${cat.key}-pct`);
    animateNumber(pctEl, lastStatValues[cat.key], actualPct, (n) => n.toFixed(1) + '%');
    lastStatValues[cat.key] = actualPct;

    const subEl = document.getElementById(`stat-${cat.key}-sub`);
    subEl.className = `stat-sub ${isOver ? 'over' : 'under'}`;
    subEl.textContent = `${formatMoney(totals[cat.key])} · ${isOver ? 'Over' : 'Under'} ${threshold.toFixed(1)}%`;
  }
}

/* ---------- Budget thresholds ---------- */

function renderThresholdsTable() {
  const tbody = document.querySelector('#thresholds-table tbody');
  tbody.innerHTML = '';

  for (const cat of CATEGORIES) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cat.label}</td>
      <td><input type="number" step="0.1" min="0" value="${thresholds[cat.thresholdField]}" data-field="${cat.thresholdField}" /></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => {
      const value = parseFloat(input.value);
      thresholds[input.dataset.field] = isNaN(value) ? 0 : value;
      saveThresholds();
      renderSummaryCards();
    });
  });
}

/* ---------- Daily revenue ---------- */

function renderRevenueTable() {
  const tbody = document.querySelector('#revenue-table tbody');
  tbody.innerHTML = '';

  if (dailyRevenue.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No revenue entries yet.</td></tr>';
    return;
  }

  dailyRevenue.forEach((day, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="date" value="${day.date}" data-index="${index}" data-field="date" /></td>
      <td><input type="number" step="0.01" min="0" value="${day.revenue}" data-index="${index}" data-field="revenue" /></td>
      <td><button class="icon-btn delete-revenue-btn" data-index="${index}" title="Delete">&times;</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => {
      const index = Number(input.dataset.index);
      const field = input.dataset.field;
      dailyRevenue[index][field] = field === 'revenue' ? (parseFloat(input.value) || 0) : input.value;
      saveRevenue();
      renderSummaryCards();
    });
  });

  tbody.querySelectorAll('.delete-revenue-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      dailyRevenue.splice(Number(btn.dataset.index), 1);
      saveRevenue();
      renderRevenueTable();
      renderSummaryCards();
    });
  });
}

document.getElementById('add-revenue-btn').addEventListener('click', () => {
  dailyRevenue.push({ date: todayISO(), revenue: 0 });
  saveRevenue();
  renderRevenueTable();
  renderSummaryCards();
});

/* ---------- Invoices table ---------- */

function renderInvoicesTable() {
  const tbody = document.querySelector('#invoices-table tbody');
  tbody.innerHTML = '';

  if (invoices.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No invoices yet.</td></tr>';
    return;
  }

  for (const invoice of invoices) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${invoice.vendor_name}</td>
      <td>${invoice.invoice_date}</td>
      <td>${formatMoney(invoice.total_cost)}</td>
      <td>
        <button class="icon-btn edit-invoice-btn" data-id="${invoice.invoice_id}" title="Edit">&#9998;</button>
        <button class="icon-btn delete-invoice-btn" data-id="${invoice.invoice_id}" title="Delete">&times;</button>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('.edit-invoice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const invoice = invoices.find((i) => i.invoice_id === Number(btn.dataset.id));
      openInvoiceModal(invoice);
    });
  });

  tbody.querySelectorAll('.delete-invoice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      invoices = invoices.filter((i) => i.invoice_id !== Number(btn.dataset.id));
      saveInvoices();
      renderInvoicesTable();
      renderSummaryCards();
    });
  });
}

document.getElementById('add-invoice-btn').addEventListener('click', () => openInvoiceModal(null));

/* ---------- Invoice modal ---------- */

const modalOverlay = document.getElementById('invoice-modal');
const invoiceForm = document.getElementById('invoice-form');

function openInvoiceModal(invoice) {
  modalEditingId = invoice ? invoice.invoice_id : null;
  document.getElementById('invoice-modal-title').textContent = invoice ? 'Edit Invoice' : 'Add Invoice';
  document.getElementById('invoice-vendor').value = invoice ? invoice.vendor_name : '';
  document.getElementById('invoice-date').value = invoice ? invoice.invoice_date : todayISO();
  modalLineItems = invoice
    ? invoice.line_items.map((item) => ({ ...item }))
    : [{ item_name: '', cost_category: 'food', quantity: 1, price: 0 }];
  renderLineItemsList();
  modalOverlay.classList.add('open');
}

function closeInvoiceModal() {
  modalOverlay.classList.remove('open');
}

function computeModalTotal() {
  return modalLineItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
}

function renderLineItemsList() {
  const list = document.getElementById('line-items-list');
  list.innerHTML = '';

  modalLineItems.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'line-item-row';
    row.innerHTML = `
      <label>Item
        <input type="text" data-index="${index}" data-field="item_name" value="${item.item_name}" placeholder="Item name" />
      </label>
      <label>Category
        <select data-index="${index}" data-field="cost_category">
          <option value="food" ${item.cost_category === 'food' ? 'selected' : ''}>Food</option>
          <option value="inventory" ${item.cost_category === 'inventory' ? 'selected' : ''}>Inventory</option>
          <option value="labor" ${item.cost_category === 'labor' ? 'selected' : ''}>Labor</option>
        </select>
      </label>
      <label>Qty
        <input type="number" min="0" step="1" data-index="${index}" data-field="quantity" value="${item.quantity}" />
      </label>
      <label>Price
        <input type="number" min="0" step="0.01" data-index="${index}" data-field="price" value="${item.price}" />
      </label>
      <button type="button" class="icon-btn remove-line-item-btn" data-index="${index}" title="Remove">&times;</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('input', () => {
      const index = Number(el.dataset.index);
      const field = el.dataset.field;
      const item = modalLineItems[index];
      if (field === 'quantity' || field === 'price') {
        item[field] = parseFloat(el.value) || 0;
      } else {
        item[field] = el.value;
      }
      document.getElementById('invoice-modal-total').textContent = formatMoney(computeModalTotal());
    });
  });

  list.querySelectorAll('.remove-line-item-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      modalLineItems.splice(Number(btn.dataset.index), 1);
      renderLineItemsList();
      document.getElementById('invoice-modal-total').textContent = formatMoney(computeModalTotal());
    });
  });

  document.getElementById('invoice-modal-total').textContent = formatMoney(computeModalTotal());
}

document.getElementById('add-line-item-btn').addEventListener('click', () => {
  modalLineItems.push({ item_name: '', cost_category: 'food', quantity: 1, price: 0 });
  renderLineItemsList();
});

document.getElementById('close-modal-btn').addEventListener('click', closeInvoiceModal);
document.getElementById('cancel-invoice-btn').addEventListener('click', closeInvoiceModal);

invoiceForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const vendorName = document.getElementById('invoice-vendor').value.trim();
  const invoiceDate = document.getElementById('invoice-date').value;
  const lineItems = modalLineItems.filter((item) => item.item_name.trim() !== '');

  if (!vendorName || !invoiceDate || lineItems.length === 0) {
    return;
  }

  const totalCost = lineItems.reduce((sum, item) => sum + item.quantity * item.price, 0);

  if (modalEditingId !== null) {
    const invoice = invoices.find((i) => i.invoice_id === modalEditingId);
    invoice.vendor_name = vendorName;
    invoice.invoice_date = invoiceDate;
    invoice.line_items = lineItems;
    invoice.total_cost = totalCost;
  } else {
    const nextId = invoices.reduce((max, i) => Math.max(max, i.invoice_id), 0) + 1;
    invoices.push({
      invoice_id: nextId,
      vendor_name: vendorName,
      invoice_date: invoiceDate,
      total_cost: totalCost,
      line_items: lineItems
    });
  }

  saveInvoices();
  renderInvoicesTable();
  renderSummaryCards();
  closeInvoiceModal();
});

/* ---------- Initial render ---------- */

async function init() {
  [invoices, thresholds, dailyRevenue] = await Promise.all([
    window.restaurantData.getInvoices(),
    window.restaurantData.getBudgetThresholds(),
    window.restaurantData.getDailyRevenue()
  ]);
  renderSummaryCards();
  renderThresholdsTable();
  renderRevenueTable();
  renderInvoicesTable();
}

init();
