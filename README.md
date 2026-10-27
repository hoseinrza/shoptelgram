<div align="center">

<a name="english"></a>

# 🛍️ shoptelgram

### A complete Telegram shop bot on ☁️ Cloudflare Workers + D1 — with a built-in web admin panel

**Serverless • Edge SQLite • Atomic checkout • Nearly free**

**English** | [فارسی](#farsi)

<br/>

<!-- ===== Badges ===== -->
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1_SQLite-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot_API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

<!-- ===== Status shields ===== -->
![Tests](https://img.shields.io/badge/tests-115_passing-22C55E?style=flat-square)
![Storage](https://img.shields.io/badge/storage-D1_(atomic_transactions)-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)

</div>

---

<div align="center">

> 🚀 **A full online shop inside Telegram** — product browsing, cart, atomic checkout and a complete admin experience (bot + web), all at the Cloudflare edge.

</div>

---

## 📊 Project status

| Area | Status | Notes |
|------|:-----:|-------|
| 🛒 Shop & cart | ✅ | Server-side stock and price validation |
| 📦 Atomic checkout | ✅ | Single D1 transaction: no oversell, no duplicate orders |
| 🔐 Bot admin panel | ✅ | Products, orders, stats, broadcast |
| 🌐 Web admin panel | ✅ | `/admin` — password + signed cookie, zero dependencies |
| 🛡️ Security | ✅ | Webhook secret, header auth, input hardening |
| 🇮🇷 Persian UI | ✅ | Fully Persian, Persian numerals |
| 🧪 Automated tests | ✅ | 115 tests (Vitest + real SQLite semantics) |
| 💳 Online payment | 🔜 | Payment is coordinated manually for now |

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 🧑‍💻 For customers
- 🛍️ Product browsing with photo, price and stock (paginated)
- 🗂️ Categories
- 🛒 Cart with quantity controls + warnings for unavailable items
- ✅ Checkout (name, phone, address) with atomic confirmation
- 📦 Order status tracking
- ☎️ Support section

</td>
<td width="50%" valign="top">

### 🔐 For admins
- ➕ Guided product creation with validation
- 🛠️ Edit/delete, activate/deactivate, paginated lists
- 📦 Order management with a server-enforced status lifecycle
- 📊 Shop stats (sales, users, orders)
- 📣 Chunked, resumable broadcast messages
- 🔔 Instant new-order alerts
- 🌐 **Web admin panel** — dashboard, products, orders and broadcast from the browser

</td>
</tr>
</table>

> The whole UI is Persian with Persian numerals. 🇮🇷

---

## 🧱 Tech stack

| Layer | Technology |
|:----:|:------:|
| ⚡ Runtime | Cloudflare Workers |
| 💾 Storage | Cloudflare D1 (SQLite + real transactions) |
| 🤖 Bot | Telegram Bot API (Webhook) |
| 🌐 Panel | Single-file vanilla JS SPA (no framework, no CDN) |
| 🧩 Language | JavaScript (ES Modules) |
| 🧪 Tests | Vitest + `node:sqlite` |
| 🛠️ Tooling | Wrangler CLI |

---

## 🏗️ Architecture

```
src/
├── 🚪 worker.js          Worker entry: routes, webhook, config validation
├── 🔀 router.js          Telegram update dispatch + callback validation
├── 🤖 telegram.js        Bot API client (429 handling, timeouts, plain text)
├── 💾 store.js           D1 data layer (atomic checkout transaction)
├── 📣 broadcast.js       Shared broadcast engine (bot + web)
├── ✅ validate.js        Input validation at every trust boundary
├── 💬 messages.js        Persian copy + order lifecycle map
├── ⌨️  keyboards.js       Inline keyboards
├── admin/
│   ├── 🔑 api.js         Web panel auth (password + signed cookie) + JSON API
│   └── 🌐 panel.js       Panel UI (single file, dependency-free)
└── handlers/
    ├── 🧑 user.js         Customer flows (browse, cart, checkout)
    └── 🔐 admin.js        Admin flows (products, orders, broadcast)
migrations/0001_init.sql  D1 schema with CHECK/UNIQUE constraints
scripts/migrate-kv-to-d1.mjs  One-time KV → D1 data migration
test/                     115 automated tests
```

---

## 🔒 Data integrity guarantees (why D1?)

The previous version ran on KV, which is eventually consistent and has no
transactions — under concurrent load it could produce duplicate ids and
overselling. Checkout is now **one `db.batch()` in D1 — a single atomic SQL
transaction:**

- **Never oversells:** stock is validated and decremented inside the same
  transaction with conditional updates (`stock >= qty`); two simultaneous
  purchases can never both take the last unit. `CHECK (stock >= 0)` backstops
  it at the database level.
- **Never duplicates orders:** every review screen mints a unique
  `idempotency_key` (`UNIQUE`); mashing the confirm button still creates
  exactly one order and decrements stock exactly once.
- **Price snapshot:** each line's title/price is copied into `order_items`;
  later edits or deletion of the product never alter historical orders.
- **Locked status lifecycle:** `pending → confirmed → shipped → done` (plus
  cancel). Illegal transitions are rejected server-side with a
  compare-and-set UPDATE; the admin keyboard is generated from the same map.
- **Product deletion:** cascades out of every cart (`ON DELETE CASCADE`) and
  becomes unpurchasable immediately.

---

## 🚀 Setup (fresh install)

<details open>
<summary><b>📋 Steps</b></summary>

<br/>

**Prerequisites:** a [Cloudflare](https://dash.cloudflare.com/sign-up) account • [Node.js 22+](https://nodejs.org) • a bot token from [@BotFather](https://t.me/BotFather)

```bash
# 1️⃣ Clone and install
git clone https://github.com/hoseinrza/shoptelgram.git
cd shoptelgram
npm install

# 2️⃣ Log in to Cloudflare
npx wrangler login

# 3️⃣ Create the D1 database and paste database_id into wrangler.jsonc
npx wrangler d1 create shoptelgram
#   ↓ replace REPLACE_WITH_YOUR_D1_ID with the printed "database_id"

# 4️⃣ Create the tables (schema)
npm run d1:migrate

# 5️⃣ Set the secrets
npx wrangler secret put BOT_TOKEN              # BotFather token
npx wrangler secret put WEBHOOK_SECRET         # random [A-Za-z0-9_-] (e.g. openssl rand -hex 32)

# 6️⃣ Put your numeric Telegram id (from @userinfobot) in ADMIN_IDS (wrangler.jsonc)

# 7️⃣ Deploy
npm run deploy
```

**8️⃣ Connect the webhook (once):**

```bash
curl -X POST "https://<your-worker-url>/setup" -H "x-admin-key: $WEBHOOK_SECRET"
```

If you see `"ok": true`, you're done — open the bot in Telegram and send **/start**. 🎉

**9️⃣ Web panel (optional):**

```bash
npx wrangler secret put ADMIN_PANEL_PASSWORD   # a long random password
npm run deploy                                 # applies the new secret
```

`https://<your-worker-url>/admin` is now your management dashboard: stats, products, orders and broadcast from the browser.

> ⚠️ Admin endpoints only accept **POST with the `x-admin-key` header** — secrets never appear in URLs (no access logs, no browser history).

</details>

---

## 🔄 Migrating from the previous (KV) version

If your shop already ran on the old KV version and has data (products, orders, users, carts):

```bash
# 0) Get the KV namespace id
npx wrangler kv namespace list

# 1) Create the D1 schema (steps 3 and 4 above)

# 2) Move the data (writes kv-to-d1-backfill.sql and applies it to remote D1)
KV_NAMESPACE_ID=<your-kv-id> node scripts/migrate-kv-to-d1.mjs --apply

# 3) Deploy the new version
npm run deploy
```

The script **never deletes KV data**, is idempotent (safe to re-run), and
migrates old orders with their full line snapshots (title/price at purchase
time). Once you've verified, remove the `kv_namespaces` block from
`wrangler.jsonc`.

> `kv-to-d1-backfill.sql` contains customer data (phones, addresses) — it is
> git-ignored; never commit or share it.

---

## 🧪 Local development & tests

```bash
cp .dev.vars.example .dev.vars   # fill in the values
npm run d1:migrate:local         # schema on wrangler dev's local D1
npm run dev                      # run locally

npm test        # 115 tests (real SQLite — incl. concurrency, idempotency, panel)
npm run test:watch
npm run lint    # eslint
```

---

## ⚙️ Configuration

| Name | Type | Description |
|------|:----:|-------------|
| `BOT_TOKEN` | 🔒 secret | Bot token from BotFather |
| `WEBHOOK_SECRET` | 🔒 secret | Random string `[A-Za-z0-9_-]`; secures the webhook + admin ops |
| `DB` | 💾 D1 | Database binding (`wrangler.jsonc`) |
| `ADMIN_IDS` | 📝 var | Comma-separated numeric admin user ids |
| `ADMIN_PANEL_PASSWORD` | 🔒 secret | Password for the `/admin` web panel (empty = panel disabled) |
| `SHOP_NAME` | 📝 var | Shop title (optional) |
| `SUPPORT_CONTACT` | 📝 var | Support handle, e.g. `@support` (optional) |

The Worker landing page (`GET /`) reports configuration problems — **variable
names only, never values.**

---

## 🔗 Endpoints

| Path | Method | Auth | Purpose |
|------|:-----:|:-----:|---------|
| `/` | GET | — | 🟢 Status page |
| `/webhook` | POST | Telegram secret header | 📨 Incoming updates |
| `/admin` | GET | — | 🌐 Web admin panel |
| `/admin/login` | POST | Panel password | 🔑 Login (signed cookie) |
| `/admin/api/*` | GET/POST/PATCH/DELETE | Session cookie | 📊 Panel API |
| `/setup` | POST | `x-admin-key` | 🔧 Register webhook + commands |
| `/webhook-info` | POST | `x-admin-key` | 🔍 Inspect webhook |
| `/unset` | POST | `x-admin-key` | 🗑️ Remove webhook |

GET requests to admin endpoints are rejected with `405`.

### 🌐 Web admin panel

`/admin` is a single-file, dependency-free Persian/RTL app:

- **Dashboard:** products, orders, users, total sales
- **Products:** add, inline price/stock editing, activate/deactivate, delete, pagination
- **Orders:** status filter, full detail, transition buttons (legal transitions only)
- **Broadcast:** chunked sending (30 recipients per click) with a progress bar and continue button

Security notes: the session is an `HttpOnly + Secure + SameSite=Strict` cookie
signed with HMAC-SHA256 (key = the panel password) for 12 hours; **every** API
request is re-verified server-side; cross-origin mutations are rejected;
login is throttled (per-isolate — a mitigation, not an absolute guarantee).
The panel is served with a strict CSP and loads no external fonts, scripts or CDNs.

---

## 📋 Usage

🔐 **Admin:** after `/start` the "مدیریت" button appears → add a product → the shop is live. Or manage everything from `/admin`.

🛒 **Customer:** `/start` → «محصولات» → pick → «افزودن به سبد» → «سبد خرید» → «ثبت سفارش».

> 💡 **Payment is manual for now:** no payment gateway is integrated and orders
> only move through `pending / confirmed / shipped / done / cancelled`. If you
> later add a gateway, only mark an order paid after the gateway's verified
> confirmation.

---

## ⚠️ Known limitations

- **Broadcast:** max 30 recipients per invocation (free-plan subrequest limit);
  continue with the «ادامه ارسال» button in the bot or the web panel. Plain text only (no HTML).
- **Web panel:** the login throttle is per-isolate (counted separately per
  datacenter) — the real protection is the strong password and the signed
  cookie. The "total sales" figure excludes cancelled orders.
- **D1 free tier:** 500 MB storage, 100k writes/day, 5M reads/day. Fine for a
  small/mid shop; use the Paid plan for larger scale.
- **Cart limits:** max 25 distinct lines, max 99 units per line; text lengths
  (name/address/description) are capped server-side.
- **Legacy KV:** after migration the old KV data remains untouched (a backup).
  Removing it is up to you.
- **D1 read replicas:** if you enable them, reads may briefly lag; sensitive
  paths (checkout) run as a transaction on the primary and are unaffected.

---

## 🤝 Contributing

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

If this project helped you, please consider leaving a ⭐!

</div>

---

<a name="farsi"></a>

<div align="center">

# 🛍️ شاپ‌تلگرام — نسخهٔ فارسی

[English](#english) | **فارسی**

### یک ربات فروشگاهی کامل تلگرام روی ☁️ Cloudflare Workers + D1 — همراه با پنل مدیریت وب

</div>

---

## 📊 وضعیت پروژه

| بخش | وضعیت | توضیح |
|------|:-----:|-------|
| 🛒 فروشگاه و سبد خرید | ✅ | اعتبارسنجی موجودی و قیمت سمت سرور |
| 📦 ثبت سفارش اتمیک | ✅ | تراکنش D1: بدون اورسل، بدون سفارش تکراری |
| 🔐 پنل مدیریت ربات | ✅ | محصول، سفارش، آمار، پیام همگانی |
| 🌐 پنل وب مدیریت | ✅ | `/admin` — رمز + کوکی امضاشده، بدون وابستگی |
| 🛡️ امنیت | ✅ | وربروک سیکرت، احراز هدر، ماسک ورودی‌ها |
| 🇮🇷 رابط کاربری فارسی | ✅ | اعداد و متن‌ها فارسی |
| 🧪 تست خودکار | ✅ | ۱۱۵ تست (Vitest + SQLite واقعی) |
| 💳 درگاه پرداخت آنلاین | 🔜 | فعلاً هماهنگی دستی پرداخت |

---

## ✨ امکانات

<table>
<tr>
<td width="50%" valign="top">

### 🧑‍💻 برای مشتری‌ها
- 🛍️ مرور محصولات با عکس، قیمت و موجودی (صفحه‌بندی‌شده)
- 🗂️ دسته‌بندی محصولات
- 🛒 سبد خرید با کم/زیاد کردن تعداد + هشدار اقلام ناموجود
- ✅ ثبت سفارش (نام، تماس، آدرس) با تأیید اتمیک
- 📦 پیگیری وضعیت سفارش‌ها
- ☎️ بخش پشتیبانی

</td>
<td width="50%" valign="top">

### 🔐 برای مدیر
- ➕ افزودن محصول گام‌به‌گام (با اعتبارسنجی)
- 🛠️ ویرایش/حذف، فعال/غیرفعال + صفحه‌بندی لیست‌ها
- 📦 مدیریت سفارش‌ها با چرخهٔ وضعیت قفل‌شده
- 📊 آمار فروشگاه (فروش، کاربر، سفارش)
- 📣 پیام همگانی تکه‌تکه‌شده و قابل ادامه
- 🔔 اعلان آنی سفارش جدید
- 🌐 **پنل وب مدیریت** — داشبورد، مدیریت محصول و سفارش و پیام همگانی از مرورگر

</td>
</tr>
</table>

> همهٔ پیام‌ها فارسی و اعداد به‌صورت فارسی نمایش داده می‌شوند. 🇮🇷

---

## 🧱 پشتهٔ فناوری

| لایه | فناوری |
|:----:|:------:|
| ⚡ اجرا | Cloudflare Workers |
| 💾 ذخیره‌سازی | Cloudflare D1 (SQLite + تراکنش واقعی) |
| 🤖 ربات | Telegram Bot API (Webhook) |
| 🌐 پنل | اپ تک‌فایلی vanilla JS (بدون فریم‌ورک و CDN) |
| 🧩 زبان | JavaScript (ES Modules) |
| 🧪 تست | Vitest + `node:sqlite` |
| 🛠️ ابزار | Wrangler CLI |

---

## 🏗️ معماری

```
src/
├── 🚪 worker.js          ورودی Worker: مسیرها، webhook، اعتبارسنجی پیکربندی
├── 🔀 router.js          توزیع آپدیت‌های تلگرام + اعتبارسنجی callback
├── 🤖 telegram.js        کلاینت Bot API (مدیریت 429، تایم‌اوت، متن ساده)
├── 💾 store.js           لایهٔ داده روی D1 (تراکنش checkout اتمیک)
├── 📣 broadcast.js       موتور مشترک پیام همگانی (ربات + وب)
├── ✅ validate.js        اعتبارسنجی ورودی‌ها در همهٔ مرزهای اعتماد
├── 💬 messages.js        متن‌های فارسی + چرخهٔ وضعیت سفارش
├── ⌨️  keyboards.js       کیبوردهای این‌لاین
├── admin/
│   ├── 🔑 api.js         احراز پنل وب (رمز + کوکی امضاشده) + JSON API
│   └── 🌐 panel.js       رابط پنل وب (تک‌فایل، بدون وابستگی)
└── handlers/
    ├── 🧑 user.js         فلوهای مشتری (مرور، سبد، تسویه)
    └── 🔐 admin.js        فلوهای مدیر (محصول، سفارش، پیام همگانی)
migrations/0001_init.sql  شِمای D1 با قیدهای CHECK و UNIQUE
scripts/migrate-kv-to-d1.mjs  مهاجرت یک‌بارهٔ دادهٔ قدیمی KV
test/                     ۱۱۵ تست خودکار
```

---

## 🔒 تضمین‌های صحت داده (چرا D1؟)

نسخهٔ قبلی روی KV بود که «eventually consistent» است و تراکنش ندارد؛ زیر بار هم‌زمان، شناسهٔ تکراری و فروش بیش از موجودی ممکن بود. حالا **ثبت سفارش یک `db.batch()` در D1 است — یعنی یک تراکنش SQL اتمیک:**

- **بدون فروش بیشتر از موجودی:** کاهش موجودی با شرط `stock >= qty` داخل همان تراکنش انجام می‌شود؛ دو خرید هم‌زمان هرگز نمی‌توانند آخرین موجودی را هم‌زمان ببرند. قید `CHECK (stock >= 0)` هم پشتیبان دیتابیس است.
- **بدون سفارش تکراری:** هر صفحهٔ تأیید یک `idempotency_key` یکتا می‌سازد (قید `UNIQUE`)؛ چند بار زدن «تأیید نهایی» فقط یک سفارش می‌سازد و یک‌بار موجودی کم می‌کند.
- **عکس لحظهٔ خرید:** عنوان و قیمت هر قلم در `order_items` کپی می‌شود؛ تغییر قیمت یا حذف محصول بعداً، سفارش‌های قبلی را تغییر نمی‌دهد.
- **چرخهٔ وضعیت قفل‌شده:** `pending → confirmed → shipped → done` (و لغو)؛ تغییر وضعیت غیرمجاز سمت سرور رد می‌شود — همان نقشه‌ای که دکمه‌های مدیر از آن ساخته می‌شود.
- **حذف محصول:** با `ON DELETE CASCADE` از همهٔ سبد خریدها پاک می‌شود و قابل خرید نیست.

---

## 🚀 راه‌اندازی (نصب تازه)

<details open>
<summary><b>📋 مراحل</b></summary>

<br/>

**پیش‌نیازها:** حساب [Cloudflare](https://dash.cloudflare.com/sign-up) • [Node.js 22+](https://nodejs.org) • توکن ربات از [@BotFather](https://t.me/BotFather)

```bash
# 1️⃣ دریافت کد و نصب
git clone https://github.com/hoseinrza/shoptelgram.git
cd shoptelgram
npm install

# 2️⃣ ورود به Cloudflare
npx wrangler login

# 3️⃣ ساخت پایگاه‌دادهٔ D1 و قرار دادن database_id در wrangler.jsonc
npx wrangler d1 create shoptelgram
#   ↓ خروجی "database_id" را جای REPLACE_WITH_YOUR_D1_ID بگذارید

# 4️⃣ ساخت جداول (شِما)
npm run d1:migrate

# 5️⃣ تنظیم سکرت‌ها
npx wrangler secret put BOT_TOKEN        # توکن BotFather
npx wrangler secret put WEBHOOK_SECRET   # رشتهٔ تصادفی [A-Za-z0-9_-] (مثلاً: openssl rand -hex 32)

# 6️⃣ شناسهٔ عددی مدیر را از @userinfobot بگیرید و در wrangler.jsonc داخل ADMIN_IDS بگذارید

# 7️⃣ دیپلوی
npm run deploy
```

**8️⃣ اتصال webhook (یک‌بار):**

```bash
curl -X POST "https://<your-worker-url>/setup" -H "x-admin-key: $WEBHOOK_SECRET"
```

اگر `"ok": true` دیدید، تمام است! در تلگرام به ربات **/start** بدهید. 🎉

**9️⃣ پنل وب (اختیاری):**

```bash
npx wrangler secret put ADMIN_PANEL_PASSWORD   # یک رمز طولانی و تصادفی
npm run deploy                                 # اعمال سکرت جدید
```

حالا `https://<your-worker-url>/admin` داشبورد مدیریت است: آمار، محصولات، سفارش‌ها و پیام همگانی از مرورگر.

> ⚠️ مسیرهای مدیریتی فقط **POST با هدر `x-admin-key`** قبول می‌کنند؛ سیکرت هرگز در URL قرار نمی‌گیرد (در لاگ‌ها و تاریخچهٔ مرورگر باقی نمی‌ماند).

</details>

---

## 🔄 مهاجرت از نسخهٔ قبلی (KV)

اگر فروشگاه قبلاً با نسخهٔ KV کار می‌کرد و داده دارید (محصول، سفارش، کاربر، سبد):

```bash
# 0) id فضای KV را بگیرید
npx wrangler kv namespace list

# 1) شِمای D1 را بسازید (مراحل ۳ و ۴ بالا)

# 2) انتقال داده (خروجی: kv-to-d1-backfill.sql + اجرای خودکار روی D1 ریموت)
KV_NAMESPACE_ID=<your-kv-id> node scripts/migrate-kv-to-d1.mjs --apply

# 3) دیپلوی نسخهٔ جدید
npm run deploy
```

اسکریپت **هیچ داده‌ای از KV پاک نمی‌کند**، قابل اجرای مجدد (idempotent) است و سفارش‌های قدیمی را با کل خط‌هایشان (عنوان/قیمت لحظهٔ خرید) منتقل می‌کند. بعد از اطمینان از درستی، بلوک `kv_namespaces` را از `wrangler.jsonc` حذف کنید.

> فایل `kv-to-d1-backfill.sql` شامل اطلاعات مشتریان است؛ در `.gitignore` هست — هرگز کامیت یا به‌اشتراک نگذارید.

---

## 🧪 اجرای محلی و تست‌ها

```bash
cp .dev.vars.example .dev.vars   # مقدارها را پر کنید
npm run d1:migrate:local         # شِما روی D1 محلیِ wrangler dev
npm run dev                      # اجرای محلی

npm test        # ۱۱۵ تست (با SQLite واقعی — شامل تست هم‌زمانی، idempotency و پنل وب)
npm run test:watch
npm run lint    # eslint
```

---

## ⚙️ پیکربندی

| نام | نوع | توضیح |
|------|:----:|-------|
| `BOT_TOKEN` | 🔒 secret | توکن ربات از BotFather |
| `WEBHOOK_SECRET` | 🔒 secret | رشتهٔ تصادفی `[A-Za-z0-9_-]`؛ امنیت webhook و عملیات مدیریتی |
| `DB` | 💾 D1 | بایندینگ پایگاه‌داده (`wrangler.jsonc`) |
| `ADMIN_IDS` | 📝 var | شناسهٔ عددی مدیران (با کاما) |
| `ADMIN_PANEL_PASSWORD` | 🔒 secret | رمز پنل وب `/admin` (خالی = پنل غیرفعال) |
| `SHOP_NAME` | 📝 var | نام فروشگاه (اختیاری) |
| `SUPPORT_CONTACT` | 📝 var | آیدی پشتیبانی مثل `@support` (اختیاری) |

صفحهٔ اصلی Worker (`GET /`) وضعیت پیکربندی را نشان می‌دهد — فقط **نام** متغیرهای ناقص، بدون هیچ مقداری.

---

## 🔗 Endpointها

| مسیر | متد | احراز | کاربرد |
|------|:---:|:-----:|--------|
| `/` | GET | — | 🟢 صفحهٔ وضعیت |
| `/webhook` | POST | هدر سیکرت تلگرام | 📨 دریافت آپدیت‌ها |
| `/admin` | GET | — | 🌐 پنل وب مدیریت |
| `/admin/login` | POST | رمز پنل | 🔑 ورود (کوکی امضاشده) |
| `/admin/api/*` | GET/POST/PATCH/DELETE | کوکی نشست | 📊 API پنل |
| `/setup` | POST | `x-admin-key` | 🔧 ثبت webhook و دستورات |
| `/webhook-info` | POST | `x-admin-key` | 🔍 بررسی وضعیت webhook |
| `/unset` | POST | `x-admin-key` | 🗑️ حذف webhook |

درخواست‌های GET روی مسیرهای مدیریتی با `405` رد می‌شوند.

### 🌐 پنل وب مدیریت

`/admin` یک اپ تک‌فایلی بدون وابستگی (فارسی، RTL) است:

- **داشبورد:** محصولات، سفارش‌ها، کاربران، مجموع فروش
- **محصولات:** افزودن، ویرایش قیمت/موجودی درجا، فعال/غیرفعال، حذف + صفحه‌بندی
- **سفارش‌ها:** فیلتر وضعیت، جزئیات کامل، دکمه‌های گذار وضعیت (فقط گذارهای مجاز)
- **پیام همگانی:** ارسال تکه‌ای (۳۰ گیرنده در هر کلیک) با نوار پیشرفت و دکمهٔ ادامه

نکات امنیتی: نشست با کوکی `HttpOnly + Secure + SameSite=Strict` و امضای HMAC-SHA256 (کلید = رمز پنل) به مدت ۱۲ ساعت؛ هر درخواست API سمت سرور دوباره احراز می‌شود؛ درخواست‌های تغییردهندهٔ cross-origin رد می‌شوند؛ ورود با پنجرهٔ محدودشدهٔ تلاش محافظت می‌شود (per-isolate — کاهش‌دهنده، نه ضمانت مطلق). پنل با CSP سخت‌گیرانه سرو می‌شود و هیچ CDN/فونت/اسکریپت خارجی ندارد.

---

## 📋 نحوهٔ استفاده

🔐 **مدیر:** بعد از `/start` دکمهٔ «مدیریت» ظاهر می‌شود → محصول اضافه کنید → فروشگاه آماده است. یا همه‌چیز را از `/admin` مدیریت کنید.

🛒 **مشتری:** `/start` → «محصولات» → انتخاب → «افزودن به سبد» → «سبد خرید» → «ثبت سفارش».

> 💡 **پرداخت فعلاً دستی است:** هیچ درگاه پرداختی وصل نیست و سفارش‌ها فقط با وضعیت‌های `pending / confirmed / shipped / done / cancelled` مدیریت می‌شوند. اگر بعداً درگاه اضافه کردید، سفارش را فقط بعد از تأیید واقعی درگاه به `paid` ببرید.

---

## ⚠️ محدودیت‌های شناخته‌شده

- **پیام همگانی:** هر بار حداکثر ۳۰ گیرنده (محدودیت subrequest در پلن رایگان Workers)؛ ادامه با دکمهٔ «ادامه ارسال» در ربات یا وب تا پایان. ارسال متن ساده است (بدون HTML).
- **پنل وب:** محدودکنندهٔ تلاش ورود per-isolate است (در هر دیتاسنتر جدا شمرده می‌شود) — محافظ واقعی، رمز قوی و کوکی امضاشده است. شمارندهٔ «مجموع فروش» سفارش‌های لغوشده را حساب نمی‌کند.
- **محدودیت‌های D1 پلن رایگان:** ۵۰۰ مگابایت حجم، ۱۰۰ هزار نوشتن/روز و ۵ میلیون خواندن/روز. برای فروشگاه کوچک/متوسط کافی است؛ برای مقیاس بالاتر، پلن Paid.
- **محدودیت‌های سبد:** حداکثر ۲۵ قلم مختلف و ۹۹ عدد برای هر قلم؛ طول متن‌ها (نام/آدرس/توضیحات) سمت سرور محدود می‌شود.
- **دستهٔ قبلی KV:** پس از مهاجرت، داده‌های قدیمی در KV می‌مانند (پشتیبان). حذفش با شماست.
- **Replicaهای خواندن D1:** اگر فعالشان کنید، خواندن‌ها ممکن است لحظه‌ای عقب باشند؛ مسیرهای حساس (checkout) در تراکنش روی primary اجرا می‌شوند و مشکلی ندارند.

---

## 🤝 توسعه

```bash
npm test && npm run lint   # قبل از هر PR
```

CI روی هر push/PR هر دو را اجرا می‌کند (Node 22).

---

<div align="center">

## 📝 لایسنس

[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

**MIT** © hoseinrza

<br/>

اگر این پروژه برایتان مفید بود، یک ⭐ فراموش نشود!

</div>
