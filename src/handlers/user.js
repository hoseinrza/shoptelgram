/**
 * Customer-facing flows: browsing, cart, checkout, orders, support.
 */

import { t, esc, money } from '../messages.js';
import * as kb from '../keyboards.js';
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
    // No categories defined — jump straight to the full list.
    return ctx.replace(msg, {
      text: t.allProducts,
      keyboard: kb.productListMenu(products, 'menu'),
    });
  }
  return ctx.replace(msg, { text: t.chooseCategory, keyboard: kb.categoriesMenu(cats) });
}

export async function showCategory(ctx, msg, category) {
  let products = await ctx.store.listProducts({ activeOnly: true });
  if (category) products = products.filter((p) => p.category === category);
  if (products.length === 0) {
    return ctx.replace(msg, { text: t.noProducts, keyboard: kb.backToMenu() });
  }
  return ctx.replace(msg, {
    text: category ? `🗂 ${esc(category)}` : t.allProducts,
    keyboard: kb.productListMenu(products, 'prods'),
  });
}

export async function showProduct(ctx, msg, productId) {
  const p = await ctx.store.getProduct(productId);
  if (!p) return ctx.replace(msg, { text: t.noProducts, keyboard: kb.backToMenu() });
  const payload = {
    text: t.productCaption(p),
    keyboard: kb.productMenu(p),
    photo: p.photo || null,
  };
  return ctx.replace(msg, payload);
}

export async function addToCart(ctx, query, productId) {
  const p = await ctx.store.getProduct(productId);
  if (!p || !p.active || p.stock <= 0) {
    return ctx.tg.answerCallbackQuery(query.id, { text: t.outOfStock, show_alert: true });
  }
  const cart = await ctx.store.getCart(ctx.userId);
  const current = cart.items[productId] || 0;
  if (current + 1 > p.stock) {
    return ctx.tg.answerCallbackQuery(query.id, { text: t.outOfStock, show_alert: true });
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
  for (const line of lines) text += t.cartLine(line);
  text += t.cartTotal(total);
  return ctx.replace(msg, { text, keyboard: kb.cartMenu(lines) });
}

export async function changeQty(ctx, query, msg, productId, delta) {
  const cart = await ctx.store.getCart(ctx.userId);
  const current = cart.items[productId] || 0;
  const next = current + delta;
  if (delta > 0) {
    const p = await ctx.store.getProduct(productId);
    if (p && next > p.stock) {
      return ctx.tg.answerCallbackQuery(query.id, { text: t.outOfStock, show_alert: true });
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
  const orders = await ctx.store.listOrders({ userId: ctx.userId });
  if (orders.length === 0) {
    return ctx.replace(msg, { text: t.noOrders, keyboard: kb.backToMenu() });
  }
  let text = t.myOrdersHeader;
  for (const o of orders.slice(0, 20)) text += t.orderLine(o);
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

  if (state.step === 'name') {
    data.name = text.trim();
    await ctx.store.setState(ctx.userId, { ...state, step: 'phone', data });
    return ctx.send(chatId, t.askPhone, kb.cancelMenu());
  }

  if (state.step === 'phone') {
    const phone = normalizePhone(text);
    if (!phone) return ctx.send(chatId, t.invalidPhone, kb.cancelMenu());
    data.phone = phone;
    await ctx.store.setState(ctx.userId, { ...state, step: 'address', data });
    return ctx.send(chatId, t.askAddress, kb.cancelMenu());
  }

  if (state.step === 'address') {
    data.address = text.trim();
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

  const { lines, total } = await ctx.store.cartDetails(ctx.userId);
  if (lines.length === 0) {
    await ctx.store.clearState(ctx.userId);
    await ctx.tg.answerCallbackQuery(query.id);
    return ctx.replace(msg, { text: t.emptyCart, keyboard: kb.backToMenu() });
  }

  // Re-validate stock right before committing.
  for (const line of lines) {
    if (line.qty > line.product.stock) {
      await ctx.tg.answerCallbackQuery(query.id);
      return ctx.replace(msg, { text: t.stockChanged, keyboard: kb.backToMenu() });
    }
  }

  const order = await ctx.store.createOrder({
    userId: ctx.userId,
    customer: state.data,
    lines: lines.map((l) => ({
      productId: l.product.id,
      title: l.product.title,
      price: l.product.price,
      qty: l.qty,
    })),
    total,
  });

  // Decrement stock, clear cart + state, remember contact info.
  for (const line of lines) await ctx.store.decrementStock(line.product.id, line.qty);
  await ctx.store.clearCart(ctx.userId);
  await ctx.store.clearState(ctx.userId);
  await ctx.store.saveUserContact(ctx.userId, {
    contactName: state.data.name,
    phone: state.data.phone,
  });

  await ctx.tg.answerCallbackQuery(query.id);
  await ctx.replace(msg, { text: t.orderPlaced(order.id), keyboard: kb.backToMenu() });

  // Notify admins in the background.
  ctx.waitUntil(notifyAdmins(ctx, t.newOrderForAdmin(order)));
}

function normalizePhone(input) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  let s = String(input)
    .replace(/[۰-۹]/g, (d) => fa.indexOf(d))
    .replace(/\D/g, '');
  if (s.startsWith('98')) s = '0' + s.slice(2);
  if (s.length === 10 && s.startsWith('9')) s = '0' + s;
  return /^09\d{9}$/.test(s) ? s : null;
}
