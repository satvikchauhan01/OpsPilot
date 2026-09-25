const { HttpError } = require('../lib/errors');

const PRODUCTS = [
  { sku: 'MUG-001', name: 'Enamel camp mug', price: 14.5 },
  { sku: 'TEE-014', name: 'Heavyweight tee', price: 28 },
  { sku: 'CAP-007', name: 'Six-panel cap', price: 22 },
  { sku: 'BAG-021', name: 'Canvas tote', price: 18 },
  { sku: 'SOX-003', name: 'Merino socks', price: 16 },
  { sku: 'BTL-009', name: 'Steel bottle', price: 32 },
];

// Stock is refilled every minute, so even a traffic spike doesn't sell anything out.
// Running out of stock would only add noise to the failure scenarios.
const RESTOCK_LEVEL = 5000;
const RESTOCK_INTERVAL_MS = 60_000;

class Catalog {
  #stock = new Map();

  constructor() {
    this.restock();
    setInterval(() => this.restock(), RESTOCK_INTERVAL_MS).unref();
  }

  list() {
    return PRODUCTS.map((product) => ({ ...product, available: this.#stock.get(product.sku) }));
  }

  reserve(items) {
    const lines = items.map(({ sku, qty }) => {
      const product = PRODUCTS.find((p) => p.sku === sku);
      if (!product) throw new HttpError(404, `unknown sku ${sku}`);

      const available = this.#stock.get(sku);
      if (available < qty) throw new HttpError(409, `only ${available} of ${sku} left`);

      return { sku, qty, unitPrice: product.price };
    });

    // Take stock only once every line is known to be available.
    for (const { sku, qty } of lines) this.#stock.set(sku, this.#stock.get(sku) - qty);
    return lines;
  }

  restock() {
    for (const { sku } of PRODUCTS) this.#stock.set(sku, RESTOCK_LEVEL);
  }
}

module.exports = { Catalog };
