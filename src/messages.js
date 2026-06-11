/**
 * All user-facing text in one place (Persian / فارسی).
 * Keeps copy out of the handlers and easy to tweak.
 */

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** HTML-escape user-provided text before putting it in HTML messages. */
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Group digits with thousands separators and convert to Persian numerals. */
export function money(n, currency = 'تومان') {
  const grouped = String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fa = grouped.replace(/\d/g, (d) => FA_DIGITS[d]);
  return `${fa} ${currency}`;
}

export function faNum(n) {
  return String(n).replace(/\d/g, (d) => FA_DIGITS[d]);
}

export const ORDER_STATUS = {
  pending: '⏳ در انتظار تأیید',
  confirmed: '✅ تأیید شد',
  shipped: '🚚 ارسال شد',
  done: '🎉 تحویل شد',
  cancelled: '❌ لغو شد',
};

export const t = {
  // shared
  shopName: (env) => env.SHOP_NAME || 'فروشگاه',
  back: '⬅️ بازگشت',
  cancel: '✖️ انصراف',
  cancelled: 'عملیات لغو شد.',
  unknown: 'متوجه نشدم 🤔 از دکمه‌های منو استفاده کنید یا /start را بزنید.',

  welcome: (env, name) =>
    `سلام ${esc(name)} عزیز 👋\n\n` +
    `به <b>${esc(t.shopName(env))}</b> خوش آمدید.\n` +
    `از منوی زیر استفاده کنید:`,

  // main menu buttons
  btnProducts: '🛍 محصولات',
  btnCart: '🛒 سبد خرید',
  btnOrders: '📦 سفارش‌های من',
  btnContact: '☎️ پشتیبانی',
  btnAdmin: '🔐 مدیریت',

  // products
  noProducts: 'فعلاً محصولی برای نمایش وجود ندارد. به‌زودی برمی‌گردیم 🙏',
  chooseCategory: 'یک دسته‌بندی را انتخاب کنید:',
  allProducts: '🗂 همه محصولات',
  productCaption: (p) =>
    `<b>${esc(p.title)}</b>\n\n` +
    (p.description ? `${esc(p.description)}\n\n` : '') +
    `💵 قیمت: <b>${money(p.price)}</b>\n` +
    `📦 موجودی: ${p.stock > 0 ? faNum(p.stock) + ' عدد' : 'ناموجود'}`,
  outOfStock: 'این محصول در حال حاضر ناموجود است.',
  added: 'به سبد خرید اضافه شد ✅',

  // cart
  emptyCart: 'سبد خرید شما خالی است 🛒\nاز بخش «محصولات» اقلام را اضافه کنید.',
  cartHeader: '🛒 <b>سبد خرید شما</b>\n\n',
  cartLine: (line) =>
    `• ${esc(line.product.title)}\n` +
    `   ${faNum(line.qty)} × ${money(line.product.price)} = <b>${money(line.lineTotal)}</b>\n`,
  cartTotal: (total) => `\n💰 جمع کل: <b>${money(total)}</b>`,
  btnCheckout: '✅ ثبت سفارش',
  btnClearCart: '🗑 خالی کردن سبد',
  cartCleared: 'سبد خرید خالی شد.',

  // checkout flow
  askName: '📝 لطفاً نام و نام خانوادگی گیرنده را بنویسید:',
  askPhone: '📱 شماره تماس را وارد کنید (مثال: ۰۹۱۲۱۲۳۴۵۶۷):',
  askAddress: '🏠 آدرس کامل پستی را با ذکر کد پستی بنویسید:',
  invalidPhone: 'شماره تماس معتبر نیست. یک شماره موبایل ۱۱ رقمی وارد کنید:',
  orderReview: (c, total) =>
    `لطفاً سفارش خود را بررسی و تأیید کنید:\n\n` +
    `👤 ${esc(c.name)}\n📱 ${esc(c.phone)}\n🏠 ${esc(c.address)}\n\n` +
    `💰 مبلغ قابل پرداخت: <b>${money(total)}</b>`,
  btnConfirmOrder: '✅ تأیید نهایی',
  orderPlaced: (id) =>
    `سفارش شما با شماره <b>#${faNum(id)}</b> ثبت شد 🎉\n\n` +
    `همکاران ما برای هماهنگی پرداخت و ارسال با شما تماس می‌گیرند. ممنون از خرید شما 🌹`,
  stockChanged: 'موجودی برخی اقلام تغییر کرده است؛ لطفاً سبد خرید را دوباره بررسی کنید.',

  // my orders
  noOrders: 'هنوز سفارشی ثبت نکرده‌اید.',
  myOrdersHeader: '📦 <b>سفارش‌های شما</b>\n\n',
  orderLine: (o) =>
    `#${faNum(o.id)} — ${money(o.total)} — ${ORDER_STATUS[o.status] || o.status}\n`,

  // contact
  contact: (env) =>
    env.SUPPORT_CONTACT
      ? `برای ارتباط با پشتیبانی پیام دهید:\n${esc(env.SUPPORT_CONTACT)}`
      : 'برای ارتباط با پشتیبانی، همین‌جا پیام خود را ارسال کنید.',

  // ---- admin -------------------------------------------------------------
  adminPanel: '🔐 <b>پنل مدیریت</b>\n\nیک گزینه را انتخاب کنید:',
  notAdmin: 'این بخش فقط برای مدیران در دسترس است.',
  btnAddProduct: '➕ افزودن محصول',
  btnManageProducts: '🛠 مدیریت محصولات',
  btnAdminOrders: '📦 سفارش‌ها',
  btnStats: '📊 آمار',
  btnBroadcast: '📣 پیام همگانی',

  askProdTitle: '🛍 نام محصول را بنویسید:',
  askProdDesc: '📄 توضیحات محصول را بنویسید (یا «-» برای رد شدن):',
  askProdPrice: '💵 قیمت محصول را به عدد (تومان) وارد کنید:',
  askProdStock: '📦 موجودی اولیه را به عدد وارد کنید:',
  askProdCategory: '🗂 دسته‌بندی را بنویسید (یا «-» برای بدون دسته):',
  askProdPhoto: '🖼 یک عکس برای محصول بفرستید (یا «-» برای رد شدن):',
  invalidNumber: 'لطفاً فقط عدد وارد کنید:',
  productCreated: (p) => `محصول «${esc(p.title)}» با شناسه #${faNum(p.id)} ثبت شد ✅`,

  manageHeader: '🛠 <b>مدیریت محصولات</b>\nبرای ویرایش یا حذف، روی هر محصول بزنید:',
  productAdminView: (p) =>
    `<b>${esc(p.title)}</b> (#${faNum(p.id)})\n` +
    `💵 ${money(p.price)} | 📦 ${faNum(p.stock)} | ${p.active ? '🟢 فعال' : '🔴 غیرفعال'}`,
  btnToggleActive: (p) => (p.active ? '🔴 غیرفعال کردن' : '🟢 فعال کردن'),
  btnDeleteProduct: '🗑 حذف محصول',
  btnEditStock: '📦 ویرایش موجودی',
  btnEditPrice: '💵 ویرایش قیمت',
  productDeleted: 'محصول حذف شد.',
  askNewStock: 'موجودی جدید را وارد کنید:',
  askNewPrice: 'قیمت جدید را وارد کنید:',
  updated: 'به‌روزرسانی شد ✅',

  adminOrdersHeader: '📦 <b>سفارش‌ها</b>\n\n',
  adminNoOrders: 'سفارشی وجود ندارد.',
  orderDetail: (o, statusLabel) =>
    `📦 <b>سفارش #${faNum(o.id)}</b>\n` +
    `وضعیت: ${statusLabel}\n\n` +
    `👤 ${esc(o.customer.name)}\n📱 ${esc(o.customer.phone)}\n🏠 ${esc(o.customer.address)}\n\n` +
    o.lines
      .map((l) => `• ${esc(l.title)} — ${faNum(l.qty)} × ${money(l.price)}`)
      .join('\n') +
    `\n\n💰 جمع کل: <b>${money(o.total)}</b>`,
  newOrderForAdmin: (o) =>
    `🔔 <b>سفارش جدید #${faNum(o.id)}</b>\n\n` +
    `👤 ${esc(o.customer.name)}\n📱 ${esc(o.customer.phone)}\n🏠 ${esc(o.customer.address)}\n\n` +
    o.lines
      .map((l) => `• ${esc(l.title)} — ${faNum(l.qty)} × ${money(l.price)}`)
      .join('\n') +
    `\n\n💰 جمع کل: <b>${money(o.total)}</b>`,

  stats: (s) =>
    `📊 <b>آمار فروشگاه</b>\n\n` +
    `🛍 محصولات: ${faNum(s.products)} (فعال: ${faNum(s.activeProducts)})\n` +
    `📦 سفارش‌ها: ${faNum(s.orders)} (در انتظار: ${faNum(s.pendingOrders)})\n` +
    `👥 کاربران: ${faNum(s.users)}\n` +
    `💰 مجموع فروش: ${money(s.revenue)}`,

  askBroadcast: '📣 متن پیام همگانی را بنویسید. برای همه کاربران ارسال می‌شود:',
  broadcastDone: (ok, fail) =>
    `پیام همگانی ارسال شد ✅\nموفق: ${faNum(ok)} | ناموفق: ${faNum(fail)}`,
};
