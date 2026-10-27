/**
 * Tests for the D1-backed Store: products, cart, users, state, pagination,
 * stats. Checkout has its own suite in checkout.test.js.
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

const product = (over = {}) => ({
  title: 'گوشی موبایل',
  description: 'توضیحات',
  price: 1_000_000,
  stock: 5,
  category: 'الکترونیک',
  ...over,
});

describe('products', () => {
  it('creates products with sequential ids and defaults', async () => {
    const a = await store.createProduct(product());
    const b = await store.createProduct(product({ title: 'دوم' }));
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
    expect(a).toMatchObject({
      title: 'گوشی موبایل',
      description: 'توضیحات',
      price: 1_000_000,
      stock: 5,
      category: 'الکترونیک',
      photo: null,
      active: true,
    });
    expect(typeof a.createdAt).toBe('number');
  });

  it('rejects invalid product payloads', async () => {
    await expect(store.createProduct(product({ title: '' }))).rejects.toThrow();
    await expect(store.createProduct(product({ price: -1 }))).rejects.toThrow();
    await expect(store.createProduct(product({ price: 10.5 }))).rejects.toThrow();
    await expect(store.createProduct(product({ stock: -5 }))).rejects.toThrow();
    await expect(store.createProduct(product({ price: Number.NaN }))).rejects.toThrow();
  });

  it('gets a product and returns null for missing', async () => {
    const p = await store.createProduct(product());
    expect((await store.getProduct(p.id)).title).toBe('گوشی موبایل');
    expect(await store.getProduct(999)).toBeNull();
    expect(await store.getProduct('abc')).toBeNull();
  });

  it('updates whitelisted fields only and never the id', async () => {
    const p = await store.createProduct(product());
    const u = await store.updateProduct(p.id, {
      price: 2_000_000,
      stock: 3,
      title: 'جدید',
      evil: 'x',
      id: 42,
    });
    expect(u).toMatchObject({ id: p.id, price: 2_000_000, stock: 3, title: 'جدید' });
    expect(u.evil).toBeUndefined();
    expect(await store.updateProduct(999, { price: 1 })).toBeNull();
  });

  it('cannot set negative stock or price (DB CHECK enforced)', async () => {
    const p = await store.createProduct(product());
    await expect(store.updateProduct(p.id, { stock: -1 })).rejects.toThrow();
    await expect(store.updateProduct(p.id, { price: -1 })).rejects.toThrow();
  });

  it('toggles active', async () => {
    const p = await store.createProduct(product());
    await store.updateProduct(p.id, { active: false });
    expect((await store.getProduct(p.id)).active).toBe(false);
  });

  it('deletes products', async () => {
    const p = await store.createProduct(product());
    await store.deleteProduct(p.id);
    expect(await store.getProduct(p.id)).toBeNull();
  });

  it('listProducts sorts newest first and filters active+in-stock', async () => {
    const a = await store.createProduct(product({ title: 'A' }));
    const b = await store.createProduct(product({ title: 'B', stock: 0 }));
    const c = await store.createProduct(product({ title: 'C' }));
    await store.updateProduct(c.id, { active: false });

    const all = await store.listProducts();
    expect(all.map((p) => p.title)).toEqual(['C', 'B', 'A']);

    const active = await store.listProducts({ activeOnly: true });
    expect(active.map((p) => p.title)).toEqual(['A']);
    expect(a.createdAt).toBeLessThanOrEqual(b.createdAt);
  });

  it('paginates product lists and clamps out-of-range pages', async () => {
    for (let i = 0; i < 7; i++) await store.createProduct(product({ title: `p${i}` }));
    const page1 = await store.listProductsPage({ page: 1, pageSize: 3 });
    const page3 = await store.listProductsPage({ page: 3, pageSize: 3 });
    const page4 = await store.listProductsPage({ page: 4, pageSize: 3 }); // clamps to last page
    expect(page1.items).toHaveLength(3);
    expect(page1.total).toBe(7);
    expect(page1.pages).toBe(3);
    expect(page3.items).toHaveLength(1);
    expect(page4.page).toBe(3);
    expect(page4.items).toHaveLength(1);
    expect(page1.items[0].id).toBeGreaterThan(page1.items[2].id); // newest first
  });

  it('aggregates distinct categories from active products', async () => {
    await store.createProduct(product({ category: 'کتاب' }));
    await store.createProduct(product({ category: 'کتاب' }));
    await store.createProduct(product({ category: 'بازی', stock: 0 }));
    await store.createProduct(product({ category: '' }));
    expect(await store.categories()).toEqual(['کتاب']);
  });
});

describe('cart', () => {
  it('adds, updates and clears quantities', async () => {
    const p = await store.createProduct(product());
    await store.addToCart(1, p.id, 2);
    expect(await store.getCart(1)).toEqual({ items: { [String(p.id)]: 2 } });
    await store.addToCart(1, p.id, 1);
    expect((await store.getCart(1)).items[String(p.id)]).toBe(3);
    await store.setCartQty(1, p.id, 1);
    expect((await store.getCart(1)).items[String(p.id)]).toBe(1);
    await store.setCartQty(1, p.id, 0);
    expect(await store.getCart(1)).toEqual({ items: {} });
    await store.addToCart(1, p.id, 1);
    await store.clearCart(1);
    expect(await store.getCart(1)).toEqual({ items: {} });
  });

  it('keeps carts independent per user', async () => {
    const p = await store.createProduct(product());
    await store.addToCart(1, p.id, 1);
    await store.addToCart(2, p.id, 2);
    expect((await store.getCart(1)).items[String(p.id)]).toBe(1);
    expect((await store.getCart(2)).items[String(p.id)]).toBe(2);
  });

  it('cartDetails computes totals and flags unavailable lines', async () => {
    const a = await store.createProduct(product({ price: 100, stock: 10 }));
    const b = await store.createProduct(product({ price: 250, stock: 1 }));
    await store.addToCart(1, a.id, 2);
    await store.addToCart(1, b.id, 2); // more than stock

    let d = await store.cartDetails(1);
    expect(d.lines).toHaveLength(2);
    expect(d.total).toBe(700);
    expect(d.lines[0].lineTotal).toBe(200);
    const bLine = d.lines.find((l) => l.product.id === b.id);
    expect(bLine.available).toBe(false);
    expect(bLine.reason).toBe('stock');
    expect(d.lines.find((l) => l.product.id === a.id).available).toBe(true);

    await store.updateProduct(b.id, { active: false });
    d = await store.cartDetails(1);
    expect(d.lines.find((l) => l.product.id === b.id).reason).toBe('inactive');
  });

  it('drops deleted products from cartDetails and clears them at checkout', async () => {
    const a = await store.createProduct(product({ price: 100 }));
    const b = await store.createProduct(product({ price: 50 }));
    await store.addToCart(1, a.id, 1);
    await store.addToCart(1, b.id, 1);
    await store.deleteProduct(b.id);
    const d = await store.cartDetails(1);
    expect(d.lines.map((l) => l.product.id)).toEqual([a.id]);
    expect(d.total).toBe(100);
  });
});

describe('users', () => {
  it('upserts user profile preserving contact fields', async () => {
    await store.upsertUser({ id: 7, first_name: 'علی', last_name: '', username: 'ali' });
    await store.saveUserContact(7, { contactName: 'علی رضایی', phone: '09121234567' });
    await store.upsertUser({ id: 7, first_name: 'علی', username: 'ali2' });
    const u = await store.getUser(7);
    expect(u).toMatchObject({
      id: 7,
      firstName: 'علی',
      username: 'ali2',
      contactName: 'علی رضایی',
      phone: '09121234567',
    });
  });

  it('saves contact even for users never seen via update', async () => {
    await store.saveUserContact(9, { contactName: 'x', phone: '09120000000' });
    expect((await store.getUser(9)).phone).toBe('09120000000');
  });

  it('lists users', async () => {
    await store.upsertUser({ id: 1, first_name: 'a' });
    await store.upsertUser({ id: 2, first_name: 'b' });
    expect((await store.listUsers()).length).toBe(2);
  });
});

describe('conversation state', () => {
  it('roundtrips state and clears it', async () => {
    await store.setState(1, { flow: 'checkout', step: 'name', data: { name: '' } });
    expect((await store.getState(1)).flow).toBe('checkout');
    await store.clearState(1);
    expect(await store.getState(1)).toBeNull();
  });

  it('expires state after TTL', async () => {
    await store.setState(1, { flow: 'x', step: 'y', data: {} });
    await db.exec(`UPDATE states SET expires_at = ${Date.now() - 1000} WHERE user_id = 1`);
    expect(await store.getState(1)).toBeNull();
  });
});

describe('order listing and pagination', () => {
  it('lists orders newest first, optionally filtered by user', async () => {
    await store.createProduct(product());
    await db.exec(
      `INSERT INTO users (id, joined_at, last_seen) VALUES (5, 1, 1), (6, 1, 1)`,
    );
    await db.exec(
      `INSERT INTO orders (user_id, total, status, created_at, updated_at) VALUES
       (5, 100, 'pending', 100, 100), (6, 200, 'confirmed', 200, 200), (5, 300, 'done', 300, 300)`,
    );
    const all = await store.listOrders();
    expect(all.map((o) => o.total)).toEqual([300, 200, 100]);
    const mine = await store.listOrders({ userId: 5 });
    expect(mine.map((o) => o.total)).toEqual([300, 100]);
    expect(mine[0]).toMatchObject({
      userId: 5,
      customer: { name: '', phone: '', address: '' },
      lines: [],
    });
  });

  it('paginates admin order lists', async () => {
    await db.exec(
      `INSERT INTO orders (user_id, total, status, created_at, updated_at) VALUES
       (1, 1, 'pending', 1, 1), (1, 2, 'pending', 2, 2), (1, 3, 'pending', 3, 3)`,
    );
    const p1 = await store.listOrdersPage({ page: 1, pageSize: 2 });
    const p2 = await store.listOrdersPage({ page: 2, pageSize: 2 });
    expect(p1.total).toBe(3);
    expect(p1.pages).toBe(2);
    expect(p1.items.map((o) => o.total)).toEqual([3, 2]);
    expect(p2.items.map((o) => o.total)).toEqual([1]);
  });
});

describe('stats', () => {
  it('computes aggregates without loading everything', async () => {
    await store.createProduct(product({ price: 100, stock: 2 }));
    await store.createProduct(product({ price: 50, stock: 0 }));
    await store.createProduct(product({ price: 70 }));
    await store.updateProduct(3, { active: false });
    await db.exec(`INSERT INTO users (id, joined_at, last_seen) VALUES (1,1,1),(2,1,1)`);
    await db.exec(
      `INSERT INTO orders (user_id, total, status, created_at, updated_at) VALUES
       (1, 100, 'pending', 1, 1), (1, 200, 'done', 2, 2), (2, 400, 'cancelled', 3, 3)`,
    );
    const s = await store.stats();
    expect(s).toEqual({
      products: 3,
      activeProducts: 1,
      orders: 3,
      pendingOrders: 1,
      users: 2,
      revenue: 300,
    });
  });
});
