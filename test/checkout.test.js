/**
 * Atomic checkout: stock validation, oversell prevention, idempotency,
 * price snapshots and the order status state machine.
 *
 * The D1Stub serializes batch() calls and runs each batch in a real SQLite
 * transaction with full rollback — the same guarantees production D1 gives
 * ("Batched statements are SQL transactions"). So the concurrency tests here
 * exercise the real failure modes: two checkouts racing for the same stock
 * are serialized, and the loser must see the freshly committed state.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { D1Stub } from './helpers/d1.js';
import { Store } from '../src/store.js';

let db;
let store;

beforeEach(async () => {
  db = D1Stub.create();
  store = new Store(db);
});

const customer = { name: 'علی رضایی', phone: '09121234567', address: 'تهران، خیابان آزادی' };

async function seedProduct(over = {}) {
  return store.createProduct({ title: 'کتاب', price: 100, stock: 10, ...over });
}

async function fillCart(userId, productId, qty) {
  await store.addToCart(userId, productId, qty);
}

async function seedUser(id) {
  await db.exec(`INSERT INTO users (id, joined_at, last_seen) VALUES (${id}, 1, 1)`);
}

describe('checkout happy path', () => {
  it('creates an order, snapshots prices, decrements stock and clears the cart', async () => {
    const p = await seedProduct({ price: 250, stock: 5 });
    await fillCart(1, p.id, 2);

    const res = await store.checkout(1, customer, 'key-1');
    expect(res.ok).toBe(true);
    expect(res.duplicate).toBe(false);

    const order = res.order;
    expect(order.id).toBe(1);
    expect(order.userId).toBe(1);
    expect(order.status).toBe('pending');
    expect(order.total).toBe(500);
    expect(order.customer).toEqual(customer);
    expect(order.lines).toEqual([{ productId: p.id, title: 'کتاب', price: 250, qty: 2 }]);
    expect(typeof order.createdAt).toBe('number');

    expect((await store.getProduct(p.id)).stock).toBe(3);
    expect(await store.getCart(1)).toEqual({ items: {} });
  });

  it('keeps historical orders untouched when the product is repriced later', async () => {
    const p = await seedProduct({ price: 100 });
    await fillCart(1, p.id, 1);
    const res = await store.checkout(1, customer, 'k');
    expect(res.order.total).toBe(100);

    await store.updateProduct(p.id, { price: 999, title: ' renamed ' });
    const after = await store.getOrder(res.order.id);
    expect(after.total).toBe(100);
    expect(after.lines[0]).toEqual({ productId: p.id, title: 'کتاب', price: 100, qty: 1 });
  });

  it('keeps order lines intact when the purchased product is deleted later', async () => {
    const p = await seedProduct();
    await fillCart(1, p.id, 2);
    const res = await store.checkout(1, customer, 'k');
    await store.deleteProduct(p.id);
    const after = await store.getOrder(res.order.id);
    expect(after.lines).toHaveLength(1);
    expect(after.lines[0].title).toBe('کتاب');
  });

  it('assigns sequential order ids', async () => {
    const p = await seedProduct({ stock: 100 });
    await fillCart(1, p.id, 1);
    await fillCart(2, p.id, 1);
    const a = await store.checkout(1, customer, 'k1');
    const b = await store.checkout(2, customer, 'k2');
    expect(a.order.id).toBe(1);
    expect(b.order.id).toBe(2);
  });
});

describe('checkout validation (server-side, at confirm time)', () => {
  it('rejects an empty cart', async () => {
    const res = await store.checkout(1, customer, 'k');
    expect(res).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects when stock is insufficient and changes nothing', async () => {
    const p = await seedProduct({ stock: 1 });
    await fillCart(1, p.id, 2);
    const res = await store.checkout(1, customer, 'k');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('invalid');
    expect(res.issues).toEqual([{ productId: p.id, title: 'کتاب', reason: 'stock' }]);
    expect((await store.getProduct(p.id)).stock).toBe(1);
    expect(await store.getOrder(1)).toBeNull();
    expect((await store.getCart(1)).items[String(p.id)]).toBe(2); // cart kept for fixing
  });

  it('rejects inactive products', async () => {
    const p = await seedProduct({ stock: 10 });
    await store.updateProduct(p.id, { active: false });
    await fillCart(1, p.id, 1);
    const res = await store.checkout(1, customer, 'k');
    expect(res.ok).toBe(false);
    expect(res.issues[0].reason).toBe('inactive');
  });

  it('reports one issue per problematic line', async () => {
    const a = await seedProduct({ price: 10, stock: 1 });
    const b = await seedProduct({ title: 'B', price: 10, stock: 1 });
    await store.updateProduct(b.id, { active: false });
    await fillCart(1, a.id, 3);
    await fillCart(1, b.id, 1);
    const res = await store.checkout(1, customer, 'k');
    expect(res.issues.map((i) => i.reason).sort()).toEqual(['inactive', 'stock']);
  });

  it('excludes deleted products and checks out the remaining lines', async () => {
    const a = await seedProduct({ price: 100, stock: 5 });
    const b = await seedProduct({ title: 'B', price: 50, stock: 5 });
    await fillCart(1, a.id, 1);
    await fillCart(1, b.id, 1);
    await store.deleteProduct(b.id);

    const res = await store.checkout(1, customer, 'k');
    expect(res.ok).toBe(true);
    expect(res.order.lines.map((l) => l.productId)).toEqual([a.id]);
    expect(res.order.total).toBe(100);
  });
});

describe('oversell prevention under concurrency', () => {
  it('never sells more than available stock across concurrent checkouts', async () => {
    const p = await seedProduct({ stock: 3 });
    for (const u of [1, 2, 3, 4, 5]) {
      await seedUser(u);
      await fillCart(u, p.id, 1);
    }
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((u) => store.checkout(u, customer, `k${u}`)),
    );
    const won = results.filter((r) => r.ok);
    const lost = results.filter((r) => !r.ok);
    expect(won).toHaveLength(3);
    expect(lost.every((r) => r.reason === 'invalid' && r.issues[0].reason === 'stock')).toBe(true);
    expect((await store.getProduct(p.id)).stock).toBe(0);
    const soldQty = (await store.listOrders()).reduce((s, o) => s + o.lines[0].qty, 0);
    expect(soldQty).toBe(3);
  });

  it('handles two users racing for the last unit', async () => {
    const p = await seedProduct({ stock: 1 });
    await seedUser(1);
    await seedUser(2);
    await fillCart(1, p.id, 1);
    await fillCart(2, p.id, 1);
    const [a, b] = await Promise.all([
      store.checkout(1, customer, 'k1'),
      store.checkout(2, customer, 'k2'),
    ]);
    expect(a.ok + b.ok).toBe(1); // exactly one wins
    expect((await store.getProduct(p.id)).stock).toBe(0);
  });

  it('rejects concurrent checkouts when requested quantity exceeds remaining stock', async () => {
    const p = await seedProduct({ stock: 4 });
    await seedUser(1);
    await seedUser(2);
    await fillCart(1, p.id, 3);
    await fillCart(2, p.id, 3);
    const [a, b] = await Promise.all([
      store.checkout(1, customer, 'k1'),
      store.checkout(2, customer, 'k2'),
    ]);
    const won = a.ok ? a : b;
    const lost = a.ok ? b : a;
    expect(won.ok).toBe(true);
    expect(lost.ok).toBe(false);
    expect((await store.getProduct(p.id)).stock).toBe(1);
  });
});

describe('idempotency (duplicate confirmations)', () => {
  it('returns the same order for a repeated confirmation, without double effects', async () => {
    const p = await seedProduct({ stock: 5 });
    await fillCart(1, p.id, 2);
    const first = await store.checkout(1, customer, 'key-A');
    const second = await store.checkout(1, customer, 'key-A');
    expect(first.ok).toBe(true);
    expect(second).toMatchObject({ ok: true, duplicate: true });
    expect(second.order.id).toBe(first.order.id);
    expect((await store.getProduct(p.id)).stock).toBe(3);
    const orders = await store.listOrders();
    expect(orders).toHaveLength(1);
  });

  it('is safe when the same confirmation fires concurrently', async () => {
    const p = await seedProduct({ stock: 5 });
    await fillCart(1, p.id, 2);
    const [a, b] = await Promise.all([
      store.checkout(1, customer, 'key-A'),
      store.checkout(1, customer, 'key-A'),
    ]);
    const fresh = a.duplicate ? b : a;
    const dup = a.duplicate ? a : b;
    expect(fresh.ok && fresh.duplicate === false).toBe(true);
    expect(dup.ok && dup.duplicate === true).toBe(true);
    expect(dup.order.id).toBe(fresh.order.id);
    expect((await store.getProduct(p.id)).stock).toBe(3);
    expect((await store.listOrders()).length).toBe(1);
  });

  it('a second checkout with a new key finds an empty cart', async () => {
    const p = await seedProduct({ stock: 5 });
    await fillCart(1, p.id, 1);
    await store.checkout(1, customer, 'k1');
    const res = await store.checkout(1, customer, 'k2');
    expect(res).toEqual({ ok: false, reason: 'empty' });
    expect((await store.listOrders()).length).toBe(1);
  });

  it('does not decrement stock more than once when the key is reused after failure', async () => {
    const p = await seedProduct({ stock: 5 });
    await fillCart(1, p.id, 9); // over stock -> fails
    const failed = await store.checkout(1, customer, 'k1');
    expect(failed.ok).toBe(false);
    // retry with fewer items and the SAME key (e.g. stale review screen)
    await store.setCartQty(1, p.id, 2);
    const res = await store.checkout(1, customer, 'k1');
    expect(res.ok).toBe(true);
    expect((await store.getProduct(p.id)).stock).toBe(3);
  });
});

describe('order status state machine', () => {
  it('applies valid transitions', async () => {
    const p = await seedProduct();
    await fillCart(1, p.id, 1);
    const { order } = await store.checkout(1, customer, 'k');

    const r1 = await store.setOrderStatus(order.id, 'confirmed');
    expect(r1.ok).toBe(true);
    expect(r1.order.status).toBe('confirmed');

    const r2 = await store.setOrderStatus(order.id, 'shipped');
    const r3 = await store.setOrderStatus(order.id, 'done');
    expect(r2.order.status).toBe('shipped');
    expect(r3.order.status).toBe('done');
  });

  it('rejects invalid transitions and unknown statuses', async () => {
    const p = await seedProduct();
    await fillCart(1, p.id, 1);
    const { order } = await store.checkout(1, customer, 'k');

    expect((await store.setOrderStatus(order.id, 'shipped')).ok).toBe(false); // pending -> shipped
    expect((await store.setOrderStatus(order.id, 'bogus')).ok).toBe(false);
    expect((await store.getOrder(order.id)).status).toBe('pending');

    await store.setOrderStatus(order.id, 'cancelled');
    expect((await store.setOrderStatus(order.id, 'confirmed')).ok).toBe(false); // terminal
  });

  it('returns ok:false for missing orders', async () => {
    expect(await store.setOrderStatus(999, 'confirmed')).toMatchObject({ ok: false });
  });
});
