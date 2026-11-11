'use strict';
const $ = id => document.getElementById(id);
const inputs = { orders: null, locations: null };
let result = null;
const sampleOrders = 'Name,Financial Status,Fulfillment Status,Canceled at,Lineitem quantity,Lineitem name,Lineitem SKU,Lineitem requires shipping,Lineitem fulfillment status\n#1001,paid,unfulfilled,,2,Canvas tote,TOTE-01,true,pending\n#1001,,,,1,"Notebook, dotted",NOTE-02,true,pending\n#1002,paid,unfulfilled,,3,Canvas tote,TOTE-01,true,pending\n#1003,paid,unfulfilled,,1,Ceramic cup,CUP-03,true,pending\n#1004,paid,fulfilled,,1,Canvas tote,TOTE-01,true,fulfilled\n';
const sampleLocations = 'SKU,Location\nTOTE-01,A2 / Shelf 1\nNOTE-02,A1 / Shelf 3\n';

function invalidate() { result = null; $('results').hidden = true; $('build').disabled = !inputs.orders || !inputs.locations; $('message').textContent = ''; }
for (const kind of ['orders', 'locations']) {
  $(kind + '-file').addEventListener('change', async event => {
    const file = event.target.files[0];
    inputs[kind] = null;
    invalidate();
    $(kind + '-name').textContent = file ? 'Reading…' : 'No file selected';
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
      if (event.target.files[0] !== file) return;
      inputs[kind] = { text, name: file.name };
      $(kind + '-name').textContent = file.name;
      invalidate();
    } catch {
      $(kind + '-name').textContent = 'Could not read this file';
      $('message').textContent = 'Use a UTF-8 CSV file. Re-export it if the encoding is different.';
    }
  });
}

$('example').addEventListener('click', () => {
  for (const kind of ['orders', 'locations']) $(kind + '-file').value = '';
  inputs.orders = { text: sampleOrders, name: 'Sample orders (fictional)' };
  inputs.locations = { text: sampleLocations, name: 'Sample locations (fictional)' };
  $('orders-name').textContent = inputs.orders.name;
  $('locations-name').textContent = inputs.locations.name;
  invalidate();
  build();
});
$('build').addEventListener('click', build);
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function build() {
  try {
    result = Picklist.buildPickList(inputs.orders.text, inputs.locations.text);
    $('message').textContent = '';
    $('run-source').textContent = `${inputs.orders.name} + ${inputs.locations.name}`;
    $('stats').replaceChildren();
    for (const [value, label, attention] of [[result.readyOrders, 'orders ready', false], [result.totalUnits, 'units to pick', false], [result.held.length, 'orders held for review', true], [result.excluded.length, 'orders excluded', false]]) {
      const stat = element('div', undefined, 'stat' + (attention && value ? ' attention' : ''));
      stat.append(element('strong', value), element('span', label));
      $('stats').append(stat);
    }
    $('pick-rows').replaceChildren();
    for (const row of result.rows) {
      const tr = element('tr'), check = element('td');
      const square = element('span', undefined, 'check-square');
      square.setAttribute('aria-label', 'Unchecked'); check.append(square); tr.append(check);
      for (const value of [row.location, row.sku, row.item, row.quantity, row.order]) tr.append(element('td', value));
      $('pick-rows').append(tr);
    }
    $('review-list').replaceChildren(...result.held.map(issue => element('li', `${issue.order}: ${issue.reasons.join(' ')}`)));
    $('review-panel').hidden = !result.held.length;
    $('excluded-list').replaceChildren(...result.excluded.map(issue => element('li', `${issue.order}: ${issue.reason}`)));
    $('excluded-summary').textContent = `${result.excluded.length} excluded orders — view reasons`;
    $('excluded-panel').hidden = !result.excluded.length;
    $('empty').hidden = result.rows.length > 0;
    $('export').disabled = !result.rows.length;
    $('print').disabled = !result.rows.length;
    $('results').hidden = false;
    $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    result = null; $('results').hidden = true;
    $('message').textContent = error.message;
  }
}
$('export').addEventListener('click', () => {
  if (!result?.rows.length) return;
  const url = URL.createObjectURL(new Blob([Picklist.exportCSV(result.rows)], { type: 'text/csv;charset=utf-8' }));
  const link = element('a'); link.href = url; link.download = 'pick-list.csv'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$('print').addEventListener('click', () => {
  if (!result?.rows.length) return;
  $('excluded-panel').open = true;
  window.print();
});
