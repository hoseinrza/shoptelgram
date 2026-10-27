/**
 * Web admin panel backend: session auth + JSON API.
 *
 * Auth model (chosen: password + signed cookie):
 *  - ADMIN_PANEL_PASSWORD secret; compared constant-time, never logged.
 *  - Session token = "<expMs>.<HMAC-SHA256(key=password, msg=expMs)>" —
 *    stateless, Web Crypto only (same primitives in Workers and Node).
 *  - Cookie: HttpOnly + Secure + SameSite=Strict + Path=/, 12h lifetime.
 *  - Every /admin/api/* request independently verifies the cookie server-side.
 *  - State-changing requests additionally require a matching Origin header
 *    when the browser sends one (belt & suspenders on top of SameSite=Strict).
 *  - Login is throttled per-IP with an in-isolate sliding window. This is a
 *    mitigation, not a hard guarantee: isolates are per-colo and ephemeral —
 *    the HMAC + strong password remain the real protection.
 *
 * The API goes through the same Store (D1) and validation used by the bot,
 * so checkout atomicity, order transitions and input limits are identical.
 */

import { Store } from '../store.js';
import { Telegram } from '../telegram.js';
import { secureCompare, cleanText, asNonNegativeInt, asId, LIMITS } from '../validate.js';
import { ORDER_STATUS, ORDER_TRANSITIONS } from '../messages.js';
import { runBroadcastChunk } from '../broadcast.js';
import { panelHtml } from './panel.js';

const COOKIE_NAME = 'shoptelgram_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const enc = new TextEncoder();

// ---- session tokens --------------------------------------------------------

function base64url(bytes) {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return base64url(new Uint8Array(sig));
}

async function issueToken(password, now = Date.now()) {
  const exp = now + SESSION_TTL_MS;
  const sig = await hmac(password, `shoptelgram-panel:${exp}`);
  return `${exp}.${sig}`;
}

async function verifyToken(token, password, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [expRaw, sig] = token.split('.');
  const exp = Number(expRaw);
  if (!Number.isSafeInteger(exp) || exp <= now || !sig) return false;
  const expected = await hmac(password, `shoptelgram-panel:${exp}`);
  return secureCompare(sig, expected);
}

