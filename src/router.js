/**
 * Update dispatcher: builds a per-update context and routes Telegram
 * messages / callback queries to the right handler.
 *
 * Everything arriving here is untrusted input: callback ids must be numeric,
 * callback payloads must be short, and every flow re-checks authorization.
 */

import { Telegram } from './telegram.js';
import { Store } from './store.js';
import { t } from './messages.js';
import * as kb from './keyboards.js';
import { asId, LIMITS } from './validate.js';
import * as user from './handlers/user.js';
import * as admin from './handlers/admin.js';

function parseAdminIds(env) {
  return String(env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build the context object handed to every handler. It bundles the Telegram
 * client, the data store, env, the current user, and a couple of rendering
 * helpers (`send`, `sendPhoto`, `replace`, `waitUntil`).
 */
function buildContext(env, ctxExec, from) {
  const tg = new Telegram(env.BOT_TOKEN);
  const store = new Store(env.DB);
  const adminIds = parseAdminIds(env);
  const userId = from.id;

  const send = (chatId, text, keyboard) =>
    tg.sendMessage(chatId, text, keyboard ? { reply_markup: keyboard } : {});

  const sendPhoto = (chatId, photo, caption, keyboard) =>
    tg.sendPhoto(chatId, photo, caption, keyboard ? { reply_markup: keyboard } : {});

  /**
   * Replace the message a callback came from with fresh content. Telegram
   * cannot edit a photo message into text (or vice-versa), so we delete the
   * old message and send a new one. Always reliable, at the cost of a tiny
   * flicker.
   */
  const replace = async (msg, { text, keyboard, photo }) => {
    if (msg) await tg.deleteMessage(msg.chat.id, msg.message_id).catch(() => {});
    const chatId = msg ? msg.chat.id : userId;
    if (photo) return sendPhoto(chatId, photo, text, keyboard);
    return send(chatId, text, keyboard);
  };

  return {
    tg,
    store,
    env,
    adminIds,
    userId,
    userName: from.first_name || 'دوست',
    isAdmin: adminIds.includes(String(userId)),
    queryId: null,
    waitUntil: (p) => ctxExec.waitUntil(Promise.resolve(p).catch(() => {})),
    send,
    sendPhoto,
    replace,
  };
}

export async function handleUpdate(update, env, ctxExec) {
  if (!update || typeof update !== 'object') return;
  try {
    if (update.message) return await handleMessage(update.message, env, ctxExec);
    if (update.callback_query) return await handleCallback(update.callback_query, env, ctxExec);
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'update_failed', update_id: update.update_id, error: err?.message }),
    );
  }
}

// ---- messages ------------------------------------------------------------
async function handleMessage(message, env, ctxExec) {
  if (!message.from || message.from.is_bot) return;
  const ctx = buildContext(env, ctxExec, message.from);
  await ctx.store.upsertUser(message.from);

  const text = typeof message.text === 'string' ? message.text : '';

  // /start (and /menu) reset everything and show the main menu.
  if (text === '/start' || text === '/menu') {
    await ctx.store.clearState(ctx.userId);
    return user.showMenu(ctx, ctx.userId);
  }

  if (text === '/help') {
    return ctx.send(
      ctx.userId,
      'برای شروع خرید /start را بزنید. از منوی دکمه‌ای برای مرور محصولات و ثبت سفارش استفاده کنید.',
      kb.mainMenu(ctx.isAdmin),
    );
  }

  // An active multi-step flow takes priority over free-form text.
  const state = await ctx.store.getState(ctx.userId);
  if (state) {
    if (state.flow === 'checkout') {
      if (!text) return ctx.send(ctx.userId, t.askTextOnly, kb.cancelMenu());
      const consumed = await user.handleCheckoutText(ctx, state, text);
      if (consumed !== false) return;
    }
    if (state.flow === 'addproduct') return admin.handleAddProductInput(ctx, state, message);
    if (state.flow === 'editproduct' && text) return admin.handleEditProductInput(ctx, state, text);
    if (state.flow === 'broadcast' && text) return admin.handleBroadcastInput(ctx, state, text);
  }

  // Fallback: nudge the user back to the menu.
  return ctx.send(ctx.userId, t.unknown, kb.mainMenu(ctx.isAdmin));
}

// ---- callback queries ----------------------------------------------------
async function answerQuietly(ctx, queryId, extra) {
  try {
    await ctx.tg.answerCallbackQuery(queryId, extra);
  } catch {
    // query may be older than 48h / already answered — nothing to do
  }
}

