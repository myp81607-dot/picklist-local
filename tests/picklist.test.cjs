const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCSV, buildPickList, exportCSV } = require('../picklist.js');
const sample = name => fs.readFileSync(path.join(__dirname, '../samples', name), 'utf8');
const orders = sample('orders.csv'), locations = sample('locations.csv');

test('representative multi-item export: sorted pick rows, held SKU and fulfilled exclusion', () => {
  const r = buildPickList(orders, locations);
  assert.equal(r.readyOrders, 2); assert.equal(r.totalUnits, 6); assert.equal(r.totalOrders, 4);
  assert.deepEqual(r.rows.map(x => [x.location, x.order, x.quantity]), [['A1 / Shelf 3', '#1001', 1], ['A2 / Shelf 1', '#1001', 2], ['A2 / Shelf 1', '#1002', 3]]);
  assert.equal(r.held[0].order, '#1003'); assert.equal(r.excluded[0].order, '#1004');
});
test('a missing SKU holds the whole order, including its otherwise valid lines', () => {
  const r = buildPickList(orders, 'SKU,Location\nTOTE-01,A1\n');
  assert.equal(r.readyOrders, 1); assert.equal(r.rows[0].order, '#1002');
  assert.deepEqual(r.held.map(x => x.order), ['#1001', '#1003']);
});
test('partially fulfilled, canceled and unpaid orders are excluded', () => {
  for (const replacement of ['paid,partial,', 'pending,unfulfilled,', 'paid,unfulfilled,2026-11-01']) {
    const r = buildPickList(orders.replace('#1001,paid,unfulfilled,', '#1001,' + replacement), locations);
    assert.ok(!r.rows.some(x => x.order === '#1001'));
    assert.ok(r.excluded.some(x => x.order === '#1001'));
  }
});
test('missing or contradictory status and already fulfilled lines are held', () => {
  for (const csv of [orders.replace('#1001,paid,unfulfilled,', '#1001,,,') , orders.replace('#1001,,,,1', '#1001,pending,,,1'), orders.replace('TOTE-01,true,pending', 'TOTE-01,true,fulfilled')]) {
    const r = buildPickList(csv, locations);
    assert.ok(r.held.some(x => x.order === '#1001')); assert.ok(!r.rows.some(x => x.order === '#1001'));
  }
});
test('conflicting SKU locations hold affected orders; leading zeros and case are preserved', () => {
  const r = buildPickList(orders, locations + 'TOTE-01,B7\n');
  assert.equal(r.readyOrders, 0);
  assert.equal(buildPickList(orders.replaceAll('TOTE-01', '001'), locations.replaceAll('TOTE-01', '001')).rows[1].sku, '001');
  assert.ok(buildPickList(orders, locations.replace('TOTE-01', 'tote-01')).held.some(x => x.order === '#1001'));
});
test('invalid quantities and unknown shipping flags cannot silently enter the pick list', () => {
  for (const value of ['0', '-1', '1.5', '2x']) assert.ok(buildPickList(orders.replace(',,2,Canvas', `,,${value},Canvas`), locations).held.some(x => x.order === '#1001'));
  assert.ok(buildPickList(orders.replace('TOTE-01,true,pending', 'TOTE-01,,pending'), locations).held.some(x => x.order === '#1001'));
});
test('quoted CSV fields, embedded newlines, BOM and CRLF parse without splitting items', () => {
  assert.deepEqual(parseCSV('\uFEFFA,B\r\n"comma, here","two\nlines and ""quote"""\r\n'), [['A', 'B'], ['comma, here', 'two\nlines and "quote"']]);
  assert.throws(() => parseCSV('A,B\n"open,value'), /closing quote/);
  assert.throws(() => parseCSV('A,B\n"closed"x,value'), /Unexpected text/);
  assert.throws(() => buildPickList(orders.replace('Canvas tote,TOTE-01', 'Canvas,tote,TOTE-01'), locations), /cells/);
});
test('blank continuation order names retain association; an orphan row is rejected', () => {
  assert.equal(buildPickList(orders.replace('#1001,,,,1', ',,,,1'), locations).totalUnits, 6);
  assert.throws(() => buildPickList(orders.replace('#1001,paid', ',paid'), locations), /cannot be assigned/);
});
test('a missing required header produces a useful error and irrelevant duplicate headers are allowed', () => {
  assert.throws(() => buildPickList(orders.replace('Lineitem SKU', 'SKU'), locations), /missing columns Lineitem SKU/);
  const withPhones = orders.trim().split('\n').map((line, i) => line + (i ? ',,' : ',Phone,Phone')).join('\n');
  assert.equal(buildPickList(withPhones, locations).totalUnits, 6);
});
test('observed Shopify header variants work and ambiguous alias duplicates are rejected', () => {
  const alternate = orders.replace('Canceled at', 'Cancelled at').replace('Lineitem SKU', 'Lineitem sku');
  assert.equal(buildPickList(alternate, locations).totalUnits, 6);
  const duplicated = orders.trim().split('\n').map((line, i) => line + (i ? ',' : ',Lineitem sku')).join('\n');
  assert.throws(() => buildPickList(duplicated, locations), /repeated required column Lineitem SKU/);
});
test('CSV export retains text and neutralizes spreadsheet formulas', () => {
  const data = exportCSV([{ location: '=1+1', sku: '001', item: 'Book, "red"', quantity: 2, order: '#1' }]);
  assert.deepEqual(parseCSV(data)[1], ["'=1+1", '001', 'Book, "red"', '2', '#1']);
});
