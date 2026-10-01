import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrations } from '@/db/schema';

/**
 * The slice of expo-sqlite's `SQLiteDatabase` the app's database code uses, over Node's built-in
 * SQLite. Tests only: it lets queries and multi-statement writes run against the real schema
 * instead of a hand-rolled fake. Never imported by the app, so it never reaches the bundle.
 */
type Params = unknown[] | [Record<string, unknown>];

function bindable(value: unknown): SQLInputValue {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value as SQLInputValue;
}

/** expo-sqlite takes either spread values or one array / named object; so does this. */
function normalize(params: Params): SQLInputValue[] | [Record<string, SQLInputValue>] {
  const [first] = params;
  if (params.length === 1 && Array.isArray(first)) return first.map(bindable);
  if (params.length === 1 && first !== null && typeof first === 'object' && !(first instanceof Uint8Array)) {
    const named: Record<string, SQLInputValue> = {};
    for (const [key, value] of Object.entries(first as Record<string, unknown>)) named[key] = bindable(value);
    return [named];
  }
  return params.map(bindable);
}

export function openTestDb(opts: { migrate?: boolean } = {}): SQLiteDatabase & { raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  if (opts.migrate !== false) {
    migrations.forEach((sql, i) => {
      raw.exec(sql);
      raw.exec(`PRAGMA user_version = ${i + 1}`);
    });
  }

  const run = (sql: string, params: Params) => {
    const result = raw.prepare(sql).run(...(normalize(params) as SQLInputValue[]));
    return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
  };

  const db = {
    raw,
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, ...params: Params) {
      return run(sql, params);
    },
    async getFirstAsync(sql: string, ...params: Params) {
      return raw.prepare(sql).get(...(normalize(params) as SQLInputValue[])) ?? null;
    },
    async getAllAsync(sql: string, ...params: Params) {
      return raw.prepare(sql).all(...(normalize(params) as SQLInputValue[]));
    },
    async prepareAsync(sql: string) {
      const statement = raw.prepare(sql);
      return {
        async executeAsync(...params: Params) {
          const result = statement.run(...(normalize(params) as SQLInputValue[]));
          return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
        },
        async finalizeAsync() {},
      };
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      raw.exec('BEGIN');
      try {
        await fn();
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
    async withExclusiveTransactionAsync(fn: (tx: unknown) => Promise<void>) {
      raw.exec('BEGIN EXCLUSIVE');
      try {
        await fn(db);
        raw.exec('COMMIT');
      } catch (err) {
        raw.exec('ROLLBACK');
        throw err;
      }
    },
  };
  return db as unknown as SQLiteDatabase & { raw: DatabaseSync };
}

let nextTrackId = 1;

/** Inserts a track row with sensible defaults; returns its id. */
export function insertTrack(
  db: SQLiteDatabase & { raw: DatabaseSync },
  path: string,
  extra: Record<string, string | number | null> = {},
): number {
  const slash = path.lastIndexOf('/');
  const filename = path.slice(slash + 1);
  const row: Record<string, string | number | null> = {
    id: nextTrackId++,
    path,
    folder: slash === -1 ? '' : path.slice(0, slash),
    filename,
    ext: filename.slice(filename.lastIndexOf('.') + 1),
    size: 1000,
    mtime: 0,
    title: filename.replace(/\.[^.]+$/, ''),
    added_at: 0,
    ...extra,
  };
  const cols = Object.keys(row);
  db.raw.prepare(`INSERT INTO tracks (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(
    ...cols.map((c) => row[c]),
  );
  return row.id as number;
}

/** `SqliteFiles` over Node's SQLite, as the app's is over expo-sqlite. */
export const nodeSqliteFiles = {
  async rows(file: Uint8Array, sql: string) {
    const tmp = join(tmpdir(), `sqlite-read-${randomUUID()}.db`);
    writeFileSync(tmp, file);
    const db = new DatabaseSync(tmp);
    try {
      return db.prepare(sql).all().map((row) => ({ ...row })) as Record<string, string | number | null>[];
    } finally {
      db.close();
      rmSync(tmp, { force: true });
    }
  },
  async build(statements: { sql: string; params?: (string | number | null)[] }[]) {
    const tmp = join(tmpdir(), `sqlite-build-${randomUUID()}.db`);
    const db = new DatabaseSync(tmp);
    try {
      for (const s of statements) db.prepare(s.sql).run(...(s.params ?? []));
      db.close();
      return new Uint8Array(readFileSync(tmp));
    } finally {
      rmSync(tmp, { force: true });
    }
  },
};