// ---- cookies & csrf --------------------------------------------------------

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function sessionCookie(token) {
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

const CLEAR_COOKIE = `${COOKIE_NAME}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;

/** Cross-site browser requests carry an Origin — reject mismatches. */
function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // non-browser client; SameSite=Strict still guards the cookie
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

// ---- login throttle (per-isolate, best effort) ------------------------------

const loginAttempts = new Map(); // ip -> [timestamps]
const LOGIN_WINDOW_MS = 5 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

function loginAllowed(ip) {
  const now = Date.now();
  const arr = (loginAttempts.get(ip) || []).filter((t) => now - t < LOGIN_WINDOW_MS);
  if (arr.length >= LOGIN_MAX_ATTEMPTS) {
    loginAttempts.set(ip, arr);
    return false;
  }
  arr.push(now);
  loginAttempts.set(ip, arr);
  return true;
}

// ---- helpers ---------------------------------------------------------------

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

const fail = (status, error) => json({ ok: false, error }, status);

async function readJsonBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

function clientIp(request) {
  return request.headers.get('cf-connecting-ip') || 'unknown';
}

function unauthorized() {
  return fail(401, 'unauthorized');
}

// ---- route dispatcher --------------------------------------------------------

/**
 * Entry from worker.js for everything under /admin (except /webhook etc.).
 * Returns a Response.
 */
export async function handleAdminRoute(request, env, pathname) {
  // The panel HTML itself is public — the SPA checks the session client-side
  // and every data request is verified server-side below.
  if (request.method === 'GET' && (pathname === '/admin' || pathname === '/admin/')) {
    return new Response(panelHtml(env), {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy':
          "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src https: data:; connect-src 'self'",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  if (pathname === '/admin/login' && request.method === 'POST') return login(request, env);
  if (pathname === '/admin/logout' && request.method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': CLEAR_COOKIE });
  }

  if (pathname.startsWith('/admin/api/')) {
    return apiRoute(request, env, pathname);
  }

  return fail(404, 'not found');
}

async function login(request, env) {
  if (!env.ADMIN_PANEL_PASSWORD) {
    return fail(503, 'panel disabled — set the ADMIN_PANEL_PASSWORD secret first');
  }
  if (!loginAllowed(clientIp(request))) {
    return fail(429, 'تلاش‌های زیاد؛ چند دقیقه بعد دوباره امتحان کنید.');
  }
  const body = await readJsonBody(request);
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!secureCompare(password, env.ADMIN_PANEL_PASSWORD)) {
    return fail(401, 'رمز اشتباه است.');
  }
  loginAttempts.delete(clientIp(request));
  const token = await issueToken(env.ADMIN_PANEL_PASSWORD);
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie(token) });
}

async function apiRoute(request, env, pathname) {
  if (!env.ADMIN_PANEL_PASSWORD) return fail(503, 'panel disabled');
  const token = getCookie(request, COOKIE_NAME);
  const valid = await verifyToken(token, env.ADMIN_PANEL_PASSWORD);
  if (!valid) return unauthorized();

  // Mutations: extra CSRF guard on top of SameSite=Strict.
  if (request.method !== 'GET' && !sameOrigin(request)) {
    return fail(403, 'cross-origin request rejected');
  }

  const store = new Store(env.DB);
  const route = pathname.slice('/admin/api/'.length);
  const seg = route.split('/');
  const id = asId(seg[1] ?? '');

  if (request.method === 'GET') {
    switch (seg[0]) {
      case 'session':
        return json({ ok: true, user: 'admin' });
      case 'stats':
        return json({ ok: true, stats: await store.stats() });
      case 'products': {
        const page = Math.max(1, Number(new URL(request.url).searchParams.get('page')) || 1);
        return json({ ok: true, ...(await store.listProductsPage({ page })) });
      }
      case 'orders': {
        const url = new URL(request.url);
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
        const status = url.searchParams.get('status');
        if (status && !ORDER_STATUS[status]) return fail(400, 'وضعیت نامعتبر است.');
        return json({ ok: true, ...(await store.listOrdersPage({ page, status: status || null })) });
      }
      case 'order':
        if (id === null) return fail(400, 'شناسه نامعتبر است.');
        {
          const order = await store.getOrder(id);
          return order ? json({ ok: true, order }) : fail(404, 'سفارش پیدا نشد.');
        }
      case 'transitions': {
        const from = seg[1] ?? '';
        return json({ ok: true, transitions: ORDER_TRANSITIONS[from] ?? [] });
      }
      default:
        return fail(404, 'not found');
    }
  }

  if (request.method === 'POST') {
    switch (seg[0]) {
      case 'products':
        return createProduct(request, store);
      case 'broadcast':
        return startBroadcast(request, env, store);
      case 'broadcast-continue': {
        const body = await readJsonBody(request);
        const bId = asId(body?.id);
        if (bId === null) return fail(400, 'شناسه نامعتبر است.');
        const b = await store.getBroadcast(bId);
        if (!b) return fail(404, 'پیام همگانی پیدا نشد.');
        if (b.status === 'done') return json({ ok: true, done: true, broadcast: b });
        const res = await runBroadcastChunk(store, new Telegram(env.BOT_TOKEN), b);
        if (!res) return json({ ok: true, busy: true, broadcast: await store.getBroadcast(bId) });
        return json({ ok: true, done: res.done, broadcast: res.broadcast });
      }
      default:
        return fail(404, 'not found');
    }
  }

  if (request.method === 'PATCH') {
    if (seg[0] === 'products' || seg[0] === 'order') {
      if (id === null) return fail(400, 'شناسه نامعتبر است.');
      return seg[0] === 'products' ? patchProduct(request, store, id) : patchOrderStatus(request, store, id);
    }
    return fail(404, 'not found');
  }

  if (request.method === 'DELETE') {
    if (seg[0] === 'products') {
      if (id === null) return fail(400, 'شناسه نامعتبر است.');
      await store.deleteProduct(id);
      return json({ ok: true });
    }
    return fail(404, 'not found');
  }

  return fail(405, 'method not allowed');
}

// ---- resource handlers ------------------------------------------------------

function validateProductInput(body, { partial = false } = {}) {
  const errors = {};
  const out = {};

  const has = (k) => k in body;
  if (!partial || has('title')) {
    const title = cleanText(body.title, LIMITS.title);
    if (!title) errors.title = 'نام محصول الزامی است (حداکثر ۱۰۰ نویسه).';
    else out.title = title;
  }
  if (has('description')) {
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length > LIMITS.description) errors.description = `حداکثر ${LIMITS.description} نویسه.`;
    else out.description = description;
  }
  if (!partial || has('price')) {
    const price = asNonNegativeInt(body.price, LIMITS.price);
    if (price === null) errors.price = 'قیمت باید عدد صحیح نامنفی باشد.';
    else out.price = price;
  }
  if (!partial || has('stock')) {
    const stock = asNonNegativeInt(body.stock, LIMITS.stock);
    if (stock === null) errors.stock = 'موجودی باید عدد صحیح نامنفی باشد.';
    else out.stock = stock;
  }
  if (has('category')) {
    const category = typeof body.category === 'string' ? body.category.trim() : '';
    if (category.length > LIMITS.category) errors.category = `حداکثر ${LIMITS.category} نویسه.`;
    else out.category = category;
  }
  if (has('photo')) {
    const photo = typeof body.photo === 'string' ? body.photo.trim() : '';
    if (photo && (!/^https?:\/\//.test(photo) || photo.length > 400)) {
      errors.photo = 'عکس باید یک آدرس http(s) معتبر باشد.';
    } else {
      out.photo = photo || null;
    }
  }

  return { errors, out, valid: Object.keys(errors).length === 0 };
}

async function createProduct(request, store) {
  const body = await readJsonBody(request);
  if (!body) return fail(400, 'بدنهٔ درخواست نامعتبر است.');
  const { errors, out, valid } = validateProductInput(body);
  if (!valid) return json({ ok: false, error: 'اعتبارسنجی ناموفق بود.', issues: errors }, 400);
  const product = await store.createProduct({ ...out, photo: out.photo ?? null });
  return json({ ok: true, product }, 201);
}

async function patchProduct(request, store, id) {
  const body = await readJsonBody(request);
  if (!body) return fail(400, 'بدنهٔ درخواست نامعتبر است.');
  const { errors, out, valid } = validateProductInput(body, { partial: true });
  if (!valid) return json({ ok: false, error: 'اعتبارسنجی ناموفق بود.', issues: errors }, 400);
  if ('active' in body) {
    if (typeof body.active !== 'boolean') {
      return json({ ok: false, error: 'اعتبارسنجی ناموفق بود.', issues: { active: 'باید true/false باشد.' } }, 400);
    }
    out.active = body.active;
  }
  const product = await store.updateProduct(id, out);
  if (!product) return fail(404, 'محصول پیدا نشد.');
  return json({ ok: true, product });
}

async function patchOrderStatus(request, store, id) {
  const body = await readJsonBody(request);
  const status = typeof body?.status === 'string' ? body.status : '';
  if (!ORDER_STATUS[status]) return fail(400, 'وضعیت نامعتبر است.');
  const res = await store.setOrderStatus(id, status);
  if (!res.ok) {
    const msg =
      res.reason === 'missing'
        ? 'سفارش پیدا نشد.'
        : res.reason === 'invalid-status'
          ? 'وضعیت نامعتبر است.'
          : 'این تغییر وضعیت برای این سفارش مجاز نیست.';
    return fail(409, msg);
  }
  return json({ ok: true, order: res.order });
}

async function startBroadcast(request, env, store) {
  const body = await readJsonBody(request);
  const text = cleanText(body?.text, LIMITS.broadcast);
  if (!text) return fail(400, `متن پیام الزامی است (حداکثر ${LIMITS.broadcast} نویسه).`);
  const total = await store.countUsers();
  if (total === 0) return json({ ok: true, done: true, broadcast: null });
  const b = await store.createBroadcast(0, text, total); // admin_id=0 → ارسال از وب
  const res = await runBroadcastChunk(store, new Telegram(env.BOT_TOKEN), b);
  if (!res) return json({ ok: true, busy: true, broadcast: await store.getBroadcast(b.id) });
  return json({ ok: true, done: res.done, broadcast: res.broadcast });
}
