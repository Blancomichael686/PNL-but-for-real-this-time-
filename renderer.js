const CATEGORIES = [
  { key: 'food', label: 'Food' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'labor', label: 'Labor' }
];

let invoices = [];
let thresholds = {
  food: { type: 'percentage', percentage_value: 0, fixed_value: 0 },
  inventory: { type: 'percentage', percentage_value: 0, fixed_value: 0 },
  labor: { type: 'percentage', percentage_value: 0, fixed_value: 0 }
};
let dailyRevenue = [];
let recipes = [];
let posSales = [];
let inventoryCounts = [];
let laborShifts = [];

let modalLineItems = [];
let modalEditingId = null;

let modalIngredients = [];
let recipeModalEditingId = null;

const QUADRANTS = {
  star: { label: 'Top Performer', color: 'var(--quad-star)' },
  puzzle: { label: 'High Margin, Low Sales', color: 'var(--quad-puzzle)' },
  plowhorse: { label: 'Popular, Low Margin', color: 'var(--quad-plowhorse)' },
  dog: { label: 'Underperformer', color: 'var(--quad-dog)' }
};

function getRecipeById(id) {
  return recipes.find((r) => r.recipe_id === id);
}

function findLatestPrice(itemName) {
  let latest = null;
  for (const invoice of invoices) {
    for (const item of invoice.line_items) {
      if (item.item_name === itemName && (!latest || invoice.invoice_date > latest.date)) {
        latest = { date: invoice.invoice_date, price: item.price };
      }
    }
  }
  return latest ? latest.price : null;
}

function computeRecipeCost(recipe) {
  let cost = 0;
  let hasMissingPrice = false;
  for (const ingredient of recipe.ingredients) {
    const price = findLatestPrice(ingredient.item_name);
    if (price === null) {
      hasMissingPrice = true;
    } else {
      cost += ingredient.quantity * price;
    }
  }
  return { cost, hasMissingPrice };
}

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

