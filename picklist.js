(function (root) {
  'use strict';

  // Standalone browser script and Node module; no network or persistent storage.
  function parseCSV(text) {
    text = text.replace(/^\uFEFF/, '');
    const rows = [];
    let row = [], field = '', quoted = false, closed = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (ch === '"') { quoted = false; closed = true; }
        else field += ch;
      } else if (ch === ',') {
        row.push(field); field = ''; closed = false;
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        if (row.some(value => value !== '')) rows.push(row);
        row = []; field = ''; closed = false;
      } else if (ch === '"') {
        if (field || closed) throw new Error('Unexpected quote in CSV. Export the file again as comma-separated CSV.');
        quoted = true;
      } else {
        if (closed) throw new Error('Unexpected text after a closing CSV quote.');
        field += ch;
      }
    }
    if (quoted) throw new Error('An opening CSV quote has no closing quote.');
    row.push(field);
    if (row.some(value => value !== '')) rows.push(row);
    if (!rows.length) throw new Error('The CSV file is empty.');
    return rows;
  }

  function records(text, required, label) {
    const [headers, ...data] = parseCSV(text);
    const aliases = { 'Cancelled at': 'Canceled at', 'Lineitem sku': 'Lineitem SKU' };
    const names = headers.map(h => aliases[h.trim()] || h.trim());
    const missing = required.filter(h => !names.includes(h));
    if (missing.length) throw new Error(`${label}: missing columns ${missing.join(', ')}.`);
    const repeated = required.filter(h => names.filter(n => n === h).length > 1);
    if (repeated.length) throw new Error(`${label}: repeated required column ${repeated.join(', ')}.`);
    return data.map((cells, i) => {
      if (cells.length !== headers.length) throw new Error(`${label}: data row ${i + 1} has ${cells.length} cells; expected ${headers.length}.`);
      const record = { row: i + 1 };
      for (const header of required) record[header] = cells[names.indexOf(header)].trim();
      return record;
    });
  }

  const orderHeaders = ['Name', 'Financial Status', 'Fulfillment Status', 'Canceled at', 'Lineitem quantity', 'Lineitem name', 'Lineitem SKU', 'Lineitem requires shipping', 'Lineitem fulfillment status'];

  function buildPickList(ordersCSV, locationsCSV) {
    const locations = new Map(), conflicting = new Set();
    for (const entry of records(locationsCSV, ['SKU', 'Location'], 'Location sheet')) {
      const sku = entry.SKU, location = entry.Location;
      if (!sku || !location) throw new Error(`Location sheet: data row ${entry.row} needs both SKU and Location.`);
      if (locations.has(sku) && locations.get(sku) !== location) conflicting.add(sku);
      locations.set(sku, location);
    }
    if (!locations.size) throw new Error('The location sheet has no SKU locations.');

    const groups = new Map();
    let currentName = '';
    for (const line of records(ordersCSV, orderHeaders, 'Order export')) {
      if (line.Name) currentName = line.Name;
      if (!currentName) throw new Error(`Order export: data row ${line.row} has no order name and cannot be assigned to an order.`);
      if (!groups.has(currentName)) groups.set(currentName, []);
      groups.get(currentName).push(line);
    }
    const rows = [], held = [], excluded = [];
    let readyOrders = 0;
    for (const [order, lines] of groups) {
      const statusValues = header => [...new Set(lines.map(l => l[header].toLowerCase()).filter(Boolean))];
      const financial = statusValues('Financial Status');
      const fulfillment = statusValues('Fulfillment Status');
      if (lines.some(l => l['Canceled at'])) { excluded.push({ order, reason: 'Canceled order' }); continue; }
      if (financial.length > 1 || fulfillment.length > 1) { held.push({ order, reasons: ['Conflicting order statuses in the export.'] }); continue; }
      if (!financial.length || !fulfillment.length) { held.push({ order, reasons: ['Missing payment or fulfillment status.'] }); continue; }
      if (financial[0] !== 'paid') { excluded.push({ order, reason: `Payment status: ${financial[0]}` }); continue; }
      if (fulfillment[0] !== 'unfulfilled') { excluded.push({ order, reason: `Fulfillment status: ${fulfillment[0]}` }); continue; }
      const candidates = [], reasons = [];
      for (const line of lines) {
        const shipping = line['Lineitem requires shipping'].toLowerCase();
        if (shipping === 'false') continue;
        if (shipping !== 'true') { reasons.push(`Row ${line.row}: shipping requirement is missing or unknown.`); continue; }
        const status = line['Lineitem fulfillment status'].toLowerCase();
        if (status !== 'pending' && status !== 'unfulfilled') { reasons.push(`Row ${line.row}: line fulfillment status is ${status || 'blank'}.`); continue; }
        const sku = line['Lineitem SKU'];
        const quantity = line['Lineitem quantity'];
        if (!/^[1-9]\d*$/.test(quantity) || !Number.isSafeInteger(Number(quantity))) { reasons.push(`Row ${line.row}: quantity must be a positive whole number.`); continue; }
        if (!sku) { reasons.push(`Row ${line.row}: SKU is missing.`); continue; }
        if (!line['Lineitem name']) { reasons.push(`Row ${line.row}: item name is missing.`); continue; }
        if (conflicting.has(sku)) { reasons.push(`${sku}: more than one location is listed.`); continue; }
        if (!locations.has(sku)) { reasons.push(`${sku}: no location in the SKU sheet.`); continue; }
        candidates.push({ order, sku, item: line['Lineitem name'], quantity: Number(quantity), location: locations.get(sku) });
      }
      if (reasons.length) { held.push({ order, reasons: [...new Set(reasons)] }); continue; }
      if (!candidates.length) { excluded.push({ order, reason: 'No items requiring shipping' }); continue; }
      rows.push(...candidates);
      readyOrders++;
    }
    rows.sort((a, b) => a.location.localeCompare(b.location, 'en', { numeric: true }) || a.sku.localeCompare(b.sku, 'en', { numeric: true }) || a.order.localeCompare(b.order, 'en', { numeric: true }));
    return { rows, held, excluded, readyOrders, totalOrders: groups.size, totalUnits: rows.reduce((sum, row) => sum + row.quantity, 0) };
  }

  function exportCSV(rows) {
    const cell = value => {
      let text = String(value);
      // Spreadsheet programs can execute formula-like cells even when CSV-quoted.
      if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return '\uFEFF' + [['Location', 'SKU', 'Item', 'Quantity', 'Order'], ...rows.map(r => [r.location, r.sku, r.item, r.quantity, r.order])].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }

  const api = { parseCSV, buildPickList, exportCSV };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Picklist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
