/**
 * Data-access layer on top of Cloudflare D1 (SQLite), binding: DB.
 *
 * Schema lives in migrations/0001_init.sql and is the source of truth for
 * constraints (stock >= 0, valid order statuses, unique idempotency keys).
 *
 * Why D1 and not KV:
 *   KV is eventually consistent and has no atomic read-modify-write, so ids,
 *   stock and order creation could silently corrupt under concurrency. D1
 *   gives real transactions: db.batch() runs as a single SQL transaction with
 *   rollback on failure. The checkout is one such batch, which is what makes
 *   "never oversell, never double-create" actually true rather than aspirational.
 *
 * Public API notes (kept compatible with the previous KV store where it made
 * sense so handlers and the Persian UX stay stable):
 *   - products / orders / users keep their old shapes (camelCase JS objects).
 *   - orders keep { customer: {name, phone, address}, lines: [...] }.
 *   - carts keep { items: { "<productId>": qty } }.
 */

import { LIMITS } from './validate.js';
import { ORDER_STATUS, ORDER_TRANSITIONS } from './messages.js';

const STATE_TTL_MS = 60 * 60 * 1000; // conversation states live for 1 hour

export class Store {
  constructor(db) {
    if (!db) {
      throw new Error(
        'D1 binding "DB" is missing — create a database (npx wrangler d1 create shoptelgram), bind it in wrangler.jsonc and apply migrations (npm run d1:migrate).',
      );
    }
    this.db = db;
  }

  // ---- low level helpers ---------------------------------------------------
  _all(sql, ...params) {
    return this.db
      .prepare(sql)
      .bind(...params)
      .all()
      .then((r) => r.results);
  }

  _one(sql, ...params) {
    return this.db
      .prepare(sql)
      .bind(...params)
      .first();
  }

  _run(sql, ...params) {
    return this.db
      .prepare(sql)
      .bind(...params)
      .run();
  }

  _assertInt(n, name, max = LIMITS.stock) {
    if (!Number.isSafeInteger(n) || n < 0 || n > max) {
      throw new Error(`invalid ${name}`);
    }
  }

  // ---- products ------------------------------------------------------------
  async createProduct(data) {
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    if (!title || title.length > LIMITS.title) throw new Error('invalid product title');
    this._assertInt(data.price, 'price', LIMITS.price);
    this._assertInt(data.stock ?? 0, 'stock');
    const description =
      typeof data.description === 'string' ? data.description.slice(0, LIMITS.description) : '';
    const category = typeof data.category === 'string' ? data.category.slice(0, LIMITS.category) : '';
    const photo = typeof data.photo === 'string' ? data.photo : null;

    const r = await this._run(
      `INSERT INTO products (title, description, price, stock, photo, category, active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      title,
      description,
      data.price,
      data.stock ?? 0,
      photo,
      category,
      Date.now(),
    );
    return this.getProduct(r.meta.last_row_id);
  }

  async getProduct(id) {
    const row = await this._one('SELECT * FROM products WHERE id = ?', id);
    return row ? this._rowToProduct(row) : null;
  }

  _rowToProduct(r) {
    return {
      id: r.id,
      title: r.title,
      description: r.description,
      price: r.price,
      stock: r.stock,
      photo: r.photo,
      category: r.category,
      active: !!r.active,
      createdAt: r.created_at,
    };
  }

  async updateProduct(id, patch) {
    const current = await this.getProduct(id);
    if (!current) return null;

    const allowed = {};
    if ('title' in patch) {
      const t = typeof patch.title === 'string' ? patch.title.trim() : '';
      if (!t || t.length > LIMITS.title) throw new Error('invalid product title');
      allowed.title = t;
    }
    if ('description' in patch) {
      if (typeof patch.description !== 'string') throw new Error('invalid description');
      allowed.description = patch.description.slice(0, LIMITS.description);
    }
    if ('price' in patch) {
      this._assertInt(patch.price, 'price', LIMITS.price);
      allowed.price = patch.price;
    }
    if ('stock' in patch) {
      this._assertInt(patch.stock, 'stock');
      allowed.stock = patch.stock;
    }
    if ('photo' in patch) {
      if (patch.photo !== null && typeof patch.photo !== 'string') throw new Error('invalid photo');
      allowed.photo = patch.photo;
    }
    if ('category' in patch) {
      if (typeof patch.category !== 'string') throw new Error('invalid category');
      allowed.category = patch.category.slice(0, LIMITS.category);
    }
    if ('active' in patch) {
      if (typeof patch.active !== 'boolean') throw new Error('invalid active flag');
      allowed.active = patch.active ? 1 : 0;
    }

    const keys = Object.keys(allowed);
    if (keys.length === 0) return current;
    const setSql = keys.map((k) => `${k} = ?`).join(', ');
    await this._run(`UPDATE products SET ${setSql} WHERE id = ?`, ...keys.map((k) => allowed[k]), id);
    return this.getProduct(id);
  }

  deleteProduct(id) {
    return this._run('DELETE FROM products WHERE id = ?', id);
  }

  async listProducts({ activeOnly = false } = {}) {
    const rows = activeOnly
      ? await this._all('SELECT * FROM products WHERE active = 1 AND stock > 0 ORDER BY id DESC')
      : await this._all('SELECT * FROM products ORDER BY id DESC');
    return rows.map((r) => this._rowToProduct(r));
  }

  /** Paged listing for admin screens: { items, total, page, pages }. */
  async listProductsPage({ page = 1, pageSize = LIMITS.pageSize, activeOnly = false } = {}) {
    const where = activeOnly ? 'WHERE active = 1 AND stock > 0' : '';
    const total = (await this._one(`SELECT COUNT(*) AS n FROM products ${where}`)).n;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page), pages);
    const rows = await this._all(
      `SELECT * FROM products ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      pageSize,
      (current - 1) * pageSize,
    );
    return { items: rows.map((r) => this._rowToProduct(r)), total, page: current, pages };
  }

