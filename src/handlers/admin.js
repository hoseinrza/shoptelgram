/**
 * Admin flows: product CRUD, order management, stats, broadcast.
 * Every entry point re-checks ctx.isAdmin, so non-admins can never reach them
 * even if a crafted callback arrives.
 */

import { t, ORDER_STATUS } from '../messages.js';
import * as kb from '../keyboards.js';
import { LIMITS, parseAmount, cleanText } from '../validate.js';

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
  const askAgain = (prompt) => ctx.send(chatId, prompt, kb.cancelMenu());

  switch (state.step) {
    case 'title': {
      const title = cleanText(text, LIMITS.title);
      if (!title) return askAgain(t.askProdTitle);
      data.title = title;
      return advance(ctx, state, 'desc', t.askProdDesc);
    }

    case 'desc': {
      if (!dash) {
        const description = cleanText(text, LIMITS.description);
        if (!description) return askAgain(t.textTooLong + '\n' + t.askProdDesc);
        data.description = description;
      } else {
        data.description = '';
      }
      return advance(ctx, state, 'price', t.askProdPrice);
    }

    case 'price': {
      const price = parseAmount(text, LIMITS.price);
      if (price === null) return askAgain(t.invalidNumber);
      data.price = price;
      return advance(ctx, state, 'stock', t.askProdStock);
    }

    case 'stock': {
      const stock = parseAmount(text, LIMITS.stock);
      if (stock === null) return askAgain(t.invalidNumber);
      data.stock = stock;
      return advance(ctx, state, 'category', t.askProdCategory);
    }

    case 'category': {
      if (!dash) {
        const category = cleanText(text, LIMITS.category);
        if (!category) return askAgain(t.textTooLong + '\n' + t.askProdCategory);
        data.category = category;
      } else {
        data.category = '';
      }
      return advance(ctx, state, 'photo', t.askProdPhoto);
    }

    case 'photo': {
      if (message.photo && message.photo.length) {
        // Largest available size is the last entry.
        data.photo = message.photo[message.photo.length - 1].file_id;
      } else if (!dash && text && /^https?:\/\//.test(text) && text.length <= 400) {
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

export async function showManageProducts(ctx, msg, page = 1) {
  if (!ctx.isAdmin) return;
  const { items, page: p, pages } = await ctx.store.listProductsPage({ page });
  if (items.length === 0) {
    return ctx.replace(msg, { text: t.noProducts, keyboard: kb.adminMenu() });
  }
  const header = pages > 1 ? t.manageHeader + '\n' + t.pageInfo(p, pages) : t.manageHeader;
  return ctx.replace(msg, { text: header, keyboard: kb.adminProductsMenu(items, p, pages) });
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
  const max = state.step === 'price' ? LIMITS.price : LIMITS.stock;
  const value = parseAmount(text, max);
  if (value === null) return ctx.send(ctx.userId, t.invalidNumber, kb.cancelMenu());
  const patch = state.step === 'price' ? { price: value } : { stock: value };
  const p = await ctx.store.updateProduct(state.data.productId, patch);
  await ctx.store.clearState(ctx.userId);
  if (!p) {
    return ctx.send(ctx.userId, t.productMissing, kb.adminMenu());
  }
  return ctx.send(ctx.userId, t.updated + '\n\n' + t.productAdminView(p), kb.adminProductMenu(p));
}

// ---- order management ----------------------------------------------------
export async function showAdminOrders(ctx, msg, page = 1) {
  if (!ctx.isAdmin) return;
  const { items, page: p, pages, total } = await ctx.store.listOrdersPage({ page });
  if (items.length === 0) {
    return ctx.replace(msg, { text: t.adminNoOrders, keyboard: kb.adminMenu() });
  }
  const header = pages > 1 ? t.adminOrdersHeader + t.pageInfo(p, pages) : t.adminOrdersHeader;
  void total;
  return ctx.replace(msg, { text: header, keyboard: kb.adminOrdersMenu(items, p, pages) });
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
  const res = await ctx.store.setOrderStatus(orderId, status);
  if (!res.ok) {
    // Missing order, unknown status or an illegal transition — never applied.
    return ctx.tg.answerCallbackQuery(query.id, { text: t.invalidTransition, show_alert: true });
  }
  await ctx.tg.answerCallbackQuery(query.id, { text: t.updated });
  // Let the customer know their order status changed.
  ctx.waitUntil(
    ctx.tg
      .sendMessage(
        res.order.userId,
        `وضعیت سفارش #${res.order.id} به‌روزرسانی شد:\n${ORDER_STATUS[res.order.status]}`,
      )
      .catch(() => {}),
  );
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

/**
 * The admin's broadcast text is sent verbatim (no HTML parsing) in chunks of
 * LIMITS.broadcastChunk recipients — this keeps each webhook invocation well
 * inside Workers' subrequest limits and Telegram's rate limits. Progress is
 * persisted in D1, so the rest is sent by tapping «ادامه ارسال» (or by the
 * same callback id) until the broadcast is done. Chunk claiming is guarded by
 * a compare-and-set on next_offset, so double-taps never double-send.
 */
export async function handleBroadcastInput(ctx, _state, text) {
  if (!ctx.isAdmin) return;
  const body = cleanText(text, LIMITS.broadcast);
  if (!body) {
    return ctx.send(ctx.userId, t.textTooLong + '\n' + t.askBroadcast, kb.cancelMenu());
  }
  await ctx.store.clearState(ctx.userId);
  const total = await ctx.store.countUsers();
  if (total === 0) {
    return ctx.send(ctx.userId, t.broadcastDone(0, 0), kb.adminMenu());
  }
  const b = await ctx.store.createBroadcast(ctx.userId, body, total);
  return runBroadcastChunk(ctx, b);
}

/** Continue/callback entry: adm:bcgo:<id> */
export async function continueBroadcast(ctx, query, msg, broadcastId) {
  if (!ctx.isAdmin) return;
  await ctx.tg.answerCallbackQuery(query.id, { text: t.btnBroadcastContinue });
  const b = await ctx.store.getBroadcast(broadcastId);
  if (!b || b.status === 'done') {
    return showAdminPanel(ctx, msg);
  }
  return runBroadcastChunk(ctx, b);
}

async function runBroadcastChunk(ctx, b) {
  // Atomically claim the next chunk: only one caller can advance the offset.
  const start = b.nextOffset;
  const next = Math.min(start + LIMITS.broadcastChunk, b.total);
  const claimed = await ctx.store.claimBroadcastChunk(b.id, start, next);
  if (!claimed) return; // another tap already claimed this chunk — do nothing

  const ids = await ctx.store.usersPage(start, LIMITS.broadcastChunk);
  let okCount = 0;
  let failCount = 0;
  for (const id of ids) {
    try {
      await ctx.tg.sendPlainMessage(id, b.text);
      okCount++;
    } catch {
      // 403 = blocked bot, timeouts, transient Telegram errors — count and move on.
      failCount++;
    }
  }

  const done = next >= b.total;
  const nb = await ctx.store.updateBroadcast(b.id, {
    sentDelta: okCount,
    failedDelta: failCount,
    status: done ? 'done' : 'running',
  });

  if (done) {
    return ctx.send(ctx.userId, t.broadcastDone(nb.sent, nb.failed), kb.adminMenu());
  }
  return ctx.send(ctx.userId, t.broadcastProgress(nb), kb.broadcastContinueMenu(nb.id));
}

/** Send a message to every configured admin (used for new-order alerts). */
export async function notifyAdmins(ctx, text) {
  for (const id of ctx.adminIds) {
    try {
      await ctx.tg.sendMessage(Number(id), text);
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
