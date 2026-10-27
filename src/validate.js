/**
 * Input validation and normalization helpers — used at every trust boundary
 * (Telegram messages, callback data, admin routes).
 *
 * Everything coming from Telegram is untrusted: ids must be numeric strings,
 * texts must be length-capped, amounts must be plain non-negative integers.
 */

/** Hard limits for a small-shop MVP. Enforced on the server, always. */
export const LIMITS = Object.freeze({
  title: 100,
  description: 500,
  category: 32,
  name: 80,
  address: 400,
  broadcast: 3000,
  price: 1e12, // ۱٬۰۰۰٬۰۰۰ میلیون تومان — more than any real product
  stock: 100_000_000,
  qtyPerLine: 99,
  cartLines: 25,
  pageSize: 20,
  broadcastChunk: 30, // stays well inside the free-plan 50-subrequest limit
  callbackData: 64, // Telegram hard limit for callback_data bytes
});

const INT_RE = /^\d{1,15}$/;

/** Strict non-negative integer (price/stock/qty). Returns null when invalid. */
export function asNonNegativeInt(value, max = LIMITS.stock) {
  const s = String(value ?? '').trim();
  if (!INT_RE.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n > max) return null;
  return n;
}

/** Numeric entity id coming from callback data or admin input. */
export function asId(value) {
  return asNonNegativeInt(value, Number.MAX_SAFE_INTEGER);
}

/**
 * Trimmed, length-capped single-line-ish text. Returns null when the value is
 * not a string, is empty, or exceeds the cap.
 */
export function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const s = value.normalize('NFC').trim();
  if (!s || s.length > max) return null;
  return s;
}

/** Telegram webhook secret tokens allow [A-Za-z0-9_-]{1,256}. */
export function isValidWebhookSecret(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(value);
}

/** Length-independent string comparison for secrets. */
export function secureCompare(a, b) {
  const enc = new TextEncoder();
  const ab = enc.encode(String(a ?? ''));
  const bb = enc.encode(String(b ?? ''));
  const n = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < n; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

/** Persian/Arabic digits and separators -> validated mobile number or null. */
export function normalizePhone(input) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const ar = '٠١٢٣٤٥٦٧٨٩';
  let s = String(input ?? '')
    .replace(/[۰-۹]/g, (d) => fa.indexOf(d))
    .replace(/[٠-٩]/g, (d) => ar.indexOf(d))
    .replace(/[\s\-()]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('98') && s.length >= 12) s = '0' + s.slice(2);
  if (s.length === 10 && s.startsWith('9')) s = '0' + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

/** Persian-friendly number entry for price/stock (admin flows). */
export function parseAmount(input, max = LIMITS.price) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  const s = String(input ?? '')
    .replace(/[۰-۹]/g, (d) => fa.indexOf(d))
    // ASCII comma, spaces, Arabic thousands separator (٬) and Arabic comma (،)
    .replace(/[,\s٬،]/g, '');
  if (!INT_RE.test(s)) return null;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n > max) return null;
  return n;
}