  async categories() {
    const rows = await this._all(
      `SELECT DISTINCT category FROM products WHERE active = 1 AND stock > 0 AND category != '' ORDER BY category`,
    );
    return rows.map((r) => r.category);
  }

  // ---- cart ----------------------------------------------------------------
  async getCart(userId) {
    const rows = await this._all('SELECT product_id, qty FROM cart_items WHERE user_id = ?', userId);
    const items = {};
    for (const r of rows) items[String(r.product_id)] = r.qty;
    return { items };
  }

  /** Legacy compat: replace the whole cart from an { items: {pid: qty} } map. */
  async setCart(userId, cart) {
    const entries = Object.entries(cart?.items ?? {}).filter(([, q]) => Number.isInteger(q) && q > 0);
    const stmts = [this.db.prepare('DELETE FROM cart_items WHERE user_id = ?').bind(userId)];
    for (const [pid, qty] of entries) {
      stmts.push(
        this.db
          .prepare('INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)')
          .bind(userId, Number(pid), qty),
      );
    }
    await this.db.batch(stmts);
    return this.getCart(userId);
  }

  async addToCart(userId, productId, qty = 1) {
    this._assertInt(qty, 'qty', LIMITS.qtyPerLine);
    if (qty < 1) throw new Error('invalid qty');
    await this._run(
      `INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)
       ON CONFLICT(user_id, product_id) DO UPDATE SET qty = qty + excluded.qty`,
      userId,
      productId,
      qty,
    );
    return this.getCart(userId);
  }

  async setCartQty(userId, productId, qty) {
    this._assertInt(qty, 'qty', LIMITS.qtyPerLine);
    if (qty <= 0) {
      await this._run('DELETE FROM cart_items WHERE user_id = ? AND product_id = ?', userId, productId);
    } else {
      await this._run(
        `INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?)
         ON CONFLICT(user_id, product_id) DO UPDATE SET qty = excluded.qty`,
        userId,
        productId,
        qty,
      );
    }
    return this.getCart(userId);
  }

  clearCart(userId) {
    return this._run('DELETE FROM cart_items WHERE user_id = ?', userId);
  }

  /**
   * Resolve the cart into line items with live product data. Lines whose
   * product was deleted disappear; inactive / out-of-stock lines are flagged
   * (available: false + reason) so the UI can warn and checkout can refuse.
   */
  async cartDetails(userId) {
    const rows = await this._all(
      `SELECT p.*, c.qty FROM cart_items c JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ? ORDER BY p.id`,
      userId,
    );
    const lines = [];
    let total = 0;
    for (const r of rows) {
      const product = this._rowToProduct(r);
      const qty = r.qty;
      const available = product.active && product.stock >= qty;
      lines.push({
        product,
        qty,
        lineTotal: product.price * qty,
        available,
        reason: !product.active ? 'inactive' : product.stock < qty ? 'stock' : null,
      });
      total += product.price * qty;
    }
    return { lines, total };
  }

