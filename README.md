<div align="center">

# 🛍️ shoptelgram

**English** | [**فارسی**](README.fa.md)

### A complete Telegram shop bot on ☁️ Cloudflare Workers + D1

**No servers • SQLite database on the edge • practically free**

<br/>

<!-- ===== Badges ===== -->
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1_SQLite-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot_API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

<!-- ===== Status shields ===== -->
![Tests](https://img.shields.io/badge/tests-115_passing-22C55E?style=flat-square)
![Storage](https://img.shields.io/badge/storage-D1_(atomic_transactions)-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Language](https://img.shields.io/badge/UI-فارسی-007A33?style=flat-square)
![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)

</div>

---

<div align="center">

> 🚀 **A complete online shop inside Telegram** — product browsing, cart, atomic order placement and an admin panel (bot + web); all on Cloudflare's edge.

</div>

---

## 📊 Project status

| Area | Status | Notes |
|------|:-----:|-------|
| 🛒 Store & cart | ✅ | Server-side stock & price validation |
| 📦 Atomic checkout | ✅ | One D1 transaction: no overselling, no duplicate orders |
| 🔐 Bot admin panel | ✅ | Products, orders, stats, broadcast |
| 🌐 Web admin panel | ✅ | `/admin` — password + signed cookie, zero dependencies |
| 🛡️ Security | ✅ | Webhook secret, header auth, input sanitization |
| 🇮🇷 Persian UI | ✅ | All texts and numerals are Persian |
| 🧪 Automated tests | ✅ | 115 tests (Vitest + real SQLite semantics) |
| 💳 Online payment gateway | 🔜 | Payments are coordinated manually for now |

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🧑‍💻 For customers
- 🛍️ Product browsing with photos, prices and stock (paginated)
- 🗂️ Product categories
- 🛒 Cart with quantity +/- and out-of-stock warnings
- ✅ Order placement (name, phone, address) with atomic confirmation
- 📦 Order status tracking
- ☎️ Support section

</td>
<td width="50%" valign="top">

### 🔐 For the admin
- ➕ Step-by-step product creation (validated)
- 🛠️ Edit/delete, activate/deactivate + paginated lists
- 📦 Order management with a locked state machine
- 📊 Shop stats (sales, users, orders)
- 📣 Chunked, resumable broadcast
- 🔔 Instant new-order alerts
- 🌐 **Web admin panel** — dashboard, products, orders and broadcast from the browser

</td>
</tr>
</table>

> All user-facing texts are Persian and numbers are rendered in Persian digits. 🇮🇷

---

## 🧱 Tech stack

| Layer | Technology |
|:----:|:------:|
| ⚡ Runtime | Cloudflare Workers |
| 💾 Storage | Cloudflare D1 (SQLite with real transactions) |
| 🤖 Bot | Telegram Bot API (webhook) |
| 🧩 Language | JavaScript (ES Modules) |
| 🧪 Testing | Vitest + `node:sqlite` |
| 🛠️ Tooling | Wrangler CLI |

---

## 🏗️ Architecture

```
src/
├── 🚪 worker.js          Worker entry: routes, webhook, config validation
├── 🔀 router.js          Telegram update dispatch + callback validation
├── 🤖 telegram.js        Bot API client (429 handling, timeouts, plain text)
├── 💾 store.js           Data layer on D1 (atomic checkout transaction)
├── 📣 broadcast.js       Shared broadcast engine (bot + web)
├── ✅ validate.js        Input validation at every trust boundary
├── 💬 messages.js        Persian texts + the order state machine
├── ⌨️  keyboards.js       Inline keyboards
├── admin/
│   ├── 🔑 api.js         Panel auth (password + signed cookie) + JSON API
│   └── 🌐 panel.js       Panel UI (single file, dependency-free)
└── handlers/
    ├── 🧑 user.js         Customer flows (browse, cart, checkout)
    └── 🔐 admin.js        Admin flows (products, orders, broadcast)
migrations/0001_init.sql  D1 schema with CHECK / UNIQUE constraints
scripts/migrate-kv-to-d1.mjs  One-time legacy KV → D1 data migration
test/                     115 automated tests
```

---

## 🔒 Data-integrity guarantees (why D1?)

The previous version ran on KV, which is eventually consistent and has no
transactions — under concurrent requests, ids could collide and stock could be
oversold. Checkout is now **a single `db.batch()` in D1 — one atomic SQL
transaction:**

- **No overselling:** stock is decremented inside the same transaction with a
  conditional `stock >= qty` update; two simultaneous buyers can never both
  take the last unit. A `CHECK (stock >= 0)` constraint backstops it.
- **No duplicate orders:** every review screen mints a unique
  `idempotency_key` (UNIQUE constraint). No matter how many times
  "confirm" fires, it maps to at most one order and one stock decrement.
- **Purchase-time snapshot:** each line's title and price are copied into
  `order_items`; later price edits or product deletions never change past orders.
- **Locked state machine:** `pending → confirmed → shipped → done` (plus
  cancel). Illegal transitions are rejected server-side, and the admin UI is
  generated from the same transition map the store enforces.
- **Product deletion:** cascades out of every cart (`ON DELETE CASCADE`) and
  can no longer be purchased.

---

## 🚀 Setup (fresh install)

<details open>
<summary><b>📋 Steps</b></summary>

<br/>

**Prerequisites:** a [Cloudflare](https://dash.cloudflare.com/sign-up) account • [Node.js 22+](https://nodejs.org) • a bot token from [@BotFather](https://t.me/BotFather)

```bash
# 1️⃣ Get the code and install
git clone https://github.com/hoseinrza/shoptelgram.git
cd shoptelgram
npm install

# 2️⃣ Log in to Cloudflare
npx wrangler login

# 3️⃣ Create the D1 database and put its id in wrangler.jsonc
npx wrangler d1 create shoptelgram
#   ↓ paste the printed "database_id" in place of REPLACE_WITH_YOUR_D1_ID

# 4️⃣ Create the tables (schema)
npm run d1:migrate

# 5️⃣ Set the secrets
npx wrangler secret put BOT_TOKEN        # BotFather token
npx wrangler secret put WEBHOOK_SECRET   # random [A-Za-z0-9_-] string (e.g. openssl rand -hex 32)

# 6️⃣ Get your numeric id from @userinfobot and put it in ADMIN_IDS in wrangler.jsonc

# 7️⃣ Deploy
npm run deploy
```

**8️⃣ Register the webhook (once):**

```bash
curl -X POST "https://<your-worker-url>/setup" -H "x-admin-key: $WEBHOOK_SECRET"
```

If you see `"ok": true`, you're done — open the bot in Telegram and send **/start**. 🎉

**9️⃣ Web panel (optional):**

```bash
npx wrangler secret put ADMIN_PANEL_PASSWORD   # a long random passphrase
npm run deploy                                  # applies the new secret
```

`https://<your-worker-url>/admin` is now your management dashboard: stats,
products, orders and broadcast, straight from the browser.

> ⚠️ Administrative endpoints only accept **POST with the `x-admin-key`
> header** — the secret never appears in a URL, so it can't leak into access
> logs or browser history.

</details>

---

## 🔄 Migrating from the previous (KV) version

If your shop already ran on the KV version and has data (products, orders,
users, carts):

```bash
# 0) find the KV namespace id
npx wrangler kv namespace list

# 1) create the D1 schema (steps 3 and 4 above)

# 2) move the data (writes kv-to-d1-backfill.sql and applies it to remote D1)
KV_NAMESPACE_ID=<your-kv-id> node scripts/migrate-kv-to-d1.mjs --apply

# 3) deploy the new version
npm run deploy
```

The script **never deletes anything from KV**, is idempotent (safe to re-run)
and migrates old orders with their full line snapshots. Once you've verified
the data, remove the legacy `kv_namespaces` block from `wrangler.jsonc`.

> `kv-to-d1-backfill.sql` contains customer data; it's git-ignored — never
> commit or share it.

---

## 🧪 Local development & tests

```bash
cp .dev.vars.example .dev.vars   # fill in the values
npm run d1:migrate:local         # schema on wrangler dev's local D1
npm run dev                      # run locally

npm test        # 115 tests (real SQLite — including concurrency, idempotency, web panel)
npm run test:watch
npm run lint    # eslint
```

---

## ⚙️ Configuration

| Name | Type | Description |
|------|:----:|-------------|
| `BOT_TOKEN` | 🔒 secret | Bot token from BotFather |
| `WEBHOOK_SECRET` | 🔒 secret | Random `[A-Za-z0-9_-]` string; secures the webhook and admin ops |
| `DB` | 💾 D1 | Database binding (`wrangler.jsonc`) |
| `ADMIN_IDS` | 📝 var | Comma-separated numeric Telegram ids of admins |
| `ADMIN_PANEL_PASSWORD` | 🔒 secret | Password for the `/admin` web panel (empty = panel disabled) |
| `SHOP_NAME` | 📝 var | Shop title (optional) |
| `SUPPORT_CONTACT` | 📝 var | Support handle like `@support` (optional) |

The Worker's landing page (`GET /`) shows configuration problems — only the
**names** of the affected variables, never any values.

---

## 🔗 Endpoints

| Path | Method | Auth | Purpose |
|------|:---:|:-----:|---------|
| `/` | GET | — | 🟢 Status page |
| `/webhook` | POST | Telegram secret header | 📨 Incoming updates |
| `/admin` | GET | — | 🌐 Web admin panel |
| `/admin/login` | POST | Panel password | 🔑 Log in (signed cookie) |
| `/admin/api/*` | GET/POST/PATCH/DELETE | Session cookie | 📊 Panel API |
| `/setup` | POST | `x-admin-key` | 🔧 Register webhook + commands |
| `/webhook-info` | POST | `x-admin-key` | 🔍 Inspect webhook status |
| `/unset` | POST | `x-admin-key` | 🗑️ Remove the webhook |

GET requests to administrative endpoints are rejected with `405`.

### 🌐 Web admin panel

`/admin` is a single-file, dependency-free app (Persian, RTL):

- **Dashboard:** products, orders, users, total sales
- **Products:** add, inline price/stock editing, activate/deactivate, delete + pagination
- **Orders:** status filter, full detail, transition buttons (only legal transitions are offered)
- **Broadcast:** chunked sending (30 recipients per click) with a progress bar and a continue button

Security notes: sessions are `HttpOnly + Secure + SameSite=Strict` cookies
signed with HMAC-SHA256 (key = the panel password), valid for 12 hours; every
API request is re-verified server-side; cross-origin mutating requests are
rejected; login is throttled (per-isolate — a mitigation, not an absolute
guarantee). The panel is served with a strict CSP and loads no external
fonts, scripts or CDNs.

---

## 📋 Usage

🔐 **Admin:** after `/start` you'll see the "مدیریت" (Management) button → add a product → the shop is live.

🛒 **Customer:** `/start` → "محصولات" (Products) → pick one → "افزودن به سبد" (Add to cart) → "سبد خرید" (Cart) → "ثبت سفارش" (Place order).

> 💡 **Payments are manual for now:** no payment gateway is connected and
> orders only move through `pending / confirmed / shipped / done / cancelled`.
> If you add a gateway later, only mark an order paid after verified
> confirmation from the provider.

---

## ⚠️ Known limitations

- **Broadcast:** at most 30 recipients per click (free-plan Workers subrequest
  limit); continue via the "ادامه ارسال" button in the bot or the web panel
  until done. Messages are sent as plain text (no HTML).
- **Web panel:** the login throttle is per-isolate (counted separately per
  datacenter) — the real protection is the strong password and the signed
  cookie. The "total sales" figure excludes cancelled orders.
- **D1 free-plan limits:** 500 MB storage, 100k writes/day, 5M reads/day.
  Plenty for a small-to-medium shop; move to the Paid plan for more.
- **Cart limits:** max 25 distinct lines and 99 units per line; text lengths
  (name/address/descriptions) are capped server-side.
- **Legacy KV:** after migration your old data stays in KV (as a backup).
  Removing it is up to you.
- **D1 read replicas:** if you enable them, reads can lag briefly behind
  writes; checkout-critical queries run in a transaction on the primary and
  are unaffected.

---

## 🤝 Development

```bash
npm test && npm run lint   # before every PR
```

CI runs both on every push/PR (Node 22).

---

<div align="center">

## 📝 License

[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

**MIT** © hoseinrza

<br/>

If this project helped you, a ⭐ is appreciated!

</div>
