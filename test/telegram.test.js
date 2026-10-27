import { describe, it, expect, afterEach } from 'vitest';
import { Telegram } from '../src/telegram.js';

const TOKEN = '12345:test-token-abcdef';
const tg = new Telegram(TOKEN);

const okRes = (result) =>
  new Response(JSON.stringify({ ok: true, result }), { status: 200 });
const errRes = (code, desc, params) =>
  new Response(JSON.stringify({ ok: false, error_code: code, description: desc, parameters: params }), {
    status: 200,
  });

afterEach(() => import('./helpers/harness.js').then((h) => h.restoreFetch()));

describe('Telegram client', () => {
  it('calls the right URL with the token and JSON body, returns result', async () => {
    const seen = [];
    globalThis.fetch = async (url, init) => {
      seen.push({ url: String(url), init });
      return okRes({ id: 1 });
    };
    const res = await tg.sendMessage(42, 'سلام');
    expect(res).toEqual({ id: 1 });
    expect(seen[0].url).toBe(`https://api.telegram.org/bot${TOKEN}/sendMessage`);
    const body = JSON.parse(seen[0].init.body);
    expect(body).toMatchObject({ chat_id: 42, text: 'سلام', parse_mode: 'HTML' });
  });

  it('throws a typed error on Telegram-level failures without leaking the token', async () => {
    globalThis.fetch = async () => errRes(403, 'bot was blocked by the user');
    const err = await tg.sendMessage(1, 'x').catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe(403);
    expect(err.description).toBe('bot was blocked by the user');
    expect(err.message).not.toContain(TOKEN);
  });

  it('retries once on 429 using retry_after, then succeeds', async () => {
    let n = 0;
    globalThis.fetch = async () => {
      n++;
      return n === 1 ? errRes(429, 'Too Many Requests', { retry_after: 1 }) : okRes('done');
    };
    const res = await tg.sendMessage(1, 'x');
    expect(res).toBe('done');
    expect(n).toBe(2);
  });

  it('does not hang on a huge retry_after — fails fast instead', async () => {
    globalThis.fetch = async () => errRes(429, 'Too Many Requests', { retry_after: 500 });
    const t0 = Date.now();
    await expect(tg.sendMessage(1, 'x')).rejects.toThrow(/429|Too Many/);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  it('gives up after the bounded number of retries', async () => {
    let n = 0;
    globalThis.fetch = async () => {
      n++;
      return errRes(429, 'Too Many Requests', { retry_after: 1 });
    };
    await expect(tg.sendMessage(1, 'x')).rejects.toThrow();
    expect(n).toBe(3); // 1 initial + 2 retries
  });

  it('throws a clear error on non-JSON responses', async () => {
    globalThis.fetch = async () => new Response('<html>bad gateway</html>', { status: 502 });
    await expect(tg.getMe()).rejects.toThrow(/non-JSON/);
  });

  it('sendPlainMessage omits parse_mode (safe for admin broadcast text)', async () => {
    const seen = [];
    globalThis.fetch = async (url, init) => {
      seen.push(JSON.parse(init.body));
      return okRes(true);
    };
    await tg.sendPlainMessage(1, 'a <b> b');
    expect(seen[0]).toEqual({ chat_id: 1, text: 'a <b> b', disable_web_page_preview: true });
  });

  it('setWebhook sends the secret token and restricted updates', async () => {
    const seen = [];
    globalThis.fetch = async (url, init) => {
      seen.push(JSON.parse(init.body));
      return okRes(true);
    };
    await tg.setWebhook('https://x/webhook', 's3cret');
    expect(seen[0]).toMatchObject({
      url: 'https://x/webhook',
      secret_token: 's3cret',
      allowed_updates: ['message', 'callback_query'],
    });
  });
});
