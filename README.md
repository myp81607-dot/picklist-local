# Picklist Local

A small browser tool for making an internal, shelf-sorted picking worksheet from a Shopify order export and a `SKU,Location` CSV. Free beta, built by Alex Ma with AI-assisted development. Independent of Shopify.

Open `index.html`, choose the two UTF-8 CSV files, and build a list. The sample button works without any files. Print the result or download a pick CSV. There is no server, upload, analytics, account or saved customer data.

## Supported job

One warehouse, one location per SKU, and fully paid, unfulfilled orders. SKU matching is exact and case-sensitive. Locations come from your sheet, not live Shopify metafields or stock data. Keep the sheet current. The tool preserves item/order references and sorts shelves numerically (A2 before A10).

Canceled, non-paid, fulfilled and partially fulfilled orders are excluded. Missing or inconsistent order statuses, invalid line details, missing SKU locations and conflicting location mappings hold the whole affected order. It does not calculate the remaining quantity on a partially fulfilled or partially refunded order. Review the results and live order status before physically picking or shipping. Running the same export twice produces the same list; the tool does not track previous picking runs.

Export the orders you intend to process. The required columns are: `Name`, `Financial Status`, `Fulfillment Status`, `Canceled at`, `Lineitem quantity`, `Lineitem name`, `Lineitem SKU`, `Lineitem requires shipping`, and `Lineitem fulfillment status`. Extra columns are ignored. Blank continuation rows inherit their preceding order name; nonblank status values are checked across each order. Malformed CSV is rejected. Formula-like cells are prefixed with an apostrophe in downloaded CSV to avoid spreadsheet execution.

The downloadable [orders sample](samples/orders.csv) is entirely fictional. It deliberately includes a missing location and an already fulfilled order. Expected output: **2 orders, 6 units, 1 held order, 1 excluded order**. The [location template](samples/locations.csv) shows the two-column format.

The observed export spellings `Cancelled at` and `Lineitem sku` are also accepted. A file containing both spellings of the same required field is rejected as ambiguous.

## What it does not replace

This is a manual snapshot, not a fulfillment app. It does not reserve stock, allocate warehouses, update orders, create shipping labels or show customer addresses. For live store-connected printing and advanced fulfillment, compare Shopify's own templates and existing printing apps before commissioning custom work.

## Feedback and paid adaptation

[Open an issue](https://github.com/myp81607-dot/picklist-local/issues/new) with column names, a fictional example and the output you need. Issues are public: do not include customer information or credentials. Adapting a different input layout or output format is available as paid work after scope, price and payment arrangements are agreed. There is no checkout or subscription here.

This beta has been checked with synthetic exports, not a customer's store. Usage, willingness to pay and production suitability have not been established.

## Development

No installation or build step. Run `node --test tests/picklist.test.cjs` for the data-processing checks. Serve the directory with a local static server for browser testing, or open `index.html` directly. The core is in `picklist.js`; `app.js` handles file inputs and rendering.

## Sources

The input schema follows [Shopify's order export documentation](https://help.shopify.com/en/manual/fulfillment/managing-orders/exporting-orders), checked on November 11, 2026. The product experiment responds to requests for internal warehouse location information in [this shelf/bin discussion](https://community.shopify.com/t/adding-shelf-amp-bay-location-to-inventory/418474) and [this packing-slip discussion](https://community.shopify.com/t/customizing-packing-slips/352980/1). Those discussions establish a problem, not demand for this particular tool or evidence of sales.

## License

MIT. See [LICENSE](LICENSE).
