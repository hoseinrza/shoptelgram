/**
 * Data-access layer on top of a single Cloudflare KV namespace (binding: SHOP).
 *
 * Key layout:
 *   product:<id>      -> Product JSON
 *   order:<id>        -> Order JSON
 *   user:<id>         -> User JSON
 *   cart:<userId>     -> Cart JSON ({ items: { productId: qty } })
 *   state:<userId>    -> Conversation state JSON (multi-step flows), 1h TTL
 *   seq:<name>        -> monotonically increasing counter (products/orders)
 *
 * KV is eventually consistent, which is fine for a small shop bot. Each write
 * is a single key so there are no cross-key transactions to worry about.
 */

export class Store {
  constructor(kv) {
    if (!kv) throw new Error('KV binding "SHOP" is missing — create it and bind it in wrangler.jsonc');
    this.kv = kv;
  }

  // ---- low level helpers -------------------------------------------------
  async _get(key) {
    return this.kv.get(key, 'json');
  }
  _put(key, value, opts) {
    return this.kv.put(key, JSON.stringify(value), opts);
  }
  _del(key) {
    return this.kv.delete(key);
  }

  async _nextId(name) {
    const key = `seq:${name}`;
    const current = parseInt((await this.kv.get(key)) || '0', 10) || 0;
    const next = current + 1;
    await this.kv.put(key, String(next));
    return next;
  }

  async _listAll(prefix) {
    const out = [];
    let cursor;
    do {
      const page = await this.kv.list({ prefix, cursor });
      for (const k of page.keys) {
        const v = await this._get(k.name);
        if (v) out.push(v);
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    return out;
  }

  // ---- products ----------------------------------------------------------
  async createProduct(data) {
    const id = await this._nextId('product');
    const product = {
      id,
      title: data.title,
      description: data.description || '',
      price: data.price, // integer, in the configured currency's smallest practical unit (e.g. Toman)
      stock: data.stock ?? 0,
      photo: data.photo || null, // Telegram file_id or image URL
      category: data.category || '',
      active: true,
      createdAt: Date.now(),
    };
    await this._put(`product:${id}`, product);
    return product;
  }

  getProduct(id) {
    return this._get(`product:${id}`);
  }

  async updateProduct(id, patch) {
    const p = await this.getProduct(id);
    if (!p) return null;
    const updated = { ...p, ...patch, id: p.id };
    await this._put(`product:${id}`, updated);
    return updated;
  }

  deleteProduct(id) {
    return this._del(`product:${id}`);
  }

  async listProducts({ activeOnly = false } = {}) {
    const items = await this._listAll('product:');
    items.sort((a, b) => b.createdAt - a.createdAt);
    return activeOnly ? items.filter((p) => p.active && p.stock > 0) : items;
  }

  async categories() {
    const items = await this.listProducts({ activeOnly: true });
    return [...new Set(items.map((p) => p.category).filter(Boolean))];
  }

  async decrementStock(id, qty) {
    const p = await this.getProduct(id);
    if (!p) return;
    await this.updateProduct(id, { stock: Math.max(0, p.stock - qty) });
  }

  // ---- cart --------------------------------------------------------------
  async getCart(userId) {
    return (await this._get(`cart:${userId}`)) || { items: {} };
  }

  async setCart(userId, cart) {
    if (!cart.items || Object.keys(cart.items).length === 0) {
      await this._del(`cart:${userId}`);
    } else {
      await this._put(`cart:${userId}`, cart);
    }
  }

  async addToCart(userId, productId, qty = 1) {
    const cart = await this.getCart(userId);
    cart.items[productId] = (cart.items[productId] || 0) + qty;
    if (cart.items[productId] <= 0) delete cart.items[productId];
    await this.setCart(userId, cart);
    return cart;
  }

  async setCartQty(userId, productId, qty) {
    const cart = await this.getCart(userId);
    if (qty <= 0) delete cart.items[productId];
    else cart.items[productId] = qty;
    await this.setCart(userId, cart);
    return cart;
  }

  clearCart(userId) {
    return this._del(`cart:${userId}`);
  }

  /** Resolve a cart into line items with live product data and a total. */
  async cartDetails(userId) {
    const cart = await this.getCart(userId);
    const lines = [];
    let total = 0;
    for (const [pid, qty] of Object.entries(cart.items)) {
      const product = await this.getProduct(pid);
      if (!product) continue; // product was deleted; skip silently
      const lineTotal = product.price * qty;
      total += lineTotal;
      lines.push({ product, qty, lineTotal });
    }
    return { lines, total };
  }

  // ---- orders ------------------------------------------------------------
  async createOrder(data) {
    const id = await this._nextId('order');
    const order = {
      id,
      userId: data.userId,
      customer: data.customer, // { name, phone, address }
      lines: data.lines, // [{ productId, title, price, qty }]
      total: data.total,
      status: 'pending', // pending | confirmed | shipped | done | cancelled
      createdAt: Date.now(),
    };
    await this._put(`order:${id}`, order);
    return order;
  }

  getOrder(id) {
    return this._get(`order:${id}`);
  }

  updateOrderStatus(id, status) {
    return this.updateOrder(id, { status });
  }

  async updateOrder(id, patch) {
    const o = await this.getOrder(id);
    if (!o) return null;
    const updated = { ...o, ...patch, id: o.id };
    await this._put(`order:${id}`, updated);
    return updated;
  }

  async listOrders({ userId = null } = {}) {
    const items = await this._listAll('order:');
    items.sort((a, b) => b.createdAt - a.createdAt);
    return userId ? items.filter((o) => String(o.userId) === String(userId)) : items;
  }

  // ---- users -------------------------------------------------------------
  async upsertUser(from) {
    const key = `user:${from.id}`;
    const existing = (await this._get(key)) || { id: from.id, joinedAt: Date.now() };
    const user = {
      ...existing,
      id: from.id,
      firstName: from.first_name || '',
      lastName: from.last_name || '',
      username: from.username || '',
      lastSeen: Date.now(),
    };
    await this._put(key, user);
    return user;
  }

  getUser(id) {
    return this._get(`user:${id}`);
  }

  async saveUserContact(id, patch) {
    const u = (await this.getUser(id)) || { id, joinedAt: Date.now() };
    const updated = { ...u, ...patch };
    await this._put(`user:${id}`, updated);
    return updated;
  }

  listUsers() {
    return this._listAll('user:');
  }

  // ---- conversation state ------------------------------------------------
  getState(userId) {
    return this._get(`state:${userId}`);
  }

  setState(userId, state) {
    // States expire after 1 hour so abandoned flows don't linger.
    return this._put(`state:${userId}`, state, { expirationTtl: 3600 });
  }

  clearState(userId) {
    return this._del(`state:${userId}`);
  }

  // ---- stats -------------------------------------------------------------
  async stats() {
    const [products, orders, users] = await Promise.all([
      this.listProducts(),
      this.listOrders(),
      this.listUsers(),
    ]);
    const revenue = orders
      .filter((o) => o.status !== 'cancelled')
      .reduce((s, o) => s + o.total, 0);
    return {
      products: products.length,
      activeProducts: products.filter((p) => p.active && p.stock > 0).length,
      orders: orders.length,
      pendingOrders: orders.filter((o) => o.status === 'pending').length,
      users: users.length,
      revenue,
    };
  }
}