function computeLaborCost(shiftList) {
  return shiftList.reduce((sum, shift) => sum + shift.hours_worked * shift.hourly_rate, 0);
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

function saveRecipesData() {
  window.restaurantData.saveRecipes(recipes);
}

function savePosSalesData() {
  window.restaurantData.savePosSales(posSales);
}

function saveInventoryCountsData() {
  window.restaurantData.saveInventoryCounts(inventoryCounts);
}

function saveLaborShiftsData() {
  window.restaurantData.saveLaborShifts(laborShifts);
}

function updateLastUpdatedIndicator() {
  const el = document.getElementById('last-updated-text');
  if (el) el.textContent = 'Last updated ' + new Date().toLocaleTimeString();
}

function renderAllDerived() {
  renderSummaryCards();
  renderPnLTable();
  renderRecipesGrid();
  renderSalesByItemTable();
  renderDailySalesTable();
  renderMenuAnalysis();
  renderVarianceTable();
  renderLaborByTitleTable();
  renderLaborByEmployeeTable();
  renderPriceHistory();
  updateLastUpdatedIndicator();
}

/* ---------- Summary cards ---------- */

let summaryCardsBuilt = false;
const lastStatValues = { revenue: 0, food: 0, inventory: 0, labor: 0 };

function buildSummaryCardsSkeleton() {
  const container = document.getElementById('summary-cards');
  let html = `
    <div class="stat-card hero">
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
  totals.labor = computeLaborCost(laborShifts);
  const totalRevenue = computeTotalRevenue(dailyRevenue);

  animateNumber(document.getElementById('stat-revenue'), lastStatValues.revenue, totalRevenue, formatMoney);
  lastStatValues.revenue = totalRevenue;

  for (const cat of CATEGORIES) {
    const target = thresholds[cat.key];
    const actualCost = totals[cat.key];
    const actualPct = totalRevenue > 0 ? (actualCost / totalRevenue) * 100 : 0;
    const isFixed = target.type === 'fixed';
    const isOver = isFixed ? actualCost > target.fixed_value : actualPct > target.percentage_value;

    const valueEl = document.getElementById(`stat-${cat.key}-pct`);
    if (isFixed) {
      animateNumber(valueEl, lastStatValues[cat.key], actualCost, formatMoney);
      lastStatValues[cat.key] = actualCost;
    } else {
      animateNumber(valueEl, lastStatValues[cat.key], actualPct, (n) => n.toFixed(1) + '%');
      lastStatValues[cat.key] = actualPct;
    }

    const subEl = document.getElementById(`stat-${cat.key}-sub`);
    subEl.className = `stat-sub ${isOver ? 'over' : 'under'}`;
    subEl.textContent = isFixed
      ? `${isOver ? 'Over' : 'Under'} target ${formatMoney(target.fixed_value)}`
      : `${formatMoney(actualCost)} · ${isOver ? 'Over' : 'Under'} ${target.percentage_value.toFixed(1)}%`;
  }
}

/* ---------- Budget thresholds ---------- */

function renderThresholdsTable() {
  const tbody = document.querySelector('#thresholds-table tbody');
  tbody.innerHTML = '';

  for (const cat of CATEGORIES) {
    const t = thresholds[cat.key];
    const isFixed = t.type === 'fixed';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${cat.label}</td>
      <td>
        <select data-key="${cat.key}" data-role="type">
          <option value="percentage" ${isFixed ? '' : 'selected'}>% of revenue</option>
          <option value="fixed" ${isFixed ? 'selected' : ''}>Fixed $</option>
        </select>
      </td>
      <td>
        <div class="threshold-target">
          <input type="number" step="${isFixed ? '1' : '0.1'}" min="0"
            value="${isFixed ? t.fixed_value : t.percentage_value}"
            data-key="${cat.key}" data-field="${isFixed ? 'fixed_value' : 'percentage_value'}" />
          <span>${isFixed ? '$' : '%'}</span>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('select[data-role="type"]').forEach((select) => {
    select.addEventListener('change', () => {
      thresholds[select.dataset.key].type = select.value;
      saveThresholds();
      renderThresholdsTable();
      renderSummaryCards();
    });
  });

  tbody.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => {
      const value = parseFloat(input.value);
      thresholds[input.dataset.key][input.dataset.field] = isNaN(value) ? 0 : value;
      saveThresholds();
      renderSummaryCards();
    });
  });
}

/* ---------- Daily controllable P&L ---------- */

function renderPnLTable() {
  const tbody = document.querySelector('#pnl-table tbody');
  tbody.innerHTML = '';

  if (dailyRevenue.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No revenue entries yet.</td></tr>';
    return;
  }

  const sortedDays = [...dailyRevenue].sort((a, b) => a.date.localeCompare(b.date));

  for (const day of sortedDays) {
    const dayInvoices = invoices.filter((invoice) => invoice.invoice_date === day.date);
    const totals = computeCostTotals(dayInvoices);
    totals.labor = computeLaborCost(laborShifts.filter((shift) => shift.date === day.date));
    const totalCost = totals.food + totals.inventory + totals.labor;
    const profit = day.revenue - totalCost;
    const margin = day.revenue > 0 ? (profit / day.revenue) * 100 : 0;
    const profitClass = profit >= 0 ? 'positive' : 'negative';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${day.date}</td>
      <td>${formatMoney(day.revenue)}</td>
      <td>${formatMoney(totals.food)}</td>
      <td>${formatMoney(totals.inventory)}</td>
      <td>${formatMoney(totals.labor)}</td>
      <td class="profit-value ${profitClass}">${formatMoney(profit)}</td>
      <td class="profit-value ${profitClass}">${margin.toFixed(1)}%</td>
    `;
    tbody.appendChild(tr);
  }
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
      renderAllDerived();
    });
  });

  tbody.querySelectorAll('.delete-revenue-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      dailyRevenue.splice(Number(btn.dataset.index), 1);
      saveRevenue();
      renderRevenueTable();
      renderAllDerived();
    });
  });
}

document.getElementById('add-revenue-btn').addEventListener('click', () => {
  dailyRevenue.push({ date: todayISO(), revenue: 0 });
  saveRevenue();
  renderRevenueTable();
  renderAllDerived();
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
      renderAllDerived();
    });
  });
}

document.getElementById('add-invoice-btn').addEventListener('click', () => openInvoiceModal(null));

/* ---------- Invoice modal ---------- */

const modalOverlay = document.getElementById('invoice-modal');
const invoiceForm = document.getElementById('invoice-form');

modalOverlay.addEventListener('click', (event) => {
  if (event.target === modalOverlay) closeInvoiceModal();
});

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
  renderAllDerived();
  closeInvoiceModal();
});

/* ---------- Recipes ---------- */

