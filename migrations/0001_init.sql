-- shoptelgram initial schema (Cloudflare D1 / SQLite).
--
-- Design notes:
--  * Prices, totals and quantities are INTEGERs in the shop's smallest
--    practical unit (e.g. Toman) — never floats.
--  * CHECK constraints are the last line of defense: stock, price and totals
--    can never become negative even if application logic regresses.
--  * orders.idempotency_key is UNIQUE — this is what makes a double-tapped
--    "confirm" button create exactly one order.
--  * order_items snapshots title/price at purchase time, so historical orders
--    never change when products are edited or deleted (product_id is kept for
--    reference only — deliberately NO foreign key).
--  * cart_items has ON DELETE CASCADE: deleting a product removes it from all
--    carts, so deleted products can never be checked out.

CREATE TABLE products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  description TEXT    NOT NULL DEFAULT '',
  price       INTEGER NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  photo       TEXT,
  category    TEXT    NOT NULL DEFAULT '',
  active      INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at  INTEGER NOT NULL
);

CREATE INDEX idx_products_browse ON products (active, category, id);

CREATE TABLE users (
  id           INTEGER PRIMARY KEY,
  first_name   TEXT    NOT NULL DEFAULT '',
  last_name    TEXT    NOT NULL DEFAULT '',
  username     TEXT    NOT NULL DEFAULT '',
  contact_name TEXT,
  phone        TEXT,
  joined_at    INTEGER NOT NULL,
  last_seen    INTEGER NOT NULL
);

CREATE TABLE cart_items (
  user_id    INTEGER NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX idx_cart_user ON cart_items (user_id);

CREATE TABLE orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL,
  customer_name    TEXT    NOT NULL DEFAULT '',
  customer_phone   TEXT    NOT NULL DEFAULT '',
  customer_address TEXT    NOT NULL DEFAULT '',
  total           INTEGER NOT NULL CHECK (total >= 0),
  status          TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'shipped', 'done', 'cancelled')),
  idempotency_key TEXT UNIQUE,
  attempt         TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE INDEX idx_orders_user ON orders (user_id, id DESC);
CREATE INDEX idx_orders_status ON orders (status, id DESC);

CREATE TABLE order_items (
  order_id   INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id INTEGER,
  title      TEXT    NOT NULL DEFAULT '',
  price      INTEGER NOT NULL CHECK (price >= 0),
  qty        INTEGER NOT NULL CHECK (qty > 0),
  line_total INTEGER NOT NULL CHECK (line_total >= 0)
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

CREATE TABLE states (
  user_id    INTEGER PRIMARY KEY,
  data       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE broadcasts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER NOT NULL,
  text        TEXT    NOT NULL,
  total       INTEGER NOT NULL,
  sent        INTEGER NOT NULL DEFAULT 0,
  failed      INTEGER NOT NULL DEFAULT 0,
  next_offset INTEGER NOT NULL DEFAULT 0,
  status      TEXT    NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done')),
  created_at  INTEGER NOT NULL
);
