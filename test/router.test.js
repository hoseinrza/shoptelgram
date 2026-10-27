import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Store } from '../src/store.js';
import {
  makeEnv,
  restoreFetch,
  drive,
  userMsg,
  callback,
  seedProduct,
  sent,
  last,
  ADMIN_ID,
  USER_ID,
} from './helpers/harness.js';

let env, db, calls, setBehavior;

beforeEach(async () => {
  ({ env, db, calls, setBehavior } = await makeEnv());
});
afterEach(restoreFetch);

const store = () => new Store(db);
const texts = () => sent(calls, 'sendMessage');
const alerts = () => sent(calls, 'answerCallbackQuery');

/** Drive a callback that opens a new message (replace flow: delete + send). */
async function tap(data, id = USER_ID) {
  await drive(callback(data, id), env);
}

async function text(t, id = USER_ID) {
  await drive(userMsg(t, id), env);
}

describe('basic message routing', () => {
  it('/start registers the user and shows the Persian main menu', async () => {
    await text('/start');
    const u = await store().getUser(USER_ID);
    expect(u).not.toBeNull();
    expect(u.firstName).toBe('علی');
    const m = last(calls, 'sendMessage');
    expect(m.params.text).toContain('خوش آمدید');
  });

  it('ignores bot messages and unknown update shapes safely', async () => {
    await drive({ message: { from: { id: 1, is_bot: true }, chat: { id: 1 }, text: '/start' } }, env);
    await drive({}, env);
    await drive(null, env);
    await drive({ channel_post: { text: 'x' } }, env);
    expect(texts()).toHaveLength(0);
  });

  it('nudges unknown text back to the menu', async () => {
    await text('سلام ربات جان');
    expect(last(calls, 'sendMessage').params.text).toContain('متوجه نشدم');
  });

  it('/help explains usage', async () => {
    await text('/help');
    expect(last(calls, 'sendMessage').params.text).toContain('/start');
  });
});

describe('admin authorization', () => {
  it('a non-admin tapping the admin panel gets an alert and nothing else', async () => {
    await tap('adm');
    const a = last(calls, 'answerCallbackQuery');
    expect(a.params.text).toContain('مدیر');
    expect(a.params.show_alert).toBe(true);
    expect(texts()).toHaveLength(0);
  });

  it('admin callbacks from a non-admin never touch admin flows', async () => {
    await tap('adm:del:1'); // try to delete product 1 as a normal user
    expect(alerts().length).toBeGreaterThan(0);
    expect(await store().getProduct(1)).toBeNull();
  });

  it('the configured admin can open the panel', async () => {
    await tap('adm', ADMIN_ID);
    expect(last(calls, 'sendMessage').params.text).toContain('پنل مدیریت');
  });
});

describe('callback data hardening', () => {
  it('ignores non-numeric product ids instead of throwing', async () => {
    await tap('p:abc');
    await tap('add:1;DROP');
    await tap('adm:p:../x');
    expect(alerts().length).toBeGreaterThan(0);
  });

  it('ignores oversized callback payloads', async () => {
    await tap(`p:${'9'.repeat(70)}`);
    expect(texts()).toHaveLength(0);
  });

  it('answers unknown callback heads quietly', async () => {
    await tap('zzz:1');
    expect(alerts().length).toBe(1);
  });
});

