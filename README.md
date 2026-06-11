<div align="center">

# 🛍️ shoptelgram

### یک ربات فروشگاهی کامل تلگرام روی ☁️ Cloudflare Workers

**بدون سرور • بدون پایگاه‌دادهٔ جداگانه • تقریباً رایگان**

<br/>

<!-- ===== Badges ===== -->
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![Telegram Bot](https://img.shields.io/badge/Telegram-Bot_API-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://core.telegram.org/bots/api)
[![JavaScript](https://img.shields.io/badge/JavaScript-ESM-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

<!-- ===== Status shields ===== -->
![Status](https://img.shields.io/badge/status-production_ready-success?style=flat-square)
![Storage](https://img.shields.io/badge/storage-Cloudflare_KV-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![Language](https://img.shields.io/badge/UI-فارسی-007A33?style=flat-square)
![Cost](https://img.shields.io/badge/cost-~%240%2Fmo-blueviolet?style=flat-square)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-ff69b4?style=flat-square)

</div>

---

<div align="center">

> 🚀 **یک فروشگاه آنلاین کامل داخل تلگرام** — مرور محصول، سبد خرید، ثبت سفارش و پنل مدیریت؛ همه روی لبهٔ شبکهٔ Cloudflare.

</div>

---

## 📊 وضعیت پروژه

| بخش | وضعیت | پیشرفت |
|------|:-----:|:-------|
| 🛒 فروشگاه و سبد خرید | ✅ | `██████████` **۱۰۰٪** |
| 🔐 پنل مدیریت | ✅ | `██████████` **۱۰۰٪** |
| 📦 مدیریت سفارش‌ها | ✅ | `██████████` **۱۰۰٪** |
| 📣 پیام همگانی و آمار | ✅ | `██████████` **۱۰۰٪** |
| 🇮🇷 رابط کاربری فارسی | ✅ | `██████████` **۱۰۰٪** |
| 💳 درگاه پرداخت آنلاین | 🔜 | `███░░░░░░░` **۳۰٪** |
| 🌐 پنل وب مدیریت | 💡 | `░░░░░░░░░░` **۰٪** |

<div align="center">

![Made with love](https://img.shields.io/badge/ساخته_شده_با-❤️_و_Cloudflare-F38020?style=flat-square)

</div>

---

## ✨ امکانات

<table>
<tr>
<td width="50%" valign="top">

### 🧑‍💻 برای مشتری‌ها
- 🛍️ مرور محصولات با عکس، قیمت و موجودی
- 🗂️ دسته‌بندی محصولات
- 🛒 سبد خرید با کم/زیاد کردن تعداد
- ✅ ثبت سفارش (نام، تماس، آدرس)
- 📦 پیگیری وضعیت سفارش‌ها
- ☎️ بخش پشتیبانی

</td>
<td width="50%" valign="top">

### 🔐 برای مدیر
- ➕ افزودن محصول گام‌به‌گام
- 🛠️ ویرایش/حذف، فعال/غیرفعال
- 📦 مدیریت سفارش‌ها + اعلان به مشتری
- 📊 آمار فروشگاه (فروش، کاربر، سفارش)
- 📣 پیام همگانی به همهٔ کاربران
- 🔔 اعلان آنی سفارش جدید

</td>
</tr>
</table>

> همهٔ پیام‌ها فارسی و اعداد به‌صورت فارسی نمایش داده می‌شوند. 🇮🇷

---

## 🧱 پشتهٔ فناوری

<div align="center">

| لایه | فناوری |
|:----:|:------:|
| ⚡ اجرا | Cloudflare Workers |
| 💾 ذخیره‌سازی | Cloudflare KV |
| 🤖 ربات | Telegram Bot API (Webhook) |
| 🧩 زبان | JavaScript (ES Modules) |
| 🛠️ ابزار | Wrangler CLI |

</div>

---

## 🏗️ معماری

```
src/
├── 🚪 worker.js          ورودی Worker: مسیرها، webhook، setup
├── 🔀 router.js          توزیع آپدیت‌های تلگرام + ساخت context
├── 🤖 telegram.js        کلاینت سبک Bot API
├── 💾 store.js           لایهٔ داده روی Cloudflare KV
├── 💬 messages.js        متن‌های فارسی + نمایش قیمت/عدد
├── ⌨️  keyboards.js       کیبوردهای این‌لاین
└── handlers/
    ├── 🧑 user.js         فلوهای مشتری (مرور، سبد، تسویه)
    └── 🔐 admin.js        فلوهای مدیر (محصول، سفارش، آمار)
```

داده‌ها در یک KV namespace ذخیره می‌شوند:
`product:<id>` · `order:<id>` · `user:<id>` · `cart:<userId>` · `state:<userId>` · `seq:<name>`

---

## 🚀 راه‌اندازی و دیپلوی

<details open>
<summary><b>📋 مراحل را اینجا باز/بسته کنید</b></summary>

<br/>

**پیش‌نیازها:** حساب [Cloudflare](https://dash.cloudflare.com/sign-up) • [Node.js ۱۸+](https://nodejs.org) • توکن ربات از [@BotFather](https://t.me/BotFather)

```bash
# 1️⃣ دریافت کد و نصب
git clone https://github.com/hoseinrza/shoptelgram.git
cd shoptelgram
npm install

# 2️⃣ ورود به Cloudflare
npx wrangler login

# 3️⃣ ساخت فضای ذخیره‌سازی (id را در wrangler.jsonc بگذارید)
npx wrangler kv namespace create SHOP

# 4️⃣ تنظیم سکرت‌ها
npx wrangler secret put BOT_TOKEN        # توکن BotFather
npx wrangler secret put WEBHOOK_SECRET   # یک رشتهٔ تصادفی طولانی

# 5️⃣ دیپلوی
npm run deploy
```

> 🆔 شناسهٔ عددی مدیر را از [@userinfobot](https://t.me/userinfobot) بگیرید و در `wrangler.jsonc` داخل `ADMIN_IDS` بگذارید.

**6️⃣ اتصال webhook (یک‌بار):** این آدرس را در مرورگر باز کنید 👇

```
https://<your-worker-url>/setup?key=WEBHOOK_SECRET
```

اگر `"ok": true` دیدید، تمام است! در تلگرام به ربات **/start** بدهید. 🎉

</details>

---

## 🧪 اجرای محلی

```bash
cp .dev.vars.example .dev.vars   # مقدارها را پر کنید
npm run dev
```

---

## ⚙️ پیکربندی

| نام | نوع | توضیح |
|------|:----:|-------|
| `BOT_TOKEN` | 🔒 secret | توکن ربات از BotFather |
| `WEBHOOK_SECRET` | 🔒 secret | رشتهٔ تصادفی؛ امنیت webhook و پنل |
| `SHOP` | 💾 KV | فضای ذخیره‌سازی داده‌ها |
| `ADMIN_IDS` | 📝 var | شناسهٔ عددی مدیران (با کاما) |
| `SHOP_NAME` | 📝 var | نام فروشگاه (اختیاری) |
| `SUPPORT_CONTACT` | 📝 var | آیدی پشتیبانی مثل `@support` (اختیاری) |

---

## 🔗 Endpointهای مدیریتی

| مسیر | کاربرد |
|------|--------|
| `GET /` | 🟢 صفحهٔ وضعیت |
| `POST /webhook` | 📨 دریافت آپدیت‌های تلگرام |
| `GET /setup?key=…` | 🔧 ثبت webhook و دستورات |
| `GET /webhook-info?key=…` | 🔍 بررسی وضعیت webhook |
| `GET /unset?key=…` | 🗑️ حذف webhook |

> `key` باید برابر `WEBHOOK_SECRET` باشد.

---

## 📋 نحوهٔ استفاده

🔐 **مدیر:** بعد از `/start` دکمهٔ «مدیریت» ظاهر می‌شود → محصول اضافه کنید → فروشگاه آماده است.

🛒 **مشتری:** `/start` → «محصولات» → انتخاب → «افزودن به سبد» → «سبد خرید» → «ثبت سفارش».

> 💡 پرداخت فعلاً به‌صورت هماهنگی دستی است. برای اتصال درگاه، مرحلهٔ تأیید سفارش در `handlers/user.js` را گسترش دهید.

---

<div align="center">

## 📝 لایسنس

[![License: MIT](https://img.shields.io/badge/License-MIT-22C55E?style=for-the-badge)](LICENSE)

**MIT** © hoseinrza

<br/>

اگر این پروژه برایتان مفید بود، یک ⭐ فراموش نشود!

</div>
