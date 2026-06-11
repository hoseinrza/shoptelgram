# 🛍 shoptelgram

یک **ربات فروشگاهی کامل تلگرام** که روی **Cloudflare Workers** و **KV** اجرا می‌شود — بدون سرور، بدون پایگاه‌دادهٔ جداگانه، و با هزینهٔ تقریباً صفر روی پلن رایگان Cloudflare.

> A complete, production-ready Telegram shop bot on Cloudflare Workers + KV. Serverless, no extra database, runs comfortably on Cloudflare's free tier.

---

## ✨ امکانات

**برای مشتری‌ها**
- 🛍 مرور محصولات همراه با عکس، قیمت و موجودی
- 🗂 دسته‌بندی محصولات
- 🛒 سبد خرید با امکان کم/زیاد کردن تعداد
- ✅ ثبت سفارش با گرفتن نام، شماره تماس و آدرس
- 📦 پیگیری وضعیت سفارش‌ها («در انتظار»، «تأیید شد»، «ارسال شد»، «تحویل شد»)
- ☎️ بخش پشتیبانی

**برای مدیر (Admin)**
- ➕ افزودن محصول به‌صورت گام‌به‌گام (نام، توضیح، قیمت، موجودی، دسته، عکس)
- 🛠 ویرایش قیمت و موجودی، فعال/غیرفعال کردن و حذف محصول
- 📦 مشاهده سفارش‌ها و تغییر وضعیت آن‌ها (با اطلاع‌رسانی خودکار به مشتری)
- 📊 آمار فروشگاه (تعداد محصولات، سفارش‌ها، کاربران و مجموع فروش)
- 📣 ارسال پیام همگانی به همهٔ کاربران
- 🔔 دریافت اعلان آنی هنگام ثبت هر سفارش جدید

همهٔ پیام‌ها فارسی و اعداد به‌صورت فارسی نمایش داده می‌شوند.

---

## 🏗 معماری

```
src/
├── worker.js          ورودی Worker: مسیرها، webhook، setup
├── router.js          توزیع آپدیت‌های تلگرام به هندلرها + ساخت context
├── telegram.js        کلاینت سبک Bot API
├── store.js           لایهٔ داده روی Cloudflare KV
├── messages.js        تمام متن‌های فارسی + ابزار نمایش قیمت/عدد
├── keyboards.js       کیبوردهای این‌لاین
└── handlers/
    ├── user.js        فلوهای مشتری (مرور، سبد، تسویه، سفارش‌ها)
    └── admin.js       فلوهای مدیر (محصولات، سفارش‌ها، آمار، پیام همگانی)
```

داده‌ها در یک KV namespace با این کلیدها ذخیره می‌شوند:
`product:<id>` · `order:<id>` · `user:<id>` · `cart:<userId>` · `state:<userId>` · `seq:<name>`

---

## 🚀 راه‌اندازی و دیپلوی (مرحله‌به‌مرحله)

