#!/usr/bin/env node
/**
 * One-time data migration: legacy Cloudflare KV namespace (SHOP) -> D1.
 *
 * Reads every key of the old namespace through the wrangler CLI (so it uses
 * your existing `wrangler login` credentials — no tokens are handled here),
 * transforms the old JSON shapes and writes an idempotent SQL backfill file.
 * Existing data is NEVER deleted from KV; the script can be re-run safely.
 *
 * Usage:
 *   KV_NAMESPACE_ID=<your-kv-id> node scripts/migrate-kv-to-d1.mjs
 *       -> writes kv-to-d1-backfill.sql only
 *
 *   KV_NAMESPACE_ID=<your-kv-id> node scripts/migrate-kv-to-d1.mjs --apply
 *       -> also runs it against the remote D1 database (DB_NAME, default shoptelgram)
 *
 * Recommended order (see README):
 *   1. npx wrangler d1 create shoptelgram  (+ put the id in wrangler.jsonc)
 *   2. npm run d1:migrate                  (schema)
 *   3. this script                         (data)
 *   4. npm run deploy                      (new worker reads D1)
 *   5. after verifying: remove the legacy SHOP KV block from wrangler.jsonc
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID;
const DB_NAME = process.env.DB_NAME || 'shoptelgram';
const APPLY = process.argv.includes('--apply');
const OUT_FILE = resolve('kv-to-d1-backfill.sql');

if (!KV_NAMESPACE_ID) {
  console.error('Set KV_NAMESPACE_ID (from `npx wrangler kv namespace list`) and re-run.');
  process.exit(1);
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function wrangler(args, { input } = {}) {
  return execFileSync(npx, ['wrangler', ...args], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    input,
    shell: process.platform === 'win32',
  });
}

/** wrangler prints human noise sometimes — extract the JSON payload. */
function parseJsonLoose(text) {
  const start = text.search(/[[{]/);
  if (start === -1) throw new Error(`no JSON found in wrangler output:\n${text.slice(0, 500)}`);
  return JSON.parse(text.slice(start));
}

function listKeys() {
  const keys = [];
  let cursor;
  do {
    const args = ['kv', 'key', 'list', '--namespace-id', KV_NAMESPACE_ID, '--remote'];
    if (cursor) args.push('--cursor', cursor);
    const page = parseJsonLoose(wrangler(args));
    if (Array.isArray(page)) {
      keys.push(...page.map((k) => (typeof k === 'string' ? k : k.name)));
      break; // plain array output => complete
    }
    keys.push(...(page.keys ?? []).map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

function getKey(name) {
  const raw = wrangler(['kv', 'key', 'get', name, '--namespace-id', KV_NAMESPACE_ID, '--remote']);
  const start = raw.search(/[[{]/);
  return JSON.parse(raw.slice(start));
}

const q = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`;
const int = (v, fallback = 0) => (Number.isSafeInteger(Number(v)) ? Number(v) : fallback);
const ts = (v) => (Number.isFinite(Number(v)) ? Number(v) : Date.now());

const VALID_STATUS = new Set(['pending', 'confirmed', 'shipped', 'done', 'cancelled']);

console.log('Listing KV keys…');
const keys = listKeys();
console.log(`Found ${keys.length} keys.`);

const stats = { products: 0, orders: 0, orderItems: 0, users: 0, carts: 0, cartItems: 0, states: 0, skipped: 0 };
const productIds = new Set();
const stmts = [];

// Products and users first (orders reference products logically; carts need
// the product set to skip dangling references). Carts/states carry their user
// id only in the key name, so their values are collected and handled after.
const pendingOrders = [];
const pendingCarts = [];
const pendingStates = [];

for (const key of keys) {
  let v;
  try {
    v = getKey(key);
  } catch (err) {
    console.warn(`  ! could not read ${key}: ${err.message}`);
    stats.skipped++;
    continue;
  }
  try {
    if (key.startsWith('product:')) {
      productIds.add(int(v.id));
      stmts.push(
        `INSERT INTO products (id, title, description, price, stock, photo, category, active, created_at)\n` +
          `VALUES (${int(v.id)}, ${q(v.title)}, ${q(v.description ?? '')}, ${int(v.price)}, ${int(v.stock ?? 0)}, ` +
          `${v.photo == null ? 'NULL' : q(v.photo)}, ${q(v.category ?? '')}, ${v.active ? 1 : 0}, ${ts(v.createdAt)})\n` +
          `ON CONFLICT(id) DO UPDATE SET title=excluded.title, description=excluded.description, price=excluded.price,\n` +
          `  stock=excluded.stock, photo=excluded.photo, category=excluded.category, active=excluded.active, created_at=excluded.created_at;`,
      );
      stats.products++;
    } else if (key.startsWith('order:')) {
      pendingOrders.push(v);
    } else if (key.startsWith('user:')) {
      stmts.push(
        `INSERT INTO users (id, first_name, last_name, username, contact_name, phone, joined_at, last_seen)\n` +
          `VALUES (${int(v.id)}, ${q(v.firstName ?? '')}, ${q(v.lastName ?? '')}, ${q(v.username ?? '')}, ` +
          `${v.contactName == null ? 'NULL' : q(v.contactName)}, ${v.phone == null ? 'NULL' : q(v.phone)}, ` +
          `${ts(v.joinedAt)}, ${ts(v.lastSeen)})\n` +
          `ON CONFLICT(id) DO UPDATE SET first_name=excluded.first_name, last_name=excluded.last_name,\n` +
          `  username=excluded.username, contact_name=excluded.contact_name, phone=excluded.phone,\n` +
          `  joined_at=excluded.joined_at, last_seen=excluded.last_seen;`,
      );
      stats.users++;
    } else if (key.startsWith('cart:')) {
      pendingCarts.push([key.slice('cart:'.length), v]);
    } else if (key.startsWith('state:')) {
      pendingStates.push([key.slice('state:'.length), v]);
    } else if (key.startsWith('seq:')) {
      // ids now come from AUTOINCREMENT — sequences are not needed.
    } else {
      stats.skipped++;
    }
  } catch (err) {
    console.warn(`  ! could not transform ${key}: ${err.message}`);
    stats.skipped++;
  }
}

for (const o of pendingOrders) {
  const status = VALID_STATUS.has(o.status) ? o.status : 'pending';
  const lines = Array.isArray(o.lines) ? o.lines : [];
  stmts.push(
    `INSERT INTO orders (id, user_id, customer_name, customer_phone, customer_address, total, status, idempotency_key, attempt, created_at, updated_at)\n` +
      `VALUES (${int(o.id)}, ${int(o.userId)}, ${q(o.customer?.name ?? '')}, ${q(o.customer?.phone ?? '')}, ` +
      `${q(o.customer?.address ?? '')}, ${int(o.total)}, ${q(status)}, NULL, NULL, ${ts(o.createdAt)}, ${ts(o.createdAt)})\n` +
      `ON CONFLICT(id) DO UPDATE SET total=excluded.total, status=excluded.status;`,
  );
  stats.orders++;
  for (const l of lines) {
    stmts.push(
      `INSERT INTO order_items (order_id, product_id, title, price, qty, line_total)\n` +
        `VALUES (${int(o.id)}, ${l.productId == null ? 'NULL' : int(l.productId)}, ${q(l.title ?? '')}, ` +
        `${int(l.price)}, ${int(l.qty, 1)}, ${int(l.price) * int(l.qty, 1)});`,
    );
    stats.orderItems++;
  }
}
for (const [userIdRaw, v] of pendingCarts) {
  const userId = int(userIdRaw);
  if (!Number.isSafeInteger(userId)) continue;
  for (const [pid, qty] of Object.entries(v.items ?? {})) {
    const productId = int(pid);
    if (!productIds.has(productId)) {
      console.warn(`  ! cart ${userId}: product ${productId} no longer exists — skipped`);
      continue;
    }
    stmts.push(
      `INSERT INTO cart_items (user_id, product_id, qty) VALUES (${userId}, ${productId}, ${int(qty, 1)})\n` +
        `ON CONFLICT(user_id, product_id) DO UPDATE SET qty=excluded.qty;`,
    );
    stats.cartItems++;
  }
  stats.carts++;
}

for (const [userIdRaw, v] of pendingStates) {
  const userId = int(userIdRaw);
  if (!Number.isSafeInteger(userId)) continue;
  stmts.push(
    `INSERT INTO states (user_id, data, expires_at) VALUES (${userId}, ${q(JSON.stringify(v))}, ${Date.now() + 3600_000})\n` +
      `ON CONFLICT(user_id) DO UPDATE SET data=excluded.data, expires_at=excluded.expires_at;`,
  );
  stats.states++;
}

const sql = `-- Auto-generated by scripts/migrate-kv-to-d1.mjs on ${new Date().toISOString()}
-- Idempotent: safe to run more than once. KV data is NOT deleted by this script.
BEGIN TRANSACTION;
${stmts.join('\n\n')}
COMMIT;
`;
writeFileSync(OUT_FILE, sql, 'utf8');
console.log(`Wrote ${OUT_FILE}`);
console.log(
  `products=${stats.products} orders=${stats.orders} (items=${stats.orderItems}) users=${stats.users} ` +
    `carts=${stats.carts} (items=${stats.cartItems}) states=${stats.states} skipped=${stats.skipped}`,
);

if (APPLY) {
  console.log(`Applying to remote D1 database "${DB_NAME}"…`);
  wrangler(['d1', 'execute', DB_NAME, '--remote', '--file', OUT_FILE, '-y']);
  console.log('Done. Data is now in D1.');
} else {
  console.log(`Now apply it with:\n  npx wrangler d1 execute ${DB_NAME} --remote --file kv-to-d1-backfill.sql`);
}
