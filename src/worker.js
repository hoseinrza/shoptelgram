/**
 * shoptelgram — a complete Telegram shop bot on Cloudflare Workers.
 *
 * Routes
 *   GET  /                     small status / landing page
 *   POST /webhook              Telegram webhook (secured by a secret header)
 *   GET  /setup?key=SECRET     register the webhook + bot commands (run once)
 *   GET  /webhook-info?key=…   inspect the current webhook
 *   GET  /unset?key=SECRET     remove the webhook
 *
 * Required configuration (see README):
 *   BOT_TOKEN        secret  — from @BotFather
 *   WEBHOOK_SECRET   secret  — any random string; secures the webhook + setup
 *   ADMIN_IDS        var     — comma-separated Telegram user IDs of admins
 *   SHOP             KV      — KV namespace binding for all data
 * Optional:
 *   SHOP_NAME        var     — shop title shown to users
 *   SUPPORT_CONTACT  var     — e.g. @your_support
 */

import { Telegram } from './telegram.js';
import { handleUpdate } from './router.js';

const COMMANDS = [
  { command: 'start', description: 'شروع و نمایش منو' },
  { command: 'menu', description: 'منوی اصلی' },
  { command: 'help', description: 'راهنما' },
];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (request.method === 'POST' && pathname === '/webhook') {
        return await onWebhook(request, env, ctx);
      }
      if (pathname === '/setup') return await onSetup(url, env);
      if (pathname === '/unset') return await onUnset(url, env);
      if (pathname === '/webhook-info') return await onWebhookInfo(url, env);
      if (pathname === '/') return landing(env);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      console.error('worker error', err?.stack || err?.message || err);
      return new Response('Internal error', { status: 500 });
    }
  },
};

async function onWebhook(request, env, ctx) {
  // Verify the secret token Telegram echoes back on every webhook call.
  const got = request.headers.get('x-telegram-bot-api-secret-token');
  if (!env.WEBHOOK_SECRET || got !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  // Process the update after responding so Telegram never waits / retries.
  ctx.waitUntil(
    handleUpdate(update, env, ctx).catch((err) =>
      console.error('update handling failed', err?.stack || err?.message),
    ),
  );

  // Respond 200 immediately.
  return new Response('OK');
}

function guard(url, env) {
  const key = url.searchParams.get('key');
  if (!env.WEBHOOK_SECRET || key !== env.WEBHOOK_SECRET) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

async function onSetup(url, env) {
  const denied = guard(url, env);
  if (denied) return denied;

  const tg = new Telegram(env.BOT_TOKEN);
  const webhookUrl = `${url.origin}/webhook`;
  const [hook, me] = await Promise.all([
    tg.setWebhook(webhookUrl, env.WEBHOOK_SECRET),
    tg.getMe(),
  ]);
  await tg.setMyCommands(COMMANDS);

  return json({
    ok: true,
    bot: me.username,
    webhook: webhookUrl,
    set: hook,
    message: 'Webhook and commands registered. Open Telegram and send /start to your bot.',
  });
}

async function onUnset(url, env) {
  const denied = guard(url, env);
  if (denied) return denied;
  const tg = new Telegram(env.BOT_TOKEN);
  const res = await tg.deleteWebhook();
  return json({ ok: true, deleted: res });
}

async function onWebhookInfo(url, env) {
  const denied = guard(url, env);
  if (denied) return denied;
  const tg = new Telegram(env.BOT_TOKEN);
  const info = await tg.getWebhookInfo();
  return json({ ok: true, info });
}

function landing(env) {
  const name = env.SHOP_NAME || 'shoptelgram';
  const html = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(name)}</title>
<style>
  body{font-family:system-ui,Segoe UI,Tahoma,sans-serif;background:#0f172a;color:#e2e8f0;
       display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
  .card{background:#1e293b;padding:2.5rem 3rem;border-radius:1rem;text-align:center;
        box-shadow:0 10px 40px rgba(0,0,0,.4);max-width:420px}
  h1{margin:.2rem 0 .6rem;font-size:1.6rem}
  p{color:#94a3b8;line-height:1.9;margin:.4rem 0}
  .dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#22c55e;margin-inline-end:6px}
</style></head>
<body><div class="card">
  <h1>🛍 ${escapeHtml(name)}</h1>
  <p><span class="dot"></span>ربات فعال است</p>
  <p>این یک ربات فروشگاهی تلگرام است که روی Cloudflare Workers اجرا می‌شود.</p>
  <p>برای استفاده، ربات را در تلگرام باز کرده و <b>/start</b> را بزنید.</p>
</div></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