function renderRecipesGrid() {
  const grid = document.getElementById('recipes-grid');
  grid.innerHTML = '';

  if (recipes.length === 0) {
    grid.innerHTML = '<div class="empty-state">No recipes yet.</div>';
    return;
  }

  for (const recipe of recipes) {
    const { cost, hasMissingPrice } = computeRecipeCost(recipe);
    const costPct = recipe.menu_price > 0 ? (cost / recipe.menu_price) * 100 : 0;
    const margin = recipe.menu_price - cost;

    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <h3>${recipe.name}</h3>
      <div class="recipe-row"><span>Menu Price</span><strong>${formatMoney(recipe.menu_price)}</strong></div>
      <div class="recipe-row"><span>Cost</span><strong>${formatMoney(cost)}</strong></div>
      <div class="recipe-row"><span>Cost %</span><strong>${costPct.toFixed(1)}%</strong></div>
      <div class="recipe-row"><span>Margin</span><strong>${formatMoney(margin)}</strong></div>
      ${hasMissingPrice ? '<div class="warning-flag">No price data for some ingredients</div>' : ''}
      <div class="recipe-card-actions">
        <button class="btn btn-secondary edit-recipe-btn" data-id="${recipe.recipe_id}">Edit</button>
        <button class="btn btn-secondary btn-danger delete-recipe-btn" data-id="${recipe.recipe_id}">Delete</button>
      </div>
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll('.edit-recipe-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const recipe = recipes.find((r) => r.recipe_id === Number(btn.dataset.id));
      openRecipeModal(recipe);
    });
  });

  grid.querySelectorAll('.delete-recipe-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      recipes = recipes.filter((r) => r.recipe_id !== Number(btn.dataset.id));
      saveRecipesData();
      renderPosSalesTable();
      renderAllDerived();
    });
  });
}

document.getElementById('add-recipe-btn').addEventListener('click', () => openRecipeModal(null));

/* ---------- Recipe modal ---------- */

const recipeModalOverlay = document.getElementById('recipe-modal');
const recipeForm = document.getElementById('recipe-form');

recipeModalOverlay.addEventListener('click', (event) => {
  if (event.target === recipeModalOverlay) closeRecipeModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeInvoiceModal();
    closeRecipeModal();
  }
});

function openRecipeModal(recipe) {
  recipeModalEditingId = recipe ? recipe.recipe_id : null;
  document.getElementById('recipe-modal-title').textContent = recipe ? 'Edit Recipe' : 'Add Recipe';
  document.getElementById('recipe-name').value = recipe ? recipe.name : '';
  document.getElementById('recipe-menu-price').value = recipe ? recipe.menu_price : '';
  modalIngredients = recipe
    ? recipe.ingredients.map((ingredient) => ({ ...ingredient }))
    : [{ item_name: '', quantity: 1, unit_label: 'case' }];
  renderIngredientsList();
  recipeModalOverlay.classList.add('open');
}

function closeRecipeModal() {
  recipeModalOverlay.classList.remove('open');
}

function computeModalIngredientsCost() {
  return modalIngredients.reduce((sum, ingredient) => {
    const price = findLatestPrice(ingredient.item_name);
    return sum + (price === null ? 0 : ingredient.quantity * price);
  }, 0);
}

function renderIngredientsList() {
  const list = document.getElementById('recipe-ingredients-list');
  list.innerHTML = '';

  modalIngredients.forEach((ingredient, index) => {
    const row = document.createElement('div');
    row.className = 'ingredient-row';
    row.innerHTML = `
      <label>Item Name
        <input type="text" data-index="${index}" data-field="item_name" value="${ingredient.item_name}" placeholder="Matches an invoice item name" />
      </label>
      <label>Quantity
        <input type="number" min="0" step="0.01" data-index="${index}" data-field="quantity" value="${ingredient.quantity}" />
      </label>
      <label>Unit
        <input type="text" data-index="${index}" data-field="unit_label" value="${ingredient.unit_label}" />
      </label>
      <button type="button" class="icon-btn remove-ingredient-btn" data-index="${index}" title="Remove">&times;</button>
    `;
    list.appendChild(row);
  });

  list.querySelectorAll('input').forEach((el) => {
    el.addEventListener('input', () => {
      const index = Number(el.dataset.index);
      const field = el.dataset.field;
      const ingredient = modalIngredients[index];
      ingredient[field] = field === 'quantity' ? (parseFloat(el.value) || 0) : el.value;
      document.getElementById('recipe-modal-cost').textContent = formatMoney(computeModalIngredientsCost());
    });
  });

  list.querySelectorAll('.remove-ingredient-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      modalIngredients.splice(Number(btn.dataset.index), 1);
      renderIngredientsList();
      document.getElementById('recipe-modal-cost').textContent = formatMoney(computeModalIngredientsCost());
    });
  });

  document.getElementById('recipe-modal-cost').textContent = formatMoney(computeModalIngredientsCost());
}