describe('browsing and cart', () => {
  it('product view hides the add button for inactive products', async () => {
    const p = await seedProduct(db);
    await store().updateProduct(p.id, { active: false });
    await tap(`p:${p.id}`);
    const kb = JSON.stringify(last(calls, 'sendMessage').params.reply_markup);
    expect(kb).not.toContain(`add:${p.id}`);
    expect(last(calls, 'sendMessage').params.text).toContain('غیرفعال');
  });

  it('cannot add an out-of-stock or inactive product', async () => {
    const p = await seedProduct(db, { stock: 0 });
    await tap(`add:${p.id}`);
    expect(last(calls, 'answerCallbackQuery').params.text).toContain('ناموجود');

    await store().updateProduct(p.id, { stock: 5, active: false });
    await tap(`add:${p.id}`);
    expect(last(calls, 'answerCallbackQuery').params.text).toContain('ناموجود');
    expect(await store().getCart(USER_ID)).toEqual({ items: {} });
  });

  it('respects stock when increasing quantity', async () => {
    const p = await seedProduct(db, { stock: 2 });
    await tap(`add:${p.id}`);
    await tap(`add:${p.id}`);
    await tap(`qup:${p.id}`); // 3 > stock 2
    const a = last(calls, 'answerCallbackQuery');
    expect(a.params.text).toContain('ناموجود');
    expect((await store().getCart(USER_ID)).items[String(p.id)]).toBe(2);
  });

  it('caps quantity per line and distinct lines per cart', async () => {
    const p = await seedProduct(db, { stock: 1000 });
    for (let i = 0; i < 99; i++) await tap(`add:${p.id}`);
    expect((await store().getCart(USER_ID)).items[String(p.id)]).toBe(99);
    await tap(`add:${p.id}`);
    expect((await store().getCart(USER_ID)).items[String(p.id)]).toBe(99);

    for (let i = 0; i < 25; i++) await seedProduct(db, { title: `p${i}` });
    const products = await store().listProducts();
    let limitAlertSeen = false;
    for (const pr of products) {
      await tap(`add:${pr.id}`);
      const a = last(calls, 'answerCallbackQuery');
      if (a?.params?.text?.includes('حداکثر ۲۵')) limitAlertSeen = true;
    }
    expect(limitAlertSeen).toBe(true);
    expect(Object.keys((await store().getCart(USER_ID)).items).length).toBe(25);
  });

  it('shows unavailable lines with a warning in the cart', async () => {
    const p = await seedProduct(db);
    await tap(`add:${p.id}`);
    await store().updateProduct(p.id, { active: false });
    await tap('cart');
    const textMsg = last(calls, 'sendMessage');
    expect(textMsg.params.text).toContain('قابل خرید نیست');
  });
});

describe('checkout journey', () => {
  async function fillAndCheckout() {
    const p = await seedProduct(db, { price: 100, stock: 5 });
    await tap(`add:${p.id}`);
    await tap(`add:${p.id}`);
    await tap('co');
    await text('علی رضایی');
    await text('۰۹۱۲۱۲۳۴۵۶۷'); // Persian digits must normalize
    await text('تهران، خیابان آزادی، پلاک ۱');
    return p;
  }

  it('walks name -> phone -> address -> review -> confirm and records the order', async () => {
    const p = await fillAndCheckout();

    const review = last(calls, 'sendMessage');
    expect(review.params.text).toContain('بررسی');
    expect(review.params.text).toContain('۲۰۰'); // 2 × 100 in Persian digits

    await tap('coyes');
    // The customer's own success message (the admin alert arrives after it).
    const done = texts().find((c) => c.params.chat_id === USER_ID && c.params.text.includes('ثبت شد'));
    expect(done).toBeTruthy();

    const orders = await store().listOrders({ userId: USER_ID });
    expect(orders).toHaveLength(1);
    expect(orders[0].total).toBe(200);
    expect(orders[0].customer.phone).toBe('09121234567');
    expect(orders[0].lines[0].qty).toBe(2);
    expect((await store().getProduct(p.id)).stock).toBe(3);
    expect(await store().getCart(USER_ID)).toEqual({ items: {} });
    expect(await store().getState(USER_ID)).toBeNull();

    // contact remembered for next time
    const u = await store().getUser(USER_ID);
    expect(u.contactName).toBe('علی رضایی');

    // exactly one admin notification
    const adminNotifs = texts().filter((c) => c.params.chat_id === ADMIN_ID);
    expect(adminNotifs).toHaveLength(1);
    expect(adminNotifs[0].params.text).toContain('سفارش جدید');
  });

  it('rejects an invalid phone and stays on the phone step', async () => {
    await seedProduct(db);
    await tap(`add:${(await store().listProducts())[0].id}`);
    await tap('co');
    await text('علی');
    await text('12345');
    expect(last(calls, 'sendMessage').params.text).toContain('معتبر نیست');
    await text('۰۹۱۲۱۲۳۴۵۶۷');
    expect(last(calls, 'sendMessage').params.text).toContain('آدرس');
  });

  it('refuses to confirm when stock changed after review, leaving no order', async () => {
    const p = await seedProduct(db, { price: 100, stock: 5 });
    await tap(`add:${p.id}`);
    await tap(`add:${p.id}`);
    await tap('co');
    await text('علی');
    await text('09121234567');
    await text('تهران');
    await store().updateProduct(p.id, { stock: 1 }); // sold out elsewhere
    await tap('coyes');
    expect(last(calls, 'sendMessage').params.text).toContain('قابل خرید نیست');
    expect(await store().listOrders()).toHaveLength(0);
    expect((await store().getCart(USER_ID)).items[String(p.id)]).toBe(2); // cart preserved for fixing
  });

  it('double confirmation creates exactly one order', async () => {
    const p = await seedProduct(db, { stock: 5 });
    await tap(`add:${p.id}`);
    await tap('co');
    await text('علی');
    await text('09121234567');
    await text('تهران');
    await tap('coyes');
    await tap('coyes'); // second tap: state already cleared -> just shows the menu
    const orders = await store().listOrders();
    expect(orders).toHaveLength(1);
    expect((await store().getProduct(p.id)).stock).toBe(4);
    expect(texts().filter((c) => c.params.chat_id === ADMIN_ID)).toHaveLength(1);
  });

  it('cancelling with x resets the flow', async () => {
    await seedProduct(db);
    await tap(`add:${(await store().listProducts())[0].id}`);
    await tap('co');
    await tap('x');
    expect(await store().getState(USER_ID)).toBeNull();
    expect(last(calls, 'sendMessage').params.text).toContain('خوش آمدید');
  });
});

