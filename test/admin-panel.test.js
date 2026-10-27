import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'node:crypto';
import worker from '../src/worker.js';
import { makeEnv, restoreFetch, sent, seedProduct, last } from './helpers/harness.js';

const PASSWORD = 'panel-pass-123';
const BASE = 'https://bot.example.com';
const IP = '198.51.100.7'; // used by the throttle test only

let env, calls;
let loginIpCounter = 0; // unique IP per login so the per-isolate throttle never leaks between tests

beforeEach(async () => {
  ({ env, calls } = await makeEnv({ envOver: { ADMIN_PANEL_PASSWORD: PASSWORD } }));
});
afterEach(restoreFetch);

async function call(path, { method = 'GET', body, cookie, origin, ip = IP } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (ip) headers['cf-connecting-ip'] = ip;
  const req = new Request(BASE + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {})) };
  const res = await worker.fetch(req, env, ctx);
  await Promise.all(pending);
  const jsonBody = res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text();
  return { status: res.status, headers: res.headers, body: jsonBody };
}

async function login() {
  const res = await call('/admin/login', {
    method: 'POST',
    body: { password: PASSWORD },
    ip: '10.1.0.' + ++loginIpCounter,
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get('set-cookie');
  expect(setCookie).toContain('HttpOnly');
  expect(setCookie).toContain('SameSite=Strict');
  expect(setCookie).toContain('Secure');
  return setCookie.split(';')[0]; // "shoptelgram_admin=<token>"
}

/** forge a token with the same format but arbitrary expiry/signature */
function forgeToken(exp, badSig) {
  const sig = createHmac('sha256', PASSWORD).update(`shoptelgram-panel:${exp}`).digest('base64url');
  return `${exp}.${badSig ?? sig}`;
}

describe('panel auth', () => {
  it('serves the panel HTML at /admin with security headers', async () => {
    const res = await call('/admin');
    expect(res.status).toBe(200);
    expect(res.body).toContain('<!doctype html');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('login: wrong password 401, right password sets a signed cookie', async () => {
    expect((await call('/admin/login', { method: 'POST', body: { password: 'wrong' } })).status).toBe(401);
    const cookie = await login();
    expect(cookie.startsWith('shoptelgram_admin=')).toBe(true);
    const token = cookie.split('=')[1];
    expect(token).toMatch(/^\d+\.[A-Za-z0-9_-]+$/);
  });

  it('login is disabled (503) without ADMIN_PANEL_PASSWORD', async () => {
    env.ADMIN_PANEL_PASSWORD = '';
    const res = await call('/admin/login', { method: 'POST', body: { password: 'x' } });
    expect(res.status).toBe(503);
  });

  it('throttles repeated failed logins from the same IP', async () => {
    for (let i = 0; i < 10; i++) {
      await call('/admin/login', { method: 'POST', body: { password: 'nope' } });
    }
    const res = await call('/admin/login', { method: 'POST', body: { password: 'nope' } });
    expect(res.status).toBe(429);
    // a different IP is unaffected
    const other = await call('/admin/login', { method: 'POST', body: { password: PASSWORD }, ip: '203.0.113.9' });
    expect(other.status).toBe(200);
  });

  it('API without a cookie -> 401', async () => {
    const res = await call('/admin/api/stats');
    expect(res.status).toBe(401);
  });

  it('API with a forged signature -> 401', async () => {
    const res = await call('/admin/api/stats', { cookie: 'shoptelgram_admin=9999999999999.bogussig' });
    expect(res.status).toBe(401);
  });

  it('API with an expired but correctly signed token -> 401', async () => {
    const expired = forgeToken(Date.now() - 1000);
    const res = await call('/admin/api/stats', { cookie: `shoptelgram_admin=${expired}` });
    expect(res.status).toBe(401);
  });

  it('a correctly signed future token works', async () => {
    const token = forgeToken(Date.now() + 60_000);
    const res = await call('/admin/api/stats', { cookie: `shoptelgram_admin=${token}` });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('logout clears the cookie', async () => {
    const res = await call('/admin/logout', { method: 'POST' });
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('api: csrf protection', () => {
  it('rejects mutations whose Origin does not match', async () => {
    const cookie = await login();
    const res = await call('/admin/api/products', {
      method: 'POST',
      cookie,
      origin: 'https://evil.example',
      body: { title: 'x', price: 1, stock: 1 },
    });
    expect(res.status).toBe(403);
  });

  it('allows mutations from the same origin', async () => {
    const cookie = await login();
    const res = await call('/admin/api/products', {
      method: 'POST',
      cookie,
      origin: BASE,
      body: { title: 'کتاب', price: 100, stock: 3 },
    });
    expect(res.status).toBe(201);
    expect(res.body.product.title).toBe('کتاب');
  });
});

describe('api: products', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await login();
  });

  it('creates, lists (paginated), patches and deletes products', async () => {
    const created = await call('/admin/api/products', {
      method: 'POST', cookie, origin: BASE,
      body: { title: 'گوشی', price: 5000, stock: 10, category: 'موبایل', description: 'توضیح' },
    });
    expect(created.status).toBe(201);
    const id = created.body.product.id;

    const list = await call('/admin/api/products?page=1', { cookie });
    expect(list.body.total).toBe(1);
    expect(list.body.items[0].id).toBe(id);

    const patched = await call(`/admin/api/products/${id}`, {
      method: 'PATCH', cookie, origin: BASE, body: { price: 6000, active: false },
    });
    expect(patched.body.product).toMatchObject({ price: 6000, active: false, title: 'گوشی' });

    const bad = await call(`/admin/api/products/${id}`, {
      method: 'PATCH', cookie, origin: BASE, body: { price: -5 },
    });
    expect(bad.status).toBe(400);
    expect(bad.body.issues.price).toBeTruthy();

    const gone = await call(`/admin/api/products/999`, {
      method: 'PATCH', cookie, origin: BASE, body: { price: 1 },
    });
    expect(gone.status).toBe(404);

    expect((await call(`/admin/api/products/${id}`, { method: 'DELETE', cookie, origin: BASE })).status).toBe(200);
    expect((await call('/admin/api/products', { cookie })).body.total).toBe(0);
  });

  it('rejects invalid create payloads with per-field Persian errors', async () => {
    const res = await call('/admin/api/products', {
      method: 'POST', cookie, origin: BASE,
      body: { title: '', price: 'abc', stock: -1, photo: 'notaurl' },
    });
    expect(res.status).toBe(400);
    expect(res.body.issues).toEqual({
      title: expect.any(String),
      price: expect.any(String),
      stock: expect.any(String),
      photo: expect.any(String),
    });
  });

  it('validates numeric ids', async () => {
    expect((await call('/admin/api/products/abc', { method: 'DELETE', cookie, origin: BASE })).status).toBe(400);
  });
});

describe('api: orders', () => {
  let cookie;
  beforeEach(async () => {
    cookie = await login();
  });

  async function makeOrder() {
    const p = await seedProduct(env.DB, { stock: 5 });
    // create an order directly through the store for API testing
    const { Store } = await import('../src/store.js');
    const store = new Store(env.DB);
    await store.addToCart(222, p.id, 1);
    const res = await store.checkout(222, { name: 'علی', phone: '09121234567', address: 'تهران' }, 'key-api-1');
    expect(res.ok).toBe(true);
    return res.order;
  }

  it('lists orders with pagination and status filter', async () => {
    const o = await makeOrder();
    const all = await call('/admin/api/orders', { cookie });
    expect(all.body.total).toBe(1);
    expect(all.body.items[0].id).toBe(o.id);
    expect(all.body.items[0].lines[0].title).toBe('کتاب تست');

    const pending = await call('/admin/api/orders?status=pending', { cookie });
    expect(pending.body.items).toHaveLength(1);
    const bad = await call('/admin/api/orders?status=hacked', { cookie });
    expect(bad.status).toBe(400);
  });

  it('returns order detail with lines', async () => {
    const o = await makeOrder();
    const res = await call(`/admin/api/order/${o.id}`, { cookie });
    expect(res.body.order.customer.phone).toBe('09121234567');
    expect(res.body.order.lines).toHaveLength(1);
    expect((await call('/admin/api/order/999', { cookie })).status).toBe(404);
  });

  it('applies valid transitions and rejects invalid ones with 409', async () => {
    const o = await makeOrder();
    const ok = await call(`/admin/api/order/${o.id}/status`, {
      method: 'PATCH', cookie, origin: BASE, body: { status: 'confirmed' },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.order.status).toBe('confirmed');

    const invalid = await call(`/admin/api/order/${o.id}/status`, {
      method: 'PATCH', cookie, origin: BASE, body: { status: 'done' }, // confirmed -> done not allowed
    });
    expect(invalid.status).toBe(409);

    const unknown = await call(`/admin/api/order/${o.id}/status`, {
      method: 'PATCH', cookie, origin: BASE, body: { status: 'hacked' },
    });
    expect(unknown.status).toBe(400);
  });
});

describe('api: stats & broadcast', () => {
  it('returns stats', async () => {
    const cookie = await login();
    await seedProduct(env.DB);
    const res = await call('/admin/api/stats', { cookie });
    expect(res.body.stats).toMatchObject({ products: 1, activeProducts: 1, orders: 0, users: 0 });
  });

  it('starts a broadcast, sends a chunk and reports progress', async () => {
    const cookie = await login();
    const store = new (await import('../src/store.js')).Store(env.DB);
    for (let i = 0; i < 3; i++) await store.upsertUser({ id: 2000 + i, first_name: 'u' });

    const res = await call('/admin/api/broadcast', {
      method: 'POST', cookie, origin: BASE, body: { text: 'سلام از پنل 🎉' },
    });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
    expect(res.body.broadcast.total).toBe(3);
    expect(res.body.broadcast.sent).toBe(3);
    const sends = sent(calls, 'sendMessage').filter((c) => c.params.chat_id >= 2000);
    expect(sends).toHaveLength(3);
    expect(sends[0].params.parse_mode).toBeUndefined(); // plain text
    expect(sends[0].params.text).toBe('سلام از پنل 🎉');
    expect(last(calls, 'sendMessage')).toBeTruthy();
  });

  it('validates broadcast text', async () => {
    const cookie = await login();
    const res = await call('/admin/api/broadcast', { method: 'POST', cookie, origin: BASE, body: { text: '' } });
    expect(res.status).toBe(400);
  });

  it('continuing a finished broadcast is a no-op', async () => {
    const cookie = await login();
    const store = new (await import('../src/store.js')).Store(env.DB);
    await store.upsertUser({ id: 3001, first_name: 'u' });
    const first = await call('/admin/api/broadcast', { method: 'POST', cookie, origin: BASE, body: { text: 'x' } });
    expect(first.body.done).toBe(true);
    const again = await call('/admin/api/broadcast-continue', {
      method: 'POST', cookie, origin: BASE, body: { id: first.body.broadcast.id },
    });
    expect(again.body.done).toBe(true);
    expect(sent(calls, 'sendMessage').filter((c) => c.params.chat_id === 3001)).toHaveLength(1);
  });
});