### پیش‌نیازها
- یک حساب [Cloudflare](https://dash.cloudflare.com/sign-up) (رایگان)
- [Node.js](https://nodejs.org) نسخهٔ ۱۸ به بالا
- یک ربات تلگرام و توکن آن از [@BotFather](https://t.me/BotFather)

### ۱) دریافت کد و نصب وابستگی‌ها
```bash
git clone https://github.com/hoseinrza/shoptelgram.git
cd shoptelgram
npm install
```

### ۲) ورود به Cloudflare
```bash
npx wrangler login
```

### ۳) ساخت KV namespace
```bash
npx wrangler kv namespace create SHOP
```
خروجی یک `id` می‌دهد. آن را در فایل [`wrangler.jsonc`](wrangler.jsonc) به‌جای `REPLACE_WITH_YOUR_KV_ID` قرار دهید.

### ۴) گرفتن شناسهٔ عددی مدیر
در تلگرام به [@userinfobot](https://t.me/userinfobot) پیام دهید تا `id` عددی شما را بدهد.
این عدد را در [`wrangler.jsonc`](wrangler.jsonc) داخل `vars.ADMIN_IDS` بگذارید (چند مدیر را با کاما جدا کنید). نام فروشگاه و آیدی پشتیبانی را هم همان‌جا تنظیم کنید.

### ۵) تنظیم سکرت‌ها
> سکرت‌ها هرگز نباید در فایل‌های گیت قرار بگیرند.
```bash
npx wrangler secret put BOT_TOKEN
# توکنی که BotFather داده را وارد کنید

npx wrangler secret put WEBHOOK_SECRET
# یک رشتهٔ تصادفی طولانی وارد کنید (مثلاً خروجی openssl rand -hex 32)
```

### ۶) دیپلوی
```bash
npm run deploy
```
آدرس Worker شما چاپ می‌شود، مثل: `https://bottele.<subdomain>.workers.dev`

### ۷) اتصال webhook به تلگرام (یک‌بار)
آدرس زیر را در مرورگر باز کنید (به‌جای مقدارها مقادیر خودتان را بگذارید):
```
https://bottele.<subdomain>.workers.dev/setup?key=WEBHOOK_SECRET
```
اگر پاسخ JSON با `"ok": true` دیدید، تمام است. حالا در تلگرام به ربات `/start` بدهید. 🎉

---

## 🧪 اجرای محلی (Local Dev)

```bash
cp .dev.vars.example .dev.vars   # سپس مقدارها را پر کنید
npm run dev
```
برای آزمایش وب‌هوک به‌صورت محلی می‌توانید از یک تونل (مثل `cloudflared tunnel`) استفاده کنید و آدرس عمومی را به `/setup` بدهید.

---

## ⚙️ متغیرهای پیکربندی

| نام | نوع | توضیح |
|------|------|-------|
| `BOT_TOKEN` | secret | توکن ربات از BotFather |
| `WEBHOOK_SECRET` | secret | رشتهٔ تصادفی؛ امنیت webhook و endpointهای مدیریتی |
| `SHOP` | KV binding | فضای ذخیره‌سازی داده‌ها |
| `ADMIN_IDS` | var | شناسهٔ عددی مدیران، جداشده با کاما |
| `SHOP_NAME` | var | نام فروشگاه (اختیاری) |
| `SUPPORT_CONTACT` | var | آیدی پشتیبانی، مثل `@support` (اختیاری) |

---

## 🔗 Endpointهای مدیریتی

| مسیر | کاربرد |
|------|--------|
| `GET /` | صفحهٔ وضعیت |
| `POST /webhook` | دریافت آپدیت‌های تلگرام (با هدر سکرت محافظت‌شده) |
| `GET /setup?key=…` | ثبت webhook و دستورات ربات |
| `GET /webhook-info?key=…` | بررسی وضعیت فعلی webhook |
| `GET /unset?key=…` | حذف webhook |

`key` باید برابر `WEBHOOK_SECRET` باشد.

---

## 📋 نحوهٔ استفاده

**مدیر:** بعد از `/start`، دکمهٔ «🔐 مدیریت» نمایش داده می‌شود. از آنجا محصول اضافه کنید؛ به‌محض اضافه شدن اولین محصول، مشتری‌ها می‌توانند خرید کنند.

**مشتری:** `/start` → «🛍 محصولات» → انتخاب محصول → «➕ افزودن به سبد» → «🛒 سبد خرید» → «✅ ثبت سفارش» و وارد کردن نام/تلفن/آدرس.

> 💡 پرداخت در این نسخه به‌صورت هماهنگی دستی است (مدیر بعد از ثبت سفارش با مشتری تماس می‌گیرد). برای اتصال درگاه پرداخت می‌توانید مرحلهٔ تأیید سفارش در `handlers/user.js` را گسترش دهید.

---

## 📝 لایسنس

[MIT](LICENSE) © hoseinrza
