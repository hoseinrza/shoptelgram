/**
 * Web admin panel — a single-file, dependency-free Persian/RTL SPA.
 * Served at GET /admin with a strict CSP (inline style/script only,
 * connect-src 'self', img-src https:). All data flows through /admin/api/*,
 * which verifies the session cookie server-side on every request.
 */

import { ORDER_STATUS } from '../messages.js';
import { LIMITS } from '../validate.js';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function panelHtml(env) {
  const shopName = env.SHOP_NAME || 'فروشگاه';
  const boot = JSON.stringify({
    shopName,
    statuses: ORDER_STATUS,
    broadcastChunk: LIMITS.broadcastChunk,
    broadcastMax: LIMITS.broadcast,
  }).replace(/</g, '\\u003c'); // can't break out of the <script> block

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>پنل مدیریت — ${esc(shopName)}</title>
<style>
  :root{
    --bg:#0f172a; --card:#1e293b; --card2:#273449; --line:#334155;
    --text:#e2e8f0; --muted:#94a3b8; --accent:#22c55e; --warn:#f59e0b;
    --danger:#ef4444; --info:#38bdf8; --radius:12px;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--text);
    font-family:system-ui,'Segoe UI',Tahoma,'Vazirmatn',sans-serif;line-height:1.8}
  a{color:var(--info)}
  .container{max-width:960px;margin:0 auto;padding:1.2rem}
  header{display:flex;align-items:center;gap:.8rem;padding:1rem 0;border-bottom:1px solid var(--line)}
  header h1{font-size:1.15rem;margin:0;flex:1}
  .badge{background:var(--card2);border:1px solid var(--line);color:var(--muted);
    border-radius:999px;padding:.15rem .7rem;font-size:.78rem}
  nav{display:flex;gap:.5rem;padding:1rem 0;flex-wrap:wrap}
  nav button{background:var(--card);border:1px solid var(--line);color:var(--text);
    border-radius:var(--radius);padding:.5rem 1.1rem;cursor:pointer;font-size:.95rem}
  nav button.active{background:var(--accent);border-color:var(--accent);color:#052e16;font-weight:700}
  .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
    padding:1.1rem;margin-bottom:1rem}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.8rem}
  .stat{background:var(--card2);border:1px solid var(--line);border-radius:var(--radius);
    padding:.9rem;text-align:center}
  .stat .num{font-size:1.5rem;font-weight:800;color:var(--accent)}
  .stat .lbl{color:var(--muted);font-size:.8rem}
  table{width:100%;border-collapse:collapse;font-size:.9rem}
  th,td{padding:.55rem .5rem;border-bottom:1px solid var(--line);text-align:right;vertical-align:middle}
  th{color:var(--muted);font-weight:600;font-size:.8rem}
  tr:hover td{background:rgba(148,163,184,.05)}
  input,textarea,select{background:var(--bg);border:1px solid var(--line);color:var(--text);
    border-radius:8px;padding:.45rem .6rem;font:inherit;width:100%}
  input:focus,textarea:focus{outline:2px solid var(--accent);border-color:transparent}
  textarea{min-height:130px;resize:vertical}
  label{display:block;color:var(--muted);font-size:.8rem;margin:.6rem 0 .2rem}
  button{font:inherit;cursor:pointer;border-radius:8px;border:1px solid var(--line);
    background:var(--card2);color:var(--text);padding:.4rem .9rem}
  button.primary{background:var(--accent);border-color:var(--accent);color:#052e16;font-weight:700}
  button.danger{background:transparent;border-color:var(--danger);color:var(--danger)}
  button.warn{background:transparent;border-color:var(--warn);color:var(--warn)}
  button:disabled{opacity:.5;cursor:not-allowed}
  .row{display:flex;gap:.6rem;align-items:center;flex-wrap:wrap}
  .row .grow{flex:1;min-width:140px}
  .pill{border-radius:999px;padding:.1rem .6rem;font-size:.78rem;border:1px solid var(--line);color:var(--muted)}
  .pill.on{background:rgba(34,197,94,.15);color:var(--accent);border-color:var(--accent)}
  .pill.off{background:rgba(239,68,68,.12);color:var(--danger);border-color:var(--danger)}
  .pill.st{background:var(--card2)}
  .muted{color:var(--muted);font-size:.85rem}
  .err{color:var(--danger);font-size:.85rem}
  .bar{height:10px;background:var(--bg);border-radius:999px;overflow:hidden;border:1px solid var(--line)}
  .bar>div{height:100%;background:var(--accent);transition:width .3s}
  .toast{position:fixed;bottom:1rem;right:50%;transform:translateX(50%);background:var(--card2);
    border:1px solid var(--line);border-radius:10px;padding:.6rem 1.2rem;z-index:50;display:none;max-width:90vw}
  .toast.show{display:block}
  .login{max-width:360px;margin:14vh auto 0}
  .login h1{text-align:center;font-size:1.3rem}
  .chips{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.8rem}
  .chips button{padding:.25rem .8rem;border-radius:999px;font-size:.85rem}
  .chips button.active{background:var(--info);border-color:var(--info);color:#082f49;font-weight:700}
  .detail{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:.8rem;margin-top:.5rem;font-size:.88rem}
  .pager{display:flex;gap:.5rem;justify-content:center;align-items:center;margin:.8rem 0}
  img.thumb{width:52px;height:52px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
  .ph{width:52px;height:52px;border-radius:8px;border:1px dashed var(--line);display:flex;
    align-items:center;justify-content:center;font-size:1.2rem}
</style>
</head>
<body>
<div id="app" class="container"></div>
<div id="toast" class="toast"></div>
<script>
'use strict';
const BOOT = ${boot};
const FA = '۰۱۲۳۴۵۶۷۸۹';
const fa = (n) => String(n).replace(/\\d/g, (d) => FA[d]);
const money = (n) => fa(String(Math.round(n)).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ','));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const app = document.getElementById('app');
let toastTimer;
function toast(msg, isErr) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.borderColor = isErr ? 'var(--danger)' : 'var(--accent)';
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
async function api(path, opts = {}) {
  const init = { method: opts.method || 'GET', headers: {} };
  if (opts.body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, init);
  let data = null;
  try { data = await res.json(); } catch {}
  if (res.status === 401) { renderLogin(); throw new Error('unauthorized'); }
  if (!res.ok || !data || data.ok === false) {
    const msg = data && data.issues ? Object.values(data.issues).join(' | ') : (data && data.error) || ('خطا ' + res.status);
    throw new Error(msg);
  }
  return data;
}
const STATUS = BOOT.statuses;

// ---------- login ----------
function renderLogin(err) {
  app.innerHTML =
    '<div class="login card"><h1>🔐 پنل مدیریت</h1>' +
    '<p class="muted" style="text-align:center">' + esc(BOOT.shopName) + '</p>' +
    '<label>رمز پنل مدیریت</label>' +
    '<input id="pw" type="password" autocomplete="current-password">' +
    (err ? '<p class="err">' + esc(err) + '</p>' : '') +
    '<div class="row" style="margin-top:1rem"><button class="primary grow" id="go">ورود</button></div></div>';
  const submit = async () => {
    try {
      await api('/admin/login', { method: 'POST', body: { password: document.getElementById('pw').value } });
      route('dash');
    } catch (e) { if (e.message !== 'unauthorized') renderLogin(e.message); }
  };
  document.getElementById('go').onclick = submit;
  document.getElementById('pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  document.getElementById('pw').focus();
}

// ---------- shell ----------
const TABS = [
  ['dash', '📊 داشبورد'],
  ['products', '🛍 محصولات'],
  ['orders', '📦 سفارش‌ها'],
  ['broadcast', '📣 پیام همگانی'],
];
function shell(tab, contentHtml) {
  app.innerHTML =
    '<header><h1>🛍 ' + esc(BOOT.shopName) + '</h1>' +
    '<span class="badge">پنل مدیریت</span>' +
    '<button id="out">خروج</button></header>' +
    '<nav>' + TABS.map(([id, lbl]) => '<button data-t="' + id + '" class="' + (id === tab ? 'active' : '') + '">' + lbl + '</button>').join('') + '</nav>' +
    '<div id="view">' + contentHtml + '</div>';
  document.querySelectorAll('nav button').forEach((b) => (b.onclick = () => route(b.dataset.t)));
  document.getElementById('out').onclick = async () => {
    await fetch('/admin/logout', { method: 'POST' });
    renderLogin();
  };
}

async function route(tab) {
  try {
    if (tab === 'dash') return await viewDash();
    if (tab === 'products') return await viewProducts(1);
    if (tab === 'orders') return await viewOrders(1, '');
    if (tab === 'broadcast') return await viewBroadcast();
  } catch (e) {
    if (e.message !== 'unauthorized') toast(e.message, true);
  }
}

// ---------- dashboard ----------
async function viewDash() {
  const { stats: s } = await api('/admin/api/stats');
  shell('dash',
    '<div class="grid">' +
    stat(s.products, 'محصولات') + stat(s.activeProducts, 'فعال و موجود') +
    stat(s.orders, 'سفارش‌ها') + stat(s.pendingOrders, 'در انتظار تأیید') +
    stat(s.users, 'کاربران') +
    '<div class="stat"><div class="num">' + money(s.revenue) + '</div><div class="lbl">مجموع فروش (تومان)</div></div>' +
    '</div>' +
    '<div class="card muted">💡 سفارش‌های «در انتظار تأیید» را در تب سفارش‌ها بررسی و تأیید کنید. هماهنگی پرداخت فعلاً دستی است.</div>');
  function stat(n, l) { return '<div class="stat"><div class="num">' + fa(n) + '</div><div class="lbl">' + esc(l) + '</div></div>'; }
}

// ---------- products ----------
let productFormOpen = false;
async function viewProducts(page) {
  const data = await api('/admin/api/products?page=' + page);
  const rows = data.items.map((p) => productRow(p)).join('');
  shell('products',
    '<div class="card"><div class="row">' +
    '<button class="primary" id="add">' + (productFormOpen ? 'بستن فرم' : '➕ افزودن محصول') + '</button>' +
    '<span class="muted">مجموع: ' + fa(data.total) + '</span></div>' +
    '<div id="form">' + (productFormOpen ? productForm() : '') + '</div></div>' +
    '<div class="card" style="overflow-x:auto"><table>' +
    '<tr><th></th><th>محصول</th><th>قیمت (تومان)</th><th>موجودی</th><th>دسته</th><th>وضعیت</th><th></th></tr>' +
    (rows || '<tr><td colspan="7" class="muted">محصولی نیست. اولین محصول را اضافه کنید.</td></tr>') +
    '</table>' + pager(data.page, data.pages, (p) => viewProducts(p)) + '</div>');
  document.getElementById('add').onclick = () => { productFormOpen = !productFormOpen; viewProducts(page); };
  if (productFormOpen) bindProductForm(page);
  bindRows(page);
  bindPager(page, data.pages, (p) => viewProducts(p));
}
function productRow(p) {
  const photo = p.photo && /^https?:/.test(p.photo)
    ? '<img class="thumb" src="' + esc(p.photo) + '" alt="">'
    : '<div class="ph">🖼</div>';
  return '<tr data-id="' + p.id + '">' +
    '<td>' + photo + '</td>' +
    '<td>' + esc(p.title) + '</td>' +
    '<td><input style="width:110px" data-f="price" value="' + p.price + '"></td>' +
    '<td><input style="width:70px" data-f="stock" value="' + p.stock + '"></td>' +
    '<td>' + esc(p.category || '—') + '</td>' +
    '<td><span class="pill ' + (p.active ? 'on">فعال' : 'off">غیرفعال') + '</span></td>' +
    '<td><div class="row">' +
    '<button class="primary" data-act="save">💾</button>' +
    '<button data-act="toggle">' + (p.active ? '🔴' : '🟢') + '</button>' +
    '<button class="danger" data-act="del">🗑</button></div></td></tr>';
}
function productForm() {
  return '<div style="margin-top:.8rem">' +
    '<div class="row"><div class="grow"><label>نام محصول *</label><input id="f-title"></div>' +
    '<div class="grow"><label>دسته‌بندی</label><input id="f-cat"></div></div>' +
    '<div class="row"><div class="grow"><label>قیمت (تومان) *</label><input id="f-price" inputmode="numeric"></div>' +
    '<div class="grow"><label>موجودی *</label><input id="f-stock" inputmode="numeric"></div></div>' +
    '<label>توضیحات</label><textarea id="f-desc" style="min-height:60px"></textarea>' +
    '<label>آدرس عکس (اختیاری، https)</label><input id="f-photo" dir="ltr">' +
    '<div class="row" style="margin-top:.8rem"><button class="primary" id="f-save">ذخیره محصول</button>' +
    '<span id="f-err" class="err"></span></div></div>';
}
function bindProductForm(page) {
  document.getElementById('f-save').onclick = async () => {
    try {
      await api('/admin/api/products', { method: 'POST', body: {
        title: v('f-title'), price: v('f-price'), stock: v('f-stock'),
        category: v('f-cat'), description: v('f-desc'), photo: v('f-photo'),
      }});
      toast('محصول ذخیره شد ✅');
      productFormOpen = false;
      viewProducts(page);
    } catch (e) { document.getElementById('f-err').textContent = e.message; }
  };
  function v(id) { return document.getElementById(id).value.trim(); }
}
function bindRows(page) {
  document.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    const field = (f) => tr.querySelector('[data-f="' + f + '"]').value.trim();
    tr.querySelector('[data-act="save"]').onclick = async () => {
      try {
        await api('/admin/api/products/' + id, { method: 'PATCH', body: { price: field('price'), stock: field('stock') }});
        toast('به‌روزرسانی شد ✅');
      } catch (e) { toast(e.message, true); }
    };
    tr.querySelector('[data-act="toggle"]').onclick = async () => {
      try {
        const { product } = await api('/admin/api/products/' + id, {
          method: 'PATCH', body: { active: tr.querySelector('.pill').classList.contains('off') },
        });
        toast(product.active ? 'فعال شد 🟢' : 'غیرفعال شد 🔴');
        viewProducts(page);
      } catch (e) { toast(e.message, true); }
    };
    tr.querySelector('[data-act="del"]').onclick = async () => {
      if (!confirm('محصول حذف شود؟ از سبد خرید همهٔ کاربران هم پاک می‌شود.')) return;
      try {
        await api('/admin/api/products/' + id, { method: 'DELETE' });
        toast('محصول حذف شد.');
        viewProducts(page);
      } catch (e) { toast(e.message, true); }
    };
  });
}

// ---------- orders ----------
async function viewOrders(page, status) {
  const qs = '/admin/api/orders?page=' + page + (status ? '&status=' + status : '');
  const data = await api(qs);
  const chips = [''].concat(Object.keys(STATUS));
  const chipHtml = chips.map((s) =>
    '<button data-s="' + s + '" class="' + (s === status ? 'active' : '') + '">' + (s ? STATUS[s] : 'همه') + '</button>').join('');
  const rows = data.items.map((o) => orderRow(o)).join('');
  shell('orders',
    '<div class="chips">' + chipHtml + '</div>' +
    '<div class="card" style="overflow-x:auto"><table>' +
    '<tr><th>شماره</th><th>مشتری</th><th>مبلغ</th><th>وضعیت</th><th>تاریخ</th><th></th></tr>' +
    (rows || '<tr><td colspan="6" class="muted">سفارشی نیست.</td></tr>') +
    '</table>' + pager(data.page, data.pages, (p) => viewOrders(p, status)) + '</div>');
  document.querySelectorAll('.chips button').forEach((b) => (b.onclick = () => viewOrders(1, b.dataset.s)));
  bindOrderRows(status);
  bindPager(page, data.pages, (p) => viewOrders(p, status));
}
function fmtDate(ts) {
  try { return fa(new Date(ts).toLocaleDateString('fa-IR')) + ' ' + fa(new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' })); }
  catch { return ''; }
}
function orderRow(o) {
  return '<tr data-id="' + o.id + '" data-status="' + o.status + '">' +
    '<td>#' + fa(o.id) + '</td>' +
    '<td>' + esc(o.customer.name) + '</td>' +
    '<td>' + money(o.total) + '</td>' +
    '<td><span class="pill st">' + (STATUS[o.status] || o.status) + '</span></td>' +
    '<td class="muted">' + fmtDate(o.createdAt) + '</td>' +
    '<td><button data-act="expand">جزئیات</button></td></tr>' +
    '<tr class="detail-row" style="display:none"><td colspan="6"><div class="detail" id="d-' + o.id + '">…</div></td></tr>';
}
async function bindOrderRows(status) {
  document.querySelectorAll('tr[data-id]').forEach((tr) => {
    const id = tr.dataset.id;
    tr.querySelector('[data-act="expand"]').onclick = async () => {
      const detailTr = tr.nextElementSibling;
      if (detailTr.style.display !== 'none') { detailTr.style.display = 'none'; return; }
      detailTr.style.display = '';
      const div = document.getElementById('d-' + id);
      div.textContent = '…';
      try {
        const { order: o } = await api('/admin/api/order/' + id);
        const allowed = (await api('/admin/api/transitions/' + o.status)).transitions;
        div.innerHTML =
          '<b>مشتری:</b> ' + esc(o.customer.name) + ' — ' + esc(o.customer.phone) + '<br>' +
          '<b>آدرس:</b> ' + esc(o.customer.address) + '<br><br>' +
          o.lines.map((l) => '• ' + esc(l.title) + ' — ' + fa(l.qty) + ' × ' + money(l.price)).join('<br>') +
          '<br><br><b>جمع:</b> ' + money(o.total) + ' تومان' +
          (allowed.length ? '<div class="row" style="margin-top:.7rem">' +
            allowed.map((s) => '<button data-to="' + s + '">' + (STATUS[s] || s) + '</button>').join('') : '') +
          '</div>';
        div.querySelectorAll('[data-to]').forEach((b) => {
          b.onclick = async () => {
            try {
              await api('/admin/api/order/' + id + '/status', { method: 'PATCH', body: { status: b.dataset.to } });
              toast('وضعیت به‌روزرسانی شد ✅');
              viewOrders(1, status);
            } catch (e) { toast(e.message, true); }
          };
        });
      } catch (e) { div.textContent = e.message; }
    };
  });
}

// ---------- broadcast ----------
async function viewBroadcast() {
  shell('broadcast',
    '<div class="card">' +
    '<label>متن پیام (برای همهٔ کاربران، به‌صورت متن ساده)</label>' +
    '<textarea id="bc-text" maxlength="' + BOOT.broadcastMax + '"></textarea>' +
    '<div class="row" style="margin-top:.8rem">' +
    '<button class="primary" id="bc-send">📣 ارسال</button>' +
    '<span class="muted" id="bc-count"></span><span id="bc-err" class="err"></span></div>' +
    '<div id="bc-progress"></div></div>' +
    '<div class="card muted">ℹ️ هر بار ' + fa(BOOT.broadcastChunk) + ' گیرنده پردازش می‌شود (محدودیت پلن رایگان Workers). اگر همه ارسال نشده باشد، دکمهٔ «ادامه» ظاهر می‌شود. پیام به‌صورت متن ساده ارسال می‌شود (بدون HTML).</div>');
  const ta = document.getElementById('bc-text');
  const counter = document.getElementById('bc-count');
  const upd = () => (counter.textContent = fa(ta.value.length) + ' / ' + fa(BOOT.broadcastMax) + ' نویسه');
  ta.addEventListener('input', upd); upd();
  document.getElementById('bc-send').onclick = async () => {
    try {
      document.getElementById('bc-send').disabled = true;
      const res = await api('/admin/api/broadcast', { method: 'POST', body: { text: ta.value } });
      renderProgress(res);
    } catch (e) { document.getElementById('bc-err').textContent = e.message; }
    finally { document.getElementById('bc-send').disabled = false; }
  };
  function renderProgress(res) {
    const el = document.getElementById('bc-progress');
    if (!res.broadcast) { el.innerHTML = '<p class="muted">کاربری برای ارسال وجود ندارد.</p>'; return; }
    const b = res.broadcast;
    const pct = b.total ? Math.round(((b.sent + b.failed) / b.total) * 100) : 100;
    el.innerHTML =
      '<div class="bar"><div style="width:' + pct + '%"></div></div>' +
      '<p class="muted">ارسال‌شده: ' + fa(b.sent + b.failed) + ' از ' + fa(b.total) +
      ' — موفق: ' + fa(b.sent) + ' | ناموفق: ' + fa(b.failed) + '</p>' +
      (res.done ? '<p style="color:var(--accent)">✅ تمام شد.</p>'
        : '<button class="warn" id="bc-cont">📣 ادامه ارسال</button>');
    const cont = document.getElementById('bc-cont');
    if (cont) cont.onclick = async () => {
      try {
        cont.disabled = true;
        renderProgress(await api('/admin/api/broadcast-continue', { method: 'POST', body: { id: b.id } }));
      } catch (e) { toast(e.message, true); }
    };
  }
}

// ---------- shared widgets ----------
function pager(page, pages, go) {
  if (pages <= 1) return '';
  return '<div class="pager">' +
    (page > 1 ? '<button data-p="' + (page - 1) + '">◀️ قبلی</button>' : '') +
    '<span class="muted">صفحه ' + fa(page) + ' از ' + fa(pages) + '</span>' +
    (page < pages ? '<button data-p="' + (page + 1) + '">بعدی ▶️</button>' : '') +
    '</div>';
}
function bindPager(page, pages, go) {
  if (pages <= 1) return;
  document.querySelectorAll('.pager button').forEach((b) => (b.onclick = () => go(Number(b.dataset.p))));
}

// ---------- boot ----------
(async function boot() {
  try {
    await api('/admin/api/session');
    route('dash');
  } catch { /* 401 already rendered the login screen */ }
})();
</script>
</body>
</html>`;
}