  // ---- checkout (atomic) -----------------------------------------------------
  /**
   * Create an order + decrement stock + clear the cart in ONE D1 batch
   * (a single SQL transaction — all-or-nothing).
   *
   * Correctness properties:
   *  - Stock is validated and decremented inside the same transaction using
   *    conditional updates (`stock >= qty`), so concurrent checkouts can never
   *    oversell and stock can never go negative (also CHECK-enforced).
   *  - `idempotencyKey` is UNIQUE: a repeated confirmation returns the already
   *    created order (duplicate: true) and touches nothing.
   *  - An `attempt` token marks the rows written by *this* call, so when the
   *    key already exists, item/stock/cart statements are no-ops.
   *
   * Returns:
   *   { ok: true,  order, duplicate: false } — created now
   *   { ok: true,  order, duplicate: true }  — already created by an earlier
   *                                            confirmation of the same key
   *   { ok: false, reason: 'empty' }
   *   { ok: false, reason: 'invalid', issues: [{ productId, title, reason }] }
   */
  async checkout(userId, customer, idempotencyKey) {
    const now = Date.now();
    const attempt = crypto.randomUUID();
    const key = String(idempotencyKey ?? '');
    if (!key) throw new Error('checkout requires an idempotency key');

    // Cart is non-empty and every line is active + in stock.
    const cartValid = `
      EXISTS (SELECT 1 FROM cart_items WHERE user_id = ?)
      AND NOT EXISTS (
        SELECT 1 FROM cart_items c JOIN products p ON p.id = c.product_id
        WHERE c.user_id = ? AND (p.active = 0 OR p.stock < c.qty)
      )`;

    await this.db.batch([
      // 1. Insert the order only if the key is fresh and the cart is fully valid.
      this.db
        .prepare(
          `INSERT INTO orders (user_id, customer_name, customer_phone, customer_address, total, status, idempotency_key, attempt, created_at, updated_at)
           SELECT ?, ?, ?, ?,
             (SELECT COALESCE(SUM(c.qty * p.price), 0)
              FROM cart_items c JOIN products p ON p.id = c.product_id WHERE c.user_id = ?),
             'pending', ?, ?, ?, ?
           WHERE NOT EXISTS (SELECT 1 FROM orders WHERE idempotency_key = ?)
             AND ${cartValid}`,
        )
        .bind(userId, customer.name, customer.phone, customer.address, userId, key, attempt, now, now, key, userId, userId),

      // 2. Snapshot line items — only for the order this attempt created.
      this.db
        .prepare(
          `INSERT INTO order_items (order_id, product_id, title, price, qty, line_total)
           SELECT o.id, c.product_id, p.title, p.price, c.qty, c.qty * p.price
           FROM orders o
           JOIN cart_items c ON c.user_id = o.user_id
           JOIN products p ON p.id = c.product_id
           WHERE o.attempt = ? AND o.idempotency_key = ?`,
        )
        .bind(attempt, key),

      // 3. Decrement stock conditionally; guarded on this attempt's order.
      this.db
        .prepare(
          `UPDATE products
           SET stock = stock - (SELECT qty FROM cart_items c WHERE c.user_id = ? AND c.product_id = products.id)
           WHERE id IN (SELECT product_id FROM cart_items WHERE user_id = ?)
             AND stock >= (SELECT qty FROM cart_items c WHERE c.user_id = ? AND c.product_id = products.id)
             AND EXISTS (SELECT 1 FROM orders WHERE attempt = ? AND idempotency_key = ?)`,
        )
        .bind(userId, userId, userId, attempt, key),

      // 4. Clear the cart — only when this attempt created the order.
      this.db
        .prepare(
          `DELETE FROM cart_items WHERE user_id = ?
           AND EXISTS (SELECT 1 FROM orders WHERE attempt = ? AND idempotency_key = ?)`,
        )
        .bind(userId, attempt, key),
    ]);

    const row = await this._one('SELECT * FROM orders WHERE idempotency_key = ?', key);
    if (row) {
      return { ok: true, order: await this._hydrateOrder(row), duplicate: row.attempt !== attempt };
    }

    // No order was created — diagnose why, so the user can fix their cart.
    const cartRows = await this._all(
      `SELECT c.product_id, c.qty, p.id AS pid, p.title, p.active, p.stock
       FROM cart_items c LEFT JOIN products p ON p.id = c.product_id
       WHERE c.user_id = ?`,
      userId,
    );
    if (cartRows.length === 0) return { ok: false, reason: 'empty' };
    const issues = cartRows
      .filter((r) => r.pid === null || r.active === 0 || r.stock < r.qty)
      .map((r) => ({
        productId: r.pid ?? r.product_id,
        title: r.title ?? '',
        reason: r.pid === null ? 'missing' : r.active === 0 ? 'inactive' : 'stock',
      }));
    return { ok: false, reason: 'invalid', issues };
  }

