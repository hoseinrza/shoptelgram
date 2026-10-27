/**
 * Customer-facing flows: browsing, cart, checkout, orders, support.
 * All limits and validation live in validate.js; totals are always computed
 * server-side from live product rows.
 */

import { t, esc } from '../messages.js';
import * as kb from '../keyboards.js';
import { LIMITS, cleanText, normalizePhone } from '../validate.js';
import { notifyAdmins } from './admin.js';

export async function showMenu(ctx, chatId, replaceMsg = null) {
  const text = t.welcome(ctx.env, ctx.userName);
  const markup = kb.mainMenu(ctx.isAdmin);
  if (replaceMsg) return ctx.replace(replaceMsg, { text, keyboard: markup });
  return ctx.send(chatId, text, markup);
}

export async function showCategories(ctx, msg) {
  const cats = await ctx.store.categories();
  const products = await ctx.store.listProducts({ activeOnly: true });
  if (products.length === 0) {
    return ctx.replace(msg, { text: t.noProducts, keyboard: kb.backToMenu() });
  }
  if (cats.length === 0) {
    // No categories defined — jump straight to the (first page of the) list.
    return showCategory(ctx, msg, '');
  }
  return ctx.replace(msg, { text: t.chooseCategory, keyboard: kb.categoriesMenu(cats) });
}