async function handleCallback(query, env, ctxExec) {
  if (!query.from) return;
  const ctx = buildContext(env, ctxExec, query.from);
  ctx.queryId = query.id;
  await ctx.store.upsertUser(query.from);

  const msg = query.message;
  const data = typeof query.data === 'string' ? query.data : '';
  if (data.length > LIMITS.callbackData) {
    return answerQuietly(ctx, query.id);
  }

  const [head, ...rest] = data.split(':');
  const arg = rest.join(':');

  try {
    switch (head) {
      // ---- navigation / customer ----
      case 'menu':
        await answerQuietly(ctx, query.id);
        await ctx.store.clearState(ctx.userId);
        return user.showMenu(ctx, ctx.userId, msg);
      case 'prods':
        await answerQuietly(ctx, query.id);
        return user.showCategories(ctx, msg);
      case 'cat':
        await answerQuietly(ctx, query.id);
        return user.showCategory(ctx, msg, arg);
      case 'p':
        await answerQuietly(ctx, query.id);
        return asId(arg) !== null
          ? user.showProduct(ctx, msg, arg)
          : answerQuietly(ctx, query.id);
      case 'add':
        return asId(arg) !== null
          ? user.addToCart(ctx, query, arg)
          : answerQuietly(ctx, query.id);
      case 'cart':
        await answerQuietly(ctx, query.id);
        return user.showCart(ctx, msg);
      case 'qup':
        return asId(arg) !== null
          ? user.changeQty(ctx, query, msg, arg, +1)
          : answerQuietly(ctx, query.id);
      case 'qdn':
        return asId(arg) !== null
          ? user.changeQty(ctx, query, msg, arg, -1)
          : answerQuietly(ctx, query.id);
      case 'clr':
        await answerQuietly(ctx, query.id);
        return user.clearCart(ctx, msg);
      case 'co':
        return user.startCheckout(ctx, query, msg);
      case 'coyes':
        return user.confirmOrder(ctx, query, msg);
      case 'orders':
        await answerQuietly(ctx, query.id);
        return user.showOrders(ctx, msg);
      case 'contact':
        await answerQuietly(ctx, query.id);
        return user.showContact(ctx, msg);
      case 'x':
        await answerQuietly(ctx, query.id, { text: t.cancelled });
        await ctx.store.clearState(ctx.userId);
        return user.showMenu(ctx, ctx.userId, msg);

      // ---- admin ----
      case 'adm':
        return handleAdminCallback(ctx, query, msg, arg);

      default:
        return answerQuietly(ctx, query.id);
    }
  } catch (err) {
    console.error(
      JSON.stringify({ event: 'callback_failed', head, error: err?.message }),
    );
    return answerQuietly(ctx, query.id, { text: 'خطایی رخ داد، دوباره تلاش کنید.', show_alert: true });
  }
}

async function handleAdminCallback(ctx, query, msg, arg) {
  if (!ctx.isAdmin) {
    return ctx.tg.answerCallbackQuery(query.id, { text: t.notAdmin, show_alert: true });
  }
  // arg is the remainder after "adm:" — e.g. "", "add", "p:3", "os:3:shipped"
  const [sub, ...rest] = arg.split(':');
  const a = rest.join(':');
  const id = asId(a);
  const orderId = asId(rest[0] ?? '');
  const page = Math.max(1, asId(a) ?? 1); // for paginated lists

  switch (sub) {
    case '': // bare "adm" -> panel
      await answerQuietly(ctx, query.id);
      return admin.showAdminPanel(ctx, msg);
    case 'add':
      return admin.startAddProduct(ctx, query, msg);
    case 'prods':
      await answerQuietly(ctx, query.id);
      return admin.showManageProducts(ctx, msg, page);
    case 'p':
      await answerQuietly(ctx, query.id);
      return id !== null ? admin.showAdminProduct(ctx, msg, id) : answerQuietly(ctx, query.id);
    case 'tg':
      return id !== null ? admin.toggleProduct(ctx, query, msg, id) : answerQuietly(ctx, query.id);
    case 'del':
      return id !== null ? admin.deleteProduct(ctx, query, msg, id) : answerQuietly(ctx, query.id);
    case 'stk':
      return id !== null
        ? admin.startEditField(ctx, query, msg, id, 'stock')
        : answerQuietly(ctx, query.id);
    case 'prc':
      return id !== null
        ? admin.startEditField(ctx, query, msg, id, 'price')
        : answerQuietly(ctx, query.id);
    case 'orders':
      await answerQuietly(ctx, query.id);
      return admin.showAdminOrders(ctx, msg, page);
    case 'o':
      await answerQuietly(ctx, query.id);
      return id !== null ? admin.showAdminOrder(ctx, msg, id) : answerQuietly(ctx, query.id);
    case 'os': {
      const status = rest[1] ?? '';
      if (orderId === null || !status) return answerQuietly(ctx, query.id);
      return admin.setOrderStatus(ctx, query, msg, orderId, status);
    }
    case 'stats':
      await answerQuietly(ctx, query.id);
      return admin.showStats(ctx, msg);
    case 'bc':
      return admin.startBroadcast(ctx, query, msg);
    case 'bcgo':
      return id !== null
        ? admin.continueBroadcast(ctx, query, msg, id)
        : answerQuietly(ctx, query.id);
    default:
      return answerQuietly(ctx, query.id);
  }
}
