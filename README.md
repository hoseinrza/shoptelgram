<div align="center">

# 🛍️ shoptelgram

### یک ربات فروشگاهی کامل تلگرام روی ☁️ Cloudflare Workers + D1

**بدون سرور • پایگاه‌دادهٔ SQLite روی لبه • تقریباً رایگان**

<br/>

<!-- ===== Badges ===== -->
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Cloudflare D1](https://img.shields.io/badge/Cloudflare-D1_SQLite-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/d1/)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot_API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

<!-- ===== Status shields ===== -->
![Tests](https://img.shields.io/badge/tests-94_passing-22C55E?style=flat-square)
![Storage](https://img.shields.io/badge/storage-D1_(atomic_transactions)-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Language](https://img.shields.io/badge/UI-فارسی-007A33?style=flat-square)
![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?style=flat-square&logo=githubactions&logoColor=white)

</div>

---

<div align="center">

> 🚀 **یک فروشگاه آنلاین کامل داخل تلگرام** — مرور محصول، سبد خرید، ثبت سفارش اتمیک و پنل مدیریت؛ همه روی لبهٔ شبکهٔ Cloudflare.

</div>

---

## 📊 وضعیت پروژه

| بخش | وضعیت | توضیح |
|------|:-----:|-------|
| 🛒 فروشگاه و سبد خرید | ✅ | اعتبارسنجی موجودی و قیمت سمت سرور |
| 📦 ثبت سفارش اتمیک | ✅ | تراکنش D1: بدون اورسل، بدون سفارش تکراری |
| 🔐 پنل مدیریت | ✅ | محصول، سفارش، آمار، پیام همگانی |
| 🛡️ امنیت | ✅ | وربروک سیکرت، احراز هدر، ماسک ورودی‌ها |
| 🇮🇷 رابط کاربری فارسی | ✅ | اعداد و متن‌ها فارسی |
| 🧪 تست خودکار | ✅ | ۹۴ تست (Vitest + SQLite واقعی) |
| 💳 درگاه پرداخت آنلاین | 🔜 | فعلاً هماهنگی دستی پرداخت |
| 🌐 پنل وب مدیریت | 💡 | انجام نشده |

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
├── ✅ validate.js        اعتبارسنجی ورودی‌ها در همهٔ مرزهای اعتماد
├── 💬 messages.js        متن‌های فارسی + چرخهٔ وضعیت سفارش
├── ⌨️  keyboards.js       کیبوردهای این‌لاین
└── handlers/
    ├── 🧑 user.js         فلوهای مشتری (مرور، سبد، تسویه)
    └── 🔐 admin.js        فلوهای مدیر (محصول، سفارش، پیام همگانی)
migrations/0001_init.sql  شِمای D1 با قیدهای CHECK و UNIQUE
scripts/migrate-kv-to-d1.mjs  مهاجرت یک‌بارهٔ دادهٔ قدیمی KV
test/                     ۹۴ تست خودکار
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

npm test        # ۹۴ تست (با SQLite واقعی — شامل تست هم‌زمانی و idempotency)
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
| `SHOP_NAME` | 📝 var | نام فروشگاه (اختیاری) |
| `SUPPORT_CONTACT` | 📝 var | آیدی پشتیبانی مثل `@support` (اختیاری) |

صفحهٔ اصلی Worker (`GET /`) وضعیت پیکربندی را نشان می‌دهد — فقط **نام** متغیرهای ناقص، بدون هیچ مقداری.

---

## 🔗 Endpointها

| مسیر | متد | احراز | کاربرد |
|------|:---:|:-----:|--------|
| `/` | GET | — | 🟢 صفحهٔ وضعیت |
| `/webhook` | POST | هدر سیکرت تلگرام | 📨 دریافت آپدیت‌ها |
| `/setup` | POST | `x-admin-key` | 🔧 ثبت webhook و دستورات |
| `/webhook-info` | POST | `x-admin-key` | 🔍 بررسی وضعیت webhook |
| `/unset` | POST | `x-admin-key` | 🗑️ حذف webhook |

درخواست‌های GET روی مسیرهای مدیریتی با `405` رد می‌شوند.

---

## 📋 نحوهٔ استفاده

🔐 **مدیر:** بعد از `/start` دکمهٔ «مدیریت» ظاهر می‌شود → محصول اضافه کنید → فروشگاه آماده است.

🛒 **مشتری:** `/start` → «محصولات» → انتخاب → «افزودن به سبد» → «سبد خرید» → «ثبت سفارش».

> 💡 **پرداخت فعلاً دستی است:** هیچ درگاه پرداختی وصل نیست و سفارش‌ها فقط با وضعیت‌های `pending / confirmed / shipped / done / cancelled` مدیریت می‌شوند. اگر بعداً درگاه اضافه کردید، سفارش را فقط بعد از تأیید واقعی درگاه به `paid` ببرید.

---

## ⚠️ محدودیت‌های شناخته‌شده

- **پیام همگانی:** هر بار حداکثر ۳۰ گیرنده (محدودیت subrequest در پلن رایگان Workers)؛ ادامه با دکمهٔ «ادامه ارسال» تا پایان. ارسال متن ساده است (بدون HTML).
- **محدودیت‌های D1 پلن رایگان:** ۵۰۰ مگابایت حجم، ۱۰۰ هزار نوشتن/روز و ۵ میلیون خواندن/روز. برای فروشگاه کوچک/متوسط کافی است؛ برای مقیاس بالاتر، پلن Paid.
- **محدودیت‌های سبد:** حداکثر ۲۵ قلم مختلف و ۹۹ عدد برای هر قلم؛ طول متن‌ها (نام/آدرس/توضیحات) سمت سرور محدود می‌شود.
- **دستهٔ قبلی KV:** پس از مهاجرت، داده‌های قدیمی در KV می‌مانند (پشتیبان). حذفش با شماست.
- **Replicaهای خواندن D1:** اگر فعالشان کنید، خواندن‌ها ممکن است لحظه‌ای عقب باشند؛ وربروک‌های حساس (checkout) در تراکنش روی primary اجرا می‌شوند و مشکلی ندارند.

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