document.getElementById('add-recipe-ingredient-btn').addEventListener('click', () => {
  modalIngredients.push({ item_name: '', quantity: 1, unit_label: 'case' });
  renderIngredientsList();
});

document.getElementById('close-recipe-modal-btn').addEventListener('click', closeRecipeModal);
document.getElementById('cancel-recipe-btn').addEventListener('click', closeRecipeModal);

recipeForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const name = document.getElementById('recipe-name').value.trim();
  const menuPrice = parseFloat(document.getElementById('recipe-menu-price').value) || 0;
  const ingredients = modalIngredients.filter((ingredient) => ingredient.item_name.trim() !== '');

  if (!name || ingredients.length === 0) {
    return;
  }

  if (recipeModalEditingId !== null) {
    const recipe = recipes.find((r) => r.recipe_id === recipeModalEditingId);
    recipe.name = name;
    recipe.menu_price = menuPrice;
    recipe.ingredients = ingredients;
  } else {
    const nextId = recipes.reduce((max, r) => Math.max(max, r.recipe_id), 0) + 1;
    recipes.push({ recipe_id: nextId, name, menu_price: menuPrice, ingredients });
  }

  saveRecipesData();
  renderPosSalesTable();
  renderAllDerived();
  closeRecipeModal();
});

/* ---------- Point of sale ---------- */

