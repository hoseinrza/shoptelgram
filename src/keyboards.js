/**
 * Inline-keyboard builders.
 *
 * Callback data must stay <= 64 bytes. We use short, ":"-separated tokens:
 *   menu                 main menu
 *   prods                product list / categories
 *   cat:<name>           products in a category
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
 *   adm:prods            manage products
 *   adm:p:<id>           manage one product
 *   adm:tg:<id>          toggle active
 *   adm:del:<id>         delete product
 *   adm:stk:<id>         edit stock
 *   adm:prc:<id>         edit price
 *   adm:orders           list orders
 *   adm:o:<id>           order detail
 *   adm:os:<id>:<status> set order status
 *   adm:stats            stats
 *   adm:bc               broadcast
 *   x                    cancel current flow
 */

import { t, money, faNum, ORDER_STATUS } from './messages.js';

const ik = (rows) => ({ inline_keyboard: rows });
const btn = (text, data) => ({ text, callback_data: data });

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
  const rows = categories.map((c) => [btn('🗂 ' + c, 'cat:' + c)]);
  rows.unshift([btn(t.allProducts, 'cat:')]);
  rows.push([btn(t.back, 'menu')]);
  return ik(rows);
}

export function productListMenu(products, backTo = 'prods') {
  const rows = products.map((p) => [
    btn(`${p.title} — ${money(p.price)}`, 'p:' + p.id),
  ]);
  rows.push([btn(t.back, backTo)]);
  return ik(rows);
}

export function productMenu(product) {
  const rows = [];
  if (product.stock > 0) rows.push([btn('➕ افزودن به سبد', 'add:' + product.id)]);
  rows.push([btn(t.btnCart, 'cart'), btn(t.btnProducts, 'prods')]);
  rows.push([btn(t.back, 'menu')]);
  return ik(rows);
}

export function cartMenu(lines) {
  const rows = lines.map((l) => [
    btn('➖', 'qdn:' + l.product.id),
    btn(`${l.product.title} (${faNum(l.qty)})`, 'p:' + l.product.id),
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

export function adminProductsMenu(products) {
  const rows = products.map((p) => [
    btn(`${p.active ? '🟢' : '🔴'} ${p.title} — ${money(p.price)}`, 'adm:p:' + p.id),
  ]);
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

export function adminOrdersMenu(orders) {
  const rows = orders.slice(0, 20).map((o) => [
    btn(`#${faNum(o.id)} — ${money(o.total)} — ${ORDER_STATUS[o.status]}`, 'adm:o:' + o.id),
  ]);
  rows.push([btn(t.back, 'adm')]);
  return ik(rows);
}

export function adminOrderMenu(order) {
  const transitions = {
    pending: [['confirmed', '✅ تأیید'], ['cancelled', '❌ لغو']],
    confirmed: [['shipped', '🚚 ارسال شد'], ['cancelled', '❌ لغو']],
    shipped: [['done', '🎉 تحویل شد']],
    done: [],
    cancelled: [],
  };
  const rows = (transitions[order.status] || []).map(([status, label]) => [
    btn(label, `adm:os:${order.id}:${status}`),
  ]);
  rows.push([btn(t.back, 'adm:orders')]);
  return ik(rows);
}
