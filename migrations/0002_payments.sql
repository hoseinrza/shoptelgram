-- Online payment gateways (JS port of az-iranian-bank-gateways).
--
--  * settings        — simple key/value store for JSON config blobs. The
--                      payment gateway config (mirroring the library's
--                      AZ_IRANIAN_BANK_GATEWAYS dict) lives under the key
--                      'payment_config' and is editable from the web panel.
--  * orders.payment_status — online-payment state, independent from the
--                      fulfillment lifecycle (status): 'unpaid' until a
--                      gateway verify succeeds (or an admin confirms
--                      manually), then 'paid'.
--  * payments        — one row per gateway attempt, mirroring the library's
--                      Bank model: our tracking code, the gateway reference
--                      (Token / RefId / authority …), amount in the GATEWAY's
--                      currency, the library's lifecycle statuses and the
--                      gateway's own status text for support/debugging.

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed'));

CREATE TABLE payments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id          INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  gateway           TEXT    NOT NULL CHECK (gateway IN
                      ('BMI', 'SEP', 'ZARINPAL', 'ZIBAL', 'BAHAMTA',
                       'MELLAT', 'IRANDARGAH', 'ASANPARDAKHT')),
  tracking_code     TEXT    NOT NULL UNIQUE,
  reference_number  TEXT,
  amount            INTEGER NOT NULL CHECK (amount >= 0),
  status            TEXT    NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING', 'REDIRECT_TO_BANK',
                                      'RETURN_FROM_BANK', 'COMPLETE',
                                      'CANCEL_BY_USER', 'EXPIRE_GATEWAY_TOKEN',
                                      'EXPIRE_VERIFY_PAYMENT', 'ERROR')),
  result_text       TEXT    NOT NULL DEFAULT '',
  extra_information TEXT,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX idx_payments_order ON payments (order_id);