  // ---- orders ----------------------------------------------------------------
  _rowToOrder(r, lines) {
    return {
      id: r.id,
      userId: r.user_id,
      customer: {
        name: r.customer_name,
        phone: r.customer_phone,
        address: r.customer_address,
      },
      lines,
      total: r.total,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  async _hydrateOrder(row) {
    const items = await this._all(
      'SELECT product_id, title, price, qty FROM order_items WHERE order_id = ? ORDER BY rowid',
      row.id,
    );
    return this._rowToOrder(
      row,
      items.map((i) => ({ productId: i.product_id, title: i.title, price: i.price, qty: i.qty })),
    );
  }

  async getOrder(id) {
    const row = await this._one('SELECT * FROM orders WHERE id = ?', id);
    return row ? this._hydrateOrder(row) : null;
  }

  async listOrders({ userId = null, limit = 100 } = {}) {
    const rows = userId
      ? await this._all('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit)
      : await this._all('SELECT * FROM orders ORDER BY id DESC LIMIT ?', limit);
    return Promise.all(rows.map((r) => this._hydrateOrder(r)));
  }

  /** Paged listing for the admin orders screen: { items, total, page, pages }. */
  async listOrdersPage({ page = 1, pageSize = LIMITS.pageSize, status = null } = {}) {
    const where = status ? 'WHERE status = ?' : '';
    const total = (
      await this._one(`SELECT COUNT(*) AS n FROM orders ${where}`, ...(status ? [status] : []))
    ).n;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const current = Math.min(Math.max(1, page), pages);
    const rows = await this._all(
      `SELECT * FROM orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
      ...(status ? [status] : []),
      pageSize,
      (current - 1) * pageSize,
    );
    const items = await Promise.all(rows.map((r) => this._hydrateOrder(r)));
    return { items, total, page: current, pages };
  }

  /**
   * Apply a status transition, enforcing ORDER_TRANSITIONS. The UPDATE is
   * guarded with `WHERE status = <expected>` so two racing admins cannot both
   * move the same order.
   */
  async setOrderStatus(id, status) {
    if (!ORDER_STATUS[status]) return { ok: false, reason: 'invalid-status' };
    const current = await this.getOrder(id);
    if (!current) return { ok: false, reason: 'missing' };
    if (!(ORDER_TRANSITIONS[current.status] || []).includes(status)) {
      return { ok: false, reason: 'invalid-transition', order: current };
    }
    const r = await this._run(
      'UPDATE orders SET status = ?, updated_at = ? WHERE id = ? AND status = ?',
      status,
      Date.now(),
      id,
      current.status,
    );
    if (r.meta.changes === 0) {
      return { ok: false, reason: 'conflict', order: await this.getOrder(id) };
    }
    return { ok: true, order: await this.getOrder(id) };
  }

  // ---- users -----------------------------------------------------------------
  async upsertUser(from) {
    await this._run(
      `INSERT INTO users (id, first_name, last_name, username, joined_at, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         first_name = excluded.first_name, last_name = excluded.last_name,
         username = excluded.username, last_seen = excluded.last_seen`,
      from.id,
      from.first_name || '',
      from.last_name || '',
      from.username || '',
      Date.now(),
      Date.now(),
    );
    return this.getUser(from.id);
  }

  async getUser(id) {
    const r = await this._one('SELECT * FROM users WHERE id = ?', id);
    if (!r) return null;
    return {
      id: r.id,
      firstName: r.first_name,
      lastName: r.last_name,
      username: r.username,
      contactName: r.contact_name,
      phone: r.phone,
      joinedAt: r.joined_at,
      lastSeen: r.last_seen,
    };
  }

  async saveUserContact(id, patch) {
    const name = typeof patch.contactName === 'string' ? patch.contactName.slice(0, LIMITS.name) : '';
    const phone = typeof patch.phone === 'string' ? patch.phone : '';
    await this._run(
      `INSERT INTO users (id, contact_name, phone, joined_at, last_seen) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET contact_name = excluded.contact_name, phone = excluded.phone`,
      id,
      name,
      phone,
      Date.now(),
      Date.now(),
    );
    return this.getUser(id);
  }

  listUsers() {
    return this._all('SELECT * FROM users ORDER BY id').then((rows) =>
      rows.map((r) => ({
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        username: r.username,
        joinedAt: r.joined_at,
        lastSeen: r.last_seen,
      })),
    );
  }

  /** Broadcast support: total users + one page of recipient ids. */
  countUsers() {
    return this._one('SELECT COUNT(*) AS n FROM users').then((r) => r.n);
  }

  async usersPage(offset, limit) {
    const rows = await this._all('SELECT id FROM users ORDER BY id LIMIT ? OFFSET ?', limit, offset);
    return rows.map((r) => r.id);
  }

  // ---- conversation state ------------------------------------------------------
  async getState(userId) {
    const r = await this._one(
      'SELECT data FROM states WHERE user_id = ? AND expires_at > ?',
      userId,
      Date.now(),
    );
    if (r) return JSON.parse(r.data);
    // Lazy cleanup of this user's expired state.
    await this._run('DELETE FROM states WHERE user_id = ? AND expires_at <= ?', userId, Date.now());
    return null;
  }

  async setState(userId, state) {
    await this._run(
      `INSERT INTO states (user_id, data, expires_at) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`,
      userId,
      JSON.stringify(state),
      Date.now() + STATE_TTL_MS,
    );
  }

  clearState(userId) {
    return this._run('DELETE FROM states WHERE user_id = ?', userId);
  }

  // ---- broadcasts ---------------------------------------------------------------
  _rowToBroadcast(r) {
    return {
      id: r.id,
      adminId: r.admin_id,
      text: r.text,
      total: r.total,
      sent: r.sent,
      failed: r.failed,
      nextOffset: r.next_offset,
      status: r.status,
      createdAt: r.created_at,
    };
  }

  async createBroadcast(adminId, text, total) {
    const r = await this._run(
      'INSERT INTO broadcasts (admin_id, text, total, created_at) VALUES (?, ?, ?, ?)',
      adminId,
      text,
      total,
      Date.now(),
    );
    return this.getBroadcast(r.meta.last_row_id);
  }

  async getBroadcast(id) {
    const r = await this._one('SELECT * FROM broadcasts WHERE id = ?', id);
    return r ? this._rowToBroadcast(r) : null;
  }

  async updateBroadcast(id, { sentDelta = 0, failedDelta = 0, nextOffset = null, status = null } = {}) {
    await this._run(
      `UPDATE broadcasts SET sent = sent + ?, failed = failed + ?,
        next_offset = COALESCE(?, next_offset), status = COALESCE(?, status)
       WHERE id = ?`,
      sentDelta,
      failedDelta,
      nextOffset,
      status,
      id,
    );
    return this.getBroadcast(id);
  }

  /**
   * Compare-and-set claim of the next broadcast chunk [from, to). Returns the
   * claimed range, or null when another caller already advanced the offset —
   * this is what makes double-tapped «ادامه ارسال» safe.
   */
  async claimBroadcastChunk(id, fromOffset, toOffset) {
    const r = await this._run(
      'UPDATE broadcasts SET next_offset = ? WHERE id = ? AND next_offset = ?',
      toOffset,
      id,
      fromOffset,
    );
    return r.meta.changes === 1 ? { start: fromOffset, next: toOffset } : null;
  }

  // ---- stats -----------------------------------------------------------------
  async stats() {
    const [products, activeProducts, orders, pendingOrders, users, revenue] = await Promise.all([
      this._one('SELECT COUNT(*) AS n FROM products'),
      this._one('SELECT COUNT(*) AS n FROM products WHERE active = 1 AND stock > 0'),
      this._one('SELECT COUNT(*) AS n FROM orders'),
      this._one("SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'"),
      this._one('SELECT COUNT(*) AS n FROM users'),
      this._one("SELECT COALESCE(SUM(total), 0) AS n FROM orders WHERE status != 'cancelled'"),
    ]);
    return {
      products: products.n,
      activeProducts: activeProducts.n,
      orders: orders.n,
      pendingOrders: pendingOrders.n,
      users: users.n,
      revenue: revenue.n,
    };
  }
}
