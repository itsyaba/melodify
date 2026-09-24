import type { SQLiteDatabase } from 'expo-sqlite';
import { migrations } from './schema';

/**
 * Busy timeout is per connection, and `withExclusiveTransactionAsync` opens a fresh connection on
 * every call, so each of those runs this too. Without it, a queue save that lands while a scan is
 * writing fails at once with SQLITE_BUSY instead of waiting its turn.
 */
export const BUSY_TIMEOUT = 'PRAGMA busy_timeout = 5000';

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; ${BUSY_TIMEOUT};`);
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < migrations.length) {
    const sql = migrations[version];
    await db.withExclusiveTransactionAsync(async (tx) => {
      await tx.execAsync(sql);
      await tx.execAsync(`PRAGMA user_version = ${version + 1}`);
    });
    version += 1;
  }
}

export { DB_NAME } from '@/constants';
