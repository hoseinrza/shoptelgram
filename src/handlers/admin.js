/**
 * Admin flows: product CRUD, order management, stats, broadcast.
 * Every entry point re-checks ctx.isAdmin so non-admins can never reach them.
 */

import { t, money, ORDER_STATUS } from '../messages.js';
import * as kb from '../keyboards.js';

export async function showAdminPanel(ctx, msg) {
  if (!ctx.isAdmin) return ctx.tg.answerCallbackQuery(ctx.queryId, { text: t.notAdmin, show_alert: true });
  return ctx.replace(msg, { text: t.adminPanel, keyboard: kb.adminMenu() });
}

// ---- product management --------------------------------------------------
export async function startAddProduct(ctx, query, msg) {
  if (!ctx.isAdmin) return;
  await ctx.store.setState(ctx.userId, { flow: 'addproduct', step: 'title', data: {} });
  await ctx.tg.answerCallbackQuery(query.id);
  return ctx.replace(msg, { text: t.askProdTitle, keyboard: kb.cancelMenu() });
}

/** Handle a text/photo reply during the add-product flow. */
export async function handleAddProductInput(ctx, state, message) {
  if (!ctx.isAdmin) return;
  const chatId = ctx.userId;
  const data = state.data;
  const text = message.text ? message.text.trim() : '';
  const dash = text === '-';

  switch (state.step) {
    case 'title':
      if (!text) return ctx.send(chatId, t.askProdTitle, kb.cancelMenu());
      data.title = text;
      return advance(ctx, state, 'desc', t.askProdDesc);

    case 'desc':
      data.description = dash ? '' : text;
      return advance(ctx, state, 'price', t.askProdPrice);

    case 'price': {
      const price = parseAmount(text);
      if (price === null) return ctx.send(chatId, t.invalidNumber, kb.cancelMenu());
      data.price = price;
      return advance(ctx, state, 'stock', t.askProdStock);
    }

    case 'stock': {
      const stock = parseAmount(text);
      if (stock === null) return ctx.send(chatId, t.invalidNumber, kb.cancelMenu());
      data.stock = stock;
      return advance(ctx, state, 'category', t.askProdCategory);
    }

    case 'category':
      data.category = dash ? '' : text;
      return advance(ctx, state, 'photo', t.askProdPhoto);

    case 'photo': {
      if (message.photo && message.photo.length) {
        // Largest available size is the last entry.
        data.photo = message.photo[message.photo.length - 1].file_id;
      } else if (!dash && text && /^https?:\/\//.test(text)) {
        data.photo = text;
      } else {
        data.photo = null;
      }
      const product = await ctx.store.createProduct(data);
      await ctx.store.clearState(ctx.userId);
      return ctx.send(chatId, t.productCreated(product), kb.adminMenu());
    }
  }
}

export async function showManageProducts(ctx, msg) {
  if (!ctx.isAdmin) return;
  const products = await ctx.store.listProducts();
  if (products.length === 0) {
    return ctx.replace(msg, { text: t.noProducts, keyboard: kb.adminMenu() });
  }
  return ctx.replace(msg, { text: t.manageHeader, keyboard: kb.adminProductsMenu(products) });
}

export async function showAdminProduct(ctx, msg, productId) {
  if (!ctx.isAdmin) return;
  const p = await ctx.store.getProduct(productId);
  if (!p) return showManageProducts(ctx, msg);
  return ctx.replace(msg, { text: t.productAdminView(p), keyboard: kb.adminProductMenu(p) });
}

export async function toggleProduct(ctx, query, msg, productId) {
  if (!ctx.isAdmin) return;
  const p = await ctx.store.getProduct(productId);
  if (p) await ctx.store.updateProduct(productId, { active: !p.active });
  await ctx.tg.answerCallbackQuery(query.id, { text: t.updated });
  return showAdminProduct(ctx, msg, productId);
}

export async function deleteProduct(ctx, query, msg, productId) {
  if (!ctx.isAdmin) return;
  await ctx.store.deleteProduct(productId);
  await ctx.tg.answerCallbackQuery(query.id, { text: t.productDeleted });
  return showManageProducts(ctx, msg);
}

