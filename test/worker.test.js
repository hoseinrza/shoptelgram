import { describe, it, expect, afterEach } from 'vitest';
import worker from '../src/worker.js';
import { makeEnv, restoreFetch, last } from './helpers/harness.js';

const SECRET = 'test-secret';
const BASE = 'https://bot.example.com';

async function call(path, init, env) {
  const req = new Request(BASE + path, init);
  const pending = [];
  const ctx = { waitUntil: (p) => pending.push(Promise.resolve(p).catch(() => {})) };
  const res = await worker.fetch(req, env, ctx);
  await Promise.all(pending);
  return res;
}

const update = () => ({
  update_id: 1,
  message: {
    message_id: 1,
    from: { id: 222, first_name: 'علی', is_bot: false },
    chat: { id: 222 },
    date: 1700000000,
    text: '/start',
  },
});

afterEach(restoreFetch);

describe('webhook authentication', () => {
  it('rejects requests without the secret header', async () => {
    const { env } = await makeEnv();
    const res = await call('/webhook', { method: 'POST', body: 'null' }, env);
    expect(res.status).toBe(401);
  });

  it('rejects a wrong secret', async () => {
    const { env } = await makeEnv();
    const res = await call('/webhook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'wrong' }, body: 'null' }, env);
    expect(res.status).toBe(401);
  });

  it('rejects when WEBHOOK_SECRET is not configured (fail closed)', async () => {
    const { env } = await makeEnv({ webhookSecret: '' });
    const res = await call('/webhook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': '' }, body: 'null' }, env);
    expect(res.status).toBe(401);
  });

  it('returns 400 for malformed JSON', async () => {
    const { env } = await makeEnv();
    const res = await call('/webhook', { method: 'POST', headers: { 'x-telegram-bot-api-secret-token': SECRET }, body: '{broken' }, env);
    expect(res.status).toBe(400);
  });

  it('accepts a valid update, answers 200 and processes it in the background', async () => {
    const { env, calls } = await makeEnv();
    const res = await call('/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': SECRET, 'content-type': 'application/json' },
      body: JSON.stringify(update()),
    }, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('OK');
    const menu = last(calls, 'sendMessage');
    expect(menu.params.chat_id).toBe(222);
    expect(menu.params.text).toContain('خوش آمدید');
  });

  it('refuses to process updates when BOT_TOKEN or DB are missing (503)', async () => {
    const { env } = await makeEnv({ envOver: { BOT_TOKEN: '' } });
    const res = await call('/webhook', {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      body: JSON.stringify(update()),
    }, env);
    expect(res.status).toBe(503);
  });
});

describe('admin endpoints (POST + secret header, never in the URL)', () => {
  it('rejects GET with 405', async () => {
    const { env } = await makeEnv();
    for (const p of ['/setup', '/unset', '/webhook-info']) {
      const res = await call(p, { method: 'GET' }, env);
      expect(res.status).toBe(405);
      expect(res.headers.get('allow')).toContain('POST');
    }
  });

  it('rejects missing or wrong keys', async () => {
    const { env } = await makeEnv();
    for (const key of [null, 'wrong']) {
      const headers = key ? { 'x-admin-key': key } : {};
      for (const p of ['/setup', '/unset', '/webhook-info']) {
        const res = await call(p, { method: 'POST', headers }, env);
        expect(res.status).toBe(401);
      }
    }
  });

  it('POST /setup registers webhook + commands and never echoes the secret', async () => {
    const { env, calls } = await makeEnv();
    const res = await call('/setup', { method: 'POST', headers: { 'x-admin-key': SECRET } }, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.bot).toBe('testbot');
    const text = JSON.stringify(body);
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(env.BOT_TOKEN);

    const set = last(calls, 'setWebhook');
    expect(set.params.url).toBe(`${BASE}/webhook`);
    expect(set.params.secret_token).toBe(SECRET);
    expect(last(calls, 'setMyCommands')).toBeTruthy();
  });

  it('POST /unset and POST /webhook-info work with the header key', async () => {
    const { env, calls } = await makeEnv();
    expect((await call('/unset', { method: 'POST', headers: { 'x-admin-key': SECRET } }, env)).status).toBe(200);
    expect(last(calls, 'deleteWebhook')).toBeTruthy();
    const res = await call('/webhook-info', { method: 'POST', headers: { 'x-admin-key': SECRET } }, env);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.info.url).toBe('https://bot.example.com/webhook');
  });
});

describe('landing page and misc', () => {
  it('shows the shop name and never leaks secrets', async () => {
    const { env } = await makeEnv();
    const res = await call('/', { method: 'GET' }, env);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('فروشگاه تست');
    expect(html).not.toContain(env.BOT_TOKEN);
    expect(html).not.toContain(SECRET);
  });

  it('warns about missing configuration on the landing page (names only)', async () => {
    const { env } = await makeEnv({ envOver: { ADMIN_IDS: '' } });
    const res = await call('/', { method: 'GET' }, env);
    const html = await res.text();
    expect(html).toContain('ADMIN_IDS');
    expect(html).not.toContain(env.BOT_TOKEN);
  });

  it('404s unknown paths', async () => {
    const { env } = await makeEnv();
    const res = await call('/nope', { method: 'GET' }, env);
    expect(res.status).toBe(404);
  });
});
