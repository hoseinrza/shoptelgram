/**
 * A faithful-enough D1 test double built on Node's built-in `node:sqlite`
 * (no native dependencies, Node >= 22.5).
 *
 * Fidelity to real D1:
 *  - same client surface used by src/store.js: prepare/bind/run/all/first/batch
 *  - same result shapes: { success, meta: { changes, last_row_id }, results }
 *  - boolean -> INTEGER coercion like D1; undefined params rejected
 *  - batch() runs inside one SQLite transaction (BEGIN IMMEDIATE..COMMIT) and
 *    rolls back completely when any statement fails — the documented D1
 *    guarantee ("Batched statements are SQL transactions").
 *  - batch() calls are serialized through a promise-chain mutex, mirroring
 *    D1's single-writer execution: a batch never observes another batch
 *    half-applied. This is what makes the concurrency tests meaningful.
 */
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SCHEMA_SQL = readFileSync(join(ROOT, 'migrations', '0001_init.sql'), 'utf8');

function coerceParam(v) {
  if (v === undefined) {
    throw new TypeError('D1: undefined is not a valid bound parameter value');
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}

export class D1Stub {
  constructor(db) {
    this.db = db;
    this._tail = Promise.resolve();
  }

  /** Fresh in-memory database with the project schema applied. */
  static create(schemaSql = SCHEMA_SQL) {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON;');
    if (schemaSql) db.exec(schemaSql);
    return new D1Stub(db);
  }

  prepare(sql) {
    return new Stmt(this.db, sql);
  }

  async exec(sql) {
    this.db.exec(sql);
  }

  /**
   * Serialized, atomic multi-statement transaction (mimics D1 batch).
   * Returns an array of per-statement results.
   */
  batch(statements) {
    const run = () => this._runBatch(statements);
    const result = this._tail.then(run, run);
    this._tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }

  _runBatch(statements) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = statements.map((s) => s._exec());
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        /* already rolled back */
      }
      throw err;
    }
  }
}

class Stmt {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }

  bind(...params) {
    return new Stmt(this.db, this.sql, params.map(coerceParam));
  }

  async first(col) {
    const row = this.db.prepare(this.sql).get(...this.params);
    if (row == null) return null;
    return col === undefined ? row : row[col];
  }

  async all() {
    const rows = this.db.prepare(this.sql).all(...this.params);
    return { results: rows, success: true, meta: { changes: 0, last_row_id: 0 } };
  }

  async run() {
    return this._exec();
  }

  _exec() {
    const info = this.db.prepare(this.sql).run(...this.params);
    return {
      results: [],
      success: true,
      meta: { changes: Number(info.changes), last_row_id: Number(info.lastInsertRowid) },
    };
  }
}