describe('order status transitions (admin)', () => {
  async function makeOrder() {
    const p = await seedProduct(db);
    await tap(`add:${p.id}`);
    await tap('co');
    await text('علی');
    await text('09121234567');
    await text('تهران');
    await tap('coyes');
    return (await store().listOrders())[0];
  }

  it('applies a valid transition and notifies the customer', async () => {
    const o = await makeOrder();
    await tap(`adm:os:${o.id}:confirmed`, ADMIN_ID);
    expect((await store().getOrder(o.id)).status).toBe('confirmed');
    const notify = texts().find((c) => c.params.chat_id === USER_ID && c.params.text.includes('وضعیت سفارش'));
    expect(notify).toBeTruthy();
  });

  it('rejects invalid transitions with an alert and keeps the status', async () => {
    const o = await makeOrder();
    await tap(`adm:os:${o.id}:done`, ADMIN_ID); // pending -> done is illegal
    expect(last(calls, 'answerCallbackQuery').params.text).toContain('مجاز نیست');
    expect((await store().getOrder(o.id)).status).toBe('pending');
  });

  it('rejects unknown status values', async () => {
    const o = await makeOrder();
    await tap(`adm:os:${o.id}:hacked`, ADMIN_ID);
    expect((await store().getOrder(o.id)).status).toBe('pending');
  });
});

describe('admin product management', () => {
  it('walks the add-product wizard with validation', async () => {
    await tap('adm:add', ADMIN_ID);
    await text('گوشی نوکيا', ADMIN_ID);
    await text('-', ADMIN_ID); // no description
    await text('۱٬۵۰۰٬۰۰۰', ADMIN_ID); // Persian digits + Arabic thousands separator
    await text('7', ADMIN_ID);
    await text('موبایل', ADMIN_ID);
    await text('-', ADMIN_ID); // no photo
    const created = await store().listProducts();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: 'گوشی نوکيا',
      description: '',
      price: 1500000,
      stock: 7,
      category: 'موبایل',
      photo: null,
    });
  });

  it('rejects non-numeric price input', async () => {
    await tap('adm:add', ADMIN_ID);
    await text('چیزی', ADMIN_ID);
    await text('-', ADMIN_ID);
    await text('گران', ADMIN_ID);
    expect(last(calls, 'sendMessage').params.text).toContain('فقط عدد');
    expect(await store().listProducts()).toHaveLength(0);
  });

  it('edits stock using Persian digits', async () => {
    const p = await seedProduct(db);
    await tap(`adm:stk:${p.id}`, ADMIN_ID);
    await text('۴۲', ADMIN_ID);
    expect((await store().getProduct(p.id)).stock).toBe(42);
  });

  it('deleting a product removes it from carts too', async () => {
    const p = await seedProduct(db);
    await tap(`add:${p.id}`);
    await tap(`adm:del:${p.id}`, ADMIN_ID);
    expect(await store().getProduct(p.id)).toBeNull();
    expect(await store().getCart(USER_ID)).toEqual({ items: {} });
  });

  it('accepts a photo file_id in the wizard', async () => {
    await tap('adm:add', ADMIN_ID);
    await text('عکس‌دار', ADMIN_ID);
    await text('-', ADMIN_ID);
    await text('100', ADMIN_ID);
    await text('1', ADMIN_ID);
    await text('-', ADMIN_ID);
    await drive({
      message: {
        message_id: 2,
        from: { id: ADMIN_ID, first_name: 'ادمین', is_bot: false },
        chat: { id: ADMIN_ID },
        date: 1700000000,
        photo: [{ file_id: 'small', width: 90 }, { file_id: 'big-file-id', width: 1280 }],
      },
    }, env);
    const p = (await store().listProducts())[0];
    expect(p.photo).toBe('big-file-id'); // largest size wins
  });
});