export async function startEditField(ctx, query, msg, productId, field) {
  if (!ctx.isAdmin) return;
  await ctx.store.setState(ctx.userId, {
    flow: 'editproduct',
    step: field, // 'stock' | 'price'
    data: { productId },
  });
  await ctx.tg.answerCallbackQuery(query.id);
  const prompt = field === 'price' ? t.askNewPrice : t.askNewStock;
  return ctx.replace(msg, { text: prompt, keyboard: kb.cancelMenu() });
}

export async function handleEditProductInput(ctx, state, text) {
  if (!ctx.isAdmin) return;
  const value = parseAmount(text);
  if (value === null) return ctx.send(ctx.userId, t.invalidNumber, kb.cancelMenu());
  const patch = state.step === 'price' ? { price: value } : { stock: value };
  await ctx.store.updateProduct(state.data.productId, patch);
  await ctx.store.clearState(ctx.userId);
  const p = await ctx.store.getProduct(state.data.productId);
  return ctx.send(ctx.userId, t.updated + '\n\n' + t.productAdminView(p), kb.adminProductMenu(p));
}

// ---- order management ----------------------------------------------------
export async function showAdminOrders(ctx, msg) {
  if (!ctx.isAdmin) return;
  const orders = await ctx.store.listOrders();
  if (orders.length === 0) {
    return ctx.replace(msg, { text: t.adminNoOrders, keyboard: kb.adminMenu() });
  }
  return ctx.replace(msg, { text: t.adminOrdersHeader, keyboard: kb.adminOrdersMenu(orders) });
}

export async function showAdminOrder(ctx, msg, orderId) {
  if (!ctx.isAdmin) return;
  const o = await ctx.store.getOrder(orderId);
  if (!o) return showAdminOrders(ctx, msg);
  return ctx.replace(msg, {
    text: t.orderDetail(o, ORDER_STATUS[o.status] || o.status),
    keyboard: kb.adminOrderMenu(o),
  });
}

export async function setOrderStatus(ctx, query, msg, orderId, status) {
  if (!ctx.isAdmin) return;
  const o = await ctx.store.updateOrderStatus(orderId, status);
  await ctx.tg.answerCallbackQuery(query.id, { text: t.updated });
  // Let the customer know their order status changed.
  if (o) {
    ctx.waitUntil(
      ctx.tg
        .sendMessage(o.userId, `وضعیت سفارش #${o.id} به‌روزرسانی شد:\n${ORDER_STATUS[status]}`)
        .catch(() => {}),
    );
  }
  return showAdminOrder(ctx, msg, orderId);
}

// ---- stats & broadcast ---------------------------------------------------
export async function showStats(ctx, msg) {
  if (!ctx.isAdmin) return;
  const s = await ctx.store.stats();
  return ctx.replace(msg, { text: t.stats(s), keyboard: kb.adminMenu() });
}

export async function startBroadcast(ctx, query, msg) {
  if (!ctx.isAdmin) return;
  await ctx.store.setState(ctx.userId, { flow: 'broadcast', step: 'text', data: {} });
  await ctx.tg.answerCallbackQuery(query.id);
  return ctx.replace(msg, { text: t.askBroadcast, keyboard: kb.cancelMenu() });
}

export async function handleBroadcastInput(ctx, _state, text) {
  if (!ctx.isAdmin) return;
  await ctx.store.clearState(ctx.userId);
  const users = await ctx.store.listUsers();
  let ok = 0;
  let fail = 0;
  for (const u of users) {
    try {
      await ctx.tg.sendMessage(u.id, text);
      ok++;
    } catch {
      fail++;
    }
  }
  return ctx.send(ctx.userId, t.broadcastDone(ok, fail), kb.adminMenu());
}

/** Send a message to every configured admin (used for new-order alerts). */
export async function notifyAdmins(ctx, text) {
  for (const id of ctx.adminIds) {
    try {
      await ctx.tg.sendMessage(id, text);
    } catch {
      // admin may not have started the bot yet — ignore
    }
  }
}

// ---- helpers -------------------------------------------------------------
function advance(ctx, state, step, prompt) {
  return ctx.store
    .setState(ctx.userId, { ...state, step })
    .then(() => ctx.send(ctx.userId, prompt, kb.cancelMenu()));
}

function parseAmount(input) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const s = String(input)
    .replace(/[۰-۹]/g, (d) => fa.indexOf(d))
    .replace(/[,\s]/g, '');
  if (!/^\d+$/.test(s)) return null;
  return parseInt(s, 10);
}
