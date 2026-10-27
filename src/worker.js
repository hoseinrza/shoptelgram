/**
 * shoptelgram — a complete Telegram shop bot on Cloudflare Workers.
 *
 * Routes
 *   GET  /              small status / landing page (shows config warnings)
 *   POST /webhook       Telegram webhook (secured by the secret-token header)
 *   POST /setup         register the webhook + bot commands   (x-admin-key)
 *   POST /unset         remove the webhook                  (x-admin-key)
 *   POST /webhook-info  inspect the current webhook         (x-admin-key)
 *
 * Administrative endpoints authenticate with the WEBHOOK_SECRET sent in the
 * `x-admin-key` header — never in a query string, which would leak into
 * access logs, browser history and proxies.
 *
 * Required configuration (see README):
 *   BOT_TOKEN        secret  — from @BotFather
 *   WEBHOOK_SECRET   secret  — random string; secures the webhook + admin ops
 *   DB               D1      — database binding (migrations/0001_init.sql)
 *   ADMIN_IDS        var     — comma-separated Telegram user IDs of admins
 * Optional:
 *   SHOP_NAME        var     — shop title shown to users
 *   SUPPORT_CONTACT  var     — e.g. @your_support
 */

import { Telegram } from './telegram.js';
import { handleUpdate } from './router.js';
import { secureCompare, isValidWebhookSecret } from './validate.js';

const COMMANDS = [
  { command: 'start', description: 'شروع و نمایش منو' },
  { command: 'menu', description: 'منوی اصلی' },
  { command: 'help', description: 'راهنما' },
];

const ADMIN_KEY_HEADER = 'x-admin-key';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (request.method === 'POST' && pathname === '/webhook') {
        return await onWebhook(request, env, ctx);
      }
      if (pathname === '/setup') return await adminEndpoint(request, env, onSetup);
      if (pathname === '/unset') return await adminEndpoint(request, env, onUnset);
      if (pathname === '/webhook-info') return await adminEndpoint(request, env, onWebhookInfo);
      if (pathname === '/') return landing(env);
      return new Response('Not found', { status: 404 });
    } catch (err) {
      log('worker_error', { error: err?.message });
      return new Response('Internal error', { status: 500 });
    }
  },
};

function log(event, data) {
  console.log(JSON.stringify({ event, ...data }));
}

/**
 * Aggregate configuration problems. Secret values are never included — only
 * which variable has which kind of problem.
 */
export function configIssues(env) {
  const issues = [];
  if (!env.BOT_TOKEN) issues.push({ key: 'BOT_TOKEN', problem: 'missing' });
  if (!env.WEBHOOK_SECRET) issues.push({ key: 'WEBHOOK_SECRET', problem: 'missing' });
  else if (!isValidWebhookSecret(env.WEBHOOK_SECRET)) {
    issues.push({
      key: 'WEBHOOK_SECRET',
      problem: 'invalid charset — Telegram requires [A-Za-z0-9_-], max 256 chars',
    });
  }
  if (!env.DB) issues.push({ key: 'DB', problem: 'missing D1 binding' });
  if (!String(env.ADMIN_IDS || '').trim()) {
    issues.push({ key: 'ADMIN_IDS', problem: 'empty — nobody can manage the shop' });
  }
  return issues;
}

function hasCriticalIssue(issues) {
  // Without these the worker cannot function at all.
  return issues.some(
    (i) => (i.key === 'BOT_TOKEN' || i.key === 'DB' || i.key === 'WEBHOOK_SECRET') && i.problem === 'missing',
  );
}

async function onWebhook(request, env, ctx) {
  // Verify the secret token Telegram echoes back on every webhook call.
  const got = request.headers.get('x-telegram-bot-api-secret-token');
  if (!env.WEBHOOK_SECRET || !secureCompare(got, env.WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const issues = configIssues(env);
  if (hasCriticalIssue(issues)) {
    log('webhook_misconfigured', { issues: issues.map((i) => `${i.key}:${i.problem}`) });
    return json({ ok: false, error: 'misconfigured' }, 503);
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
      log('update_handling_failed', { update_id: update?.update_id, error: err?.message }),
    ),
  );

  // Respond 200 immediately.
  return new Response('OK');
}

/** Shared auth + method gate for administrative endpoints. */
async function adminEndpoint(request, env, handler) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed — use POST with the x-admin-key header', {
      status: 405,
      headers: { allow: 'POST' },
    });
  }
  const key = request.headers.get(ADMIN_KEY_HEADER);
  if (!env.WEBHOOK_SECRET || !secureCompare(key, env.WEBHOOK_SECRET)) {
    return new Response('Unauthorized', { status: 401 });
  }
  const issues = configIssues(env).filter((i) => i.problem !== 'empty' || i.key !== 'ADMIN_IDS');
  if (hasCriticalIssue(issues)) {
    return json({ ok: false, error: 'misconfigured', issues }, 503);
  }
  return handler(request, env);
}

async function onSetup(request, env) {
  const tg = new Telegram(env.BOT_TOKEN);
  const webhookUrl = new URL(request.url).origin + '/webhook';
  const [hook, me] = await Promise.all([tg.setWebhook(webhookUrl, env.WEBHOOK_SECRET), tg.getMe()]);
  await tg.setMyCommands(COMMANDS);

  log('webhook_registered', { bot: me.username, webhook: webhookUrl });
  return json({
    ok: true,
    bot: me.username,
    webhook: webhookUrl,
    set: hook,
    message: 'Webhook and commands registered. Open Telegram and send /start to your bot.',
  });
}

async function onUnset(_request, env) {
  const tg = new Telegram(env.BOT_TOKEN);
  const res = await tg.deleteWebhook();
  log('webhook_deleted', {});
  return json({ ok: true, deleted: res });
}

async function onWebhookInfo(_request, env) {
  const tg = new Telegram(env.BOT_TOKEN);
  const info = await tg.getWebhookInfo();
  return json({ ok: true, info });
}

function landing(env) {
  const name = env.SHOP_NAME || 'shoptelgram';
  const issues = configIssues(env);
  const warnings = issues
    .map((i) => `<p class="warn">⚠️ ${escapeHtml(i.key)}: ${escapeHtml(i.problem)}</p>`)
    .join('');
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
  .warn{color:#fbbf24;font-size:.85rem}
</style></head>
<body><div class="card">
  <h1>🛍 ${escapeHtml(name)}</h1>
  <p><span class="dot"></span>ربات فعال است</p>
  ${warnings}
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