describe('broadcast', () => {
  async function seedUsers(n) {
    const s = store();
    for (let i = 0; i < n; i++) await s.upsertUser({ id: 1000 + i, first_name: 'u' + i });
  }

  it('sends a plain-text message to all users and reports the result', async () => {
    await seedUsers(3);
    await tap('adm:bc', ADMIN_ID);
    await text('سلام به همه 🎉', ADMIN_ID);
    const broadcasts = texts().filter((c) => c.params.chat_id >= 1000);
    expect(broadcasts).toHaveLength(3);
    const b = broadcasts[0].params;
    expect(b.parse_mode).toBeUndefined(); // plain text — no HTML injection
    expect(last(calls, 'sendMessage').params.text).toContain('پیام همگانی');
    expect(await db.prepare('SELECT status FROM broadcasts').first()).toMatchObject({ status: 'done' });
  });

  it('counts blocked users as failed and continues with the rest', async () => {
    await seedUsers(3);
    const blocked = new Response(JSON.stringify({ ok: false, error_code: 403, description: 'bot was blocked by the user' }), { status: 200 });
    setBehavior((method, params) => (method === 'sendMessage' && params.chat_id === 1001 ? blocked : null));

    await tap('adm:bc', ADMIN_ID);
    await text('اعلام', ADMIN_ID);
    // 2 regular users + the admin themself (also a user) = 3 ok, 1 blocked.
    const done = last(calls, 'sendMessage');
    expect(done.params.text).toContain('موفق: ۳');
    expect(done.params.text).toContain('ناموفق: ۱');
    expect(await db.prepare('SELECT sent, failed, status FROM broadcasts').first()).toMatchObject({
      sent: 3,
      failed: 1,
      status: 'done',
    });
  });

  it('sends in chunks of 30 and resumes via the continue button', async () => {
    await seedUsers(65); // + the admin row = 66 users total
    await tap('adm:bc', ADMIN_ID);
    await text('اعلامیه', ADMIN_ID);

    // first chunk: 30 recipients, one of which is the admin themself
    expect(sent(calls, 'sendMessage').filter((c) => c.params.chat_id >= 1000)).toHaveLength(29);
    const progress = last(calls, 'sendMessage');
    expect(progress.params.text).toContain('در حال ارسال');
    const kb = JSON.stringify(progress.params.reply_markup);
    expect(kb).toContain('adm:bcgo:');

    await tap('adm:bcgo:1', ADMIN_ID); // chunk 2
    await tap('adm:bcgo:1', ADMIN_ID); // chunk 3 (6 left) -> done
    const all = sent(calls, 'sendMessage').filter((c) => c.params.chat_id >= 1000);
    expect(all).toHaveLength(65);
    const done = last(calls, 'sendMessage');
    expect(done.params.text).toContain('موفق: ۶۶');
    expect(await db.prepare('SELECT status, sent FROM broadcasts').first()).toMatchObject({
      status: 'done',
      sent: 66,
    });
  });

  it('a non-admin cannot trigger or continue broadcasts', async () => {
    await seedUsers(2);
    await tap('adm:bc');
    await tap('adm:bcgo:1');
    expect(texts().filter((c) => c.params.chat_id >= 1000)).toHaveLength(0);
  });
});

