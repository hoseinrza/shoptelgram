/**
 * Inline-keyboard builders.
 *
 * Callback data must stay <= 64 bytes. We use short, ":"-separated tokens:
 *   menu                 main menu
 *   prods                product list / categories
 *   cat:<name>           products in a category
 *   cat:<name>:<page>    products in a category, page N (page 1 == cat:<name>)
 *   p:<id>               view a product
 *   add:<id>             add product to cart
 *   cart                 view cart
 *   qup:<id> / qdn:<id>  increase / decrease quantity in cart
 *   clr                  clear cart
 *   co                   start checkout
 *   coyes                confirm order
 *   orders               my orders
 *   contact              support
 *   adm                  admin panel
 *   adm:add              add product
 *   adm:prods[:<page>]   manage products (page 1 == adm:prods)
 *   adm:p:<id>           manage one product
 *   adm:tg:<id>          toggle active
 *   adm:del:<id>         delete product
 *   adm:stk:<id>         edit stock
 *   adm:prc:<id>         edit price
 *   adm:orders[:<page>]  list orders (page 1 == adm:orders)
 *   adm:o:<id>           order detail
 *   adm:os:<id>:<status> set order status
 *   adm:stats            stats
 *   adm:bc               broadcast
 *   adm:bcgo:<id>        continue a chunked broadcast
 *   x                    cancel current flow
 */

import { t, money, faNum, ORDER_STATUS, ORDER_TRANSITIONS } from './messages.js';

const ik = (rows) => ({ inline_keyboard: rows });
const btn = (text, data) => ({ text, callback_data: data });

/** Keep button labels short so keyboards never hit Telegram's limits. */
function truncate(s, max = 40) {
  const str = String(s ?? '');
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

export function mainMenu(isAdmin) {
  const rows = [
    [btn(t.btnProducts, 'prods')],
    [btn(t.btnCart, 'cart'), btn(t.btnOrders, 'orders')],
    [btn(t.btnContact, 'contact')],
  ];
  if (isAdmin) rows.push([btn(t.btnAdmin, 'adm')]);
  return ik(rows);
}

export function categoriesMenu(categories) {
  const rows = categories.map((c) => [btn('🗂 ' + truncate(c, 32), 'cat:' + c)]);
  rows.unshift([btn(t.allProducts, 'cat:')]);
  rows.push([btn(t.back, 'menu')]);
  return ik(rows);
}

export function productListMenu(products, backTo = 'prods') {
  const rows = products.map((p) => [productButton(p)]);
  rows.push([btn(t.back, backTo)]);
  return ik(rows);
}

/** A single "view product" button (used by list builders and pagination). */
export function productButton(product) {
  return btn(`${truncate(product.title)} — ${money(product.price)}`, 'p:' + product.id);
}

export function productMenu(product) {
  const rows = [];
  if (product.active && product.stock > 0) {
    rows.push([btn('➕ افزودن به سبد', 'add:' + product.id)]);
  }
  rows.push([btn(t.btnCart, 'cart'), btn(t.btnProducts, 'prods')]);
  rows.push([btn(t.back, 'menu')]);
  return ik(rows);
}

export function cartMenu(lines) {
  const rows = lines.map((l) => [
    btn('➖', 'qdn:' + l.product.id),
    btn(`${l.available ? '' : '⚠️ '}${truncate(l.product.title, 30)} (${faNum(l.qty)})`, 'p:' + l.product.id),
    btn('➕', 'qup:' + l.product.id),
  ]);
  rows.push([btn(t.btnCheckout, 'co')]);
  rows.push([btn(t.btnClearCart, 'clr'), btn(t.back, 'menu')]);
  return ik(rows);
}

export function checkoutConfirmMenu() {
  return ik([[btn(t.btnConfirmOrder, 'coyes')], [btn(t.cancel, 'x')]]);
}

export function cancelMenu() {
  return ik([[btn(t.cancel, 'x')]]);
}

export function backToMenu() {
  return ik([[btn(t.back, 'menu')]]);
}

// ---- admin ---------------------------------------------------------------
export function adminMenu() {
  return ik([
    [btn(t.btnAddProduct, 'adm:add'), btn(t.btnManageProducts, 'adm:prods')],
    [btn(t.btnAdminOrders, 'adm:orders'), btn(t.btnStats, 'adm:stats')],
    [btn(t.btnBroadcast, 'adm:bc')],
    [btn(t.back, 'menu')],
  ]);
}

/** Pagination row (admin lists): prev / next, only where applicable. */
function pagerRow(prefix, page, pages) {
  const row = [];
  if (page > 1) row.push(btn(t.btnPrevPage, `${prefix}:${page - 1}`));
  if (page < pages) row.push(btn(t.btnNextPage, `${prefix}:${page + 1}`));
  return row.length ? [row] : [];
}

export function adminProductsMenu(products, page = 1, pages = 1) {
  const rows = products.map((p) => [
    btn(`${p.active ? '🟢' : '🔴'} ${truncate(p.title)} — ${money(p.price)}`, 'adm:p:' + p.id),
  ]);
  rows.push(...pagerRow('adm:prods', page, pages));
  rows.push([btn(t.back, 'adm')]);
  return ik(rows);
}

export function adminProductMenu(product) {
  return ik([
    [btn(t.btnEditPrice, 'adm:prc:' + product.id), btn(t.btnEditStock, 'adm:stk:' + product.id)],
    [btn(t.btnToggleActive(product), 'adm:tg:' + product.id)],
    [btn(t.btnDeleteProduct, 'adm:del:' + product.id)],
    [btn(t.back, 'adm:prods')],
  ]);
}

export function adminOrdersMenu(orders, page = 1, pages = 1) {
  const rows = orders.map((o) => [
    btn(`#${faNum(o.id)} — ${money(o.total)} — ${ORDER_STATUS[o.status]}`, 'adm:o:' + o.id),
  ]);
  rows.push(...pagerRow('adm:orders', page, pages));
  rows.push([btn(t.back, 'adm')]);
  return ik(rows);
}

export function adminOrderMenu(order) {
  // Buttons are derived from the same transition map the store enforces.
  const rows = (ORDER_TRANSITIONS[order.status] || []).map((status) => [
    btn(statusLabel(status), `adm:os:${order.id}:${status}`),
  ]);
  rows.push([btn(t.back, 'adm:orders')]);
  return ik(rows);
}

function statusLabel(status) {
  switch (status) {
    case 'confirmed': return '✅ تأیید';
    case 'cancelled': return '❌ لغو';
    case 'shipped': return '🚚 ارسال شد';
    case 'done': return '🎉 تحویل شد';
    default: return status;
  }
}

export function broadcastContinueMenu(broadcastId) {
  return ik([[btn(t.btnBroadcastContinue, 'adm:bcgo:' + broadcastId)], [btn(t.back, 'adm')]]);
}
