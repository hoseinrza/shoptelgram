/**
 * Test harness: a fake env with a real (in-memory D1) database and a stubbed
 * Telegram Bot API that records every outgoing call.
 */
import { vi } from 'vitest';
import { D1Stub } from './d1.js';
import { Store } from '../../src/store.js';
import { handleUpdate } from '../../src/router.js';

export const ADMIN_ID = 111;
export const USER_ID = 222;

function ok(result) {
  return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
}

function defaultTgResult(method, params) {
  switch (method) {
    case 'getMe':
      return ok({ id: 1, is_bot: true, username: 'testbot' });
    case 'sendMessage':
    case 'sendPhoto':
      return ok({ message_id: 100 + calls.length, chat: { id: params.chat_id } });
    case 'getWebhookInfo':
      return ok({ url: 'https://bot.example.com/webhook', pending_update_count: 0 });
    default:
      return ok(true);
  }
}

let calls = [];

/**
 * Create a full env + Telegram stub. `telegramBehavior(method, params)` may
 * return a Response to override the default success for specific calls.
 */
export async function makeEnv({ adminIds = [ADMIN_ID], webhookSecret = 'test-secret', telegramBehavior = null, envOver = {} } = {}) {
  const db = D1Stub.create();
  const env = {
    DB: db,
    BOT_TOKEN: '12345:test-token-abcdef',
    WEBHOOK_SECRET: webhookSecret,
    ADMIN_IDS: adminIds.join(','),
    SHOP_NAME: 'فروشگاه تست',
    SUPPORT_CONTACT: '@support',
    ...envOver,
  };

  let behavior = telegramBehavior;
  calls = [];
  vi.stubGlobal('fetch', async (url, init) => {
    const m = String(url).match(/\/bot[^/]+\/([A-Za-z0-9_]+)/);
    const method = m ? m[1] : 'unknown';
    const params = init && init.body ? JSON.parse(init.body) : {};
    calls.push({ method, params });
    if (behavior) {
      const r = await behavior(method, params);
      if (r) return r;
    }
    return defaultTgResult(method, params);
  });

  return {
    env,
    db,
    calls,
    setBehavior: (fn) => (behavior = fn),
  };
}

export function restoreFetch() {
  vi.unstubAllGlobals();
}

/** Recorded calls filtered by Telegram method. */
export const sent = (calls, method) => calls.filter((c) => c.method === method);
export const last = (calls, method) => [...calls].reverse().find((c) => c.method === method);

/** Run a Telegram update through the router, awaiting background work. */
export async function drive(update, env) {
  const pending = [];
  const ctxExec = { waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {})) };
  const result = await handleUpdate(update, env, ctxExec);
  await Promise.all(pending);
  return result;
}

export const userMsg = (text, id = USER_ID, extra = {}) => ({
  message: {
    message_id: 1,
    from: { id, first_name: 'علی', is_bot: false },
    chat: { id },
    date: 1700000000,
    text,
    ...extra,
  },
});

export const callback = (data, id = USER_ID, extra = {}) => ({
  callback_query: {
    id: 'cq-' + Math.random().toString(36).slice(2),
    from: { id, first_name: 'علی', is_bot: false },
    message: { message_id: 5, chat: { id }, date: 1700000000 },
    data,
    ...extra,
  },
});

/** Seed a product; returns the product object. */
export async function seedProduct(db, over = {}) {
  const store = new Store(db);
  return store.createProduct({ title: 'کتاب تست', price: 100, stock: 5, category: '', ...over });
}