/** `cat:` / `cat:<name>` / `cat:<name>:<page>` — name may itself contain ":". */
export async function showCategory(ctx, msg, arg) {
  let category = arg ?? '';
  let page = 1;
  const m = /^(.*):(\d{1,4})$/.exec(arg ?? '');
  if (m) {
    category = m[1];
    page = Math.max(1, Number(m[2]) || 1);
  }
  let products = await ctx.store.listProducts({ activeOnly: true });
  if (category) products = products.filter((p) => p.category === category);
  if (products.length === 0) {
    return ctx.replace(msg, { text: t.noProducts, keyboard: kb.backToMenu() });
  }
  const visible = products.slice((page - 1) * LIMITS.pageSize, page * LIMITS.pageSize);
  const pages = Math.max(1, Math.ceil(products.length / LIMITS.pageSize));
  const header = category
    ? `🗂 ${esc(category)}${pages > 1 ? '\n' + t.pageInfo(page, pages) : ''}`
    : t.allProducts + (pages > 1 ? '\n' + t.pageInfo(page, pages) : '');
  const rows = visible.map((p) => [kb.productButton(p)]);
  const nav = [];
  if (page > 1) nav.push({ text: t.btnPrevPage, callback_data: `cat:${category}:${page - 1}` });
  if (page < pages) nav.push({ text: t.btnNextPage, callback_data: `cat:${category}:${page + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([kb.backToMenu().inline_keyboard[0][0]]);
  return ctx.replace(msg, { text: header, keyboard: { inline_keyboard: rows } });
}

export async function showProduct(ctx, msg, productId) {
  const p = await ctx.store.getProduct(productId);
  if (!p) return ctx.replace(msg, { text: t.noProducts, keyboard: kb.backToMenu() });
  return ctx.replace(msg, {
    text: t.productCaption(p),
    keyboard: kb.productMenu(p),
    photo: p.photo || null,
  });
}

export async function addToCart(ctx, query, productId) {
  const p = await ctx.store.getProduct(productId);
  if (!p || !p.active || p.stock <= 0) {
    return ctx.tg.answerCallbackQuery(query.id, { text: t.outOfStock, show_alert: true });
  }
  const cart = await ctx.store.getCart(ctx.userId);
  const isNewLine = !(productId in cart.items);
  if (isNewLine && Object.keys(cart.items).length >= LIMITS.cartLines) {
    return ctx.tg.answerCallbackQuery(query.id, { text: t.cartLineLimit, show_alert: true });
  }
  const current = cart.items[productId] || 0;
  if (current + 1 > p.stock) {
    return ctx.tg.answerCallbackQuery(query.id, { text: t.outOfStock, show_alert: true });
  }
  if (current + 1 > LIMITS.qtyPerLine) {
    return ctx.tg.answerCallbackQuery(query.id, { text: t.qtyLimit, show_alert: true });
  }
  await ctx.store.addToCart(ctx.userId, productId, 1);
  return ctx.tg.answerCallbackQuery(query.id, { text: t.added });
}

export async function showCart(ctx, msg) {
  const { lines, total } = await ctx.store.cartDetails(ctx.userId);
  if (lines.length === 0) {
    return ctx.replace(msg, { text: t.emptyCart, keyboard: kb.backToMenu() });
  }
  let text = t.cartHeader;
  for (const line of lines) {
    text += t.cartLine(line);
    if (!line.available) text += t.cartUnavailableLine(line.product.title);
  }
  text += t.cartTotal(total);
  return ctx.replace(msg, { text, keyboard: kb.cartMenu(lines) });
}

export async function changeQty(ctx, query, msg, productId, delta) {
  const cart = await ctx.store.getCart(ctx.userId);
  const current = cart.items[productId] || 0;
  const next = current + delta;
  if (delta > 0) {
    const p = await ctx.store.getProduct(productId);
    if (!p || !p.active || next > p.stock) {
      return ctx.tg.answerCallbackQuery(query.id, { text: t.outOfStock, show_alert: true });
    }
    if (next > LIMITS.qtyPerLine) {
      return ctx.tg.answerCallbackQuery(query.id, { text: t.qtyLimit, show_alert: true });
    }
  }
  await ctx.store.setCartQty(ctx.userId, productId, next);
  await ctx.tg.answerCallbackQuery(query.id);
  return showCart(ctx, msg);
}

export async function clearCart(ctx, msg) {
  await ctx.store.clearCart(ctx.userId);
  return ctx.replace(msg, { text: t.cartCleared, keyboard: kb.backToMenu() });
}

export async function showOrders(ctx, msg) {
  const orders = await ctx.store.listOrders({ userId: ctx.userId, limit: 20 });
  if (orders.length === 0) {
    return ctx.replace(msg, { text: t.noOrders, keyboard: kb.backToMenu() });
  }
  let text = t.myOrdersHeader;
  for (const o of orders) text += t.orderLine(o);
  return ctx.replace(msg, { text, keyboard: kb.backToMenu() });
}

export async function showContact(ctx, msg) {
  return ctx.replace(msg, { text: t.contact(ctx.env), keyboard: kb.backToMenu() });
}

// ---- checkout flow -------------------------------------------------------
export async function startCheckout(ctx, query, msg) {
  const { lines } = await ctx.store.cartDetails(ctx.userId);
  if (lines.length === 0) {
    await ctx.tg.answerCallbackQuery(query.id);
    return ctx.replace(msg, { text: t.emptyCart, keyboard: kb.backToMenu() });
  }
  // Prefill name/phone if we already know them from a past order.
  const user = await ctx.store.getUser(ctx.userId);
  await ctx.store.setState(ctx.userId, {
    flow: 'checkout',
    step: 'name',
    data: { name: user?.contactName || '', phone: user?.phone || '' },
  });
  await ctx.tg.answerCallbackQuery(query.id);
  return ctx.replace(msg, { text: t.askName, keyboard: kb.cancelMenu() });
}

/** Handle a text reply while in the checkout flow. Returns true if consumed. */
export async function handleCheckoutText(ctx, state, text) {
  const chatId = ctx.userId;
  const data = state.data;
  const askAgain = (prompt) => ctx.send(chatId, prompt, kb.cancelMenu());

  if (state.step === 'name') {
    const name = cleanText(text, LIMITS.name);
    if (!name) return askAgain(t.askName);
    data.name = name;
    await ctx.store.setState(ctx.userId, { ...state, step: 'phone', data });
    return ctx.send(chatId, t.askPhone, kb.cancelMenu());
  }

  if (state.step === 'phone') {
    const phone = normalizePhone(text);
    if (!phone) return askAgain(t.invalidPhone);
    data.phone = phone;
    await ctx.store.setState(ctx.userId, { ...state, step: 'address', data });
    return ctx.send(chatId, t.askAddress, kb.cancelMenu());
  }

  if (state.step === 'address') {
    const address = cleanText(text, LIMITS.address);
    if (!address) return askAgain(t.textTooLong + '\n' + t.askAddress);
    data.address = address;
    // The idempotency key for this review screen: no matter how many times
    // the confirm button fires, it maps to at most one order (UNIQUE in DB).
    data.checkoutId = crypto.randomUUID();
    await ctx.store.setState(ctx.userId, { ...state, step: 'review', data });
    const { total } = await ctx.store.cartDetails(ctx.userId);
    return ctx.send(chatId, t.orderReview(data, total), kb.checkoutConfirmMenu());
  }

  return false;
}

export async function confirmOrder(ctx, query, msg) {
  const state = await ctx.store.getState(ctx.userId);
  if (!state || state.flow !== 'checkout' || state.step !== 'review') {
    await ctx.tg.answerCallbackQuery(query.id);
    return showMenu(ctx, ctx.userId, msg);
  }

  await ctx.tg.answerCallbackQuery(query.id);

  // Older in-flight states (pre-upgrade) have no key — mint one now so the
  // confirmations from this screen are still deduplicated.
  if (!state.data.checkoutId) {
    state.data.checkoutId = crypto.randomUUID();
    await ctx.store.setState(ctx.userId, state);
  }

  let res;
  try {
    res = await ctx.store.checkout(ctx.userId, state.data, state.data.checkoutId);
  } catch (err) {
    console.error(JSON.stringify({ event: 'checkout_failed', user_id: ctx.userId, error: err?.message }));
    return ctx.send(ctx.userId, t.orderFailed, kb.backToMenu());
  }

  if (!res.ok) {
    await ctx.store.clearState(ctx.userId);
    if (res.reason === 'empty') {
      return ctx.replace(msg, { text: t.emptyCart, keyboard: kb.backToMenu() });
    }
    await ctx.replace(msg, { text: t.cartInvalid, keyboard: kb.backToMenu() });
    return showCart(ctx, null).catch(() => {});
  }

  const { order, duplicate } = res;
  await ctx.store.clearState(ctx.userId);
  await ctx.store.saveUserContact(ctx.userId, {
    contactName: state.data.name,
    phone: state.data.phone,
  });

  await ctx.replace(msg, { text: t.orderPlaced(order.id), keyboard: kb.backToMenu() });

  // Notify admins exactly once per real order (never for duplicate taps).
  if (!duplicate) {
    ctx.waitUntil(notifyAdmins(ctx, t.newOrderForAdmin(order)));
  }
}