function renderPosSalesTable() {
  const tbody = document.querySelector('#pos-sales-table tbody');
  tbody.innerHTML = '';

  if (posSales.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No sales recorded yet.</td></tr>';
    return;
  }

  const sortedSales = [...posSales].sort((a, b) => a.date.localeCompare(b.date));

  for (const sale of sortedSales) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="date" value="${sale.date}" data-id="${sale.sale_id}" data-field="date" /></td>
      <td>
        <select data-id="${sale.sale_id}" data-field="recipe_id">
          ${recipes.map((r) => `<option value="${r.recipe_id}" ${r.recipe_id === sale.recipe_id ? 'selected' : ''}>${r.name}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" min="0" step="1" value="${sale.quantity_sold}" data-id="${sale.sale_id}" data-field="quantity_sold" /></td>
      <td><button class="icon-btn delete-sale-btn" data-id="${sale.sale_id}" title="Delete">&times;</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('input, select').forEach((el) => {
    el.addEventListener('change', () => {
      const sale = posSales.find((s) => s.sale_id === Number(el.dataset.id));
      const field = el.dataset.field;
      if (field === 'recipe_id' || field === 'quantity_sold') {
        sale[field] = parseInt(el.value, 10) || 0;
      } else {
        sale[field] = el.value;
      }
      savePosSalesData();
      renderAllDerived();
    });
  });

  tbody.querySelectorAll('.delete-sale-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      posSales = posSales.filter((s) => s.sale_id !== Number(btn.dataset.id));
      savePosSalesData();
      renderPosSalesTable();
      renderAllDerived();
    });
  });
}

document.getElementById('add-sale-btn').addEventListener('click', () => {
  if (recipes.length === 0) return;
  const nextId = posSales.reduce((max, s) => Math.max(max, s.sale_id), 0) + 1;
  posSales.push({ sale_id: nextId, date: todayISO(), recipe_id: recipes[0].recipe_id, quantity_sold: 1 });
  savePosSalesData();
  renderPosSalesTable();
  renderAllDerived();
});

function renderSalesByItemTable() {
  const tbody = document.querySelector('#sales-by-item-table tbody');
  tbody.innerHTML = '';

  const byRecipe = new Map();
  for (const sale of posSales) {
    const recipe = getRecipeById(sale.recipe_id);
    if (!recipe) continue;
    const entry = byRecipe.get(recipe.recipe_id) || { recipe, units: 0, revenue: 0 };
    entry.units += sale.quantity_sold;
    entry.revenue += sale.quantity_sold * recipe.menu_price;
    byRecipe.set(recipe.recipe_id, entry);
  }

  const rows = [...byRecipe.values()].sort((a, b) => b.units - a.units);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No sales recorded yet.</td></tr>';
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.recipe.name}</td>
      <td>${row.units}</td>
      <td>${formatMoney(row.revenue)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderDailySalesTable() {
  const tbody = document.querySelector('#daily-sales-table tbody');
  tbody.innerHTML = '';

  const byDate = new Map();
  for (const sale of posSales) {
    const recipe = getRecipeById(sale.recipe_id);
    if (!recipe) continue;
    const entry = byDate.get(sale.date) || { date: sale.date, units: 0, revenue: 0 };
    entry.units += sale.quantity_sold;
    entry.revenue += sale.quantity_sold * recipe.menu_price;
    byDate.set(sale.date, entry);
  }

  const rows = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No sales recorded yet.</td></tr>';
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.date}</td>
      <td>${row.units}</td>
      <td>${formatMoney(row.revenue)}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ---------- Menu analysis ---------- */

function classifyRecipes() {
  const stats = recipes.map((recipe) => {
    const unitsSold = posSales
      .filter((s) => s.recipe_id === recipe.recipe_id)
      .reduce((sum, s) => sum + s.quantity_sold, 0);
    const { cost } = computeRecipeCost(recipe);
    const margin = recipe.menu_price - cost;
    return { recipe, unitsSold, margin };
  });

  const avgPopularity = stats.length > 0 ? stats.reduce((sum, s) => sum + s.unitsSold, 0) / stats.length : 0;
  const avgMargin = stats.length > 0 ? stats.reduce((sum, s) => sum + s.margin, 0) / stats.length : 0;

  for (const s of stats) {
    const highPopularity = s.unitsSold >= avgPopularity;
    const highMargin = s.margin >= avgMargin;
    if (highPopularity && highMargin) s.quadrant = 'star';
    else if (highPopularity && !highMargin) s.quadrant = 'plowhorse';
    else if (!highPopularity && highMargin) s.quadrant = 'puzzle';
    else s.quadrant = 'dog';
  }

  return { stats, avgPopularity, avgMargin };
}

function renderMenuAnalysis() {
  const { stats, avgPopularity, avgMargin } = classifyRecipes();
  const chartContainer = document.getElementById('menu-analysis-chart');
  const tbody = document.querySelector('#menu-analysis-table tbody');

  if (stats.length === 0) {
    chartContainer.innerHTML = '<div class="empty-state">No recipes yet.</div>';
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No recipes yet.</td></tr>';
    return;
  }

  const width = 600;
  const height = 380;
  const padding = { top: 20, right: 30, bottom: 50, left: 60 };
  const maxUnits = Math.max(...stats.map((s) => s.unitsSold), 1) * 1.15;
  const maxMargin = Math.max(...stats.map((s) => s.margin), 0.01) * 1.15;
  const minMargin = Math.min(...stats.map((s) => s.margin), 0) * 1.15;

  const xScale = (units) => padding.left + (units / maxUnits) * (width - padding.left - padding.right);
  const yScale = (margin) =>
    height - padding.bottom - ((margin - minMargin) / (maxMargin - minMargin)) * (height - padding.top - padding.bottom);

  const avgX = xScale(avgPopularity);
  const avgY = yScale(avgMargin);

  const points = stats.map((s) => {
    const x = xScale(s.unitsSold);
    const y = yScale(s.margin);
    const color = QUADRANTS[s.quadrant].color;
    return `
      <circle class="chart-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${color}">
        <title>${s.recipe.name}: ${s.unitsSold} sold, ${formatMoney(s.margin)} margin (${QUADRANTS[s.quadrant].label})</title>
      </circle>
      <text class="point-label" x="${(x + 10).toFixed(1)}" y="${(y + 4).toFixed(1)}">${s.recipe.name}</text>
    `;
  }).join('');

  chartContainer.innerHTML = `
    <svg class="menu-chart-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
      <line class="grid-line" x1="${avgX.toFixed(1)}" y1="${padding.top}" x2="${avgX.toFixed(1)}" y2="${height - padding.bottom}" />
      <line class="grid-line" x1="${padding.left}" y1="${avgY.toFixed(1)}" x2="${width - padding.right}" y2="${avgY.toFixed(1)}" />
      <line class="axis-line" x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" />
      <line class="axis-line" x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" />
      <text class="axis-label" x="${(width / 2).toFixed(1)}" y="${height - 12}" text-anchor="middle">Units Sold (Popularity)</text>
      <text class="axis-label" x="${-(height / 2).toFixed(1)}" y="16" text-anchor="middle" transform="rotate(-90)">Margin $ (Profitability)</text>
      ${points}
    </svg>
    <div class="chart-legend">
      ${Object.values(QUADRANTS).map((q) => `
        <span class="chart-legend-item"><span class="chart-legend-swatch" style="background:${q.color}"></span>${q.label}</span>
      `).join('')}
    </div>
  `;

  tbody.innerHTML = '';
  for (const s of stats) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${s.recipe.name}</td>
      <td>${s.unitsSold}</td>
      <td>${formatMoney(s.margin)}</td>
      <td><span class="quadrant-tag" style="background:${QUADRANTS[s.quadrant].color}">${QUADRANTS[s.quadrant].label}</span></td>
    `;
    tbody.appendChild(tr);
  }
}

/* ---------- Theoreticals vs. actuals ---------- */

function renderInventoryCountsTable() {
  const tbody = document.querySelector('#inventory-counts-table tbody');
  tbody.innerHTML = '';

  if (inventoryCounts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">No inventory counts yet.</td></tr>';
    return;
  }

  const sortedCounts = [...inventoryCounts].sort((a, b) => a.date.localeCompare(b.date));

  for (const count of sortedCounts) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="date" value="${count.date}" data-id="${count.count_id}" data-field="date" /></td>
      <td><input type="text" value="${count.item_name}" data-id="${count.count_id}" data-field="item_name" placeholder="Matches an invoice item name" /></td>
      <td><input type="number" min="0" step="0.01" value="${count.quantity_on_hand}" data-id="${count.count_id}" data-field="quantity_on_hand" /></td>
      <td><input type="text" value="${count.unit_label}" data-id="${count.count_id}" data-field="unit_label" /></td>
      <td><button class="icon-btn delete-count-btn" data-id="${count.count_id}" title="Delete">&times;</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => {
      const count = inventoryCounts.find((c) => c.count_id === Number(input.dataset.id));
      const field = input.dataset.field;
      count[field] = field === 'quantity_on_hand' ? (parseFloat(input.value) || 0) : input.value;
      saveInventoryCountsData();
      renderVarianceTable();
    });
  });

  tbody.querySelectorAll('.delete-count-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      inventoryCounts = inventoryCounts.filter((c) => c.count_id !== Number(btn.dataset.id));
      saveInventoryCountsData();
      renderInventoryCountsTable();
      renderVarianceTable();
    });
  });
}

