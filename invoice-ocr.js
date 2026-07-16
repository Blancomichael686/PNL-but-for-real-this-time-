const MONTH_INDEX = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

const DATE_PATTERNS = [
  { regex: /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/, order: 'ymd' },
  { regex: /\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b/, order: 'mdy' },
  { regex: /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/i, order: 'month-name' }
];

function pad(n) {
  return String(n).padStart(2, '0');
}

function parseInvoiceDate(text) {
  for (const { regex, order } of DATE_PATTERNS) {
    const match = text.match(regex);
    if (!match) continue;

    let year;
    let month;
    let day;
    if (order === 'ymd') {
      [, year, month, day] = match;
    } else if (order === 'mdy') {
      [, month, day, year] = match;
    } else {
      const [, monthName, dayStr, yearStr] = match;
      month = MONTH_INDEX[monthName.slice(0, 3).toLowerCase()];
      day = dayStr;
      year = yearStr;
    }

    month = Number(month);
    day = Number(day);
    year = Number(year);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }
  return null;
}

function parseVendorName(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.length > 0 ? lines[0] : '';
}

const LINE_ITEM_REGEX = /^(.{2,60}?)\s+(\d+(?:\.\d+)?)\s+\$?(\d{1,5}(?:,\d{3})*\.\d{2})\s*\$?(\d{1,6}(?:,\d{3})*\.\d{2})?$/;

function parseLineItems(text) {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const items = [];

  for (const line of lines) {
    const match = line.match(LINE_ITEM_REGEX);
    if (!match) continue;

    const [, description, quantityStr, priceStr] = match;
    const quantity = parseFloat(quantityStr);
    const price = parseFloat(priceStr.replace(/,/g, ''));
    const itemName = description.replace(/[^a-zA-Z0-9()./\-\s]/g, '').trim();

    if (!itemName || !(quantity > 0) || !(price > 0)) continue;
    items.push({ item_name: itemName, quantity, price, cost_category: 'food' });
  }

  return items;
}

function extractInvoiceData(rawText) {
  return {
    rawText,
    guessedVendor: parseVendorName(rawText),
    guessedDate: parseInvoiceDate(rawText),
    guessedLineItems: parseLineItems(rawText)
  };
}

module.exports = { parseVendorName, parseInvoiceDate, parseLineItems, extractInvoiceData };