document.getElementById('add-count-btn').addEventListener('click', () => {
  const nextId = inventoryCounts.reduce((max, c) => Math.max(max, c.count_id), 0) + 1;
  inventoryCounts.push({ count_id: nextId, date: todayISO(), item_name: '', quantity_on_hand: 0, unit_label: 'case' });
  saveInventoryCountsData();
  renderInventoryCountsTable();
  renderVarianceTable();
});

function renderVarianceTable() {
  const tbody = document.querySelector('#variance-table tbody');
  tbody.innerHTML = '';

  const itemNames = new Set();
  for (const invoice of invoices) {
    for (const item of invoice.line_items) itemNames.add(item.item_name);
  }
  for (const count of inventoryCounts) itemNames.add(count.item_name);
  itemNames.delete('');

  if (itemNames.size === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">No purchased or counted items yet.</td></tr>';
    return;
  }

  const recipeUnitsSold = new Map();
  for (const sale of posSales) {
    recipeUnitsSold.set(sale.recipe_id, (recipeUnitsSold.get(sale.recipe_id) || 0) + sale.quantity_sold);
  }

  for (const itemName of [...itemNames].sort()) {
    let purchased = 0;
    for (const invoice of invoices) {
      for (const item of invoice.line_items) {
        if (item.item_name === itemName) purchased += item.quantity;
      }
    }

    let theoreticalUsage = 0;
    for (const recipe of recipes) {
      for (const ingredient of recipe.ingredients) {
        if (ingredient.item_name === itemName) {
          theoreticalUsage += ingredient.quantity * (recipeUnitsSold.get(recipe.recipe_id) || 0);
        }
      }
    }

    const theoreticalRemaining = purchased - theoreticalUsage;

    const matchingCounts = inventoryCounts.filter((c) => c.item_name === itemName).sort((a, b) => a.date.localeCompare(b.date));
    const latestCount = matchingCounts.length > 0 ? matchingCounts[matchingCounts.length - 1] : null;
    const actualOnHand = latestCount ? latestCount.quantity_on_hand : null;

    const variance = actualOnHand === null ? null : theoreticalRemaining - actualOnHand;
    const varianceClass = variance === null ? '' : variance > 0.01 ? 'negative' : variance < -0.01 ? 'positive' : '';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${itemName}</td>
      <td>${purchased.toFixed(2)}</td>
      <td>${theoreticalUsage.toFixed(2)}</td>
      <td>${theoreticalRemaining.toFixed(2)}</td>
      <td>${actualOnHand === null ? '—' : actualOnHand.toFixed(2)}</td>
      <td class="variance-value ${varianceClass}">${variance === null ? '—' : variance.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ---------- Labor ---------- */

function renderLaborShiftsTable() {
  const tbody = document.querySelector('#labor-shifts-table tbody');
  tbody.innerHTML = '';

  if (laborShifts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No shifts logged yet.</td></tr>';
    return;
  }

  const sortedShifts = [...laborShifts].sort((a, b) => a.date.localeCompare(b.date));

  for (const shift of sortedShifts) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="date" value="${shift.date}" data-id="${shift.shift_id}" data-field="date" /></td>
      <td><input type="text" value="${shift.employee_name}" data-id="${shift.shift_id}" data-field="employee_name" /></td>
      <td><input type="text" value="${shift.job_title}" data-id="${shift.shift_id}" data-field="job_title" /></td>
      <td><input type="number" min="0" step="0.25" value="${shift.hours_worked}" data-id="${shift.shift_id}" data-field="hours_worked" /></td>
      <td><input type="number" min="0" step="0.01" value="${shift.hourly_rate}" data-id="${shift.shift_id}" data-field="hourly_rate" /></td>
      <td>${formatMoney(shift.hours_worked * shift.hourly_rate)}</td>
      <td><button class="icon-btn delete-shift-btn" data-id="${shift.shift_id}" title="Delete">&times;</button></td>
    `;
    tbody.appendChild(tr);
  }

  tbody.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => {
      const shift = laborShifts.find((s) => s.shift_id === Number(input.dataset.id));
      const field = input.dataset.field;
      shift[field] = (field === 'hours_worked' || field === 'hourly_rate') ? (parseFloat(input.value) || 0) : input.value;
      saveLaborShiftsData();
      renderLaborShiftsTable();
      renderAllDerived();
    });
  });

  tbody.querySelectorAll('.delete-shift-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      laborShifts = laborShifts.filter((s) => s.shift_id !== Number(btn.dataset.id));
      saveLaborShiftsData();
      renderLaborShiftsTable();
      renderAllDerived();
    });
  });
}

document.getElementById('add-shift-btn').addEventListener('click', () => {
  const nextId = laborShifts.reduce((max, s) => Math.max(max, s.shift_id), 0) + 1;
  laborShifts.push({ shift_id: nextId, date: todayISO(), employee_name: '', job_title: '', hours_worked: 0, hourly_rate: 0 });
  saveLaborShiftsData();
  renderLaborShiftsTable();
  renderAllDerived();
});

function renderLaborByTitleTable() {
  const tbody = document.querySelector('#labor-by-title-table tbody');
  tbody.innerHTML = '';

  const byTitle = new Map();
  for (const shift of laborShifts) {
    const entry = byTitle.get(shift.job_title) || { title: shift.job_title, hours: 0, cost: 0 };
    entry.hours += shift.hours_worked;
    entry.cost += shift.hours_worked * shift.hourly_rate;
    byTitle.set(shift.job_title, entry);
  }

  const rows = [...byTitle.values()].sort((a, b) => b.cost - a.cost);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">No shifts logged yet.</td></tr>';
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.title || '(untitled)'}</td>
      <td>${row.hours}h</td>
      <td>${formatMoney(row.cost)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function renderLaborByEmployeeTable() {
  const tbody = document.querySelector('#labor-by-employee-table tbody');
  tbody.innerHTML = '';

  const byEmployee = new Map();
  for (const shift of laborShifts) {
    const entry = byEmployee.get(shift.employee_name) || { name: shift.employee_name, title: shift.job_title, hours: 0, cost: 0 };
    entry.hours += shift.hours_worked;
    entry.cost += shift.hours_worked * shift.hourly_rate;
    byEmployee.set(shift.employee_name, entry);
  }

  const rows = [...byEmployee.values()].sort((a, b) => b.cost - a.cost);

  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No shifts logged yet.</td></tr>';
    return;
  }

  for (const row of rows) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.name || '(unnamed)'}</td>
      <td>${row.title || '—'}</td>
      <td>${row.hours}h</td>
      <td>${formatMoney(row.cost)}</td>
    `;
    tbody.appendChild(tr);
  }
}

/* ---------- Price history ---------- */

function renderPriceHistory() {
  const container = document.getElementById('price-history-charts');
  if (!container) return;

  const byItem = new Map();
  for (const invoice of invoices) {
    for (const item of invoice.line_items) {
      const entries = byItem.get(item.item_name) || [];
      entries.push({ date: invoice.invoice_date, price: item.price });
      byItem.set(item.item_name, entries);
    }
  }

  if (byItem.size === 0) {
    container.innerHTML = '<div class="empty-state">No purchases recorded yet.</div>';
    return;
  }

  const cards = [...byItem.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([itemName, rawEntries]) => {
      const entries = [...rawEntries].sort((a, b) => a.date.localeCompare(b.date));
      const first = entries[0];
      const latest = entries[entries.length - 1];
      const pctChange = first.price > 0 ? ((latest.price - first.price) / first.price) * 100 : 0;
      const isCreeping = pctChange > 5;

      if (entries.length < 2) {
        return `
          <div class="price-card">
            <h3>${itemName}</h3>
            <div class="price-stats"><span>Only one purchase on record</span><strong>${formatMoney(first.price)}</strong></div>
          </div>
        `;
      }

      const width = 260;
      const height = 90;
      const padding = 14;
      const minPrice = Math.min(...entries.map((e) => e.price));
      const maxPrice = Math.max(...entries.map((e) => e.price));
      const priceRange = maxPrice - minPrice || 1;
      const xStep = entries.length > 1 ? (width - padding * 2) / (entries.length - 1) : 0;
      const yFor = (price) => height - padding - ((price - minPrice) / priceRange) * (height - padding * 2);

      const points = entries.map((e, i) => ({ x: padding + xStep * i, y: yFor(e.price), entry: e }));
      const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const circles = points
        .map((p) => `<circle class="spark-point" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3"><title>${p.entry.date}: ${formatMoney(p.entry.price)}</title></circle>`)
        .join('');

      return `
        <div class="price-card">
          <h3>${itemName}</h3>
          <svg class="sparkline-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}">
            <line class="spark-baseline" x1="${padding}" y1="${height - padding}" x2="${width - padding}" y2="${height - padding}" />
            <path class="spark-line" d="${linePath}" />
            ${circles}
          </svg>
          <div class="price-stats">
            <span>First: <strong>${formatMoney(first.price)}</strong></span>
            <span>Latest: <strong>${formatMoney(latest.price)}</strong></span>
            <span>Change: <strong>${pctChange >= 0 ? '+' : ''}${pctChange.toFixed(1)}%</strong></span>
          </div>
          ${isCreeping ? '<div class="warning-flag">Creeping ↑</div>' : ''}
        </div>
      `;
    })
    .join('');

  container.innerHTML = `<div class="price-history-grid">${cards}</div>`;
}

/* ---------- Sidebar navigation ---------- */

document.querySelectorAll('.nav-link').forEach((link) => {
  link.addEventListener('click', () => {
    document.querySelectorAll('.nav-link').forEach((l) => l.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    link.classList.add('active');
    document.getElementById(link.dataset.view).classList.add('active');
  });
});

/* ---------- Initial render ---------- */

async function loadAllData() {
  [invoices, thresholds, dailyRevenue, recipes, posSales, inventoryCounts, laborShifts] = await Promise.all([
    window.restaurantData.getInvoices(),
    window.restaurantData.getBudgetThresholds(),
    window.restaurantData.getDailyRevenue(),
    window.restaurantData.getRecipes(),
    window.restaurantData.getPosSales(),
    window.restaurantData.getInventoryCounts(),
    window.restaurantData.getLaborShifts()
  ]);
}

async function init() {
  await loadAllData();
  renderThresholdsTable();
  renderRevenueTable();
  renderInvoicesTable();
  renderPosSalesTable();
  renderInventoryCountsTable();
  renderLaborShiftsTable();
  renderAllDerived();
}

window.restaurantData.onDataChanged(async () => {
  await loadAllData();
  renderThresholdsTable();
  renderRevenueTable();
  renderInvoicesTable();
  renderPosSalesTable();
  renderInventoryCountsTable();
  renderLaborShiftsTable();
  renderAllDerived();
});

init();
